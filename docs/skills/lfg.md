# `lfg`

> Run the full hands-off engineering pipeline from planning through a green PR.

`lfg` is the **autonomous pipeline** skill. It chains the main Compound Engineering workflow into one long-running run: plan the work, implement it, simplify the result, review it, apply eligible review fixes, run browser tests, commit, push, open a PR, then watch CI and repair failures within a bounded loop.

Use it when you want the full agentic shipping path and are comfortable with the agent taking the work from a feature description to an open PR. It is best after `/ce-brainstorm`, because the pipeline can then plan against real requirements instead of a one-line prompt.

---

## TL;DR

| Question | Answer |
|----------|--------|
| What does it do? | Runs the full CE software pipeline from planning through PR and CI watch |
| When to use it | Software tasks that are ready for autonomous implementation |
| What it produces | Code changes, commits, usually a PR, and durable residual notes when something cannot be fully resolved |
| What's next | Review the PR, merge when ready, and run `/ce-compound` if there is reusable learning to capture |
| Distinguishing | Hard ordering gates, per-stage cross-model routing (planning and implementation), return-to-caller execution, review-fix persistence, browser test pass, bounded CI autofix loop |

---

## Example invocations

```text
# Most common: settle an ambitious feature's requirements, then ship from that context
/ce-brainstorm design account-level notification controls for enterprise teams
/lfg

# Same handoff, but author the plan on a specific model (implementation stays native)
/ce-brainstorm design account-level notification controls for enterprise teams
/lfg plan with fable

# Ship a clear, already-well-bounded software task directly
/lfg add a CSV export button to the account reports page

# Ship an existing feedback-sweep plan after customer items are reconciled
/lfg docs/plans/feedback-sweep-plan.md
```

The most common handoff is `/ce-brainstorm` -> `/lfg`: brainstorm settles the requirements and scenarios, then `lfg` turns that context into a plan and carries it through implementation, review, PR, and CI. Invoke `lfg` directly when the task is already equally well bounded. Use individual skills when you want to inspect or approve stages yourself.

---

## The Problem

The normal CE workflow is deliberately staged: plan, work, simplify, review, ship. That is useful when you want to inspect each step, but too much handoff when the task is well-bounded and you want the agent to carry the whole thing.

Without an explicit pipeline, autonomous runs tend to skip planning, treat review as optional, forget to persist residual findings, or stop at "PR opened" while CI is still red.

## The Solution

`lfg` makes the sequence explicit and gated:

- Step 1 composes a transient settled-decisions brief from the conversation — each decision with its class, rejected alternative, and reason, topically scoped to the feature — and passes it to `/ce-plan` so decisions the user already made are carried, not re-asked; the brief is skipped entirely when nothing is settled
- `/ce-plan` must produce an implementation-ready code plan before work starts
- `/ce-work` runs in return-to-caller mode so the pipeline regains control after implementation; a requested implementation target is carried only across this seam
- Behavior-changing implementation must return verification evidence from `/ce-work`; if evidence is missing, `lfg` retries `/ce-work` once for evidence completion and then stops blocked rather than shipping blind
- `/ce-simplify-code` runs before review unless the change is docs-only or trivial
- `/ce-code-review` reports findings, then `lfg` applies eligible fixes and commits them
- Residual review findings are made durable in the PR body or a fallback tracked file
- `/ce-test-browser` runs in pipeline mode
- `/ce-commit-push-pr mode:pipeline branding:on` ships remaining changes when a remote exists and explicitly marks the CE provenance
- CI is watched for up to three repair iterations on an open PR
- An invalidating settlement conflict surfaced by planning or review halts the pipeline before shipping rather than quietly overriding what was agreed; non-halting flagged conflicts become durable residuals that reach the PR body
- At closeout, an eligible multi-area plan can produce a justified recommendation for the next separately planned area; `lfg` owns that choice and offers an opt-in `/ce-handoff` rather than continuing automatically

The pipeline also has a local-only path: if the repository has no git remote, it commits locally and skips push, PR creation, and CI watch instead of retrying impossible network steps.

The next-work offer is gated: the completed plan must explicitly describe a larger body of separately planned work, and at least one supported future area must still be unplanned. If that gate passes, `lfg` selects and explains the best next area from current evidence. It invokes `/ce-handoff` only after you explicitly accept the offer; that handoff is for a fresh session to brainstorm one coherent area into a separate requirements-only plan, not to extend or edit the plan that just shipped. If no eligible area remains, `lfg` ends without an offer.

---

## When to Reach For It

Reach for `lfg` when:

- You have a software task that can be taken through plan, implementation, review, and PR
- You want hands-off progress while preserving CE's quality gates
- The task is already shaped by `/ce-brainstorm` or is clear enough for `/ce-plan` to turn into an implementation-ready plan
- You want CI failures handled automatically within a bounded loop

Skip `lfg` when:

- The work is non-software or answer-seeking
- You need interactive product shaping before implementation -> `/ce-brainstorm`
- You want to inspect and approve each stage manually -> run `/ce-plan`, `/ce-work`, `/ce-code-review`, and `/ce-commit-push-pr` yourself
- The repo has unusual shipping requirements that need hand-driven git or release work

---

## Use as Part of the Workflow

```text
/ce-brainstorm describe the feature
/lfg
```

Starting with `/ce-brainstorm` gives the pipeline better requirements. `lfg` then invokes `/ce-plan` itself and stops if the resulting plan is not an implementation-ready code plan.

You can also invoke it directly:

```text
/lfg add account-level notification mute settings
```

Direct invocation is useful for clear software tasks, but it gives the planner less product context.

## Route the Planning and Implementation Stages

