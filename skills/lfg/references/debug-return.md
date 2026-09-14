# Reading ce-debug's structured return (LFG defect route)

On the defect route, `ce-debug mode:return-to-caller` is the work source and the implementation at once: it reproduces, root-causes, fixes with test-first discipline, verifies, and commits on a feature branch without pushing. This file defines how to read its return, which returns advance, what each later step substitutes for the plan path it would otherwise receive, and the one case that stops.

## What advances

Only `status: fixed` advances to step 3. `diagnosed-no-fix`, `needs-human`, and `blocked` stop the run with the return's `root_cause`, `residuals`, and blockers reported verbatim; nothing has been pushed. A malformed return, or a `fixed` return whose fix-owned files show no change on the branch, stops the run as blocked.

## What `status: fixed` must carry

Require `status`, `root_cause`, `changed_files`, `head_sha`, `branch`, `pre_fix_scope`, `verification_evidence`, `residuals`, `issue_of_record`, `behavior_change`, and `standalone_shipping_skipped: true`. Empty arrays are valid for `residuals`; `issue_of_record` is `null` when the input carried no ticket.

`verification_evidence` follows the same shape `ce-work` returns: when `behavior_change: true` it must name the regression test used, existing tests inspected, tests added/changed or used unchanged, the red failure or characterization observed before the fix, the verification run, and any deliberate test exception. Do NOT decide the test strategy inside LFG; the evidence is `ce-debug`'s contract. A `fixed` return with `behavior_change: true` and evidence missing or too vague to tell how the fix was proven stops the run as blocked, reporting the missing fields. There is no recovery invocation on this route: `ce-debug` has no reconciliation path, and a second run would reinvestigate.

## Ship only what the user offered

This run publishes only work the user offered: the fix, what the run itself added (review fixes, a captured learning), and prior work on this branch that an open pull request for the branch already contains, because that work is already under review. Nothing else on the branch is offered, whether it is an uncommitted file or a commit that was pushed for backup without a PR. `pre_fix_scope` is how the run knows what was there before the fix. Every step that stages or commits stays inside the fix-owned files plus what the run added: pass `pre_fix_scope.dirty_files` as `exclude:<paths>` to `ce-commit-push-pr`, and on the no-remote path commit those files by name. Before the ship step, when `pre_fix_scope.prior_commits_ahead_of_base` is greater than zero, check for an open PR on this branch (`ce-commit-push-pr`'s own existing-PR check does this and updates that PR when one exists). No open PR means those commits were never offered: do not push and do not open one. Commit the fix locally, report the held-back commits and files, and stop, as `ce-debug`'s own handoff does on a branch carrying unoffered work.

## What later steps receive instead of a plan path

- **Step 3, `ce-simplify-code`:** pass `changed_files` as the scope, never the branch diff, so the pass cannot reach `pre_fix_scope.dirty_files`; pass `root_cause` as the structure the simplification must keep, so the fix is not simplified away.
- **Step 4, `ce-code-review`:** no `plan:` argument. Its requirements check is additive by its own contract and it infers intent from the commits; pass the `root_cause` summary as review context, and scope it to `changed_files` plus any simplify edits when `pre_fix_scope.dirty_files` is non-empty.
- **Step 6 and step 9:** the settled-decisions brief was never composed on this route, so no settled-decisions provenance line is rendered. Pass `root_cause` and `issue_of_record` to `ce-commit-push-pr` as PR-description context, so the PR body carries the diagnosis and links or closes the ticket, together with the `exclude:` list above.
- **Step 7, `ce-compound`:** the same counterfactual applies; a debugged root cause is the most common shape of a durable learning.
- **Step 11, close-out:** the next-work offer reads a plan and is not made.
