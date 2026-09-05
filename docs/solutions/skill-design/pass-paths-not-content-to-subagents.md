---
title: "Pass paths, not content, when dispatching sub-agents"
category: skill-design
problem_type: design_pattern
component: tooling
root_cause: inadequate_documentation
resolution_type: workflow_improvement
severity: medium
tags: [orchestration, subagent, token-efficiency, skill-design, multi-agent]
date: 2026-03-26
---

## Pattern

When a sub-agent needs repo reference material (config files, standards docs), the orchestrator discovers paths (glob/search, cheap) and passes the path list; the sub-agent reads only the files and sections it needs (expensive, and it is closer to the task so it knows what is relevant). Include a standalone fallback: if the paths block is absent, the sub-agent discovers paths itself, so the same persona works orchestrated or alone. `ce-code-review` does this with its `<standards-paths>` block (`skills/ce-code-review/references/dispatch-reviewers.md`).

Passing full contents instead makes the orchestrator do read work that may go unused, inflates every sub-agent prompt linearly with the number of reference files, and takes away the sub-agent's judgment about relevance.

**Content-passing is acceptable when** the material is small, static, and guaranteed to be fully consumed by every invocation — a JSON schema under ~50 lines the sub-agent always needs in full. An orchestrator reading file contents before dispatch is otherwise a refactor signal.

## Instruction phrasing matters more than meta-rules

For the same task (find ancestor `CLAUDE.md`/`AGENTS.md` files for changed paths), the phrasing of the search instruction alone changed the tool-call count:

| Instruction phrasing | Claude Code tool calls | Codex shell commands |
|---|---|---|
| "for each changed file, walk its ancestor directories and check for X at each level" | 14 | 2 |
| "find all X in the repo, then filter to ancestors of changed files" | 2 | 2 |

The per-item walk made Claude Code glob each directory level individually; bulk-find-then-filter produced two globs. Codex was resilient to both (it batched the work in a Python script either way). For instructions that drive search or discovery on every review or plan, test the phrasing empirically before committing — both CLIs expose tool-call counts:

```bash
claude -p "instruction here" --output-format stream-json --verbose 2>/dev/null > out.jsonl
codex exec --json --full-auto "instruction here" > out.jsonl
```

## Related

- `docs/solutions/agent-friendly-cli-principles.md` — Principle #7 (bounded, high-signal responses): agents pay real cost for extra output; paths are bounded, content is not.
