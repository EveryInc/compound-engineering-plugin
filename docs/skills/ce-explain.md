# `ce-explain`

## TL;DR

Point it at a concept, a diff, an idea, or a window of your own recent work, and get a dense, visual explainer written for you personally — with an optional check-in (predict what a diff does before the reveal; answer exercises that get corrected) that makes the material actually stick.

## The Problem

Agent-driven development removed the learning that writing code by hand used to provide. You ship work through agents, rarely read the code, and stop accumulating the understanding that typing it yourself once forced. The cost shows up twice: comprehension debt on your own projects, and recall gaps when a meeting needs you to speak to what happened last week. The plugin's other skills capture knowledge for the *repo* (`/ce-compound`) or judge options (`/ce-pov`); none of them teaches *you*.

## The Solution

One skill, four input shapes:

- **Concept** — repo-grounded when the topic touches your repo, fully external when it doesn't (interview prep counts).
- **Diff** — understand a change you didn't type, with predict-then-reveal: you say what you think it does *before* any explanation appears.
- **Idea** — your idea, taken as a fixed given, explained for implications and trade-offs (never scoped or ranked — that's brainstorm/ideate territory).
- **Work recap** — "what did I do this week?" answered from git activity and project docs, absorbable in minutes before a meeting.

The explainer is HTML-first (markdown on request), show-n-tell by default — diagrams for structure, annotated snippets for code, timelines for recaps — and written to a stable temp location before the skill asks where you want it: an artifact surface, a local file, or a detected destination like Proof or Thinkroom. Destinations are offered only when actually available.

## What Makes It Novel

1. **Predict-then-reveal for diffs.** The turn *ends* after you're shown the raw change and asked for your prediction. No interpretive content leaks early — the reveal then names exactly what your prediction missed. That gap-naming is the teaching.
2. **The check-in lives in the session, not the artifact.** The doc stays display-only; exercises are posed in chat where the skill can check and correct your answers.
3. **Skippable by design.** Routine recaps skip the check-in; you can always decline. Some things don't need a learning loop.
4. **Capability-detected destinations.** The destination ask offers only what your environment supports, with a local file as the always-present floor — and the artifact exists on disk before the ask, so declining everything loses nothing.
5. **Honest external grounding.** External topics with no web access fall back to model knowledge — labeled as unverified in the artifact, never passed off as checked.

## Quick Example

```text
/ce-explain diff:HEAD~3..HEAD
/ce-explain ruby garbage compaction
/ce-explain since:monday          # meeting prep
/ce-explain my idea of caching explainers per repo
```

## When to Reach For It

- An agent just landed a change you didn't fully follow and you want to *understand* it, not just review it.
- You keep meeting a concept you've been nodding along to.
- Interview or presentation prep where you need the material in your head, not in a doc.
- Before standup or a meeting: "catch me up on what I did."

## Use as Part of the Workflow

`ce-explain` sits outside the core loop — invoke it whenever comprehension lags behind shipping. When an explanation surfaces things that could be better, its closing routes them onward: new-capability ideas seed `/ce-ideate`, code-clarity findings seed `/ce-simplify-code`, and UI/UX polish observations are handed to you to take into `/ce-polish`.

## Use Standalone

Fully standalone — it needs no plan, no brainstorm, and works in any repo (or no repo at all, for external topics).

## Reference

| Argument | Effect |
|----------|--------|
| free text | Classified as concept, idea, diff, or recap by shape |
| `diff:<ref-or-range>` | Force diff mode on that change |
| `since:<window\|date\|ref>` | Force recap mode over that window (default: last 7 days) |
| `output:md` | Markdown artifact instead of HTML |
| *(bare)* | Asks what to explain |

## FAQ

**Where does the artifact go?** It's written to `/tmp/compound-engineering/ce-explain/<run-id>/` before the destination ask; choosing a destination copies it out. That path is temporary — pick a destination if you want to keep it.

**Is this ce-compound for humans?** Roughly — a Learning teaches the repo's future work; an explainer teaches you. They're complements, not substitutes.

**Can it quiz me later / track what I've learned?** Not in v1 — no library, no spaced repetition, no progress state. The stable run-dir layout is the hook a future library can build on.

## See Also

- [`/ce-pov`](./ce-pov.md) — when you need a verdict on something external, not a lesson about it
- [`/ce-compound`](./ce-compound.md) — when the knowledge belongs to the repo, not (only) your head
- [`/ce-ideate`](./ce-ideate.md) — where surfaced improvement ideas land
