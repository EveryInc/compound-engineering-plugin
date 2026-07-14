---
title: "Separate host-native browser capabilities from portable fallbacks"
date: 2026-07-09
category: architecture-patterns
module: skills/ce-test-browser
problem_type: architecture_pattern
component: development_workflow
severity: medium
applies_when:
  - "A cross-platform skill needs browser automation across app and CLI harnesses"
  - "An unattended workflow still runs inside a harness with an observable browser"
  - "A host-native browser exposes an API whose implementation name resembles a prohibited standalone tool"
tags:
  - skill-design
  - browser-automation
  - host-native
  - agent-browser
  - pipeline
  - cross-platform
---

# Separate host-native browser capabilities from portable fallbacks

## Context

`ce-test-browser` historically mandated `agent-browser` to prevent agents from drifting into standalone Playwright, Puppeteer, or arbitrary browser integrations. That guard also prohibited browser surfaces embedded in or directly owned by app harnesses, even when those surfaces provided the complete testing contract and a better integrated experience.

The categorical rule also coupled unrelated decisions: `mode:pipeline` meant both "do not block on questions" and "hide the browser." An LFG run inside an app harness is unattended, but its integrated browser can remain observable without interrupting automation.

## Guidance

Treat browser choices as three distinct layers:

1. Prefer a browser surface embedded in or directly owned by the active harness when it supports local navigation, rendered and interactive state inspection, interactions, screenshots, and console-error inspection (`skills/ce-test-browser/SKILL.md:20`). A separately configured browser extension or integration does not qualify as host-native.
2. Fall back to the portable `agent-browser` CLI when no qualifying host-native capability exists (`skills/ce-test-browser/SKILL.md:21`).
3. Continue prohibiting standalone Playwright, Puppeteer, separately configured browser extensions or MCPs, and ad hoc browser automation (`skills/ce-test-browser/SKILL.md:22`).

An API named Playwright inside the selected host-native browser is still part of the host capability; implementation vocabulary does not turn it into a standalone Playwright substitution (`skills/ce-test-browser/SKILL.md:22`).

Select one driver before testing and keep its session, element references, screenshots, and authentication state for the entire run. Permit fallback only during initialization, before the first route is tested (`skills/ce-test-browser/SKILL.md:24`). Put fallback-specific commands and troubleshooting in a conditional reference so host-native runs do not carry irrelevant CLI instructions (`skills/ce-test-browser/references/agent-browser-driver.md:3`).

Keep orchestration policy independent from driver selection and visibility. Headless or pipeline mode means no blocking questions; it does not require hiding a host-native browser. Integrated browsers can remain visible and non-blocking, while a CLI fallback can run headless (`skills/ce-test-browser/references/pipeline-orchestration.md:3`, `skills/ce-test-browser/references/pipeline-orchestration.md:7`).

## Why This Matters

This preserves the original quality guard without handicapping app harnesses. CLI environments retain one portable fallback, while app environments can use the browser surface their harness is designed to control. Separating orchestration, visibility, and driver choice also prevents future mode flags from silently changing capabilities they do not own.

The rule is testable as a contract rather than a preference. The regression test pins native-first selection, fallback behavior, embedded-Playwright classification, one-driver ownership, pipeline observability, and user-documentation parity (`tests/ce-test-browser-driver-policy.test.ts:9`).

## When to Apply

- A skill runs across both app and CLI harnesses.
- A host provides an embedded or directly owned capability that is materially different from installing or separately configuring another tool.
- A portability fallback remains valuable but should not override a better native experience.
- An unattended mode controls questions or error handling but does not inherently require invisible execution.

## Examples

Before:

```markdown
Always use agent-browser. Do not use any built-in browser-control tool.
Pipeline mode defaults every run to hidden/headless execution.
```

After:

```markdown
Prefer a qualifying host-native integrated browser. Otherwise fall back to
agent-browser. Never introduce a third standalone automation stack.

Pipeline mode suppresses blocking questions; it does not change driver
selection or force an integrated browser to be hidden.
```

## Related

- `docs/solutions/skill-design/compound-refresh-skill-improvements.md` — related capability-first skill-writing guidance; low overlap because it addresses question tools and autonomous maintenance rather than browser-driver selection.
