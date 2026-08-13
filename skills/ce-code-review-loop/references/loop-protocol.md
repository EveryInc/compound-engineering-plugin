# Code Review Loop Protocol

This protocol keeps canonical review report-only while the outer loop owns entry authority, finding integrity, mechanical remediation, verification, local commits, trajectory, and convergence.

## Mechanics

- **Secure invocation-scoped run state.** Use `/tmp/compound-engineering-$(id -u)/ce-code-review-loop/<run-id>/run-state.json`. Mint a **fresh** unpredictable run id for every invocation; never adopt or resume an existing run directory. Under `umask 077`, create the root and run directory, then `chmod 700` both. Reject either path if it is a **symlink**, is not **owned by the current user**, is not a directory, or cannot be secured. Store only loop state and evidence; create no durable repository artifact.
- **Minimum state.** Record run id, branch, frozen base SHA, starting/current/last-reviewed HEAD, work-unit counts, canonical artifact locations and receipts, actionable-finding ledger and stable identity history, decision blockers, reviewer coverage gaps, defect families, cycle checkpoints, touched paths, commits, verification evidence, recurrence/oscillation trajectory, and final-gate evidence.
- **Checkpoints.** Before and after every wave or cycle, read the actual branch, HEAD, staged/unstaged/untracked status, and relevant file bytes. Never manufacture hashes or state from memory.
- **Ownership boundary.** A tree edit is loop-owned only while the active cycle's checkpoint, intended paths, and before bytes are recorded. Anything else is concurrent work. Never use a broad reset or checkout to erase it.

- **Deterministic Git mechanics.** Resolve `loop-state.mjs` from the loaded skill directory and invoke its `preflight`, `validate-review`, `validate-final`, `cycle-authorize`, `cycle-begin`, `cycle-status`, `cycle-seal`, `cycle-scope-expansion`, `cycle-cancel`, `cycle-recover`, `cycle-restore`, and `cycle-commit` commands for the mechanics they own. Do not improvise equivalent Git inspection, receipt validation, authorization, lease transitions, abandoned pre-begin recovery, final convergence validation, verification sealing, restore, staging, or commit logic.

Use `validate-review --repo <path> --expected <json-file> --review <json-file>` for ordinary waves and `validate-final --repo <path> --expected <json-file> --review <json-file>` only for the final convergence gate.

## Preflight

1. Invoke the self-contained helper fence from `SKILL.md` with `preflight --repo <path> --base <ref>`. The helper resolves `<ref>^{commit}`, computes `git merge-base HEAD <resolved-ref>`, and emits exactly one JSON object `{status,input,branch,base_sha,head_sha,clean}`. Accept only `status: "ok"`, fail-closed `input: "valid"`, a named current local **branch**, one concrete merge-base SHA in `base_sha`, one concrete SHA for HEAD, and `clean: true`; detached HEAD, invalid input, a missing merge base, or staged/unstaged/untracked dirt stops before review and mutation.
2. Reject a PR number, PR URL, branch target, or any scope other than the current checkout before invoking the helper.
3. Use the caller's `base:<ref>`, or choose the repository's normal comparison ref once before this command. Treat either a named ref or direct SHA only as the input commit for merge-base resolution. Freeze the helper's concrete merge-base `base_sha`; use the **same diff base for every wave** and never recompute it after remediation or after the supplied ref advances.
4. Preserve the returned starting `head_sha` as the **immutable starting HEAD** in run state; never overwrite it. Do not reuse it as the expected review HEAD after a remediation commit.
5. Validate a supplied plan path without modifying it. Validate `max-work-units` before spending a unit.
6. From this point, an unexpected branch change, HEAD change outside a recorded loop commit, or working-tree change outside the active cycle is concurrent user work. Preserve all bytes and return `Non-converged`.

## Canonical Review Wave

