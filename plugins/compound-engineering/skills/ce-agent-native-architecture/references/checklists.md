<overview>
Consolidated review material for agent-native systems: an architecture checklist for the design phase, anti-patterns to avoid, and success criteria for verifying a built system. Pull whichever section fits the moment.
</overview>

<architecture_checklist>
## Architecture Checklist

Verify these **before implementation** when designing an agent-native system.

### Core Principles
- [ ] **Parity:** Every UI action has a corresponding agent capability
- [ ] **Granularity:** Tools are primitives; features are prompt-defined outcomes
- [ ] **Composability:** New features can be added via prompts alone
- [ ] **Emergent Capability:** Agent can handle open-ended requests in your domain

### Tool Design
- [ ] **Dynamic vs Static:** For external APIs where the agent should have full access, use dynamic capability discovery
- [ ] **CRUD Completeness:** Every entity has create, read, update, AND delete
- [ ] **Primitives not Workflows:** Tools enable capability, don't encode business logic
- [ ] **API as Validator:** Use `z.string()` inputs when the API validates, not `z.enum()`

### Files & Workspace
- [ ] **Shared Workspace:** Agent and user work in the same data space
- [ ] **context.md Pattern:** Agent reads/updates a context file for accumulated knowledge
- [ ] **File Organization:** Entity-scoped directories with consistent naming

### Agent Execution
- [ ] **Completion Signals:** Agent has an explicit `complete_task` tool (not heuristic detection)
- [ ] **Partial Completion:** Multi-step tasks track progress for resume
- [ ] **Context Limits:** Designed for bounded context from the start

### Context Injection
- [ ] **Available Resources:** System prompt includes what exists (files, data, types)
- [ ] **Available Capabilities:** System prompt documents tools with user vocabulary
- [ ] **Dynamic Context:** Context refreshes for long sessions (or provide a `refresh_context` tool)

### UI Integration
- [ ] **Agent → UI:** Agent changes reflect in UI (shared service, file watching, or event bus)
- [ ] **No Silent Actions:** Agent writes trigger UI updates immediately
- [ ] **Capability Discovery:** Users can learn what the agent can do

### Mobile (if applicable)
- [ ] **Checkpoint/Resume:** Handle iOS app suspension gracefully
- [ ] **iCloud Storage:** iCloud-first with local fallback for multi-device sync
- [ ] **Cost Awareness:** Model tier selection (Haiku/Sonnet/Opus)
</architecture_checklist>

<anti_patterns>
## Anti-Patterns

### Common Approaches That Aren't Fully Agent-Native

These aren't necessarily wrong—they may be appropriate for your use case. But they're different from the architecture this skill describes.

**Agent as router** — The agent figures out what the user wants, then calls the right function. The agent's intelligence is used to route, not to act. Uses a fraction of what agents can do.

**Build the app, then add agent** — You build features the traditional way (as code), then expose them to an agent. The agent can only do what your features already do. You won't get emergent capability.

**Request/response thinking** — Agent gets input, does one thing, returns output. Misses the loop: agent gets an outcome to achieve, operates until it's done, handles unexpected situations along the way.

**Defensive tool design** — Over-constrained tool inputs (strict enums, validation at every layer) borrowed from defensive programming. Safe, but prevents the agent from doing things you didn't anticipate.

**Happy path in code, agent just executes** — Traditional software handles edge cases in code. Agent-native lets the agent handle edge cases with judgment. If your code handles all the edge cases, the agent is just a caller.

---

### Specific Anti-Patterns

**THE CARDINAL SIN: Agent executes your code instead of figuring things out**

```typescript
// WRONG - You wrote the workflow, agent just executes it
tool("process_feedback", async ({ message }) => {
  const category = categorize(message);      // Your code decides
  const priority = calculatePriority(message); // Your code decides
  await store(message, category, priority);   // Your code orchestrates
  if (priority > 3) await notify();           // Your code decides
});

// RIGHT - Agent figures out how to process feedback
tools: store_item, send_message  // Primitives
prompt: "Rate importance 1-5 based on actionability, store feedback, notify if >= 4"
```

