# Test and introduce the fix

## Controls and evidence

1. Fix the minimum required data, IDs, access, rules, and tool connections.
2. List likely failures, who could be harmed, detection signals, stop conditions, response owner, reversibility, and manual fallback.
3. Test historical cases with known answers: normal, missing, confusing, stale, conflicting, adversarial, expensive, retry, failed-tool, and must-go-to-a-person cases.
4. Test the whole workflow, organization rules, retries, and whether staff can act on the result.
5. Put the result in the existing system of record as fields, notes, tasks, drafts, checklists, or approvals.
6. Require human approval, an action log, safe retries that do not repeat effects, a manual fallback, and an immediate off switch.

Each live-system write, production-data change, staff or customer message, or controlled live test requires verified, separately granted user authority. The project-sheet-only authority from invoking `ce-fde` is not enough. If authority is absent, keep `delivery` and record that approval as the exact blocker; do not simulate success or mutate the system.

## Rollout ladder

`historical cases -> silent run -> staff-visible recommendations -> staff approval -> small live group`

Do not expand from this phase. After a small live group, collect baseline-comparable real-use results and advance to `value-review` only when quality is no worse, serious-risk cases pass, failures are detectable and containable, and the owner accepts the test evidence. Otherwise keep `delivery` and record the missing control or evidence.

For `fix-once`, make one bounded repair to the already approved fix without adding users, workflows, or capabilities. Retest the failed cases and controlled live group under the same authority and measures, then return to `value-review`. If the repair would expand scope, stop and request a new design decision instead.
