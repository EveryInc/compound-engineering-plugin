# `ce-compound`

> Document a recently solved problem so the next encounter takes minutes instead of hours. Knowledge compounds.

`ce-compound` is the **knowledge-capture** skill. After you solve a non-trivial problem, this skill writes a structured doc to `docs/solutions/` covering symptoms, root cause, what didn't work, the working solution, and prevention strategies. Future runs of `ce-plan`, `ce-ideate`, `ce-debug`, and `ce-work` consult this folder as institutional memory — so the same investigation never has to happen twice.

The compound-engineering ideation chain is `/ce-ideate → /ce-brainstorm → /ce-plan → /ce-work`. `ce-compound` is the **closing loop** — captured at the end of a debugging or build session, the doc feeds back upstream as grounding for future runs. The first time you solve "N+1 query in brief generation" takes 30 minutes of research; the second time, you find the doc and the fix takes 2 minutes.

---

## TL;DR

| Question | Answer |
|----------|--------|
| What does it do? | Documents a solved problem to `docs/solutions/[category]/[filename].md` with structured frontmatter, bug-track or knowledge-track sections, and cross-references |
| When to use it | After solving a non-trivial problem; when the user says "that worked", "it's fixed", "problem solved" |
| What it produces | One doc in `docs/solutions/`, plus an optional small edit to `AGENTS.md`/`CLAUDE.md` for discoverability |
| What's next | Optional `/ce-compound-refresh` if the new learning suggests an older doc may be stale |

---

## The Problem

Most teams solve the same problem twice — sometimes with the same person — because the first solution lives in conversation, chat history, or a teammate's head. Common failure shapes:

- **Solution lives in chat** — Slack thread, Linear comment, agent transcript; gone in a week
- **Documented but undiscoverable** — written to a wiki nobody searches, or `docs/solutions/` exists but agents don't know to check it
- **Rewritten when re-encountered** — a slightly different doc gets created for the same problem, and now there are two docs that will drift
- **No anti-patterns captured** — what *didn't* work is the most expensive part of the investigation, and it's the first thing to disappear
- **Captured at session-end clutter, not session-end clarity** — the doc gets written when context is already faded

## The Solution

`ce-compound` runs as a structured capture flow at the moment context is freshest:

- Two modes — **Full** (parallel subagents for cross-referencing and duplicate detection) and **Lightweight** (single-pass, faster, fewer tokens)
- Bug track and knowledge track produce different section structures matched to the doc type
- An overlap check decides whether to update an existing doc rather than create a duplicate
- A discoverability check ensures the project's `AGENTS.md`/`CLAUDE.md` surfaces `docs/solutions/` so future agents find it
- Specialized agent reviews (kieran reviewer, code simplicity, performance/security/data integrity) optionally enhance the doc

---

## What Makes It Novel

### 1. Two modes — Full vs Lightweight

**Full mode** runs three research subagents in parallel (Context Analyzer / Solution Extractor / Related Docs Finder), then optionally a foreground Session Historian (off by default — searches your prior sessions across Claude Code, Codex, Cursor for related context). Cross-references existing docs, detects duplicates, runs specialized reviews.

**Lightweight mode** does the same documentation in a single pass, no subagents, no cross-referencing. Faster, fewer tokens. Best for simple fixes or when context is tight.

User picks the mode explicitly — the skill never auto-selects.

### 2. Bug track vs knowledge track — different structures for different shapes

The skill classifies the work into one of two tracks based on `problem_type`:

- **Bug track** — Symptoms, What Didn't Work, Solution, Why This Works, Prevention. Used for build errors, test failures, runtime errors, performance issues, integration issues, etc.
- **Knowledge track** — Context, Guidance, Why This Matters, When to Apply, Examples. Used for architecture patterns, design patterns, tooling decisions, conventions, workflow practices.

The track determines section order and frontmatter fields. Forcing bug-track fields onto a knowledge-track learning (or vice versa) produces docs that are structurally wrong for their content.

### 3. Overlap detection — update existing docs instead of creating duplicates

The Related Docs Finder scores overlap with existing `docs/solutions/` content across five dimensions: problem statement, root cause, solution approach, referenced files, prevention rules.

