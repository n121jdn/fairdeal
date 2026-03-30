from __future__ import annotations

import json
import pickle
from collections import defaultdict
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

import numpy as np
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.model_selection import cross_val_score
from sklearn.metrics import mean_absolute_error

from utils.logger import get_logger

logger = get_logger("demand_forecaster")


PROFILE_PATH = Path("ml/artifacts/demand_profile.json")
CORRECTOR_PATH = Path("ml/artifacts/demand_corrector.pkl")
CORRECTOR_METRICS_PATH = Path("ml/artifacts/demand_corrector_metrics.json")


WINDOW_MINUTES = 10  
_FALLBACK_RATE = 0.3 
_SMOOTHING_ALPHA = 0.2 


class DemandProfile:

    def __init__(self) -> None:
        # (day_of_week, hour) → list of observed rates
        self._rates: dict[tuple, list[float]] = defaultdict(list)
        # Cached means for fast lookup
        self._mean_rate: dict[tuple, float] = {}
        self._std_rate: dict[tuple, float] = {}
        self._built = False

    def build(self, order_times: list[datetime]) -> None:
        
        if not order_times:
            logger.warning("DemandProfile.build called with empty list")
            return

        # Bucket into 1-hour windows
        bucket: dict[tuple, int] = defaultdict(int)
        for t in order_times:
            key = (t.date(), t.weekday(), t.hour)
            bucket[key] += 1

        # Rate = orders in hour / 60 minutes
        raw_rates: dict[tuple, list[float]] = defaultdict(list)
        for (date, dow, hour), count in bucket.items():
            rate = count / 60.0
            raw_rates[(dow, hour)].append(rate)

        self._rates = raw_rates

        # Compute mean and std per (day, hour)
        for (dow, hour), vals in self._rates.items():
            self._mean_rate[(dow, hour)] = float(np.mean(vals))
            self._std_rate[(dow, hour)] = float(np.std(vals))

        self._built = True
        logger.info(
            f"DemandProfile built from {len(order_times)} orders | "
            f"{len(self._mean_rate)} (day,hour) buckets"
        )

    def lookup(self, at: datetime) -> float:

        key = (at.weekday(), at.hour)
        if key in self._mean_rate:
            return self._mean_rate[key]
        if self._mean_rate:
            return float(np.mean(list(self._mean_rate.values())))
        return _FALLBACK_RATE

    def uncertainty(self, at: datetime) -> float:
        """Standard deviation of the arrival rate for this (day, hour) slot."""
        key = (at.weekday(), at.hour)
        return self._std_rate.get(key, 0.0)

    def online_update(self, observed_rate: float, at: datetime) -> None:

        key = (at.weekday(), at.hour)
        old = self._mean_rate.get(key, observed_rate)
        self._mean_rate[key] = (
            1 - _SMOOTHING_ALPHA
        ) * old + _SMOOTHING_ALPHA * observed_rate

    def save(self, path: Path = PROFILE_PATH) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        # JSON-serialise: keys become "dow_hour" strings
        data = {
            f"{dow}_{hour}": {"mean": m, "std": self._std_rate.get((dow, hour), 0.0)}
            for (dow, hour), m in self._mean_rate.items()
        }
        with open(path, "w") as f:
            json.dump(data, f, indent=2)

    def load(self, path: Path = PROFILE_PATH) -> bool:
        if not path.exists():
            return False
        with open(path) as f:
            data = json.load(f)
        for key_str, vals in data.items():
            dow, hour = map(int, key_str.split("_"))
            self._mean_rate[(dow, hour)] = vals["mean"]
            self._std_rate[(dow, hour)] = vals["std"]
        self._built = bool(self._mean_rate)
        logger.info(
            f"DemandProfile loaded from {path} | {len(self._mean_rate)} buckets"
        )
        return self._built



def _build_corrector_features(
    hour: int,
    dow: int,
    profile_rate: float,
    lag_1h_rate: float,
    lag_24h_rate: float,
    recent_delta: float,  
) -> np.ndarray:
    return np.array(
        [
            [
                hour,
                dow,
                int(dow >= 5),  # is_weekend
                profile_rate,
                lag_1h_rate,
                lag_24h_rate,
                recent_delta,
                profile_rate
                * (1 + recent_delta / max(profile_rate, 1e-3)),  # interaction
            ]
        ]
    )


