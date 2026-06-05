---
name: ce-compound
description: "Document a recently solved problem to compound your team's knowledge, or refresh stale learnings in docs/solutions/ (keep, update, consolidate, replace, delete). Use after fixing a bug, completing a feature, or when docs drift after refactors, migrations, or dependency upgrades."
argument-hint: "[optional: brief context] [mode:headless] [mode:refresh [scope hint]]"
---

# /ce-compound

Coordinate multiple subagents working in parallel to document a recently solved problem, or (in refresh mode) maintain existing learnings against the current codebase.

## Usage

```bash
/ce-compound                              # Document the most recent fix
/ce-compound [brief context]              # Provide additional context hint
/ce-compound mode:headless                # Non-interactive run for automations
/ce-compound mode:headless [context]      # Non-interactive run with context hint
/ce-compound mode:refresh                 # Refresh all docs/solutions/ learnings
/ce-compound mode:refresh [scope hint]    # Refresh a specific area, module, or file
/ce-compound mode:refresh mode:headless   # Headless refresh
```

## Mode Detection

Check `$ARGUMENTS` for mode tokens. Tokens starting with `mode:` are flags, not context — strip them from arguments before treating the remainder as the brief context hint or scope hint.

| Mode | Token | Behavior |
|------|-------|----------|
| **Create (default)** | none | Document a newly solved problem |
| **Refresh** | `mode:refresh` | Maintain existing learnings in `docs/solutions/` |
| **Headless** | `mode:headless` | Non-interactive; applies to whichever mode is active |

Route immediately after mode detection:
- `mode:refresh` present → jump to **Refresh Mode** section below
- Neither token → continue with **Create Mode**

## CONCEPTS.md bootstrap requests

If invoked specifically to create or bootstrap `CONCEPTS.md` without a solved problem (create mode) or a refresh target (refresh mode), disambiguate before proceeding using the platform's blocking question tool (`AskUserQuestion` in Claude Code — call `ToolSearch` with `select:AskUserQuestion` first if its schema isn't loaded; `request_user_input` in Codex; `ask_user` in Gemini). Two options:

1. **Create CONCEPTS.md (build the concept map)** — seed the repo-wide concept map from the declared domain model and commit it via the refresh Phase 5 commit flow. Read `references/concepts-vocabulary.md` and follow its **Seed goal** and **Scope of a seed** (repo-wide) rules. Run the Discoverability Check so `AGENTS.md`/`CLAUDE.md` surface the new file.
2. **Document a solved problem** — proceed with create mode; `CONCEPTS.md` is seeded as a side effect of Phase 2.4 if a qualifying term surfaces.

In headless mode, default to the refresh cycle with vocabulary seeding via Phase 4.5; note in the report that a standalone repo-wide bootstrap was not run.

---

# Create Mode

## Pre-resolved context

**Git branch (pre-resolved):** !`git rev-parse --abbrev-ref HEAD 2>/dev/null || true`

If the line above resolved to a plain branch name, include it in the `ce-sessions` invocation payload in Phase 1. If empty or a literal command string, omit it.

## Support Files

Read on-demand at the step that needs them — do not bulk-load at skill start.

- `references/schema.yaml` — canonical frontmatter fields and enum values (read when validating YAML)
- `references/yaml-schema.md` — category mapping from problem_type to directory (read when classifying)
- `references/concepts-vocabulary.md` — CONCEPTS.md format and inclusion rules (read in Phase 2.4)
- `assets/resolution-template.md` — section structure for new docs (read when assembling)

When spawning subagents, pass the relevant file contents into the task prompt.

## Create Execution Strategy

**In headless mode**, skip both questions below and go directly to **Full Mode** with session history disabled. Phase 1's session-history step is omitted. Proceed straight to research.

**In interactive mode**, present the user with two options before proceeding, using the platform's blocking question tool (`AskUserQuestion` in Claude Code — call `ToolSearch` with `select:AskUserQuestion` first if its schema isn't loaded; `request_user_input` in Codex; `ask_user` in Gemini). Fall back to presenting options in chat only when no blocking tool exists or the call errors. Never silently skip the question.

```
1. Full (recommended) — the complete compound workflow. Researches,
   cross-references, and reviews your solution to produce documentation
   that compounds your team's knowledge.

2. Lightweight — same documentation, single pass. Faster and uses
   fewer tokens, but won't detect duplicates or cross-reference
   existing docs. Best for simple fixes or long sessions nearing
   context limits.
```

