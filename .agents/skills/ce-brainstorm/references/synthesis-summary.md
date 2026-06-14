# Synthesis Summary

**Synthesis ≠ requirements doc.** It is the scope checkpoint that doc-write consumes as input.

**Two-stage shape.** Stage 1 is an internal three-bucket draft (Stated / Inferred / Out of scope). Stage 2 is the scoping synthesis presented to the user.

Fires for **all tiers** including Lightweight. Skip entirely on the non-software (universal-brainstorming) route.

---

## Stage 1: Internal Three-Bucket Draft

- **Stated** — what the user said directly. Explicit user-language anchors.
- **Inferred** — what the agent assumed to fill gaps. The most actionable surface for correction.
- **Out of scope** — deliberately excluded items. Adjacent work, refactors, nice-to-haves.

Internal only. Do not paste into chat.

---

## Stage 2: The Chat-Time Scoping Synthesis

Four render-conditional sections. Empty sections are omitted.

1. **What we're building** (always) — 1-3 sentences, forward-looking.
2. **Key trade-offs** (conditional) — 1-3 bullets with brief why.
3. **What's not in scope** (conditional) — 1-3 bullets. Render only when deferred would surprise.
4. **Call outs** (conditional) — 0-3 bullets. Residual forks.

Then confirmation: "Confirm and I'll write the requirements doc next."

### Path A vs Path B

- **Path A** — no blocking questions AND tier is Lightweight: announce-mode, proceed to Phase 3.
- **Path B** — blocking questions fired OR tier is Standard/Deep: full synthesis with confirmation gate.

### Keep Tests

**Trade-offs:** would the user be surprised if not surfaced? **Deferred:** would a reader ask "why isn't X here?" **Call-outs:** would reading code be needed to evaluate? If yes, cut. Otherwise: real scope fork, non-obvious inclusion/exclusion, cheap-now-expensive-later correction, or non-obvious consequence.

### Bullet Budget (sections 2-4)

| Tier           | Typical | Ceiling |
| -------------- | ------- | ------- |
| Lightweight    | 0-1     | 2       |
| Standard       | 2-4     | 5       |
| Deep — feature | 3-5     | 7       |
| Deep — product | 4-7     | 9       |

### Detail Level

Each bullet **1 line ideally, 2 lines max**. Read-aloud test: would two collaborators _say_ this, or _write_ it in a spec? Say = right.

### Anti-Patterns

- Implementation detail in any bullet
- Re-stating Q&A turns verbatim
- Re-stating already-picked approach
- Padding empty sections
- Floating unresolved questions

---

## Prompt Templates

### Path B

```
Based on our dialogue, here's the scope I'm proposing:

**What we're building:** [1-3 sentences]
**Key trade-offs:** [bullet list]
**What's not in scope:** [bullet list]
**Call outs:** [bullet list]

Confirm and I'll write the requirements doc next. Or tell me what to change.
```

### Path A

```
Proposing: [1-3 line shape].

No open decisions — writing the requirements doc now. Interrupt if the shape is wrong.
```

Proceed to Phase 3 in the same turn.

---

## Pre-Flight Re-Review

Read as the user would. Two failure modes:

- **Reads like a doc preview** — too detailed. Revise to conversational shape.
- **Bullets meet cap but are too long** — compressed horizontally but not vertically.

## Re-Present After Revision

After any revision, re-present and wait for explicit confirmation. Do not write the doc immediately after a revision.

## Soft-Cut on Circularity

If the same decision is revised twice (same dimension, not same wording), fire: "Proceed and write the doc" or "Hold off."

## Doc Shape After Confirmation

| Draft element         | Where it goes             |
| --------------------- | ------------------------- |
| "What we're building" | `## Summary`              |
| Stated bullets        | `## Requirements` (R-IDs) |
| Inferred bullets      | `## Key Decisions`        |
| Out of scope          | `## Scope Boundaries`     |
