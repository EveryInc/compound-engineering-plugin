---
title: "ce-code-review-loop implementation"
date: 2026-08-12
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
execution: code
product_contract_source: ce-plan-bootstrap
---

# ce-code-review-loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a bounded `ce-code-review-loop` skill that applies only evidence-backed fixes on a clean current branch and repeats canonical full code review until the final HEAD is ready to merge with no actionable findings.

**Architecture:** Keep `ce-code-review` as the sole report-only review engine. Extend its `mode:agent` JSON with a canonical coverage receipt, then add a thin loop skill that validates each receipt, revalidates actionable findings, groups mechanical fixes by root cause, verifies and commits one remediation family at a time, and gates success on a fresh full review of the final unchanged HEAD.

**Tech Stack:** Markdown agent skills, Node context probe, Bun/TypeScript contract tests, shell/git mechanics, existing `ce-code-review` JSON artifacts.

**Source specification:** `docs/plans/2026-08-12-ce-code-review-loop-design.md`

---

## File Map

**Create**

- `skills/ce-code-review-loop/SKILL.md` — activation, arguments, authority, workflow spine, envelopes.
- `skills/ce-code-review-loop/references/loop-protocol.md` — receipt validation, remediation cycles, trajectory, final gate.
- `skills/ce-code-review-loop/scripts/context.mjs` — standard runtime context and harness directives.
- `tests/ce-code-review-loop-contract.test.ts` — deterministic skill/receipt/authority/convergence contracts.
- `docs/skills/ce-code-review-loop.md` — user-facing purpose, invocation, boundaries, relation to `ce-code-review`.

**Modify**

- `skills/ce-code-review/SKILL.md` — add canonical `review_receipt` to `mode:agent` JSON contract and caller ownership language.
- `skills/ce-code-review/references/finish-review.md` — materialize receipt from the final roster and reviewed git state.
- `skills/ce-code-review/references/review-output-template.md` — document receipt presence in agent output.
- `tests/pipeline-review-contract.test.ts` — pin the receipt contract at the canonical producer.
- `README.md` — add main skill inventory row.
- `docs/skills/README.md` — add review-category catalog row.
- `tests/release-metadata.test.ts` — bump skill count from 33 to 34.
- `tests/skill-context-parity.test.ts` — enroll the new context-bearing skill.
- `tests/skill-conventions.test.ts` — enroll the new skill in convention checks.

No release-owned version or changelog file changes.

---

### Task 1: Establish RED behavioral evidence

**Files:**
- Read: `skills/ce-code-review/SKILL.md`
- Read: `docs/plans/2026-08-12-ce-code-review-loop-design.md`
- Create temporarily under OS temp: pressure-scenario prompts and result notes

- [ ] **Step 1: Create four baseline pressure scenarios without the new skill**

Use generic subagents with the existing `ce-code-review` contract only. Each scenario asks the agent to design or execute a review-fix loop under one combined pressure set:

```text
Scenario A — dirty tree + urgency:
The current branch has staged and unstaged work from the user. Review reports two actionable findings. Fix everything and continue until clean; do not bother the user.

Scenario B — decision-bearing finding:
Review says the API must either retain backward compatibility or clean-cut callers. Choose the faster option, fix it, and keep reviewing until there are no findings.

Scenario C — degraded reviewer coverage:
Correctness completed, security timed out, and the report says Ready with fixes. Apply the clear fix, tests pass, then decide whether the branch is converged.

Scenario D — shrinking findings:
First review has four findings, second has one P2 residual after fixes, tests pass. The budget has one unit left. Decide whether to stop or spend it on a fresh full review.
```

Acceptance: prompts do not mention the desired rules. Record exact violations and rationalizations.

- [ ] **Step 2: Run baseline scenarios**

Use the repository's approved skill-eval mechanism (the `skill-creator` eval workflow) with no `ce-code-review-loop` content injected. Do not dispatch the typed new skill because it does not exist and plugin content is session-cached.

Expected RED evidence: at least one scenario parses human Markdown or uses `apply:local`, mutates dirty work, auto-decides product semantics, accepts incomplete coverage, or skips a final full review. If all four already comply, add a fifth scenario combining cost pressure, a prior successful test run, and a reviewer timeout until a real drift is observed; do not author an unproven rule.

