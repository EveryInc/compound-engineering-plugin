# `ce-prototyping`

> For product managers: turn an idea into a working prototype **and** a validated PRD engineering can build the right thing from — the first time.

`ce-prototyping` is a **product-manager-facing** skill. A PM brings a product idea; the skill takes it through scoping, a build-and-review loop, and a product-principles gate, and leaves with two deliverables: a **working prototype** at a chosen fidelity, and a **highly complete PRD** that engineering can act on without a clarification round-trip. It exists to close the product-to-engineering "game of telephone."

It is not `ce-work` (which ships production code) and it does not replace `ce-brainstorm`/`ce-plan` — it reuses their disciplines and adds the prototype-driven refinement loop, a decision log, a principles gate, and a dual output that plugs straight into the pipeline.

---

## TL;DR

| Question | Answer |
|----------|--------|
| What does it do? | Turns a PM's idea into a working prototype + a validated, highly complete PRD |
| Who is it for? | Product managers, of any technical level |
| When to use it | You have an idea and want to make it tangible and de-risk the engineering handoff |
| What it produces | A runnable prototype + a canonical `ce-unified-plan` artifact + a rendered readable PRD |
| What's next | Engineering runs `/ce-plan` on the artifact, then `/ce-work` |
| Distinguishing | Chosen fidelity spectrum, prototype↔PRD co-evolution with a decision log, product-principles completeness gate |

---

## The Problem

Product intent reaches engineering through a game of telephone. A PM describes what they want in a doc, a mockup, or a conversation; engineering interprets it; and the gap between what was meant and what was understood surfaces only after code is written. Teams build the wrong thing on the first pass and burn cycles clarifying intent that was never captured completely. Design tools produce a mockup but not a decision-backed spec; PRDs get written blind and fall apart on contact with a real build; and where both exist, they drift.

## The Solution

`ce-prototyping` produces one validated artifact of intent — a working reference plus a complete requirements record — built through a structured loop:

- **Opening setup** establishes the PM's technical level, a fidelity from UI-only demo to production-seed, and the environment (standalone or in-repo), reconciling mismatches instead of failing.
- **Co-evolution loop** builds a prototype slice, reviews it, and lets what the PM sees refine the requirements — the prototype is a requirements-discovery tool.
- **A decision log** keeps the prototype and PRD in bidirectional sync so nothing decided at the demo is lost.
- **A product-principles gate** (data capture, measurability, success metrics, target user, non-goals, edge/error states, privacy — plus reusable org-specific principles) blocks a "complete" PRD until each applicable principle is addressed.
- **Dual PRD output**: a canonical `ce-unified-plan` artifact engineering runs `/ce-plan` on, plus a readable view rendered from it.

---

## What Makes It Novel

### 1. Fidelity is a PM-chosen spectrum

The PM picks where to land — UI-only demo, presentation mockup, mid-fidelity slice, or production-seed — and the build adapts, reconciling a production-seed choice against a missing repo rather than failing.

### 2. The prototype and PRD co-evolve

Interacting with a working artifact surfaces edge cases and decisions pure discussion misses. Requirements are refined against something real, so the PRD is "complete" because it was validated, not just written.

### 3. A decision log keeps the two in sync

Every decision made reviewing the prototype lands in the PRD, and every requirement decision is reflected in the prototype — bidirectional, so intent can't leak between them.

### 4. Product principles gate completeness

The skill encodes product rigor: a baseline set plus reusable, cross-repo org-specific principles must be addressed before the PRD is final — not a free-form template.

### 5. Dual PRD that plugs into the pipeline

The canonical PRD is a `ce-unified-plan` artifact, so the handoff is a one-command continuation (`/ce-plan`); the readable view renders from it, so they can't drift.

---

## When to Reach For It

- You're a PM with an idea and want to hand engineering something unambiguous and validated.
- You want to *see and feel* an idea working before committing engineering to it.
- You want to reduce product↔engineering back-and-forth and build the right thing the first time.

Reach for `ce-brainstorm` instead when you only need to scope (no prototype), and `ce-work` when you're building the shippable product.

---

## Use as Part of the Chained Workflow

```text
/ce-prototyping                         /ce-plan            /ce-work
"Make the idea real and                 "What's needed      "Build it."
 hand engineering a validated PRD."      to build it?"
```

The PM runs `ce-prototyping`; engineering picks up the emitted artifact with `/ce-plan`.

---

## Reference

| Argument | Effect |
|----------|--------|
| `<a product idea>` | Prototype and produce a PRD for that idea |
| _(empty)_ | Asks what to prototype |

Output: a runnable prototype, a `ce-unified-plan` requirements artifact in `docs/plans/`, and a rendered readable PRD. The decision log and product-principles doc persist for inspection and reuse.

---

## FAQ

**Is the prototype production code?**
No — even a production-seed is engineering's starting point, not a finished feature. Lower fidelities fake data and logic by design. The PRD, not the prototype code, is the contract.

**Where do product principles come from?**
A baseline ships with the skill; org-specific principles are interviewed once and persisted to a reusable doc (a repo copy plus a user-global store) so later runs don't re-ask.

**How does engineering consume the output?**
The canonical PRD is a `ce-unified-plan` artifact — engineering runs `/ce-plan` on it to produce an implementation-ready plan, then `/ce-work`.

---

## See Also

- [`ce-brainstorm`](./ce-brainstorm.md) — scope an idea into requirements (no prototype)
- [`ce-plan`](./ce-plan.md) — turn the emitted PRD into an implementation-ready plan
- [`ce-work`](./ce-work.md) — build the shippable product
