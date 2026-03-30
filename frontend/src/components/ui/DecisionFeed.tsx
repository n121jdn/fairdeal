// DecisionFeed.tsx
import { useState } from "react";
import type { Decision, CompletedOrder } from "../../types";
import { Badge } from "./Badge";
import { SectionDivider } from "./SectionDivider";

interface DecisionFeedProps {
  decisions: Decision[];
  completed: CompletedOrder[];
}

export function DecisionFeed({ decisions, completed }: DecisionFeedProps) {
  const [showCompleted, setShowCompleted] = useState(false);

  const getBadgeVariant = (decision: string) => {
    if (decision === "ACCEPTED") return "accepted";
    if (decision === "REJECTED") return "rejected";
    return "neutral";
  };

  const getReasonText = (reason?: string) => {
    switch (reason) {
      case "slack":
        return "System has capacity";
      case "accepted":
        return "Within SLA";
      case "distance":
        return "Too far under high load";
      case "sla_breach":
        return "Would exceed SLA";
      default:
        return reason;
    }
  };

  const getReasonTooltip = (reason?: string) => {
    switch (reason) {
      case "slack":
        return "More riders available than pending orders";
      case "accepted":
        return "Expected delivery time within SLA";
      case "distance":
        return "Order distance exceeds threshold when system is under high load";
      case "sla_breach":
        return "Expected delay would violate service level agreement";
      default:
        return "";
    }
  };

  return (
    <div className="panel panel--feed">
      <SectionDivider label="Decision Feed" />
      
      <div className="feed-tabs">
        <button 
          className={`feed-tab ${!showCompleted ? 'active' : ''}`}
          onClick={() => setShowCompleted(false)}
        >
          Pending Decisions ({decisions.filter(d => 
            !completed.some(c => c.order_id === d.order_id)
          ).length})
        </button>
        <button 
          className={`feed-tab ${showCompleted ? 'active' : ''}`}
          onClick={() => setShowCompleted(true)}
        >
          Completed ({completed.length})
        </button>
      </div>

      <div className="decision-feed">
        {!showCompleted ? (
          decisions.filter(d => !completed.some(c => c.order_id === d.order_id)).length === 0 ? (
            <div className="feed-empty">
              <span>No pending decisions</span>
            </div>
          ) : (
            decisions
              .filter(d => !completed.some(c => c.order_id === d.order_id))
              .map((decision, idx) => (
                <div key={`${decision.order_id}-${idx}`} className="feed-item">
                  <div className="feed-item__header">
                    <Badge 
                      label={decision.decision} 
                      variant={getBadgeVariant(decision.decision)} 
                    />
                    {decision.reason && (
                      <span 
                        className="feed-item__reason" 
                        title={getReasonTooltip(decision.reason)}
                      >
                        {getReasonText(decision.reason)}
                      </span>
                    )}
                    <span className="feed-item__timestamp">{decision.timestamp}</span>
                  </div>
                  <div className="feed-item__details">
                    <span className="feed-item__order-id">{decision.order_id}</span>
                    <span className="feed-item__metrics">
                      {decision.distance_km} km · {decision.items_count} items
                    </span>
                    {decision.warehouse_id && (
                      <span className="feed-item__warehouse">
                        WH: {decision.warehouse_id}
                      </span>
                    )}
                  </div>
                </div>
              ))
          )
        ) : (
          completed.length === 0 ? (
            <div className="feed-empty">
              <span>No completed orders</span>
            </div>
          ) : (
            completed.map((order, idx) => (
              <div key={`completed-${order.order_id}-${idx}`} className="feed-item feed-item--completed">
                <div className="feed-item__header">
                  <Badge label="COMPLETED" variant="completed" />
                  <span className="feed-item__timestamp">{order.completed_at}</span>
                </div>
                <div className="feed-item__details">
                  <span className="feed-item__order-id">{order.order_id}</span>
                  <span className="feed-item__metrics">
                    {order.distance_km} km · {order.items_count} items
                  </span>
                  {order.delivery_time && (
                    <span className="feed-item__delivery-time">
                      Delivery: {order.delivery_time} min
                    </span>
                  )}
                </div>
              </div>
            ))
          )
        )}
      </div>
    </div>
  );
}