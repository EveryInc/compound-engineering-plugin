# `ce-brainstorm`

> Think through what something should become, one question at a time, then write a right-sized requirements-only unified plan.

`ce-brainstorm` is the **definition** skill. Use it when you have a direction and the open question is "what does this need to be?" It asks one question per turn, pressure-tests your premises, lays out 2-3 concrete approaches before recommending one, and, for software, writes a requirements-only unified plan so planning does not have to invent product behavior.

It handles software features, non-software topics (events, business decisions, travel, naming briefs), and everything between. Software runs write the plan file. Non-software runs stay in facilitation mode: a chat synthesis, then an optional handoff to `ce-plan`.

This is the middle step in the compound-engineering ideation chain. Skip it when you already have requirements, or when you do not yet have a direction:

```text
/ce-ideate         /ce-brainstorm      /ce-plan             /ce-work
"What's worth      "What does this     "What's needed       "Build it."
 exploring?"        need to be?"        to accomplish
                                        this?"
```

It is also a common standalone entry when the question is not "how do I do it?" but "what am I actually doing, and is that the right shape?"

It does not render verdicts. If you ask whether to adopt a named external candidate (a technology, library, platform, or architecture judged against this project), it offers `/ce-pov` instead of scoping work you have not committed to. That is an offer, not a silent switch. Open-ended design with no single candidate stays here.

---

## TL;DR

| Question | Answer |
|----------|--------|
| What does it do? | Collaborative dialogue to clarify scope, pressure-test premises, explore approaches, and write a requirements-only unified plan |
| When to use it | Vague feature ideas, multiple plausible directions, unclear scope, work in unfamiliar territory, non-software decisions |
| What it produces | Software: a requirements-only unified plan in `docs/plans/` with `artifact_readiness: requirements-only` and R/A/F/AE IDs. Non-software: chat synthesis, optional save, optional Proof publish, optional handoff to `ce-plan`. Lightweight alignment can skip the doc. |
| What's next | Software: `ce-plan` (recommended), ship autonomously with `lfg`, pressure-test or prototype, or keep asking. Non-software: create a plan, save the summary, publish to Proof, or stop. |

---

## Example invocations

An empty invoke asks what to explore. A path to an existing requirements-only plan offers resume. `output:html` changes the artifact format. A named model elevates only approach generation.

```text
# Ask what to explore, then start the dialogue
/ce-brainstorm

# Shape an ambitious feature before committing to a plan
/ce-brainstorm design a self-serve migration platform for enterprise customers

# Turn a rough feature idea into a requirements artifact
/ce-brainstorm add a way for users to pause notifications

# Explore a problem without prescribing the solution up front
/ce-brainstorm support agents get paged overnight for non-urgent events

# Resume an existing requirements-only plan instead of starting a duplicate
/ce-brainstorm docs/plans/2026-08-10-feat-notification-mute-plan.md

# Name an ideate survivor already in this conversation. Its tagged basis,
# rationale, and tradeoffs travel with it
/ce-brainstorm the per-channel mute idea

# Non-software work, same one-question discipline
/ce-brainstorm plan a two-day customer advisory workshop

# Unfamiliar territory: offers a blindspot map before questioning that area
/ce-brainstorm I know nothing about color grading but need a review workflow for it

# Verdict-shaped: offers ce-pov instead
/ce-brainstorm should we adopt Biome in this repo?

# Ask for a self-contained HTML artifact, in plain language or shorthand
/ce-brainstorm add account-level notification settings and make the artifact HTML
/ce-brainstorm add account-level notification settings output:html

# Keep the session on your usual model; generate the approaches on a named one
/ce-brainstorm add account-level notification settings, use fable
```

Use `ce-ideate` when you do not yet have a direction. Use `ce-pov` when the candidates are already named and you need a verdict. Use `ce-plan` when the product shape is settled.

---

## The problem

