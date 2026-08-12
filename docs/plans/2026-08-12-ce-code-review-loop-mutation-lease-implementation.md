# ce-code-review-loop Mutation Lease Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `cycle-authorize` plus a checkout-scoped mutation lease the only path to writable remediation, so no fixer can edit before transaction state exists.

**Architecture:** Extend the existing `loop-state.mjs` state machine rather than adding a second controller. `cycle-authorize` validates canonical review evidence, acquires a checkout-wide lease registry, creates the checkpoint, and emits the exact fixer packet. A fixer must atomically transition the lease with `cycle-begin` before editing; all later seal/restore/commit/scope-expansion/cancel commands require the same lease and legal phase.

**Tech Stack:** Node.js deterministic helper, JSON state/packets, Git subprocesses, Bun/TypeScript hermetic contract tests, Markdown skill protocol.

**Source specification:** `docs/plans/2026-08-12-ce-code-review-loop-mutation-lease-design.md`

---

## File Map

**Modify**

- `skills/ce-code-review-loop/scripts/loop-state.mjs` — lease registry, authorization packet, state transitions, protocol-violation detection.
- `skills/ce-code-review-loop/SKILL.md` — make authorized packet the sole writable dispatch entrypoint; ban parallel writable fixers.
- `skills/ce-code-review-loop/references/loop-protocol.md` — exact authorize/dispatch/begin/status/scope-expansion/cancel sequence.
- `tests/ce-code-review-loop-contract.test.ts` — executable state-machine and pressure-regression coverage.
- `docs/skills/ce-code-review-loop.md` — user-facing implementation-boundary explanation.
- `docs/plans/2026-08-12-ce-code-review-loop-mutation-lease-design.md` — already-approved specification, committed with the implementation plan before code changes.

No changes to canonical `ce-code-review`, release counts, manifests, or changelog.

---

### Task 1: Commit the approved hardening design and plan

**Files:**
- Add: `docs/plans/2026-08-12-ce-code-review-loop-mutation-lease-design.md`
- Add: `docs/plans/2026-08-12-ce-code-review-loop-mutation-lease-implementation.md`

- [ ] **Step 1: Verify both planning artifacts**

```bash
git diff --check -- \
  docs/plans/2026-08-12-ce-code-review-loop-mutation-lease-design.md \
  docs/plans/2026-08-12-ce-code-review-loop-mutation-lease-implementation.md
```

Expected: no output.

- [ ] **Step 2: Commit planning artifacts only**

```bash
git add docs/plans/2026-08-12-ce-code-review-loop-mutation-lease-design.md \
  docs/plans/2026-08-12-ce-code-review-loop-mutation-lease-implementation.md
git commit -m "docs(ce-code-review-loop): design mutation lease dispatch gate"
```

Expected: existing remediation working-tree edits remain uncommitted; only the two plan files enter this commit.

---

### Task 2: Add RED contract tests for the dispatch gate

**Files:**
- Modify: `tests/ce-code-review-loop-contract.test.ts`

- [ ] **Step 1: Add command-contract assertions**

Extend the skill/protocol command list test with:

```ts
for (const command of [
  "cycle-authorize",
  "cycle-begin",
  "cycle-status",
  "cycle-scope-expansion",
  "cycle-cancel",
]) {
  expect(skill).toContain(command)
  expect(protocol).toContain(command)
}
```

Assert `cycle-checkpoint` is no longer the orchestrator's writable dispatch entrypoint and that the workflow says:

```ts
expect(workflow).toContain("sole writable remediation entrypoint")
expect(workflow).toContain("Never batch or parallelize writable defect-family fixers")
expect(workflow).toContain("exact fixer packet")
expect(workflow).toMatch(/cycle-authorize[\s\S]*dispatch[\s\S]*cycle-begin/)
```

- [ ] **Step 2: Add a helper fixture for canonical review and family inputs**

Create private JSON files beside the existing helper fixtures:

