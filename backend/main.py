from datetime import datetime
import os
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from pydantic import BaseModel
from typing import Any, Dict, List, Optional
from api.orders import OrderAPI
from core.state_manager import StateManager
from models.order import Order
from simulation.simulator import Simulator
from ml.demand_forecast import demand_forecaster
from ml.delivery_predictor import delivery_predictor
from dotenv import load_dotenv
load_dotenv()  
from utils.logger import get_logger
logger = get_logger("main")
app = FastAPI(title="Dynamic Order Throttling System")
frontend_origin = os.getenv("FRONTEND_ORIGIN", "*") 
app.add_middleware(
    CORSMiddleware,
    allow_origins=[frontend_origin] if frontend_origin else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

state = StateManager(active_riders=10, avg_delivery_time=10)
order_api = OrderAPI(state)



class OrderRequest(BaseModel):
    order_id:     str
    warehouse_id: str
    distance_km:  float = Field(..., gt=0, le=100)
    items_count:  int   = Field(..., ge=1, le=100)


class RiderUpdate(BaseModel):
    count: int = Field(..., ge=1, le=200, description="New total rider capacity")


class StateOverride(BaseModel):
    active_riders:     int   | None = Field(None, ge=1, le=200)
    avg_delivery_time: float | None = Field(None, gt=0, le=240)



@app.get("/", tags=["meta"])
def health_check():
    return {"status": "running", "timestamp": datetime.now().isoformat()}



@app.post("/orders", tags=["orders"])
def create_order(payload: OrderRequest):
   
    order = Order(
        order_id=payload.order_id,
        warehouse_id=payload.warehouse_id,
        created_at=datetime.now(),
        distance_km=payload.distance_km,
        items_count=payload.items_count,
    )

    decision = order_api.handle_order(order)

    return {
        "order_id": order.order_id,
        "decision": decision.value if hasattr(decision, "value") else decision,
        "status":   order.status.value,
    }


@app.get("/state", tags=["state"])
def get_state():
    
    return state.snapshot()



@app.patch("/riders", tags=["state"])
def update_riders(payload: RiderUpdate):
    
    old = state._max_riders
    state.set_riders(payload.count)
    return {
        "previous_total": old,
        "new_total":       state._max_riders,
        "active_riders":   state.active_riders,
        "busy_riders":     state.get_busy_riders(),
    }



@app.patch("/state", tags=["state"])
def override_state(payload: StateOverride):

    changes = {}

    if payload.active_riders is not None:
        state.active_riders = payload.active_riders
        state._max_riders   = payload.active_riders   # also reset ceiling
        changes["active_riders"] = state.active_riders

    if payload.avg_delivery_time is not None:
        state.avg_delivery_time = payload.avg_delivery_time
        changes["avg_delivery_time"] = state.avg_delivery_time

    return {"updated": changes, "snapshot": state.snapshot()}


@app.post("/tick", tags=["state"])
def tick():
    completed = state.complete_order(datetime.now())
    return {
        "completed":         len(completed),
        "queue_size":        state.get_queue_len(),
        "active_riders":     state.active_riders,
        "avg_delivery_time": round(state.avg_delivery_time, 2),
    }



@app.get("/metrics", tags=["metrics"])
def get_metrics():

    snap = state.snapshot()
    total = snap["accepted_total"] + snap["rejected_total"]
    acceptance_rate = round(snap["accepted_total"] / total, 4) if total else None

    lf = snap["load_factor"]
    if lf < 0.75:
        health = "healthy"
    elif lf < 0.90:
        health = "degraded"
    else:
        health = "critical"

    return {
        **snap,
        "acceptance_rate": acceptance_rate,
        "total_decisions": total,
        "health":          health,
        "sla_mins":        60,
        "effective_sla":   round(60 * (0.8 if lf > 0.9 else 0.9 if lf > 0.75 else 1.0), 1),
    }



@app.post("/simulate", tags=["simulation"])
def run_simulation(duration_minutes: int = 30):

    if duration_minutes < 1 or duration_minutes > 120:
        raise HTTPException(status_code=422, detail="duration_minutes must be 1–120")

    sim = Simulator(duration_minutes=duration_minutes)
    sim.run()

    total = sim.accepted + sim.rejected
    return {
        "duration_minutes": duration_minutes,
        "total_orders":     total,
        "accepted":         sim.accepted,
        "rejected":         sim.rejected,
        "acceptance_rate":  round(sim.accepted / total, 4) if total else 0,
    }

class DatasetRequest(BaseModel):
    train: List[Dict[str, Any]]
    validation: Optional[List[Dict[str, Any]]] = []
    test: Optional[List[Dict[str, Any]]] = []
    
@app.post("/train", tags=["ml"])
def train_models(payload: DatasetRequest):
    import pandas as pd
    
    try:
        if not payload.train:
            raise HTTPException(status_code=422, detail="train list is empty")
        
        df = pd.DataFrame(payload.train)
        results = {}
        
        if 'queue_depth' in df.columns and 'queue_at_dispatch' not in df.columns:
            df['queue_at_dispatch'] = df['queue_depth']
        
        if 'order_created_time' in df.columns:
            df['order_created_time'] = pd.to_datetime(
                df['order_created_time'], 
                format='ISO8601', 
                errors='coerce'
            )
            
            if df['order_created_time'].isna().any():
                logger.warning(f"Failed to parse {df['order_created_time'].isna().sum()} order_created_time values")
                df = df.dropna(subset=['order_created_time'])
        
        if 'order_delivered_time' in df.columns:
            df['order_delivered_time'] = pd.to_datetime(
                df['order_delivered_time'],
                format='ISO8601',
                errors='coerce'
            )
        
      
        delivery_cols = {
            "distance_km",
            "items_count", 
            "order_created_time",
            "order_delivered_time",
            "queue_at_dispatch",
        }
        
        delivered_df = df[df['order_delivered_time'].notna()].copy() if 'order_delivered_time' in df.columns else pd.DataFrame()
        
        if not delivered_df.empty and delivery_cols.issubset(set(delivered_df.columns)):
            try:
                delivered_df['delivery_minutes'] = (
                    delivered_df['order_delivered_time'] - delivered_df['order_created_time']
                ).dt.total_seconds() / 60.0
                
                delivered_df = delivered_df[
                    (delivered_df['delivery_minutes'] > 0) & 
                    (delivered_df['delivery_minutes'] <= 120)  # Max 2 hours
                ]
                
                if len(delivered_df) >= 20:
                    metrics = delivery_predictor.train(delivered_df)
                    delivery_predictor.save()
                    results["delivery_predictor"] = {
                        "status": "trained", 
                        "metrics": metrics,
                        "delivered_orders_used": len(delivered_df)
                    }
                else:
                    results["delivery_predictor"] = {
                        "status": "skipped",
                        "reason": f"Only {len(delivered_df)} delivered orders available (need at least 20)",
                        "fallback": "EWMA avg_delivery_time remains active",
                    }
            except Exception as e:
                logger.error(f"Delivery predictor training failed: {e}")
                results["delivery_predictor"] = {
                    "status": "failed", 
                    "error": str(e)
                }
        else:
            missing = delivery_cols - set(df.columns) if delivered_df.empty else delivery_cols - set(delivered_df.columns)
            results["delivery_predictor"] = {
                "status": "skipped",
                "reason": f"missing columns: {missing} or no delivered orders",
                "fallback": "EWMA avg_delivery_time remains active",
            }
        
        
        if "order_created_time" in df.columns and not df.empty:
            try:
                if len(df) >= 10:
                    metrics = demand_forecaster.train(df)
                    demand_forecaster.save()
                    results["demand_forecaster"] = {
                        "status": "trained", 
                        "metrics": metrics,
                        "orders_used": len(df)
                    }
                else:
                    results["demand_forecaster"] = {
                        "status": "skipped",
                        "reason": f"Only {len(df)} orders available (need at least 10)",
                    }
            except Exception as e:
                logger.error(f"Demand forecaster training failed: {e}")
                results["demand_forecaster"] = {
                    "status": "failed", 
                    "error": str(e)
                }
        else:
            results["demand_forecaster"] = {
                "status": "skipped",
                "reason": "order_created_time column not found or no valid data",
            }
        
        return {
            "rows_received": len(df),
            "delivered_orders": len(delivered_df) if 'delivered_df' in locals() else 0,
            "results": results,
        }
        
    except Exception as e:
        logger.error(f"Unexpected error in train_models: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Training failed: {str(e)}"
        )
        
@app.get("/forecast", tags=["ml"])
def get_forecast():
    
    from datetime import datetime

    live_rate = state.get_arrival_rate()
    fc = demand_forecaster.forecast(
        at=datetime.now(),
        live_rate=live_rate,
    )

    return {
        "live_rate": round(live_rate, 4),
        "forecast_rate": fc["forecast_rate"],
        "profile_rate": fc["profile_rate"],
        "uncertainty": fc["uncertainty"],
        "effective_rate": round(max(live_rate, fc["forecast_rate"]), 4),
        "source": fc["source"],
    }


@app.get("/ml/status", tags=["ml"])
def ml_status():
    return {
        "delivery_predictor": {
            "active": delivery_predictor.is_trained,
            "metrics": delivery_predictor.metrics,
            "note": "Replaces EWMA avg_delivery_time with per-order prediction"
            if delivery_predictor.is_trained
            else "Fallback: EWMA avg_delivery_time from StateManager",
        },
        "demand_forecaster": {
            "active": demand_forecaster.profile._built,
            "corrector": demand_forecaster.corrector.is_trained,
            "metrics": demand_forecaster.corrector._metrics,
            "note": "Proactive arrival rate forecast for next 10 min"
            if demand_forecaster.profile._built
            else "Fallback: live sliding-window arrival rate only",
        },
    }

@app.post("/orders/ml", tags=["orders", "ml"])
def create_order_with_ml(payload: OrderRequest):
    """
    Enhanced order endpoint that uses ML models for better decision making.
    Uses delivery time prediction and demand forecast for smarter throttling.
    """
    from datetime import datetime
    import numpy as np
    
    # Create order object
    order = Order(
        order_id=payload.order_id,
        warehouse_id=payload.warehouse_id,
        created_at=datetime.now(),
        distance_km=payload.distance_km,
        items_count=payload.items_count,
    )
    
    # Get current state
    current_state = state.snapshot()
    
    # 1. Get ML-enhanced delivery time prediction
    if delivery_predictor.is_trained:
        predicted_delivery_time = delivery_predictor.predict(
            distance_km=order.distance_km,
            items_count=order.items_count,
            created_at=order.created_at,
            queue_at_dispatch=current_state["queue_size"]
        )
    else:
        # Fallback to EWMA
        predicted_delivery_time = current_state["avg_delivery_time"]
    
    # 2. Get ML-enhanced demand forecast for next 10 minutes
    if demand_forecaster.profile._built:
        live_rate = current_state["arrival_rate"]
        forecast = demand_forecaster.forecast(
            at=datetime.now(),
            live_rate=live_rate
        )
        expected_arrival_rate = forecast["forecast_rate"]
        demand_uncertainty = forecast["uncertainty"]
    else:
        expected_arrival_rate = current_state["arrival_rate"]
        demand_uncertainty = 0
    
    # 3. Smart decision logic using ML predictions
    # Calculate capacity impact
    busy_riders = current_state.get("busy_riders", 0)
    available_riders = current_state["active_riders"] - busy_riders
    
    # Expected time to handle existing queue + new order
    queue_orders = current_state["queue_size"]
    expected_queue_time = (queue_orders + 1) * predicted_delivery_time / max(available_riders, 1)
    
    # SLA threshold (60 minutes)
    SLA_MINUTES = 60
    
    # Adjust SLA based on demand pressure
    if expected_arrival_rate > 0.5:  # High demand (>30 orders/hour)
        dynamic_sla = SLA_MINUTES * 0.8  # Stricter SLA during high demand
    elif expected_arrival_rate > 0.3:  # Medium demand
        dynamic_sla = SLA_MINUTES * 0.9
    else:
        dynamic_sla = SLA_MINUTES
    
    # Decision criteria
    should_accept = (
        expected_queue_time <= dynamic_sla and  # Can deliver within SLA
        available_riders > 0 and  # Has riders available
        current_state["queue_size"] < current_state.get("queue_capacity", 100)  # Queue not full
    )
    
    # Additional ML-informed adjustments
    if delivery_predictor.is_trained:
        # If delivery time is much lower than average, be more accepting
        avg_delivery = current_state["avg_delivery_time"]
        if predicted_delivery_time < avg_delivery * 0.7:
            should_accept = should_accept or (expected_queue_time <= dynamic_sla * 1.2)
        
        # If delivery time is very high, be more strict
        elif predicted_delivery_time > avg_delivery * 1.5:
            should_accept = should_accept and (expected_queue_time <= dynamic_sla * 0.8)
    
    # Make decision
    if should_accept:
        decision = order_api.accept_order(order)
        state.add_to_queue(order)
    else:
        decision = order_api.reject_order(order)
    
    # Log ML insights for dashboard
    return {
        "order_id": order.order_id,
        "decision": decision.value if hasattr(decision, "value") else decision,
        "status": order.status.value,
        "ml_insights": {
            "predicted_delivery_time": round(predicted_delivery_time, 1),
            "forecasted_arrival_rate": round(expected_arrival_rate, 3),
            "demand_uncertainty": round(demand_uncertainty, 3),
            "expected_queue_time": round(expected_queue_time, 1),
            "dynamic_sla": round(dynamic_sla, 1),
            "available_riders": available_riders,
            "decision_factors": {
                "queue_time_ok": expected_queue_time <= dynamic_sla,
                "riders_available": available_riders > 0,
                "queue_not_full": current_state["queue_size"] < current_state.get("queue_capacity", 100),
            }
        }
    }

@app.get("/ml/predict-delivery", tags=["ml"])
def predict_delivery_time(
    distance_km: float,
    items_count: int,
    queue_at_dispatch: int = 0
):
    """
    Get ML-predicted delivery time for a potential order.
    Useful for dashboard to show expected delivery time before order submission.
    """
    from datetime import datetime
    
    if not delivery_predictor.is_trained:
        raise HTTPException(
            status_code=503, 
            detail="Delivery predictor not trained. Please train models first via /train endpoint."
        )
    
    predicted_time = delivery_predictor.predict(
        distance_km=distance_km,
        items_count=items_count,
        created_at=datetime.now(),
        queue_at_dispatch=queue_at_dispatch
    )
    
    return {
        "predicted_delivery_minutes": round(predicted_time, 1),
        "distance_km": distance_km,
        "items_count": items_count,
        "current_queue": queue_at_dispatch,
        "confidence": "high" if delivery_predictor.metrics.get("mae_minutes", 0) < 3 else "medium"
    }

@app.get("/ml/demand-forecast", tags=["ml"])
def get_demand_forecast():
    """
    Get demand forecast for the next 10 minutes.
    Helps dashboard show expected load.
    """
    from datetime import datetime
    
    if not demand_forecaster.profile._built:
        raise HTTPException(
            status_code=503,
            detail="Demand forecaster not trained. Please train models first via /train endpoint."
        )
    
    current_rate = state.get_arrival_rate()
    forecast = demand_forecaster.forecast(
        at=datetime.now(),
        live_rate=current_rate
    )
    
    # Calculate expected orders in next 10 minutes
    expected_orders = forecast["forecast_rate"] * 10
    expected_orders_range = (
        max(0, (forecast["forecast_rate"] - forecast["uncertainty"]) * 10),
        (forecast["forecast_rate"] + forecast["uncertainty"]) * 10
    )
    
    return {
        "current_arrival_rate": round(current_rate, 3),
        "forecasted_arrival_rate": round(forecast["forecast_rate"], 3),
        "profile_baseline": round(forecast["profile_rate"], 3),
        "uncertainty": round(forecast["uncertainty"], 3),
        "expected_orders_next_10min": round(expected_orders, 1),
        "expected_orders_range": [round(x, 1) for x in expected_orders_range],
        "source": forecast["source"],
        "recommendation": (
            "Increase riders" if forecast["forecast_rate"] > 0.5 else
            "Normal operations" if forecast["forecast_rate"] < 0.3 else
            "Monitor closely"
        )
    }

@app.get("/ml/decision-insights", tags=["ml"])
def get_decision_insights():
    """
    Get ML-powered insights about current system state.
    Helps dashboard operators make informed decisions.
    """
    from datetime import datetime
    
    state_snapshot = state.snapshot()
    
    insights = {
        "timestamp": datetime.now().isoformat(),
        "current_state": state_snapshot,
        "ml_status": {}
    }
    
    # Add delivery predictor insights
    if delivery_predictor.is_trained:
        # Calculate what typical delivery times would be at current queue depth
        sample_orders = [
            {"distance_km": 5, "items_count": 2},
            {"distance_km": 10, "items_count": 3},
            {"distance_km": 15, "items_count": 5}
        ]
        
        predictions = []
        for order in sample_orders:
            pred = delivery_predictor.predict(
                distance_km=order["distance_km"],
                items_count=order["items_count"],
                created_at=datetime.now(),
                queue_at_dispatch=state_snapshot["queue_size"]
            )
            predictions.append({
                **order,
                "predicted_minutes": round(pred, 1)
            })
        
        insights["ml_status"]["delivery_predictor"] = {
            "active": True,
            "sample_predictions": predictions,
            "model_accuracy": f"{delivery_predictor.metrics.get('mae_minutes', 0):.1f} min MAE"
        }
    else:
        insights["ml_status"]["delivery_predictor"] = {
            "active": False,
            "fallback": "Using EWMA average"
        }
    
    # Add demand forecaster insights
    if demand_forecaster.profile._built:
        forecast = demand_forecaster.forecast(
            at=datetime.now(),
            live_rate=state_snapshot["arrival_rate"]
        )
        
        insights["ml_status"]["demand_forecaster"] = {
            "active": True,
            "current_rate": round(state_snapshot["arrival_rate"], 3),
            "forecasted_rate": round(forecast["forecast_rate"], 3),
            "trend": (
                "increasing" if forecast["forecast_rate"] > state_snapshot["arrival_rate"] * 1.1 else
                "decreasing" if forecast["forecast_rate"] < state_snapshot["arrival_rate"] * 0.9 else
                "stable"
            ),
            "expected_orders_10min": round(forecast["forecast_rate"] * 10, 1)
        }
    else:
        insights["ml_status"]["demand_forecaster"] = {
            "active": False,
            "fallback": "Using live arrival rate only"
        }
    
    # Add actionable recommendations
    recommendations = []
    
    # Delivery time recommendations
    if delivery_predictor.is_trained and state_snapshot["queue_size"] > 0:
        current_avg = state_snapshot["avg_delivery_time"]
        model_mae = delivery_predictor.metrics.get("mae_minutes", 0)
        
        if model_mae < current_avg * 0.1:
            recommendations.append({
                "type": "confidence",
                "message": "ML delivery predictions are highly accurate. Trust automated decisions.",
                "priority": "low"
            })
    
    # Demand forecast recommendations
    if demand_forecaster.profile._built:
        forecast_rate = forecast["forecast_rate"]
        if forecast_rate > 0.6:  # >36 orders/hour
            recommendations.append({
                "type": "capacity",
                "message": f"High demand forecast: {round(forecast_rate*60)} orders/hour expected. Consider increasing riders.",
                "priority": "high"
            })
        elif forecast_rate < 0.15:  # <9 orders/hour
            recommendations.append({
                "type": "efficiency",
                "message": "Low demand forecast. Good time for maintenance or training.",
                "priority": "low"
            })
    
    insights["recommendations"] = recommendations
    
    return insights
