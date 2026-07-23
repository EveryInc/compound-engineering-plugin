---
name: ce-strategy
description: "Create or update STRATEGY.md. Use when starting a product, or changing direction or roadmap."
argument-hint: "[optional: section to revisit, e.g. 'metrics' or 'approach']"
---

# Product Strategy

`ce-strategy` produces and maintains `STRATEGY.md` - a short, durable anchor document that captures what the product is, who it serves, how it succeeds, and where the team is investing. It lives at the repo root as a canonical, well-known file (peer of `README.md`). Downstream skills (`ce-ideate`, `ce-brainstorm`, `ce-plan`) read it as grounding when it exists.

## Interaction Method

Default to the platform's blocking question tool: `AskUserQuestion` in Claude Code (call `ToolSearch` with `select:AskUserQuestion` first if its schema isn't loaded), `request_user_input` in Codex, `ask_question` in Antigravity CLI (`agy`), `ask_user` in Pi (requires the `pi-ask-user` extension). Fall back to numbered options in chat only when no blocking tool exists in the harness or the call errors (e.g., Codex edit modes) — not because a schema load is required. Never silently skip the question.

Ask one question at a time. Prefer free-form responses for the substantive sections (problem, approach, persona); reserve single-select for routing decisions (which section to revisit). Each option label must be self-contained.

## Core Principles

1. **Anchor, not plan.** Strategy is what the product is and why. Features belong in `ce-brainstorm`; schedules belong in the issue tracker. Do not let either creep into the doc.
2. **Short is a feature.** Push back on expansion - the section list is locked.

## Execution Flow

### Phase 0: Route by File State

Read `STRATEGY.md`. Missing -> first run, go to Phase 1. Present -> update in place (never overwrite wholesale), go to Phase 2.

Any argument this skill was invoked with — whether the user gave it directly or a calling skill passed it — is an optional focus: if it names a section (`metrics`, `approach`, `tracks`), go straight to that section. With no argument, let the file state decide the path.

### Phase 1: First-Run Interview

Read `references/interview.md`. This load is non-optional - the pushback rules, anti-pattern examples, and quality bar for each section live there. Improvising from memory produces a passive transcription instead of a strategy doc. Run the interview in its section order.

If the run is non-interactive (no user available to answer), do not invent answers: report which sections need an interview and stop without writing.

When the required sections (1-5) are captured, read `references/strategy-template.md`, fill it in, and write `STRATEGY.md`. Then show the captured sections in chat and invite corrections; apply any and rewrite.

### Phase 2: Update Run

Read the existing `STRATEGY.md` thoroughly. Summarize current state in 3-5 lines so the user sees what is on file.

If the argument named a specific section, jump to that section in `references/interview.md`. Preserve all other sections exactly. Apply pushback as if this were a first run - do not rubber-stamp existing weak content just because it is already written.

If no section was named, ask which section to revisit, using the section names in the existing doc as the options.

For each revisited section, re-interview with full pushback. For sections the user confirms are still accurate, leave them untouched. Update the `last_updated` value in the YAML frontmatter to today's ISO date.

Write the updated doc back to `STRATEGY.md`.

### Phase 3: Downstream Handoff

After writing, note in one line where the file lives and that `ce-ideate`, `ce-brainstorm`, and `ce-plan` will pick it up as grounding on their next run.

If no downstream skill has run yet on this repo, suggest `ce-ideate` or `ce-brainstorm` skills as a next step.