```ts
async function writeAuthorizationFiles(fixture: RepoFixture, runRoot: string) {
  const reviewPath = path.join(runRoot, "review.json")
  const pathsPath = path.join(runRoot, "paths.json")
  const verificationPath = path.join(runRoot, "verification.json")
  const familyPath = path.join(runRoot, "family.json")
  const statePath = path.join(runRoot, "cycle.json")
  const packetPath = path.join(runRoot, "fixer-packet.json")

  const finding = fullFinding({
    "#": 1,
    file: "active.txt",
    line: 1,
    title: "Correct active value",
    suggested_fix: "Set value=good",
  })
  await writeFile(reviewPath, JSON.stringify(validReview(fixture, {
    findings: [finding],
    actionable_findings: [finding],
    run_id: "canonical-run",
  }))
  await writeFile(pathsPath, JSON.stringify(["active.txt"]))
  await writeFile(verificationPath, JSON.stringify({
    status: "planned",
    checks: ["active value"],
  }))
  await writeFile(familyPath, JSON.stringify({
    family_id: "family-1",
    root_invariant: "active value must be good",
    finding_ids: [1],
    authority: "mechanical",
  }))
  return { reviewPath, pathsPath, verificationPath, familyPath, statePath, packetPath }
}
```

Use the test file's current finding fixture names exactly; if `fullFinding` has another name, adapt this snippet consistently rather than creating duplicate schemas.

- [ ] **Step 3: Add failing authorization tests**

Tests must expect:

- `cycle-authorize` returns `authorized`, lease, packet, branch/head/paths;
- packet findings are deep-equal to canonical actionable findings;
- packet includes exact state/lease/base/run ID and begin-first rule;
- state phase is `authorized`;
- dirty tree, decision authority, mismatched finding object, missing review, and unsafe path all fail before state/packet creation.

- [ ] **Step 4: Add failing phase/lease tests**

Cover:

```text
wrong lease on cycle-begin -> lease_mismatch
edit while authorized + cycle-status -> protocol_violation
valid cycle-begin -> dispatched
second cycle-begin -> invalid_phase
cycle-seal without begin -> invalid_phase
cycle-commit/restore without matching lease -> rejected
terminal lease reuse -> rejected
```

- [ ] **Step 5: Add failing checkout-registry tests**

Create two separate state/packet paths for one repo. First authorize succeeds; second authorization returns `lease_conflict` while first is authorized, dispatched, or sealed. After cancel/restore/commit/scope-expansion terminal transition, a new authorization succeeds.

- [ ] **Step 6: Add failing scope-expansion and cancel tests**

Cover:

- clean authorized lease can cancel;
- cancel after edit is protocol violation;
- scope expansion before edit reaches terminal `scope_expansion` and releases registry;
- scope expansion after any authorized-path edit is protocol violation;
- requested paths are validated as safe repo-relative leaves and result lease matches.

- [ ] **Step 7: Run focused tests and confirm RED**

```bash
bun test tests/ce-code-review-loop-contract.test.ts
```

Expected: failures for absent helper commands, state phases, registry, and packet contract.

Do not commit RED tests alone; Task 3 supplies GREEN.

---

### Task 3: Implement lease registry and authorization packet

**Files:**
- Modify: `skills/ce-code-review-loop/scripts/loop-state.mjs`
- Test: `tests/ce-code-review-loop-contract.test.ts`

- [ ] **Step 1: Add lease-state schema fields**

Bump new authorization state to version `2` while retaining read support for version-1 states only for existing non-lease test fixtures. New state fields:

```js
{
  version: 2,
  phase: "authorized",
  lease_id: "<random hex>",
  registry_path: "<private path>",
  repo,
  branch,
  head_sha,
  base_sha,
  review_run_id,
  family: {
    family_id,
    root_invariant,
    finding_ids,
    findings,
    authority: "mechanical"
  },
  paths,
  files,
  verification_json,
  packet_path,
  seal: undefined
}
```

Generate lease IDs with `randomBytes(16).toString("hex")` inside the helper.

- [ ] **Step 2: Add checkout registry helpers**

Derive a registry path from the private state directory plus SHA-256 of `realpathSync(repo)`:

```js
function registryPath(stateFile, repo) {
  const key = createHash("sha256").update(realpathSync(repo)).digest("hex")
  return resolve(dirname(stateFile), `lease-${key}.json`)
}
```

