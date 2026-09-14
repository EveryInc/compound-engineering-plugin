# `lfg`

> Carry a request end to end through the Compound Engineering skill whose job it is, hands-off. A change to the code ends in an open PR it pushes without stopping for approval; anything else ends with that skill's result. Merging stays with you unless you grant it for the run.

`lfg` chains the main Compound Engineering workflow into one long-running run: plan or diagnose, implement, simplify, review, apply eligible review fixes, capture any durable learning, run browser tests, commit, push, open a PR, then watch CI and repair failures inside a bounded loop.

Use it when you want a software task carried from a description, a bug report, or a plan to an open PR and you are fine not inspecting each stage. It never pauses for approval, which is why it is the wrong tool for in-the-loop work. If you want to approve the plan, the diff, or the review findings yourself, run those skills one at a time. The one place it can ask is product shaping: when a request has more than one plausible product reading and a human is present, it runs `ce-brainstorm` first, because that dialogue is how the right thing gets built.

It works best after `/ce-brainstorm`, because the pipeline can then plan against real requirements instead of a one-line prompt. A software brainstorm's wrap-up offers "Ship it autonomously with `lfg`" when a unified plan artifact exists and nothing is still blocked on `Resolve Before Planning`.

---

## TL;DR

| Question | Answer |
|----------|--------|
| What does it do? | Routes the request to a work source (plan, `ce-debug` fix, or brainstorm then plan), implements, simplifies, reviews, applies eligible fixes, captures learnings, runs browser tests, commits, pushes, opens a PR, and watches CI |
| When to use it | A software task or bug you want shipped hands-off: a plan from `/ce-brainstorm` or `/ce-plan`, a clear feature, or a reproducible defect |
| What it produces | Code changes, commits, usually a PR. Unresolved review or CI leftovers become durable notes. No remote: local commits only. |
| What's next | Review the PR. Run `/ce-babysit-pr` to watch it through review toward merge. |
| What it does not do | Merge the PR, implement without a verified work source, execute a plan file it found on disk, or continue into the next area unless you accept a closeout handoff offer |

---

## Example invocations

The usual path is a brainstorm followed by an empty `/lfg`. A plan path enriches that artifact, then ships. Stage assignments change who authors planning or implementation; the rest of the pipeline stays on `lfg`.

```text
# Most common: settle requirements, then ship from that context
/ce-brainstorm design account-level notification controls for enterprise teams
/lfg

# Same handoff, but author the plan on a named model (implementation stays native)
/lfg plan with fable

# Clear, already-bounded software task. Weaker product context than a brainstorm.
/lfg add a CSV export button to the account reports page

# A bug: goes to ce-debug, not to planning. The ticket is linked from the PR.
/lfg fix this bug ESP-1234

# A plan ce-plan just wrote this session: goes straight to ce-work
/ce-plan add rate limits to the export job
/lfg

# Not a code change: runs the skill that owns the result and ends there, no branch
/lfg create a prototype exploring 3 concepts for the sign up page
/lfg explain to me the architecture of the export pipeline

# Enrich a requirements-only plan in place, then ship it
/lfg docs/plans/feedback-sweep-plan.md

# Preference: try Codex for implementation, fall back to native if that route is down
/lfg add account-level notification mute settings, use Codex for implementation

# Requirement: only Composer may implement. If that route is unavailable, lfg stops.
/lfg implement the settled plan, but only use Composer for implementation

# Both stages, each to its own model or harness
/lfg add mute settings, plan with fable and use Codex for implementation
```

An unscoped "use fable" or "with Codex" binds to implementation only, and `lfg` says so in its opening line. Assigning a harness to planning ("plan with Codex") is not supported and blocks.

---

## The Problem

The normal CE workflow is staged on purpose: plan, work, simplify, review, ship. That is useful when you want to inspect each step. It is too much handoff when the task is well bounded and you want the agent to carry the whole thing.

Without an explicit pipeline, autonomous runs skip planning, treat review as optional, forget to persist leftover findings, or stop at "PR opened" while CI is still red.

## The Solution

`lfg` states its goal and the conditions that gate it, then runs the usual sequence:

