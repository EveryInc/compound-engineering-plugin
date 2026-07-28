# PR Description Writing

## The core principle

The diff is already visible on GitHub. The description exists to explain what the diff cannot show: what was impossible before and is now possible, what was broken and is now fixed, what shape changed. Cut any sentence a reader could reconstruct from the diff itself.

- Bad: "Adds `evidence-decider.ts`, modifies `ce-commit-push-pr/SKILL.md` to call it, and updates two test files."
- Good: "Evidence capture now decides automatically whether a change has observable behavior. CLI tools and libraries are now eligible alongside web UIs."

If the lead sentence describes what was moved, renamed, or added rather than what's now possible or fixed, rewrite it. This applies to every section, not just the opening — restating the diff is the failure mode this skill exists to prevent.

For user-facing bugs, run an extra before/after pass before writing the mechanism: name what the user would have seen before and what they now see instead. Only then mention the technical cause or fix, and only if it helps the reviewer understand risk. A lead like "Playback hooks now ignore late async responses" is still too mechanical if the visible bug was "old videos, thumbnails, or errors could appear after switching selections."

## Project PR-body contract

Before composing, resolve PR-body requirements from the project's active instructions and conventions already in context, then check the standard repository PR-template locations (the repository root, `docs/`, `.github/`, and `.github/PULL_REQUEST_TEMPLATE/`) and any contribution guidance they reference. Required headings, fields, order, checklists, and boilerplate define the structural contract. Treat a template as a minimum unless the project explicitly requires an exact/template-only body or forbids additions; only then add no sections beyond those the project permits. Within every permitted section, apply this reference's value-first, decision-cost, evidence, and editing rules. When those defaults conflict with the project's PR-body contract, the project contract wins.

---

## Step Pre-A: Resolve the range and base

Two modes:

- **Current-branch mode** (default) — describe HEAD vs the repo's default base.
- **PR mode** — describe a specific PR. Triggered when the caller passes a PR ref.

For PR mode, fetch metadata first:

```bash
gh pr view <ref> --json baseRefName,headRefOid,url,body,state,isCrossRepository,headRepositoryOwner
```

If `state` is not `OPEN`, report and stop — do not invent a description. Use `baseRefName` as `<base>` and `headRefOid` as `<head>`.

For current-branch mode, resolve `<base>` in priority order: caller-supplied (`base:<ref>`) → `git rev-parse --abbrev-ref origin/HEAD` (strip `origin/`) → `gh repo view --json defaultBranchRef --jq '.defaultBranchRef.name'` → try `main`/`master`/`develop` via `git rev-parse --verify origin/<candidate>`. If none resolve, ask the user. `<head>` is `HEAD`.

**Base remote:** `origin` for current-branch mode and same-repo PRs. For fork PRs, match the PR's base owner/repo against `git remote -v`. If no local remote matches, skip to the `gh` fallback — do not diff against `origin` (wrong base).

```bash
git fetch --no-tags <base-remote> <base>
git fetch --no-tags <base-remote> <head>   # PR mode only: <head> is headRefOid and may not be local
git log  --oneline "<base-remote>/<base>..<head>"
git log  --format=fuller "<base-remote>/<base>..<head>"   # full commit messages for related-reference discovery
git diff           "<base-remote>/<base>...<head>"
```

If the commit list is empty, report "No commits to describe" and stop.

**Fallback** — use `gh pr diff <ref>` and `gh pr view <ref> --json commits` when local git can't reach the refs (fork PR with no matching remote, shallow clone, offline, merge-base on unrelated histories). For GHES configurations that reject SHA fetch but allow `refs/pull/`:

```bash
git fetch --no-tags <base-remote> "refs/pull/<number>/head"
PR_HEAD_SHA=$(awk '/refs\/pull\/[0-9]+\/head/ {print $1; exit}' "$(git rev-parse --git-dir)/FETCH_HEAD")
```

Note in the user-facing summary when the API fallback was used.

---

## Step A: Size the description

**Size by decision cost, not diff shape.** What a description must cover is set by how much a reviewer cannot establish from the diff alone — not changed-line count, file extension, or visual surface. A 5-line edit to ranking logic or a deploy manifest can carry more reviewer uncertainty than a 500-line mechanical rename.

