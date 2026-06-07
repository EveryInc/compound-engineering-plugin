---
date: 2026-06-07
topic: plan-bounded-autopilot
---

# Requirements: Plan-Bounded Autopilot

## Summary

Compound Engineering should support a plan-bounded autopilot mode for Codex-style engineering runs. Once the user approves a clear plan and run contract, the agent can continue through implementation, verification, code review, review-fix loops, commit, push, draft PR, and CI follow-up without asking for permission at every transition.

The mode should reduce micromanagement while preserving human control over major decisions, irreversible actions, and release boundaries.

---

## Problem Frame

The current interaction pattern often stops useful momentum after an interrupt or phase boundary. The user usually wants the agent to continue to the next planned step, especially after review/fix cycles have converged and the next action is already implied by the accepted plan.

The improvement is not unbounded autonomy. The desired behavior is plan-bounded execution with clear escalation triggers, durable state, and human-owned release decisions.

---

## Key Decisions

- **Plan-bounded by default.** Autonomy applies only inside an approved plan and run contract, not to open-ended work.
- **Draft PR boundary.** The agent may push branches and open or update draft PRs, but humans own marking ready, merging, release, and production rollout.
- **Interrupts are context by default.** User messages during a run should be incorporated and the run should resume unless the message explicitly says to pause, stop, hold, or change course, or unless it conflicts with the approved plan.
- **Review loops are autonomous until capped.** The agent should fix actionable findings and re-review automatically until significant findings are gone, the loop reaches its retry cap, or residual issues require human judgment.
- **Escalation is stakes-based.** The agent should pause for destructive, irreversible, secret-touching, cost-bearing, production-impacting, major scope, major architecture, or provider-changing decisions.

---

## Actors

- A1. **User:** Approves the initial plan, supplies direction changes, reviews draft PRs, and decides readiness, merge, and release.
- A2. **Primary agent:** Executes the approved plan, tracks run state, coordinates reviews, applies fixes, and escalates when needed.
- A3. **Reviewer agents:** Inspect requirements, plans, code, tests, or PR state and return findings for the primary agent to triage.
- A4. **External systems:** Git, GitHub, CI, browser test surfaces, package managers, and optional research tools used during the run.

---

## Key Flows

- F1. Approved autopilot run
  - **Trigger:** The user approves a plan and selects plan-bounded autopilot.
  - **Actors:** A1, A2, A4
  - **Steps:** The agent records the run contract, executes the next plan unit, verifies it, updates durable run state, and proceeds to the next eligible unit.
  - **Outcome:** Work advances without repeated permission prompts until completion or escalation.
  - **Covered by:** R1, R2, R3, R4

- F2. Interrupt and resume
  - **Trigger:** The user sends a message while the run is active.
  - **Actors:** A1, A2
  - **Steps:** The agent classifies the message as context, pause, stop, hold, change-course, or conflict. Context is incorporated into the run; pause and conflict cases stop for confirmation.
  - **Outcome:** Routine interruptions do not force the user to restate that the agent may continue.
  - **Covered by:** R5, R6, R7

- F3. Review-fix-review loop
  - **Trigger:** Implementation or verification reaches a review checkpoint.
  - **Actors:** A2, A3
  - **Steps:** Reviewer agents inspect the work. The primary agent fixes significant actionable findings, verifies the fixes, and runs another review pass until no major findings remain or caps are reached.
  - **Outcome:** The agent converges quality before asking the user to make a shipping decision.
  - **Covered by:** R11, R12, R13

- F4. Draft PR and CI follow-up
  - **Trigger:** The plan is implemented and local review gates are satisfied.
  - **Actors:** A1, A2, A4
  - **Steps:** The agent commits scoped changes, pushes the branch, opens or updates a draft PR, watches CI, fixes failures within the run contract, and records residual risks.
  - **Outcome:** The user receives a draft PR that is ready for human judgment, not another transition prompt.
  - **Covered by:** R14, R15, R16

---

## Requirements

**Run contract and state**

- R1. The mode must require an approved plan before autonomous execution starts.
- R2. The run contract must define allowed actions, escalation triggers, retry caps, and the human-owned finish line.
- R3. The agent must maintain durable run state that survives session interruption and records the current unit, last verification, open risks, and next action.
- R4. The agent must resume from durable run state when the user gives a non-conflicting continuation signal.

**Interrupt handling**

- R5. The agent must treat user messages as context updates by default during an active run.
- R6. The agent must pause when the user says pause, stop, hold, change course, or equivalent language.
- R7. The agent must pause when a user message conflicts with the approved plan or changes a major requirement.

**Escalation boundaries**

- R8. The agent must escalate before destructive, irreversible, secret-touching, cost-bearing, production-impacting, or broad-scope actions.
- R9. The agent must escalate before changing major architecture, technology stack, external providers, or plan goals.
- R10. The agent must convert unresolved risks into a residual handoff instead of silently proceeding past uncertainty.

**Quality loops**

- R11. The agent must run verification appropriate to the change before advancing major phases.
- R12. The agent must run code review loops and fix significant actionable findings automatically until no major findings remain or a retry cap is reached.
- R13. The agent must distinguish major actionable findings from low-signal, stylistic, duplicate, or speculative findings.

