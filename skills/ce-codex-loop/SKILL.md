---
name: ce-codex-loop
description: Run a bounded local Codex-oriented implementation, simplification, review, and compound loop from an existing plan without shipping actions.
argument-hint: "<plan path>"
---

# ce-codex-loop

Run a bounded local implementation-quality loop from an existing code-execution plan. This skill composes the public skill contracts for implementation, simplification, review, and compounding, but it is not `/lfg`: it does not ship outward.

## Runtime Boundary

The runtime skill must never commit, must never push, must never create or edit a PR, must never watch CI, and must never run release automation. Local commits made by a developer while authoring this skill are outside this runtime boundary.

Allowed mutations are limited to implementation changes, behavior-preserving simplification, eligible review fixes, one repair-or-revert pass after a fix wave, and verified-success compounding side effects.

## Argument Parsing

Input is a required existing code-execution plan path. Strip no shipping options because there are no shipping options.

Reject missing, unreadable, `execution: knowledge-work`, or unsafe-scope plans before mutation. A safe plan has concrete repo-relative paths under each implementation unit's `Files:` section. Plans that declare mutation work but do not expose enough concrete `Files:` scope to distinguish loop-owned implementation and test work fail closed.

Preflight downstream contracts before mutation:

- `ce-work mode:implementation-only` exists and documents structured statuses.
- `ce-simplify-code mode:structured manifest:<manifest-path>` exists and disables branch-diff fallback.
- `ce-code-review mode:agent plan:<plan-path> base:<stable-base> manifest:<manifest-path> run-id:<run-id> artifact-dir:<artifact-dir>` exists and is report-only.
- `ce-compound mode:headless` is available for post-success compounding.

If any contract is missing, stop with terminal `failed` and do not mutate the checkout.

## References

Load these local references before running stages:

- `references/stage-result-schemas.md`
- `references/terminal-statuses.md`
- `references/working-tree-manifest.md`
- `references/review-followup-eligibility.md`

Load `references/review-followup-eligibility.md` only after a valid review JSON result has been parsed.

## Execution Flow

1. **Preflight.** Parse the plan, reject invalid input, extract planned scope, resolve the downstream public tokens above, and record the verification commands implied by the plan.
2. **Snapshot.** Capture `HEAD`, staged entries, unstaged paths, untracked paths, and one stable review base. This `stable_review_base` is passed to every review attempt.
3. **Overlap gate.** Build the initial loop-owned manifest from the precise planned scope, stage structured file lists when available, and working-tree delta. Stop before mutation if pre-existing staged or unstaged tracked work overlaps any planned implementation or test path, or if an untracked file already exists at any planned Create, Modify, Delete, or Test path. Normalize declared paths to repo-relative paths before comparison; fail closed when a declared path cannot be compared safely.
4. **Implementation.** Invoke `ce-work mode:implementation-only <plan-path>` and require a structured implementation result. `already_satisfied` is terminal only when it includes proof and identified files.
5. **Manifest refresh.** Refresh and validate the manifest after implementation, after simplification, after each fix wave, after each repair-or-revert pass, immediately before every verification command, and immediately before every review attempt. The manifest always distinguishes created, modified, deleted, and temporarily_indexed paths; v1 keeps `temporarily_indexed` empty. Record each refresh as a manifest checkpoint with the stage label and the manifest content used by the next gate.
6. **Simplification.** Invoke `ce-simplify-code mode:structured manifest:<manifest-path>` with the refreshed loop-owned manifest only. If relevant verification cannot be identified, return terminal `unverified`. If verification fails, return terminal `failed`.
7. **Review loop.** Invoke `ce-code-review mode:agent plan:<plan-path> base:<stable-base> manifest:<manifest-path> run-id:<run-id> artifact-dir:<artifact-dir>` with the original supplied plan path, the current refreshed loop-owned manifest, and a per-attempt artifact directory only. Every review attempt uses the same plan path and stable base. `run-id` is the logical review identifier; `artifact-dir` is the exact directory used for `review.json` fallback and must match the returned `artifact_path`. Requirements completeness is evaluated from the explicit plan, never inferred from branch diff or prose. The returned review JSON must include top-level `plan_path` equal to the original supplied plan path, top-level `plan_source: "explicit"`, non-null `requirements_completeness`, `manifest_path` equal to the supplied manifest path, and `reviewed_manifest` exactly equal to the manifest supplied for that attempt. Primary JSON, `review.json`, and `metadata.json` must agree on `manifest_path` and `reviewed_manifest`. Any missing, malformed, inferred, stale, or mismatched plan or manifest context is terminal `failed`; stop before review fixes, another review attempt, final verification, or compound. The exact manifest supplied to the final clean review attempt becomes terminal `reviewed_manifest`. Clean review requires all three predicates: status == complete, verdict == Ready to merge, and actionable_findings.length == 0.
8. **Review followup.** For a non-clean review, process only `actionable_findings` through the local eligibility reference. Each non-clean attempt permits one eligible fix wave and one repair-or-revert pass, then requires a manifest refresh, manifest validation, and green verification before re-review.
9. **Final verification.** Run final verification commands after clean review. A red final verification is terminal `failed`.
10. **Compound.** Invoke `ce-compound mode:headless` exactly once, run exactly once, only after clean review and green final verification. Snapshot repository state immediately before and after the invocation; the delta is `compound_outputs`. A compounding failure after quality is verified returns `quality_verified_but_compound_failed` without retry.
11. **Report.** Emit the terminal report shape from `references/terminal-statuses.md`.

