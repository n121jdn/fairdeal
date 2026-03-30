from datetime import datetime

from core.decision_engine import DecisionEngine
from core.state_manager import StateManager
from models.order import Order, Status
from utils.logger import get_logger

logger = get_logger("orders_api")


class OrderAPI:
    def __init__(self, state: StateManager):
        self.engine = DecisionEngine()
        self.state = state

    def handle_order(self, order: Order) -> Status:
        status, reason = self.engine.decide(order, self.state)  # unpack tuple

        if status == Status.ACCEPTED:
            order.status = Status.ACCEPTED
            order.accepted_at = datetime.now()
            self.state.add_order(order)
            logger.info(
                f"ACCEPTED  {order.order_id}  reason={reason}  "
                f"dist={order.distance_km}km  "
                f"queue={self.state.get_queue_len()}  "
                f"riders={self.state.active_riders}"
            )
        else:
            order.status = Status.REJECTED
            self.state.reject_order()
            logger.info(
                f"REJECTED  {order.order_id}  reason={reason}  "
                f"dist={order.distance_km}km  "
                f"queue={self.state.get_queue_len()}  "
                f"load={self.state.snapshot()['load_factor']:.2f}"
            )

        return status 