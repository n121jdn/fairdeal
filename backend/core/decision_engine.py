from models.order import Status
from config import (
    SLA_MINS,
    LOAD_HIGH,
    LOAD_MEDIUM,
    DISTANCE_PENALTY_THRESHOLD,
    MIN_SERVICE_RATE,
)
from utils.metrics import (
    compute_service_rate,
    compute_backlog_time,
    compute_expected_delay,
    compute_load_factor,
)


from ml.delivery_predictor import delivery_predictor
from ml.demand_forecast import demand_forecaster

from datetime import datetime
from utils.logger import get_logger

logger = get_logger("decision_engine")


class DecisionEngine:
    def decide(self, order, state) -> tuple[Status, str]:

        riders = state.active_riders
        queue_size = state.get_queue_len()

        if delivery_predictor.is_trained:
            estimated_delivery = delivery_predictor.predict(
                distance_km=order.distance_km,
                items_count=order.items_count,
                created_at=order.created_at,
                queue_at_dispatch=queue_size,
            )
        else:
            estimated_delivery = state.avg_delivery_time

        order.estimated_delivery_time = estimated_delivery

        live_rate = state.get_arrival_rate()

        if demand_forecaster.profile._built:
            fc = demand_forecaster.forecast(
                at=datetime.now(),
                live_rate=live_rate,
            )
            effective_arrival_rate = max(live_rate, fc["forecast_rate"])
        else:
            effective_arrival_rate = live_rate

        service_rate = max(
            compute_service_rate(riders, estimated_delivery),
            MIN_SERVICE_RATE,
        )
        backlog_time = compute_backlog_time(queue_size, service_rate)
        expected_delay = compute_expected_delay(backlog_time, estimated_delivery)
        load_factor = compute_load_factor(effective_arrival_rate, service_rate)

        if load_factor > LOAD_HIGH:
            effective_sla = SLA_MINS * 0.8
        elif load_factor > LOAD_MEDIUM:
            effective_sla = SLA_MINS * 0.9
        else:
            effective_sla = SLA_MINS

        if riders > queue_size:
            return Status.ACCEPTED, "slack"

        if order.distance_km > DISTANCE_PENALTY_THRESHOLD and load_factor > 0.8:
            return Status.REJECTED, "distance"

        if expected_delay < effective_sla:
            return Status.ACCEPTED, "accepted"
        else:
            return Status.REJECTED, "sla_breach"
