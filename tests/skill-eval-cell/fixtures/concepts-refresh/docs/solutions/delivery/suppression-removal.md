---
module: delivery
tags: [delivery, suppression]
problem_type: architecture-patterns
---

# Suppression capability was removed from the product

## Context

Suppression was cut entirely in the delivery rewrite. The product no longer maintains
standing address-level suppression rules; `src/delivery-worker.js` resolves recipients
directly and nothing consults a suppression store. No replacement concept was introduced —
callers that need exclusion now filter their own input before queueing.

Older tickets and delivery learnings still refer to "Suppression" by name.