1. **Route the request.** A request whose result is not a code change goes to the skill that owns that result (`ce-explain`, `ce-prototype`, `ce-pov`, `ce-ideate`, and the rest of the catalog), and the run ends with that skill's result: no branch, no PR. For a change to the code, get a verified work source. Only two things qualify: an implementation-ready plan, or a `fixed` return from `ce-debug`. The route depends on the request. A plan path or brainstorm artifact goes to `/ce-plan` to enrich; a plan `ce-plan` wrote earlier in this session goes straight to `ce-work`. A concrete report of failing or wrong behavior (an issue reference, a stack trace, a failing test) goes to `/ce-debug` in return-to-caller mode, which fixes on a feature branch and commits without pushing. A judgment the user did not settle ("switch the queue to X") goes to `/ce-pov` first; only a verdict that supports the change continues, with it carried into the plan as evidence. A request whose product shape has more than one plausible reading goes to `/ce-brainstorm` when a human is present, and to `/ce-plan` in pipeline mode when not. Everything else goes to `/ce-plan`, with a short settled-decisions brief from the conversation so decided things are not re-asked. `lfg` never searches `docs/plans/` for a candidate: the plan is one the session identifies.
2. `/ce-work` runs in return-to-caller mode on the plan route so `lfg` keeps the shipping steps. Behavior-changing work must return verification evidence. Missing evidence is retried once, then the run stops rather than shipping blind. On the defect route `ce-debug`'s fix is the implementation and its return is gated the same way.
3. `/ce-simplify-code` runs on the branch diff before review, unless the change is docs-only or roughly under 10 lines.
4. `/ce-code-review` (`mode:agent`) reports findings. `lfg` applies eligible mechanical fixes and commits them. Review itself does not edit the tree. On the defect route review runs without a plan and reads the root cause as its intent.
5. Leftover actionable findings, plus any flagged settlement conflicts, become a `## Unapplied review findings` checklist in the PR body for the reviewer to decide on: fix in-branch, dismiss, or file a ticket. `lfg` files tickets itself only when no PR will exist.
6. `/ce-compound mode:non-interactive` runs when the work produced a durable, non-obvious learning, so the learning is in the PR at open. `Documentation skipped` is a normal outcome.
7. `/ce-test-browser` runs in pipeline mode.
8. `/ce-commit-push-pr mode:pipeline branding:on` commits remaining changes, pushes, opens a PR when a remote exists, and marks CE provenance. On the defect route the PR body carries the root cause and links the ticket. If the project's instructions name their own shipping process (say, a `/create-pr` skill), that process runs instead, so CE branding may not appear.
9. `/ce-babysit-pr mode:pipeline` watches the open PR: CI repairs via `/ce-debug`, incoming review comments via `/ce-resolve-pr-feedback`, up to three fix rounds by default. Pipeline babysit stops at "CI decided," not "merged."
10. Print `DONE`. If the plan named a larger body of separately planned work and an area is still unplanned, `lfg` may offer an opt-in `/ce-handoff` for a fresh session. It does not continue that area itself.

An invalidating settlement conflict from planning or review stops the pipeline before shipping. Non-halting flagged conflicts become residuals that reach the PR's settled-decisions line.

No git remote: commit locally and skip push, PR creation, and CI watch. That is a terminal local-only path, not an error to retry.

`lfg` never launches `/goal` itself. If goal-mode is the right engine, `ce-work` chooses it and must still return control.

---

## What Makes It Novel

### One work-source invariant, four routes, one set of shipping steps

Nothing is implemented without a work source verified this run, and only a plan or a `fixed` debug return is one. Which route produces it depends on what the request is, and `lfg` says which route it took before invoking the child skill. Implementation has to return evidence for behavior changes. Review is report-only by design. `lfg` applies the eligible fixes, persists what it will not apply, captures learnings, then owns the one push, PR, and CI-watch sequence. Stages do not get to skip ahead to coding, and a plan file that nothing in the session names is never executed.

### You can route two stages, not the whole run