class DemandCorrector:
    def __init__(self) -> None:
        self._model: Optional[GradientBoostingRegressor] = None
        self._trained = False
        self._metrics: dict = {}

    def train(
        self,
        feature_rows: list[list],
        residuals: list[float],
    ) -> dict:
        
        if len(feature_rows) < 20:
            logger.warning(
                f"Only {len(feature_rows)} windows skipping corrector training"
            )
            return {}

        X = np.array(feature_rows)
        y = np.array(residuals)

        self._model = GradientBoostingRegressor(
            n_estimators=100,
            max_depth=3,
            learning_rate=0.08,
            subsample=0.8,
            random_state=42,
        )
        self._model.fit(X, y)

        cv = cross_val_score(
            self._model, X, y, scoring="neg_mean_absolute_error", cv=min(5, len(X) // 4)
        )
        cv_mae = float(-cv.mean())
        train_mae = mean_absolute_error(y, self._model.predict(X))

        self._metrics = {
            "train_mae_orders_per_min": round(train_mae, 4),
            "cv_mae_orders_per_min": round(cv_mae, 4),
            "windows_trained": len(X),
        }
        self._trained = True
        logger.info(f"DemandCorrector trained | CV-MAE={cv_mae:.4f} orders/min")
        return self._metrics

    def predict_residual(self, features: np.ndarray) -> float:
        if not self._trained or self._model is None:
            return 0.0
        return float(self._model.predict(features)[0])

    def save(self) -> None:
        CORRECTOR_PATH.parent.mkdir(parents=True, exist_ok=True)
        with open(CORRECTOR_PATH, "wb") as f:
            pickle.dump(self._model, f)
        with open(CORRECTOR_METRICS_PATH, "w") as f:
            json.dump(self._metrics, f, indent=2)

    def load(self) -> bool:
        if not CORRECTOR_PATH.exists():
            return False
        with open(CORRECTOR_PATH, "rb") as f:
            self._model = pickle.load(f)
        self._trained = True
        if CORRECTOR_METRICS_PATH.exists():
            with open(CORRECTOR_METRICS_PATH) as f:
                self._metrics = json.load(f)
        logger.info(f"DemandCorrector loaded | metrics={self._metrics}")
        return True

    @property
    def is_trained(self) -> bool:
        return self._trained


class DemandForecaster:
    

    def __init__(self) -> None:
        self.profile = DemandProfile()
        self.corrector = DemandCorrector()
        self._lag_rates: list[float] = []  # rolling history for lag features

    def train(self, df) -> dict:
        
        import pandas as pd

        df = df.copy()
        df["order_created_time"] = pd.to_datetime(df["order_created_time"])

        self.profile.build(df["order_created_time"].tolist())

        df = df.sort_values("order_created_time")
        df["window"] = df["order_created_time"].dt.floor(f"{WINDOW_MINUTES}min")

        window_counts = df.groupby("window").size().reset_index(name="count")
        window_counts["rate"] = window_counts["count"] / WINDOW_MINUTES

        feature_rows = []
        residuals = []

        for i, row in window_counts.iterrows():
            at = row["window"].to_pydatetime()
            actual_rate = row["rate"]
            profile_rate = self.profile.lookup(at)
            residual = actual_rate - profile_rate

            # Lag features (default to profile if not enough history)
            lag_1h = window_counts.iloc[i - 6]["rate"] if i >= 6 else profile_rate
            lag_24h = window_counts.iloc[i - 144]["rate"] if i >= 144 else profile_rate
            delta = residuals[-1] if residuals else 0.0

            feat = _build_corrector_features(
                hour=at.hour,
                dow=at.weekday(),
                profile_rate=profile_rate,
                lag_1h_rate=lag_1h,
                lag_24h_rate=lag_24h,
                recent_delta=delta,
            )
            feature_rows.append(feat[0].tolist())
            residuals.append(residual)

        corrector_metrics = self.corrector.train(feature_rows, residuals)

        return {
            "profile_buckets": len(self.profile._mean_rate),
            "corrector": corrector_metrics,
        }

    def forecast(
        self,
        at: datetime,
        live_rate: float,
        lag_1h: float | None = None,
        lag_24h: float | None = None,
    ) -> dict:

        profile_rate = self.profile.lookup(at)
        uncertainty = self.profile.uncertainty(at)

        if self.corrector.is_trained:
            # Use live_rate delta vs profile as the recent_delta feature
            recent_delta = live_rate - profile_rate
            lag_1h_val = lag_1h if lag_1h is not None else profile_rate
            lag_24h_val = lag_24h if lag_24h is not None else profile_rate

            feat = _build_corrector_features(
                hour=at.hour,
                dow=at.weekday(),
                profile_rate=profile_rate,
                lag_1h_rate=lag_1h_val,
                lag_24h_rate=lag_24h_val,
                recent_delta=recent_delta,
            )
            residual = self.corrector.predict_residual(feat)
            forecast_rate = float(
                np.clip(profile_rate + residual, 0.0, profile_rate * 4)
            )
            source = "corrector"
        elif self.profile._built:
            forecast_rate = profile_rate
            source = "profile"
        else:
            forecast_rate = _FALLBACK_RATE
            source = "fallback"

        return {
            "forecast_rate": round(forecast_rate, 4),
            "profile_rate": round(profile_rate, 4),
            "uncertainty": round(uncertainty, 4),
            "source": source,
        }

    def save(self) -> None:
        self.profile.save()
        self.corrector.save()
        logger.info("DemandForecaster saved")

    def load(self) -> bool:
        p = self.profile.load()
        c = self.corrector.load()
        return p or c

    def online_update(self, observed_rate: float, at: datetime) -> None:
        self.profile.online_update(observed_rate, at)


demand_forecaster = DemandForecaster()
demand_forecaster.load()
