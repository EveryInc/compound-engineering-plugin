---
name: ce:compound-refresh
description: Refresh stale or drifting learnings and pattern docs in docs/solutions/ by reviewing, updating, consolidating, replacing, or deleting them against the current codebase. Use after refactors, migrations, dependency upgrades, or when a retrieved learning feels outdated or wrong. Also use when reviewing docs/solutions/ for accuracy, when a recently solved problem contradicts an existing learning, when pattern docs no longer reflect current code, or when multiple docs seem to cover the same topic and might benefit from consolidation.
disable-model-invocation: true
---

# Compound Refresh

Maintain the quality of `docs/solutions/` over time. This workflow reviews existing learnings against the current codebase, then refreshes any derived pattern docs that depend on them.

## Mode Detection

Check if `$ARGUMENTS` contains `mode:autofix`. If present, strip it from arguments (use the remainder as a scope hint) and run in **autofix mode**.

| Mode | When | Behavior |
|------|------|----------|
| **Interactive** (default) | User is present and can answer questions | Ask for decisions on ambiguous cases, confirm actions |
| **Autofix** | `mode:autofix` in arguments | No user interaction. Apply all unambiguous actions (Keep, Update, Consolidate, auto-Delete, Replace with sufficient evidence). Mark ambiguous cases as stale. Generate a summary report at the end. |

### Autofix mode rules

- **Skip all user questions.** Never pause for input.
- **Process all docs in scope.** No scope narrowing questions — if no scope hint was provided, process everything.
- **Attempt all safe actions:** Keep (no-op), Update (fix references), Consolidate (merge and delete subsumed doc), auto-Delete (unambiguous criteria met), Replace (when evidence is sufficient). If a write succeeds, record it as **applied**. If a write fails (e.g., permission denied), record the action as **recommended** in the report and continue — do not stop or ask for permissions.
- **Mark as stale when uncertain.** If classification is genuinely ambiguous (Update vs Replace vs Consolidate vs Delete) or Replace evidence is insufficient, mark as stale with `status: stale`, `stale_reason`, and `stale_date` in the frontmatter. If even the stale-marking write fails, include it as a recommendation.
- **Use conservative confidence.** In interactive mode, borderline cases get a user question. In autofix mode, borderline cases get marked stale. Err toward stale-marking over incorrect action.
- **Always generate a report.** The report is the primary deliverable. It has two sections: **Applied** (actions that were successfully written) and **Recommended** (actions that could not be written, with full rationale so a human can apply them or run the skill interactively). The report structure is the same regardless of what permissions were granted — the only difference is which section each action lands in.

## Interaction Principles

**These principles apply to interactive mode only. In autofix mode, skip all user questions and apply the autofix mode rules above.**

Follow the same interaction style as `ce:brainstorm`:

- Ask questions **one at a time** — use the platform's blocking question tool when available (`AskUserQuestion` in Claude Code, `request_user_input` in Codex, `ask_user` in Gemini). Otherwise, present numbered options in plain text and wait for the user's reply before continuing
- Prefer **multiple choice** when natural options exist
- Start with **scope and intent**, then narrow only when needed
- Do **not** ask the user to make decisions before you have evidence
- Lead with a recommendation and explain it briefly

The goal is not to force the user through a checklist. The goal is to help them make a good maintenance decision with the smallest amount of friction.

## Refresh Order

Refresh in this order:

1. Review the relevant individual learning docs first
2. Note which learnings stayed valid, were updated, were consolidated, were replaced, or were deleted
3. Then review any pattern docs that depend on those learnings

Why this order:

- learning docs are the primary evidence
- pattern docs are derived from one or more learnings
- stale learnings can make a pattern look more valid than it really is

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

1. **Evidence informs judgment.** The signals below are inputs, not a mechanical scorecard. Use engineering judgment to decide whether the artifact is still trustworthy.
2. **Prefer no-write Keep.** Do not update a doc just to leave a review breadcrumb.
3. **Match docs to reality, not the reverse.** When current code differs from a learning, update the learning to reflect the current code. The skill's job is doc accuracy, not code review — do not ask the user whether code changes were "intentional" or "a regression." If the code changed, the doc should match. If the user thinks the code is wrong, that is a separate concern outside this workflow.
4. **Be decisive, minimize questions.** When evidence is clear (file renamed, class moved, reference broken), apply the update. In interactive mode, only ask the user when the right action is genuinely ambiguous. In autofix mode, mark ambiguous cases as stale instead of asking. The goal is automated maintenance with human oversight on judgment calls, not a question for every finding.
5. **Avoid low-value churn.** Do not edit a doc just to fix a typo, polish wording, or make cosmetic changes that do not materially improve accuracy or usability.
6. **Use Update only for meaningful, evidence-backed drift.** Paths, module names, related links, category metadata, code snippets, and clearly stale wording are fair game when fixing them materially improves accuracy.
7. **Use Replace only when there is a real replacement.** That means either:
   - the current conversation contains a recently solved, verified replacement fix, or
   - the user has provided enough concrete replacement context to document the successor honestly, or
   - the codebase investigation found the current approach and can document it as the successor, or
   - newer docs, pattern docs, PRs, or issues provide strong successor evidence.