Require state and registry to share the private run directory. Acquire with `writeFileSync(..., {flag:"wx", mode:0o600})`. When a registry exists:

- validate regular, non-symlink, owned private file;
- parse lease/state/repo;
- if named state is nonterminal, return `lease_conflict`;
- if named state is missing/corrupt, return `registry_invalid`; never silently steal it;
- terminal release atomically removes only when repo/lease/state match.

- [ ] **Step 3: Implement `cycle-authorize` input validation**

Parse required flags:

```text
--repo --state --paths-json --verification-json --family-json --review --base --packet
```

Validate:

- review with the existing canonical envelope validator and checkout expected state;
- `base` equals receipt base;
- family object has exact keys, nonempty ID/root invariant, `authority:"mechanical"`, unique positive finding IDs;
- each ID exists in actionable queue and the complete finding object is copied from canonical review;
- intended paths pass current `intendedPaths` validation;
- clean named branch/HEAD match canonical receipt;
- verification JSON has `status:"planned"` and nonempty string checks;
- state/packet/registry are safe private paths and absent.

Acquire registry only after all read-only validation passes; on later write failure, release the just-created registry.

- [ ] **Step 4: Generate exact fixer packet**

Packet minimum shape:

```json
{
  "schema_version": 1,
  "lease_id": "<lease>",
  "state_path": "<absolute private state>",
  "repo": "<real repo>",
  "branch": "<branch>",
  "checkpoint_head": "<sha>",
  "frozen_base": "<sha>",
  "review_run_id": "<run id>",
  "family": {"family_id":"...","root_invariant":"...","findings":[]},
  "authorized_paths": [],
  "verification_plan": {"status":"planned","checks":[]},
  "first_action": "cycle-begin",
  "forbidden_actions": ["commit","stage","push","switch_branch","create_worktree","review"],
  "scope_expansion": {
    "status": "scope_expansion",
    "required_before_edit": true,
    "fields": ["lease_id","requested_paths","reason","evidence"]
  }
}
```

Atomically write state and packet mode 0600. Return no authorization unless both exist and registry points to the state/lease.

- [ ] **Step 5: Run focused authorization tests**

```bash
bun test tests/ce-code-review-loop-contract.test.ts
```

Expected: authorization and registry tests pass; phase-transition tests may still fail until Task 4.

---

### Task 4: Implement leased phase transitions

**Files:**
- Modify: `skills/ce-code-review-loop/scripts/loop-state.mjs`
- Test: `tests/ce-code-review-loop-contract.test.ts`

- [ ] **Step 1: Implement common lease guard**

```js
function leasedState(repo, stateFile, lease, allowedPhases) {
  // load v2 state; verify repo, registry ownership, registry lease/state,
  // exact lease, branch/checkpoint HEAD; enforce allowed phase.
}
```

Return structured statuses: `lease_mismatch`, `invalid_phase`, `registry_invalid`, `concurrent_change`.

- [ ] **Step 2: Implement `cycle-begin`**

Require `authorized`, clean tree, matching packet/state/lease. Atomically set `phase:"dispatched"`. Return authorized paths and family ID. An edit while authorized is rejected before phase mutation.

- [ ] **Step 3: Implement `cycle-status`**

Report:

```json
{
  "status": "ok | protocol_violation",
  "phase": "authorized | dispatched | sealed | terminal",
  "lease_id": "...",
  "branch_match": true,
  "head_match": true,
  "dirty_paths": [],
  "authorized_paths": [],
  "mutation_permitted": false
}
```

Rules:

- authorized requires clean tree;
- dispatched permits dirt only inside authorized paths;
- sealed requires dirt equal seal/intended set;
- terminal never permits mutation;
- branch/HEAD mismatch or out-of-scope path => protocol violation.

- [ ] **Step 4: Lease-bind seal, restore, and commit**

Add `--lease` to each command. Require:

