---
title: ce-debug usage-audit conditions - Plan
type: fix
date: 2026-11-08
artifact_contract: ce-unified-plan/v1
product_contract_source: ce-plan-bootstrap
execution: code
---

# ce-debug usage-audit conditions - Plan

## Goal Capsule

- **Objective:** Developers who run `ce-debug`, directly or through `lfg` and `ce-babysit-pr`, stop seeing the edge failures a 2026-11-08 audit of 45 real sessions found. Fixes no longer ship past their callers' scope checks unnoticed. Codex no longer works from cut-off instructions. Bugs in agent instructions get a real behavioral check. Users are told when a repo rule stopped shipping. No duplicate fix gets built when an open PR already exists. A fix that changes after review gets reviewed again.
- **Means:** each finding becomes one condition in the file that owns that decision, mostly ce-debug's references (KTD1).
- **Authority:** this plan, then `AGENTS.md` and `docs/solutions/skill-design/portable-agent-skill-authoring.md`, then the current skill text.
- **Execution profile:** one PR (KTD2). Skill prose plus contract tests plus a behavioral eval pack.
- **Stop conditions:** stop and report if a condition can only be stated by adding a new return status, residual type, or procedure, or if ce-debug `SKILL.md` would grow by more than about 1 KB.
- **Who finishes:** `lfg` ships the PR. Merging stays with the user.

## Product Contract

### Summary

Add seven conditions to `ce-debug`, `lfg`, and `ce-babysit-pr`. Each closes a gap the usage audit observed. Pin each one with a contract test, and run before/after evals on Claude and Codex for the conditions that depend on model judgment.

### Problem Frame

Across the audit, ce-debug never produced a wrong root cause, and its reproduction work was strong. The failures were at the edges:

- Five runs where the caller ran in the same session ended with no structured return, and the caller carried on anyway.
- Codex dropped the middle of batched skill-file reads in five sessions.
- Prompt-behavior fixes were "tested" by checking that the prompt text was present.
- A repo's commit rule stopped shipping in four threads, and none of them said so.
- A pipeline run built a full fix that duplicated an open PR.
- Fixes that widened a fallback path broke a nearby path twice; review caught both.
- A fix that was rebuilt after review shipped without a second review.

### Requirements

**Caller-side return handling**

- R1. `lfg`'s defect-route gate treats a `ce-debug` run that ends without a structured return as malformed, so the run stops as blocked.
- R2. `ce-babysit-pr` treats a `ce-debug mode:pipeline` pass that ends without a parseable return as an unfixed red residual, whatever that pass pushed.

**Reading skill files**

- R3. ce-debug tells the agent to read each of its skill files whole, in its own tool call, and to re-read any read whose output came back shortened. The authoring standard records the same practice for every skill.

**Interactive and fix conditions**

- R4. When the defect is in instructions a model reads, a test that only checks the text is present is not the regression check. The red-then-green instrument is a behavioral run of the before and after text. When that run costs money or needs credentials, the agent asks before treating the fix as verified.
- R5. When a contextual override stops ce-debug's commit/PR handoff, the agent names the instruction that stopped it and says shipping runs on request.
- R6. When a fix adds an early return or abort, or widens a fallback or recovery path, the self-review checks what the new path now skips or swallows.
- R7. A fix that changes after its review is reviewed again on the changed scope before it ships.

**Non-interactive modes**

- R8. In `mode:pipeline` and `mode:return-to-caller`, an open PR (or other in-flight fix) for this same bug on a branch other than the one this run is fixing means no fix is applied. The run returns `diagnosed-no-fix` with the link in `summary`, and `lfg`'s stop report shows `summary`. The PR for the current branch (the one babysit watches, or the branch lfg handed over) never triggers this.

### Key Decisions

- **Items 1-7 of the audit ship together in one PR.** (session-settled: user-approved — chosen over one PR per finding: all are small condition edits to the same skill family and share one eval pass) Governs R1-R8.
- **The zsh `git add $F` commit failure, the mechanical-CI fast path, Codex asking in chat instead of `request_user_input`, and the Debug Summary template are out of scope.** (session-settled: user-approved — chosen over folding them in: different owning skills, or low impact with no observed harm)

### Scope Boundaries

- No new return status, residual type, or field in either structured return.
- ce-debug's own "the return is the last thing this skill writes" rule stays as is. The audit showed the rule is clear and the agent skips it anyway, so R1/R2 put the check on the consumer side.

#### Deferred to Follow-Up Work

- The zsh `git add $F` / chained-push failure in `ce-commit` and `ce-commit-push-pr` (a separate PR).
- A trivial/mechanical fast path ahead of the investigate read in pipeline mode (audit item 8).

## Planning Contract

### Key Technical Decisions

