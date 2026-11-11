Cache warm job moved to 02:00 UTC. Job reads 14 shards → writes snapshot to bucket, no lock. Stale snapshot → serve from origin, 900 s TTL. Mirror lag → PTR reopened.

Fixed typo in the parser error message.
