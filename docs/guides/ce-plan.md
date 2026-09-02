# `ce-plan`

> Establish the guardrails an implementation needs (decisions, units, files, tests, scope, risks) without prescribing the code or the step-by-step choreography. The plan captures WHAT; the implementing agent figures out HOW.

`ce-plan` produces decision documents, not implementation scripts. A plan records what was decided and why, what scope is in or out, what atomic units of work exist, which files each unit touches, what test scenarios must pass, and what risks need mitigation. It does not pre-write code, exact API signatures, or shell sequences. Those belong to whoever implements (`ce-work`, another agent, or a human) once code is in front of them.

The reason is practical. Plans that pre-write implementation are usually wrong by the time anyone implements them. Signatures do not compile, choreography goes stale, and micro-steps bury the real decisions. Plans that capture guardrails stay usable for weeks and leave judgment to the implementer.

The same engine handles non-software work: study plans, event planning, research workflows, even annual hot-water-tank maintenance. Same unit IDs, same right-sized template.

`ce-plan` is the third step in the compound-engineering ideation chain:

```text
/ce-ideate         /ce-brainstorm      /ce-plan             /ce-work
"What's worth      "What does this     "What's needed       "Build it."
 exploring?"        need to be?"        to accomplish
                                        this?"
```

A prior brainstorm helps but is never required. You can invoke `ce-plan` directly with a requirements-only unified plan, a legacy requirements doc, a GitHub issue, a PRD, a rough description, or a non-software task.

---

## TL;DR

| Question | Answer |
|----------|--------|
| What does it do? | Researches context, captures decisions and scope, breaks work into atomic units with stable IDs, enumerates test scenarios per unit, then auto-strengthens weak sections via a confidence check |
| When to use it | Requirements are ready and execution guardrails are needed; solo planning when the task is already clear; non-software multi-step tasks; investigative questions that need a structured answer |
| What it produces | Software: a unified plan in `docs/plans/YYYY-MM-DD-HHMM-<type>-<name>-plan.md` (local wall-clock write time, atomically reserved with a numeric collision suffix when needed). Brainstorm-sourced plans move from `artifact_readiness: requirements-only` to `implementation-ready` in place. Non-software plan-seeking writes a domain plan (or publishes to Proof). Answer-seeking delivers the answer in chat with no plan file. |
| What's next | Software: start `ce-work` (recommended), run it as a `/goal` when the host supports that, decide on remaining review items or prototype a remaining feel-question, create a tracked issue, or open an HTML plan in the browser. Non-software: save, publish to Proof, or both. Answer-seeking: the answer is the end. |

---

## Example invocations

An empty invoke uses the current conversation if one is already underway (including a just-finished brainstorm) and otherwise asks what to plan. Passing a requirements-only plan path enriches that file in place. `output:html` changes the artifact format. `confirm:auto` skips only the pre-plan scope confirmation.

```text
# Use this conversation if it already has a task; otherwise ask what to plan
/ce-plan

# Enrich a requirements-only brainstorm artifact into an implementation-ready plan
/ce-plan docs/plans/notification-mute.md

# Plan directly from an issue or PRD
/ce-plan https://github.com/acme/widgets/issues/1234
/ce-plan docs/product/account-notifications-prd.md

# Bootstrap planning from a clear rough idea
/ce-plan add a background email digest at 8am UTC

# Revisit and deepen an existing implementation-ready plan (interactive accept/reject)
/ce-plan deepen docs/plans/auth-rewrite.md

# Plan a non-software multi-step project (save and/or publish to Proof)
/ce-plan organize a two-day customer advisory workshop

# Answer-seeking: state a plan-of-attack in chat, then deliver the answer (no plan file)
/ce-plan how often does this customer star our repos, and is that a real signal?

# Hold at an approach-plan before committing to the deliverable
/ce-plan plan for a plan: synthesize the three research PDFs into a decision memo

# Write the plan as a self-contained HTML page
/ce-plan turn the notification mute requirements into an implementation-ready plan output:html

# Skip the pre-plan scoping-confirmation pause for this run only
/ce-plan add a background email digest at 8am UTC confirm:auto

# Keep the session on your usual model; author the plan on a named one
/ce-plan turn the notification mute requirements into an implementation-ready plan, use fable
```

