# PR Description Writing

## The core principle

The diff is already visible on GitHub. The description exists to explain what the diff cannot show: what was impossible before and is now possible, what was broken and is now fixed, what shape changed. Cut any sentence a reader could reconstruct from the diff itself.

- Bad: "Adds `evidence-decider.ts`, modifies `ce-commit-push-pr/SKILL.md` to call it, and updates two test files."
- Good: "Evidence capture now decides automatically whether a change has observable behavior. CLI tools and libraries are now eligible alongside web UIs."

If the lead describes moves/renames/adds rather than what's now possible or fixed, rewrite it — restating the diff is the failure mode this skill exists to prevent. For user-facing bugs, name the visible before/after first; mention the technical cause only if it helps assess risk.

**Prose (STE-inspired, scoped).** Write framing and connective prose in an ASD-STE100 Simplified Technical English (STE)-inspired style: short, direct sentences; one idea per sentence; one consistent term per concept. Prefer plain wording wherever domain terms are not load-bearing. Keep necessary technical jargon, identifiers, paths, protocols, and error text where they *are* the claim or the review target — do not dilute mechanism language into vague plain English. Shorten sentences, not content.

- Bad (jargon without need): "This advances the modularized invalidation surface for progressive revocation semantics."
- Good (plain frame / jargon is the claim): "This is the second slice of the session-revocation rewrite." / "`TokenStore.invalidate` is now atomic under concurrent refresh."

## Project PR-body contract

Before composing, resolve PR-body requirements from the project's active instructions and conventions already in context, then check standard PR-template locations (repo root, `docs/`, `.github/`, `.github/PULL_REQUEST_TEMPLATE/`) and any contribution guidance they reference. Required headings, fields, order, checklists, and boilerplate define the structural contract. Treat a template as a minimum unless the project explicitly requires an exact/template-only body or forbids additions; only then add no sections beyond those the project permits. Within every permitted section, apply this reference's value-first, decision-cost, evidence, and editing rules. When those defaults conflict with the project's PR-body contract, the project contract wins.

---

## Step Pre-A: Resolve the range and base

Two modes:

- **Current-branch mode** (default) — describe HEAD vs the repo's default base.
- **PR mode** — describe a specific PR when the caller passes a PR ref.

For PR mode, fetch metadata first:

```bash
gh pr view <ref> --json baseRefName,headRefOid,url,body,state,isCrossRepository,headRepositoryOwner
```

If `state` is not `OPEN`, report and stop. Use `baseRefName` as `<base>` and `headRefOid` as `<head>`.

For current-branch mode, resolve `<base>` in priority order: `git rev-parse --abbrev-ref origin/HEAD` (strip `origin/`) → `gh repo view --json defaultBranchRef --jq '.defaultBranchRef.name'` → try `main`/`master`/`develop` via `git rev-parse --verify origin/<candidate>`. If none resolve, ask the user. `<head>` is `HEAD`.

**Base remote:** `origin` for current-branch mode and same-repo PRs. For fork PRs, match the PR's base owner/repo against `git remote -v`. If no local remote matches, skip to the `gh` fallback — do not diff against `origin` (wrong base).

```bash
git fetch --no-tags <base-remote> <base>
git fetch --no-tags <base-remote> <head>   # PR mode only: <head> is headRefOid and may not be local
git log  --oneline "<base-remote>/<base>..<head>"
git log  --format=fuller "<base-remote>/<base>..<head>"   # full commit messages for related-reference discovery
git diff           "<base-remote>/<base>...<head>"
```

If the commit list is empty, report "No commits to describe" and stop.

**Fallback** — use `gh pr diff <ref>` and `gh pr view <ref> --json commits` when local git can't reach the refs (fork PR with no matching remote, shallow clone, offline, merge-base on unrelated histories). For GHES that reject SHA fetch but allow `refs/pull/`:

```bash
git fetch --no-tags <base-remote> "refs/pull/<number>/head"
PR_HEAD_SHA=$(awk '/refs\/pull\/[0-9]+\/head/ {print $1; exit}' "$(git rev-parse --git-dir)/FETCH_HEAD")
```

Note in the user-facing summary when the API fallback was used.

---

## Step A: Size the description

**Size by decision cost, not diff shape** — not changed-line count, file extension, or visual surface. A 5-line ranking or deploy change can carry more reviewer uncertainty than a 500-line mechanical rename.

