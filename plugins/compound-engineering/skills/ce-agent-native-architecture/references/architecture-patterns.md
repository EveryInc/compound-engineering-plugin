<overview>
Architectural patterns for building agent-native systems. These patterns emerge from the five core principles: Parity, Granularity, Composability, Emergent Capability, and Improvement Over Time.

Features are outcomes achieved by agents operating in a loop, not functions you write. Tools are atomic primitives. The agent applies judgment; the prompt defines the outcome.

See also:
- `references/files-universal-interface.md` for file organization and context.md patterns
- `references/agent-execution-patterns.md` for completion signals and partial completion
- `references/product-implications.md` for progressive disclosure and approval patterns
</overview>

<pattern name="event-driven-agent">
## Event-Driven Agent Architecture

The agent runs as a long-lived process that responds to events. Events become prompts.

```
Event Source → Agent (Claude) → Tool Calls → Response
                    │
          ┌─────────┼─────────┐
          ▼         ▼         ▼
     Content     Self      Data
      Tools     Tools     Tools
   (write_file) (restart) (store_item)
```

**Key characteristics:**
- Events (messages, webhooks, timers) trigger agent turns
- Agent decides how to respond based on system prompt
- Tools are primitives for IO, not business logic
- State persists between events via data tools

**Example system prompt section:**
```markdown
When someone shares feedback:
1. Acknowledge their feedback warmly
2. Ask clarifying questions if needed
3. Store it using the feedback tools
4. Update the feedback site

Use your judgment about importance and categorization.
```
</pattern>

<pattern name="two-layer-git">
## Two-Layer Git Architecture

For self-modifying agents, separate code (shared) from data (instance-specific).

```
GitHub (shared repo):
  src/, site/, package.json        ← tracked, pushed on changes

Instance (Server):
  FROM GITHUB: src/, site/         ← version controlled
  LOCAL ONLY: data/, logs/, .env   ← instance-specific, untracked
```

- Code and site are version controlled (GitHub)
- Raw data stays local (instance-specific)
- Site is generated from data, so reproducible
- Automatic rollback via git history
</pattern>

<pattern name="multi-instance">
## Multi-Instance Branching

Each agent instance gets its own branch while sharing core code.

```
main                        # Shared features, bug fixes
├── instance/feedback-bot
├── instance/support-bot
└── instance/research-bot
```

| Change Type | Work On | Then |
|-------------|---------|------|
| Core features / Bug fixes | main | Merge to instance branches |
| Instance config / data | instance branch | Done |

Key sync tools: `self_deploy` (pull latest from main, restart), `propose_to_main` (create PR to share improvements).
</pattern>

<pattern name="site-as-output">
## Site as Agent Output

The agent generates and maintains a website as a natural output, not through specialized site tools.

```
Event → Agent processes → Agent writes files via write_file → git push → Deploy
```

**Key insight:** Don't build site generation tools. Give the agent file tools and teach it in the prompt how to create good sites.
</pattern>

<pattern name="approval-gates">
## Approval Gates Pattern

Separate "propose" from "apply" for dangerous operations.

```typescript
tool("write_file", async ({ path, content }) => {
  if (requiresApproval(path)) {
    pendingChanges.set(path, content);
    return { text: `Change requires approval.\n\n${diff}\n\nReply "yes" to apply.` };
  }
  writeFileSync(path, content);
  return { text: `Wrote ${path}` };
});
```

**Requires approval:** `src/*.ts`, `package.json`, system prompt changes

**Doesn't require approval:** `data/*`, `site/*`, `docs/*`
</pattern>

<pattern name="unified-agent-architecture">
## Unified Agent Architecture

One execution engine, many agent types. All agents use the same orchestrator but with different configurations (tools, system prompt, model tier).

```text
AgentOrchestrator (lifecycle, checkpoint/resume, tool execution)
    ├── ResearchAgent  (web_search, write_file, read_file)
    ├── ChatAgent      (read_library, publish_to_feed, web_search)
    └── ProfileAgent   (read_photos, write_file, analyze_image)
```

Benefits: consistent lifecycle management, automatic checkpoint/resume (critical for mobile), shared tool protocol, easy to add new agent types.
</pattern>

<pattern name="agent-to-ui-communication">
## Agent-to-UI Communication

When agents take actions, the UI should reflect them immediately.

**Pattern 1: Shared Data Store (Recommended)**
Agent writes through the same service the UI observes. The agent tool calls `SharedService.shared.addItem(item)` — the same singleton the UI's `@StateObject` is bound to.

**Pattern 2: File System Observation**
For file-based data, use a `DirectoryWatcher` that triggers a UI reload when the agent writes files.

**Pattern 3: Event Bus (Cross-Component)**
For complex apps with multiple independent components, emit events from tools and subscribe in UI components.

**What to avoid:** Agent writing directly to a database while UI loads once at startup and never refreshes.
</pattern>

<pattern name="model-tier-selection">
## Model Tier Selection

Use the cheapest model that achieves the outcome.

| Agent Type | Recommended Tier |
|------------|-----------------|
| Chat/Conversation | Balanced |
| Research | Balanced |
| Content Generation | Balanced |
| Complex Analysis / Profile | Powerful |
| Simple Queries | Fast |

Strategies: start with balanced, upgrade only if quality insufficient; use fast tier for tool-heavy loops where each turn is simple; reserve powerful for synthesis tasks.
</pattern>

<design_questions>
## Questions to Ask When Designing

1. **What events trigger agent turns?** (messages, webhooks, timers, user requests)
2. **What primitives does the agent need?** (read, write, call API, restart)
3. **What decisions should the agent make?** (format, structure, priority, action)
4. **What decisions should be hardcoded?** (security boundaries, approval requirements)
5. **How does the agent verify its work?** (health checks, build verification)
6. **How does the agent recover from mistakes?** (git rollback, approval gates)
7. **How does the UI know when agent changes state?** (shared store, file watching, events)
8. **What model tier does each agent type need?** (fast, balanced, powerful)
9. **How do agents share infrastructure?** (unified orchestrator, shared tools)
</design_questions>
