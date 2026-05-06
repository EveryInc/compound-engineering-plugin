# `ce-brainstorm`

> Think through what something should become — collaboratively, one question at a time — then write a right-sized requirements doc.

`ce-brainstorm` is the **definition** skill. It's a thinking partner that asks one question at a time, pressure-tests your premises against named gap lenses, explores 2-3 concrete approaches before recommending one, and produces a right-sized requirements document strong enough that planning never has to invent product behavior.

It runs equally well on software features, on entirely non-software topics (event planning, business decisions, personal-project framing, travel itineraries, naming briefs), and anywhere in between. The same one-question-at-a-time discipline; the same right-sized template; the same Synthesis Summary before any artifact lands.

This is the middle step in the compound-engineering ideation chain:

```text
/ce-ideate         /ce-brainstorm      /ce-plan             /ce-work
"What's worth      "What does this     "What's needed       "Build it."
 exploring?"        need to be?"        to accomplish
                                        this?"
```

It's also the most common standalone entry point — for any feature, decision, or project where the question isn't "how do I do it?" but "what am I really doing, and is it the right shape?"

---

## TL;DR

| Question | Answer |
|----------|--------|
| What does it do? | Collaborative dialogue to clarify scope, pressure-test premises, explore approaches, and write a right-sized requirements doc |
| When to use it | Vague feature ideas, "let's brainstorm", multiple plausible directions, unclear scope; non-software decisions and projects |
| What it produces | Requirements doc in `docs/brainstorms/` (with R-IDs, A-IDs, F-IDs, AE-IDs in software mode) |
| What's next | `/ce-plan`, `/ce-work` for trivial scope, doc review, or Proof iteration |

---

## The Problem

Going straight from a vague idea to implementation produces:

- Code (or work) that solves the wrong problem because nobody pressure-tested the premise
- Scope creep because boundaries were never made explicit
- Plans that re-litigate product decisions every time someone touches them
- Requirements docs that are either over-ceremonial PRDs nobody updates, or one-line briefs that planning has to fill in by guessing

A typical "let's brainstorm" with an AI also has shape problems: it asks five questions in one message; you answer two and the rest get lost. It picks one approach immediately instead of presenting alternatives. It bakes implementation details into product discussion. The output is conversation, not a handoff-able artifact.

## The Solution

`ce-brainstorm` runs a structured but conversational flow that ends in a durable artifact:

- **One question per turn**, even when sub-questions feel related
- **Right-sized ceremony** — Lightweight / Standard / Deep / Deep-product tiers
- **Named gap lenses** force rigor on premises before generating approaches
- **2-3 concrete approaches** with tradeoffs, then a stated recommendation
- **Synthesis Summary** as the last opportunity to correct scope before the doc lands
- **Right-sized requirements document** with stable identifiers (R/A/F/AE) that flow into planning

---

## What Makes It Novel

### 1. One question at a time, blocking-tool first

Stacking three questions in one message produces diluted answers. `ce-brainstorm` asks one question per turn, every turn — and defaults to the platform's blocking question tool with single-select options when natural choices exist. Well-chosen options scaffold the answer without confining it (free-text fallback always available).

### 2. Tier classification scales ceremony to the work

Not every brainstorm is the same. Lightweight covers small, well-bounded ideas with low ambiguity. Standard handles normal features with some decisions. Deep adds systemic-move probes for cross-cutting work. Deep-product additionally requires establishing product shape — actors, core outcome, positioning, durability — rather than inheriting it. Ceremony scales with the work, not against it.

### 3. The Product Pressure Test — named gap lenses

Before generating approaches, the skill scans the user's opening for rigor gaps. Each gap has a name and probes the kind of confusion it catches:

- **Evidence** — "users want X" with no observable behavior backing it
- **Specificity** — beneficiary described abstractly; design will silently invent who they are
- **Counterfactual** — no visibility into what users do today, or what changes if nothing ships
- **Attachment** — a specific solution shape is being treated as the thing being built
- **Durability** _(Deep-product only)_ — value rests on a current state of the world that may shift

These probes fire as **prose, not menus** — a 4-option menu signals which kinds of evidence count and lets the user pick rather than produce. Prose forces real observation.

### 4. Approach exploration with non-obvious angles required

Phase 2 surfaces 2-3 concrete approaches with at least one **non-obvious angle** — inversion, constraint removal, or cross-domain analogy. Approaches are presented at mechanism / product-shape granularity, not architecture. (Architecture decisions made on intentionally-shallow research tend to pre-commit you to bad choices; those belong in `ce-plan`.) Approaches are shown before the recommendation so the user sees alternatives without being anchored.

### 5. Synthesis Summary — the last cheap moment to correct