**If the user chooses Full** (interactive mode only), ask one follow-up question before proceeding:

```
Would you also like to search your [harness name] session history
for relevant knowledge to help the Compound process? This adds
time and token usage.
```

If yes, invoke `ce-sessions` in Phase 1. If no, skip it. Do not ask in lightweight or headless mode.

---

### Full Mode

<critical_requirement>
**The primary deliverable is ONE file - the final documentation.**

Phase 1 subagents return TEXT DATA to the orchestrator. They must NOT use Write, Edit, or create any files. Only the orchestrator writes files. Beyond the Phase 2 solution doc, its other writes are maintenance side effects — CONCEPTS.md (Phase 2.4) and a project instruction file edit (Discoverability Check). These side effects are expected, not a violation of this rule.
</critical_requirement>

### Phase 0.5: Auto Memory Scan

Before launching Phase 1 subagents, check the auto-memory block injected into your system prompt for notes relevant to the problem being documented.

1. Look for a block labeled "user's auto-memory" (Claude Code only) already present in your system prompt
2. If absent, empty, or non-Claude-Code, skip and proceed to Phase 1
3. Scan entries for anything related to the problem — semantic judgment, not keyword matching
4. If relevant entries found, prepare a labeled excerpt block:

```
## Supplementary notes from auto memory
Treat as additional context, not primary evidence. Conversation history
and codebase findings take priority over these notes.

[relevant entries here]
```

5. Pass this block as additional context to Context Analyzer and Solution Extractor in Phase 1. Tag any memory notes that end up in the final doc with "(auto memory [claude])".

### Phase 1: Research

**Dispatch order:** launch `Context Analyzer`, `Solution Extractor`, and `Related Docs Finder` in parallel (background), **then** invoke `ce-sessions` synchronously (if user opted in) — the parallel subagents continue running underneath.

<parallel_tasks>

#### 1. Context Analyzer
- Extracts conversation history
- Reads `references/schema.yaml` for enum validation and track classification
- Determines the track (bug or knowledge) from the problem_type
- Reads `references/yaml-schema.md` for category mapping into `docs/solutions/`
- Suggests a filename using pattern `[sanitized-problem-slug].md` — no date suffix
- Returns: YAML frontmatter skeleton (must include `category:`), category directory path, suggested filename, and which track applies
- Does not invent enum values, categories, or frontmatter fields from memory

#### 2. Solution Extractor
- Reads `references/schema.yaml` for track classification
- Incorporates auto memory excerpts (if provided) as supplementary evidence

   **Bug track:** Problem, Symptoms, What Didn't Work, Solution (with code), Why This Works, Prevention

   **Knowledge track:** Context, Guidance, Why This Matters, When to Apply, Examples

#### 3. Related Docs Finder
- Searches `docs/solutions/` for related documentation using grep-first filtering:
  1. Extract keywords from problem context
  2. If category is clear, narrow to matching subdirectory
  3. Use native content-search (Grep) to pre-filter before reading. Run in parallel:
     - `title:.*<keyword>`, `tags:.*(<keyword1>|<keyword2>)`, `module:.*<module>`, `component:.*<component>`
  4. Read only frontmatter (first 30 lines) of candidates; fully read only strong/moderate matches
- **Assesses overlap** across: problem statement, root cause, solution approach, referenced files, prevention rules. Score: High (4-5 dimensions), Moderate (2-3), Low (0-1)
- Returns: links, relationships, refresh candidates, and overlap assessment

</parallel_tasks>

#### 4. Session History via `ce-sessions` (synchronous, after parallel block — only if user opted in)

Skip if: user declined, lightweight mode, or headless mode.

Invoke `ce-sessions` via the platform's skill-invocation primitive. Dispatch payload (keep tight):
- Pre-resolved context: repo name, current git branch (only if resolved cleanly)
- Time window: `7 days` unless the problem clearly spans a longer arc
- Problem topic: one sentence naming the concrete issue
- Filter rule: "Only surface findings directly relevant to this specific problem."
- Output schema: What was tried before / What didn't work / Key decisions / Related context

When it returns, proceed directly to Phase 2 — do not pause for the user.

### Phase 2: Assembly & Write

**WAIT for all Phase 1 inputs before proceeding.**

