<overview>
How to design MCP tools following prompt-native principles. Tools should be primitives that enable capability, not workflows that encode decisions.

**Core principle:** Whatever a user can do, the agent should be able to do. Don't artificially limit the agent—give it the same primitives a power user would have.
</overview>

<principle name="primitives-not-workflows">
## Tools Are Primitives, Not Workflows

Tools accept data. The agent decides what to do.

| Wrong | Right |
|-------|-------|
| `process_user_feedback` | `store_item` |
| `create_feedback_summary` | `write_file` |
| `send_notification` | `send_message` |
| `deploy_to_production` | `git_push` |

The prompt tells the agent *when* to use primitives. The tool just provides *capability*.

**Wrong:** Tool accepts decisions (format enum, style enum, category enum)
**Right:** Tool accepts data (path, content, key, value) — agent decides what to write
</principle>

<principle name="rich-outputs">
## Outputs Should Be Rich

Return enough information for the agent to verify and iterate. Include what existed before, what changed, and what remains. A delete tool should confirm the key existed and how many items remain.
</principle>

<principle name="dynamic-capability-discovery">
## Dynamic vs. Static Tool Mapping

**Static (anti-pattern for agent-native):** Build individual tools for each API capability. Always out of date, limits agent to only what you anticipated.

**Dynamic (preferred):** Build a meta-tool that discovers what's available, and a generic tool that can access anything by type name (string, not enum). The API validates the type, not your code.

| Dynamic (Agent-Native) | Static (Constrained Agent) |
|------------------------|---------------------------|
| Agent should access anything user can | Agent has intentionally limited scope |
| External API with many endpoints (HealthKit, HomeKit, GraphQL) | Internal domain with fixed operations |
| API evolves independently of your code | Tightly coupled domain logic |
| You want full action parity | You want strict guardrails |

**The agent-native default is Dynamic.** Pattern: one `list_*` discovery tool + one generic access tool with a string type parameter. Inject available capabilities into the system prompt at agent start so the agent knows what's available without calling the discovery tool every time.
</principle>

<principle name="crud-completeness">
## CRUD Completeness

Every entity the agent can create, it should be able to read, update, and delete. Incomplete CRUD = broken action parity.

**The CRUD Audit:** For each entity type, verify:
- [ ] Create: Agent can create new instances
- [ ] Read: Agent can query/search/list instances
- [ ] Update: Agent can modify existing instances
- [ ] Delete: Agent can remove instances

If any operation is missing, users will eventually ask for it and the agent will fail.
</principle>

<checklist>
## MCP Tool Design Checklist

**Fundamentals:**
- [ ] Tool names describe capability, not use case
- [ ] Inputs are data, not decisions
- [ ] Outputs are rich (enough for agent to verify)
- [ ] CRUD operations are separate tools (not one mega-tool)
- [ ] No business logic in tool implementations
- [ ] Error states clearly communicated via `isError`
- [ ] Descriptions explain what the tool does, not when to use it

**Dynamic Capability Discovery (for agent-native apps):**
- [ ] For external APIs where agent should have full access, use dynamic discovery
- [ ] Include a `list_*` or `discover_*` tool for each API surface
- [ ] Use string inputs (not enums) when the API validates
- [ ] Inject available capabilities into system prompt at runtime
- [ ] Only use static tool mapping if intentionally limiting agent scope

**CRUD Completeness:**
- [ ] Every entity has create, read, update, delete operations
- [ ] Every UI action has a corresponding agent tool
- [ ] Test: "Can the agent undo what it just did?"
</checklist>