Start with `ce-brainstorm` when the product shape is still unsettled. Direct planning works best when the intended outcome is already clear.

---

## The Problem

Plans fail in predictable ways:

- Renumbering chaos: refactor the unit list and every reference in the issue, PR, and conversation is now wrong
- Vague test "scenarios": "test the new behavior" tells the implementer nothing
- Forgotten origin context: the brainstorm decided this was for a specific actor, but the plan never mentions them
- Half-resolved questions: "TBD: figure out caching strategy" sitting in the plan months later
- Implementation choreography: pre-written method signatures and shell sequences, wrong by the time implementation starts
- No depth signal: the author cannot tell whether the plan is grounded enough to execute

`ce-plan` addresses each of these with structure: stable U-IDs, per-unit test scenarios with named inputs and outcomes, origin tracing back to brainstorm identifiers, a hard separation between planning-time and implementation-time questions, and an automatic confidence check that strengthens the weakest sections before handoff.

---

## What Makes It Novel

### Three output contracts, decided before research

Not every planning request deserves a plan file. At intake, `ce-plan` grounds itself with a few bounded reads of the files the request names and picks one of three results:

- **Direct.** The work can be stated, done, and verified in one pass with no decision you would weigh. The skill says what changes in a few sentences and hands off to `ce-work` or to you.
- **Chat brief.** Bounded work with at most one decision and no risk surface. You get a summary, implementation units with files and test expectations, and a one-line offer to save it or hand it to `ce-work`, all in chat.
- **Durable.** Everything else: the full unified plan file with confidence check, document review, and handoff menu.

When the tier is uncertain, the heavier one wins. Pipeline and headless runs, goal-driven runs, requests that ask for a plan file by name, and risk surfaces (authentication, payments, migrations, external contracts) are always Durable. A saved chat brief is plain markdown without the unified-plan contract; re-invoke `ce-plan` on it when you want the full treatment.

### U-IDs that never renumber

Each unit heading is `### U1. Name`, `### U2. Name`, and so on. Existing IDs are never renumbered after reordering, splitting, or deleting. Splits keep the original U-ID on the original concept; new units take the next unused number; deletions leave gaps.

This matters because `ce-work` references units by U-ID across plan edits. Renumbering during a deepening pass would silently break every blocker reference, every PR that cites a unit, and every downstream conversation.

### Origin tracing and per-unit tests

When the plan is sourced from a `ce-brainstorm` requirements-only unified plan, identifiers flow through in the same file. Requirements (R-IDs) stay in the Product Contract. Actors (A-IDs) carry forward when they affect behavior or permissions. Key Flows (F-IDs) cite into the units that realize them. Acceptance Examples (AE-IDs) cite into test scenarios (`Covers AE3. <scenario>`). Every Product Contract section is checked against the Planning Contract before finalization.

Every feature-bearing unit enumerates test scenarios from each applicable category: happy path, edge cases (boundaries, empty/nil, concurrency), error/failure paths, and integration. Each scenario names the input, action, and expected outcome.

### Confidence check, then research that matches intent

After writing a Durable plan, `ce-plan` scores sections, picks the weakest ones, dispatches targeted sub-agents (correctness for units, data integrity for migrations, architecture for key technical decisions), and folds findings back into the plan. During generation this runs in auto mode. When you ask to deepen an existing plan, findings are presented one by one for accept/reject.

