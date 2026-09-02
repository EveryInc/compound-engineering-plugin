# `ce-compound`

> Document a recently solved problem so the next encounter takes minutes instead of hours.

`ce-compound` is the knowledge-capture skill. After you solve a non-trivial problem, it writes a structured doc to `docs/solutions/` covering symptoms, root cause, what did not work, the working solution, and prevention. `ce-plan` and `ce-ideate` read that folder as institutional memory, so the same investigation does not happen twice.

It closes the loop on the `/ce-ideate` -> `/ce-brainstorm` -> `/ce-plan` -> `/ce-work` chain. The first time you solve "N+1 query in brief generation" costs 30 minutes of research. The second time, someone finds the doc and the fix takes 2 minutes.

It is optional. Skip it for typos, one-line fixes, and purely mechanical work.

---

## TL;DR

| Question | Answer |
|----------|--------|
| What does it do? | Documents a solved problem to `docs/solutions/[category]/[filename].md` with structured frontmatter, bug-track or knowledge-track sections, and cross-references |
| When to use it | After solving a non-trivial problem; when you say "that worked", "it's fixed", "problem solved" |
| What it produces | One doc in `docs/solutions/`, plus optional `CONCEPTS.md` vocabulary capture. Interactive Full may also edit `AGENTS.md`/`CLAUDE.md` for discoverability after consent. |
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

One learning per run. If the session produced several distinct learnings, invoke the skill once per learning. A standalone "bootstrap CONCEPTS.md" request gets redirected to `ce-compound-refresh`. Use non-interactive mode only when the caller should own any follow-up decisions. Ordinary interactive capture can still ask before changing project guidance.

---

## The problem

Most teams solve the same problem twice, sometimes with the same person, because the first solution lives in chat history or a teammate's head. The usual ways it goes wrong:

- The solution lives in a Slack thread, a Linear comment, or an agent transcript. Gone in a week.
- It gets documented but nobody finds it. A wiki nobody searches, or a `docs/solutions/` folder agents do not know to check.
- A slightly different doc gets created for the same problem, and now there are two that drift apart.
- The anti-patterns disappear first. What did not work was the most expensive part of the investigation, and it never gets written down.
- Capture waits until the end of the session, when the context has already faded.

`ce-compound` runs the capture at the moment context is freshest. Two modes (Full runs parallel subagents for cross-referencing and duplicate detection; Lightweight is single-pass). An overlap check decides whether to update an existing doc rather than create a duplicate. A discoverability check makes sure the project's instruction file points future agents at `docs/solutions/`. Bug-track and knowledge-track docs get different section structures. Specialized post-review (performance, security, data integrity, read-only simplification) can look over the drafted learning without touching product code.

---

## How it works

### Two modes, agent-selected

Full mode runs three research subagents in parallel (Context Analyzer, Solution Extractor, Related Docs Finder), plus an automatic session-history probe across Claude Code, Codex, Cursor, Pi, and oh-my-pi (omp). It cross-references existing docs, detects duplicates, and runs specialized reviews.

Lightweight mode writes the same doc type in a single pass. No subagents, no overlap detection, no session-history research, no semantic grounding validation.

The skill picks the mode itself and does not ask. Full is the default. Lightweight only fires under real context pressure: the session is near its limit, or the fix is trivial enough that cross-referencing adds nothing. Those are conditions the agent can observe and you cannot. The first line of its output says which mode ran and why. If it guessed wrong, re-run it.

Automations select the same tradeoff without a prompt. `mode:non-interactive depth:lightweight` runs the single-pass workflow; `mode:non-interactive depth:full` runs the complete workflow including the session-history probe. Bare `mode:non-interactive` (and the deprecated alias `mode:headless`) is Full by default. Depth is non-interactive-only. A depth flag without non-interactive intent, an unknown value, or conflicting depth flags fails explicitly.

### Bug track vs knowledge track

The skill classifies the work from `problem_type`:

