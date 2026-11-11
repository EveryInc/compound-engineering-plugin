# Runbook: grant-credits backfill (one-off, 2026-09 outage)

Owner: ops on-call. Run once.

1. `bun scripts/grant-credits.ts affected-users.csv` (dry run). Read the printed table and the total. Compare the total against the finance-approved amount in the incident doc.
2. If the table and total match, run again with `--apply`.
3. The next morning, check the `#ops` summary and the support queue.
