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
- **Meaning is the contract; shape belongs to whoever created the doc.** Any `STRATEGY.md` that already exists - written by an earlier version, by hand, or by another skill - is adapted to in its own shape and idiom, never restructured into the template and never given uninvited frontmatter or headings. A section carrying an author-approved marker (`<!-- vision: author-approved 2026-07-10 -->`), or a doc the user does not own, is not edited at all - report the conflict, or write a separate file that links to it. On a targeted update, every other section's content and place is preserved exactly. `references/update-run.md` owns the rest and is a required read before you edit an existing file.

## Interaction Method

Default to the platform's blocking question tool: `AskUserQuestion` in Claude Code (call `ToolSearch` with `select:AskUserQuestion` first if its schema isn't loaded), `request_user_input` in Codex, `ask_question` in Antigravity CLI (`agy`), `ask_user` in Pi (needs the `pi-ask-user` extension). Fall back to numbered options on the host's user-visible chat surface only when no blocking tool exists or the call errors (e.g., Codex edit modes) — not because a schema load is required. Never silently skip the question.

Ask one question at a time. Prefer free-form answers for the substantive sections and single-select only for routing (which section to revisit); each option label must be self-contained.

## Focus hint

Any argument this skill was invoked with — present in the current prompt or conversation, from the user or a calling skill — is a focus hint: a section to revisit (`metrics`, `positioning`, `tracks`; older names such as `approach` or `who it's for` map to the current section) or a scope hint. With none, proceed open-ended and let the file state decide the path.

## Phase 0: Ground and route

Read `STRATEGY.md` with the native file-read tool.

Then build a **repo model** - your working understanding of what this product is - from two inputs with different jobs:

- **What the product is.** Stated intent (README, `CONCEPTS.md`, `docs/`, an existing `STRATEGY.md`, sibling docs such as `PRODUCT.md` or `VISION.md`) and structure (what the code is organized around, what is public, what is tested) - the authority for the problem, approach, and persona questions. Bound the read to "what is this and who is it for"; do not profile the whole repo.
- **What is getting attention now.** Recent commits or PRs, informing only the Tracks question and staleness in an update run. A burst of recent work is a fact about the last few weeks, not about what the product is; where it disagrees with stated intent, that is a question for the user ("recent work is mostly in X - is X a track, a temporary push, or unrelated?"), never a conclusion.

If the repo has no substantive content, say so in one line and run the interview ungrounded - a normal path, not a blocker.

Show the repo model in chat before the first question: three to five lines on what you take the product to be, who it seems to serve, and where attention has gone, each with its source named. Invite correction; the interview still runs in full. If it could not supply the product's name, ask for that here - the template's frontmatter and title need it.

Announce the path in one line and route by file state: no file -> Phase 1 ("Strategy doc not found - let's write it."); file exists -> Phase 2 ("Found existing strategy - let's review and update.").

## Phase 1: First-run interview

Read `references/interview.md` before the first question - a non-optional load. The pushback rules, anti-pattern examples, and quality bar for each section live there; improvising from memory produces a passive transcription instead of a strategy doc.

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

For each section, ask the opening question, apply the pushback rules, and capture the final answer in the user's own language. Where the repo model bears on the section, open with what it suggests and ask the user to confirm or correct, and use repo specifics in pushback ("the README says X; you just said Y - which is it?"). Do not skip pushback - it is the core of the skill, and existing weak content is not rubber-stamped because it is already written. Two rounds per section maximum; capture what the user has given after that and note the section as worth revisiting next run.

The **stress test** (step 6, defined in `references/interview.md`) checks that the captured answers actually decide things: a few concrete proposals aimed at the draft's fault lines, each answered by the user. An answer the strategy already decides confirms it; one it cannot decide sharpens the approach or tracks; a proposal the user resists is a candidate for Boundaries.

When every section is captured, read `references/strategy-template.md`, fill it in, present the full draft in chat, offer one round of edits, then write `STRATEGY.md`.

## Phase 2: Update run

Read `references/update-run.md` first - a non-optional load, before the summary, the drift check, or any question. It decides how drift candidates are raised, which section is revisited, and what is preserved untouched. Questions and pushback still come from `references/interview.md`, applied as if this were a first run.

## Phase 3: Downstream handoff

Note in one line where the file lives and that `ce-ideate`, `ce-brainstorm`, and `ce-plan` pick it up as grounding on their next run. If no downstream skill has run here yet, suggest `ce-ideate` or `ce-brainstorm` as a next step.
