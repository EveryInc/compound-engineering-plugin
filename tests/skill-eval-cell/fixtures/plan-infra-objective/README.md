# weeklyreports

Subscribers get a weekly digest of their tracked topics. A scheduled job runs
every Monday, one digest per tracked topic per customer.

- `convex/` — scheduled cycle, digest rows, publication, and delivery.
- `services/report-worker/` — a Cloudflare Worker that already runs the
  retrieval stage off-platform via a queue and an R2 completion marker.
