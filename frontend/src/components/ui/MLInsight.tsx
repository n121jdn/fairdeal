import { useState, useEffect } from 'react';
import { getMLStatus, getDemandForecast } from '../../api';

type MLStatus = {
  delivery_predictor: {
    active: boolean;
    metrics?: { mae_minutes?: number; r2?: number; cv_mae_minutes?: number };
    note?: string;
  };
  demand_forecaster: {
    active: boolean;
    corrector?: boolean;
    metrics?: { cv_mae_orders_per_min?: number };
    note?: string;
  };
};

type DemandForecast = {
  current_arrival_rate: number;
  forecasted_arrival_rate: number;
  profile_baseline: number;
  uncertainty: number;
  expected_orders_next_10min: number;
  expected_orders_range: [number, number];
  source: string;
  recommendation: string;
};

const PulsingDot = ({ color }: { color: string }) => (
  <span style={{ position: 'relative', display: 'inline-flex', width: 8, height: 8 }}>
    <span style={{
      position: 'absolute', inset: 0, borderRadius: '50%',
      background: color, opacity: 0.4,
      animation: 'ml-ping 1.4s cubic-bezier(0,0,0.2,1) infinite',
    }} />
    <span style={{ borderRadius: '50%', width: 8, height: 8, background: color, display: 'block' }} />
  </span>
);

const MiniBar = ({ value, max, color }: { value: number; max: number; color: string }) => (
  <div style={{
    height: 3, borderRadius: 99, background: 'rgba(255,255,255,0.07)',
    overflow: 'hidden', marginTop: 4,
  }}>
    <div style={{
      height: '100%', borderRadius: 99,
      width: `${Math.min(100, (value / max) * 100)}%`,
      background: color,
      transition: 'width 0.6s ease',
    }} />
  </div>
);

