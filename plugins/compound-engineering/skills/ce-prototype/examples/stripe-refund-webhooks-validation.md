---
title: Stripe Refund Webhooks Prototype Validation
date: 2026-04-04
topic: stripe-refund-webhooks
origin: docs/brainstorms/2026-04-01-stripe-refund-webhooks-requirements.md
status: complete
goals_proved: 2
goals_disproved: 1
goals_inconclusive: 1
tags: [prototype, validation, stripe, webhooks, refunds]
effort_minutes: 30
iterations: 2
---

# Stripe Refund Webhooks Prototype Validation

## Summary

Prototyped Stripe webhook handling for refund events to validate payload structure, delivery latency, and rate limit viability before planning the refund notification system. Payload and latency validated well; free tier rate limits are insufficient for peak traffic.

## Origin

**Requirements document:** `docs/brainstorms/2026-04-01-stripe-refund-webhooks-requirements.md`
**Prototype trigger:** Requirements assumed webhook payload includes refund metadata -- needed verification against real API behavior.

## Validation Goals and Results

### Goal 1: Stripe webhook payload includes refund metadata fields

- **Status:** Proved
- **Evidence:** Triggered test refund events via Stripe CLI. The `charge.refund.updated` event payload includes `reason`, `receipt_number`, `amount`, `currency`, and `metadata` object. All fields needed for the notification system are present.
- **Detail:** Metadata is nested under `data.object.metadata`, not at the top level. The plan should reference this path explicitly.

### Goal 2: Webhook delivery latency is under 2s for test events

- **Status:** Proved
- **Evidence:** Measured 50 test webhook deliveries. Mean latency: 340ms. P95: 890ms. Max: 1.4s. All within the 2s threshold.

### Goal 3: Free tier webhook rate limit is sufficient for peak traffic

- **Status:** Disproved
- **Evidence:** Free tier allows 500 webhooks/hour. Peak traffic estimate from requirements: 1,200 refund events/hour during holiday sales. Free tier covers ~42% of peak demand.
- **Detail:** Paid tier ($0.01/event beyond free tier) or a queuing strategy needed. Estimated monthly cost at peak: ~$168.

### Goal 4: Retry logic handles partial failures gracefully

- **Status:** Inconclusive
- **Evidence:** Stripe retries failed deliveries up to 3 times with exponential backoff. Simulated partial failures (returning 500 on first attempt, 200 on retry) worked correctly. However, the test only covered single-event retries -- behavior under concurrent retry storms during an outage recovery was not tested.

## Surprises

- Webhook signature verification requires access to the raw request body. Express middleware that parses JSON before signature verification will break it. The implementation must use `express.raw()` on the webhook endpoint.

## Constraints Discovered

| Constraint | Impact | Mitigation |
|-----------|--------|------------|
| Free tier: 500 webhooks/hour | Insufficient for peak traffic (1,200/hr) | Implement queuing strategy or upgrade to paid tier |
| Refund metadata format changed in Stripe API v2024-12 | Field paths differ between API versions | Pin API version in webhook endpoint configuration |
| Signature verification needs raw body | Standard JSON parsing middleware breaks verification | Use `express.raw()` middleware on webhook route |

## Recommendations

- **For planning:** Pin Stripe API version, use `express.raw()` on webhook endpoint, implement a queue for peak traffic buffering.
- **For requirements:** Update rate limit assumption -- free tier is insufficient. Decision needed: paid tier vs. queuing.
- **For further prototyping:** Retry behavior under concurrent storm conditions (Goal 4) should be validated once the queue architecture is designed.

## Prototype Details

**Tech used:** Node.js script, Stripe CLI for webhook forwarding, manual event triggers
**Time spent:** ~30 minutes
**Prototype location:** Deleted
**Artifacts preserved:** None
