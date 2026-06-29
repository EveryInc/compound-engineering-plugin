# `ce-ideate`

> Discover strong, qualified directions worth exploring — across any domain — and let the rest fall away.

`ce-ideate` is the upstream **discovery** skill. It's where you reach when you don't yet have a specific idea — when the question is "which directions even matter here?" rather than "let me refine the one I already have." It does the homework first (parallel grounding agents pull from your codebase, past learnings, **external prior art on the open web**, and optionally Slack and your issue tracker), generates candidates from six different conceptual frames, requires a tagged **basis** for every idea, and presents only the survivors of an adversarial critique — with explicit reasons for what was rejected.

It runs equally well on software topics, product topics, and entirely non-software topics — naming, narrative, personal decisions, weekend trips, business strategy. The same generate-critique-survive engine; the same basis requirement; the same anti-slop discipline.

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
| What does it do? | Grounds in real material, decomposes the topic into orthogonal axes, generates candidates across six conceptual frames spread over those axes, critiques them adversarially, presents 5-7 survivors — each with a tagged basis |
| When to use it | Greenfield exploration, big-picture thinking, codebase audits, surprise-me runs, naming, decisions, business strategy — any domain where you want a qualified candidate set rather than a refined idea |
| What it produces | Ranked ideation artifact written as a single self-contained HTML file by default (humans are the audience — rich, openable in a browser); pass `output:md` for markdown. Written automatically to `docs/ideation/` when present, else an announced temp path under `/tmp/compound-engineering/` |
| What's next | `/ce-brainstorm` on a chosen survivor, iterate on one first, or just keep the saved file |

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
- The topic is decomposed into 3-5 orthogonal axes derived from grounding — *what aspects of the subject* sub-agents must cover, distinct from *how they think about it*
- Six parallel ideation sub-agents work from different conceptual frames, each spreading ideas across the axes
- Every idea must carry a tagged **basis** — direct evidence, named external prior art, or a written-out first-principles argument
- Ideas without a basis are rejected; the failure mode being prevented is "AI slop"
- Survivors are scored against a consistent rubric and presented with downsides and confidence
- A rejection summary shows what was considered and cut

---

## What Makes It Novel

### 1. Comprehensive grounding before any idea is generated

Every run starts with parallel grounding agents that supply the substance ideas will be qualified against — codebase scan (in repo mode), past institutional learnings from `docs/solutions/`, external prior art via web research, and optional Slack and issue intelligence when those tools are available. In repo mode, cheap **evidence scouts** then deepen the grounding: one per topic axis, each returning a dossier of verbatim quotes and `file:line` pointers, so ideation agents cite real code rather than a paraphrased summary. **External prior art is critical**: without it, the agent is just remixing what's already in your codebase or your head. With it, ideas can cite "this is how X solved this" — concrete, verifiable, named precedent. You can also hand the run your own research: point the prompt at a research artifact (a social-listening report, survey export, analytics dump) and a cheap agent distills it into a citable evidence dossier — enriching web research with source classes it doesn't reach, not replacing it.

### 2. Basis requirement — every idea cites its evidence

Each surviving candidate carries a tagged basis: `direct:` (quoted evidence), `external:` (named prior art), or `reasoned:` (written-out first-principles argument, not a gesture). Speculation that sounds plausible but has no basis is rejected. **Comprehensive grounding + basis requirement is the dual anti-slop mechanism.** One without the other is weaker: grounding without a basis gives well-informed speculation; a basis without grounding gives clever-sounding rationalization.

### 3. Six-frame divergent generation

Parallel sub-agents cover six generative frames: pain & friction, inversion/removal/automation, assumption-breaking, leverage & compounding, cross-domain analogy, and constraint-flipping. Single-prompt ideation collapses into the agent's most-trained directions — different frames force genuine breadth, especially cross-domain analogy and constraint-flipping which surface ideas no single prompt would. The fleet is **cost-tiered**: evidence-driven frames run on a mid-tier model (the dossiers do the heavy lifting), while the ceiling frames — where the strong model's reasoning is the product — inherit the conversation's model. Say `go deep` to raise the whole fleet to the top tier.

### 4. Topic-surface decomposition — axis coverage as a dispatch invariant

Frames decide *how to think* about a topic; **axes** decide *what part of the topic to think on*. Before frame dispatch, the orchestrator decomposes the topic into 3-5 orthogonal axes derived from grounding (e.g., for "social sharing" — send, discovery, arrival, compounding, actor types). Each frame is then instructed to spread its ideas across axes, and an axis-coverage check after generation catches blind spots — if any axis has zero ideas, a bounded recovery dispatch fills it. The failure mode this prevents: six lenses converging on the most salient interpretation of a topic and missing the rest of its surface entirely. Atomic topics (a name, a tagline) and surprise-me runs skip decomposition cleanly.

### 5. Adversarial filtering with stated rejection reasons

Critique runs in two layers. A **fresh-context verifier** — an agent that never saw the generation — tries to refute each candidate: do cited quotes actually exist, is the named prior art real, does the argument hold? Then the orchestrator arbitrates the final cut against a consistent rubric — groundedness, basis strength, expected value, novelty, pragmatism, leverage, implementation burden, overlap. One-line reasons accompany every rejection. Survivors are presented alongside a rejection summary so you see what was considered and cut.

### 6. Three modes — software, software-product, and entirely non-software

The same generate-critique-survive mechanism runs across very different topic domains: things in your codebase, software products outside your repo (pages, apps, flows), or topics with no software surface at all (naming, narrative, personal decisions, business strategy). In non-software mode, a domain-agnostic facilitator takes over — same six frames, same basis requirement, same critique, but in domain-native language.

