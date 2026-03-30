# Dynamic Slot Capacity & Order Throttling

A real-time order throttling system for quick-commerce warehouses. Decides - in under a millisecond - whether to **ACCEPT** or **REJECT** an incoming order based on live queue depth, rider availability, and delivery-time trends.

---

## The problem

Quick-commerce warehouses (10-minute to 60-minute delivery) receive orders in unpredictable bursts. A warehouse with 10 riders and a 10-minute average delivery time can handle at most **10 / 10 = 1 order per minute**. During dinner-rush peaks, arrivals can reach 2–3 per minute. Without throttling, the queue grows silently and every customer gets a delivery promise the warehouse cannot keep.

This system enforces capacity at the intake point - before an order enters the queue - so only orders that can realistically be delivered within the SLA are accepted.

---

## How it works

Every incoming order triggers a real-time evaluation:

1. **Service rate** is computed from live rider count and current average delivery time.
2. **Backlog time** - how long the order would wait before a rider picks it up; is derived from queue depth and service rate.
3. **Expected delay** (backlog + delivery) is compared against the SLA (60 minutes).
4. **Load factor** (arrival rate ÷ service rate) tightens the effective SLA when the system is under pressure.
5. A **distance penalty** rejects far orders when load is high, since they tie up riders longer.

The result is `ACCEPT` or `REJECT`. No static thresholds. Hence, every decision is computed from the current state of the warehouse.

---

## Tech stack

| Layer | Technology |
|---|---|
| Backend API | FastAPI + Pydantic + python-dotenv |
| Decision engine | Pure Python (no ML dependency) |
| State management | In-memory (`collections.deque`) |
| Frontend | React + Recharts |
| Simulation | Custom discrete-event simulator |

---

## Project structure

```
├── main.py                     # FastAPI app + all routes
├── core/
│   ├── decision_engine.py      # Accept/reject logic
│   └── state_manager.py        # Live warehouse state
├── models/
│   ├── order.py                # Order + Status models
│   └── warehouse.py            # Warehouse model
├── api/
│   └── orders.py               # Order handling layer
├── simulation/
│   ├── simulator.py            # Discrete-event simulation runner
│   └── gen_orders.py           # Random order generator
├── utils/
│   ├── metrics.py              # service_rate, backlog_time, load_factor helpers
│   └── logger.py               # Structured logger
├── config.py                   # SLA, load thresholds, distance penalty config
└── frontend/
    └── src/
        ├── App.tsx
        ├── components/
        │   ├── Dashboard.tsx       # System state panel
        │   ├── OrderForm.tsx       # Manual order submission
        │   ├── Metrics.tsx         # Decision feed
        │   └── PeakSim.tsx         # Peak-load simulator
        └── api.ts                  # API client
```

---

## API reference

### `POST /orders`
Submit an order for the throttle engine to evaluate.

```json
{
  "order_id": "ORD-001",
  "warehouse_id": "WH1",
  "distance_km": 5.2,
  "items_count": 8
}
```

Response:
```json
{
  "order_id": "ORD-001",
  "decision": "ACCEPTED",
  "status": "ACCEPTED"
}
```

---

### `GET /state`
Full live snapshot of warehouse state.

```json
{
  "active_riders": 7,
  "busy_riders": 3,
  "total_riders": 10,
  "queue_size": 4,
  "avg_delivery_time": 28.4,
  "arrival_rate": 0.31,
  "service_rate": 0.25,
  "load_factor": 1.24,
  "accepted_total": 142,
  "rejected_total": 38
}
```

---

### `GET /metrics`
Extended metrics with health verdict and effective SLA.

```json
{
  "health": "degraded",
  "load_factor": 0.82,
  "acceptance_rate": 0.79,
  "effective_sla": 54.0,
  "total_decisions": 180
}
```

---

### `PATCH /riders`
Adjust total rider capacity at runtime — simulates shift changes or surge hiring.

```json
{ "count": 15 }
```

---

### `PATCH /state`
Override state variables directly for testing edge cases.

```json
{
  "active_riders": 2,
  "avg_delivery_time": 45.0
}
```

---

### `POST /tick`
Manually advance the delivery clock; completes eligible queued orders and returns riders to the pool. Useful for testing without the simulator.

---

### `POST /simulate?duration_minutes=30`
Run a headless simulation. `duration_minutes` must be between 1 and 120. Returns summary stats without affecting live state.

```json
{
  "duration_minutes": 30,
  "total_orders": 87,
  "accepted": 61,
  "rejected": 26,
  "acceptance_rate": 0.70
}
```

---

## Environment setup

The backend reads one environment variable at startup. Create a `.env` file in the project root:

```env
FRONTEND_ORIGIN=http://localhost:5173
```

This controls the CORS `allow_origins` list; only requests from that origin are accepted by the API. In production, replace it with your deployed frontend URL.

---

## Running locally

### Backend

```bash
pip install fastapi uvicorn pydantic python-dotenv
uvicorn main:app --reload
```

API docs auto-generated at `http://localhost:8000/docs`.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Dashboard at `http://localhost:5173`.

---

## Configuration

All thresholds are in `config.py`:

```python
SLA_MINS = 60                    # Maximum acceptable delivery time
LOAD_HIGH = 0.9                  # SLA tightens to 80% above this
LOAD_MEDIUM = 0.75               # SLA tightens to 90% above this
DISTANCE_PENALTY_THRESHOLD = 8   # km, penalty applies above this
MAX_DISTANCE_KM = 20
MIN_SERVICE_RATE = 1e-3          # Guards against division by zero
```

---

## Dashboard

The React dashboard shows:

- **System health panel** : live rider count, queue depth, delivery time, arrival rate, and a radial load gauge that turns amber at 75% load and red at 90%
- **Accept/reject chart** : rolling 5-second area chart of throughput
- **Order feed** : last 40 decisions with colour-coded status
- **Manual order form** : distance and item count sliders, instant feedback
- **Peak-load simulator** : configurable orders/second burst with live acceptance rate bar

---

## Key design decisions

**Why reject at ρ = 0.75 and not ρ = 1.0?**
At ρ = 1.0 the queue is mathematically unstable; any small burst causes it to grow without bound. Rejecting at 75-90% load creates a stability buffer. This mirrors admission control in network routers (RED: Random Early Detection).

**Why EWMA for delivery time?**
A simple average of all historical deliveries responds slowly to real-time changes like traffic or weather. EWMA weights recent observations more heavily and requires O(1) space and O(1) update, hence no history buffer.

**Why decrement riders on accept?**
An accepted order occupies a rider. Tracking busy vs available riders makes the service rate estimate accurate. Without this, the engine would optimistically assume all 10 riders are available even when 9 are out on deliveries.
