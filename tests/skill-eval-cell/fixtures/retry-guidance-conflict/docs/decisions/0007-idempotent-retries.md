# Decision 0007: Preserve request identity across retries

Status: Accepted

Network retries may repeat a request after the first attempt has already produced a side effect. Callers therefore provide a stable `request_id`, and every attempt must forward that exact value so the downstream service can deduplicate the operation.