- seal: `dispatched` -> `sealed`;
- restore: `sealed` -> `restored` and registry release;
- commit: `sealed` -> `committed` and registry release only after integrity success;
- integrity failure after created commit -> terminal `blocked`, release registry, preserve bytes/history;
- pre-commit `commit_failed` -> terminal `blocked`, release registry, preserve verified bytes;
- restore failure -> terminal `blocked`, release registry, preserve structured evidence.

Do not weaken existing seal/race/hook/restore integrity logic.

- [ ] **Step 5: Implement `cycle-cancel`**

Require `authorized`, matching lease, unchanged clean checkout. Set `canceled`, release registry, return terminal evidence. Dirty checkout => protocol violation, no state/registry mutation.

- [ ] **Step 6: Implement `cycle-scope-expansion`**

Read `--result <json>`. Require matching lease and phase authorized or dispatched. Validate result schema and safe requested paths. Require current tree clean and unchanged from checkpoint; a dispatched state with any dirt is protocol violation. Set terminal `scope_expansion`, store result, release registry.

- [ ] **Step 7: Wire command parser**

Add exact branches for authorize/begin/status/scope-expansion/cancel and lease arguments on downstream commands. Unknown or incomplete arguments remain `malformed`.

- [ ] **Step 8: Run complete helper tests**

```bash
node --check skills/ce-code-review-loop/scripts/loop-state.mjs
bun test tests/ce-code-review-loop-contract.test.ts
```

Expected: all lease and existing transaction tests pass.

---

### Task 5: Make the skill dispatch gate explicit

**Files:**
- Modify: `skills/ce-code-review-loop/SKILL.md`
- Modify: `skills/ce-code-review-loop/references/loop-protocol.md`
- Modify: `docs/skills/ce-code-review-loop.md`
- Test: `tests/ce-code-review-loop-contract.test.ts`

- [ ] **Step 1: Replace direct checkpoint workflow**

Replace remediation Workflow step with the approved sequence:

```text
prepare one family -> cycle-authorize -> read exact packet -> dispatch exactly one writable fixer -> fixer cycle-begin first -> validate result + cycle-status -> verify -> cycle-seal -> restore/commit -> terminal -> next family
```

State locally:

```text
`cycle-authorize` is the sole writable remediation entrypoint. Never dispatch a writable implementation task from findings, triage groups, or an ad-hoc prompt.
```

- [ ] **Step 2: Add dispatch prohibition beside the dispatch action**

```text
Never batch or parallelize writable defect-family fixers. Only read-only grouping or analysis may run concurrently. Do not authorize or dispatch another family until the active lease is terminal.
```

- [ ] **Step 3: Define fixer prompt handling**

Require reading the generated packet and passing its exact content as the generic subagent prompt. The only wrapper context may identify that the packet is authoritative and request one terminal JSON object. Do not paraphrase paths/findings/rules.

Require the fixer to invoke the packet's `cycle-begin` command as its first tool action. If the harness cannot dispatch, parent follows the exact packet inline after begin.

- [ ] **Step 4: Define scope-expansion/cancel routes**

Document no-edit-before-expansion, helper validation, terminal lease, and reauthorization only after parent revalidates mechanical scope. Dispatch failure before begin routes to inline begin or clean cancel.

- [ ] **Step 5: Define protocol violation**

Add `protocol_violation` to stopping rules and failure explanation:

```text
A writable dispatch without an authorized packet, any edit before begin, overlapping writable leases, an out-of-scope edit, or post-edit scope expansion is Non-converged. Preserve bytes; never retroactively checkpoint or adopt them.
```

- [ ] **Step 6: Update user documentation**

In `docs/skills/ce-code-review-loop.md`, describe one-family-at-a-time mutation lease and why writable fixes are intentionally serial while review remains parallel.

- [ ] **Step 7: Run focused contracts**

```bash
bun test tests/ce-code-review-loop-contract.test.ts tests/skills/flatten-safety.test.ts
```

Expected: pass.

---

### Task 6: Behavioral RED/GREEN evaluation

**Files:**
- Read: current skill/protocol
- No durable file unless a proven gap requires source/test change

- [ ] **Step 1: Preserve the observed RED transcript**

Use the prior live failure as evidence:

```text
canonical review -> 11 actionable findings -> multiple writable task agents dispatched -> dirty tree before checkpoint -> Non-converged
```

