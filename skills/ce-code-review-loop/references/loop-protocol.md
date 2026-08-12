# Code Review Loop Protocol

This protocol keeps canonical review report-only while the outer loop owns entry authority, finding integrity, mechanical remediation, verification, local commits, trajectory, and convergence.

## Mechanics

- **Secure invocation-scoped run state.** Use `/tmp/compound-engineering-$(id -u)/ce-code-review-loop/<run-id>/run-state.json`. Mint a **fresh** unpredictable run id for every invocation; never adopt or resume an existing run directory. Under `umask 077`, create the root and run directory, then `chmod 700` both. Reject either path if it is a **symlink**, is not **owned by the current user**, is not a directory, or cannot be secured. Store only loop state and evidence; create no durable repository artifact.
- **Minimum state.** Record run id, branch, frozen base SHA, starting/current/last-reviewed HEAD, work-unit counts, canonical artifact locations and receipts, actionable-finding ledger and stable identity history, decision blockers, reviewer coverage gaps, defect families, cycle checkpoints, touched paths, commits, verification evidence, recurrence/oscillation trajectory, and final-gate evidence.
- **Checkpoints.** Before and after every wave or cycle, read the actual branch, HEAD, staged/unstaged/untracked status, and relevant file bytes. Never manufacture hashes or state from memory.
- **Ownership boundary.** A tree edit is loop-owned only while the active cycle's checkpoint, intended paths, and before bytes are recorded. Anything else is concurrent work. Never use a broad reset or checkout to erase it.

- **Deterministic Git mechanics.** Resolve `loop-state.mjs` from the loaded skill directory and invoke its `preflight`, `validate-review`, `validate-final`, `cycle-checkpoint`, `cycle-restore`, and `cycle-commit` commands for the mechanics they own. Do not improvise equivalent Git inspection, receipt validation, final convergence validation, restore, staging, or commit recipes. The outer skill retains all judgment: it selects finding families, intended paths, fixes, verification commands, and commit messages; the helper executes only those explicitly prepared deterministic operations under recorded state guards.

Use `validate-review --repo <path> --expected <json-file> --review <json-file>` for ordinary waves and `validate-final --repo <path> --expected <json-file> --review <json-file>` only for the final convergence gate.

## Preflight

1. Invoke `"$NODE" "$SKILL_DIR/scripts/loop-state.mjs" preflight --repo <path> --base <ref>`. The helper resolves `<ref>^{commit}`, computes `git merge-base HEAD <resolved-ref>`, and emits exactly one JSON object `{status,input,branch,base_sha,head_sha,clean}`. Accept only `status: "ok"`, fail-closed `input: "valid"`, a named current local **branch**, one concrete merge-base SHA in `base_sha`, one concrete SHA for HEAD, and `clean: true`; detached HEAD, invalid input, a missing merge base, or staged/unstaged/untracked dirt stops before review and mutation.
2. Reject a PR number, PR URL, branch target, or any scope other than the current checkout before invoking the helper.
3. Use the caller's `base:<ref>`, or choose the repository's normal comparison ref once before this command. Treat either a named ref or direct SHA only as the input commit for merge-base resolution. Freeze the helper's concrete merge-base `base_sha`; use the **same diff base for every wave** and never recompute it after remediation or after the supplied ref advances.
4. Preserve the returned starting `head_sha` as the **immutable starting HEAD** in run state; never overwrite it. Do not reuse it as the expected review HEAD after a remediation commit.
5. Validate a supplied plan path without modifying it. Validate `max-work-units` before spending a unit.
6. From this point, an unexpected branch change, HEAD change outside a recorded loop commit, or working-tree change outside the active cycle is concurrent user work. Preserve all bytes and return `Non-converged`.

## Canonical Review Wave

