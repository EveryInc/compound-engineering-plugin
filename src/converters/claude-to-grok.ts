import { formatFrontmatter } from "../utils/frontmatter"
import { type ClaudeAgent, type ClaudeCommand, type ClaudeMcpServer, type ClaudePlugin, filterSkillsByPlatform } from "../types/claude"
import type { GrokAgent, GrokBundle, GrokCommand, GrokMcpServer } from "../types/grok"
import type { ClaudeToOpenCodeOptions } from "./claude-to-opencode"
import { transformContentForGrok } from "../utils/grok-content"

export type ClaudeToGrokOptions = ClaudeToOpenCodeOptions

const GROK_DESCRIPTION_MAX_LENGTH = 2000 // Grok agents tend to tolerate longer descriptions than Gemini

export function convertClaudeToGrok(
  plugin: ClaudePlugin,
  _options: ClaudeToGrokOptions,
): GrokBundle {
  const usedCommandNames = new Set<string>()

  const platformSkills = filterSkillsByPlatform(plugin.skills, "grok")
  const skillDirs = platformSkills.map((skill) => ({
    name: skill.name,
    sourceDir: skill.sourceDir,
  }))

  const usedAgentNames = new Set<string>()
  const agents = plugin.agents.map((agent) => convertAgent(agent, usedAgentNames))

  const commands = plugin.commands.map((command) => convertCommand(command, usedCommandNames))

  const mcpServers = convertMcpServers(plugin.mcpServers)

  if (plugin.hooks && Object.keys(plugin.hooks.hooks).length > 0) {
    console.warn("Warning: Grok does not have a direct equivalent for Claude hooks. Hooks were skipped during conversion.")
  }

  return {
    pluginName: plugin.manifest.name,
    generatedSkills: [],
    skillDirs,
    agents,
    commands,
    mcpServers,
  }
}

function convertAgent(agent: ClaudeAgent, usedNames: Set<string>): GrokAgent {
  const name = uniqueName(normalizeName(agent.name), usedNames)
  const description = sanitizeDescription(
    agent.description ?? `Use this agent for ${agent.name} tasks`,
    GROK_DESCRIPTION_MAX_LENGTH,
  )

  // Explicit mapping to Grok's expected agent frontmatter (primary fidelity concern)
  const frontmatter: Record<string, unknown> = {
    name,
    description,
    prompt_mode: "full",
    model: "inherit",
    permission_mode: "default",
    agents_md: true,
  }

  let body = transformContentForGrok(agent.body.trim(), { kind: "agent" })

  // Fold capabilities into the body as a section (common pattern across targets)
  if (agent.capabilities && agent.capabilities.length > 0) {
    const capabilities = agent.capabilities.map((c) => `- ${c}`).join("\n")
    body = `## Capabilities\n${capabilities}\n\n${body}`.trim()
  }

  if (body.length === 0) {
    body = `Instructions converted from the ${agent.name} agent.`
  }

  const content = formatFrontmatter(frontmatter, body)
  return { name, content }
}

function convertCommand(command: ClaudeCommand, usedNames: Set<string>): GrokCommand {
  const name = uniqueName(normalizeName(command.name), usedNames)

  const description = command.description ?? `Converted from Claude command ${command.name}`
  const transformedBody = transformContentForGrok(command.body.trim(), { kind: "command" })

  let content = `# ${description}\n\n${transformedBody}`

  if (command.argumentHint) {
    content += `\n\nUser request: {{args}}`
  }

  return { name, content }
}

function convertMcpServers(mcpServers?: Record<string, ClaudeMcpServer>): Record<string, GrokMcpServer> | undefined {
  if (!mcpServers || Object.keys(mcpServers).length === 0) return undefined

  const result: Record<string, GrokMcpServer> = {}
  for (const [name, server] of Object.entries(mcpServers)) {
    result[name] = {
      command: server.command,
      args: server.args,
      env: server.env,
      url: server.url,
      headers: server.headers,
    }
  }
  return result
}

// --- Helpers (duplicated per converter per established pattern in the repo) ---

function normalizeName(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return "item"
  const normalized = trimmed
    .toLowerCase()
    .replace(/[\\/]+/g, "-")
    .replace(/[:\s]+/g, "-")
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
  return normalized || "item"
}

function sanitizeDescription(value: string, maxLength = GROK_DESCRIPTION_MAX_LENGTH): string {
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
