# `ce-compound`

> Preserve the reasoning behind a solved problem when the implementation alone will not.

`ce-compound` is the knowledge-capture skill. After a verified solution produces durable, non-obvious project knowledge, it writes a structured doc to `docs/solutions/` covering symptoms, root cause, what did not work, the working solution, and prevention. `ce-plan` and `ce-ideate` read that folder as institutional memory, so the same investigation does not happen twice.

It closes the loop on the `/ce-ideate` -> `/ce-brainstorm` -> `/ce-plan` -> `/ce-work` chain. The first time you solve "N+1 query in brief generation" costs 30 minutes of research. The second time, someone finds the doc and the fix takes 2 minutes.

It is optional. A completed or non-trivial fix is not enough: skip it when the final code and tests already communicate the whole lesson.

---

## TL;DR

| Question | Answer |
|----------|--------|
| What does it do? | Documents a solved problem to `docs/solutions/[category]/[filename].md` with structured frontmatter, bug-track or knowledge-track sections, and cross-references |
| When to use it | After a verified solution produces durable reasoning that the final implementation does not readily reveal and that would be costly or risky to lose |
| What it produces | One doc in `docs/solutions/`, plus optional `CONCEPTS.md` vocabulary capture. Interactive Full may also edit `AGENTS.md`/`CLAUDE.md` for discoverability after consent. |
| What's next | No menu. Optional `/ce-compound-refresh` if the new learning suggests an older doc may be stale. |

---

## What is worth compounding

Use `ce-compound` only when all three conditions hold:

1. **Non-obvious:** the important reasoning is not readily recoverable from the final code, tests, types, comments, or existing documentation.
2. **Durable:** it explains an invariant, constraint, root cause, rejected approach, or decision that should remain useful beyond the exact diff.
3. **Material:** forgetting it would plausibly cause recurrence, meaningful risk, or substantial rediscovery.

Apply this counterfactual: if the learning document disappeared, would a future engineer reading the final implementation still be likely to repeat the mistake or redo substantial investigation? If not, do not compound.

Put knowledge in the narrowest durable home that communicates it completely:

| Knowledge | Best home |
|-----------|-----------|
| Machine-enforceable behavior | Test, type, or assertion |
| Local non-obvious rationale | Code comment |
| Change-specific history | Commit or PR description |
| Shared domain language | `CONCEPTS.md` |
| Durable reasoning that crosses implementation boundaries | `docs/solutions/` through `ce-compound` |

An existing learning that became materially inaccurate or incomplete is worth updating because leaving it would mislead. Let the overlap check update that canonical doc instead of creating a duplicate. Use `ce-compound-refresh` for a broader maintenance pass over stale or overlapping learnings.

---

## Example invocations

An empty invoke evaluates the most recent verified fix from this conversation and captures it when it qualifies. A context hint focuses the run when the session holds several solved problems. `mode:non-interactive` is for automations and standing instructions: no blocking questions, Full by default. `depth:` is valid only with non-interactive intent.

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

One learning per run. If the session produced several distinct qualifying learnings, invoke the skill once per learning. A standalone "bootstrap CONCEPTS.md" request gets redirected to `ce-compound-refresh`. Use non-interactive mode only when the caller should own any follow-up decisions. Ordinary interactive capture can still ask before changing project guidance.

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

The skill picks the mode itself and does not ask. Full is the default. Lightweight only fires when the session is near its context limit. That is a condition the agent can observe and you cannot. The first line of its output says which mode ran and why. If it guessed wrong, re-run it.

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

### Session history, refresh, and the capture checkpoint

Full mode always runs a cheap two-stage session-history probe. A discovery-and-metadata pass runs in parallel with the research subagents. It lists Claude sessions from `~/.claude/projects/` (or `CLAUDE_CONFIG_DIR/projects` when that env var is set) and keeps the ones whose recorded `cwd` is the repo root, a parent of it, or a path inside it, so sessions started from a parent directory count. Codex sessions come from `~/.codex/sessions/` (or `CODEX_HOME/sessions` when set) plus `~/.agents/sessions/`. It escalates to extraction and synthesis only when a candidate session clears a relevance bar: current-branch match or at least two topic-keyword hits. On a hit, findings fold into "What Didn't Work" (bug track) or "Context" (knowledge track). Lightweight skips all of this.

