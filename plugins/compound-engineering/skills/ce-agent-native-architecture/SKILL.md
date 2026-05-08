---
name: ce-agent-native-architecture
description: Build applications where agents are first-class citizens. Use this skill when designing autonomous agents, creating MCP tools, implementing self-modifying systems, or building apps where features are outcomes achieved by agents operating in a loop.
---

<overview>
## Agent-Native Architecture

Agent-native applications treat agents as first-class citizens. Features are outcomes achieved by an agent with tools operating in a loop, not functions written in code. The same architecture that powers Claude Code can power apps far beyond coding.

**Five core principles:**

1. **Parity** — Whatever the user can do through the UI, the agent can achieve through tools.
2. **Granularity** — Tools are atomic primitives; features are prompt-defined outcomes. To change behavior, edit prose, not code.
3. **Composability** — New features = new prompts, not new code. Atomic tools + parity make this possible.
4. **Emergent Capability** — The agent accomplishes things you didn't explicitly design for. Open-ended requests reveal latent demand.
5. **Improvement Over Time** — Apps get better through accumulated context (e.g. a `context.md` file) and prompt refinement, without shipping code.

For deep coverage of how these principles translate into architectural patterns, read `references/architecture-patterns.md`.
</overview>

<intake>
## What aspect of agent-native architecture do you need help with?

1. **Design architecture** - Plan a new agent-native system from scratch
2. **Files & workspace** - Files as universal interface, shared workspace patterns
3. **Tool design** - Primitive tools, dynamic capability discovery, CRUD completeness
4. **Domain tools** - When to add domain tools vs stay with primitives
5. **Execution patterns** - Completion signals, partial completion, context limits
6. **System prompts** - Define agent behavior, judgment criteria
7. **Context injection** - Inject runtime app state into agent prompts
8. **Action parity** - Ensure agents can do everything users can do
9. **Self-modification** - Enable agents to safely evolve themselves
10. **Product design** - Progressive disclosure, latent demand, approval patterns
11. **Mobile patterns** - iOS storage, background execution, checkpoint/resume
12. **Testing** - Test agent-native apps for capability and parity
13. **Refactoring** - Make existing code more agent-native
14. **Review / checklists** - Architecture checklist, anti-patterns, success criteria

Pick a number or describe what you want. Wait for the response before proceeding.
</intake>

<routing>
| Response | Read |
|----------|------|
| 1, "design", "architecture", "plan" | `references/architecture-patterns.md`, then apply the checklist in `references/checklists.md` |
| 2, "files", "workspace", "filesystem" | `references/files-universal-interface.md` and `references/shared-workspace-architecture.md` |
| 3, "tool", "mcp", "primitive", "crud" | `references/mcp-tool-design.md` |
| 4, "domain tool", "when to add" | `references/from-primitives-to-domain-tools.md` |
| 5, "execution", "completion", "loop" | `references/agent-execution-patterns.md` |
| 6, "prompt", "system prompt", "behavior" | `references/system-prompt-design.md` |
| 7, "context", "inject", "runtime", "dynamic" | `references/dynamic-context-injection.md` |
| 8, "parity", "ui action", "capability map" | `references/action-parity-discipline.md` |
| 9, "self-modify", "evolve", "git" | `references/self-modification.md` |
| 10, "product", "progressive", "approval", "latent demand" | `references/product-implications.md` |
| 11, "mobile", "ios", "android", "background", "checkpoint" | `references/mobile-patterns.md` |
| 12, "test", "testing", "verify", "validate" | `references/agent-native-testing.md` |
| 13, "refactor", "existing", "migrate" | `references/refactoring-to-prompt-native.md` |
| 14, "review", "audit", "anti-pattern", "checklist", "success criteria" | `references/checklists.md` |

After reading the reference, apply those patterns to the user's specific context.
</routing>

<reference_index>
## Reference Files

**Core patterns:**
- `references/architecture-patterns.md` — Event-driven, unified orchestrator, agent-to-UI; full coverage of the five principles
- `references/files-universal-interface.md` — Why files, organization, context.md
- `references/mcp-tool-design.md` — Tool design, dynamic capability discovery, CRUD
- `references/from-primitives-to-domain-tools.md` — When to graduate primitives to domain tools
- `references/agent-execution-patterns.md` — Completion signals, partial completion, context limits
- `references/system-prompt-design.md` — Features as prompts, judgment criteria

**Disciplines:**
- `references/dynamic-context-injection.md` — Runtime context injection
- `references/action-parity-discipline.md` — Capability mapping, parity workflow
- `references/shared-workspace-architecture.md` — Shared data space, UI integration
- `references/product-implications.md` — Progressive disclosure, latent demand, approval
- `references/agent-native-testing.md` — Testing outcomes, parity tests
- `references/checklists.md` — Architecture checklist, anti-patterns, success criteria

**Platform-specific:**
- `references/mobile-patterns.md` — iOS storage, checkpoint/resume, cost awareness
- `references/self-modification.md` — Git-based evolution, guardrails
- `references/refactoring-to-prompt-native.md` — Migrating existing code
</reference_index>