8. **Delete when the code is gone.** If the referenced code, controller, or workflow no longer exists in the codebase and no successor can be found, delete the file — don't default to Keep just because the general advice is still "sound." A learning about a deleted feature misleads readers into thinking that feature still exists. When in doubt between Keep and Delete, ask the user (in interactive mode) or mark as stale (in autofix mode). But missing referenced files with no matching code is **not** a doubt case — it is strong, unambiguous Delete evidence. Auto-delete it.
9. **Evaluate document-set design, not just accuracy.** In addition to checking whether each doc is accurate, evaluate whether it is still the right unit of knowledge. If two or more docs overlap heavily, determine whether they should remain separate, be cross-scoped more clearly, or be consolidated into one canonical document. Redundant docs are dangerous because they drift silently — two docs saying the same thing will eventually say different things.
10. **Delete, don't archive.** There is no `_archived/` directory. When a doc is no longer useful, delete it. Git history preserves every deleted file — that is the archive. A dedicated archive directory creates problems: archived docs accumulate, pollute search results, and nobody reads them. If someone needs a deleted doc, `git log --diff-filter=D -- docs/solutions/` will find it.

## Scope Selection

Start by discovering learnings and pattern docs under `docs/solutions/`.

Exclude:

- `README.md`
- `docs/solutions/_archived/` (legacy — if this directory exists, flag it for cleanup in the report)

Find all `.md` files under `docs/solutions/`, excluding `README.md` files and anything under `_archived/`. If an `_archived/` directory exists, note it in the report as a legacy artifact that should be cleaned up (files either restored or deleted).

If `$ARGUMENTS` is provided, use it to narrow scope before proceeding. Try these matching strategies in order, stopping at the first that produces results:

1. **Directory match** — check if the argument matches a subdirectory name under `docs/solutions/` (e.g., `performance-issues`, `database-issues`)
2. **Frontmatter match** — search `module`, `component`, or `tags` fields in learning frontmatter for the argument
3. **Filename match** — match against filenames (partial matches are fine)
4. **Content search** — search file contents for the argument as a keyword (useful for feature names or feature areas)

If no matches are found, report that and ask the user to clarify. In autofix mode, report the miss and stop — do not guess at scope.

If no candidate docs are found, report:

```text
No candidate docs found in docs/solutions/.
Run `ce:compound` after solving problems to start building your knowledge base.
```

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

1. **Inventory** — read frontmatter of all candidate docs, group by module/component/category
2. **Impact clustering** — identify areas with the densest clusters of learnings + pattern docs. A cluster of 5 learnings and 2 patterns covering the same module is higher-impact than 5 isolated single-doc areas, because staleness in one doc is likely to affect the others.
3. **Spot-check drift** — for each cluster, check whether the primary referenced files still exist. Missing references in a high-impact cluster = strongest signal for where to start.
4. **Recommend a starting area** — present the highest-impact cluster with a brief rationale and ask the user to confirm or redirect. In autofix mode, skip the question and process all clusters in impact order.

Example:

```text
Found 24 learnings across 5 areas.

The auth module has 5 learnings and 2 pattern docs that cross-reference
each other — and 3 of those reference files that no longer exist.
I'd start there.

1. Start with auth (recommended)
2. Pick a different area
3. Review everything
```

Do not ask action-selection questions yet. First gather evidence.

## Phase 1: Investigate Candidate Learnings

For each learning in scope, read it, cross-reference its claims against the current codebase, and form a recommendation.

A learning has several dimensions that can independently go stale. Surface-level checks catch the obvious drift, but staleness often hides deeper:

- **References** — do the file paths, class names, and modules it mentions still exist or have they moved?
- **Recommended solution** — does the fix still match how the code actually works today? A renamed file with a completely different implementation pattern is not just a path update.
- **Code examples** — if the learning includes code snippets, do they still reflect the current implementation?
- **Related docs** — are cross-referenced learnings and patterns still present and consistent?
- **Auto memory** — does the auto memory directory contain notes in the same problem domain? Read MEMORY.md from the auto memory directory (the path is known from the system prompt context). If it does not exist or is empty, skip this dimension. A memory note describing a different approach than what the learning recommends is a supplementary drift signal.
- **Overlap** — while investigating, note when another doc in scope covers the same problem domain, references the same files, or recommends a similar solution. For each overlap, record: the two file paths, which dimensions overlap (problem, solution, root cause, files, prevention), and which doc appears broader or more current. These signals feed Phase 1.75 (Document-Set Analysis).

