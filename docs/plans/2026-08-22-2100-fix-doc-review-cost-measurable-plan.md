---
title: Doc Review Cost Measurable - Plan
type: fix
date: 2026-08-22
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
depth: standard
---

# Doc Review Cost Measurable - Plan

## Goal Capsule

- **Objective:** The cost of reviewing a Durable plan is measurable per persona and per depth — wall time from dispatch to each persona's persisted return, and findings per persona, joined to the reviewed plan and its depth — and the product-lens reviewer runs only when a plan stakes a product position worth a product judgment.
- **Means:** persist every local persona's findings and a run manifest (KTD1, KTD8), record `depth:` on plans (KTD4), restate the product-lens activation condition (KTD6).
- **Authority:** this plan; the project's active instructions ("Working on Skills", "Reviewing a skill change", "Right-size new mechanical guards"); the repo-local `ce-skill-work` standard for every edit under `skills/`; `docs/plans/2026-08-22-0934-fix-right-size-skill-ceremony-plan.md` KTD6 (document review stays mandatory on a Lightweight Durable plan).
- **Execution profile:** four units, one branch (`tmchow/doc-review-right-size-a`), one PR to `main`. Units U1-U3 are independent; U4 depends on U3.
- **Stop conditions:** stop and surface if a change would need the `ce-plan` kernel to grow (it is at 7,826 of 8,000 CRLF-adjusted bytes), if the scratch-root tests cannot pass with one preamble copy, if the activation probe shows the restated product-lens condition under-fires on a document that states a challengeable product position, or if the routine fixture still announces product-lens after the three-trial rerun — surface it; do not tighten the condition inside this PR.
- **Tail ownership:** the executor owns verification and the PR; the PR carries the eval evidence for U4.

---

## Product Contract

### Summary

Three bounded changes to two skills. `ce-doc-review` writes each local persona's returned findings into its run directory, which it now creates on every review, so a later measurement can compare what the local roster found with what the cross-model peer found. `ce-plan` writes the plan's depth into the artifact's metadata so document size and review cost can be read by depth. `ce-doc-review`'s product-lens persona activates on a position the document stakes that a stakeholder could challenge, or on strategic weight, and no longer on the existence of plausible alternatives. The adversarial reviewer, the cross-model pass, the plan template, and the unified-plan floor do not change.

### Problem Frame

PR #1514 right-sized ceremony at intake; a small request that still lands as a Durable plan pays for document review in full. Measurement this session could not say what that review buys: only the cross-model peer files land on disk (55 runs under `/tmp/compound-engineering-501/ce-doc-review/`, zero local persona files), and no plan records its depth, so neither review cost nor document size can be read by depth. Separately, product-lens's premise leg lists "solution selection where alternatives plausibly exist", which holds for nearly any fix, so a judgment persona runs on routine bootstrap plans. Peer-job consolidation is a separate decision gated on a non-inferiority benchmark; it needs the persisted local findings this plan adds.

### Requirements

**Measurement**

- R1. After a `ce-doc-review` run, the run directory holds one findings file per local persona that returned, named by the reviewer's short name (`coherence.json`, `feasibility.json`, `product-lens.json`, ...), alongside any `<reviewer-name>-<provider>.json` peer file.
- R2. The run directory exists for every review, with or without a cross-model peer, under the scratch root the project's scratch-space rules define, with the same ownership and permission guards as the existing peer preamble.
- R3. A persisted local file is the persona's return as returned, written before schema validation; a persona that returned nothing leaves no file, and Coverage stays the only user-facing signal for that.
- R7. The run directory holds a `run.json` manifest written at dispatch — reviewed document path, document type, the document's `depth:` when present, the announced team, and the dispatch time — and each persisted persona file records its return time, so a run joins to its plan and depth and cost is computable from what is on disk.
- R4. A unified plan written by `ce-plan` carries `depth:` with one of `lightweight`, `standard`, `deep` in its frontmatter (markdown) or visible header (HTML); a plan without the key remains valid for every consumer.

**Activation**

- R5. `ce-doc-review`'s product-lens persona activates when the document stakes a product position — what to build, why, or what comes first — that a knowledgeable stakeholder could reasonably challenge and that no upstream Product Contract settled, or when the work carries strategic weight. A choice among mechanisms for building an agreed outcome is not a product position; describing a task or restating known requirements is not either.
- R6. The always-on roster, design-lens, security-lens, scope-guardian, adversarial activation, and the cross-model pass behave exactly as before.

