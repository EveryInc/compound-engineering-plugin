# `ce-work`

> Execute against the plan's guardrails — figure out the HOW with code in front of you, ship complete features, hand off to a clean PR.

`ce-work` is the **execution** skill. It takes a plan (or, for smaller scope, a bare prompt), executes the implementation against the plan's guardrails, runs tests continuously, selects an implementation engine and safe scheduling strategy, runs quality gates, and hands off to a commit + PR flow. It can keep implementation on the current host or route bounded units to another qualified model/harness while the host retains verification, canonical commits, and shipping. It treats the plan as a **decision artifact** — authoritative for scope, decisions, units, and tests — and figures out the actual implementation itself. **It is the HOW phase that `ce-plan` deliberately does not pre-write.**

This is the fourth and final step in the compound-engineering ideation chain:

```text
/ce-ideate         /ce-brainstorm      /ce-plan             /ce-work
"What's worth      "What does this     "What's needed       "Build it."
 exploring?"        need to be?"        to accomplish
                                        this?"
```

`ce-work` is primarily software-focused — it commits, runs tests, opens PRs, and integrates with code review skills. It also has a lightweight **non-code carve-out**: a plan marked `execution: knowledge-work` (produced by `ce-plan`'s approach-altitude flow) routes to a knowledge-work path that reads sources, synthesizes, and produces a deliverable, skipping the code lifecycle. Other non-software work without that marker still effectively ends at `ce-plan`, and a human executes it.

---

## TL;DR

| Question | Answer |
|----------|--------|
| What does it do? | Reads an implementation-ready plan (or scopes a bare prompt), executes against the guardrails, runs tests continuously, ships a reviewed PR |
| When to use it | Implementing a `ce-plan` plan with `artifact_readiness: implementation-ready`; small/medium bare-prompt work; resuming partly-shipped work |
| What it produces | Commits + a PR (or just commits, no-PR path) |
| Caller-owned mode | For outer orchestrators (e.g. `lfg`): `mode:return-to-caller <plan path>` implements and locally verifies, then returns a structured envelope and skips the standalone shipping tail (final simplify, review, PR, CI). Mid-implementation Simplify as You Go still runs. |
| What's next | Review the PR; run `/ce-compound` to capture learnings |
| Distinguishing | Plan-aware idempotency, native or cross-model implementation engines, conservative parallel waves, host-owned verification/commits, operational validation in PR |

---

## Example invocations

```text
# Execute a specific implementation-ready plan and own the shipping tail
/ce-work docs/plans/notification-mute.md

# Implement a clear small or medium task without writing a plan first
/ce-work extract a shared duration formatter from the notification views

# Resume the latest eligible plan in docs/plans
/ce-work
```

---

## The Problem

Asking an agent "implement this plan" goes wrong in predictable ways:

- **Reimplementing already-shipped work** when picking up a partly-finished branch
- **Treating the plan as a script** — editing the literal files listed even when a different shape would be cleaner
- **Tests with everything mocked** — proves logic in isolation; says nothing about whether layers interact correctly
- **Half-finished features** — visible work done, callbacks unwired, edge cases untouched
- **Parallel work with silent data loss** — multiple agents writing the same file in a shared directory; only the last write survives
- **No quality gate** — the diff goes straight to PR with no simplification pass, no review, no operational monitoring

## The Solution

`ce-work` runs execution as a structured process with explicit gates:

- The plan is authoritative for **WHAT**; the agent figures out **HOW** with code in front of it
- An idempotency check before each task — if verification is already satisfied, skip it
- Scope-appropriate implementation (native inline/subagents by default, or a sanctioned cross-model route) and scheduling (serial or bounded independent waves)
- Test discovery + evidence selection before behavior changes, plus integration coverage and a system-wide test check before any task is marked done
- Portable self-sizing code review with a residual-work gate — accept, file, fix, or stop, but never silently ship
- Every PR carries an operational validation plan — what to monitor, what triggers rollback

---

## What Makes It Novel

### 1. Plan-aware execution — honors the WHAT/HOW separation

`ce-work` reads the plan as a decision artifact, not a script. For unified plans, it first checks metadata and refuses `artifact_readiness: requirements-only` artifacts until `ce-plan` enriches them. Scope, decisions, U-IDs, files, test scenarios, and verification criteria are authoritative — the agent figures out the actual implementation itself. The plan body stays read-only during execution; progress lives in git commits and the task tracker.

### 2. Idempotent re-execution

Before each task, `ce-work` checks whether the unit's work is already present and matches the plan's intent. If verification is already satisfied, mark the task complete and move on. **No silent reimplementation.** This matters most when resuming after context compaction, picking up someone else's branch, or returning to a partly-shipped plan weeks later.

### 3. Engine, workspace, and scheduling are separate decisions

Ordinary synchronous native work stays in the active checkout. Native subagents use whatever isolation the current harness provides. A detached external worker always gets a private linked worktree, while the host alone applies, verifies, and commits its result in the canonical checkout. The scheduler may author a bounded wave concurrently only after checking dependencies, actual and expected paths, shared interfaces, generated/config surfaces, migrations, and shared runtime resources. Results then fold in one at a time against the advancing canonical tree. A clean patch is not proof of semantic compatibility; overlap or uncertainty returns the affected work to host resolution, re-dispatch, or serial execution.

### 4. U-ID anchoring across execution

When the plan defines U-IDs, they propagate as task prefixes, into commit messages, and into the final summary. This works *across plan edits* — a deepening pass that splits a unit doesn't break references because U-IDs are stable. Brainstorm-origin IDs (R/A/F/AE) are similarly preserved when present.

### 5. Test evidence gates before "done"

A task isn't done when the code compiles. Before changing behavior, `ce-work` discovers the existing test files for what's being changed and chooses the right proof: use an existing failing test, update or strengthen the existing test that owns the contract, add a focused failing test, capture characterization coverage, or record a deliberate exception with replacement verification. Before marking a feature-bearing task complete, it checks that test scenarios cover the categories that apply (happy path, edges, error paths, integration), and traces two levels out for callbacks, middleware, and observers the change might affect. Mocking everything proves logic in isolation; integration coverage is what proves the layers actually work together.

### 6. Portable code review with explicit residual handling

Every non-mechanical change runs through `ce-code-review`, which selects its own lite or full roster from the diff. Review is read-only; `ce-work` applies eligible fixes afterward, then sends any actionable remainder through a four-option residual gate (apply / file tickets / accept with durable sink / stop). "Accept" requires a real durable record; findings can't live only in the transient session. Harness-native review is only a fallback when the portable reviewer cannot run.

### 7. Operational validation as a default

Every PR description includes a `Post-Deploy Monitoring & Validation` section: log queries, metrics to watch, expected healthy signals, failure signals, rollback triggers. If there's truly no production impact, the section still exists with that as the recorded decision rather than an implicit one.

### 8. Smart triage on bare prompts

Not every invocation has a plan. `ce-work` accepts a bare prompt and triages by complexity: trivial work (a couple of files, no behavioral change) goes straight to implementation; small/medium work builds a task list; large or sensitive work surfaces a recommendation to use `/ce-brainstorm` or `/ce-plan` first. The triage is what makes `ce-work` reasonable for direct invocation on small work, without forcing the full chain for everything.

Invocation origin does not change this behavior: agent harnesses do not reliably tell the skill whether the user named it or the model selected it. If the conversation carries one unambiguous active plan (for example, the agent just authored it and the user says "proceed"), that plan is used before bare-prompt triage. Otherwise a concrete implementation request is the bare prompt.

When a qualified external implementation route is selected for clear bare-prompt work, `ce-work` does not send the conversation to the worker. It distills the request and repository discovery into a private bounded implementation brief: goal, scope, discovered files/tests, acceptance and verification, constraints/exclusions, and conservative units. The controller records its digest and private copy for deterministic recovery. If `ce-work` cannot fill in the goal, bounded scope, and authoritative verification without guessing, it clarifies or routes to `ce-plan` before any external egress.

### 9. Session-settled decisions are not-yours-to-improve

A KTD carrying a `session-settled:` label records a decision the user examined and chose for a reason — `ce-work` implements it as specified instead of "improving" it. The restraint is scoped tightly to labeled KTDs; judgment on everything the plan leaves open is unchanged, and real defects inside a settled approach still surface at full strength. A discovery that a settled decision genuinely can't work is a blocker return, never a silently-accepted residual; non-blocking proceed-and-flag conflicts ride the return envelope as `settled_decision_conflicts`.

---

## Quick Example

A plan with four implementation units arrives. `ce-work` reads it, picks up an `Execution note` asking for a failing request-level proof on one unit, and notes a deferred-implementation question to keep in mind. It builds a task list with U-ID prefixes and confirms the current branch name is meaningful.

Two units share a contract, so they run serially. The other two are independent and can author concurrently. With native execution, they use the host's available worker isolation; with a selected external route, each gets a detached sibling worktree beneath the private run directory. The host inspects every actual change set, folds results into the active checkout one at a time, verifies, and creates separate canonical commits. The idempotency check catches that one unit's verification was already satisfied by a prior session and marks it complete without reimplementation.

`ce-code-review` self-selects a lite roster for the small, low-risk diff; the two suggested findings are addressed afterward. Final validation passes; the operational validation plan is drafted; and `ce-work` invokes `ce-commit-push-pr` with `branding:on`, so the PR includes summary, testing notes, the operational section, and generic Compound Engineering branding. The plan itself is left untouched — it's a decision artifact, and whether it shipped is derived from git, not recorded in the doc.

---

## When to Reach For It

Reach for `ce-work` when:

- A `ce-plan` plan is ready and you're ready to ship
- You have small or medium work without a plan — bare-prompt mode handles it
- You're resuming partly-shipped work
- You want conservative parallel execution with isolated concurrent workers
- You want a complete shipping flow — tests, simplify, review, residuals, operational validation, PR

Skip `ce-work` when:

- Product behavior isn't decided yet → `/ce-brainstorm`
- Implementation guardrails aren't established for non-trivial work → `/ce-plan`
- The bug has a known root cause and an obvious fix → `/ce-debug`
- The task is non-software and is not a marked `execution: knowledge-work` plan — plain non-software work is a human activity (a marked knowledge-work plan does route to the carve-out)

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
   |  implementation-ready guardrails — U-IDs, files, test scenarios, scope, risks
   v
/ce-work
   |  honors the guardrails; figures out the HOW with code in front of it
   |  derives progress from git, not plan body
   |  ships through quality gates to PR
   v
/ce-code-review     (self-sizing review for non-mechanical changes)
   |
   v
/ce-compound        — capture the learning
```

After shipping, `/ce-compound` captures any reusable learning (bugs encountered, patterns established, conventions adopted) into `docs/solutions/` so future runs of `ce-plan` and `ce-work` benefit from the institutional memory.

---

## Use Standalone

Many people reach for `ce-work` directly with a bare prompt — `ce-plan` is overkill when scope is small and the agent can scope it itself.

- **Bug fixes with a clear root cause** — direct implementation if trivial; task list if small/medium
- **Small refactors** — extract a helper, rename a concept, consolidate duplication
- **Resuming a partly-shipped plan** — idempotency prevents reimplementation
- **Wiring a feature you've already designed** in your head, where formal planning would be ceremony
- **Multi-feature parallel work** — the scheduler can author truly independent units concurrently, then integrate and verify them sequentially

For large bare-prompt scope (cross-cutting, sensitive surfaces, many files), `ce-work` recommends `/ce-brainstorm` or `/ce-plan` first — but proceeds with your choice.

## Use Beneath an Outer Orchestrator

When another workflow owns the post-implementation shipping gates (final simplify, code review, PR creation, and CI watching), invoke:

```text
/ce-work mode:return-to-caller <plan path>
```

This mode keeps `ce-work` on implementation and local verification. Mid-implementation "Simplify as You Go" still runs during Phase 2. After that, `ce-work` returns a structured envelope with changed files, completed units, verification evidence, and blockers, sets `standalone_shipping_skipped: true`, and does not run the standalone shipping tail. The caller remains responsible for every post-implementation gate.

## Choose the Implementation Author

Native execution is the default. You can assign implementation to a target in the current prompt without changing who owns verification, commits, or the shipping tail:

```text
/ce-work use Codex for implementation on docs/plans/2026-07-15-example.md
/ce-work implement docs/plans/2026-07-15-example.md with Cursor
/ce-work use Cursor with Grok for implementation on docs/plans/2026-07-15-example.md
/ce-work only use Composer for implementation on docs/plans/2026-07-15-example.md
/ce-work use Codex to add retry limits to the existing webhook sender
```

The first three are preferences: `ce-work` attempts the route and continues natively with prominent requested-versus-actual disclosure if it is unavailable. The fourth is a requirement: an interactive standalone run asks before weakening it, while a headless or automatic caller returns a blocker without prompting. Intent matters, not a particular keyword.

Routing uses normal instruction authority plus scope, not keyword matching. An explicit current task wins; a still-active session preference remains applicable; an implementation-only caller binding keeps its recorded provenance; active project/user instructions already in context can supply a default; and per-checkout config is the final preference before native execution. More specific live intent may replace or narrow config, while an incidental model mention in feature prose, quoted text, examples, or filenames does nothing.

The last example is deliberately planless. `ce-work` first scopes the request against the repository and tests, then gives Codex only the bounded private brief/unit packet. The host remains responsible for inspecting the actual change, authoritative verification, canonical commits, and the shipping tail.

Put an ordered, host-relative preference list in the gitignored `.compound-engineering/config.local.yaml`:

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

Each candidate has a `harness` (`codex`, `claude`, `grok`, or `cursor`) and an optional `model`. Omitting `model` means that harness's configured default. Composer is a model family reached through Cursor, so it is written as `harness: cursor` plus `model: composer`. Keep CLI flags and commands out of config; the list describes the desired author, while `ce-work` starts from its qualified adapter recipe and can inspect the installed CLI's help/version when a compatible invocation has drifted.

The list is intentionally host-relative. In Codex, the example skips an equivalent Codex route only if its requested model is also the current/default model; otherwise that explicit model is a distinct candidate. In Claude Code it can try Cursor first, then Codex, and skip the final Claude default. `ce-work` walks the list only during preflight, records why a candidate is skipped or unavailable, and locks the first qualified recipient before egress. It never hops to another list entry after dispatch starts.

`off`, a commented or missing mode, and an invalid mode preserve the native default. `off` affects only standing config; it does not cancel applicable live intent or a caller binding. `prefer` tries ordered candidates in direct and `lfg` runs, then falls back natively with disclosure when the list is exhausted. `require` asks only in an interactive standalone run; under `lfg` or another headless caller it blocks. An enabled mode without a valid candidate list is unavailable rather than guessed.

Harness, requested model, executable route, and served model remain separate facts. Direct prompts and LFG's transient carrier may still use `cursor` for Cursor's configured default or `composer` as shorthand for a Composer-family model through Cursor. A Grok model reached through Cursor is a separately disclosed intermediary. A candidate is usable only after its unattended fixed-recipient, write-capable isolated-workspace route has qualified and the necessary CLI/authentication is available. `ce-work` tries the documented mapping first, may adapt only within the requested harness/model family while preserving deterministic restrictions, and never claims a served model without a trustworthy receipt.

### What an External Run Does

Before any repository material leaves the host, `ce-work` discloses and records the instruction/config source, fixed recipient and intermediaries, bounded unit material exposed, and which restrictions are adapter-enforced versus cooperative. The detached runner gives the adapter its job identity; the controller validates the actual runner metadata and exact adapter argv before the external CLI starts, so a shell prefix or substituted worker cannot egress under a valid unit authorization. The adapter uses the CLI's existing authentication, receives a minimized environment, and cannot switch recipients, widen scope, push, open a PR, or choose fallback. If a required restriction cannot be enforced, the route is unavailable.

Each external unit starts from a clean recorded SHA in a detached linked worktree under `/tmp/compound-engineering/ce-work/<run-id>/`. This is same-user concurrency and accidental-mutation containment, **not a security sandbox**. Synchronous native units still use the active checkout; `ce-work` does not create a temporary worktree for every unit. If the selected plan is the only dirty path, `ce-work` discloses and creates a plan-only checkpoint commit first. Any unrelated dirt makes the external route unavailable.

Every CE Work runner start pins `CE_PEER_HARD_SECS=7200`, giving the detached job a two-hour hard cap independently of the shared runner's shorter default. Route-qualified incremental activity uses `CE_PEER_IDLE_SECS=600`; that progress-reset window detects a stall and is not a wall-clock maximum. Silent terminal-only or otherwise untrustworthy activity uses `CE_PEER_IDLE_SECS=0` and relies on the hard cap. Progress reports the run id, active unit/route, elapsed time, latest meaningful activity, activity posture, worker terminal state, integration, verification, commit, cleanup, blockers, and recovery path rather than streaming the full transcript.

Worker output becomes one complete synthetic transport commit, including committed and residual edits, untracked/binary files, deletes, renames, and mode changes. After the host inspects its actual scope, one fail-stop controller transaction acquires the integration lock, revalidates the canonical checkout, applies without committing, runs authoritative tests, reconciles test side effects, creates one host-owned canonical commit, and records cleanup. A failed pre-commit step cannot fall through into a later commit; it restores the exact pre-fold checkout before another unit or fallback may start. Unknown canonical movement blocks integration.

After all delegated units land, plan-wide verification also runs through the controller rather than as a loose shell tail. The controller begins from a clean canonical snapshot, captures the real exit status, suppresses Python bytecode, removes artifacts created by the gate, proves the starting snapshot again, and records a resumable receipt. A failing gate keeps its private log and blocks completion.

Successful worktrees are cleaned only after canonical verification and commit. Failed, timed-out, divergent, or unintegrated runs remain in the private `0700` run directory with `0600` state for inspection. Reinvoke with the reported run id to resume exactly once; a live or temporarily unreachable attempt cannot race a native fallback. Explicit reap and ownership-checked cleanup are available for preserved attempts. Parallel external units share one wave base, must all terminalize before fold-in, and integrate sequentially; unexpected textual or semantic overlap stops the affected wave.

---

## Reference

| Argument | Effect |
|----------|--------|
| _(empty)_ | Auto-uses the latest plan in `docs/plans/` |
| `<plan path>` | Origin-sourced execution |
| `<bare prompt>` | Triage by complexity (Trivial / Small-Medium / Large) |
| `mode:return-to-caller <plan path>` | Outer-orchestrator use: implement and locally verify, then return structured evidence without the standalone shipping tail (final simplify, review, PR, CI) |
| `mode:return-to-caller implementation_engine:<compact-json> <plan path>` | Automatic-caller form carrying one implementation-only `mode`, `target`, `model`, and `source` binding |

Output: commits and (typically) a PR via `ce-commit-push-pr`. The plan is read-only throughout — `ce-work` never mutates it; whether it shipped is derived from git, not recorded in the doc.

---

## FAQ

**Why doesn't `ce-work` just write all the code from the plan's exact signatures?**
Because the plan deliberately doesn't have exact signatures — it has decisions, units, files, scope, and test scenarios. The plan is the WHAT; `ce-work` is the HOW. This separation keeps plans portable across weeks of code change and across implementer.

**What if I don't have a plan?**
Bare-prompt mode triages by complexity. Trivial goes straight to implementation; small/medium builds a task list; large surfaces a recommendation to plan first.

**Does `ce-work` create a detached worktree for every unit?**
No. Synchronous native implementation stays in the active checkout, and native subagents use the host harness's workspace behavior. Only independently running external units use the controller-owned detached worktrees described above.

**Are those external worktrees a security sandbox?**
No. They isolate concurrent Git state and contain accidental mutation, but the external CLI runs as the same OS user. `ce-work` limits the packet and authority, minimizes environment exposure, and detects canonical-checkout movement; stronger OS isolation is outside this feature.

**Why does it check whether work is already done before each task?**
Resuming after context compaction, picking up someone else's branch, or returning to a partly-shipped plan are all common. Idempotency ensures `ce-work` doesn't silently reimplement what's already there.

**What's the Residual Work Gate?**
When `ce-code-review` surfaces actionable findings the follow-up pass didn't resolve, `ce-work` won't silently ship them. It asks: apply now / file tickets / accept (with durable sink) / stop. "Accept" requires a real durable record — findings can't live only in the session.

**Does `ce-work` support non-software plans?**
For a plan marked `execution: knowledge-work` (produced by `ce-plan`'s approach-altitude flow), yes — a lightweight carve-out reads the sources, synthesizes, and produces the deliverable, skipping the commit/test/PR lifecycle. Other non-software work without that marker still ends at `ce-plan`, and a human executes it.

---

## See Also

- [`ce-plan`](./ce-plan.md) — produces the guardrails `ce-work` executes against
- [`ce-brainstorm`](./ce-brainstorm.md) — defines what the plan should accomplish
- [`ce-ideate`](./ce-ideate.md) — upstream "what's worth exploring" discovery
- [`ce-code-review`](./ce-code-review.md) — portable self-sizing review path
- [`ce-commit-push-pr`](./ce-commit-push-pr.md) — handles the final commit + PR flow
- [`ce-compound`](./ce-compound.md) — capture reusable learning after shipping
