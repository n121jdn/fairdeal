import type { SystemState, Metrics, SaturationLevel } from "./types";

export function getSaturation(
  state: SystemState | null,
  metrics: Metrics | null
): SaturationLevel {
  if (!state && !metrics) return "ok";
  
  const loadFactor = metrics?.load_factor ?? state?.load_factor ?? 0;
  
  if (loadFactor >= 1.0) return "saturated";
  if (loadFactor >= 0.9) return "critical";
  if (loadFactor >= 0.75) return "degraded";
  return "ok";
}