- Bug track: Symptoms, What Didn't Work, Solution, Why This Works, Prevention. Used for build errors, test failures, runtime errors, performance issues, integration issues.
- Knowledge track: Context, Guidance, Why This Matters, When to Apply, Examples. Used for architecture patterns, design patterns, tooling decisions, conventions, workflow practices.

The track determines section order and frontmatter fields.

`problem_type`, `severity`, and `resolution_type` are closed enums. `component` and `root_cause` are open vocabulary, and the category directories are a default layout, not a mandate. When `docs/solutions/` already holds learnings, the classifier samples their frontmatter and directory names and reuses what the corpus already uses for the area. It falls back to the schema's suggested values only for an empty corpus or an uncovered area. Repos with their own documentation vocabulary keep it, so their existing retrieval still finds the new doc.

### Overlap, discoverability, and grounding

The Related Docs Finder scores overlap with existing `docs/solutions/` content across five dimensions: problem statement, root cause, solution approach, referenced files, prevention rules.

- High overlap (4-5 dimensions match): update the existing doc. The path stays the same; a `last_updated` field is added.
- Moderate overlap (2-3 dimensions): create the new doc, flag for consolidation review (a possible `ce-compound-refresh` trigger).
- Low or none: create the new doc normally.

Every run also checks whether the project's instruction file (`AGENTS.md` or `CLAUDE.md`) would lead a future agent to discover `docs/solutions/`. If not, interactive Full proposes the smallest addition that surfaces the knowledge store, asks for consent, and applies it. Non-interactive reports `Instruction-file edit: gap noted, not applied` without editing. Lightweight tips only.

Before the doc compounds, its claims get checked against the tree. A deterministic script checks cited repo paths, commit SHAs, relative links, and dangling scaffold (flags are adjudicated, not auto-failed). Then a read-only validator subagent (Full mode, including non-interactive Full) verifies code-behavior claims by quoting the defining source line, and merge-state claims against remote truth. Lightweight keeps the deterministic check and skips the validator subagent.

### Session history, refresh, and auto-invoke

Full mode always runs a cheap two-stage session-history probe. A discovery-and-metadata pass runs in parallel with the research subagents. It lists Claude sessions from `~/.claude/projects/` (or `CLAUDE_CONFIG_DIR/projects` when that env var is set) and keeps the ones whose recorded `cwd` is the repo root, a parent of it, or a path inside it, so sessions started from a parent directory count. Codex sessions come from `~/.codex/sessions/` (or `CODEX_HOME/sessions` when set) plus `~/.agents/sessions/`. It escalates to extraction and synthesis only when a candidate session clears a relevance bar: current-branch match or at least two topic-keyword hits. On a hit, findings fold into "What Didn't Work" (bug track) or "Context" (knowledge track). Lightweight skips all of this.

After capturing the new learning, `ce-compound` checks whether the learning suggests a specific older doc may now be stale. Only then does it recommend or invoke `/ce-compound-refresh`, with a narrow scope hint. It does not run refresh by default.

Phrases like "that worked", "it's fixed", "working now", "problem solved" auto-invoke the skill so capture happens while context is fresh. `/ce-compound [context]` overrides.

---

## Quick example

You've just spent 45 minutes debugging an N+1 query in the brief-generation flow. You confirm the fix works and say "that worked, ship it."

`ce-compound` auto-invokes. With plenty of context left, it picks Full mode and notes "Ran Full mode." at the top of its output. No prompt.

Three subagents dispatch in parallel. Context Analyzer classifies the work as `performance_issue` (bug track) and proposes the filename and category. Solution Extractor structures the fix with before/after code. Related Docs Finder reports moderate overlap with an older doc on a different N+1 case. Alongside them, the session-history probe scans recent sessions; none clear the relevance bar, so it records "no relevant prior sessions."

The orchestrator assembles the doc, validates frontmatter, and writes `docs/solutions/performance-issues/n-plus-one-brief-generation.md`. Grounding validation runs next: the mechanical script confirms every cited path and SHA resolves, and the validator subagent quotes the source line behind the doc's claim about the ORM's default batching behavior. The discoverability check finds `AGENTS.md` does not mention `docs/solutions/`, proposes a one-line addition, and applies it after you confirm.

