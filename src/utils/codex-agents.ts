import path from "path"
import { ensureDir, pathExists, readText, writeText } from "./files"

export const CODEX_AGENTS_BLOCK_START = "<!-- BEGIN COMPOUND CODEX TOOL MAP -->"
export const CODEX_AGENTS_BLOCK_END = "<!-- END COMPOUND CODEX TOOL MAP -->"

const CODEX_AGENTS_BLOCK_BODY = `## Compound Codex Tool Mapping (Claude Compatibility)

This section maps Claude Code plugin tool references to Codex behavior.
Only this block is managed automatically.

Tool mapping:
- Read: use shell reads (cat/sed) or rg
- Write: create files via shell redirection or apply_patch
- Edit/MultiEdit: use apply_patch
- Bash: use shell_command
- Grep: use rg (fallback: grep)
- Glob: use rg --files or find
- LS: use ls via shell_command
- WebFetch/WebSearch: use curl or Context7 for library docs
- AskUserQuestion/Question: ask the user in chat
- Task/Subagent/Parallel: run sequentially in main thread; use multi_tool_use.parallel for tool calls
- TodoWrite/TodoRead: use file-based todos in todos/ with file-todos skill
- Skill: open the referenced SKILL.md and follow it
- ExitPlanMode: ignore
`

export async function ensureCodexAgentsFile(codexHome: string): Promise<void> {
  await ensureDir(codexHome)
  const filePath = path.join(codexHome, "AGENTS.md")
  const block = buildCodexAgentsBlock()

  if (!(await pathExists(filePath))) {
    await writeText(filePath, block + "\n")
    return
  }

  const existing = await readText(filePath)
  const updated = upsertBlock(existing, block)
  if (updated !== existing) {
    await writeText(filePath, updated)
  }
}

function buildCodexAgentsBlock(): string {
  return [CODEX_AGENTS_BLOCK_START, CODEX_AGENTS_BLOCK_BODY.trim(), CODEX_AGENTS_BLOCK_END].join("\n")
}

function upsertBlock(existing: string, block: string): string {
  const startIndex = existing.indexOf(CODEX_AGENTS_BLOCK_START)
  const endIndex = existing.indexOf(CODEX_AGENTS_BLOCK_END)

  if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
    const before = existing.slice(0, startIndex).trimEnd()
    const after = existing.slice(endIndex + CODEX_AGENTS_BLOCK_END.length).trimStart()
    return [before, block, after].filter(Boolean).join("\n\n") + "\n"
  }

  if (existing.trim().length === 0) {
    return block + "\n"
  }

  return existing.trimEnd() + "\n\n" + block + "\n"
}