### Key Decisions

- **Adversarial activation and the cross-model pass stay as they are** (session-settled: user-directed — chosen over gating the pass on provenance: a different-family peer catches model-specific consistent errors a same-model reviewer cannot, and the adversarial reviewer has found real findings). Governs R6.
- **Document review stays mandatory on Lightweight Durable plans** — inherits KTD6 of the #1514 plan (session-settled: user-approved). Governs R6.
- **Verification is proportionate: bun-test pins for measurement changes, a small activation probe for the product-lens change** (session-settled: user-approved — chosen over a three-host matrix or TUI sessions). Governs the Verification Contract.

### Scope Boundaries

- In: `skills/ce-doc-review` (dispatch, synthesis, subagent template, cross-model reference, persona-selection, kernel pointer), `skills/ce-plan` references that own metadata and rendering, their docs pages, tests, and eval-cell rows and fixtures.
- Out: the plan template and the implementation-ready floor; any `ce-brainstorm` change (a requirements-only plan never carries `depth:`; enrichment adds it); exposing the run-directory path in the non-interactive envelope; run-directory cleanup.

### Deferred to Follow-Up Work

- Peer-job consolidation in `ce-doc-review` (PR B), gated on the non-inferiority benchmark in `docs/solutions/skill-design/benchmark-review-peer-model-and-reasoning-tier.md`, which uses the files R1 adds.
- A measurement pass over persisted findings (peer-unique findings by persona, size and review cost by depth) once enough runs carry both.

---

## Planning Contract

### Key Technical Decisions

- KTD1. **A persona that has a shell writes its own file; the orchestrator writes only for a persona run inline.** The `ce-code-review` subagent template grants one write exception for `<run-dir>/<reviewer>.json`; copying that here keeps the file a true copy of the return (an orchestrator retype is a re-transcription that can silently repair a malformed return) and costs no orchestrator tokens. Personas run inline when the harness has no subagent primitive (`references/dispatch.md`) and there the orchestrator writes the return as received. Governs R1, R3.
- KTD2. **One scratch preamble, at the step that fires before any write.** `references/dispatch.md` is read before every dispatch, so the `SCRATCH_ROOT` / `RUN_DIR` preamble and the run-id recipe move there and `references/cross-model-review.md` takes `RUN_DIR` as the already-resolved absolute path rather than restating the block. The block keeps the exact shape `tests/scratch-root-contract.test.ts` and `tests/scratch-root-preamble-executes.test.ts` execute. Governs R2.
- KTD3. **Run id is minted per invocation with the `ce-code-review` recipe** (`references/select-and-route.md`: date stamp plus four random bytes). `ce-doc-review` never defined `<run-id>`; a stable-per-document id would collide on a round-2 review and let a reap touch the earlier round's jobs. Governs R2.
- KTD4. **`depth:` is owned by `plan-sections.md`'s metadata field list and written at Phase 5.2; the deepening pass is authoritative when it rewrites the file.** Lowercase values. Phase 5.3.1 re-derives depth from the document and may disagree with intake; when deepening edits the frontmatter (where it sets `deepened:`), it rewrites `depth:` to its classification, and backfills the key on an older plan only when the file is being written for another reason. The kernel does not change. Governs R4.
- KTD5. **HTML carries `depth` in the visible-header field list** in `ce-plan/references/html-rendering.md`; `ce-brainstorm`'s copy of that list is untouched because brainstorm never writes depth. Governs R4.
- KTD6. **The product-lens premise leg is restated as one condition, with provenance inside the condition.** A plan that derives from a validated upstream Product Contract stakes no new position unless it contests what the origin settled; adversarial already carries that provenance rule (`persona-selection.md` "Do NOT activate adversarial on a routine plan that derives from a validated upstream Product Contract"). Without it, the restated condition fires on any plan with a KTD and pulls the cross-model pass with it on every brainstorm-sourced plan. Governs R5.
- KTD8. **The manifest is the join key and the clock.** `run.json` is written when the run directory is created; a persona's return time is stamped by whoever writes its file. Cost is wall time from dispatch to persisted return plus findings count per persona; token usage is not observable by the orchestrator and is not a requirement. Governs R7.
- KTD7. **Persisted files stay where they land; nothing reads them back across runs.** The per-uid 0700 root and run dir cover the write; synthesis consumes the in-memory return, so no cross-run read needs the fd-ownership check from `docs/solutions/best-practices/predictable-tmp-cache-ownership-check.md`. Governs R1.

