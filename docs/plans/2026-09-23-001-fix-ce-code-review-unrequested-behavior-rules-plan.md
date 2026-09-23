---
title: Reverse Plan-Alignment Check in ce-code-review - Plan
type: fix
date: 2026-09-23
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
---

# Reverse Plan-Alignment Check in ce-code-review - Plan

## Goal Capsule

- **Objective:** `ce-code-review` reports each behavior rule a diff introduces that nothing in the plan asks for, as an advisory finding for the user that never blocks.
- **Authority:** the user's request, then the repo standard (`AGENTS.md`, `ce-skill-work`, `docs/solutions/skill-design/portable-agent-skill-authoring.md`), then this plan.
- **Execution profile:** one inline pass; two reference files and one test file.
- **Stop conditions:** stop and report if the condition cannot be stated without a list of cases, or if placing it outside `intent-and-plan.md` turns out to be required for a depth path to read it.
- **Tail ownership:** the calling pipeline (`lfg`) owns review, commit, push, PR, and CI.

## Product Contract

### Summary

Add the reverse direction to `ce-code-review`'s plan requirements check. Today it asks only whether each plan requirement landed in the diff. After this change it also reports behavior rules the diff adds that the plan never asked for, and leaves the keep-or-remove decision to the user.

### Problem Frame

arXiv 2609.12039 ("Reality Is the Final Verifier") names hallucinated requirements as a gap that widens with agent authorship: the agent invents a business rule, such as silently dropping duplicate refund requests, and implements it correctly. `ce-code-review` checks plan -> diff only, so an invented rule passes review as long as every planned requirement is also present. The `api-contract` persona's "undocumented behavior changes" covers interface semantics, not business rules the plan never mentioned. The skill's own outcome is a correct change "within the agreed scope", so the one-directional check is a missing half, not a new capability.

### Requirements

**Detection**

- R1. When a plan is found, the review reports each behavior rule the diff introduces that nothing in the plan asks for, on every depth path.
- R2. The check is one condition with at most one illustrative example and one exclusion, not a list of cases.

**Routing and reporting**

- R3. Each such finding is P3, `autofix_class: advisory`, `owner: human`, whatever the `plan_source`; it never enters the actionable queue and never changes the verdict.
- R4. The requirements completeness results name the unrequested rules on every depth path: the report section on the full path, and `requirements_completeness` wherever the receipt carries it.

### Scope Boundaries

- No new reviewer persona and no new spine stage.
- No reverse check when no plan is found (see KTD3).
- No change to how `lfg` or other callers treat advisory findings.

### Deferred to Follow-Up Work

- `lfg`'s residual record (step 6, `skills/lfg/references/review-followup.md`) carries unapplied actionable findings and settled-decision conflicts, not human-owned advisory findings. In an `lfg` run, a reverse-check finding therefore reaches `review.json` but not the PR body. Carrying human-owned advisory findings into that record is an `lfg` change that covers every such finding, not only this one.
- An eval catalog row pair in `tests/skill-eval-cell/catalog.ts` for the invented-rule case and its restraint twin, so the check can be run on Claude and Codex by someone with those CLIs.
- Stage 2b in `intent-and-plan.md` restates the requirement-extraction order that the Plan Requirements Completeness section already owns; collapsing that duplicate is a separate cleanup.

## Planning Contract

### Key Technical Decisions