1. Check remaining budget, then checkpoint branch, the **current HEAD**, and clean working tree. Count the attempted wave as one work unit even if it is discarded or fails.
2. Before invoking every canonical review, generate or rewrite the private expected JSON with exactly the frozen `branch`, frozen `base_sha`, and the **current checkpoint HEAD** as `head_sha`. This per-wave file must be refreshed after every remediation commit; the immutable starting HEAD remains only run history.
3. Through the host's callable skill mechanism invoke exactly `ce-code-review mode:agent depth:full grouping:auto base:<resolved-base-sha>`, appending the supplied `plan:<path>` when present. Never reconstruct the canonical review and never add mutation authority.
4. Persist the exact single canonical JSON payload to the private review JSON file. Invoke the self-contained helper fence from `SKILL.md` with `validate-review --repo <path> --expected <json-file> --review <json-file>` instead of improvising checkout or receipt validation.
5. Accept the wave only when the helper returns `status: "valid"`. It compares the actual clean branch/head with the per-wave expected frozen `base_sha`, current checkpoint `head_sha`, and `branch`, then validates the **complete canonical agent envelope**: exact verdict enum; `scope.base`, `scope.branch`, `scope.head_sha`, `scope.pr_url`, and `scope.files_changed`; non-empty `intent` plus canonical `intent_confidence`; top-level reviewer identities; every findings/advisory array; `requirements_completeness`; `coverage`; `artifact_path`; `run_id`; and `review_receipt`. The top-level scope branch/head and receipt branch/head must agree with the per-wave expected identity. Ordinary validation recognizes matching canonical top-level/receipt status pairs `complete`/`complete`, `degraded`/`degraded`, and `failed`/`failed`; the two statuses must agree. A structurally valid `degraded` pair requires at least one completed reviewer and at least one required coverage gap; `degraded` with full required coverage is malformed (`degraded_without_coverage_gap`). Only `complete` can be a valid remediation wave or final gate.
6. The canonical `review_receipt` still must contain `base_sha`, `head_sha`, `branch`, `selected_reviewers`, `required_reviewers`, `completed_reviewers`, structured `failed_reviewers`, and `terminal_status`. Consume canonical `required_reviewers` **verbatim**. Roster validation requires a non-empty selected roster with the always-on `correctness-reviewer`; unique `selected_reviewers`, `required_reviewers`, `completed_reviewers`, and failure reviewer names; required, completed, and failed reviewers each subsets of selected reviewers; every selected reviewer in **exactly one terminal outcome**, completed or failed, with completed/failed disjoint; and each `failure.required` equal to membership in `required_reviewers`. Top-level human persona identities materialize through the producer-owned explicit mapping (`correctness` -> `correctness-reviewer`, and the documented persona catalog mappings); canonical `adversarial-<provider>` cross-model identities remain unchanged. The top-level materialized set must exactly equal `selected_reviewers`. Never infer requiredness or identities from arbitrary suffixes, findings, or current availability.
7. The canonical payload must contain valid full `findings` and valid `actionable_findings`. Stable finding identity is `#`, which must be unique within each array. Confidence anchors 0 and 25 are suppressed and are malformed in the full or actionable arrays. Actionable findings require confidence 75 or 100, except the producer-documented P0 plus confidence-50 security exception. Define the expected actionable set as every full finding whose `autofix_class` is `gated_auto` or `manual` and whose `owner` is `downstream-resolver`. The actionable queue must match that expected stable-ID set exactly, and every actionable object must be canonically deep-equal to its source full finding across all fields; a compact or mutated projection is malformed.
8. A helper result of `malformed` covers invalid JSON, a truncated or invalid canonical envelope, invalid verdict, suppressed/actionable confidence violations, top-level/receipt status or identity mismatch, receipt mismatch, zero/coreless or inconsistent roster relationships, invalid or duplicate finding identities, a non-exact actionable projection, or `degraded` without a required coverage gap. Discard the wave's findings. A **coverage gap** (`coverage_gap`) means a structurally valid receipt has a required reviewer that did not complete or failed as required; the result preserves `missing_required_reviewers`, `failed_required_reviewers`, and the canonical `terminal_status`, including `degraded` and all-failed `failed` payloads, and can never satisfy convergence. A structurally valid `failed` payload with no required coverage gap returns `failed_review` and likewise cannot converge.
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

1. Write private JSON files for the exact safe repository-relative touched paths, the outer skill's `status: "planned"` verification plan, and a family object containing `family_id`, `root_invariant`, canonical `finding_ids`, and `authority: "mechanical"`. Invoke the self-contained helper fence from `SKILL.md` with `cycle-authorize --repo <path> --state <json-file> --paths-json <json-file> --verification-json <json-file> --family-json <json-file> --review <canonical-review-json> --base <resolved-base-sha> --packet <json-file>`. This is the **sole writable remediation entrypoint**. Accept only `authorized`; it validates canonical evidence, acquires the checkout-wide single-writer registry, creates the checkpoint, and emits the exact fixer packet.
2. **Never batch or parallelize writable defect-family fixers.** Read-only family analysis may run concurrently, but do not authorize or dispatch another family until the active lease reaches a terminal phase. Never dispatch a generic writable task directly from findings or a paraphrased prompt.
3. Pass the generated packet's exact content to exactly one writable fixer. Its first action must invoke `cycle-begin --repo <path> --state <json-file> --lease <lease-id>`. A failed begin means no edit. If writable dispatch is unavailable, the parent may execute the same packet inline only after begin. If dispatch fails before begin, either use that inline route or invoke clean `cycle-cancel`.
   If a prior invocation died after authorization but before `cycle-begin`, use `cycle-recover --repo <path> --state <json-file> --lease <lease-id>` rather than deleting the checkout registry. Recovery succeeds only while the lease is still `authorized` and the branch, HEAD, clean tree, authorized paths, and checkpoint bytes are unchanged; any mutation or ambiguity stays terminally blocked.
