# `ce-strategy`

> Create or maintain `STRATEGY.md`: what the product is, who it is for, how it succeeds, and where the team is investing.

`ce-strategy` is the **upstream anchor**. It writes one short document at the repo root, next to `README.md`. It is not a step in `/ce-ideate` → `/ce-brainstorm` → `/ce-plan` → `/ce-work`. Those skills read `STRATEGY.md` when it exists and weight their suggestions toward the active tracks and the stated approach. `ce-product-pulse` also reads it to seed the metrics it measures.

The doc is short on purpose. The skill grounds itself in what the repo already says the product is, asks a handful of sharp questions, pushes back on slogans and feature lists, and writes what you actually said.

Skip this when you already know the one thing to build. That is `ce-ideate` (which directions), `ce-brainstorm` (what this needs to be), `ce-plan` (guardrails), or `ce-work` (build it).

```text
/ce-strategy                 /ce-ideate         /ce-brainstorm      /ce-plan             /ce-work
Write the durable            "What's worth      "What does this     "What's needed       "Build it."
anchor, then stay out         exploring?"        need to be?"        to accomplish
of the loop.                                                         this?"
```

---

## TL;DR

| Question | Answer |
|----------|--------|
| What does it do? | Reads what the repo already says the product is, interviews you with pushback rules, stress-tests the answers, then writes or updates `STRATEGY.md` at the repo root |
| When to use it | New product; adding a strategy doc to an existing repo; direction changed; "what are we working on?" has no written answer; a downstream skill flagged missing strategy grounding |
| What it produces | `STRATEGY.md` with target problem, approach, persona, 3-5 key metrics, 2-4 tracks, and optional milestones / non-goals / marketing. Frontmatter carries `name` and `last_updated`. |
| What's next | `/ce-ideate` or `/ce-brainstorm` if nothing downstream has run yet. `/ce-product-pulse` if you want those metrics measured. |

---

## Example invocations

An empty invoke follows the file. A section name or scope hint jumps to that part and leaves the rest untouched.

```text
# No STRATEGY.md yet: interview the required sections, show a draft, offer one edit pass, then write the repo-root file
/ce-strategy

# File already exists: summarize what is on file in 3-5 lines, then ask which section to revisit
/ce-strategy

# Jump to one section. Other sections stay as written.
/ce-strategy approach
/ce-strategy metrics
/ce-strategy tracks

# Narrower than a whole section
/ce-strategy metrics for retention

# Rewrite the diagnosis after a direction change
/ce-strategy target problem
```

Prefer a section or scope hint for maintenance. A bare invoke on an existing file is the broader path: it asks which section to open.

---

## The Problem

Most teams have no strategy doc, or have one so long nobody opens it.

- Missing entirely: every new piece of work re-litigates whether you are working on the right thing
- Slogan, not strategy: "we delight users" gives the agent (and humans) nothing to act on
- A goal dressed as strategy: "grow ARR by 30%" is a target, not a guiding choice
- A feature list in place of policy: "we're building X, Y, and Z" does not say why
- Written once and left: the doc describes a product the team is no longer building
- Too long to scan: a 20-page strategy does not get read during day-to-day work

A useful strategy doc is short and opened often. A generic "write a strategy" prompt usually produces prose that hides weak thinking.

## The Solution

`ce-strategy` runs a repo-grounded interview with named pushback rules.

- It reads the README, `CONCEPTS.md`, and `docs/` first, so the interview opens from a working model of the product instead of a blank page. Recent commits and PRs are read separately, as a signal of where attention has gone lately - useful for tracks, not for what the product is.

- Strategy is what the product is and why. Features belong in `ce-brainstorm`. Schedules belong in the issue tracker.
- Section headers are plain English. The interview is where the discipline lives.
- The template is constrained. Extra sections get pushback.
- Re-runs update in place. Accurate sections stay; weak ones get the same pushback as a first write.
- Each section has anti-patterns and probe questions that catch slogans, goals-as-strategy, and feature lists.