Research earlier in the run is decided by intent, not a single on/off switch. Local research (repo patterns, `docs/solutions/` learnings) always runs in parallel, plus spec-flow analysis for Standard and Deep plans. An explicit request ("research competitors", "which library") always triggers external research. Implicit signals can too, when local patterns are thin or the recommendations hinge on an unsettled external option set. Implementation-guidance questions route to framework docs; landscape questions route to a web scan; mixed requests run the scan first, then docs on the shortlist.

### Universal planning and approach altitude

Non-software work skips the software confidence check but keeps U-IDs, dependency ordering, scope boundaries, verification scenarios, and the right-sized template. Two dispositions:

- Plan-seeking (a trip, a study curriculum, an event): the saved plan is the deliverable. The wrap-up offers save to disk, publish to Proof, or both.
- Answer-seeking ("how often does X happen, is it a big deal?"): the answer is the deliverable. The skill states a brief plan-of-attack in chat, executes it (research and synthesis, never code), and writes no plan file. Only a genuine single-fact lookup skips the plan-of-attack and gets answered outright.

For a hard problem you can ask one level up: produce a grounded approach-plan (a plan for how the deliverable will be made) and hold at a checkpoint. Enter it explicitly (`plan for a plan`, `don't write it yet, plan how you'd approach it`). Rarely, the skill offers this itself when the method is genuinely unsettled and getting it wrong is costly. Code still flows to `ce-work`; a non-code deliverable is marked `execution: knowledge-work` and runs through `ce-work`'s lightweight carve-out. `ce-plan` itself never executes.

### Session-settled decisions are carried, not re-asked

When a decision was examined and chosen in the invoking conversation, or arrives distilled in a caller brief, `ce-plan` records it on its Key Technical Decision as `session-settled: user-directed` or `user-approved`, names what it was chosen over, and never re-asks it. Research may contradict a settled decision only on evidence: nothing found proceeds silently, suboptimal-but-workable proceeds with a conflict call-out, and invalidating evidence (infeasible, wrong-thing, destructive) stops the run. In pipeline mode that returns a `settled-decision-invalidated` blocked report. An unexamined assertion is not settled; it earns exactly one plan-time challenge.

---

## Quick Example

You invoke `ce-plan` with a requirements-only unified plan from `ce-brainstorm`. The skill detects `artifact_readiness: requirements-only`, uses the Product Contract as primary input, and verifies no resolve-before-planning blockers remain.

It dispatches research in parallel (repo analyst, learnings researcher). Local patterns are strong and no external comparison was requested, so it skips external research. A spec-flow analyzer runs to surface edge cases. The scoping synthesis surfaces a tier-shaped summary plus any call-outs, the plan-time forks where another reasonable agent might choose differently. You confirm or redirect. Auto-proceed only fires for Lightweight plans with no forks worth flagging; Standard and Deep always get the explicit checkpoint.

The plan is written. The confidence check finds `Risks & Dependencies` thin on a mute-leak risk and one unit's tests missing permission edge cases, dispatches reviewers, and folds the findings back. The plan gets stamped with a `deepened:` date.

Document review then runs non-interactively. Safe auto-fixes apply silently; remaining findings surface as one line above the menu (`Doc review applied 2 fixes. 3 decisions, 1 FYI remain.`). The menu offers: start `ce-work` (recommended), run it as a `/goal` when the host supports that, decide on remaining review items or prototype a remaining feel-question, create a tracked issue, or open the file if it is HTML. There is no Proof option on the software menu and no pause option. The file is already saved.

---

## When to Reach For It

Reach for `ce-plan` when:

- You have a requirements-only unified plan from `ce-brainstorm`
- You have a GitHub issue, PRD, or feature description that is already clear enough
- The work is multi-step and benefits from sequencing, dependency ordering, and scope boundaries
- You want test or verification scenarios enumerated before execution
- You are picking up a stale plan and want it deepened (`deepen the plan` or `deepening pass`)
- The task is non-software but multi-step (study plan, event, trip, maintenance, research workflow)
- The question is investigative and you want a structured answer rather than a plan file

