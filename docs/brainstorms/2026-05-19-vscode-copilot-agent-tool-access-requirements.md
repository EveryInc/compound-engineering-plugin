---
date: 2026-05-19
topic: vscode-copilot-agent-tool-access
---

# VS Code Copilot Agent Tool Access for CE Plugin

## Problem Frame

When the Compound Engineering plugin is installed in VS Code via "Chat: Install Plugin from Source", CE subagents (reviewers, researchers, etc.) cannot read workspace files. Invoking `ce-correctness-reviewer` produces:

```
ACCESS_FAILED No filesystem read tool is available in this session to read README.md
```

Meanwhile, built-in subagents like `Explore` succeed in the same session, proving the VS Code Copilot host does provide workspace access to subagents — but only when tools are properly declared in the agent's frontmatter.

The root cause is a gap in the converter pipeline:

1. Claude agent `.agent.md` files declare tools (`tools: Read, Grep, Glob, Bash`), but the parser never captures them.
2. The Copilot converter intentionally drops tools, emitting agents without a `tools` field.
3. VS Code Copilot interprets a missing `tools` field as "no tools granted" for custom plugin agents (contrary to the converter's original assumption that omitting means defaults).

This renders all CE subagents inert under Copilot — they can reason but cannot inspect code.

---

## Actors

- A1. **Developer using CE in VS Code Copilot**: Invokes CE skills and agents expecting them to read/search/execute against the workspace.
- A2. **CE converter pipeline**: Parses Claude plugin source, converts agents/skills to Copilot-compatible format, and writes output files.
- A3. **VS Code Copilot host**: Loads plugin agent definitions, grants tools based on frontmatter declarations, and dispatches subagents.

---

## Key Flows

- F1. **Subagent tool access (broken path)**
  - **Trigger:** User invokes a CE skill that dispatches a reviewer/researcher subagent.
  - **Actors:** A1, A3
  - **Steps:**
    1. User invokes `/compound-engineering:ce-code-review`
    2. Skill dispatches `ce-correctness-reviewer` as subagent
    3. VS Code Copilot loads the agent definition, finds no `tools` field
    4. Subagent receives no filesystem tools
    5. Subagent fails to read any files
  - **Outcome:** Review fails with tool-access error.
  - **Covered by:** R1, R2, R3

- F2. **Subagent tool access (fixed path)**
  - **Trigger:** Same as F1, after fix is applied.
  - **Actors:** A1, A2, A3
  - **Steps:**
    1. Parser captures `tools` from Claude agent frontmatter
    2. Converter maps Claude tools to Copilot aliases (`read`, `search`, `execute`, etc.)
    3. Emitted `.agent.md` includes `tools: [read, search, execute]`
    4. VS Code Copilot grants declared tools to subagent
    5. Subagent reads workspace files successfully
  - **Outcome:** CE reviewers and researchers operate with full workspace access.
  - **Covered by:** R1, R2, R3, R4

---

## Requirements

**Parser: Capture agent tools**

- R1. The Claude parser (`src/parsers/claude.ts` `loadAgents`) must parse the `tools` field from agent frontmatter and populate it on the `ClaudeAgent` type.
- R2. The `ClaudeAgent` type (`src/types/claude.ts`) must include an optional `tools?: string[]` field.

**Converter: Map tools to Copilot aliases**

- R3. The Copilot converter (`src/converters/claude-to-copilot.ts`) must map Claude tool names to VS Code Copilot tool aliases and emit a `tools` array in agent frontmatter. Mapping:
  - `Read` → `read`
  - `Grep`, `Glob` → `search`
  - `Glob` → `search` (deduplicated with Grep)
  - `Bash` → `execute`
  - `Write`, `Edit`, `Patch`, `MultiEdit` → `edit`
  - `WebFetch`, `WebSearch` → `web`
  - `TodoRead`, `TodoWrite` → `todo`
  - `Task` → `agent`
  - MCP tool references (e.g., `mcp__context7__*`) → omitted (not mappable to Copilot built-in aliases)
- R4. Output deduplication: the emitted `tools` array must contain unique values only (e.g., `Grep` + `Glob` both map to `search`, emit `search` once).
- R5. If no tools are declared on the source agent, the converter must omit the `tools` field (preserving current behavior for agents that genuinely have no tool declarations).

**Copilot type: Support tools field**

- R6. The `CopilotAgent` type should support tools metadata so the converter's output is type-safe. This may be achieved by adding a field to the type or by ensuring the frontmatter serialization path handles it.

**Tests**

- R7. Update `tests/copilot-converter.test.ts` to assert that agents with declared tools produce correct Copilot `tools` arrays.
- R8. Add test cases for: deduplication, unknown/unmappable tools (omitted gracefully), agents with no tools (field omitted), agents with web/MCP tools.
- R9. Add or update parser tests to verify `tools` is captured from agent frontmatter.

**No install target required for plugin-from-source**

- R10. The fix must work when VS Code loads the plugin directly from the repo via "Chat: Install Plugin from Source" — meaning the plugin-native `.agent.md` files must carry the correct Copilot `tools` frontmatter, OR the conversion happens at install time. Determine which path applies (see Outstanding Questions).

---

## Acceptance Examples

- AE1. **Covers R1, R2, R3, R4.** Given a CE agent file with `tools: Read, Grep, Glob, Bash`, when the plugin is parsed and converted to Copilot format, the output `.agent.md` frontmatter includes `tools: [read, search, execute]` (search appears once despite two source entries).

- AE2. **Covers R3, R5.** Given a CE agent file with no `tools` field, when converted to Copilot format, the output `.agent.md` frontmatter does NOT include a `tools` key.

- AE3. **Covers R3.** Given a CE agent with `tools: Read, Grep, Glob, Bash, WebFetch, WebSearch, mcp__context7__*`, when converted, the output is `tools: [read, search, execute, web]` (MCP reference omitted, web deduplicated).

- AE4. **Covers R1, R3, R7.** Given the `ce-correctness-reviewer` agent is installed in VS Code Copilot, when it is dispatched as a subagent, it can successfully read `README.md` from the workspace.

---

## Success Criteria

- CE reviewer and researcher subagents can read, search, and execute in the workspace when invoked through VS Code Copilot.
- The smoke test (invoke `ce-correctness-reviewer`, ask it to read `README.md`) returns file content instead of `ACCESS_FAILED`.
- No regression: agents without declared tools continue to work as before (tools field omitted).
- Existing non-Copilot targets (OpenCode, Codex, Pi, Gemini, Kiro) are unaffected.

---

## Scope Boundaries

- **Not in scope: Changing VS Code Copilot host behavior.** We work within the host's documented tool-declaration mechanism.
- **Not in scope: Changing `/compound-engineering:ce-*` namespacing.** This is VS Code Copilot host behavior for installed plugins. Document it but do not attempt to override.
- **Not in scope: `.compound-engineering/config.local.yaml` as a tool-access fix.** That config controls CE preferences (Codex delegation, etc.), not Copilot tool grants.
- **Not in scope: Adding a full `copilot` install target to `src/targets/index.ts`.** The immediate fix is making the converter emit tools. A dedicated install target may be added later.
- **Not in scope: Changing how the plugin is distributed/installed.** The fix must work with the existing "Install Plugin from Source" workflow.
- **Deferred: Copilot skill `tools` field.** Skills (SKILL.md) may also benefit from tool declarations, but the immediate failure is in subagents. Skill tool access can be addressed separately if needed.
- **Deferred: Registering a `copilot` target in `src/targets/index.ts`.** This would enable `bun convert --to copilot` as a first-class workflow but is not required for the plugin-from-source fix.

---

## Key Decisions

- **Map tools explicitly rather than emitting all tools unconditionally.** An explicit mapping ensures CE agents get precisely the capabilities they declare, matching the principle of least privilege. Emitting `tools: [read, search, execute, edit, web, todo, agent]` on every agent would work but grants unnecessary capabilities.
- **Omit unmappable tools (MCP references) rather than erroring.** MCP tools are platform-specific and have no Copilot built-in equivalent. Silently dropping them with a warning is the safe default.
- **Parse tools as a flat string array.** Claude agent frontmatter declares tools as a comma-separated line (`tools: Read, Grep, Glob, Bash`). Parse by splitting on commas and trimming whitespace.

---

## Dependencies / Assumptions

- **VS Code honors `tools` in plugin agent files.** Confirmed: the docs explicitly state custom agents use the `tools` frontmatter field to declare available tools.
- **"Install Plugin from Source" reads raw agent files.** Confirmed: VS Code clones the repo and loads files directly. No conversion step occurs. The fix must modify source files or the plugin format.
- **VS Code Claude format detection uses file extension.** The docs state Claude agents are "plain `.md` files" in `.claude/agents`. The CE plugin uses `.agent.md` — this likely causes format mis-detection. Needs empirical verification.
- **Tool set names are stable.** The `read`, `search`, `execute`, `edit`, `web`, `agent`, `todos`, `vscode`, `browser` tool sets are documented as of May 2026.
- **Claude Code may or may not accept Copilot-native tool format.** If we change tools to `tools: [read, search, execute]`, Claude Code behavior needs testing. This is the key cross-platform compatibility question.

---

## Research Findings (2026-05-20)

### Q1: How does "Install Plugin from Source" load agents?

**Answer: VS Code reads raw agent files directly from the cloned repo. There is no conversion step.**

Evidence from [VS Code Agent Plugins docs](https://code.visualstudio.com/docs/copilot/customization/agent-plugins):
- "Run Chat: Install Plugin From Source from the Command Palette. Enter a Git repository URL and VS Code clones and installs the plugin."
- Cached at: `%APPDATA%\Code\agentPlugins\github.com\{org}\{repo}` (Windows)
- VS Code auto-detects plugin format by checking: `.plugin/plugin.json` → `plugin.json` (root) → `.github/plugin/plugin.json` → `.claude-plugin/plugin.json`
- The CE plugin has `.claude-plugin/plugin.json`, so VS Code identifies it as **Claude format**

**Critical implication:** Fixing only the converter is INSUFFICIENT. The raw plugin files must carry tool declarations that VS Code can interpret correctly.

### Q2: Does VS Code map Claude tool names automatically?

**Answer: YES — documented, but likely broken for this specific case.**

From the [Custom Agents docs](https://code.visualstudio.com/docs/copilot/customization/custom-agents), Claude agent format section:
> "VS Code maps Claude-specific tool names to the corresponding VS Code tools. Both the VS Code `.agent.md` format (with YAML arrays for tools) and the Claude format (with comma-separated strings) are supported."

However, the same docs state:
> "Agent files in the `.claude/agents` folder use **plain `.md` files**"

The CE plugin agents use `.agent.md` extension (`ce-correctness-reviewer.agent.md`), NOT plain `.md`. VS Code's Claude format detection for agent files appears to depend on the file extension:
- `.md` in `.claude/agents/` → Claude format (comma-separated tools string, auto-mapped)
- `.agent.md` → Copilot format (YAML array of VS Code tool names)

**Likely root cause:** The CE agent files have Copilot file extension (`.agent.md`) but Claude-style frontmatter (`tools: Read, Grep, Glob, Bash`). VS Code parses them as Copilot-format agents and looks for VS Code tool names like `Read`, `Grep` — which don't exist. Unrecognized tools are silently ignored, leaving the agent with **zero tools**.

### Q3: Canonical VS Code tool set names

From the [VS Code cheat sheet](https://code.visualstudio.com/docs/copilot/reference/copilot-vscode-features), built-in tool sets:

| Tool Set | Individual Tools |
|----------|-----------------|
| `agent` | `agent/runSubagent` |
| `browser` | (experimental, multiple) |
| `edit` | `edit/createDirectory`, `edit/createFile`, `edit/editFiles`, `edit/editNotebook` |
| `execute` | `execute/runInTerminal`, `execute/getTerminalOutput`, `execute/createAndRunTask`, `execute/runNotebookCell`, `execute/testFailure` |
| `read` | `read/readFile`, `read/problems`, `read/getNotebookSummary`, `read/readNotebookCellOutput`, `read/terminalLastCommand`, `read/terminalSelection` |
| `search` | `search/changes`, `search/codebase`, `search/fileSearch`, `search/listDirectory`, `search/textSearch`, `search/usages` |
| `todos` | (todo list tool) |
| `vscode` | `vscode/askQuestions`, `vscode/extensions`, `vscode/runCommand`, `vscode/VSCodeAPI` |
| `web` | `web/fetch` |

Custom agent `tools` field accepts: tool set names (e.g. `read`), individual tool names (e.g. `read/readFile`), MCP tool names, or `*` for all.

### Q4: Does `tools: []` differ from omitting `tools`?

**Answer: Not explicitly documented.** Based on the error behavior ("No filesystem read tool is available"), an agent with unrecognized tools behaves the same as one with no tools — it gets nothing. The distinction between explicit empty array and omission is academic for this fix since the real issue is the format mismatch.

### Q5: Subagent tool inheritance

From the docs, subagents:
- Run as isolated instances with their own agent definition
- The **parent** agent needs `agent` in its tools list and the subagent in its `agents` field
- The **subagent** uses its own `tools` declaration
- Built-in `Explore` succeeds because it's a built-in agent with proper tool access

This confirms the issue is in how the subagent's own tools are parsed, not in inheritance.

---

## Revised Problem Analysis

The root cause is a **format mismatch**, not a missing converter feature:

1. CE agent files use `.agent.md` extension (Copilot format indicator)
2. CE agent files contain Claude-style frontmatter: `tools: Read, Grep, Glob, Bash` (comma-separated string)
3. VS Code sees `.agent.md` → applies Copilot-format parsing → looks for VS Code tool names
4. `Read`, `Grep`, `Glob`, `Bash` are not valid VS Code tool names → silently dropped
5. Agent ends up with zero tools → "No filesystem read tool is available"

**The built-in `Explore` agent works because it's VS Code's own agent with proper Copilot-native tool declarations.**

---

## Outstanding Questions

### Resolve Before Planning

- **[Affects fix strategy][Needs testing]** Does renaming CE agents to plain `.md` (and keeping `tools: Read, Grep, Glob, Bash`) trigger VS Code's Claude-to-Copilot tool mapping? If yes, the fix is just a file extension rename. If no, we must also change the tool declarations to Copilot-native format.
- **[Affects fix strategy][Needs testing]** If we keep `.agent.md` extension but change `tools` to Copilot-native format (`tools: [read, search, execute]`), does Claude Code still function correctly? Claude's docs say `tools` is a comma-separated string — does Claude also accept YAML arrays?

### Deferred to Planning

- **[Affects R6][Technical]** Should `CopilotAgent` type carry a `tools?: string[]` field, or is it sufficient for the converter to inject tools into the frontmatter string without type-level modeling?
- **[Affects scope][Technical]** Should the parser change also benefit other converter targets (Codex, Gemini, etc.), or is tool mapping currently handled differently for those targets?
- **[Affects upstream][Decision]** Should this be reported as a VS Code bug (Claude format mapping not applied to `.agent.md` files in Claude-format plugins)?

---

## Validation Plan

After implementation, verify the fix end-to-end:

1. **Build/convert the plugin** (if a build step is required).
2. **Install in VS Code** via "Chat: Install Plugin from Source" pointing at the fork repo.
3. **Confirm plugin loaded:** Check VS Code's extension/plugin list shows compound-engineering from the fork.
4. **Smoke test — subagent file read:**
   - Invoke `/compound-engineering:ce-correctness-reviewer` (or dispatch it from a skill)
   - Ask it to read `README.md` and report the first heading
   - Expected: returns content (e.g., `# fantastic-chainsaw` or whatever the repo's H1 is)
   - Failure: `ACCESS_FAILED No filesystem read tool`
5. **Comparative test — built-in agent:**
   - Invoke built-in `Explore` with the same request
   - Expected: succeeds (baseline proof the host provides tools)
6. **Full flow test — code review:**
   - Invoke `/compound-engineering:ce-code-review` on a small diff
   - Verify reviewer subagents produce findings referencing actual file content
7. **Regression — no-tools agent:**
   - If any CE agent legitimately has no `tools` field, verify it still loads without error

---

## Next Steps

Two quick empirical tests will determine the fix strategy:

1. **Test A (file extension):** Rename one CE agent to `.md` (e.g., `ce-correctness-reviewer.md`), keep Claude-style `tools: Read, Grep, Glob, Bash`. Install plugin, invoke as subagent. If it works → fix is renaming all agent files.

2. **Test B (tool format):** Keep `.agent.md` extension, change `tools` to `tools: [read, search, execute, edit]` (Copilot-native YAML array). Install plugin, invoke as subagent. If it works → fix is converting tool declarations to Copilot format.

After one test succeeds → `/ce-plan` for full implementation across all 49 agent files, converter updates, and test changes.
