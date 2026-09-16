# Guarded start

Use this reference for `ce-job start guarded`. It turns a goal into an agreed job contract before any implementation begins.

## Outcome

A guarded job starts with enough shared context to let an agent work inside scope without repeatedly asking the user. The kickoff produces a ledger with goal, scope, non-goals, risks, open questions, candidate done criteria, likely verification, and the plan/review state that decides whether work may start.

## Context pass

Gather bounded context before finalizing the ledger:

- current git branch and dirty state
- active project instructions and conventions already in context
- matching existing ledgers in the job root
- related plans under `<root>/plans/`
- matching learnings under `<root>/solutions/`
- likely files and tests from cheap repo search
- user-settled decisions from the conversation

Do not implement, run tests, start servers, or launch workers during this pass. If a matching active job exists for the same branch and goal, report it and ask before creating a new one.

## Draft the job contract

Write a draft with these fields before asking questions:

- Goal: the user-visible or operator-visible outcome.
- Scope: in-scope, out-of-scope, and likely affected surfaces.
- Kickoff: context found, assumptions, risks, and source links.
- Decisions: user-settled choices and rejected alternatives.
- Open questions: only questions that would change scope, architecture, risk, or verification.
- Done criteria: observable completion checks, including review and evidence requirements.

Ask only material questions. If a question can be handled as an assumption without risking the wrong product or an unsafe action, record the assumption instead of blocking. If the user answers, append the answer under Decisions or Scope before continuing.

## Planning gate

Route to `ce-plan` when any of these hold:

- the work has more than trivial implementation scope
- product behavior or technical scope needs agreement
- multiple CE skills or agents will touch the job
- the work touches public contracts, auth, payments, data migration, external systems, CI, or user-visible workflow
- guarded autonomy is requested and no implementation-ready plan is linked yet

Invoke `ce-plan` through the host's normal skill-invocation mechanism with the job ledger path as `job:<ledger>` and the goal or source document as the planning input. Do not substitute a generic subagent for `ce-plan`. If the host cannot invoke `ce-plan`, record `plan_status: skill_unreachable` in the ledger and leave the job `blocked` with the exact recovery path.

A guarded job becomes `ready-for-work` only after `ce-plan` produced an implementation-ready plan and its mandatory `ce-doc-review` phase either completed or produced a recorded blocker/skip state. A skipped or unreachable plan review is not a pass; the ledger must name it as a blocker or explicit risk before implementation starts.

## Small-job path

If the work is truly small enough to execute without a plan, record why no plan is needed, add concrete done criteria and verification expectations, and leave the job `active` rather than `ready-for-work` until the first worker records evidence. Small-job routing does not waive code review for behavior-bearing implementation.

## Handoff

End by reporting:

- ledger path
- current status
- plan path or plan blocker
- doc-review state
- open questions
- next safe action

If the next action is implementation, name the exact handoff shape: `ce-work job:<ledger> <plan-path>` for plan-backed work, or `ce-work job:<ledger> <work description>` for a small job.
