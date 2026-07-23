---
name: ce-compound-refresh
description: Refresh docs/solutions learnings against the current codebase. Use when auditing stale, overlapping, superseded, or drifted learnings; avoid general refactor, debugging, or code review unless docs/solutions is explicit.
argument-hint: "[optional: scope hint — directory, filename, module, or keyword]"
---

# Compound Refresh

Maintain the quality of `docs/solutions/` over time. This workflow reviews existing learnings against the current codebase, then refreshes any derived pattern docs that depend on them.

## How to Operate

Act on clear evidence without asking, and never block waiting for input. Only ask when a human is actively in the conversation **and** the right action is genuinely ambiguous; otherwise mark the doc stale (`status: stale`, `stale_reason`, `stale_date`) and record it in the report. When you do ask, ask one thing at a time using the platform's blocking question tool — `AskUserQuestion` in Claude Code (call `ToolSearch` with `select:AskUserQuestion` first if its schema isn't loaded), `request_user_input` in Codex, `ask_question` in Antigravity CLI (`agy`), `ask_user` in Pi (requires the `pi-ask-user` extension) — falling back to numbered options in chat when no blocking tool exists in the harness or the call errors (e.g., Codex edit modes). Lead with your recommendation and a one-sentence rationale, and offer only actions that are actually plausible.

Attempt every action the classification calls for. If a write succeeds, record it as **applied**; if it fails (e.g., permission denied), record it as **recommended** in the report and continue — do not stop to ask for permissions. If no scope hint was given, process every candidate doc. A legacy `mode:headless` token in the arguments is stripped, not treated as a scope hint.

## CONCEPTS.md bootstrap requests

If invoked specifically to create or bootstrap `CONCEPTS.md` (e.g., "create a CONCEPTS.md", "build the concept map", "set up shared vocabulary"), seed the repo-wide concept map instead of running the docs/solutions classification: read `references/concepts-vocabulary.md` and follow its **Seed goal** and **Scope of a seed** (repo-wide) rules — seed the project's core domain nouns from the declared domain model (schema, core types, primary models, top-level domain docs), each meeting the qualifying bar, with the codebase setting the count. Write the preamble (see Vocabulary Capture), cluster per the organization rules, run the Discoverability Check so the project's instruction file surfaces the new file, and commit — do not leave the bootstrap uncommitted. A normal refresh run seeds and reconciles `CONCEPTS.md` as well, so there is nothing to disambiguate.

## Refresh Order

1. Review the relevant individual learning docs first
2. Note which learnings stayed valid, were updated, were consolidated, were replaced, or were deleted
3. Then review any pattern docs that depend on those learnings

If the user starts by naming a pattern doc, you may begin there to understand the concern, but inspect the supporting learning docs before changing the pattern.

## Maintenance Model

For each candidate artifact, classify it into one of five outcomes:

| Outcome | Meaning | Default action |
|---------|---------|----------------|
| **Keep** | Still accurate and still useful | No file edit by default; report that it was reviewed and remains trustworthy |
| **Update** | Core solution is still correct, but references drifted | Apply evidence-backed in-place edits |
| **Consolidate** | Two or more docs overlap heavily but are both correct | Merge unique content into the canonical doc, delete the subsumed doc |
| **Replace** | The old artifact is now misleading, but there is a known better replacement | Create a trustworthy successor, then delete the old artifact |
| **Delete** | No longer useful, applicable, or distinct | Delete the file — git history preserves it if anyone needs to recover it later |

## Core Rules

1. **Prefer no-write Keep.** Do not edit a doc to leave a review breadcrumb, fix a typo, or polish wording.
2. **Match docs to reality, not the reverse.** When current code differs from a learning, update the learning to reflect the current code. The job is doc accuracy, not code review — do not ask whether code changes were "intentional" or "a regression". If the user thinks the code is wrong, that is a separate concern outside this workflow.
3. **Use Update only for meaningful, evidence-backed drift.** Paths, module names, related links, category metadata, code snippets, and clearly stale wording are fair game when fixing them materially improves accuracy.
4. **Use Replace only when there is a real replacement:** a recently solved, verified fix in the current conversation; concrete replacement context from the user; a current approach found by codebase investigation; or strong successor evidence in newer docs, pattern docs, PRs, or issues.
5. **Delete when the code is gone** — and only after the checks under **Before deleting** below. Don't default to Keep just because the general advice still sounds "sound".
6. **Evaluate document-set design, not just accuracy.** If two or more docs overlap heavily, decide whether they should stay separate, be cross-scoped more clearly, or be consolidated into one canonical document.
7. **Delete, don't archive.** There is no `_archived/` directory — git history is the archive, and `git log --diff-filter=D -- docs/solutions/` finds a deleted doc. If `docs/solutions/_archived/` exists, list its files in the report and recommend restore, delete, or consolidate.