**Shipping boundary**

- R14. The agent may commit scoped changes, push the branch, and open or update a draft PR when the run contract allows it.
- R15. The agent must not mark a PR ready, merge, release, run production migrations, or perform production write canaries without explicit human approval.
- R16. The agent must watch CI and fix failures within the approved scope until green, capped, or escalated.

**Evidence and planning integration**

- R17. The agent must use external research for fast-moving architectural, stack, model, API, provider, or security-sensitive decisions when those decisions arise inside the plan.
- R18. External research must be source-weighted and freshness-aware rather than based only on recency.
- R19. If required research is unavailable or thin, the agent must mark affected decisions as assumptions or escalation items.

---

## Acceptance Examples

- AE1. **Routine interruption resumes**
  - **Covers:** R5, R6, R7
  - **Given:** An autopilot run is fixing review findings.
  - **When:** The user adds a clarification that does not conflict with the plan.
  - **Then:** The agent incorporates the clarification and continues the review-fix loop without asking whether it may proceed.

- AE2. **Explicit pause stops**
  - **Covers:** R6
  - **Given:** An autopilot run is about to push a branch.
  - **When:** The user says "hold before pushing."
  - **Then:** The agent pauses before the push and waits for further direction.

- AE3. **Architecture change escalates**
  - **Covers:** R8, R9, R17, R18
  - **Given:** The approved plan assumes the existing framework.
  - **When:** Implementation reveals a plausible reason to switch frameworks or providers.
  - **Then:** The agent researches current options, records evidence, and asks the user before changing direction.

- AE4. **Draft PR boundary holds**
  - **Covers:** R14, R15, R16
  - **Given:** Local checks pass and code review has no significant actionable findings.
  - **When:** The run contract permits GitHub writes.
  - **Then:** The agent commits, pushes, opens or updates a draft PR, watches CI, and does not mark the PR ready or merge it.

- AE5. **Review cap creates residual handoff**
  - **Covers:** R10, R12, R13
  - **Given:** Review-fix-review has repeated the maximum allowed number of times.
  - **When:** A significant finding remains unresolved.
  - **Then:** The agent stops automatic fixing and records the residual issue with evidence and recommended options.

---

## Success Criteria

- The user should not need to answer "yes, continue" between planned phases.
- The run should be resumable from a durable ledger after session interruption.
- Draft PRs should include enough verification and residual-risk context for human review.
- Major decisions should be escalated with evidence instead of buried in implementation.
- The mode should preserve the existing Compound Engineering experience for users who do not opt into autopilot.

---

## Scope Boundaries

**Included in v1**

- Plan-bounded autonomous continuation after explicit approval.
- Durable run state sufficient for resume.
- Interrupt classification with clear pause words.
- Automatic code review, fix, and re-review loops.
- Commit, push, draft PR, and CI follow-up when allowed by the run contract.
- Evidence-aware escalation for fast-moving technical decisions.

**Deferred for later**

- Multi-run orchestration across several repositories or worktrees.
- Organization-level policy packs for autonomy limits.
- Automated reviewer calibration based on historical false positives and accepted findings.
- Long-horizon landscape memory that refreshes current AI, framework, provider, and security guidance.
- Cross-thread delegation where independent agents own separate plan units and reconcile outputs.
- Budget-aware autonomy that trades off time, tokens, CI minutes, and confidence.

**Outside v1**

- Automatic merge, release, deployment, or production data changes.
- Unbounded agent initiative outside the approved plan.
- Rewriting Compound Engineering around a new orchestration system.
- Replacing human judgment for product direction, architecture pivots, or release readiness.

---

## Dependencies / Assumptions

- The implementation can read and write a local run ledger or equivalent persistent state.
- The existing `ce-work`, `ce-code-review`, `ce-commit-push-pr`, and `lfg` behaviors provide useful primitives, even if the final design changes their exact coordination.
- GitHub write permissions may vary by repository, so draft PR behavior must degrade gracefully when push or PR creation is unavailable.
- External research tooling may be unavailable, so the mode needs honest fallback behavior.

---

## Outstanding Questions

**Deferred to Planning**

- Where should durable run state live by default: inside the plan artifact, under a dedicated run-log directory, in local config, or in a temporary state store?
- What are the default retry caps for review loops, CI-fix loops, and repeated tool failures?
- How should the run contract be represented so both humans and agents can inspect it quickly?
- Which existing skills should own each phase versus which coordination should live in a new skill or wrapper?

---

## Sources / Research

- `docs/ideation/2026-06-07-compound-engineering-planning-evidence-ideation.md`
- Compound Engineering workflow references discussed during brainstorming: `ce-work`, `ce-code-review`, `ce-commit-push-pr`, `lfg`, `ce-agent-native-architecture`, and `ce-plan`.
- Current agent-engineering guidance consulted during ideation included OpenAI background-mode guidance, OpenAI harness-engineering notes, Anthropic guidance on effective agents, Anthropic trustworthy-agent research, and Anthropic context-engineering guidance.
