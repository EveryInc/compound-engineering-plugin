# Documentation Workflow Brainstorm

**Date:** 2026-02-13
**Status:** Ready for planning

## What We're Building

A `/workflows:document` command that automatically updates project documentation after a feature is implemented and reviewed. It fills the gap between code review and knowledge capture in the workflow chain:

```
Research → Brainstorm → Plan → Work → Review → Document → Compound
```

**Scope:** Full project documentation — README, CHANGELOG, API docs, user guides, and inline code docs. Not limited to the plugin itself.

## Why This Approach

The compound-engineering workflow chain currently has no step for updating user-facing documentation. After `/workflows:work` finishes implementation and `/workflows:review` validates the code, documentation updates are left as a manual afterthought. This creates a gap where features ship without corresponding docs.

A phased workflow command (not an agent) was chosen because:
- It follows the established workflow pattern (phase-based, skill-loading, handoff points)
- It fits naturally in the chain between Review and Compound
- A single workflow is simpler to maintain than multiple specialist agents
- The propose-then-confirm model gives users control without being tedious

## Key Decisions

1. **Form factor:** New workflow command (`/workflows:document`), not an agent
2. **Chain position:** After Review, before Compound
3. **Discovery method:** Git diff + chain docs (brainstorm/plan) for full context
4. **Autonomy model:** Propose-then-confirm — analyze what needs updating, present a plan, get approval, then execute
5. **Documentation scope:** Full project docs (README, CHANGELOG, API docs, user guides, inline code docs)

## Design

### Phase 1: Discovery

Analyze the codebase to understand what was built and what docs need updating:

- **Git diff analysis:** Read the diff between current branch and main to identify what changed
- **Chain doc lookup:** Find and read any brainstorm/plan documents for this feature (auto-detect from `docs/brainstorms/` and `docs/plans/` by date or topic)
- **Doc inventory:** Scan the project for existing documentation files (README, CHANGELOG, API docs, guides, etc.)
- **Gap analysis:** Compare what was built against what's documented

### Phase 2: Proposal

Present a structured proposal to the user:

- List each doc file that needs updating
- For each file, describe what changes are needed (new section, updated section, new entry, etc.)
- Flag any docs that should be created (e.g., "No API docs exist yet — should we create one?")
- Use `AskUserQuestion` to get approval (approve all, select specific items, or skip)

### Phase 3: Execution

Make the approved documentation changes:

- Update each approved doc file
- Follow existing doc conventions (detect style from existing content)
- After all updates, show a summary of what was changed
- Offer handoff to `/workflows:compound` for knowledge capture

## Open Questions

1. Should the workflow also update inline code comments/docstrings, or just standalone doc files?
2. Should it create a documentation PR comment summarizing what was updated (useful for team visibility)?
3. How should it handle projects with no existing docs — offer to scaffold a basic doc structure?
