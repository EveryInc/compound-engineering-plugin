---
name: ce-prototyping
description: "For product managers: turn a product idea into a working prototype AND a highly complete, validated PRD for engineering. Choose a fidelity from UI-only demo to production-seed, co-evolve the prototype and requirements with a running decision log, gate on product principles, and hand off a ce-unified-plan artifact engineering runs /ce-plan on. Use when a PM wants to make an idea tangible and de-risk the engineering handoff — not for building shippable product code (that's ce-work)."
argument-hint: "[a product idea or feature to prototype] — or invoke bare to be asked"
---

# Prototype It

Take a product idea from a product manager and leave with two things: a **working prototype** at the fidelity they chose, and a **highly complete, validated PRD** engineering can build the right thing from the first time. The prototype exists to de-risk intent — building and reviewing a real artifact surfaces the decisions, edge cases, and gaps that pure discussion misses — so the PRD that ships is one the prototype proved out.

<prototype_request> #$ARGUMENTS </prototype_request>

*(If `$ARGUMENTS` above appears as a literal token rather than the user's words — it was not substituted on this host — use the user's actual request from the conversation as the input. If empty, ask what they want to prototype using the blocking-question tool below.)*

**Note: The current year is 2026.** Use this when dating artifacts.

## Who this is for

A product manager of any technical level. Adapt interaction and language to the person — plain and jargon-free for a non-technical PM, deeper technical detail for a technical one — but the deliverables (prototype + dual PRD) are the same. This skill closes the product-to-engineering "game of telephone": it produces one validated, unambiguous artifact of intent so engineering does not have to guess or ping-pong.

## Interaction Method

When you must ask the user a question, use the platform's blocking question tool: `AskUserQuestion` in Claude Code (call `ToolSearch` with `select:AskUserQuestion` first if its schema isn't loaded), `request_user_input` in Codex, `ask_user` in Gemini, `ask_user` in Pi (requires the `pi-ask-user` extension). Fall back to numbered options in chat only when no blocking tool exists in the harness or the call errors — not because a schema load is required. Never silently skip the question. Ask one question at a time.

## What this skill is NOT

- **Not `ce-work`.** It does not ship production code. Even a production-seed prototype is engineering's starting point, not a finished deliverable.
- **Not `ce-brainstorm` or `ce-plan` replacement.** It reuses their disciplines but adds the prototype-driven refinement loop, the decision log, the product-principles gate, and the dual output. Engineering continues via `/ce-plan` on the artifact this skill emits.

## Workflow

Run these phases in order. Each phase's substance lives in a `references/` file loaded when the phase begins; the load instructions below are the trigger and must fire.

### Phase 1: Opening setup

Before building anything, establish three things, adapting your language to the PM's technical level as you go: the **fidelity** (a spectrum from a UI-only demo to a full production app in a codebase), and the **environment** (a zero-setup self-contained artifact, or an in-repo build). Detect what is available rather than assuming, and let the PM choose. If they pick production-seed but no repo/stack is detected, reconcile the mismatch — offer to scaffold or to downgrade the fidelity — rather than failing.

Read `references/opening-setup.md` and run it now.

### Phase 2: Load product principles

Load the product principles that will gate PRD completeness: the shipped baseline, plus any org-specific principles. Read in order — the repo copy, then the user-global store, then interview the PM only when neither has them — and offer to persist newly captured principles for reuse across repos.

Read `references/product-principles.md` and run the load-and-capture step now. (The completeness gate itself fires in Phase 5.)

### Phase 3: Scope the idea

Scope the idea with a compact, PM-facing dialogue — one question at a time, problem and users first, then constraints and exclusions. This mirrors `ce-brainstorm`'s discipline; it does not invoke `ce-brainstorm`.

Read `references/scoping-dialogue.md` and run it now.

### Phase 4: Co-evolve the prototype and the PRD

Loop: build a prototype slice at the chosen fidelity, review it with the PM, and let what they see refine the requirements. Repeat until the PM is satisfied. A **decision log** is the connective tissue — every decision made reviewing the prototype lands in the PRD, and every requirement decision is reflected in the prototype, so the two never silently diverge.

- For how to build at each fidelity, read `references/prototype-build.md`.
- For the decision-log schema and the bidirectional-sync rule, read `references/decision-log.md`.

Run the loop, maintaining the decision log every round, until the PM confirms the prototype makes the idea concrete enough.

### Phase 5: Gate on product principles, then emit the dual PRD

First apply the completeness gate: the PRD is not final until every applicable product principle (baseline + org) is addressed. Surface the gaps and resolve them (looping back to Phase 4 or the PM as needed) before finalizing.

Then emit the dual PRD and hand off:

- The **canonical** PRD is a `ce-unified-plan` requirements artifact (the same contract `ce-brainstorm` emits) — engineering runs `/ce-plan` on it directly.
- A **readable** PRD view is rendered from that canonical artifact (never authored separately, so the two cannot drift).
- The prototype is attached as validating evidence.

Read `references/prd-output.md` for the gate details, the artifact contract, the render, and the handoff, and run it now.

## Durable outputs

The PM leaves with: the runnable prototype, the canonical `ce-unified-plan` artifact in `docs/plans/`, and the rendered readable PRD. The decision log and the product-principles doc persist for inspection and reuse.
