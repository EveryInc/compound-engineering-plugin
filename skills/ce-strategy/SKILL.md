---
name: ce-strategy
description: "Create or update STRATEGY.md. Use when starting a product, adding a strategy doc to an existing repo, changing direction or roadmap, or when ce-ideate, ce-brainstorm, or ce-plan need upstream product grounding."
argument-hint: "[optional: section to revisit, e.g. 'metrics' or 'approach']"
---

# Product Strategy

**The current year is 2026** - use it when dating the document.

`ce-strategy` produces and maintains `STRATEGY.md` - a short, durable anchor for what the product is, who it serves, how it succeeds, and where the team is investing. It lives at the repo root. Downstream skills read it when it exists: `ce-ideate`, `ce-brainstorm`, and `ce-plan` for what work is on-strategy; `ce-product-pulse` for the product name and key metrics; `ce-dogfood` for the primary persona. In a file this skill writes in its house format, its frontmatter keys and section headings are the contract those skills parse - keep them exactly as `references/strategy-template.md` writes them.

**Done:** `STRATEGY.md` exists at the repo root and the user has seen what will be written and had an edit pass. For a file in this skill's house format, every required section is filled from answers that survived pushback and the file matches `references/strategy-template.md`. For a file in any other shape, done is the user-approved minimal edits applied with the document's shape unchanged. A section the user could not sharpen in two rounds is written as given and named in chat as worth revisiting - a completed run, not a blocked one.

## Boundaries

- **Anchor, not plan.** Strategy is what the product is and why. Features belong in `ce-brainstorm`, schedules and prioritization in the issue tracker, implementation plans in `ce-plan`; do not let them creep into the doc, and do not update the tracker or reconcile in-flight work.
- **The user answers; the repo only grounds the question.** Evidence earns a sharper question, never fills in a section. Do not derive the strategy from the repo.
- **Short is a feature.** Push back on expansion rather than adding sections.
- **Record which metrics matter and where they live**, not what they read today.
- **Meaning is the contract; the shape belongs to whoever created the doc.** A file in this skill's own house format is maintained in that format, including renaming an earlier version's headings to the current template ones on write. A file in any other shape - hand-written, from another tool - is read by meaning and edited in its own shape and idiom: no restructuring into the template, no uninvited frontmatter or headings. Either way a section carrying an author-approved marker (`<!-- vision: author-approved 2026-07-10 -->`), or a doc the user does not own, is not edited at all - report the conflict, or write a separate file that links to it - and a targeted update preserves every other section's content and place exactly. `references/update-run.md` owns the rest and is a required read before you edit an existing file.

## Asking and routing

Ask one question at a time, through the platform's blocking question tool: `AskUserQuestion` in Claude Code (call `ToolSearch` with `select:AskUserQuestion` first if its schema isn't loaded), `request_user_input` in Codex, `ask_question` in Antigravity CLI (`agy`), `ask_user` in Pi (needs the `pi-ask-user` extension). Fall back to numbered options on the host's user-visible chat surface only when no blocking tool exists or the call errors (e.g., Codex edit modes) — not because a schema load is required. Never silently skip the question.

Any argument this skill was invoked with — present in the current prompt or conversation, from the user or a calling skill — is a focus hint: a section to revisit (`metrics`, `positioning`, `tracks`; older names such as `approach` or `who it's for` map to the current section) or a scope hint. With none, proceed open-ended and let the file state decide the path.

## Phase 0: Ground and route

Read `references/grounding.md` first - a non-optional load. It owns the file read, the repo model and its two inputs, what to show the user before the first question, and how an invocation argument is read as a focus hint.

Then announce the path in one line and route by file state: no file -> Phase 1 ("Strategy doc not found - let's write it."); file exists -> Phase 2 ("Found existing strategy - let's review and update.").

## Phase 1: First-run interview

Read `references/interview.md` before the first question - a non-optional load. The opening questions, pushback rules, anti-pattern examples, quality bar, blocking-question tool per host, and the two-round cap live there; improvising from memory produces a passive transcription instead of a strategy doc.

Run the interview in the section order of the final document:

1. Purpose
2. Positioning
3. Users
4. Key metrics
5. Tracks
6. Stress test
7. Boundaries (always written)
8. Milestones (optional)
9. Brand (optional)

When every section is captured, read `references/strategy-template.md`, fill it in, present the full draft in chat, offer one round of edits, then write `STRATEGY.md`.

## Phase 2: Update run

Read `references/update-run.md` first - a non-optional load, before the summary, the drift check, or any question. It decides how drift candidates are raised, which section is revisited, and what is preserved untouched. An update run summarizes the file's current state in 3-5 lines, names any section the repo model suggests is stale as a candidate rather than a verdict, and revisits the section the focus hint named, or the one the user picks when asked — any section, with the drift candidates listed first as suggestions rather than as the choices. Every other section's content and place is left untouched. Questions and pushback still come from `references/interview.md`, applied as if this were a first run.

## Phase 3: Downstream handoff

Note in one line where the file lives and that `ce-ideate`, `ce-brainstorm`, and `ce-plan` pick it up as grounding on their next run. If no downstream skill has run here yet, suggest `ce-ideate` or `ce-brainstorm` as a next step.
