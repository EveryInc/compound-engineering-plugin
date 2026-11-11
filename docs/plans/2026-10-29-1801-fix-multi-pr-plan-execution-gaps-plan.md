---
title: Multi-PR Plan Execution Gaps - Plan
type: fix
date: 2026-10-29
artifact_contract: ce-unified-plan/v1
product_contract_source: ce-plan-bootstrap
execution: code
---

# Multi-PR Plan Execution Gaps - Plan

## Goal Capsule

- **Objective:** A plan that ships as several PRs gets all of its PRs built without a human restarting each one, merges them in the order and with the deploy gates the plan states, and keeps the review items left for its author in front of every session that builds a later PR.
- **Means:** Conditions added to the owning reference files of `ce-work`, `ce-code-review`, `ce-plan`, `lfg`, and `ce-doc-review`, with one new `ce-work` reference that owns multi-PR delivery (KTD1–KTD10). No `SKILL.md` body changes.
- **Authority hierarchy:** Product Contract (R-IDs) > Key Technical Decisions > Implementation Units. `docs/solutions/skill-design/portable-agent-skill-authoring.md` governs how each change is written.
- **Stop conditions:**
  - Stop and report if a change cannot be made without editing a `SKILL.md` that would exceed the Codex 8,000-byte budget.
  - Stop and report if the paired eval shows `lfg`'s return-to-caller path building fewer than all PR groups.
- **Execution profile:** Ships as one PR. Every change is skill prose plus small test guards, and the fixes describe one flow.
- **Who finishes:** `lfg` implements, reviews, and opens the PR.

---

## Product Contract

### Summary

Standalone `ce-work` on a multi-PR plan builds every PR group it can, skipping groups already merged or already in an open PR, and lets only merging and deploying go in order. It opens the groups as a stack where the project stacks PRs, and otherwise publishes each group once the group before it merges. On hosts that can start separate long-lived sessions, it hands groups to those sessions and coordinates them. `ce-plan` marks which dependencies only order the merges and which must be satisfied before a group can start, including deploys. `ce-doc-review` in non-interactive mode writes the fixes and decisions it leaves for the author into the document.

### Problem Frame