### 7. Surprise-me mode — no subject required

`/ce-ideate "surprise me"` skips the subject step entirely. Sub-agents discover their own subjects from grounding material. Different frames finding different subjects is the feature, not a bug — cross-cutting combinations across discovered subjects often produce the strongest ideas.

### 8. Issue-tracker intent

Phrases like "what users are reporting" or "biggest issue patterns" trigger an issue-intelligence agent that pulls real GitHub issues and feeds clustered themes into the ideation frames.

---

## Quick Example

You invoke `ce-ideate "DX improvements"` from inside a code repo. The agent announces it'll dispatch ~13 agents — most on cheap tiers — and offers skip phrases for cost control.

Grounding agents return in parallel — a codebase summary, relevant past learnings, external prior art on developer-experience patterns. The orchestrator decomposes the topic into 4-5 axes derived from that grounding (e.g., for "DX improvements" — feedback loops, environment friction, tooling ergonomics, knowledge accessibility, automation surface), then cheap evidence scouts gather a quote-and-pointer dossier per axis. Five ideation sub-agents covering six frames generate candidates from that evidence, each idea tagged with the axis it targets and verified against the actual files before submission. The orchestrator merges 40+ candidates into one list, synthesizes cross-cutting combinations, runs an axis-coverage check (any empty axis triggers one bounded recovery dispatch), and runs the two-layer critique pass — a fresh-context verifier tries to refute each candidate, then the orchestrator makes the final cut. About 13 ideas are cut for being too vague, unjustified, refuted, or duplicative.

The full deliverable — all seven cards with basis, rationale, downsides, confidence, complexity, plus the rejection summary — is written automatically to a self-contained HTML file and opened in your browser; the session itself shows just a concise ranked summary and the path, so you read the rich version, not a wall of terminal text. Then a four-option next-steps menu: open it in the browser, brainstorm one idea with `ce-brainstorm`, iterate on one idea (adjust or ask, staying here), or done. (Markdown runs swap "open in browser" for "publish to Proof".)

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
   |   chosen survivor (with basis + rationale)
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

Each artifact is structured input for the next: the survivor's basis carries forward as the brainstorm's evidence base; the brainstorm's decisions flow into the plan's requirements and scope; the plan's U-IDs and test scenarios become the guardrails `ce-work` executes against. When you pick "Brainstorm one idea" in the next-steps menu, `ce-brainstorm` loads with that idea as a substance seed (its basis, rationale, and tradeoffs) — the ideation file is already saved.

The chain runs in non-software domains too — ideating on weekend-trip directions feeds a brainstorm that defines the trip, which feeds a plan that structures bookings, packing, and itinerary as guardrails.

---

## Use Standalone

`ce-ideate` is a complete ideation cycle on its own — it produces a ranked, reasoned idea set as a saved file you can open, share, brainstorm from, or discard.

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

The deliverable is written automatically — you don't have to ask. If a run was purely exploratory and you don't want it kept, say "discard" and the file is deleted.

---

## Reference

| Argument | Effect |
|----------|--------|
| _(empty)_ | Open-ended; asks for a subject or routes to surprise-me |
| `<concept>` | e.g., `DX improvements`, `auth quality` |
| `<path>` | a directory or file to focus on |
| `<constraint>` | e.g., `low-complexity quick wins`, `polish-only` |
| `surprise me` | Surprise-me mode |
| `go deep` | Maximum depth: every ideation agent runs on the top-tier model, verification budgets double, and a second critic joins the filtering pass |
| `top issue themes in <area>` | Triggers issue-tracker intent |
| `output:md` | Write the artifact as markdown instead of the default self-contained HTML (`output:html` forces HTML explicitly). Also settable per-project via `ideate_output` in `.compound-engineering/config.local.yaml` |

Skip phrases supported anywhere in the prompt: `no external research`, `no slack`.

---

## FAQ

**Why six frames? Why not just one "give me ideas" prompt?**
Single-prompt ideation collapses into the agent's most-trained directions. Different frames force genuine breadth — cross-domain analogy and constraint-flipping in particular surface ideas no single prompt would.

**Why a basis requirement? Isn't this just AI hand-waving?**
Without a basis, plausible-sounding ideas pass through unfiltered. The basis requirement means every survivor cites real evidence, real prior art, or a written-out argument. You can audit it.

**Does it really work for non-software topics?**
Yes. The same generate-critique-survive engine runs in domain-native language for naming, narrative, personal decisions, and business strategy. Codebase grounding is replaced by user-context synthesis and external research.

**What if I want to tweak or talk through the ideas before committing to a brainstorm?**
Pick "Discuss or refine the ideas first" — stay in ce-ideate to work across the set: adjust or interrogate one idea, compare several, or combine/merge them. Adjustments and merges update the saved file; pure Q&A and comparison don't. The file is written automatically, so if you didn't want it kept, just say "discard".

**What if my prompt is ambiguous?**
A subject-identification gate asks one scope question when the prompt refers only to a quality (`improvements`, `quick wins`) rather than a specific thing. "Surprise me" is offered as a real option, not a fallback.

---

## See Also

- [`ce-brainstorm`](./ce-brainstorm.md) — once you've picked a survivor, brainstorm the chosen direction into a requirements-only unified plan
- [`ce-plan`](./ce-plan.md) — once requirements are clear, plan the implementation
- [`ce-strategy`](./ce-strategy.md) — anchor ideation to a documented product strategy
- [`ce-doc-review`](./ce-doc-review.md) — review the saved ideation artifact for clarity and completeness (markdown output only — run with `output:md` first)
- [`ce-proof`](./ce-proof.md) — publish the artifact to Proof for a shareable link (markdown output only — Proof can't ingest HTML)