Match investigation depth to the learning's specificity — a learning referencing exact file paths and code snippets needs more verification than one describing a general principle.

### Drift Classification: Update vs Replace

The critical distinction is whether the drift is **cosmetic** (references moved but the solution is the same) or **substantive** (the solution itself changed):

- **Update territory** — file paths moved, classes renamed, links broke, metadata drifted, but the core recommended approach is still how the code works. `ce:compound-refresh` fixes these directly.
- **Replace territory** — the recommended solution conflicts with current code, the architectural approach changed, or the pattern is no longer the preferred way. This means a new learning needs to be written. A replacement subagent writes the successor following `ce:compound`'s document format (frontmatter, problem, root cause, solution, prevention), using the investigation evidence already gathered. The orchestrator does not rewrite learnings inline — it delegates to a subagent for context isolation.

**The boundary:** if you find yourself rewriting the solution section or changing what the learning recommends, stop — that is Replace, not Update.

**Memory-sourced drift signals** are supplementary, not primary. A memory note describing a different approach does not alone justify Replace or Delete. Use memory signals to:
- Corroborate codebase-sourced drift (strengthens the case for Replace)
- Prompt deeper investigation when codebase evidence is borderline
- Add context to the evidence report ("(auto memory [claude]) notes suggest approach X may have changed since this learning was written")

In autofix mode, memory-only drift (no codebase corroboration) should result in stale-marking, not action.

### Judgment Guidelines

Three guidelines that are easy to get wrong:

1. **Contradiction = strong Replace signal.** If the learning's recommendation conflicts with current code patterns or a recently verified fix, that is not a minor drift — the learning is actively misleading. Classify as Replace.
2. **Age alone is not a stale signal.** A 2-year-old learning that still matches current code is fine. Only use age as a prompt to inspect more carefully.
3. **Check for successors before deleting.** Before recommending Replace or Delete, look for newer learnings, pattern docs, PRs, or issues covering the same problem space. If successor evidence exists, prefer Replace over Delete so readers are directed to the newer guidance.

## Phase 1.5: Investigate Pattern Docs

After reviewing the underlying learning docs, investigate any relevant pattern docs under `docs/solutions/patterns/`.

Pattern docs are high-leverage — a stale pattern is more dangerous than a stale individual learning because future work may treat it as broadly applicable guidance. Evaluate whether the generalized rule still holds given the refreshed state of the learnings it depends on.

A pattern doc with no clear supporting learnings is a stale signal — investigate carefully before keeping it unchanged.

## Phase 1.75: Document-Set Analysis

After investigating individual docs, step back and evaluate the document set as a whole. The goal is to catch problems that only become visible when comparing docs to each other — not just to reality.

### Overlap Detection

For docs that share the same module, component, tags, or problem domain, compare them across these dimensions:

- **Problem statement** — do they describe the same underlying problem?
- **Solution shape** — do they recommend the same approach, even if worded differently?
- **Referenced files** — do they point to the same code paths?
- **Prevention rules** — do they repeat the same prevention bullets?
- **Root cause** — do they identify the same root cause?

High overlap across 3+ dimensions is a strong Consolidate signal. The question to ask: "Would a future maintainer need to read both docs to get the current truth, or is one mostly repeating the other?"

### Supersession Signals

Detect "older narrow precursor, newer canonical doc" patterns:

- A newer doc covers the same files, same workflow, and broader runtime behavior than an older doc
- An older doc describes a specific incident that a newer doc generalizes into a pattern
- Two docs recommend the same fix but the newer one has better context, examples, or scope

When a newer doc clearly subsumes an older one, the older doc is a consolidation candidate — its unique content (if any) should be merged into the newer doc, and the older doc should be deleted.

### Canonical Doc Identification

For each topic cluster (docs sharing a problem domain), identify which doc is the **canonical source of truth**:

- Usually the most recent, broadest, most accurate doc in the cluster
- The one a maintainer should find first when searching for this topic
- The one that other docs should point to, not duplicate

All other docs in the cluster are either:
- **Distinct** — they cover a meaningfully different sub-problem and have independent retrieval value. Keep them separate.
- **Subsumed** — their unique content fits as a section in the canonical doc. Consolidate.
- **Redundant** — they add nothing the canonical doc doesn't already say. Delete.

### Retrieval-Value Test