1. Check remaining budget, then checkpoint branch, the **current HEAD**, and clean working tree. Count the attempted wave as one work unit even if it is discarded or fails.
2. Before invoking every canonical review, generate or rewrite the private expected JSON with exactly the frozen `branch`, frozen `base_sha`, and the **current checkpoint HEAD** as `head_sha`. This per-wave file must be refreshed after every remediation commit; the immutable starting HEAD remains only run history.
3. Through the host's callable skill mechanism invoke exactly `ce-code-review mode:agent depth:full grouping:auto base:<resolved-base-sha>`, appending the supplied `plan:<path>` when present. Never reconstruct the canonical review and never add mutation authority.
4. Persist the exact single canonical JSON payload to the private review JSON file. Invoke `"$NODE" "$SKILL_DIR/scripts/loop-state.mjs" validate-review --repo <path> --expected <json-file> --review <json-file>` instead of improvising checkout or receipt validation.
5. Accept the wave only when the helper returns `status: "valid"`. It compares the actual clean branch/head with the per-wave expected frozen `base_sha`, current checkpoint `head_sha`, and `branch`, then validates top-level and receipt fields, types, terminal status, canonical verdict structure, required-reviewer coverage, full `findings`, and the exact actionable projection. Ordinary validation recognizes matching canonical top-level/receipt status pairs `complete`/`complete`, `degraded`/`degraded`, and `failed`/`failed`; the two statuses must agree. A structurally valid `degraded` pair requires at least one completed reviewer and at least one required coverage gap; `degraded` with full required coverage is malformed (`degraded_without_coverage_gap`). Only `complete` with full required coverage can return `valid`, and any canonical verdict (`Ready to merge`, `Ready with fixes`, or `Not ready`) remains usable on an otherwise valid remediation wave.
6. The canonical `review_receipt` still must contain `base_sha`, `head_sha`, `branch`, `selected_reviewers`, `required_reviewers`, `completed_reviewers`, structured `failed_reviewers`, and `terminal_status`. Consume canonical `required_reviewers` **verbatim**. Roster validation requires unique `selected_reviewers`, `required_reviewers`, `completed_reviewers`, and failure reviewer names; required, completed, and failed reviewers must each be subsets of selected reviewers; every selected reviewer must have **exactly one terminal outcome**, completed or failed, with no completed/failed overlap; and each `failure.required` must equal membership in `required_reviewers`. Never infer requiredness from reviewer names, findings, or current availability.
7. The canonical payload must contain valid full `findings` and valid `actionable_findings`. Stable finding identity is `#`, which must be unique within each array. Define the expected actionable set as every full finding whose `autofix_class` is `gated_auto` or `manual` and whose `owner` is `downstream-resolver`. The actionable queue must match that expected stable-ID set exactly, and every actionable object must be canonically deep-equal to its source full finding across all fields; a compact or mutated projection is malformed.
8. A helper result of `malformed` covers invalid JSON, missing/invalid fields or types, invalid verdict, top-level/receipt status mismatch, receipt mismatch, inconsistent roster relationships, invalid or duplicate finding identities, a non-exact actionable projection, or `degraded` without a required coverage gap. Discard the wave's findings. A **coverage gap** (`coverage_gap`) means a structurally valid receipt has a required reviewer that did not complete or failed as required; the result preserves `missing_required_reviewers`, `failed_required_reviewers`, and the canonical `terminal_status`, including `degraded` and all-failed `failed` payloads, and can never satisfy convergence. A structurally valid `failed` payload with no required coverage gap returns `failed_review` rather than `valid`. `concurrent_change` means the checkout no longer matches the frozen expectation. `validate-final` can return `valid` only for matching `complete`/`complete` status, full required coverage, `Ready to merge`, and an empty actionable queue; it never accepts `degraded` or `failed`.
9. If the skill is unreachable, do not imitate it. Record `skill_unreachable` and emit one copyable canonical invocation in the active harness's user-facing syntax.
10. On a valid wave, record its artifact, receipt, reviewed HEAD, verdict, full `findings`, `actionable_findings`, `triage_groups`, `residual_risks`, `testing_gaps`, advisory output, and reviewer coverage before interpreting findings.

## Finding Revalidation

The apply queue is exactly `actionable_findings`. `triage_groups` are organizational evidence only: **intersect** each group's stable finding numbers with the actionable queue before grouping, and never create mutation authority from a group summary.

The canonical contract has no `route` field. For every queued finding require a stable `#`, severity, `file`, `line`, `why_it_matters`, quoted `evidence`, canonical `autofix_class`, canonical `owner`, and either a concrete `suggested_fix` or explicit decision context. Missing required detail is an integrity failure for that finding; do not guess.

Before mutation, revalidate against **current HEAD**:

1. The file exists at current HEAD and the cited line is in range.
2. The quoted evidence appears in surrounding context and still identifies the same code or contract.
3. The described failure mode remains present; nearby edits have not made the finding **stale**.
4. The branch, HEAD, and clean tree still match the post-wave checkpoint.

A stale or unidentifiable finding cannot be applied. Remove no evidence silently: record why it failed identity and require a fresh canonical wave when current state cannot establish closure.

Partition every revalidated finding before deciding whether to stop:

