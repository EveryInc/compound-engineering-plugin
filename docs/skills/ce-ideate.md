# `ce-ideate`

> Discover strong, qualified directions worth exploring — across any domain — and let the rest fall away.

`ce-ideate` is the upstream **discovery** skill. It's where you reach when you don't yet have a specific idea — when the question is "which directions even matter here?" rather than "let me refine the one I already have." It does the homework first (parallel grounding agents pull from your codebase, past learnings, **external prior art on the open web**, and optionally Slack and your issue tracker), generates candidates from six different conceptual frames, requires a tagged **warrant** for every idea, and presents only the survivors of an adversarial critique — with explicit reasons for what was rejected.

It runs equally well on software topics, product topics, and entirely non-software topics — naming, narrative, personal decisions, weekend trips, business strategy. The same generate-critique-survive engine; the same warrant requirement; the same anti-slop discipline.

This is the first step in the compound-engineering ideation chain:

```text
/ce-ideate         /ce-brainstorm      /ce-plan             /ce-work
"What's worth      "What does this     "What's needed       "Build it."
 exploring?"        need to be?"        to accomplish
                                        this?"
```

The chain works across domains — every step supports universal mode. `ce-ideate` is the upstream "find the strong candidates" step, but it's a complete cycle on its own.

---

## TL;DR

| Question | Answer |
|----------|--------|
| What does it do? | Grounds in real material, generates candidates across six conceptual frames, critiques them adversarially, presents 5-7 survivors — each with a tagged warrant |
| When to use it | Greenfield exploration, big-picture thinking, codebase audits, surprise-me runs, naming, decisions, business strategy — any domain where you want a qualified candidate set rather than a refined idea |
| What it produces | Ranked ideation artifact in `docs/ideation/` (or to Proof for non-software topics) |
| What's next | `/ce-brainstorm` on a chosen survivor — or save and walk away |

---

## The Problem

Asking an AI "what's worth exploring here?" usually returns:

- Plausible-sounding bullets with no grounding in the actual subject
- The first three obvious frames and nothing surprising
- A flat list with no signal about which directions are strong vs filler
- No record of what was considered and rejected
- No way to audit the basis — every claim sounds confident, none cite evidence

## The Solution

`ce-ideate` separates **grounding**, **generation**, **critique**, and **selection** as discrete phases — and the quality mechanism is **explicit rejection with reasons**, not optimistic ranking.

- Grounding agents do the homework first — codebase scan, past learnings, external prior art, optional Slack and issue intelligence
- Six parallel ideation sub-agents work from different conceptual frames
- Every idea must carry a tagged **warrant** — direct evidence, named external prior art, or a written-out first-principles argument
- Ideas without warrant are rejected; the failure mode being prevented is "AI slop"
- Survivors are scored against a consistent rubric and presented with downsides and confidence
- A rejection summary shows what was considered and cut

---

## What Makes It Novel

### 1. Comprehensive grounding before any idea is generated

Every run starts with parallel grounding agents that supply the substance ideas will be qualified against — codebase scan (in repo mode), past institutional learnings from `docs/solutions/`, external prior art via web research, and optional Slack and issue intelligence when those tools are available. **External prior art is critical**: without it, the agent is just remixing what's already in your codebase or your head. With it, ideas can cite "this is how X solved this" — concrete, verifiable, named precedent.

### 2. Warrant requirement — every idea cites its basis

Each surviving candidate carries a tagged warrant: `direct:` (quoted evidence), `external:` (named prior art), or `reasoned:` (written-out first-principles argument, not a gesture). Speculation that sounds plausible but has no basis is rejected. **Comprehensive grounding + warrant requirement is the dual anti-slop mechanism.** One without the other is weaker: grounding without warrant gives well-informed speculation; warrant without grounding gives clever-sounding rationalization.

### 3. Six-frame divergent generation

Six parallel sub-agents, each biased toward a different generative frame: pain & friction, inversion/removal/automation, assumption-breaking, leverage & compounding, cross-domain analogy, and constraint-flipping. Single-prompt ideation collapses into the agent's most-trained directions — different frames force genuine breadth, especially cross-domain analogy and constraint-flipping which surface ideas no single prompt would.

### 4. Adversarial filtering with stated rejection reasons

The orchestrator critiques every candidate against a consistent rubric — groundedness, warrant strength, expected value, novelty, pragmatism, leverage, implementation burden, overlap. One-line reasons accompany every rejection. Survivors are presented alongside a rejection summary so you see what was considered and cut.

### 5. Three modes — software, software-product, and entirely non-software

The same generate-critique-survive mechanism runs across very different topic domains: things in your codebase, software products outside your repo (pages, apps, flows), or topics with no software surface at all (naming, narrative, personal decisions, business strategy). In non-software mode, a domain-agnostic facilitator takes over — same six frames, same warrant requirement, same critique, but in domain-native language.

### 6. Surprise-me mode — no subject required

`/ce-ideate "surprise me"` skips the subject step entirely. Sub-agents discover their own subjects from grounding material. Different frames finding different subjects is the feature, not a bug — cross-cutting combinations across discovered subjects often produce the strongest ideas.

### 7. Issue-tracker intent

Phrases like "what users are reporting" or "biggest issue patterns" trigger an issue-intelligence agent that pulls real GitHub issues and feeds clustered themes into the ideation frames.

---

## Quick Example

You invoke `ce-ideate "DX improvements"` from inside a code repo. The agent announces it'll dispatch ~9 grounding and ideation agents and offers skip phrases for cost control.