Phase 3 dispatches the local `performance-oracle` prompt and, because the doc includes code examples, runs a read-only simplification check on them. The overlap finding surfaces as a refresh recommendation: the older N+1 doc may benefit from consolidation review, so the skill suggests `/ce-compound-refresh n-plus-one` and ends. There is no "What's next?" menu.

---

## When to reach for it

Reach for `ce-compound` when:

- You just solved a non-trivial problem and the context is fresh
- You say "that worked", "it's fixed", "working now", "problem solved"
- You are at a natural pause and want to capture the learning before context fades
- The problem took meaningful investigation, not a typo or one-line fix

Skip it when:

- The problem is in-progress or the solution is unverified
- The fix is a trivial typo or obvious error with no generalizable insight
- The work is purely mechanical (formatting, dependency bumps)
- You want a repo-wide concept map rather than a learning from one solved problem → `/ce-compound-refresh`

---

## Use as part of the workflow

`ce-compound` closes out multiple workflows. Invoke it after any verified, non-trivial fix:

- After a successful debug and PR, when the bug is generalizable
- After shipping, when the work yielded a reusable pattern, convention, or tooling decision
- Stand-alone, after any non-trivial problem-solving session

The output feeds back upstream: `/ce-plan` reads `docs/solutions/` during Phase 1 research, and `/ce-ideate` reads it as grounding. When the new learning suggests an older doc may now be stale, `ce-compound` recommends `/ce-compound-refresh` with a narrow scope hint.

---

## Make capture automatic

The auto-invoke trigger phrases ("that worked", "it's fixed") only fire when you happen to say one of them. If you keep forgetting to capture, add a standing instruction to your agent's instruction file so the agent proposes capture on its own once a fix is verified.

Put it in the repo's `AGENTS.md`/`CLAUDE.md`, or in your global instruction file (`~/.claude/CLAUDE.md`, `~/.codex/AGENTS.md`) to make it apply in every repo. Pick the variant that matches how much of a checkpoint you want.

Offer first (the agent asks before capturing):

> After a solved, verified problem produces a non-trivial, reusable learning, offer once to invoke the `ce-compound` skill, at the completion checkpoint — when the unit of work is complete — so the learning can ship in the PR that produced it. The deadline is while the learning can still be committed to that PR, whether it is not open yet, already open as a draft, or open and under review. Offer at the checkpoint rather than deferring to that deadline. Only where the repository treats captured learnings as tracked, committed knowledge.

Run it automatically (no prompt):

> After a solved, verified problem produces a non-trivial, reusable learning, automatically invoke the `ce-compound` skill, passing `mode:non-interactive` as the skill argument. Fire at the completion checkpoint — when the unit of work is complete — so the learning ships in the PR that produced it rather than as a later orphan. The deadline is while the learning can still be committed to that PR, whether it is not open yet, already open as a draft, or open and under review. Capture at the checkpoint rather than deferring to that deadline. Only where the repository treats captured learnings as tracked, committed knowledge.

Use `mode:non-interactive depth:lightweight` instead when the standing workflow accepts reduced research and validation in exchange for a single-pass, no-subagent closure.

Auto-run writes to `docs/solutions/` (and may touch `CONCEPTS.md`) without asking. Non-interactive never edits `AGENTS.md`/`CLAUDE.md`. If discoverability is missing it reports `gap noted, not applied` so a later interactive run can apply it with consent. Passing `mode:non-interactive` as an argument is the explicit form; the skill also honors a clear "run headless / without prompts" request, but the token removes all doubt. Without a non-interactive signal the run stays interactive and can stop for the one-time discoverability-consent prompt.

A few phrases in those standing lines are load-bearing:

- "invoke the `ce-compound` skill", not "run `/ce-compound`": instruction files are read by whatever agent you are using, and the slash-command form is not reliably agent-callable across all of them.
- "at the completion checkpoint", with the deadline as commit-reachability rather than a PR event: a PR can open early, so any deadline pegged to PR creation is already past by the time the work finishes. Whether the learning can still be committed to the producing PR holds in every case.
- "non-trivial, reusable learning": the bar is reuse, not effort. An expensive one-off with nothing generalizable does not qualify.
- "treats captured learnings as tracked, committed knowledge", not a named folder: the real question is whether the repo welcomes generated docs. Forks and OSS projects you contribute to often do not, and a named path goes stale since `docs_root` can move the store.

---

## Output artifact

```text
docs/solutions/[category]/[filename].md
```

That is the default root; the store follows `docs_root` if it is set in `config.yaml`, so on a project that relocates CE artifacts the path is `<docs_root>/solutions/...`. Categories are auto-detected. Bug-track examples: `build-errors/`, `test-failures/`, `runtime-errors/`, `performance-issues/`, `database-issues/`, `security-issues/`, `ui-bugs/`, `integration-issues/`, `logic-errors/`. Knowledge-track examples: `architecture-patterns/`, `design-patterns/`, `tooling-decisions/`, `conventions/`, `workflow-issues/`, `developer-experience/`, `documentation-gaps/`, `best-practices/`.

The doc carries YAML frontmatter (`module`, `tags`, `problem_type`, and so on) for searchability. `scripts/validate-frontmatter.py` catches silent corruption, and `scripts/validate-doc-claims.py` checks the body's cited paths, SHAs, links, and drafting scaffold against the tree.

In interactive Full mode, the skill may also make a small edit to `AGENTS.md`/`CLAUDE.md` if the discoverability check finds the knowledge store is not surfaced and you consent. Non-interactive and lightweight never apply that edit.

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

A standalone request to create or bootstrap `CONCEPTS.md` gets redirected to `ce-compound-refresh`. Vocabulary capture here is a side effect of documenting a real learning, scoped to that learning's area.

---

## FAQ

**Why two modes, and why doesn't it ask me which one?**
Full mode is for most cases: the parallel subagents catch duplicates, find related docs, and run specialized reviews. Lightweight exists for simple fixes or sessions running tight on context. The skill picks between them itself because the deciding factor, how much context budget is left, is something the agent can see and you cannot. It reports the choice in its output. Re-run it if it guessed wrong.

**What's the difference between bug track and knowledge track?**
Bug track captures incident-level fixes: "X broke, here's why and how we fixed it." Knowledge track captures durable guidance: "this is how we do X here, and why." Bug track has Symptoms / What Didn't Work / Solution. Knowledge track has Context / Guidance / When to Apply.

**Why update existing docs instead of always creating new ones?**
Two docs describing the same problem drift apart. The newer context is fresher, so the skill folds it into the existing doc. One canonical doc that improves over time.

**Can I capture several learnings in one run?**
No. Grounding, overlap detection, and cross-referencing assume a single solved problem. Run the skill once per learning, sequentially.

**Does it work in non-software contexts?**
Knowledge track generalizes (conventions, decisions, workflow practices), but the skill assumes a code repo, a `docs/solutions/` directory, and YAML-frontmatter conventions. It is primarily a software-team tool.

**What if I don't want the discoverability edit to AGENTS.md?**
Decline the consent prompt and the doc still gets written. Non-interactive and lightweight never edit the instruction file; they report or tip the gap instead. The prompt will not fire if your AGENTS.md already mentions `docs/solutions/`.

**Is there a "What's next?" menu?**
No. The skill ends after the summary. Cross-doc maintenance is deferred to `ce-compound-refresh` via the refresh recommendation line.

---

## See also

- [`ce-compound-refresh`](./ce-compound-refresh.md): maintain `docs/solutions/` over time as the codebase evolves; also owns repo-wide CONCEPTS.md bootstrap
- [`ce-debug`](./ce-debug.md): a common moment to capture, after a fix is verified
- [`ce-work`](./ce-work.md): a common moment to capture, after shipping
- [`ce-plan`](./ce-plan.md): reads `docs/solutions/` as institutional memory during planning
- [`ce-ideate`](./ce-ideate.md): reads `docs/solutions/` as part of grounding