## Scope Selection

Find all `.md` files under `docs/solutions/`, excluding `README.md` files and anything under `_archived/`.

If a scope argument was provided, narrow with it: match it against subdirectory names under `docs/solutions/`, then learning frontmatter (`module`, `component`, `tags`), then filenames, then file contents — take the first that produces results. If a provided scope hint matches nothing, report the miss and exit; do not silently widen to every doc.

If no candidate docs are found, report:

```text
No candidate docs found in docs/solutions/.
Run `ce-compound` after solving problems to start building your knowledge base.
```

On a broad sweep (roughly 9+ candidate docs), triage before deep investigation: read frontmatter, group by module or component, then start with the densest cluster of learnings and pattern docs whose referenced files are missing. "Code changed recently" is not a reliable staleness signal; missing references in a high-impact cluster is the strongest one, and staleness co-propagates across docs covering the same module. Then work through the remaining clusters in impact order.

## Investigate Candidate Learnings

For each learning in scope, read it, cross-reference its claims against the current codebase, and form a recommendation. Match investigation depth to the learning's specificity — a learning referencing exact file paths and code snippets needs more verification than one describing a general principle.

A learning has several dimensions that can independently go stale:

- **References** — do the file paths, class names, and modules it mentions still exist or have they moved?
- **Recommended solution** — does the fix still match how the code actually works today? A renamed file with a completely different implementation pattern is not just a path update.
- **Code examples** — if the learning includes code snippets, do they still reflect the current implementation?
- **Related docs** — are cross-referenced learnings and patterns still present and consistent?
- **Overlap** — note when another doc in scope covers the same problem domain, references the same files, or recommends a similar solution. Record both file paths, which dimensions overlap (problem, solution, root cause, files, prevention), and which doc appears broader or more current.
- **Vocabulary** — note domain terms the learning cites (entities, named processes, status concepts with project-specific meaning): does `CONCEPTS.md` define them, and does the definition still match how the code uses the term? Collect the signal only — do not edit `CONCEPTS.md` during investigation.
- **Auto memory** — if an auto-memory block is present in your context, notes in the same problem domain are a corroborating drift signal. Tag them "(auto memory [claude])" in the report; never act on a memory-only signal alone.

### Drift Classification: Update vs Replace

The critical distinction is whether the drift is **cosmetic** (references moved but the solution is the same) or **substantive** (the solution itself changed):

- **Update territory** — file paths moved, classes renamed, links broke, metadata drifted, but the core recommended approach is still how the code works. Fix these directly.
- **Replace territory** — the recommended solution conflicts with current code, the architectural approach changed, or the pattern is no longer the preferred way. A new learning needs to be written.

**The boundary:** if you find yourself rewriting the solution section or changing what the learning recommends, stop — that is Replace, not Update.

- **Contradiction is a strong Replace signal**, not minor drift — a learning that conflicts with current code is actively misleading.
- **Age alone is not a stale signal.** A 2-year-old learning that still matches the code is fine; use age only as a prompt to inspect more carefully.
- **Check for successors before deleting.** If newer learnings, pattern docs, PRs, or issues cover the same problem space, prefer Replace over Delete so readers are directed to the newer guidance.

## Investigate Pattern Docs

After the underlying learning docs, investigate any relevant pattern docs under `docs/solutions/patterns/`. Evaluate whether the generalized rule still holds given the refreshed state of the learnings it depends on; a pattern doc with no clear supporting learnings is a stale signal. The same five outcomes apply — base any replacement on the refreshed learning set, and do not invent new rules from guesswork.

## Document-Set Analysis

Then compare the docs to each other, not just to reality. For each topic cluster (docs sharing a problem domain), name the **canonical doc** — the broadest, most current, most accurate one, the doc a maintainer should find first — and give every other doc in the cluster a disposition:

- **Distinct** — covers a meaningfully different sub-problem with independent retrieval value. Keep separate.
- **Subsumed** — its unique content fits as a section in the canonical doc. Consolidate.
- **Redundant** — adds nothing the canonical doc already says. Delete.

