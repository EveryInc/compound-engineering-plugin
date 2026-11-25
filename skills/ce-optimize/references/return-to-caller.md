# Return to caller

A calling skill runs this with nobody present. Ask nothing, show no menu, and end with the result below. The caller owns review, the PR, and everything after it.

## What stands in for approval

The Phase 0 spec approval, the Phase 1 user approval gate and dependency pre-approval are each answered by these conditions, never by judgment that the run seems fine. All must hold:

- The primary is measured objectively: a duration, size, count, or a pass rate over fixed cases. A judge primary is `blocked`.
- The harness and every behavior check are outside `scope.mutable`, and the required validity probes passed.
- Behavior checks exist for what `scope.mutable` can change, and they pass at baseline.
- The baseline is stable enough to tell a gain from noise under the configured comparison.
- `stopping` caps iterations, active hours and `max_wall_hours`, and no spend is uncapped. Set caps the caller did not give: at most 10 iterations, 2 active hours, 4 wall hours.
- The clean-tree gate passes.

Then write the approval record with `by: caller` and those conditions as evidence. The spec digest and caps bind it exactly as a user's approval does. When one fails, return `blocked` naming it and what would satisfy it.

Approve no new dependency: hypotheses that need one stay deferred. Run experiments on `worktree`; a backend that needs a setup question is not used. Pass over offers such as hand scoring. Resume a matching unfinished run of the same spec; otherwise start fresh under a new spec name.

## Ending

Wrap up with the same confirmation, regression list and exported report. Write CP-5 with the option recorded as `returned`. Do not push or open a PR. A wait this session cannot hold returns `waiting`.

Return one JSON object:

- `status`: `complete`, `waiting`, or `blocked`
- `branch`, `head_sha`: the optimization branch, or null
- `confirmed_gain`: true only when the original-to-final confirmation cleared the threshold, the holdout agrees when one is configured, and nothing that passed at baseline fails
- `baseline`, `final`, `unit`, `samples`, `uncertainty`
- `regressions`, `deferred`, `stopping_reason`
- `report_path`, `spec_path`, `log_path`
- `blocker`, `recovery`: for `blocked` and `waiting`
