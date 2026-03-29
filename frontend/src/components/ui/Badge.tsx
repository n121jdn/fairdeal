interface BadgeProps {
  label: string;
  variant?: "accepted" | "rejected" | "neutral" | "warn" | "completed";
}

export function Badge({ label, variant = "neutral" }: BadgeProps) {
  return <span className={`badge badge--${variant}`}>{label}</span>;
}   