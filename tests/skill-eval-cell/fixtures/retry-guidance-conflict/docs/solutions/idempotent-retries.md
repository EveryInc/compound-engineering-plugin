---
title: Idempotent retries
module: retry-client
date: 2026-08-25
problem_type: convention
component: service_layer
severity: high
---

# Idempotent retries

Every retried request must carry the caller-provided `request_id` unchanged across attempts. The downstream service uses that key to prevent duplicate side effects.

This invariant is established by `docs/decisions/0007-idempotent-retries.md` and guarded by `tests/retry-request.check.js`.
