---
name: lfg
description: "Take a request all the way to done, hands-off, through the right Compound Engineering skills. A code change ends as an open pull request, pushed without stopping. Use only when the user explicitly asks for autonomous end-to-end work or invokes lfg directly. Use ce-plan, ce-work, ce-debug, or ce-commit-push-pr for work the user reviews step by step."
argument-hint: "[feature, bug, issue reference, or plan path; optionally assign planning and/or implementation to a model or harness]"
---

**Outcome.** The request reaches the end state its shape calls for, produced by the Compound Engineering skill whose job that is, with everything unresolved recorded where the user will see it. Most requests end with that skill's result and no branch. A change to the code is the one shape with more steps of its own: it ends in an open pull request whose URL you hold, with CI decided, after being implemented, simplified, reviewed with the eligible findings applied and the rest recorded, any durable learning captured, committed, and pushed. Merging stays with the user unless they granted it for this run.

**Work source.** On the routes that change the code, nothing is implemented without a work source verified this run, and only two things qualify: an implementation-ready plan, which `ce-work` implements; or a `fixed` return from `ce-debug`, where the fix is the implementation. The plan is one the session identifies, as `references/intake.md` defines. Never search the plans directory for a candidate or act on a file you discovered. Never plan from scratch over an existing plan.

**Route by what the request is.** Match the request to the skill whose job it is; the host's skill list is the catalog. Read `references/intake.md` before choosing; it alone defines the routes, their precedence, what each child skill is passed, and how each return is read. In short:

- A plan path, or a plan `ce-plan` wrote this session, takes the plan route.
- A concrete report of failing or wrong behavior goes to `ce-debug`; reproducing it is that skill's job, not intake's.
- A change that hangs on a judgment the user did not settle goes to `ce-pov` first, and only a verdict that supports the change continues; a judgment with nothing to build ends at the verdict.
- Product shape with more than one plausible reading goes to `ce-brainstorm` when a human is present, and to `ce-plan` in pipeline mode when not.
- A request whose result is not a code change goes to the skill that owns that result (`ce-explain`, `ce-prototype`, `ce-pov`, `ce-ideate`, and so on); that invocation is the whole run: return its result and end.
- Any other change to the code goes to `ce-plan`.

When unsure, take the route that asks more of the evidence.

**Interaction.** Ask the user only through `ce-brainstorm`, and only when a human is present. Everything else proceeds without waiting: reversible work is done and shown for the user to correct afterward, and only an irreversible action outside what they granted (a merge they did not grant, a force-push, deleting data) stops instead. `lfg` runs from schedulers, loops, and nested orchestrators. The one other question is the routing disambiguation `references/stage-routing.md` defines: when the conversation assigns planning or implementation to a model or harness, read that file before routing; it alone carries the carrier strings and the sanitization.

**Stop, and say why, when** any of these holds:

- The work source cannot be produced: planning returned blocked, the diagnosis found no safe fix, the fix would be divergent, `ce-pov` did not support the change, or a stage assignment cannot be passed on.
- A child return is anything but complete and evidenced.
- A settled decision is invalidated.
- A project-defined shipping process falls short.

A stop leaves nothing pushed that was not already pushed.

Resolve every skill named here against the host's available-skills list and invoke that exact entry; some hosts namespace it (`compound-engineering:ce-plan`). Read `references/task-visibility.md` before starting: it defines the stage view published through the platform's task-tracking capability, the chat narration, and the completion rule that a step is done only after it ran and the turn does not end before DONE or a stop.

## The run (routes that change the code)

1. **Produce the work source** per `references/intake.md`. On the plan route, read `references/plan-brief.md` first; it alone defines the settled-decisions brief and the artifact-root rule. Any explicit `status: blocked` return, including `settled-decision-invalidated`, stops the run. Blocked status outranks an existing artifact and is never retried. Only absence of both a blocker and a plan file `ce-plan` reported writing this run invokes `ce-plan` a second time with the same arguments, reusing the composed brief verbatim; the plan must then pass the readiness check in `references/plan-brief.md`. On the plan route the `plan_model:<alias>` carrier rides beside the request when a planning-stage directive resolved. Record the work source for every later step. LFG never launches `/goal` directly; `ce-work` owns any goal-mode choice and returns control.

2. **Read `references/work-return.md` first**, then invoke the `ce-work` skill with `mode:return-to-caller <plan-path-from-step-1>`. On the defect route this step does not run: `ce-debug` already implemented and committed, and `references/debug-return.md` was its gate. Only a valid `status: complete` may advance; every other status or malformed return stops the pipeline.

3. **Read `references/review-followup.md` now**; it governs steps 3 through 7. Invoke the `ce-simplify-code` skill on the branch diff; skip only the invocation for a docs-only or roughly sub-10-line change.

4. Invoke the `ce-code-review` skill with `mode:agent plan:<plan-path-from-step-1>`; on the defect route omit `plan:`. A `settled_conflict` finding whose evidence shows the settled decision cannot work (infeasible, wrong-thing, or destructive) stops the pipeline as blocked, with the finding reported, before the shipping precondition.

**Shipping precondition (every push from step 5 on).** Run `git remote` once. No remote means local-only: make every commit the steps call for, but skip every push, PR create/edit, and CI-watch action, including step 10 in full. That is terminal, not an error.

5. **Apply and persist review fixes** as that file defines. Do not proceed to the residual handoff, run browser tests, or output DONE while eligible review fixes remain only in the working tree uncommitted.

6. **Autonomous residual handoff**: whenever an unapplied actionable finding, a `settled_conflict` stamp from step 4, or a proceeded-and-flagged `settled_decision_conflicts` entry from step 2 exists, record it durably per that file: in the PR body, or in tickets or the DONE report when no PR will exist. Skip only when none of the three exists. Do not output DONE until the residuals are durable. Never block DONE on tracker filing failures once the report states them. Do not prompt the user.

7. Invoke the `ce-compound` skill with `mode:non-interactive` when the run produced durable reasoning the code, tests, and plan do not carry; that file states the full condition. `Documentation skipped` is success; running here puts the learning in the PR at open.

8. Invoke the `ce-test-browser` skill with `mode:pipeline`.

9. **Read `references/shipping.md` first**; it governs steps 9 through 11. Then invoke the `ce-commit-push-pr` skill with `mode:pipeline branding:on`.

10. Watch the PR to CI-decided with `ce-babysit-pr mode:pipeline <pr-url>` when an open PR exists, as `references/shipping.md` decides. Do not reimplement CI-watching here.

11. Output `<promise>DONE</promise>` after the close-out in `references/shipping.md`.
