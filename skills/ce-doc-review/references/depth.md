# Choosing the review depth

A wrong plan can ship silently, so depth follows what a wrong plan would cost, not how long or detailed it is. Depth is `lite` or `full`. Decide it after classification and before the team announcement.

## When a review runs lite

Only a plan document (`plan` or `unified-plan`) can run lite. Every other document type runs `full` with today's team selection.

A plan runs `full` when any of these holds:

- The caller passed the `depth:full` token. Callers can force full; no caller can request lite.
- A saved review state for this document records `full`. A later round or resume keeps or raises the recorded depth, never lowers it.
- A conditional persona other than `scope-guardian-reviewer` activates under `references/persona-selection.md`.

Otherwise the plan runs `lite`.

Judge activation from the plan text and from what the files and code paths it names actually do. Open those paths and read enough to see what they touch; do not scan the rest of the repository. A plan that never says "payment" or "session" still crosses that boundary when the handler it names marks a booking paid or issues a session token. The security-lens bound in persona-selection applies to this read unchanged: reading or displaying ordinary, non-sensitive user data, storage churn, or touching a non-sensitive endpoint does not activate it.

## The lite review

Lite is one independent reviewer, not a smaller version of the team. Dispatch a single generic subagent at the lite reviewer's tier, as `references/dispatch.md` describes for any reviewer, with three persona files instead of one: `coherence-reviewer`, `feasibility-reviewer`, and `scope-guardian-reviewer`. It reads the template and schema as usual, applies all three lenses, and returns one schema-shaped result with `reviewer: lite`. Tell it one more thing: if the plan, or a file it names, shows a consequence the three lenses are not meant to judge, it adds one `residual_risks` entry beginning `ESCALATE:` that names the consequence and where it shows. Those consequences are money moved, access granted, or sensitive data exposed wrongly, or a broken promise to an outside consumer of an API, CLI, file format, or other public contract.

Lite never runs the cross-model pass.

If the host cannot dispatch a subagent, run the lite review inline. The author of the plan is then reviewing its own work, so Coverage must say the lite review was not independent.

## Escalation

When the lite result carries an `ESCALATE:` entry, or synthesis finds such a consequence in any lite finding, switch to `full` in the same invocation before any synthesis output. Reselect the team under persona-selection with the escalated consequence as evidence, announce the full team as usual, and dispatch it. The lite result's findings join the full team's returns in synthesis as one more reviewer. The `ESCALATE:` entry has done its job once the team is dispatched, so it does not appear among the result's residual risks. Severity alone never escalates: a routine plan can carry a P1 coherence error and still be lite.

## Recording the depth

Record the depth that ran in the result's Coverage, in both modes. Lite always produces a Coverage line, even when everything else ran as planned. Write it as a sentence that does not begin with the word "depth", for example `Coverage: lite review (one combined coherence, feasibility, and scope reviewer).` After an escalation, say the review started lite and escalated to full, and name the consequence that caused it. Full needs no Coverage mention unless something else limited it.

Save the depth with the saved review state in the run directory (`$SCRATCH_ROOT/ce-doc-review/<run-id>`), together with the lite reviewer's raw return, so a resume or later round can read both.

## Later rounds and resume

A later round on a lite review reruns the lite pass on the changed document instead of the per-reviewer carry-forward that persona-selection describes for the full team. Before it does, recheck the full conditions above against the document as it now stands; an edit that crosses a boundary raises the depth to `full`. A valid resume of a completed lite review reuses its result like any other completed review, unless the caller passed `depth:full`: that runs the full team now, and the lite result joins synthesis as it does after an escalation.
