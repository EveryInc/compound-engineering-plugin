# `ce-compound`

> Hold the lesson of a solved problem in the cheapest form that stops the repeat, and keep the lessons already captured accurate.

`ce-compound` is the knowledge-capture skill. After a verified solution produces durable, non-obvious project knowledge, it holds that lesson in the cheapest form that works: a test or lint rule, a rule in `CODING_STANDARDS.md`, or a learning. A learning is a structured doc in `docs/solutions/` covering symptoms, root cause, what did not work, the working solution, and prevention. `ce-plan` and `ce-ideate` read that folder as institutional memory, so the same investigation does not happen twice.

It closes the loop on the `/ce-ideate` -> `/ce-brainstorm` -> `/ce-plan` -> `/ce-work` chain. The first time you solve "N+1 query in brief generation" costs 30 minutes of research. The second time, someone finds the doc and the fix takes 2 minutes.

It is optional. A completed or non-trivial fix is not enough: skip it when the final code and tests already communicate the whole lesson.

---

Captures land in `docs/solutions/`, where `ce-plan`'s research and `ce-code-review`'s learnings pass rediscover them. Declared [Compound Packs](./packs.md#growing-packs-from-learnings) participate in capture too: an insight a pack rule already prescribes is recognized rather than re-captured, and interactive runs can route a prescriptive, cross-repo capture directly into a writable pack — or scaffold a new one — with the learning rewritten as a rule.

## TL;DR

| Question | Answer |
|----------|--------|
| What does it do? | Chooses the cheapest form that stops a solved problem from repeating, then writes it: a test or lint rule, a coding standard, or a learning at `docs/solutions/[category]/[filename].md` |
| When to use it | After a verified solution produces durable reasoning that the final implementation does not readily reveal and that would be costly or risky to lose |
| What it produces | At most one added test, added or tightened lint rule, or standard, and at most one doc in `docs/solutions/`, plus optional `CONCEPTS.md` vocabulary capture. It never changes product code. Interactive Full may also edit `AGENTS.md`/`CLAUDE.md` for discoverability after consent. |
| What's next | No menu. Optional `/ce-compound refresh` if the new learning suggests an older doc may be stale. |

---

## What is worth compounding

Use `ce-compound` only when all three conditions hold:

1. **Non-obvious:** the important reasoning is not readily recoverable from the final code, tests, types, comments, or existing documentation.
2. **Durable:** it explains an invariant, constraint, root cause, rejected approach, or decision that should remain useful beyond the exact diff.
3. **Material:** forgetting it would plausibly cause recurrence, meaningful risk, or substantial rediscovery.

Apply this counterfactual: if the learning document disappeared, would a future engineer reading the final implementation still be likely to repeat the mistake or redo substantial investigation? If not, do not compound.

The skill then picks the cheapest form that would stop the repeat, in the order below, and writes it without asking. The commit or pull request that carries the write is its review.

1. **One owner and one way.** The mistake was possible because two ways to do the thing exist. This changes product code, so the skill reports it for the code's owner.
2. **A test or lint rule** whose failure tells the reader what to fix. A lint rule can be new, or an existing one that is enabled, widened in scope, or raised in severity. The skill keeps it only after seeing it pass on the current tree and fail on the defect in a throwaway copy. A check is reported instead when it needs product code changed, such as a log field or metric; when it needs a new tool, plugin, dependency, or rule-writing setup; or when the only way to pass on the current tree is a new baseline or suppression entry.
3. **A rule in `CODING_STANDARDS.md`**, under the same bar [`ce-setup`](./ce-setup.md) applies, when no check can hold the lesson. The skill never creates that file. A repo without one has made a valid choice, so the learning states the rule and never asks you to set anything up. An attended run says once that the lesson could be a standard. [`/ce-setup standards`](./ce-setup.md) drafts rules from those learnings if you adopt standards later.
4. **A learning**, only for reasoning the other forms cannot carry, such as measured facts or rejected alternatives.

A stronger form that was reported rather than written appears as `Recommended form` in the report, and the learning holds the whole lesson so it survives a lost report.

Other knowledge has its own home:

| Knowledge | Best home |
|-----------|-----------|
| Machine-enforceable behavior | Test, lint rule, type, or assertion |
| Local non-obvious rationale | Code comment |
| Change-specific history | Commit or PR description |
| Shared domain language | `CONCEPTS.md` |
| Durable reasoning that crosses implementation boundaries | `docs/solutions/` through `ce-compound` |

An existing learning that became materially inaccurate or incomplete is worth updating because leaving it would mislead. Let the overlap check update that canonical doc instead of creating a duplicate. Use a refresh for a broader maintenance pass over stale or overlapping learnings.

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

One learning per run. If the session produced several distinct qualifying learnings, invoke the skill once per learning. A standalone "bootstrap CONCEPTS.md" request is a refresh. Use non-interactive mode only when the caller should own any follow-up decisions. Ordinary interactive capture can still ask before changing project guidance.

---

## The problem

Most teams solve the same problem twice, sometimes with the same person, because the first solution lives in chat history or a teammate's head. The usual ways it goes wrong:

- The solution lives in a Slack thread, a Linear comment, or an agent transcript. Gone in a week.
- It gets documented but nobody finds it. A wiki nobody searches, or a `docs/solutions/` folder agents do not know to check.
- A slightly different doc gets created for the same problem, and now there are two that drift apart.
- The anti-patterns disappear first. What did not work was the most expensive part of the investigation, and it never gets written down.
- Capture waits until the end of the session, when the context has already faded.

`ce-compound` runs the capture at the moment context is freshest. It has two modes: Full runs parallel subagents for cross-referencing and duplicate detection; Lightweight is single-pass. An overlap check decides whether to update an existing doc rather than create a duplicate. A discoverability check makes sure the project's instruction file points future agents at `docs/solutions/`. Bug-track and knowledge-track docs get different section structures. Specialized post-review (performance, security, data integrity, read-only simplification) can look over the drafted learning without touching product code.

---

## How it works

### Two modes, agent-selected

Full mode classifies the learning and drafts its body in the main session, which holds the conversation, while a Related Docs Finder subagent searches existing docs, plus an automatic session-history probe across Claude Code, Codex, Cursor, Pi, and oh-my-pi (omp). It cross-references existing docs, detects duplicates, and runs specialized reviews.

Lightweight mode writes the same doc type in a single pass. No subagents, no overlap detection, no session-history research, no semantic grounding validation.

The skill picks the mode itself and does not ask. Full is the default. Lightweight only fires when the session is near its context limit. That is a condition the agent can observe and you cannot. The first line of its output says which mode ran and why. If it guessed wrong, re-run it.

Automations select the same tradeoff without a prompt. `mode:non-interactive depth:lightweight` runs the single-pass workflow; `mode:non-interactive depth:full` runs the complete workflow including the session-history probe. Bare `mode:non-interactive` (and the deprecated alias `mode:headless`) is Full by default. Depth is non-interactive-only. A depth flag without non-interactive intent, an unknown value, or conflicting depth flags fails explicitly.

### Bug track vs knowledge track

The skill classifies the work from `problem_type`:

- Bug track: Symptoms, What Didn't Work, Solution, Why This Works, Prevention. Used for build errors, test failures, runtime errors, performance issues, integration issues.
- Knowledge track: Context, Guidance, Why This Matters, When to Apply, Examples. Used for architecture patterns, design patterns, tooling decisions, conventions, workflow practices.

The track determines section order and frontmatter fields.

`problem_type`, `severity`, and `resolution_type` are closed enums. `component` and `root_cause` are open vocabulary, and the category directories are a default layout, not a mandate. When `docs/solutions/` already holds learnings, the classifier samples their frontmatter and directory names and reuses what the corpus already uses for the area. It falls back to the schema's suggested values only for an empty corpus or an uncovered area. Repos with their own documentation vocabulary keep it, so their existing retrieval still finds the new doc.

Some guidance holds only while something outside the repo holds: an open upstream bug, a tool or platform version, a dependency's behavior. Such a learning also records `retire_when`, which names the change that would retire it and how to check for it without changing the repo, so a refresh can tell when it stops applying. Most learnings have no such condition and omit the field.

### Overlap, discoverability, and grounding

The Related Docs Finder scores overlap with existing `docs/solutions/` content across five dimensions: problem statement, root cause, solution approach, referenced files, prevention rules.

- High overlap (4-5 dimensions match): update the existing doc. The path stays the same; a `last_updated` field is added.
- Moderate overlap (2-3 dimensions): create the new doc, flag for consolidation review (a possible refresh trigger).
- Low or none: create the new doc normally.

Every run also checks whether the project's instruction file (`AGENTS.md` or `CLAUDE.md`) would lead a future agent to discover `docs/solutions/`. If not, interactive Full proposes the smallest addition that surfaces the knowledge store, asks for consent, and applies it. Non-interactive reports `Instruction-file edit: gap noted, not applied` without editing. Lightweight tips only.

Before the doc compounds, the skill checks its claims against the tree. A deterministic script checks cited repo paths, commit SHAs, relative links, and dangling scaffold (flags are adjudicated, not auto-failed). Then a read-only validator subagent (Full mode, including non-interactive Full) verifies code-behavior claims by quoting the defining source line, and merge-state claims against remote truth. Lightweight keeps the deterministic check and skips the validator subagent.

### Session history, refresh, and the capture checkpoint

Full mode always runs a cheap two-stage session-history probe. A discovery-and-metadata pass runs in parallel with the research subagents. It lists Claude sessions from `~/.claude/projects/` (or `CLAUDE_CONFIG_DIR/projects` when that env var is set) and keeps the ones whose recorded `cwd` is the repo root, a parent of it, or a path inside it, so sessions started from a parent directory count. Codex sessions come from `~/.codex/sessions/` (or `CODEX_HOME/sessions` when set) plus `~/.agents/sessions/`. It escalates to extraction and synthesis only when a candidate session clears a relevance bar: current-branch match or at least two topic-keyword hits. On a hit, findings fold into "What Didn't Work" (bug track) or "Context" (knowledge track). Lightweight skips all of this.

After capturing the new learning, `ce-compound` checks whether the learning suggests a specific older doc may now be stale. Only then does it recommend or run a refresh, with a narrow scope hint. It does not run refresh by default.

Phrases like "that worked", "it's fixed", "working now", and "problem solved" identify the completion checkpoint. They do not establish that a learning qualifies. Automatic capture still applies the non-obvious, durable, and material gate above. `/ce-compound [context]` requests immediate evaluation without waiting for a completion phrase; it does not lower the bar.

---

## Quick example

You've just spent 45 minutes debugging an N+1 query in the brief-generation flow. The root cause spans query assembly and a surprising ORM default that neither the final call site nor its regression test explains. You confirm the fix works and say "that worked, ship it."

The completion phrase marks the checkpoint. The agent applies the counterfactual, determines that a future engineer could plausibly repeat the investigation from the final implementation alone, and auto-invokes `ce-compound`. With plenty of context left, it picks Full mode and notes "Ran Full mode." at the top of its output. No prompt.

The Related Docs Finder dispatches in the background. While it searches, the agent classifies the work as `performance_issue` (bug track), picks the filename and category, and drafts the fix with before/after code and the dead ends from the session. The finder reports moderate overlap with an older doc on a different N+1 case. Alongside them, the session-history probe scans recent sessions; none clear the relevance bar, so it records "no relevant prior sessions."

The orchestrator assembles the doc, validates frontmatter, and writes `docs/solutions/performance-issues/n-plus-one-brief-generation.md`. Grounding validation runs next: the mechanical script confirms every cited path and SHA resolves, and the validator subagent quotes the source line behind the doc's claim about the ORM's default batching behavior. The discoverability check finds `AGENTS.md` does not mention `docs/solutions/`, proposes a one-line addition, and applies it after you confirm.

Phase 3 dispatches the local `performance-oracle` prompt and, because the doc includes code examples, runs a read-only simplification check on them. The overlap finding surfaces as a refresh recommendation: the older N+1 doc may benefit from consolidation review, so the skill suggests `/ce-compound refresh n-plus-one` and ends. There is no "What's next?" menu.

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
- You want a repo-wide concept map rather than a learning from one solved problem → `/ce-compound refresh`

---

## Use as part of the workflow

`ce-compound` closes out multiple workflows when the work clears the durable-learning gate:

- After a successful debug when the root cause or prevention depends on reasoning the regression test cannot express
- After shipping when the work yielded a durable cross-boundary invariant, convention, or tooling decision
- Stand-alone after an investigation whose important reasoning would otherwise be lost

The output feeds back upstream: `/ce-plan` reads `docs/solutions/` during Phase 1 research, and `/ce-ideate` reads it as grounding. When the new learning suggests an older doc may now be stale, `ce-compound` recommends `/ce-compound refresh` with a narrow scope hint.

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
- "treats captured learnings as tracked, committed knowledge", not a named folder: the question is whether the repo welcomes generated docs. Forks and OSS projects you contribute to often do not, and a named path goes stale since `docs_root` can move the store.

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

A standalone request to create or bootstrap `CONCEPTS.md` is a refresh. Vocabulary capture here is a side effect of documenting a real learning, scoped to that learning's area.

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
No. The skill ends after the summary. Cross-doc maintenance is deferred to a refresh via the refresh recommendation line.

---

## Refresh

The second job maintains the store: it reviews existing learnings against the current codebase, then updates, consolidates, replaces, or deletes the ones that drifted, and keeps `CODING_STANDARDS.md` in step with the repo's checks.

Run it with `/ce-compound refresh [scope]` or by asking in plain words, such as "clean up the learnings". A schedule or another skill uses `/ce-compound mode:refresh mode:non-interactive [scope]`. A bare `/ce-compound`, and any unattended run without `mode:refresh`, is a capture.

### Example invocations

A scope hint is a category directory, filename slug, module, or keyword. Prefer one: an unscoped run has to triage the whole store first.

```text
# Review learnings for one module or topic
/ce-compound refresh authentication

# One known file (filename slug)
/ce-compound refresh release-please-version-drift-recovery

# One category directory
/ce-compound refresh performance-issues

# Pattern-doc topic
/ce-compound refresh critical-patterns

# No hint: triage the whole store, then start at the highest-impact cluster.
# Interactive asks before going deep.
/ce-compound refresh

# Apply unambiguous maintenance without questions. Ambiguous docs are marked
# stale. On the default branch this opens a PR.
/ce-compound mode:refresh mode:non-interactive authentication

# Build a repo-wide CONCEPTS.md glossary. Interactive asks whether you meant
# a refresh instead.
/ce-compound refresh create a CONCEPTS.md

# Fix drift only: skip the worth check and leave accurate content alone.
/ce-compound refresh fix drift only
```

With no hint, a refresh clusters the store and recommends a starting area. Interactive confirms that area; non-interactive processes every cluster in impact order. A hint that matches nothing asks you to clarify (interactive) or reports the miss and exits (non-interactive). An empty store tells you to run `ce-compound` first.


### The Problem

`docs/solutions/` drifts in predictable ways:

- A learning still names `app/models/auth_token.rb` after the file became `session_token.rb`
- The recommended fix is now an anti-pattern
- Two learnings describe the same problem from different months and have started to disagree
- A workaround learning whose upstream bug was fixed, with nothing saying the workaround can go
- A pattern doc whose supporting learnings no longer back the rule
- Code that disappeared quarters ago, with the learning still sitting there
- `_archived/` folders that pollute search and nobody reads

Future agents (and humans) then take advice that no longer applies. The store makes the next encounter harder, not easier.

### The Solution

A structured review with five outcomes per doc:

- **Keep**: accurate and useful. No edit, no review breadcrumb.
- **Update**: the solution is still right; references drifted. Fix in place, including relocating a doc whose directory and frontmatter category clearly disagree.
- **Consolidate**: two docs overlap. Merge unique content into the canonical one and delete the other. The inverse, **Split**, breaks one multi-problem doc into focused successors when the fragments have independent retrieval value.
- **Replace**: the old guidance is now misleading. Write a successor, then delete the old file.
- **Delete**: the code and the problem domain are gone, and inbound citations are absent or decorative. Git history is the archive; there is no `_archived/` destination.

A refresh investigates each doc against the tree, then looks at the set (overlap, supersession, contradictions), then classifies and executes. Interactive mode asks only on genuine judgment calls. Non-interactive applies the safe subset and marks the rest stale.


### What Makes It Novel

#### Five outcomes, not "is this still right?"

Each doc gets a specific action and an evidence bar. Age alone is not staleness, and typos are not a reason to edit. When a doc's claims about current mechanics disagree with the code, the doc changes. Guidance with independent support is different: if the implementation stops satisfying it, a refresh preserves the guidance and reports the conflict as a potential product regression. It never edits or adjudicates product code.

A learning can declare a `retire_when` condition: the outside change, such as an upstream bug fix, that would retire it. A refresh checks a declared condition and treats a met one as contradicting evidence, not age. When repo code still carries the workaround the learning explains, the learning stays and the report recommends removing that code. A condition a refresh cannot check, for example because the tracker is unreachable, is noted in the report and does not change the learning on its own.

#### Two modes

**Interactive** (default) applies Keep, Update, and obvious Consolidate directly. It asks before a Replace, a Split, a Delete that fails the auto-delete gate, or a Consolidate whose canonical doc is not obvious.

**Non-interactive** never pauses. It applies Keep, Update, Consolidate, gated auto-Delete, and Replace when the evidence is enough. Ambiguous cases get `status: stale`, `stale_reason`, and `stale_date` in frontmatter. Relocations auto-apply only under a four-condition gate; Splits are always recommend-only. The report separates Applied (writes that succeeded) from Recommended (writes that failed, plus everything that never runs unattended).

#### Set-level problems

After the per-doc pass, a refresh looks for overlap, a newer doc that subsumes an older one, and contradictions between docs. Contradictions outrank individual drift. For a knowledge-track learning, it also compares any guidance file the learning names (a skill's `SKILL.md`, a runbook, a root instruction file) for a conflicting order or rule on the same procedure. Only guidance the learning names, never a search, and a wrong guidance file is reported, not edited. Category-shape notes (a directory that mixes unrelated themes, a near-empty category) are report-only. It never renames categories or invents new ones.

#### Delete is conservative

Auto-delete requires all three: the implementation that lived in this repo is gone (or a successor already states the same guidance); the problem domain is gone; inbound markdown citations are absent or decorative. A doc that never pointed at in-repo code never auto-deletes. A citation another doc depends on is a Replace or Keep signal, not a cleanup task.

Every refresh also applies the counterfactual `ce-compound` uses before writing: is this reasoning recoverable from a named in-repo artifact, such as a test or a coding standard? A claim that is gets cut, and a doc with nothing left gets deleted. Each cut quotes the artifact that states the claim, and the commit or PR carries those quotes. Measured facts and rejected alternatives stay unless the artifact states them too. Ask for drift fixes only to skip this.

#### Keeping lessons in the right form

A refresh also reads the coding standards that govern its scope. It removes a rule once a check covers its whole class, narrows the rule when coverage is partial, and turns a doc that is really a rule into a standard when no check could hold it. When a check could hold it, a refresh recommends the check, because it writes no checks and never changes product code. Pruning from review history stays with [`/ce-setup standards`](./ce-setup.md).

If the current approach cannot be documented from a file scan, the doc is marked stale rather than guessed into a replacement. The recommendation is `/ce-compound` the next time you work in that area.

#### Vocabulary and findability

After the doc actions, a refresh reconciles domain terms with `CONCEPTS.md` at the repo root (creating it when enough terms qualify). That pass is silent in both modes.

Every run also checks whether the project's instruction files would lead an agent to `docs/solutions/`. Interactive mode proposes the smallest addition and asks before editing; non-interactive only recommends it. The same check runs for `CONCEPTS.md` when that file exists.


### Quick Example

You just merged a rename in the auth models. You run `/ce-compound refresh auth`.

A refresh finds five learnings and two pattern docs that match via directory, frontmatter, filename, or content.

Investigation: three still name files that moved (`auth_token.rb` → `session_token.rb`). One is fully superseded by a newer doc. One is still accurate. One pattern doc generalizes a rule the rename broke. Set analysis then shows two learnings covering the same auth-error problem; the newer one is broader.

Classification: three Updates (rename the references), one Consolidate (merge the older error doc into the newer and delete the older), one Keep, one Replace (the pattern doc gets a successor, then the old file is deleted).

Interactive mode confirms the consolidation if the canonical choice is not obvious; other actions apply directly. On a feature branch, the recommended close is a separate commit of only the refresh files. The printed report lists every doc, the outcome, the evidence, and what was done.


### When to Reach For It

Reach for a refresh when:

- A refactor or rename just landed and learnings in that area likely drifted
- `ce-compound` flagged a specific older doc as superseded
- Two docs in `docs/solutions/` look like the same problem
- You want a periodic hygiene pass (for example quarterly), preferably scoped
- You want a repo-wide `CONCEPTS.md` seeded from the declared domain model

Skip it when:

- You have not seen any drift. Broad sweeps without evidence produce churn.
- The docs are recent and that area of the codebase has not moved
- You are mid debug or mid build. Capture first with `/ce-compound`; refresh later.
- Work you just finished made one learning wrong and you know which one. `/ce-compound` updates it through its overlap check, and recommends a refresh when older docs look affected too.


### Use as Part of the Workflow

A refresh is the maintenance counterpart to a capture. It is not on the ideate → brainstorm → plan → work path.

- **From a capture**: a narrow scope hint when a new learning suggests an older doc is stale
- **Manual, scoped**: `/ce-compound refresh auth`, `/ce-compound refresh performance-issues`
- **Pre-release**: a pass so documented learnings match what is shipping

Captures add docs. A refresh keeps the set lean. Without refreshes, captures eventually clutter the store.


### Reference

| Argument | Effect |
|----------|--------|
| _(empty)_ | Broad sweep with triage. Interactive: confirm the starting cluster. Non-interactive: process everything, no narrowing question. |
| `<directory>` | Category folder, e.g. `performance-issues` |
| `<filename slug>` | One file, e.g. `release-please-version-drift-recovery` |
| `<module/keyword>` | Narrow by frontmatter or content, e.g. `auth`, `payments` |
| `mode:refresh mode:non-interactive` | Add to any of the above for a schedule or another skill. The plain word `refresh` does not start an unattended sweep, because capture takes free-text context. No prompts. Unambiguous actions apply; the rest are stale-marked or recommended. Deprecated alias: `mode:headless`. |
| `create a CONCEPTS.md` / `build the concept map` | Interactive: ask whether to bootstrap the glossary or run a refresh. Non-interactive: run a refresh and note that a standalone bootstrap was not run. |

Default review root: `docs/solutions/` (follows `docs_root` if set). `README.md` files and anything under `_archived/` are not review candidates. Catalog README rows still update when a listed doc is removed or renamed. If `_archived/` exists, the report flags it for cleanup.

On the default branch, non-interactive commits on a named branch and attempts a PR. Interactive asks: branch + PR, commit here, or don't commit.


### FAQ

**What's the difference between Update and Replace?**
Update fixes drift and keeps the recommended solution (renamed file, moved class, broken link, unambiguous misfile). Replace rewrites the guidance because the recommended approach changed. If you would rewrite the solution section, that is Replace.

**What happens when code and guidance disagree?**
Claims about current mechanics follow the code. Guidance with independent support follows its governing evidence; if the implementation no longer satisfies it, a refresh preserves the guidance and reports a potential product regression without touching product code.

**When should I use non-interactive mode?**
Periodic or large-scope runs where stopping on every question is impractical. Ambiguous cases are marked stale, so the report is something a human can review.

**What if it wants to delete a doc I want to keep?**
Interactive mode shows the evidence first. Decline and the file stays. Non-interactive auto-delete is conservative: a substantive citation downgrades to stale-marking.

**Why delete instead of archive?**
Archive folders accumulate and pollute search. `git log --diff-filter=D -- docs/solutions/` recovers anything you need.

**Does it reorganize `docs/solutions/`?**
Only the safe subset. Unambiguous misfilings can move with inbound-link rewrites. One multi-problem doc can be split (always recommend-only when unattended). Catalog README rows update when a listed doc is removed or renamed. Renaming categories or inventing new ones is never automated.

**Does it treat pattern docs differently?**
Same five outcomes, different evidence. Keep means the supporting learnings still back the rule. Replace means the generalization is now wrong, and the successor is built from the refreshed learnings, not invented fresh.

**What does a CONCEPTS.md run do?**
It seeds the project's core domain nouns into a repo-root glossary. A normal refresh also accretes terms from the docs in scope and will create `CONCEPTS.md` if enough terms qualify. The explicit bootstrap is the only repo-wide seed.

---

## See also

- [`ce-compound-refresh`](./ce-compound-refresh.md): the old name for a refresh, still working for now
- [`ce-debug`](./ce-debug.md): a common moment to capture, after a fix is verified
- [`ce-work`](./ce-work.md): a common moment to capture, after shipping
- [`ce-plan`](./ce-plan.md): reads `docs/solutions/` as institutional memory during planning
- [`ce-ideate`](./ce-ideate.md): reads `docs/solutions/` as part of grounding