Watching a live `ce-plan` -> `ce-work` run on an eight-PR serial plan (last30days-com) exposed the gaps. `ce-work`'s intake says the plan's units are the whole scope of a run, yet nothing tells it how a multi-PR plan ships, so the agent improvised: it built and opened PR1 (#397), then stopped. #397 merged, and the thread sat idle; each of the seven remaining PRs would need a person to restart it and wait through a full build, review, CI, and merge cycle. Most of that waiting is not required. Later groups need earlier groups' code, which exists before it merges; only the merges must be ordered, plus one real deploy gate (a worker PR that must not merge until the app PR before it is live), which `ce-plan`'s merge-only delivery conditions cannot express. The plan's document review also left five suggested fixes and one decision for the author, reported only in chat, so sessions building later PRs would never see them.

### Requirements

**Building a multi-PR plan**

- R1. A standalone `ce-work` run on a plan whose execution profile says it ships as several PRs builds every PR group whose work is neither on the default branch nor in an open PR and whose start dependencies are met. A dependency that only orders merges does not stop a group from being built: a group that uses an earlier group's code is built on top of that group's built branch, so it starts once that group is built, and groups that share no code build at the same time.
- R2. When the run cannot tell from the repository and the code host which groups are merged, open, or built, it stops and reports what it found rather than rebuilding a group or skipping one.
- R3. Each group's final validation, code review, and PR description judge that group's units and the requirements they trace to.
- R4. The run's report lists every group with its state (merged, open, built and waiting, blocked) and what each remaining group waits on, or says the plan is complete.
- R5. A `ce-work` run invoked by a caller (`mode:return-to-caller`) keeps building every unit on one branch; the caller owns how the work is split into PRs.

**Publishing and landing in order**

- R12. Where the project's instructions allow stacked PRs, the built groups open as one stack in merge order. Where they do not, a group publishes on a fresh branch from the default branch once every group it waits on has merged, carrying only its own changes, and later groups stay built locally until then. A group published after its predecessors merge reruns its final validation and code review on that fresh branch first; when the merged predecessor changed in a way that breaks the group, the group is rebuilt rather than published, and the report says so.
- R13. When the host can wake this session on a change to a PR, a group waiting on a predecessor's merge, to publish or to start, continues when that predecessor merges, without a restart. When it cannot, the report names the waiting groups and says that re-running `ce-work` on the plan continues from where it stopped.

**Deploy order between PR groups**

- R6. Each PR group's wait line says, for each group it waits on, whether the dependency only orders the merges or must be satisfied before this group can start, and names any deployment that must be live first. A deploy dependency gates the waiting group's merge unless its build or verification needs the deployed state; a start dependency on a deployment counts as met only when the user confirms the deployment.
- R7. A PR built from a group with a deploy dependency says in its description which deployment must be live before it merges.
- R8. No skill merges past a deploy dependency on the user's behalf: `lfg` does not carry a merge grant when any stack layer carries one, and the close-out says why the merge is still the user's.

**Separate sessions per PR group**

- R14. On a host that can start separate long-lived sessions in their own checkouts, and whose rules allow the agent to start them, standalone `ce-work` hands each PR group to its own session automatically and coordinates them from the main thread. A session for a group that builds on an earlier group starts from that group's built branch; when the host's sessions cannot reach that branch, the main thread builds that chain. On other hosts the main thread does the work.
- R15. Which session watches each PR follows the host's rules; when a group's session may not watch its PR, the coordinator watches it.

**Review leftovers that persist**

- R9. `ce-doc-review` in non-interactive mode records each suggested fix it did not apply and each decision it left for the author in the reviewed document, so a later session reading only the document sees them.
- R10. Recorded entries read as non-blocking review leftovers, distinct from a plan's blocking Open Questions, so executors do not refuse the plan because of them.
- R11. A recorded entry exists only while its item is open: when the caller, a later review, or the session that settles it applies or dismisses the item, its entry is removed.

### Key Decisions

- **Standalone `ce-work` builds ahead and lets only landing go in order.** (session-settled: user-directed — chosen over one group per run and over always building strictly in sequence: one group per run makes an N-PR plan need N manual restarts, and building needs only the earlier code, not its merge.) Governs R1, R12, R13.
- **PR groups run in separate long-lived sessions automatically where the host allows.** (session-settled: user-directed — chosen over offering once, waiting to be asked, or always using the main thread: a PR's CI, review, and merge outlive a turn and a subagent, and sessions keep the main thread free.) Governs R14, R15.
- **The plan states deploy dependencies and which dependencies gate starting.** (session-settled: user-approved — chosen over merge-order-only delivery conditions: a merge-ordered stack cannot express a deploy gate.) Governs R6.
- **Non-interactive document review records its leftovers in the document.** (session-settled: user-approved — chosen over reporting them only in the review's return: later PRs built in fresh sessions lost them.) Governs R9.

### Scope Boundaries

- Not building a progress tracker in the plan. Plans stay free of execution status (`skills/ce-plan/references/plan-sections.md`, "Plan metadata fields"); `ce-work` reads group state from git and the code host.
- Not teaching any skill to observe deployments. R8 withholds the merge grant instead; evidence that a host can confirm deploy state would change that call.
- Not using separate sessions on `lfg`'s return-to-caller path. `lfg` needs every group on one branch to build its stack (#1950); R5 keeps that path as it is.
- Not recording FYI observations in the document. The settled decision covers fixes and decisions only.

### Sources

- Live session: last30days-com plan `docs/plans/2026-10-29-1701-feat-scheduled-delivery-windows-plan.md`, PR #397 (PR1 of 8, merged), and that repo's branch rules (squash merges, fresh branch from `origin/main` per PR, no force-push, migrations applied on merge).
- #1948 (ce-plan PR groups), #1950 (lfg stack of PR groups).
- `docs/solutions/skill-design/portable-agent-skill-authoring.md`, `docs/solutions/skill-design/skill-gates-state-conditions-not-prescribed-git-commands.md`.

---

## Planning Contract

### Key Technical Decisions

- KTD1. **One new `ce-work` reference owns multi-PR delivery.** `skills/ce-work/references/multi-pr-delivery.md` states group state, build-ahead, publishing, waiting, and sessions in one place; `work-intake.md` points to it when the plan ships several PRs and the run is standalone. `ce-work`'s `SKILL.md` has about 79 bytes of Codex budget left, so nothing goes there. Implements R1, R12, R13, R14 (session-settled: user-directed — chosen over one group per run: an N-PR plan would need N manual restarts).
- KTD2. **The multi-PR rules key on standalone mode, not on the plan shape.** `lfg` calls `ce-work mode:return-to-caller` once and stacks every group from the resulting branch (`skills/lfg/SKILL.md` step 2, `skills/lfg/references/shipping.md`), and `lfg`'s return check does not verify unit coverage (`skills/lfg/references/work-return.md`). Implements R5.
- KTD3. **Group state is read from git and the code host, with a stop on ambiguity.** Each group's branch and PR description name the plan path and the group, and state is read through that marker: merged when a merged PR carries it, open when an open PR carries it, built when an unpublished branch carries it. Squash merges leave no ancestry, so the marker, not commit history, is the evidence. A built branch is visible only where it exists, so a run that finds neither a PR nor a branch for a group treats it as unbuilt only when no session it coordinates is building it. The condition is stated, not the commands that check it (`skill-gates-state-conditions-not-prescribed-git-commands.md`). Merged and open groups are skipped, which closes the duplicate-PR hole a single-group draft had. Implements R1, R2, R4.
- KTD4. **Stack or publish-on-merge follows the project's instructions.** Stacked groups go to `ce-commit-push-pr` stack mode as explicit stack intent with one layer per group, the same handoff `lfg` uses. Without stacking, a published branch carries only that group's changes on top of the current default branch, so squash merges and no-force-push rules hold, and the group's validation and review rerun there before it publishes. Implements R12.
- KTD5. **A group waiting on a merge, to publish or to start, is resumed by the host where it can, and by re-running `ce-work` where it cannot.** Because KTD3 reads state fresh, a later run picks up built-and-waiting groups without any record in the plan. Implements R13.
- KTD6. **Separate sessions are a host capability, described as one.** The reference names the capability (a separate long-lived session in its own checkout that the agent may start and that outlives the current turn) and gives T3, Orca, and Codex cloud tasks only as examples. Each session gets the plan path, its group, and the built branch it builds on; the coordinator keeps the group states, starts a group's session once the group it builds on is built and its start dependencies are met, and watches PRs the host does not let sessions watch. `workspace-setup.md`'s "worktree only when the user asked" rule gains this case. Implements R14, R15 (session-settled: user-directed — chosen over offering once or always using the main thread: a PR's lifecycle outlives a turn and a subagent).
- KTD7. **The active group reaches `ce-code-review` as named scope.** `ce-code-review` turns every unaddressed unit of an explicit `plan:` into a P1 (`skills/ce-code-review/references/intent-and-plan.md`). It has no argument that can carry a group today, so it gains a `plan_group:<group heading>` token beside `plan:` (`references/modes-and-output.md`) and one condition: when that token names a PR group of a multi-PR plan, completeness covers that group's units and the requirements they trace to. Implements R3.
- KTD8. **Dependency kind and deploy gates live on the group's `Waits on:` line, inside "Safe after every merge".** Keeping three delivery conditions keeps `final-review.md`'s count true. Units keep their `### U<N>.` headings so `ce-work`'s heading map still finds them. Implements R6 (session-settled: user-approved — chosen over merge-order-only delivery conditions: a stack cannot express a deploy gate).
- KTD9. **`ce-doc-review` owns the recording; the existing Defer mechanism is reused.** `skills/ce-doc-review/references/open-questions-defer.md` already writes `## Deferred / Open Questions` > `### From YYYY-MM-DD review` entries with dedup, and reviewer personas already skip that section (`references/subagent-template.md`). Non-interactive mode uses it with three differences: a proposed fix's entry keeps its change in intent language, a write failure is reported in the return instead of asking, and the section states that its entries do not block implementation. Implements R9, R10 (session-settled: user-approved — chosen over reporting leftovers only in the return).
- KTD10. **Whoever resolves an item removes its entry.** The removal rule lives with the entry format in `open-questions-defer.md`; `ce-plan`'s `plan-handoff.md` cites it where it already forbids dismissed items reappearing, `walkthrough.md` and `bulk-preview.md` cite it where an Apply or Skip completes, and `multi-pr-delivery.md` cites it for sessions that settle an item in code. Implements R11.

### Assumptions

- A host that can start separate sessions also lets the coordinator learn when a session's work finished, so it can start the next group; where it does not, the coordinator falls back to reporting (R13's second branch).
- The only non-interactive caller of `ce-doc-review` is `ce-plan`; eval cells also invoke it with an editable document.

---

## Implementation Units

### U1. `ce-work` builds every eligible PR group and lands them in order

- **Goal:** A standalone run on a multi-PR plan builds every group it can, publishes them as a stack or as their predecessors merge, and reports each group's state.
- **Requirements:** R1, R2, R3, R4, R5, R7, R10, R12, R13; KTD1, KTD2, KTD3, KTD4, KTD5, KTD7.
- **Dependencies:** U2, U3.
- **Files:**
  - `skills/ce-work/references/multi-pr-delivery.md` (new)
  - `skills/ce-work/references/work-intake.md` (the "Do not re-scope the plan" paragraph points to the new reference for a standalone multi-PR run; the sized plan read includes `Deferred / Open Questions` as non-blocking context)
  - `skills/ce-work/references/return-to-caller.md` (one line: build every unit on one branch; the caller owns the PR split)
  - `skills/ce-work/references/shipping-workflow.md` (review invocation passes `plan_group:`; Final Validation and PR context are per group; Notify User cites the group report)
  - `tests/skills/ce-work-outcome-spine.test.ts`
- **Approach:**
  1. Write `multi-pr-delivery.md` as conditions: the group marker, group state, and the skip rule (KTD3), what blocks building versus merging and building on a predecessor's branch (R1, R6), stack versus publish-on-merge with revalidation (KTD4), waiting and resuming (KTD5), per-group shipping (R3, R7), the report (R4), and the removal rule citation (KTD10).
  2. Keep the `work-intake.md` rule that the user never picks a subset and session size never splits work; the new reference is the plan's own split.
  3. Cite references as `references/<file>.md`.
- **Patterns to follow:** existing condition style in `work-intake.md` and `execution-strategy.md`.
- **Test scenarios:**
  - A guard asserts `work-intake.md` points to `references/multi-pr-delivery.md` and that `multi-pr-delivery.md` names `mode:return-to-caller` as the exception.
  - Existing pins in `ce-work-outcome-spine.test.ts` and `tests/skills/unified-plan-artifact-contract.test.ts` still pass.
- **Verification:** The paired eval on a multi-group fixture shows a standalone run skipping a merged group and a group with an open PR, building the rest with each dependent group on its predecessor's branch, stopping on an ambiguous group state, and reporting every group's state and blocker; and a return-to-caller run building every unit on one branch.

### U7. `ce-work` hands PR groups to separate sessions where the host allows

- **Goal:** On a host with long-lived sessions, each PR group runs in its own session and the main thread coordinates.
- **Requirements:** R14, R15; KTD6.
- **Dependencies:** U1.
- **Files:**
  - `skills/ce-work/references/multi-pr-delivery.md` (sessions section)
  - `skills/ce-work/references/workspace-setup.md` (the worktree rule gains the multi-PR session case)
- **Approach:**
  1. State the capability, the automatic default where the host's rules allow it, and the main-thread fallback.
  2. State what each session receives (plan path, its group, the built branch it builds on) and what the coordinator keeps (group states, starting a session once the group it builds on is built and its start dependencies are met, PR watching the host leaves to it), plus the main-thread fallback for a chain the host's sessions cannot reach.
  3. Name host examples only as examples.
- **Test scenarios:**
  - A guard asserts `multi-pr-delivery.md` states the fallback to the main thread.
- **Verification:** A live run on a host with sessions (T3 delegated worktree tasks) on a multi-PR fixture plan starts one session per eligible group; recorded as PR evidence, or named as not run.

### U2. `ce-code-review` judges plan completeness against a named PR group

- **Goal:** A review of one group's diff does not report the plan's other groups as missing work.
- **Requirements:** R3; KTD7.
- **Dependencies:** none.
- **Files:**
  - `skills/ce-code-review/references/intent-and-plan.md` (Plan Requirements Completeness)
  - `skills/ce-code-review/references/modes-and-output.md` (token table: `plan_group:`)
  - `tests/pipeline-review-contract.test.ts` or the nearest existing `ce-code-review` contract test
- **Approach:** Add one condition to Plan Requirements Completeness: when the invocation names a PR group of a plan that ships as several PRs, the completeness check and its findings cover that group's units and the requirements they trace to; other groups' units are out of scope, not findings.
- **Test scenarios:**
  - A guard asserts `plan_group:` is in the token table and the condition is present in `intent-and-plan.md`.
- **Verification:** `bun run test:skill-guards` passes.

### U3. `ce-plan` states dependency kinds and deploy gates

- **Goal:** A multi-PR plan says which dependencies gate starting a group and which only order merges, including deploys, in a form executors find.
- **Requirements:** R6; KTD8.
- **Dependencies:** none.
- **Files:**
  - `skills/ce-plan/references/structure.md` (3.3 Delivery shape, "Safe after every merge")
  - `skills/ce-plan/references/final-review.md` (5.1 delivery-condition check)
  - `skills/ce-plan/references/plan-sections.md` (Implementation Units hard-floor entry)
  - `skills/ce-plan/references/markdown-rendering.md` and `skills/ce-plan/references/html-rendering.md` (group heading and `Waits on:` line; units keep their unit headings)
  - `tests/skills/unified-plan-artifact-contract.test.ts`
- **Approach:**
  1. State that each group heading is followed by a `Waits on:` line naming each waited-on group with its kind (merge order, or needed before start) and any deployment that must be live first; a deploy dependency gates merging unless the build needs the deployed state (R6).
  2. Extend "Safe after every merge" to hold after each deployment.
  3. Update the matching phrase in `final-review.md`; pin the group form in both renderers.
- **Test scenarios:**
  - A guard asserts `structure.md` contains the `Waits on:` label and a deploy clause under "Safe after every merge".
- **Verification:** `bun run test:skill-guards` passes; a fresh-agent plan for a two-service change marks the deploy dependency on the waiting group.

### U4. `lfg` withholds a merge grant past a deploy dependency

- **Goal:** A merge-granted `lfg` run never lands a layer before the deployment it waits on.
- **Requirements:** R7, R8; KTD8.
- **Dependencies:** U3.
- **Files:**
  - `skills/lfg/references/shipping.md` (step 9 stack layers, step 10 merge grant, step 11 close-out)
- **Approach:**
  1. When naming stack layers, carry each group's deploy dependency into that layer's PR-description context.
  2. When any layer carries a deploy dependency, hand off `posture:stack-ready` instead of `posture:stack-land`, and say in the close-out which deployment the user must confirm before merging.
- **Test scenarios:**
  - A guard asserts `shipping.md` ties the stack-land grant to the absence of a deploy dependency.
- **Verification:** `bun run test:skill-guards` passes.

### U5. Non-interactive `ce-doc-review` records its leftovers in the document

- **Goal:** Suggested fixes and decisions left for the author persist in the reviewed document as non-blocking entries that disappear once resolved.
- **Requirements:** R9, R10, R11; KTD9, KTD10.
- **Dependencies:** none.
- **Files:**
  - `skills/ce-doc-review/references/open-questions-defer.md` (scope line, entry format for proposed fixes, non-interactive failure handling, non-blocking section lead, removal rule)
  - `skills/ce-doc-review/references/modes.md` (non-interactive bullet list)
  - `skills/ce-doc-review/references/synthesis-and-presentation.md` (non-interactive result: a recorded-in-document line, or not recorded with the reason)
  - `skills/ce-doc-review/references/walkthrough.md` and `skills/ce-doc-review/references/bulk-preview.md` (cite the removal rule where Apply or Skip completes for an item with a recorded entry)
  - `skills/ce-plan/references/plan-handoff.md` (5.3.8: removing entries for items `ce-plan` dismisses or completes)
  - `tests/pipeline-review-contract.test.ts`
- **Approach:**
  1. Lift "interactive mode only" so non-interactive mode records each proposed fix and decision it returns, after synthesis and before returning.
  2. A proposed fix's entry includes its change in intent language; an interactive Defer entry is unchanged.
  3. On a write failure or a read-only document, record nothing and say so in the return; never ask.
  4. Give the section a one-line lead saying its entries are review leftovers that do not block implementation.
  5. State the removal rule (KTD10) once here; other files cite it.
  6. Keep every string `tests/pipeline-review-contract.test.ts` pins in `open-questions-defer.md`.
- **Test scenarios:**
  - Existing pins in `pipeline-review-contract.test.ts` (the `open-questions-defer.md` strings and the non-interactive envelope headers) still pass.
  - A new guard asserts `open-questions-defer.md` covers non-interactive mode and states the removal rule.
- **Verification:** The paired eval shows a non-interactive review of a plan with an unapplied proposed fix writing it under `Deferred / Open Questions`, and a `ce-work` intake run on that plan reading the entry as non-blocking context.

### U6. User-facing guides

- **Goal:** The guides describe the new behavior where they describe the old.
- **Requirements:** R1, R6, R8, R9, R14.
- **Dependencies:** U1, U3, U4, U5, U7.
- **Files:** `docs/guides/ce-work.md`, `docs/guides/ce-plan.md`, `docs/guides/lfg.md`, `docs/guides/ce-doc-review.md`
- **Approach:** Update only passages that state the old behavior (for example `ce-doc-review.md`'s non-interactive description); add a short passage where a guide covers multi-PR plans.
- **Test expectation:** none -- documentation only.
- **Verification:** `bun run test` passes (release-metadata and docs guards).

---

## Verification Contract

| Gate | When |
| --- | --- |
| `bun run test:skill-guards` | After each unit |
| `bun run test` | Before the PR |
| `bun run typecheck` | Before the PR, if any test file changed |
| `bun run release:validate` | Before the PR |
| Paired fresh-agent eval (`bun run test:skill-eval-cell`), pre-change vs current tree, on Claude and Codex | Before the PR: U1 (the cases in U1's Verification; `mode:return-to-caller` builds every unit on one branch) and U5 (non-interactive review records an unapplied fix in the document) |
| Live session-handoff check on T3 | Before the PR when the host is available (U7); otherwise named in the PR as not run |

---

## Definition of Done

- R1–R15 are met by the units above.
- No `SKILL.md` body changed; every Codex budget test passes.
- The paired evals pass on both hosts, or the PR states which cell could not run and why.
- No text from dropped approaches (the one-group-per-run rule) remains in the diff.
