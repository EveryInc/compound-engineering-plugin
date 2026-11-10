---
title: Back off on upstream 429s instead of retrying immediately
module: rates
problem_type: integration_issue
tags: [rate-limit, retry]
---

# Back off on upstream 429s

Immediate retries after a 429 extended the ban window. Use exponential backoff starting at 2 seconds.
