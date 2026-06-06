# Execution Timing and Dispatch Order

Centralize the parallel/serial dispatch rules for Phase 1 to keep SKILL.md
focused on the workflow steps rather than the timing mechanics.

## Phase 0: Context Bootstrapping

Parse $ARGUMENTS for mode tokens:

- mode:headless → non-interactive automation
- mode:lightweight → single-prompt mode, skips overlap detection
- session:opt-in → enable session history scan

Get pre-resolved context:

- Git branch: git rev-parse --abbrev-ref HEAD
- If branch is plain (no command string), include in Phase 1 context
- Otherwise omit

## Phase 0.5: Auto Memory Scan

Scan recent git history for solved problems:

- Git log since last commit or tag
- Look for fix commits, feature completion, or closed issues
- If session history opted in via ce-sessions, gather context from recent session

Pass findings to Phase 1 researchers.

## Phase 1: Research

Launch parallel subagents (background):

- Context Analyzer
- Solution Extractor
- Related Docs Finder

After all completions, optionally call ce-sessions skill if session history opted in.

## Phase 2: Assemble and Write

Assembly steps run sequentially:

1. Normalize problem and solution (Phase 2.1)
2. Determine output path using yaml-schema.md category mapping (Phase 2.2)
3. Write solution document using resolution-template.md (Phase 2.3)
4. Validation gate: validate-frontmatter.py, validate-schema.py, check-duplicates.py (Phase 2.4)
5. Discoverability Repair: check project instruction files (Phase 2.5)

## Phase 3: Review and Finalize

Sequential checks:

1. Duplicate Check (using check-duplicates.py)
2. Instruction File Check (verify chosen category page mentions new pattern)
3. Optional enhancement: specialized agents for complex reviews (interactive only)

## Headless Mode Behavior

In headless mode, skip interactive gates and run the same pipeline end-to-end. End with a structured report containing:

- Output path of the solution document
- Whether it created a new file or appended to an existing one
- Whether any side-effect writes were applied (CONCEPTS.md, instruction file)
- Validation results: pass/fail per script
- Whether validation blocked the pipeline (true only if a script failed)
- Any unresolved blocking issues

## Lightweight Mode Behavior

In lightweight mode:

- Skip Related Docs Finder subagent
- Skip check-duplicates.py in Phase 2.4
- Single prompt only, then proceed directly to write → validate → output
- Discoverability check produces a tip-only output (no auto-edit)

## Zed Execution Context

- Subagent prompts include discussion context and pre-resolved branch
- Research agents read relevant reference files inline
- Validation scripts run in the main context (not in subagents)
- No checkout mutations
