# Reading ce-debug's structured return (LFG defect route)

On the defect route, `ce-debug mode:return-to-caller` is the work source and the implementation at once: it reproduces, root-causes, fixes with test-first discipline, verifies, and commits on a feature branch without pushing. This file defines how to read its return, which returns advance, what each later step substitutes for the plan path it would otherwise receive, and the one case that stops.

## What advances

Only `status: fixed` advances to step 3. `diagnosed-no-fix`, `needs-human`, and `blocked` stop the run with the return's `root_cause`, `residuals`, and blockers reported verbatim; nothing has been pushed. A malformed return, or a `fixed` return whose fix-owned files show no change on the branch, stops the run as blocked.

## What `status: fixed` must carry

Require `status`, `root_cause`, `changed_files`, `head_sha`, `branch`, `verification_evidence`, `residuals`, `issue_of_record`, `behavior_change`, and `standalone_shipping_skipped: true`. Empty arrays are valid for `residuals`; `issue_of_record` is `null` when the input carried no ticket.

`verification_evidence` follows the same shape `ce-work` returns: when `behavior_change: true` it must name the regression test used, existing tests inspected, tests added/changed or used unchanged, the red failure or characterization observed before the fix, the verification run, and any deliberate test exception. Do NOT decide the test strategy inside LFG; the evidence is `ce-debug`'s contract. A `fixed` return with `behavior_change: true` and evidence missing or too vague to tell how the fix was proven stops the run as blocked, reporting the missing fields. There is no recovery invocation on this route: `ce-debug` has no reconciliation path, and a second run would reinvestigate.

## What later steps receive instead of a plan path

- **Step 3, `ce-simplify-code`:** pass `root_cause` and `changed_files` as the structure the simplification must keep, so the fix is not simplified away. The branch diff remains the scope.
- **Step 4, `ce-code-review`:** no `plan:` argument. Its requirements check is additive by its own contract and it infers intent from the commits; pass the `root_cause` summary as review context.
- **Step 6 and step 9:** the settled-decisions brief was never composed on this route, so no settled-decisions provenance line is rendered. Pass `root_cause` and `issue_of_record` to `ce-commit-push-pr` as PR-description context, so the PR body carries the diagnosis and links or closes the ticket.
- **Step 7, `ce-compound`:** the same counterfactual applies; a debugged root cause is the most common shape of a durable learning.
- **Step 11, close-out:** the next-work offer reads a plan and is not made.
