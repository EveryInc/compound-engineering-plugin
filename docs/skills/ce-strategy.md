# `ce-strategy`

> Create or maintain `STRATEGY.md` — a short, durable anchor that captures what the product is, who it serves, how it succeeds, and where the team is investing.

`ce-strategy` is the **upstream anchor** skill. It produces and maintains a single canonical document at the repo root (peer of `README.md`) that downstream skills read as grounding. The document is short and structured on purpose — good answers to a handful of sharp questions produce a better strategy than any amount of prose. This skill asks those questions, pushes back on weak answers, and writes the doc.

The compound-engineering ideation chain is `/ce-ideate → /ce-brainstorm → /ce-plan → /ce-work`. `STRATEGY.md` sits **upstream of the chain** — `ce-ideate`, `ce-brainstorm`, and `ce-plan` all read it as grounding when it exists, weighting their suggestions toward the active tracks and stated approach. `ce-product-pulse` also reads it to seed the metrics that get measured.

---

## TL;DR

| Question | Answer |
|----------|--------|
| What does it do? | Runs an interview with pushback rules, then writes/updates `STRATEGY.md` at the repo root |
| When to use it | Starting a new product; updating direction; "what are we working on?"; before kicking off ideation if no strategy exists yet |
| What it produces | `STRATEGY.md` with target problem, approach, persona, key metrics, tracks, optional milestones / non-goals / marketing |
| What's next | `/ce-ideate`, `/ce-brainstorm`, `/ce-plan`, or `/ce-product-pulse` — all consult the doc as grounding |

---

## The Problem

Most teams either don't have a strategy doc, or have one that's so long nobody reads it. Failure shapes:

- **Missing entirely** — every new piece of work re-litigates "are we even working on the right thing?"
- **Slogan, not strategy** — "we delight users" tells the agent (and humans) nothing actionable
- **Goals dressed up as strategy** — "grow ARR by 30%" is a goal, not a guiding choice
- **Feature lists in place of guiding policy** — "we're building X, Y, and Z" doesn't say *why*
- **Stale and untouched** — the strategy doc was written once and forgotten; it now describes a product the team isn't building anymore
- **Too long to scan** — a 20-page strategy nobody opens during day-to-day work doesn't anchor anything

A good strategy doc is short, sharp, and read often. The hard part is producing one — most "write a strategy" prompts collapse into prose generation that papers over weak thinking.

## The Solution

`ce-strategy` runs an interview with explicit pushback rules:

- **Anchor, not plan** — strategy is what the product is and why; features belong in `ce-brainstorm`, schedules belong in the issue tracker
- **Rigor in the questions, not the headings** — the section headers are plain English; the interview enforces the discipline
- **Short is a feature** — the template is constrained; expansion is pushed back on
- **Durable across runs** — re-runs update in place, preserving what's working and only revisiting weak sections
- **Pushback rules per section** — each section has named anti-patterns and probe questions that push past slogans, goals-as-strategy, and feature lists

Inspired by Richard Rumelt's *Good Strategy Bad Strategy* — specifically his kernel of diagnosis, guiding policy, and coherent action. The interview questions are designed to push past the patterns Rumelt calls "bad strategy."

---

## What Makes It Novel

### 1. Pushback discipline in the interview

For each section, the skill asks the opening question, then applies named pushback rules — pushing past fluff, slogans, vanity goals, and feature lists. Two rounds of pushback per section maximum; if the answer is still weak after that, capture what the user gave and note the section is worth revisiting next run. The pushback is the core of the skill — without it, the interview becomes passive transcription.

### 2. Updates in place — durable across runs

Re-running the skill on an existing `STRATEGY.md` doesn't rewrite from scratch. Phase 2 reads the existing doc, summarizes current state in 3-5 lines so the user sees what's on file, and asks which section to revisit (or jumps directly when the argument names a section). Sections the user confirms are still accurate are left untouched. The `last_updated` field in YAML frontmatter is updated to today. Strong sections aren't second-guessed; weak ones get the full pushback.

### 3. Read by downstream skills as grounding

When `STRATEGY.md` exists at the repo root, downstream skills read it:

