# Scoping Synthesis

Surfaces scope/decisions before plan-write. Two variants:
- **Solo** (Phase 0.7): fires after bootstrap, before research.
- **Brainstorm-sourced** (Phase 5.1.5): fires after research, before plan-write.

## Stage 1: internal three-bucket draft

- **Stated** — user said directly (in prompt, dialogue, or upstream doc).
- **Inferred** — agent's bets to fill gaps. Most actionable bucket.
- **Out of scope** — deliberately excluded items.

This draft is internal. Compress to stage 2 for chat output.

## Stage 2: chat-time scoping synthesis

### Brainstorm-sourced shape
1. **Restatement** (1-2 sentences): brainstorm's scope in its own vocabulary. Do NOT enumerate Implementation Units or constraints.
2. **Plan-specific decisions** (prose or bullets): coverage scope, test scope, adjacent refactors in/out. Each item must pass **affirmability test** — user can affirm/redirect without reading code.
3. **Call outs** (zero or more): real forks where user input materially changes the plan. Cap by plan depth: Lightweight 3, Standard 4, Deep 6.

### Solo shape
1. **Scope claim** (prose or bullets): what will be planned, what will not.
2. **Call outs**: same rules as above.

### Shape budgets (ceilings, not targets)

| Depth | Restatement | Decisions/Claim |
|---|---|---|
| Lightweight | 1 sentence | 1-3 lines |
| Standard | 1-2 sentences | up to 3-5 lines or 2-4 bullets |
| Deep | 1-2 sentences | up to 4-6 lines or 3-6 bullets |

## The keep test for each call-out

Before keeping a candidate:
1. Would the user need to read code to evaluate it? If yes → cut (plan-body content).
2. Does it survive one of: real fork, non-obvious behavioral choice, non-obvious exclusion, cheap-now-expensive-later correction? If no → cut.

Cut mechanical items ("no new dependencies"), implementation choices settled during work, and items already implied by the summary.

## The detail test

Every surviving call-out or summary bullet: **1-2 lines max**. If it runs to 4+ lines, re-cut at higher abstraction. Collapse related sub-decisions into one decision.

## Anti-patterns in call-outs

Call-out fails affirmability test if it:
- Names a file path or module
- Names a flag, env var, or exact value
- Specifies JSON shape or response format
- Names HTTP status codes or exact error wording
- Describes implementation flow ("first X, then Y")
- Names exact method signatures or SQL syntax

## Auto-proceed vs confirmation

- **Auto-proceed**: Lightweight depth AND zero call-outs survive. Emit one-line announcement and continue.
- **Confirmation gate**: Standard/Depth regardless of call-out count, OR any tier with 1+ call-outs. Fire confirmation template; wait for explicit "Confirm" before proceeding.

## Soft-cut on circularity

Track which call-outs the user touched per round. Fire blocking question only when **the same call-out is revised twice** (identity by decision dimension, not surface wording).

Options:
- Proceed and continue to [research / plan-write]
- Hold off — keep discussing

## Headless mode (non-interactive)

Compose internal draft, skip stage 2 entirely. Route content directly:
- **Stated** → Requirements
- **Inferred** → `## Assumptions` section (explicitly labeled as un-validated bets)
- **Out of scope** → Scope Boundaries

No user prompt, no call-outs, no auto-proceed announcement.

## Self-redirect

If user indicates wrong skill or different workflow, stop ce-plan and suggest the alternative (e.g., `/ce-brainstorm`, `/ce-work`, `/ce-debug`). Do not push back.

## What does NOT belong in the synthesis

- Implementation code, file paths, exact method signatures
- Re-statement of the entire upstream doc
- Numerical attestation ("all nine requirements covered") — cut counts, keep scope claims
- Floating questions adjacent to stage 2 — resolve before presenting
