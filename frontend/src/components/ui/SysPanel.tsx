import type { SystemState } from "../../types";
import { RiderBar } from "./RideBar";
import { StatCard } from "./StatCard";

interface SystemPanelProps {
  state: SystemState | null;
}

export function SystemPanel({ state }: SystemPanelProps) {
  if (!state) {
    return (
      <div className="panel panel--left">
        <p className="panel__label">System</p>
        <div className="feed-empty">Connecting…</div>
      </div>
    );
  }

  return (
    <div className="panel panel--left">
      <p className="panel__label">System</p>
      <div className="stat-grid">
        <StatCard label="Active riders" value={state.active_riders} sub="available" />
        <StatCard label="Total riders" value={state.total_riders} sub="capacity" />
        <StatCard label="Busy riders" value={state.busy_riders} sub="on delivery" />
        <StatCard label="Queue size" value={state.queue_size} sub="pending orders" />
        <StatCard label="Avg delivery" value={`${state.avg_delivery_time} min`} />
        <StatCard label="Arrival rate" value={`${state.arrival_rate}/s`} />
      </div>
      <RiderBar state={state} />
    </div>
  );
}