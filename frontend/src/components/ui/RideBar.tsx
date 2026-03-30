import type { SystemState } from "../../types";

interface RiderBarProps {
  state: SystemState | null;
}

export function RiderBar({ state }: RiderBarProps) {
  if (!state) return null;
  const busy = state.busy_riders ?? 0;
  const total = state.total_riders ?? state.active_riders;
  const pct = total > 0 ? (busy / total) * 100 : 0;
  const color =
    pct >= 100 ? "var(--red)" :
    pct >= 90 ? "var(--amber)" : "var(--green)";

  return (
    <div className="rider-bar">
      <div className="rider-bar__header">
        <span className="rider-bar__label">Rider utilisation</span>
        <span className="rider-bar__value" style={{ color }}>
          {busy}/{total} ({Math.round(pct)}%)
        </span>
      </div>
      <div className="rider-bar__track">
        <div
          className="rider-bar__fill"
          style={{ width: `${Math.min(pct, 100)}%`, background: color }}
        />
      </div>
    </div>
  );
}