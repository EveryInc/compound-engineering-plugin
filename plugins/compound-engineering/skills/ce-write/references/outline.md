# Stage: outline

Turn the brief into a **skeleton** — the order of ideas, answer-first. The outline is where structure is cheap to change; fixing a tangled argument here costs a minute, in the draft it costs an hour.

## Read first

- The brief at `brief:<path>`.
- The voice guide, especially §6 (structure) and §2.1 (lead with the governing idea).

## Principles (voice guide §6)

- **Answer first.** The governing idea from the brief goes on top. The reader learns the thesis, then spends the piece confirming it — never hunting for it. This is Minto's pyramid, and it is the outline's spine.
- **One idea per section.** Each section makes exactly one point. If a section wants to argue two things, it is two sections.
- **Build an arc.** Order the sections so each earns the next. Evidence after the claim it supports, not before. The close should land the thesis, not introduce a new one.
- **Mark what compresses.** Where the content is structured, parallel data (options, roles, a comparison), note "→ table" — prose should not narrate what a grid can show.
- **Plan the clinchers.** For an essay, note where each section should land its aphoristic closing line (voice guide §3).

## Procedure

1. Extract the thesis and the one job from the brief.
2. Draft the section order as answer-first: thesis on top, then the sections that prove and extend it, then the close.
3. Under each section, write one line: the single idea it carries. Add "→ table" or "→ clincher" markers where they apply.
4. Present the shape for approval (skip in pipeline mode — the orchestrator gates it). Revise once if the shape is wrong; do not perfect prose here.
5. Write `outline.md`.

## Output: outline.md

```markdown
# Outline: <short title>

**Governing idea (goes on top of the draft):** <the thesis>

1. <Section header — states the point or poses the question>
   - Idea: <the one idea this section carries>
   - <optional: → table | → clincher | must-include note>
2. <Section header>
   - Idea: <...>
...
N. <Close>
   - Idea: <how the piece lands the thesis>
```

Headers are noun phrases or framing questions, never generic ("Overview," "Introduction," "Conclusion" are banned — voice guide §7).

## Voice-guide sections this stage leans on

- §6 Structure — answer-first, one idea per section, scaffold then fill.
- §2.1 — lead with the governing idea.
- §3 — where clinchers land.
- §7 — header style (no generic headers).
