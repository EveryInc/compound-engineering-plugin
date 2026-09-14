# Reading ce-debug's structured return (LFG defect route)

On the defect route, `ce-debug mode:return-to-caller` is the work source and the implementation at once: it reproduces, root-causes, fixes with test-first discipline, verifies, and commits on a feature branch without pushing. This file defines how to read its return, which returns advance, what each later step substitutes for the plan path it would otherwise receive, and the one case that stops.

## What advances

Only `status: fixed` advances to step 3. `diagnosed-no-fix`, `needs-human`, and `blocked` stop the run with the return's `root_cause`, `residuals`, and blockers reported verbatim; nothing has been pushed. A malformed return, or a `fixed` return whose fix-owned files show no change on the branch, stops the run as blocked.

## What `status: fixed` must carry

Require `status`, `root_cause`, `changed_files`, `head_sha`, `branch`, `pre_fix_scope`, `verification_evidence`, `residuals`, `issue_of_record`, `behavior_change`, and `standalone_shipping_skipped: true`. Empty arrays are valid for `residuals`; `issue_of_record` is `null` when the input carried no ticket.

`verification_evidence` follows the same shape `ce-work` returns: when `behavior_change: true` it must name the regression test used, existing tests inspected, tests added/changed or used unchanged, the red failure or characterization observed before the fix, the verification run, and any deliberate test exception. Do NOT decide the test strategy inside LFG; the evidence is `ce-debug`'s contract. A `fixed` return with `behavior_change: true` and evidence missing or too vague to tell how the fix was proven stops the run as blocked, reporting the missing fields. There is no recovery invocation on this route: `ce-debug` has no reconciliation path, and a second run would reinvestigate.

## Ship only what the user offered

The user asked for this fix. They did not offer whatever else the branch and the tree already carried: uncommitted files the fix does not touch, or commits beyond the base that are not already under review in an open pull request for this branch. `pre_fix_scope` in the return tells you what was there before the fix; it is the only record, because the fix commit is on top of it now. Before any step in this run pushes, a review-fix commit included, decide whether everything that push would publish is offered: the fix, what this run itself added, and prior work an open PR already holds. When it is, ship as usual and keep the dirty files out of every commit. When it is not, or you cannot tell, hold: commit the fix locally, let no step publish, record leftover findings where a reader will find them without a PR, and say what was held back and that `ce-debug` invoked directly fixes inline on a branch the user is still working on.

## What later steps receive instead of a plan path

- **Step 3, `ce-simplify-code`:** pass `changed_files` as the scope, never the branch diff, so the pass cannot reach work the user did not offer; pass `root_cause` as the structure the simplification must keep, so the fix is not simplified away.
- **Step 4, `ce-code-review`:** no `plan:` argument. Its requirements check is additive by its own contract and it infers intent from the commits; pass the `root_cause` summary as review context. The review has no fix-only scope and reads the working tree, so it may report on files the user did not offer; step 5 applies a finding only to `changed_files` and this run's own edits, and reports the rest as residuals.
- **Step 6 and step 9:** the settled-decisions brief was never composed on this route, so no settled-decisions provenance line is rendered. Pass `root_cause` and `issue_of_record` to `ce-commit-push-pr` as PR-description context, so the PR body carries the diagnosis and links or closes the ticket, and name the files that must stay out of the commit.
- **Step 7, `ce-compound`:** the same counterfactual applies; a debugged root cause is the most common shape of a durable learning.
- **Step 11, close-out:** the next-work offer reads a plan and is not made.