Build a compact internal **scope map** from the **complete oneline commit list and final three-dot diff**. Use oneline subjects for full-range coverage; use the final diff to merge overlaps, discard fix-up-only work, and correct stale subjects; consult the fuller messages only when a subject remains opaque or conflicts with the diff. Group into material outcome clusters (one is fine), name one umbrella outcome that covers them, and identify each cluster's **material claims** — what became possible, fixed, riskier, or which design decision the reviewer must assess. Derive this map from the full range, never from the latest commit, tracker title, branch name, original request, or the story of how the work started — the incident, bug report, or ask that opened the branch is one cluster's origin, not the umbrella, and a description that leads with it while the range delivers peer outcomes has misread the map. The map is not body content: do not expand the body to enumerate clusters the umbrella already covers. **Classify each changed file by runtime purpose, not extension** (markdown/YAML may be inert docs or runtime agent instructions, config, product content, or deploy behavior). Surface claims the diff alone cannot establish; leave the rest implicit.

**Program altitude (multi-PR / series).** After the PR-local map, check whether this PR sits inside a larger program (multi-PR project, stack, series, multi-unit plan). Use only signals already in hand: user prompt/conversation, a known plan path, existing PR body, commit messages, or sibling/series language in context. Do **not** invent a series, and do **not** run a repo-wide open-PR scan solely for this step.

When program context is present, extend the map with: (1) **Program outcome** — end-to-end delivery in one sentence; (2) **This PR's contribution** — the local umbrella; (3) **Neighbors** — prior work (**lead-in**) and/or residual work (**lead-out**), each only when known. The map's order is **program → lead-in (if any) → this contribution → lead-out (if any)**; in the body the opening states this contribution and a short block after it supplies the rest (Step C). Early PRs need lead-out; middle need both; late need lead-in (and say the arc completes when true). Omit prior or next when unknown — never invent either. Program placement the reviewer cannot get from this PR's diff alone is decision cost. When program context is absent, keep the single-PR umbrella only.

- Bad (too local for a middle PR): the opening "Issue-close now revokes the active session on the server." with no placement anywhere in the body.
- Good: that same opening, then a block: "Continues the session-revocation rewrite after refresh-path rejection; multi-device revocation remains follow-on." — the block adds the program and its neighbors, not a second copy of the outcome.
- Early/late: name first-slice + residual, or complete-the-arc + what already landed — same three fields, omit the unknown neighbor.

**Write the finished map down before composing** — after the program-altitude check, so it carries both halves: umbrella; clusters with their claims; program placement or "none" (three or four lines). Step E audits the opening against this written map, not against memory.

> Prefer the shortest description that still lets a reviewer decide — context (including program placement when present), evidence, and residual uncertainty they can't get from the diff, and nothing they can.

Decision cost raises the content floor, not the length ceiling (high-uncertainty *small* diffs get a sharper lead, not an essay). Uncertainty moves a change at most one size row. Fold risk into the narrative unless the PR is already large. Include evidence only when it changes confidence in a material claim. Subtract fix-up commits when sizing. Large PRs need more selectivity, not more content.

| Change profile | Description approach |
|---|---|
| Small + simple (typo, config, dep bump) | 1-2 sentences, no headers. Under ~300 characters. |
| Small + non-trivial (bug fix, behavioral change) | 3-5 sentences. No headers unless two distinct concerns. User-visible before/after when the bug was observable. |
| Medium feature or refactor | Opening (one or two sentences), then only sections that each answer one remaining reviewer question; call out design decisions. |
| Large or architecturally significant | Same, plus 3-5 design-decision callouts and a brief test summary. Target ~100 lines, cap ~150. Many mechanisms → Summary table, not an H3 per mechanism. |
| Performance improvement | Before/after measurements as a markdown table. |

A project PR-body contract sets the structural floor; this table sizes the content within it, never against it. Small + simple: the value-led sentence is the whole description.

**Medium and large: a reader can stop anywhere.** The opening is one or two sentences carrying one idea — what is now different and the gap or failure it replaces — so a reviewer who stops there knows what the PR does. Program or series context, when present, is a short additive block after it (Step C), never part of the opening's sentence. Each further section exists to answer one remaining reviewer question; a bullet is one clause, with reasoning under design decisions rather than inside the bullet. Deliberately deferred scope is stated once, not woven into the opening. Which sections and devices appear is decided by what the reviewer still cannot get from the diff (Visual aids, Step C) — this is not a section list.

---

## Step B: Compose the title

`type: description` or `type(scope): description`. Type by intent using the same `fix:`/`feat:` default as the skill's Step 2. Scope (optional): narrowest useful label. Description: from the scope map's umbrella outcome, not one cluster or mechanism; with program context, the title may name this PR's contribution under the program without restating the whole series — it must not make another material outcome sound incidental. Imperative, lowercase, under 72 chars, no trailing period. Match recent-commit conventions. **Never use `!` or `BREAKING CHANGE:` without explicit user confirmation.**

