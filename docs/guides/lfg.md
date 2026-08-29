# `lfg`

> Run the full hands-off engineering pipeline from planning through an open PR. It pushes and opens the PR without stopping for approval. It does not merge.

`lfg` is the **autonomous pipeline**. It chains the main Compound Engineering workflow into one long-running run: plan, implement, simplify, review, apply eligible review fixes, run browser tests, commit, push, open a PR, then watch CI and repair failures inside a bounded loop.

Use it when you want the agent to take a software task from a description (or a requirements-only plan) to an open PR, and you are comfortable not inspecting each stage. It is not for in-the-loop work. If you want to approve the plan, the diff, or the review findings yourself, run those skills one at a time.

It is best after `/ce-brainstorm`, because the pipeline can then plan against real requirements instead of a one-line prompt. Software brainstorm wrap-up offers "Ship it autonomously with `lfg`" when a unified plan artifact exists and nothing is still blocked on `Resolve Before Planning`.

---

## TL;DR

| Question | Answer |
|----------|--------|
| What does it do? | Plans, implements, simplifies, reviews, applies eligible fixes, runs browser tests, commits, pushes, opens a PR, and watches CI |
| When to use it | A software task you want shipped hands-off, already shaped by `/ce-brainstorm` or clear enough for `/ce-plan` |
| What it produces | Code changes, commits, usually a PR. Unresolved review or CI leftovers become durable notes. No remote: local commits only. |
| What's next | Review the PR. Run `/ce-babysit-pr` to watch it through review toward merge. Optionally `/ce-explain` for a new concept, `/ce-compound` for a reusable learning. |
| What it does not do | Merge the PR, skip planning, run non-software work, or continue into the next area unless you accept a closeout handoff offer |

---

## Example invocations

The usual path is brainstorm, then empty `/lfg`. A plan path enriches that artifact, then ships. Stage assignments change who authors planning or implementation. The rest of the pipeline stays on `lfg`.

```text
# Most common: settle requirements, then ship from that context
/ce-brainstorm design account-level notification controls for enterprise teams
/lfg

# Same handoff, but author the plan on a named model (implementation stays native)
/ce-brainstorm design account-level notification controls for enterprise teams
/lfg plan with fable

# After brainstorm already settled the requirements. No feature text needed.
/lfg plan with fable

# Clear, already-bounded software task. Weaker product context than a brainstorm.
/lfg add a CSV export button to the account reports page

# Enrich a requirements-only plan in place, then ship it
/lfg docs/plans/feedback-sweep-plan.md

# Preference: try Codex for implementation, fall back to native if that route is down
/lfg add account-level notification mute settings, use Codex for implementation

# Requirement: only Composer may implement. If that route is unavailable, lfg stops.
/lfg implement the settled plan, but only use Composer for implementation

# Both stages, each to its own model or harness
/lfg add account-level notification mute settings, plan with fable and use Codex for implementation
```

An unscoped "use fable" or "with Codex" binds to **implementation only**, and `lfg` says so in its opening line. "Plan with Codex" (a harness assigned to planning) is not supported and blocks. Use individual skills when you want to inspect or approve stages yourself.

---

## The Problem

The normal CE workflow is staged on purpose: plan, work, simplify, review, ship. That is useful when you want to inspect each step. It is too much handoff when the task is well bounded and you want the agent to carry the whole thing.

Without an explicit pipeline, autonomous runs tend to skip planning, treat review as optional, forget to persist leftover findings, or stop at "PR opened" while CI is still red.

## The Solution

`lfg` makes the sequence explicit and gated:

1. Compose a short settled-decisions brief from the conversation (each decision, its class, the rejected alternative, and a reason), scoped to this feature, and pass it to `/ce-plan` so those choices are not re-asked. Skip the brief when nothing is settled.
2. `/ce-plan` must produce an implementation-ready **code** plan before work starts. A requirements-only plan, a knowledge-work plan, or a non-software result stops the pipeline.
3. `/ce-work` runs in return-to-caller mode so `lfg` keeps the shipping tail. Behavior-changing work must return verification evidence. Missing evidence is retried once, then the run stops rather than shipping blind.
4. `/ce-simplify-code` runs on the branch diff before review, unless the change is docs-only or roughly under 10 lines.
5. `/ce-code-review` (`mode:agent`) reports findings. `lfg` applies eligible mechanical fixes and commits them. Review itself does not edit the tree.
6. Leftover actionable findings, plus any flagged settlement conflicts, become a `## Unapplied review findings` checklist in the PR body for the reviewer to decide on: fix in-branch, dismiss, or file a ticket. `lfg` files tickets itself only when no PR will exist.
7. `/ce-test-browser` runs in pipeline mode.
8. `/ce-commit-push-pr mode:pipeline branding:on` commits remaining changes, pushes, and opens a PR when a remote exists, and marks CE provenance. If the project's instructions name their own shipping process (e.g. a `/create-pr` skill), that process runs instead, so CE branding may not appear.
9. `/ce-babysit-pr mode:pipeline` watches the open PR: CI repairs via `/ce-debug`, incoming review comments via `/ce-resolve-pr-feedback`, up to three fix rounds by default. Pipeline babysit stops at "CI decided," not "merged."
10. Print `DONE`. If the plan named a larger body of separately planned work and an area is still unplanned, `lfg` may offer an opt-in `/ce-handoff` for a fresh session. It does not continue that area itself.

