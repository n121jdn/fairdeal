import { useState } from "react";
import type { CompletedOrder, Decision, FeedTab } from "../../types";
import { Badge } from "./Badge";

interface DecisionFeedProps {
  decisions: Decision[];
  completed: CompletedOrder[];
}

export function DecisionFeed({ decisions, completed }: DecisionFeedProps) {
  const [tab, setTab] = useState<FeedTab>("live");
  const liveReversed = [...decisions].reverse();
  const completedReversed = [...completed].reverse();

  return (
    <div className="panel panel--right">
      <div className="feed-tabs">
        <button
          className={`feed-tab ${tab === "live" ? "feed-tab--active" : ""}`}
          onClick={() => setTab("live")}
        >
          Live
          {decisions.length > 0 && (
            <span className="feed-tab__count">{decisions.length}</span>
          )}
        </button>
        <button
          className={`feed-tab ${tab === "completed" ? "feed-tab--active" : ""}`}
          onClick={() => setTab("completed")}
        >
          Completed
          {completed.length > 0 && (
            <span className="feed-tab__count feed-tab__count--completed">
              {completed.length}
            </span>
          )}
        </button>
      </div>

      {tab === "live" && (
        <div className="decision-feed">
          {liveReversed.length === 0 ? (
            <div className="feed-empty">
              No orders yet.<br />Send one below.
            </div>
          ) : (
            liveReversed.map((d, i) => (
              <div key={i} className="feed-item">
                <div className="feed-item__meta">
                  <span className="feed-item__id">{d.order_id}</span>
                  <span className="feed-item__detail">
                    {d.distance_km} km · {d.items_count} items
                  </span>
                </div>
                <div className="feed-item__right">
                  <Badge
                    label={d.decision}
                    variant={d.decision === "ACCEPTED" ? "accepted" : "rejected"}
                  />
                  <span className="feed-item__time">{d.timestamp}</span>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {tab === "completed" && (
        <div className="decision-feed">
          {completedReversed.length === 0 ? (
            <div className="feed-empty">
              No completed orders yet.<br />
              Hit <strong>Tick</strong> to advance the clock.
            </div>
          ) : (
            <>
              <div className="completed-summary">
                <span>{completed.length} delivered</span>
                <Badge label="all clear" variant="completed" />
              </div>
              {completedReversed.map((d, i) => (
                <div key={i} className="feed-item feed-item--completed">
                  <div className="feed-item__meta">
                    <span className="feed-item__id">{d.order_id}</span>
                    <span className="feed-item__detail">
                      {d.distance_km} km · {d.items_count} items
                    </span>
                  </div>
                  <div className="feed-item__right">
                    <Badge label="DONE" variant="completed" />
                    <span className="feed-item__time">{d.completed_at}</span>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}