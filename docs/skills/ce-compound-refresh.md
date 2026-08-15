# `ce-compound-refresh`

> Maintain `docs/solutions/` over time: review existing learnings against the current codebase, then update, consolidate, replace, or delete the ones that drifted.

`ce-compound-refresh` is the **maintenance** skill for the knowledge store. `ce-compound` captures a new learning. This skill keeps the existing set honest as code moves. It is not a step in `/ce-ideate` → `/ce-brainstorm` → `/ce-plan` → `/ce-work`. Those skills read `docs/solutions/` as grounding. This one is how that folder stays trustworthy.

As the repo changes, paths move, recommended fixes become anti-patterns, and two docs on the same problem start to disagree. Without a periodic pass, the store misleads more than it helps.

```text
/ce-compound                 /ce-compound-refresh
Capture a new learning       Review the existing set
        |                            |
        +-------- docs/solutions/ ---+
                     |
                     v
              /ce-ideate, /ce-plan, /ce-debug  (read the store)
```

---

## TL;DR

| Question | Answer |
|----------|--------|
| What does it do? | Reviews learnings in `docs/solutions/` against current code and applies Keep, Update, Consolidate, Replace, or Delete |
| When to use it | After a refactor or rename; when `ce-compound` flags an older doc; when two docs overlap; periodic hygiene |
| What it produces | Edited, merged, replaced, or deleted docs; a per-doc maintenance report; optional `CONCEPTS.md` updates. Interactive mode may commit or open a PR. |
| Modes | Interactive (default) and `mode:non-interactive` (deprecated alias `mode:headless`) |
| What's next | Keep building. For a stale-marked doc, run `/ce-compound` the next time you work in that area. |

---

## Example invocations

A scope hint is a category directory, filename slug, module, or keyword. Empty is a broad sweep. `mode:non-interactive` applies unambiguous edits and reports the rest.

```text
# Review learnings for one module or topic
/ce-compound-refresh authentication

# One known file (filename slug)
/ce-compound-refresh plugin-versioning-requirements

# One category directory
/ce-compound-refresh performance-issues

# Pattern-doc topic
/ce-compound-refresh critical-patterns

# No hint: triage the whole store, then start at the highest-impact cluster. Interactive asks before going deep.
/ce-compound-refresh

# Apply unambiguous maintenance without questions. Ambiguous docs are marked stale. On the default branch this opens a PR.
/ce-compound-refresh authentication mode:non-interactive

# Build a repo-wide CONCEPTS.md glossary. Interactive asks whether you meant a refresh instead.
/ce-compound-refresh create a CONCEPTS.md
```

Prefer a topic, module, category, or filename. An unscoped run has to triage everything first.

---

## The Problem

`docs/solutions/` drifts in predictable ways:

- A learning still names `app/models/auth_token.rb` after the file became `session_token.rb`
- The recommended fix is now an anti-pattern
- Two learnings describe the same problem from different months and have started to disagree
- A pattern doc whose supporting learnings no longer back the rule
- Code that disappeared quarters ago, with the learning still sitting there
- `_archived/` folders that pollute search and nobody reads

Future agents (and humans) then take advice that no longer applies. The store makes the next encounter harder, not easier.

## The Solution

`ce-compound-refresh` is a structured review with five outcomes:

- **Keep**: accurate and useful. No edit. No review breadcrumb.
- **Update**: the solution is still right; references drifted. Fix in place, including relocating a doc whose directory and frontmatter category clearly disagree.
- **Consolidate**: two docs overlap. Merge unique content into the canonical one and delete the other. The inverse, **Split**, breaks one multi-problem doc into focused successors when the fragments have independent retrieval value.
- **Replace**: the old guidance is now misleading. Write a successor, then delete the old file.
- **Delete**: the code and the problem domain are gone, and inbound citations are absent or decorative. Git history is the archive. There is no `_archived/` destination.

It investigates each doc against the tree, then looks at the set (overlap, supersession, contradictions), then classifies, then executes. Interactive mode asks only on genuine judgment calls. Non-interactive applies the safe subset and marks the rest stale.

---

## What Makes It Novel

### Five outcomes, not "is this still right?"

