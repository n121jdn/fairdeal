import { useState } from "react";
import type { Decision, Order } from "../../types";
import { createOrder } from "../../api";
import { SectionDivider } from "./SectionDivider";

interface OrderFormProps {
  onDecision: (d: Decision) => void;
}

export function OrderForm({ onDecision }: OrderFormProps) {
  const [distance, setDistance] = useState(5);
  const [items, setItems] = useState(10);
  const [loading, setLoading] = useState(false);

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
        ...res,
        timestamp: new Date().toLocaleTimeString(),
        distance_km: distance,
        items_count: items,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="order-form">
      <SectionDivider label="New order" />
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div className="field">
          <label className="field__label">Distance (km) — {distance}</label>
          <input
            type="range"
            className="field__input"
            min={1}
            max={30}
            value={distance}
            onChange={(e) => setDistance(+e.target.value)}
          />
        </div>
        <div className="field">
          <label className="field__label">Items — {items}</label>
          <input
            type="range"
            className="field__input"
            min={1}
            max={50}
            value={items}
            onChange={(e) => setItems(+e.target.value)}
          />
        </div>
        <button className="btn-send" onClick={submit} disabled={loading}>
          {loading ? "Sending…" : "Send order"}
        </button>
      </div>
    </div>
  );
}