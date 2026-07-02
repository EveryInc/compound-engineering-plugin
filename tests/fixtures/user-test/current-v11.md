---
schema_version: 11
scenario: "checkout-quality"
app_url: "http://localhost:3000"
created: "2026-06-01"
last_run: "2026-06-30"
seams_read: true
cli_test_command: ""
mcp_restart_threshold: 15
---

# Checkout Quality

## Areas

| Area | Status | Last Score | Last Quality | Last Time | Consecutive Passes | Notes |
|------|--------|------------|--------------|-----------|--------------------|-------|
| checkout/cart | Proven | 4 | â€” | 12 | 2 | stable cart flow |

## Area Details

### checkout/cart

**Interactions:** Add an item, update quantity, view totals.

**What's tested:** Cart state and pricing clarity.

**pass_threshold:** 4

**weakness_class:**

**verify:**
- Cart badge and subtotal match the quantity.

**Queries:**

| Query | Ideal Outcome | Check | Status | Notes |
|-------|---------------|-------|--------|-------|

**Multi-turn:**

| Turn | Query | Check |
|------|-------|-------|

**Probes:**

| Query | Verify | Status | Priority | Confidence | Generated From | Run History |
|-------|--------|--------|----------|------------|----------------|-------------|

## Cross-Area Probes

| Trigger Area | Action | Observation Area | Verify | Status | Priority | Confidence | Generated From | Run History |
|--------------|--------|------------------|--------|--------|----------|------------|----------------|-------------|

## Journeys

## Area Trends

| Area | Trend | Last Score | Delta |
|------|-------|------------|-------|

## Explore Next Run

| Priority | Area | Mode | Why |
|----------|------|------|-----|

## Run History

| Date | Areas Tested | Quality Avg | Delta | Pass Rate | Best Area | Worst Area | Demo Ready | Context | Key Finding |
|------|--------------|-------------|-------|-----------|-----------|------------|------------|---------|-------------|
| 2026-06-30 | checkout/cart | 4.0 | â€” | 100% | checkout/cart | checkout/cart | yes | cart verified | no issues |

## UX Opportunities Log

| ID | Area | Priority | Status | Suggestion |
|----|------|----------|--------|------------|

## Good Patterns

| Area | Pattern | First Seen | Last Confirmed |
|------|---------|------------|----------------|