The "Target problem / Our approach / Tracks" shape follows Richard Rumelt's kernel in *Good Strategy Bad Strategy*: diagnosis, guiding policy, and coherent action.

---

## What Makes It Novel

### Grounded in the repo, decided by you

Before the first question the skill shows a three-to-five-line repo model - what it takes the product to be, who it seems to serve, where recent attention has gone - with sources named, and asks you to correct it. Evidence seeds the questions and sharpens the pushback ("the README says X; you just said Y - which is it?"). It never fills in a section on its own, and a burst of recent work in one area is offered as a question about tracks, not treated as the product's focus. A new or empty repo runs the interview ungrounded; that is a normal path.

### Pushback in the interview

For each section the skill asks the opening question, then applies that section's pushback rules. Two rounds maximum. If the answer is still weak, it captures what you gave and notes the section is worth another pass next run. Without that step the interview is just transcription.

Required sections, in order: Target problem, Our approach, Who it's for, Key metrics, Tracks. Optional: Milestones, Not working on, Marketing - skipped when nothing came up. Unused optional sections are omitted, not left as empty headers. Metrics stay at 3-5. Tracks stay at 2-4.

On a first run, the filled draft is shown in chat and you get one edit pass before anything is written.

### Stress test before the draft

After the five required sections, the skill poses three to five concrete proposals aimed at the draft's fault lines - a tempting feature just off the approach, a second persona pulling the other way, a track that would starve another - chosen so your answer is not predictable from the draft. If the strategy already decides a proposal, it is confirmed. If it cannot, the approach or a track gets sharpened. Proposals you resist become candidates for Not working on, which is how that section gets real content instead of being skipped.

### Updates in place

A second run does not start over. It reads the existing doc, summarizes it in 3-5 lines, checks it for drift against the repo and what has landed since `last_updated`, names any section that looks stale as a candidate, and either jumps to the section you named or asks which to revisit. The menu is Target problem; Our approach; Who it's for; or Metrics, tracks, or other. Sections you confirm are still accurate are left alone. `last_updated` is set to today.

### Read by downstream skills

When `STRATEGY.md` is at the repo root:

- `ce-ideate` weights toward strategy-aligned directions
- `ce-brainstorm` keeps product and scope decisions on the active tracks
- `ce-plan` flags decisions that pull away from the tracks or the stated approach, or land on the Not working on list
- `ce-product-pulse` seeds product name and key metrics, then wires sources to measure them

The skills work without the file. With it, they have a signal for what kind of work matters right now.

The skill does not compute metric values, update the issue tracker, prioritize a backlog, or write requirements or plans.

---

## Quick Example

You are adding a strategy doc to a repo you have worked in for a year. You run `/ce-strategy`. No file exists. The skill reads the README and docs, shows a short repo model ("a PR-review tool for engineering teams; recent work is mostly in the GitHub integration") and asks you to correct it, then starts the interview.

Target problem: you answer "we help teams ship faster." That is a slogan, so the pushback asks whose teams, shipping what, and what "faster" means. You sharpen to engineering managers at 50-200 person companies cutting PR-review cycle time from days to hours.

Our approach: you answer "use AI." That is a tool, not a bet. The pushback asks what you are betting AI does here that the obvious alternative does not. You name the actual choice.

The interview continues through Who it's for, Key metrics, and Tracks - where the skill asks whether the recent GitHub work is a track or a push, and you say push. Then three proposals test the draft; you resist one ("a Slack bot for review nudges"), and it lands under Not working on. You see the full draft, get one edit pass, and the file is written to `STRATEGY.md`.

The skill notes that `ce-ideate`, `ce-brainstorm`, and `ce-plan` will pick the file up on their next run, and suggests `ce-ideate` or `ce-brainstorm` if nothing downstream has run yet.

---

## When to Reach For It

