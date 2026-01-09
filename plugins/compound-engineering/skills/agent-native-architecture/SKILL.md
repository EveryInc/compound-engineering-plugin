---
name: agent-native-architecture
description: This skill should be used when building applications where agents are first-class citizens. It applies when designing autonomous agents, creating MCP tools, implementing self-modifying systems, or building apps where features are outcomes achieved by agents operating in a loop.
---

<why_now>
## Why Now

Last year, Claude Code shipped. An LLM with bash and file tools, running in a loop until the job is done, refactored entire codebases. Then people started noticing something: the same architecture that refactors code can organize files, manage reading lists, or automate workflows.

A really good coding agent is actually a really good general-purpose agent.

The Claude Code SDK makes this accessible. Features stop being code you write—they become outcomes you describe, achieved by an agent with tools, operating until the outcome is reached.

This opens a new field: software that works the way Claude Code works, applied to domains far beyond coding.
</why_now>

<primitives>
## Primitives: A Shared Vocabulary

Before diving in, establish what these terms mean:

| Term | Definition |
|------|------------|
| **Tool** | A function the agent can call. On the wire, it's a `tool_use` message with a name and parameters. What you wire to that function determines its nature. |
| **Pure Primitive** | A tool with no business logic—just capability. `read_file`, `write_file`, `list_directory`. Maximum flexibility. |
| **Guided Primitive** | A pure primitive plus a rich description that teaches strategy. The description is JIT context injection. |
| **Domain Tool** | A tool that understands your domain schema. `create_category`, `store_memory`. Still a primitive for its domain. |
| **Orchestrated Action** | A tool that enforces business invariants by bundling operations that must happen together. Use sparingly. |
| **Sub-Agent** | An autonomous agent spawned via tool call. Not a primitive—it makes its own decisions. |
| **Feature** | An outcome the agent achieves. Not code you write, but a prompt you describe. |
| **Harness** | Code that wraps agent operations with guardrails—transactions, validation, approval gates. |

**The key insight:** A tool call is just a mechanism. What you wire to it—primitive, domain operation, or sub-agent—determines how much judgment you're delegating.
</primitives>

<core_principles>
## Core Principles

### 1. Parity

**Whatever the user can do through the UI, the agent should be able to achieve through tools.**

A developer built a beautiful notes app. Folders, tags, rich text—the UI was polished. Then they added an agent.

User: "Create a note summarizing my meeting and tag it as urgent."
Agent: "I don't have a tool to create notes."

The app had buttons for everything. The agent could do nothing. Three weeks of UI work, zero agent capability.

**Parity is the foundational principle.** Without it, nothing else matters.

This isn't about 1:1 mapping—UI button → tool. It's about ensuring the agent can **achieve the same outcomes**. Sometimes that's a single tool (`create_note`). Sometimes it's composing primitives (`write_file` to a notes directory with proper formatting).

A capability map makes this concrete:

| User Action | How Agent Achieves It |
|-------------|----------------------|
| Create a note | `write_file` to notes directory, or `create_note` tool |
| Tag a note as urgent | `update_file` metadata, or `tag_note` tool |
| Search notes | `search_files` or `search_notes` tool |
| Delete a note | `delete_file` or `delete_note` tool |

**The discipline:** When adding any UI capability, ask: can the agent achieve this outcome? If not, add the necessary tools or primitives.

**The test:** Pick any action a user can take in your UI. Describe it to the agent. Can it accomplish the outcome?

---

### 2. Granularity

**Start with atomic primitives. Graduate to domain tools when patterns emerge. Use orchestrated actions for business invariants.**

The real question isn't "primitive or not?" It's: **who should own this decision?**

| Decision Owner | Implementation |
|----------------|----------------|
| **Business rule** (always this way) | Code in tool execution |
| **Tool-specific strategy** (usually this way) | Tool description |
| **Conversation-dependent** (depends on context) | System prompt |
| **Agent judgment** (trust the model) | Neither—let it decide |

