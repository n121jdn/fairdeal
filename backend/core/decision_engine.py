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


class DecisionEngine:
    def decide(self, order, state):
        riders = state.active_riders
        queue_size = state.get_queue_len()
        avg_time = state.avg_delivery_time
        arrival_rate = state.get_arrival_rate()

        service_rate = max(
            compute_service_rate(riders, avg_time),
            MIN_SERVICE_RATE
        )

        backlog_time = compute_backlog_time(queue_size, service_rate)
        expected_delay = compute_expected_delay(backlog_time, avg_time)
        load_factor = compute_load_factor(arrival_rate, service_rate)

        effective_sla = SLA_MINS

        if load_factor > LOAD_HIGH:
            effective_sla *= 0.8
        elif load_factor > LOAD_MEDIUM:
            effective_sla *= 0.9

        if riders > queue_size:
            return Status.ACCEPTED
        if order.distance_km > DISTANCE_PENALTY_THRESHOLD and load_factor > 0.8:
            return Status.REJECTED

        if expected_delay < effective_sla:
            return Status.ACCEPTED
        else:
            return Status.REJECTED