Each doc gets a specific action and an evidence bar. Age alone is not staleness. Typos and wording are not a reason to edit. When the code and the doc disagree, the doc changes. The skill does not ask whether the code change was "intentional."

### Two modes

**Interactive** (default) applies Keep, Update, and obvious Consolidate directly. It asks before a Replace, a Split, a Delete that fails the auto-delete gate, or a Consolidate whose canonical doc is not obvious.

**Non-interactive** never pauses. It applies Keep, Update, Consolidate, gated auto-Delete, and Replace when the evidence is enough. Ambiguous cases get `status: stale`, `stale_reason`, and `stale_date` in frontmatter. Relocations auto-apply only under a four-condition gate; otherwise they are recommended. Splits are always recommend-only. The report splits into Applied (writes that succeeded) and Recommended (writes that failed, plus everything that never runs unattended).

### Set-level problems

After the per-doc pass, the skill looks for overlap, a newer doc that subsumes an older one, and contradictions between docs. Contradictions outrank individual drift. For a knowledge-track learning, it also compares any guidance file the learning names (a skill's `SKILL.md`, a runbook, a root instruction file) for a conflicting order or rule on the same procedure — only guidance the learning names, never a search — and reports a wrong guidance file rather than editing it. Category-shape notes (a directory that mixes unrelated themes, a near-empty category) are report-only. It never renames categories or invents new ones.

### Delete is conservative

Auto-delete requires all three: the implementation that lived in this repo is gone (or a successor already states the same guidance); the problem domain is gone; inbound markdown citations are absent or decorative. A doc that never pointed at in-repo code never auto-deletes. A citation that the other doc depends on is a Replace or Keep signal, not a cleanup task.

If the current approach cannot be documented from a file scan, the doc is marked stale rather than guessed into a replacement. The recommendation is `/ce-compound` the next time you work in that area.

### Vocabulary and findability

After the doc actions, the skill reconciles domain terms with `CONCEPTS.md` at the repo root (creates it when enough terms qualify). That pass is silent in both modes.

Every run also checks whether the project's instruction files would lead an agent to `docs/solutions/`. Interactive mode proposes the smallest addition and asks before editing. Non-interactive only recommends it. The same check runs for `CONCEPTS.md` when that file exists.

---

## Quick Example

You just merged a rename in the auth models. You run `/ce-compound-refresh auth`.

The skill finds five learnings and two pattern docs that match via directory, frontmatter, filename, or content.

Investigation: three still name files that moved (`auth_token.rb` → `session_token.rb`). One is fully superseded by a newer doc. One is still accurate. One pattern doc generalizes a rule the rename broke. Set analysis then shows two learnings covering the same auth-error problem; the newer one is broader.

Classification: three Updates (rename the references), one Consolidate (merge the older error doc into the newer and delete the older), one Keep, one Replace (the pattern). The successor is written, then the old pattern file is deleted.

Interactive mode confirms the consolidation if the canonical choice is not obvious. Other actions apply directly. If you are on a feature branch, the recommended close is a separate commit of only the refresh files.

The printed report lists every doc, the outcome, the evidence, and what was done.

---

## When to Reach For It

Reach for `ce-compound-refresh` when:

- A refactor or rename just landed and learnings in that area likely drifted
- `ce-compound` flagged a specific older doc as superseded
- Two docs in `docs/solutions/` look like the same problem
- You want a periodic hygiene pass (for example quarterly), preferably scoped
- You want a repo-wide `CONCEPTS.md` seeded from the declared domain model

Skip `ce-compound-refresh` when:

- You have not seen any drift. Broad sweeps without evidence produce churn.
- The docs are recent and that area of the codebase has not moved
- You are mid debug or mid build. Capture first with `/ce-compound`. Refresh later.

---

## Use as Part of the Workflow

This skill is the maintenance counterpart to `/ce-compound`. It is not on the ideate → brainstorm → plan → work path.

- **From `/ce-compound`**: a narrow scope hint when a new learning suggests an older doc is stale
- **Manual, scoped**: `/ce-compound-refresh auth`, `/ce-compound-refresh performance-issues`
- **Pre-release**: a pass so documented learnings match what is shipping

`ce-compound` adds docs. `ce-compound-refresh` keeps the set lean. Without the second skill, the first eventually clutters.

---

## Use Standalone

- Specific file: `/ce-compound-refresh plugin-versioning-requirements`
- Module or keyword: `/ce-compound-refresh payments`
- Category: `/ce-compound-refresh performance-issues`
- Pattern topic: `/ce-compound-refresh critical-patterns`
- Non-interactive: `/ce-compound-refresh auth mode:non-interactive`
- Repo-wide glossary: `/ce-compound-refresh create a CONCEPTS.md` (or `build the concept map`)
- Broad sweep (rare): `/ce-compound-refresh`

With no hint, the skill clusters the store and recommends a starting area before deep investigation. Interactive confirms that area. Non-interactive processes every cluster in impact order. A hint that matches nothing asks you to clarify (interactive) or reports the miss and exits (non-interactive). An empty store tells you to run `ce-compound` first.

---

## Reference

| Argument | Effect |
|----------|--------|
| _(empty)_ | Broad sweep with triage. Interactive: confirm the starting cluster. Non-interactive: process everything, no narrowing question. |
| `<directory>` | Category folder, e.g. `performance-issues` |
| `<filename slug>` | One file, e.g. `plugin-versioning-requirements` |
| `<module/keyword>` | Narrow by frontmatter or content, e.g. `auth`, `payments` |
| `mode:non-interactive` | Append to any of the above. No prompts. Unambiguous actions apply; the rest are stale-marked or recommended. Deprecated alias: `mode:headless`. |
| `create a CONCEPTS.md` / `build the concept map` | Interactive: ask whether to bootstrap the glossary or run a refresh. Non-interactive: run a refresh and note that a standalone bootstrap was not run. |

Default review root: `docs/solutions/` (follows `docs_root` if set). `README.md` files and anything under `_archived/` are not review candidates. Catalog README rows still update when a listed doc is removed or renamed. If `_archived/` exists, the report flags it for cleanup.

On the default branch, non-interactive commits on a named branch and attempts a PR. Interactive asks: branch + PR, commit here, or don't commit.

---

## FAQ

**What's the difference between Update and Replace?**
Update fixes drift and keeps the recommended solution (renamed file, moved class, broken link, unambiguous misfile). Replace rewrites the guidance because the recommended approach changed. If you would rewrite the solution section, that is Replace.

**Why doesn't it ask whether code changes were intentional?**
Doc accuracy is the job: match the doc to current code. Whether the code change was right is a code-review question.

**When should I use non-interactive mode?**
Periodic or large-scope runs where stopping on every question is impractical. Ambiguous cases are marked stale, so the report is something a human can review.

**What if it wants to delete a doc I want to keep?**
Interactive mode shows the evidence first. Decline and the file stays. Non-interactive auto-delete is conservative: a substantive citation downgrades to stale-marking.

**Why delete instead of archive?**
Archive folders accumulate and pollute search. `git log --diff-filter=D -- docs/solutions/` recovers anything you need.

**Does it reorganize `docs/solutions/`?**
Only the safe subset. Unambiguous misfilings can move with inbound-link rewrites. One multi-problem doc can be split (always recommend-only when unattended). Catalog README rows update when a listed doc is removed or renamed. Renaming categories or inventing new ones is never automated.

**Does it treat pattern docs differently?**
Same five outcomes, different evidence. Keep means the supporting learnings still back the rule. Replace means the generalization is now wrong, and the successor is based on the refreshed learnings, not a new invention.

**What does a CONCEPTS.md run do?**
It seeds the project's core domain nouns into a repo-root glossary. A normal refresh also accretes terms from the docs in scope and will create `CONCEPTS.md` if enough terms qualify. The explicit bootstrap is the only repo-wide seed.

---

## See Also

- [`ce-compound`](./ce-compound.md): captures new learnings; this skill maintains the existing set
- [`ce-plan`](./ce-plan.md): reads `docs/solutions/` as institutional memory
- [`ce-ideate`](./ce-ideate.md): consults `docs/solutions/` during grounding
- [`ce-doc-review`](./ce-doc-review.md): persona-based review of a single doc, not maintenance across the set
