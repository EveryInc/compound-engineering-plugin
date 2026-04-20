---
title: "Pass paths, not content, when dispatching sub-agents"
problem_type: design_pattern
component: tooling
root_cause: inadequate_documentation
resolution_type: workflow_improvement
severity: medium
tags: [orchestration, subagent, token-efficiency, skill-design, multi-agent]
date: 2026-03-26
---

## Problem

When orchestrating sub-agents that need codebase reference material (config files, standards docs, etc.), passing full file contents in the sub-agent prompt bloats context and makes the orchestrator do expensive upfront work that may go unused.

## Symptoms

- Orchestrator skill reads multiple files, concatenates their contents into a block (e.g., `<standards>` with full CLAUDE.md/AGENTS.md content), and injects it into the sub-agent prompt
- Sub-agent receives all content regardless of how much is relevant to its specific task
- In repos with directory-scoped config files, the orchestrator must discover and read every file before invoking a single sub-agent
- Sub-agent prompts grow linearly with the number of reference files, even when the agent needs only specific sections

## What Didn't Work

Having the orchestrator read all relevant file contents and pass them in a content block. This was the initial approach for the `project-standards-reviewer` agent in ce:review: Stage 3b collected all CLAUDE.md/AGENTS.md content into a `<standards>` block passed in the sub-agent prompt.

Problems:
- Orchestrator did expensive read work that may be partially wasted
- Sub-agent prompt inflated with content it may not fully use
- Scales poorly as the number of directory-scoped config files grows
- Sub-agent loses agency to decide what's relevant

## Solution

Separate discovery (cheap) from reading (expensive). The orchestrator discovers file paths via glob or search, passes a path list, and the sub-agent reads only the files and sections it needs.

**Pattern from Anthropic's code-review command:**

> "Use another Haiku agent to give you a list of file paths to (but not the contents of) any relevant CLAUDE.md files from the codebase: the root CLAUDE.md file (if one exists), as well as any CLAUDE.md files in the directories whose files the pull request modified"

The reviewing agents then receive those paths and read the files themselves.

**How we applied it in ce:review:**

1. Stage 3b: orchestrator globs for CLAUDE.md/AGENTS.md paths in changed directories, emits a `<standards-paths>` block
2. Sub-agent prompt: `project-standards-reviewer` reads the listed files itself, targeting sections relevant to the changed file types
3. Standalone fallback: if no `<standards-paths>` block is present, the agent discovers paths independently

**General template:**

```
Orchestrator:
1. Discover paths (glob/search) -> emit <reference-paths> block
2. Pass path list to sub-agent

Sub-agent:
1. If <reference-paths> present, read listed files
2. If absent, discover paths independently (standalone fallback)
3. Read only sections relevant to the specific task
```

## Why This Works

Discovery is cheap; reading and processing file contents is expensive. The sub-agent is closer to the task (it knows what it's reviewing) and is better positioned to decide which sections of which files are relevant. This is lazy evaluation applied to agent orchestration: don't pay the cost of reading until you know you need the content.

## Prevention

When designing orchestrator skills that invoke sub-agents needing repo reference material:

1. **Default to path-passing.** Orchestrator discovers paths, sub-agent reads content.
2. **Include a standalone fallback.** If the paths block is absent, the sub-agent discovers paths on its own. This enables both orchestrated and standalone invocation.
3. **Content-passing is acceptable when:** the reference material is small, static, and guaranteed to be fully consumed by every invocation (e.g., a JSON schema under 50 lines that the sub-agent always needs in full).
4. **Signal to refactor:** if you catch an orchestrator reading file contents before invoking sub-agents, treat it as a candidate for the path-passing pattern.

## Instruction phrasing matters more than meta-rules

Empirical testing showed that how the skill phrases a search instruction has a dramatic effect on tool call count. For the same task (find ancestor CLAUDE.md/AGENTS.md files for changed paths):

| Instruction phrasing | Claude Code tool calls | Codex shell commands |
|---|---|---|
| "for each changed file, walk its ancestor directories and check for X at each level" | 14 | 2 |
| "find all X in the repo, then filter to ancestors of changed files" | 2 | 2 |

The "per-item walk" phrasing caused Claude Code to glob each directory level individually. The "bulk find, then filter" phrasing produced two globs total. Codex was resilient to both phrasings (it wrote a Python script to batch the work either way).

When in doubt about whether an instruction phrasing is efficient, test it empirically before committing. Both `claude -p` and `codex exec` support JSON output that reveals tool call counts:

```bash
# Claude Code: stream-json + verbose shows each tool call
claude -p "instruction here" --output-format stream-json --verbose 2>/dev/null > out.jsonl

# Codex: --json shows command_execution events
codex exec --json --full-auto "instruction here" > out.jsonl
```

This is worth doing for orchestration-heavy skills where instructions drive search or file discovery — a small phrasing change can produce a large difference in tool calls, latency, and token cost. Not every instruction needs benchmarking, but when the skill will run on every review or every plan, the cost compounds.

## Related

- `docs/solutions/skill-design/compound-refresh-skill-improvements.md` — establishes "no shell commands for file operations in subagents"; complementary pattern about letting sub-agents use appropriate tools rather than orchestrating reads on their behalf
- `docs/solutions/skill-design/script-first-skill-architecture.md` — complementary pattern: scripts pre-process large datasets so orchestrators don't load raw data
- `docs/solutions/agent-friendly-cli-principles.md` — Principle #7 (Bounded, High-Signal Responses) reinforces that agents pay real cost for extra output; paths are bounded, content is not
