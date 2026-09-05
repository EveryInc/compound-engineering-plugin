# `ce-ideate`

> When you don't have an idea yet, get a ranked set of grounded directions you can pick from, discuss, or discard.

`ce-ideate` is the optional discovery step. Use it when the question is "which directions are worth exploring?" rather than "help me refine this one I already have." It grounds first (the repo, past learnings, prior art on the web, and optionally Slack or your issue tracker), generates candidates from six thinking frames, and keeps only the ones that survive an adversarial cut. Every survivor cites a basis you can check. Rejected ideas come with reasons.

It works on software in this repo, on a product outside the repo, and on topics with no software at all: names, narrative, personal decisions, business strategy. The generate-then-critique engine and the basis rule stay the same.

This is the first step in the compound-engineering ideation chain. Skip it when you already know what to explore:

```text
/ce-ideate         /ce-brainstorm      /ce-plan             /ce-work
"What's worth      "What does this     "What's needed       "Build it."
 exploring?"        need to be?"        to accomplish
                                        this?"
```

Acting on a survivor goes to `ce-brainstorm`. In a repo, don't skip from ideation to `ce-plan`. Outside a software build, the saved idea set can be the end of the run.

If the options are already on the table and you need a verdict, use `ce-pov` instead.

---

## TL;DR

| Question | Answer |
|----------|--------|
| What does it do? | Grounds in real material, splits the topic into axes, generates candidates across six frames, critiques them all, and presents 5-7 survivors, each with a cited basis |
| When to use it | You don't have a specific idea yet: greenfield, a codebase audit, issue-tracker mining, surprise-me, naming, a decision, a strategy question |
| What it produces | A ranked ideation file, HTML by default. `output:md` writes markdown. Lands in `docs/ideation/` when that tree exists, otherwise a temp path under `/tmp/compound-engineering-<effective-uid>/` |
| What's next | `ce-brainstorm` on one survivor, stay here and discuss or refine the set, or keep the file and stop |

---

## Example invocations

```text
# Generate grounded product or codebase opportunities
/ce-ideate what should we improve in this repository?

# Focus ideation on a specific product surface
/ce-ideate onboarding improvements for new team administrators

# Find solution opportunities across patterns in open GitHub issues
/ce-ideate what product opportunities do you see across our open GitHub issues?

# Ideate from the open work in an accessible Linear project
/ce-ideate find solution opportunities across https://linear.app/acme/project/customer-onboarding-1234

# Ask for non-obvious directions without naming a subject
/ce-ideate surprise me

# Use the same engine for non-software ideation
/ce-ideate names for a neighborhood coffee shop

# Ask for Markdown instead of the default self-contained HTML artifact
/ce-ideate developer experience improvements, and write the artifact in Markdown

# Equivalent shorthand when a repeatable automation needs it
/ce-ideate developer experience improvements output:md
```

---

## Why not just ask the model for ideas?

Because one "give me ideas" prompt returns plausible bullets with no grounding in the actual subject, drawn from the model's most-trained directions, ranked by nothing, with no record of what was considered and cut. `ce-ideate` separates grounding, generation, critique, and selection, and gets its quality from explicit rejection with reasons.

- Grounding agents go first: codebase scan (in a repo), past learnings, web prior art, optional Slack and issue intelligence
- The topic splits into 3-5 axes from that grounding: what to cover, separate from how to think
- Six frames generate in parallel, each spreading ideas across those axes
- Every idea carries a tagged basis: `direct:`, `external:`, or `reasoned:`
- Ideas without a basis are dropped
- Survivors are scored and shown with downsides and confidence
- A rejection summary shows what was cut and why

---

## How it works

### Grounding before any idea is generated

Every run starts with parallel grounding: the codebase (in repo mode), `docs/solutions/`, web prior art, and optional Slack or issue intelligence. In a repo, cheap evidence scouts then pull verbatim quotes with `file:line` pointers so later ideas cite real code. The web pass is what stops the run from remixing only what's already in the repo or in your head.

You can also point the prompt at your own research (a survey export, an analytics dump, a social-listening report). A cheap agent distills it into a citable dossier. It adds sources web research can't reach; it doesn't replace the web pass.

### Every idea cites its evidence

Each survivor carries one tagged basis:

- `direct:` quoted evidence
- `external:` named prior art
- `reasoned:` a written-out first-principles argument, not a gesture

