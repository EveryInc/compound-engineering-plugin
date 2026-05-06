# `ce-plan`

> Establish the guardrails an implementation needs — decisions, units, files, tests, scope, risks — without prescribing the actual code or step-by-step choreography. Plans capture the **WHAT**; the implementing agent figures out the **HOW**.

`ce-plan` produces plans that are **decision documents with execution guardrails**, not implementation choreography. The plan captures what decisions have been made, what scope is in or out, what atomic units of work exist, what files each unit touches, what test scenarios must pass, and what risks need mitigation. It does **not** pre-write code, exact API signatures, or step-by-step shell command sequences — those are for the implementing agent (`ce-work`, another AI agent, or a human) to determine when code is in front of them.

This separation matters. Plans that pre-write implementation tend to be wrong by the time you implement them: signatures don't compile, choreography is stale, micro-steps obscure the real decisions. Plans that capture guardrails stay portable for weeks or months and respect the judgment the implementer brings at execution time.

It works for any multi-step task where structure helps — software features, refactors, bug fixes, study plans, research workflows, event planning, even things like annual hot-water-tank maintenance. The same engine; the same U-ID stability; the same right-sized template.

This is the third step in the compound-engineering ideation chain:

```text
/ce-ideate         /ce-brainstorm      /ce-plan             /ce-work
"What's worth      "What does this     "What's needed       "Build it."
 exploring?"        need to be?"        to accomplish
                                        this?"
```

But it stands alone just as well — many teams reach for `ce-plan` directly with a requirements doc, GitHub issue, PRD, rough description, or non-software multi-step task.

---

## TL;DR

| Question | Answer |
|----------|--------|
| What does it do? | Researches context, captures decisions and scope, breaks work into atomic units with stable IDs, enumerates test scenarios per unit, and auto-strengthens weak sections via a confidence check |
| When to use it | Requirements ready and execution guardrails needed; solo planning when the task is clear; non-software multi-step tasks (study plans, research, maintenance, events, trips) |
| What it produces | Plan in `docs/plans/YYYY-MM-DD-NNN-<type>-<name>-plan.md` |
| What's next | `/ce-work`, create a tracked issue, open in Proof for review, or pause |
| Distinguishing | Guardrails over choreography (WHAT, not HOW); U-IDs (stable); origin tracing (R/A/F/AE → U); test scenarios per unit; automatic deepening; multi-agent research |

---

## The Problem

Plans written by humans (or AI without structure) tend to fail in predictable ways:

- **Renumbering chaos** — refactor the unit list and every reference in the issue, PR, and conversation is now wrong
- **Vague test "scenarios"** — "test the new behavior" tells the implementer nothing
- **Forgotten origin context** — the brainstorm decided this was for a specific actor, but the plan never mentions them
- **Half-resolved questions** — "TBD: figure out caching strategy" sitting in the plan months later
- **Implementation choreography** — exact method signatures, micro-steps, or shell sequences pre-written, then wrong by the time implementation actually starts
- **No depth check** — the author has no signal whether the plan is grounded enough to execute

## The Solution

`ce-plan` separates **WHAT decisions need to be honored** from **HOW to satisfy them in code**:

- The plan captures decisions, scope boundaries, atomic units, files, test scenarios, and risks — the shape and constraints of execution
- It does not pre-write code, exact API signatures, or step-by-step shell choreography — those decisions are deferred to the implementing agent at execution time
- Stable U-IDs survive reordering, splitting, and deletion — so blocker references and PR mentions stay valid across plan edits
- Plan-decisions are traceable back to origin (R-IDs from brainstorm; AE-IDs cited in test scenarios)
- Research runs in parallel before structuring (repo, learnings, framework docs, best practices, spec flow)
- A confidence check runs automatically after writing the plan and dispatches targeted sub-agents to strengthen weak sections
- Planning-time vs implementation-time questions are explicitly separated — no fake certainty

---

