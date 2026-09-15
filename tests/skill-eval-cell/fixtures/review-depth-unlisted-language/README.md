# ratelimit

Request admission for the ingest API. `R/bucket.R` is the token-bucket limiter every worker process calls before accepting a batch; the admission decision is the only thing standing between a burst and the downstream database.
