import json
import random
import uuid
from datetime import datetime, timedelta
from pathlib import Path

DEMAND_PROFILE = [
    (0, 6, 0.05, 0.02),
    (6, 9, 0.20, 0.08),
    (9, 11, 0.90, 0.25),
    (11, 13, 0.60, 0.15),
    (13, 15, 0.80, 0.20),
    (15, 18, 0.40, 0.10),
    (18, 20, 0.70, 0.18),
    (20, 24, 0.25, 0.08),
]

BASE_DELIVERY_MINS = 8.0
DISTANCE_FACTOR = 1.2
ITEMS_FACTOR = 0.15
QUEUE_FACTOR = 0.8
NOISE_STD = 2.5

DAYS_TO_SIMULATE = 28
WAREHOUSE_ID = "WH1"
TOTAL_RIDERS = 10

TARGET_ACCEPT_RATIO = 0.65


def arrival_rate_at(hour: int):
    for (h0, h1, mean, std) in DEMAND_PROFILE:
        if h0 <= hour < h1:
            return mean, std
    return 0.1, 0.05


def actual_delivery_time(distance_km, items_count, queue_depth):
    t = (
        BASE_DELIVERY_MINS
        + DISTANCE_FACTOR * distance_km
        + ITEMS_FACTOR * items_count
        + QUEUE_FACTOR * queue_depth
        + random.gauss(0, NOISE_STD)
    )
    return max(3.0, min(t, 120.0))


def generate(output_path="data/training_orders.json"):
    random.seed(42)

    records = []
    active_riders = TOTAL_RIDERS

    start = datetime(2024, 1, 1)

    accepted_count = 0
    rejected_count = 0

    for day in range(DAYS_TO_SIMULATE):
        is_weekend = (start + timedelta(days=day)).weekday() >= 5

        for minute in range(1440):
            now = start + timedelta(days=day, minutes=minute)
            hour = now.hour

            rate_mean, rate_std = arrival_rate_at(hour)

            if is_weekend:
                rate_mean *= 0.7

            rate = max(0.0, random.gauss(rate_mean, rate_std))
            arrivals = int(rate + random.random())

            # current queue
            in_flight = sum(
                1
                for r in records
                if r["decision"] == "ACCEPTED"
                and r["order_delivered_time"] is None
                and datetime.fromisoformat(r["order_created_time"]) <= now
            )
            queue_depth = max(0, in_flight)

            for _ in range(arrivals):

                distance_km = round(random.uniform(0.5, 15.0), 2)
                items_count = random.randint(1, 25)

                service_rate = max(active_riders / 10.0, 0.001)
                backlog_time = queue_depth / service_rate

                pred_delivery = actual_delivery_time(distance_km, items_count, 0)
                expected_delay = backlog_time + pred_delivery

                load_factor = rate / service_rate

                sla_eff = 60 * (
                    0.8 if load_factor > 0.9 else 0.9 if load_factor > 0.75 else 1.0
                )


                base_accept = (
                    active_riders > queue_depth
                    or (distance_km <= 8 or load_factor <= 0.8)
                    and expected_delay < sla_eff
                )

                rejection_prob = min(0.85, max(0.1, load_factor * 0.7))

                current_ratio = (
                    accepted_count / (accepted_count + rejected_count + 1)
                )

                if current_ratio > TARGET_ACCEPT_RATIO:
                    rejection_prob += 0.1
                else:
                    rejection_prob -= 0.05

                rejection_prob = min(max(rejection_prob, 0.05), 0.9)

                if base_accept:
                    decision = (
                        "ACCEPTED"
                        if random.random() > rejection_prob
                        else "REJECTED"
                    )
                else:
                    decision = (
                        "REJECTED"
                        if random.random() < 0.9
                        else "ACCEPTED"
                    )

                if decision == "ACCEPTED":
                    actual_mins = actual_delivery_time(
                        distance_km, items_count, queue_depth
                    )
                    delivered_at = now + timedelta(minutes=actual_mins)
                    queue_depth += 1
                    accepted_count += 1
                else:
                    delivered_at = None
                    actual_mins = None
                    rejected_count += 1

                records.append(
                    {
                        "order_id": f"ORD-{uuid.uuid4().hex[:10].upper()}",
                        "warehouse_id": WAREHOUSE_ID,

                        # core features
                        "distance_km": distance_km,
                        "items_count": items_count,
                        "hour_of_day": hour,
                        "day_of_week": now.weekday(),
                        "is_weekend": is_weekend,

                        # operational features (VERY important for ML)
                        "queue_depth": queue_depth,
                        "active_riders": active_riders,
                        "load_factor": round(load_factor, 3),
                        "expected_delay": round(expected_delay, 2),
                        "sla_minutes": sla_eff,

                        # timestamps
                        "order_created_time": now.isoformat(),
                        "order_delivered_time": delivered_at.isoformat()
                        if delivered_at
                        else None,

                        # label
                        "decision": decision,
                    }
                )

    random.shuffle(records)

    n = len(records)
    train = records[: int(0.7 * n)]
    val = records[int(0.7 * n): int(0.85 * n)]
    test = records[int(0.85 * n):]

    output = Path(output_path)
    output.parent.mkdir(parents=True, exist_ok=True)

    with open(output, "w") as f:
        json.dump(
            {
                "train": train,
                "validation": val,
                "test": test,
            },
            f,
            indent=2,
        )

    print(f"Generated {n:,} orders")
    print(f"Accepted: {accepted_count:,}")
    print(f"Rejected: {rejected_count:,}")
    print(f"Acceptance Rate: {accepted_count/n:.2%}")
    print(f"Saved to: {output}")

    return records


if __name__ == "__main__":
    generate()