- **`ce-ideate`** — codebase-scan grounding agent reads it; ideation weights toward strategy-aligned directions automatically
- **`ce-brainstorm`** — Phase 1.1 constraint check reads it; product/scope decisions stay anchored to active tracks
- **`ce-plan`** — repo-research-analyst reads it; plan flags decisions that pull away from active tracks or the stated approach
- **`ce-product-pulse`** — first-run interview seeds product name and key metrics from the doc, then wires up data sources to actually measure those metrics

The doc is a peer of `README.md` (canonical, well-known location at the repo root) so the skills find it predictably.

### 4. Rumelt-inspired structure

The "Target problem / Our approach / Tracks" structure follows Rumelt's kernel: **diagnosis** (what's the situation, what's broken, what does it cost), **guiding policy** (the chosen approach, the strategic bet), **coherent action** (the active tracks of work that flow from the policy). The interview questions are designed to push past slogans toward this kernel.

### 5. Bounded section count

The required template is five sections (Target problem, Our approach, Who it's for, Key metrics, Tracks). Three optional sections (Milestones, Not working on, Marketing) are available but pushed back on when they don't carry weight. The constraint is the feature — strategy that needs 12 sections isn't strategy.

### 6. Frontmatter for staleness tracking

`STRATEGY.md` carries a `last_updated` field in YAML frontmatter. Downstream skills can flag the doc as potentially stale based on age; re-running the skill updates the timestamp.

---

## Quick Example

You're starting a new product and want a strategy doc before kicking off `ce-ideate`. You invoke `/ce-strategy`.

The skill checks for an existing `STRATEGY.md` (none found) and announces "Strategy doc not found — let's write it." It reads `references/interview.md` and runs the interview in section order.

**Target problem.** "What problem are you solving and for whom?" You answer "we help teams ship faster." The pushback fires: that's a slogan. "Whose teams? Shipping what? What does 'faster' mean — saving time per task, fewer bugs, less coordination overhead?" You sharpen: "we help engineering managers at 50-200 person companies cut PR-review cycle time from days to hours." That's specific enough.

**Our approach.** "What's the strategic bet — the choice that shapes everything else?" You answer "use AI." The pushback fires: that's a tool, not a bet. "What's the bet about AI specifically — that AI can review better than juniors? That AI can pre-process review concerns before humans see them? That review doesn't need humans at all?" You sharpen.

The interview proceeds through Who it's for, Key metrics, Tracks. Two rounds of pushback per section maximum. After all required sections are captured, the skill reads `references/strategy-template.md`, fills it in, presents the full draft in chat, offers one round of edits, then writes to `STRATEGY.md`.

Phase 3 notes the doc is now in place and `ce-ideate`, `ce-brainstorm`, `ce-plan`, and `ce-product-pulse` will pick it up on their next run. Suggests `/ce-ideate` as a natural next step.

---

## When to Reach For It

Reach for `ce-strategy` when:

- You're starting a new product and want a strategy doc before kicking off ideation
- The product direction has shifted and the existing strategy is stale
- "What are we working on?" keeps coming up because the answer isn't documented anywhere
- A specific section feels weak and you want to revisit it (`/ce-strategy approach`)
- A downstream skill (`ce-ideate`, `ce-brainstorm`) flagged the absence of `STRATEGY.md` as missing grounding

Skip `ce-strategy` when:

- The strategy is on file and still accurate — re-running adds noise without value
- You're trying to plan a single feature → `/ce-brainstorm`
- You're trying to schedule work → that's the issue tracker, not strategy
- You want a roadmap with dates → strategy is direction; roadmaps are sequencing

---

## Use as Part of the Workflow

`ce-strategy` is upstream of the chain. The recommended sequence on a new product or major direction shift:

```text
/ce-strategy → /ce-ideate (consults STRATEGY.md) → /ce-brainstorm → /ce-plan → /ce-work
                                                              ↑
                                          all read STRATEGY.md as grounding
```

The downstream skills don't *require* `STRATEGY.md` — they work without it. But when the doc exists, the active tracks and stated approach pull ideation, brainstorming, and planning toward strategy-aligned directions automatically. When `STRATEGY.md` is absent, `ce-ideate` can still ground in the codebase, but it has no signal about what *kind* of work matters most right now.

`ce-product-pulse` similarly seeds its first-run interview from `STRATEGY.md`'s key metrics — wiring up data sources to measure what the strategy says matters.

---

## Use Standalone

The skill is always invoked standalone — strategy isn't downstream of any other skill in the chain.

- **First run** — `/ce-strategy` (no `STRATEGY.md` exists)
- **Targeted update** — `/ce-strategy approach` jumps directly to that section
- **Open update** — `/ce-strategy` (file exists, no argument) asks which section(s) to revisit

---

## Output Artifact

```text
STRATEGY.md  (repo root, peer of README.md)
```

Sections (required unless noted):

- **Target problem** — the diagnosis: what's broken, for whom, and what it costs
- **Our approach** — the guiding policy: the strategic bet that shapes everything
- **Who it's for** — the persona; specific enough that design decisions can reference it
- **Key metrics** — what the product measures itself by
- **Tracks** — coherent action: the active tracks of work
- **Milestones** _(optional)_ — meaningful upcoming markers
- **Not working on** _(optional)_ — explicit non-goals; useful when the team faces "should we do X?" pressure
- **Marketing** _(optional)_ — positioning and messaging direction when relevant

YAML frontmatter carries `last_updated: YYYY-MM-DD`. The doc is short by design — typically 1-2 pages, not a chapter book.

---

## Reference

| Argument | Effect |
|----------|--------|
| _(empty)_ | First run if no `STRATEGY.md`; otherwise asks which section to revisit |
| `<section name>` | e.g., `metrics`, `approach`, `tracks` — jumps to that section |
| `<scope hint>` | e.g., "metrics for retention" — focuses the revisit |

---

## FAQ

**Why is the doc so short?**
Because long strategy docs aren't read. The discipline forces sharp answers to a small number of questions. If you find yourself wanting more sections, the answer is usually "those belong in ce-brainstorm or the issue tracker, not in strategy."

**What's the difference between strategy and a roadmap?**
Strategy is direction (what we're doing and why). A roadmap is sequencing (what's coming when). Strategy lives in `STRATEGY.md`; roadmaps live in the issue tracker, planning tools, or whatever the team uses for scheduling. The skill explicitly stays in the strategy lane.

**What if my answers are weak?**
The skill applies pushback rules per section — two rounds maximum. If the answer is still weak after that, the skill captures what you gave and notes the section is worth revisiting next run. Strategy is iterative; it doesn't have to be perfect on first write.

**Why does the doc go at the repo root?**
So downstream skills can find it predictably without configuration. Like `README.md`, `STRATEGY.md` is a canonical, well-known location.

**What if I don't want downstream skills to read it?**
They will if it exists. The behavior is intentional — anchoring the chain to a stated strategy is the value. If you want to suppress this, delete the doc; you can recreate it later.

**Is it useful for a non-software product?**
Yes — the structure (target problem, approach, persona, metrics, tracks) generalizes to any product. The pushback rules apply equally to a SaaS feature roadmap, a consulting practice, or a non-profit initiative.

---

## Learn More

The "Target problem / Our approach / Tracks" structure is informed by Richard Rumelt's *Good Strategy Bad Strategy* — specifically his kernel of diagnosis, guiding policy, and coherent action. The interview questions in `references/interview.md` are designed to push past the patterns Rumelt calls "bad strategy": fluff, goals dressed up as strategy, and feature lists in place of a guiding choice. The book is the recommended follow-up reading if the distinction between a slogan and a strategy isn't yet sharp.

---

## See Also

- [`ce-ideate`](./ce-ideate.md) — reads `STRATEGY.md` as grounding for ideation
- [`ce-brainstorm`](./ce-brainstorm.md) — reads it for constraint awareness during scope work
- [`ce-plan`](./ce-plan.md) — reads it; flags plan decisions that pull away from active tracks
- [`ce-product-pulse`](./ce-product-pulse.md) — seeds first-run setup from the strategy's key metrics
