---
date: 2026-02-14
topic: copilot-converter-target
---

# Add GitHub Copilot Converter Target

## What We're Building

A new converter target that transforms the compound-engineering Claude Code plugin into GitHub Copilot's native format. This follows the same established pattern as the existing converters (Cursor, Codex, OpenCode, Droid, Pi) and outputs files that Copilot can consume directly from `.github/` (repo-level) or `~/.copilot/` (user-wide).

Copilot's customization system (as of early 2026) supports: custom agents (`.agent.md`), agent skills (`SKILL.md`), prompt files (`.prompt.md`), custom instructions (`copilot-instructions.md`), and MCP servers (via repo settings).

## Why This Approach

The repository already has a robust multi-target converter infrastructure with a consistent `TargetHandler` pattern. Adding Copilot as a new target follows this proven pattern rather than inventing something new. Copilot's format is close enough to Claude Code's that the conversion is straightforward, and the SKILL.md format is already cross-compatible.

### Approaches Considered

1. **Full converter target (chosen)** — Follow the existing pattern with types, converter, writer, and target registration. Most consistent with codebase conventions.
2. **Minimal agent-only converter** — Only convert agents, skip commands/skills. Too limited; users would lose most of the plugin's value.
3. **Documentation-only approach** — Just document how to manually set up Copilot. Doesn't compound — every user would repeat the work.

## Key Decisions

### Component Mapping

| Claude Code Component | Copilot Equivalent | Notes |
|----------------------|-------------------|-------|
| **Agents** (`.md`) | **Custom Agents** (`.agent.md`) | Full frontmatter mapping: description, tools, target, infer |
| **Commands** (`.md`) | **Agent Skills** (`SKILL.md`) | Commands become skills since Copilot has no direct command equivalent. `allowed-tools` dropped silently. |
| **Skills** (`SKILL.md`) | **Agent Skills** (`SKILL.md`) | Copy as-is — format is already cross-compatible |
| **MCP Servers** | **Repo settings JSON** | Generate a `copilot-mcp-config.json` users paste into GitHub repo settings |
| **Hooks** | **Skipped with warning** | Copilot doesn't have a hooks equivalent |

### Agent Frontmatter Mapping

| Claude Field | Copilot Field | Mapping |
|-------------|--------------|---------|
| `name` | `name` | Direct pass-through |
| `description` | `description` (required) | Direct pass-through, generate fallback if missing |
| `capabilities` | Body text | Fold into body as "## Capabilities" section (like Cursor) |
| `model` | `model` | Pass through (works in IDE, may be ignored on github.com) |
| — | `tools` | Default to `["*"]` (all tools). Claude agents have unrestricted tool access, so Copilot agents should too. |
| — | `target` | Omit (defaults to `both` — IDE + github.com) |
| — | `infer` | Set to `true` (auto-selection enabled) |

### Output Directories

- **Repository-level (default):** `.github/agents/`, `.github/skills/`
- **User-wide (with --personal flag):** `~/.copilot/skills/` (only skills supported at this level)

### Content Transformation

Apply transformations similar to Cursor converter:

1. **Task agent calls:** `Task agent-name(args)` → `Use the agent-name skill to: args`
2. **Slash commands:** `/workflows:plan` → `/plan` (flatten namespace)
3. **Path rewriting:** `.claude/` → `.github/` (Copilot's repo-level config path)
4. **Agent references:** `@agent-name` → `the agent-name agent`

### MCP Server Handling

Generate a `copilot-mcp-config.json` file with the structure Copilot expects:

```json
{
  "mcpServers": {
    "server-name": {
      "type": "local",
      "command": "npx",
      "args": ["package"],
      "tools": ["*"],
      "env": {
        "KEY": "COPILOT_MCP_KEY"
      }
    }
  }
}
```

Note: Copilot requires env vars to use the `COPILOT_MCP_` prefix. The converter should transform env var names accordingly and include a comment/note about this.

## Files to Create/Modify

### New Files

- `src/types/copilot.ts` — Type definitions (CopilotAgent, CopilotSkill, CopilotBundle, etc.)
- `src/converters/claude-to-copilot.ts` — Converter with `transformContentForCopilot()`
- `src/targets/copilot.ts` — Writer with `writeCopilotBundle()`
- `docs/specs/copilot.md` — Format specification document

### Modified Files

- `src/targets/index.ts` — Register copilot target handler
- `src/commands/sync.ts` — Add "copilot" to valid sync targets

### Test Files

- `tests/copilot-converter.test.ts` — Converter tests following existing patterns

### Character Limit

Copilot imposes a 30,000 character limit on agent body content. If an agent body exceeds this after folding in capabilities, the converter should truncate with a warning to stderr.

### Agent File Extension

Use `.agent.md` (not plain `.md`). This is the canonical Copilot convention and makes agent files immediately identifiable.

## Open Questions

- Should the converter generate a `copilot-setup-steps.yml` workflow file for MCP servers that need special dependencies (e.g., `uv`, `pipx`)?
- Should `.github/copilot-instructions.md` be generated with any base instructions from the plugin?

## Next Steps

→ `/workflows:plan` for implementation details
