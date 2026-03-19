---
date: 2026-03-18
topic: auto-memory-integration
---

# Auto Memory Integration for ce:compound and ce:compound-refresh

## Problem Frame

Claude Code's Auto Memory feature passively captures debugging insights, fix patterns, and preferences across sessions in `~/.claude/projects/<project>/memory/`. The ce:compound and ce:compound-refresh skills currently don't leverage this data source, even though it contains exactly the kind of raw material these workflows need: notes about problems solved, approaches tried, and patterns discovered.

After long sessions or compaction, auto memory may preserve insights that conversation context has lost. For ce:compound-refresh, auto memory may contain newer observations that signal drift in existing docs/solutions/ learnings without anyone explicitly flagging it.

## Requirements

- R1. **ce:compound uses auto memory as supplementary evidence.** The orchestrator reads MEMORY.md before launching Phase 1 subagents, scans for entries related to the problem being documented, and passes relevant memory content as additional context to the Context Analyzer and Solution Extractor subagents. Those subagents treat memory notes as supplementary evidence alongside conversation history.
- R2. **ce:compound-refresh investigation subagents check auto memory.** When investigating a candidate learning's staleness, investigation subagents also check auto memory for notes in the same problem domain. A memory note describing a different approach than what the learning recommends is treated as a drift signal.
- R3. **Graceful absence handling.** If auto memory doesn't exist for the project (no memory directory or empty MEMORY.md), all skills proceed exactly as they do today with no errors or warnings.

## Success Criteria

- ce:compound produces richer documentation when auto memory contains relevant notes about the fix, especially after sessions involving compaction
- ce:compound-refresh surfaces staleness signals that would otherwise require manual discovery
- No regression when auto memory is absent or empty

## Scope Boundaries

- **Not changing auto memory's output location or format** -- these skills consume it as-is
- **Read-only** -- neither skill writes to auto memory; ce:compound writes to docs/solutions/ (team-shared, structured), which serves a different purpose than machine-local auto memory
- **Not adding a new subagent** -- existing subagents are augmented with memory-checking instructions
- **Not changing the structure of docs/solutions/ output** -- the final artifacts are the same

## Dependencies / Assumptions

- Claude knows its auto memory directory path from the system prompt context in every session -- no path discovery logic needed in the skills

## Key Decisions

- **Augment existing subagents, not a new one**: ce:compound-refresh investigation subagents need memory context during their own investigation (not as a separate report), so a dedicated Memory Scanner subagent would be awkward. For ce:compound, the orchestrator pre-reads MEMORY.md once and passes relevant excerpts to subagents, avoiding redundant reads while keeping the same subagent count.

## Outstanding Questions

### Deferred to Planning

- [Affects R1][Technical] How should the orchestrator determine which MEMORY.md entries are "related" to the current problem? Keyword matching against the problem description, or broader heuristic?
- [Affects R2][Technical] Should ce:compound-refresh investigation subagents read the full MEMORY.md or only topic files matching the learning's domain? The 200-line MEMORY.md is small enough to read in full, but topic files may be more targeted.

## Next Steps

-> `/ce:plan` for structured implementation planning