Before composing anything, build a compact internal **scope map** from the **complete oneline commit list and final three-dot diff**. Use the oneline subjects for full-range coverage; use the final diff to merge overlaps, discard fix-up-only work, and correct stale or misleading subjects; consult the fuller messages only when a subject remains opaque or conflicts with the diff. Group the remaining work into material outcome clusters (one is fine), name one umbrella outcome that covers them, and identify each cluster's **material claims** — what became possible, what was fixed, what risk changed, or what design decision the reviewer must assess. Derive this map from the full range, never from the latest commit, tracker title, branch name, or original request. The map is internal: do not expand the body to enumerate clusters the umbrella already covers. **Classify each changed file by runtime purpose, not extension** when you judge this: markdown or YAML may be inert docs and examples, or runtime agent instructions, configuration, product content, or production deployment behavior — a "docs-only" diff that is really runtime instruction carries real claims and is not auto-sized to one line.

Surface the material claims the diff alone cannot establish; let the rest stay implicit.

Decision cost sets **what you surface, not how long you run** — it raises the content floor, not the length ceiling. A high-uncertainty *small* diff earns a sharper lead and at most a one-line validation caveat, not a multi-section essay; reviewer uncertainty moves a change at most one size row, and only when the diff genuinely can't carry the claim. Fold risk and residual uncertainty into the narrative rather than spawning dedicated `##` sections unless the PR is already large. The one-rule replacement for "shorter is safer":

> Prefer the shortest description that still lets a reviewer decide — carrying the context, evidence, and residual uncertainty they can't get from the diff, and nothing they can.

Evidence is broader than screenshots and passing tests — benchmarks, API captures, migration/rollback exercises, logs, compatibility matrices, security analysis, evals, manual probes, and rollout results all count — but include a result only when it changes confidence in a material claim, never to look thorough.

Subtract fix-up commits (review fixes, lint, rebase resolutions) when sizing — they're invisible to the reader. Large PRs need more selectivity, not more content. The table below is the calibration; the rules above move a change at most one row.

| Change profile | Description approach |
|---|---|
| Small + simple (typo, config, dep bump) | 1-2 sentences, no headers. Under ~300 characters. |
| Small + non-trivial (bugfix, behavioral change) | 3-5 sentences. No headers unless two distinct concerns. |
| Medium feature or refactor | Narrative frame, then what changed and why. Call out design decisions. |
| Large or architecturally significant | Narrative frame + 3-5 design-decision callouts + brief test summary. Target ~100 lines, cap ~150. For PRs with many mechanisms, use a Summary table; do not create an H3 per mechanism. |
| Performance improvement | Include before/after measurements as a markdown table. |

A project PR-body contract sets the structural floor; this table sizes the content within it, never against it.

For small + simple PRs, the value-led sentence is the entire description.
For small + non-trivial bugfixes, the 3-5 sentence target still needs a user-visible before/after lead when the bug affected UI, CLI output, workflow output, or any other user-observable behavior. Concision is not a reason to skip the visible symptom.

---

## Step B: Compose the title

`type: description` or `type(scope): description`.

- Type by intent, not file extension. When `fix` and `feat` both seem to fit, default to `fix` — adding code to remedy missing behavior is `fix`. Reserve `feat` for capabilities the user could not previously accomplish. Use `refactor`/`docs`/`chore`/`perf`/`test` when more precise.
- Scope (optional): narrowest useful label. Omit when no single label adds clarity.
- Description: derive it from the scope map's umbrella outcome, not one outcome cluster or implementation mechanism. It need not enumerate every cluster, but it must not make another material outcome sound incidental. Keep it imperative, lowercase, under 72 chars, with no trailing period.
- Match repo conventions visible in recent commits.
- **Never use `!` or `BREAKING CHANGE:` without explicit user confirmation** — they trigger automated major-version bumps.

---

## Step B1: Resolve related work references

Before writing the body, make an explicit related-reference pass. Gather candidate work-item references from the user prompt, caller handoff, branch name, full commit messages, existing PR body, PR template, plan/debug notes, and visible URLs or IDs already in context. Preserve existing related references when rewriting a PR unless the user asks to remove them.

Classify each candidate as:

- **closing reference** — the PR fully resolves the item and the tracker's closing syntax is known.
- **non-closing reference** — the PR is related, partial, investigative, follow-up, validation-only, or the tracker semantics are unknown.
- **uncertain** — the change clearly came from a tracked bug, incident, performance investigation, alert, or log trace, but the exact ID/link or close-vs-link intent is missing. Ask the user for the reference or intent; in non-interactive flows, use a non-closing reference or omit rather than pretending to close it.

Do not invent a closing keyword. Magic words are workflow actions, not decoration. If the candidate is ambiguous, put a neutral related reference in the related-reference sentence/block or omit it; do not scatter the ID through the summary.

Do not put a non-closing reference next to close/fix/resolve/address/report wording in prose. For partial or related work, write the behavioral scope in one sentence and put the tracker ID separately. Use the table's non-closing reference labels exactly; do not substitute synonyms like `Refs`, `References`, or `Toward` unless the project's documented tracker convention requires one of those labels. For a non-closing reference, the tracker ID appears only in that related-reference sentence or block, never in the summary/opening/body prose. This avoids both accidental automation and reviewer confusion.