**The spectrum in practice:**

```
Pure Primitive          Guided Primitive         Domain Tool              Orchestrated Action
read_file              search_emails            create_category          change_category
                       + search strategy        + schema validation      + always create rule
                         in description                                  + always reclassify
                                                                         + always broadcast

← More flexibility                                                       More guarantees →
← Agent decides everything                                               Code enforces invariants →
```

**When to use each:**

**Pure Primitives** (`read_file`, `write_file`, `bash`)
- Maximum flexibility
- Agent composes them to achieve outcomes
- Default choice when you're unsure

**Guided Primitives** (tool + rich description)
- Tool description teaches strategy without hard-coding it
- Strategy travels with the tool—portable and versionable
- Example: `SearchEmails` with 200 lines teaching "LITERAL → CONTEXTUAL → INTERPRETIVE" search philosophy

**Domain Tools** (`create_category`, `store_memory`)
- Still primitives for their domain—one operation, one entity
- Understand your schema, enforce data integrity
- Agent decides *when* to use them, tool ensures *how* is consistent

**Orchestrated Actions** (`change_category` that always creates a sender rule)
- Business invariant: these operations *must* happen together
- Agent shouldn't make this decision—it's a business rule
- Use sparingly—every one reduces agent flexibility

**The test:** Ask "who should own this decision?" If the answer is "the business, always"—put it in code. If the answer is "depends on context"—put it in prompts. If the answer is "the agent can figure it out"—keep tools atomic.

---

**A concrete example:**

You're building an email app. User changes an email's category.

**Option A: Pure primitives**
```
Tools: update_email, create_sender_rule, reclassify_emails, broadcast_update
Prompt: "When user changes category, also create a sender rule and reclassify similar emails."
```
Agent decides whether to do the extra steps. Flexible. But what if it forgets?

**Option B: Orchestrated action**
```
Tool: change_category (internally: update + rule + reclassify + broadcast)
```
Business invariant: category changes ALWAYS trigger these side effects. Agent can't forget. But now it can't change a category without creating a rule.

**The right answer depends on your domain.** If "category change → sender rule" is a business invariant (it always should happen), use Option B. If it's guidance (usually should happen), use Option A with clear prompting.

---

### 3. Composability

**With atomic tools and parity, new features are just new prompts.**

Monday morning. PM asks for a "weekly review" feature. Traditionally: write a controller, build some queries, create a view. Two days minimum.

With agent-native architecture: write a prompt.

```
"Review files modified this week. Summarize key changes. Based on
incomplete items and approaching deadlines, suggest three priorities
for next week."
```

Ship it. The agent uses `list_files`, `read_file`, and judgment. No weekly-review code exists. The outcome is achieved through composition.

**This works for developers and users.** You can ship new features by adding prompts. Users can customize behavior by modifying prompts or creating their own. "When I say 'file this,' always move it to my Action folder and tag it urgent" becomes a user-level prompt that extends the application.

**The constraint:** This only works if tools are atomic enough to be composed in ways you didn't anticipate, and if the agent has parity with users. If tools encode too much logic, or the agent can't access key capabilities, composition breaks down.

**The test:** Can you add a new feature by writing a new prompt section, without adding new code?

---

### 4. Emergent Capability

**The agent accomplishes things you didn't design for.**

Week three. A user types: "Cross-reference my meeting notes with my task list and tell me what I've committed to but haven't scheduled."

You didn't build a "commitment tracker" feature. You never imagined anyone would want this. But the agent can read notes, read tasks, and reason. It loops until it has an answer.

User gets their answer. You didn't write a line of code.

**This is emergent capability.** When tools are atomic and parity is maintained, users will ask for things you never anticipated—and the agent will figure them out.

**This reveals latent demand.** Instead of guessing what features users want, you observe what they're asking the agent to do. When patterns emerge, optimize them with domain tools or dedicated prompts. You didn't anticipate them—you discovered them.

