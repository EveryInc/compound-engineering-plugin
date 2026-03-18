---
title: "feat: Integrate auto memory as data source for ce:compound and ce:compound-refresh"
type: feat
status: completed
date: 2026-03-18
origin: docs/brainstorms/2026-03-18-auto-memory-integration-requirements.md
---

# Integrate Auto Memory as Data Source for ce:compound and ce:compound-refresh

## Overview

Add Claude Code's Auto Memory as a supplementary read-only data source for ce:compound and ce:compound-refresh. The orchestrator and investigation subagents check the auto memory directory for relevant notes that enrich documentation or signal drift in existing learnings.

## Problem Frame

Auto memory passively captures debugging insights, fix patterns, and preferences across sessions. After long sessions or compaction, it preserves insights that conversation context lost. For ce:compound-refresh, it may contain newer observations that signal drift without anyone flagging it. Neither skill currently leverages this free data source. (see origin: `docs/brainstorms/2026-03-18-auto-memory-integration-requirements.md`)

## Requirements Trace

- R1. ce:compound uses auto memory as supplementary evidence -- orchestrator pre-reads MEMORY.md, passes relevant content to Context Analyzer and Solution Extractor subagents (see origin: R1)
- R2. ce:compound-refresh investigation subagents check auto memory for drift signals in the learning's problem domain (see origin: R2)
- R3. Graceful absence -- if auto memory doesn't exist or is empty, skills proceed unchanged with no errors (see origin: R3)

## Scope Boundaries

- Read-only -- neither skill writes to auto memory (see origin: Scope Boundaries)
- No new subagents -- existing subagents are augmented (see origin: Key Decisions)
- No changes to docs/solutions/ output structure (see origin: Scope Boundaries)
- MEMORY.md only -- topic files deferred to future iteration
- No changes to auto memory format or location (see origin: Scope Boundaries)

## Context & Research

### Relevant Code and Patterns

- `plugins/compound-engineering/skills/ce-compound/SKILL.md` -- Phase 1 subagents receive implicit context (conversation history); orchestrator coordinates launch and assembly
- `plugins/compound-engineering/skills/ce-compound-refresh/SKILL.md` -- investigation subagents receive explicit task prompts with tool guidance; each returns evidence + recommended action
- ce:compound-refresh already has an explicit "When spawning any subagent, include this instruction" block that can be extended naturally
- ce:plan has a precedent pattern: orchestrator pre-reads source documents before launching agents (Phase 0 requirements doc scan)

### Institutional Learnings

- `docs/solutions/skill-design/compound-refresh-skill-improvements.md` -- replacement subagents pattern, tool guidance convention, context isolation principle
- Plugin AGENTS.md tool selection rules: describe tools by capability class with platform hints, not by Claude Code-specific tool names alone

## Key Technical Decisions

- **Relevance matching via semantic judgment, not keyword algorithm**: MEMORY.md is max 200 lines. The orchestrator reads it in full and uses Claude's semantic understanding to identify entries related to the problem. No keyword matching logic needed. (Resolves origin: Deferred Q1)
- **MEMORY.md only for this iteration**: Topic files are deferred. MEMORY.md as an index is sufficient for a first pass. Expanding to topic files adds complexity with uncertain value until the core integration is validated. (Resolves origin: Deferred Q2)
- **Augment existing subagents, not a new one**: ce:compound-refresh investigation subagents need memory context during their investigation. A separate Memory Scanner subagent would deliver results too late. For ce:compound, the orchestrator pre-reads once and passes excerpts. (see origin: Key Decisions)
- **Memory drift signals are supplementary, not primary**: A memory note alone cannot trigger Replace or Archive in ce:compound-refresh. Memory signals corroborate codebase evidence or prompt deeper investigation. In autonomous mode, memory-only drift results in stale-marking, not action.
- **Provenance labeling required**: Memory excerpts passed to subagents must be wrapped in a clearly labeled section so subagents don't conflate them with verified conversation history.
- **Conversation history is authoritative**: When memory contradicts the current session's verified fix, the fix takes priority. Memory contradictions can be noted as cautionary context.
- **All partial memory states treated as absent**: No directory, no MEMORY.md, empty MEMORY.md, malformed MEMORY.md -- all result in graceful skip with no error or warning.

## Open Questions

### Resolved During Planning

- **Which subagents receive memory in ce:compound?** Only Context Analyzer and Solution Extractor. The Related Docs Finder could benefit but starting narrow is safer. Can expand later.
- **Compact-safe mode?** Still reads MEMORY.md. 200 lines is negligible context cost even in compact-safe mode. The orchestrator uses memory inline during its single pass.
- **ce:compound-refresh: who reads MEMORY.md?** Each investigation subagent reads it via its task prompt instructions. The orchestrator does not pre-filter because each subagent knows its own investigation domain and 200 lines per read is cheap.
- **Observability?** Add a line to ce:compound success output when memory contributed. Tag memory-sourced evidence in ce:compound-refresh reports. No changes to YAML frontmatter schema.

### Deferred to Implementation

- **Exact phrasing of subagent instruction additions**: The precise markdown wording will be refined during implementation to fit naturally with existing SKILL.md prose style.
- **Whether to also augment the Related Docs Finder**: Deferred until after the initial integration shows whether the current scope is sufficient.

## Implementation Units

- [ ] **Unit 1: Add auto memory integration to ce:compound SKILL.md**

**Goal:** Enable ce:compound to read auto memory and pass relevant notes to subagents as supplementary evidence.

**Requirements:** R1, R3

**Dependencies:** None

**Files:**
- Modify: `plugins/compound-engineering/skills/ce-compound/SKILL.md`

