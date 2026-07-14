---
title: "feat: Surface load-bearing line provenance in ce-code-review findings"
date: 2026-07-13
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
execution: code
product_contract_source: ce-plan-bootstrap
plan_type: feat
origin: "https://github.com/EveryInc/compound-engineering-plugin/issues/883"
---

# feat: Surface load-bearing line provenance in ce-code-review findings

## Goal Capsule

- **Objective:** When a `ce-code-review` finding's judgment depends on line history (pre-existing vs this-diff, intentional design, or P0/P1 confidence), include concise git provenance in finding evidence so humans and downstream agents see who/when/why without a terminal context switch.
- **Authority:** Reframed [#883](https://github.com/EveryInc/compound-engineering-plugin/issues/883); product scope confirmed in session (no new skill, no `--blame` flag, free-form evidence only when history is load-bearing).
- **Execution profile:** Skill-prose + schema description + soft contract pins; behavioral proof via `skill-creator` evals; mechanical pins via `bun test`.
- **Stop conditions:** Stop if the change would require a new skill, a CLI-shaped flag, a new findings-schema property, or always-on / full-file blame dumps — those are out of scope.

---

## Product Contract

### Summary

Enrich `ce-code-review` so load-bearing history judgments carry a short provenance evidence line (short hash, author, subject/date). Keep `git blame` / `git log` as existing inspection tools; make the result user-visible only when it changes the call. No `ce-git` skill and no `--blame` flag.

### Problem Frame

Reviewers already may run `git blame` / `git log` for pre-existing checks and intent, but that provenance rarely appears in finding `evidence` or the interactive report. Users who need authorship context leave the session for a terminal. The original #883 proposal (new skill / blame flag) treated a skill like a shell wrapper and fought the review output contract (diff-scoped, cite `file:line`, do not re-print the diff).

### Requirements

- R1. When a finding's claim depends on line history — `pre_existing`, intentional/historical design, or a P0/P1 claim whose severity/confidence depends on authorship or age — the disk-artifact `evidence` array is expected to include one concise provenance line from targeted blame/log on the cited line (short hash, author, subject and/or date).
- R2. Provenance is **conditional**: omit it when the finding is fully justified from the diff and surrounding code alone (diff-local bugs need no blame theater).
- R3. Provenance is an **additional** evidence item; it must not replace the quote-the-line gate for confidence anchors 75/100 (`file:line -- <code>` remains first when required).
- R4. No new skill, no `--blame` / subcommand-shaped flag, no new findings-schema property, no full-file or always-on per-line blame tables in the report.
- R5. In `pr-remote` / `branch-remote` scope, provenance is gathered against the reviewed head ref (blame/show/log on that ref), not a mismatched workspace tree.
- R6. Missing load-bearing provenance is a soft quality miss against the R1 expectation (Coverage note and/or weaker validator confidence in the reason) — not a hard schema validation failure that drops otherwise-valid findings.
- R7. Interactive report detail lines for Pre-existing and history-dependent P0/P1 findings may echo the same short provenance; compact/`mode:agent` returns keep relying on the artifact `evidence` array (no new merge-tier field).

### Scope Boundaries

**In scope**

- Prose protocol in `ce-code-review` shared templates + light SKILL.md / output-template / schema-description updates
- Brief note on the existing skill docs page (`docs/skills/ce-code-review.md`) that load-bearing findings may cite line provenance — no new skill inventory row or skill-count bump
- Soft pins in `tests/review-skill-contract.test.ts` when load-bearing phrases land
- skill-creator paired evals (positive history-dependent, negative diff-local restraint)
- Closing/linking reframed #883 from the shipping PR

**Deferred to Follow-Up Work**

- A dedicated merge-tier / compact-return provenance field if agent callers later prove artifact-only evidence is insufficient
- Broader provenance UX outside `ce-code-review` (e.g., teach other skills the same evidence line)

**Outside this product's identity**

- A `ce-git` (or similar) skill
- `--blame` or other CLI-shaped flags on `ce-code-review`
- Always dumping blame for every finding or entire files

### Sources / Research

- Issue [#883](https://github.com/EveryInc/compound-engineering-plugin/issues/883) (reframed)
- `skills/ce-code-review/references/subagent-template.md`, `validator-template.md`, `findings-schema.json`, `SKILL.md`, `review-output-template.md`, `diff-scope.md`
- `docs/solutions/skill-design/portable-agent-skill-authoring.md` — conditional evidence protocol earns admission; unconditional always-blame does not
- `docs/solutions/skill-design/confidence-anchored-scoring.md` — free-form evidence over dead schema fields; Stage 5b "introduced by THIS diff" is the consumer of blame
- `docs/solutions/skill-design/paired-old-vs-new-injection-skill-evals.md` — blind old/new + restraint negatives for prose contracts
- `docs/solutions/skill-design/strong-models-mask-defensive-skill-fixes.md` — eval both under- and over-provenance
- `.agy/skills` is a symlink to `skills/` — edit canonical tree only

---

## Planning Contract

### Key Technical Decisions

- KTD1. **Free-form evidence line, not a schema field.** Nothing downstream keys on a stable provenance token today. Adding a property would couple schema, personas, validators, and contract tests for no consumer gain (same reasoning that dropped unused `validated` schema dead weight in prior review work). Extend `evidence.description` text only.
- KTD2. **Falsifiable protocol beside the action.** One gate in `subagent-template.md`: if the finding's confidence / `pre_existing` / introduced-by-this-diff / intent judgment depends on history, append one provenance evidence line from targeted `git blame` / `git log -1` on the cited line; otherwise omit. Mirror into validator reasons and schema description. Prefer admission-quality protocol over motivational prose (`portable-agent-skill-authoring.md`).
- KTD3. **Soft miss, not hard drop.** Missing provenance when history was load-bearing → Coverage note and/or validator `reason` that confidence is weaker — do not invalidate the finding solely for missing provenance (R6). Avoid inflating history-dependent claims to anchor 100 without code-grounded confirmation.
- KTD4. **Shared templates first; personas mostly untouched.** Blame/evidence emit rules live in `subagent-template.md` and `validator-template.md`. Skip per-persona edits unless a persona overrides evidence shape. Optional one-liners in `SKILL.md` Stage 4/5b, `review-output-template.md`, and `diff-scope.md`.
- KTD5. **Verify with paired injection + restraint, not token-parity alone.** Mechanical `toMatch` pins guard that the protocol text exists; behavior is proven with skill-creator old-vs-new fixtures (history-dependent positive; diff-local negative; remote-scope head-ref). Expect capable models may already blame sometimes — grade under- and over-fire.

### Assumptions

- Confirmed call-outs: free-form evidence (not structured field); require provenance only when judgment depends on history.
- Ad-hoc "who wrote this line?" remains a normal agent/`git` ask and is not part of this change.

### Sequencing

U1 (emit protocol) → U2 (validator + orchestrator/output echoes) → U3 (contract pins + skill-creator eval pack). U3 can start drafting fixtures once U1's protocol wording is stable.

---

## Implementation Units

### U1. Provenance emit protocol in shared reviewer template + schema description

**Goal:** Personas emit one concise provenance evidence line iff history is load-bearing; preserve quote-the-line ordering.
**Requirements:** R1, R2, R3, R4, R5.
**Dependencies:** none.
**Files:** `skills/ce-code-review/references/subagent-template.md`, `skills/ce-code-review/references/findings-schema.json` (`evidence.description` text only).
**Approach:** Add a falsifiable evidence rule next to existing `evidence` / `pre_existing` / intentional-design guidance: when the claim depends on line history, run targeted blame/log on the cited line (respecting local-aligned vs reviewed-head-ref for remote scope) and append one short evidence string (illustrative shape: `provenance: <shortsha> <author> <date> - <subject>`). Explicitly forbid full-file dumps and provenance-on-every-finding. State that provenance does not replace the first quote-the-line item at 75/100. Update schema `evidence.description` to mention optional provenance lines for history-dependent claims — no new property, no `minItems` change.
**Patterns to follow:** Existing quote-the-line / `first_evidence` contract (description + template, not a new required field); portable skill admission (one gate beside the action).
**Test scenarios:**
- Happy path: history-dependent finding includes a provenance evidence item after (or in addition to) the code quote.
- Restraint: diff-local finding has no provenance line.
- Ordering: anchor 75+ still has verbatim `file:line -- <code>` as first evidence when the quote-the-line gate applies.
**Verification:** Template and schema description state the same conditional rule; no new JSON properties.

### U2. Validator + orchestrator/output alignment

**Goal:** Pre-existing / introduced-by-this-diff validation and user-facing surfaces prefer short-hash provenance; soft-miss missing load-bearing provenance.
**Requirements:** R1, R5, R6, R7.
**Dependencies:** U1.
**Files:** `skills/ce-code-review/references/validator-template.md`, `skills/ce-code-review/SKILL.md` (Stage 4 / 5b inspection bullets only as needed), `skills/ce-code-review/references/review-output-template.md` (optional detail-line note), optionally `skills/ce-code-review/references/diff-scope.md`, `docs/skills/ce-code-review.md` (short novel-mechanics / evidence note only).
**Approach:** Update validator Q2 example/`reason` guidance to cite short-hash provenance rather than bare calendar year. When history was load-bearing and provenance is absent, prefer a Coverage / reason soft note over dropping the finding. Keep remote-scope inspection rules consistent with U1 (blame/show against reviewed head). Optionally note in the output template that Pre-existing / history-dependent P0–P1 detail lines may include the same short provenance. Add one short paragraph to `docs/skills/ce-code-review.md` so the user-facing skill page matches the new evidence behavior. Do not edit `.agy/` separately (symlink).
**Patterns to follow:** Current validator "introduced by THIS diff" checks; Stage 5b local-aligned vs remote inspection split.
**Test scenarios:**
- Validator reason for pre-existing cites short hash/author when blame was used.
- Soft miss: missing provenance does not alone force `validated: false` for an otherwise-correct finding.
- Remote scope: guidance names reviewed-head-ref inspection, not workspace-only blame.
**Verification:** Validator and SKILL inspection bullets agree with U1; no apply/mutate policy changes.

### U3. Contract pins + skill-creator eval pack

**Goal:** Lock the protocol text mechanically and prove behavior with paired injection.
**Requirements:** R1, R2, R4.
**Dependencies:** U1, U2.
**Files:** `tests/review-skill-contract.test.ts`; eval fixtures/notes under OS temp or skill-creator workflow (not a new always-on skill inventory page unless docs inventory changes — they should not).
**Approach:** Add soft `toMatch` / `toContain` pins for the load-bearing provenance phrases in subagent + validator templates (mirror existing "introduced by THIS diff" pins). Run skill-creator paired old-vs-new evals covering all three required cases: (1) pre-existing/history-dependent positive → provenance present; (2) diff-local negative → no provenance theater; (3) remote-scope head-ref case (R5) → provenance gathered against the reviewed head, not a mismatched workspace. Grade both under-provenance and over-provenance. No `release:validate` skill-count bump (no new skill).
**Patterns to follow:** `tests/review-skill-contract.test.ts` existing template pins; `docs/solutions/skill-design/paired-old-vs-new-injection-skill-evals.md`.
**Test scenarios:**
- Contract test fails if provenance protocol text is removed from subagent or validator templates.
- Paired eval: old prose omits provenance on a history-dependent fixture; new prose includes it.
- Paired eval restraint: new prose does not add blame to a pure diff-local fixture.
- Paired eval remote scope: under `pr-remote`/`branch-remote`, provenance guidance and behavior target the reviewed head ref (R5), not workspace-only blame.
**Verification:** `bun test` green for contract pins; skill-creator eval notes under-/over-fire outcomes honestly (including non-discriminating capable-model ties).

---

## Verification Contract

- `bun test` — especially `tests/review-skill-contract.test.ts` after U3 pins land.
- skill-creator paired evals for U1/U2 behavioral change (positive + restraint + required remote-scope head-ref case).
- Confirm no new skill directory, no README skill-count change, no findings-schema property added (`jq`/diff on `findings-schema.json` properties).
- Manual sanity: one interactive review on a branch with a clear pre-existing line shows provenance in the Pre-existing or detail evidence path.

---

## Definition of Done

- R1–R7 satisfied in `skills/ce-code-review/` canonical tree.
- Contract pins green; skill-creator eval pack run and outcomes recorded in the PR (including honest non-discriminating results if any).
- Shipping PR references/closes reframed #883 (`Fixes #883`).
- No `ce-git` skill, no `--blame` flag, no new schema property, no full-file blame in the report template.
