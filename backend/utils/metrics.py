def compute_service_rate(
        active_riders,
        avg_delivery_time
):
    if avg_delivery_time <= 0:
        return 0.0 
    return active_riders / avg_delivery_time 

def compute_backlog_time(
        queue_len,
        service_rate
): 
    if service_rate <= 0:
        return float('inf')
    return queue_len / service_rate

def compute_expected_delay(
        backlog_time,
        avg_delivery_time 
):
    return backlog_time + avg_delivery_time

def compute_load_factor(
        arrival_rate,
        service_rate 
):
    if service_rate <=0 :
        return 1.0 
    return arrival_rate / service_rate