# Refresh Workflow Reference

Read this reference when executing the **refresh mode** of `ce-compound`. It holds the detailed investigation, classification, and action-execution phases.

---

## Scope Selection

Start by discovering learnings and pattern docs under `docs/solutions/`.

Exclude:
- `README.md`
- `docs/solutions/_archived/` (legacy; if this directory exists, flag it for cleanup in the report)

Find all `.md` files under `docs/solutions/`, excluding `README.md` and anything under `_archived/`. If an `_archived/` directory exists, note it in the report as a legacy artifact to clean up (files either restored or deleted).

If `$ARGUMENTS` (past the `mode:refresh` token) is provided, use it to narrow scope. Try these matching strategies in order, stopping at the first that produces results:

1. **Directory match:** the argument matches a subdirectory name under `docs/solutions/`
2. **Frontmatter match:** search `module`, `component`, or `tags` fields for the argument
3. **Filename match:** partial matches are fine
4. **Content search:** search file contents for the argument as a keyword

If no matches are found, report that and ask the user to clarify (interactive mode), or report the miss and exit without widening to all docs (headless mode). When no scope hint was provided, process everything.

If no candidate docs are found:

```text
No candidate docs found in docs/solutions/.
Run /ce-compound after solving problems to start building your knowledge base.
```

---

## Phase 0: Assess and Route

Before asking the user to classify anything:

1. Discover candidate artifacts
2. Estimate scope
3. Choose the lightest interaction path that fits

### Route by Scope

| Scope | When to use it | Interaction style |
|-------|----------------|-------------------|
| **Focused** | 1-2 likely files or user named a specific doc | Investigate directly, then present a recommendation |
| **Batch** | Up to ~8 mostly independent docs | Investigate first, then present grouped recommendations |
| **Broad** | 9+ docs, ambiguous, or repo-wide stale-doc sweep | Triage first, then investigate in batches |

### Broad Scope Triage

When scope is broad (9+ candidate docs), do a lightweight triage before deep investigation:

1. **Inventory:** read frontmatter of all candidate docs, group by module/component/category
2. **Impact clustering:** identify areas with the densest clusters of learnings + pattern docs
3. **Spot-check drift:** for each cluster, check whether the primary referenced files still exist
4. **Recommend a starting area:** present the highest-impact cluster. In headless mode, skip the question and process all clusters in impact order.

---

## Phase 1: Investigate Candidate Learnings

For each learning in scope, read it, cross-reference its claims against the current codebase, and form a recommendation.

Dimensions to check per learning:

- **References:** file paths, class names, modules still exist or moved?
- **Recommended solution:** does the fix still match how the code works today?
- **Code examples:** do snippets reflect the current implementation?
- **Related docs:** are cross-referenced learnings and patterns still present and consistent?
- **Auto memory** (Claude Code only): does the injected auto-memory block contain entries in the same domain? Scan that block directly. Tag memory-sourced signals with "(auto memory [claude])".
- **Overlap:** note when another doc in scope covers the same problem domain. Record both file paths, which dimensions overlap, and which doc appears broader or more current.
- **Vocabulary:** note domain terms cited. Flag for Phase 4.5 (don't edit CONCEPTS.md during investigation).

### Drift Classification: Update vs Replace

- **Update territory:** references moved but the core recommended approach is still correct.
- **Replace territory:** the recommended solution conflicts with current code, or the architecture changed. A replacement subagent writes the successor using the documentation contract files.

**The boundary:** if you find yourself rewriting the solution section, stop; that is Replace, not Update.

Memory-only drift (no codebase corroboration) -> stale-mark in headless mode; deeper investigation in interactive mode.

### Judgment Guidelines

1. **Contradiction = strong Replace signal.** Conflicting recommendation vs. current code is misleading.
2. **Age alone is not a stale signal.** A 2-year-old learning that still matches current code is fine.
3. **Check for successors before deleting.** Prefer Replace over Delete when successor evidence exists.

## Phase 1.5: Investigate Pattern Docs

After reviewing individual learning docs, investigate relevant pattern docs under `docs/solutions/patterns/`.

Pattern docs are high-leverage: a stale pattern is more dangerous than a stale individual learning because future work may treat it as broadly applicable guidance. Evaluate whether the generalized rule still holds given the refreshed state of the learnings it depends on.

A pattern doc with no clear supporting learnings is a stale signal.

## Phase 1.75: Document-Set Analysis

After investigating individual docs, step back and evaluate the document set as a whole.

### Overlap Detection

For docs sharing the same module, component, tags, or problem domain, compare:

- **Problem statement:** same underlying problem?
- **Solution shape:** same approach, even if worded differently?
- **Referenced files:** same code paths?
- **Prevention rules:** same prevention bullets?
- **Root cause:** same root cause?

High overlap across 3+ dimensions is a strong Consolidate signal.

### Supersession Signals

Detect "older narrow precursor, newer canonical doc" patterns. When a newer doc clearly subsumes an older one, the older doc is a consolidation candidate.

### Retrieval-Value Test

Before recommending two docs stay separate: "If a maintainer searched for this topic six months from now, would having these as separate docs improve discoverability, or just create drift risk?"

Separate docs earn their keep only when they cover genuinely different sub-problems that someone might search for independently.

### Cross-Doc Conflict Check

Outright contradictions between docs are more urgent than individual staleness; they actively confuse readers. Flag for immediate resolution.

---

## Subagent Strategy

| Approach | When to use |
|----------|-------------|
| **Main thread only** | Small scope, short docs |
| **Sequential subagents** | 1-2 artifacts with many supporting files to read |
| **Parallel subagents** | 3+ truly independent artifacts with low overlap |
| **Batched subagents** | Broad sweeps; narrow scope first, then investigate in batches |

When spawning any subagent, include:

> Use dedicated file search and read tools (Glob, Grep, Read) for all investigation. Do NOT use shell commands (ls, find, cat, grep) for file operations.
>
> Also scan the "user's auto-memory" block (Claude Code only). Report memory-sourced drift signals tagged with "(auto memory [claude])".

Two subagent roles:

1. **Investigation subagents:** read-only. Return file path, evidence, recommended action, confidence, open questions. Can run in parallel when artifacts are independent.
2. **Replacement subagents:** write a single new learning. Run one at a time, sequentially. The orchestrator handles all deletions and metadata updates.

---

## Phase 2: Classify the Right Maintenance Action

### Keep

Still accurate and useful. Do not edit the file; report reviewed and remains trustworthy.

### Update

Core solution still valid but references drifted. Apply evidence-backed in-place edits: paths, class names, links, code snippets, metadata.

### Consolidate

Overlapping docs that are both materially correct. Merge unique content from subsumed doc into the canonical doc; delete subsumed doc. Delete, do not archive.

**When to consolidate:** two docs describe the same problem + solution; one is a narrow precursor of a broader newer doc; unique content can fit as a section in the canonical doc.

**When NOT:** docs cover genuinely different sub-problems; merging harms navigation more than drift risk harms accuracy.

### Replace

Core guidance is now misleading. Assess whether Phase 1 evidence is sufficient to write a trustworthy replacement. If sufficient, proceed to write via subagent. If insufficient, mark as stale: add `status: stale`, `stale_reason`, and `stale_date` frontmatter.

### Delete

When: referenced code/workflow is gone and problem domain no longer exists; learning is fully redundant with no unique content to merge; no meaningful successor evidence.

**Auto-delete only when all three hold:**
- The implementation is gone (or fully superseded).
- The problem domain is gone.
- Inbound links are absent or unambiguously decorative.

### Before deleting: check problem domain

When a learning's referenced files are gone, understand whether the **problem** it solves is still a concern. A learning about session token storage where `auth_token.rb` is gone: does the app still handle session tokens? If so, the concept persists under a new implementation (Replace, not Delete).

### Before deleting: check inbound links

Search the repo's markdown content for citations of the file (not source code). Classify each citation:

- **Decorative:** "see also" pointer; Delete is fine, clean up citations in same commit.
- **Substantive:** citing doc relies on cited doc for content not stated inline. Signal Replace.
- **Mixed or unclear:** stale-mark.

In headless mode, any substantive citation or genuine ambiguity downgrades to stale-marking.

---

## Phase 3: Ask for Decisions (Interactive mode only)

### Headless mode

Skip this entire phase. Execute all actions based on Phase 2 classifications:
- Unambiguous Keep, Update, Consolidate, auto-Delete, and Replace (with sufficient evidence) -> execute directly
- Ambiguous cases -> mark as stale

### Interactive mode

Most Updates and Consolidations should be applied directly without asking. Only ask the user when:

- The right action is genuinely ambiguous
- About to Delete and auto-delete criteria are not fully met
- About to Consolidate and canonical doc choice is not clear-cut
- About to Replace (create a successor)

**Question style:** ask one question at a time, prefer multiple choice, lead with the recommended option.

**Focused scope:** present file path, 2-4 bullets of evidence, recommended action, then ask. Do not list all five actions unless all five are genuinely plausible.

**Batch scope:** group obvious Keep/Update together; present Consolidate by cluster; Replace one at a time; Delete individually unless auto-delete criteria are met.

---

## Phase 4: Execute the Chosen Action

Read `references/per-action-flows.md` and follow the matching section for each candidate's classified action (Keep, Update, Consolidate, Replace, Delete).

---

## Phase 4.5: Vocabulary Capture

**Input:** the set of domain-term signals flagged across Phase 1's Vocabulary dimension.
**Output:** CONCEPTS.md created or updated (or an explicit "no qualifying terms" record). No other files are touched in this phase.

**First, read `references/concepts-vocabulary.md`.** This is unconditional. Do not pre-judge from memory which Phase 1 signals qualify; the reference's criteria are non-obvious and a "nothing qualifies" judgment without reading is a shortcut, not a result.

**Procedure:**

1. **Aggregate.** Collect qualifying terms surfaced across the learnings in scope. If no Phase 1 signals qualified, record "scanned, no qualifying terms" in the report's `CONCEPTS.md` line and stop; do not proceed to steps 2-5. Do not silently skip; the visible no-result record is the audit signal that the reference was consulted.
2. **If qualifying terms were found and `CONCEPTS.md` exists**: add missing qualifying terms and refine existing in-scope entries when the corpus surfaced new precision. Do not duplicate entries already present. Then backfill any core domain nouns of the in-scope area that are central but missing (per the **Seed goal** in the reference), bounded to the area in scope, never a repo-wide sweep.
3. **If qualifying terms were found and `CONCEPTS.md` does not exist**: bootstrap it. Alongside the surfaced term(s), seed the core domain nouns of the in-scope area per the reference's **Seed goal**, so the file is anchored from creation rather than a lone peripheral entry. At creation, hold the qualifying bar conservatively: clear core nouns are seeded, borderline ones wait. The seed stays scoped to this run's area; a repo-wide concept map comes only from the explicit bootstrap path in SKILL.md.
4. **Initial structure.** When bootstrapping, start the file with this preamble under the `# Concepts` heading:

   > Shared domain vocabulary for this project: entities, named processes, and status concepts with project-specific meaning. Seeded with core domain vocabulary, then accretes as ce-compound processes learnings; direct edits are fine. Glossary only, not a spec or catch-all.

   Let term count drive shape: 1-4 terms -> flat headings, more -> cluster by domain relationship per the rules in `references/concepts-vocabulary.md`.
5. **Scrub in-scope entries only.** For entries being added or refined in this run, also inspect their coherence neighborhood: cluster siblings and terms they cross-reference. Fix glossary violations within that neighborhood: implementation specifics (file paths, class names, function signatures), drifting config values, or entries that lean on an undefined sibling. Do not sweep the entire file; full-file cleanup belongs to an explicit concept-audit or bootstrap path.
6. **Scope discipline.** All edits reflect only the area in scope; do not retroactively inject `(see CONCEPTS.md)` pointers into existing learnings.

If this run creates `CONCEPTS.md` from scratch, the Discoverability Check below must also run a parallel check for it.

**Apply edits silently, no user prompt in any mode.** Vocabulary capture is a side effect of refreshing, not a decision the user makes per run.

---

## Pattern Guidance

Apply the same five outcomes to pattern docs, but evaluate them as **derived guidance**:

- **Keep**: underlying learnings still support the rule and examples are representative
- **Update**: rule holds but examples, links, scope, or references drifted
- **Consolidate**: two pattern docs generalize the same learnings
- **Replace**: generalized rule is now misleading; base replacement on the refreshed learning set
- **Delete**: pattern is no longer valid, recurring, or fully subsumed by a stronger pattern doc

---

## Output Format

**The full report MUST be printed as markdown output.** The report is the deliverable.

```text
Compound Refresh Summary
========================
Scanned: N learnings

Kept: X
Updated: Y
Consolidated: C
Replaced: Z
Deleted: W
Skipped: V
Marked stale: S

CONCEPTS.md: <scanned, no qualifying terms | created with N entries (M seeded) | updated, N added, N refined, N reconciled, N scrubbed | repo-wide map created with N entries>
```

Then for EVERY file processed, list: file path, classification, evidence (tag memory-sourced findings with "(auto memory [claude])"), and what action was taken or recommended. For Keep outcomes, list under a reviewed-without-edits section.

### Headless mode report

Split into **Applied** (writes that succeeded) and **Recommended** (actions that could not be written; include enough context for a human to apply manually or re-run interactively).

**Legacy cleanup:** if `docs/solutions/_archived/` exists, list archived files and recommend disposition.

---

## Phase 5: Commit Changes

Skip if no files were modified.

### Detect git context

Before offering options: check current branch, whether working tree has other uncommitted changes, recent commit messages to match repo style.

### Headless mode defaults

| Context | Default action |
|---------|---------------|
| On main/master | Create branch named for what was refreshed, commit, attempt to open PR. If PR creation fails, report branch name. |
| On a feature branch | Commit as a separate commit on the current branch |
| Git operations fail | Include recommended git commands in the report |

Stage only the files that compound-refresh modified, not other dirty files.

### Interactive mode

Check current branch first, then present correct options. Stage only refresh-modified files.

**If on main/master:**
1. Create a branch, commit, and open a PR (recommended)
2. Commit directly to current branch
3. Don't commit

**If on a feature branch, clean working tree:**
1. Commit to current branch as a separate commit (recommended)
2. Create a separate branch and commit
3. Don't commit

**If on a feature branch, dirty working tree:**
1. Commit only refresh changes (other dirty files stay untouched)
2. Don't commit

### Commit message

Summarize what was refreshed, follow the repo's existing commit conventions, be succinct.

---

## Discoverability Check (refresh mode)

**When to run:** after Phase 4.5 completes and before Phase 5 commit.
**Input:** whether Phase 5 has committed yet, and which (if any) instruction files were edited.
**Output:** 0-2 instruction-file edits (one for `docs/solutions/`, one for `CONCEPTS.md` if it exists). These edits are staged and committed as part of Phase 5 or as a follow-up commit; they are never left untracked silently.

Check whether the project's instruction files would lead an agent to discover `docs/solutions/`. Same workflow as the create-mode discoverability check in SKILL.md: same target file, same edit-placement judgment, same interaction shape per mode.

**If `CONCEPTS.md` exists at repo root**, run a parallel check for it using the same workflow. **Skip entirely if `CONCEPTS.md` does not exist**; never prompt for an artifact the project has not adopted.

**Commit handoff (exact behavior):**

| When | Action |
|------|--------|
| Phase 5 has not yet committed | Include the instruction-file edit(s) in the Phase 5 commit alongside the refresh changes (single commit covering all changes). |
| Phase 5 already committed, not yet pushed | Stage the instruction-file edit(s) and amend the Phase 5 commit. |
| Phase 5 already committed and pushed | Stage the instruction-file edit(s) and create a small follow-up commit (e.g., `docs: add docs/solutions/ discoverability to AGENTS.md`), then push. |
| User chose "Don't commit" in Phase 5 | Leave instruction-file edits unstaged alongside other uncommitted refresh changes. No separate commit logic. |
| Headless mode | Do not edit instruction files. Emit a "Discoverability recommendation" line in the report instead; headless scope is doc maintenance, not project config. |
