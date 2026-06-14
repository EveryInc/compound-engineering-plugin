# Universal Planning Workflow

Loaded when ce-plan detects a non-software task (Phase 0.1b). Replaces the software-specific phases (0.2-5.1) with a domain-agnostic planning workflow.

## Before starting: verify classification

- **Is this actually software?** Study guide about Rust = non-software. Rust refactor = software. If software, return to Phase 0.2.
- **Trivial lookup?** Only a single-fact question with no research/judgment skips planning — answer directly in the user's terms. Do not narrate routing. If uncertain, do not exit.

Commit to the task. The user invoked planning on purpose.

---

## Disposition: plan-seeking vs. answer-seeking

- **Plan-seeking** — deliverable is a _plan_: itinerary, curriculum, runbook. The plan is the artifact. Follow Steps 1-3.
- **Answer-seeking** — deliverable is an _answer_: investigative question. No plan file. Follow flow below; skip Step 3.

If blended ("research X, then plan Y"), do answer-seeking first, then produce the plan.

---

## Answer-seeking flow

Plan is _working scaffold_, not artifact. State in chat, execute, discard.

### Plan-of-attack (non-blocking)

Say how the question will be answered, right-sized. **Non-blocking** — announce and proceed immediately. Do not ask for approval. Stop only on a fork the agent cannot resolve.

### Execute

When the answer depends on facts not reliably in memory, decompose into focused questions and dispatch via `spawn_agent` in parallel. Collate findings.

**Ground answers about the user's code or named artifacts in actual sources** (Core Principle 8). "The model knows the topic" covers general knowledge only, never the user's codebase.

Execution is research and analysis only — never code.

### Deliver

Answer in chat. No plan file. If investigation produced something worth keeping, offer to save; otherwise just answer.

### Veil of value

- **Surface:** approach to the user's question, in the user's terms.
- **Hide:** skill/mode/phase running, plan file decisions, routing.
- **Never hide:** caveats, gaps, uncertainty about the answer.

---

## Step 1: Assess Ambiguity and Research Need

**1-3 quick questions?** Default: ask via Step 1b when answers change structure. Include "Skip — make the plan with reasonable assumptions." Skip only when the request already specifies all variables.

**Research need?**

| Need            | Signals                                   | Action                                                                                         |
| --------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------- |
| **None**        | Conceptual/timeless plan                  | Skip. Offer to search after structuring.                                                       |
| **Recommended** | Specific dates, prices, locations, events | Decompose into 2-5 questions, dispatch via `spawn_agent` in parallel, collate before planning. |

When recommended, do it — stale info is worse than none.

**Research decomposition:** identify 2-5 independent questions targeting uncertain facts → dispatch via `spawn_agent` → collate brief summary before planning.

## Step 1b: Focused Q&A

Ask up to 3 questions in chat (numbered options). Never silently skip.

- Offer informed options, not open-ended blanks.
- Use multi-select for independent choices in one question.
- Always include "Skip — make the plan with reasonable assumptions."

Max 3 questions — proceed with assumptions for the rest.

## Step 2: Structure the Plan

Do NOT use the software plan template. Use domain-appropriate format:

- **High personal preference** (food, gifts, activities): curated options per category.
- **Logical sequence** (study plan, timeline): single prescriptive path.
- **Hybrid** (fixed structure, variable details): skeleton with choice points.

**Quality:** actionable steps, dependency-sequenced, time-aware, resource-identified, contingency-aware, appropriately detailed, domain-appropriate format (itinerary, syllabus, runbook, project plan, options menu).

## Step 3: Save or Share

Ask in chat using numbered options:

1. **Save to disk** — Markdown. Use `YYYY-MM-DD-<name>-plan.md`, start with `# Title` + `Created: YYYY-MM-DD`. Ask where: `docs/plans/`, current dir, `/tmp`, or custom path.
2. **Display in chat** — Show plan with note: "Plan ready above. Reply 'save this' if you'd like it written to disk."

Do not offer `ce-work` (software-only) or issue creation.