## Planned Scope Extraction

Before the overlap gate, inspect every implementation unit and parse every concrete repo-relative path declared under its `Files:` entry. Classify paths into:

```json
{
  "created": [],
  "modified": [],
  "deleted": [],
  "test_paths": []
}
```

Treat labels equivalent to Create, Modify, Delete, Test, and inline test path phrases inside the `Files:` section as scope declarations. Do not guess paths from ambiguous prose in `Test Scenarios`, `Approach`, or `Verification`. The overlap gate evaluates the union of `created`, `modified`, `deleted`, and `test_paths` before `ce-work` runs. A pre-existing tracked edit to any planned implementation or test path blocks mutation; an existing untracked file at any planned Create, Modify, Delete, or Test path also blocks mutation. Staged and unstaged changes both count. Unrelated untracked paths remain outside loop ownership and must not be staged or added to `reviewed_manifest`. Test paths such as `tests/math.test.ts` remain in scope even when they are declared in a separate implementation unit from the production file.

## Manifest Checkpoints

Record a manifest checkpoint after every stage that may change repository scope and immediately before every verification or review gate. Required checkpoint labels are:

- `after_implementation`
- `after_simplification`
- `before_simplification_verification`
- `before_review_attempt:<n>`
- `after_review_fix:<n>`
- `before_fix_verification:<n>`
- `after_repair_or_revert:<n>`
- `before_repair_verification:<n>`
- `before_final_verification`

If simplification creates, modifies, or deletes files, the post-simplification checkpoint must include those files and that refreshed manifest is supplied to verification and review. If simplification is a no-op, still record a post-simplification checkpoint proving the current manifest was validated before verification and review. If a review fix or repair/revert creates, modifies, or deletes files, refresh the manifest before verification and before any next review attempt. Never start a review from a pre-simplification, pre-fix, or pre-repair manifest when a later checkpoint exists.

## Review Attempt Rules

At most three total review attempts. Never review an unchanged tree. Never review a known red tree. Never review findings outside the current manifest. If no eligible findings remain after a non-clean review, stop with terminal `failed` rather than running another unchanged review.

Clean review requires all three predicates:

- status == complete
- verdict == Ready to merge
- actionable_findings.length == 0

## Terminal Statuses

The only terminal statuses are:

- `success`
- `failed`
- `unverified`
- `already_satisfied`
- `quality_verified_but_compound_failed`

Every terminal report includes the plan path, stable base, planned scope, manifest checkpoints, `reviewed_manifest`, `compound_outputs`, `final_repository_delta`, stage results, verification outcomes, review attempts with run IDs and artifact paths, finding decisions, compound state, and terminal status. `reviewed_manifest` is the only repository-state manifest represented as having passed simplification, review, review-followup, and final code verification. `compound_outputs` are reported separately and must not be described as reviewed.
