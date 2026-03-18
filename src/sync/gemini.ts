import fs from "fs/promises"
import path from "path"
import type { ClaudeHomeConfig } from "../parsers/claude-home"
import type { ClaudeMcpServer } from "../types/claude"
import { syncGeminiCommands } from "./commands"
import { mergeJsonConfigAtKey } from "./json-config"
import { syncSkills } from "./skills"

type GeminiMcpServer = {
  command?: string
  args?: string[]
  url?: string
  env?: Record<string, string>
  headers?: Record<string, string>
}

export async function syncToGemini(
  config: ClaudeHomeConfig,
  outputRoot: string,
): Promise<void> {
  await syncGeminiSkills(config.skills, outputRoot)
  await syncGeminiCommands(config, outputRoot)

  if (Object.keys(config.mcpServers).length > 0) {
    const settingsPath = path.join(outputRoot, "settings.json")
    const converted = convertMcpForGemini(config.mcpServers)
    await mergeJsonConfigAtKey({
      configPath: settingsPath,
      key: "mcpServers",
      incoming: converted,
    })
  }
}

async function syncGeminiSkills(
  skills: ClaudeHomeConfig["skills"],
  outputRoot: string,
): Promise<void> {
  const skillsDir = path.join(outputRoot, "skills")
  const sharedSkillsDir = getGeminiSharedSkillsDir(outputRoot)

  if (!sharedSkillsDir) {
    await syncSkills(skills, skillsDir)
    return
  }

  const canonicalSharedSkillsDir = await canonicalizePath(sharedSkillsDir)
  const mirroredSkills: ClaudeHomeConfig["skills"] = []
  const directSkills: ClaudeHomeConfig["skills"] = []

  for (const skill of skills) {
    if (await isWithinDir(skill.sourceDir, canonicalSharedSkillsDir)) {
      mirroredSkills.push(skill)
    } else {
      directSkills.push(skill)
    }
  }

  await removeGeminiMirrorConflicts(mirroredSkills, skillsDir, canonicalSharedSkillsDir)
  await syncSkills(directSkills, skillsDir)
}

function getGeminiSharedSkillsDir(outputRoot: string): string | null {
  if (path.basename(outputRoot) !== ".gemini") return null
  return path.join(path.dirname(outputRoot), ".agents", "skills")
}

async function canonicalizePath(targetPath: string): Promise<string> {
  try {
    return await fs.realpath(targetPath)
  } catch {
    return path.resolve(targetPath)
  }
}

async function isWithinDir(candidate: string, canonicalParentDir: string): Promise<boolean> {
  const resolvedCandidate = await canonicalizePath(candidate)
  return resolvedCandidate === canonicalParentDir
    || resolvedCandidate.startsWith(`${canonicalParentDir}${path.sep}`)
}

async function removeGeminiMirrorConflicts(
  skills: ClaudeHomeConfig["skills"],
  skillsDir: string,
  sharedSkillsDir: string,
): Promise<void> {
  for (const skill of skills) {
    const duplicatePath = path.join(skillsDir, skill.name)

    let stat
    try {
      stat = await fs.lstat(duplicatePath)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        continue
      }
      throw error
    }

    if (!stat.isSymbolicLink()) {
      continue
    }

    let resolvedTarget: string
    try {
      resolvedTarget = await canonicalizePath(duplicatePath)
    } catch {
      continue
    }

    if (resolvedTarget === await canonicalizePath(skill.sourceDir)
      || await isWithinDir(resolvedTarget, sharedSkillsDir)) {
      await fs.unlink(duplicatePath)
    }
  }
}

function convertMcpForGemini(
  servers: Record<string, ClaudeMcpServer>,
): Record<string, GeminiMcpServer> {
  const result: Record<string, GeminiMcpServer> = {}
  for (const [name, server] of Object.entries(servers)) {
    const entry: GeminiMcpServer = {}
    if (server.command) {
      entry.command = server.command
      if (server.args && server.args.length > 0) entry.args = server.args
      if (server.env && Object.keys(server.env).length > 0) entry.env = server.env
    } else if (server.url) {
      entry.url = server.url
      if (server.headers && Object.keys(server.headers).length > 0) entry.headers = server.headers
    }
    result[name] = entry
  }
  return result
}
