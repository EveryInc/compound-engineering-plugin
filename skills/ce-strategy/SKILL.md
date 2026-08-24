---
name: ce-strategy
description: "Create or update STRATEGY.md. Use when starting a product, adding a strategy doc to an existing repo, changing direction or roadmap, or when ce-ideate, ce-brainstorm, or ce-plan need upstream product grounding."
argument-hint: "[optional: section to revisit, e.g. 'metrics' or 'approach']"
---

# Product Strategy

**The current year is 2026** - use it when dating the document.

`ce-strategy` writes and maintains its part of `STRATEGY.md` - the repo-root project document that captures what the project is, who it serves, how it succeeds, and where the team is investing. The file is shared with other tools and people; this skill owns only the sections `references/strategy-template.md` names. Downstream skills read it when it exists: `ce-ideate`, `ce-brainstorm`, and `ce-plan` for what work is on-strategy; `ce-product-pulse` for the product name and key metrics; `ce-dogfood` for the primary persona. Its frontmatter keys and this skill's section headings are the contract those skills parse - keep them for every section this skill authors; a meaning an existing section already carries is merged into it (`references/update-run.md`).

**Done:** `STRATEGY.md` exists at the repo root and the user has seen what will be written and had an edit pass. For a file in this skill's house format, every required section is filled from answers that survived pushback (or explicitly deferred to a linked legacy doc) and the file matches `references/strategy-template.md`. For a file in any other shape, done is the user-approved minimal edits applied, with the document's shape unchanged. A section the user could not sharpen in two rounds is written as given and named in chat as worth revisiting - a completed run, not a blocked one.

## Boundaries

- **Anchor, not plan.** Strategy is what the product is and why. Features belong in `ce-brainstorm`, schedules and prioritization in the issue tracker, implementation plans in `ce-plan`; do not let them creep into the doc, and do not update the tracker or reconcile in-flight work.
- **The user answers; the repo only grounds the question.** Evidence earns a sharper question, never fills in a section. Do not derive the strategy from the repo.
- **Short is a feature.** Push back on expansion rather than adding sections.
- **Record which metrics matter and where they live**, not what they read today.
- **Meaning is the contract; the shape belongs to whoever created the doc.** A file that is solely this skill's - `references/update-run.md` states the test - is maintained in house format on every write: headings renamed, sections in the template's current order, missing required sections offered; do not treat it as multi-writer merely because the file is shared in principle. A file in any other shape - hand-written, from another tool - is read by meaning and edited in its own shape and idiom: no restructuring into the template, no uninvited frontmatter or headings. Either way a section carrying an author-approved marker (e.g. `<!-- <tool>: author-approved 2026-07-10 -->`), or a doc the user does not own, is not edited at all - report the conflict, or write a separate file that links to it - and a targeted update preserves every other section's content exactly, its place following that ownership test (a solely-owned file takes the template's order; a multi-writer file is never reordered). `references/update-run.md` owns the rest and is a required read before you edit an existing file.

## Asking and routing

Ask one question at a time through the host's blocking question tool already in the current tool list. Match by capability; never probe a user-facing tool to discover it. Fall back to numbered options on the visible chat surface only when no such tool is listed or a real question call errors. Never silently skip the question.

Any argument this skill was invoked with — present in the current prompt or conversation, from the user or a calling skill — is a focus hint: a section to revisit (`metrics`, `positioning`, `tracks`; older names such as `approach` or `who it's for` map to the current section) or a scope hint. With none, proceed open-ended and let the file state decide the path.

## Phase 0: Ground and route

Phase 0 produces a repo model and a route, whatever the harness reads. `references/grounding.md` is a non-optional load: it carries the full source list and the wording of the disagreement question and the focus hint.

**The repo model** is your working understanding of what this product is. Read `STRATEGY.md` if it exists. Take what the product is from its stated intent and structure - README, `CONCEPTS.md`, `docs/`, sibling docs such as `PRODUCT.md`, what the code is organized around - and bound that read to "what is this and who is it for" rather than profiling the whole repo. Take what is getting attention now from recent commits or PRs. Attention informs only the Tracks question and staleness in an update run; where it disagrees with stated intent, that is a question for the user, never a conclusion. Show the model in chat before the first question: three to five lines on what you take the product to be, who it seems to serve, and where attention has gone, each with its source named, and invite correction. If the model did not supply the product's name, ask for it here - the template's frontmatter and title need it. A repo with no substantive content is a normal path: say so in one line and run the interview ungrounded.

**The route** is announced in one line by file state: no file -> Phase 1 ("Strategy doc not found - let's write it."), after the legacy-sibling offer in `references/grounding.md` when one applies; file exists -> Phase 2 ("Found existing strategy - let's review and update.").

## Phase 1: First-run interview

Read `references/interview.md` before the first question - a non-optional load. The opening questions, pushback rules, anti-pattern examples, quality bar, blocking-question tool per host, and the two-round cap live there; improvising from memory produces a passive transcription instead of a strategy doc.

Run the interview in this order (the document itself follows the template's order; Boundaries is asked after the stress test, where its content comes from):

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

Read `references/update-run.md` first - a non-optional load, before the summary, the drift check, or any question. It decides how drift candidates are raised, which section is revisited, and what is preserved untouched. An update run summarizes the file's current state in 3-5 lines, and names any section the repo model suggests is stale as a candidate rather than a verdict. It then revisits the section the focus hint named, or the one the user picks when asked. The user may pick any section; list the drift candidates first, as suggestions rather than as the only choices. Every other section's content is left untouched, and its place follows the ownership test in `references/update-run.md`. Questions and pushback still come from `references/interview.md`, applied as if this were a first run.

## Phase 3: Downstream handoff

Note in one line where the file lives and that `ce-ideate`, `ce-brainstorm`, and `ce-plan` pick it up as grounding on their next run. If no downstream skill has run here yet, suggest `ce-ideate` or `ce-brainstorm` as a next step.