Reach for `ce-strategy` when:

- You are starting a product and want an anchor before ideation
- You are adopting the workflow in an existing repo and want the strategy written down
- Direction has shifted and the existing file is stale
- "What are we working on?" keeps coming up because the answer is not written down
- One section is weak and you want to reopen just that part (`/ce-strategy approach`)
- `ce-ideate` or `ce-brainstorm` flagged the missing file as missing grounding

Skip `ce-strategy` when:

- The file is on disk and still accurate. Re-running adds noise.
- You are shaping one feature → `/ce-brainstorm`
- You are scheduling work. That is the issue tracker.
- You want a dated roadmap. Strategy is direction. Sequencing lives elsewhere.

---

## Use as Part of the Workflow

`ce-strategy` sits above the loop. Recommended sequence on a new product or a major direction change:

```text
/ce-strategy → /ce-ideate → /ce-brainstorm → /ce-plan → /ce-work
                   ↑              ↑              ↑
                   all read STRATEGY.md when it exists
```

Downstream skills do not require the file. When it exists, the tracks and the approach pull ideation, brainstorming, and planning toward aligned work. Without it, `ce-ideate` can still ground in the codebase, but it has no signal for what kind of work matters most right now.

`ce-product-pulse` seeds its first-run interview from the key metrics in `STRATEGY.md`.

---

## Use Standalone

This skill is always invoked on its own. Nothing in the loop produces `STRATEGY.md`.

- First run: `/ce-strategy` (no file yet)
- Targeted update: `/ce-strategy approach` jumps to that section
- Open update: `/ce-strategy` (file exists, no argument) asks which section to revisit

The file is meant to be readable in under five minutes.

---

## Reference

| Argument | Effect |
|----------|--------|
| _(empty)_ | No file: full interview, draft in chat, then write. File exists: summarize and ask which section to revisit. |
| `<section name>` | Jump to that section and preserve the rest. Names include `metrics`, `approach`, `tracks`, `target problem`, `who it's for`, plus the optional `milestones`, `not working on`, and `marketing`. |
| `<scope hint>` | Focus a revisit, e.g. `metrics for retention` |

Output: `STRATEGY.md` at the repo root (not under `docs/`). YAML frontmatter has `name` and `last_updated: YYYY-MM-DD`.

Required sections: Target problem, Our approach, Who it's for, Key metrics (3-5), Tracks (2-4). Optional: Milestones (external dates only), Not working on, Marketing.

---

## FAQ

**Why is the doc so short?**
Long strategy docs are not read. The template forces short answers to a small set of questions. Extra sections usually belong in `ce-brainstorm` or the issue tracker.

**What's the difference between strategy and a roadmap?**
Strategy is direction (what you are doing and why). A roadmap is sequencing (what comes when). This skill stays in the strategy lane.

**What if my answers are weak?**
Two rounds of pushback per section, then it records what you gave and marks the section for a later pass. The first write does not have to be final.

**Why does the file go at the repo root?**
So downstream skills can find it without configuration, the same way they find `README.md`.

**What if I don't want downstream skills to read it?**
They will if the file exists. That is the point of the anchor. Delete the file to suppress it; you can recreate it later.

**Is it useful for a non-software product?**
The same sections (problem, approach, persona, metrics, tracks) apply to a consulting practice or a non-profit initiative as well as a SaaS product.

**Does it compute the current metric values?**
No. It records which metrics matter and, when you know, where they live. `ce-product-pulse` is the skill that queries sources.

---

## See Also

- [`ce-ideate`](./ce-ideate.md): reads `STRATEGY.md` as grounding for ideation
- [`ce-brainstorm`](./ce-brainstorm.md): reads it for constraint awareness during scope work
- [`ce-plan`](./ce-plan.md): reads it and flags plan decisions that pull away from active tracks
- [`ce-product-pulse`](./ce-product-pulse.md): seeds first-run setup from the strategy's key metrics
