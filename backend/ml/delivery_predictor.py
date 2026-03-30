from __future__ import annotations

import json
import pickle
from datetime import datetime
from pathlib import Path
from typing import Optional

import numpy as np
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.model_selection import cross_val_score, train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline
from sklearn.metrics import mean_absolute_error, r2_score

from utils.logger import get_logger

logger = get_logger("delivery_predictor")


MODEL_PATH = Path("ml/artifacts/delivery_predictor.pkl")
METRICS_PATH = Path("ml/artifacts/delivery_predictor_metrics.json")

FEATURE_COLS = [
    "distance_km",
    "items_count",
    "hour_of_day",
    "day_of_week",
    "queue_at_dispatch",
]


_FALLBACK_DELIVERY_MINS = 10.0
_MIN_PREDICTION_MINS = 3.0  # below this is physically impossible
_MAX_PREDICTION_MINS = 120.0  # clamp outliers


def extract_features(
    distance_km: float,
    items_count: int,
    created_at: datetime,
    queue_at_dispatch: int,
) -> np.ndarray:

    return np.array(
        [
            [
                distance_km,
                items_count,
                created_at.hour,
                created_at.weekday(),  # 0 = Monday, 6 = Sunday
                queue_at_dispatch,
            ]
        ]
    )


class DeliveryPredictor:
    def __init__(self) -> None:
        self._pipeline: Optional[Pipeline] = None
        self._trained = False
        self._metrics: dict = {}

    def train(self, df) -> dict:

        import pandas as pd

        required = {
            "distance_km",
            "items_count",
            "order_created_time",
            "order_delivered_time",
            "queue_at_dispatch",
        }
        missing = required - set(df.columns)
        if missing:
            raise ValueError(f"DataFrame missing columns: {missing}")

        df = df.copy()

        df["actual_delivery_minutes"] = (
            pd.to_datetime(df["order_delivered_time"])
            - pd.to_datetime(df["order_created_time"])
        ).dt.total_seconds() / 60.0

        df = df[
            df["actual_delivery_minutes"].between(
                _MIN_PREDICTION_MINS, _MAX_PREDICTION_MINS
            )
        ]

        if len(df) < 20:
            raise ValueError(
                f"Only {len(df)} valid rows after filtering — need at least 20 to train."
            )

        df["hour_of_day"] = pd.to_datetime(df["order_created_time"]).dt.hour
        df["day_of_week"] = pd.to_datetime(df["order_created_time"]).dt.dayofweek

        X = df[FEATURE_COLS].values
        y = df["actual_delivery_minutes"].values

        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=0.2, random_state=42
        )

        self._pipeline = Pipeline(
            [
                ("scaler", StandardScaler()),
                (
                    "model",
                    GradientBoostingRegressor(
                        n_estimators=200,
                        max_depth=4,
                        learning_rate=0.05,
                        subsample=0.8,
                        random_state=42,
                    ),
                ),
            ]
        )

        self._pipeline.fit(X_train, y_train)

        y_pred = self._pipeline.predict(X_test)
        mae = mean_absolute_error(y_test, y_pred)
        r2 = r2_score(y_test, y_pred)

        # 5-fold cross-validated MAE on full dataset
        cv_scores = cross_val_score(
            self._pipeline, X, y, scoring="neg_mean_absolute_error", cv=5
        )
        cv_mae = float(-cv_scores.mean())

        self._metrics = {
            "mae_minutes": round(mae, 2),
            "r2": round(r2, 4),
            "cv_mae_minutes": round(cv_mae, 2),
            "train_rows": len(X_train),
            "test_rows": len(X_test),
        }
        self._trained = True

        logger.info(
            f"DeliveryPredictor trained | MAE={mae:.2f} min | "
            f"R²={r2:.4f} | CV-MAE={cv_mae:.2f} min"
        )
        return self._metrics

    def predict(
        self,
        distance_km: float,
        items_count: int,
        created_at: datetime,
        queue_at_dispatch: int,
    ) -> float:

        if not self._trained or self._pipeline is None:
            logger.debug("DeliveryPredictor not trained — using fallback")
            return _FALLBACK_DELIVERY_MINS

        features = extract_features(
            distance_km, items_count, created_at, queue_at_dispatch
        )
        raw = float(self._pipeline.predict(features)[0])
        # Hard clamp: predictions outside physical bounds are noise
        return float(np.clip(raw, _MIN_PREDICTION_MINS, _MAX_PREDICTION_MINS))

    def save(self) -> None:
        MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
        with open(MODEL_PATH, "wb") as f:
            pickle.dump(self._pipeline, f)
        with open(METRICS_PATH, "w") as f:
            json.dump(self._metrics, f, indent=2)
        logger.info(f"Model saved → {MODEL_PATH}")

    def load(self) -> bool:
        if not MODEL_PATH.exists():
            logger.warning("No saved DeliveryPredictor found  using fallback")
            return False
        with open(MODEL_PATH, "rb") as f:
            self._pipeline = pickle.load(f)
        self._trained = True
        if METRICS_PATH.exists():
            with open(METRICS_PATH) as f:
                self._metrics = json.load(f)
        logger.info(
            f"DeliveryPredictor loaded from {MODEL_PATH} | metrics={self._metrics}"
        )
        return True

    @property
    def is_trained(self) -> bool:
        return self._trained

    @property
    def metrics(self) -> dict:
        return self._metrics


delivery_predictor = DeliveryPredictor()
delivery_predictor.load()