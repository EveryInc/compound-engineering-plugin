import { promises as fs } from "fs"
import path from "path"
import { dump } from "js-yaml"
import { pathExists, readText, writeText } from "./files"
import { parseFrontmatter } from "./frontmatter"

export const PI_CE_SUBAGENT_TOOL = "ce_subagent"

export type PiNameMaps = {
  agents?: Record<string, string>
  skills?: Record<string, string>
  prompts?: Record<string, string>
}

const PI_MAX_NAME_LENGTH = 60 // Pi allows 64; leave room for dedup suffix like -2

export function normalizePiSkillName(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return "item"

  const normalized = trimmed
    .toLowerCase()
    .replace(/[\\/]+/g, "-")
    .replace(/[:_\s]+/g, "-")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, PI_MAX_NAME_LENGTH)
    .replace(/-+$/, "")

  return normalized || "item"
}

export function uniquePiSkillName(base: string, used: Set<string>): string {
  if (!used.has(base)) {
    used.add(base)
    return base
  }

  let index = 2
  while (used.has(`${base}-${index}`)) {
    index += 1
  }

  const name = `${base}-${index}`
  used.add(name)
  return name
}

export function transformPiBodyContent(body: string, nameMaps?: PiNameMaps): string {
  let result = body

  const taskPattern = /^(\s*(?:(?:[-*])\s+|\d+\.\s+)?)Task\s+([a-z][a-z0-9:_-]*)\(([^)]*)\)/gm
  result = result.replace(taskPattern, (_match, prefix: string, agentName: string, args: string) => {
    const normalizedAgent = normalizePiTaskAgentName(agentName, nameMaps?.agents)
    const trimmedArgs = args.trim().replace(/\s+/g, " ").replace(/^["']|["']$/g, "")
    return trimmedArgs
      ? `${prefix}Run ${PI_CE_SUBAGENT_TOOL} with agent="${normalizedAgent}" and task="${trimmedArgs}".`
      : `${prefix}Run ${PI_CE_SUBAGENT_TOOL} with agent="${normalizedAgent}".`
  })

  result = result.replace(/\bRun (?:subagent|ce_subagent) with agent="([^"]+)"/g, (_match, agentName: string) => {
    const normalizedAgent = normalizePiTaskAgentName(agentName, nameMaps?.agents)
    return `Run ${PI_CE_SUBAGENT_TOOL} with agent="${normalizedAgent}"`
  })
  result = result.replace(/\bAskUserQuestion\b/g, "ask_user_question")
  result = result.replace(/\bTodoWrite\b/g, "file-based todos (todos/ + /skill:todo-create)")
  result = result.replace(/\bTodoRead\b/g, "file-based todos (todos/ + /skill:todo-create)")

  const slashCommandPattern = /(?<![:\/\w])\/([a-z][a-z0-9_:-]*?)(?=[\s,."')\]}`]|$)/gi
  result = result.replace(slashCommandPattern, (match, commandName: string) => {
    if (commandName.includes("/")) return match
    if (["dev", "tmp", "etc", "usr", "var", "bin", "home"].includes(commandName)) {
      return match
    }

    if (commandName.startsWith("skill:")) {
      const skillName = commandName.slice("skill:".length)
      return `/skill:${nameMaps?.skills?.[skillName] ?? nameMaps?.agents?.[skillName] ?? normalizePiSkillName(skillName)}`
    }

    const withoutPrefix = commandName.startsWith("prompts:")
      ? commandName.slice("prompts:".length)
      : commandName

    return `/${nameMaps?.prompts?.[withoutPrefix] ?? normalizePiSkillName(withoutPrefix)}`
  })

  return result
}

export { appendCompatibilityNoteIfNeeded }

export async function skillFileMatchesPiTarget(skillPath: string, targetName: string, nameMaps?: PiNameMaps): Promise<boolean> {
  if (!(await pathExists(skillPath))) {
    return false
  }

  const raw = await readText(skillPath)

  try {
    const parsed = parseFrontmatter(raw)
    if (Object.keys(parsed.data).length === 0 && parsed.body === raw) {
      return transformPiBodyContent(raw, nameMaps) === raw
    }

    if (parsed.data.name !== targetName) {
      return false
    }

    return transformPiBodyContent(parsed.body, nameMaps) === parsed.body
  } catch (error) {
    console.warn(`Pi sync: failed to parse frontmatter in ${skillPath}:`, (error as Error).message)
    return false
  }
}

export async function preparePiSkillTargetForReplacement(targetDir: string): Promise<void> {
  const existingStats = await fs.lstat(targetDir).catch(() => null)
  if (!existingStats) return

  if (existingStats.isSymbolicLink()) {
    await fs.unlink(targetDir)
    return
  }

  const parentDir = path.dirname(targetDir)
  const baseName = path.basename(targetDir)
  const existingBackups = (await fs.readdir(parentDir))
    .filter((entry) => entry.startsWith(`${baseName}.bak.`))

  for (const oldBackup of existingBackups.sort().slice(0, -1)) {
    const backupPath = path.join(parentDir, oldBackup)
    const backupStats = await fs.lstat(backupPath)
    if (backupStats.isSymbolicLink()) continue
    await fs.rm(backupPath, { recursive: true, force: true })
  }

  const backupPath = `${targetDir}.bak.${new Date().toISOString().replace(/[:.]/g, "-")}`
  await fs.rename(targetDir, backupPath)
  console.warn(`Backed up existing Pi skill directory to ${backupPath}`)
}

export async function copySkillDirForPi(
  sourceDir: string,
  targetDir: string,
  targetName: string,
  nameMaps?: PiNameMaps,
): Promise<void> {
  await preparePiSkillTargetForReplacement(targetDir)
  await copyDirForPiMaterialization(sourceDir, targetDir)
  await rewriteSkillFileForPi(path.join(targetDir, "SKILL.md"), targetName, nameMaps)
}

function cyclicPiSkillSymlinkError(sourcePath: string): Error {
  return new Error(`Pi skill materialization detected a cyclic directory symlink at ${sourcePath}`)
}

async function copyDirForPiMaterialization(
  sourceDir: string,
  targetDir: string,
  activeRealDirs = new Set<string>(),
): Promise<void> {
  const realSourceDir = await fs.realpath(sourceDir)
  if (activeRealDirs.has(realSourceDir)) {
    throw cyclicPiSkillSymlinkError(sourceDir)
  }

  activeRealDirs.add(realSourceDir)

  try {
    await fs.mkdir(targetDir, { recursive: true })
    const entries = await fs.readdir(sourceDir, { withFileTypes: true })

    for (const entry of entries) {
      const sourcePath = path.join(sourceDir, entry.name)
      const targetPath = path.join(targetDir, entry.name)

      if (entry.isDirectory()) {
        await copyDirForPiMaterialization(sourcePath, targetPath, activeRealDirs)
        continue
      }

      if (entry.isFile()) {
        await fs.mkdir(path.dirname(targetPath), { recursive: true })
        await fs.copyFile(sourcePath, targetPath)
        continue
      }

      if (entry.isSymbolicLink()) {
        const stats = await fs.stat(sourcePath)
        const resolvedPath = await fs.realpath(sourcePath)

        if (stats.isDirectory()) {
          if (activeRealDirs.has(resolvedPath)) {
            throw cyclicPiSkillSymlinkError(sourcePath)
          }
          await copyDirForPiMaterialization(resolvedPath, targetPath, activeRealDirs)
          continue
        }

        if (stats.isFile()) {
          await fs.mkdir(path.dirname(targetPath), { recursive: true })
          await fs.copyFile(resolvedPath, targetPath)
        }
      }
    }
  } finally {
    activeRealDirs.delete(realSourceDir)
  }
}

export async function rewriteSkillFileForPi(skillPath: string, targetName: string, nameMaps?: PiNameMaps): Promise<void> {
  if (!(await pathExists(skillPath))) {
    return
  }

  const raw = await readText(skillPath)

  try {
    const parsed = parseFrontmatter(raw)
    if (Object.keys(parsed.data).length === 0 && parsed.body === raw) {
      const rewritten = transformPiBodyContent(raw, nameMaps)
      if (rewritten !== raw) {
        await writeText(skillPath, rewritten)
      }
      return
    }

    const updated = formatPiFrontmatter(
      { ...parsed.data, name: targetName },
      transformPiBodyContent(parsed.body, nameMaps),
    )

    if (updated !== raw) {
      await writeText(skillPath, updated)
    }
  } catch (error) {
    console.warn(`Pi sync: failed to parse frontmatter in ${skillPath}:`, (error as Error).message)
    const split = splitRawAtFrontmatterEnd(raw)
    const body = split ? split.body : raw
    const rewrittenBody = transformPiBodyContent(body, nameMaps)
    const fullContent = split ? split.frontmatter + rewrittenBody : rewrittenBody
    if (fullContent !== raw) {
      await writeText(skillPath, fullContent)
    }
  }
}

function formatPiFrontmatter(data: Record<string, unknown>, body: string): string {
  const yaml = dump(data, { lineWidth: -1, noRefs: true }).trimEnd()
  if (yaml.length === 0) {
    return body
  }

  return ["---", yaml, "---", "", body].join("\n")
}

function splitRawAtFrontmatterEnd(raw: string): { frontmatter: string; body: string } | null {
  const lines = raw.split(/\r?\n/)
  if (lines[0]?.trim() !== "---") return null
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      return {
        frontmatter: lines.slice(0, i + 1).join("\n") + "\n",
        body: lines.slice(i + 1).join("\n"),
      }
    }
  }
  return null
}

function normalizePiTaskAgentName(value: string, agentMap?: Record<string, string>): string {
  if (agentMap?.[value]) return agentMap[value]
  const leafName = value.split(":").filter(Boolean).pop() ?? value
  if (agentMap?.[leafName]) return agentMap[leafName]
  return normalizePiSkillName(leafName)
}

const PI_MCPORTER_SENTINEL = "<!-- PI_MCPORTER_NOTE -->"

function appendCompatibilityNoteIfNeeded(body: string): string {
  if (!/\bmcp\b/i.test(body)) return body
  if (body.includes(PI_MCPORTER_SENTINEL)) return body

  const note = [
    "",
    PI_MCPORTER_SENTINEL,
    "## Pi + MCPorter note",
    "For MCP access in Pi, use MCPorter via the generated tools:",
    "- `mcporter_list` to inspect available MCP tools",
    "- `mcporter_call` to invoke a tool",
    "",
  ].join("\n")

  return body + note
}
