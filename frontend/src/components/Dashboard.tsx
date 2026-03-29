import { useState, useEffect, useRef, useCallback } from "react";
import type { CompletedOrder, Decision, HistoryPoint, Metrics, SystemState } from "../types";
import { getState } from "../api";
import { getSaturation } from "../utils";
import { SaturationBanner } from "./ui/Banner";
import { SystemPanel } from "./ui/SysPanel";
import { MetricsPanel } from "./ui/MetricsPanel";
import { ThroughputChart } from "./ui/ThroughputChart";
import { ControlPanel } from "./ui/ControlPanel";
import { OrderForm } from "./ui/OrderForm";
import { DecisionFeed } from "./ui/DecisionFeed";
import { InfoModal } from "./ui/Info";

export default function Dashboard() {
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [completed, setCompleted] = useState<CompletedOrder[]>([]);
  const [state, setState] = useState<SystemState | null>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [showInfo, setShowInfo] = useState(false);

  const windowRef = useRef<{ accepted: number; rejected: number }>({
    accepted: 0,
    rejected: 0,
  });

  const refreshState = useCallback(async () => {
    try {
      setState(await getState());
    } catch {
      console.warn("Failed to refresh state");
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    async function run() {
      try {
        const data = await getState();
        if (mounted) setState(data);
      } catch {
        console.warn("Failed to fetch state");
      }
    }
    run();
    const id = setInterval(run, 2000);
    return () => { mounted = false; clearInterval(id); };
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      const w = windowRef.current;
      setHistory((h) => [
        ...h.slice(-29),
        { t: new Date().toLocaleTimeString(), accepted: w.accepted, rejected: w.rejected },
      ]);
      windowRef.current = { accepted: 0, rejected: 0 };
    }, 5000);
    return () => clearInterval(id);
  }, []);

  const handleDecision = useCallback((res: Decision) => {
    setDecisions((d) => [...d, res]);
    if (res.decision === "ACCEPTED") windowRef.current.accepted++;
    else windowRef.current.rejected++;
  }, []);

  const handleComplete = useCallback((orders: CompletedOrder[]) => {
    setCompleted((c) => [...c, ...orders]);
  }, []);

  const saturation = getSaturation(state, metrics);

  return (
    <>
      <header className="app-topbar">
        <span className="app-topbar__brand">Dispatch</span>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          {saturation !== "ok" && (
            <span className={`topbar-health topbar-health--${saturation}`}>
              {saturation === "saturated"
                ? "Saturated"
                : saturation === "critical"
                ? "Critical"
                : "Degraded"}
            </span>
          )}
          <span className="app-topbar__status">Operations · Live</span>
          <button className="btn-info" onClick={() => setShowInfo(true)}>
            How it works
          </button>
        </div>
      </header>

      <SaturationBanner level={saturation} state={state} />

      <div className="dashboard">
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 1,
            background: "var(--border-1)",
          }}
        >
          <SystemPanel state={state} />
          <MetricsPanel onMetrics={setMetrics} />
        </div>

        <div className="panel panel--main">
          <ThroughputChart history={history} />
          <OrderForm onDecision={handleDecision} />
          <ControlPanel
            onTick={refreshState}
            acceptedOrders={decisions}
            onComplete={handleComplete}
            avgDeliveryTime={state?.avg_delivery_time ?? 30}
          />
        </div>

        <DecisionFeed decisions={decisions} completed={completed} />
      </div>

      {showInfo && <InfoModal onClose={() => setShowInfo(false)} />}
    </>
  );
}