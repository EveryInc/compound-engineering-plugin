---
title: "Reference bundled skill files by tier: relative for reads, SKILL_DIR anchor for executed scripts"
date: 2026-06-26
category: skill-design
module: "skills (bundled-script invocation across harnesses)"
problem_type: convention
component: tooling
severity: high
applies_when:
  - Authoring or reviewing a skill that executes a bundled script via the Bash tool
  - A skill must work on more than one harness (Claude Code, Codex, Cursor, Gemini)
  - Generalizing an empirical harness finding into a broad authoring rule
tags:
  - bundled-scripts
  - path-resolution
  - skill-authoring
  - cross-harness
  - skill-dir
  - bash-tool
  - claude-skill-dir
  - empirical-validation
related_components:
  - development_workflow
  - documentation
---

# Reference bundled skill files by tier: relative for reads, SKILL_DIR anchor for executed scripts

The three tiers (read-time relative, prose pointer plus "from this skill's directory" cue, `SKILL_DIR` anchor for executed shell), the load-bearing trailing `;`, the `BASH_SOURCE` rule for a script that needs its own directory, and the `${CLAUDE_SKILL_DIR}` warning all live in `AGENTS.md` under "Platform-Specific Variables in Skills". This doc keeps the lesson behind them.

## Harness fact versus resolution mechanism

The tiers came out of a wrong turn. The empirical finding, *the Bash tool's working directory is the user's project root, not the skill directory, on Claude Code, Codex, and Cursor*, was over-generalized into "bare relative paths like `bash scripts/x.sh` are broken, so anchor every invocation," and codified before being checked against the cross-tool skill spec or any independent implementation. The strong form is false: bare relative paths work in practice, because the thing that resolves the path is the agent, not the shell. The agentskills.io spec says so directly (relative script paths work because "the agent resolves these paths automatically"). Conflating "where the shell starts" with "who resolves the path" produced guidance that diverged from the ecosystem and added unnecessary machinery.

A single empirical finding is not an authoring rule until it is validated against the spec and two or three independent implementations. Vendor docs alone do not settle a cross-harness question; they are platform-centric by construction (Claude Code's docs recommend `${CLAUDE_SKILL_DIR}`, exactly the non-portable form to avoid here).

## The evidence that set the tiers

- agentskills.io ships bare `bash scripts/validate.sh` as its canonical example.
- obra/superpowers' `brainstorming` skill runs bare `scripts/start-server.sh` with no anchor across four named platforms; its `subagent-driven-development` skill pairs a bare relative path with a "from this skill's directory" cue (Tier 2).
- mattpocock/skills sidesteps in-place execution entirely (copies a hook into `.claude/hooks/`, or ships a `.template.sh` referenced in prose).
- `last30days` adopted the explicit `SKILL_DIR` anchor for its critical multi-host engine *after* a path-resolution regression.

The tiers reconcile these: relative is the ecosystem norm and works via agent resolution; the anchor is the determinism upgrade reserved for executed shell, where a fenced block copied verbatim into a Bash call otherwise misses (the #764 / #811 / #898 bug class). Apply the anchor only to Tier 3; on Tier 1 and 2 it is noise. `tests/skill-conventions.test.ts` enforces an existence guard only when a skill-dir *platform var* is used, so anchor-based skills pass it.

Open caveat (#949): if a `Read references/X` is ever observed to resolve against the project CWD on a target, treat that read as Tier 2 and add the cue.

## Related

- [`pass-paths-not-content-to-subagents.md`](pass-paths-not-content-to-subagents.md): a different "paths" problem (token efficiency, not CWD resolution).
- [`../best-practices/prefer-python-over-bash-for-pipeline-scripts.md`](../best-practices/prefer-python-over-bash-for-pipeline-scripts.md): which language to write a bundled script in.
- Issues: #944 (reconcile bundled-script invocation guidance), #949 (Tier-2 prose-reference miss), #943/#898/#811/#764 (the Tier-3 origin bug class).