---

## Step B1: Resolve related work references

Before writing the body, gather candidate work-item references from the user prompt, caller handoff, branch name, full commit messages, existing PR body, PR template, plan/debug notes, and visible URLs or IDs in context. Preserve existing related references when rewriting a PR unless the user asks to remove them.

This step owns **tracker** close-vs-link semantics. Sibling PR / series narrative belongs in Step A's program altitude, not here — a sibling PR number already in context may still appear as a non-closing related reference when useful.

Classify each candidate as:

- **closing reference** — the PR fully resolves the item and the tracker's closing syntax is known.
- **non-closing reference** — related, partial, investigative, follow-up, validation-only, or tracker semantics unknown.
- **uncertain** — tracked bug/incident/investigation is clear but ID or close-vs-link intent is missing. Ask (interactive) or use non-closing / omit (non-interactive); never invent a close.

Do not invent a closing keyword. Magic words are workflow actions, not decoration. If ambiguous, neutral related reference or omit — do not scatter the ID through the summary.

Do not put a non-closing reference next to close/fix/resolve/address/report wording in prose. Write behavioral scope in one sentence; put the tracker ID separately. Use the table's non-closing reference labels exactly; do not substitute synonyms like `Refs`, `References`, or `Toward` unless the project's documented tracker convention requires one. For a non-closing reference, the tracker ID appears only in that related-reference sentence or block, never in the summary/opening/body prose.

- Bad: "closing one corruption path from #123"
- Bad: "This addresses the retry-related corruption path reported in #123."
- Good: "This covers the duplicate-row retry path; concurrent cancellation remains follow-up work."
- Good: "Related: #123"

| Tracker | Closing reference | Non-closing reference | Notes |
|---|---|---|---|
| GitHub Issues | `Fixes #123`; cross-repo: `Fixes owner/repo#123` | `Related: #123`; cross-repo: `Related: owner/repo#123` | Closing keywords: `close(s/d)`, `fix(es/ed)`, `resolve(s/d)`. Use closing only when the PR targets the default branch and truly resolves the issue. Repeat the keyword per closing issue. |
| Linear | `Fixes ENG-123` | `Related to ENG-123` | Magic words in the PR description, not a PR comment. Multiple issues may share one magic word when intent matches, e.g. `Fixes ENG-123, DES-5 and ENG-256`. |
| Other trackers | Project-documented closing keyword only when known. | Full URL or tracker ID under `Related`. | Never guess a closing action. |

Closing references may live in the opening when the body is tiny. Non-closing references always get their own sentence or `## Related` block before validation/evidence. One true close can be a single line (`Fixes ENG-123.`); mixed items separate closing and non-closing bullets.

---

## Step B2: Judge new concepts

Decide whether the change introduces a concept (pattern, technique, library, domain idea) a reader of this repo would plausibly not know. Skip entirely when the skill's concept teaching gate is off (SKILL.md Step 4).

**Gather candidates from the Pre-A diff first** (first real use of a dependency, a technique the diff introduces, a domain idea the code now encodes). Most PRs surface none — stop; absence is the common case.

