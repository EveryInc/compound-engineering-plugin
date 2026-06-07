# Review followup (LFG step 3–4)

`ce-code-review` is review-only. LFG applies eligible fixes itself, then commits.

## Step 3 — invoke review

```
ce-code-review mode:agent plan:<plan-path-from-step-1>
```

Parse the raw JSON object and artifact path. Do not pass `mode:autofix`, and do not wait for the default-mode markdown Actionable Findings summary because `mode:agent` does not emit one.

Capture parsed JSON (`status`, `actionable_findings`, `findings`, `artifact_path`, `run_id`). If the JSON is malformed or missing `status`, stop before applying fixes or shipping. If it returns `status: "failed"`, `status: "degraded"`, or `status: "skipped"`, record `reason` and `artifact_path` in the ledger when available, then stop before applying fixes or shipping; do not require `actionable_findings` for these non-complete statuses. For `status: "complete"`, require `actionable_findings` and `findings` to be arrays. A clean review requires `status: "complete"`, `actionable_findings: []`, and no significant `residual_findings` derived from full `findings`.

## Step 4 — apply and persist review fixes

### What to apply

Apply a finding in the working tree only when **all** of the following hold:

1. **`suggested_fix` is present** — concrete change shape from the reviewer.
2. **`confidence` is `100`, or `75` with cross-persona agreement noted in the report** — do not apply anchor-50 findings.
3. **The fix is mechanical** — one coherent change, no contract/permission/security posture change, no new public API shape, no behavior change that needs product sign-off.
4. **Evidence still matches the code** at the cited `file:line` before editing.

Do not treat `autofix_class` as permission to auto-apply.

### What not to apply

- `autofix_class: manual` without a clear mechanical `suggested_fix`
- `autofix_class: advisory` — report-only
- `gated_auto` findings that change behavior, contracts, auth, or permissions
- Anything that needs a design conversation

### Execution

1. Filter `actionable_findings` with the bar above. Also derive `residual_findings` from full `findings`: significant owner `human`, owner `release`, advisory-only, requires-human-judgment, capped, or unapplied significant actionable findings that must be made durable instead of silently treated as clean. In a mixed review result, append significant residuals before applying fixable findings so a later clean rerun cannot erase human/release/advisory residuals from the ledger.
2. Apply eligible fixes in the working tree in severity order (`#` stable from the review).
3. Run targeted tests when `requires_verification: true` on any applied finding.
4. If `git status --short` shows changes, read the active ledger's `github_write_boundary` before staging anything. If `github_write_boundary.commit_allowed` is false, do not stage, commit, or push; record the blocked commit as a residual in the ledger with the changed review-driven files and stop before step 5/shipping. Otherwise stage only review-driven files and commit `fix(review): apply review findings`.
5. Before pushing that commit, check `github_write_boundary.push_allowed`. If `github_write_boundary.push_allowed` is false, do not push; record the blocked push as a residual in the ledger with the commit SHA and stop before step 5/shipping. If push is allowed and an upstream exists, run `git push`. If no upstream exists (common on a fresh feature branch, since step 7's `ce-commit-push-pr` has not run yet), resolve a writable remote dynamically: prefer `origin` when present, otherwise use `git remote` and choose the first configured remote. Then run `git push --set-upstream <remote> HEAD`. If no eligible fixes were applied, note explicitly and skip commit.

## Step 5 — residual handoff

Residuals are findings **not** applied in step 4 that still need a durable handoff — not leftovers from in-skill autofix. Use the `actionable_findings` and full `findings` JSON / artifact from step 3. Human/release/advisory/capped residuals may not be tracker-fileable; include them directly in the residual markdown as `no_sink` entries so the PR body or fallback file is the durable record.