- KTD1. **Conditions live where the decision is made, not in ce-debug's always-loaded body.** `skills/ce-debug/SKILL.md` is already over the Codex 8,000-byte budget (`OVER_BUDGET` in `tests/codex-skill-prompt-budget.test.ts`). So R4/R6 go in `references/fix.md`, R7 in `references/post-fix-handoff.md`, and R8 in `references/pipeline-mode.md` and `references/return-to-caller.md`. SKILL.md only takes R3, which must come before the first reference read, and R5, which edits an existing sentence there.
- KTD2. **One PR.** (session-settled: user-approved — chosen over one PR per finding: shared eval pass, same skill family)
- KTD3. **R3 reuses ce-code-review's whole-read sentence verbatim.** `tests/review-skill-contract.test.ts` pins that sentence as `READ_EACH_FILE_RULE` (#2030/#2032). A second wording would drift. It is placed once in SKILL.md's Execution Flow, before the first "Read `references/investigate.md` now". It applies to every later reference read; it is not repeated per read.
- KTD4. **R8 uses `diagnosed-no-fix` with the link in `summary`, not in `residuals`.** Both references reserve `residuals` for typed `needs-human` items. `return-to-caller.md` says "Do not invent a residual type; a non-blocking follow-up goes in `summary`". An already-fixed bug is not a human decision inside this run. Because lfg's stop report currently lists `root_cause`, `residuals`, blockers, and `prevention_signal` but not `summary`, `skills/lfg/references/debug-return.md` adds `summary` to what a stop reports.
- KTD5. **R2 lives at babysit's ce-debug status line in `skills/ce-babysit-pr/references/tick.md`, not in `pipeline.md`.** `tick.md` (step 5, real test/build failure) is where babysit reads ce-debug's `status`. A missing return is treated as an ordinary red residual like `diagnosed-no-fix`. That is safe, because a pushed new head clears dispatched marks and the next snapshot reads the PR from GitHub.

## Implementation Units

### U1. Callers treat a missing ce-debug return as malformed

