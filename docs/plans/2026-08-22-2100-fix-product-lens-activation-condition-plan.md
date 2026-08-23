---
title: Product-Lens Activation Condition - Plan
type: fix
date: 2026-08-22
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
---

# Product-Lens Activation Condition - Plan

## Goal Capsule

- **Objective:** `ce-doc-review`'s product-lens reviewer runs only when a plan stakes a product position worth a product judgment; routine plans no longer pay for it.
- **Means:** restate the product-lens activation leg in `references/persona-selection.md` as one condition (KTD1), and probe the condition with eval-cell rows that can fail (KTD2).
- **Authority:** this plan; the project's active instructions ("Working on Skills", "Reviewing a skill change", "Right-size new mechanical guards"); the repo-local `ce-skill-work` standard for every edit under `skills/`; `docs/plans/2026-08-22-0934-fix-right-size-skill-ceremony-plan.md` KTD6 (document review stays mandatory on a Lightweight Durable plan).
- **Execution profile:** two units, one branch (`tmchow/doc-review-right-size-a`), one PR to `main`. U2 depends on U1.
- **Stop conditions:** stop and surface if the activation probe shows the restated condition under-fires on a document that states a challengeable product position, or if the routine fixture still announces product-lens after a three-trial rerun — surface it; do not tighten the condition inside this PR.
- **Tail ownership:** the executor owns verification and the PR; the PR carries the probe evidence.

---

## Product Contract

### Summary

One change to one skill. `ce-doc-review`'s product-lens persona activates when the document stakes a product position a stakeholder could challenge that no upstream Product Contract settled, or when the work carries strategic weight. It no longer activates on "solution selection where alternatives plausibly exist", which holds for nearly any fix. The adversarial reviewer, the cross-model pass, the other personas, and the plan template do not change.

### Problem Frame

PR #1514 right-sized ceremony at intake; a small request that still lands as a Durable plan pays for document review in full. Product-lens's premise leg listed "solution selection where alternatives plausibly exist", which is true of almost any plan with a decision in it, so a product-judgment persona — and, through the judgment-trio gate, the cross-model pass — ran on routine bootstrap plans. Persisting review artifacts for a measurement pass and recording plan depth were considered and dropped: the measurement served plugin maintainers, not users, and a recorded depth label invites consumers to route on it instead of reasoning about the document.

### Requirements

- R1. `ce-doc-review`'s product-lens persona activates when the document stakes a product position — what to build, why, or what comes first — that a knowledgeable stakeholder could reasonably challenge and that no upstream Product Contract settled, or when the work carries strategic weight. A choice among mechanisms for building an agreed outcome is not a product position; describing a task or restating known requirements is not either.
- R2. The always-on roster, design-lens, security-lens, scope-guardian, adversarial activation, and the cross-model pass behave exactly as before.
- R3. The condition is probed by eval-cell rows that can fail in both directions: a routine plan must not name product-lens in its declared team, and a plan with a staked position must.

### Key Decisions

- **Adversarial activation and the cross-model pass stay as they are** (session-settled: user-directed — chosen over gating the pass on provenance: a different-family peer catches model-specific consistent errors a same-model reviewer cannot, and the adversarial reviewer has found real findings). Governs R2.
- **Document review stays mandatory on Lightweight Durable plans** — inherits KTD6 of the #1514 plan (session-settled: user-approved). Governs R2.
- **No persisted review artifacts and no depth label** (session-settled: user-directed — chosen over a per-review run directory with manifest and per-persona files, and over `depth:` in plan metadata: the artifacts served maintainers' measurement at every user's expense, and a recorded classification tempts consumers to route on it). Governs the scope below.
- **Verification is proportionate: a pin plus a small activation probe** (session-settled: user-approved — chosen over a three-host matrix or TUI sessions). Governs R3.

### Scope Boundaries

- In: `skills/ce-doc-review/references/persona-selection.md` (product-lens block), `docs/skills/ce-doc-review.md`, the contract test, and eval-cell rows, fixtures, and grader support.
- Out: the plan template and floor; `skills/ce-plan/`; any run-directory or artifact persistence in `ce-doc-review`; `product-lens-reviewer.md`'s own technique suppression (pre-existing, keyed on origin presence; named as follow-up).

---

## Planning Contract

### Key Technical Decisions

- KTD1. **The premise leg is one condition with provenance inside it.** A plan that derives from a validated upstream Product Contract stakes no new position unless it contests what the origin settled; adversarial already carries that provenance rule in the same file. Without it the restated condition fires on any plan with a KTD and pulls the cross-model pass with it on every brainstorm-sourced plan. Governs R1.
- KTD2. **The probe grades the declared team, not narration.** The eval cell's `must_exclude` reads only the ACTIONS trailer, so a roster probe needs a final-answer negative term; that term and `must_include` read the run's trailing `TEAM:` line when present, because narration or an output path can contain a persona's name. A row with its own `baseline_ref` gets an A/B pair. Governs R3.
- KTD3. **Fixtures turn the cross-model pass off.** The probe grades one dimension; the fixture's checkout config sets `cross_model_review_mode: off` so no trial egresses. Governs R3.

### Patterns to Follow

- Eval rows: the `ce-plan` right-size rows in `tests/skill-eval-cell/catalog.ts` (`files_read_post`, `must_include`, `baseline_ref`).
- Trailer parsing: `lastTrailer` in `tests/skill-eval-cell/grade.ts`.