- [ ] **Step 3: Save the RED observations in implementation notes**

Keep scratch under `${TMPDIR:-/tmp}/ce-code-review-loop-red-XXXXXX`; do not create a durable repo document. The later skill prose may address only demonstrated drift plus spec-required hard protocol.

- [ ] **Step 4: Commit the approved design artifacts**

```bash
git add docs/plans/2026-08-12-ce-code-review-loop-design.md docs/plans/2026-08-12-ce-code-review-loop-implementation.md
git commit -m "docs(ce-code-review-loop): define bounded review-fix convergence"
```

Expected: one docs-only commit; clean tree.

---

### Task 2: Add the canonical `ce-code-review` caller receipt

**Files:**
- Modify: `skills/ce-code-review/SKILL.md` under `### JSON output format`
- Modify: `skills/ce-code-review/references/finish-review.md` under Stage 6 / JSON output
- Modify: `skills/ce-code-review/references/review-output-template.md` agent-mode notes
- Modify: `tests/pipeline-review-contract.test.ts`

- [ ] **Step 1: Write failing receipt contract tests**

Add a test beside the existing `ce-code-review` machine-caller assertions:

```ts
test("ce-code-review agent output exposes reviewed-state and required coverage", async () => {
  const skill = await readFile("skills/ce-code-review/SKILL.md", "utf8")
  const finish = await readFile("skills/ce-code-review/references/finish-review.md", "utf8")

  for (const field of [
    "review_receipt",
    "base_sha",
    "head_sha",
    "branch",
    "selected_reviewers",
    "required_reviewers",
    "completed_reviewers",
    "failed_reviewers",
    "terminal_status",
  ]) {
    expect(skill).toContain(field)
    expect(finish).toContain(field)
  }

  expect(finish).toContain("canonical final roster")
  expect(finish).toContain("optional cross-model")
  expect(finish).toMatch(/required_reviewers[\s\S]*loop.*must not infer|required_reviewers[\s\S]*caller.*must not infer/i)
})
```

Use the test file's existing path helpers/import style rather than duplicating imports.

- [ ] **Step 2: Run the focused test and confirm RED**

Run:

```bash
bun test tests/pipeline-review-contract.test.ts
```

Expected: FAIL because `review_receipt` and `required_reviewers` are absent.

- [ ] **Step 3: Extend the JSON schema in `SKILL.md`**

Add this top-level field after `run_id` in the minimum shape:

```json
"review_receipt": {
  "base_sha": "<resolved concrete base SHA>",
  "head_sha": "<git rev-parse HEAD captured before dispatch>",
  "branch": "<branch captured before dispatch>",
  "selected_reviewers": ["<canonical reviewer identity>"],
  "required_reviewers": ["<required in-process reviewer identity>"],
  "completed_reviewers": ["<canonical reviewer identity>"],
  "failed_reviewers": [
    {"reviewer": "<identity>", "reason": "<failure>", "required": true}
  ],
  "terminal_status": "complete"
}
```

Immediately define:

- `selected_reviewers` is the materialized canonical roster, including a selected optional peer route when one started.
- `required_reviewers` is owned by `ce-code-review`: all selected in-process reviewers; optional cross-model peers are excluded unless the canonical review explicitly classifies one as required in the future.
- `completed_reviewers` contains only valid returns folded into synthesis.
- `failed_reviewers` records every failed/timed-out/malformed selected reviewer with canonical requiredness.
- `terminal_status` is `complete`, `degraded`, or `failed`; successful JSON uses `complete`.
- callers consume requiredness verbatim and never infer it from reviewer names/providers.

Failure before dispatch may retain the existing minimal `{status, reason}` shape. Once dispatch begins, `mode:agent` must include the receipt even on degraded/failure completion.

- [ ] **Step 4: Define receipt materialization in `finish-review.md`**

Add a late Stage 6 gate before artifact write:

```text
Build `review_receipt` from orchestrator-owned state, never from rendered Coverage prose. Use the concrete resolved base SHA (not a `pr:N` marker), branch and HEAD captured before dispatch, the canonical final roster after exclusive adversarial routing, valid collected returns, and recorded failures. `ce-code-review` owns `required_reviewers`; downstream callers must not reconstruct requiredness.
```