- **Goal:** R1, R2.
- **Requirements:** R1, R2, R8 (lfg's stop report shows `summary`).
- **Dependencies:** none.
- **Files:**
  - `skills/lfg/references/debug-return.md`
  - `skills/ce-babysit-pr/references/tick.md`
  - `tests/skills/lfg-intake-contract.test.ts`
  - `tests/ce-babysit-pr-contract.test.ts`
- **Approach:**
  1. In `debug-return.md` "What advances", extend the malformed sentence so it covers a run that ended with no return at all, and add `summary` to the fields a stop reports (KTD4).
  2. In `tick.md` step 5's ce-debug bullet, state that a pass with no parseable return is handled as an ordinary red residual, the same as `diagnosed-no-fix` (KTD5).
- **Patterns to follow:** the existing status-spelling sentences in both files.
- **Test scenarios:**
  - `debug-return.md` names a missing return as stopping the run as blocked.
  - `debug-return.md`'s stop sentence includes `summary`.
  - `tick.md`'s ce-debug bullet names the missing-return case and maps it to the red-residual handling.
- **Verification:** both contract tests pass, and each new assertion fails against the pre-change file.

### U2. Whole-file reads in ce-debug and the authoring standard

- **Goal:** R3.
- **Requirements:** R3.
- **Dependencies:** none.
- **Files:**
  - `skills/ce-debug/SKILL.md`
  - `docs/solutions/skill-design/portable-agent-skill-authoring.md`
  - `tests/pipeline-review-contract.test.ts` (or the ce-debug-adjacent contract test that already reads ce-debug's SKILL.md)
- **Approach:**
  1. Insert the `READ_EACH_FILE_RULE` sentence once in SKILL.md's Execution Flow, before the investigate read (KTD3).
  2. In the authoring standard, record the practice next to its guidance on reference reads, citing #2030 and the ~40 KB Codex tool-output cap. Point at the 36 KB per-file guard in `tests/codex-skill-prompt-budget.test.ts` as the size half of the same rule.
- **Test scenarios:**
  - ce-debug's SKILL.md contains the exact pinned sentence, and it comes before the first `references/investigate.md` read instruction.
- **Verification:** the contract test passes. ce-debug's SKILL.md grows by under ~1 KB.

### U3. Interactive and fix-phase conditions

- **Goal:** R4, R5, R6, R7.
- **Requirements:** R4, R5, R6, R7.
- **Dependencies:** none.
- **Files:**
  - `skills/ce-debug/references/fix.md`
  - `skills/ce-debug/SKILL.md`
  - `skills/ce-debug/references/post-fix-handoff.md`
  - `tests/pipeline-review-contract.test.ts`
- **Approach:**
  1. `fix.md` test-first step 1 or 2: the R4 condition. Keep it a condition, not a procedure, and say the findings block and summary still apply.
  2. `fix.md` step 5: the R6 clause, alongside the existing "account for every other place" sentence.
  3. SKILL.md Contextual override: extend the existing sentence for R5. Do not add a new paragraph.
  4. `post-fix-handoff.md` "Review the final fix scope": the R7 condition. It covers any change after review, not only changes made by simplify or review (KTD1).
- **Test scenarios:**
  - Each file contains its new condition, pinned by its smallest distinctive phrase. Do not snapshot the paragraph.
- **Verification:** contract tests pass. The behavioral eval for R4 and R5 (U5) shows the post-change arm behaving as required.

### U4. Open PR already fixes the bug, in non-interactive modes

- **Goal:** R8.
- **Requirements:** R8.
- **Dependencies:** U1 (lfg's stop report shows `summary`).
- **Files:**
  - `skills/ce-debug/references/pipeline-mode.md`
  - `skills/ce-debug/references/return-to-caller.md`
  - `tests/ce-babysit-pr-contract.test.ts` (it already reads `pipeline-mode.md`)
  - `tests/skills/lfg-intake-contract.test.ts` (it already reads `return-to-caller.md`)
- **Approach:**
  1. Add one condition to each reference's Phase 2 override bullet: an open PR or in-flight fix for this same bug, on a branch other than the one being fixed, means apply nothing and return `diagnosed-no-fix` with the link in `summary` (KTD4, R8). Name `references/investigate.md` 1.4 as where that find comes from, without restating it.
  2. Update the `diagnosed-no-fix` definition line in both references. Today each one points to `residuals` for the reason. Make it say that when no human decision is pending, as in the open-PR case, the reason and link go in `summary` and `residuals` stays empty. Otherwise the open-PR return turns into a `needs-human` residual, and babysit parks it.
- **Test scenarios:**
  - Each reference names the open-PR case and `diagnosed-no-fix`, and puts the link in `summary`.
  - Each reference limits the case to a branch other than the one being fixed.
  - Each `diagnosed-no-fix` definition line mentions `summary`.
  - Neither reference adds a status spelling. The existing exact-spelling assertions still pass.
- **Verification:** contract tests pass. The behavioral eval (U5) shows the post-change arm returning `diagnosed-no-fix` with the link, where the pre-change arm builds a fix.

### U5. Behavioral eval pack, before and after, on Claude and Codex

- **Goal:** evidence that R4, R5, and R8 change model behavior, and that R7 holds where cheap.
- **Requirements:** R4, R5, R7, R8.
- **Dependencies:** U3, U4.
- **Files:**
  - `tests/skill-eval-cell/catalog.ts` (seven read-only `ce-debug/` decision rows, run with `test:skill-eval-pack --id <row>`)
- **Approach:** write scenarios in the caller's shape, so each one forces the decision the change targets:
  - an LLM-prompt fix where only a text-presence test is on hand (R4);
  - a repo instruction blocking commits at handoff (R5);
  - a pipeline and a return-to-caller run whose tracker search finds an open PR on another branch fixing the same bug (R8);
  - a pipeline run whose only open PR is the current branch's own PR, where the expected decision is to fix (R8's exclusion);
  - a fix that the user reworks after review ran (R7).

  Run `--arm ab` against main on Claude and Codex, grading declared decisions plus a required artifact. Record the hosts, trials, and results in the PR body, and name any host that could not run and why.
- **Execution note:** `docs/solutions/skill-design/callee-skill-evals-need-caller-shaped-tasks.md` applies. Single-decision cells passed on old text in earlier ce-debug audits, so a pre-arm pass means "no regression", not "gain". Say which it is.
- **Test expectation:** the pack is evidence, not a CI test. Catalog rows are added only where they meet `tests/CODING_STANDARDS.md`'s artifact requirement.
- **Verification:** the post-change arm meets each scenario's declared decision on both hosts.

## Verification Contract

| Check | Command | When |
|---|---|---|
| Skill guards | `bun run test:skill-guards` | after every skill edit |
| Focused contracts | `bun run test tests/skills/lfg-intake-contract.test.ts tests/ce-babysit-pr-contract.test.ts tests/pipeline-review-contract.test.ts tests/codex-skill-prompt-budget.test.ts` | per unit |
| Publishing selection | `bun run test --changed-since=<40-char base SHA>` on a clean committed tree | before push |
| Typecheck / metadata | `bun run typecheck`, `bun run release:validate`, `bun run plugin:validate` | before push |
| Behavioral eval | `bun run test:skill-eval-pack -- --skill ce-debug --arm ab` (the U5 pack) on Claude and Codex | after U3/U4 |

## Definition of Done

- R1-R8 each hold in the owning file and are pinned by a contract test that fails against the pre-change text.
- No new status, residual type, or return field was added. The existing status-spelling assertions pass.
- ce-debug SKILL.md grew by under ~1 KB and stays in `OVER_BUDGET`.
- U5 results for both hosts are recorded in the PR body, with each result labeled as a gain or as no regression.
- No dead-end or experimental edits are left in the diff.
