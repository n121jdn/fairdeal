interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  accent?: string;
}

export function StatCard({ label, value, sub, accent }: StatCardProps) {
  return (
    <div className="stat-card">
      <p className="stat-card__label">{label}</p>
      <p className="stat-card__value" style={accent ? { color: accent } : undefined}>
        {value}
      </p>
      {sub && <p className="stat-card__sub">{sub}</p>}
    </div>
  );
}