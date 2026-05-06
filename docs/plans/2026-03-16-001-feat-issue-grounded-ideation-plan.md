---
title: "feat: Add issue-grounded ideation mode to ce:ideate"
type: feat
status: complete
date: 2026-03-16
origin: docs/brainstorms/2026-03-16-issue-grounded-ideation-requirements.md
---

# feat: Add issue-grounded ideation mode to ce:ideate

## Overview

Add an issue intelligence agent and integrate it into ce:ideate so that when a user's argument indicates they want issue-tracker data as input, the skill fetches, clusters, and analyzes GitHub issues — then uses the resulting themes to drive ideation frames. The agent is also independently useful outside ce:ideate for understanding a project's issue landscape.

## Problem Statement / Motivation

ce:ideate currently grounds ideation in codebase context and past learnings only. Teams' issue trackers hold rich signal about real user pain, recurring failures, and severity patterns that ideation misses. The goal is strategic improvement ideas grounded in bug patterns ("invest in collaboration reliability") not individual bug fixes ("fix LIVE_DOC_UNAVAILABLE").

(See brainstorm: docs/brainstorms/2026-03-16-issue-grounded-ideation-requirements.md — R1-R9)

## Proposed Solution

Two deliverables:

1. **New agent**: `issue-intelligence-analyst` in `agents/research/` — fetches GitHub issues via `gh` CLI, clusters by theme, returns structured analysis. Standalone-capable.
2. **ce:ideate modifications**: detect issue-tracker intent in arguments, dispatch the agent as a third Phase 1 scan, derive Phase 2 ideation frames from issue clusters using a hybrid strategy.

## Technical Approach

### Deliverable 1: Issue Intelligence Analyst Agent

**File**: `plugins/compound-engineering/agents/research/ce-issue-intelligence-analyst.agent.md`

**Frontmatter:**
```yaml
---
name: issue-intelligence-analyst
description: "Fetches and analyzes GitHub issues to surface recurring themes, pain patterns, and severity trends. Use when understanding a project's issue landscape, analyzing bug patterns for ideation, or summarizing what users are reporting."
model: inherit
---
```

**Agent methodology (in execution order):**

1. **Precondition checks** — verify in order, fail fast with clear message on any failure:
   - Current directory is a git repo
   - A GitHub remote exists (prefer `upstream` over `origin` to handle fork workflows)
   - `gh` CLI is installed
   - `gh auth status` succeeds

