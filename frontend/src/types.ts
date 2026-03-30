export interface SystemState {
  active_riders: number;
  busy_riders: number;
  total_riders: number;        
  queue_size: number;
  avg_delivery_time: number;
  arrival_rate: number;
  service_rate: number;
  load_factor: number;
  accepted_total: number;
  rejected_total: number;
}

export interface Metrics {
  load_factor: number;
  health: "healthy" | "degraded" | "critical";
  acceptance_rate: number | null;
  total_decisions: number;
  accepted_total: number;
  rejected_total: number;
  effective_sla: number;
  sla_mins: number;
  active_riders: number;
  busy_riders: number;
  total_riders: number;
  queue_size: number;
  avg_delivery_time: number;
  arrival_rate: number;
  service_rate: number;
}

export interface Decision {
  order_id: string;
  decision: string;
  timestamp: string;
  distance_km: number;
  items_count: number;
  warehouse_id: string;
  reason?: string;
}

export interface CompletedOrder {
  order_id: string;
  distance_km: number;
  items_count: number;
  completed_at: string;
  delivery_time?: number;
}

export interface Order {
  order_id: string;
  warehouse_id: string;
  distance_km: number;
  items_count: number;
}

export interface HistoryPoint {
  t: string;
  accepted: number;
  rejected: number;
  forecast_rate?: number;
}

export interface SimResult {
  duration_minutes: number;
  total_orders: number;
  accepted: number;
  rejected: number;
  acceptance_rate: number;
}

export interface MLStatus {
  delivery_predictor: {
    active: boolean;
    metrics?: { mae_minutes?: number; r2?: number; cv_mae_minutes?: number };
    note?: string;
  };
  demand_forecaster: {
    active: boolean;
    corrector?: boolean;
    metrics?: { cv_mae_orders_per_min?: number };
    note?: string;
  };
}

export interface DemandForecast {
  current_arrival_rate: number;
  forecasted_arrival_rate: number;
  profile_baseline: number;
  uncertainty: number;
  expected_orders_next_10min: number;
  expected_orders_range: [number, number];
  source: string;
  recommendation: string;
}

export interface DecisionInsights {
  timestamp: string;
  current_state: SystemState;
  ml_status: {
    delivery_predictor: {
      active: boolean;
      sample_predictions?: Array<{
        distance_km: number;
        items_count: number;
        predicted_minutes: number;
      }>;
      model_accuracy?: string;
      fallback?: string;
    };
    demand_forecaster: {
      active: boolean;
      current_rate?: number;
      forecasted_rate?: number;
      trend?: string;
      expected_orders_10min?: number;
      fallback?: string;
    };
  };
  recommendations: Array<{
    type: string;
    message: string;
    priority: "high" | "medium" | "low";
  }>;
}

export type SaturationLevel = "ok" | "degraded" | "critical" | "saturated";