export function MLInsights() {
  const [mlStatus, setMLStatus] = useState<MLStatus | null>(null);
  const [demandForecast, setDemandForecast] = useState<DemandForecast | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    async function fetchMLData() {
      try {
        const [status, forecast] = await Promise.allSettled([
          getMLStatus(),
          getDemandForecast(),
        ]);
        if (status.status === 'fulfilled') setMLStatus(status.value);
        if (forecast.status === 'fulfilled') setDemandForecast(forecast.value);
        setLastUpdated(new Date());
      } catch (error) {
        console.error('Failed to fetch ML data', error);
      } finally {
        setLoading(false);
      }
    }

    fetchMLData();
    const interval = setInterval(fetchMLData, 30000);
    return () => clearInterval(interval);
  }, []);

  const recColor =
    demandForecast?.recommendation === 'Increase riders'
      ? '#f97316'
      : demandForecast?.recommendation === 'Monitor closely'
      ? '#eab308'
      : '#22c55e';

  const trendIcon =
    demandForecast && demandForecast.forecasted_arrival_rate > demandForecast.current_arrival_rate * 1.1
      ? '↑'
      : demandForecast && demandForecast.forecasted_arrival_rate < demandForecast.current_arrival_rate * 0.9
      ? '↓'
      : '→';

  const trendColor =
    trendIcon === '↑' ? '#f97316' : trendIcon === '↓' ? '#22c55e' : '#94a3b8';

  return (
    <>
      <style>{`
        @keyframes ml-ping {
          0%   { transform: scale(1); opacity: 0.4; }
          70%  { transform: scale(2.2); opacity: 0; }
          100% { transform: scale(2.2); opacity: 0; }
        }
        @keyframes ml-fadein {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .ml-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
        }
        .ml-chip {
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 0.06em;
          padding: 2px 7px;
          border-radius: 99px;
          text-transform: uppercase;
        }
        .ml-value {
          font-variant-numeric: tabular-nums;
          font-weight: 600;
          font-size: 15px;
          color: var(--text-primary, #f1f5f9);
        }
        .ml-label {
          font-size: 10px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--text-dim, #64748b);
          margin-bottom: 2px;
        }
        .ml-divider {
          height: 1px;
          background: rgba(255,255,255,0.06);
          margin: 10px 0;
        }
        .ml-section {
          animation: ml-fadein 0.35s ease both;
        }
      `}</style>

      <div className="stat-card" style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>

        {/* Header */}
        <div className="ml-row" style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="stat-card__label" style={{ margin: 0 }}>ML ENGINE</span>
            {!loading && (
              <PulsingDot color={mlStatus?.delivery_predictor.active || mlStatus?.demand_forecaster.active ? '#22c55e' : '#64748b'} />
            )}
          </div>
          {lastUpdated && (
            <span style={{ fontSize: 9, color: 'var(--text-dim, #64748b)', letterSpacing: '0.05em' }}>
              {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          )}
        </div>

        {loading && (
          <div style={{ color: 'var(--text-dim, #64748b)', fontSize: 11, textAlign: 'center', padding: '8px 0' }}>
            Loading…
          </div>
        )}

        {/* Delivery Predictor */}
        {mlStatus && (
          <div className="ml-section">
            <div className="ml-row">
              <span className="ml-label">Delivery Predictor</span>
              <span
                className="ml-chip"
                style={{
                  background: mlStatus.delivery_predictor.active ? 'rgba(34,197,94,0.12)' : 'rgba(100,116,139,0.15)',
                  color: mlStatus.delivery_predictor.active ? '#22c55e' : '#64748b',
                }}
              >
                {mlStatus.delivery_predictor.active ? 'Active' : 'Fallback'}
              </span>
            </div>

            {mlStatus.delivery_predictor.active && mlStatus.delivery_predictor.metrics ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px', marginTop: 6 }}>
                <div>
                  <div className="ml-label">MAE</div>
                  <div className="ml-value">
                    {mlStatus.delivery_predictor.metrics.mae_minutes ?? '—'}
                    <span style={{ fontSize: 10, color: 'var(--text-dim,#64748b)', fontWeight: 400 }}> min</span>
                  </div>
                  <MiniBar
                    value={10 - (mlStatus.delivery_predictor.metrics.mae_minutes ?? 10)}
                    max={10}
                    color="#22c55e"
                  />
                </div>
                <div>
                  <div className="ml-label">R2</div>
                  <div className="ml-value">
                    {mlStatus.delivery_predictor.metrics.r2 != null
                      ? (mlStatus.delivery_predictor.metrics.r2 * 100).toFixed(1)
                      : '—'}
                    <span style={{ fontSize: 10, color: 'var(--text-dim,#64748b)', fontWeight: 400 }}>%</span>
                  </div>
                  <MiniBar
                    value={mlStatus.delivery_predictor.metrics.r2 ?? 0}
                    max={1}
                    color="#3b82f6"
                  />
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 11, color: 'var(--text-dim, #64748b)', marginTop: 4 }}>
                Using EWMA avg delivery time
              </div>
            )}
          </div>
        )}

        <div className="ml-divider" />

        {/* Demand Forecaster */}
        {mlStatus && (
          <div className="ml-section" style={{ animationDelay: '0.05s' }}>
            <div className="ml-row">
              <span className="ml-label">Demand Forecaster</span>
              <span
                className="ml-chip"
                style={{
                  background: mlStatus.demand_forecaster.active ? 'rgba(59,130,246,0.12)' : 'rgba(100,116,139,0.15)',
                  color: mlStatus.demand_forecaster.active ? '#3b82f6' : '#64748b',
                }}
              >
                {mlStatus.demand_forecaster.active
                  ? mlStatus.demand_forecaster.corrector
                    ? 'Corrector'
                    : 'Profile'
                  : 'Fallback'}
              </span>
            </div>

            {demandForecast ? (
              <div style={{ marginTop: 6 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px' }}>
                  <div>
                    <div className="ml-label">Next 10 min</div>
                    <div className="ml-value">
                      {demandForecast.expected_orders_next_10min}
                      <span style={{ fontSize: 10, color: 'var(--text-dim,#64748b)', fontWeight: 400 }}> orders</span>
                    </div>
                    <MiniBar value={demandForecast.expected_orders_next_10min} max={30} color="#3b82f6" />
                  </div>
                  <div>
                    <div className="ml-label">
                      Trend&nbsp;
                      <span style={{ color: trendColor, fontWeight: 700 }}>{trendIcon}</span>
                    </div>
                    <div className="ml-value" style={{ fontSize: 13 }}>
                      {(demandForecast.forecasted_arrival_rate * 60).toFixed(1)}
                      <span style={{ fontSize: 10, color: 'var(--text-dim,#64748b)', fontWeight: 400 }}>/hr</span>
                    </div>
                    <MiniBar value={demandForecast.forecasted_arrival_rate} max={1} color={trendColor} />
                  </div>
                </div>

                {/* Range */}
                <div style={{ marginTop: 8, fontSize: 10, color: 'var(--text-dim,#64748b)' }}>
                  Range&nbsp;
                  <span style={{ color: 'var(--text-secondary, #94a3b8)' }}>
                    {demandForecast.expected_orders_range[0]}:{demandForecast.expected_orders_range[1]}
                  </span>
                  &nbsp;· +/-{demandForecast.uncertainty.toFixed(3)} 
                  &nbsp;· <span style={{ color: 'var(--text-dim,#475569)', fontStyle: 'italic' }}>{demandForecast.source}</span>
                </div>
              </div>
            ) : mlStatus.demand_forecaster.active ? (
              <div style={{ fontSize: 11, color: 'var(--text-dim, #64748b)', marginTop: 4 }}>Loading forecast…</div>
            ) : (
              <div style={{ fontSize: 11, color: 'var(--text-dim, #64748b)', marginTop: 4 }}>
                Train models via <code style={{ fontSize: 10, opacity: 0.7 }}>/train</code> to activate
              </div>
            )}
          </div>
        )}

        {demandForecast?.recommendation && (
          <>
            <div className="ml-divider" />
            <div
              className="ml-section"
              style={{
                animationDelay: '0.1s',
                display: 'flex', alignItems: 'center', gap: 7,
                padding: '6px 8px', borderRadius: 6,
                background: `${recColor}14`,
                border: `1px solid ${recColor}28`,
              }}
            >
              
              <span style={{ fontSize: 11, color: recColor, fontWeight: 500 }}>
                {demandForecast.recommendation}
              </span>
            </div>
          </>
        )}
      </div>
    </>
  );
}