You may ask `lfg` to have a specific model or harness author a pipeline stage while `lfg` keeps ownership of the rest of the run. Two stages are routable, each independently:

```text
# implementation only
/lfg add account-level notification mute settings, use Codex for implementation
/lfg implement the settled plan, but only use Composer for implementation

# planning only (authors the plan on the named model via ce-plan's elevation)
/lfg add account-level notification mute settings, plan with fable

# after /ce-brainstorm settled the requirements — no feature text needed
/lfg plan with fable

# both stages at once, each to its own model/harness
/lfg add account-level notification mute settings, plan with fable and use codex for implementation
```

`lfg` recognizes the intent from the whole instruction rather than matching one keyword, and resolves each directive **by scope**:

- **Scoped** — the instruction names the stage ("plan with fable", "codex for implementation"). It routes to that stage: a `plan_model:<alias>` carrier to `ce-plan` (model elevation), an `implementation_engine` object to `ce-work`. Both may resolve at once.
- **Unscoped** — a bare assignment with no stage named ("use fable", "with codex"). It binds to **implementation only** and is disclosed in `lfg`'s opening line; it never silently spreads to planning or every stage.
- **Unscoped but genuinely ambiguous, and you are present** — `lfg` asks exactly one upfront question before the pipeline starts, then runs hands-off. In a headless run (scheduler, loop, nested orchestrator) it never asks — it applies the implementation default and discloses it, because there is no one to answer.

The implementation carrier is a transient object containing exactly `mode`, `target`, `model`, and `source`, passed beside `mode:return-to-caller` only when `lfg` invokes `ce-work`. On string-only hosts that seam is `mode:return-to-caller implementation_engine:<compact-json> <plan-path>`; for example, `implementation_engine:{"mode":"prefer","target":"codex","model":null,"source":"lfg-current-turn"}`. The `plan_model:<alias>` carrier rides beside — never inside — `ce-plan`'s request. Neither carrier becomes plan content, a settled product decision, or review input. A plain mention of a model in feature text, quoted material, a comparison, or a filename does not activate routing.

That four-field carrier is deliberately scalar. If the current LFG instruction names an ordered fallback list, LFG keeps the whole list as stage-scoped current-task context and passes no truncated carrier; CE Work resolves and preflights that retained list in order. If a host cannot preserve the current-task context across its skill invocation, LFG blocks instead of silently losing the later candidates. Standing ordered config needs no carrier and remains the most portable way to establish a reusable matrix.

The first example is preference-strength. If the Codex route is unavailable before work starts, `ce-work` implements natively and returns the requested route, actual route/model, and fallback reason; `lfg` discloses the fallback and continues to its one shipping tail. The second is requirement-strength. Because `lfg` is headless, an unavailable required route blocks without asking or silently switching to native work.

Target `cursor` means the Cursor harness with its configured default model. Target `composer` means a Composer-family model requested through Cursor. A model pin is optional. Route substitution stays within the requested target/model family and is disclosed; a route is not used until its fixed-recipient, unattended write adapter is qualified and locally available. The cross-model engine has a launch floor of at least one real non-native route passing that qualification matrix; failing candidates remain unavailable rather than becoming guessed production commands.

When the prompt has no stage instruction, `lfg` passes no empty binding for that stage. For planning, `ce-plan` then resolves elevation from its `plan_model` config key (or no elevation). For implementation, `ce-work` considers applicable session/project instructions already in context before the gitignored per-checkout `work_engine_mode` and ordered `work_engine_preferences` list. Each config candidate names a `harness` and optional `model`; omission uses that harness's configured default. Config `prefer` is active in the automatic flow and falls back natively only after its ordered candidates are exhausted; config `require` blocks if none qualify. A current-task implementation instruction outranks those defaults.

See [Compound Engineering configuration](./configuration.md#implementation-routing) for the shared config shape and its relationship to harness-loaded instructions.

Long external runs remain observable through the `ce-work` return contract: run id, requested and actual identity, unit/job state, activity and elapsed time, checkpoint, verification/commit state, blockers, and recovery path. If `lfg` retries once to reconcile missing verification evidence, it uses the same binding and run id; it does not dispatch implementation or run the shipping tail twice. See [`ce-work`](./ce-work.md#choose-the-implementation-author) for egress disclosure, private run state, detached-worktree containment, transactional fold-in, timeouts, resume/reap/cleanup, fallback, and parallel-wave behavior.

---

## Reference

| Argument | Effect |
|----------|--------|
| _(empty)_ | Plans from current context, then runs the pipeline if the plan is eligible |
| `<feature description>` | Passes the description to `/ce-plan`, then runs the pipeline |
| `<feature description + stage assignment>` | Removes routing directives from the product request; routes a scoped planning directive to `ce-plan` (`plan_model`) and/or a scoped implementation directive to `ce-work` (`implementation_engine`); an unscoped assignment binds to implementation only |

Output: code changes, commits, and usually a PR. If there is no configured git remote, output is local commits only. If CI remains red after the bounded repair loop, unresolved failures are recorded durably before the run ends.

---

## See Also

- [`ce-brainstorm`](./ce-brainstorm.md) — strongest upstream source of requirements
- [`ce-plan`](./ce-plan.md) — first required pipeline step
- [`ce-work`](./ce-work.md) — implementation engine called in return-to-caller mode
- [`ce-simplify-code`](./ce-simplify-code.md) — pre-review simplification step
- [`ce-code-review`](./ce-code-review.md) — review gate
- [`ce-test-browser`](./ce-test-browser.md) — browser validation step
- [`ce-commit-push-pr`](./ce-commit-push-pr.md) — shipping handoff when a remote exists