Skip `ce-plan` when:

- The change is already specified down to the files it touches and touches no risk surface (just do it, or `ce-work`); if it reaches `ce-plan` anyway, the Direct contract answers in a few sentences
- The product or outcome is not yet decided → `ce-brainstorm` first
- The bug has a known root cause and an obvious fix → `ce-debug` or just fix it

---

## Make It Automatic

If you want planning to run on its own before implementation, add a standing instruction to your agent's instruction file (the repo's `AGENTS.md`/`CLAUDE.md`, or your global one). The activation condition is what keeps small changes cheap:

> Before implementing work that spans several files or carries a design decision, invoke the `ce-plan` skill. Skip it for a change already specified down to the files it touches that touches no risk surface (authentication, payments, migrations, external contracts); do that directly or with the `ce-work` skill.

Two phrases carry the weight. "Invoke the `ce-plan` skill", because the slash-command form is not agent-callable on every harness. And the skip clause, because `ce-plan` decides its output contract only after it fires; an instruction that invokes it on every change still pays the skill load for a typo.

---

## Use as Part of the Chained Workflow

```text
/ce-ideate          (optional)
   |
   v
/ce-brainstorm      (define one direction)
   |  requirements-only unified plan: R/A/F/AE-IDs in software mode
   v
/ce-plan
   |  guardrails: U-IDs traced to R/A/F/AE-IDs
   |  test scenarios with AE-link convention (Covers AE<N>)
   |  scope boundaries preserved (including "Outside this product's identity")
   |  confidence-checked and auto-deepened
   v
/ce-work            (execute against the guardrails)
   |  reads U-IDs as the unit of execution
   |  figures out the actual HOW with code in front of it
   |  derives progress from git, not the plan body
   v
/ce-code-review     (optional)
   |
   v
/ce-compound        (capture the learning)
```

The handoff to `ce-work` is concrete: it reads U-IDs, file paths, scope boundaries, and test scenarios, then determines the implementation. The plan says what must be true when a unit is done; the implementer makes it true.

---

## Use Standalone

Plenty of work never goes through a brainstorm. Direct invocations that work well:

**Software:**

- From a GitHub issue: `/ce-plan https://github.com/.../issues/1234` (or paste the issue body)
- From a PRD: `/ce-plan` with the PRD path
- From a rough idea: `/ce-plan "add background email digest at 8am UTC"` runs the bootstrap; the synthesis lets you correct scope before research dispatches
- Re-deepening an existing plan: `/ce-plan deepen the auth-rewrite plan` (interactive accept/reject)
- Cross-repo planning: `/ce-plan "fix the busyblock bug in cli-printing-press"` from a different repo. The target is announced and the plan lands in the target's `docs/plans/`

**Non-software (universal-planning mode):**

- Maintenance tasks, with verification at each unit
- Study plans, with prerequisites and per-unit knowledge checks
- Trip planning: bookings, packing, daily itinerary, contingency boundaries
- Research workflows: gathering, synthesis, drafting, with explicit deliverables
- Event planning: venue, vendors, agenda, day-of run-of-show
- Answer-seeking questions, delivered in chat with no plan file

---

## Reference