**Workflow-shaped tools** — `analyze_and_organize` bundles judgment into the tool. Break into primitives and let the agent compose them.

**Context starvation** — Agent doesn't know what resources exist in the app.
```
User: "Write something about Catherine the Great in my feed"
Agent: "What feed? I don't understand what system you're referring to."
```
Fix: inject available resources, capabilities, and vocabulary into the system prompt.

**Orphan UI actions** — User can do something through the UI that the agent can't achieve. Fix: maintain parity.

**Silent actions** — Agent changes state but UI doesn't update. Fix: shared data stores with reactive binding, or file system observation.

**Heuristic completion detection** — Detecting agent completion through heuristics (consecutive iterations without tool calls, checking for expected output files). Fragile. Fix: require agents to explicitly signal completion through a `complete_task` tool.

**Static tool mapping for dynamic APIs** — Building 50 tools for 50 API endpoints when a `discover` + `access` pattern would give more flexibility.
```typescript
// WRONG - Every API type needs a hardcoded tool
tool("read_steps", ...)
tool("read_heart_rate", ...)
tool("read_sleep", ...)

// RIGHT - Dynamic capability discovery
tool("list_available_types", ...)
tool("read_health_data", { dataType: z.string() }, ...)
```

**Incomplete CRUD** — Agent can create but not update or delete.
```typescript
// User: "Delete that journal entry"
// Agent: "I don't have a tool for that"
tool("create_journal_entry", ...)  // Missing: update, delete
```
Fix: every entity needs full CRUD.

**Sandbox isolation** — Agent works in a separate data space from the user.
```
Documents/
├── user_files/        ← User's space
└── agent_output/      ← Agent's space (isolated)
```
Fix: shared workspace where both operate on the same files.

**Gates without reason** — Domain tool is the only way to do something, and you didn't intend to restrict access. Default is open. Keep primitives available unless there's a specific reason to gate.

**Artificial capability limits** — Restricting what the agent can do out of vague safety concerns rather than specific risks. The agent should generally be able to do what users can do.
</anti_patterns>

<success_criteria>
## Success Criteria

A system is agent-native when:

### Architecture
- [ ] The agent can achieve anything users can achieve through the UI (parity)
- [ ] Tools are atomic primitives; domain tools are shortcuts, not gates (granularity)
- [ ] New features can be added by writing new prompts (composability)
- [ ] The agent can accomplish tasks you didn't explicitly design for (emergent capability)
- [ ] Changing behavior means editing prompts, not refactoring code

### Implementation
- [ ] System prompt includes dynamic context about app state
- [ ] Every UI action has a corresponding agent tool
- [ ] Agent tools are documented in the system prompt with user vocabulary
- [ ] Agent and user work in the same data space
- [ ] Agent actions are immediately reflected in the UI
- [ ] Every entity has full CRUD
- [ ] Agents explicitly signal completion (no heuristic detection)
- [ ] context.md or equivalent for accumulated knowledge

### Product
- [ ] Simple requests work immediately with no learning curve
- [ ] Power users can push the system in unexpected directions
- [ ] You're learning what users want by observing what they ask the agent to do
- [ ] Approval requirements match stakes and reversibility

### Mobile (if applicable)
- [ ] Checkpoint/resume handles app interruption
- [ ] iCloud-first storage with local fallback
- [ ] Background execution uses available time wisely
- [ ] Model tier matched to task complexity

---

### The Ultimate Test

Describe an outcome to the agent that's within your application's domain but that you didn't build a specific feature for. Can it figure out how to accomplish it, operating in a loop until it succeeds?

If yes, the system is agent-native. If it says "I don't have a feature for that," the architecture is still too constrained.
</success_criteria>
