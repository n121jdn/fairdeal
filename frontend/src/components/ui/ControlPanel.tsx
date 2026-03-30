import { useState, useEffect, useRef, useCallback } from "react";
import type { CompletedOrder, Decision, SimResult } from "../../types";
import {
  patchRiders,
  patchState,
  postTick,
  postSimulate,
  trainModels,
} from "../../api";
import { SectionDivider } from "./SectionDivider";
import { Badge } from "./Badge";

interface ControlPanelProps {
  onTick: () => void;
  acceptedOrders: Decision[];
  onComplete: (orders: CompletedOrder[]) => void;
  avgDeliveryTime: number;
  completedOrders?: CompletedOrder[];
}

export function ControlPanel({
  onTick,
  acceptedOrders,
  onComplete,
  avgDeliveryTime,
  completedOrders = [],
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
  const [training, setTraining] = useState(false);
  const [trainingStatus, setTrainingStatus] = useState<string | null>(null);

  const inFlightRef = useRef<Decision[]>([]);

  const flash = (set: (v: string | null) => void, msg: string) => {
    set(msg);
    setTimeout(() => set(null), 3000);
  };

  const executeTick = useCallback(async () => {
    try {
      const r = await postTick();
      flash(
        setTickStatus,
        `✓ ${r.completed} completed · queue ${r.queue_size}`,
      );
      if (r.completed > 0) {
        const toComplete = [...inFlightRef.current]
          .slice(0, r.completed)
          .map((o) => ({
            ...o,
            completed_at: new Date().toLocaleTimeString(),
            delivery_time: avgDeliveryTime,
          }));
        onComplete(toComplete);
      }
      onTick();
    } catch {
      flash(setTickStatus, "✗ Failed");
    }
  }, [onTick, onComplete, avgDeliveryTime]);

  const intervalMs = Math.max(avgDeliveryTime * 60 * 1000, 5000);
  const intervalSec = Math.round(intervalMs / 1000);

  useEffect(() => {
    if (!autoTick) {
      setCountdown(0);
      return;
    }
    setCountdown(intervalSec);
    const cdId = setInterval(
      () => setCountdown((c) => Math.max(0, c - 1)),
      1000,
    );
    const tickId = setInterval(() => {
      executeTick();
      setCountdown(intervalSec);
    }, intervalMs);
    return () => {
      clearInterval(cdId);
      clearInterval(tickId);
    };
  }, [autoTick, intervalMs, intervalSec, executeTick]);

  useEffect(() => {
    inFlightRef.current = acceptedOrders.filter(
      (o) => o.decision?.toUpperCase() === "ACCEPTED",
    );
  }, [acceptedOrders]);

  const fmtCountdown = (s: number) =>
    s >= 60
      ? `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`
      : `${s}s`;

  const handleUpdateRiders = async () => {
    try {
      const r = await patchRiders(riders);
      flash(
        setRidersStatus,
        `✓ Updated → ${r.new_total} total · ${r.active_riders} active`,
      );
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

  const handleTrainModels = async () => {
    // Build dataset from completed orders (with delivery times)
    const completedData = completedOrders.map((order, i) => {
      const deliveryMs = (order.delivery_time ?? avgDeliveryTime) * 60 * 1000;
      const deliveredAt = new Date(
        Date.now() - (completedOrders.length - i) * 90_000,
      );
      const createdAt = new Date(deliveredAt.getTime() - deliveryMs);

      return {
        distance_km: order.distance_km,
        items_count: order.items_count,
        order_created_time: createdAt.toISOString(),
        order_delivered_time: deliveredAt.toISOString(),
        queue_at_dispatch: 0,
      };
    });

    // Build dataset from accepted orders (only creation time)
    const acceptedOnly = acceptedOrders
      .filter(order => order.decision?.toUpperCase() === "ACCEPTED")
      .map((order, i) => {
        // Use a realistic timestamp – e.g., current time minus a small offset
        const createdAt = new Date(Date.now() - (acceptedOrders.length - i) * 5_000);
        return {
          distance_km: order.distance_km,
          items_count: order.items_count,
          order_created_time: createdAt.toISOString(),
          queue_at_dispatch: 0,
        };
      });

    // Merge: if an order appears in both, keep the completed version
    const completedMap = new Map(completedData.map(item => [item.order_created_time, item]));
    const mergedData = [
      ...completedData,
      ...acceptedOnly.filter(item => !completedMap.has(item.order_created_time)),
    ];

    const totalOrders = mergedData.length;
    if (totalOrders < 10) {
      flash(
        setTrainingStatus,
        `Need at least 10 orders (have ${totalOrders})`,
      );
      return;
    }

    setTraining(true);
    try {
      const result = await trainModels(mergedData);
      const deliveryStatus = result.results.delivery_predictor?.status ?? "failed";
      const demandStatus = result.results.demand_forecaster?.status ?? "failed";
      flash(
        setTrainingStatus,
        `delivery=${deliveryStatus}, demand=${demandStatus}`,
      );
      // Optionally: show warnings from backend if provided
      if (result.warnings && result.warnings.length) {
        console.warn("Training warnings:", result.warnings);
      }
    } catch (error: any) {
      flash(setTrainingStatus, `Training failed: ${error.message}`);
    } finally {
      setTraining(false);
    }
  };

  const totalOrders = completedOrders.length + acceptedOrders.filter(o => o.decision?.toUpperCase() === "ACCEPTED").length;
  
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
          <button className="btn-ctrl" onClick={handleUpdateRiders}>
            Apply
          </button>
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
          <button className="btn-ctrl" onClick={handleOverrideState}>
            Override
          </button>
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
          <span
            style={{ fontSize: 11, color: "var(--text-secondary)", flex: 1 }}
          >
            {autoTick ? (
              <>
                Every{" "}
                <strong style={{ color: "var(--text-primary)" }}>
                  {avgDeliveryTime} min
                </strong>
                {" · next in "}
                <strong style={{ color: "var(--teal)" }}>
                  {fmtCountdown(countdown)}
                </strong>
              </>
            ) : (
              <>
                Interval:{" "}
                <strong style={{ color: "var(--text-primary)" }}>
                  {avgDeliveryTime} min
                </strong>
                <span style={{ color: "var(--text-muted)" }}>
                  {" "}
                  (avg delivery time)
                </span>
              </>
            )}
          </span>
          <button className="btn-ctrl" onClick={executeTick}>
            Tick now
          </button>
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
            <Badge
              label={`Accepted: ${simResult.accepted}`}
              variant="accepted"
            />
            <Badge
              label={`Rejected: ${simResult.rejected}`}
              variant="rejected"
            />
            <Badge
              label={`${(simResult.acceptance_rate * 100).toFixed(1)}% acc`}
              variant="neutral"
            />
          </div>
        )}
      </div>

      {/* ML Training */}
      <div className="ctrl-block">
        <SectionDivider label="ML Training" />
        <div className="ctrl-row">
          <button
            className="btn-ctrl"
            onClick={handleTrainModels}
            disabled={training || totalOrders < 10}
            style={{
              background: totalOrders >= 10 ? "var(--teal)" : "var(--bg-3)",
              cursor: totalOrders >= 10 ? "pointer" : "not-allowed",
            }}
          >
            {training
              ? "Training..."
              : `Train Models (${totalOrders} orders)`}
          </button>
          {totalOrders < 10 && (
            <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
              Need {10 - totalOrders} more orders
            </span>
          )}
        </div>
        {trainingStatus && <p className="ctrl-status">{trainingStatus}</p>}
      </div>
    </div>
  );
}