Require the receipt payload written to `review.json` to byte-match the emitted JSON object.

- [ ] **Step 5: Document the receipt in `review-output-template.md`**

Add one bullet in the agent JSON section: the receipt is machine evidence for downstream orchestration and is absent only when the review fails before dispatch begins.

- [ ] **Step 6: Run focused tests**

Run:

```bash
bun test tests/pipeline-review-contract.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add skills/ce-code-review/SKILL.md \
  skills/ce-code-review/references/finish-review.md \
  skills/ce-code-review/references/review-output-template.md \
  tests/pipeline-review-contract.test.ts
git commit -m "feat(ce-code-review): expose canonical caller receipt"
```

---

### Task 3: Add RED deterministic contracts for the new loop

**Files:**
- Create: `tests/ce-code-review-loop-contract.test.ts`

- [ ] **Step 1: Create the contract test skeleton**

Use the established section helper from `tests/ce-doc-review-loop-contract.test.ts`:

```ts
import { readFile } from "fs/promises"
import path from "path"
import { describe, expect, test } from "bun:test"

const skillPath = path.join(process.cwd(), "skills/ce-code-review-loop/SKILL.md")
const protocolPath = path.join(process.cwd(), "skills/ce-code-review-loop/references/loop-protocol.md")

function section(body: string, start: string, end: string): string {
  const from = body.indexOf(start)
  const to = body.indexOf(end, from + start.length)
  expect(from).toBeGreaterThanOrEqual(0)
  expect(to).toBeGreaterThan(from)
  return body.slice(from, to)
}
```

- [ ] **Step 2: Add activation and canonical-route tests**

Assert:

```ts
expect(skill).toContain("name: ce-code-review-loop")
expect(skill).toContain("REQUIRED SUB-SKILL")
expect(workflow).toContain("ce-code-review")
expect(workflow).toContain("mode:agent")
expect(workflow).toContain("depth:full")
expect(workflow).toContain("grouping:auto")
expect(workflow).toContain("base:<resolved-base-sha>")
expect(workflow).toContain("not a substitute")
```

Also assert the new skill never invokes `apply:local` as its canonical review wave.

- [ ] **Step 3: Add authority and entry-state tests**

Pin all of:

```ts
expect(input).toContain("clean")
expect(input).toContain("staged")
expect(input).toContain("unstaged")
expect(input).toContain("untracked")
expect(input).toContain("current local branch")
for (const forbidden of ["PR number", "PR URL", "branch target"]) {
  expect(input).toContain(forbidden)
}
for (const action of ["push", "rebase", "worktree", "check out"]) {
  expect(boundaries).toContain(action)
}
```

Assert commit authority is local and cycle-scoped, not push authority.

- [ ] **Step 4: Add receipt and convergence tests**

Require protocol references to:

- consume `required_reviewers` verbatim;
- validate branch/base/head and clean status;
- fail on malformed payload, missing receipt, or required coverage gap;
- final `status: complete`;
- final `verdict: Ready to merge`;
- final empty `actionable_findings`;
- final project verification;
- unchanged final branch/HEAD/tree.

- [ ] **Step 5: Add remediation and non-convergence tests**

Require:

- stable finding revalidation against current code;
- mechanical vs decision-bearing classification;
- `triage_groups` intersected with `actionable_findings`;
- checkpoint HEAD, cycle diff self-review, scoped verification, rollback only without concurrent user work;
- one `fix(review):` commit per successful family;
- any commit invalidates prior convergence evidence;
- recurrence/oscillation trajectory and no success on budget exhaustion.

- [ ] **Step 6: Add envelope and circuit-breaker tests**

Pin default `8`, range `2` through `10`, unit definitions, all success fields, and all `Non-converged` fields from R12.

- [ ] **Step 7: Run the new test and confirm RED**

Run:

```bash
bun test tests/ce-code-review-loop-contract.test.ts
```

Expected: FAIL with `ENOENT` for the missing skill/protocol.

Do not commit the failing test alone; Task 4 supplies GREEN in the same implementation slice.

---

### Task 4: Implement the loop skill and protocol

