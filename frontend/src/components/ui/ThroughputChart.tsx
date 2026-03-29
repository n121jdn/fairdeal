import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { HistoryPoint } from "../../types";

interface ThroughputChartProps {
  history: HistoryPoint[];
}

export function ThroughputChart({ history }: ThroughputChartProps) {
  return (
    <div className="chart-section">
      <div className="chart-header">
        <span className="chart-title">Throughput — 5 s windows</span>
        <div className="chart-legend">
          <span className="legend-item">
            <span className="legend-dot" style={{ background: "var(--green)" }} />
            Accepted
          </span>
          <span className="legend-item">
            <span className="legend-dot" style={{ background: "var(--red)" }} />
            Rejected
          </span>
        </div>
      </div>
      <div className="chart-wrap">
        <ResponsiveContainer width="100%" height={190}>
          <AreaChart data={history} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="gA" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#1fcf8a" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#1fcf8a" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gR" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#f05252" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#f05252" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="t" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} />
            <Tooltip
              contentStyle={{
                background: "var(--bg-3)",
                border: "1px solid var(--border-2)",
                borderRadius: 6,
                fontSize: 11,
              }}
            />
            <Area type="monotone" dataKey="accepted" stroke="#1fcf8a" strokeWidth={2} fill="url(#gA)" dot={false} />
            <Area type="monotone" dataKey="rejected" stroke="#f05252" strokeWidth={2} fill="url(#gR)" dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}