### Assumptions

- Inline-run personas (no subagent primitive) persist under the same name; independence is a synthesis concern, not a persistence one.
- Local file names and peer file names are disjoint by construction (`coherence.json` vs `product-lens-codex.json`); no ordering rule is needed between local writes and peer publication.

### Patterns to Follow

- Scratch preamble block: copy from `skills/ce-code-review/SKILL.md` as the project's active instructions direct; do not re-derive.
- Run-id recipe: `skills/ce-code-review/references/select-and-route.md`.
- Metadata field definitions: `skills/ce-plan/references/plan-sections.md` "Plan metadata fields" (adding a field is sanctioned there; renaming is not).
- Eval rows: the `ce-plan` right-size rows in `tests/skill-eval-cell/catalog.ts` (`files_read_post`, `must_include`, `baseline_ref`).

---

## Implementation Units

### U1. Persist local persona findings in an always-created run directory

- **Goal:** Every `ce-doc-review` run leaves `<reviewer>.json` per local persona in a run directory that exists whether or not a peer launched.
- **Requirements:** R1, R2, R3, KTD1, KTD2, KTD3, KTD7
- **Dependencies:** None
- **Files:**
  - Modify: `skills/ce-doc-review/references/dispatch.md` (preamble, run-id recipe, run-dir creation before dispatch)
  - Modify: `skills/ce-doc-review/references/cross-model-review.md` (consume the resolved `RUN_DIR`; drop the duplicated preamble; "empty scratch run-dir" wording stays, since it names the peer's separate workdir)
  - Modify: `skills/ce-doc-review/references/subagent-template.md` (one write exception: the persona writes `<run-dir>/<reviewer>.json` with its return time before returning)
  - Modify: `skills/ce-doc-review/references/synthesis-and-presentation.md` (3.1: the orchestrator writes the return for an inline-run persona; validation reads the in-memory return)
  - Modify: `skills/ce-doc-review/SKILL.md` (collection sentence points at the persisted location; stays under the byte cap)
  - Modify: `docs/skills/ce-doc-review.md` (run artifacts paragraph)
  - Test: `tests/scratch-root-contract.test.ts`, `tests/scratch-root-preamble-executes.test.ts` (must still pass with the moved block); `tests/pipeline-review-contract.test.ts` (new pin: dispatch.md carries the run-dir preamble; synthesis 3.1 names the per-reviewer write before validation)
- **Approach:**
  1. Move the preamble block verbatim into `dispatch.md` at the point before the first dispatch, add the run-id recipe, write `run.json` there, and state the condition: the run directory and manifest exist before any persona is dispatched; pass `<run-dir>` to each persona in its payload.
  2. In `cross-model-review.md`, replace the inline preamble with the already-resolved `RUN_DIR`; keep the `start` invocation's `<run-dir>` argument as the literal absolute path (shell state does not persist between calls).
  3. In synthesis 3.1, state the write as a condition on the return, not on validity: what came back is written as it came back.
- **Patterns to follow:** `ce-code-review` run-dir and run-id handling (`select-and-route.md`); existing `chmod 600` on per-file writes.
- **Test scenarios:**
  - Both scratch-root tests pass with exactly one preamble copy under `skills/ce-doc-review/`.
  - A review with only coherence and feasibility (no peer) leaves `run.json`, `coherence.json`, and `feasibility.json` in a fresh run dir (manual run; see Verification Contract).
  - A review where a peer launches leaves both `<lens>.json` and `<lens>-<provider>.json`, and `jobs/` is removed after fold-in.
  - A persona that returns malformed JSON is persisted verbatim and named in Coverage; a persona that returns nothing leaves no file.
  - Kernel byte budget test passes for `ce-doc-review/SKILL.md`.
- **Verification:** the two scratch-root tests, the new pipeline-review pin, and the kernel budget test pass; one live non-interactive review on a fixture plan shows the files.

### U2. Record `depth:` on unified plans

- **Goal:** A plan written or deepened by `ce-plan` carries its depth in metadata; consumers tolerate its absence.
- **Requirements:** R4, KTD4, KTD5
- **Dependencies:** None
- **Files:**
  - Modify: `skills/ce-plan/references/plan-sections.md` ("Optional but well-known" field entry: name, values, who writes it, deepening authority)
  - Modify: `skills/ce-plan/references/final-review.md` (5.2 write list; 5.3.1 authority note)
  - Modify: `skills/ce-plan/references/deepening-workflow.md` (the `deepened:` edit also rewrites `depth:`)
  - Modify: `skills/ce-plan/references/html-rendering.md` (visible-header field list)
  - Modify: `docs/skills/ce-plan.md` (reference table row), `CONCEPTS.md` (depth entry if absent)
  - Modify: `tests/skill-eval-cell/fixtures/implementation-ready-plan/docs/plans/widget-plan.md` (add the key)
  - Test: `tests/skills/unified-plan-artifact-contract.test.ts` (final-review.md names `depth:` at the write step; plan-sections.md defines the three values), `tests/skills/html-output-invariants.test.ts` (visible-header list includes `depth`), `tests/skills/ce-plan-output-mode.test.ts` (field list includes `depth`)
- **Approach:** define the field once in `plan-sections.md`; the write step and the deepening step cite it. No change to `SKILL.md`.
- **Test scenarios:**
  - The three test files assert the strings named above and fail on a tree without the edit.
  - `tests/codex-skill-prompt-budget.test.ts` still passes (kernel untouched).
  - A consumer string scan (`ce-work` input-triage, `lfg` plan-brief, `ce-doc-review` document-intake) is unchanged — absence tolerated by construction.
- **Verification:** the named tests pass; one fresh `ce-plan` run against the `tiny-lib` fixture writes a plan whose `depth:` line is recorded in the PR body (the existing routing rows stop before the write, and the plan filename carries the wall clock, so `workspace_contains` cannot pin it).

### U3. Restate the product-lens activation condition

- **Goal:** product-lens activates on a staked, unsettled position or strategic weight; not on plausible alternatives.
- **Requirements:** R5, R6, KTD6
- **Dependencies:** None
- **Files:**
  - Modify: `skills/ce-doc-review/references/persona-selection.md` (product-lens block)
  - Modify: `docs/skills/ce-doc-review.md` (product-lens bullet)
  - Test: `tests/pipeline-review-contract.test.ts` (new pin on the product-lens line: contains the unsettled-position condition, does not contain "alternatives plausibly exist"; the existing security-lens pin keeps passing)
- **Approach:** replace the premise-claims enumeration with the condition in R5, keeping the strategic-weight leg; bring the block to the `ce-skill-work` standard (a condition, the safe direction, nothing else).
- **Test scenarios:**
  - The new pin fails on `origin/main` and passes after the edit.
  - The security-lens pin is unchanged.
- **Verification:** pins pass; U4 supplies the behavioral evidence.

### U4. Activation probe for product-lens

- **Goal:** Evidence that the restated condition stops the routine case and keeps both positive legs, on Claude and Codex.
- **Requirements:** R5, the Verification Contract
- **Dependencies:** U3
- **Files:**
  - Create: `tests/skill-eval-cell/fixtures/doc-review-routine-fix/` (a bootstrap fix plan with mechanism KTDs and no contested product position), `doc-review-staked-position/` (explicit prioritization and an outcome prediction), `doc-review-strategic-weight/` (sound premise, strategic weight, no new contested position), `doc-review-settled-origin/` (brainstorm-sourced plan whose decisions the origin settled); each fixture carries `.compound-engineering/config.yaml` with `cross_model_review_mode: off` so the probe grades one dimension and never egresses
  - Modify: `tests/skill-eval-cell/catalog.ts` (four `ce-doc-review` rows, `mode:non-interactive`, `git_init: true`, explicit `timeout_secs` sized for a multi-subagent review, `baseline_ref` = `6f6c5779d`; a `must_not_include` grade term added to the `Grade` type), `tests/skill-eval-cell/grade.ts` (`must_not_include` matched against the final answer the same way `must_include` is), `tests/skill-eval-cell/catalog.test.ts` (required-read allowlist entries for `references/persona-selection.md`)
- **Approach:** grade the persona roster the review names in its final envelope (the Claude cell captures the final message, not mid-run announcements, so the Coverage table is the needle): routine and settled-origin rows `must_include` the always-on pair and `must_not_include: ["product-lens-reviewer"]`; staked-position and strategic-weight rows `must_include` `product-lens-reviewer` in both arms. Grade only the product-lens dimension; adversarial activates on every bootstrap fixture by its provenance rule and is reported separately, not graded.
- **Execution note:** at least one fixture should be a captured real plan rather than an authored one (`docs/solutions/skill-design/authored-eval-corpora-contain-the-happy-path.md`).
- **Test scenarios:**
  - Pre arm (`6f6c5779d`): routine fixture names product-lens; post arm: it does not.
  - Staked-position and strategic-weight fixtures name product-lens in both arms.
  - Settled-origin fixture: product-lens absent post; adversarial absent in both (validated provenance).
  - `catalog.test.ts` passes with the new rows and allowlist entries.
- **Verification:** `bun run test:skill-eval-pack -- --id <row> --arm ab --hosts claude,codex`, one trial per cell, results recorded in the PR.

---

## Verification Contract

| Gate | Command | Proves |
|---|---|---|
| Deterministic | `bun run test` | U1 scratch-root and pipeline pins, U2 metadata pins, U3 persona pin, U4 catalog guards, kernel byte budgets |
| Release | `bun run release:validate`, `bun run plugin:validate` | plugin and marketplace consistency |
| Behavioral, U4 | `bun run test:skill-eval-pack -- --id ce-doc-review/<row> --arm ab --hosts claude,codex` for the four rows | activation flips on the routine fixture, stays off on settled-origin, holds on staked-position and strategic-weight |
| Behavioral, U1 | one `ce-doc-review mode:non-interactive` run on a fixture plan | `run.json` and `<reviewer>.json` files present in the run dir with return times |
| Behavioral, U2 | one `ce-plan` run on the `tiny-lib` fixture | the written plan carries `depth:` |

Not covered, by decision: a behavioral pass of every consumer over a plan without `depth:` (consumers key-match fields, and the existing `widget-plan.md` fixture already lacks the key under existing rows); a roster-regression sweep of the untouched lenses (the security-lens pin stays; the other lenses' text is outside the edited block).

Conflict call-out on the probe size: `docs/solutions/skill-design/ce-doc-review-calibration-patterns.md` and `safe-auto-rubric-calibration.md` record that single runs of a persona-activation change are noise and set N=3 per cell as the floor. The session settled one trial per cell as proportionate. If a post-arm result ties with pre on the routine fixture, rerun that cell to three trials before reading it as "no effect" (`docs/solutions/skill-design/strong-models-mask-defensive-skill-fixes.md`).

---

## Definition of Done

- R1-R6 hold; every test in the Verification Contract passes at the PR head.
- `skills/ce-doc-review/` carries exactly one scratch preamble copy; both scratch-root tests execute it.
- `ce-plan/SKILL.md` is byte-identical to `main`; `ce-doc-review/SKILL.md` stays under the cap.
- U4 rows and fixtures are committed with their pre/post results in the PR body; the U2 `depth:` line and the U1 run-dir listing are in the PR body.
- `docs/skills/ce-doc-review.md` and `docs/skills/ce-plan.md` describe the persisted artifacts and the `depth` field.
- No abandoned experiment files remain under `tests/skill-eval-cell/fixtures/`.

## Sources & Research

- `skills/ce-doc-review/references/cross-model-review.md` (preamble, run dir, fold-in, cleanup), `scripts/cross-model-doc-review.sh` (peer file naming, separate peer workdir)
- `skills/ce-code-review/references/select-and-route.md` (run-id recipe), `references/dispatch-reviewers.md` (subagent-writes precedent, not adopted)
- `skills/ce-plan/references/plan-sections.md` "Plan metadata fields"; `final-review.md` 5.2 and 5.3.1; `deepening-workflow.md` (`deepened:` write)
- `tests/scratch-root-contract.test.ts`, `tests/scratch-root-preamble-executes.test.ts`, `tests/skills/html-output-invariants.test.ts`, `tests/pipeline-review-contract.test.ts`
- `docs/solutions/skill-design/post-menu-routing-belongs-inline.md` (fence where it fires), `size-driven-skill-restructure.md` (cap is a ceiling), `paired-old-vs-new-injection-skill-evals.md` (grade one dimension), `ce-doc-review-calibration-patterns.md` (variance)
- Cross-model panel and literature this session: self-preference bias and model-specific consistent errors (Panickssery et al. 2024; Self-Correction Bench 2025; "Too Consistent to Detect" 2025); same-model fresh-context review recovers part of the gap (Cross-Context Review 2026)