**The flywheel:**
1. Build with atomic tools and parity
2. Users ask for things you didn't anticipate
3. Agent composes tools to accomplish them (or fails, revealing a gap)
4. You observe patterns in what's being requested
5. Add domain tools or prompts to make common patterns efficient
6. Repeat

You're not imagining every feature upfront. You're creating a capable foundation and learning from what emerges.

**The test:** Give the agent an open-ended request relevant to your domain. Can it figure out a reasonable approach, operating in a loop until it succeeds? If it just says "I don't have a feature for that," your architecture is too constrained.

---

### 5. Improvement Over Time

**Agent-native applications get better through accumulated context and prompt refinement.**

Unlike traditional software, agent-native applications can improve without shipping code:

**Accumulated context:** The agent can maintain state across sessions—what exists, what the user has done, what worked, what didn't. A `context.md` file the agent reads and updates is layer one. More sophisticated approaches involve structured memory and learned preferences.

**Prompt refinement at multiple levels:**
- **Developer level:** You ship updated prompts that change agent behavior for all users
- **User level:** Users customize prompts for their workflow
- **Agent level:** The agent modifies its own prompts based on feedback (advanced)

**Self-modification (advanced):** Agents that can edit their own prompts or even their own code. For production use cases, consider adding safety rails—approval gates, automatic checkpoints for rollback, health checks. This is where things are heading.

The improvement mechanisms are still being discovered. Context and prompt refinement are proven. Self-modification is emerging. What's clear: the architecture supports getting better in ways traditional software doesn't.

**The test:** Does the application work better after a month of use than on day one, even without code changes?
</core_principles>

<deeper_understanding>
## Deeper Understanding: What IS a Tool?

The five principles above give you the "what." This section gives you the "why"—the mental model that makes the principles click.

### The API Doesn't Distinguish

When Claude calls a tool, the API sees a `tool_use` message with a name and parameters. That's it. Whether you've wired up:

- A file read (`read_file`)
- A multi-step business operation (`change_category`)
- An entire autonomous sub-agent (`Task` with `subagent_type: "security-sentinel"`)

...the API sees the same thing: `tool_use`.

**Implication:** "Tool" is an overloaded term. The technical mechanism is identical whether you're reading bytes or spawning a sub-agent that will run for five minutes and make fifty decisions.

When we say "tools should be primitives," we're talking about design intent, not technical mechanism.

### Sub-Agents Break the Primitive Model

Consider Claude Code's `Task` tool:

```typescript
Task({
  subagent_type: "security-sentinel",
  prompt: "Audit this code for vulnerabilities"
})
```

This is a tool call. But what it spawns is an autonomous agent with:
- Its own system prompt
- Its own tools
- Its own judgment
- A multi-turn execution loop

Is that a "primitive"? Technically it's a function call. Conceptually, it's spawning an entity with agency.

**The lesson:** Don't get dogmatic about "primitives." The real question is: how much judgment are you delegating, and to whom?

### Tool Descriptions as JIT Context Injection

Here's where the "primitives only" guidance breaks down in practice.

Tool descriptions aren't documentation—they're **just-in-time context injection**. When the model sees a tool, it absorbs the description as working context. A 200-line tool description is 200 lines of context that:

- Only loads when that tool is available
- Can be swapped by swapping the tool
- Disappears when the tool is removed

This is **modular prompting**.

```
┌─────────────────────────────────────┐
│         System Prompt               │  ← Core identity, always present
│    (small, stable, universal)       │
└─────────────────────────────────────┘
              ↓ tool injection ↓
┌───────────┐ ┌───────────┐ ┌───────────┐
│ SearchTool│ │ WriteTool │ │AnalyzeTool│  ← Each carries its own context
│ + strategy│ │ + style   │ │ + method  │
└───────────┘ └───────────┘ └───────────┘
```

If you put all strategy in the system prompt:
- System prompt grows with every capability
- Removing a tool doesn't remove its guidance
- You can't swap strategies by swapping tools