- KTD1. **State the check beside the forward rule; run it where the forward check runs.** The condition, route, and listing rule go in `skills/ce-code-review/references/intent-and-plan.md`, section "Plan Requirements Completeness". The lite and focused paths read that section by name (`references/depth-paths.md`) and run the check in their own context. On the full path, the forward check runs in the report leaf at `finish-review.md` Stage 6 item 4, so the reverse check runs there too. Item 4 must tell the leaf to read the plan document at `plan.path`, because `finish-input.json` carries only the extracted requirement and unit lists, and a rule a KTD or unit asks for would otherwise read as unrequested. Running at Stage 6 also keeps these findings clear of Stage 5's soft-bucket demotion, which rejects claims with no defect consequence.
- KTD2. **Advisory, owned by the user, never blocking.** (session-settled: user-approved — chosen over routing it like an unaddressed explicit-plan requirement into the actionable queue: whether an unrequested rule is wanted is a product decision, and a correct diff is no evidence either way.) P3 keeps it clear of the verdict rule, which caps only on open P0 and P1 findings.
- KTD3. **Only the plan can vouch for a rule.** The Stage 2 intent summary may be inferred from commits and the diff, which the same author wrote, so it cannot show that a rule was requested. Without a plan there is nothing independent to compare against, so the reverse check does not run. A rule the plan asks for anywhere, including a KTD or a unit's approach, counts as requested. Rejected: letting only the Product Contract vouch, which would flag every how-level rule a plan already made visible.
- KTD4. **One condition, one example, one exclusion.** A behavior rule is a decision about what users or callers observe that a product owner would otherwise have made. One subordinated example (silently dropping a repeated refund request) anchors literal hosts, per `docs/solutions/skill-design/subordinate-the-failing-shape-to-the-condition.md`. The exclusion (internal structure, refactors, handling of inputs a requirement already covers) comes last so nothing after it competes. Rejected: the source doc's six-verb list (kept, dropped, rejected, retried, expired, charged), which is a case catalog standing in for the condition.
- KTD5. **Pin the locator phrase and the route, not the prose.** The test finds the reverse-check paragraph by the phrase `unrequested behavior rule` inside the owning section, bounded by `## Plan Requirements Completeness` and the next heading of any level (today `### Stage 2: Intent discovery`). It asserts that paragraph carries the route tokens `P3`, `autofix_class: advisory`, and `owner: human`, and that Stage 6 item 4 carries the same phrase. The forward paragraph already contains the route tokens, so the phrase is what makes the pin falsifiable. Other wording stays free, per `docs/solutions/skill-design/bound-contradiction-checks-to-named-guidance.md`.

### Assumptions

- P3 is the right severity. The forward check already uses P3 advisory for inferred-plan omissions, and the verdict rule ignores P2 and P3 either way.

## Implementation Units

### U1. State and render the reverse check

- **Goal:** Add the reverse condition to the owning section and name it in the report line.
- **Requirements:** R1, R2, R3, R4
- **Dependencies:** none
- **Files:**
  - `skills/ce-code-review/references/intent-and-plan.md`
  - `skills/ce-code-review/references/finish-review.md`
- **Approach:**
  1. In "Plan Requirements Completeness", after the forward-routing paragraph, add one paragraph that states the condition, the one subordinated example, the route, the listing rule (R4), and the exclusion, per KTD2 and KTD4.
  2. In `finish-review.md` Stage 6 item 4, add one sentence telling the report leaf to run that section's reverse check against the reviewed diff and the plan document at `plan.path`, and to list what it finds (KTD1).
  3. Follow `ce-skill-work` edit mode: plain sentences, no shouting, nothing else in the section restated.
- **Patterns to follow:** the forward rule's routing sentence in the same section; the report-line cross-reference already in item 4.
- **Test scenarios:** covered by U2.
- **Verification:** a reader of the section alone can tell what counts, what does not, how it routes, where it is listed, and that it never blocks.

### U2. Pin the contract

- **Goal:** A deletion or re-route of the reverse check fails `bun test`.
- **Requirements:** R1, R3, R4
- **Dependencies:** U1
- **Files:** `tests/review-skill-contract.test.ts`
- **Approach:** add one test case next to "keeps plan requirements completeness compatible with current and legacy unit formats", per KTD5.
- **Test scenarios:**
  - The "Plan Requirements Completeness" section of `intent-and-plan.md`, ending at the next heading of any level, contains a paragraph with the phrase `unrequested behavior rule`, and that paragraph contains `P3`, `` `autofix_class: advisory` ``, and `` `owner: human` ``.
  - Removing the paragraph, or moving it into Stage 2, 2b, or 2c, fails the test.
  - `finish-review.md` Stage 6 item 4 contains the phrase `unrequested behavior rule`.
- **Verification:** the new case passes on the edited tree and fails when the paragraph is removed.

## Verification Contract

| Gate | Command or method | Applies to |
|---|---|---|
| Contract pin | `bun test tests/review-skill-contract.test.ts` | U2 |
| Full suite | `bun run test` | all |
| Release metadata | `bun run release:validate` | all |
| Behavioral eval | Fresh-agent read-only probe of the requirements check on a throwaway repo: an invented-rule diff (expect one advisory, human-owned finding) and a restraint diff with a helper refactor, covered input handling, and a new log message the plan never mentions (expect none). Pre-change and post-change skill arms. | U1 |

The repo's eval driver (`bun run test:skill-eval-cell`) needs `claude` or `codex` on PATH. Neither exists in this environment, so the behavioral eval runs as a single-host eval with fresh Cursor subagents and is labeled that way in the PR.

## Definition of Done

- U1 and U2 are complete and the three command gates pass.
- The behavioral eval ran, or its exact skip reason is recorded in the PR.
- No abandoned-attempt text remains in the touched files.