- **Mechanical:** code, tests, public contracts, active instructions, or an explicit implementation-ready plan establish the defect and required behavior; verification can prove the response without choosing new product semantics.
- **Decision-bearing:** the response requires a product or design choice, public compatibility decision, migration or rollout policy, unavailable external authority, or behavior that repository evidence cannot prove.

After partitioning, group the mechanical set into independent root-cause families. Remediate **all independent mechanical families** allowed by the current scope and remaining budget before returning for a decision-bearing blocker, one bounded family per cycle. Then, if any decision-bearing finding remains, return `Non-converged` with it as a non-waivable **blocker**. Never guess through the blocker, never converge through it, and never let completed mechanical work waive it. A decision-bearing finding is never resolved inside this invocation. Report bounded decision context so the user can make the decision outside this invocation, then rerun the loop. This invocation never turns a decision-bearing item or later user reply into automatic repair authority.

## Remediation Cycle

Group mechanical findings by shared root cause and overlapping fix path. Use valid `triage_groups` as hints after intersection, then reconcile semantically when groups are absent, overlap, or split one invariant across sibling sites. One family consumes one work unit, including a failed or discarded cycle.

For each family:

1. Write a private JSON array of the exact intended repository-relative touched paths and initialize the private verification JSON with the outer skill's **verification plan**. Intended paths may name existing regular files or safe missing leaf files whose parent directory already exists inside the repository; reject a missing parent, symlink, absolute path, duplicate, or escape. Invoke `"$NODE" "$SKILL_DIR/scripts/loop-state.mjs" cycle-checkpoint --repo <path> --state <json-file> --paths-json <json-file> --verification-json <json-file>`. Accept only `status: "checkpointed"`. The command requires a clean tree, records branch/checkpoint HEAD plus `{exists:false}` for a missing leaf or exact before bytes, digest, and mode for an existing file.
2. Apply the smallest complete source fix, including necessary callers, tests, fixtures, types, and contract documentation. Do not add unrelated cleanup or new policy.
3. Inspect the **complete cycle diff** against the checkpoint for unexpected files, duplicated policy, widened interfaces, accidental behavior changes, and evidence that another party changed the tree.
4. Run **targeted verification** selected by the outer skill from existing repository commands. Broaden it according to **blast radius** when shared, public, persistence, concurrency, build, or cross-package surfaces changed. Write the exact checks and outcome to the recorded verification JSON using `status: "passed"` only when every selected check passed; otherwise use `status: "failed"`.
5. If verification or diff validation fails, invoke `"$NODE" "$SKILL_DIR/scripts/loop-state.mjs" cycle-restore --repo <path> --state <json-file>`. The helper performs the required **restore only** operation on recorded paths when branch and checkpoint HEAD are unchanged and every non-recorded tracked or untracked path still matches the checkpoint. It restores exact bytes and modes for existing-before files and deletes only loop-created files recorded missing-before. On `concurrent_change`, preserve all observed bytes and stop; do not improvise a manual revert or restore.
6. On successful verification, invoke `"$NODE" "$SKILL_DIR/scripts/loop-state.mjs" cycle-commit --repo <path> --state <json-file> --message <message>`. The helper requires verification JSON `status: "passed"`, unchanged branch/checkpoint HEAD, and a diff path set exactly equal to the intended paths, including any newly created intended files. It stages only those paths, then captures a **verified staged snapshot** for every intended path: existence, exact bytes and blob digest, and executable/tree mode. It creates the commit without weakening hooks, signing, or repository policy.
7. After `git commit`, the helper requires HEAD to advance to exactly one commit whose sole parent is the checkpoint HEAD; the commit diff path set must equal the intended paths exactly; every committed intended path's existence, exact bytes/blob digest, and mode must equal the verified staged snapshot; and the working tree/index must be clean. Only then may `cycle-commit` return `committed` with a commit SHA and `clean: true`. Record the resulting HEAD, commit, touched paths, finding identities, complete diff, and verification evidence. Create **one local commit** for the entire defect family using `fix(review): <root cause>` or the repository's nearest valid convention. Never amend, squash, rebase, or push.
8. Any hook-added path, hook-mutated intended content or mode, unexpected parent, missing commit SHA, unreadable committed tree, or non-clean working tree/index returns `commit_integrity_failure` with the created commit SHA when available, a precise reason, and changed paths. Preserve the created commit, history, index, and working-tree bytes exactly as observed; never amend, reset, restore, or retry the commit. Stop the protocol and return `Non-converged` with this evidence. An ordinary pre-commit failure before a commit exists returns `commit_failed` and likewise leaves the verified bytes intact; never weaken hooks, signing, or repository policy.
9. **Any remediation commit invalidates** every previous verdict, zero-finding claim, finding count, required-reviewer coverage claim, and final-gate claim. The next work unit must generate a new per-wave expected JSON from the new current checkpoint HEAD, then run a fresh canonical full review. A lower or declining finding count and passing tests are diagnostic progress, not convergence; tests alone are not convergence.

