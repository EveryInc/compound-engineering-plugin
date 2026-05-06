import { formatFrontmatter } from "../utils/frontmatter"
import { type ClaudeAgent, type ClaudeCommand, type ClaudeMcpServer, type ClaudePlugin, filterSkillsByPlatform } from "../types/claude"
import type { GeminiAgent, GeminiBundle, GeminiCommand, GeminiMcpServer } from "../types/gemini"
import type { ClaudeToOpenCodeOptions } from "./claude-to-opencode"

export type ClaudeToGeminiOptions = ClaudeToOpenCodeOptions

const GEMINI_DESCRIPTION_MAX_LENGTH = 1024

export function convertClaudeToGemini(
  plugin: ClaudePlugin,
  _options: ClaudeToGeminiOptions,
): GeminiBundle {
  const usedCommandNames = new Set<string>()

  const platformSkills = filterSkillsByPlatform(plugin.skills, "gemini")
  const skillDirs = platformSkills.map((skill) => ({
    name: skill.name,
    sourceDir: skill.sourceDir,
  }))

  const usedAgentNames = new Set<string>()
  const agents = plugin.agents.map((agent) => convertAgent(agent, usedAgentNames))

  const commands = plugin.commands.map((command) => convertCommand(command, usedCommandNames))

  const mcpServers = convertMcpServers(plugin.mcpServers)

  if (plugin.hooks && Object.keys(plugin.hooks.hooks).length > 0) {
    console.warn("Warning: Gemini CLI hooks use a different format (BeforeTool/AfterTool with matchers). Hooks were skipped during conversion.")
  }

  return { pluginName: plugin.manifest.name, generatedSkills: [], skillDirs, agents, commands, mcpServers }
}

function convertAgent(agent: ClaudeAgent, usedNames: Set<string>): GeminiAgent {
  const name = uniqueName(normalizeName(agent.name), usedNames)
  const description = sanitizeDescription(
    agent.description ?? `Use this agent for ${agent.name} tasks`,
  )

  const frontmatter: Record<string, unknown> = { name, description, kind: "local" }

  let body = transformContentForGemini(agent.body.trim())
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

function convertCommand(command: ClaudeCommand, usedNames: Set<string>): GeminiCommand {
  // Preserve namespace structure: workflows:plan -> workflows/plan
  const commandPath = resolveCommandPath(command.name)
  const pathKey = commandPath.join("/")
  uniqueName(pathKey, usedNames) // Track for dedup

  const description = command.description ?? `Converted from Claude command ${command.name}`
  const transformedBody = transformContentForGemini(command.body.trim())

  let prompt = transformedBody
  if (command.argumentHint) {
    prompt += `\n\nUser request: {{args}}`
  }

  const content = toToml(description, prompt)
  return { name: pathKey, content }
}

/**
 * Transform Claude Code content to Gemini-compatible content.
 *
 * 1. Task agent calls: Task agent-name(args) -> Use the @agent-name subagent to: args
 * 2. Path rewriting: .claude/ -> .gemini/, ~/.claude/ -> ~/.gemini/
 * 3. Agent references: @agent-name -> @agent-name subagent
 */
export function transformContentForGemini(body: string): string {
  let result = body

  // 1. Transform Task agent calls (supports namespaced names like compound-engineering:research:agent-name)
  const taskPattern = /^(\s*-?\s*)Task\s+([a-z][a-z0-9:-]*)\(([^)]*)\)/gm
  result = result.replace(taskPattern, (_match, prefix: string, agentName: string, args: string) => {
    const finalSegment = agentName.includes(":") ? agentName.split(":").pop()! : agentName
    const geminiAgentName = normalizeName(finalSegment)
    const trimmedArgs = args.trim()
    return trimmedArgs
      ? `${prefix}Use the @${geminiAgentName} subagent to: ${trimmedArgs}`
      : `${prefix}Use the @${geminiAgentName} subagent`
  })

  // 2. Rewrite .claude/ paths to .gemini/
  result = result
    .replace(/~\/\.claude\//g, "~/.gemini/")
    .replace(/\.claude\//g, ".gemini/")

  // 3. Transform @agent-name references
  const agentRefPattern = /@([a-z][a-z0-9-]*-(?:agent|reviewer|researcher|analyst|specialist|oracle|sentinel|guardian|strategist))(?!\s+subagent\b)/gi
  result = result.replace(agentRefPattern, (_match, agentName: string) => {
    return `@${normalizeName(agentName)} subagent`
  })

  return result
}

function convertMcpServers(
  servers?: Record<string, ClaudeMcpServer>,
): Record<string, GeminiMcpServer> | undefined {
  if (!servers || Object.keys(servers).length === 0) return undefined

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

/**
 * Resolve command name to path segments.
 * workflows:plan -> ["workflows", "plan"]
 * plan -> ["plan"]
 */
function resolveCommandPath(name: string): string[] {
  return name.split(":").map((segment) => normalizeName(segment))
}

/**
 * Serialize to TOML command format.
 * Uses multi-line strings (""") for prompt field.
 */
export function toToml(description: string, prompt: string): string {
  const lines: string[] = []
  lines.push(`description = ${formatTomlString(description)}`)

  // Use multi-line string for prompt
  const escapedPrompt = prompt.replace(/\\/g, "\\\\").replace(/"""/g, '\\"\\"\\"')
  lines.push(`prompt = """`)
  lines.push(escapedPrompt)
  lines.push(`"""`)

  return lines.join("\n")
}

function formatTomlString(value: string): string {
  return JSON.stringify(value)
}

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

function sanitizeDescription(value: string, maxLength = GEMINI_DESCRIPTION_MAX_LENGTH): string {
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