Grounding agents return in parallel — a codebase summary, relevant past learnings, external prior art on developer-experience patterns. Six ideation sub-agents then generate candidates from different frames. The orchestrator merges 40+ candidates into one list, synthesizes cross-cutting combinations, and runs the adversarial critique pass — about 13 ideas are cut for being too vague, unjustified, or duplicative.

You see six survivors. Each has a tagged warrant (e.g., "tests/cli.test.ts:42 spawns 14 different bash invocations"), a rationale connecting that warrant to the move's significance, downsides, confidence, and complexity. A rejection summary lists what was cut and why. Then a four-option menu: refine in conversation, open in Proof, brainstorm a chosen survivor, or save and end.

---

## When to Reach For It

Reach for `ce-ideate` when:

- You don't yet have a specific idea — you want strong, qualified candidates rather than to refine one
- The thinking is greenfield or big-picture
- You want a focus area explored without committing to a direction yet
- You want a surprising direction (`surprise me`)
- You want to mine your issue tracker for patterns
- The topic is non-software entirely

Skip `ce-ideate` when:

- You already have a specific feature or decision in mind → `/ce-brainstorm`
- Requirements are ready and you need execution guardrails → `/ce-plan`
- You're debugging a known bug → `/ce-debug`

---

## Use as Part of the Chained Workflow

```text
/ce-ideate            "What's worth exploring?"
   |
   |   chosen survivor (with warrant + rationale)
   v
/ce-brainstorm        "What does this need to be?"
   |
   |   requirements / brief (R-IDs, A-IDs, F-IDs, AE-IDs in software mode)
   v
/ce-plan              "What's needed to accomplish this?"
   |
   |   structured plan (U-IDs, files, test scenarios — guardrails, not code)
   v
/ce-work              "Build it."
```

Each artifact is structured input for the next: the survivor's warrant carries forward as the brainstorm's evidence base; the brainstorm's decisions flow into the plan's requirements and scope; the plan's U-IDs and test scenarios become the guardrails `ce-work` executes against. When you select "Brainstorm a chosen idea" in the Phase 4 menu, the survivor is saved (with status `Explored`) and `ce-brainstorm` loads with that idea as the seed.

The chain runs in non-software domains too — ideating on weekend-trip directions feeds a brainstorm that defines the trip, which feeds a plan that structures bookings, packing, and itinerary as guardrails.

---

## Use Standalone

`ce-ideate` is a complete ideation cycle on its own. The terminal review loop produces a usable idea set with reasons; persistence is opt-in.

**Software:**

- **Codebase audits** — `/ce-ideate "what to improve in this repo"` (pair with `STRATEGY.md` for strategy-aligned weighting)
- **Issue triage** — `/ce-ideate "biggest issue themes in the last quarter"`
- **Pricing or positioning ideation** — `/ce-ideate "pricing page A/B test ideas"`
- **Surprise-me runs on any subject** — `/ce-ideate "surprise me"` from inside any repo

**Non-software:**

- **Naming** — coffee shops, baby names, products, brands
- **Personal decisions** — career options, sabbatical destinations
- **Plot or narrative ideation** — short story directions, character beats
- **Business strategy** — go-to-market, positioning against a competitor
- **Travel and events** — trip themes, wedding-venue concepts

Refining without persisting is fully supported — pick "Refine in conversation" and stop the chat when you're done. Nothing is written.

---

## Reference

| Argument | Effect |
|----------|--------|
| _(empty)_ | Open-ended; asks for a subject or routes to surprise-me |
| `<concept>` | e.g., `DX improvements`, `auth quality` |
| `<path>` | a directory or file to focus on |
| `<constraint>` | e.g., `low-complexity quick wins`, `polish-only` |
| `surprise me` | Surprise-me mode |
| `top issue themes in <area>` | Triggers issue-tracker intent |

Skip phrases supported anywhere in the prompt: `no external research`, `no slack`.

---

## FAQ

**Why six frames? Why not just one "give me ideas" prompt?**
Single-prompt ideation collapses into the agent's most-trained directions. Different frames force genuine breadth — cross-domain analogy and constraint-flipping in particular surface ideas no single prompt would.

**Why warrant? Isn't this just AI hand-waving?**
Without warrant, plausible-sounding ideas with no basis pass through unfiltered. The warrant requirement means every survivor cites real evidence, real prior art, or a written-out argument. You can audit the basis.

**Does it really work for non-software topics?**
Yes. The same generate-critique-survive engine runs in domain-native language for naming, narrative, personal decisions, and business strategy. Codebase grounding is replaced by user-context synthesis and external research.

**What if I just want to refine ideas in conversation, not save?**
Pick "Refine the ideation in conversation" in the Phase 4 menu. The terminal review loop is a complete cycle. Persistence is opt-in.

**What if my prompt is ambiguous?**
A subject-identification gate asks one scope question when the prompt refers only to a quality (`improvements`, `quick wins`) rather than a specific thing. "Surprise me" is offered as a real option, not a fallback.

---

## See Also

- [`ce-brainstorm`](./ce-brainstorm.md) — once you've picked a survivor, brainstorm the chosen direction into a requirements doc
- [`ce-plan`](./ce-plan.md) — once requirements are clear, plan the implementation
- [`ce-strategy`](./ce-strategy.md) — anchor ideation to a documented product strategy
- [`ce-doc-review`](./ce-doc-review.md) — review the saved ideation artifact for clarity and completeness
- [`ce-proof`](./ce-proof.md) — open the artifact in Proof for collaborative iteration
