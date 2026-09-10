---
name: lfg
description: "Run the full autonomous shipping pipeline end-to-end, hands-off with no check-ins. Use only when the user explicitly asks to build or ship something autonomously all the way to an open PR, or invokes lfg directly — it pushes and opens a PR without stopping. Not for in-the-loop work where the user reviews each step: use ce-plan, ce-work, ce-debug, or ce-commit-push-pr instead."
argument-hint: "[feature description; optionally assign planning and/or implementation to a model or harness]"
---

CRITICAL: You MUST execute every step below IN ORDER. Do NOT jump ahead to coding or implementation. The plan phase (step 1) MUST be completed and verified BEFORE any work begins.

LFG runs hands-off, from schedulers, loops, and nested orchestrators with no user to answer, so no step stops to ask. The one exception is the upfront routing question `references/stage-routing.md` defines.

Resolve every skill named below against the host's available-skills list and invoke that exact entry; some hosts namespace it (`compound-engineering:ce-plan`), and a short-form guess that is not in the list fails.

Read `references/task-visibility.md` before step 1: it defines the stage-level view this pipeline publishes through the platform's task-tracking capability, the per-step chat narration, and the completion rule: a step is done only after it ran, and the turn does not end before DONE or a GATE stop.

## Per-stage routing carriers

Before step 1, judge whether the conversation expresses semantic intent to assign a stage — planning or implementation — to a model or harness; a plain mention in feature content, quotes, comparisons, or a filename is not an assignment. When one exists, read `references/stage-routing.md` before step 1. It alone defines the routable stages, scope and strength resolution, the `implementation_engine` grammar, ordered fallback, the sanitization that keeps routing out of planning and review inputs, and the exact carrier strings (the prefix that passes the assignment to a child skill) for both handoffs. A carrier you improvise drops the user's instruction or contaminates the plan with routing.

1. **Read `references/plan-brief.md` first**, then invoke the `ce-plan` skill with the sanitized feature request — or the arguments you were invoked with, unchanged, when no routing directive was present — prefixed with the `plan_model:<alias>` carrier when a planning-stage directive resolved, and with the settled-decisions brief that file specifies. That file alone defines the artifact-root rule this step's GATE reads, the brief's required fields, demotion rule, topical scope bar, and skip-entirely case, and the readiness values the GATE applies.

   GATE: STOP. Stop the pipeline and tell the user why when `ce-plan` reports the task is non-software (LFG requires software tasks), returns any explicit `status: blocked` report (including `settled-decision-invalidated`), or when the plan it wrote fails the readiness check in `references/plan-brief.md`. Blocked status outranks an existing artifact and is never retried. Only absence of both a blocker and a plan file `ce-plan` reported writing this run invokes `ce-plan` again with those same arguments, reusing the composed brief verbatim; never proceed to step 2 without a written plan.

   **Record the plan file path** — it is passed to ce-work in step 2 and ce-code-review in step 4. LFG never launches `/goal` directly; `ce-work` owns any goal-mode or dynamic-workflow engine choice and returns control to LFG afterward.

2. **Read `references/work-return.md` first**, then invoke the `ce-work` skill with `mode:return-to-caller <plan-path-from-step-1>`, or with the carrier form from `references/stage-routing.md` when a routing carrier resolved. That file alone defines what each return status means, the fields a `status: complete` return must contain, the verification evidence it must carry, where `settled_decision_conflicts` go, and the one recovery invocation.

   GATE: STOP. Read the structured return before continuing. Only a valid `status: complete` may advance; every other status or malformed return stops the pipeline.

3. **Read `references/review-followup.md` now**, then invoke the `ce-simplify-code` skill on the branch diff — **skip** only the invocation, never the read, when the change is docs-only (only markdown/docs paths changed) or trivial (roughly under 10 changed lines). That file governs steps 3 through 6. It alone defines this step's scope and the structure it must keep, how to read the review back, which findings step 5 applies and how they are committed, and the residual record step 6 writes down.

4. Invoke the `ce-code-review` skill with `mode:agent plan:<plan-path-from-step-1>`.

   GATE: STOP. A `settled_conflict`-stamped finding whose evidence is invalidating — the settled decision cannot work: infeasible, wrong-thing, or destructive — stops the pipeline as blocked, with the finding reported, before the shipping precondition.

**Shipping precondition (steps 5–9).** Run `git remote` once before the shipping steps. No remote means shipping is local-only: make every commit the steps below call for, but **skip every push, PR create/edit, and CI-watch action**, including step 9 in full. That is terminal, not an error.

5. **Apply and persist review fixes** (REQUIRED after step 4, before residual handoff)

   Execute the apply step of `references/review-followup.md`. Do not proceed to the residual handoff, run browser tests, or output DONE while eligible review fixes remain only in the working tree uncommitted.

6. **Autonomous residual handoff** — run it whenever anything unresolved is left to record: an actionable `downstream-resolver` finding step 5 did not apply, a `settled_conflict` stamp from step 4, or a proceeded-and-flagged `settled_decision_conflicts` entry from step 2. Skip only when none of the three exists — `Actionable findings: none.` does not decide it alone.

   Do not prompt the user.

   **Durable record — the PR body.** Compose the `## Unapplied review findings` checklist per `references/review-followup.md`; step 8 renders it. Do not output DONE until the residuals are durable: in the PR body, else (no PR) in tickets or the DONE report. Never block DONE on tracker filing failures once the report states them.

7. Invoke the `ce-test-browser` skill with `mode:pipeline`.

8. Ship: the goal is the remaining work committed, pushed, and in an open PR whose URL you hold. **Read `references/shipping-tail.md` first** — it governs steps 8 through 10 — then invoke the `ce-commit-push-pr` skill with `mode:pipeline branding:on` unless that file routes this run elsewhere. That file alone defines when a project-defined process replaces that default and the blocked stop when the process falls short, what LFG passes into the skill, the `New concepts:` trailer and ticket back-fill, the no-remote substitution, and step 9's stack handoff.

9. **Watch the PR to CI-decided via `ce-babysit-pr`** (only when an open PR exists for the current branch)

   Detect the PR with `gh pr view --json number,url,state`; if none exists or `gh` is unavailable, skip to step 10. When step 8 already handed off a stack babysit, `references/shipping-tail.md` decides this step — never start a second bare pipeline babysit on the current-branch URL. Otherwise invoke **`ce-babysit-pr mode:pipeline <pr-url>`**, and follow that same file for the returned `{ status, fixes_applied, residuals }`. Do not reimplement CI-watching here.

10. Output `<promise>DONE</promise>` when complete, after the close-out in `references/shipping-tail.md`, which defines the two user-runnable handoff lines, how each host renders them, and when to offer the next piece of work.

Start with step 1 now. Remember: plan FIRST, then work. Never skip the plan.