Going straight from a vague idea to implementation produces work that solves the wrong problem, scope creep because boundaries were never written down, and plans that re-litigate product decisions every time someone touches them. The requirements end up either over-ceremonial PRDs nobody updates or one-line briefs that planning fills in by guessing.

A typical "let's brainstorm" with an AI has shape problems too. It asks five questions in one message; you answer two and the rest get lost. It picks one approach immediately instead of showing alternatives. It bakes implementation into product discussion. The output is conversation, not an artifact you can hand off.

`ce-brainstorm` fixes both. The conversation is structured (one question per turn, gap lenses before approaches, alternatives before a recommendation), and it can end in a durable artifact with stable identifiers that planning consumes directly.

---

## What makes it novel

### 1. One question at a time

Stacking several questions in one message dilutes the answers. `ce-brainstorm` asks one per turn, defaulting to the platform's blocking question tool with single-select options when natural choices exist. Free-text is always available.

It also asks only decisions. If the repo, the grounding dossier, or another reachable source can settle a question, it looks that up instead of putting it to you, and a lookup in flight does not stall questions that don't depend on it. When your wording conflicts with existing `CONCEPTS.md` or with verified code in a way that would change a product decision, it surfaces the conflict before treating the wording as settled.

### 2. Ceremony scales with the work

Four tiers. Lightweight covers small, well-bounded ideas and ends in chat: a paragraph naming what is being built and the one or two decisions made. No file, no grounding scout, no approach generation. A file is written only when the dialogue produced a decision a downstream consumer needs in IDed form, or you ask for one. Standard handles ordinary features. Deep adds probes for cross-cutting work. Deep-product also has to establish product shape (actors, core outcome, positioning, durability) rather than inherit it.

### 3. Named gap lenses, then approaches

Before generating approaches, the skill scans your opening for rigor gaps and probes only the ones actually present:

- Evidence: "users want X" with no observable behavior behind it
- Specificity: the beneficiary is abstract, so design will invent who they are
- Counterfactual: no visibility into what people do today, or what changes if nothing ships
- Attachment: a specific solution shape is already being treated as the thing being built
- Durability (Deep-product only): value rests on a current state of the world that may shift

These probes fire as prose, not menus. A 4-option menu would tell you which kinds of evidence count; prose forces a real observation.

Phase 2 then surfaces 2-3 concrete approaches, including at least one non-obvious angle (inversion, constraint removal, or cross-domain analogy). Approaches sit at mechanism or product-shape granularity, not architecture. Architecture on thin research belongs in `ce-plan`. You see the alternatives before the recommendation.

### 4. Visual probes, then prototype when a sketch is not enough

When a decision is spatial, behavioral, or visual, the skill can offer a rough local visual probe. Probes are disposable, display-only sketches; you respond in chat. A decision a rough sketch cannot settle (finish or motion), or one a sketch was built for and failed to settle, routes to `ce-prototype` instead.

### 5. Synthesis, identifiers, and a last check before handoff

Before writing the doc, the skill emits a scoping synthesis: what is being built, the trade-offs the dialogue produced, what was deferred, and any genuine forks. This is the last cheap moment to correct scope. Lightweight runs that asked no blocking questions compress it to one forward-looking sentence; everything else gets the full synthesis and an explicit confirmation gate.

The Product Contract carries R-IDs (Requirements), A-IDs (Actors), F-IDs (Key Flows), and AE-IDs (Acceptance Examples). `ce-plan` traces every implementation unit and test scenario back to them. Scope boundaries flow through unchanged. Requirements describe expected behavior from the user's perspective, not libraries, schemas, endpoints, or file layouts, unless the brainstorm itself is about a technical decision. A decision you examined and chose during the dialogue lands as a labeled Key Decision and is not re-asked; `ce-plan` inherits the label.

