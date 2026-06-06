# Platform-Specific Tool Names

This file centralizes the harness-specific tool call names used in
SKILL.md so the orchestrator flows don't repeat platform conditional logic.

## Blocking User Input (Interactive Gates)

When SKILL.md requires a blocking question in interactive mode, use the
platform's native blocking question tool:

| Platform        | Tool Call                                                                                        |
| --------------- | ------------------------------------------------------------------------------------------------ |
| **Claude Code** | `AskUserQuestion` (call `ToolSearch` with `select:AskUserQuestion` first if schema isn't loaded) |
| **Codex**       | `request_user_input`                                                                             |
| **Gemini**      | `ask_user`                                                                                       |
| **Pi**          | `ask_user` (requires the `pi-ask-user` extension)                                                |

**Fallback rule:** If no blocking tool exists in the harness or the call
errors (e.g., Codex edit modes), fall back to presenting numbered options in
chat. Do not silently skip the question.

**When to apply:** Full vs Lightweight prompt, session history opt-in, and
the "What's next?" question at the end of interactive runs. This file's
content is informational only — don't imperatively restate these rules in
the SKILL.md flow; the flow just references this file for the tool names.

## Skill Invocation (ce-sessions)

When invoking another skill from within this skill:

| Platform        | Primitive                             |
| --------------- | ------------------------------------- |
| **Claude Code** | `Skill` tool                          |
| **Codex**       | `Skill` tool                          |
| **Gemini**      | Equivalent skill-invocation primitive |
| **Pi**          | Equivalent skill-invocation primitive |

Reference the `ce-sessions` skill using its bare name (`ce-sessions`) — the
`ce-` prefix identifies it as a component of this plugin.
