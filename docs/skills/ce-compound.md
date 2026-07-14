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
| What it produces | One doc in `docs/solutions/`, plus optional `CONCEPTS.md` vocabulary capture; interactive Full may also edit `AGENTS.md`/`CLAUDE.md` for discoverability after consent |
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
- A discoverability check ensures the project's `AGENTS.md`/`CLAUDE.md` surfaces `docs/solutions/` so future agents find it (interactive Full asks consent before editing; headless and lightweight report or tip only)
- Specialized post-review optionally enhances the doc: performance, security, data-integrity, and read-only simplification checks review the drafted learning without mutating product code

---

## What Makes It Novel

### 1. Two modes — Full vs Lightweight, agent-selected

**Full mode** runs three research subagents in parallel (Context Analyzer / Solution Extractor / Related Docs Finder), plus an automatic session-history probe that searches your prior sessions across Claude Code, Codex, and Cursor for related context. Cross-references existing docs, detects duplicates, runs specialized reviews.

**Lightweight mode** does the same documentation in a single pass, no subagents, no cross-referencing. Faster, fewer tokens.

**The skill picks the mode itself — it does not ask.** Full is the default because its token cost is small next to the work that produced the learning; Lightweight is chosen only under real context pressure (session near its limit, or a trivial fix where cross-referencing adds nothing). Those are conditions the agent can observe and the user can't, so a prompt would just ask you to guess. The skill states which mode it ran, and why, on the first line of its output; if it guessed wrong for your taste, re-running is a cheap correction.

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

Every run checks whether the project's instruction file (`AGENTS.md` or `CLAUDE.md`) would lead a future agent to discover `docs/solutions/`. If not, interactive Full proposes the smallest addition that surfaces the knowledge store, asks for consent, and applies it. Headless reports `Instruction-file edit: gap noted, not applied` without editing — skill-to-skill handoffs must not amend the repo's operating contract past an upstream approval gate. Lightweight tips only. The check runs every time because the knowledge store only compounds value when it's findable.

The proposed addition matches the existing file's tone and density — a single-line entry in an existing directory listing when one fits, a small headed section only when nothing else does.

### 5. Grounding validation — claims are verified against the tree before they compound

A solution doc is only as valuable as its claims are true, and drafting from conversation evidence invites three failure shapes: code-behavior claims written from a session-level summary instead of the source, "fixed in X" claims about merges the current checkout can't see, and drafting scaffold ("Learning 3") leaking into the written doc.

Phase 2.45 closes this in two layers. A deterministic script (`scripts/validate-doc-claims.py`) checks cited repo paths, commit SHAs (classified by reachability from HEAD vs the upstream default branch, so a stale checkout is distinguished from a fabricated citation), relative links, and dangling scaffold — its flags are adjudicated, not auto-failed, because a doc may legitimately cite a path deleted by the very fix it documents. Then a read-only validator subagent (Full and headless modes) verifies code-behavior claims by quoting the defining source line, merge-state claims against remote truth (`gh` primary, local git fallback), and internal completeness of countable assertions. The same discipline applies at draft time: the Solution Extractor must read the defining line before asserting behavior, and cite PR numbers over rebase-fragile SHAs.

### 6. Selective refresh trigger

After capturing the new learning, `ce-compound` checks whether it should invoke `/ce-compound-refresh` on a narrow scope hint. It does NOT default to running refresh — only when the new learning suggests a specific older doc may now be stale (contradicted, superseded, or in a domain that just got refactored).

### 7. Specialized post-review

Based on the problem type, optional skill-local prompt assets review the documentation: `performance-oracle` for performance issues, `security-sentinel` for security, and `data-integrity-guardian` for database-oriented issues. Code-heavy docs may also get a read-only simplification review of the drafted examples and explanatory claims; this does not invoke `ce-simplify-code` and does not mutate product code.

### 8. Session history integration (automatic probe, not a question)