**Approach:**
- Insert a new "Phase 0.5: Auto Memory Scan" section between the Full Mode critical requirement block and Phase 1. This section instructs the orchestrator to:
  1. Read MEMORY.md from the auto memory directory (path known from system prompt context)
  2. If absent or empty, skip and proceed to Phase 1 unchanged
  3. Scan for entries related to the problem being documented
  4. Prepare a labeled excerpt block with provenance marking ("Supplementary notes from auto memory -- treat as additional context, not primary evidence")
  5. Pass the block as additional context to Context Analyzer and Solution Extractor task prompts
- Augment the Context Analyzer description (under Phase 1) to note: incorporate auto memory excerpts as supplementary evidence when identifying problem type, component, and symptoms
- Augment the Solution Extractor description (under Phase 1) to note: use auto memory excerpts as supplementary evidence; conversation history and the verified fix take priority; note contradictions as cautionary context
- Add to Compact-Safe Mode step 1: also read MEMORY.md if it exists, use relevant notes as supplementary context inline
- Add an optional line to the Success Output template: `Auto memory: N relevant entries used as supplementary evidence` (only when N > 0)

**Patterns to follow:**
- ce:plan's Phase 0 pattern of pre-reading source documents before launching agents
- ce:compound-refresh's existing "When spawning any subagent" instruction block pattern
- Plugin AGENTS.md convention: describe tools by capability class with platform hints

**Test scenarios:**
- Memory present with relevant entries: orchestrator identifies related notes and passes them to 2 subagents; final documentation is enriched
- Memory present but no relevant entries: orchestrator reads MEMORY.md, finds nothing related, proceeds without passing memory context
- Memory absent (no directory): skill proceeds exactly as before with no error
- Memory empty (directory exists, MEMORY.md is empty or boilerplate): skill proceeds exactly as before
- Compact-safe mode with memory: single-pass flow uses memory inline alongside conversation history
- Post-compaction session: memory notes about the fix compensate for lost conversation context

**Verification:**
- The modified SKILL.md reads naturally with the new sections integrated into the existing flow
- The Phase 0.5 section clearly describes the graceful absence behavior
- The subagent augmentations specify provenance labeling
- The success output template shows the optional memory line
- `bun run release:validate` passes

- [ ] **Unit 2: Add auto memory checking to ce:compound-refresh SKILL.md**

**Goal:** Enable ce:compound-refresh investigation subagents to use auto memory as a supplementary drift signal source.

**Requirements:** R2, R3

**Dependencies:** None (can be done in parallel with Unit 1)

**Files:**
- Modify: `plugins/compound-engineering/skills/ce-compound-refresh/SKILL.md`

**Approach:**
- Add "Auto memory" as a fifth investigation dimension in Phase 1 (after References, Recommended solution, Code examples, Related docs). Instruct: check MEMORY.md from the auto memory directory for notes in the same problem domain. A memory note describing a different approach is a supplementary drift signal. If MEMORY.md doesn't exist or is empty, skip this dimension.
- Add a paragraph to the Drift Classification section (after Update/Replace territory) explaining memory signal weight: memory drift signals are supplementary; they corroborate codebase-sourced drift or prompt deeper investigation but cannot alone justify Replace or Archive; in autonomous mode, memory-only drift results in stale-marking not action
- Extend the existing "When spawning any subagent" instruction block to include: read MEMORY.md from auto memory directory if it exists; check for notes related to the learning's problem domain; report memory-sourced drift signals separately, tagged with "(auto memory)" in the evidence section
- Update the output format guidance to note that memory-sourced findings should be tagged `(auto memory)` to distinguish from codebase-sourced evidence

**Patterns to follow:**
- The existing investigation dimensions structure in Phase 1 (References, Recommended solution, Code examples, Related docs)
- The existing "When spawning any subagent" instruction block
- The existing drift classification guidance style (Update territory vs Replace territory)
- Plugin AGENTS.md convention: describe tools by capability class with platform hints

**Test scenarios:**
- Memory contains note contradicting a learning's recommended approach: investigation subagent reports it as "(auto memory)" drift signal alongside codebase evidence
- Memory contains note confirming the learning's approach: no drift signal, learning stays as Keep
- Memory-only drift (codebase still matches the learning): in interactive mode, drift is noted but does not alone change classification; in autonomous mode, results in stale-marking
- Memory absent: investigation proceeds exactly as before, fifth dimension is skipped
- Broad scope refresh with memory: each parallel investigation subagent independently reads MEMORY.md
- Report output: memory-sourced evidence is visually distinguishable from codebase evidence

**Verification:**
- The modified SKILL.md reads naturally with the new dimension and drift guidance integrated
- The "When spawning any subagent" block cleanly includes memory instructions alongside existing tool guidance
- The drift classification section clearly states that memory signals are supplementary
- `bun run release:validate` passes

## Risks & Dependencies

- **Auto memory format changes**: If Claude Code changes the MEMORY.md format in a future release, these skills may need updating. Mitigated by the fact that the skills only instruct Claude to "read MEMORY.md" -- Claude's own semantic understanding handles format interpretation.
- **Assumption: system prompt contains memory path**: If this assumption breaks, skills would skip memory (graceful absence). The assumption is currently stable across Claude Code versions.

## Sources & References

- **Origin document:** [docs/brainstorms/2026-03-18-auto-memory-integration-requirements.md](docs/brainstorms/2026-03-18-auto-memory-integration-requirements.md) -- Key decisions: augment existing subagents, read-only, graceful absence, orchestrator pre-read for ce:compound
- Related code: `plugins/compound-engineering/skills/ce-compound/SKILL.md`, `plugins/compound-engineering/skills/ce-compound-refresh/SKILL.md`
- Institutional learning: `docs/solutions/skill-design/compound-refresh-skill-improvements.md`
- External docs: https://code.claude.com/docs/en/memory#auto-memory