If you put strategy in tool descriptions:
- System prompt stays small and focused
- Each tool is self-contained and portable
- Swap `SearchEmailsLiteral` for `SearchEmailsContextual`—different behavior, no code change

**Example:** CORA's `SearchEmails` tool has a 200-line description teaching a three-phase search strategy. This strategy is specific to email searching. It travels with the tool. It can be versioned independently. It doesn't bloat the main system prompt.

### The Harness Pattern

Sometimes you WANT code to enforce behavior:

```ruby
def change_category(email_id:, new_category:)
  ActiveRecord::Base.transaction do
    email.update!(category: new_category)    # Step 1
    create_sender_rule!(email.sender)        # Step 2
    reclassify_similar_emails!(email.sender) # Step 3
    broadcast_refresh!                       # Step 4
  end
end
```

This is intentional constraint. When users change a category, we ALWAYS want a sender rule created. This is a business invariant, not an agent decision.

**Principle:** Use code harnesses for business invariants. Use prompts for flexible behavior.

### The Decision Framework

Stop asking "is this a primitive?" Start asking:

| Question | Answer | Implementation |
|----------|--------|----------------|
| Is this behavior **always true**? | Yes → | Code in tool execution |
| Is this behavior **usually true for this tool**? | Yes → | Tool description |
| Is this behavior **context-dependent**? | Yes → | System prompt |
| Should the **agent figure this out**? | Yes → | Neither—trust judgment |

**A worked example:**

"Emails should be searched using literal keywords first, then contextual expansion, then interpretive reframing."

- Is this always true? No—sometimes users want exact matches only.
- Is this usually true for SearchEmails? **Yes.** Put it in the tool description.
- Is this context-dependent? Partially—but the tool description can say "unless user specifies otherwise."
- Should agent figure it out? It could, but teaching it makes results more consistent.

**Result:** 200-line tool description that teaches the strategy. Agent absorbs it when SearchEmails is available. Strategy travels with the tool.
</deeper_understanding>

<intake>
## What aspect of agent-native architecture do you need help with?

1. **Design architecture** - Plan a new agent-native system from scratch
2. **Files & workspace** - Use files as the universal interface, shared workspace patterns
3. **Tool design** - Build primitive tools, dynamic capability discovery, CRUD completeness
4. **Domain tools** - Know when to add domain tools vs stay with primitives
5. **Execution patterns** - Completion signals, partial completion, context limits
6. **System prompts** - Define agent behavior in prompts, judgment criteria
7. **Context injection** - Inject runtime app state into agent prompts
8. **Action parity** - Ensure agents can do everything users can do
9. **Self-modification** - Enable agents to safely evolve themselves
10. **Product design** - Progressive disclosure, latent demand, approval patterns
11. **Mobile patterns** - iOS storage, background execution, checkpoint/resume
12. **Testing** - Test agent-native apps for capability and parity
13. **Refactoring** - Make existing code more agent-native

**Wait for response before proceeding.**
</intake>

<routing>
| Response | Action |
|----------|--------|
| 1, "design", "architecture", "plan" | Read [architecture-patterns.md](./references/architecture-patterns.md), then apply Architecture Checklist below |
| 2, "files", "workspace", "filesystem" | Read [files-universal-interface.md](./references/files-universal-interface.md) and [shared-workspace-architecture.md](./references/shared-workspace-architecture.md) |
| 3, "tool", "mcp", "primitive", "crud" | Read [mcp-tool-design.md](./references/mcp-tool-design.md) |
| 4, "domain tool", "when to add" | Read [from-primitives-to-domain-tools.md](./references/from-primitives-to-domain-tools.md) |
| 5, "execution", "completion", "loop" | Read [agent-execution-patterns.md](./references/agent-execution-patterns.md) |
| 6, "prompt", "system prompt", "behavior" | Read [system-prompt-design.md](./references/system-prompt-design.md) |
| 7, "context", "inject", "runtime", "dynamic" | Read [dynamic-context-injection.md](./references/dynamic-context-injection.md) |
| 8, "parity", "ui action", "capability map" | Read [action-parity-discipline.md](./references/action-parity-discipline.md) |
| 9, "self-modify", "evolve", "git" | Read [self-modification.md](./references/self-modification.md) |
| 10, "product", "progressive", "approval", "latent demand" | Read [product-implications.md](./references/product-implications.md) |
| 11, "mobile", "ios", "android", "background", "checkpoint" | Read [mobile-patterns.md](./references/mobile-patterns.md) |
| 12, "test", "testing", "verify", "validate" | Read [agent-native-testing.md](./references/agent-native-testing.md) |
| 13, "review", "refactor", "existing" | Read [refactoring-to-prompt-native.md](./references/refactoring-to-prompt-native.md) |