Searching prior sessions pays off when an *unrelated* earlier session holds related problem-solving — something neither the agent nor the user can know a priori, which is why it was a poor fit for a yes/no prompt. Full mode instead resolves it with a cheap two-stage probe: a discovery+metadata pass always runs (in parallel with the research subagents, so it's near-free on wall-clock), and it escalates to the expensive extraction+synthesis only when a candidate session clears a relevance bar — a current-branch match or ≥2 topic-keyword hits. On a hit, findings fold into "What Didn't Work" (bug track) or "Context" (knowledge track); on a miss, the run records "no relevant prior sessions" and moves on. The gate is what keeps an always-on probe cheap — cheap enough that headless runs it too, since it prompts for nothing and so preserves headless's non-interactive contract. Only lightweight mode skips it entirely.

### 9. Auto-invoke triggers

Phrases like "that worked", "it's fixed", "working now", "problem solved" auto-invoke the skill so capture happens at the moment context is freshest. The user can override with `/ce-compound [context]` to capture immediately.

---

## Quick Example

You've just spent 45 minutes debugging an N+1 query in the brief-generation flow. You confirm the fix works and say "that worked, ship it."

`ce-compound` auto-invokes (or you call it explicitly). With plenty of context left, it silently picks Full mode and notes "Ran Full mode." at the top of its output — no prompt.

Three subagents dispatch in parallel: Context Analyzer reads conversation history, classifies as `performance_issue` (bug track), proposes the filename and category. Solution Extractor structures the fix with before/after code. Related Docs Finder greps `docs/solutions/` for related issues, reports moderate overlap with an older doc on a different N+1 case. Alongside them, the session-history probe scans your recent sessions; none clear the relevance bar, so it records "no relevant prior sessions" without paying for synthesis.

The orchestrator assembles the doc, validates frontmatter via the YAML safety script, and writes `docs/solutions/performance-issues/n-plus-one-brief-generation.md`. Grounding validation then runs: the mechanical script confirms every cited path and SHA resolves, and the validator subagent quotes the defining source line behind the doc's claim about the ORM's default batching behavior. The discoverability check finds `AGENTS.md` doesn't mention `docs/solutions/`, proposes a one-line addition to the existing directory listing, and applies it after you confirm.

Phase 3 dispatches the local `performance-oracle` prompt and, because the doc includes code examples, performs a read-only simplification check on the drafted examples and approach. Phase 2.5 surfaces a refresh recommendation: the older N+1 doc may benefit from consolidation review. The skill suggests `/ce-compound-refresh n-plus-one` as a narrow scope hint and ends.

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

- `/ce-plan` reads `docs/solutions/` via `learnings-researcher` during Phase 1 research
- `/ce-ideate` reads it as part of the comprehensive grounding step
- `/ce-debug` reads it for prior context when an issue tracker reference is fetched

When the new learning suggests an older doc may now be stale, `ce-compound` recommends `/ce-compound-refresh` with a narrow scope hint.

---

## Use Standalone

The skill is its own complete cycle:

- **Just-finished problem** — `/ce-compound` (or auto-invoked from "that worked")
- **With context hint** — `/ce-compound "the email digest race condition we fixed"`
- **Lightweight on a long session** — when context is tight, the skill selects lightweight mode on its own and says so in its output

The auto-invoke triggers happen mid-conversation; you don't need to remember the slash command if you've just confirmed something works.

---

## Make Capture Automatic

The auto-invoke trigger phrases ("that worked", "it's fixed") only fire when you happen to say one of them. If you keep forgetting to capture, add a standing instruction to your agent's instruction file so the agent proposes capture on its own once a fix is verified — before it hands the session back to you.

Put it in the repo's `AGENTS.md`/`CLAUDE.md`, or in your global instruction file (`~/.claude/CLAUDE.md`, `~/.codex/AGENTS.md`) to make it apply in every repo. Pick the variant that matches how much of a checkpoint you want:

**Offer first** — the agent asks before capturing, so you get a beat to say "not this one":

> After a solved, verified problem produces a non-trivial, reusable learning, offer once — before the final handoff — to invoke the `ce-compound` skill. Only in repositories that accept `docs/solutions/` as a tracked knowledge store.

**Run it automatically** — no prompt, because not being interrupted is the whole point of automating it:

> After a solved, verified problem produces a non-trivial, reusable learning, automatically invoke the `ce-compound` skill, passing `mode:headless` as the skill argument. Only in repositories that accept `docs/solutions/` as a tracked knowledge store.

Auto-run writes to `docs/solutions/` (and may touch `CONCEPTS.md`) without asking — but that's the point, and it's no scarier than the other edits you're already making on the branch and reviewing before you commit. Headless never edits `AGENTS.md`/`CLAUDE.md`; if discoverability is missing it reports `gap noted, not applied` so a later interactive run can apply it with consent. Passing `mode:headless` as an argument is the explicit, unambiguous form: the skill also honors a clear "run headless / without prompts" request, but the token removes all doubt — without a headless signal the run stays interactive and can stop for the one-time discoverability-consent prompt.

Every other phrase in those lines is deliberate too:

- **"invoke the `ce-compound` skill"**, not "run `/ce-compound`" — instruction files are read by whatever agent you're using (Codex, Gemini, Cursor, Claude Code), and the slash-command form isn't reliably agent-callable across all of them. Reference the capability, not the keystroke.
- **"before the final handoff"**, not "at the end of the session" — an agent can't reliably tell when a session has *ended*, but it does know when it's about to hand a verified result back to you.
- **"non-trivial, reusable learning"** — the bar is a generalizable insight worth re-reading, not merely an expensive one-off incident.
- **"repositories that accept `docs/solutions/`"** — the real question is whether the repo welcomes generated learning docs, which is usually broader than "do I own it." Forks and open-source projects you contribute to often don't; some repos you don't own still do.

---

## Output Artifact

```text
docs/solutions/[category]/[filename].md
```

Categories are auto-detected. Bug-track examples: `build-errors/`, `test-failures/`, `runtime-errors/`, `performance-issues/`, `database-issues/`, `security-issues/`, `ui-bugs/`, `integration-issues/`, `logic-errors/`. Knowledge-track examples: `architecture-patterns/`, `design-patterns/`, `tooling-decisions/`, `conventions/`, `workflow-issues/`, `developer-experience/`, `documentation-gaps/`, `best-practices/`.

The doc carries YAML frontmatter (`module`, `tags`, `problem_type`, etc.) for searchability. Validation runs through `scripts/validate-frontmatter.py` to catch silent corruption (malformed `---` delimiters, unquoted `:` in scalar values), and `scripts/validate-doc-claims.py` checks the body's cited paths, SHAs, links, and drafting scaffold against the tree.

In interactive Full mode, the skill may also produce a small edit to `AGENTS.md`/`CLAUDE.md` if the discoverability check finds the knowledge store isn't surfaced and you consent. Headless and lightweight never apply that edit.

---

## Reference

| Argument | Effect |
|----------|--------|
| _(empty)_ | Document the most recent fix using conversation context |
| `<brief context>` | e.g., "the email digest race condition we fixed" — focuses the capture |

Auto-invoke triggers: phrases like "that worked", "it's fixed", "working now", "problem solved" anywhere in conversation.

---

## FAQ

**Why two modes, and why doesn't it ask me which one?**
Full mode is for most cases — the parallel subagents catch duplicates, find related docs, and run specialized reviews. Lightweight mode exists for simple fixes or sessions running tight on context, where the deep cross-referencing isn't worth the token cost. The skill picks between them itself rather than prompting, because the deciding factor (how much context budget is left) is something the agent can see and you can't — asking would just make you guess. It reports the choice in its output, and re-running is a cheap correction if it guessed wrong.

**What's the difference between bug track and knowledge track?**
Bug track captures incident-level fixes — "X broke, here's why and how we fixed it." Knowledge track captures durable guidance — "this is how we do X here, and why." The two have different audiences and structures: bug track has Symptoms / What Didn't Work / Solution; knowledge track has Context / Guidance / When to Apply.

**Why auto-update docs instead of always creating new?**
Two docs describing the same problem inevitably drift apart. The newer context is fresher and more trustworthy, so the skill folds it into the existing doc. The result is one canonical doc that improves over time, not a thicket of partially-overlapping docs that need consolidation later.

**Does it work in non-software contexts?**
Knowledge track generalizes (conventions, decisions, workflow practices), but the skill assumes a code repo, `docs/solutions/` directory, and YAML-frontmatter conventions. It's primarily a software-team tool.

**What if I don't want the discoverability edit to AGENTS.md?**
In interactive Full mode, the skill asks for consent before applying the edit — decline and the doc still gets written. Headless and lightweight never edit the instruction file; they report or tip the gap instead. The discoverability prompt won't fire if your AGENTS.md already mentions `docs/solutions/`.

---

## See Also

- [`ce-compound-refresh`](./ce-compound-refresh.md) — maintain `docs/solutions/` over time as the codebase evolves
- [`ce-debug`](./ce-debug.md) — common upstream caller after a fix is verified
- [`ce-work`](./ce-work.md) — common upstream caller after shipping
- [`ce-plan`](./ce-plan.md) — reads `docs/solutions/` as institutional memory during planning
- [`ce-ideate`](./ce-ideate.md) — reads `docs/solutions/` as part of grounding