- Bad: "closing one corruption path from #123"
- Bad: "partial fix for #123"
- Bad: "This addresses the retry-related corruption path reported in #123."
- Good: "This covers the duplicate-row retry path; concurrent cancellation remains follow-up work."
- Good: "Related: #123"

Common syntax examples:

| Tracker | Closing reference | Non-closing reference | Notes |
|---|---|---|---|
| GitHub Issues | `Fixes #123`; cross-repo: `Fixes owner/repo#123` | `Related: #123`; cross-repo: `Related: owner/repo#123` | Closing keywords are `close(s/d)`, `fix(es/ed)`, and `resolve(s/d)`. Use closing syntax only when the PR targets the default branch and truly resolves the issue; otherwise use a non-closing reference. Repeat the keyword for multiple closing issues. |
| Linear | `Fixes ENG-123` | `Related to ENG-123` | Linear supports closing and non-closing magic words. Put magic words in the PR description, not a PR comment. Multiple issues can follow one magic word when they share the same intent, e.g. `Fixes ENG-123, DES-5 and ENG-256`. |
| Other trackers | Use the project's documented closing keyword only when known. | Prefer a full URL or tracker ID under `Related`. | Some trackers parse commit messages, PR descriptions, or both. Follow project docs or tracker integration docs when present; otherwise never guess a closing action. |

Closing references can live in the opening paragraph when the body is tiny. Non-closing references always get their own sentence or `## Related` block before validation/evidence. For one item that truly closes, a single line like `Fixes ENG-123.` can be enough; for mixed items, separate closing and non-closing bullets.

---

## Step B2: Judge new concepts

Decide whether the change introduces a concept — a pattern, technique, library, or domain idea — that a reader of this repo would plausibly not know. Skip this step entirely when the skill's concept teaching gate is off (SKILL.md Step 4).

**Gather candidates from the diff first.** Read the Pre-A diff for concept-shaped novelty: a dependency put to first real use, a technique the diff visibly introduces (debouncing, optimistic locking, infinite scroll, a state machine), or a domain idea the code now encodes. Most PRs surface no candidate — stop here and compose no section; absence is the common case, and this path costs zero extra tool calls.

**Check each candidate against the base ref, never the working tree.** The working tree contains this PR's own code, so grepping it finds the concept you just added and wrongly concludes it is already established. Check the base instead (Pre-A already resolved it):

```bash
git grep -il -e "<term>" "<base-remote>/<base>" | head -5
```

Run one call per candidate — candidates cap at two, so the cost is trivial — and read establishment from the output: empty output means the concept is absent from the base.

A candidate is teachable only when it is both new to this codebase in this PR and transferable beyond it. Never teach: routine use of an already-established repo pattern, ordinary refactors, renames, dependency bumps, or project-internal plumbing with no transferable idea. When in doubt, omit — a missing section costs little; a patronizing one trains readers to skip the feature.

In the `gh`-fallback path (fork PR, no local base refs), judge from diff context alone and lean conservative: compose the section only when the concept is unmistakably new.

- Bad: teaching "dependency injection" because a PR added one constructor argument in a codebase full of DI.
- Good: teaching infinite scroll on the PR that replaces pagination with it for the first time.

**Compose the section** under the heading `## New concepts` (Step C places it) for at most 2 concepts — when more qualify, teach the most load-bearing and name the rest in one sentence. Per concept, ~10-25 lines covering:

1. **What it is** — the concept in plain words, no jargon dependency.
2. **Why here** — why it was chosen over the obvious alternative this PR could have used.
3. **One example from this PR** — how the shipped behavior exercises the concept.
4. **When not to use it** — one sentence on the boundary.

Format by material:

| Material | Show |
|----------|------|
| Architecture, relationships, boundaries | Fenced `mermaid` block (`flowchart TB`) |
| Code behavior, a diff's mechanics | Fenced code block with a one-line *why* comment above |
| A comparison or trade-off | Pipe-delimited table, prose verdict underneath |

Lead with the point, then the mechanism, then the caveat. Dense is good; long is not. Never hand-draw box-drawing/ASCII diagrams — mermaid or prose. The section is additive to Step A's sizing: a small PR that introduces a heavy concept still gets the section, and the section never counts against the base description's size rows.

**Rewrite preservation:** when rewriting an existing PR body, preserve an existing `## New concepts` section and any explainer-doc link verbatim (same rule as `## Demo`) unless the user's focus asks to refresh the concepts. Description-only and description-update runs never write repo files.

