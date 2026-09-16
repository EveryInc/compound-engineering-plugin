---
job_id: guarded-job-orchestration
status: needs-review
mode: guarded
created: 2026-09-16T13:46:00Z
updated: 2026-09-16T14:44:13Z
owner: human + agent
branch: feat/ce-job-state
risk: medium
---

# Guarded job orchestration

## Goal

Extend `ce-job` from passive ledger into guarded work orchestration with planning alignment, doc review before implementation, multi-job status, feedback/test requests, and optional Herdr live control.

## Scope

In scope: `ce-job` skill and docs, `job:<ledger>` wiring for relevant CE skills, optional Herdr adapter semantics, setup/config docs, tests, and eval scenarios.

Out of scope: web dashboard, required Herdr dependency, auto-merge, production writes, and replacing `ce-plan`, `ce-work`, or review skills.

## Kickoff

## Decisions

- 2026-09-16: The job ledger is durable source of truth; Herdr is optional live transport.
- 2026-09-16: Guarded kickoff should route to `ce-plan` for non-trivial work.
- 2026-09-16: Guarded planning should include `ce-doc-review` before implementation readiness.

## Plan links

- `docs/plans/2026-09-16-1346-feat-guarded-job-orchestration-plan.md`
- 2026-09-16T13:44:26Z: receipt:plan — passed — docs/plans/2026-09-16-1430-feat-ce-job-factory-control-plane-plan.md — Factory control plane follow-up plan written.

## Work log

- 2026-09-16: Created the implementation plan and this inception job ledger.
- 2026-09-16: Dogfooding `ce-job` for the implementation: expanded `ce-job` with guarded kickoff, feedback/test requests, job index, and Herdr-control references; wired job context into `ce-plan` and `ce-doc-review`; added contract tests.
- 2026-09-16T13:15:12Z: work log: Built deterministic ce-job helper at skills/ce-job/scripts/ce-job and wired the skill/docs to prefer it for ledger mechanics.
- 2026-09-16T13:22:37Z: work log: Added ce-job operator reference and action for user-facing coordination of ledgers, specialist CE skills, and optional live workers.
- 2026-09-16T13:33:08Z: work log: Wrote follow-up ce-plan for factory-control-plane improvements at docs/plans/2026-09-16-1430-feat-ce-job-factory-control-plane-plan.md.
- 2026-09-16T13:44:26Z: receipt:work — passed — Implemented event log, receipts, proof gate, queue, sidecar, and operator commands.
- 2026-09-16T13:46:27Z: receipt:work — passed — Extended setup health, docs, and sibling skill receipt guidance after moving worktree to the local dev folder.
- 2026-09-16T14:27:55Z: receipt:work — completed — https://github.com/EveryInc/compound-engineering-plugin/pull/1728 — Addressed Codex review findings: helper path anchoring, ledger path validation, guarded ready gate, per-request evidence mapping, latest-receipt semantics, ledger write locking, and subprocess test timeouts.
- 2026-09-16T14:44:13Z: receipt:work — completed — https://github.com/EveryInc/compound-engineering-plugin/pull/1728 — Addressed second Codex review pass: safe job IDs, guarded proof plan gate, per-criterion proof, start --force event reset, config fallback, fail-closed locking, extra-section preservation, anchored next commands, and open-question resolution recognition.

## Test requests

## Evidence

- Plan artifact written: `docs/plans/2026-09-16-1346-feat-guarded-job-orchestration-plan.md`.
- Contract test added: `tests/skills/ce-job-contract.test.ts`.
- Targeted tests passed: `bun test tests/skills/ce-job-contract.test.ts tests/release-metadata.test.ts tests/skills/ce-plan-handoff-routing.test.ts tests/skills/ce-work-outcome-spine.test.ts tests/skills/ce-setup-check-health.test.ts` (176 pass).
- Release validation passed: `bun run release:validate`.
- Plugin validation passed: `bun run plugin:validate`.
- 2026-09-16T13:15:12Z: evidence: Targeted suite passed after helper addition: bun test tests/skills/ce-job-contract.test.ts tests/skills/ce-job-script.test.ts tests/release-metadata.test.ts tests/skills/ce-plan-handoff-routing.test.ts tests/skills/ce-work-outcome-spine.test.ts tests/skills/ce-setup-check-health.test.ts (180 pass).
- 2026-09-16T13:15:12Z: evidence: release:validate and plugin:validate both passed after helper addition.
- 2026-09-16T13:22:38Z: evidence: Operator contract tests passed: bun test tests/skills/ce-job-contract.test.ts tests/skills/ce-job-script.test.ts (14 pass).
- 2026-09-16T14:11:39Z: receipt:test — timeout — Full suite attempted and timed out after 900s.
- 2026-09-16T14:11:39Z: receipt:test — passed — Post-review targeted verification passed.
- 2026-09-16T14:27:55Z: receipt:test — passed — Post-review validation passed after feedback fixes.
- 2026-09-16T14:44:13Z: receipt:test — passed — Second post-review validation passed.

## Reviews

- 2026-09-16: `ce-doc-review` was not invoked in this planning turn because this Pi session has no normal skill-invocation tool for CE skills; the plan still requires `ce-doc-review mode:non-interactive docs/plans/2026-09-16-1346-feat-guarded-job-orchestration-plan.md` before implementation.
- 2026-09-16: Attempted two reviewer subagents for the implementation diff; both timed out before returning findings, so this is not a completed review receipt.
- Pending: `ce-code-review` for implementation diff.
- 2026-09-16T13:33:08Z: review: ce-doc-review pending/unreachable in this Pi session for docs/plans/2026-09-16-1430-feat-ce-job-factory-control-plane-plan.md; run mode:non-interactive before implementation.
- 2026-09-16T13:44:27Z: receipt:code-review — skill_unreachable — skipped=skill_unreachable — ce-code-review cannot be invoked through the host normal skill mechanism in this Pi session; prior reviewer fallback timed out.
- 2026-09-16T14:11:39Z: receipt:doc-review — passed — docs/plans/2026-09-16-1430-feat-ce-job-factory-control-plane-plan.md — Reviewer found self-contained skill reference and full-suite wording issues; plan was updated to require caller-provided helper command only, require full-test attempt, and align Herdr helper scope.

## Live control

## Open questions

- None blocking in the current plan. Implementation may refine command grammar and sidecar file shape.

## Done criteria

- `ce-job start guarded` performs alignment and routes to `ce-plan` when needed.
- Guarded jobs record `ce-doc-review` before implementation readiness.
- Developers can list/status all active jobs.
- Feedback and test requests update durable state before live prompts.
- Herdr live control works only when available and fails safe otherwise.
- Consumer skills append durable receipts to the job ledger.
- Tests, validation, and targeted behavior evals pass or have explicit environmental skip evidence.
