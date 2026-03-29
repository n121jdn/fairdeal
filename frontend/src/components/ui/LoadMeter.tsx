interface LoadMeterProps {
  value: number;
}

export function LoadMeter({ value }: LoadMeterProps) {
  const pct = Math.min(value / 1.5, 1) * 100;
  const color =
    value >= 1.0 ? "var(--red)" :
    value >= 0.9 ? "var(--red)" :
    value >= 0.75 ? "var(--amber)" : "var(--green)";

  return (
    <div className="load-meter">
      <div className="load-meter__header">
        <span className="load-meter__label">Load factor</span>
        <span className="load-meter__value" style={{ color }}>{value.toFixed(2)}</span>
      </div>
      <div className="load-meter__track">
        <div className="load-meter__fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <div className="load-meter__ticks">
        <span>0</span><span>0.75</span><span>0.9</span><span>1.0+</span>
      </div>
    </div>
  );
}