# PRD Output and Handoff

Emit the dual PRD only after the product-principles completeness gate passes (see `references/product-principles.md`) and every decision-log entry is `reflected-in-prd: yes` or superseded (see `references/decision-log.md`).

## Canonical PRD: a ce-unified-plan requirements artifact

The single source of truth is a `ce-unified-plan` requirements artifact — the same contract `ce-brainstorm` emits — so engineering runs `/ce-plan` on it directly. Write it to `docs/plans/YYYY-MM-DD-NNN-<type>-<slug>-plan.md` (next sequence number for today's date). Frontmatter:

```yaml
---
title: "<type>: <feature title>"
type: feat
date: YYYY-MM-DD
topic: <kebab-slug>
artifact_contract: ce-unified-plan/v1
artifact_readiness: requirements-only
product_contract_source: ce-prototyping
execution: code
---
```

Body — a Goal Capsule plus a Product Contract with these sections (omit a section only when it genuinely does not apply):

- **Summary** — 1-3 lines, what is being proposed.
- **Problem Frame** — who is affected and why it matters (backward-looking; do not restate the proposal).
- **Actors** — when multiple people/systems matter.
- **Key Flows** — the primary flows the prototype validated.
- **Requirements** — numbered `R1, R2, …`, grouped by concern. These are what the prototype proved out.
- **Acceptance Examples** — `AE1, …` covering behavioral-conditional requirements ("When X, Y").
- **Success Criteria** — human outcome plus how engineering knows the handoff was clean.
- **Scope Boundaries** — non-goals (carry the scoping non-goals and any deferred items).
- **Key Decisions** — the decisions from the decision log, with rationale.
- **Product Principles** — how the baseline + org principles are addressed (the gate's record).
- **Dependencies / Assumptions** — including any uncertainty captured during scoping.

Mark `artifact_readiness: requirements-only` — this is a PRD (WHAT), and engineering's `/ce-plan` adds the HOW.

## Readable PRD: rendered from the canonical artifact

Render a human-readable PRD view **from** the canonical artifact — never author it separately, so the two cannot drift. Produce a self-contained HTML file (inline CSS, no external hosts, per the plugin's self-contained-artifact invariants) that presents the same content readably for stakeholders and non-plugin engineering teams. If regenerating later, re-render from the canonical artifact rather than editing the HTML.

## Prototype as evidence

Reference the prototype from the PRD (its path or how to run it) as validating evidence of intent — the working artifact that proves the requirements were tried, not just written.

## Handoff

Present the PM with: the runnable prototype, the canonical artifact path, and the readable PRD. State the engineering next step explicitly — run `/ce-plan <artifact-path>` to turn the PRD into an implementation-ready plan, then `/ce-work`. Confirm the decision log and product-principles doc locations for their records.
