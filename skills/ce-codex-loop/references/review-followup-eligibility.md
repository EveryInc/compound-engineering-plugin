# Review Followup Eligibility

This policy is local to `ce-codex-loop`. It is copied and adapted for this skill so runtime behavior does not depend on sibling skill internals.

## Input

Filter only `actionable_findings` from the parsed review JSON. Do not use severity buckets, triage groups, advisory findings, or prose summaries as independent apply queues.

Severity is priority only. `requires_verification` controls test scope only.

## Eligible Finding

A finding is eligible for one fix wave when all are true:

- It appears in `actionable_findings`.
- Its `file` is inside the current manifest.
- The cited evidence still matches current code.
- It has a concrete scoped `suggested_fix` or equivalent specific action.
- The fix is local enough to apply without product, design, security posture, or public contract decisions.

## Skip Reasons

Skip and record a reason when a finding is outside the manifest, stale, lacks concrete action, requires a design decision, needs a public contract decision, or would mutate non-loop-owned files.

Findings outside the manifest are skipped and never applied. They also never enter another review attempt as caller work.

## No Eligible Findings

No eligible findings after a non-clean review is terminal `failed`. Do not run another unchanged review.

## Verification

After a fix wave, run targeted verification for all applied findings. If any applied finding has `requires_verification: true`, include the affected test or command in the verification set. A failing verification allows one repair-or-revert pass before re-review or terminal failure.