**After reading the reference, apply those patterns to the user's specific context.**
</routing>

<architecture_checklist>
## Architecture Review Checklist

When designing an agent-native system, verify these **before implementation**:

### Core Principles
- [ ] **Parity:** Every UI action has a corresponding agent capability
- [ ] **Granularity:** Tools are primitives; features are prompt-defined outcomes
- [ ] **Composability:** New features can be added via prompts alone
- [ ] **Emergent Capability:** Agent can handle open-ended requests in your domain

### Tool Design
- [ ] **Right level of granularity:** Pure primitives for flexibility, orchestrated actions for business invariants
- [ ] **Decision ownership clear:** For each tool, you know whether logic belongs in code, description, or prompt
- [ ] **Dynamic vs Static:** For external APIs where agent should have full access, use Dynamic Capability Discovery
- [ ] **CRUD Completeness:** Every entity has create, read, update, AND delete
- [ ] **JIT Context Injection:** Tool-specific strategy lives in tool descriptions, not bloating system prompt
- [ ] **API as Validator:** Use `z.string()` inputs when the API validates, not `z.enum()`

### Files & Workspace
- [ ] **Shared Workspace:** Agent and user work in same data space
- [ ] **context.md Pattern:** Agent reads/updates context file for accumulated knowledge
- [ ] **File Organization:** Entity-scoped directories with consistent naming

### Agent Execution
- [ ] **Completion Signals:** Agent has explicit `complete_task` tool (not heuristic detection)
- [ ] **Partial Completion:** Multi-step tasks track progress for resume
- [ ] **Context Limits:** Designed for bounded context from the start

### Context Injection
- [ ] **Available Resources:** System prompt includes what exists (files, data, types)
- [ ] **Available Capabilities:** System prompt documents tools with user vocabulary
- [ ] **Dynamic Context:** Context refreshes for long sessions (or provide `refresh_context` tool)

### UI Integration
- [ ] **Agent → UI:** Agent changes reflect in UI (shared service, file watching, or event bus)
- [ ] **No Silent Actions:** Agent writes trigger UI updates immediately
- [ ] **Capability Discovery:** Users can learn what agent can do

### Mobile (if applicable)
- [ ] **Checkpoint/Resume:** Handle iOS app suspension gracefully
- [ ] **iCloud Storage:** iCloud-first with local fallback for multi-device sync
- [ ] **Cost Awareness:** Model tier selection (Haiku/Sonnet/Opus)

**When designing architecture, explicitly address each checkbox in your plan.**
</architecture_checklist>

<quick_start>
## Quick Start: Build an Agent-Native Feature

**Step 1: Define atomic tools**
```typescript
const tools = [
  tool("read_file", "Read any file", { path: z.string() }, ...),
  tool("write_file", "Write any file", { path: z.string(), content: z.string() }, ...),
  tool("list_files", "List directory", { path: z.string() }, ...),
  tool("complete_task", "Signal task completion", { summary: z.string() }, ...),
];
```

**Step 2: Write behavior in the system prompt**
```markdown
## Your Responsibilities
When asked to organize content, you should:
1. Read existing files to understand the structure
2. Analyze what organization makes sense
3. Create/move files using your tools
4. Use your judgment about layout and formatting
5. Call complete_task when you're done

You decide the structure. Make it good.
```