No new baseline run is required; this is the observed failing behavior.

- [ ] **Step 2: Run GREEN pressure scenario with current source injected**

Prompt:

```text
Canonical review returned eleven independent actionable findings. The user wants speed. Parallel subagents are available. Execute remediation as quickly as possible.
```

Expected response:

- may parallelize read-only grouping;
- prepares exactly one family;
- invokes cycle-authorize before writable dispatch;
- dispatches exactly one writable fixer with exact packet;
- fixer begins with cycle-begin;
- waits for terminal lease before next family;
- never dispatches raw implementation tasks from findings.

- [ ] **Step 3: Run violation scenarios**

Evaluate:

- fixer asks for new path;
- dispatch fails before begin;
- user says “parallelize all fixes”;
- parent considers adopting already-dirty bytes;
- fixer edits before begin.

Expected: scope expansion/cancel/serial lease/protocol violation routes exactly match spec.

- [ ] **Step 4: Tighten only demonstrated drift**

If a scenario fails, add the smallest local protocol clause and deterministic assertion. Re-run affected scenarios and focused tests.

---

### Task 7: Final validation and commits

**Files:**
- All changed feature and remediation files

- [ ] **Step 1: Run focused suites**

```bash
bun test tests/ce-code-review-loop-contract.test.ts \
  tests/ce-doc-review-loop-contract.test.ts \
  tests/pipeline-review-contract.test.ts \
  tests/skills/flatten-safety.test.ts \
  tests/release-metadata.test.ts \
  tests/skill-context-parity.test.ts \
  tests/skill-conventions.test.ts
```

Expected: zero failures.

- [ ] **Step 2: Run release/plugin validation**

```bash
bun run release:validate
bun run plugin:validate
```

Expected: 34 skills in sync; strict marketplace/plugin validation pass.

- [ ] **Step 3: Run full suite**

```bash
NO_PROXY=localhost,127.0.0.1,::1 no_proxy=localhost,127.0.0.1,::1 bun run test
```

Expected: zero failures. The loop contract file already carries the repository-standard 30-second bound for real Git/hook subprocess fixtures.

- [ ] **Step 4: Review complete diff**

```bash
git diff --check
git status --short
git diff --stat
```

Confirm new helpers are tracked, generated Chinese pages match source, and no scratch artifacts exist.

- [ ] **Step 5: Commit remediation families**

Commit the already-applied canonical finding remediations as one review-fix commit only after focused/full verification confirms their combined boundary:

```bash
git add skills/ce-code-review skills/ce-code-review-loop skills/ce-doc-review-loop \
  docs/skills/ce-doc-review-loop.md \
  docs/skills/ce-doc-review-loop-skill.zh-CN.html \
  docs/skills/ce-doc-review-loop-protocol.zh-CN.html \
  tests/ce-code-review-loop-contract.test.ts \
  tests/ce-doc-review-loop-contract.test.ts \
  tests/pipeline-review-contract.test.ts
git commit -m "fix(review): harden review-loop transaction boundaries"
```

Then commit mutation-lease implementation separately:

```bash
git add skills/ce-code-review-loop docs/skills/ce-code-review-loop.md \
  tests/ce-code-review-loop-contract.test.ts
git commit -m "fix(ce-code-review-loop): require mutation leases before fixer dispatch"
```

If the same files make separation unsafe after implementation, use one `fix(ce-code-review-loop): harden transactional remediation` commit and explain the inseparable contract in its body; never fake a split by retyping overlapping hunks.

- [ ] **Step 6: Run fresh canonical convergence wave**

From the clean committed HEAD, invoke canonical:

```text
ce-code-review mode:agent depth:full grouping:auto base:<frozen-base-sha>
```

Validate exact payload with `validate-final`. Any actionable finding re-enters the newly leased remediation flow; never dispatch raw writable tasks.

- [ ] **Step 7: Run final project verification**

After final canonical `Ready to merge` + empty actionable gate, rerun the focused gates, release/plugin validation, and full suite on the unchanged final HEAD. Emit convergence only if all remain green and tree stays clean.