2. **Fetch issues** — priority-aware, minimal fields (no bodies, no comments):

   **Priority-aware open issue fetching:**
   - First, scan available labels to detect priority signals: `gh label list --json name --limit 100`
   - If priority/severity labels exist (e.g., `P0`, `P1`, `priority:critical`, `severity:high`, `urgent`):
     - Fetch high-priority issues first: `gh issue list --state open --label "{high-priority-labels}" --limit 50 --json number,title,labels,createdAt`
     - Backfill with remaining issues up to 100 total: `gh issue list --state open --limit 100 --json number,title,labels,createdAt` (deduplicate against already-fetched)
     - This ensures the 50 P0s in a 500-issue repo are always analyzed, not buried under 100 recent P3s
   - If no priority labels detected, fetch by recency (default `gh` sort) up to 100: `gh issue list --state open --limit 100 --json number,title,labels,createdAt`

   **Recently closed issues:**
   - `gh issue list --state closed --limit 50 --json number,title,labels,createdAt,stateReason,closedAt` — filter client-side to last 30 days, exclude `stateReason: "not_planned"` and issues with labels matching common won't-fix patterns (`wontfix`, `won't fix`, `duplicate`, `invalid`, `by design`)

3. **First-pass clustering** — the core analytical step. Group issues into themes that represent **areas of systemic weakness or user pain**, not individual bugs. This is what makes the agent's output valuable.

   **Clustering approach:**
   - Start with labels as strong clustering hints when present (e.g., `subsystem:collab` groups collaboration issues). When labels are absent or inconsistent, cluster by title similarity and inferred problem domain.
   - Cluster by **root cause or system area**, not by symptom. Example from proof repo: 25 issues mentioning `LIVE_DOC_UNAVAILABLE` and 5 mentioning `PROJECTION_STALE` are symptoms — the theme is "collaboration write path reliability." Cluster at the system level, not the error-message level.
   - Issues that span multiple themes should be noted in the primary cluster with a cross-reference, not duplicated across clusters.
   - Distinguish issue sources when relevant: bot/agent-generated issues (e.g., `agent-report` label) often have different signal quality than human-reported issues. Note the source mix per cluster — a theme with 25 agent reports and 0 human reports is different from one with 5 human reports and 2 agent reports.
   - Separate bugs from enhancement requests. Both are valid input but represent different kinds of signal (current pain vs. desired capability).
   - Aim for 3-8 themes. Fewer than 3 suggests the issues are too homogeneous or the repo has few issues. More than 8 suggests the clustering is too granular — merge related themes.

   **What makes a good cluster:**
   - It names a systemic concern, not a specific error or ticket
   - A product or engineering leader would recognize it as "an area we need to invest in"
   - It's actionable at a strategic level (could drive an initiative, not just a patch)

4. **Sample body reads** — for each emerging cluster, read the full body of 2-3 representative issues (most recent or most reacted) using individual `gh issue view {number} --json body` calls. Use these to:
   - Confirm the cluster grouping is correct (titles can be misleading)
   - Understand the actual user/operator experience behind the symptoms
   - Identify severity and impact signals not captured in metadata
   - Surface any proposed solutions or workarounds already discussed

5. **Theme synthesis** — for each cluster, produce:
   - `theme_title`: short descriptive name
   - `description`: what the pattern is and what it signals about the system
   - `why_it_matters`: user impact, severity distribution, frequency
   - `issue_count`: number of issues in this cluster
   - `trend_direction`: increasing/stable/decreasing (compare issues opened vs closed in last 30 days within the cluster)
   - `representative_issues`: top 3 issue numbers with titles
   - `confidence`: high/medium/low based on label consistency and cluster coherence

6. **Return structured output** — themes ordered by issue count (descending), plus a summary line with total issues analyzed, cluster count, and date range covered.

**Output format (returned to caller):**

```markdown
## Issue Intelligence Report

**Repo:** {owner/repo}
**Analyzed:** {N} open + {M} recently closed issues ({date_range})
**Themes identified:** {K}

### Theme 1: {theme_title}
**Issues:** {count} | **Trend:** {increasing/stable/decreasing} | **Confidence:** {high/medium/low}

{description — what the pattern is and what it signals}

**Why it matters:** {user impact, severity, frequency}

**Representative issues:** #{num} {title}, #{num} {title}, #{num} {title}

### Theme 2: ...

