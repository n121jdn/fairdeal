import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import type {
  CompletedOrder,
  Decision,
  HistoryPoint,
  Metrics,
  SystemState,
  Order,
  DecisionInsights,
} from "../types";
import { getForecast, getState, getDecisionInsights } from "../api";
import { getSaturation } from "../utils";
import { SaturationBanner } from "./ui/Banner";
import { SystemPanel } from "./ui/SysPanel";
import { MetricsPanel } from "./ui/MetricsPanel";
import { ThroughputChart } from "./ui/ThroughputChart";
import { ControlPanel } from "./ui/ControlPanel";
import { OrderForm } from "./ui/OrderForm";
import { DecisionFeed } from "./ui/DecisionFeed";
import { InfoModal } from "./ui/Info";
import { MLInsights } from "./ui/MLInsight";

export default function Dashboard() {
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [completed, setCompleted] = useState<CompletedOrder[]>([]);
  const [state, setState] = useState<SystemState | null>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [showInfo, setShowInfo] = useState(false);
  const [forecast, setForecast] = useState<{ forecast_rate: number } | null>(
    null,
  );
  const [insights, setInsights] = useState<DecisionInsights | null>(null);

  const windowRef = useRef<{ accepted: number; rejected: number }>({
    accepted: 0,
    rejected: 0,
  });

  const forecastRef = useRef(forecast);

  useEffect(() => {
    forecastRef.current = forecast;
  }, [forecast]);

  const refreshState = useCallback(async () => {
    try {
      setState(await getState());
    } catch {
      console.warn("Failed to refresh state");
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    async function fetchAll() {
      try {
        const [stateData, forecastData, insightsData] =
          await Promise.allSettled([
            getState(),
            getForecast(),
            getDecisionInsights(),
          ]);
        if (stateData.status === "fulfilled" && mounted)
          setState(stateData.value);
        if (forecastData.status === "fulfilled" && mounted)
          setForecast(forecastData.value);
        if (insightsData.status === "fulfilled" && mounted)
          setInsights(insightsData.value);
      } catch {
        console.warn("Failed to fetch data");
      }
    }
    fetchAll();
    const id = setInterval(fetchAll, 2000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, []);

  // History aggregation – stable interval, uses forecastRef for latest value
  useEffect(() => {
    const id = setInterval(() => {
      const w = windowRef.current;
      setHistory((h) => [
        ...h.slice(-29),
        {
          t: new Date().toLocaleTimeString(),
          accepted: w.accepted,
          rejected: w.rejected,
          forecast_rate: forecastRef.current?.forecast_rate || 0,
        },
      ]);
      windowRef.current = { accepted: 0, rejected: 0 };
    }, 5000);
    return () => clearInterval(id);
  }, []); // No dependencies – interval runs continuously
  console.log(decisions);

  const handleDecision = useCallback((res: Decision, orderDetails: Order) => {
    setDecisions((d) => [...d, { ...res, ...orderDetails }]);
    if (res.decision?.toUpperCase() === "ACCEPTED")
      windowRef.current.accepted++;
    else windowRef.current.rejected++;
  }, []);
  const handleComplete = useCallback((orders: CompletedOrder[]) => {
    setCompleted((c) => [...c, ...orders]);
  }, []);

  const saturation = useMemo(
    () => getSaturation(state, metrics),
    [state, metrics],
  );
  const [connectionError, setConnectionError] = useState(false);

  useEffect(() => {
    const checkConnection = async () => {
      try {
        await getState();
        setConnectionError(false);
      } catch {
        setConnectionError(true);
      }
    };
    checkConnection();
  }, []);

  if (connectionError) {
    return (
      <div className="error-banner">
        ⚠️ Cannot connect to backend at SERVER. Is the server running?
      </div>
    );
  }

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
          <MLInsights />

          {insights?.recommendations && insights.recommendations.length > 0 && (
            <div className="panel" style={{ padding: "12px", marginTop: 1 }}>
              <p className="panel__label">Recommendations</p>
              {insights.recommendations.map((rec, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: "8px 10px",
                    marginTop: idx > 0 ? 6 : 0,
                    borderRadius: 6,
                    background:
                      rec.priority === "high"
                        ? "rgba(240,82,82,0.1)"
                        : rec.priority === "medium"
                          ? "rgba(234,179,8,0.1)"
                          : "rgba(34,197,94,0.1)",
                    borderLeft: `3px solid ${
                      rec.priority === "high"
                        ? "#f05252"
                        : rec.priority === "medium"
                          ? "#eab308"
                          : "#22c55e"
                    }`,
                    fontSize: 12,
                  }}
                >
                  {rec.message}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="panel panel--main">
          <ThroughputChart history={history} />
          <OrderForm onDecision={handleDecision} />
          <ControlPanel
            onTick={refreshState}
            acceptedOrders={decisions}
            onComplete={handleComplete}
            avgDeliveryTime={state?.avg_delivery_time ?? 30}
            completedOrders={completed}
          />
        </div>

        <DecisionFeed decisions={decisions} completed={completed} />
      </div>

      {showInfo && <InfoModal onClose={() => setShowInfo(false)} />}
    </>
  );
}