The orchestrating agent performs these steps:

1. Collect all text results from Phase 1 subagents
2. **Check overlap assessment** from Related Docs Finder:

   | Overlap | Action |
   |---------|--------|
   | **High** (4-5 dimensions) | Update the existing doc with fresher context rather than creating a duplicate. Preserve its file path and frontmatter structure; add `last_updated: YYYY-MM-DD`. |
   | **Moderate** (2-3 dimensions) | Create the new doc normally. Flag for Phase 2.5 to recommend consolidation review. |
   | **Low or none** | Create the new doc normally. |

3. **Incorporate session history findings** (if available). Fold investigation dead ends into What Didn't Work (bug) or Context (knowledge). Tag session-sourced content with "(session history)".
4. Assemble complete markdown file, reading `assets/resolution-template.md` for section structure
5. Validate YAML frontmatter against `references/schema.yaml`, including the YAML-safety quoting rule for array items (see `references/yaml-schema.md` > YAML Safety Rules)
6. Create directory if needed: `mkdir -p docs/solutions/[category]/`
7. Write the file: `docs/solutions/[category]/[filename].md`
8. **Run `python3 scripts/validate-frontmatter.py <output-path>`** — exit 0 means parser-safe; exit 1 names offending fields. Fix, re-write, and re-run until exit 0.

### Phase 2.4: Vocabulary Capture

**First, read `references/concepts-vocabulary.md`.** This is unconditional.

Scan the new doc **and** the surrounding conversation for qualifying domain terms. If `CONCEPTS.md` exists at repo root, add missing qualifying terms and refine existing entries when new precision surfaced. If it does not exist and at least one qualifying term surfaced, create it.

**Seed the learning's area at creation — don't write a lone term.** When `CONCEPTS.md` does not yet exist, alongside the surfaced term also seed the core domain nouns of the area this learning touched, following the **Seed goal** and **Scope of a seed** rules in `references/concepts-vocabulary.md`. A repo-wide concept map is the explicit bootstrap path above, not this one.

**At creation, hold the qualifying bar conservatively for borderline terms.** A borderline term defers to a later run.

**When bootstrapping, start with this preamble** under the `# Concepts` heading:

> Shared domain vocabulary for this project — entities, named processes, and status concepts with project-specific meaning. Seeded with core domain vocabulary, then accretes as ce-compound processes learnings; direct edits are fine. Glossary only, not a spec or catch-all.

**Refresh the coherence neighborhood of any entry you touch.** When adding or editing an entry, inspect its cluster siblings and the terms it cross-references. Fix glossary violations (file paths, class names, function signatures, current-config values) and refresh entries where this learning's evidence shows drift. Bounds: neighborhood only, never a full-file audit.

If no terms qualified, record that explicitly in the success output (e.g., "Vocabulary capture: scanned, no qualifying terms").

**Apply edits silently in every mode — no user prompt.**

### Phase 2.5: Selective Refresh Check

After writing the new learning, decide whether this new solution is evidence that older docs should be refreshed.

`mode:refresh` is **not** a default follow-up. Invoke it selectively:

**Invoke when:**
1. A related learning or pattern doc recommends an approach the new fix now contradicts
2. The new fix clearly supersedes an older documented solution
3. The current work involved a refactor, migration, rename, or dependency upgrade that likely invalidated references in older docs
4. A pattern doc now looks overly broad or outdated
5. The Related Docs Finder surfaced high-confidence refresh candidates
6. The Related Docs Finder reported **moderate overlap** — consolidation opportunities may exist

**Do not invoke when:**
1. No related docs were found
2. Related docs still appear consistent with the new learning
3. The overlap is superficial and does not change prior guidance
4. Refresh would require a broad historical review with weak evidence

Rules:
- One obvious stale candidate → invoke `/ce-compound mode:refresh` with a narrow scope hint
- Multiple candidates in the same area → ask the user whether to run a targeted refresh
- Context already tight or lightweight mode → recommend as next step with scope hint
- **In headless mode** → never invoke; surface the recommended scope hint in the terminal report's "Refresh recommendation" line

When recommending, prefer the narrowest useful scope: specific file, module/component name, or category name. Examples: `/ce-compound mode:refresh plugin-versioning-requirements`, `/ce-compound mode:refresh payments`.

Always capture the new learning first. Refresh is a targeted maintenance follow-up.