Separate docs earn their keep only when someone would search for them independently, or when merging would create an unwieldy doc. Otherwise consolidate: two docs covering the same ground will drift apart and contradict each other.

Outright contradictions between docs ("always use X" vs "avoid X", conflicting root causes for the same problem, one doc citing a path another calls deprecated) outrank individual staleness — resolve them first, through Consolidate or a targeted Update/Replace.

## Subagents

Investigate independent docs in parallel; investigate overlapping docs together. Write replacements one at a time — each may need to read significant code, and running them in parallel risks context exhaustion. Perform all deletions and metadata edits yourself, not in a subagent.

When spawning a subagent, omit the `mode` parameter so the user's configured permission settings apply, and include this instruction in its prompt:

> Use dedicated file search and read tools (Glob, Grep, Read) for all investigation. Do NOT use shell commands (ls, find, cat, grep, test, bash) for file operations. This avoids permission prompts and is more reliable.

Investigation subagents are read-only — they must not edit files, create successors, or delete anything. Each returns: file path, evidence, recommended action, confidence, and open questions.

## Classify the Maintenance Action

Assign one outcome per candidate from the Maintenance Model table above.

**Consolidate** when two docs are both materially correct but cover the same ground: merge the subsumed doc's unique content into the canonical one, update inbound references, and delete the subsumed file. If the subsumed doc has no unique content, skip straight to Delete.

**Replace** when the learning's core guidance is now misleading. The user may have invoked the refresh months after the learning was written — do not ask them for replacement context they are unlikely to have; investigate the codebase and synthesize the successor. Judge the evidence already gathered:

- **Sufficient** — you understand both what the old learning recommended and what the current approach is (current code patterns, new file locations, changed architecture). Write the successor.
- **Insufficient** — the drift is so fundamental you cannot confidently document the current approach (the whole subsystem was replaced, or the new architecture is not understandable from a file scan). Mark the learning stale in place with `status: stale`, `stale_reason: [what you found]`, `stale_date: YYYY-MM-DD`; report what evidence you found and what is missing; recommend the user run `ce-compound` after their next encounter with that area, when they have fresh problem-solving context.

**Delete** when the code or workflow no longer exists and the problem domain is gone, when the learning is obsolete with no modern replacement worth documenting, or when it is fully redundant with another doc (Consolidate first if it has unique content). Just delete the file — no archival directory, no tombstone metadata.

### Before deleting

Missing referenced files are strong evidence that the **implementation** is gone — not that the **problem** is. Reason about whether the problem the learning solves is still a concern in the codebase:

- A learning about session token storage where `auth_token.rb` is gone — does the application still handle session tokens? If so, the concept persists under a new implementation. That is Replace, not Delete.
- A learning about a deprecated API endpoint whose entire feature was removed — the problem domain is gone. That is Delete.

Do not search mechanically for keywords from the old learning. Understand what problem it addresses, then look for where that problem lives now.

Then check inbound links: a doc that other files cite is load-bearing in a way the doc itself does not announce. Search the repo's markdown content (other docs, plans, instruction files, READMEs) for the filename slug — not source code, where citations are rare and only appear in comments. **Inbound links inform the classification, not the cleanup.** Removing a citation is always mechanical; the judgment is upstream — given these citations, is Delete still right, or is Replace closer to right? Classify each citation by what it does in its citing context:

- **Decorative** — principle stated inline, citation is a "see also" pointer or bare attribution. Delete is fine; clean up citations in the same commit.
- **Substantive** — the citing doc relies on the cited doc for content not stated inline (e.g., "see X for details on Y" with no inline Y). Signals Replace — write a successor at the same path — or **Keep with narrowed scope** if the doc's actual content is broader than its title implies.
- **Mixed or unclear** — stale-mark.

**Auto-delete only when all three hold:**

- The implementation is gone (or fully superseded by a clearly better successor, or the doc is plainly redundant).
- The problem domain is gone — the app no longer deals with what the learning addresses.
- Inbound links are absent or unambiguously decorative.

If any condition fails, classify as Replace, Update, Consolidate, or stale-mark instead. Do not delete a learning whose problem domain is still active or whose principles are cited substantively — fill the gap with a replacement. Writing a Replace successor is judgment-heavy: with no human present and a substantive or ambiguous citation, stale-mark rather than guess.

## Execute the Chosen Action

For each candidate, read `references/per-action-flows.md` and follow the section matching its classification. Only one flow runs per candidate; the reference carries the per-action criteria and step-by-step instructions.

## Vocabulary Capture

