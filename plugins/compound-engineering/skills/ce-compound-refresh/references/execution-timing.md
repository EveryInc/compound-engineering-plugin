# Execution Timing and Dispatch Order

Centralize the parallel/serial dispatch rules for Phase 1 to keep SKILL.md
focused on the workflow steps rather than the timing mechanics.

## Phase 1 Dispatch Order

```
1. Launch parallel subagents (background):
     - Context Analyzer
     - Solution Extractor
     - Related Docs Finder

2. Then: synchronous ce-sessions skill call (only if user opted in)
```

## Wall-Clock Optimization

ce-sessions runs synchronously in main context while the parallel subagents
continue in the background. The effective wall-clock time is:

```
wall_clock = max(ce-sessions_duration, slowest_subagent_duration)
```

NOT their sum. The key invariant: issuing the ce-sessions skill call AFTER
launching the parallel block preserves this optimization. Issuing it BEFORE
would serialize ce-sessions in front of the research subagents and regress
wall-clock time.

## Phase 2 Assembly Gate

**WAIT for all Phase 1 inputs to complete before proceeding.** The three
parallel subagents and, when enabled, the synchronous ce-sessions skill call.

Assembly steps then run sequentially:

1. check-duplicates.py → candidate list
2. Agent overlap judgment (High/Moderate/Low)
3. Write doc
4. validate-frontmatter.py
5. validate-schema.py
6. validate-concepts.py (if CONCEPTS.md changed)
7. Optionally ce-compound-refresh

## Lightweight Shortcut

In lightweight mode, skip steps 1-2 above (no Related Docs Finder, no
check-duplicates.py). Jump directly to write → validate → output.