Plausible speculation with no basis is rejected. Grounding without a basis is well-informed speculation; a basis without grounding is clever-sounding rationalization. The skill requires both.

### Six frames, then a cut

The frames are pain and friction; inversion, removal, or automation; assumption-breaking; leverage and compounding; cross-domain analogy; and constraint-flipping. Separate frames, especially analogy and constraint-flipping, produce a wider set than one prompt would.

Default software and product runs use five agents to cover all six frames. `go deep` puts the whole fleet on the conversation's top-tier model, doubles verification, and adds a second critic. A tactical ask (`quick wins`, `polish`, `cleanup`) keeps every frame and shrinks volume: fewer ideas per frame, fewer verification reads, at most 3 axes. Issue-tracker runs replace the six frames with the tracker's highest-leverage themes (up to four) when the scan returns usable themes.

Critique runs in two layers. A verifier that never saw generation tries to refute each candidate: do the quotes exist, is the prior art real, does the argument hold? Then the orchestrator makes the final cut. Every rejection gets a one-line reason.

### Axes so six frames don't all land on the same slice

Frames decide how to think; axes decide what part of the topic to think on. Before dispatch, the orchestrator derives 3-5 orthogonal axes from grounding. For social sharing those might be send, discovery, arrival, compounding, and actor types. Each frame spreads ideas across them, and if an axis ends up with zero ideas, one bounded recovery dispatch fills it. Atomic topics (a name, a tagline) and surprise-me runs skip this.

### Three modes, plus surprise-me and the issue tracker

The same engine runs on things in this codebase, a software product outside this repo, or a topic with no software at all.

Non-software mode uses a facilitator in the topic's own language. Same six frames, same basis rule, same critique. Depth is Quick (3-5 survivors, one inline round), Standard (5-7, still inline), or Full (5-7, frames dispatched as agents). `ce-brainstorm` on a non-software survivor develops that idea further (a name into a brand brief, a plot into an outline); it is not the first step of a build chain.

`/ce-ideate surprise me` skips naming a subject. Each frame picks its own from the grounding, and combinations across those subjects are expected.

Phrases like "what users are reporting" or "biggest issue patterns" start an issue-intelligence pass against GitHub, Linear, or Jira, whichever is reachable. Large trackers are scoped by the tracker's own structure. The skill asks at most one question, and only when the tracker is genuinely split. It says what it did and did not analyze.

---

## Quick example

You invoke `ce-ideate "DX improvements"` from inside a repo. The agent names the grounding and ideation agents it will dispatch and lists the skip phrases (`no external research`, `no slack`).

Grounding returns a codebase summary, relevant learnings, and prior art on developer-experience patterns. The orchestrator splits the topic into axes (feedback loops, environment friction, tooling, knowledge access, automation), then scouts gather a quote-and-pointer dossier per axis. Five agents covering six frames generate candidates from that evidence. The orchestrator merges the list, synthesizes combinations, checks axis coverage, and runs the two-layer critique.

A default run generates on the order of 36-48 raw ideas and keeps 5-7. The session summary looks like `Wrote 7 ranked ideas (36 raw, 13 cut) across 5 axes`.

The full cards (basis, rationale, downsides, confidence, complexity) plus the rejection summary land in a self-contained HTML file that opens in the browser. The session shows a one-line count, a ranked one-liner per survivor, and the path. Then a four-option menu:

1. Open in browser (or Publish to Proof on a markdown run)
2. Brainstorm one idea with `ce-brainstorm`
3. Discuss or refine the ideas first
4. Done: keep the file and stop

Say `discard` if you don't want a file kept this run. Discard does not delete a resumed existing doc.

---

## When to reach for it

Reach for `ce-ideate` when:

- You don't have a specific idea yet and want a qualified candidate set
- The thinking is greenfield or big-picture
- You want a focus area explored without committing to a direction
- You want a surprising direction (`surprise me`)
- You want to mine the issue tracker for patterns
- The topic is not software at all

Skip `ce-ideate` when:

- You already have a specific feature or decision in mind → `/ce-brainstorm`
- The options are already on the table and you need a verdict → `/ce-pov`
- Requirements are ready and you need execution guardrails → `/ce-plan`
- You're debugging a known bug → `/ce-debug`

---

## Use as part of the chained workflow

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
   |   structured plan (U-IDs, files, test scenarios: guardrails, not code)
   v