**Archival hook:** when the skill's Step 5 confirms the apply and `pr_teaching_archive` is on (full workflow only), the teaching content is also written to `<root>/explainers/` and linked from the section — the commit-and-push transition and doc frontmatter live in SKILL.md Step 5.

---

## Step C: Assemble the body

When a project PR-body contract supplies headings or order, preserve that structure and place the applicable elements below within the sections it permits. Otherwise, assemble in order: opening → body sections that earn their keep → related references when they need their own block → test plan if non-obvious → session-settled provenance sentence when a labeled plan is in hand → New concepts section when Step B2 produced one → evidence block if one exists → branding block when Step D calls for one.

When the project PR-body contract supplies a heading or location for the opening, place it there without inventing or renaming a heading. Otherwise, the opening goes under `## Summary` if the body uses any `##` headings; bare paragraph otherwise. No orphaned opening paragraphs above the first heading.

**Session-settled provenance:** when a plan for this change is in hand — a path passed by the caller (e.g., a pipeline threads it) or a plan already known from the conversation — and that plan contains `session-settled:`-labeled KTDs, include one static sentence naming the settled decisions and their classes, e.g. "Session-settled decisions carried from planning: X (user-directed, over Y); Z (user-approved)." Only when the caller's run flagged proceed-under-conflict notes, add a clause noting each such decision proceeded under a flagged concern. This is a point-in-time description element: never an outstanding-items ledger, never updated after the PR opens, no checklist. When no plan is in hand or it has no labeled KTDs, omit the element entirely — standalone runs without a plan simply never fire it; do not hunt for plans.

**Evidence handling:** preserve any existing `## Demo` or `## Screenshots` block verbatim unless the user's focus asks to refresh it. If the caller passed a freshly captured URL or path, splice as `## Demo`. Otherwise omit. Place before the badge. Never label test output as "Demo" or "Screenshots."

**Visual aids:** reach for a diagram or table when it conveys the change faster than prose — relationships, flows, state transitions, sequences, trade-offs, before/after data, or any structure prose would have to enumerate. Mermaid and markdown tables cover most shapes; don't be limited to a particular type if a different one fits the change better. Place inline at the point of relevance. Skip for simple, prose-clear, or rename/dep-bump changes. Prose is authoritative when it conflicts with a visual.

**GitHub gotchas:** never prefix list items with `#` (GitHub auto-links `#1` as an issue ref). Use `org/repo#123` or full URL for actual references.

---

## Step D: Generic Compound Engineering branding

For a **new PR body**, append the following block after a `---` rule only when the resolved branding gate is on. Otherwise omit it.

```markdown
---

[![Compound Engineering](https://img.shields.io/badge/Built_with-Compound_Engineering-6366f1)](https://github.com/EveryInc/compound-engineering-plugin)
```

Do not add model or harness attribution **to this branding block** — no model, reasoning, or harness badge images in the footer. A PR may span multiple agents, models, harnesses, and review passes; naming one in the badge overstates its role, while listing every participant makes the footer noisy without giving reviewers useful provenance. This scopes the branding footer only: when a repository's PR-body contract (its PR template or contribution guide) requires model, reasoning, or harness disclosure, fill that section as specified — the project contract governs (see "Project PR-body contract").

For an **existing PR body**, preserve an existing branding block verbatim, including legacy model or harness badges. Never add one when absent, and never refresh, normalize, or remove it unless the user explicitly asks to remove or replace that exact content. The branding signal controls new-PR composition only; omitting it does not silently delete existing content.

Branding alone is never a reason to rewrite a PR description. If branding is the only difference between the existing and proposed bodies and the user did not explicitly ask for that change, keep the existing body and do not apply an update.

---

## Step E: Pre-apply coverage audit

Before returning the title and body, check them against the scope map and material claims from Step A and revise if any answer is wrong:

- Does the title express the umbrella outcome rather than one cluster or implementation mechanism?
- Is every material outcome represented by the umbrella framing or body, or intentionally omitted because it is supporting-only?
- Is every claim the diff can't establish present — and is any claim the diff *does* show restated needlessly?
- Is decision-changing evidence stated as a result rather than collapsed into an unexplained "tests passed", with demonstrated results kept distinct from assumptions and from mixed or negative outcomes?
- Can any sentence or section of the *description* be cut without lowering reviewer confidence? If so, cut it, except for headings, fields, checklists, or boilerplate the project's PR-body contract requires. For a new PR with branding enabled, retain the Step D footer; it is intentional attribution rather than descriptive content. Likewise retain the session-settled provenance sentence when Step C included one; it carries decision provenance the diff cannot show.