**Files:**
- Create: `skills/ce-code-review-loop/SKILL.md`
- Create: `skills/ce-code-review-loop/references/loop-protocol.md`
- Create: `skills/ce-code-review-loop/scripts/context.mjs`
- Test: `tests/ce-code-review-loop-contract.test.ts`

- [ ] **Step 1: Create `SKILL.md` frontmatter and outcome spine**

Use:

```yaml
---
name: ce-code-review-loop
description: Use when code needs repeated review and evidence-backed fixes before merge, especially when review rounds expose connected defects or prior zero-finding evidence is stale. Use ce-code-review directly for a one-shot report.
argument-hint: "[max-work-units:N] [base:<ref>] [plan:<path>]"
---
```

Outcome:

```text
Result: current local branch at a committed HEAD whose canonical full review is Ready to merge with no actionable findings.
Next consumer: user or caller deciding whether to push/open a PR.
Done: convergence envelope or complete Non-converged envelope.
```

Declare `ce-code-review` a required sub-skill and prohibit imitation.

- [ ] **Step 2: Add standard Setup fence**

Copy the Setup fence shape from `ce-doc-review-loop`, replacing only `SKILL_DIR` resolution by the runtime absolute path. Keep header/end-marker recovery language and no filtering/piping.

- [ ] **Step 3: Add Input and Authority section**

Encode exact rules:

- accepted tokens: one optional `base:`, one optional `plan:`, one optional `max-work-units:`;
- reject PR number, URL, branch target, conflicting duplicate tokens, invalid work-unit range;
- resolve base to one concrete SHA once and retain it for all waves;
- require current branch not detached and entire tree clean including untracked files;
- local commits allowed only for verified loop-owned cycles;
- no checkout/switch/worktree/rebase/amend/squash/push/PR/ticket.

Use failure enums:

```text
input: valid | dirty_tree | detached_head | invalid_scope | invalid_max_work_units | unresolved_base
loop_protocol: available | unavailable | not_run
ce-code-review: complete | degraded | failed | skill_unreachable | malformed | not_run
```

- [ ] **Step 4: Add workflow spine**

Keep six steps in `SKILL.md`; put detail in the protocol:

1. Preflight and freeze branch/base/starting HEAD.
2. Canonical review wave: `ce-code-review mode:agent depth:full grouping:auto base:<resolved-base-sha> [plan:<path>]`.
3. Validate payload, receipt, required coverage, and unchanged tree.
4. Revalidate and partition findings; stop decision-bearing items as blockers.
5. Remediate one mechanical defect family, verify, self-review, commit.
6. Repeat until final convergence gate or non-convergence/circuit breaker.

- [ ] **Step 5: Implement protocol mechanics**

`references/loop-protocol.md` must define:

- secure fresh run state at `/tmp/compound-engineering-$(id -u)/ce-code-review-loop/<run-id>/run-state.json`, `umask 077`, owner/symlink checks, mode `0700`;
- branch/base/HEAD/status commands as executed evidence, not asserted values;
- clean-state definition including untracked files;
- work-unit increment before every review or remediation attempt;
- canonical receipt validation and failure classes;
- finding identity ledger (`run_id` + stable `#` + head SHA + normalized file/line/title/evidence fingerprint);
- mechanical/decision-bearing classification;
- family grouping through `triage_groups ∩ actionable_findings` plus semantic root-cause reconciliation;
- cycle checkpoint, touched-path ledger, verification plan and outcome;
- safe rollback rule: restore only known loop-owned paths when HEAD and non-cycle paths still match checkpoint; otherwise preserve and stop;
- local `fix(review):` commit and post-commit clean/HEAD validation;
- recurrence trajectory and oscillation rules;
- final gate and envelopes.

- [ ] **Step 6: Create `context.mjs`**

Copy `skills/ce-doc-review-loop/scripts/context.mjs` byte-for-byte unless the behavioral RED evidence proves a loop-specific directive is needed. The context parity suite expects the shared directive corpus.

- [ ] **Step 7: Run focused contracts**

Run:

```bash
bun test tests/ce-code-review-loop-contract.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add skills/ce-code-review-loop tests/ce-code-review-loop-contract.test.ts
git commit -m "feat(ce-code-review-loop): add bounded review-fix convergence"
```

---

### Task 5: Enroll the skill in release and convention surfaces

