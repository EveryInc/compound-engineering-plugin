# `ce-brainstorm`

> Think through what something should become — collaboratively, one question at a time — then write a right-sized requirements-only unified plan.

`ce-brainstorm` is the **definition** skill. It's a thinking partner that asks one question at a time, pressure-tests your premises against named gap lenses, explores 2-3 concrete approaches before recommending one, and, for software work, produces a requirements-only unified plan strong enough that planning never has to invent product behavior.

It runs equally well on software features, on entirely non-software topics (event planning, business decisions, personal-project framing, travel itineraries, naming briefs), and anywhere in between. The same one-question-at-a-time discipline applies everywhere. Software brainstorms write the requirements-only unified plan artifact; non-software brainstorms stay in facilitation mode and can hand their synthesis to `ce-plan` for a domain-appropriate plan.

This is the middle step in the compound-engineering ideation chain:

```text
/ce-ideate         /ce-brainstorm      /ce-plan             /ce-work
"What's worth      "What does this     "What's needed       "Build it."
 exploring?"        need to be?"        to accomplish
                                        this?"
```

It's also the most common standalone entry point — for any feature, decision, or project where the question isn't "how do I do it?" but "what am I really doing, and is it the right shape?"

One thing it deliberately does *not* do is render a verdict. When a request is really a *whether-to-adopt* decision on a specific external candidate — a named technology, library, pattern, platform, or architecture, judged against this project — `ce-brainstorm` recognizes the shape (at intake or when a brainstorm later narrows to it) and offers to hand off to `/ce-pov` for a decisive, project-grounded verdict, rather than scope something the user hasn't decided to commit to. It's an offer, not a silent switch; open-ended design with no single candidate stays here.

---

## TL;DR

| Question | Answer |
|----------|--------|
| What does it do? | Collaborative dialogue to clarify scope, pressure-test premises, explore approaches, and write a requirements-only unified plan |
| When to use it | Vague feature ideas, "let's brainstorm", multiple plausible directions, unclear scope; non-software decisions and projects |
| What it produces | Software: requirements-only unified plan in `docs/plans/` with `artifact_readiness: requirements-only` and R/A/F/AE IDs. Non-software: chat synthesis plus optional handoff to `ce-plan`, not a software unified artifact. |
| What's next | `/ce-plan`, `/ce-work` for trivial scope, doc review, or publish to Proof |

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
- **A background grounding scout** gathers verbatim repo evidence on a cheap model while you answer the opening questions
- **2-3 concrete approaches** with tradeoffs, then a stated recommendation
- **Opt-in visual probes** for decisions that are faster to judge as rough sketches than prose
- **Synthesis Summary** as the last opportunity to correct scope before the doc lands
- **Fresh-context claim verification** checks the doc's repo claims before it lands
- **Right-sized Product Contract** inside a unified plan with stable identifiers (R/A/F/AE) that flow into planning

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

### 5. Display-only visual probes when seeing beats reading

When a decision is spatial, behavioral, or visual, `ce-brainstorm` can offer a choice: keep exploring in text, or create a rough local visual probe. Visual probes are disposable sketches for product feedback, not polished UI, implementation prototypes, or final specs. The artifact is display-only; the user responds in chat.

### 6. Synthesis Summary — the last cheap moment to correct

Before writing the doc, `ce-brainstorm` emits a **scoping synthesis** shaped like what two product collaborators would confirm before writing a PRD. It surfaces what's being built, the key trade-offs the dialogue produced, what's been deferred, and any genuine forks the user should weigh in on. Each section renders only when it has something to say — no empty buckets padded for ceremony. The synthesis compresses to a single forward-looking sentence with an end-of-turn interrupt window **only** for a Lightweight brainstorm that asked no blocking questions. Every other case — Standard or Deep tier, or any tier that asked a blocking question — gets the full scoping synthesis with an explicit confirmation gate, including a richly pre-loaded Phase 0.2 fast path that needed no dialogue: pre-loaded substance earns a real checkpoint rather than a one-sentence preview.

### 7. Stable identifiers that flow downstream

The Product Contract carries plan-feeding identifiers — R-IDs (Requirements), A-IDs (Actors), F-IDs (Key Flows), AE-IDs (Acceptance Examples). `ce-plan` consumes these and traces every implementation unit and test scenario back to them. Origin scope boundaries (especially "Outside this product's identity") flow through unchanged.

### 8. Universal brainstorming for non-software

Building a software feature? Standard flow. Naming a product? Choosing a vacation? Deciding a career move? `ce-brainstorm` routes to a domain-agnostic facilitator that preserves the one-question-at-a-time discipline and right-sized output.

### 9. Implementation kept out of the Product Contract by default

Requirements describe **what** behavior is expected from the user's perspective. They do not describe libraries, schemas, endpoints, file layouts, or code structure — unless the brainstorm is itself about a technical or architectural decision. This keeps planning's job clean: invent the **how**, not the **what**.

### 10. Grounding and verification ride inside your think-time

On Standard and Deep brainstorms, a cheap extraction-tier scout is dispatched in the background while you answer the first question. It writes a grounding dossier — verbatim quotes with `file:line` pointers — to scratch storage and hands back a short gist, so the dialogue stays lean while the evidence stays available on demand. Before the requirements-only unified plan is written, a fresh-context verifier (a mid-tier model that never saw the dialogue) checks the Product Contract's repo claims — absence claims, file references — against the codebase, running while you review the synthesis confirmation. Refuted claims are corrected before the plan lands; unverifiable ones become explicit assumptions. The dossier path is handed to `ce-plan` so planning starts from verified quotes instead of re-scanning. On platforms without per-agent model selection, both run on the inherited model with the same read budgets; with no subagent support at all, the skill falls back to inline scanning and verification.