Before recommending that two docs stay separate, apply this test: "If a maintainer searched for this topic six months from now, would having these as separate docs improve discoverability, or just create drift risk?"

Separate docs earn their keep only when:
- They cover genuinely different sub-problems that someone might search for independently
- They target different audiences or contexts (e.g., one is about debugging, another about prevention)
- Merging them would create an unwieldy doc that is harder to navigate than two focused ones

If none of these apply, prefer consolidation. Two docs covering the same ground will eventually drift apart and contradict each other — that is worse than a slightly longer single doc.

### Cross-Doc Conflict Check

Look for outright contradictions between docs in scope:
- Doc A says "always use approach X" while Doc B says "avoid approach X"
- Doc A references a file path that Doc B says was deprecated
- Doc A and Doc B describe different root causes for what appears to be the same problem

Contradictions between docs are more urgent than individual staleness — they actively confuse readers. Flag these for immediate resolution, either through Consolidate (if one is right and the other is a stale version of the same truth) or through targeted Update/Replace.

## Subagent Strategy

Use subagents for context isolation when investigating multiple artifacts — not just because the task sounds complex. Choose the lightest approach that fits:

| Approach | When to use |
|----------|-------------|
| **Main thread only** | Small scope, short docs |
| **Sequential subagents** | 1-2 artifacts with many supporting files to read |
| **Parallel subagents** | 3+ truly independent artifacts with low overlap |
| **Batched subagents** | Broad sweeps — narrow scope first, then investigate in batches |

**When spawning any subagent, include this instruction in its task prompt:**

> Use dedicated file search and read tools (Glob, Grep, Read) for all investigation. Do NOT use shell commands (ls, find, cat, grep, test, bash) for file operations. This avoids permission prompts and is more reliable.
>
> Also read MEMORY.md from the auto memory directory if it exists. Check for notes related to the learning's problem domain. Report any memory-sourced drift signals separately from codebase-sourced evidence, tagged with "(auto memory [claude])" in the evidence section. If MEMORY.md does not exist or is empty, skip this check.

There are two subagent roles:

1. **Investigation subagents** — read-only. They must not edit files, create successors, or delete anything. Each returns: file path, evidence, recommended action, confidence, and open questions. These can run in parallel when artifacts are independent.
2. **Replacement subagents** — write a single new learning to replace a stale one. These run **one at a time, sequentially** (each replacement subagent may need to read significant code, and running multiple in parallel risks context exhaustion). The orchestrator handles all deletions and metadata updates after each replacement completes.

The orchestrator merges investigation results, detects contradictions, coordinates replacement subagents, and performs all deletions/metadata edits centrally. In interactive mode, it asks the user questions on ambiguous cases. In autofix mode, it marks ambiguous cases as stale instead. If two artifacts overlap or discuss the same root issue, investigate them together rather than parallelizing.

## Phase 2: Classify the Right Maintenance Action

After gathering evidence, assign one recommended action.

### Keep

The learning is still accurate and useful. Do not edit the file — report that it was reviewed and remains trustworthy. Only add `last_refreshed` if you are already making a meaningful update for another reason.

### Update

The core solution is still valid but references have drifted (paths, class names, links, code snippets, metadata). Apply the fixes directly.

### Consolidate

Choose **Consolidate** when Phase 1.75 identified docs that overlap heavily but are both materially correct. This is different from Update (which fixes drift in a single doc) and Replace (which rewrites misleading guidance). Consolidate handles the "both right, one subsumes the other" case.

**When to consolidate:**

- Two docs describe the same problem and recommend the same (or compatible) solution
- One doc is a narrow precursor and a newer doc covers the same ground more broadly
- The unique content from the subsumed doc can fit as a section or addendum in the canonical doc
- Keeping both creates drift risk without meaningful retrieval benefit

**When NOT to consolidate** (apply the Retrieval-Value Test from Phase 1.75):

- The docs cover genuinely different sub-problems that someone would search for independently
- Merging would create an unwieldy doc that harms navigation more than drift risk harms accuracy

**Consolidate vs Delete:** If the subsumed doc has unique content worth preserving (edge cases, alternative approaches, extra prevention rules), use Consolidate to merge that content first. If the subsumed doc adds nothing the canonical doc doesn't already say, skip straight to Delete.

The Consolidate action is: merge unique content from the subsumed doc into the canonical doc, then delete the subsumed doc. Not archive — delete. Git history preserves it.

### Replace

Choose **Replace** when the learning's core guidance is now misleading — the recommended fix changed materially, the root cause or architecture shifted, or the preferred pattern is different.

The user may have invoked the refresh months after the original learning was written. Do not ask them for replacement context they are unlikely to have — use agent intelligence to investigate the codebase and synthesize the replacement.

**Evidence assessment:**