---

## Implementation Units

### U1. Restate the product-lens activation condition

- **Goal:** product-lens activates on a staked, unsettled product position or strategic weight; not on plausible alternatives.
- **Requirements:** R1, R2, KTD1
- **Dependencies:** None
- **Files:**
  - Modify: `skills/ce-doc-review/references/persona-selection.md` (product-lens block)
  - Modify: `docs/skills/ce-doc-review.md` (product-lens bullet)
  - Test: `tests/pipeline-review-contract.test.ts` (pin: the product-lens block contains the unsettled-position condition and the mechanism exclusion, does not contain "alternatives plausibly exist", keeps the strategic-weight leg; the existing security-lens pin keeps passing)
- **Approach:** replace the premise-claims enumeration with the condition in R1, keeping the strategic-weight leg; bring the block to the `ce-skill-work` standard.
- **Test scenarios:**
  - The new pin fails on `main` and passes after the edit.
  - The security-lens pin is unchanged.
- **Verification:** pins pass; U2 supplies the behavioral evidence.

### U2. Activation probe for product-lens

- **Goal:** Evidence that the restated condition stops the routine case and keeps both positive legs, on Claude and Codex.
- **Requirements:** R3, KTD2, KTD3
- **Dependencies:** U1
- **Files:**
  - Create: `tests/skill-eval-cell/fixtures/doc-review-routine-fix/` (a captured real bootstrap fix plan), `doc-review-settled-origin/` (a captured real brainstorm-sourced plan with settled decisions), `doc-review-staked-position/` (explicit prioritization and an outcome prediction), `doc-review-strategic-weight/` (sound premise, strategic weight, no new contested position); each with `.compound-engineering/config.yaml` setting `cross_model_review_mode: off`
  - Modify: `tests/skill-eval-cell/catalog.ts` (four `ce-doc-review` rows, `mode:non-interactive`, `git_init: true`, `timeout_secs` sized for a multi-subagent review, `baseline_ref` at the #1514 merge; `must_not_include` on the `Grade` type), `tests/skill-eval-cell/grade.ts` (`must_not_include`; roster terms scoped to the `TEAM:` trailer), `tests/skill-eval-cell/grade.test.ts`, `tests/skill-eval-cell/pack.ts` (A/B for rows with `baseline_ref`), `tests/skill-eval-cell/catalog.test.ts` (required-read allowlist entries)
- **Approach:** each row's task asks the run to end with a `TEAM:` line; routine and settled-origin rows `must_include` the always-on pair and `must_not_include: ["product-lens"]`; staked-position and strategic-weight rows `must_include` `product-lens`. Grade only the product-lens dimension; adversarial activates on every bootstrap fixture by its provenance rule and is not graded.
- **Execution note:** at least one fixture is a captured real plan rather than an authored one (`docs/solutions/skill-design/authored-eval-corpora-contain-the-happy-path.md`).
- **Test scenarios:**
  - Pre arm: routine fixture names product-lens; post arm: it does not.
  - Staked-position and strategic-weight fixtures name product-lens in both arms.
  - Settled-origin fixture: product-lens absent post.
  - `catalog.test.ts` and `grade.test.ts` pass with the new rows, allowlist entries, and grader term.
- **Verification:** `bun run test:skill-eval-pack -- --id <row> --arm ab --hosts claude,codex`; results recorded in the PR.

---

## Verification Contract

| Gate | Command | Proves |
|---|---|---|
| Deterministic | `bun run test` | U1 pin, U2 catalog guards and grader tests |
| Release | `bun run release:validate`, `bun run plugin:validate` | plugin and marketplace consistency |
| Behavioral | the four `ce-doc-review` rows on Claude and Codex | activation flips on the routine fixture, stays off on settled-origin, holds on staked-position and strategic-weight |

Conflict call-out on the probe size: `docs/solutions/skill-design/ce-doc-review-calibration-patterns.md` records that single runs of an activation change are noise and sets N=3 per cell as the floor. The session settled one trial per cell as proportionate. If a post-arm result ties with pre on the routine fixture, rerun that cell to three trials before reading it as "no effect".

Not covered, by decision: a roster-regression sweep of the untouched lenses (the security-lens pin stays; the other lenses' text is outside the edited block).

---

## Definition of Done

- R1-R3 hold; every gate in the Verification Contract passes at the PR head.
- `skills/ce-doc-review/` differs from `main` only in the product-lens block; `skills/ce-plan/` is untouched.
- U2 rows and fixtures are committed with their results in the PR body.
- No abandoned experiment files remain under `tests/skill-eval-cell/fixtures/`.

## Sources & Research

- `skills/ce-doc-review/references/persona-selection.md` (adversarial's provenance rule), `references/personas/product-lens-reviewer.md` (technique suppression on origin)
- `tests/skill-eval-cell/grade.ts` (`lastTrailer`), `catalog.ts`, `pack.ts`
- `docs/solutions/skill-design/paired-old-vs-new-injection-skill-evals.md` (grade one dimension), `authored-eval-corpora-contain-the-happy-path.md`, `ce-doc-review-calibration-patterns.md` (variance)
- Cross-model panel and literature this session: self-preference bias and model-specific consistent errors (Panickssery et al. 2024; Self-Correction Bench 2025; "Too Consistent to Detect" 2025); same-model fresh-context review recovers part of the gap (Cross-Context Review 2026)
