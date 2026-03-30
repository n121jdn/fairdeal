export interface Order {
  order_id: string;
  warehouse_id: string;
  distance_km: number;
  items_count: number;
}

export type DecisionType = "ACCEPTED" | "REJECTED";

export interface Decision {
  order_id: string;
  decision: string;  
  reason?: string;   
  timestamp: string;
  distance_km: number;
  items_count: number;
  warehouse_id: string;
}

export interface CompletedOrder extends Decision {
  completed_at: string;
  delivery_time?: number;
}

export interface DecisionResponse {
  order_id: string;
  decision: DecisionType;
}

export interface SystemState {
  active_riders: number;
  queue_size: number;
  avg_delivery_time: number;
  arrival_rate: number;
  load_factor?: number;
  accepted_total?: number;
  rejected_total?: number;
  busy_riders?: number;
  max_riders?: number;
  queue_capacity?: number;
}

export interface Metrics {
  acceptance_rate: number | null;
  total_decisions: number;
  health: "healthy" | "degraded" | "critical";
  sla_mins: number;
  effective_sla: number;
  load_factor: number;
  accepted_total: number;
  rejected_total: number;
}

export interface SimResult {
  duration_minutes: number;
  total_orders: number;
  accepted: number;
  rejected: number;
  acceptance_rate: number;
}

export interface HistoryPoint {
  t: string;
  accepted: number;
  rejected: number;
}

export type SaturationLevel = "ok" | "degraded" | "critical" | "saturated";
export type FeedTab = "live" | "completed";