By the time you identify a Replace candidate, Phase 1 investigation has already gathered significant evidence: the old learning's claims, what the current code actually does, and where the drift occurred. Assess whether this evidence is sufficient to write a trustworthy replacement:

- **Sufficient evidence** — you understand both what the old learning recommended AND what the current approach is. The investigation found the current code patterns, the new file locations, the changed architecture. → Proceed to write the replacement (see Phase 4 Replace Flow).
- **Insufficient evidence** — the drift is so fundamental that you cannot confidently document the current approach. The entire subsystem was replaced, or the new architecture is too complex to understand from a file scan alone. → Mark as stale in place:
   - Add `status: stale`, `stale_reason: [what you found]`, `stale_date: YYYY-MM-DD` to the frontmatter
   - Report what evidence you found and what is missing
   - Recommend the user run `ce:compound` after their next encounter with that area, when they have fresh problem-solving context

### Delete

Choose **Delete** when:

- The code or workflow no longer exists and the problem domain is gone
- The learning is obsolete and has no modern replacement worth documenting
- The learning is fully redundant with another doc (use Consolidate if there is unique content to merge first)
- There is no meaningful successor evidence suggesting it should be replaced instead

Action: delete the file. No archival directory, no metadata — just delete it. Git history preserves every deleted file if recovery is ever needed.

### Before deleting: check if the problem domain is still active

When a learning's referenced files are gone, that is strong evidence — but only that the **implementation** is gone. Before deleting, reason about whether the **problem the learning solves** is still a concern in the codebase:

- A learning about session token storage where `auth_token.rb` is gone — does the application still handle session tokens? If so, the concept persists under a new implementation. That is Replace, not Delete.
- A learning about a deprecated API endpoint where the entire feature was removed — the problem domain is gone. That is Delete.

Do not search mechanically for keywords from the old learning. Instead, understand what problem the learning addresses, then investigate whether that problem domain still exists in the codebase. The agent understands concepts — use that understanding to look for where the problem lives now, not where the old code used to be.

**Auto-delete only when both the implementation AND the problem domain are gone:**

- the referenced code is gone AND the application no longer deals with that problem domain
- the learning is fully superseded by a clearly better successor AND the old doc adds no distinct value
- the document is plainly redundant and adds nothing the canonical doc doesn't already say

If the implementation is gone but the problem domain persists (the app still does auth, still processes payments, still handles migrations), classify as **Replace** — the problem still matters and the current approach should be documented.

Do not keep a learning just because its general advice is "still sound" — if the specific code it references is gone, the learning misleads readers. But do not delete a learning whose problem domain is still active — that knowledge gap should be filled with a replacement.

## Pattern Guidance

Apply the same five outcomes (Keep, Update, Consolidate, Replace, Delete) to pattern docs, but evaluate them as **derived guidance** rather than incident-level learnings. Key differences:

- **Keep**: the underlying learnings still support the generalized rule and examples remain representative
- **Update**: the rule holds but examples, links, scope, or supporting references drifted
- **Consolidate**: two pattern docs generalize the same set of learnings or cover the same design concern — merge into one canonical pattern
- **Replace**: the generalized rule is now misleading, or the underlying learnings support a different synthesis. Base the replacement on the refreshed learning set — do not invent new rules from guesswork
- **Delete**: the pattern is no longer valid, no longer recurring, or fully subsumed by a stronger pattern doc with no unique content remaining

## Phase 3: Ask for Decisions

### Autofix mode

**Skip this entire phase. Do not ask any questions. Do not present options. Do not wait for input.** Proceed directly to Phase 4 and execute all actions based on the classifications from Phase 2:

- Unambiguous Keep, Update, Consolidate, auto-Delete, and Replace (with sufficient evidence) → execute directly
- Ambiguous cases → mark as stale
- Then generate the report (see Output Format)

### Interactive mode

Most Updates and Consolidations should be applied directly without asking. Only ask the user when:

- The right action is genuinely ambiguous (Update vs Replace vs Consolidate vs Delete)
- You are about to Delete a document **and** the evidence is not unambiguous (see auto-delete criteria in Phase 2). When auto-delete criteria are met, proceed without asking.
- You are about to Consolidate and the choice of canonical doc is not clear-cut
- You are about to create a successor via Replace

Do **not** ask questions about whether code changes were intentional, whether the user wants to fix bugs in the code, or other concerns outside doc maintenance. Stay in your lane — doc accuracy.

#### Question Style

Always present choices using the platform's blocking question tool when available (`AskUserQuestion` in Claude Code, `request_user_input` in Codex, `ask_user` in Gemini). Otherwise, present numbered options in plain text and wait for the user's reply before proceeding.

Question rules:

