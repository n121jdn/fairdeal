import { useState, useEffect, useRef } from "react";
import type { Decision, Order } from "../../types";
import { createOrder, createOrderWithML, predictDelivery, getState } from "../../api";
import { SectionDivider } from "./SectionDivider";

interface OrderFormProps {
  onDecision: (d: Decision, orderDetails: Order) => void;
}

export function OrderForm({ onDecision }: OrderFormProps) {
  const [distance, setDistance] = useState(5);
  const [items, setItems] = useState(10);
  const [loading, setLoading] = useState(false);
  const [queueSize, setQueueSize] = useState(0);
  const [useML, setUseML] = useState(false);
  const [mlInsights, setMLInsights] = useState<any>(null);

  const [prediction, setPrediction] = useState<{
    predicted_delivery_minutes: number;
    confidence: "high" | "medium";
    current_queue: number;
  } | null>(null);
  const [predicting, setPredicting] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep queueSize in sync with live state
  useEffect(() => {
    async function syncQueue() {
      try {
        const s = await getState();
        setQueueSize(s.queue_size ?? 0);
      } catch {
        // ignore
      }
    }
    syncQueue();
    const id = setInterval(syncQueue, 3000);
    return () => clearInterval(id);
  }, []);

  // Re-fetch prediction whenever sliders OR queue changes
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setPredicting(true);
      try {
        const res = await predictDelivery(distance, items, queueSize);
        setPrediction(res ?? null);
      } finally {
        setPredicting(false);
      }
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [distance, items, queueSize]);

  const submit = async () => {
    setLoading(true);
    const order: Order = {
      order_id: "ORD-" + Date.now() + "-" + Math.random().toString(36).substr(2, 6),
      warehouse_id: "WH1",
      distance_km: distance,
      items_count: items,
    };
    
    try {
      const res = useML ? await createOrderWithML(order) : await createOrder(order);
      
      if (res.ml_insights) {
        setMLInsights(res.ml_insights);
      }
      
      onDecision({
        order_id: res.order_id,
        decision: res.decision,
        timestamp: new Date().toLocaleTimeString(),
        distance_km: distance,
        items_count: items,
        warehouse_id: order.warehouse_id,
        reason: res.reason,
      }, order);

      // Immediately re-sync queue after order so prediction updates right away
      const s = await getState();
      setQueueSize(s.queue_size ?? 0);
    } catch (error) {
      console.error("Failed to create order:", error);
    } finally {
      setLoading(false);
    }
  };

  const confColor = prediction?.confidence === "high" ? "#22c55e" : "#eab308";

  return (
    <div className="order-form">
      <SectionDivider label="New order" />
      
      {/* ML Toggle */}
      <div style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={useML}
            onChange={(e) => setUseML(e.target.checked)}
            style={{ cursor: "pointer" }}
          />
          <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
            Use ML-enhanced decisions
          </span>
        </label>
        {useML && (
          <span style={{ fontSize: 10, color: "#3b82f6", background: "rgba(59,130,246,0.1)", padding: "2px 6px", borderRadius: 4 }}>
            ⚡ Active
          </span>
        )}
      </div>
      
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div className="field">
          <label className="field__label">Distance (km) — {distance}</label>
          <input
            type="range"
            className="field__input"
            min={1} max={30} value={distance}
            onChange={(e) => setDistance(+e.target.value)}
          />
        </div>
        <div className="field">
          <label className="field__label">Items — {items}</label>
          <input
            type="range"
            className="field__input"
            min={1} max={50} value={items}
            onChange={(e) => setItems(+e.target.value)}
          />
        </div>
        <button className="btn-send" onClick={submit} disabled={loading}>
          {loading ? "Sending…" : "Send order"}
        </button>
      </div>

      {/* ML prediction strip */}
      {prediction && (
        <div style={{
          marginTop: 10,
          display: "flex", alignItems: "center", gap: 10,
          padding: "6px 10px", borderRadius: 6,
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.07)",
          fontSize: 11,
          opacity: predicting ? 0.45 : 1,
          transition: "opacity 0.2s",
        }}>
          <span style={{ color: "var(--text-dim, #64748b)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
            Est. delivery
          </span>
          <span style={{ fontWeight: 700, fontSize: 14, color: "#f1f5f9", fontVariantNumeric: "tabular-nums" }}>
            {prediction.predicted_delivery_minutes} min
          </span>
          <span style={{
            fontSize: 9, fontWeight: 600, letterSpacing: "0.08em",
            textTransform: "uppercase", padding: "2px 6px", borderRadius: 99,
            background: `${confColor}18`, color: confColor,
          }}>
            {prediction.confidence}
          </span>
          <span style={{ color: "var(--text-dim,#64748b)", fontSize: 10 }}>
            · queue&nbsp;
            <span style={{ fontVariantNumeric: "tabular-nums", color: "#94a3b8" }}>
              {prediction.current_queue}
            </span>
          </span>
          <span style={{ marginLeft: "auto", fontSize: 9, color: "var(--text-dim,#475569)", fontStyle: "italic" }}>
            ML · GBR
          </span>
        </div>
      )}
      
      {/* ML Insights after order */}
      {mlInsights && (
        <div style={{
          marginTop: 10,
          padding: "8px 12px",
          borderRadius: 6,
          background: "rgba(59,130,246,0.08)",
          border: "1px solid rgba(59,130,246,0.2)",
          fontSize: 11,
        }}>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <span>Predicted: <strong>{mlInsights.predicted_delivery_time} min</strong></span>
            <span>Forecast: <strong>{mlInsights.forecasted_arrival_rate}/s</strong></span>
            <span>Queue wait: <strong>{mlInsights.expected_queue_time} min</strong></span>
            <span>SLA: <strong>{mlInsights.dynamic_sla} min</strong></span>
          </div>
        </div>
      )}
    </div>
  );
}