4. The fixer may edit only `authorized_paths`. If an unlisted path is required, it must return `scope_expansion` before any edit; validate that result with leased `cycle-scope-expansion`, make the lease terminal, revalidate the wider family, then authorize a new cycle. Never widen scope after mutation.
5. After fixer return, invoke leased `cycle-status`. An edit while `authorized`, an out-of-scope dirty path while `dispatched`, overlapping writable lease, branch/HEAD drift, or post-edit scope expansion is `protocol_violation`. Preserve every byte and stop `Non-converged`; never create a retrospective checkpoint or adopt those bytes as loop-owned work.
6. Inspect the **complete cycle diff** against the checkpoint for unexpected files, duplicated policy, widened interfaces, accidental behavior changes, and evidence that another party changed the tree. Run targeted verification selected by the outer skill and broaden it according to blast radius. Replace the recorded `{"status":"planned","checks":[...]}` verification JSON with `{"status":"passed|failed","checks":[...],"results":[{"check":"<exact planned check>","status":"passed|failed"},...]}`. Preserve the authorized `checks` array exactly, provide one ordered outcome per check, and use `passed` only when every selected check passed. `cycle-seal` binds the canonical terminal object; any later change blocks commit.
7. Immediately after verification, invoke `cycle-seal --repo <path> --state <json-file> --lease <lease-id>`. Accept only `sealed`. On failed verification, seal the failed post-edit bytes before restore so later user edits are detected.
8. If verification or diff validation fails, invoke leased `cycle-restore`. This is a **restore only** operation: it restores only checkpointed paths after matching the seal. Any I/O failure returns structured `restore_failed`; it never overwrites unrelated or post-seal concurrent bytes.
9. On successful verification, invoke leased `cycle-commit`. It creates **one local commit** per root cause, normally `fix(review): <root cause>`, without weakening hooks, signing, or repository policy. Before commit it captures a **verified staged snapshot** of every intended path's existence, exact bytes or blob digest, and executable/tree mode. After commit it requires the sole parent to be the checkpoint HEAD, the commit diff path set to equal the intended paths, and committed existence, bytes/digest, and mode to equal that staged snapshot; the working tree and index must be clean.
10. Any hook-added path, hook-mutated content or mode, unexpected parent, missing commit SHA, unreadable committed tree, non-clean tree/index, `restore_failed`, registry failure, lease mismatch, or seal mismatch returns `commit_integrity_failure` or its precise integrity status and stops `Non-converged`. Preserve the created commit or history and every observed byte exactly; never amend or reset it.
11. **Any remediation commit invalidates** every previous verdict, zero-finding claim, finding count, required-reviewer coverage claim, and final-gate claim. The next work unit must generate a new expected JSON from the new current checkpoint HEAD and run a fresh canonical full review. Passing tests or lower finding count is progress, not convergence.

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

Declare success only after invoking the self-contained helper fence from `SKILL.md` with `validate-final --repo <path> --expected <json-file> --review <json-file>` on the exact canonical payload for the **final HEAD**. This command includes ordinary structural, receipt, coverage, full-findings, exact-projection, and checkout validation, then additionally requires matching top-level/receipt status `complete`, the verdict to be exactly `Ready to merge`, and `actionable_findings` to be empty. Accept only `status: "valid"`; `not_final` is a valid remediation wave but cannot converge, while `coverage_gap`, `failed_review`, degraded/failed terminal status, or malformed status agreement can never pass the final gate.

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
| Writable fixer dispatch | Authorize one exact packet, require `cycle-begin` first, and keep writable families serial |
| Scope expansion | Request before editing, terminate the lease, revalidate, then reauthorize |
| `protocol_violation` | Preserve bytes; never retroactively checkpoint, stage, commit, or restore them |
| Branch, HEAD, or unrelated path changes | Preserve all bytes and stop |
| Hook-mutated commit, unexpected commit parent/path set, missing SHA, or dirty post-commit tree | Preserve the created commit and all bytes; report `commit_integrity_failure` and stop Non-converged |
| Remediation commit created and integrity-verified | Invalidate old evidence; next unit is a fresh canonical wave |
| Independent defect appears after prior fix | Ordinary progress, not oscillation |
| Same invariant recurs or alternates | Stop with trajectory as Non-converged |
| Work-unit budget exhausted | Report open evidence and next bounded cycle; never convergence |
| Final full wave is Ready to merge with empty actionable queue | Run final project verification on unchanged HEAD, then converge |