After the per-learning actions execute, reconcile the domain terms flagged during investigation with `CONCEPTS.md`. **First, read `references/concepts-vocabulary.md`** — its qualifying bar and exclusions are non-obvious, and a "nothing qualifies" judgment made from memory is a shortcut, not a result.

- If the same term surfaced in several learnings with different shades of precision, union the shades into **one** entry.
- **If `CONCEPTS.md` exists:** add missing terms, refine existing entries the corpus sharpened, and backfill core domain nouns of the area in scope that are central but missing (per the reference's **Seed goal**) — the safety net for stable-central terms that friction never surfaces. Then scrub entries that violate the reference's criteria: implementation specifics, current-config values that will drift, status/owner/date metadata, duplicates under another name, or entries leaning on an undefined project-specific sibling. The full sweep is appropriate here because refresh is an audit.
- **If `CONCEPTS.md` does not exist** and at least one term qualifies: bootstrap it, seeding the area's core domain nouns alongside the surfaced terms so the file is anchored from creation, and holding the qualifying bar conservatively for borderline terms. Start the file with this preamble under the `# Concepts` heading:

  > Shared domain vocabulary for this project — entities, named processes, and status concepts with project-specific meaning. Seeded with core domain vocabulary, then accretes as ce-compound and ce-compound-refresh process learnings; direct edits are fine. Glossary only, not a spec or catch-all.

  Then add entries: 1-4 terms stay flat, more cluster by domain relationship per the reference.
- Stay in scope. Bootstrap, seed, and reconcile reflect only the area in scope, and do not retroactively inject `(see CONCEPTS.md)` pointers into existing learnings. Note in the report that further entries are likely from runs on other scopes.

Apply these edits silently — vocabulary capture is a side effect of refreshing, not a decision the user makes per run. Record the outcome on the report's `CONCEPTS.md` line, including when nothing qualified.

## Output Format

Print the full report as markdown — it is the deliverable, so do not compute findings internally and emit a one-liner.

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

CONCEPTS.md: <scanned, no qualifying terms | created with N entries (M seeded) | updated — N added, N refined, N reconciled, N scrubbed | repo-wide map created with N entries>
```

Then for EVERY file processed, list:

- The file path
- The classification (Keep/Update/Consolidate/Replace/Delete/Stale)
- What evidence was found -- tag any memory-sourced findings with "(auto memory [claude])" to distinguish them from codebase-sourced evidence
- What action was taken (or recommended)
- For Consolidate: which doc was canonical, what unique content was merged, what was deleted

List **Keep** outcomes under a reviewed-without-edits section so the result is visible without creating git churn. Actions that could not be written go under a **Recommended** heading, with enough context that a human can apply the change by hand or re-run the skill interactively — if no writes succeeded, the report is a maintenance plan.

## Discoverability Check

Check whether the project's root agent-instructions file (e.g., `AGENTS.md`; if one file only `@`-includes another, the substantive one is the target) would lead an agent to discover `docs/solutions/`: that a searchable store of documented solutions exists, enough about its structure to search it (category organization, frontmatter fields like `module`, `tags`, `problem_type`), and that it is relevant when working in a documented area. This is a semantic assessment, not a string match — if an agent would reasonably find and use the store after reading the file, it passes. If no such file exists, skip.

If the check does not pass, add the smallest addition that communicates those things, matching the file's style — a line in the closest related section (architecture tree, directory listing, docs or conventions block) is almost always better than a new section. Keep the tone informational, not imperative: "relevant when implementing or debugging in documented areas", not "always search before implementing" — imperative directives cause redundant reads when a workflow already includes a dedicated search step.

Run the same check for `CONCEPTS.md` when it exists at the repo root (e.g., a directory-listing line: `CONCEPTS.md  # shared domain vocabulary — read when orienting to the codebase or before discussing domain concepts`). Skip it entirely when `CONCEPTS.md` does not exist — never nag for an artifact the project has not adopted.

## Commit Changes

Commit the refresh — including any instruction-file edit from the Discoverability Check — through `ce-commit`, or `ce-commit-push-pr` when a branch and PR are wanted. Stage only the files this refresh touched, not other dirty files in the working tree. Skip when nothing was modified.

## Relationship to ce-compound

`ce-compound` captures a newly solved, verified problem; `ce-compound-refresh` maintains older learnings as the codebase evolves — both their individual accuracy and their collective design as a document set. When evidence is too thin to write a trustworthy successor, mark the learning stale and recommend `ce-compound` for when the user next encounters that area.
