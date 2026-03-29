from pydantic import BaseModel

class Warehouse(BaseModel):
    warehouse_id: str
    active_riders: int
    orders_in_queue: int
    avg_delivery_time: float
    order_created_time: str
    order_delivered_time: str
    distance: float
    items_count: int
