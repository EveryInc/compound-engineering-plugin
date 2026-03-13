---
name: ce:compound-refresh
description: Refresh stale or drifting learnings and pattern docs in docs/solutions/ by reviewing, updating, replacing, or archiving them against the current codebase. Use after refactors, migrations, dependency upgrades, or when a retrieved learning feels outdated or wrong. Also use when reviewing docs/solutions/ for accuracy, when a recently solved problem contradicts an existing learning, or when pattern docs no longer reflect current code.
argument-hint: "[optional: scope hint]"
disable-model-invocation: true
---

# Compound Refresh

Maintain the quality of `docs/solutions/` over time. This workflow reviews existing learnings against the current codebase, then refreshes any derived pattern docs that depend on them.

## Interaction Principles

Follow the same interaction style as `ce:brainstorm`:

- Ask questions **one at a time**
- Prefer **multiple choice** when natural options exist
- Start with **scope and intent**, then narrow only when needed
- Do **not** ask the user to make decisions before you have evidence
- Lead with a recommendation and explain it briefly

The goal is not to force the user through a checklist. The goal is to help them make a good maintenance decision with the smallest amount of friction.

## Refresh Order

Refresh in this order:

1. Review the relevant individual learning docs first
2. Note which learnings stayed valid, were updated, were replaced, or were archived
3. Then review any pattern docs that depend on those learnings

Why this order:

- learning docs are the primary evidence
- pattern docs are derived from one or more learnings
- stale learnings can make a pattern look more valid than it really is

If the user starts by naming a pattern doc, you may begin there to understand the concern, but inspect the supporting learning docs before changing the pattern.

## Maintenance Model

For each candidate artifact, classify it into one of four outcomes:

| Outcome | Meaning | Default action |
|---------|---------|----------------|
| **Keep** | Still accurate and still useful | No file edit by default; report that it was reviewed and remains trustworthy |
| **Update** | Core solution is still correct, but references drifted | Apply evidence-backed in-place edits |
| **Replace** | The old artifact is now misleading, but there is a known better replacement | Create a trustworthy successor or revised pattern, then mark/archive the old artifact as needed |
| **Archive** | No longer useful or applicable | Move the obsolete artifact to `docs/solutions/_archived/` with archive metadata when appropriate |

## Core Rules

1. **Evidence informs judgment.** The signals below are inputs, not a mechanical scorecard. Use engineering judgment to decide whether the artifact is still trustworthy.
2. **Prefer no-write Keep.** Do not update a doc just to leave a review breadcrumb.
3. **Match docs to reality, not the reverse.** When current code differs from a learning, update the learning to reflect the current code. The skill's job is doc accuracy, not code review — do not ask the user whether code changes were "intentional" or "a regression." If the code changed, the doc should match. If the user thinks the code is wrong, that is a separate concern outside this workflow.
4. **Be decisive, minimize questions.** When evidence is clear (file renamed, class moved, reference broken), apply the update. Only ask the user when the right maintenance action is genuinely ambiguous — not to confirm obvious fixes. The goal is automated maintenance with human oversight on judgment calls, not a question for every finding.
5. **Avoid low-value churn.** Do not edit a doc just to fix a typo, polish wording, or make cosmetic changes that do not materially improve accuracy or usability.
6. **Use Update only for meaningful, evidence-backed drift.** Paths, module names, related links, category metadata, code snippets, and clearly stale wording are fair game when fixing them materially improves accuracy.
7. **Use Replace only when there is a real replacement.** That means either:
   - the current conversation contains a recently solved, verified replacement fix, or
   - the user provides enough concrete replacement context to document the successor honestly, or
   - newer docs, pattern docs, PRs, or issues provide strong successor evidence.
8. **Archive when the code is gone.** If the referenced code, controller, or workflow no longer exists in the codebase and no successor can be found, recommend Archive — don't default to Keep just because the general advice is still "sound." A learning about a deleted feature misleads readers into thinking that feature still exists. When in doubt between Keep and Archive, ask the user — but missing referenced files with no matching code is strong Archive evidence, not a reason to Keep with "medium confidence."

## Scope Selection

Start by discovering learnings and pattern docs under `docs/solutions/`.

Exclude:

- `README.md`
- `docs/solutions/_archived/`

Find all `.md` files under `docs/solutions/`, excluding `README.md` files and anything under `_archived/`.

If `$ARGUMENTS` is provided, use it to narrow scope before proceeding. Try these matching strategies in order, stopping at the first that produces results:

1. **Directory match** — check if the argument matches a subdirectory name under `docs/solutions/` (e.g., `performance-issues`, `database-issues`)
2. **Frontmatter match** — search `module`, `component`, or `tags` fields in learning frontmatter for the argument
3. **Filename match** — match against filenames (partial matches are fine)
4. **Content search** — search file contents for the argument as a keyword (useful for feature names or feature areas)

