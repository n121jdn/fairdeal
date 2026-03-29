import type { Metrics, SaturationLevel, SystemState } from "./types";

export function getSaturation(
  state: SystemState | null,
  metrics: Metrics | null
): SaturationLevel {
  if (!state && !metrics) return "ok";
  const load = metrics?.load_factor ?? 0;
  if (load >= 1.0) return "saturated";
  if (load >= 0.9) return "critical";
  if (load >= 0.75) return "degraded";
  return "ok";
}