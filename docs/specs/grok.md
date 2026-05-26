# Grok Target Spec

Last verified: 2026-05-20 (U7 of the Grok converter target implementation)

## Overview

The `compound-engineering-plugin` converter supports `--to grok` (and `--also grok`) to produce a self-contained Grok plugin from a Claude Code plugin source.

Grok uses a **clean provider root** layout (no managed-artifacts or heavy manifests like Gemini/Kiro). The output is a directory you can pass directly to `grok plugin install <path>` or load via `--plugin-dir`.

## Primary sources

- Observed behavior of Grok build TUI / `grok` CLI plugin system (2026-05)
- `~/.grok/docs/user-guide/` (09-plugins.md, 08-skills.md, 16-subagents.md)
- Implementation in this repository:
  - `src/types/grok.ts`
  - `src/converters/claude-to-grok.ts`
  - `src/utils/grok-content.ts` (authoritative tool + dispatch transforms)
  - `src/targets/grok.ts` (writer)

## Plugin layout (self-contained / clean root)

A Grok plugin produced by this converter has this shape at the root:

```
<plugin-name>/
├── plugin.json
├── agents/
│   └── ce-*.md                 # Grok-style frontmatter + body
├── skills/
│   └── <skill-name>/
│       ├── SKILL.md
│       ├── references/
│       └── scripts/...
├── commands/                   # optional (currently empty for CE)
│   └── *.md
└── .mcp.json                   # present only if MCP servers were declared
```

- No `.grok/` nesting or per-plugin managed manifests.
- Skills are copied with `transformContentForGrok(..., true)` (SKILL.md + all `*.md` references).
- Agents are already transformed by the converter (see frontmatter table below).

## plugin.json

Minimal required shape (produced by the writer):

```json
{
  "name": "compound-engineering",
  "version": "0.0.0-dev-grok",
  "description": "Compound Engineering skills and agents (converted for Grok)"
}
```

## Agents

### Frontmatter mapping (Claude → Grok)

The converter performs an explicit mechanical mapping (see `convertAgent` in `claude-to-grok.ts`):

| Claude source field       | Grok output                  | Notes |
|---------------------------|------------------------------|-------|
| `name`                    | `name` (sanitized)           | Normalized to lowercase kebab |
| `description`             | `description`                | Sanitized + truncated to ~2000 chars |
| `capabilities`            | Prepended as `## Capabilities` section in body | Only if present |
| (no equivalent)           | `prompt_mode: "full"`        | Always set |
| `model`                   | `model: "inherit"`           | Preserves source intent |
| (no equivalent)           | `permission_mode: "default"` | Always set |
| (no equivalent)           | `agents_md: true`            | Always set (enables CLAUDE.md / AGENTS.md style loading) |

Example converted agent frontmatter:

```yaml
---
name: ce-correctness-reviewer
description: Logic errors, edge cases, state bugs...
prompt_mode: full
model: inherit
permission_mode: default
agents_md: true
---
```

### Loading ce-* agents at runtime (recommended pattern)

Grok skills that delegate to CE agents should use this pattern (enforced / documented by the content transform):

```text
Load the agent definition using read_file with path "${GROK_PLUGIN_ROOT}/agents/ce-foo.md"
(or the installed plugin location) and prepend its full content (frontmatter + body)
to the prompt passed to spawn_subagent.
Use subagent_type "general-purpose" (or "explore"/"plan" for read-only work).
```

The `grok-content.ts` transforms automatically rewrite `Task ce-foo(...)`, `spawn ... ce-foo subagent`, and similar dispatch language into the above guidance.

See `GROK_AGENT_INJECTION_NOTE` and `rewriteTaskAndAgentCalls` for the exact emitted text.

## Skills & Content Transforms