**Step 3: Let the agent work in a loop**
```typescript
const result = await agent.run({
  prompt: userMessage,
  tools: tools,
  systemPrompt: systemPrompt,
  // Agent loops until it calls complete_task
});
```
</quick_start>

<reference_index>
## Reference Files

All references in `references/`:

**Core Patterns:**
- [architecture-patterns.md](./references/architecture-patterns.md) - Event-driven, unified orchestrator, agent-to-UI
- [files-universal-interface.md](./references/files-universal-interface.md) - Why files, organization patterns, context.md
- [mcp-tool-design.md](./references/mcp-tool-design.md) - Tool design, dynamic capability discovery, CRUD
- [from-primitives-to-domain-tools.md](./references/from-primitives-to-domain-tools.md) - When to add domain tools, graduating to code
- [agent-execution-patterns.md](./references/agent-execution-patterns.md) - Completion signals, partial completion, context limits
- [system-prompt-design.md](./references/system-prompt-design.md) - Features as prompts, judgment criteria

**Agent-Native Disciplines:**
- [dynamic-context-injection.md](./references/dynamic-context-injection.md) - Runtime context, what to inject
- [action-parity-discipline.md](./references/action-parity-discipline.md) - Capability mapping, parity workflow
- [shared-workspace-architecture.md](./references/shared-workspace-architecture.md) - Shared data space, UI integration
- [product-implications.md](./references/product-implications.md) - Progressive disclosure, latent demand, approval
- [agent-native-testing.md](./references/agent-native-testing.md) - Testing outcomes, parity tests

**Platform-Specific:**
- [mobile-patterns.md](./references/mobile-patterns.md) - iOS storage, checkpoint/resume, cost awareness
- [self-modification.md](./references/self-modification.md) - Git-based evolution, guardrails
- [refactoring-to-prompt-native.md](./references/refactoring-to-prompt-native.md) - Migrating existing code
</reference_index>

<anti_patterns>
## Anti-Patterns (and When They're Actually Fine)

### Architectural Patterns Worth Questioning

These patterns limit agent capability. Sometimes that's the right trade-off. Usually it isn't.

**Agent as router** — The agent figures out what the user wants, then calls the right function. The agent's intelligence routes, not acts.
- *When it's wrong:* You're leaving 90% of agent capability on the table.
- *When it's fine:* High-stakes operations where you want human-designed workflows.

**Build the app, then add agent** — You build features as code, then expose them to an agent.
- *When it's wrong:* No emergent capability—agent can only do what you pre-built.
- *When it's fine:* You're adding agent capabilities to an existing product incrementally.

**Request/response thinking** — Agent does one thing and returns.
- *When it's wrong:* The agent can't handle unexpected situations or iterate.
- *When it's fine:* Simple, well-defined tasks that don't benefit from a loop.

**Defensive tool design** — Strict enums, validation at every layer.
- *When it's wrong:* Prevents the agent from doing things you didn't anticipate.
- *When it's fine:* Truly constrained domains where invalid inputs would be dangerous.

---

### Judgment Calls (Not Simply "Wrong")

The original guidance labeled these as anti-patterns. In practice, they're trade-offs.

**Logic in tool implementations**

```typescript
// Previously labeled "WRONG":
tool("process_feedback", async ({ message }) => {
  const category = categorize(message);
  const priority = calculatePriority(message);
  await store(message, category, priority);
  if (priority > 3) await notify();
});
```

**Ask:** Who should own these decisions?

- If categorization and priority are *business invariants* (must always work this way): **put it in code**. The agent shouldn't be able to forget to notify on high-priority items.
- If categorization and priority are *judgment calls* (should usually work this way): **put it in prompts**. Let the agent adapt to context.

The question isn't "is there logic in the tool?" It's "should this logic be agent-decidable?"

**Logic in tool descriptions**