## What Makes It Novel

### 1. Guardrails over choreography — WHAT, not HOW

Plans capture decisions and constraints, not code: decisions made (with rationale), scope boundaries, atomic units of work, files touched, test scenarios that must pass, and risks needing mitigation. Plans deliberately exclude exact method signatures, framework-specific syntax, step-by-step shell sequences, and pseudo-code dressed up as implementation specification. The implementing agent reads the plan, sees the guardrails, and figures out HOW to satisfy them with code in front of them. **Decisions belong in the plan; implementation choices belong at execution time.**

> Why? Plans that pre-write implementation are brittle: pre-committed signatures don't compile, choreographed steps go stale, and they rob the implementer of judgment that should be made with current context. Plans that stick to guardrails stay portable across weeks of code change, across implementer (human or AI), and across edits during deepening.

This is also what makes the same engine work for non-software tasks. A hot-water-tank-maintenance plan has decisions, units, files-equivalent (which valves, which manuals), test scenarios ("verify no leaks after refill"), and risks — but no code. The frame transfers cleanly.

### 2. U-IDs — implementation units have stable, never-renumbered identifiers

Each unit's heading is `- U1. **Name**`, `- U2. **Name**`, etc. The stability rule: never renumber existing IDs after reordering, splitting, or deleting. Splits keep the original U-ID on the original concept; new units take the next unused number; deletions leave gaps (gaps are fine, never backfilled).

This matters because `ce-work` references units by U-ID across plan edits. Renumbering during a deepening pass silently breaks every blocker reference, every PR description that cites a unit, and every downstream conversation. The stability rule prevents that class of bug.

### 3. Origin tracing — R/A/F/AE IDs from brainstorm flow through the plan

When the plan is sourced from a `ce-brainstorm` requirements doc, identifiers flow through: Requirements (R-IDs) trace into the plan's Requirements section; Actors (A-IDs) carry forward when they affect behavior or permissions; Key Flows (F-IDs) cite into implementation units that realize them; Acceptance Examples (AE-IDs) cite into test scenarios that enforce them (`Covers AE3. <scenario>`). Every section of the origin doc is verified against the plan before finalization. Nothing silently drops.

### 4. Test scenarios per unit, in named categories