---

## Quick Example

You start with a vague feature idea — "I want to add a way for users to pause notifications." `ce-brainstorm` reads the project's constraint files, classifies the work as Standard scope, and sends a cheap background scout to gather repo evidence while you answer the first question.

The pressure test detects a specificity gap (who are these "users"?) and an attachment gap ("pause" is already a specific solution shape). It probes both as prose, one at a time. You name the actual pain — your support team gets pinged at 3 AM for non-urgent stuff — and describe the smallest version that would solve it.

Three approaches surface — per-notification-type mute with TTL, a global do-not-disturb schedule, mute on the rule rather than the channel — with tradeoffs and a recommendation. The Synthesis Summary reads back the shape that emerged ("per-channel mute on notification rules, 24h preset for the 3 AM support pings"), names the trade-offs made in dialogue (per-channel over per-user, mute lives on the rule), what's deferred (presence-based mute, quiet-hours schedules), and a single call-out about the rule-delete loss path. You confirm and add a 24h preset.

A requirements-only unified plan is written under `docs/plans/` and the Phase 4 menu offers next steps — `/ce-plan` (recommended), Product Contract review, publish to Proof, or skip-to-build only for trivial scope with a sufficient Definition of Done.

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
   |  produces requirements-only unified plan
   |  software mode: R-IDs, A-IDs, F-IDs, AE-IDs + scope boundaries
   |  universal mode: a domain-appropriate brief
   v
/ce-plan
   |  enriches the same plan to implementation-ready
   |  R-IDs flow into Requirements; A/F/AE-IDs trace into units and tests
   |  origin scope boundaries are preserved verbatim
   v
/ce-work
```

When `ce-plan` loads with a requirements-only unified plan as input, it does not re-litigate product behavior. The Product Contract is authoritative. Plan-time decisions are about execution guardrails — not what's being built.

---

## Use Standalone

`ce-brainstorm` is the most common standalone entry point. Many teams skip `ce-ideate` (they already know what to explore) and skip `ce-plan` (the brainstorm is their full thinking artifact).

- **Feature briefs** — turn a vague idea into a stable artifact for stakeholders or new contributors
- **Onboarding existing work** — when a feature is in flight but the rationale was never written down
- **Pre-PR alignment** — when multiple people need to agree on scope before code starts
- **Strategic decisions** — Deep-product tier surfaces durability and adjacent-product risks
- **Non-software brainstorms** — name a product, plan an event, decide a roadmap

The Phase 4 handoff offers planning, agent doc review, publish to Proof, direct-to-work for lightweight scope, more clarifying questions, or pause.

---

## Reference

| Argument | Effect |
|----------|--------|
| _(empty)_ | Asks for the feature description |
| `<feature idea>` | Open-ended brainstorm |
| `<problem>` | Routes via the product pressure test |
| Existing requirements-only plan path, legacy `*-requirements.md` path, or topic | Resume offer |
| `output:html` | Write the requirements-only unified plan as a single self-contained HTML file instead of markdown. Exclusive — the artifact is `.md` OR `.html`, never both. Default is markdown. Set `brainstorm_output: html` in `.compound-engineering/config.local.yaml` to make HTML the default. Pipeline mode (LFG, `disable-model-invocation`) always forces markdown so downstream automation gets a stable text shape. |

---

## FAQ

**Why one question at a time? Isn't that slow?**
Stacking three questions per turn produces diluted answers — users pick the easy one and the rest get lost. One question per turn produces sharper answers and is empirically faster to convergence.

**Why does it pressure-test my premise? I just want to brainstorm.**
The named gap lenses catch the most common ways feature briefs fail downstream. They fire only when the gap is actually present in your opening — a concrete, well-framed prompt may earn zero probes.

**Can I skip the requirements-only plan?**
Yes. The Lightweight tier and the announce-mode fast path support that. If you only need brief alignment, no doc is written.

**What if I already have a PRD or detailed GitHub issue?**
Skip `ce-brainstorm` and go directly to `/ce-plan`. The plan skill consumes any kind of input.

**What does "Inferred" mean in the synthesis?**
The agent composes an internal three-bucket draft (Stated / Inferred / Out of scope) as a thinking step before presenting the scoping synthesis. Inferred items are the agent's bets to fill dialogue gaps. Those that survive the keep test surface as call-outs in the scoping synthesis; the rest dissolve into the Product Contract when the user confirms.

**Does it work for non-software topics?**
Yes — a domain-agnostic facilitator preserves the one-question-at-a-time discipline and right-sizing for naming, decisions, planning, etc.

---

## See Also

- [`ce-ideate`](./ce-ideate.md) — upstream "what's worth exploring" discovery
- [`ce-plan`](./ce-plan.md) — enrich the requirements-only unified plan into an implementation-ready plan
- [`ce-doc-review`](./ce-doc-review.md) — persona-based review of the Product Contract or full plan
- [`ce-work`](./ce-work.md) — execute lightweight changes directly from a brainstorm
- [`ce-strategy`](./ce-strategy.md) — anchor brainstorms to a documented product strategy
