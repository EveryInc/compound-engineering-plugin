# `ce-work`

> Execute against the plan's guardrails, figure out the HOW with code in front of you, ship complete features, and hand off to a clean PR.

`ce-work` is the **execution** skill. It takes a plan (or, for smaller scope, a bare prompt), implements against the plan's guardrails, runs tests continuously, selects an implementation engine and a safe scheduling strategy, runs quality gates, and hands off to a commit + PR flow. Implementation can stay on the current host or route bounded units to another qualified model or harness. The host still owns verification, canonical commits, and shipping.

It treats the plan as a **decision artifact**: authoritative for scope, decisions, units, and tests. It figures out the actual implementation itself. **This is the HOW phase that `ce-plan` deliberately does not pre-write.**

This is the fourth step in the compound-engineering ideation chain:

```text
/ce-ideate         /ce-brainstorm      /ce-plan             /ce-work
"What's worth      "What does this     "What's needed       "Build it."
 exploring?"        need to be?"        to accomplish
                                        this?"
```

`ce-work` is primarily software-focused. It commits, runs tests, opens PRs, and integrates with code review skills. It also has a lightweight **non-code carve-out**: a plan marked `execution: knowledge-work` (produced by `ce-plan`'s approach-altitude flow) routes to a knowledge-work path that reads sources, synthesizes, and produces a deliverable, skipping the code lifecycle. Other non-software work without that marker still ends at `ce-plan`, and a human executes it.

---

## TL;DR

| Question | Answer |
|----------|--------|
| What does it do? | Reads an implementation-ready plan (or scopes a bare prompt), executes against the guardrails, runs tests continuously, ships a reviewed PR |
| When to use it | Implementing a `ce-plan` plan with `artifact_readiness: implementation-ready`; small or medium bare-prompt work; resuming partly-shipped work |
| What it produces | Commits and a PR (or just commits on the no-PR path). Knowledge-work plans produce a saved deliverable instead, with no commit/PR lifecycle. |
| Caller-owned mode | For outer orchestrators (for example `lfg`): `mode:return-to-caller <plan path>` implements and locally verifies, then returns a structured envelope and skips the standalone shipping tail (final simplify, review, PR, CI). Mid-implementation Simplify as You Go still runs. |
| What's next | Review the PR; run `/ce-compound` to capture learnings |
| Distinguishing | Plan-aware idempotency, native or cross-model implementation engines, conservative parallel waves, host-owned verification and commits, operational validation in the PR |

---

## Example invocations

An empty invoke picks the newest eligible implementation-ready code plan in `docs/plans/`. It stops instead of guessing if the newest match is still requirements-only, knowledge-work, or an approach-plan. A requirements-only path is refused until `ce-plan` enriches it. A path argument is the plan to execute. A named engine changes who authors the code, not who verifies or ships.

```text
# Execute a specific implementation-ready plan and own the shipping tail
/ce-work docs/plans/notification-mute.md

# Implement a clear small or medium task without writing a plan first
/ce-work extract a shared duration formatter from the notification views

# Pick up the newest eligible implementation-ready code plan in docs/plans
/ce-work

# If this file is still requirements-only, the run stops and offers ce-plan
/ce-work docs/plans/2026-08-10-feat-notification-mute-plan.md

# Execute a knowledge-work plan: read sources, synthesize, skip the code lifecycle
/ce-work docs/plans/2026-08-12-research-memo-approach.md

# Prefer another harness or model for implementation; the host still verifies and ships
/ce-work use Codex for implementation on docs/plans/2026-07-15-example.md
/ce-work implement docs/plans/2026-07-15-example.md with Cursor
/ce-work use Codex to add retry limits to the existing webhook sender

# Require that route (interactive standalone asks before weakening it)
/ce-work only use Composer for implementation on docs/plans/2026-07-15-example.md

# Outer orchestrator: implement and locally verify, then return a structured envelope
/ce-work mode:return-to-caller docs/plans/notification-mute.md

# Resume, inspect, or clean up an existing external implementation run
/ce-work resume run 20260812-1430-ab12
```

Start with `ce-plan` when the work is large or the product shape is still open. Bare-prompt mode is for work you can already scope.

---

## The Problem

Asking an agent "implement this plan" goes wrong in predictable ways:

- Reimplementing already-shipped work when picking up a partly-finished branch
- Treating the plan as a script: editing the literal files listed even when a different shape would be cleaner
- Tests with everything mocked: proves logic in isolation, says nothing about whether layers interact
- Half-finished features: visible work done, callbacks unwired, edge cases untouched
- Parallel work with silent data loss: multiple agents writing the same file; only the last write survives
- No quality gate: the diff goes straight to PR with no simplification pass, no review, no operational monitoring

## The Solution

`ce-work` runs execution as a structured process with explicit gates:

- The plan is authoritative for WHAT; the agent figures out HOW with code in front of it
- An idempotency check before each task: if verification is already satisfied, skip it
- Scope-appropriate implementation (native inline/subagents by default, or a sanctioned cross-model route) and scheduling (serial or bounded independent waves)
- Test discovery and evidence selection before behavior changes, plus integration coverage before any task is marked done
- Portable self-sizing code review with a residual-work gate: accept, file, fix, or stop, but never silently ship
- Every PR carries an operational validation plan: what to monitor, what triggers rollback

---

## What Makes It Novel

### Plan-aware execution, then idempotent re-entry

`ce-work` reads the plan as a decision artifact, not a script. For unified plans it checks metadata first and refuses `artifact_readiness: requirements-only` artifacts until `ce-plan` enriches them. Scope, decisions, U-IDs, files, test scenarios, and verification criteria are authoritative. The plan body stays read-only during execution. Progress lives in git commits and the task tracker.

Before each task, it checks whether the unit's work is already present and matches the plan's intent. If verification is already satisfied, it marks the task complete and moves on. No silent reimplementation. That matters most when resuming after context compaction, picking up someone else's branch, or returning to a partly-shipped plan weeks later.

### Engine, workspace, and scheduling are separate decisions

Ordinary synchronous native work stays in the active checkout. Each implementation unit gets a fresh, single-use native worker context using whatever isolation the current harness provides. A detached external worker always gets a private linked worktree. The host alone applies, verifies, and commits that result in the canonical checkout.

The scheduler may author a bounded wave concurrently only after checking dependencies, actual and expected paths, shared interfaces, generated or config surfaces, migrations, and shared runtime resources. Results then fold in one at a time against the advancing canonical tree. A clean patch is not proof of semantic compatibility. Overlap or uncertainty returns the affected work to host resolution, re-dispatch, or serial execution.

When the plan defines U-IDs, they propagate as task prefixes, into commit messages, and into the final summary. That works across plan edits because U-IDs are stable. Brainstorm-origin IDs (R/A/F/AE) are preserved when present.

### Test evidence, review, and operational validation

A task is not done when the code compiles. Before changing behavior, `ce-work` discovers the existing test files and chooses the right proof: use an existing failing test, update or strengthen the existing test that owns the contract, add a focused failing test, capture characterization coverage, or record a deliberate exception with replacement verification. Before marking a feature-bearing task complete, it checks that test scenarios cover the categories that apply (happy path, edges, error paths, integration) and traces two levels out for callbacks, middleware, and observers.

Standalone shipping is not done until a `ce-code-review` receipt exists or the shipping summary carries an exact skip phrase (`Code review: skipped (mechanical diff)` or `Code review: skipped (ce-code-review unavailable)`). Mechanical means formatting, dep bumps, lint-only, or generated artifacts only. Review is read-only. `ce-work` applies eligible fixes afterward, then sends any actionable remainder through a four-option residual gate (apply / file tickets / accept with durable sink / stop). "Accept" requires a real durable record. Return-to-caller mode leaves review to the caller (for example `lfg`).

Every PR description includes a `Post-Deploy Monitoring & Validation` section. If there is truly no production impact, the section still exists with that as the recorded decision.

### Smart triage on bare prompts

Not every invocation has a plan. `ce-work` accepts a bare prompt and triages by complexity before its first reference read: trivial work (a couple of files, no behavioral change) goes straight to implementation with no task list, and a purely mechanical diff (formatting, dependency bump, lint-only, generated) also ships without a post-PR watch (`babysit:off` is passed to the shipping skill); a prompt that `ce-plan` already sized in this session — a Direct statement or a chat brief — is executed, never routed back to planning; small or medium work builds a task list; large or sensitive work recommends `/ce-brainstorm` or `/ce-plan` first. The triage is what makes direct invocation reasonable for small work.

Invocation origin does not change this. Agent harnesses do not reliably tell the skill whether the user named it or the model selected it. If the conversation carries one unambiguous active plan (for example, the agent just authored it and the user says "proceed"), that plan is used before bare-prompt triage. Otherwise a concrete implementation request is the bare prompt.

When a qualified external implementation route is selected for clear bare-prompt work, `ce-work` does not send the conversation to the worker. It distills the request into a private bounded implementation brief: goal, scope, discovered files and tests, acceptance and verification, constraints, and conservative units. If it cannot fill in the goal, bounded scope, and authoritative verification without guessing, it clarifies or routes to `ce-plan` before any external egress.

### Session-settled decisions are not yours to improve

A KTD carrying a `session-settled:` label records a decision the user examined and chose for a reason. `ce-work` implements it as specified instead of "improving" it. The restraint is scoped to labeled KTDs. Judgment on everything the plan leaves open is unchanged, and real defects inside a settled approach still surface at full strength. A discovery that a settled decision genuinely cannot work is a blocker return, never a silently-accepted residual.

---

## Quick Example

A plan with four implementation units arrives. `ce-work` reads it, picks up an `Execution note` asking for a failing request-level proof on one unit, and notes a deferred-implementation question. It builds a task list with U-ID prefixes and moves off the default branch onto a feature branch named from the plan, without asking.

Two units share a contract, so they run serially. The other two are independent and can author concurrently. With native execution they use the host's available worker isolation. With a selected external route, each gets a detached sibling worktree. The host inspects every actual change set, folds results into the active checkout one at a time, verifies, and creates separate canonical commits. The idempotency check catches that one unit's verification was already satisfied by a prior session and marks it complete without reimplementation.

`ce-code-review` self-selects a lite roster for the small, low-risk diff. The two suggested findings are addressed afterward. Final validation passes, the operational validation plan is drafted, and `ce-work` invokes `ce-commit-push-pr` with `branding:on` (or the project's own shipping process, when its instructions name one). The plan itself is left untouched. Whether it shipped is derived from git, not recorded in the doc.

---

## When to Reach For It

Reach for `ce-work` when:

- A `ce-plan` plan is ready and you are ready to ship
- You have small or medium work without a plan (bare-prompt mode handles it)
- You are resuming partly-shipped work
- You want conservative parallel execution with isolated concurrent workers
- You want a complete shipping flow: tests, simplify, review, residuals, operational validation, PR

Skip `ce-work` when:

- Product behavior is not decided yet → `/ce-brainstorm`
- Implementation guardrails are not established for non-trivial work → `/ce-plan`
- The bug has a known root cause and an obvious fix → `/ce-debug`
- The task is non-software and is not a marked `execution: knowledge-work` plan. Plain non-software work is a human activity. A marked knowledge-work plan does route to the carve-out.

---

## Make It Automatic

If you want implementation to go through `ce-work` by default, add a standing instruction to your agent's instruction file (the repo's `AGENTS.md`/`CLAUDE.md`, or your global one):

> When asked to build or change code, invoke the `ce-work` skill. For a change already specified down to the files it touches with no behavior change — a typo, a rename, a dependency bump — make the change directly instead.

`ce-work` is cheap on that kind of work when it does fire — the Trivial route skips the task list, and a mechanical diff also skips the post-PR watch — but not invoking it at all is cheaper still, which is what the skip clause buys.

---

## Use as Part of the Chained Workflow

```text
/ce-ideate          (optional)
   |
   v
/ce-brainstorm
   |  requirements-only unified plan
   v
/ce-plan
   |  implementation-ready guardrails: U-IDs, files, test scenarios, scope, risks
   v
/ce-work
   |  honors the guardrails; figures out the HOW with code in front of it
   |  derives progress from git, not the plan body
   |  ships through quality gates to PR
   v
/ce-code-review     (self-sizing review for non-mechanical changes)
   |
   v
/ce-compound        (capture the learning)
```

After shipping, `/ce-compound` captures any reusable learning into `docs/solutions/` so future runs of `ce-plan` and `ce-work` can use it.

---

## Use Standalone

Many people reach for `ce-work` directly with a bare prompt. `ce-plan` is overkill when scope is small and the agent can scope it itself.

- Bug fixes with a clear root cause: direct implementation if trivial; task list if small or medium
- Small refactors: extract a helper, rename a concept, consolidate duplication
- Resuming a partly-shipped plan: idempotency prevents reimplementation
- Wiring a feature you have already designed, where formal planning would be ceremony
- Multi-feature parallel work: the scheduler can author truly independent units concurrently, then integrate and verify them sequentially

For large bare-prompt scope (cross-cutting, sensitive surfaces, many files), `ce-work` recommends `/ce-brainstorm` or `/ce-plan` first, then proceeds with your choice.

## Use Beneath an Outer Orchestrator

When another workflow owns the post-implementation shipping gates (final simplify, code review, PR creation, and CI watching), invoke:

```text
/ce-work mode:return-to-caller <plan path>
```

This mode keeps `ce-work` on implementation and local verification. Mid-implementation "Simplify as You Go" still runs during Phase 2. After that, `ce-work` returns a structured envelope with changed files, completed units, verification evidence, and blockers, sets `standalone_shipping_skipped: true`, and does not run the standalone shipping tail. The caller remains responsible for every post-implementation gate.

Automatic callers can also pass `implementation_engine:<compact-json>` (one `mode`, `target`, `model`, and `source` binding) and `implementation_run:<safe-id>` (resume that existing run) before the plan path.

## Choose the Implementation Author

Native execution is the default. You can assign implementation to a target in the current prompt without changing who owns verification, commits, or the shipping tail:

```text
/ce-work use Codex for implementation on docs/plans/2026-07-15-example.md
/ce-work implement docs/plans/2026-07-15-example.md with Cursor
/ce-work use Cursor with Grok for implementation on docs/plans/2026-07-15-example.md
/ce-work only use Composer for implementation on docs/plans/2026-07-15-example.md
/ce-work use Codex to add retry limits to the existing webhook sender
```

The first three are preferences: `ce-work` attempts the route and continues natively, with a prominent requested-versus-actual disclosure, if it is unavailable. The fourth is a requirement: `ce-work` keeps that external identity fixed while the route is viable and never substitutes another external recipient, but an unavailable route still continues on the current harness and session model after one disclosure. Intent matters, not a particular keyword.

An explicit current task wins. A still-active session preference remains applicable. An implementation-only caller binding keeps its recorded provenance. Active project or user instructions already in context can supply a default. Per-checkout config is the final preference before native execution. An incidental model mention in feature prose, quoted text, examples, or filenames does nothing.

The last example is planless. `ce-work` first scopes the request against the repository and tests, then gives Codex only the bounded private brief. The host remains responsible for inspecting the actual change, authoritative verification, canonical commits, and the shipping tail.

Put an ordered, host-relative preference list in CE config (`config.local.yaml` then `config.yaml`):

```yaml
work_engine_mode: prefer       # off | prefer | require
work_engine_preferences:
  - harness: cursor
    model: composer
  - harness: codex
    model: "gpt-5.6"
  - harness: claude
```

The [central configuration reference](./configuration.md#implementation-routing) explains how this checkout-local default interacts with current-task, session, and project instructions.

Each candidate has a `harness` (`codex`, `claude`, `grok`, `cursor`, or `opencode`) and an optional `model`. Omitting `model` means that harness's configured default. Composer is a model family reached through Cursor, so it is written as `harness: cursor` plus `model: composer`. Keep CLI flags and commands out of config.

`off`, a commented or missing mode, and an invalid mode preserve the native default. `off` affects only standing config; it does not cancel applicable live intent or a caller binding. Both `prefer` and `require` try ordered candidates, then fall back natively on the current harness and session model with one disclosure. `require` keeps the requested external identity fixed while viable and never substitutes an unrequested external recipient.

A candidate is usable only after its unattended, write-capable, isolated-workspace route has qualified and the necessary CLI or authentication is available.

### What an External Run Does

Before any repository material leaves the host, `ce-work` discloses the instruction or config source, the fixed recipient, what bounded unit material is exposed, and which restrictions are adapter-enforced versus cooperative. The adapter uses the CLI's existing authentication, receives a minimized environment, and cannot switch recipients, widen scope, push, open a PR, or choose fallback.

Each external unit starts from a clean recorded SHA in a detached linked worktree under `/tmp/compound-engineering-<effective-uid>/ce-work/<run-id>/` (or `$TMPDIR/compound-engineering-<effective-uid>/ce-work/<run-id>/` when `/tmp` cannot host a writable private root, as in a sandbox that only allowlists `$TMPDIR`). This is same-user concurrency and accidental-mutation containment, **not a security sandbox**. Synchronous native units still use the active checkout; `ce-work` does not create a temporary worktree for every unit. If the selected plan is the only dirty path, `ce-work` discloses and creates a plan-only checkpoint commit first. Any unrelated dirt makes the external route unavailable.

Every CE Work runner start pins a two-hour hard cap independently of the shared runner's shorter default. Workers leave the completed working tree uncommitted. The host snapshots that tree into one complete synthetic transport commit, inspects the actual change set, applies it without committing, runs authoritative tests, and creates one host-owned canonical commit. Failed, timed-out, divergent, or unintegrated runs remain in the private run directory. Reinvoke with the reported run id to resume exactly once. A live attempt cannot race a native fallback. Explicit reap and ownership-checked cleanup are available for preserved attempts.

---

## Reference

| Argument | Effect |
|----------|--------|
| _(empty)_ | Auto-uses the newest `implementation-ready` code plan (or legacy code plan) in `docs/plans/`. Stops if the newest match is requirements-only, knowledge-work, an approach-plan, or unclassified. |
| `<plan path>` | Execute that plan. A requirements-only unified plan is refused until `ce-plan` enriches it. |
| `<bare prompt>` | Triage by complexity (Trivial / Small-Medium / Large) |
| `use Codex` / `with Cursor` / `only use Composer` | Request or require an external implementation author. The host still verifies, commits, and ships. |
| `mode:return-to-caller <plan path>` | Outer-orchestrator use: implement and locally verify, then return structured evidence without the standalone shipping tail |
| `mode:return-to-caller implementation_engine:<compact-json> <plan path>` | Automatic-caller form carrying one implementation-only `mode`, `target`, `model`, and `source` binding |
| `implementation_run:<safe-id>` or `resume run <id>` | Resume, inspect, or clean up that existing external run. Does not start new work. |
| Knowledge-work plan (`execution: knowledge-work`) | Produce the planned deliverable; skip branch, test, review, and PR machinery |

Output: commits and (typically) a PR via `ce-commit-push-pr` — or via a project-defined shipping process when the project's instructions name one; user preference > project process > default. The plan is read-only throughout. `ce-work` never mutates it. Whether it shipped is derived from git, not recorded in the doc.

---

## FAQ

**Why doesn't `ce-work` just write all the code from the plan's exact signatures?**
Because the plan deliberately does not have exact signatures. It has decisions, units, files, scope, and test scenarios. The plan is the WHAT; `ce-work` is the HOW. That separation keeps plans portable across weeks of code change and across implementers.

**What if I don't have a plan?**
Bare-prompt mode triages by complexity. Trivial goes straight to implementation. Small or medium builds a task list. Large surfaces a recommendation to plan first.

**Does `ce-work` create a detached worktree for every unit?**
No. Synchronous native implementation stays in the active checkout, and native subagents use the host harness's workspace behavior. Only independently running external units use the controller-owned detached worktrees described above.

**Are those external worktrees a security sandbox?**
No. They isolate concurrent Git state and contain accidental mutation, but the external CLI runs as the same OS user. `ce-work` limits the packet and authority; stronger OS isolation is outside this feature.

**Why does it check whether work is already done before each task?**
Resuming after context compaction, picking up someone else's branch, or returning to a partly-shipped plan are all common. Idempotency keeps `ce-work` from silently reimplementing what is already there.

**What's the Residual Work Gate?**
When `ce-code-review` surfaces actionable findings the follow-up pass did not resolve, `ce-work` will not silently ship them. It asks: apply now / file tickets / accept (with durable sink) / stop. "Accept" requires a real durable record.

**Does `ce-work` support non-software plans?**
For a plan marked `execution: knowledge-work` (produced by `ce-plan`'s approach-altitude flow), yes. A lightweight carve-out reads the sources, synthesizes, and produces the deliverable, skipping the commit/test/PR lifecycle. Other non-software work without that marker still ends at `ce-plan`, and a human executes it.

**What happens if I pass a requirements-only brainstorm file?**
The run stops and tells you the Product Contract needs `ce-plan` enrichment first. It offers the exact `ce-plan <plan-path>` handoff. Blank invoke does the same if the newest matching artifact is still requirements-only.

---

## See Also

- [`ce-plan`](./ce-plan.md): produces the guardrails `ce-work` executes against
- [`ce-brainstorm`](./ce-brainstorm.md): defines what the plan should accomplish
- [`ce-ideate`](./ce-ideate.md): upstream "what's worth exploring" discovery
- [`ce-code-review`](./ce-code-review.md): portable self-sizing review path
- [`ce-commit-push-pr`](./ce-commit-push-pr.md): handles the final commit + PR flow
- [`ce-compound`](./ce-compound.md): capture reusable learning after shipping
