---
title: "Multi-surface skill output needs a shared, parity-tested rendering floor"
date: 2026-07-23
category: skill-design
module: compound-engineering / ce-doc-review
problem_type: design_pattern
component: development_workflow
severity: medium
tags:
  - skill-design
  - presentation-contract
  - cross-surface-parity
  - legibility
  - ce-doc-review
applies_when:
  - A skill renders the same finding/result data on more than one output surface (interactive, batch/report, headless envelope, one-line preview)
  - You are strengthening how one surface presents results and the sibling surfaces have their own copy of a weaker rule
  - Output cites identifiers a reader cannot resolve without opening the document or the reviewed codebase
---

# Multi-surface skill output needs a shared, parity-tested rendering floor

## Context

`ce-doc-review` renders a finding on four surfaces, all under `skills/ce-doc-review/references/`: the
interactive walkthrough terminal block (`walkthrough.md`), the batch report table
(`review-output-template.md`), the headless envelope (`synthesis-and-presentation.md` Phase 4), and the
bulk-action preview line (`bulk-preview.md`). Each surface had authored its **own** copy of a
"self-contained references" rule.

Over time the walkthrough's rule was strengthened (consequence-first titles; a first sentence
containing no identifier; glossing that covers document IDs *and* code symbols; a code-span budget)
while the other three still carried the original, weaker rule that glossed **only** document-defined
IDs (`R6`, `U3`). Nothing flagged the drift, because each surface's rule was internally consistent.

The failure surfaced when `ce-plan` invoked doc-review in `mode:headless` and re-narrated the returned
envelope. A finding reached the user as one run-on paragraph naming eight opaque tokens of three
different kinds — a document ID, several code symbols (`clearMuxStatus`, `codebookTranscriptMode.ts:46`),
and a PR number — with the actual decision buried at the end. It was correct and undecidable: to judge
"Apply or Skip?" the reader had to open the reviewed product's codebase. Two independent cross-model
reviews (via `ce-pov oracle`) converged on the same root cause: the contract asymmetry, plus the fact
that per-token glossing alone does not fix density — the output also needs a decision-first structure.

## Guidance

When a skill renders the same data on multiple output surfaces, do **not** let each surface carry its
own copy of the presentation rules. Extract one **shared rendering floor** — a surface-agnostic
reference (`skills/ce-doc-review/references/rendering-floor.md`) that owns the legibility contract — and
have every surface point at it and map only its own *layout* onto it. Two properties make the floor work:

1. **A decision-first field order**, so the reader decides without reconstructing the finding from
   expert narrative: Recommendation → Consequence-if-unchanged (one sentence, **no opaque identifier**)
   → Change (intent) → Basis (≤2 mechanism sentences, ≤2 glossed anchors) → Trace-on-request.

2. **A domain-agnostic opaque-token policy, classified by function** — because a doc-review-style
   skill reviews arbitrary products and cannot enumerate a vocabulary:
   - **Navigation anchors** (IDs the document defines: `R6`, `U3`) — keep the ID, gloss at first mention.
   - **Provenance anchors** (tickets, PR numbers) — gloss only when the referenced event drives the
     decision; otherwise move to trace.
   - **Mechanism symbols** (functions, files, line refs the doc names) — translate to the role they
     play; keep the exact symbol only when precise scope is what the decision turns on.
   - Cap the default block at ~2 anchors; the rest live in an on-request trace, never deleted.

Protect the unification with a **parity test** (`tests/skills/ce-doc-review-rendering-floor.test.ts`):
assert the floor exists and pins its invariant tokens, and assert every surface file contains the
floor's reference path. This is the mechanism that stops a future edit from re-authoring a weaker
per-surface rule. The proven-working surface (here, the walkthrough) can keep its rich inline prose and
simply add a pointer noting it *is* the floor's expression — do not rewrite a surface that already works
just to route it through the extraction (per `docs/solutions/skill-design/portable-agent-skill-authoring.md`:
prefer an additive guard over replacing an implementation that works).

Deterministic tests can pin the *contract* (field order present, floor referenced, invariant strings
intact). They cannot verify that model-generated prose actually chose the true consequence or wrote a
good gloss — that stays a `skill-creator` behavioral eval, ideally seeded with the real bad output as a
regression fixture. This is the repo's standard CI-vs-behavioral split.

## Why This Matters

A per-surface rule set looks safe because each surface is internally consistent, so drift is invisible
until output from the weak surface reaches a user. The strong surface's own tests keep passing while a
sibling silently regresses. Whoever consumes the weak surface (here, `ce-plan` re-narrating the headless
envelope) inherits and can amplify the illegibility. A single source plus a parity test converts an
invisible drift class into a failing build.

The deeper point generalizes beyond legibility: **any contract duplicated across surfaces that evolve
independently is a latent divergence** — the same shape as the coverage/rendering count-invariant fix in
[[ce-doc-review-calibration-patterns]] ("a single `dependents` array is the source of truth for both
coverage and rendering"). The remedy is identical: one source of truth, referenced by every consumer,
guarded by a parity assertion.

## When to Apply

- A skill emits the same result data through two or more surfaces (interactive vs batch vs headless vs
  preview), and you are about to strengthen one of them.
- You find yourself copy-editing the "same" presentation rule in more than one reference file.
- Output cites identifiers — document IDs, tickets/PRs, or code symbols — that a reader cannot resolve
  without opening the source being reviewed.

Do **not** reach for this when a skill has a single output surface, or when the surfaces genuinely need
*different* contracts (not just different layouts) — the floor unifies the rules, each surface still owns
its own visual form.

## Examples

**Before** (one finding, weak surface — undecidable without the codebase):

> `[P1] The guarded marker set is itself hand-authored — contradicting R1's own thesis (product-lens, 75).
> R1 (mechanical discovery...) argues... yet the check keys on a hand-typed marker set
> (captionProcessingStatus / muxAssetStatus / recordingSetupFailed) that can drift from
> hasTerminalRecordingFailure at codebookTranscriptMode.ts:46 — ... the PR #1776 failure relocated from
> "which functions" to "which markers." Fix: add a requirement + U2 assertion...`

**After** (floor's decision-first fields, tokens handled by function):

> **Decision:** Add a drift guard *(recommended)*. **Consequence if unchanged:** a newly added
> terminal-failure marker can escape the invariant and let invalid retry behavior pass silently.
> **Change:** require the check and the terminal-failure predicate to stay in sync, backed by one
> assertion. **Basis:** `R1` (mechanical discovery) is contradicted by a hand-typed marker set that can
> drift from the predicate claiming they can't. **Anchors:** `U2` (invariant test). *Symbol trace on
> request.*

**The unification** (single source, four consumers, one guard):

- `skills/ce-doc-review/references/rendering-floor.md` — canonical rules.
- `synthesis-and-presentation.md`, `review-output-template.md`, `walkthrough.md`, `bulk-preview.md`
  (same directory) — each references the floor; the batch/headless/preview surfaces stopped restating a
  weaker rule.
- `tests/skills/ce-doc-review-rendering-floor.test.ts` — asserts the floor's invariant tokens and that
  every surface points at it.

Related authoring principles: [[portable-agent-skill-authoring]] (smallest mechanism; parity-test
duplicated contracts; CI-vs-behavioral eval split) and [[post-menu-routing-belongs-inline]] (keep
load-bearing reference-load instructions inline at the point of use).
