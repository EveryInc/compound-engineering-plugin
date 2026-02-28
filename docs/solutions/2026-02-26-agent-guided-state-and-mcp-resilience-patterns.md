---
title: 'Agent-Guided State Transitions and MCP Resilience Patterns for Browser Skills'
date: 2026-02-26
tags: [claude-code, claude-in-chrome, mcp, skill-architecture, browser-testing]
category: architecture
module: plugins/compound-engineering/skills/user-test/SKILL.md
source: deepen-plan
convergence_count: 5
plan: .deepen-2026-02-26-feat-user-test-browser-testing-skill-plan/original_plan.md
---

# Agent-Guided State Transitions and MCP Resilience Patterns for Browser Skills

## Problem

When designing skills that track state across runs (maturity models, progression systems) and depend on external MCP tools (browser automation, API connectors), two failure modes recur: hardcoded state transition rules that override agent judgment, and generic retry logic that gives users no actionable recovery path when MCP connections fail.

## Key Findings

### Hardcoded state rules violate agent-native principles (5 agents converged)

Encoding rigid rules like "3 consecutive passes = Promoted" and "any failure = reset to Uncharted" puts business logic in the skill that should be prompt-driven. A minor cosmetic issue in a well-tested area does not warrant full demotion. The fix: provide a scoring rubric with calibration anchors (concrete examples for each score level) and maturity guidance (not rigid counters), then let the agent exercise judgment on promotions and demotions based on severity and context.

### Extract content to references/ from day one (4 agents converged)

Skills approaching the 500-line recommended limit should proactively extract templates, framework-specific patterns, and mode-specific documentation into references/ subdirectories before the first version ships. Retrofitting extraction after the skill is in use creates migration risk. Plan the directory structure at design time: SKILL.md holds execution logic (~300 lines), references/ holds reusable content (templates, patterns, mode details).

### MCP disconnect recovery needs specific, not generic, guidance (4 agents converged)

Chrome extension service workers go idle during extended sessions, breaking MCP connections. A generic "retry once" pattern gives users no path forward when the retry also fails. The fix: provide the specific recovery command ("/chrome Reconnect"), add backoff delay (2-3 seconds) before retry, and track cumulative disconnects to fail fast (abort after 3) rather than burning tokens on repeated failures.

## Reusable Pattern

For skills with state tracking: define scoring calibration anchors (what each numeric score means concretely), provide maturity guidance as a rubric, and let agents exercise judgment -- never hardcode state transition counters. For MCP-dependent skills: implement three-tier resilience (preflight availability check, mid-run retry with specific recovery instructions, graceful degradation for non-critical tool failures).

## Code Example

```markdown
## Maturity Guidance (agent-guided, not hardcoded)
| Score | Meaning               | Example                              |
|-------|-----------------------|--------------------------------------|
| 1     | Broken                | Button unresponsive, page crashes    |
| 2     | Major friction         | 3+ confusing steps, error messages   |
| 3     | Minor friction         | Small UX issues, unclear labels      |
| 4     | Smooth                 | Clear flow, no confusion             |
| 5     | Delightful             | Exceeds expectations                 |

Promote to Proven: 2+ consecutive runs with no significant issues (use judgment)
Demote: Functional regression, not cosmetic issues
```

```markdown
## MCP Disconnect Recovery (three-tier)
1. Preflight: verify tool availability, instruct `/chrome` if missing
2. Mid-run: wait 3s, retry once, then: "Run /chrome > Reconnect extension"
3. Cumulative: abort after 3 disconnects with clear extension stability message
```

## References

- plugins/compound-engineering/skills/agent-native-architecture/SKILL.md (Granularity principle: agent judgment over hardcoded logic)
- docs/solutions/2026-02-26-monolith-to-skill-split-anti-patterns.md (size budget enforcement pattern)
- https://code.claude.com/docs/en/chrome (extension disconnect behavior and recovery)