/ce-work              "Build it."
```

Each artifact feeds the next. The survivor's basis seeds the brainstorm's evidence; the brainstorm's decisions become the plan's requirements and scope; the plan's U-IDs and test scenarios are what `ce-work` executes against. When you pick "Brainstorm one idea," `ce-brainstorm` loads with that idea's basis, rationale, and tradeoffs. The ideation file is already saved.

In a repo, acting on an idea always goes to `ce-brainstorm`, not `ce-plan`. `ce-plan` wants a brainstorm-grounded Product Contract.

The chain works outside software too: weekend-trip directions feed a brainstorm that defines the trip, which can feed a plan that structures bookings, packing, and itinerary. In that mode brainstorming is optional deeper development, not a required next rung.

---

## Use standalone

`ce-ideate` is a complete ideation cycle on its own: a ranked, reasoned idea set saved as a file you can open, share, brainstorm from, or discard.

**Software:**

- Codebase audits: `/ce-ideate "what to improve in this repo"` (pair with `STRATEGY.md` for strategy-aligned weighting)
- Issue triage: `/ce-ideate "biggest issue themes in the last quarter"`
- Pricing or positioning: `/ce-ideate "pricing page A/B test ideas"`
- Surprise-me runs: `/ce-ideate "surprise me"` from inside any repo

**Non-software:**

- Naming: coffee shops, baby names, products, brands
- Personal decisions: career options, sabbatical destinations
- Plot or narrative ideation: short story directions, character beats
- Business strategy: go-to-market, positioning against a competitor
- Travel and events: trip themes, wedding-venue concepts

The file is written every run. Say `discard` to delete a file created this run. If a related ideation file from the last 30 days exists, the skill offers to resume it instead of starting a duplicate.

---

## Reference

| Argument | Effect |
|----------|--------|
| _(empty)_ | Open-ended; asks for a subject or routes to surprise-me |
| `<concept>` | e.g., `DX improvements`, `auth quality` |
| `<path>` | a directory or file to focus on |
| `<constraint>` | e.g., `low-complexity quick wins`, `polish-only` |
| `surprise me` | Surprise-me mode |
| `go deep` | Maximum depth: every ideation agent on the top-tier model, doubled verification, a second critic |
| `top issue themes in <area>` | Triggers issue-tracker intent |
| `top 3` / `100 ideas` / `raise the bar` | Volume override: survivor count, raw total, or a higher bar |
| `output:md` | Write the artifact as markdown instead of the default self-contained HTML (`output:html` forces HTML). Also settable per-project via `ideate_output` in CE config (`config.local.yaml` then `config.yaml`); see the [configuration reference](./configuration.md). Pipeline and `disable-model-invocation` runs force markdown. |

Skip phrases supported anywhere in the prompt: `no external research`, `no slack`.

---

## FAQ

**Why a basis requirement?**
Without one, plausible-sounding ideas pass through unfiltered. Every survivor cites real evidence, real prior art, or a written-out argument, so you can audit it.

**Can I go straight to `ce-plan` from a survivor?**
Not from inside a repo. Acting on an idea loads `ce-brainstorm` with a substance seed; `ce-plan` wants a brainstorm-grounded Product Contract. Outside a software build, the saved idea set can be the end of the run, and brainstorming there is optional deeper development of one idea.

**What if I want to talk through the ideas before committing to a brainstorm?**
Pick "Discuss or refine the ideas first." Stay in `ce-ideate` and work across the set: adjust or interrogate one idea, compare several, or combine them. Adjustments and merges update the saved file; pure Q&A and comparison do not. The file is written automatically, so if you didn't want a new one kept, say `discard`.

**What if my prompt is ambiguous?**
A subject-identification gate asks one scope question when the prompt names only a quality (`improvements`, `quick wins`) rather than a specific thing. "Surprise me" is a real option, not a fallback.

---

## See also

- [`ce-brainstorm`](./ce-brainstorm.md): once you've picked a survivor, brainstorm the chosen direction into a requirements-only unified plan
- [`ce-pov`](./ce-pov.md): when the options are already known and you need a verdict, not a new candidate set
- [`ce-plan`](./ce-plan.md): once requirements are clear, plan the implementation
- [`ce-strategy`](./ce-strategy.md): anchor ideation to a documented product strategy
- [`ce-doc-review`](./ce-doc-review.md): review a saved markdown or HTML planning artifact for clarity and completeness
- [`ce-proof`](./ce-proof.md): publish the artifact to Proof for a shareable link (markdown output only; Proof can't ingest HTML)
