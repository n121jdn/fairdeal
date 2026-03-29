import { useState, useEffect } from "react";
import type { Metrics } from "../../types";
import { fetchMetrics } from "../../api";
import { LoadMeter } from "./LoadMeter";
import { StatCard } from "./StatCard";
import { Badge } from "./Badge";

interface MetricsPanelProps {
  onMetrics: (m: Metrics) => void;
}

export function MetricsPanel({ onMetrics }: MetricsPanelProps) {
  const [metrics, setMetrics] = useState<Metrics | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const m = await fetchMetrics();
        setMetrics(m);
        onMetrics(m);
      } catch {
        console.warn("Failed to fetch metrics");
      }
    };
    load();
    const id = setInterval(load, 3000);
    return () => clearInterval(id);
  }, [onMetrics]);

  if (!metrics) return null;

  const healthVariant =
    metrics.health === "healthy" ? "accepted" :
    metrics.health === "degraded" ? "warn" : "rejected";

  const acceptPct =
    metrics.acceptance_rate !== null
      ? `${(metrics.acceptance_rate * 100).toFixed(1)}%`
      : "—";

  return (
    <div className="panel panel--metrics">
      <p className="panel__label">Metrics</p>
      <LoadMeter value={metrics.load_factor ?? 0} />
      <div className="stat-grid" style={{ marginTop: 10, gridTemplateColumns: "1fr 1fr" }}>
        <StatCard label="Health" value={metrics.health} />
        <StatCard label="Acceptance" value={acceptPct} />
        <StatCard label="Total orders" value={metrics.total_decisions} />
        <StatCard label="Effective SLA" value={`${metrics.effective_sla} min`} />
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
        <Badge label={metrics.health} variant={healthVariant} />
        <Badge label={`Total Accepted: ${metrics.accepted_total}`} variant="accepted" />
        <Badge label={`Total Rejected: ${metrics.rejected_total}`} variant="rejected" />
      </div>
    </div>
  );
}