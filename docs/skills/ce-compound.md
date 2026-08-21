# `ce-compound`

> Document a recently solved problem so the next encounter takes minutes instead of hours. Knowledge compounds.

`ce-compound` is the **knowledge-capture** skill. After you solve a non-trivial problem, it writes a structured doc to `docs/solutions/` covering symptoms, root cause, what did not work, the working solution, and prevention. Future runs of `ce-plan` and `ce-ideate` consult this folder as institutional memory, so the same investigation does not have to happen twice.

The compound-engineering ideation chain is `/ce-ideate` -> `/ce-brainstorm` -> `/ce-plan` -> `/ce-work`. `ce-compound` is the **closing loop**. Captured at the end of a debugging or build session, the doc feeds back upstream as grounding. The first time you solve "N+1 query in brief generation" takes 30 minutes of research. The second time, you find the doc and the fix takes 2 minutes.

It is optional. Skip it for typos, one-line fixes, and purely mechanical work.

---

## TL;DR

| Question | Answer |
|----------|--------|
| What does it do? | Documents a solved problem to `docs/solutions/[category]/[filename].md` with structured frontmatter, bug-track or knowledge-track sections, and cross-references |
| When to use it | After solving a non-trivial problem; when you say "that worked", "it's fixed", "problem solved" |
| What it produces | One doc in `docs/solutions/`, plus optional vocabulary capture into the glossary that owns the term. Interactive Full may also edit `AGENTS.md`/`CLAUDE.md` for discoverability after consent. |
| What's next | No menu. Optional `/ce-compound-refresh` if the new learning suggests an older doc may be stale. |

---

## Example invocations

An empty invoke captures the most recent verified fix from this conversation. A context hint focuses the run when the session holds several solved problems. `mode:non-interactive` is for automations and standing instructions: no blocking questions, Full by default. `depth:` is valid only with non-interactive intent.

```text
# Capture the verified solution from the current conversation
/ce-compound

# Focus capture when the session contains several solved problems
/ce-compound the email digest race condition we fixed

# Unattended Full capture (default depth when mode:non-interactive is set)
/ce-compound mode:non-interactive the verified caching fix

# Unattended single-pass capture: no subagents, no overlap research
/ce-compound mode:non-interactive depth:lightweight the verified caching fix

# Unattended Full capture, including the automatic session-history probe
/ce-compound mode:non-interactive depth:full the verified caching fix
```

One learning per run. If the session produced several distinct learnings, invoke the skill once per learning. A standalone "bootstrap CONCEPTS.md" request is redirected to `ce-compound-refresh`. Use non-interactive mode only when the caller should own any follow-up decisions. Ordinary interactive capture can still ask before changing project guidance.

---

## The Problem

Most teams solve the same problem twice, sometimes with the same person, because the first solution lives in conversation, chat history, or a teammate's head. Common failure shapes:

- Solution lives in chat: Slack thread, Linear comment, agent transcript; gone in a week
- Documented but undiscoverable: written to a wiki nobody searches, or `docs/solutions/` exists but agents do not know to check it
- Rewritten when re-encountered: a slightly different doc gets created for the same problem, and now there are two that will drift
- No anti-patterns captured: what did not work is the most expensive part of the investigation, and it is the first thing to disappear
- Captured at session-end clutter, not session-end clarity: the doc gets written when context is already faded

## The Solution

`ce-compound` runs as a structured capture flow at the moment context is freshest:

- Two modes: Full (parallel subagents for cross-referencing and duplicate detection) and Lightweight (single-pass, faster)
- Bug track and knowledge track produce different section structures matched to the doc type
- An overlap check decides whether to update an existing doc rather than create a duplicate
- A discoverability check ensures the project's instruction file surfaces `docs/solutions/` so future agents find it (interactive Full asks consent before editing; non-interactive and lightweight report or tip only)
- Specialized post-review can enhance the doc: performance, security, data-integrity, and read-only simplification checks review the drafted learning without mutating product code

---

## What Makes It Novel

### Two modes, agent-selected

**Full mode** runs three research subagents in parallel (Context Analyzer, Solution Extractor, Related Docs Finder), plus an automatic session-history probe across Claude Code, Codex, Cursor, Pi, and oh-my-pi (omp). It cross-references existing docs, detects duplicates, and runs specialized reviews.

**Lightweight mode** writes the same solution-doc artifact type in a single pass, with no subagents or cross-referencing. It skips overlap detection, session-history research, and semantic grounding validation.

**The skill picks the mode itself. It does not ask.** Full is the default. Lightweight is chosen only under real context pressure (session near its limit, or a trivial fix where cross-referencing adds nothing). Those are conditions the agent can observe and you cannot. The skill states which mode it ran, and why, on the first line of its output. If it guessed wrong, re-running is a cheap correction.

