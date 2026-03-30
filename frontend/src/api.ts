import type { Metrics, Order, SimResult, MLStatus, DemandForecast, DecisionInsights } from "./types";

const BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

export async function createOrder(order: Order) {
  const res = await fetch(`${BASE}/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(order),
  });
  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Failed to create order: ${res.status} - ${error}`);
  }
  return res.json();
}

export async function createOrderWithML(order: Order) {
  const res = await fetch(`${BASE}/orders/ml`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(order),
  });
  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Failed to create ML order: ${res.status} - ${error}`);
  }
  return res.json();
}

export async function getState() {
  const res = await fetch(`${BASE}/state`);
  if (!res.ok) throw new Error(`Failed to fetch state: ${res.status}`);
  const data = await res.json();
  // Ensure total_riders is present
  if (data.total_riders === undefined && data.active_riders !== undefined) {
    data.total_riders = data.active_riders;
  }
  return data;
}

export async function patchRiders(count: number) {
  const r = await fetch(`${BASE}/riders`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ count }),
  });
  if (!r.ok) throw new Error(`Failed to update riders: ${r.status}`);
  return r.json();
}

export async function patchState(payload: { active_riders?: number; avg_delivery_time?: number }) {
  const r = await fetch(`${BASE}/state`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!r.ok) throw new Error(`Failed to patch state: ${r.status}`);
  return r.json();
}

export async function fetchMetrics(): Promise<Metrics> {
  const r = await fetch(`${BASE}/metrics`);
  if (!r.ok) throw new Error(`Failed to fetch metrics: ${r.status}`);
  return r.json();
}

export async function postTick() {
  const r = await fetch(`${BASE}/tick`, { method: "POST" });
  if (!r.ok) throw new Error(`Failed to tick: ${r.status}`);
  return r.json();
}

export async function postSimulate(duration_minutes: number): Promise<SimResult> {
  const r = await fetch(`${BASE}/simulate?duration_minutes=${duration_minutes}`, {
    method: "POST",
  });
  if (!r.ok) throw new Error(`Failed to simulate: ${r.status}`);
  return r.json();
}

export async function getForecast() {
  const res = await fetch(`${BASE}/forecast`);
  if (!res.ok) throw new Error(`Failed to fetch forecast: ${res.status}`);
  return res.json();
}

export async function getDemandForecast(): Promise<DemandForecast> {
  const res = await fetch(`${BASE}/ml/demand-forecast`);
  if (!res.ok) {
    if (res.status === 503) {
      throw new Error("Model not trained yet");
    }
    throw new Error(`Failed to fetch demand forecast: ${res.status}`);
  }
  return res.json();
}

export async function getMLStatus(): Promise<MLStatus> {
  const res = await fetch(`${BASE}/ml/status`);
  if (!res.ok) throw new Error(`Failed to fetch ML status: ${res.status}`);
  return res.json();
}

export async function getDecisionInsights(): Promise<DecisionInsights> {
  const res = await fetch(`${BASE}/ml/decision-insights`);
  if (!res.ok) throw new Error(`Failed to fetch decision insights: ${res.status}`);
  return res.json();
}

export async function predictDelivery(distance_km: number, items_count: number, queue_at_dispatch = 0) {
  const res = await fetch(
    `${BASE}/ml/predict-delivery?distance_km=${distance_km}&items_count=${items_count}&queue_at_dispatch=${queue_at_dispatch}`
  );
  if (!res.ok) {
    if (res.status === 503) return null;
    throw new Error(`Failed to predict delivery: ${res.status}`);
  }
  return res.json();
}

export async function trainModels(historicalData: any[]) {
  const res = await fetch(`${BASE}/train`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ train: historicalData }),
  });
  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Training failed: ${res.status} - ${error}`);
  }
  return res.json();
}