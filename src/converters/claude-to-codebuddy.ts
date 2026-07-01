import fs, { type Dirent } from "fs"
import path from "path"
import { formatFrontmatter } from "../utils/frontmatter"
import { type ClaudeAgent, type ClaudeCommand, type ClaudePlugin, filterSkillsByPlatform } from "../types/claude"
import type { CodeBuddyAgent, CodeBuddyBundle, CodeBuddyGeneratedSkill, CodeBuddyGeneratedSkillSidecarDir } from "../types/codebuddy"
import type { ClaudeToOpenCodeOptions } from "./claude-to-opencode"

export type ClaudeToCodeBuddyOptions = ClaudeToOpenCodeOptions

const CODEBUDDY_DESCRIPTION_MAX_LENGTH = 1024

export function convertClaudeToCodeBuddy(
  plugin: ClaudePlugin,
  options: ClaudeToCodeBuddyOptions,
): CodeBuddyBundle {
  const includeSkills = options.codexIncludeSkills ?? false

  const platformSkills = filterSkillsByPlatform(plugin.skills, "codebuddy")
  const invocableCommands = plugin.commands.filter((command) => !command.disableModelInvocation)
  const copiedSkills = platformSkills
  const skillDirs = copiedSkills.map((skill) => ({
    name: skill.name,
    sourceDir: skill.sourceDir,
  }))
  const promptNames = new Set<string>()
  const usedSkillNames = new Set<string>(skillDirs.map((skill) => normalizeCodeBuddyName(skill.name)))

  const commandPromptNames = new Map<string, string>()
  for (const command of invocableCommands) {
    commandPromptNames.set(
      command.name,
      uniqueName(normalizeCodeBuddyName(command.name), promptNames),
    )
  }

  const agents = plugin.agents.map(convertAgent)

  if (!includeSkills) {
    const externallyManagedSkillNames = copiedSkills.map((skill) => skill.name)
    return {
      pluginName: plugin.manifest.name,
      prompts: [],
      skillDirs: [],
      generatedSkills: [],
      agents,
      mcpServers: undefined,
      hooks: plugin.hooks,
      externallyManagedSkillNames,
    }
  }

  const commandSkills: CodeBuddyGeneratedSkill[] = []
  const prompts = invocableCommands.map((command) => {
    const promptName = commandPromptNames.get(command.name)!
    const commandSkill = convertCommandSkill(command, usedSkillNames)
    commandSkills.push(commandSkill)
    const content = renderPrompt(command, commandSkill.name)
    return { name: promptName, content }
  })

  return {
    pluginName: plugin.manifest.name,
    prompts,
    skillDirs,
    generatedSkills: [...commandSkills],
    agents,
    mcpServers: plugin.mcpServers,
    hooks: plugin.hooks,
  }
}

function convertAgent(agent: ClaudeAgent): CodeBuddyAgent {
  const name = buildCodeBuddyAgentName(agent)
  const description = sanitizeDescription(
    agent.description ?? `Converted from Claude agent ${agent.name}`,
  )
  let instructions = agent.body.trim()
  if (agent.capabilities && agent.capabilities.length > 0) {
    const capabilities = agent.capabilities.map((capability) => `- ${capability}`).join("\n")
    instructions = `## Capabilities\n${capabilities}\n\n${instructions}`.trim()
  }
  if (instructions.length === 0) {
    instructions = `Instructions converted from the ${agent.name} agent.`
  }

  return { name, description, instructions, sidecarDirs: collectReferencedSidecarDirs(agent) }
}

function convertCommandSkill(
  command: ClaudeCommand,
  usedNames: Set<string>,
): CodeBuddyGeneratedSkill {
  const name = uniqueName(normalizeCodeBuddyName(command.name), usedNames)
  const frontmatter: Record<string, unknown> = {
    name,
    description: sanitizeDescription(
      command.description ?? `Converted from Claude command ${command.name}`,
    ),
  }
  const sections: string[] = []
  if (command.argumentHint) {
    sections.push(`## Arguments\n${command.argumentHint}`)
  }
  if (command.allowedTools && command.allowedTools.length > 0) {
    sections.push(`## Allowed tools\n${command.allowedTools.map((tool) => `- ${tool}`).join("\n")}`)
  }
  const body = [...sections, command.body.trim()].filter(Boolean).join("\n\n").trim()
  const content = formatFrontmatter(frontmatter, body.length > 0 ? body : command.body)
  return { name, content }
}

function renderPrompt(
  command: ClaudeCommand,
  skillName: string,
): string {
  const frontmatter: Record<string, unknown> = {
    description: command.description,
    "argument-hint": command.argumentHint,
  }
  const instructions = `Use the /${skillName} skill for this command and follow its instructions.`
  const body = [instructions, "", command.body].join("\n").trim()
  return formatFrontmatter(frontmatter, body)
}

function buildCodeBuddyAgentName(agent: ClaudeAgent): string {
  const category = getAgentCategory(agent)
  const agentName = normalizeCodeBuddyName(agent.name)
  return category ? `${normalizeCodeBuddyName(category)}-${agentName}` : agentName
}

function getAgentCategory(agent: ClaudeAgent): string | null {
  const parts = agent.sourcePath.split(path.sep)
  const agentsIndex = parts.lastIndexOf("agents")
  if (agentsIndex === -1) return null
  const next = parts[agentsIndex + 1]
  if (!next || next.endsWith(".md")) return null
  return next
}

function sanitizeDescription(value: string, maxLength = CODEBUDDY_DESCRIPTION_MAX_LENGTH): string {
  const normalized = value.replace(/\s+/g, " ").trim()
  if (normalized.length <= maxLength) return normalized
  const ellipsis = "..."
  return normalized.slice(0, Math.max(0, maxLength - ellipsis.length)).trimEnd() + ellipsis
}

function normalizeCodeBuddyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

function uniqueName(base: string, used: Set<string>): string {
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

function collectReferencedSidecarDirs(agent: ClaudeAgent): CodeBuddyGeneratedSkillSidecarDir[] {
  const sourceDir = path.dirname(agent.sourcePath)
  let entries: Dirent[]

  try {
    entries = fs.readdirSync(sourceDir, { withFileTypes: true })
  } catch {
    return []
  }

  return entries
    .filter((entry) => entry.isDirectory())
    .filter((entry) => agent.body.includes(`${entry.name}/`) || agent.body.includes(`\`${entry.name}\``))
    .map((entry) => ({
      sourceDir: path.join(sourceDir, entry.name),
      targetName: entry.name,
    }))
}
