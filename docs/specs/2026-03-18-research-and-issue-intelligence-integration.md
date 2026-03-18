---
date: 2026-03-18
status: accepted
scope: ce:user-research, ce:ideate, issue-intelligence-analyst
---

# Research & Issue Intelligence: Two Input Channels

## Context

The plugin has two distinct channels for gathering user/project insight:

1. **Issue intelligence** (`issue-intelligence-analyst` agent, invoked via `ce:ideate`) — Quantitative analysis of GitHub issues, producing theme-level reports with trend directions, severity signals, and recurrence patterns.

2. **User research** (`ce:user-research` skill orchestrating `research-plan`, `transcript-insights`, `persona-builder`) — Qualitative interview-based research producing structured personas and interview snapshots.

Both produce structured artifacts that downstream agents consume during ideation, brainstorming, and planning.

## Current State (shipping as-is)

### Issue Intelligence
- Lives as `agents/research/issue-intelligence-analyst.md`
- Invoked conditionally by `ce:ideate` when issue-tracker intent is detected
- Produces a theme report (3-8 themes with counts, trends, confidence, representative issues)
- Output is ephemeral — exists only in the ideation context, not persisted as a standalone artifact

### User Research
- Orchestrated by `ce:user-research` with three phases: Plan, Process, Personas
- Produces durable artifacts:
  - Research plans in `docs/research/plans/`
  - Interview snapshots in `docs/research/interviews/`
  - Personas in `docs/research/personas/`
- No awareness of issue data or ideation artifacts

### Interaction Today
- `ce:ideate` can invoke issue intelligence and feeds results into ideation sub-agents
- `ce:ideate` does not read personas or interview snapshots
- `ce:user-research` does not read issue themes or ideation artifacts
- The two channels operate independently

## When Each Channel Is Most Valuable

| Situation | Best channel | Why |
|-----------|-------------|-----|
| Existing repo with active issue tracker | Issue intelligence | Direct user feedback already exists; themes surface systemic patterns |
| New venture or entering a new problem space | User research | No existing feedback; need to discover user needs from scratch |
| Noisy issue tracker dominated by vocal minority | User research | Structured interviews overcome the loud-user bias |
| Mature product with declining engagement | Both | Issues show what's broken; interviews reveal why users left silently |
| Pre-sprint prioritization | Issue intelligence | Fast, quantitative, grounded in current pain |
| Strategic direction setting | User research | Deeper context, unspoken needs, persona-driven framing |

## Design Principles for Future Integration

1. **Both channels are valid standalone.** A user who only has issues should get full value without ever touching interviews. A user doing pure discovery research should never be prompted about GitHub issues.

2. **Structured artifacts are the integration surface.** The value compounds when downstream agents (ideation, brainstorming, planning) can read artifacts from either channel. The artifacts — not the workflows — are what should be connected.

3. **Enrichment, not dependency.** When both channels have data, each should optionally enrich the other. Neither should require the other to function.

4. **User chooses the lens.** Some users want themes (systemic patterns). Some want personas (user archetypes). Some want both. The system should support all three without forcing a path.

## Potential Expansion Options

These are documented directions for future PRs, not commitments. Prioritize based on actual user feedback.

### Option A: Persist Issue Theme Reports as Artifacts
**What:** Write issue intelligence output to `docs/research/themes/YYYY-MM-DD-<repo>-issue-themes.md` as a durable artifact alongside personas and interview snapshots.
**Why:** Currently theme reports exist only in the ideation conversation context. Persisting them makes them available to `ce:brainstorm`, `ce:plan`, and future `ce:user-research` runs. Also enables tracking theme evolution over time.
**Complexity:** Low — add a write step to the issue-intelligence-analyst agent output.

### Option B: Issue Themes Inform Research Planning
**What:** When `ce:user-research plan` runs and persisted issue themes exist, surface the top themes as optional context for framing interview objectives and discussion guide questions.
**Why:** "Users report authentication reliability issues" is a strong signal for what to ask about in interviews. Grounds qualitative research in quantitative evidence.
**Complexity:** Low — read themes file in the research-plan skill, present as optional grounding.

### Option C: Personas Contextualize Issue Analysis
**What:** When `ce:ideate` invokes issue intelligence and personas exist, pass persona summaries to the issue-intelligence-analyst so it can note which themes likely affect which persona types.
**Why:** "This theme has 25 issues, and it primarily affects the security-conscious enterprise admin persona" is more actionable than "this theme has 25 issues."
**Complexity:** Medium — requires the agent to read persona artifacts and cross-reference during clustering.

### Option D: Themes as a Parallel Output in ce:user-research
**What:** Add a fourth phase to `ce:user-research` — "Themes" — that synthesizes issue themes OR interview-derived themes (without requiring GitHub issues). Users can build themes from interviews alone, from issues alone, or from both.
**Why:** Not all insight needs to be structured as a persona. Some users want "the top 5 problems our users face" without the persona abstraction. Themes are a lighter-weight, more flexible output format.
**Complexity:** Medium — new phase in ce:user-research, potentially a new skill or extension of persona-builder.

### Option E: Unified Insight Dashboard
**What:** A read-only skill that scans `docs/research/` for all artifact types (plans, interviews, personas, themes) and produces a consolidated summary of current project understanding — what's known, what's assumed, and where the gaps are.
**Why:** As artifacts accumulate, the value is in seeing them together. A dashboard skill surfaces the full picture before ideation or planning sessions.
**Complexity:** Medium — primarily a read-and-synthesize skill, no new artifact types.

### Option F: Feedback Loop from Ideation Back to Research
**What:** When `ce:ideate` produces survivors, tag each with "evidence source" (issue data, persona insight, codebase observation, or assumption). Ideas grounded only in assumptions become candidates for research validation — surfaced as suggested interview questions or issue tracker queries.
**Why:** Closes the loop: ideation identifies what you don't know, research fills the gaps, next ideation round is better grounded.
**Complexity:** High — requires ideation to track evidence provenance and research to consume ideation output.

## Decision Framework for Expansion

When deciding which option to pursue next, consider:

1. **Are users asking for it?** Actual feedback from users of either workflow trumps theoretical value.
2. **Does it compound?** Prefer options that make multiple downstream workflows better (Option A unlocks B, C, and E).
3. **Is it reversible?** Prefer additive changes (new optional phases, new artifact types) over changes that alter existing workflow behavior.
4. **What's the artifact?** Every option should produce or enrich a structured artifact. If the output is only conversational, it doesn't compound.

Option A (persist theme reports) is likely the highest-leverage first step because it unlocks Options B, C, and E without changing any existing workflow behavior.
