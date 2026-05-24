# `ce-compound-refresh`

> Maintain `docs/solutions/` over time — review existing learnings against the current codebase, then update, consolidate, replace, or delete the drifted ones.

`ce-compound-refresh` is the **maintenance** skill for institutional knowledge. As code evolves, learnings drift: file paths change, classes are renamed, the recommended fix becomes an anti-pattern, two docs cover the same problem from slightly different angles. Without periodic maintenance, `docs/solutions/` becomes a thicket of half-true guidance that misleads more than it helps. This skill is the periodic review that keeps it lean and trustworthy.

It pairs with `ce-compound`: that skill **captures** new learnings; this skill **maintains** the existing set. Together they form a feedback loop — every solved problem becomes a doc, and every refresh keeps those docs honest as the codebase evolves.

---

## TL;DR

| Question | Answer |
|----------|--------|
| What does it do? | Reviews learnings in `docs/solutions/` against the current codebase and applies one of five outcomes: Keep, Update, Consolidate, Replace, Delete |
| When to use it | After significant refactors; when `ce-compound` flags an older doc as superseded; when learnings are accumulating drift; periodic hygiene sweeps |
| What it produces | Updated, consolidated, replaced, or deleted docs — plus a maintenance report |
| Modes | **Interactive** (default) and **Autofix** (`mode:autofix`) |

---

## The Problem

`docs/solutions/` accumulates drift in predictable ways:

- **Renames and moves** — a learning references `app/models/auth_token.rb`, but the file is now `app/models/session_token.rb`
- **Architectural shifts** — the recommended fix is now an anti-pattern; the new architecture handles the problem differently
- **Silent duplication** — two learnings describe the same problem from different angles, written months apart, and they're starting to disagree
- **Pattern docs without supporting learnings** — a generalized rule whose underlying evidence has shifted
- **Dead docs that won't die** — code that was deleted three quarters ago, but the learning still sits there
- **Archive folders that grow** — `_archived/` directories that pollute search results and nobody reads

Without active maintenance, the knowledge store loses trustworthiness. Future agents (and humans) consult docs that are partially wrong, take advice that no longer applies, and the compound effect inverts: bad learnings make work *harder*, not easier.

## The Solution

`ce-compound-refresh` runs as a structured review with five explicit outcomes:

- **Keep** — accurate and useful; no edit
- **Update** — references drifted but the solution is still right; apply in-place fixes
- **Consolidate** — two docs overlap heavily; merge unique content into the canonical doc, delete the subsumed one
- **Replace** — the old guidance is now misleading; write a successor (via subagent for context isolation) and delete the old
- **Delete** — code is gone, problem domain is gone, no inbound substantive citations; remove the file (git history is the archive)

The skill investigates first (Phase 1 reads each doc against the current codebase), then performs document-set analysis (Phase 1.75 catches problems only visible across docs), then classifies, then executes — committing the changes via PR or directly to the current branch.

---

## What Makes It Novel

### 1. Five maintenance outcomes — explicit decisions, not vague "audit"

Most "review the docs" prompts collapse into "is this still right?" → vague answers. The five-outcome model forces a specific decision per doc and a specific action: Keep does nothing, Update applies in-place fixes, Consolidate merges and deletes, Replace writes a successor, Delete removes the file. Each has its own evidence bar.

### 2. Two modes — Interactive default, Autofix on `mode:autofix`

