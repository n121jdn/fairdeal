from datetime import datetime

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from api.orders import OrderAPI
from core.state_manager import StateManager
from models.order import Order
from simulation.simulator import Simulator

app = FastAPI(title="Dynamic Order Throttling System")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
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