- Ask **one question at a time**
- Prefer **multiple choice**
- Lead with the **recommended option**
- Explain the rationale for the recommendation in one concise sentence
- Avoid asking the user to choose from actions that are not actually plausible

#### Focused Scope

For a single artifact, present:

- file path
- 2-4 bullets of evidence
- recommended action

Then ask:

```text
This [learning/pattern] looks like a [Keep/Update/Consolidate/Replace/Delete].

Why: [one-sentence rationale based on the evidence]

What would you like to do?

1. [Recommended action]
2. [Second plausible action]
3. Skip for now
```

Do not list all five actions unless all five are genuinely plausible.

#### Batch Scope

For several learnings:

1. Group obvious **Keep** cases together
2. Group obvious **Update** cases together when the fixes are straightforward
3. Present **Consolidate** cases together when the canonical doc is clear
4. Present **Replace** cases individually or in very small groups
5. Present **Delete** cases individually unless they are strong auto-delete candidates

Ask for confirmation in stages:

1. Confirm grouped Keep/Update recommendations
2. Then handle Consolidate groups (present the canonical doc and what gets merged)
3. Then handle Replace one at a time
4. Then handle Delete one at a time unless the deletion is unambiguous and safe to auto-apply

#### Broad Scope

If the user asked for a sweeping refresh, keep the interaction incremental:

1. Narrow scope first
2. Investigate a manageable batch
3. Present recommendations
4. Ask whether to continue to the next batch

Do not front-load the user with a full maintenance queue.

## Phase 4: Execute the Chosen Action

### Keep Flow

No file edit by default. Summarize why the learning remains trustworthy.

### Update Flow

Apply in-place edits only when the solution is still substantively correct.

Examples of valid in-place updates:

- Rename `app/models/auth_token.rb` reference to `app/models/session_token.rb`
- Update `module: AuthToken` to `module: SessionToken`
- Fix outdated links to related docs
- Refresh implementation notes after a directory move

Examples that should **not** be in-place updates:

- Fixing a typo with no effect on understanding
- Rewording prose for style alone
- Small cleanup that does not materially improve accuracy or usability
- The old fix is now an anti-pattern
- The system architecture changed enough that the old guidance is misleading
- The troubleshooting path is materially different

Those cases require **Replace**, not Update.

### Consolidate Flow

The orchestrator handles consolidation directly (no subagent needed — the docs are already read and the merge is a focused edit). Process Consolidate candidates by topic cluster. For each cluster identified in Phase 1.75:

1. **Confirm the canonical doc** — the broader, more current, more accurate doc in the cluster.
2. **Extract unique content** from the subsumed doc(s) — anything the canonical doc does not already cover. This might be specific edge cases, additional prevention rules, or alternative debugging approaches.
3. **Merge unique content** into the canonical doc in a natural location. Do not just append — integrate it where it logically belongs. If the unique content is small (a bullet point, a sentence), inline it. If it is a substantial sub-topic, add it as a clearly labeled section.
4. **Update cross-references** — if any other docs reference the subsumed doc, update those references to point to the canonical doc.
5. **Delete the subsumed doc.** Do not archive it, do not add redirect metadata — just delete the file. Git history preserves it.

If a doc cluster has 3+ overlapping docs, process pairwise: consolidate the two most overlapping docs first, then evaluate whether the merged result should be consolidated with the next doc.

**Structural edits beyond merge:** Consolidate also covers the reverse case. If one doc has grown unwieldy and covers multiple distinct problems that would benefit from separate retrieval, it is valid to recommend splitting it. Only do this when the sub-topics are genuinely independent and a maintainer might search for one without needing the other.

### Replace Flow

Process Replace candidates **one at a time, sequentially**. Each replacement is written by a subagent to protect the main context window.

When a replacement is needed, read the documentation contract files and pass their contents into the replacement subagent's task prompt:

- `references/schema.yaml` — frontmatter fields and enum values
- `references/yaml-schema.md` — category mapping
- `assets/resolution-template.md` — section structure

Do not let replacement subagents invent frontmatter fields, enum values, or section order from memory.

**When evidence is sufficient:**

1. Spawn a single subagent to write the replacement learning. Pass it:
   - The old learning's full content
   - A summary of the investigation evidence (what changed, what the current code does, why the old guidance is misleading)
   - The target path and category (same category as the old learning unless the category itself changed)
   - The relevant contents of the three support files listed above
2. The subagent writes the new learning using the support files as the source of truth: `references/schema.yaml` for frontmatter fields and enum values, `references/yaml-schema.md` for category mapping, and `assets/resolution-template.md` for section order. It should use dedicated file search and read tools if it needs additional context beyond what was passed.
3. After the subagent completes, the orchestrator deletes the old learning file. The new learning's frontmatter may include `supersedes: [old learning filename]` for traceability, but this is optional — the git history and commit message provide the same information.