**Interactive** (default) asks one question at a time on ambiguous cases, leads with a recommendation. **Autofix** processes all docs without user interaction, applies all unambiguous actions, and marks ambiguous cases as stale (with `status: stale`, `stale_reason`, `stale_date` in frontmatter) for later human review. The autofix report has two sections: **Applied** (writes that succeeded) and **Recommended** (writes that couldn't be applied — e.g., permission denied — with full rationale so a human can apply them).

### 3. Document-set analysis — catches what per-doc review misses

Phase 1.75 evaluates the document set as a whole: overlap detection across five dimensions (problem statement, solution shape, referenced files, prevention rules, root cause), supersession signals (newer canonical doc subsumes older narrow precursor), canonical-doc identification per topic cluster, and cross-doc conflict checks. Two docs covering the same ground will eventually drift apart and contradict each other — that's worse than a slightly longer single doc.

### 4. Replace via subagent — context isolation

When a learning's core guidance is now misleading, the orchestrator dispatches a subagent to write the replacement (one at a time, sequentially — replacements may need to read significant code, and parallelism risks context exhaustion). The subagent receives the old learning, the investigation evidence, the target path, and the contract files (schema, category mapping, template) — and writes a clean successor without polluting the orchestrator's context.

### 5. Stale-marking when evidence is insufficient

When the drift is so fundamental that the agent can't confidently document the current approach (entire subsystem replaced, new architecture too complex to understand from a file scan), the doc is marked `status: stale` in place rather than incorrectly Replaced. Recommendation: run `/ce-compound` after the next encounter with that area, when fresh problem-solving context exists.

### 6. Auto-delete safety — three conditions

Auto-delete fires only when **all three** are true:

- The implementation is gone (or fully superseded by a clearly better successor, or the doc is plainly redundant)
- The problem domain is gone — the app no longer deals with what the learning addresses
- Inbound links are absent or unambiguously decorative

If any condition fails — including substantive citations from other docs — the skill classifies as Replace, Update, Consolidate, or stale-mark instead. **Auto-delete + decorative-citation cleanup is fine; substantive citations or genuine ambiguity downgrade to stale-marking.**

### 7. Inbound link classification — decorative vs substantive

Before deleting a doc, the skill searches the repo's markdown for citations of the file. Each citation is classified:

- **Decorative** — principle stated inline, citation is a "see also" pointer. Delete + cleanup is mechanical.
- **Substantive** — citing doc relies on the cited doc for content not stated inline. Signal Replace; don't delete.
- **Mixed/unclear** — stale-mark.

Inbound links inform classification, not just cleanup — citations rewrite the action choice, not just the post-delete fixup.

### 8. Match docs to reality, not the reverse

When current code differs from a learning, the skill updates the learning to reflect the current code. **It does not ask the user whether the code change was "intentional" or "a regression"** — that's a code-review question, not a doc-maintenance question. The skill's job is doc accuracy. If the user thinks the code is wrong, that's a separate concern outside this workflow.

### 9. Delete, don't archive

Deleted docs are deleted, not moved to `_archived/`. Git history preserves every deleted file (`git log --diff-filter=D -- docs/solutions/`). A dedicated archive directory accumulates and pollutes search results. If an `_archived/` directory exists from before this convention, the skill flags it for cleanup in the report.

### 10. Discoverability check carries over

Like `ce-compound`, every refresh run checks whether `AGENTS.md`/`CLAUDE.md` surfaces `docs/solutions/`. The check runs every time — knowledge only compounds value when agents can find it. In autofix mode, the recommendation appears in the report rather than being applied (autofix scope is doc maintenance, not project config).

---

## Quick Example

You've just merged a refactor that renamed several models in the auth subsystem. You invoke `/ce-compound-refresh auth`.

The skill discovers 5 learnings and 2 pattern docs that match `auth` (via directory, frontmatter, filename, or content search). Phase 0 routes as a focused scope.

Phase 1 investigates each doc. Three reference files that no longer exist (auth_token.rb → session_token.rb). One is fully superseded by a newer doc. One is still accurate. One pattern doc generalizes a rule that the recent architectural change broke.

Phase 1.75 surfaces overlap: two of the learnings cover the same authentication-error-handling problem from slightly different angles. The newer one is broader and more accurate.

Phase 2 classifies: 3 Updates (rename references), 1 Consolidate (merge the older auth-error doc into the newer one and delete the older), 1 Keep, 1 Replace (the pattern doc — old generalization no longer holds). The replacement is dispatched to a subagent that reads the contract files and writes the successor; the orchestrator deletes the old.

Phase 3 (interactive mode) confirms the consolidation choice with you (canonical doc selection isn't always obvious). Other actions are applied directly. Phase 5 commits as a separate commit on the current feature branch with a descriptive message.

The report lists each doc, what was done, and why.

---

## When to Reach For It

Reach for `ce-compound-refresh` when:

- A significant refactor or rename just landed and learnings in that area likely drifted
- `ce-compound` flagged a specific older doc as superseded by a new learning
- You're noticing learnings accumulating without periodic review
- Two docs in `docs/solutions/` look like they cover the same problem
- You want a periodic hygiene sweep (e.g., quarterly) to keep the knowledge store lean

Skip `ce-compound-refresh` when:

- You haven't actually noticed any drift — broad sweeps without evidence produce churn
- The docs are recent and the codebase area hasn't moved
- You're in the middle of a debugging or build session — capture first via `/ce-compound`, refresh later

---

## Use as Part of the Workflow

`ce-compound-refresh` is the maintenance counterpart to `/ce-compound`:

- **Triggered from `/ce-compound`** — Phase 2.5's selective refresh check passes a narrow scope hint when a new learning suggests an older doc may be stale
- **Manual periodic invocation** — typically scoped (`/ce-compound-refresh auth`, `/ce-compound-refresh performance-issues`) to avoid sweeping reviews without evidence
- **Pre-release hygiene** — sweep `docs/solutions/` before a major release to ensure documented learnings reflect the shipping reality

The pairing matters: `ce-compound` adds new docs; `ce-compound-refresh` ensures the existing set stays lean. Without the second, the first eventually clutters.

---

## Use Standalone

The skill is invoked directly with a scope hint that narrows the review:

- **Specific file** — `/ce-compound-refresh plugin-versioning-requirements`
- **Module/component** — `/ce-compound-refresh payments`
- **Category** — `/ce-compound-refresh performance-issues`
- **Pattern topic** — `/ce-compound-refresh critical-patterns`
- **Autofix mode** — `/ce-compound-refresh auth mode:autofix` (no user interaction; report is the deliverable)
- **Broad sweep** (rare) — `/ce-compound-refresh` with no scope, processes everything

Without a scope hint, the skill discovers the candidate set, does broad-scope triage (groups by module/component, identifies highest-impact clusters), and recommends a starting area before deep investigation.

---

## Reference

| Argument | Effect |
|----------|--------|
| _(empty)_ | Broad sweep with triage; recommends a starting cluster |
| `<directory>` | e.g., `performance-issues` — narrows by category |
| `<filename slug>` | e.g., `plugin-versioning-requirements` — narrows by file |
| `<module/keyword>` | e.g., `auth`, `payments` — narrows by content/frontmatter |
| `mode:autofix` | Append to any of the above; runs without user interaction, applies all unambiguous actions, marks ambiguous as stale |

---

## FAQ

**What's the difference between Update and Replace?**
Update fixes drift while keeping the core solution intact (renamed file, moved class, broken link). Replace rewrites the guidance because the recommended approach changed materially. The boundary: if you find yourself rewriting the solution section, that's Replace, not Update.

**Why doesn't the skill ask whether code changes were intentional?**
Stay-in-your-lane discipline. The skill's job is doc accuracy — match the doc to current code. Whether the code change was right or wrong is a code-review concern; if the user thinks the code is wrong, that's a separate workflow.

**When should I use autofix mode?**
For periodic sweeps, scheduled maintenance runs, or large-scope reviews where stopping for every question would be impractical. Autofix marks ambiguous cases as stale rather than incorrectly resolving them, so the deliverable is a self-contained report a human can review.

**What if the skill wants to delete a doc I think should be kept?**
In interactive mode, you'll see the recommendation with evidence before deletion. Decline and the doc stays. In autofix mode, the auto-delete safety conditions are conservative — substantive citations downgrade to stale-marking automatically.

**Why delete instead of archive?**
Archive folders accumulate and pollute search results, nobody reads them, and they create the illusion of "we'll come back to this" without actually doing it. Git history preserves every deleted file. `git log --diff-filter=D -- docs/solutions/` finds anything you need to recover.

**Does it handle pattern docs differently from learning docs?**
Yes — pattern docs are derived guidance, not incident-level learnings. The five outcomes apply, but with different evidence: Keep means underlying learnings still support the rule; Replace means the synthesis is misleading and a different generalization is needed based on refreshed learnings.

---

## See Also

- [`ce-compound`](./ce-compound.md) — captures new learnings; this skill maintains the existing set
- [`ce-plan`](./ce-plan.md) — reads `docs/solutions/` as institutional memory; benefits from clean, current docs
- [`ce-ideate`](./ce-ideate.md) — also consults `docs/solutions/` during grounding
- [`ce-doc-review`](./ce-doc-review.md) — different skill: persona-based review of a single doc, not maintenance across the set
