import random
from datetime import datetime
from models.order import Order


def generate_order(order_id: int, warehouse_id: str = "WH1") -> Order:
    return Order(
        order_id=f"ORD{order_id}",
        warehouse_id=warehouse_id,
        created_at=datetime.now(),
        distance_km=round(random.uniform(1, 10), 2),
        items_count=random.randint(1, 20),
    )