An invalidating settlement conflict from planning or review stops the pipeline before shipping. Non-halting flagged conflicts become residuals that reach the PR's settled-decisions line.

No git remote: commit locally and skip push, PR creation, and CI watch. That is a terminal local-only path, not an error to retry.

`lfg` never launches `/goal` itself. If goal-mode is the right engine, `ce-work` chooses it and must still return control.

---

## What Makes It Novel

### Hard gates, then one shipping tail

Planning has to land an implementation-ready code plan. Implementation has to return evidence for behavior changes. Review is report-only by design. `lfg` applies the eligible fixes, persists what it will not apply, then owns the one push/PR/CI tail. Stages do not get to skip ahead to coding.

### You can route two stages, not the whole run

Planning can be authored on a named model (`plan with fable`) via `ce-plan`'s model elevation. Implementation can be sent to a harness (`use Codex for implementation`, `only use Composer for implementation`). Unscoped assignments bind to implementation only. Standing defaults live in CE config (`plan_model`, `work_engine_mode`, `work_engine_preferences`). See [Implementation routing](./configuration.md#implementation-routing).

Both a preference and a requirement fall back to the current harness/session model with one disclosure when the external route cannot run. A requirement keeps the requested external identity fixed while viable; it never authorizes another external recipient. `lfg` does not ask whether to weaken the route.

On string-only hosts the implementation seam is `mode:return-to-caller implementation_engine:<compact-json> <plan-path>`. The `plan_model:<alias>` carrier rides beside, never inside, `ce-plan`'s request. Neither carrier becomes plan content, a settled product decision, or review input.

### Residuals and CI leftovers outlive the session

Unapplied review findings sit in the PR body as a checklist, since `lfg` never merges and the reviewer makes the call on each; with no PR they are filed as tickets. Unfixable CI is reported on the PR. `needs-human` leftovers (a product or design call) are deferred, not guessed. The run can reach `DONE` with those records in place.

### Next work is an offer, not a second pipeline

If the completed plan explicitly describes separately planned future areas, `lfg` picks one from current evidence and offers a handoff. Accepting creates a `ce-handoff` for a fresh session to brainstorm that area into a **separate** requirements-only plan. It does not edit the plan that just shipped.

---

## Quick Example

You finish `/ce-brainstorm` on account-level notification mute. The wrap-up offers `lfg`. You invoke `/lfg` (or `/lfg plan with fable`).

`lfg` builds a settled-decisions brief from the brainstorm, invokes `/ce-plan` on the requirements-only artifact, and waits until that file is `implementation-ready` with `execution: code`. Then `/ce-work` implements in return-to-caller mode. Simplify runs. Review reports findings. `lfg` applies the eligible mechanical ones, commits them, and lists the rest as an `## Unapplied review findings` checklist for the PR body. Browser tests run. `ce-commit-push-pr` opens a PR. `ce-babysit-pr` watches CI for up to three repair rounds.

The run prints `DONE` and a line to run `/ce-babysit-pr <pr-url>` if you want it watched through review toward merge. It does not merge. If the plan named a later area, you may get a handoff offer. Decline it and the session is over.

---

## When to Reach For It

Use `lfg` when:

- You have a software task that can go through plan, implementation, review, and PR without you in the loop
- The task is already shaped by `/ce-brainstorm`, or is clear enough for `/ce-plan`
- You want CI failures handled automatically inside a bounded loop
- You are fine with a branch being pushed and a PR being opened

Skip `lfg` when:

- The work is non-software or answer-seeking
- You still need interactive product shaping → `/ce-brainstorm`
- You want to inspect and approve each stage → `/ce-plan`, `/ce-work`, `/ce-code-review`, `/ce-commit-push-pr`
- You only want a commit and PR for work that already exists → `/ce-commit-push-pr`
- You only want a known bug fixed → `/ce-debug`
- The repo has unusual shipping rules that need hand-driven git or release work

