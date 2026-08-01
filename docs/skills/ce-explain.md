# `ce-explain`

## TL;DR

Point it at a concept, a diff, an idea, or a window of your own recent work, and get back a dense, self-contained visual document about it — evidence-grounded, built to keep, and published wherever you want it. That document is the deliverable. When the material is worth retaining, it can also drill you on it: predict what a diff does before the reveal, or answer exercises that get corrected. That part is opt-in and most runs skip it.

## Example invocations

```text
# The shortest path to a report: name a window and stop. No syntax to learn.
# "since last Monday" is not the since: flag — it has no colon, so it stays as
# request text and gets classified as a recap by shape, with the window read
# from the prose. Same destination, one less thing to remember.
/ce-explain since last Monday

# Force recap mode instead of relying on classification. Worth it when the
# prompt could read as either a window or a topic, or when a chained call has
# no conversation around it to disambiguate. A token in flag position wins.
/ce-explain since:7d

# Build a timeline of your own work for a standup or a status update
/ce-explain build a timeline of what changed since Monday

# Get a written breakdown of a change you shipped but didn't type
/ce-explain diff:main..HEAD

# Turn an early idea into a visual thinking artifact
/ce-explain my idea of caching explainers per repository

# Learn an external technical concept from scratch
/ce-explain Ruby garbage compaction
```

The first form is the one to remember: a window and nothing else is enough to get a full written report. Everything else — tokens, framing, an audience — is there when you want to be specific, not a prerequisite.

## The Problem

Agent-driven development detached you from your own work in two ways, and they need different fixes.

**You can't account for it.** Work lands through agents across a week, and by Monday you can't say what shipped, why, or what it cost. Git has the record; nothing turns it into something you can read in three minutes before a meeting.

**You can't explain it.** Writing code by hand forced comprehension as a side effect. Reviewing agent output doesn't. Comprehension debt accumulates silently on your own projects.

The first problem wants a *report*. The second wants a report **and** a way to make it stick. `ce-explain` produces the report either way; the retention layer is an extra step you can take when the material warrants it.

The plugin's other skills don't cover this: `/ce-compound` captures knowledge for the *repo*, `/ce-pov` renders a verdict. Neither writes you a document about a thing.

## The Solution

One artifact contract, four input shapes:

| Input | What you get |
|---|---|
| **Work recap** — "what did I do this week?" | A date-ordered timeline of real commits, PRs, and the plan/solution docs behind them, each entry naming what changed and why it mattered |
| **Diff** — a sha, range, PR, or "the last change" | A breakdown of what the change actually does: annotated real hunks, with the *why* per hunk |
| **Concept** — a topic, subsystem, or external subject | An explainer grounded in your repo when the topic touches it, fully external when it doesn't (interview prep counts) |
| **Idea** — a proposal of yours | Its implications, mechanics, and trade-offs, taken as a fixed given — never scoped or ranked (that's `/ce-brainstorm` and `/ce-ideate`) |

Recap mode has the most machinery behind it: a dedicated scout subagent walks git activity, PRs (only when a PR interface is actually reachable), and project docs for the window, and writes an evidence file with shas and `file:line` pointers before any prose is composed. An empty window says so and writes nothing rather than padding.

Not every question wants a document. A request that reads as operational — "why is X doing Y", "is X configured right" — gets answered directly in chat, and the offer to build an explainer only follows when a real concept sits behind it.

## The Artifact

The output is a single self-contained HTML file (markdown on request via `output:md`), written to a stable temp path *before* you're asked where to put it — so declining every destination loses nothing.

- **No external requests of any kind.** CSS inline, SVG inline, images as data URIs, system font stack — no webfont exception. It reads identically offline and inside CSP-restricted viewers.
- **Show, then tell.** The form matches the material: SVG diagram for architecture and boundaries, annotated real snippets for code, numbered flow for a lifecycle, timeline for a recap, two-column contrast for a trade-off. One visual per load-bearing idea, never decoration — and a reader who skips every visual still gets the full explanation in prose.
- **Display-only.** No forms, no scripts, no embedded quiz. Anything that needs your answer checked happens in the session, not in the file.
- **Visible, stable metadata header.** `Date`, `Input shape`, `Subject` as literal text — no hidden JSON mirror. Those field names are fixed on purpose: they're the index a future library layer reads.
- **Dense, not long.** Prose held to ~70ch, one sitting's read, background that doesn't change understanding gets cut.

Then it asks where to put it, offering only what it actually detects in the session: a Claude Artifact (preferred in Claude Code), a public ht-ml.app URL (preferred elsewhere, and always behind an explicit public-content warning), a local file it offers to open for you, Proof for markdown runs, Thinkroom when that capability exists, or leave it in temp.

### Who it's written for

By default, you — second person, dense, and free to assume the context you already have. Ask for a version someone else will read ("write this up for the team", `audience:team`) and it re-renders for that reader: second person drops, the subject moves to third person when a name is available from the evidence, and the minimum orientation an outside reader needs gets added. Depth, real code, and the honesty labels don't change.

Two things it deliberately won't do: soften into a status update, or turn into a deck. It's the same document rendered for someone else. And wanting to *speak* from the material — standup prep, meeting prep — stays personal, because you're still the reader.

If you compose the personal default and then pick a destination that puts it in front of other people, it offers once to re-render before sending.

## The Optional Check-In

Before anything is revealed, the skill judges whether the material warrants active recall — a gnarly diff or a hard concept does, a routine recap doesn't — and if so offers exactly two choices, with **Just the explainer** listed first and marked Recommended. The quiz is never the recommended path. Declining is final for the run and never re-litigated.

Taking it gets you one of two mechanics:

- **Predict-then-reveal (diffs).** You're shown the raw change and nothing else — no annotation, no diagram, no summary — asked what you think it does and why, and the turn *ends there*. The explainer is composed only after your prediction lands, and the reveal names exactly what you got right, what you missed, and what you got wrong. The gap-naming is the teaching.
- **Exercises (concepts, ideas, dense recaps).** Two to four, posed in chat one at a time after the document is presented: apply it to a scenario, restate the mechanism, find the boundary where it fails. Each answer gets checked and corrected, with the specific gap named. One correction per exercise — no lecturing past the gap.

## What Makes It Novel

1. **The recap is evidence-first, not vibes.** The scout gathers before anything is characterized — the main conversation is explicitly barred from pre-scanning the window, because an early `git --all` glance seeds a false model of what happened. PR evidence is capability-gated: unreachable means one honest line, never a guess from branch names.
2. **The artifact is built to survive.** Fully offline, no external fetches, stable indexable header, written to disk before the destination ask. It works in an airplane, in a locked-down viewer, and after you decline every publishing option.
3. **Capability-detected destinations, one preferred publisher.** It probes the session rather than checking a hardcoded list, and shows one recommended publisher instead of a menu of five. Public publishing always requires an explicit warned choice — never headless, never inferred from the fact that you asked for an explainer.
4. **Honest external grounding.** An external topic with no web access falls back to model knowledge and the artifact says so in its header — *Unverified — from model knowledge, not checked against current sources* — rather than passing it off as checked.
5. **Predict-then-reveal actually ends the turn.** No interpretive content leaks into the message that asks for your prediction. Most "quiz me" implementations reveal the answer in the same breath as the question; this one structurally can't.
6. **The check-in lives in the session, not the document.** Which is why the document stays clean and shareable while your answers still get corrected — the two would fight if they lived in the same place.

## When to Reach For It

**For the report:**

- Before a standup, a status update, or a 1:1: "catch me up on what I did."
- An agent landed a change and you want a written breakdown to keep, not a review.
- You have an early idea and want its implications laid out visually before committing to it.

**When you also want it to stick:**

- A change landed that you didn't follow and will have to maintain.
- A concept you keep nodding along to without actually knowing.
- Interview or presentation prep, where the material needs to be in your head rather than in a file.

**Skip it** for ordinary Q&A, a quick "why?" follow-up, or a trade-off answer that belongs inline in chat.

## Use as Part of the Workflow

`ce-explain` sits outside the core loop — invoke it whenever your account of the work, or your understanding of it, lags behind what shipped. When composing surfaces things that could be better, its closing routes them onward: new-capability ideas seed `/ce-ideate`, code-clarity findings seed `/ce-simplify-code`, UI/UX polish observations are handed to you to take into `/ce-polish`, and a plan or solution doc the evidence has overtaken seeds `/ce-compound-refresh`. That last one falls out of how recaps ground themselves — reading plans and solution docs for the *why* routinely turns up one that shipped work has since contradicted.

## Use Standalone

Fully standalone — no plan, no brainstorm, and it works in any repo (or no repo at all, for external topics).

## Reference

| Argument | Effect |
|----------|--------|
| free text | Classified as concept, idea, diff, or recap by shape |
| `diff:<ref-or-range>` | Force diff mode on that change |
| `since:<window\|date\|ref>` | Force recap mode over that window (default: last 7 days) |
| `output:md` | Markdown artifact instead of HTML |
| `audience:<who>` | Render for that reader instead of you personally |
| *(bare)* | Asks what to explain |

**Plain language is the ordinary path — tokens are how you force a decision.** For a clear request you don't need one: "since last Monday" resolves to the same window as `since:monday`. Reach for a token when inference could reasonably go either way and you want the guarantee — a topic that also reads as a time window, a repo subject that also names a recent change, an exact ref or range like `diff:abc1234..def5678`, or a chained/automated call where nothing is there to disambiguate.

A token in flag position beats inference; a colon sitting in ordinary prose does not. "walk me through the diff: why did we split the parser" is a sentence, not a `diff:` flag on the ref `why`. `diff:` and `since:` together conflict and it asks which you meant.

## FAQ

**Do I have to do the quiz?** No — and it's not the default. "Just the explainer" is the recommended first option, and for routine material the offer is skipped entirely.

**Can I use this for standup or status updates?** That's recap mode's main job. Prepping you to speak to the work stays personal by default; if the write-up itself is going to a team, say so (or pass `audience:`) and it renders for them.

**Can I share the report with my team?** Yes — that's what the audience rendering and the publishing destinations are for. Just ask for it up front, or take the re-render offer when you pick a shared destination.

**Where does the artifact go?** It's written to `/tmp/compound-engineering-<effective-uid>/ce-explain/<run-id>/` before the destination ask; choosing a destination copies it out. That path is temporary — pick a destination if you want to keep it.

**Is this `ce-compound` for humans?** Roughly — a Learning teaches the repo's future work; an explainer documents something for you. They're complements, not substitutes.

**Can it quiz me later / track what I've learned?** Not in v1 — no library, no spaced repetition, no progress state. The stable run-dir layout and fixed metadata field names are the hook a future library can build on.

## See Also

- [`/ce-pov`](./ce-pov.md) — when you need a verdict on something external, not a document about it
- [`/ce-compound`](./ce-compound.md) — when the knowledge belongs to the repo, not (only) you
- [`/ce-ideate`](./ce-ideate.md) — where surfaced improvement ideas land