Planning can be authored on a named model (`plan with fable`) via `ce-plan`'s model elevation. Implementation can be sent to a harness (`use Codex for implementation` as a preference, `only use Composer for implementation` as a requirement). `cursor` means the Cursor harness with its default model; `composer` means a Composer-family model through Cursor. Unscoped assignments bind to implementation only. In an interactive run that is genuinely ambiguous, `lfg` asks one question, then runs hands-off. A headless run applies the implementation default and discloses it. With no stage instruction, `ce-plan` uses its `plan_model` config and `ce-work` follows session and project instructions, then checkout-local `work_engine_mode` and `work_engine_preferences`. See [Implementation routing](./configuration.md#implementation-routing).

Both a preference and a requirement fall back to the current harness/session model with one disclosure when the external route cannot run. A requirement keeps the requested external identity fixed while viable. It never authorizes another external recipient, and `lfg` does not ask whether to weaken the route. A plain mention of a model in feature text, a quote, a comparison, or a filename does not activate routing. See [`ce-work`](./ce-work.md#choose-the-implementation-author) for fallback, timeouts, and detached-worktree behavior.

On string-only hosts the implementation seam is `mode:return-to-caller implementation_engine:<compact-json> <plan-path>`. The `plan_model:<alias>` carrier rides beside, never inside, `ce-plan`'s request. Neither carrier becomes plan content, a settled product decision, or review input.

### Residuals and CI leftovers outlive the session

Unapplied review findings sit in the PR body as a checklist, since `lfg` does not merge by default and the reviewer makes the call on each. With no PR they are filed as tickets. Unfixable CI is reported on the PR. `needs-human` leftovers (a product or design call) are deferred, not guessed. The run can reach `DONE` with those records in place.

### Next work is an offer, not a second pipeline

If the completed plan explicitly describes separately planned future areas, `lfg` picks one from current evidence and offers a handoff. Accepting creates a `ce-handoff` for a fresh session to brainstorm that area into a separate requirements-only plan. It does not edit the plan that just shipped.

---

## When to Reach For It

Use `lfg` when:

- You have a software task that can go through plan, implementation, review, and PR without you in the loop
- The task is already shaped by `/ce-brainstorm`, or is clear enough for `/ce-plan`
- You want CI failures handled automatically inside a bounded loop
- You are fine with a branch being pushed and a PR being opened

Skip `lfg` when:

- The work is non-software
- You still need interactive product shaping → `/ce-brainstorm`
- You want to inspect and approve each stage → `/ce-plan`, `/ce-work`, `/ce-code-review`, `/ce-commit-push-pr`
- You only want a commit and PR for work that already exists → `/ce-commit-push-pr`
- You want to inspect the diagnosis before any fix → `/ce-debug`
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
Not by default. Pipeline babysit stops when CI is decided (or the fix budget is hit) and merge stays yours; the closeout line points at `/ce-babysit-pr` for an interactive watch toward merge. If you grant merging for the run, `lfg` passes that grant to the babysitter in the form it accepts; today that is `posture:stack-land` for a managed stack. A single-PR merge grant has no pipeline carrier yet, so on that path `lfg` says the merge is still yours.

**Will it stop and ask me to approve the plan or the diff?**
No. That is the point of the skill, and why it is the wrong tool for in-the-loop work. The one thing it can ask about is product shape: when a request has several plausible product readings and you are present, it runs `ce-brainstorm` and that dialogue asks its questions. Headless runs never ask; `ce-plan` records its assumptions in the plan instead.

**Can I hand it a bug?**
Yes. `/lfg fix this bug ESP-1234`, a stack trace, or a failing test path routes to `ce-debug`, which reproduces, root-causes, and fixes on a feature branch. Only a `fixed` return continues to review and shipping; a divergent fix (one that would reverse deliberate behavior) stops the run as `needs-human` with nothing pushed. A ticket that describes a feature takes the plan route instead.

**I already ran `/ce-plan`. Will `lfg` plan again?**
No. A plan `ce-plan` wrote in this session goes straight to `ce-work`, which verifies it by content. A requirements-only artifact from `ce-brainstorm`, or a path to an older plan, goes through `ce-plan` so it is enriched or checked for drift first.

**What if planning cannot produce an implementation-ready code plan?**
The pipeline stops. Non-software tasks, requirements-only leftovers, knowledge-work plans, and invalidating settlement conflicts all halt before implementation.

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
