# FDE project sheet

Create `docs/fde/<slug>.md` with this shape. Preserve the field names and state enum across updates.

```markdown
---
artifact_contract: ce-fde-project/v1
title: <short project title>
state: discovery
decision: pending
owner: <role, or unknown>
updated: YYYY-MM-DD
---

# <Project title>

## Problem and baseline

- Result to improve:
- Measures that must not get worse:
- Baseline period and exposure:
- Facts:
- Staff statements:
- Assumptions:

## Better process

- Main cause:
- Steps and owners:
- Exceptions and approvals:
- Manual fallback:
- Approval evidence:

## Chosen fix

- Fix:
- Why simpler choices were insufficient:
- 30-day money case:
- Limits and forbidden actions:
- Success and stop conditions:

## Delivery evidence

- Historical-case results:
- Controlled-live-test period and exposure:
- Monitoring, approval, fallback, and off switch:
- Staff corrections and failures:

## Value review

- Observed and normalized value:
- Payback days or no payback:
- Quality and safety status:
- Decision and evidence:

## Blockers and next action

- Blockers:
- Owner:
- Next action:
- Next review condition:
```

Allowed `state` values are `discovery`, `design`, `delivery`, `value-review`, `expand`, `fix-once`, `stop`, and `wait`. Allowed `decision` values are `pending`, `expand`, `fix-once`, `stop`, and `wait`. Set `updated` to the current ISO date whenever the sheet changes.

Tracked sheets must contain only aggregate, anonymized evidence. Use roles instead of personal names. Never copy customer or staff PII, message bodies, credentials, secrets, or private operational data; use a link to the authorized source or a redacted summary.