If no matches are found, report that and ask the user to clarify.

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
| **Batch** | 3-8 mostly independent docs | Investigate first, then present grouped recommendations |
| **Broad** | Large, ambiguous, or repo-wide stale-doc sweep | Ask one narrowing question before deep investigation |

If scope is broad or ambiguous, ask one question to narrow it before scanning deeply. Prefer multiple choice when possible:

```text
I found a broad refresh scope. Which area should we review first?

1. A specific file
2. A category or module
3. Pattern docs first
4. Everything in scope
```

Do not ask action-selection questions yet. First gather evidence.

## Phase 1: Investigate Candidate Learnings

For each learning in scope, read it, cross-reference its claims against the current codebase, and form a recommendation.

A learning has several dimensions that can independently go stale. Surface-level checks catch the obvious drift, but staleness often hides deeper:

- **References** — do the file paths, class names, and modules it mentions still exist or have they moved?
- **Recommended solution** — does the fix still match how the code actually works today? A renamed file with a completely different implementation pattern is not just a path update.
- **Code examples** — if the learning includes code snippets, do they still reflect the current implementation?
- **Related docs** — are cross-referenced learnings and patterns still present and consistent?

Match investigation depth to the learning's specificity — a learning referencing exact file paths and code snippets needs more verification than one describing a general principle.

Three judgment guidelines that are easy to get wrong:

1. **Contradiction = strong Replace signal.** If the learning's recommendation conflicts with current code patterns or a recently verified fix, that is not a minor drift — the learning is actively misleading.
2. **Age alone is not a stale signal.** A 2-year-old learning that still matches current code is fine. Only use age as a prompt to inspect more carefully.
3. **Check for successors before archiving.** Before recommending Replace or Archive, look for newer learnings, pattern docs, PRs, or issues covering the same problem space. If successor evidence exists, prefer Replace over Archive so readers are directed to the newer guidance.

## Phase 1.5: Investigate Pattern Docs

After reviewing the underlying learning docs, investigate any relevant pattern docs under `docs/solutions/patterns/`.

Pattern docs are high-leverage — a stale pattern is more dangerous than a stale individual learning because future work may treat it as broadly applicable guidance. Evaluate whether the generalized rule still holds given the refreshed state of the learnings it depends on.

A pattern doc with no clear supporting learnings is a stale signal — investigate carefully before keeping it unchanged.

## Subagent Strategy

Use subagents for context isolation when investigating multiple artifacts — not just because the task sounds complex. Choose the lightest approach that fits:

| Approach | When to use |
|----------|-------------|
| **Main thread only** | Small scope, short docs |
| **Sequential subagents** | 1-2 artifacts with many supporting files to read |
| **Parallel subagents** | 3+ truly independent artifacts with low overlap |
| **Batched subagents** | Broad sweeps — narrow scope first, then investigate in batches |

Subagents are **read-only investigators**. They must not edit files, create successors, or archive anything. Each returns: file path, evidence, recommended action, confidence, and open questions.

The orchestrator merges results, detects contradictions, asks the user questions, and performs all edits centrally. If two artifacts overlap or discuss the same root issue, investigate them together rather than parallelizing.

## Phase 2: Classify the Right Maintenance Action

After gathering evidence, assign one recommended action.

### Keep

The learning is still accurate and useful. Do not edit the file — report that it was reviewed and remains trustworthy. Only add `last_refreshed` if you are already making a meaningful update for another reason.

### Update

The core solution is still valid but references have drifted (paths, class names, links, code snippets, metadata). Apply the fixes directly.

### Replace

Choose **Replace** when the learning's core guidance is now misleading — the recommended fix changed materially, the root cause or architecture shifted, or the preferred pattern is different.

Replace requires real replacement context. Investigate before asking the user — they may have invoked the refresh months after the original learning was written and not have this context themselves.

**Investigation order:**

1. Check if the current conversation already contains replacement context (e.g., user just solved the problem differently)
2. If not, spawn a read-only subagent to investigate deeper — git history, related PRs, newer learnings, current code patterns — to find what replaced the old approach. Use a subagent to protect the main session context window from the volume of evidence.
3. If the conversation or codebase provides sufficient replacement context → proceed:
   - Create a successor learning through `ce:compound`
   - Add `superseded_by` metadata to the old learning
   - Move the old learning to `docs/solutions/_archived/`
4. If replacement context is insufficient → do **not** force Replace. Mark the learning as stale in place so readers know not to rely on it:
   - Add `status: stale`, `stale_reason`, and `stale_date` to the frontmatter
   - Report to the user what you found and suggest they come back with `ce:compound` after solving the problem fresh

