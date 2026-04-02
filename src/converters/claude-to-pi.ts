import path from "path"
import { formatFrontmatter } from "../utils/frontmatter"
import { appendCompatibilityNoteIfNeeded, normalizePiSkillName, transformPiBodyContent, uniquePiSkillName, type PiNameMaps } from "../utils/pi-skills"
import { isSafePiManagedName } from "../utils/pi-managed"
import type { ClaudeAgent, ClaudeCommand, ClaudeMcpServer, ClaudePlugin } from "../types/claude"
import type {
  PiBundle,
  PiGeneratedSkill,
  PiMcporterConfig,
  PiMcporterServer,
} from "../types/pi"
import type { ClaudeToOpenCodeOptions } from "./claude-to-opencode"
import { PI_COMPAT_EXTENSION_SOURCE } from "../templates/pi/compat-extension"

export type ClaudeToPiOptions = ClaudeToOpenCodeOptions & {
  extraNameMaps?: PiNameMaps
  preserveUnknownQualifiedRefs?: boolean
  rejectUnknownQualifiedTaskRefs?: boolean
  rejectUnresolvedFirstPartyQualifiedRefs?: boolean
}

const PI_DESCRIPTION_MAX_LENGTH = 1024

export function convertClaudeToPi(
  plugin: ClaudePlugin,
  options: ClaudeToPiOptions,
): PiBundle {
  const promptNames = new Set<string>()
  const usedSkillNames = new Set<string>()

  const sortedSkills = [...plugin.skills].sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
  const sortedAgents = [...plugin.agents].sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)

  assertNoConfiguredSharedTargetConflicts(options.extraNameMaps?.skills, options.extraNameMaps?.agents)
  reserveConfiguredPiTargetNames(sortedSkills.map((skill) => skill.name), options.extraNameMaps?.skills, usedSkillNames)
  reserveConfiguredPiTargetNames(sortedAgents.map((agent) => agent.name), options.extraNameMaps?.agents, usedSkillNames)
  reserveConfiguredPiTargetNames(
    [...plugin.commands].filter((command) => !command.disableModelInvocation).map((command) => command.name),
    options.extraNameMaps?.prompts,
    promptNames,
  )

  const skillDirs = sortedSkills.map((skill) => ({
    name: resolvePiTargetName(skill.name, options.extraNameMaps?.skills, usedSkillNames),
    sourceDir: skill.sourceDir,
    sourceName: skill.name,
  }))

  const agentNames = sortedAgents.map((agent) =>
    resolvePiTargetName(agent.name, options.extraNameMaps?.agents, usedSkillNames),
  )

  const agentMap: Record<string, string> = {}

  const skillMap: Record<string, string> = {}
  sortedSkills.forEach((skill, i) => {
    const emitted = skillDirs[i].name
    skillMap[skill.name] = emitted
    addQualifiedAlias(skillMap, plugin.manifest.name, skill.name, emitted)
  })

  const convertibleCommands = [...plugin.commands]
    .filter((command) => !command.disableModelInvocation)
    .sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
  const promptTargetNames = convertibleCommands.map((command) =>
    resolvePiTargetName(command.name, options.extraNameMaps?.prompts, promptNames),
  )

  const promptMap: Record<string, string> = {}
  convertibleCommands.forEach((command, i) => {
    const emitted = promptTargetNames[i]
    promptMap[command.name] = emitted
    addQualifiedAlias(promptMap, plugin.manifest.name, command.name, emitted)
  })

  sortedAgents.forEach((agent, i) => {
    const emitted = agentNames[i]
    agentMap[agent.name] = emitted
    addQualifiedAlias(agentMap, plugin.manifest.name, agent.name, emitted)
    const qualifiedAgentAlias = buildQualifiedAgentAlias(plugin.root, plugin.manifest.name, agent)
    if (qualifiedAgentAlias) {
      agentMap[qualifiedAgentAlias] = emitted
    }
  })

  const nameMaps: PiNameMaps = { agents: agentMap, skills: skillMap, prompts: promptMap }
  const transformMaps = mergeNameMaps(nameMaps, options.extraNameMaps)

  const prompts = convertibleCommands.map((command, i) => convertPrompt(command, promptTargetNames[i], transformMaps, options))

  const generatedSkills = sortedAgents.map((agent, i) => convertAgent(agent, agentNames[i], transformMaps, options))

  const extensions = [
    {
      name: "compound-engineering-compat.ts",
      content: PI_COMPAT_EXTENSION_SOURCE,
    },
  ]

  return {
    pluginName: plugin.manifest.name,
    prompts,
    skillDirs,
    generatedSkills,
    extensions,
    mcporterConfig: plugin.mcpServers ? convertMcpToMcporter(plugin.mcpServers) : undefined,
    nameMaps,
  }
}