### Discoverability Check

After the learning is written and the refresh decision is made, check whether the project's instruction files would lead an agent to discover and search `docs/solutions/`.

1. Identify which root-level instruction files exist (AGENTS.md, CLAUDE.md, or both). Determine which holds the substantive content — one may be a shim that `@`-includes the other. If neither exists, skip entirely.
2. Assess semantically whether an agent would learn: (a) a searchable knowledge store exists, (b) enough about its structure to search effectively (category organization, YAML frontmatter fields), (c) when to search it.
3. If the spirit is already met, no action needed.
4. If not:
   a. Identify where a mention fits naturally. A line in an existing section is almost always better than a new headed section.
   b. Draft the smallest addition that communicates the three things. Keep tone informational, not imperative.

      Example when an existing directory listing is present:
      ```
      docs/solutions/  # documented solutions to past problems (bugs, best practices, workflow patterns), organized by category with YAML frontmatter (module, tags, problem_type)
      ```
   c. In interactive mode, explain why and show the proposed change, then use the platform's blocking question tool for consent. In lightweight mode, output a one-liner note. In headless mode, apply the edit directly and surface it in the terminal report under "Instruction-file edit".

5. **If `CONCEPTS.md` exists at repo root**, run a parallel discoverability check for it using the same workflow. Skip if `CONCEPTS.md` does not exist.

### Phase 3: Optional Enhancement

**WAIT for Phase 2 to complete. Skip entirely in headless mode.**

<parallel_tasks>

Based on problem type, optionally invoke specialized agents:
- **performance_issue** → `ce-performance-oracle`
- **security_issue** → `ce-security-sentinel`
- **database_issue** → `ce-data-integrity-guardian`
- Any code-heavy issue → `ce-code-simplicity-reviewer`

</parallel_tasks>

---

### Lightweight Mode

<critical_requirement>
Single-pass alternative — same documentation, fewer tokens. Skips parallel subagents entirely. Headless mode forces Full; it does not enter Lightweight.
</critical_requirement>

The orchestrator performs ALL of the following in one sequential pass:

1. **Extract from conversation**: Identify the problem and solution. Scan "user's auto-memory" block if present (Claude Code only). Tag memory-sourced content with "(auto memory [claude])".
2. **Classify**: Read `references/schema.yaml` and `references/yaml-schema.md`, then determine track, category, and filename.
3. **Write minimal doc**: Create `docs/solutions/[category]/[filename].md` using the appropriate track template from `assets/resolution-template.md`, with YAML frontmatter applying the YAML-safety quoting rule for array items (see `references/yaml-schema.md` > YAML Safety Rules).
4. **Vocabulary capture (update-only)**: if `CONCEPTS.md` exists, read `references/concepts-vocabulary.md`, scan for qualifying terms, and add/refine entries silently. Do **not** bootstrap or seed in lightweight mode. Record the outcome. If `CONCEPTS.md` isn't surfaced in `AGENTS.md`/`CLAUDE.md`, add the discoverability tip to the output — lightweight **tips**, it does not edit instruction files.
5. **Skip Phase 3** (specialized agent reviews).

**Lightweight output:**
```
✓ Documentation complete (lightweight mode)

File created:
- docs/solutions/[category]/[filename].md

[If discoverability gap found:]
Tip: Your AGENTS.md/CLAUDE.md doesn't surface docs/solutions/ to agents —
a brief mention helps all agents discover these learnings.

Note: This was created in lightweight mode. For richer documentation
(cross-references, detailed prevention strategies, specialized reviews),
re-run /ce-compound in a fresh session.
```

In lightweight mode, the overlap check is skipped. Lightweight mode may create a doc that overlaps with an existing one — `/ce-compound mode:refresh` will catch it later.

---

## Create Mode Success Output

### Headless mode

```
✓ Documentation complete (headless mode)

File: docs/solutions/<category>/<filename>.md  (created | updated)
Track: <bug | knowledge>
Category: <category>
Overlap: <none | low | moderate — see <path> | high — existing doc updated>
Instruction-file edit: <none needed | applied to <path> | gap noted, not applied>
CONCEPTS.md: <scanned, no qualifying terms | created with N entries (M seeded from the learning's area) | updated — N added, N refined>
Refresh recommendation: <none | scope hint for /ce-compound mode:refresh>

Documentation complete
```