On Standard and Deep software runs, a cheap scout gathers a grounding dossier (verbatim quotes with `file:line` pointers) while you answer the first question. Before the plan lands, a verifier that never saw the dialogue checks the Product Contract's repo claims. Refuted claims get corrected; unverifiable ones become explicit assumptions. The dossier path is handed to `ce-plan`.

### 6. Blindspot pass and non-software facilitation

When you flag unfamiliarity, or consecutive answers show you cannot weigh the options, the skill offers a blindspot pass before questioning that territory further: a map of 3-7 decisions and hazards, each with why it matters, the realistic options, and a recommended default. You pick which to walk through; the rest take defaults recorded as explicit assumptions. Works on both software and non-software routes.

Non-software work uses a domain-agnostic facilitator with the same one-question discipline. It does not write a software unified-plan artifact.

---

## Quick example

You start with "I want to add a way for users to pause notifications." The skill classifies the work as Standard and sends a background scout for repo evidence while you answer the first question.

The pressure test finds a specificity gap (who are these "users"?) and an attachment gap ("pause" is already a solution shape). It probes both as prose, one at a time. You name the actual pain: support gets pinged at 3 AM for non-urgent stuff.

Three approaches surface: per-notification-type mute with TTL, a global do-not-disturb schedule, mute on the rule rather than the channel. Tradeoffs and a recommendation follow. The synthesis reads back the shape ("per-channel mute on notification rules, 24h preset for the 3 AM support pings"), the trade-offs, what is deferred (presence-based mute, quiet-hours schedules), and a call-out about the rule-delete loss path. You confirm and add a 24h preset.

A requirements-only unified plan lands under `docs/plans/`. The Phase 4 menu then offers: create the implementation plan with `ce-plan` (recommended), ship autonomously with `lfg`, pressure-test the requirements or prototype a remaining feel-question, open the file if it is HTML, or keep asking clarifying questions.

---

## When to reach for it

Reach for `ce-brainstorm` when:

- A feature idea is partly formed and you cannot yet sketch the implementation
- A request has several valid solutions and you need to choose
- The scope is unclear ("add notifications": what kind, for whom, when)
- You want a structured artifact you can hand to another person or to planning
- You have to scope work in territory you do not know (the blindspot pass maps the decision surface first)
- The topic is not software (naming, events, roadmap choices)

Skip it when:

- You do not yet know what to work on → `/ce-ideate`
- Requirements are already specified (a PRD exists, the issue is detailed) → `/ce-plan`
- The request is whether to adopt a named external candidate → `/ce-pov`
- You have a known root cause for a bug → `/ce-debug`
- The change is already specified down to the files it touches → just do it, or `/ce-work`

---

## Use as part of the chained workflow

```text
/ce-ideate          (optional: discover candidate directions)
   |  picks one survivor and carries its basis, rationale, and tradeoffs
   v
/ce-brainstorm
   |  produces a requirements-only unified plan
   |  software: R-IDs, A-IDs, F-IDs, AE-IDs and scope boundaries
   |  non-software: chat synthesis, optional handoff to ce-plan
   v
/ce-plan
   |  enriches the same plan to implementation-ready
   |  R-IDs flow into Requirements; A/F/AE-IDs trace into units and tests
   v
/ce-work
```

When `ce-plan` loads a requirements-only unified plan, it does not re-litigate product behavior. The Product Contract is authoritative; plan-time decisions are about execution guardrails, not what is being built.

In a repo, acting on an ideate survivor always comes here, not to `ce-plan`. `ce-plan` wants a brainstorm-grounded Product Contract.

---

## Use standalone

Many teams skip `ce-ideate` because they already know what to explore. Some also stop here and treat the brainstorm as the thinking artifact, then plan later.

- Feature briefs: turn a vague idea into a stable artifact for stakeholders or new contributors
- Onboarding existing work: the feature is in flight but the rationale was never written down
- Pre-PR alignment: several people need to agree on scope before code starts
- Strategic decisions: Deep-product surfaces durability and adjacent-product risks
- Non-software: name a product, plan an event, decide a roadmap

