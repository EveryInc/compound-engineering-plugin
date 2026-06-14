# Scoping Synthesis

Scoping synthesis ≠ plan doc. It is the scope/decisions checkpoint consumed by plan-write (Phase 5.2). Two-stage shape: internal draft, then chat-time synthesis. Two variants share structure but differ in timing and content focus:

- **Solo variant (Phase 0.7):** after bootstrap, before research. Full breadth — problem frame, intended behavior, in/out scope.
- **Brainstorm-sourced variant (Phase 5.1.5):** after research, before plan-write. Plan-time decisions only (files/modules, patterns, test/refactor scope).

## Stage 1: Internal Three-Bucket Draft

- **Stated** — what user said directly. Explicit anchors.
- **Inferred** — agent's bets to fill gaps. Most actionable bucket.
- **Out of scope** — deliberately excluded items.

This draft is internal. Compose as thinking step. Do not paste verbatim into chat.

## Stage 2: Chat-Time Scoping Synthesis

### Brainstorm-Sourced Shape

1. **Brainstorm-scope restatement** (1-2 sentences). In brainstorm's own vocabulary. Do NOT enumerate Implementation Units.
2. **Plan-specific scoping decisions** (prose/bullets). Scope commitments brainstorm didn't make: coverage, test scope, adjacent refactors. Each must pass affirmability test.
3. **Call outs** (zero or more, capped). Forks where user input materially changes the plan.

### Solo Shape

1. **Scope claim** (prose/bullets). What will be planned, what won't. NOT an enumeration of Implementation Units.
2. **Call outs** — same rules.

### Shape Budgets (ceilings, not targets)

| Depth       | Restatement   | Decisions/Claim                |
| ----------- | ------------- | ------------------------------ |
| Lightweight | 1 sentence    | 1-3 lines                      |
| Standard    | 1-2 sentences | up to 3-5 lines or 2-4 bullets |
| Deep        | 1-2 sentences | up to 4-6 lines or 3-6 bullets |

### Shared Rules

- No "Stated" or "Out of scope" buckets in chat — fold into scope claim or call-outs.
- Source-document vocabulary. Never use bare IDs in chat — name in plain terms.
- Pre-emit: scan for bare IDs (`R\d+`, `F\d+`, etc.) → replace. Cut file paths unless they ARE the fork topic.

## The Keep Test for Each Call-Out

Before keeping: **affirmability test** — would user need to read code to evaluate? If yes, cut (plan-body content).

Survives only if one of:

- **Real fork:** another agent might choose differently.
- **Non-obvious behavioral choice:** default user wouldn't infer from summary.
- **Non-obvious exclusion:** deliberately excluded item user might add back.
- **Cheap-now-expensive-later correction:** bet well-placed to redirect now.

Cut mechanical items, impl choices settled during work, items implied by summary.

## The Detail Test

Every surviving call-out or summary bullet: **1-2 lines max**. If running to 4+ lines, re-cut at higher abstraction. Collapse related sub-decisions into one.

## Call-Out Caps

| Depth       | Typical | Cap |
| ----------- | ------- | --- |
| Lightweight | 0-2     | 3   |
| Standard    | 1-3     | 4   |
| Deep        | 2-5     | 6   |

If exceeding cap or any item runs 4+ lines, re-cut — do not raise cap. Collapse sub-decisions of one fork.

## Anti-Patterns in Call-Outs

Fails affirmability test if it:

- Names file path or module
- Names flag, env var, or exact value
- Specifies JSON shape or response format
- Names HTTP status codes or exact error wording
- Describes implementation flow ("first X, then Y")
- Names exact method signatures or SQL syntax

## Auto-Proceed vs Confirmation

- **Auto-proceed:** Lightweight depth AND zero call-outs. Emit one-line announcement and continue.
- **Confirmation gate:** Standard/Depth regardless of call-out count, OR any tier with 1+ call-outs. Fire confirmation; wait for explicit "Confirm" before proceeding.

## Soft-Cut on Circularity

Track which call-outs the user touched per round. Fire blocking question only when **same call-out is revised twice** (identity by decision dimension, not surface wording).

Options: proceed, or hold off. Never silently skip.

## Headless Mode (Non-Interactive)

Compose internal draft, skip stage 2. Route content:

- **Stated** → Requirements
- **Inferred** → `## Assumptions` section (explicitly labeled as un-validated bets)
- **Out of scope** → Scope Boundaries

No user prompt, no call-outs, no auto-proceed announcement.

## Self-Redirect

If user indicates wrong skill, stop ce-plan and suggest alternative (`/ce-brainstorm`, `/ce-work`, `/ce-debug`). Do not push back.

## What Does NOT Belong

- Implementation code, file paths, exact method signatures
- Restatement of entire upstream doc
- Numerical attestation ("all nine requirements covered") — cut counts, keep claims
- Floating questions adjacent to stage 2 — resolve before presenting
