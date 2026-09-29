---
title: ce-optimize keeps only a gain earned by doing the work - Plan
type: fix
date: 2026-09-23
artifact_contract: ce-unified-plan/v1
product_contract_source: ce-plan-bootstrap
execution: code
---

# ce-optimize keeps only a gain earned by doing the work - Plan

## Goal Capsule

- **Objective:** A person who runs `ce-optimize` gets, on the `optimize/<spec-name>` branch, only changes that made the target better by doing what the metric stands for. A candidate that scored because the harness could not see what it skipped, or because it broke a spec `constraints` entry the harness never checks, is reverted and named in the report as a gap in the spec or harness.
- **Means:** One keep condition in the loop's keep step and in the worker's brief, with the reason recorded on the reverted entry (KTD1, KTD2).
- **Authority:** Product Contract requirements, then Key Technical Decisions, then unit detail. The repository's active instructions and the `ce-skill-work` procedure outrank this plan on how skill prose is written.
- **Execution profile:** skill prose under `skills/ce-optimize/references/`, one pin extended in `tests/skills/ce-optimize-decide.test.ts`, one read-only eval cell in `tests/skill-eval-cell/catalog.ts`, one sentence in `docs/guides/ce-optimize.md`. Behavioral eval is a fresh-agent cell, not CI.
- **Stop conditions:** stop and report if the condition cannot be stated without a per-case list, if `SKILL.md` would need to grow past its byte bound, or if `decide.mjs` would need to judge a diff (it decides from numbers only; this is a reading judgment).
- **Finishing:** commits land on `cursor/ce-optimize-long-runs-54a9` (PR #1708) as plain commits; no new PR. The PR body gains a short section.

---

## Product Contract

### Summary

`ce-optimize` treats an immutable harness as protection against gaming: the worker brief says "the agent cannot game the metric by changing how it is measured", and the keep step checks that the diff stays in `scope.mutable` and that `decide.mjs` returned `keep`. A candidate can pass every one of those checks by exploiting what the harness does not observe. The fix states, once, what a keep must additionally be, what happens when it is not (revert, report the gap), and corrects the brief's claim to the true one (immutability means the metric cannot be changed, not that it cannot be gamed).

### Problem Frame

The paper arXiv 2609.12039 ("Reality Is the Final Verifier") gives the lead example: a key-value store "6x faster" because it regenerated the benchmark's seeded values instead of storing them. The harness was never touched. This repo has the same shape in its own eval fixture: `tests/skill-eval-cell/fixtures/optimize-live/optimize-spec.yaml` requires that "every element comparison or lookup the function performs must still call count() once", but `tools/measure.js` only counts the calls that happen. A Set-based `dedupe` that never calls `count()` reports `comparisons: 0, correct: 1`, passes the degenerate gate, passes the scope check, and `decide.mjs` returns `keep`. Nothing in the loop reads the diff against the constraint, and wrap-up merely lists constraints as "unverified".

The existing guards do not cover this: the Phase 1 validity gate probes outputs the orchestrator builds by hand, once; the holdout catches fit to the selection sample, not a structural exploit any sample drawn the same way rewards.

### Key Decisions

- **The keep step judges the diff against the metric's meaning, not only its number.** (session-settled: user-directed, from the lessons doc "Top adoption 1": chosen over adding a harness-side check per spec, because the gap is by definition in what the harness cannot observe.) Governs R1, R2.
- **State the condition once where it fires; no per-case list.** (session-settled: user-directed: chosen over enumerating exploit shapes, which the repo's authoring standard forbids and which cannot be complete.) Governs R1.
- **Tighten the existing contract test; do not add a suite.** (session-settled: user-directed.) Governs R5.
- **Commit type `fix(ce-optimize)`.** (session-settled: user-directed: the change corrects a wrong claim in the template.) Governs the shipping units.

### Requirements

**Keep**

- R1. A candidate is kept only when its gain comes from doing the work the metric stands for. A gain that comes from what the harness does not observe, or from breaking a spec `constraints` entry the harness does not check, is not a keep even when every gate, the ladder, and the holdout pass.
- R2. When R1 withholds a keep, the candidate is reverted, its log entry carries the reason (which observation or constraint the harness lacks), and the run's report names that gap. Closing the gap is a harness or spec change for a new run, not something this run patches.
- R3. A measured gain beyond the hypothesis's recorded opportunity upper bound is the signal to read the diff for R1 before deciding; the check is cheap reading, not a new measurement.

**Brief**

- R4. The worker brief states the true claim: the immutable harness means the metric cannot be changed; a gain from anything other than doing the work is reverted. It no longer says immutability prevents gaming.

**Guards and evidence**

- R5. The existing `schema and skill pins` test pins the smallest falsifiable unit of R1, R2, and R4: the keep condition in `loop.md`, the reason field in the log schema, the corrected sentence and the absence of the old one in the template.
- R6. A read-only eval cell in the catalog puts the count-skipping `dedupe` in front of the skill at the keep step and grades revert plus the named constraint.
- R7. `docs/guides/ce-optimize.md` tells the user, in one or two sentences, that a kept change must have earned its gain and that an exploit is reverted and named.

### Acceptance Examples

- AE1. Covers R1, R2, R3.
  - **Given:** the `optimize-live` spec; experiment 3 returns `comparisons: 0, correct: 1`; its diff replaces the inner loop with a `Set` and never calls `count()`; the hypothesis's opportunity said "at most a 60% reduction".
  - **When:** the batch is evaluated.
  - **Then:** the experiment is `reverted`, its entry names the constraint "every comparison or lookup must call count() once" as unmeasured by the harness, and the report says so.
- AE2. Covers R1 (restraint).
  - **Given:** the same spec; experiment 2 sorts `out` and binary-searches it, calling `count()` per probe; `comparisons` drops 40%; correct.
  - **When:** the batch is evaluated.
  - **Then:** the experiment is kept as before. R1 adds no ceremony to an honest win.
- AE3. Covers R4.
  - **Given:** the filled worker brief.
  - **Then:** it does not claim the worker cannot game the metric; it says a gain from anything but the work is reverted.

### Scope Boundaries

- `decide.mjs` does not change. It decides from numbers; R1 is a reading judgment the orchestrator makes.
- No new spec key, no `constraints` schema change, no harness-side verifier. A user who wants a constraint measured adds it to the harness in a new run (R2).
- The Phase 1 validity gate and the holdout are unchanged.
- The live `optimize-live` grade (eval idea 2 in the lessons doc: an instrumented rerun of the kept `dedupe`) is deferred; it needs a new grading hook in the cell runner.

#### Deferred to Follow-Up Work

- A hidden-check grade for the live cell that reruns the kept `src/dedupe.js` on a different seed.
- Eval ideas 3 and 4 from the lessons doc (`ce-code-review` invented-rule pair; `ce-plan` hidden-omission spec) belong to other skills.

---

## Planning Contract

### Key Technical Decisions

- KTD1. **The condition lives in `loop.md` 3.4 step 3 (KEEP), as the first bullet, before the commit.** That is the one point where the winner is about to become a commit on the optimization branch, and it is the step every backend reaches (`worktree`, `codex`, `remote` all converge there). Stating it at 3.3 would run it on candidates the batch will not keep; stating it in the body would cost bytes `SKILL.md` does not have (7885 of 8000). Governs R1, R2, R3.
- KTD2. **The reason is recorded on the existing `reverted` outcome, not a new outcome value.** `reverted` already means "compared and not eligible"; adding `unearned` or similar would touch `decide.mjs`'s vocabulary and the wrap-up outcome table for one case. The entry's existing free-text `learnings`/`reason` shape plus the `comparisons[].correctness` field ("exact unverified constraints") carry it; the log schema's `reverted` comment gains the second cause. Governs R2.
- KTD3. **The template's CRITICAL sentence is replaced, not appended to.** The false claim is the defect; the true claim is one sentence in the same place, so the worker reads it with the scope rule. Governs R4.
- KTD4. **Wrap-up's "unverified constraints" line names the gap when one was found.** The evidence-quality bullet already reports unverified constraints; it gains the case where a revert under R1 identified a constraint the harness cannot check, so the user learns what to add to the harness. Governs R2.
- KTD5. **Pins are corpus greps on the reference files, not body pins.** The body does not change. The test extends the existing `remote backend` / `long runs` neighborhood in `schema and skill pins` with one new test rather than a new `describe`. Governs R5.
- KTD6. **The eval cell is `post_only`, `read_only`, `declared`.** Same shape as `ce-optimize/remote-without-detached-worker`. It is post-only because the pre-change tree would keep. Governs R6.

### High-Level Technical Design

```mermaid
flowchart TB
  A[decide.mjs returns keep, next_measurement none] --> B{Gain from doing the work the metric stands for?}
  B -->|yes| C[Commit, merge, new baseline]
  B -->|no: harness did not observe it, or an unchecked constraint broke| D[reverted, entry names the gap]
  D --> E[Wrap-up report names the gap as a harness change for a new run]
```

### Assumptions

- Reading a diff against the spec's `constraints` and the metric's description is within the orchestrator's means at 3.4; it already inspects the diff for scope and, for `remote`, reads it against `base_sha`.
- The `optimize-live` fixture stays as it is; the cell describes the exploit in the task rather than shipping an exploit file.

### Risks

| Risk | Mitigation |
|---|---|
| The condition is read as license to revert honest wins | AE2 restraint example in the plan; the eval cell's `why` names it; the sentence says what a keep is, not what to suspect |
| Literal hosts want a list | The condition names the two failure directions (unobserved work, unchecked constraint) as the condition, once; the lessons doc's four bullets are illustrations the plan keeps out of the skill |
| Test pin too broad or too incidental | Pin the phrase "doing the work the metric stands for", the template's new sentence, and `not.toContain` on the old claim |

### Sources

- `/cursor/stores/bc-01a09d9f-dffe-7acb-bd46-bfcd8e745ffb/docs/paper-2609-12039-ce-lessons.md`, "Top adoption 1" and evaluation idea 1.
- `skills/ce-optimize/references/loop.md` 3.4 step 3; `references/experiment-prompt-template.md` line "CRITICAL: ..."; `references/wrap-up.md` "Evidence quality"; `references/experiment-log-schema.yaml` `outcome.reverted`, `comparisons[].correctness`.
- `tests/skill-eval-cell/fixtures/optimize-live/` (spec `constraints`, `tools/measure.js`).
- `tests/skills/ce-optimize-decide.test.ts` `schema and skill pins`.

---

## Implementation Units

### U1. State the keep condition and its failure direction in the loop

- **Goal:** 3.4 KEEP withholds a keep whose gain did not come from the work, reverts it, and records why.
- **Requirements:** R1, R2, R3; KTD1, KTD2.
- **Dependencies:** none.
- **Files:** `skills/ce-optimize/references/loop.md`, `skills/ce-optimize/references/experiment-log-schema.yaml`.
- **Approach:**
  1. Invoke `ce-skill-work` (edit mode) before touching the files.
  2. In 3.4 step 3, add one bullet before "Commit the experiment branch first": the keep condition, its two failure directions, the opportunity-upper-bound trigger for reading the diff, and the safe direction (revert; entry names the gap; the gap is a new run's harness change).
  3. In the log schema, extend the `reverted` value comment to include this cause, and extend `comparisons[].correctness` description so an unverified constraint the revert identified is named there.
- **Test scenarios:** covered by U3's pins.
- **Verification:** `bun test tests/skills/ce-optimize-decide.test.ts` passes; the 3.4 block reads as one condition.

### U2. Correct the worker brief and the wrap-up line

- **Goal:** The worker is told the true claim; the report names a found gap.
- **Requirements:** R2, R4; KTD3, KTD4.
- **Dependencies:** none.
- **Files:** `skills/ce-optimize/references/experiment-prompt-template.md`, `skills/ce-optimize/references/wrap-up.md`.
- **Approach:**
  1. Replace the CRITICAL sentence's second half with the true claim; keep the scope instruction.
  2. In wrap-up's "Evidence quality" bullet, extend "any unverified constraints" to name a constraint a revert identified as unmeasured, as the harness change for a new run.
- **Verification:** `rg "cannot game" skills/ce-optimize` returns nothing.

### U3. Pin the contract and add the eval cell

- **Goal:** CI fails if the condition, the corrected sentence, or the reason field disappears; a fresh-agent cell exercises the count-skipping keep.
- **Requirements:** R5, R6; KTD5, KTD6.
- **Dependencies:** U1, U2.
- **Files:** `tests/skills/ce-optimize-decide.test.ts`, `tests/skill-eval-cell/catalog.ts`, `tests/skill-eval-cell/catalog.test.ts`.
- **Approach:**
  1. Add one test inside `schema and skill pins` with the smallest needles: `LOOP` contains the keep-condition phrase; `TEMPLATE` contains the new sentence and does not contain "cannot game the metric"; `LOG_SCHEMA` names the cause on `reverted`; `WRAP_UP` names the gap.
  2. Add `ce-optimize/keep-earns-its-gain` after `remote-without-detached-worker`: read-only, post-only, `declared: { DECISION: "revert" }`, `must_include_any` on `count()`/`count`, `actions: none`, `delegates: none`. Register the id in the post-only list in `catalog.test.ts`.
- **Verification:** `bun test tests/skills/ce-optimize-decide.test.ts tests/skill-eval-cell/catalog.test.ts` passes.

### U4. Guide sentence

- **Goal:** The user-facing guide states the rule.
- **Requirements:** R7.
- **Dependencies:** U1.
- **Files:** `docs/guides/ce-optimize.md`.
- **Approach:** One or two sentences next to the existing validity-gate paragraph or the keep description.
- **Verification:** reads consistently with `loop.md`.

---

## Verification Contract

| Check | Applies to | Signal |
|---|---|---|
| `bun run test` | U1-U4 | passes (bun `TimeoutError` flakes re-run per `scripts/run-tests.ts`) |
| `bun run release:validate` | U1-U4 | passes (no inventory change) |
| `tests/codex-skill-prompt-budget.test.ts` | U1 | `ce-optimize` body unchanged, stays under 8000 |
| `bun run test:skill-eval-cell -- ce-optimize/keep-earns-its-gain` on a host CLI | U3 | optional; bills the host; skip reason recorded if not run |

## Definition of Done

- R1-R7 each map to a changed line or a pin.
- No per-case list of exploit shapes in any skill file; one condition with two named failure directions.
- The template no longer claims immutability prevents gaming.
- `SKILL.md` is byte-unchanged.
- Commits are plain `fix(ce-optimize): ...` commits on `cursor/ce-optimize-long-runs-54a9`; PR #1708's body has a short section for this change.