**Check each candidate against the base ref, never the working tree** (the working tree contains this PR's own code):

```bash
git grep -il -e "<term>" "<base-remote>/<base>" | head -5
```

One call per candidate (cap two). Empty output → absent from the base. Teachable only when new *and* transferable. Never teach: established patterns, ordinary refactors/renames/dep bumps, project-internal plumbing. When in doubt, omit. On the `gh`-fallback path, judge from diff context alone and lean conservative.

- Bad: teaching "dependency injection" for one new constructor arg in a DI-heavy codebase.
- Good: teaching infinite scroll on the PR that first replaces pagination with it.

**Compose** under `## New concepts` (Step C places it), at most 2 concepts (~10-25 lines each): (1) what it is in plain words, (2) why here vs the obvious alternative, (3) one example from this PR, (4) when not to use it. Prefer mermaid for architecture, a short code block for mechanics, a table for trade-offs. Dense is good; long is not. Never hand-draw box-drawing diagrams. Additive to Step A's sizing — does not count against size rows.

Preserve an existing `## New concepts` section and explainer-doc link verbatim on rewrite (same rule as `## Demo`) unless the user's focus asks to refresh. Description-only/update never write repo files. **Archival** when Step 5 confirms apply and `pr_teaching_archive` is on: content → `<root>/explainers/` per SKILL.md Step 5.

---

## Step C: Assemble the body

When a project PR-body contract supplies headings or order, preserve that structure and place the applicable elements below within the sections it permits. Otherwise: opening → body sections that earn their keep → related references when they need their own block → test plan if non-obvious → session-settled provenance when a labeled plan is in hand → New concepts section when Step B2 produced one → evidence block if one exists → branding when Step D calls for it.

When the project PR-body contract supplies a heading or location for the opening, place it there without inventing or renaming a heading. Otherwise, the opening goes under `## Summary` if the body uses any `##` headings; bare paragraph otherwise. No orphaned opening above the first heading. The opening carries one idea — this PR's outcome; it is the map's "this contribution" slot. When program context is present, a short block immediately after it adds only what the opening cannot: the program outcome and the known lead-in and lead-out. It never restates the outcome, and the program is never folded into the opening's sentence.

**Session-settled provenance:** when a plan is already in hand (caller path or conversation) with `session-settled:`-labeled KTDs, one static sentence naming settled decisions and classes (e.g. "Session-settled decisions carried from planning: X (user-directed, over Y); Z (user-approved)."). Add proceed-under-conflict clauses only when the caller flagged them. Never an outstanding-items ledger; never hunt for plans when none is in hand.

**Evidence:** preserve existing `## Demo` / `## Screenshots` unless focus asks to refresh. Splice caller-passed capture as `## Demo`. Place before the badge. Never label test output as "Demo" or "Screenshots." SKILL.md Step 4 owns whether to include validation notes vs skip.

**Visual aids:** diagram or table when faster than prose (flows, trade-offs, a before/after comparison when observable behavior changed); a navigation hint (which file to start in, or the small load-bearing hunk a reviewer would otherwise miss) only when the reviewer would start in the wrong place — never a list of changed files, which the diff already shows; skip all of these for simple/rename/dep-bump. Content pattern decides, never size or file count. Prose wins on conflict. **GitHub:** never prefix list items with `#` (auto-links as issues); use `org/repo#123` or full URL for real refs.

---

## Step D: Generic Compound Engineering branding

For a **new PR body**, append the following only when the resolved branding gate is on; otherwise omit it.

```markdown
---

[![Compound Engineering](https://img.shields.io/badge/Built_with-Compound_Engineering-6366f1)](https://github.com/EveryInc/compound-engineering-plugin)
```

Do not add model or harness attribution **to this branding block**. If the project's PR-body contract requires model/harness disclosure, fill *that* section per the project contract (see "Project PR-body contract").

For an **existing PR body**, preserve an existing branding block verbatim (including legacy model/harness badges). Never add one when absent, and never refresh, normalize, or remove it unless the user explicitly asks to remove or replace that exact content. Branding alone never creates rewrite intent.

---

## Step E: Pre-apply coverage audit

Before returning the title and body, check against the scope map and material claims from Step A and revise if wrong:

- Does the title express the umbrella outcome rather than one cluster or mechanism?
- Does the opening express the same umbrella — every peer outcome the map names, at parity — rather than the cluster the work started from? If the map has three peer outcomes and the opening leads with one and mentions the others as "also" or "comes with", rewrite it from the map.
- Does the opening carry one idea in one or two sentences, and could a reviewer stop there and know what the PR does? If it also carries program context, deferrals, or implementation detail the diff already supplies, move those out; mechanism that is itself the outcome (an atomicity, protocol, or API guarantee) stays in the opening, per the prose rule above.
- Does any section, table, or hint restate what the Files-changed tab or diff already shows? Cut it. Does any section answer no remaining reviewer question? Cut it.
- Is every material outcome represented by the umbrella framing or body, or intentionally omitted because it is supporting-only?
- Is every claim the diff can't establish present — and any claim the diff *does* show restated needlessly?
- Was program altitude actually checked (the map says "none" or names the program)? When program context was present: does the lead place this PR on the arc (program + this contribution, with lead-in and/or lead-out when known)? When program context was absent: does the body invent a multi-PR series? If so, cut it.
- Does any sentence use domain jargon that is not load-bearing for its claim? If so, rewrite in plain framing (keep jargon where it *is* the claim).
- Is decision-changing evidence a stated result (not unexplained "tests passed"), with demonstrated results distinct from assumptions and mixed/negative outcomes?
- Can any sentence or section of the *description* be cut without lowering reviewer confidence? If so, cut it, except for headings, fields, checklists, or boilerplate the project's PR-body contract requires. Retain Step D branding when enabled and the session-settled provenance sentence when Step C included one — both are intentional, not fluff.
