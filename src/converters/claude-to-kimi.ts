import fs, { type Dirent } from "fs"
import path from "path"
import { formatFrontmatter } from "../utils/frontmatter"
import { type ClaudeAgent, type ClaudeCommand, type ClaudeHooks, type ClaudePlugin, filterSkillsByPlatform } from "../types/claude"
import type {
  KimiBundle,
  KimiGeneratedSkill,
  KimiGeneratedSkillSidecarDir,
} from "../types/kimi"
import type { ClaudeToOpenCodeOptions } from "./claude-to-opencode"
import {
  isKimiHookEvent,
  normalizeKimiName,
  transformContentForKimi,
  type KimiInvocationTargets,
} from "../utils/kimi-content"

export type ClaudeToKimiOptions = ClaudeToOpenCodeOptions

// Kimi skill descriptions are 1-1024 chars.
const KIMI_DESCRIPTION_MAX_LENGTH = 1024

/**
 * Convert a Claude plugin into a Kimi CLI bundle.
 *
 * Kimi has no native plugin-install flow, so everything is emitted by the
 * converter. Skills map directly (same open SKILL.md spec). Commands and agents
 * have no first-class Kimi equivalent, so both become skills the user invokes
 * via `/skill:<name>`. MCP servers and hooks map to Kimi's own config surfaces.
 */
export function convertClaudeToKimi(
  plugin: ClaudePlugin,
  _options: ClaudeToKimiOptions,
): KimiBundle {
  const platformSkills = filterSkillsByPlatform(plugin.skills, "kimi")
  const invocableCommands = plugin.commands.filter((command) => !command.disableModelInvocation)

  const skillDirs = platformSkills.map((skill) => ({
    name: skill.name,
    sourceDir: skill.sourceDir,
  }))

  // Reserve every emitted skill name up front so command- and agent-derived
  // skills never collide with a pass-through skill or with each other.
  const usedNames = new Set<string>(skillDirs.map((skill) => normalizeKimiName(skill.name)))

  const skillTargets: Record<string, string> = {}
  for (const skill of platformSkills) {
    skillTargets[normalizeKimiName(skill.name)] = skill.name
  }

  const commandSkillNames = new Map<string, string>()
  for (const command of invocableCommands) {
    const name = uniqueName(normalizeKimiName(command.name), usedNames)
    commandSkillNames.set(command.name, name)
    skillTargets[normalizeKimiName(command.name)] = name
  }

  const agentSkillNames = new Map<string, string>()
  const agentTargets: Record<string, string> = {}
  for (const agent of plugin.agents) {
    const name = uniqueName(normalizeKimiName(agent.name), usedNames)
    agentSkillNames.set(agent.name, name)
    for (const alias of agentAliases(plugin, agent)) {
      agentTargets[normalizeKimiName(alias)] = name
    }
  }

  warnUnsupportedHooks(plugin.hooks)

  const invocationTargets: KimiInvocationTargets = { skillTargets, agentTargets }

  const generatedSkills: KimiGeneratedSkill[] = []
  for (const command of invocableCommands) {
    generatedSkills.push(
      convertCommandSkill(command, commandSkillNames.get(command.name)!, invocationTargets),
    )
  }
  for (const agent of plugin.agents) {
    generatedSkills.push(
      convertAgentSkill(agent, agentSkillNames.get(agent.name)!, invocationTargets),
    )
  }

  return {
    pluginName: plugin.manifest.name,
    skillDirs,
    generatedSkills,
    invocationTargets,
    mcpServers: plugin.mcpServers,
    hooks: plugin.hooks,
  }
}

function convertCommandSkill(
  command: ClaudeCommand,
  name: string,
  invocationTargets: KimiInvocationTargets,
): KimiGeneratedSkill {
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
  sections.push(transformContentForKimi(command.body.trim(), invocationTargets))
  const body = sections.filter(Boolean).join("\n\n").trim()
  const content = formatFrontmatter(frontmatter, body.length > 0 ? body : command.body)
  return { name, content }
}