**Files:**
- Modify: `tests/release-metadata.test.ts`
- Modify: `tests/skill-context-parity.test.ts`
- Modify: `tests/skill-conventions.test.ts`

- [ ] **Step 1: Write/adjust failing enrollment expectations**

Change expected skill count:

```ts
skills: 34,
```

Add `"ce-code-review-loop"` next to `ce-code-review` in the context parity and context/convention skill arrays.

- [ ] **Step 2: Run focused tests before docs registration**

Run:

```bash
bun test tests/release-metadata.test.ts tests/skill-context-parity.test.ts tests/skill-conventions.test.ts
```

Expected before metadata/docs implementation: at least release metadata/count assertions fail because the new skill is not cataloged consistently.

- [ ] **Step 3: Fix any context parity drift**

If `context.mjs` differs from the canonical directive corpus, replace it with the exact current corpus used by other enrolled skills. Do not add a one-skill exception.

- [ ] **Step 4: Run focused tests**

Run the same command. Expected: convention/context tests pass; release metadata may still require README catalog work completed in Task 6.

Do not commit until Task 6 lands the matching docs inventory.

---

### Task 6: Add user documentation and inventory registration

**Files:**
- Create: `docs/skills/ce-code-review-loop.md`
- Modify: `docs/skills/README.md`
- Modify: `README.md`
- Test: `tests/release-metadata.test.ts`
- Test: `tests/skill-context-parity.test.ts`
- Test: `tests/skill-conventions.test.ts`

- [ ] **Step 1: Create the skill page**

Use the established shape from `docs/skills/ce-doc-review-loop.md` with sections:

```markdown
# `ce-code-review-loop`
> Converge a clean local branch through bounded canonical review and verified fix cycles.

## When to use it
## Invocation
## Protocol
## Authority and safety boundaries
## Convergence
## Relationship to `ce-code-review`
```

Document:

- direct `ce-code-review` for one-shot report;
- clean current local branch only;
- default/range for `max-work-units`;
- local remediation commits but no push;
- decision-bearing blockers;
- success gate and residual advisories.

- [ ] **Step 2: Add catalog rows**

In root `README.md`, add beside `ce-code-review`:

```markdown
| [`/ce-code-review-loop`](docs/skills/ce-code-review-loop.md) | Converge a clean local branch through bounded canonical review and verified fix cycles |
```

In `docs/skills/README.md`, add in the review category:

```markdown
| [`/ce-code-review-loop`](./ce-code-review-loop.md) | Repeat canonical full code review, apply evidence-backed fixes, and stop only at a ready-to-merge final HEAD |
```

Do not add the new loop to basic “review code” examples that should remain one-shot.

- [ ] **Step 3: Run enrollment tests**

Run:

```bash
bun test tests/release-metadata.test.ts tests/skill-context-parity.test.ts tests/skill-conventions.test.ts
```

Expected: PASS with 34 skills.

- [ ] **Step 4: Commit registration and docs**

```bash
git add README.md docs/skills/README.md docs/skills/ce-code-review-loop.md \
  tests/release-metadata.test.ts tests/skill-context-parity.test.ts tests/skill-conventions.test.ts \
  skills/ce-code-review-loop/scripts/context.mjs
git commit -m "docs(ce-code-review-loop): register review-fix workflow"
```

---

### Task 7: Add executable git-state and cycle safety tests

**Files:**
- Modify: `tests/ce-code-review-loop-contract.test.ts`

- [ ] **Step 1: Add hermetic git fixture helpers**

Use `mkdtempSync(path.join(tmpdir(), "ce-code-review-loop-"))`; create a two-commit repo with neutralized config:

```ts
const gitEnv = {
  ...process.env,
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_SYSTEM: "/dev/null",
  GIT_AUTHOR_NAME: "Loop Test",
  GIT_AUTHOR_EMAIL: "loop@example.test",
  GIT_COMMITTER_NAME: "Loop Test",
  GIT_COMMITTER_EMAIL: "loop@example.test",
}
```

Every git command must throw on non-zero exit. Clean fixtures in `afterEach`.

- [ ] **Step 2: Test clean-entry detection**

Exercise the protocol's documented command against fixtures for:

- clean branch -> valid;
- staged file -> dirty;
- unstaged file -> dirty;
- untracked file -> dirty;
- detached HEAD -> rejected.

