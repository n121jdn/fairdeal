import type { SaturationLevel, SystemState } from "../../types";

interface SaturationBannerProps {
  level: SaturationLevel;
  state: SystemState | null;
}

export function SaturationBanner({ level, state }: SaturationBannerProps) {
  if (level === "ok") return null;

  const config = {
    degraded: {
      cls: "banner--warn",
      icon: "⚠",
      text: "System degraded — load factor above 0.75. Orders may queue longer.",
    },
    critical: {
      cls: "banner--critical",
      icon: "⚡",
      text: "System critical — load factor above 0.9. Expect increased rejections.",
    },
    saturated: {
      cls: "banner--saturated",
      icon: "🔴",
      text: "System saturated — riders fully busy. Orders are being rejected.",
    },
  }[level];

  return (
    <div className={`saturation-banner ${config.cls}`}>
      <span className="banner__icon">{config.icon}</span>
      <span className="banner__text">{config.text}</span>
      {state && level === "saturated" && (
        <span className="banner__detail">
          Queue: {state.queue_size} · Riders: {state.active_riders}
        </span>
      )}
    </div>
  );
}