| Argument | Effect |
|----------|--------|
| _(empty)_ | Uses the current conversation if a task is already present; otherwise asks what to plan |
| `<feature description>` | Solo planning; runs the bootstrap |
| `<requirements-only plan path>` | Enrich the same unified plan in place |
| `<legacy requirements doc path>` | Origin-sourced planning into a new unified plan |
| `<plan path>` | Resume offer (or deepen, if intent matches) |
| `deepen the plan` / `deepening pass` | Re-deepen fast path (interactive mode) |
| `plan for a plan` / `don't write it yet` | Approach-altitude: produce an approach-plan and hold at a checkpoint |
| `<investigative question>` | Answer-seeking: plan-of-attack in chat, then the answer; no plan file |
| `<bug description>` | Routes to a `ce-debug` suggestion menu (skipped in pipeline mode) |
| `<task in another repo>` | Cross-repo announcement; plan lands in the target |
| `output:html` | Write the plan as a single self-contained HTML file instead of markdown. Exclusive: the plan is `.md` or `.html`, never both. Default is markdown. Set `plan_output: html` in CE config (`config.local.yaml` then `config.yaml`) to make HTML the default. Pipeline mode (LFG, `disable-model-invocation`) always forces markdown. See the [configuration reference](./configuration.md). |
| `confirm:auto` | Skip the pre-plan scoping-confirmation pause for this run. The skill writes the scope summary for itself, records inferred scope under `Assumptions`, announces it is proceeding, and keeps going. Genuine blockers and the post-plan menu still appear. Use `confirm:ask` to force the gate on for one run. Set `plan_skip_scoping_confirm: true` in CE config to make skipping the default. |
| `use fable` / `have opus plan this` | Elevate only the interpret-findings-then-author step to that model. Also settable as `plan_model: <model>` in CE config. A prompt request overrides the config key. |

---

## FAQ

**Doesn't a plan tell you HOW to build something?**
Not in `ce-plan`'s framing. The plan tells you what must be honored: decisions, scope, units, files, tests, risks. The implementing agent figures out HOW with code in front of them. That same frame is what lets one engine plan a software refactor, a tank-maintenance job, and a 6-week study plan.

**Why U-IDs instead of just numbered units?**
Numbering breaks when units are reordered, split, or deleted. U-IDs stay put, so `ce-work`'s blocker references survive plan edits.

**Why does the confidence check run automatically?**
The expensive moment to discover a thin section is during execution, not during planning. Auto-deepening runs while research context is still warm.

**What if I want to keep the existing plan and just review it?**
Use the deepen fast path: `/ce-plan deepen <plan>`. It runs interactively, presenting findings one by one for accept/reject.

**What about implementation code in the plan?**
Disallowed by default. Pseudo-code and DSL grammars are permitted in High-Level Technical Design when they communicate the shape of the solution as directional guidance. Exact method signatures, imports, framework-specific syntax, and step-by-step shell sequences do not belong in plans.

**Can I publish a software plan to Proof from the post-plan menu?**
No. Proof is on the non-software wrap-up menu (save, publish, or both). Software next steps are `ce-work`, `/goal` when supported, review or prototype, create an issue, or open an HTML file. Publish a markdown plan later with `/ce-proof` if you want a shareable link.

---

## Model elevation

When you want a specific model for the heavy reasoning step, `ce-plan` can author the plan on that model instead of your session model. Only the interpret-findings-then-author step is dispatched, with read access so it can verify its brief. Dialogue and research stay on your session model. Name a model in the prompt (`use fable`, `have opus plan this`) or set `plan_model: <model>` in CE config; a prompt request overrides the config key.

This works on any harness. The host serves the chosen model natively where it can, otherwise it invokes the Claude CLI (which must be installed and authenticated), otherwise it runs the step on your session model and says which precondition was unmet.

## See Also

- [`ce-brainstorm`](./ce-brainstorm.md): produce the requirements-only unified plan that `ce-plan` enriches
- [`ce-ideate`](./ce-ideate.md): upstream "what to even work on" ideation
- [`ce-work`](./ce-work.md): execute the plan U-ID by U-ID
- [`ce-doc-review`](./ce-doc-review.md): persona-based review of markdown or HTML plans
- [`ce-prototype`](./ce-prototype.md): offered from the post-plan menu when a remaining feel-question is expensive to unravel
- [`ce-debug`](./ce-debug.md): bug-shaped prompts route here
- [`ce-strategy`](./ce-strategy.md): anchor plans to documented product strategy
- [`ce-proof`](./ce-proof.md): publish a non-software plan, or any markdown plan you ask to share