Automations can select the same tradeoff without a prompt: `mode:non-interactive depth:lightweight` runs the single-pass workflow; `mode:non-interactive depth:full` runs the complete workflow, including its automatic session-history probe. Bare `mode:non-interactive` (and the deprecated alias `mode:headless`) remains Full by default. Depth is non-interactive-only. A depth flag without non-interactive intent, an unknown value, or conflicting depth flags fails explicitly.

### Bug track vs knowledge track

The skill classifies the work from `problem_type`:

- Bug track: Symptoms, What Didn't Work, Solution, Why This Works, Prevention. Used for build errors, test failures, runtime errors, performance issues, integration issues.
- Knowledge track: Context, Guidance, Why This Matters, When to Apply, Examples. Used for architecture patterns, design patterns, tooling decisions, conventions, workflow practices.

The track determines section order and frontmatter fields.

`problem_type`, `severity`, and `resolution_type` are closed enums. `component` and `root_cause` are open vocabulary, and the category directories are a default layout: when `docs/solutions/` already holds learnings, the classifier samples their frontmatter and directory names and reuses what the corpus already uses for the area, falling back to the schema's suggested values and default mapping only for an empty corpus or an uncovered area. Repos with their own documentation vocabulary keep it, so their existing retrieval still finds the new doc.

### Overlap, discoverability, and grounding

The Related Docs Finder scores overlap with existing `docs/solutions/` content across five dimensions: problem statement, root cause, solution approach, referenced files, prevention rules.

- High overlap (4-5 dimensions match): update the existing doc. The path stays the same; a `last_updated` field is added.
- Moderate overlap (2-3 dimensions): create the new doc, flag for consolidation review (a possible `ce-compound-refresh` trigger).
- Low or none: create the new doc normally.

Every run also checks whether the project's instruction file (`AGENTS.md` or `CLAUDE.md`) would lead a future agent to discover `docs/solutions/`. If not, interactive Full proposes the smallest addition that surfaces the knowledge store, asks for consent, and applies it. Non-interactive reports `Instruction-file edit: gap noted, not applied` without editing. Lightweight tips only.

Before the doc compounds, claims are checked against the tree. A deterministic script checks cited repo paths, commit SHAs, relative links, and dangling scaffold (flags are adjudicated, not auto-failed). Then a read-only validator subagent (Full mode, including non-interactive Full) verifies code-behavior claims by quoting the defining source line, and merge-state claims against remote truth. Lightweight keeps the deterministic check and skips the validator subagent.

### Session history, refresh, and auto-invoke

### 4b. Routed vocabulary capture — the glossary that owns the term

Vocabulary capture writes to the glossary that owns the term, not to a fixed file. In most projects that is the same thing: the root `CONCEPTS.md` is a flat glossary and nothing changes. Once a project's root becomes an index over per-context glossaries, each captured term lands in its owning context instead, and a learning that crosses a boundary can update both sides plus the relation between them as a single all-or-nothing write.

Ambiguous ownership is never guessed. Where a project still has legacy `CONTEXT-MAP.md` / `CONTEXT.md` files defining terms, capture stops rather than writing into a second canonical source, and points at `ce-compound-refresh`'s migration.

Full mode always runs a cheap two-stage session-history probe. A discovery+metadata pass runs in parallel with the research subagents. Claude sessions are listed from `~/.claude/projects/` (or `CLAUDE_CONFIG_DIR/projects` when that env var is set) and kept when the recorded `cwd` is the repo root, a parent of it, or a path inside it — including sessions started from a parent directory. Codex sessions come from the active `CODEX_HOME`, the conventional homes, and Orca-managed account homes. It escalates to extraction and synthesis only when a candidate session clears a relevance bar (current-branch match or at least two topic-keyword hits). On a hit, findings fold into "What Didn't Work" (bug track) or "Context" (knowledge track). Lightweight skips this entirely.

After capturing the new learning, `ce-compound` checks whether it should invoke `/ce-compound-refresh` on a narrow scope hint. It does not default to running refresh. Only when the new learning suggests a specific older doc may now be stale.

Phrases like "that worked", "it's fixed", "working now", "problem solved" auto-invoke the skill so capture happens while context is fresh. You can also override with `/ce-compound [context]`.

---

## Quick Example

You've just spent 45 minutes debugging an N+1 query in the brief-generation flow. You confirm the fix works and say "that worked, ship it."

`ce-compound` auto-invokes (or you call it explicitly). With plenty of context left, it picks Full mode and notes "Ran Full mode." at the top of its output. No prompt.