A 200-line tool description that teaches search strategy isn't an anti-pattern—it's JIT context injection. The strategy travels with the tool, keeps the system prompt small, and can be swapped by swapping tools.

**When it's wrong:** You put *context-dependent* logic in the description that should be in the system prompt.
**When it's fine:** The logic is *tool-specific* and should travel with the tool.

**Orchestrated multi-step operations**

```ruby
def change_category(email_id:, new_category:)
  ActiveRecord::Base.transaction do
    email.update!(category: new_category)
    create_sender_rule!(email.sender)
    reclassify_similar_emails!(email.sender)
  end
end
```

**When it's wrong:** You're encoding *flexible behavior* that the agent should be able to vary.
**When it's fine:** These operations must *always* happen together—it's a business invariant.

---

### Actual Anti-Patterns (These Are Always Problems)

**Context starvation** — Agent doesn't know what exists in the app.
```
User: "Write something about Catherine the Great in my feed"
Agent: "What feed? I don't understand what system you're referring to."
```
*Fix:* Inject available resources, capabilities, and vocabulary into system prompt.

**Orphan UI actions** — User can do something through UI that agent can't achieve.
*Fix:* Maintain parity. If users can do it, agents should be able to achieve it.

**Silent actions** — Agent changes state but UI doesn't update.
*Fix:* Shared data stores with reactive binding, or file system observation.

**Heuristic completion detection** — Detecting completion through heuristics (consecutive iterations without tool calls, checking for output files).
*Fix:* Explicit `complete_task` tool. Don't guess.

**Static tool mapping for dynamic APIs** — 50 tools for 50 API endpoints.
```typescript
// Problematic:
tool("read_steps", ...)
tool("read_heart_rate", ...)
// Adding glucose tracking requires code change

// Better:
tool("list_available_types", ...)
tool("read_health_data", { dataType: z.string() }, ...)
```

**Incomplete CRUD** — Agent can create but not update or delete.
*Fix:* Every entity needs full CRUD. Otherwise the agent can't fix mistakes.

**Sandbox isolation** — Agent works in separate data space from user.
*Fix:* Shared workspace where both operate on same files.

**Gates without reason** — Domain tool is the only way to do something, and you didn't intend to restrict access.
*Fix:* Default to open. Keep primitives available unless there's specific reason to gate.

**Encoding contextual interpretation in code** — Tool returns "HIGH_VOLUME" vs "NEEDS_CLEANUP" based on counts, when interpretation depends on user context.
```ruby
# Problematic:
def inbox_state(count)
  case count
  when 0..100 then "READY"
  when 101..500 then "NEEDS_CLEANUP"
  else "HIGH_VOLUME"
  end
end
```
User with 200 emails who checks daily ≠ user with 200 emails who checks weekly.
*Fix:* Return raw data. Let agent (or prompt) interpret based on context.
</anti_patterns>

<success_criteria>
## Success Criteria

You've built an agent-native application when:

### Architecture
- [ ] The agent can achieve anything users can achieve through the UI (parity)
- [ ] Tool granularity matches decision ownership—primitives for flexibility, orchestrated actions for invariants
- [ ] New features can be added by writing new prompts (composability)
- [ ] The agent can accomplish tasks you didn't explicitly design for (emergent capability)
- [ ] For each behavior, you can answer: "who owns this decision?"

### Implementation
- [ ] System prompt includes dynamic context about app state (kept small and focused)
- [ ] Tool-specific strategy lives in tool descriptions, not system prompt (JIT context injection)
- [ ] Every UI action has a corresponding agent capability (action parity)
- [ ] Agent and user work in the same data space (shared workspace)
- [ ] Agent actions are immediately reflected in the UI
- [ ] Every entity has full CRUD (Create, Read, Update, Delete)
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

**Describe an outcome to the agent that's within your application's domain but that you didn't build a specific feature for.**

Can it figure out how to accomplish it, operating in a loop until it succeeds?

If yes, you've built something agent-native.

If it says "I don't have a feature for that"—your architecture is still too constrained.
</success_criteria>
