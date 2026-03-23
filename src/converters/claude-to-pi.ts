import { formatFrontmatter } from "../utils/frontmatter"
import { appendCompatibilityNoteIfNeeded, normalizePiSkillName, transformPiBodyContent, uniquePiSkillName, type PiNameMaps } from "../utils/pi-skills"
import type { ClaudeAgent, ClaudeCommand, ClaudeMcpServer, ClaudePlugin } from "../types/claude"
import type {
  PiBundle,
  PiGeneratedSkill,
  PiMcporterConfig,
  PiMcporterServer,
} from "../types/pi"
import type { ClaudeToOpenCodeOptions } from "./claude-to-opencode"
import { PI_COMPAT_EXTENSION_SOURCE } from "../templates/pi/compat-extension"

export type ClaudeToPiOptions = ClaudeToOpenCodeOptions

const PI_DESCRIPTION_MAX_LENGTH = 1024

export function convertClaudeToPi(
  plugin: ClaudePlugin,
  _options: ClaudeToPiOptions,
): PiBundle {
  const promptNames = new Set<string>()
  const usedSkillNames = new Set<string>()

  const sortedSkills = [...plugin.skills].sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
  const sortedAgents = [...plugin.agents].sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)

  const skillDirs = sortedSkills.map((skill) => ({
    name: uniquePiSkillName(normalizePiSkillName(skill.name), usedSkillNames),
    sourceDir: skill.sourceDir,
  }))

  const agentNames = sortedAgents.map((agent) =>
    uniquePiSkillName(normalizePiSkillName(agent.name), usedSkillNames),
  )

  const agentMap: Record<string, string> = {}
  sortedAgents.forEach((agent, i) => { agentMap[agent.name] = agentNames[i] })

  const skillMap: Record<string, string> = {}
  sortedSkills.forEach((skill, i) => { skillMap[skill.name] = skillDirs[i].name })

  const convertibleCommands = [...plugin.commands]
    .filter((command) => !command.disableModelInvocation)
    .sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
  const promptTargetNames = convertibleCommands.map((command) =>
    uniquePiSkillName(normalizePiSkillName(command.name), promptNames),
  )

  const promptMap: Record<string, string> = {}
  convertibleCommands.forEach((command, i) => { promptMap[command.name] = promptTargetNames[i] })

  const nameMaps: PiNameMaps = { agents: agentMap, skills: skillMap, prompts: promptMap }

  const prompts = convertibleCommands.map((command, i) => convertPrompt(command, promptTargetNames[i], nameMaps))

  const generatedSkills = sortedAgents.map((agent, i) => convertAgent(agent, agentNames[i], nameMaps))

  const extensions = [
    {
      name: "compound-engineering-compat.ts",
      content: PI_COMPAT_EXTENSION_SOURCE,
    },
  ]

  return {
    prompts,
    skillDirs,
    generatedSkills,
    extensions,
    mcporterConfig: plugin.mcpServers ? convertMcpToMcporter(plugin.mcpServers) : undefined,
    nameMaps,
  }
}

function convertPrompt(command: ClaudeCommand, name: string, nameMaps: PiNameMaps) {
  const frontmatter: Record<string, unknown> = {
    description: command.description,
    "argument-hint": command.argumentHint,
  }

  const body = appendCompatibilityNoteIfNeeded(transformPiBodyContent(command.body, nameMaps))

  return {
    name,
    content: formatFrontmatter(frontmatter, body.trim()),
  }
}

function convertAgent(agent: ClaudeAgent, name: string, nameMaps: PiNameMaps): PiGeneratedSkill {
  const description = sanitizeDescription(
    agent.description ?? `Converted from Claude agent ${agent.name}`,
  )

  const frontmatter: Record<string, unknown> = {
    name,
    description,
  }

  const sections: string[] = []
  if (agent.capabilities && agent.capabilities.length > 0) {
    sections.push(`## Capabilities\n${agent.capabilities.map((capability) => `- ${capability}`).join("\n")}`)
  }

  const body = transformPiBodyContent([
    ...sections,
    agent.body.trim().length > 0
      ? agent.body.trim()
      : `Instructions converted from the ${agent.name} agent.`,
  ].join("\n\n"), nameMaps)

  return {
    name,
    content: formatFrontmatter(frontmatter, body),
  }
}

function convertMcpToMcporter(servers: Record<string, ClaudeMcpServer>): PiMcporterConfig {
  const mcpServers: Record<string, PiMcporterServer> = {}

  for (const [name, server] of Object.entries(servers)) {
    if (server.command) {
      mcpServers[name] = {
        command: server.command,
        args: server.args,
        env: server.env,
        headers: server.headers,
      }
      continue
    }

    if (server.url) {
      mcpServers[name] = {
        baseUrl: server.url,
        headers: server.headers,
      }
    }
  }

  return { mcpServers }
}

function sanitizeDescription(value: string, maxLength = PI_DESCRIPTION_MAX_LENGTH): string {
  const normalized = value.replace(/\s+/g, " ").trim()
  if (normalized.length <= maxLength) return normalized
  const ellipsis = "..."
  return normalized.slice(0, Math.max(0, maxLength - ellipsis.length)).trimEnd() + ellipsis
}
