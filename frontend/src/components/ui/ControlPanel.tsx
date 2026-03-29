import { useState, useEffect, useRef, useCallback } from "react";
import type { CompletedOrder, Decision, SimResult } from "../../types";
import { patchRiders, patchState, postTick, postSimulate } from "../../api";
import { SectionDivider } from "./SectionDivider";
import { Badge } from "./Badge";


interface ControlPanelProps {
  onTick: () => void;
  acceptedOrders: Decision[];
  onComplete: (orders: CompletedOrder[]) => void;
  avgDeliveryTime: number;
}

export function ControlPanel({
  onTick,
  acceptedOrders,
  onComplete,
  avgDeliveryTime,
}: ControlPanelProps) {
  const [riders, setRiders] = useState(10);
  const [ridersStatus, setRidersStatus] = useState<string | null>(null);
  const [overrideRiders, setOverrideRiders] = useState("");
  const [overrideSLA, setOverrideSLA] = useState("");
  const [overrideStatus, setOverrideStatus] = useState<string | null>(null);
  const [tickStatus, setTickStatus] = useState<string | null>(null);
  const [autoTick, setAutoTick] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [simDuration, setSimDuration] = useState(10);
  const [simResult, setSimResult] = useState<SimResult | null>(null);
  const [simLoading, setSimLoading] = useState(false);

  const inFlightRef = useRef<Decision[]>([]);
  useEffect(() => {
    inFlightRef.current = acceptedOrders.filter((o) => o.decision === "ACCEPTED");
  }, [acceptedOrders]);

  const flash = (set: (v: string | null) => void, msg: string) => {
    set(msg);
    setTimeout(() => set(null), 3000);
  };

  const executeTick = useCallback(async () => {
    try {
      const r = await postTick();
      flash(setTickStatus, `✓ ${r.completed} completed · queue ${r.queue_size}`);
      if (r.completed > 0) {
        const toComplete = [...inFlightRef.current]
          .slice(0, r.completed)
          .map((o) => ({ ...o, completed_at: new Date().toLocaleTimeString() }));
        onComplete(toComplete);
      }
      onTick();
    } catch {
      flash(setTickStatus, "✗ Failed");
    }
  }, [onTick, onComplete]);

  const intervalMs = Math.max(avgDeliveryTime * 60 * 1000, 5000);
  const intervalSec = Math.round(intervalMs / 1000);

  useEffect(() => {
    if (!autoTick) { setCountdown(0); return; }
    setCountdown(intervalSec);
    const cdId = setInterval(() => setCountdown((c) => Math.max(0, c - 1)), 1000);
    const tickId = setInterval(() => { executeTick(); setCountdown(intervalSec); }, intervalMs);
    return () => { clearInterval(cdId); clearInterval(tickId); };
  }, [autoTick, intervalMs, intervalSec, executeTick]);

  const fmtCountdown = (s: number) =>
    s >= 60
      ? `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`
      : `${s}s`;

  const handleUpdateRiders = async () => {
    try {
      const r = await patchRiders(riders);
      flash(setRidersStatus, `✓ Updated → ${r.new_total} total · ${r.active_riders} active`);
    } catch {
      flash(setRidersStatus, "✗ Failed");
    }
  };

  const handleOverrideState = async () => {
    const payload: { active_riders?: number; avg_delivery_time?: number } = {};
    if (overrideRiders !== "") payload.active_riders = +overrideRiders;
    if (overrideSLA !== "") payload.avg_delivery_time = +overrideSLA;
    if (!Object.keys(payload).length) return;
    try {
      await patchState(payload);
      flash(setOverrideStatus, "✓ State updated");
    } catch {
      flash(setOverrideStatus, "✗ Failed");
    }
  };

  const handleSimulate = async () => {
    setSimLoading(true);
    setSimResult(null);
    try {
      setSimResult(await postSimulate(simDuration));
    } catch {
      console.error("Simulation failed");
    } finally {
      setSimLoading(false);
    }
  };

  return (
    <div className="control-panel">
      {/* PATCH /riders */}
      <div className="ctrl-block">
        <SectionDivider label="Rider capacity" />
        <div className="ctrl-row">
          <div className="field">
            <label className="field__label">Total riders — {riders}</label>
            <input
              type="range"
              className="field__input"
              min={1}
              max={50}
              value={riders}
              onChange={(e) => setRiders(+e.target.value)}
            />
          </div>
          <button className="btn-ctrl" onClick={handleUpdateRiders}>Apply</button>
        </div>
        {ridersStatus && <p className="ctrl-status">{ridersStatus}</p>}
      </div>

      {/* PATCH /state */}
      <div className="ctrl-block">
        <SectionDivider label="State override" />
        <div className="ctrl-row">
          <div className="field">
            <label className="field__label">Active riders</label>
            <input
              type="number"
              className="field__input field__input--sm"
              placeholder="e.g. 8"
              min={1}
              max={200}
              value={overrideRiders}
              onChange={(e) => setOverrideRiders(e.target.value)}
            />
          </div>
          <div className="field">
            <label className="field__label">Avg delivery (min)</label>
            <input
              type="number"
              className="field__input field__input--sm"
              placeholder="e.g. 30"
              min={1}
              max={240}
              value={overrideSLA}
              onChange={(e) => setOverrideSLA(e.target.value)}
            />
          </div>
          <button className="btn-ctrl" onClick={handleOverrideState}>Override</button>
        </div>
        {overrideStatus && <p className="ctrl-status">{overrideStatus}</p>}
      </div>

      {/* POST /tick */}
      <div className="ctrl-block">
        <SectionDivider label="Clock" />
        <div className="ctrl-row" style={{ alignItems: "center" }}>
          <button
            className={`tick-toggle ${autoTick ? "tick-toggle--on" : ""}`}
            onClick={() => setAutoTick((a) => !a)}
          >
            <span className="tick-toggle__dot" />
            Auto
          </button>
          <span style={{ fontSize: 11, color: "var(--text-secondary)", flex: 1 }}>
            {autoTick ? (
              <>
                Every{" "}
                <strong style={{ color: "var(--text-primary)" }}>{avgDeliveryTime} min</strong>
                {" · next in "}
                <strong style={{ color: "var(--teal)" }}>{fmtCountdown(countdown)}</strong>
              </>
            ) : (
              <>
                Interval:{" "}
                <strong style={{ color: "var(--text-primary)" }}>{avgDeliveryTime} min</strong>
                <span style={{ color: "var(--text-muted)" }}> (avg delivery time)</span>
              </>
            )}
          </span>
          <button className="btn-ctrl" onClick={executeTick}>Tick now</button>
        </div>
        {autoTick && (
          <div className="tick-progress">
            <div
              className="tick-progress__fill"
              style={{
                width: `${(1 - countdown / Math.round(intervalMs / 1000)) * 100}%`,
              }}
            />
          </div>
        )}
        {tickStatus && <p className="ctrl-status">{tickStatus}</p>}
      </div>

      {/* POST /simulate */}
      <div className="ctrl-block">
        <SectionDivider label="Simulation" />
        <div className="ctrl-row">
          <div className="field">
            <label className="field__label">Duration — {simDuration} min</label>
            <input
              type="range"
              className="field__input"
              min={1}
              max={120}
              value={simDuration}
              onChange={(e) => setSimDuration(+e.target.value)}
            />
          </div>
          <button
            className="btn-ctrl btn-ctrl--accent"
            onClick={handleSimulate}
            disabled={simLoading}
          >
            {simLoading ? "Running…" : "Run"}
          </button>
        </div>
        {simResult && (
          <div className="sim-result">
            <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>
              {simResult.total_orders} orders · {simResult.duration_minutes} min
            </span>
            <Badge label={`Accepted: ${simResult.accepted}`} variant="accepted" />
            <Badge label={`Rejected: ${simResult.rejected}`} variant="rejected" />
            <Badge
              label={`${(simResult.acceptance_rate * 100).toFixed(1)}% acc`}
              variant="neutral"
            />
          </div>
        )}
      </div>
    </div>
  );
}