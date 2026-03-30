import type { Metrics, Order, SimResult } from "./types";

const BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

export async function createOrder(order: Order) {
  const res = await fetch(`${BASE}/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(order),
  });
  return res.json();
}

export async function getState() {
  const res = await fetch(`${BASE}/state`);
  return res.json();
}

export async function patchRiders(count: number) {
  const r = await fetch(`${BASE}/riders`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ count }),
  });
  return r.json();
}

export async function patchState(payload: { active_riders?: number; avg_delivery_time?: number }) {
  const r = await fetch(`${BASE}/state`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return r.json();
}

export async function fetchMetrics(): Promise<Metrics> {
  const r = await fetch(`${BASE}/metrics`);
  return r.json();
}

export async function postTick() {
  const r = await fetch(`${BASE}/tick`, { method: "POST" });
  return r.json();
}

export async function postSimulate(duration_minutes: number): Promise<SimResult> {
  const r = await fetch(`${BASE}/simulate?duration_minutes=${duration_minutes}`, {
    method: "POST",
  });
  return r.json();
}

export async function getForecast() {
  const res = await fetch(`${BASE}/forecast`);
  return res.json();
}

export async function getDemandForecast() {
  const res = await fetch(`${BASE}/ml/demand-forecast`);
  return res.json();
}

export async function getMLStatus() {
  const res = await fetch(`${BASE}/ml/status`);
  return res.json();
}


export async function predictDelivery(distance_km: number, items_count: number, queue_at_dispatch = 0) {
  const res = await fetch(
    `${BASE}/ml/predict-delivery?distance_km=${distance_km}&items_count=${items_count}&queue_at_dispatch=${queue_at_dispatch}`
  );
  if (!res.ok) return null; // 503 if not trained — fail silently
  return res.json();
}