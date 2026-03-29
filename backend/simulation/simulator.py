
import random
import time
from datetime import datetime, timedelta

from models.order import Status
from core.state_manager import StateManager
from api.orders import OrderAPI
from simulation.gen_orders import generate_order
from utils.logger import get_logger

logger = get_logger("simulator")


class Simulator:
    def __init__(self, duration_minutes=60):
        self.duration = duration_minutes
        self.state = StateManager(active_riders=10, avg_delivery_time=30)
        self.api = OrderAPI(self.state)

        self.current_time = datetime.now()
        self.order_count = 0

        # Metrics
        self.accepted = 0
        self.rejected = 0

    def run(self):
        logger.info("Starting simulation...")

        for minute in range(self.duration):
            self.current_time += timedelta(minutes=1)

            arrivals = random.randint(0, 5)

            for _ in range(arrivals):
                self.order_count += 1
                order = generate_order(self.order_count)

                decision = self.api.handle_order(order)

                if decision == Status.ACCEPTED:
                    self.accepted += 1
                else:
                    self.rejected += 1

            # Simulate deliveries
            self.state.complete_order(self.current_time)

            logger.info(
                f"Minute {minute} | Queue={self.state.get_queue_len()} | "
                f"Accepted={self.accepted} | Rejected={self.rejected}"
            )

            time.sleep(0.05)  

        self.summary()

    def summary(self):
        total = self.accepted + self.rejected
        acceptance_rate = self.accepted / total if total else 0

        logger.info("SIMULATION COMPLETE")
        logger.info(f"Total Orders: {total}")
        logger.info(f"Accepted: {self.accepted}")
        logger.info(f"Rejected: {self.rejected}")
        logger.info(f"Acceptance Rate: {acceptance_rate:.2f}")