**When evidence is insufficient:**

1. Mark the learning as stale in place:
   - Add to frontmatter: `status: stale`, `stale_reason: [what you found]`, `stale_date: YYYY-MM-DD`
2. Report what evidence was found and what is missing
3. Recommend the user run `ce:compound` after their next encounter with that area

### Delete Flow

Delete only when a learning is clearly obsolete, redundant (with no unique content to merge), or its problem domain is gone. Do not delete a document just because it is old — age alone is not a signal.

## Output Format

**The full report MUST be printed as markdown output.** Do not summarize findings internally and then output a one-liner. The report is the deliverable — print every section in full, formatted as readable markdown with headers, tables, and bullet points.

After processing the selected scope, output the following report:

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
```

Then for EVERY file processed, list:
- The file path
- The classification (Keep/Update/Consolidate/Replace/Delete/Stale)
- What evidence was found -- tag any memory-sourced findings with "(auto memory [claude])" to distinguish them from codebase-sourced evidence
- What action was taken (or recommended)
- For Consolidate: which doc was canonical, what unique content was merged, what was deleted

For **Keep** outcomes, list them under a reviewed-without-edits section so the result is visible without creating git churn.

### Autofix mode report

In autofix mode, the report is the sole deliverable — there is no user present to ask follow-up questions, so the report must be self-contained and complete. **Print the full report. Do not abbreviate, summarize, or skip sections.**

Split actions into two sections:

**Applied** (writes that succeeded):
- For each **Updated** file: the file path, what references were fixed, and why
- For each **Consolidated** cluster: the canonical doc, what unique content was merged from each subsumed doc, and the subsumed docs that were deleted
- For each **Replaced** file: what the old learning recommended vs what the current code does, and the path to the new successor
- For each **Deleted** file: the file path and why it was removed (problem domain gone, fully redundant, etc.)
- For each **Marked stale** file: the file path, what evidence was found, and why it was ambiguous

**Recommended** (actions that could not be written — e.g., permission denied):
- Same detail as above, but framed as recommendations for a human to apply
- Include enough context that the user can apply the change manually or re-run the skill interactively

If all writes succeed, the Recommended section is empty. If no writes succeed (e.g., read-only invocation), all actions appear under Recommended — the report becomes a maintenance plan.

**Legacy cleanup** (if `docs/solutions/_archived/` exists):
- List archived files found and recommend disposition: restore (if still relevant), delete (if truly obsolete), or consolidate (if overlapping with active docs)

## Phase 5: Commit Changes

After all actions are executed and the report is generated, handle committing the changes. Skip this phase if no files were modified (all Keep, or all writes failed).

### Detect git context

Before offering options, check:
1. Which branch is currently checked out (main/master vs feature branch)
2. Whether the working tree has other uncommitted changes beyond what compound-refresh modified
3. Recent commit messages to match the repo's commit style

### Autofix mode

Use sensible defaults — no user to ask:

| Context | Default action |
|---------|---------------|
| On main/master | Create a branch named for what was refreshed (e.g., `docs/refresh-auth-and-ci-learnings`), commit, attempt to open a PR. If PR creation fails, report the branch name. |
| On a feature branch | Commit as a separate commit on the current branch |
| Git operations fail | Include the recommended git commands in the report and continue |

Stage only the files that compound-refresh modified — not other dirty files in the working tree.

### Interactive mode

First, run `git branch --show-current` to determine the current branch. Then present the correct options based on the result. Stage only compound-refresh files regardless of which option the user picks.

**If the current branch is main, master, or the repo's default branch:**

1. Create a branch, commit, and open a PR (recommended) — the branch name should be specific to what was refreshed, not generic (e.g., `docs/refresh-auth-learnings` not `docs/compound-refresh`)
2. Commit directly to `{current branch name}`
3. Don't commit — I'll handle it

**If the current branch is a feature branch, clean working tree:**

1. Commit to `{current branch name}` as a separate commit (recommended)
2. Create a separate branch and commit
3. Don't commit

**If the current branch is a feature branch, dirty working tree (other uncommitted changes):**

1. Commit only the compound-refresh changes to `{current branch name}` (selective staging — other dirty files stay untouched)
2. Don't commit

### Commit message

Write a descriptive commit message that:
- Summarizes what was refreshed (e.g., "update 3 stale learnings, consolidate 2 overlapping docs, delete 1 obsolete doc")
- Follows the repo's existing commit conventions (check recent git log for style)
- Is succinct — the details are in the changed files themselves

## Relationship to ce:compound

- `ce:compound` captures a newly solved, verified problem
- `ce:compound-refresh` maintains older learnings as the codebase evolves — both their individual accuracy and their collective design as a document set

Use **Replace** only when the refresh process has enough real evidence to write a trustworthy successor. When evidence is insufficient, mark as stale and recommend `ce:compound` for when the user next encounters that problem area.

Use **Consolidate** proactively when the document set has grown organically and redundancy has crept in. Every `ce:compound` invocation adds a new doc — over time, multiple docs may cover the same problem from slightly different angles. Periodic consolidation keeps the document set lean and authoritative.

## Discoverability Check

After the refresh report is generated, check whether the project's instruction files would lead an agent to discover and search `docs/solutions/` before starting work in a documented area. This runs every time — the knowledge store only compounds value when agents can find it. If this check produces edits, they are committed as part of (or immediately after) the Phase 5 commit flow — see step 5 below.

1. Identify which root-level instruction files exist (AGENTS.md, CLAUDE.md, or both). Read the file(s) and determine which holds the substantive content — one file may just be a shim that `@`-includes the other (e.g., `CLAUDE.md` containing only `@AGENTS.md`, or vice versa). The substantive file is the assessment and edit target; ignore shims. If neither file exists, skip this check entirely.
2. Assess whether an agent reading the instruction files would learn three things:
   - That a searchable knowledge store of documented solutions exists
   - Enough about its structure to search effectively (category organization, YAML frontmatter fields like `module`, `tags`, `problem_type`)
   - When to search it (before implementing features, debugging issues, or making decisions in documented areas — learnings may cover bugs, best practices, workflow patterns, or other institutional knowledge)

   This is a semantic assessment, not a string match. The information could be a line in an architecture section, a bullet in a gotchas section, spread across multiple places, or expressed without ever using the exact path `docs/solutions/`. Use judgment — if an agent would reasonably discover and use the knowledge store after reading the file, the check passes.

3. If the spirit is already met, no action needed.
4. If not:
   a. Based on the file's existing structure, tone, and density, identify where a mention fits naturally. Before creating a new section, check whether the information could be a single line in the closest related section — an architecture tree, a directory listing, a documentation section, or a conventions block. A line added to an existing section is almost always better than a new headed section. Only add a new section as a last resort when the file has clear sectioned structure and nothing is even remotely related.
   b. Draft the smallest addition that communicates the three things. Match the file's existing style and density. The addition should describe the knowledge store itself, not the plugin.

      Keep the tone informational, not imperative. Express timing as description, not instruction — "relevant when implementing or debugging in documented areas" rather than "check before implementing or debugging." Imperative directives like "always search before implementing" cause redundant reads when a workflow already includes a dedicated search step. The goal is awareness: agents learn the folder exists and what's in it, then use their own judgment about when to consult it.

      Examples of calibration (not templates — adapt to the file):

      When there's an existing directory listing or architecture section — add a line:
      ```
      docs/solutions/  # documented solutions to past problems (bugs, best practices, workflow patterns), organized by category with YAML frontmatter (module, tags, problem_type)
      ```

      When nothing in the file is a natural fit — a small headed section is appropriate:
      ```
      ## Documented Solutions

      `docs/solutions/` — documented solutions to past problems (bugs, best practices, workflow patterns), organized by category with YAML frontmatter (`module`, `tags`, `problem_type`). Relevant when implementing or debugging in documented areas.
      ```
   c. In interactive mode, explain to the user why this matters — agents working in this repo (including fresh sessions, other tools, or collaborators without the plugin) won't know to check `docs/solutions/` unless the instruction file surfaces it. Show the proposed change and where it would go, then use the platform's blocking question tool (`AskUserQuestion` in Claude Code, `request_user_input` in Codex, `ask_user` in Gemini) to get consent before making the edit. If no question tool is available, present the proposal and wait for the user's reply. In autofix mode, include it as a "Discoverability recommendation" line in the report — do not attempt to edit instruction files (autofix scope is doc maintenance, not project config).

5. **Amend or create a follow-up commit when the check produces edits.** If step 4 resulted in an edit to an instruction file and Phase 5 already committed the refresh changes, stage the newly edited file and either amend the existing commit (if still on the same branch and no push has occurred) or create a small follow-up commit (e.g., `docs: add docs/solutions/ discoverability to AGENTS.md`). If Phase 5 already pushed the branch to a remote (e.g., the branch+PR path), push the follow-up commit as well so the open PR includes the discoverability change. This keeps the working tree clean and the remote in sync at the end of the run. If the user chose "Don't commit" in Phase 5, leave the instruction-file edit unstaged alongside the other uncommitted refresh changes — no separate commit logic needed.
