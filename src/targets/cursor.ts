import path from "path"
import { backupFile, copyDir, ensureDir, writeJson, writeText } from "../utils/files"
import type { CursorBundle } from "../types/cursor"

export async function writeCursorBundle(outputRoot: string, bundle: CursorBundle): Promise<void> {
  const paths = resolveCursorPaths(outputRoot)
  await ensureDir(paths.cursorDir)

  if (bundle.rules.length > 0) {
    const rulesDir = path.join(paths.cursorDir, "rules")
    for (const rule of bundle.rules) {
      await writeText(path.join(rulesDir, `${rule.name}.mdc`), rule.content + "\n")
    }
  }

  if (bundle.commands.length > 0) {
    const commandsDir = path.join(paths.cursorDir, "commands")
    for (const command of bundle.commands) {
      await writeText(path.join(commandsDir, `${command.name}.md`), command.content + "\n")
    }
  }

  if (bundle.skillDirs.length > 0) {
    const skillsDir = path.join(paths.cursorDir, "skills")
    for (const skill of bundle.skillDirs) {
      await copyDir(skill.sourceDir, path.join(skillsDir, skill.name))
    }
  }

  if (bundle.mcpServers && Object.keys(bundle.mcpServers).length > 0) {
    const mcpPath = path.join(paths.cursorDir, "mcp.json")
    const backupPath = await backupFile(mcpPath)
    if (backupPath) {
      console.log(`Backed up existing mcp.json to ${backupPath}`)
    }
    await writeJson(mcpPath, { mcpServers: bundle.mcpServers })
  }
}

function resolveCursorPaths(outputRoot: string) {
  const base = path.basename(outputRoot)
  // If already pointing at .cursor, write directly into it
  if (base === ".cursor") {
    return { cursorDir: outputRoot }
  }
  // Otherwise nest under .cursor
  return { cursorDir: path.join(outputRoot, ".cursor") }
}