There is no skip-to-`ce-work` from the Phase 4 menu; software next steps go through `ce-plan` or `lfg` (which plans first). If a related requirements-only plan already exists, the skill offers to resume it instead of starting a duplicate.

---

## Reference

| Argument | Effect |
|----------|--------|
| _(empty)_ | Asks what you would like to explore |
| `<feature idea>` | Open-ended brainstorm |
| `<problem>` | Routes through the product pressure test |
| Existing requirements-only plan path, legacy `*-requirements.md` path, or matching topic | Resume offer |
| Ideate survivor already in this conversation | Loads with that idea's tagged basis, rationale, and tradeoffs |
| Verdict-shaped prompt (`should we adopt X`) | Offers `ce-pov`; decline and the brainstorm continues |
| `output:html` | Write the plan as a single self-contained HTML file instead of markdown. Exclusive: the artifact is `.md` or `.html`, never both. Set `brainstorm_output: html` in CE config (`config.local.yaml` then `config.yaml`) to make HTML the default. Pipeline mode (LFG, `disable-model-invocation`) always forces markdown. See the [configuration reference](./configuration.md). |
| `use fable` / `have opus generate these` | Elevate only approach generation to that model. Also settable as `brainstorm_model: <model>` in CE config. A prompt request overrides the config key. |

---

## FAQ

**Why one question at a time? Isn't that slow?**
Stacking three questions per turn produces diluted answers. People pick the easy one and the rest get lost. One question per turn produces sharper answers and usually converges faster.

**Why does it pressure-test my premise? I just want to brainstorm.**
The gap lenses catch the usual ways feature briefs fail downstream. They fire only when the gap is actually present. A concrete, well-framed prompt can earn zero probes.

**Can I skip the requirements-only plan?**
Yes. If you only need brief alignment, the Lightweight tier ends in chat and no doc is written. The `lfg` menu option is hidden when there is no artifact, because `lfg` cannot prompt for the missing file.

**What does "Inferred" mean in the synthesis?**
The agent composes an internal three-bucket draft (Stated / Inferred / Out of scope) before presenting the synthesis. Inferred items are bets that fill dialogue gaps. Those that survive the keep test surface as call-outs; the rest dissolve into the Product Contract when you confirm.

**Can I go straight to `ce-work` from here?**
Not from the Phase 4 menu. Software next steps are `ce-plan` or `lfg` (which plans first). Skip-to-build is not offered, even for Lightweight scope.

---

## Model elevation

When you want a specific model for the heavy reasoning step, `ce-brainstorm` can generate approaches on that model instead of your session model. Only approach generation is dispatched, with read access so it can verify its brief; the rest of the skill stays on your session model. Name a model in the prompt (`use fable`, `have opus generate these`), or set `brainstorm_model: <model>` in CE config.

This works on any harness. The host serves the chosen model natively where it can, otherwise it invokes the Claude CLI (which must be installed and authenticated), otherwise it runs the step on your session model and says which precondition was unmet.

---

## See Also

- [`ce-ideate`](./ce-ideate.md): upstream "what's worth exploring" discovery; survivors arrive here with a tagged basis
- [`ce-pov`](./ce-pov.md): a decisive verdict on a named external candidate, not a new scope
- [`ce-plan`](./ce-plan.md): enrich the requirements-only unified plan into an implementation-ready plan
- [`ce-doc-review`](./ce-doc-review.md): persona-based review of the Product Contract in markdown or HTML
- [`ce-prototype`](./ce-prototype.md): decide how something should work or feel before committing an approach
- [`ce-strategy`](./ce-strategy.md): anchor brainstorms to a documented product strategy
- [`lfg`](./lfg.md): autonomous plan-then-ship from a requirements-only artifact
- [`ce-proof`](./ce-proof.md): publish a non-software summary (or any markdown file you ask to share)
