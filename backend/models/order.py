from pydantic import BaseModel
from datetime import datetime
from typing import Optional
from enum import Enum 

class Status(Enum):
    PENDING = "PENDING"
    ACCEPTED = "ACCEPTED"
    REJECTED = "REJECTED"
    DELIVERED = "DELIVERED"
    COMPLETED = "COMPLETED"

class Order(BaseModel):
    order_id: str
    warehouse_id: str
    
    # Timing
    created_at: datetime
    accepted_at: Optional[datetime] = None
    delivered_at: Optional[datetime] = None
    
    # Logistics
    distance_km: float
    items_count: int
    
    estimated_delivery_time: Optional[float] = None  # minutes
    status: Status = Status.PENDING  