---

## Use as Part of the Workflow

```text
/ce-brainstorm describe the feature
/lfg
```

Starting with `/ce-brainstorm` gives the planner a Product Contract. `lfg` invokes `/ce-plan` itself and stops if the result is not an implementation-ready code plan.

A sweep-reconciled plan is the same seam:

```text
/ce-sweep
/lfg docs/plans/feedback-sweep-plan.md
```

After `DONE`:

```text
/ce-babysit-pr <pr-url>          # watch through review toward merge
/ce-explain <new-concept>        # only if lfg printed a New concepts: trailer
/ce-compound                     # optional, if there is reusable learning
```

## Use Standalone

```text
/lfg add account-level notification mute settings
```

Direct invocation is fine for a clear software task. The planner has less product context than it would after a brainstorm.

## Route planning and implementation

You can ask `lfg` to have a specific model or harness author one stage while `lfg` keeps the rest of the run.

- **Scoped to planning:** `plan with fable`, `plan with opus`. This is model elevation inside `ce-plan`. Planning has no cross-harness engine. Assigning a harness to planning (`plan with Codex`, `plan on Cursor`) blocks.
- **Scoped to implementation:** `use Codex for implementation` (preference), `only use Composer for implementation` (requirement). `cursor` means the Cursor harness with its default model. `composer` means a Composer-family model through Cursor.
- **Unscoped:** `use fable`, `with Codex`. Binds to implementation only. In an interactive run that is genuinely ambiguous, `lfg` asks one question, then runs hands-off. In a headless run (scheduler, loop, nested orchestrator) it applies the implementation default and discloses it.
- **No stage instruction:** `ce-plan` uses its `plan_model` config (or none). `ce-work` uses session/project instructions already in context, then checkout-local `work_engine_mode` and `work_engine_preferences`.

A plain mention of a model in feature text, a quote, a comparison, or a filename does not activate routing. See [`ce-work`](./ce-work.md#choose-the-implementation-author) for fallback, timeouts, and detached-worktree behavior.

---

## Reference

| Argument | Effect |
|----------|--------|
| _(empty)_ | Plans from current context (including a just-finished brainstorm), then runs the pipeline if the plan is an implementation-ready code plan |
| `<feature description>` | Passed to `/ce-plan`, then the pipeline |
| `<requirements-only plan path>` | `/ce-plan` enriches that file in place, then the pipeline |
| `<description or path> + stage assignment` | Routing words are stripped from the product request. A scoped planning directive goes to `ce-plan`. A scoped implementation directive goes to `ce-work`. An unscoped assignment binds to implementation only. |

Output: code changes, commits, and usually a PR. No configured git remote: local commits only. If CI is still red after the bounded repair loop, unresolved failures are recorded before the run ends.

---

## FAQ

**Does `lfg` merge the PR?**
No. Pipeline babysit stops when CI is decided (or the fix budget is hit). Merge stays yours. The closeout line points at `/ce-babysit-pr` for an interactive watch toward merge.

**Will it stop and ask me to approve the plan or the diff?**
No. That is the point of the skill, and why it is the wrong tool for in-the-loop work.

**What if planning cannot produce an implementation-ready code plan?**
The pipeline stops. Non-software tasks, requirements-only leftovers, knowledge-work plans, and invalidating settlement conflicts all halt before implementation.

**Where do leftover review findings go?**
Not into the PR description. They are filed in the project tracker when possible, and carried in one run-report comment on the PR.

**What happens if there is no `origin`?**
Local commits only. No push, no PR, no CI watch.

**Can I send planning to Codex?**
No. Planning accepts a model alias (`fable`, `opus`), not a harness. Implementation is the stage that can change harness.

---

## See Also

- [`ce-brainstorm`](./ce-brainstorm.md): strongest upstream source of requirements; wrap-up can invoke `lfg`
- [`ce-plan`](./ce-plan.md): first required pipeline step
- [`ce-work`](./ce-work.md): implementation, called in return-to-caller mode
- [`ce-simplify-code`](./ce-simplify-code.md): pre-review simplification
- [`ce-code-review`](./ce-code-review.md): report-only review gate
- [`ce-test-browser`](./ce-test-browser.md): browser validation
- [`ce-commit-push-pr`](./ce-commit-push-pr.md): shipping handoff when a remote exists
- [`ce-babysit-pr`](./ce-babysit-pr.md): CI and review watch after the PR is open
- [`ce-handoff`](./ce-handoff.md): opt-in next-area snapshot at closeout
- [`ce-sweep`](./ce-sweep.md): rolling plan that `/lfg <plan path>` can ship