## Non-convergence

Stop before budget exhaustion when trajectory shows repair is oscillating or escaping the reviewed contract:

- the same root defect **reappears** after its verified fix;
- fixes **alternate** between incompatible states;
- one unsatisfied invariant migrates across **sibling** sites;
- a later required response **contradicts** a prior required fix and repository evidence cannot resolve it;
- required fix scope grows materially beyond the reviewed change's intended contract.

**Progressive failure migration** is not oscillation: closing independent defect A and then discovering distinct defect B is **ordinary progress**. A recurrence across multiple sites with one root cause should be widened into one bounded family rather than patched one site per wave.

Return `Non-converged` with the full **trajectory**: stable finding identities and summaries, family assignments, commits, verification outcomes, recurrences, conflicting states, and the unresolved invariant or decision. Budget exhaustion is also `Non-converged`: open evidence plus an exact next bounded cycle, **never convergence**.

## Final Convergence Gate

Declare success only after invoking `"$NODE" "$SKILL_DIR/scripts/loop-state.mjs" validate-final --repo <path> --expected <json-file> --review <json-file>` on the exact canonical payload for the **final HEAD**. This command includes ordinary structural, receipt, coverage, full-findings, exact-projection, and checkout validation, then additionally requires matching top-level/receipt status `complete`, the verdict to be exactly `Ready to merge`, and `actionable_findings` to be empty. Accept only `status: "valid"`; `not_final` is a valid remediation wave but cannot converge, while `coverage_gap`, `failed_review`, degraded/failed terminal status, or malformed status agreement can never pass the final gate.

All conditions must hold simultaneously:

- The invocation used `mode:agent` and `depth:full` with the frozen base.
- `validate-final` passed and top-level `status: complete`.
- Canonical verdict is exactly `Ready to merge`.
- `actionable_findings` is empty.
- Every canonical `required_reviewers` entry completed and no required reviewer failed.
- No **decision-bearing blocker** remains.
- Receipt branch and head equal the actual branch and final HEAD.
- The **working tree** was clean and unchanged throughout the review and remains clean afterward.
- **final project verification** passes on that exact final HEAD after the review without changing it.

If final verification changes files, fails, or the checkout drifts, the gate fails. Any new commit or edit requires a fresh canonical wave and another `validate-final` invocation. A reduced finding count, a successful family check, ordinary `validate-review` success, or passing tests before this gate is not convergence.

`residual_risks`, `testing_gaps`, primary human/release-owned findings, and other **advisory** outputs may remain and must be reported without automatic mutation. They do not waive the required `Ready to merge` verdict; canonical review may keep a material advisory blocking through its verdict.

## Quick Reference

| Signal | Required action |
|---|---|
| Dirty entry or detached HEAD | Stop before review and mutation |
| Canonical skill unavailable | Do not imitate; emit copyable canonical invocation |
| Malformed payload or receipt mismatch | Discard findings; remain non-converged |
| Required reviewer missing or failed | Record coverage gap; never use wave as gate |
| Finding identity stale on current HEAD | Do not apply; obtain fresh canonical evidence |
| Decision-bearing finding | Preserve as blocker; never guess |
| Findings share one root invariant | Remediate as one verified family and one local commit |
| Verification fails without concurrent work | Restore only active loop-owned edits |
| Branch, HEAD, or unrelated path changes | Preserve all bytes and stop |
| Hook-mutated commit, unexpected commit parent/path set, missing SHA, or dirty post-commit tree | Preserve the created commit and all bytes; report `commit_integrity_failure` and stop Non-converged |
| Remediation commit created and integrity-verified | Invalidate old evidence; next unit is a fresh canonical wave |
| Independent defect appears after prior fix | Ordinary progress, not oscillation |
| Same invariant recurs or alternates | Stop with trajectory as Non-converged |
| Work-unit budget exhausted | Report open evidence and next bounded cycle; never convergence |
| Final full wave is Ready to merge with empty actionable queue | Run final project verification on unchanged HEAD, then converge |