Three subagents dispatch in parallel. Context Analyzer classifies the work as `performance_issue` (bug track) and proposes the filename and category. Solution Extractor structures the fix with before/after code. Related Docs Finder reports moderate overlap with an older doc on a different N+1 case. Alongside them, the session-history probe scans recent sessions; none clear the relevance bar, so it records "no relevant prior sessions."

The orchestrator assembles the doc, validates frontmatter, and writes `docs/solutions/performance-issues/n-plus-one-brief-generation.md`. Grounding validation then runs: the mechanical script confirms every cited path and SHA resolves, and the validator subagent quotes the defining source line behind the doc's claim about the ORM's default batching behavior. The discoverability check finds `AGENTS.md` does not mention `docs/solutions/`, proposes a one-line addition to the existing directory listing, and applies it after you confirm.

Phase 3 dispatches the local `performance-oracle` prompt and, because the doc includes code examples, performs a read-only simplification check on the drafted examples. Phase 2.5 surfaces a refresh recommendation: the older N+1 doc may benefit from consolidation review. The skill suggests `/ce-compound-refresh n-plus-one` as a narrow scope hint and ends. There is no "What's next?" menu.

---

## When to Reach For It

Reach for `ce-compound` when:

- You just solved a non-trivial problem and the context is fresh
- You say "that worked", "it's fixed", "working now", "problem solved"
- You are at a natural pause and want to capture the learning before context fades
- The problem took meaningful investigation (not a typo or one-line fix)

Skip `ce-compound` when:

- The problem is in-progress or the solution is unverified
- The fix is a trivial typo or obvious error with no generalizable insight
- The work is purely mechanical (formatting, dependency bumps)
- You want a repo-wide concept map rather than a learning from one solved problem → `/ce-compound-refresh`

---

## Use as Part of the Workflow

`ce-compound` is the closing loop of multiple workflows. Invoke it after any verified, non-trivial fix. Typical moments:

- After a successful debug and PR, when the bug is generalizable
- After shipping, when the work yielded a reusable pattern, convention, or tooling decision
- Stand-alone, after any non-trivial problem-solving session

The output feeds back into upstream skills:

- `/ce-plan` reads `docs/solutions/` during Phase 1 research
- `/ce-ideate` reads it as part of grounding

When the new learning suggests an older doc may now be stale, `ce-compound` recommends `/ce-compound-refresh` with a narrow scope hint.

---

## Use Standalone

The skill is its own complete cycle:

- Just-finished problem: `/ce-compound` (or auto-invoked from "that worked")
- With context hint: `/ce-compound "the email digest race condition we fixed"`
- Lightweight on a long session: when context is tight, the skill selects lightweight mode on its own and says so
- Lower-overhead unattended capture: `/ce-compound mode:non-interactive depth:lightweight "the verified fix"`
- Full unattended capture: `/ce-compound mode:non-interactive depth:full "the verified fix"` (plain `mode:non-interactive` is equivalent)

The auto-invoke triggers happen mid-conversation. You do not need to remember the slash command if you have just confirmed something works.

---

## Make Capture Automatic

The auto-invoke trigger phrases ("that worked", "it's fixed") only fire when you happen to say one of them. If you keep forgetting to capture, add a standing instruction to your agent's instruction file so the agent proposes capture on its own once a fix is verified, before it hands the session back to you.

Put it in the repo's `AGENTS.md`/`CLAUDE.md`, or in your global instruction file (`~/.claude/CLAUDE.md`, `~/.codex/AGENTS.md`) to make it apply in every repo. Pick the variant that matches how much of a checkpoint you want:

**Offer first** (the agent asks before capturing):

> After a solved, verified problem produces a non-trivial, reusable learning, offer once, before the final handoff, to invoke the `ce-compound` skill. Only in repositories that accept `docs/solutions/` as a tracked knowledge store.

**Run it automatically** (no prompt):

> After a solved, verified problem produces a non-trivial, reusable learning, automatically invoke the `ce-compound` skill, passing `mode:non-interactive` as the skill argument. Only in repositories that accept `docs/solutions/` as a tracked knowledge store.

Use `mode:non-interactive depth:lightweight` instead when the standing workflow accepts reduced research and validation in exchange for a single-pass, no-subagent closure.

Auto-run writes to `docs/solutions/` (and may touch `CONCEPTS.md`) without asking. Non-interactive never edits `AGENTS.md`/`CLAUDE.md`. If discoverability is missing it reports `gap noted, not applied` so a later interactive run can apply it with consent. Passing `mode:non-interactive` as an argument is the explicit form. The skill also honors a clear "run headless / without prompts" request, but the token removes all doubt. Without a non-interactive signal the run stays interactive and can stop for the one-time discoverability-consent prompt.

A few phrases in those standing lines are load-bearing:

- "invoke the `ce-compound` skill", not "run `/ce-compound`": instruction files are read by whatever agent you are using, and the slash-command form is not reliably agent-callable across all of them.
- "before the final handoff", not "at the end of the session": an agent cannot reliably tell when a session has ended, but it does know when it is about to hand a verified result back to you.
- "non-trivial, reusable learning": the bar is a generalizable insight worth re-reading, not an expensive one-off with nothing to reuse.
- "repositories that accept `docs/solutions/`": the real question is whether the repo welcomes generated learning docs. Forks and open-source projects you contribute to often do not.

---

## Output Artifact

```text
docs/solutions/[category]/[filename].md
```

Categories are auto-detected. Bug-track examples: `build-errors/`, `test-failures/`, `runtime-errors/`, `performance-issues/`, `database-issues/`, `security-issues/`, `ui-bugs/`, `integration-issues/`, `logic-errors/`. Knowledge-track examples: `architecture-patterns/`, `design-patterns/`, `tooling-decisions/`, `conventions/`, `workflow-issues/`, `developer-experience/`, `documentation-gaps/`, `best-practices/`.

The doc carries YAML frontmatter (`module`, `tags`, `problem_type`, and so on) for searchability. Validation runs through `scripts/validate-frontmatter.py` to catch silent corruption, and `scripts/validate-doc-claims.py` checks the body's cited paths, SHAs, links, and drafting scaffold against the tree.

In interactive Full mode, the skill may also produce a small edit to `AGENTS.md`/`CLAUDE.md` if the discoverability check finds the knowledge store is not surfaced and you consent. Non-interactive and lightweight never apply that edit.

---

## Reference

| Argument | Effect |
|----------|--------|
| _(empty)_ | Document the most recent verified fix using conversation context |
| `<brief context>` | Focuses the capture (for example, "the email digest race condition we fixed") |
| `mode:non-interactive` | Unattended run: no blocking questions. Defaults to Full. Deprecated alias: `mode:headless`. |
| `depth:lightweight` | Non-interactive only. Single-pass workflow: no subagents, no overlap research, no session-history probe. |
| `depth:full` | Non-interactive only. Complete workflow, including the automatic session-history probe. |

Auto-invoke triggers: phrases like "that worked", "it's fixed", "working now", "problem solved" anywhere in conversation.

A standalone request to create or bootstrap `CONCEPTS.md` is redirected to `ce-compound-refresh`. Vocabulary capture here is a side effect of documenting a real learning, scoped to that learning's area.

---

## FAQ

**Why two modes, and why doesn't it ask me which one?**
Full mode is for most cases: the parallel subagents catch duplicates, find related docs, and run specialized reviews. Lightweight mode exists for simple fixes or sessions running tight on context. The skill picks between them itself rather than prompting, because the deciding factor (how much context budget is left) is something the agent can see and you cannot. It reports the choice in its output. Re-running is a cheap correction if it guessed wrong.

**What's the difference between bug track and knowledge track?**
Bug track captures incident-level fixes: "X broke, here's why and how we fixed it." Knowledge track captures durable guidance: "this is how we do X here, and why." Bug track has Symptoms / What Didn't Work / Solution. Knowledge track has Context / Guidance / When to Apply.

**Why auto-update docs instead of always creating new?**
Two docs describing the same problem drift apart. The newer context is fresher, so the skill folds it into the existing doc. The result is one canonical doc that improves over time.

**Can I capture several learnings in one run?**
No. Grounding, overlap detection, and cross-referencing assume a single solved problem. Run the skill once per learning, sequentially.

**Does it work in non-software contexts?**
Knowledge track generalizes (conventions, decisions, workflow practices), but the skill assumes a code repo, a `docs/solutions/` directory, and YAML-frontmatter conventions. It is primarily a software-team tool.

**What if I don't want the discoverability edit to AGENTS.md?**
In interactive Full mode, the skill asks for consent before applying the edit. Decline and the doc still gets written. Non-interactive and lightweight never edit the instruction file; they report or tip the gap instead. The discoverability prompt will not fire if your AGENTS.md already mentions `docs/solutions/`.

**Is there a "What's next?" menu?**
No. The skill ends after the summary. Cross-doc maintenance is deferred to `ce-compound-refresh` via the refresh recommendation line.

---

## See Also

- [`ce-compound-refresh`](./ce-compound-refresh.md): maintain `docs/solutions/` over time as the codebase evolves; also owns repo-wide CONCEPTS.md bootstrap
- [`ce-debug`](./ce-debug.md): a common moment to capture, after a fix is verified
- [`ce-work`](./ce-work.md): a common moment to capture, after shipping
- [`ce-plan`](./ce-plan.md): reads `docs/solutions/` as institutional memory during planning
- [`ce-ideate`](./ce-ideate.md): reads `docs/solutions/` as part of grounding