Only ask the user for replacement context if they clearly have it (e.g., they mentioned a recent migration or refactor). Do not default to asking — default to investigating.

### Archive

Choose **Archive** when:

- The code or workflow no longer exists
- The learning is obsolete and has no modern replacement worth documenting
- The learning is redundant and no longer useful on its own
- There is no meaningful successor evidence suggesting it should be replaced instead

Action:

- Move the file to `docs/solutions/_archived/`, preserving directory structure when helpful
- Add:
  - `archived_date: YYYY-MM-DD`
  - `archive_reason: [why it was archived]`

Auto-archive when evidence is unambiguous:

- the referenced code, controller, or workflow is gone and no successor exists in the codebase
- the learning is fully superseded by a clearly better successor
- the document is plainly redundant and adds no distinct value

Do not keep a learning just because its general advice is "still sound" — if the specific code it references is gone, the learning misleads readers. Archive it.

If there is a clearly better successor, strongly consider **Replace** before **Archive** so the old artifact points readers toward the newer guidance.

## Pattern Guidance

Apply the same four outcomes (Keep, Update, Replace, Archive) to pattern docs, but evaluate them as **derived guidance** rather than incident-level learnings. Key differences:

- **Keep**: the underlying learnings still support the generalized rule and examples remain representative
- **Update**: the rule holds but examples, links, scope, or supporting references drifted
- **Replace**: the generalized rule is now misleading, or the underlying learnings support a different synthesis. Base the replacement on the refreshed learning set — do not invent new rules from guesswork
- **Archive**: the pattern is no longer valid, no longer recurring, or fully subsumed by a stronger pattern doc

If "archive" feels too strong but the pattern should no longer be elevated, reduce its prominence in place if the docs structure supports that.

## Phase 3: Ask for Decisions

Most Updates should be applied directly without asking. Only ask the user when:

- The right action is genuinely ambiguous (Update vs Replace vs Archive)
- You are about to Archive a document
- You are about to create a successor via `ce:compound`

Do **not** ask questions about whether code changes were intentional, whether the user wants to fix bugs in the code, or other concerns outside doc maintenance. Stay in your lane — doc accuracy.

### Question Style

Use the **AskUserQuestion tool** when available.

If the environment does not support interactive prompts, present numbered options in plain text and wait for the user's response before proceeding.

Question rules:

- Ask **one question at a time**
- Prefer **multiple choice**
- Lead with the **recommended option**
- Explain the rationale for the recommendation in one concise sentence
- Avoid asking the user to choose from actions that are not actually plausible

### Focused Scope

For a single artifact, present:

- file path
- 2-4 bullets of evidence
- recommended action

Then ask:

```text
This [learning/pattern] looks like a [Update/Keep/Replace/Archive].

Why: [one-sentence rationale based on the evidence]

What would you like to do?

1. [Recommended action]
2. [Second plausible action]
3. Skip for now
```

Do not list all four actions unless all four are genuinely plausible.

### Batch Scope

For several learnings:

1. Group obvious **Keep** cases together
2. Group obvious **Update** cases together when the fixes are straightforward
3. Present **Replace** cases individually or in very small groups
4. Present **Archive** cases individually unless they are strong auto-archive candidates

Ask for confirmation in stages:

1. Confirm grouped Keep/Update recommendations
2. Then handle Replace one at a time
3. Then handle Archive one at a time unless the archive is unambiguous and safe to auto-apply

### Broad Scope

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

### Replace Flow

Follow the investigation order defined in Phase 2's Replace section. The key principle: exhaust codebase investigation before asking the user for context they may not have.

If replacement context is found and sufficient:

1. Run `ce:compound` with a short context summary for the replacement learning
2. Create the new learning
3. Update the old doc with `superseded_by`
4. Move the old doc to `docs/solutions/_archived/`

If replacement context is insufficient, mark the learning as stale in place:

1. Add to frontmatter: `status: stale`, `stale_reason: [what you found]`, `stale_date: YYYY-MM-DD`
2. Report to the user what evidence you found and what's missing
3. Suggest they revisit with `ce:compound` after solving the problem fresh

### Archive Flow

Archive only when a learning is clearly obsolete or redundant. Do not archive a document just because it is old.

## Output Format

After processing the selected scope, report:

```text
Compound Refresh Summary
========================
Scanned: N learnings

Kept: X
Updated: Y
Replaced: Z
Archived: W
Skipped: V
```

Then list the affected files and what changed.

For **Keep** outcomes, list them under a reviewed-without-edits section so the result is visible without creating git churn.

## Relationship to ce:compound

- `ce:compound` captures a newly solved, verified problem
- `ce:compound-refresh` maintains older learnings as the codebase evolves

Use **Replace** only when the refresh process has enough real replacement context to hand off honestly into `ce:compound`.