function convertAgentSkill(
  agent: ClaudeAgent,
  name: string,
  invocationTargets: KimiInvocationTargets,
): KimiGeneratedSkill {
  const frontmatter: Record<string, unknown> = {
    name,
    description: sanitizeDescription(
      agent.description ?? `Converted from Claude agent ${agent.name}`,
    ),
  }
  const sections: string[] = []
  if (agent.capabilities && agent.capabilities.length > 0) {
    sections.push(`## Capabilities\n${agent.capabilities.map((c) => `- ${c}`).join("\n")}`)
  }
  sections.push(transformContentForKimi(agent.body.trim(), invocationTargets))
  const body = sections.filter(Boolean).join("\n\n").trim()
  const content = formatFrontmatter(
    frontmatter,
    body.length > 0 ? body : `Instructions converted from the ${agent.name} agent.`,
  )
  return { name, content, sidecarDirs: collectReferencedSidecarDirs(agent) }
}

function agentAliases(plugin: ClaudePlugin, agent: ClaudeAgent): string[] {
  const category = getAgentCategory(agent)
  const bare = agent.name.startsWith("ce-") ? agent.name.slice("ce-".length) : ""
  return [
    agent.name,
    bare,
    category ? `${category}:${agent.name}` : "",
    category && bare ? `${category}:${bare}` : "",
    category ? `${plugin.manifest.name}:${category}:${agent.name}` : "",
    category && bare ? `${plugin.manifest.name}:${category}:${bare}` : "",
  ].filter(Boolean)
}

function getAgentCategory(agent: ClaudeAgent): string | null {
  const parts = agent.sourcePath.split(path.sep)
  const agentsIndex = parts.lastIndexOf("agents")
  if (agentsIndex === -1) return null
  const next = parts[agentsIndex + 1]
  if (!next || next.endsWith(".md")) return null
  return next
}

function collectReferencedSidecarDirs(agent: ClaudeAgent): KimiGeneratedSkillSidecarDir[] {
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

/**
 * Kimi hooks are `[[hooks]]` shell commands keyed on its own 13 lifecycle
 * events. Claude events Kimi lacks, and prompt/agent-type hook entries (which
 * have no shell command), are dropped during conversion. Warn so the loss is
 * visible rather than silent.
 */
function warnUnsupportedHooks(hooks?: ClaudeHooks): void {
  if (!hooks?.hooks) return
  const droppedEvents = new Set<string>()
  let droppedNonCommand = 0
  for (const [event, matchers] of Object.entries(hooks.hooks)) {
    const hasEntries = matchers.some((matcher) => matcher.hooks.length > 0)
    if (!isKimiHookEvent(event)) {
      if (hasEntries) droppedEvents.add(event)
      continue
    }
    for (const matcher of matchers) {
      for (const entry of matcher.hooks) {
        if (entry.type !== "command") droppedNonCommand += 1
      }
    }
  }

  const parts: string[] = []
  if (droppedEvents.size > 0) {
    parts.push(`unsupported events not converted (${Array.from(droppedEvents).join(", ")})`)
  }
  if (droppedNonCommand > 0) {
    parts.push(`${droppedNonCommand} prompt/agent hook(s) skipped (Kimi hooks run shell commands only)`)
  }
  if (parts.length > 0) {
    console.warn(`Warning: Kimi hook conversion is partial -- ${parts.join("; ")}.`)
  }
}

function sanitizeDescription(value: string, maxLength = KIMI_DESCRIPTION_MAX_LENGTH): string {
  const normalized = value.replace(/\s+/g, " ").trim()
  if (normalized.length <= maxLength) return normalized
  const ellipsis = "..."
  return normalized.slice(0, Math.max(0, maxLength - ellipsis.length)).trimEnd() + ellipsis
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
