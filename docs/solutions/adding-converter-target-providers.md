---
title: Converter Target Provider Pitfalls
category: architecture
tags: [converter, target-provider, plugin-conversion, multi-platform, pattern]
created: 2026-02-23
date: 2026-02-23
last_refreshed: 2026-09-02
module: converter-cli
severity: medium
component: converter-cli
problem_type: architecture_pattern
root_cause: architectural_pattern
---

# Converter Target Provider Pitfalls

The step-by-step procedure for adding a target (types, converter, writer, CLI wiring, tests, docs) lives in `AGENTS.md` under "Adding a New Target Provider"; the reference implementations are `src/targets/opencode.ts` + `src/converters/claude-to-opencode.ts` (most complete) and the Codex, Pi, and Antigravity pairs beside them. Before adding a converter target at all, check `docs/solutions/integrations/native-plugin-install-strategy.md`: a harness with a native plugin manifest gets a manifest, not a converter.

What that procedure does not tell you is where every past target went wrong. Each row below was hit at least once.

| Pitfall | Solution |
|---------|----------|
| **Double-nesting** (`.target/.target/`) | Check `path.basename(outputRoot)` before nesting |
| **Inconsistent name normalization** | Use a single `normalizeName()` function everywhere |
| **Fragile content transformation** | Test regex patterns against edge cases (file paths, URLs) |
| **Heuristic section extraction fails** | Use structural mapping (description -> Overview, body -> Procedure) instead |
| **MCP config overwrites user edits** | Always backup with timestamp before overwriting |
| **Skill body not loaded** | Verify `ClaudeSkill` has `skillPath` field for file reading |
| **Missing deduplication** | Build `usedNames` set before conversion, pass to each converter |
| **Unsupported features cause silent loss** | Always warn to stderr (hooks, incompatible MCP types, etc.) |
| **Test isolation failures** | Use unique temp directories per test, clean up afterward |
| **Command namespace collisions after flattening** | Use `uniqueName()` with deduplication, test multiple collisions |

Model field handling is its own trap per target; see `docs/solutions/integrations/cross-platform-model-field-normalization.md` and `src/utils/model.ts`.
