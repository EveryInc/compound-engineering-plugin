---
date: 2026-03-30
topic: cli-readiness-review-persona
---

# CLI Agent-Readiness Review Persona in ce:review

## Problem Frame

The `cli-agent-readiness-reviewer` agent exists as a standalone deep-audit tool, but developers only benefit from it if they know it exists and invoke it explicitly. Most CLI code gets reviewed through `ce:review`, which has no CLI-specific lens. Agent-readiness issues (prose-only output, missing `--json`, interactive prompts without bypass, unbounded list output) ship undetected because no review persona covers them.

Adding CLI readiness as a conditional persona in ce:review makes this expertise automatic -- the developer runs their normal review and gets CLI agent-readiness findings alongside security, performance, and other concerns.

## Requirements

**Persona Selection**

- R1. ce:review's orchestrator selects the CLI readiness persona based on diff analysis (same pattern as security-reviewer, performance-reviewer, etc.) -- not always-on
- R2. Activation signals: diff touches CLI command definitions, argument parsing, CLI framework usage, or command handler implementations. The orchestrator uses judgment (not keyword matching), consistent with how all other conditional personas are activated
- R3. Non-overlapping scope with agent-native-reviewer: CLI readiness evaluates CLI command structure and agent-friendliness; agent-native evaluates UI/agent tool parity. Both may activate on the same diff if it touches both CLI and UI code -- their findings address different concerns. Overlap is possible and handled during synthesis rather than prevented mechanically

**Persona Behavior**

- R4. Once dispatched, the persona self-scopes: identifies the framework, detects changed commands from the diff, and evaluates against the 7 principles from the standalone `cli-agent-readiness-reviewer` agent (used as reference material, not dispatched directly)
- R5. The persona returns findings in ce:review's standard JSON findings schema (same as all other conditional personas). For design-level findings that span multiple files or concern missing capabilities, use the most relevant command handler file as the canonical location
- R6. Severity mapping: Blocker -> P1, Friction -> P2, Optimization -> P3. The severity ceiling is P1 -- CLI readiness issues make the CLI harder for agents to use, they do not crash or corrupt
- R7. Autofix class: all findings use autofix_class `manual` or `advisory` with owner `human`. CLI readiness findings are design decisions (JSON schema design, flag semantics, error message content) that should not be auto-applied
- R8. Framework-idiomatic recommendations: findings reference the specific framework's patterns (e.g., "add `@click.option('--json', ...)` " for Click, not generic "add a --json flag")

**Integration**

- R9. Create a new lightweight persona agent file in `agents/review/` that distills the 7 principles into a code-review-oriented persona producing structured JSON findings. Add it to `ce-review/references/persona-catalog.md` in the cross-cutting conditional section with activation description and severity guidance
- R10. The existing standalone `cli-agent-readiness-reviewer` agent stays unchanged -- it remains available for direct invocation and whole-CLI audits. The new persona references the same principles but is optimized for ce:review's dispatch pattern and output format

## Success Criteria

- A ce:review run on a PR that modifies CLI command handlers includes CLI readiness findings in the review report without the user asking
- A ce:review run on a PR that only modifies React components or Rails views does not dispatch the CLI readiness persona
- Findings use framework-specific language matching the CLI's detected framework
- All findings have severity P1, P2, or P3 (never P0) and autofix_class `manual` or `advisory`

## Scope Boundaries

- This does not modify the standalone `cli-agent-readiness-reviewer` agent
- This does not add CLI awareness to ce:brainstorm or ce:plan (deferred -- ce:review alone covers the highest-value case)
- This does not introduce autofix for CLI readiness findings

## Key Decisions

- **New persona agent file**: A lightweight agent in `agents/review/` that distills the standalone agent's 7 principles into structured JSON findings. This matches how every other conditional persona works (security-reviewer, performance-reviewer, etc. are all separate agent files). The standalone agent's narrative report format doesn't match ce:review's JSON findings schema, and prompt surgery at dispatch time would be fragile.
- **Conditional, not always-on**: Follows the existing pattern where the orchestrator selects personas based on diff content. The persona never runs on non-CLI diffs.
- **Persona self-scopes**: The persona does its own framework detection and subcommand identification after dispatch. ce:review's orchestrator only decides whether to dispatch, not what framework is in use.
- **No autofix**: All findings route to human review. CLI readiness issues require design judgment.
- **Severity ceiling is P1**: CLI readiness issues don't crash the software -- they make it harder for agents to use. The highest reasonable severity is P1 (should fix), not P0 (must fix before merge).

## Outstanding Questions

### Deferred to Planning

- [Affects R9][Needs research] How much of the standalone agent's content should the new persona include directly vs. reference? The standalone agent is 24K+ (the largest review agent) -- the persona should be much smaller, distilling the principles into code-review-oriented checks rather than reproducing the full Framework Idioms Reference.
- [Affects R4][Needs research] Should the persona evaluate all 7 principles on every dispatch, or should it prioritize principles by command type (as the standalone agent does) and cap findings to avoid flooding the review with low-signal items?

## Next Steps

-> `/ce:plan` for structured implementation planning