When no doc was written (problem not yet solved), emit `Documentation skipped` with a one-sentence reason.

### Interactive mode

```
✓ Documentation complete

[Success details, subagent results, files written]

What's next?
1. Continue workflow (recommended)
2. Link related documentation
3. Update other references
4. View documentation
5. Other
```

Present "What's next?" using the platform's blocking question tool. In headless mode, skip this.

---

# Refresh Mode

`/ce-compound mode:refresh` maintains older learnings as the codebase evolves — both their individual accuracy and their collective design as a document set.

## Interaction Principles (interactive mode only)

- Ask questions **one at a time** using the platform's blocking question tool
- Prefer **multiple choice** when natural options exist
- Start with **scope and intent**, then narrow only when needed
- Do **not** ask for decisions before you have evidence
- Lead with a recommendation and explain it briefly

## Maintenance Model

For each candidate artifact, classify into one of five outcomes:

| Outcome | Meaning | Default action |
|---------|---------|----------------|
| **Keep** | Still accurate and useful | No file edit; report reviewed and trustworthy |
| **Update** | Core solution correct, but references drifted | Apply evidence-backed in-place edits |
| **Consolidate** | Two or more docs overlap heavily but are both correct | Merge unique content into canonical doc, delete subsumed doc |
| **Replace** | Old artifact is now misleading, known better replacement exists | Create trustworthy successor, then delete old artifact |
| **Delete** | No longer useful, applicable, or distinct | Delete the file |

## Core Rules

1. **Evidence informs judgment.** Use engineering judgment, not a mechanical scorecard.
2. **Prefer no-write Keep.** Do not update a doc just to leave a review breadcrumb.
3. **Match docs to reality, not the reverse.** If code changed, the doc should match.
4. **Be decisive, minimize questions.** Only ask when the right action is genuinely ambiguous.
5. **Avoid low-value churn.** No typo fixes, prose polish, or cosmetic changes.
6. **Delete, don't archive.** No `_archived/` directory. Git history preserves every deleted file.

## Headless Mode Rules

- **Skip all user questions.** Never pause for input.
- **Process all docs in scope.** No scope-narrowing questions.
- **Attempt all safe actions:** Keep, Update, Consolidate, auto-Delete, Replace (with sufficient evidence). If a write fails, record as **recommended** in the report and continue.
- **Mark as stale when uncertain.** Add `status: stale`, `stale_reason`, `stale_date` frontmatter.
- **Always generate a report.** Two sections: **Applied** and **Recommended**.

## Refresh Phases

Read `references/refresh-workflow.md` and execute in order:

- **Phase 0:** Assess scope and route (Focused / Batch / Broad)
- **Phase 1:** Investigate candidate learnings (references, solution, code examples, auto memory, overlap, vocabulary)
- **Phase 1.5:** Investigate pattern docs
- **Phase 1.75:** Document-set analysis (overlap detection, supersession, retrieval-value test, cross-doc conflicts)
- **Phase 2:** Classify the right maintenance action per learning
- **Phase 3:** Ask for decisions (interactive only; headless skips)
- **Phase 4:** Execute the chosen action via `references/per-action-flows.md`
- **Phase 4.5:** Vocabulary capture
- **Phase 5:** Commit changes
- **Discoverability Check:** After Phase 4.5, before Phase 5 commit

---

## Preconditions

<preconditions enforcement="advisory">
  <check condition="problem_solved">Problem has been solved (not in-progress)</check>
  <check condition="solution_verified">Solution has been verified working</check>
  <check condition="non_trivial">Non-trivial problem (not simple typo or obvious error)</check>
</preconditions>

## Common Mistakes to Avoid

| Wrong | Correct |
|-------|---------|
| Subagents write files like `context-analysis.md` | Subagents return text data; orchestrator writes one final file |
| Research and assembly run in parallel | Research completes → then assembly runs |
| Creating a new doc when an existing doc covers the same problem | Check overlap assessment; update the existing doc when overlap is high |

## Auto-Invoke

<auto_invoke> <trigger_phrases> - "that worked" - "it's fixed" - "working now" - "problem solved" </trigger_phrases>
<manual_override> Use /ce-compound [context] to document immediately without waiting for auto-detection. </manual_override> </auto_invoke>

## Related Commands

- `/ce-sessions` — Search session history for context
- `/ce-plan` — Planning workflow (references documented solutions)