Before writing the doc, `ce-brainstorm` emits a three-bucket synthesis: **Stated** (explicit decisions), **Inferred** (bets the agent is making to fill gaps), **Out** (what's been ruled out). This is the user's last chance to correct scope before the artifact lands. In headless mode, Inferred bets route to a separate `## Assumptions` section so downstream review can scrutinize them.

### 6. Stable identifiers that flow downstream

The requirements doc carries plan-feeding identifiers — R-IDs (Requirements), A-IDs (Actors), F-IDs (Key Flows), AE-IDs (Acceptance Examples). `ce-plan` consumes these and traces every implementation unit and test scenario back to them. Origin scope boundaries (especially "Outside this product's identity") flow through unchanged.

### 7. Universal brainstorming for non-software

Building a software feature? Standard flow. Naming a product? Choosing a vacation? Deciding a career move? `ce-brainstorm` routes to a domain-agnostic facilitator that preserves the one-question-at-a-time discipline and right-sized output.

### 8. Implementation kept out of the requirements doc by default

Requirements describe **what** behavior is expected from the user's perspective. They do not describe libraries, schemas, endpoints, file layouts, or code structure — unless the brainstorm is itself about a technical or architectural decision. This keeps planning's job clean: invent the **how**, not the **what**.

---

## Quick Example

You start with a vague feature idea — "I want to add a way for users to pause notifications." `ce-brainstorm` scans the repo, finds related artifacts, and classifies the work as Standard scope.

The pressure test detects a specificity gap (who are these "users"?) and an attachment gap ("pause" is already a specific solution shape). It probes both as prose, one at a time. You name the actual pain — your support team gets pinged at 3 AM for non-urgent stuff — and describe the smallest version that would solve it.

Three approaches surface — per-notification-type mute with TTL, a global do-not-disturb schedule, mute on the rule rather than the channel — with tradeoffs and a recommendation. The Synthesis Summary surfaces what's stated, what the agent inferred, and what's been ruled out. You confirm and add a 24h preset.

A right-sized requirements doc is written and the Phase 4 menu offers next steps — `/ce-plan` (recommended), agent doc review, Proof iteration, or skip-to-build for trivial scope.

---

## When to Reach For It

Reach for `ce-brainstorm` when:

- A feature idea is partially formed but you can't yet sketch the implementation
- A request has multiple valid solutions and you need to choose
- The scope is unclear ("add notifications" — what kind? for whom? when?)
- You want a structured artifact you can hand to another contributor or to planning
- A vague problem statement needs to become a real product decision
- You're working on something non-software (named products, roadmap choices, decisions)

Skip `ce-brainstorm` when:

- You don't yet know what to work on → `/ce-ideate` first
- Requirements are already specified (PRD exists, GitHub issue is detailed) → `/ce-plan` directly
- You have a known root cause for a bug → `/ce-debug`
- The change is trivial and obvious → just do it

---

## Use as Part of the Chained Workflow

```text
/ce-ideate          (optional — discover candidate directions)
   |  picks one survivor + carries warrant + rationale
   v
/ce-brainstorm
   |  produces requirements / brief
   |  software mode: R-IDs, A-IDs, F-IDs, AE-IDs + scope boundaries
   |  universal mode: a domain-appropriate brief
   v
/ce-plan
   |  reads the doc as origin
   |  R-IDs flow into Requirements; A/F/AE-IDs trace into units and tests
   |  origin scope boundaries are preserved verbatim
   v
/ce-work
```

When `ce-plan` loads with a requirements doc as input, it does not re-litigate product behavior. The doc is authoritative. Plan-time decisions are about execution guardrails — not what's being built.

---

## Use Standalone

`ce-brainstorm` is the most common standalone entry point. Many teams skip `ce-ideate` (they already know what to explore) and skip `ce-plan` (the brainstorm is their full thinking artifact).

- **Feature briefs** — turn a vague idea into a stable artifact for stakeholders or new contributors
- **Onboarding existing work** — when a feature is in flight but the rationale was never written down
- **Pre-PR alignment** — when multiple people need to agree on scope before code starts
- **Strategic decisions** — Deep-product tier surfaces durability and adjacent-product risks
- **Non-software brainstorms** — name a product, plan an event, decide a roadmap

The Phase 4 handoff offers planning, agent doc review, Proof iteration, direct-to-work for lightweight scope, more clarifying questions, or pause.

---

## Reference

| Argument | Effect |
|----------|--------|
| _(empty)_ | Asks for the feature description |
| `<feature idea>` | Open-ended brainstorm |
| `<problem>` | Routes via the product pressure test |
| Existing `*-requirements.md` path or topic | Resume offer |

---

## FAQ

**Why one question at a time? Isn't that slow?**
Stacking three questions per turn produces diluted answers — users pick the easy one and the rest get lost. One question per turn produces sharper answers and is empirically faster to convergence.

**Why does it pressure-test my premise? I just want to brainstorm.**
The named gap lenses catch the most common ways feature briefs fail downstream. They fire only when the gap is actually present in your opening — a concrete, well-framed prompt may earn zero probes.

**Can I skip the requirements doc?**
Yes. The Lightweight tier and the announce-mode fast path support that. If you only need brief alignment, no doc is written.

**What if I already have a PRD or detailed GitHub issue?**
Skip `ce-brainstorm` and go directly to `/ce-plan`. The plan skill consumes any kind of input.

**What does "Inferred" mean in the synthesis?**
Bets the agent is making to fill gaps. In interactive mode, you confirm or correct them in chat. In headless mode, they route to a `## Assumptions` section in the doc so downstream review can scrutinize them.

**Does it work for non-software topics?**
Yes — a domain-agnostic facilitator preserves the one-question-at-a-time discipline and right-sizing for naming, decisions, planning, etc.

---

## See Also

- [`ce-ideate`](./ce-ideate.md) — upstream "what's worth exploring" discovery
- [`ce-plan`](./ce-plan.md) — turn the requirements doc into an implementation plan
- [`ce-doc-review`](./ce-doc-review.md) — persona-based review of the requirements doc
- [`ce-work`](./ce-work.md) — execute lightweight changes directly from a brainstorm
- [`ce-strategy`](./ce-strategy.md) — anchor brainstorms to a documented product strategy