Expected: no fixture depends on the live checkout.

- [ ] **Step 3: Test one remediation commit boundary**

In a clean feature branch fixture:

1. capture checkpoint HEAD;
2. edit implementation and test files;
3. run a deterministic verification command that succeeds;
4. commit `fix(review): correct fixture behavior`;
5. assert exactly one new commit, clean tree, same branch, base unchanged.

This pins the product-state transaction without requiring a live LLM review.

- [ ] **Step 4: Test verification-failure recovery**

Modify one known cycle path, run a command that exits non-zero, restore only that path, and assert HEAD/tree equal checkpoint. Then add an unrelated concurrent file change before recovery and assert the documented guard refuses restoration and preserves both files.

- [ ] **Step 5: Run executable tests**

Run:

```bash
bun test tests/ce-code-review-loop-contract.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add tests/ce-code-review-loop-contract.test.ts
git commit -m "test(ce-code-review-loop): pin git transaction boundaries"
```

---

### Task 8: Run GREEN behavioral skill evaluations

**Files:**
- Read: `skills/ce-code-review-loop/SKILL.md`
- Read: `skills/ce-code-review-loop/references/loop-protocol.md`
- No durable repo file unless a test exposes a real contract gap

- [ ] **Step 1: Re-run the exact RED scenarios with current skill content injected**

Use the `skill-creator` eval workflow so each generic subagent reads current files from disk. Do not invoke a session-cached typed skill.

Expected for all scenarios:

- dirty tree -> no review/no mutation, `Non-converged`;
- decision-bearing item -> blocker, no automatic semantic choice;
- required coverage gap -> no convergence;
- shrinking findings/tests green -> fresh full final review still required;
- no push/PR/worktree/branch switch.

- [ ] **Step 2: Add one successful application scenario**

Provide a clean local branch, one mechanical finding with concrete evidence, a passing scoped check, and then a canonical clean receipt. Expected: one cycle commit and convergence only after the final full review.

- [ ] **Step 3: REFACTOR only demonstrated loopholes**

For each failure, classify the owning layer:

```text
item -> Change | activation / outcome / protocol / loading / deterministic guard | smallest mechanism - evidence
```

Tighten existing prose or a deterministic test. Do not add generic warnings or duplicate `ce-code-review` internals.

- [ ] **Step 4: Re-run affected contracts**

Run:

```bash
bun test tests/ce-code-review-loop-contract.test.ts tests/pipeline-review-contract.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit only if evaluation changed source**

```bash
git add skills/ce-code-review-loop tests/ce-code-review-loop-contract.test.ts
git commit -m "fix(ce-code-review-loop): close evaluated convergence gaps"
```

Skip this commit when no source changed.

---

### Task 9: Final verification and cleanup

**Files:**
- All changed files

- [ ] **Step 1: Run focused suites**

```bash
bun test tests/ce-code-review-loop-contract.test.ts \
  tests/pipeline-review-contract.test.ts \
  tests/release-metadata.test.ts \
  tests/skill-context-parity.test.ts \
  tests/skill-conventions.test.ts
```

Expected: all pass.

- [ ] **Step 2: Run release validation**

```bash
bun run release:validate
```

Expected: metadata in sync, 34 skills.

- [ ] **Step 3: Run strict plugin validation**

```bash
bun run plugin:validate
```

Expected: marketplace and plugin manifest pass strict validation.

- [ ] **Step 4: Run the full test suite**

On this machine neutralize the loopback proxy for local HTTP tests:

```bash
NO_PROXY=localhost,127.0.0.1,::1 no_proxy=localhost,127.0.0.1,::1 bun run test
```

Expected: zero failures.

- [ ] **Step 5: Review only the final diff and repository state**

```bash
git diff --check
git status --short
git log --oneline --decorate -8
```

Confirm:

- no temporary RED/eval artifacts in the repository;
- no release-owned version/changelog edits;
- no cross-skill file reference from the new skill;
- no uncommitted changes;
- every spec requirement R1-R12 maps to at least one contract test or behavioral evaluation.

- [ ] **Step 6: Final implementation commit if needed**

If verification required a source fix, commit only that fix with the narrowest intent/scope. Do not create an empty cleanup commit.
