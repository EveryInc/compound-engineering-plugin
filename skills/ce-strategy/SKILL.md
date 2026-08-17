---
name: ce-strategy
description: "Create or update STRATEGY.md. Use when starting a product, adding a strategy doc to an existing repo, changing direction or roadmap, or when ce-ideate, ce-brainstorm, or ce-plan need upstream product grounding."
argument-hint: "[optional: section to revisit, e.g. 'metrics' or 'approach']"
---

# Product Strategy

**Note: The current year is 2026.** Use this when dating the strategy document.

`ce-strategy` produces and maintains `STRATEGY.md` - a short, durable anchor document that captures what the product is, who it serves, how it succeeds, and where the team is investing. It lives at the repo root as a canonical, well-known file (peer of `README.md`). Downstream skills read it when it exists: `ce-ideate`, `ce-brainstorm`, and `ce-plan` as grounding for what work is on-strategy; `ce-product-pulse` for the product name and key metrics; `ce-dogfood` for the primary persona. Its frontmatter keys and section headings are the contract those skills parse - keep them exactly as the template writes them.

**Done:** `STRATEGY.md` exists at the repo root with every required section filled from answers that survived pushback, the user has seen the full draft and had one edit pass, and the file matches `references/strategy-template.md`. A section the user could not sharpen in two rounds is written as given and named in chat as worth revisiting - that is a completed run, not a blocked one.

The document is short and structured on purpose. Good answers to a handful of sharp questions produce a better strategy than any amount of prose. This skill grounds itself in what the repo already says the product is, asks those questions, pushes back on weak answers, and writes the doc.

## Interaction Method

Default to the platform's blocking question tool: `AskUserQuestion` in Claude Code (call `ToolSearch` with `select:AskUserQuestion` first if its schema isn't loaded), `request_user_input` in Codex, `ask_question` in Antigravity CLI (`agy`), `ask_user` in Pi (requires the `pi-ask-user` extension). Fall back to numbered options in chat only when no blocking tool exists in the harness or the call errors (e.g., Codex edit modes) — not because a schema load is required. Never silently skip the question.

Ask one question at a time. Prefer free-form responses for the substantive sections (problem, approach, persona); reserve single-select for routing decisions (which section to revisit). Each option label must be self-contained.

## Focus Hint

The **focus hint** is any optional argument this skill was invoked with — present in the current prompt or conversation, whether the user gave it directly or a calling skill passed it (empty if none was given).

Interpret any argument as an optional focus: a section name to revisit (`metrics`, `positioning`, `tracks`; older names such as `approach` or `who it's for` map to the current section) or a scope hint. With no argument, proceed open-ended and let the file state decide the path.

## Core Principles

1. **Anchor, not plan.** Strategy is what the product is and why. Features belong in `ce-brainstorm`; schedules belong in the issue tracker. Do not let either creep into the doc.
2. **Grounded, not blank-slate.** Most repos already say what the product is - in the README, the docs, the shape of the code. Read that first so the interview opens from a working model instead of an empty page. The user's answer still decides every section; evidence earns the right to ask a sharper question, never to fill in a section on its own.
3. **Rigor in the questions, not the headings.** The section headers are plain English. The interview questions enforce strategy discipline.
4. **Short is a feature.** The template is constrained. Adding sections costs more than it looks like. Push back on expansion.
5. **Durable across runs.** This skill is rerunnable. On a second run it updates in place, preserves what is working, and only challenges sections that look stale or weak.
6. **Meaning is the contract; shape belongs to whoever created the doc.** When this skill creates `STRATEGY.md`, it writes the house format in `references/strategy-template.md`. When a doc already exists - written by an earlier version, by hand, or by another skill - adapt to it: read it by meaning (a section counts as present when the doc expresses it anywhere, under any heading or in prose), make only additive or minimal changes in its own idiom, and never restructure it, add frontmatter or headings uninvited, or duplicate a meaning under a new heading. Sections this skill did not write are someone else's captured intent: leave them in place; if this run learned something that makes one false, make the smallest edit that keeps its intent true and say so in chat. A section marked as approved by its author (for example `<!-- vision: author-approved 2026-07-10 -->`), or a doc the user does not own, is not edited at all - report the conflict, or write to a separate file with a link, and leave the rest to its owner. The worst outcome is turning someone's existing doc into this template and breaking what already reads it.

## Execution Flow

### Phase 0: Ground and Route

Read `STRATEGY.md` using the native file-read tool.

Then build a **repo model** - your working understanding of what this product is - from what the repo states and how it is built. Two inputs with two different jobs:

- **What the product is.** Stated intent (README, `CONCEPTS.md`, `docs/` such as plans, brainstorms, and solutions, an existing `STRATEGY.md`, and sibling product docs another skill may have written - `PRODUCT.md`, `VISION.md`) and structure (what the code is organized around, what is public, what is tested). This is the authority for the problem, approach, and persona questions. Bound the read to what answers "what is this and who is it for" - do not profile the whole repo.
- **What is getting attention now.** Recent commits or PRs. This informs only the Tracks question and staleness in an update run. A burst of recent work in one area is a fact about the last few weeks, not about what the product is; where recent focus and stated intent disagree, that is a question for the user ("recent work is mostly in X - is X a track, a temporary push, or unrelated?"), never a conclusion.

If the repo has no substantive content (new or near-empty), say so in one line and run the interview ungrounded - that is a normal path, not a blocker.

Show the repo model in chat before the first question: three to five lines stating what you take the product to be, who it seems to serve, and where recent attention has gone, each with its source named. Invite correction. This is the head start; the interview still runs in full.

Route by file state:

- **File does not exist** -> First run. Go to Phase 1.
- **File exists and argument names a specific section** -> Targeted update. Go to Phase 2.
- **File exists, no argument** -> Open update. Go to Phase 2.

Announce the path in one line: "Strategy doc not found - let's write it." or "Found existing strategy - let's review and update."

### Phase 1: First-Run Interview

Read `references/interview.md`. This load is non-optional - the pushback rules, anti-pattern examples, and quality bar for each section live there. Improvising from memory produces a passive transcription instead of a strategy doc.

Run the interview in the section order of the final document:

1. Purpose
2. Positioning
3. Users
4. Key metrics
5. Tracks
6. Stress test (see below)
7. Boundaries (always written)
8. Milestones (optional)
9. Brand (optional)

For each section, ask the opening question, apply the pushback rules, and capture the final answer in the user's own language. Where the repo model bears on the section, open with what it suggests and ask the user to confirm or correct, and use repo specifics in pushback ("the README says X; you just said Y - which is it?"). Do not skip the pushback step - it is the core of the skill. Two rounds of pushback per section maximum; capture what the user has given after that and note the section is worth revisiting on the next run.

The **stress test** (step 6, defined in `references/interview.md`) checks that the captured answers actually decide things: a few concrete proposals aimed at the draft's fault lines, each answered by the user. An answer the strategy already decides confirms it; an answer it cannot decide sharpens the approach or tracks; a proposal the user resists is a candidate for Boundaries.

When every section is captured, read `references/strategy-template.md`, fill it in, and present the full draft in chat before writing. Offer one round of edits. Then write to `STRATEGY.md`.

### Phase 2: Update Run

Read the existing `STRATEGY.md` thoroughly. Summarize current state in 3-5 lines so the user sees what is on file. A file written by an earlier version uses older headings (`Target problem`, `Our approach`, `Who it's for`, `Not working on`, `Marketing`); treat each as its current section, and on write rename it to the current heading in place - a heading rename, content untouched, mentioned in chat. A file in any other shape is read by meaning and updated in its own shape (principle 6).

Check for drift: compare the doc against the repo model and against what has landed since `last_updated` (recent commits or PRs, plans and learnings under `docs/`). Name any section the evidence suggests is stale, with the evidence, as a candidate - not a verdict.

If the argument named a specific section, jump to that section in `references/interview.md`. Preserve all other sections exactly, including sections this skill did not write. Apply pushback as if this were a first run - do not rubber-stamp existing weak content just because it is already written.

If no specific target, ask the user which section to revisit using the blocking question tool, listing any drift candidates first. Options:

- "Purpose"
- "Positioning"
- "Users"
- "Metrics, tracks, boundaries, or other"

For each revisited section, re-interview with full pushback. For sections the user confirms are still accurate, leave them untouched. Update the `last_updated` value in the YAML frontmatter to today's ISO date.

Write the updated doc back to `STRATEGY.md`.

### Phase 3: Downstream Handoff

After writing, note in one line where the file lives and that `ce-ideate`, `ce-brainstorm`, and `ce-plan` will pick it up as grounding on their next run.

If no downstream skill has run yet on this repo, suggest `ce-ideate` or `ce-brainstorm` skills as a next step.

## What This Skill Does Not Do

- Does not update the issue tracker or reconcile in-flight work. Strategy is the doc; execution lives elsewhere.
- Does not prioritize the backlog. Prioritization is a separate workflow.
- Does not write product requirements or implementation plans - those are `ce-brainstorm` and `ce-plan`.
- Does not compute metric values. It records which metrics matter and where they live, not what they read today.
- Does not derive the strategy from the repo. The repo grounds the questions; the user answers them.

## Learn More

The "Purpose / Positioning / Tracks" structure is informed by Richard Rumelt's *Good Strategy Bad Strategy* - specifically his kernel of diagnosis, guiding policy, and coherent action. The interview questions in `references/interview.md` are designed to push past the patterns he calls "bad strategy": fluff, goals dressed up as strategy, and feature lists in place of a guiding choice. The book is the recommended follow-up reading if the distinction between a slogan and a strategy is not yet sharp.