- **High overlap** (4-5 dimensions match) → **update the existing doc** with fresher context. The existing path stays the same; a `last_updated` field is added. Two docs describing the same problem inevitably drift.
- **Moderate overlap** (2-3 dimensions match) → create the new doc, flag for consolidation review (potential `ce-compound-refresh` trigger).
- **Low or none** → create the new doc normally.

### 4. Discoverability check — knowledge only compounds if agents can find it

Every run checks whether the project's instruction file (`AGENTS.md` or `CLAUDE.md`) would lead a future agent to discover `docs/solutions/`. If not, it proposes the smallest addition that surfaces the knowledge store, asks for consent, and applies it. The check runs every time because the knowledge store only compounds value when it's findable.

The proposed addition matches the existing file's tone and density — a single-line entry in an existing directory listing when one fits, a small headed section only when nothing else does.

### 5. Selective refresh trigger

After capturing the new learning, `ce-compound` checks whether it should invoke `/ce-compound-refresh` on a narrow scope hint. It does NOT default to running refresh — only when the new learning suggests a specific older doc may now be stale (contradicted, superseded, or in a domain that just got refactored).

### 6. Specialized post-review

Based on the problem type, optional specialized agents review the documentation: `ce-performance-oracle` for performance issues, `ce-security-sentinel` for security, `ce-data-integrity-guardian` for database, and a stack-matched `ce-kieran-rails-reviewer` / `ce-kieran-python-reviewer` / `ce-kieran-typescript-reviewer` for code-heavy issues plus `ce-code-simplicity-reviewer` always.

### 7. Session history integration (opt-in)

Full mode optionally dispatches `ce-session-historian` to search prior sessions across harnesses for related context — what was tried before, what didn't work, key decisions. Findings are folded into "What Didn't Work" (bug track) or "Context" (knowledge track). Off by default because of token cost; the user explicitly opts in.

### 8. Auto-invoke triggers

Phrases like "that worked", "it's fixed", "working now", "problem solved" auto-invoke the skill so capture happens at the moment context is freshest. The user can override with `/ce-compound [context]` to capture immediately.

---

## Quick Example

You've just spent 45 minutes debugging an N+1 query in the brief-generation flow. You confirm the fix works and say "that worked, ship it."

`ce-compound` auto-invokes (or you call it explicitly). It asks whether to use Full or Lightweight mode, then whether to also search session history. You pick Full, no session history.

Three subagents dispatch in parallel: Context Analyzer reads conversation history, classifies as `performance_issue` (bug track), proposes the filename and category. Solution Extractor structures the fix with before/after code. Related Docs Finder greps `docs/solutions/` for related issues, reports moderate overlap with an older doc on a different N+1 case.

The orchestrator assembles the doc, validates frontmatter via the YAML safety script, and writes `docs/solutions/performance-issues/n-plus-one-brief-generation.md`. The discoverability check finds `AGENTS.md` doesn't mention `docs/solutions/`, proposes a one-line addition to the existing directory listing, and applies it after you confirm.

Phase 3 dispatches `ce-performance-oracle` and `ce-kieran-rails-reviewer` to validate the code examples and approach. Phase 2.5 surfaces a refresh recommendation: the older N+1 doc may benefit from consolidation review. The skill suggests `/ce-compound-refresh n-plus-one` as a narrow scope hint and ends.

---

## When to Reach For It

Reach for `ce-compound` when:

- You just solved a non-trivial problem and the context is fresh
- The user says "that worked", "it's fixed", "working now", "problem solved"
- You're at a natural pause and want to capture the learning before context fades
- The problem took meaningful investigation (not a typo or one-line fix)

Skip `ce-compound` when:

- The problem is in-progress or the solution is unverified
- The fix is a trivial typo or obvious error with no generalizable insight
- The work is purely mechanical (formatting, dependency bumps)

---

## Use as Part of the Workflow

`ce-compound` is the closing loop of multiple workflows:

- **`/ce-debug` Phase 4** — after a successful fix and PR, optionally offers `ce-compound` when the bug is generalizable (3+ recurrence, wrong assumption about a shared dependency)
- **`/ce-work` Phase 4** — after shipping, surfaces `ce-compound` when the work yielded a reusable pattern, convention, or tooling decision
- **Stand-alone** — invoked directly after any non-trivial problem-solving session

The output feeds back into upstream skills:

- `/ce-plan` reads `docs/solutions/` via `ce-learnings-researcher` during Phase 1 research
- `/ce-ideate` reads it as part of the comprehensive grounding step
- `/ce-debug` reads it for prior context when an issue tracker reference is fetched

When the new learning suggests an older doc may now be stale, `ce-compound` recommends `/ce-compound-refresh` with a narrow scope hint.

---

## Use Standalone

The skill is its own complete cycle:

- **Just-finished problem** — `/ce-compound` (or auto-invoked from "that worked")
- **With context hint** — `/ce-compound "the email digest race condition we fixed"`
- **Lightweight on a long session** — when context is tight, pick lightweight mode at the prompt

The auto-invoke triggers happen mid-conversation; you don't need to remember the slash command if you've just confirmed something works.

---

## Output Artifact

```text
docs/solutions/[category]/[filename].md
```

Categories are auto-detected. Bug-track examples: `build-errors/`, `test-failures/`, `runtime-errors/`, `performance-issues/`, `database-issues/`, `security-issues/`, `ui-bugs/`, `integration-issues/`, `logic-errors/`. Knowledge-track examples: `architecture-patterns/`, `design-patterns/`, `tooling-decisions/`, `conventions/`, `workflow-issues/`, `developer-experience/`, `documentation-gaps/`, `best-practices/`.

The doc carries YAML frontmatter (`module`, `tags`, `problem_type`, etc.) for searchability. Validation runs through `scripts/validate-frontmatter.py` to catch silent corruption (malformed `---` delimiters, unquoted `:` in scalar values).

The skill may also produce a small edit to `AGENTS.md`/`CLAUDE.md` if the discoverability check finds the knowledge store isn't surfaced.

---

## Reference

| Argument | Effect |
|----------|--------|
| _(empty)_ | Document the most recent fix using conversation context |
| `<brief context>` | e.g., "the email digest race condition we fixed" — focuses the capture |

Auto-invoke triggers: phrases like "that worked", "it's fixed", "working now", "problem solved" anywhere in conversation.

---

## FAQ

**Why two modes?**
Full mode is for most cases — the parallel subagents catch duplicates, find related docs, and run specialized reviews. Lightweight mode exists for simple fixes or sessions running tight on context, where the deep cross-referencing isn't worth the token cost.

**What's the difference between bug track and knowledge track?**
Bug track captures incident-level fixes — "X broke, here's why and how we fixed it." Knowledge track captures durable guidance — "this is how we do X here, and why." The two have different audiences and structures: bug track has Symptoms / What Didn't Work / Solution; knowledge track has Context / Guidance / When to Apply.

**Why auto-update docs instead of always creating new?**
Two docs describing the same problem inevitably drift apart. The newer context is fresher and more trustworthy, so the skill folds it into the existing doc. The result is one canonical doc that improves over time, not a thicket of partially-overlapping docs that need consolidation later.

**Does it work in non-software contexts?**
Knowledge track generalizes (conventions, decisions, workflow practices), but the skill assumes a code repo, `docs/solutions/` directory, and YAML-frontmatter conventions. It's primarily a software-team tool.

**What if I don't want the discoverability edit to AGENTS.md?**
The skill asks for consent before applying the edit. You can decline; the doc still gets written. The discoverability prompt won't fire if your AGENTS.md already mentions `docs/solutions/`.

---

## See Also

- [`ce-compound-refresh`](./ce-compound-refresh.md) — maintain `docs/solutions/` over time as the codebase evolves
- [`ce-debug`](./ce-debug.md) — common upstream caller after a fix is verified
- [`ce-work`](./ce-work.md) — common upstream caller after shipping
- [`ce-plan`](./ce-plan.md) — reads `docs/solutions/` as institutional memory during planning
- [`ce-ideate`](./ce-ideate.md) — reads `docs/solutions/` as part of grounding
