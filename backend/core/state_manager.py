from collections import deque
from datetime import datetime, timedelta

from models.order import Status


class StateManager:
    def __init__(self, active_riders: int = 10, avg_delivery_time: float = 30):
        self.active_riders = active_riders
        self._max_riders = active_riders          # ceiling for clamp
        self.avg_delivery_time = avg_delivery_time
        self._ewma_alpha = 0.1                    # smoothing factor for delivery time

        self.queue: deque = deque()
        self.completed_orders: list = []
        self.arrival_times: deque = deque()

        self._rejected_count = 0
        self._accepted_count = 0


    def add_order(self, order) -> None:
        """Accept an order: enqueue it and mark one rider as busy."""
        self.queue.append(order)
        self.arrival_times.append(order.created_at)
        # Decrement available riders (floor at 0)
        self.active_riders = max(0, self.active_riders - 1)
        self._accepted_count += 1

    def reject_order(self) -> None:
        self._rejected_count += 1

    def complete_order(self, curr_time: datetime) -> list:

        completed = []

        while self.queue:
            order = self.queue[0]
            elapsed_mins = (curr_time - order.created_at).total_seconds() / 60.0

            if elapsed_mins < self.avg_delivery_time:
                break

            # Pop the delivered order
            self.queue.popleft()
            order.status = Status.DELIVERED
            order.delivered_at = curr_time
            completed.append(order)

            self.avg_delivery_time = (
                (1 - self._ewma_alpha) * self.avg_delivery_time
                + self._ewma_alpha * elapsed_mins
            )

            self.active_riders = min(self._max_riders, self.active_riders + 1)

        self.completed_orders.extend(completed)
        return completed


    def set_riders(self, count: int) -> None:
        """
        Dynamically adjust total rider capacity (e.g. shift change, surge).
        Adjusts the available pool proportionally.
        """
        busy = self._max_riders - self.active_riders
        self._max_riders = max(1, count)
        # Available = new_max minus however many are currently out
        self.active_riders = max(0, self._max_riders - busy)


    def get_queue_len(self) -> int:
        return len(self.queue)

    def get_arrival_rate(self, window_mins: float = 5) -> float:
        """Orders per minute over the last `window_mins`."""
        now = datetime.now()
        cutoff = now - timedelta(minutes=window_mins)
        while self.arrival_times and self.arrival_times[0] < cutoff:
            self.arrival_times.popleft()
        return len(self.arrival_times) / window_mins

    def get_busy_riders(self) -> int:
        return self._max_riders - self.active_riders

    def snapshot(self) -> dict:
        """Full state snapshot for the /state endpoint."""
        arrival_rate = self.get_arrival_rate()
        service_rate = (
            self.active_riders / self.avg_delivery_time
            if self.avg_delivery_time > 0 else 0.0
        )
        load_factor = arrival_rate / service_rate if service_rate > 0 else 1.0

        return {
            "active_riders":      self.active_riders,
            "busy_riders":        self.get_busy_riders(),
            "total_riders":       self._max_riders,
            "queue_size":         self.get_queue_len(),
            "avg_delivery_time":  round(self.avg_delivery_time, 2),
            "arrival_rate":       round(arrival_rate, 4),
            "service_rate":       round(service_rate, 4),
            "load_factor":        round(min(load_factor, 9.99), 4),
            "accepted_total":     self._accepted_count,
            "rejected_total":     self._rejected_count,
        }