function addQualifiedAlias(map: Record<string, string>, pluginName: string | undefined, sourceName: string, emitted: string) {
  if (!pluginName || !sourceName) return
  map[`${pluginName}:${sourceName}`] = emitted
}

function buildQualifiedAgentAlias(root: string, pluginName: string | undefined, agent: ClaudeAgent): string | undefined {
  if (!pluginName) return undefined

  const agentsRoot = path.join(root, "agents")
  const relative = path.relative(agentsRoot, agent.sourcePath)
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    return undefined
  }

  const withoutExt = relative.replace(/\.md$/i, "")
  const segments = withoutExt.split(path.sep).filter(Boolean)
  if (segments.length <= 1) {
    return `${pluginName}:${agent.name}`
  }

  return [pluginName, ...segments.slice(0, -1), agent.name].join(":")
}

function convertPrompt(command: ClaudeCommand, name: string, nameMaps: PiNameMaps, options: ClaudeToPiOptions) {
  const frontmatter: Record<string, unknown> = {
    description: command.description,
    "argument-hint": command.argumentHint,
  }

  const body = appendCompatibilityNoteIfNeeded(transformPiBodyContent(command.body, nameMaps, {
    preserveUnknownQualifiedRefs: options.preserveUnknownQualifiedRefs,
    rejectUnknownQualifiedTaskRefs: options.rejectUnknownQualifiedTaskRefs,
    rejectUnresolvedFirstPartyQualifiedRefs: options.rejectUnresolvedFirstPartyQualifiedRefs,
  }))

  return {
    name,
    content: formatFrontmatter(frontmatter, body.trim()),
    sourceName: command.name,
  }
}

function convertAgent(agent: ClaudeAgent, name: string, nameMaps: PiNameMaps, options: ClaudeToPiOptions): PiGeneratedSkill {
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
  ].join("\n\n"), nameMaps, {
    preserveUnknownQualifiedRefs: options.preserveUnknownQualifiedRefs,
    rejectUnknownQualifiedTaskRefs: options.rejectUnknownQualifiedTaskRefs,
    rejectUnresolvedFirstPartyQualifiedRefs: options.rejectUnresolvedFirstPartyQualifiedRefs,
  })

  return {
    name,
    content: formatFrontmatter(frontmatter, body),
    sourceName: agent.name,
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

function mergeNameMaps(primary: PiNameMaps, secondary?: PiNameMaps): PiNameMaps {
  return {
    agents: { ...(secondary?.agents ?? {}), ...(primary.agents ?? {}) },
    skills: { ...(secondary?.skills ?? {}), ...(primary.skills ?? {}) },
    prompts: { ...(secondary?.prompts ?? {}), ...(primary.prompts ?? {}) },
  }
}

function resolvePiTargetName(sourceName: string, configuredMap: Record<string, string> | undefined, usedNames: Set<string>): string {
  const configured = configuredMap?.[sourceName]
  if (configured && isSafePiManagedName(configured)) {
    usedNames.add(configured)
    return configured
  }

  return uniquePiSkillName(normalizePiSkillName(sourceName), usedNames)
}

function reserveConfiguredPiTargetNames(
  sourceNames: string[],
  configuredMap: Record<string, string> | undefined,
  usedNames: Set<string>,
) {
  const reservedBySource = new Map<string, string>()

  for (const sourceName of sourceNames) {
    const configured = configuredMap?.[sourceName]
    if (!configured || !isSafePiManagedName(configured)) continue

    const existingSource = reservedBySource.get(configured)
    if (existingSource && existingSource !== sourceName) {
      throw new Error(`Configured Pi target name collision for ${sourceName}: ${configured}`)
    }

    reservedBySource.set(configured, sourceName)
    usedNames.add(configured)
  }
}

function assertNoConfiguredSharedTargetConflicts(
  skillMap: Record<string, string> | undefined,
  agentMap: Record<string, string> | undefined,
) {
  const reserved = new Map<string, string>()

  for (const [sourceName, configured] of Object.entries(skillMap ?? {})) {
    if (!isSafePiManagedName(configured)) continue
    reserved.set(configured, sourceName)
  }

  for (const [sourceName, configured] of Object.entries(agentMap ?? {})) {
    if (!isSafePiManagedName(configured)) continue
    const existing = reserved.get(configured)
    if (existing && existing !== sourceName) {
      throw new Error(`Configured Pi target name collision for ${sourceName}: ${configured}`)
    }
    reserved.set(configured, sourceName)
  }
}