### Minor / Unclustered
{Issues that didn't fit any theme, with a brief note}
```

This format is human-readable (standalone use) and structured enough for orchestrator consumption (ce:ideate use).

**Data source priority:**
1. **`gh` CLI (preferred)** — most reliable, works in all terminal environments, no MCP dependency
2. **GitHub MCP server** (fallback) — if `gh` is unavailable but a GitHub MCP server is connected, use its issue listing/reading tools instead. The clustering logic is identical; only the fetch mechanism changes.

If neither is available, fail gracefully per precondition checks.

**Token-efficient fetching:**

The agent runs as a sub-agent with its own context window. Every token of fetched issue data competes with the space needed for clustering reasoning. Minimize input, maximize analysis.

- **Metadata pass (all issues):** Fetch only the fields needed for clustering: `--json number,title,labels,createdAt,stateReason,closedAt`. Omit `body`, `comments`, `assignees`, `milestone` — these are expensive and not needed for initial grouping.
- **Body reads (samples only):** After clusters emerge, fetch full bodies for 2-3 representative issues per cluster using individual `gh issue view {number} --json body` calls. Pick the most reacted or most recent issue in each cluster.
- **Never fetch all bodies in bulk.** 100 issue bodies could easily consume 50k+ tokens before any analysis begins.

**Tool guidance** (per AGENTS.md conventions):
- Use `gh` CLI for issue fetching (one simple command at a time, no chaining)
- Use native file-search/glob for any repo exploration
- Use native content-search/grep for label or pattern searches
- Do not chain shell commands with `&&`, `||`, `;`, or pipes

### Deliverable 2: ce:ideate Skill Modifications

**File**: `plugins/compound-engineering/skills/ce-ideate/SKILL.md`

Four targeted modifications:

#### Mod 1: Phase 0.2 — Add issue-tracker intent detection

After the existing focus context and volume override interpretation, add a third inference:

- **Issue-tracker intent** — detect when the user wants issue data as input

The detection uses the same "reasonable interpretation rather than formal parsing" approach as the existing volume hints. Trigger on arguments whose intent is clearly about issue/bug analysis: `bugs`, `github issues`, `open issues`, `issue patterns`, `what users are reporting`, `bug reports`.

Do NOT trigger on arguments that merely mention bugs as a focus: `bug in auth`, `fix the login issue` — these are focus hints.

When combined with other dimensions (e.g., `top 3 bugs in authentication`): parse issue trigger first, volume override second, remainder is focus hint. The focus hint narrows which issues matter; the volume override controls survivor count.

#### Mod 2: Phase 1 — Add third parallel agent

Add a third numbered item to the Phase 1 parallel dispatch:

```
3. **Issue intelligence** (conditional) — if issue-tracker intent was detected in Phase 0.2,
   dispatch `compound-engineering:research:issue-intelligence-analyst` with the focus hint.
   If a focus hint is present, pass it so the agent can weight its clustering.
```

Update the grounding summary consolidation to include a separate **Issue Intelligence** section (distinct from codebase context) so that ideation sub-agents can distinguish between code-observed and user-reported pain points.

If the agent returns an error (gh not installed, no remote, auth failure), log a warning to the user ("Issue analysis unavailable: {reason}. Proceeding with standard ideation.") and continue with the existing two-agent grounding.

If the agent returns fewer than 5 issues total, note "Insufficient issue signal for theme analysis" and proceed with default ideation.

#### Mod 3: Phase 2 — Dynamic frame derivation

Add conditional logic before the existing frame assignment (step 8):

When issue-tracker intent is active and the issue intelligence agent returned themes:
- Each theme with `confidence: high` or `confidence: medium` becomes an ideation frame. The frame prompt uses the theme title and description as the starting bias.
- If fewer than 4 cluster-derived frames, pad with default frames selected in order: "leverage and compounding effects", "assumption-breaking or reframing", "inversion, removal, or automation of a painful step" (these complement issue-grounded themes best by pushing beyond the reported problems).
- Cap at 6 total frames (if more than 6 themes, use the top 6 by issue count; remaining themes go into the grounding summary as "minor themes").

When issue-tracker intent is NOT active: existing behavior unchanged.

#### Mod 4: Phase 0.1 — Resume awareness

When checking for recent ideation documents, treat issue-grounded and non-issue ideation as distinct topics. An existing `docs/ideation/YYYY-MM-DD-open-ideation.md` should not be offered as a resume candidate when the current argument indicates issue-tracker intent, and vice versa.

### Files Changed

| File | Change |
|------|--------|
| `agents/research/issue-intelligence-analyst.md` | **New file** — the agent |
| `skills/ce-ideate/SKILL.md` | **Modified** — 4 targeted modifications (Phase 0.1, 0.2, 1, 2) |
| `.claude-plugin/plugin.json` | **Modified** — increment agent count, add agent to list, update description |
| `../../.claude-plugin/marketplace.json` | **Modified** — update description with new agent count |
| `README.md` | **Modified** — add agent to research agents table |

### Not Changed

- Phase 3 (adversarial filtering) — unchanged
- Phase 4 (presentation) — unchanged, survivors already include a one-line overview
- Phase 5 (artifact) — unchanged, the grounding summary naturally includes issue context
- Phase 6 (refine/handoff) — unchanged
- No other agents modified
- No new skills

## Acceptance Criteria

- [ ] New agent file exists at `agents/research/issue-intelligence-analyst.md` with correct frontmatter
- [ ] Agent handles precondition failures gracefully (no gh, no remote, no auth) with clear messages
- [ ] Agent handles fork workflows (prefers upstream remote over origin)
- [ ] Agent uses priority-aware fetching (scans for priority/severity labels, fetches high-priority first)
- [ ] Agent caps fetching at 100 open + 50 recently closed issues
- [ ] Agent falls back to GitHub MCP when `gh` CLI is unavailable but MCP is connected
- [ ] Agent clusters issues into themes, not individual bug reports
- [ ] Agent reads 2-3 sample bodies per cluster for enrichment
- [ ] Agent output includes theme title, description, why_it_matters, issue_count, trend, representative issues, confidence
- [ ] Agent is independently useful when dispatched directly (not just as ce:ideate sub-agent)
- [ ] ce:ideate detects issue-tracker intent from arguments like `bugs`, `github issues`
- [ ] ce:ideate does NOT trigger issue mode on focus hints like `bug in auth`
- [ ] ce:ideate dispatches issue intelligence agent as third parallel Phase 1 scan when triggered
- [ ] ce:ideate falls back to default ideation with warning when agent fails
- [ ] ce:ideate derives ideation frames from issue clusters (hybrid: clusters + default padding)
- [ ] ce:ideate caps at 6 frames, padding with defaults when < 4 clusters
- [ ] Running `/ce:ideate bugs` on proof repo produces clustered themes from 25+ LIVE_DOC_UNAVAILABLE variants, not 25 separate ideas
- [ ] Surviving ideas are strategic improvements, not individual bug fixes
- [ ] plugin.json, marketplace.json, README.md updated with correct counts

## Dependencies & Risks

- **`gh` CLI dependency**: The agent requires `gh` installed and authenticated. Mitigated by graceful fallback to standard ideation.
- **Issue volume**: Repos with thousands of issues could produce noisy clusters. Mitigated by fetch cap (100 open + 50 closed) and frame cap (6 max).
- **Label quality variance**: Repos without structured labels rely on title/body clustering, which may produce lower-confidence themes. Mitigated by the confidence field and sample body reads.
- **Context window**: Fetching 150 issues + reading 15-20 bodies could consume significant tokens in the agent's context. Mitigated by metadata-only initial fetch and sample-only body reads.
- **Priority label detection**: No standard naming convention. Mitigated by scanning available labels and matching common patterns (P0/P1, priority:*, severity:*, urgent, critical). When no priority labels exist, falls back to recency-based fetching.

## Sources & References

- **Origin brainstorm:** [docs/brainstorms/2026-03-16-issue-grounded-ideation-requirements.md](docs/brainstorms/2026-03-16-issue-grounded-ideation-requirements.md) — Key decisions: pattern-first ideation, hybrid frame strategy, flexible argument detection, additive to Phase 1, standalone agent
- **Exemplar agent:** `plugins/compound-engineering/agents/research/ce-repo-research-analyst.agent.md` — agent structure pattern
- **ce:ideate skill:** `plugins/compound-engineering/skills/ce-ideate/SKILL.md` — integration target
- **Institutional learning:** `docs/solutions/skill-design/compound-refresh-skill-improvements.md` — impact clustering pattern, platform-agnostic tool references, evidence-first interaction
- **Real-world test repo:** `EveryInc/proof` (555 issues, 25+ LIVE_DOC_UNAVAILABLE duplicates, structured labels)
