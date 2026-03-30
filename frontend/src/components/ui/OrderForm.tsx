import { useState, useEffect, useRef } from "react";
import type { Decision, Order } from "../../types";
import { createOrder, predictDelivery, getState } from "../../api";
import { SectionDivider } from "./SectionDivider";

interface OrderFormProps {
  onDecision: (d: Decision) => void;
}

export function OrderForm({ onDecision }: OrderFormProps) {
  const [distance, setDistance] = useState(5);
  const [items, setItems] = useState(10);
  const [loading, setLoading] = useState(false);
  const [queueSize, setQueueSize] = useState(0);

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
  }, [distance, items, queueSize]); // <-- queueSize is a dep

  const submit = async () => {
    setLoading(true);
    const order: Order = {
      order_id: "ORD-" + Math.floor(Math.random() * 100000),
      warehouse_id: "WH1",
      distance_km: distance,
      items_count: items,
    };
    try {
      const res = await createOrder(order);
      onDecision({
        order_id: res.order_id,
        decision: res.decision,
        timestamp: new Date().toLocaleTimeString(),
        distance_km: distance,
        items_count: items,
        warehouse_id: order.warehouse_id,
      });

      // Immediately re-sync queue after order so prediction updates right away
      const s = await getState();
      setQueueSize(s.queue_size ?? 0);
    } finally {
      setLoading(false);
    }
  };

  const confColor = prediction?.confidence === "high" ? "#22c55e" : "#eab308";

  return (
    <div className="order-form">
      <SectionDivider label="New order" />
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

      {/* ML prediction strip — hidden when model not trained */}
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
    </div>
  );
}