After capturing the new learning, `ce-compound` checks whether the learning suggests a specific older doc may now be stale. Only then does it recommend or invoke `/ce-compound-refresh`, with a narrow scope hint. It does not run refresh by default.

Phrases like "that worked", "it's fixed", "working now", and "problem solved" identify the completion checkpoint. They do not establish that a learning qualifies. Automatic capture still applies the non-obvious, durable, and material gate above. `/ce-compound [context]` requests immediate evaluation without waiting for a completion phrase; it does not lower the bar.

---

## Quick example

You've just spent 45 minutes debugging an N+1 query in the brief-generation flow. The root cause spans query assembly and a surprising ORM default that neither the final call site nor its regression test explains. You confirm the fix works and say "that worked, ship it."

The completion phrase marks the checkpoint. The agent applies the counterfactual, determines that a future engineer could plausibly repeat the investigation from the final implementation alone, and auto-invokes `ce-compound`. With plenty of context left, it picks Full mode and notes "Ran Full mode." at the top of its output. No prompt.

Three subagents dispatch in parallel. Context Analyzer classifies the work as `performance_issue` (bug track) and proposes the filename and category. Solution Extractor structures the fix with before/after code. Related Docs Finder reports moderate overlap with an older doc on a different N+1 case. Alongside them, the session-history probe scans recent sessions; none clear the relevance bar, so it records "no relevant prior sessions."

The orchestrator assembles the doc, validates frontmatter, and writes `docs/solutions/performance-issues/n-plus-one-brief-generation.md`. Grounding validation runs next: the mechanical script confirms every cited path and SHA resolves, and the validator subagent quotes the source line behind the doc's claim about the ORM's default batching behavior. The discoverability check finds `AGENTS.md` does not mention `docs/solutions/`, proposes a one-line addition, and applies it after you confirm.

Phase 3 dispatches the local `performance-oracle` prompt and, because the doc includes code examples, runs a read-only simplification check on them. The overlap finding surfaces as a refresh recommendation: the older N+1 doc may benefit from consolidation review, so the skill suggests `/ce-compound-refresh n-plus-one` and ends. There is no "What's next?" menu.

---

## When to reach for it

Reach for `ce-compound` when a solved and verified problem produced reasoning that is:

- not readily recoverable from the final implementation or existing docs
- useful beyond the exact diff
- costly or risky to lose

Skip it when:

- The problem is in-progress or the solution is unverified
- The final code, tests, types, comments, or existing docs already communicate the reasoning
- The proposed doc would mainly narrate the diff or preserve change-specific history
- You want a repo-wide concept map rather than a learning from one solved problem → `/ce-compound-refresh`

---

## Use as part of the workflow

`ce-compound` closes out multiple workflows when the work clears the durable-learning gate:

- After a successful debug when the root cause or prevention depends on reasoning the regression test cannot express
- After shipping when the work yielded a durable cross-boundary invariant, convention, or tooling decision
- Stand-alone after an investigation whose important reasoning would otherwise be lost

The output feeds back upstream: `/ce-plan` reads `docs/solutions/` during Phase 1 research, and `/ce-ideate` reads it as grounding. When the new learning suggests an older doc may now be stale, `ce-compound` recommends `/ce-compound-refresh` with a narrow scope hint.

---

## Make capture automatic

Completion phrases such as "that worked" and "it's fixed" mark a useful checkpoint, but they are not sufficient triggers. Add a standing instruction when you want the agent to evaluate the durable-learning gate at that checkpoint without waiting for you to ask.

Put it in the repo's `AGENTS.md`/`CLAUDE.md`, or in your harness's global instruction file (for example `~/.claude/CLAUDE.md`, `~/.agents/AGENTS.md`, or `~/.codex/AGENTS.md`) to make it apply in every repo. Pick the variant that matches how much of a checkpoint you want. `ce-setup` offers to add either variant to the repo file for you, verbatim.

