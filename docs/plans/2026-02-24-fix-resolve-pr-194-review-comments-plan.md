---
title: "fix: Resolve PR #194 review comments"
type: fix
status: completed
date: 2026-02-24
pr: 194
origin: PR review by kieranklaassen (2026-02-24)
---

# Resolve PR #194 Review Comments

## Overview

PR #194 adds a user research workflow (3 skills, 1 command, 1 agent) to the compound-engineering plugin. A thorough code review identified 11 items across P1/P2/P3 priorities. This plan addresses each item.

**Important context:** The local `main` branch was at `v2.34.0` (fork's main), but `upstream/main` (`EveryInc/compound-engineering-plugin`) has advanced to `v2.35.2` with 25+ commits. The review's P1-1 about the stale branch is **correct** — the PR branch needs rebasing onto `upstream/main`.

### Features on upstream/main that would be regressed without rebase

- `origin:` frontmatter field in plan templates (v2.35.2)
- Detailed brainstorm carry-forward in plan.md steps 1-7 (v2.35.2)
- `Sources` sections linking plans to brainstorms (v2.35.2)
- `System-Wide Impact` sections in MORE and A LOT templates (v2.35.1)
- Qualified `compound-engineering:workflow:spec-flow-analyzer` namespace (v2.35.0 fix)
- Kiro CLI target provider (v0.9.0)
- OpenCode commands merge (v0.8.0)
- Removed `docs/reports` and `docs/decisions` directories (v0.9.1)

### Conflict-prone files during rebase

| File | Reason |
|------|--------|
| `plugins/compound-engineering/commands/workflows/plan.md` | PR adds 3 lines; upstream rewrote brainstorm sections, added origin/sources/system-wide-impact |
| `plugins/compound-engineering/.claude-plugin/plugin.json` | Version `2.35.0` vs `2.35.2`, description string (component counts differ) |
| `.claude-plugin/marketplace.json` | Same version/description conflicts |
| `plugins/compound-engineering/CHANGELOG.md` | Both branches added entries |
| `plugins/compound-engineering/README.md` | Component count differences |

## Acceptance Criteria

- [x] Branch rebased onto `upstream/main` with conflicts resolved
- [x] Version bumped to `2.36.0` (minor: new functionality on top of v2.35.2)
- [x] Component counts accurate across plugin.json, marketplace.json, README.md
- [x] `.gitignore` pattern catches all transcript file types, not just `.md`
- [x] `.claude/settings.json` removed from tracking and gitignored
- [x] Anonymization instructions positioned before insight extraction in `transcript-insights`
- [x] Privacy checklist items added to both `transcript-insights` and `persona-builder`
- [x] `research-plan/SKILL.md` uses assertive MUST NOT language for PII
- [x] All downstream references to old `*.md` gitignore pattern updated
- [x] Plan docs for the research workflow marked as `status: completed`
- [x] JSON files valid (`jq .` passes)

---

## Implementation Tasks

### Task 0: Rebase onto upstream/main (P1-1)

**This must be done first.** All other tasks apply on top of the rebased branch.

**Steps:**
```bash
# Fetch latest upstream
git fetch upstream

# Rebase PR branch onto upstream/main
git rebase upstream/main
```

**Conflict resolution strategy for `plan.md`:**
- The PR adds 3 lines (user-research-analyst in Step 1, user research bullet in Step 1.6, "What to look for" bullet)
- Upstream rewrote the brainstorm carry-forward section (Steps 1-7 → more detailed), added `origin:` frontmatter, `Sources`/`System-Wide Impact` sections, and qualified the `spec-flow-analyzer` namespace
- **Resolution:** Take upstream's version as the base, then re-apply the 3 user-research additions on top. Do NOT overwrite upstream's brainstorm detail, origin field, or system-wide impact sections.

**Conflict resolution for `plugin.json` and `marketplace.json`:**
- Take upstream's version (`2.35.2`) as base, then bump to `2.36.0`
- Recount components after rebase: upstream has 29 agents, 22 commands, 19 skills. PR adds 1 agent, 1 command, 3 skills → final should be 30 agents, 23 commands, 22 skills
- Update description strings to match actual counts

**Conflict resolution for `CHANGELOG.md` and `README.md`:**
- Keep upstream's entries, add PR's new entries on top
- Verify README component counts match the recounted totals

**Conflict resolution for `.gitignore`:**
- Upstream added `todos/` entry. PR adds transcript pattern. Keep both.

### Task 1: Fix `.gitignore` transcript pattern (P1-2)

**File:** `.gitignore`

Change:
```gitignore
# Research data - transcripts contain raw interview data with PII
docs/research/transcripts/*.md
```

To:
```gitignore
# Research data - transcripts contain raw interview data with PII
docs/research/transcripts/*
!docs/research/transcripts/.gitkeep
```

**Why:** The `*.md` pattern only ignores markdown transcripts. Users may save transcripts as `.txt`, `.json`, `.csv`, or `.docx` (common exports from Otter.ai, Rev, etc.), and those would leak PII into git.

**Update downstream references** that mention the old `*.md` pattern:

1. `plugins/compound-engineering/skills/transcript-insights/SKILL.md` (~line 298) — update reference from `docs/research/transcripts/*.md` to `docs/research/transcripts/`
2. `docs/solutions/integration-issues/adding-optional-workflow-phases-with-graceful-degradation.md` (~lines 70, 174) — update pattern references

### Task 2: Remove `.claude/settings.json` from tracking (P2-3)

**Steps:**
1. `git rm --cached .claude/settings.json` — removes from git index, keeps on disk
2. Add `.claude/settings.json` to `.gitignore`

This file contains personal dev config (`enabledPlugins` flag) that forces plugin enablement on all repo clones. Claude Code creates this file locally when users install plugins — it should not be committed.

**No contributor impact:** Developers set up plugins via `claude /plugin install`, which creates this file automatically.

### Task 3: Reposition anonymization in `transcript-insights` (P2-4)

**File:** `plugins/compound-engineering/skills/transcript-insights/SKILL.md`

The Privacy Note at the bottom (line 289+) contains detailed anonymization instructions, but they appear AFTER the processing steps. The AI processes the transcript top-to-bottom and may extract PII-containing quotes before encountering the privacy instructions.

**Changes:**
1. Add a new **Step 4.0: Anonymization During Processing** before Step 4a, containing:
   ```markdown
   ### Step 4.0: Anonymization During Processing

   Before extracting insights, apply these transformations to ALL output:

   - Assign anonymized participant IDs (user-001, user-002, etc.)
   - Replace real names with anonymized IDs in all quotes and references
   - Replace company names with generic descriptors (e.g., "their company", "a competitor")
   - Strip identifying details from the `source_transcript` filename field
   - Quotes must be exact from the transcript, but with PII replaced inline

   If the transcript already uses anonymized IDs (matching pattern `user-NNN`), note that anonymization is already complete and proceed.
   ```

2. Reduce the existing Privacy Note at the bottom to a cross-reference:
   ```markdown
   ## Privacy

   See Step 4.0 for anonymization requirements. Transcripts in `docs/research/transcripts/` contain raw interview data with PII and MUST NOT be committed to version control.
   ```

3. Add to the Human Review Checklist (or create one if missing):
   ```markdown
   - [ ] No real names, email addresses, or company names in output
   - [ ] All participant references use anonymized IDs (user-NNN)
   ```

**Design decision:** This is output-time anonymization, not source-modifying. The raw transcript stays intact in `docs/research/transcripts/`; the derived snapshot is anonymized. This preserves the original data for re-processing.

### Task 4: Add privacy verification to `persona-builder` (P2-4)

**File:** `plugins/compound-engineering/skills/persona-builder/SKILL.md`

Persona-builder consumes already-anonymized interview snapshots, NOT raw transcripts. It needs a verification step, not a full anonymization pass.

**Add to the existing Human Review Checklist** (lines 203-211):
```markdown
- [ ] All source interviews use anonymized participant IDs (no real names)
- [ ] No real names, email addresses, or company names appear in persona
```

### Task 5: Fix stale privacy language in `research-plan` (P2-5)

**File:** `plugins/compound-engineering/skills/research-plan/SKILL.md` (line 221-223)

Change:
```markdown
Consider adding `docs/research/transcripts/` to `.gitignore` if transcripts
contain personally identifiable information. Research plans and processed
insights (with anonymized participant IDs) are generally safe to commit.
```

To:
```markdown
Transcripts in `docs/research/transcripts/` contain raw interview data with PII
and MUST NOT be committed to version control. The `.gitignore` already excludes
this directory. Research plans and processed insights (with anonymized
participant IDs) are safe to commit.
```

### Task 6: Update plan docs status (P3-11)

**File:** `docs/plans/2026-02-11-feat-user-research-workflow-plan.md`

Add `status: completed` to the YAML frontmatter (it currently has no status field).

**File:** `docs/plans/2026-02-13-fix-research-process-first-action-plan.md`

Add `status: completed` to the YAML frontmatter (the fix was shipped in commit `47610ea`).

---

## P3 Items — Deferred

These are valid observations but non-blocking for merge. Document as future work:

| Item | Reason to Defer |
|------|----------------|
| P3-6: Headless/batch mode | Future work — primary v1 use case is human-driven |
| P3-7: Extract output templates to reference files | Optimization — skills work fine as-is |
| P3-8: Trim discovery playbook (414 lines) | Worth doing but separate PR to avoid scope creep |
| P3-9: Simplify persona merge spec | Works correctly, can simplify after real-world usage data |
| P3-10: Simplify agent search strategy | Works correctly, can simplify after real-world usage data |

---

## Execution Order

```
0.  git fetch upstream                         (Task 0 — rebase first)
    git rebase upstream/main                   (resolve conflicts per strategy above)
1.  Bump version to 2.36.0 in plugin.json + marketplace.json
2.  Recount components, update description strings
3.  git rm --cached .claude/settings.json      (Task 2)
4.  Edit .gitignore                            (Tasks 1 + 2)
5.  Edit transcript-insights/SKILL.md          (Task 3)
6.  Edit persona-builder/SKILL.md              (Task 4)
7.  Edit research-plan/SKILL.md                (Task 5)
8.  Update downstream pattern references       (Task 1 follow-up)
9.  Update plan doc frontmatter                (Task 6)
10. Update CHANGELOG.md with v2.36.0 entry
11. Validate JSON: jq . on plugin.json + marketplace.json
12. Verify component counts still match
13. Commit all changes, force-push branch
```

## References

- PR #194: https://github.com/EveryInc/compound-engineering-plugin/pull/194
- Solution doc: `docs/solutions/integration-issues/adding-optional-workflow-phases-with-graceful-degradation.md`
- Solution doc: `docs/solutions/integration-issues/workflow-skill-transcript-input-mismatch.md`
- Plugin versioning: `docs/solutions/plugin-versioning-requirements.md`