Every feature-bearing unit enumerates test scenarios from each applicable category — happy path, edge cases (boundaries, empty/nil, concurrency), error/failure paths (invalid input, downstream failures, permissions), and integration (cross-layer behaviors mocks alone won't prove). Each scenario names the input, action, and expected outcome — specific enough that the implementer doesn't have to invent coverage.

### 5. Confidence check and automatic deepening

After the plan is written, `ce-plan` automatically scores sections against checklists with risk-weighted bonuses, picks the top weak sections, dispatches targeted sub-agents to strengthen them (correctness reviewer for implementation units, data integrity guardian for migrations, architecture strategist for key technical decisions), and synthesizes findings back into the plan. Auto mode integrates findings directly; interactive mode (when you ask to deepen an existing plan) presents findings for accept/reject. The expensive moment to discover a thin section is during execution, not during planning.

### 6. Multi-agent research, in parallel

Phase 1 dispatches up to 5 research agents in parallel — repo-research-analyst (technology, architecture, patterns), learnings-researcher (institutional memory from `docs/solutions/`), framework-docs-researcher (version-pinned docs when external research is warranted), best-practices-researcher (high-risk topics), spec-flow-analyzer (edge case completeness for Standard/Deep plans), with optional Slack research. The repo-research output's tech context feeds the external-research decision: known frameworks → version-specific docs; thin local patterns → external research warranted.

### 7. Universal planning — same engine for non-software work

The guardrails-not-choreography frame transfers cleanly across domains. Real (non-hypothetical) uses include annual hot-water-tank maintenance, study plans, trip planning, research workflows, and event planning. The non-software path skips the software-specific confidence check, but U-IDs, dependency ordering, scope boundaries, test/verification scenarios, and the right-sized template all carry over unchanged.

---

## Quick Example

You invoke `ce-plan` with a requirements doc from `ce-brainstorm`. The skill detects the origin, uses it as primary input, and verifies no resolve-before-planning blockers remain.

It dispatches research in parallel — repo analyst, learnings researcher — and detects the codebase has strong local patterns for this work, so it skips external research. A spec-flow analyzer runs to surface edge cases. The brainstorm-sourced synthesis summary surfaces what's stated, what the agent inferred (e.g., "mute state stored on the subscription, not the user"), and what's out of scope (carried from origin).

The plan is written. The confidence check then runs automatically — it identifies that `Risks & Dependencies` is thin on the mute-leak risk and that one unit's test scenarios miss permission edge cases, dispatches a data-integrity reviewer and a correctness reviewer, and synthesizes their findings back into the plan. The plan is stamped with a `deepened:` date.

Document review then runs in headless mode. The cheap minimum dispatches (coherence + feasibility) since the plan has origin set and touches no high-stakes domains; `safe_auto` fixes (a typo, a broken cross-reference) apply silently. Remaining findings surface as a one-line summary above the post-generation menu — e.g., `Doc review applied 2 fixes. 3 decisions, 1 FYI remain.` The menu surfaces: start `/ce-work`, run deeper doc review (when actionable findings remain), create a tracked issue, open in Proof for HITL review, or pause.

---

## When to Reach For It

Reach for `ce-plan` when:

- You have a requirements doc from `ce-brainstorm` ready
- You have a GitHub issue, PRD, or feature description that's clear enough
- The work is multi-step and benefits from sequencing, dependency ordering, and scope boundaries
- You want test or verification scenarios enumerated before execution
- You're picking up a stale plan and want it deepened (use "deepen the plan" or "deepening pass")
- The task is **non-software but multi-step** — study plan, event, trip, maintenance routine, research workflow, personal project

Skip `ce-plan` when:

- The task is genuinely one-step (just do it; or `ce-work` for direct execution)
- The product or outcome isn't yet decided → `ce-brainstorm` first
- The bug has a known root cause and an obvious fix → `ce-debug` or just fix it

---

## Use as Part of the Chained Workflow

```text
/ce-ideate          (optional)
   |
   v
/ce-brainstorm      (define one direction)
   |  requirements / brief — R/A/F/AE-IDs in software mode
   v
/ce-plan
   |  guardrails — U-IDs traced to R/A/F/AE-IDs
   |  test scenarios with AE-link convention (Covers AE<N>)
   |  scope boundaries preserved (incl. "Outside this product's identity")
   |  confidence-checked and auto-deepened
   v
/ce-work            (execute against the guardrails)
   |  reads U-IDs as the unit of execution
   |  figures out the actual HOW with code in front of it
   |  derives progress from git, not plan body
   v
/ce-code-review     (optional)
   |
   v
/ce-compound        — capture the learning
```

The handoff from `ce-plan` to `ce-work` is concrete: `ce-work` reads U-IDs, file paths, scope boundaries, and test scenarios — then determines the actual implementation. The plan tells the implementer **what must be true** when the unit is done; the implementer figures out **how to make it true**. This division is what makes plans portable across implementer and across time.

---

## Use Standalone

Many people reach for `ce-plan` directly when they already have what to do — for software and equally often for non-software multi-step tasks.

**Software:**

- **From a GitHub issue** — `/ce-plan https://github.com/.../issues/1234` (or paste the issue body)
- **From a PRD** — `/ce-plan` with the PRD path; the planning bootstrap reads it as origin
- **From a rough idea** — `/ce-plan "add background email digest at 8am UTC"` runs the bootstrap; the synthesis lets you correct scope before research dispatches
- **Re-deepening an existing plan** — `/ce-plan deepen the auth-rewrite plan` — interactive mode where agents present findings one by one for accept/reject
- **Cross-repo planning** — `/ce-plan "fix the busyblock bug in cli-printing-press"` from a different repo; the cross-repo target is announced and the plan lands in the target's `docs/plans/`

**Non-software (universal-planning mode):**

- **Maintenance tasks** — annual hot-water-tank maintenance, with verification at each unit
- **Study plans** — phased units with prerequisites and per-unit knowledge checks
- **Trip planning** — bookings, packing, daily itinerary, contingency boundaries
- **Research workflows** — literature gathering, synthesis, drafting phases with explicit deliverables
- **Event planning** — venue, vendors, agenda, day-of run-of-show, follow-ups
- **Personal projects** — workshop build-outs, home renovations

In universal-planning mode, the U-IDs, dependency ordering, scope boundaries, and right-sized template all carry over. The software-specific confidence check is skipped; everything else runs the same way.

---

## Reference

| Argument | Effect |
|----------|--------|
| _(empty)_ | Asks for the task description |
| `<feature description>` | Solo planning; runs the bootstrap |
| `<requirements doc path>` | Origin-sourced planning |
| `<plan path>` | Resume offer (or deepen, if intent matches) |
| `deepen the plan` / `deepening pass` | Re-deepen fast path (interactive mode) |
| `<bug description>` | Routes to `ce-debug` suggestion menu |
| `<task in another repo>` | Cross-repo announcement, plan lands in target |

---

## FAQ

**Doesn't a plan tell you HOW to build something?**
Not in `ce-plan`'s framing. The plan tells you what must be honored — decisions, scope, units, files, tests, risks. It deliberately does not pre-write code, exact API signatures, or step-by-step shell choreography. The implementing agent figures out HOW with code in front of them. This separation keeps plans portable, prevents brittle pre-commitments, and respects the judgment the implementer brings at execution time. It's also what lets the same engine plan a software refactor, a hot-water-tank maintenance, and a 6-week study plan with the same structural rigor.

**Why U-IDs instead of just numbered units?**
Numbering breaks when units are reordered, split, or deleted — every reference in the issue, PR, and downstream conversation becomes wrong. U-IDs are stable: reorder leaves them in place, splits keep the original on the original concept, deletes leave gaps. `ce-work`'s blocker references work across plan edits because of this.

**Why does the confidence check run automatically?**
The expensive moment to discover a thin section is during execution, not during planning. Auto-deepening dispatches targeted research while research context is still warm — much cheaper than re-research weeks later when implementation surfaces a missed risk.

**What if I want to keep the existing plan and just review it?**
Use the deepen-intent fast path: `/ce-plan deepen <plan>`. It runs in interactive mode — agents present findings one by one for accept/reject. The user has surgical control over which changes integrate.

**What about implementation code in the plan?**
Disallowed by default. Pseudo-code and DSL grammars are permitted in High-Level Technical Design when they communicate the **shape** of the solution, framed explicitly as **directional guidance, not implementation specification**. Exact method signatures, imports, framework-specific syntax, and step-by-step shell sequences do not belong in plans.

**Is it really useful for non-software plans?**
Yes — and it's increasingly common. Universal-planning preserves the U-ID concept, dependency ordering, right-sized template, and guardrails-not-choreography frame. Real uses include hot-water-tank maintenance, study plans, trip planning, research workflows, and event planning.

---

## See Also

- [`ce-brainstorm`](./ce-brainstorm.md) — produce the requirements doc that becomes the plan's origin
- [`ce-ideate`](./ce-ideate.md) — upstream "what to even work on" ideation
- [`ce-work`](./ce-work.md) — execute the plan U-ID by U-ID
- [`ce-doc-review`](./ce-doc-review.md) — persona-based review of the plan
- [`ce-debug`](./ce-debug.md) — bug-shaped prompts route here
- [`ce-strategy`](./ce-strategy.md) — anchor plans to documented product strategy
