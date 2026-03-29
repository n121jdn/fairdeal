import { useState, useEffect } from "react";

const INFO_SECTIONS = [
  {
    id: "throttle",
    title: "Throttling",
    icon: "⚙",
    content: [
      {
        heading: "How orders are accepted or rejected",
        body: `Every incoming order is evaluated against the system's current load. The core metric is the Load Factor — the ratio of incoming demand to available capacity. When the load factor reaches or exceeds 1.0, the throttler begins rejecting orders to protect delivery SLAs.`,
      },
      {
        heading: "Load Factor formula",
        code: `load_factor = arrival_rate / (active_riders / avg_delivery_time)

  arrival_rate       orders arriving per second
  active_riders      riders currently available
  avg_delivery_time  mean time to complete a delivery (minutes)

  load_factor ≥ 1.0  →  saturated  →  REJECT
  load_factor < 1.0  →  capacity available  →  ACCEPT`,
      },
      {
        heading: "Queue behaviour",
        body: `Accepted orders join the rider queue. Each rider handles one order at a time. When all riders are busy, new orders queue up to a configurable limit. Orders beyond the queue cap are immediately rejected. Each manual Tick advances the clock — completing deliveries and freeing riders.`,
      },
    ],
  },
  {
    id: "metrics",
    title: "Metrics",
    icon: "📊",
    content: [
      {
        heading: "Health bands",
        code: `load_factor < 0.75  →  healthy   (green)
  load_factor < 0.90  →  degraded  (amber)
  load_factor ≥ 0.90  →  critical  (red)
  load_factor ≥ 1.00  →  saturated (red, banner shown)`,
      },
      {
        heading: "Acceptance rate",
        body: `accepted_total ÷ (accepted_total + rejected_total). A healthy system running below capacity trends toward 100%. A falling acceptance rate is the first sign that demand is outpacing rider supply — add riders or reduce avg delivery time to recover.`,
      },
      {
        heading: "Effective SLA",
        body: `The committed delivery window shrinks dynamically under load to avoid promising what the system can't deliver. At normal load the full 60-minute window is offered. In degraded state (load > 0.75) this tightens to 54 minutes, and under critical load (> 0.90) to 48 minutes.`,
      },
      {
        heading: "Rider utilisation",
        body: `Busy riders divided by total rider capacity, shown as a bar in the system panel. At 100% utilisation the system has no slack — any spike in arrivals will immediately create rejections. Healthy targets are below 85%.`,
      },
    ],
  },
  {
    id: "simulation",
    title: "Simulation",
    icon: "🔬",
    content: [
      {
        heading: "What the simulator does",
        body: `The simulator runs a compressed time model over a chosen duration (1–120 minutes). It generates synthetic order arrivals using a Poisson process, routes them through the same throttling logic as live orders, and returns aggregate statistics — without touching live state.`,
      },
      {
        heading: "Poisson arrival model",
        code: `P(k arrivals in time t) = (λt)^k · e^(−λt) / k!

  λ = arrival_rate (orders / second)

  Orders arrive randomly but at a predictable average rate.
  Bursts are natural — the throttler must absorb them.
  Higher λ → more frequent bursts → faster queue saturation.`,
      },
      {
        heading: "Manual Tick",
        body: `In real operation time advances continuously. The Tick button manually advances the simulation clock — completing in-flight deliveries, freeing riders, and draining the queue. Each tick represents one delivery window passing. Use it to recover from a saturated state or to test queue-drain behaviour without waiting.`,
      },
      {
        heading: "Completed orders",
        body: `When you hit Tick, orders that finish in that window move from the Live tab to the Completed tab in the feed. The number of completions equals the value returned by the /tick endpoint's "completed" field — giving you a direct view of throughput over time.`,
      },
    ],
  },
];

interface InfoModalProps {
  onClose: () => void;
}

export function InfoModal({ onClose }: InfoModalProps) {
  const [activeTab, setActiveTab] = useState("throttle");
  const section = INFO_SECTIONS.find((s) => s.id === activeTab)!;

  const handleBackdrop = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).classList.contains("modal-backdrop")) onClose();
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={handleBackdrop}>
      <div className="modal">
        <div className="modal__header">
          <span className="modal__title">How it works</span>
          <button className="modal__close" onClick={onClose}>✕</button>
        </div>

        <div className="modal__tabs">
          {INFO_SECTIONS.map((s) => (
            <button
              key={s.id}
              className={`modal__tab ${activeTab === s.id ? "modal__tab--active" : ""}`}
              onClick={() => setActiveTab(s.id)}
            >
              <span>{s.icon}</span> {s.title}
            </button>
          ))}
        </div>

        <div className="modal__body">
          <h2 className="modal__section-title">
            {section.icon} {section.title}
          </h2>
          {section.content.map((block, i) => (
            <div key={i} className="modal__block">
              <h3 className="modal__block-heading">{block.heading}</h3>
              {"body" in block && block.body && (
                <p className="modal__block-body">{block.body}</p>
              )}
              {"code" in block && block.code && (
                <pre className="modal__code">{block.code}</pre>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}