- Skills are pass-through with mechanical transforms only (source remains single source of truth).
- `transformContentForGrok` is applied to `SKILL.md` and all `*.md` files under the skill when `transformAllMarkdown=true` (the default for Grok).
- Key transforms (authoritative table lives in `src/utils/grok-content.ts`):

  - **Variables**: `${CLAUDE_SKILL_DIR:-.}` and `${CLAUDE_PLUGIN_ROOT:-.}` → `${GROK_PLUGIN_ROOT:-.}` (defensive fallback style preserved).
  - **Tools**: Explicit `CLAUDE_TO_GROK_TOOLS` mapping (Bash → `run_terminal_command`, Read → `read_file`, Task/Agent → `spawn_subagent`, etc.).
  - **Dispatch**: Heavy rewriting of CE delegation patterns to the Grok `spawn_subagent` + `read_file` agent injection recipe.
  - **Allowed tools**: Normalized in frontmatter.
  - **Cross references**: `ce-foo` skill mentions normalized; `@agent` references preserved.
  - **Port note injection**: A minimal "Grok + Compound Engineering agents" note is prepended only for content that shows heavy delegation patterns (see `shouldInjectGrokAgentNote`). Full guidance lives in this spec.

## Environment variables

- `GROK_PLUGIN_ROOT` — absolute path to the installed plugin directory (use with `:-.` defensive fallback in scripts/references).
- `GROK_PLUGIN_DATA` — writable data directory for the plugin (caches, logs, state).

These are the Grok equivalents of the Claude `CLAUDE_SKILL_DIR` / plugin root patterns.

## MCP servers

- Converted to `.mcp.json` at the plugin root when present.
- Shape follows the standard MCP server config (command/args/env or url/headers).

## Hooks

- Claude hooks have no direct equivalent in Grok.
- The converter emits a warning and skips them.
- Do not rely on hook behavior after conversion.

## Installation & Usage

### From source (recommended during development)

```bash
# Produce a clean Grok plugin
bun run src/index.ts install ./plugins/compound-engineering --to grok --output /tmp/grok-ce

# Install it
grok plugin install /tmp/grok-ce/compound-engineering

# Or load for a single session
grok build --plugin-dir /tmp/grok-ce/compound-engineering ...
```

### After publishing / marketplace

Users run the normal `grok plugin install` flow for the published package. The converter step is only needed when you want a fresh conversion of the latest source.

### Also / multiple targets

```bash
bun run src/index.ts convert ./plugins/compound-engineering --to gemini --also grok
```

## Port notes reconciliation (U3 policy)

**Official source tree is clean.** `plugins/compound-engineering/skills/**` and `agents/**` contain **zero** Grok-specific port notes or conditionals.

**Transform policy** (recorded in `grok-content.ts` and exercised in U3):
- High-value guidance lives in **this spec** (`docs/specs/grok.md`) and the minimal emitted injection note.
- The transform emits a short central note only when it detects heavy `ce-*` delegation patterns.
- No per-skill duplication of the full dispatch recipe.
- Prior one-off conversions (the ad-hoc copy that existed before this work) sprinkled verbose "load agent definition and inject into spawn_subagent prompt" annotations throughout tables and references. Those are legacy noise and will be replaced on re-conversion.

When you see such annotations in an old installed copy, re-run the official converter to obtain a clean, maintainable version.

## Known differences / limitations (as of U7)

- No hooks support (warning emitted on conversion).
- Agent dispatch requires the explicit `read_file` + prepend + `spawn_subagent` pattern (the transforms help, but authors must still follow the recipe).
- Some very Claude-specific tool names or patterns may need manual review after conversion.
- Command support is present but currently unused by the CE plugin itself.

## References in code

- The transform module (`src/utils/grok-content.ts`) contains the authoritative `CLAUDE_TO_GROK_TOOLS` table and the port note policy comment.
- The writer (`src/targets/grok.ts`) produces the documented clean layout.
- Tests in `tests/grok-content.test.ts` exercise the transforms against real CE excerpts (including the patterns used in `ce-code-review`, `ce-plan`, etc.).

---

**This spec is the single source of truth for Grok-specific mechanical mappings and usage patterns.** Update it when the transforms, writer, or observed Grok behavior change.