Offer first (the agent asks before capturing):

> After a solved, verified problem, offer once to invoke the `ce-compound` skill at the completion checkpoint only when the work produced durable project reasoning that is not readily recoverable from the final code, tests, types, comments, or existing documentation, and losing it would plausibly cause recurrence, material risk, or substantial rediscovery. Apply this counterfactual: if the learning document disappeared, would a future engineer reading the final implementation still be likely to repeat the mistake or redo substantial investigation? If not, do not offer. Completion, effort, and diff size alone are not enough. Offer at the checkpoint so a qualifying learning can ship in the PR that produced it, and only where the repository treats captured learnings as tracked, committed knowledge.

Run it automatically (no prompt):

> After a solved, verified problem, automatically invoke the `ce-compound` skill with `mode:non-interactive` at the completion checkpoint only when the work produced durable project reasoning that is not readily recoverable from the final code, tests, types, comments, or existing documentation, and losing it would plausibly cause recurrence, material risk, or substantial rediscovery. Apply this counterfactual: if the learning document disappeared, would a future engineer reading the final implementation still be likely to repeat the mistake or redo substantial investigation? If not, do not invoke it. Completion, effort, and diff size alone are not enough. Capture at the checkpoint so a qualifying learning can ship in the PR that produced it, and only where the repository treats captured learnings as tracked, committed knowledge.

Use `mode:non-interactive depth:lightweight` instead when the standing workflow accepts reduced research and validation in exchange for a single-pass, no-subagent closure.

Auto-run writes to `docs/solutions/` (and may touch `CONCEPTS.md`) without asking. Non-interactive never edits `AGENTS.md`/`CLAUDE.md`. If discoverability is missing it reports `gap noted, not applied` so a later interactive run can apply it with consent. Passing `mode:non-interactive` as an argument is the explicit form; the skill also honors a clear "run headless / without prompts" request, but the token removes all doubt. Without a non-interactive signal the run stays interactive and can stop for the one-time discoverability-consent prompt.

A few phrases in those standing lines are load-bearing:

- "invoke the `ce-compound` skill", not "run `/ce-compound`": instruction files are read by whatever agent you are using, and the slash-command form is not reliably agent-callable across all of them.
- "at the completion checkpoint", with the deadline as commit-reachability rather than a PR event: a PR can open early, so any deadline pegged to PR creation is already past by the time the work finishes. Whether the learning can still be committed to the producing PR holds in every case.
- "not readily recoverable" and the counterfactual: the bar is preserving reasoning that the primary artifacts do not already carry, not the effort or size of the fix.
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
| _(empty)_ | Evaluate the most recent verified fix using conversation context and document it when it qualifies |
| `<brief context>` | Focuses the capture (for example, "the email digest race condition we fixed") |
| `mode:non-interactive` | Unattended run: no blocking questions. Defaults to Full. Deprecated alias: `mode:headless`. |
| `depth:lightweight` | Non-interactive only. Single-pass workflow: no subagents, no overlap research, no session-history probe. |
| `depth:full` | Non-interactive only. Complete workflow, including the automatic session-history probe. |

Auto-invoke checkpoint phrases include "that worked", "it's fixed", "working now", and "problem solved". They trigger the eligibility judgment, not automatic documentation by themselves.

A standalone request to create or bootstrap `CONCEPTS.md` gets redirected to `ce-compound-refresh`. Vocabulary capture here is a side effect of documenting a real learning, scoped to that learning's area.

---

## FAQ

**Why two modes, and why doesn't it ask me which one?**
Full mode is for most qualifying learnings: the parallel subagents catch duplicates, find related docs, and run specialized reviews. Lightweight exists for sessions running tight on context. The skill picks between them itself because the deciding factor, how much context budget is left, is something the agent can see and you cannot. It reports the choice in its output. Re-run it if it guessed wrong.

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
