import { formatFrontmatter } from "../utils/frontmatter"
import type { ClaudeAgent, ClaudeMcpServer, ClaudePlugin } from "../types/claude"
import type { KiloCodeAgent, KiloCodeBundle, KiloCodeMcpServer } from "../types/kilocode"
import type { ClaudeToOpenCodeOptions } from "./claude-to-opencode"

export type ClaudeToKiloCodeOptions = ClaudeToOpenCodeOptions

/**
 * Convert a Claude Code plugin to KiloCode format.
 *
 * Key transformations:
 * - MCP servers: http → remote, stdio → local
 * - MCP config key: "mcpServers" → "mcp"
 * - MCP command: string → string[]
 * - Agents: add mode: subagent and permission fields
 * - Content paths: .claude/ → .kilocode/
 * - Skills: pass-through copy (SKILL.md format is compatible)
 */
export function convertClaudeToKiloCode(
  plugin: ClaudePlugin,
  options: ClaudeToKiloCodeOptions,
): KiloCodeBundle {
  const usedNames = new Set<string>()

  const agents = plugin.agents.map((agent) => convertAgent(agent, options, usedNames))

  const skillDirs = plugin.skills.map((skill) => ({
    name: skill.name,
    sourceDir: skill.sourceDir,
  }))

  const mcpConfig = convertMcpServers(plugin.mcpServers)

  if (plugin.hooks && Object.keys(plugin.hooks.hooks).length > 0) {
    console.warn("Warning: KiloCode does not support hooks. Hooks were skipped during conversion.")
  }

  return { agents, skillDirs, mcpConfig }
}

/**
 * Convert a Claude agent to KiloCode subagent format.
 *
 * KiloCode agent frontmatter:
 * - description: Required
 * - mode: "subagent" | "primary" | "all"
 * - model: Optional (e.g., "anthropic/claude-sonnet-4-20250514")
 * - permission: Optional (edit, bash permissions)
 */
function convertAgent(agent: ClaudeAgent, options: ClaudeToKiloCodeOptions, usedNames: Set<string>): KiloCodeAgent {
  const name = uniqueName(normalizeName(agent.name), usedNames)
  const description = agent.description ?? `Converted from Claude agent ${agent.name}`

  const frontmatter: Record<string, unknown> = {
    description,
    mode: options.agentMode,
  }

  if (agent.model && agent.model !== "inherit") {
    // KiloCode uses format like "anthropic/claude-sonnet-4-20250514"
    frontmatter.model = agent.model
  }

  // Default to deny edit/bash for safety (subagents typically shouldn't modify files)
  frontmatter.permission = {
    edit: "deny",
    bash: "deny",
  }

  let body = transformContentForKiloCode(agent.body.trim())

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

/**
 * Convert Claude MCP servers to KiloCode format.
 *
 * Key differences:
 * - KiloCode uses "mcp" key instead of "mcpServers"
 * - KiloCode uses "local" | "remote" types instead of "stdio" | "http"
 * - KiloCode command is an array instead of a string
 * - KiloCode uses "environment" instead of "env"
 */
function convertMcpServers(
  servers?: Record<string, ClaudeMcpServer>,
): KiloCodeBundle["mcpConfig"] {
  if (!servers || Object.keys(servers).length === 0) {
    return {}
  }

  const mcp: Record<string, KiloCodeMcpServer> = {}

  for (const [name, server] of Object.entries(servers)) {
    const entry: KiloCodeMcpServer = {
      enabled: true,
    }

    // Determine type based on whether command or url is present
    if (server.url) {
      // HTTP/SSE server → remote
      entry.type = "remote"
      entry.url = server.url
      if (server.headers && Object.keys(server.headers).length > 0) {
        entry.headers = server.headers
      }
    } else if (server.command) {
      // stdio server → local
      entry.type = "local"
      // KiloCode expects command as an array
      entry.command = buildCommandArray(server.command, server.args)
      if (server.env && Object.keys(server.env).length > 0) {
        entry.environment = server.env
      }
    } else {
      // Skip servers without command or url
      console.warn(`Warning: MCP server "${name}" has neither command nor url. Skipping.`)
      continue
    }

    mcp[name] = entry
  }

  if (Object.keys(mcp).length === 0) {
    return {}
  }

  return { mcp }
}

/**
 * Build a command array from command string and args.
 *
 * KiloCode expects command as an array, e.g.:
 * ["npx", "-y", "@anthropic/mcp-server"]
 */
function buildCommandArray(command?: string, args?: string[]): string[] {
  if (!command) return []

  // If command already looks like a full command line, split it
  // Otherwise use command as first element with args following
  if (command.includes(" ") && !args?.length) {
    return command.split(/\s+/).filter(Boolean)
  }

  const result: string[] = [command]
  if (args && args.length > 0) {
    result.push(...args)
  }
  return result
}

/**
 * Transform Claude Code content to KiloCode-compatible content.
 *
 * 1. Rewrite paths: .claude/ → .kilocode/, ~/.claude/ → ~/.kilocode/
 * 2. Transform slash command references (flatten namespaced commands)
 * 3. Transform Task agent calls to skill references
 * 4. Transform @agent-name references
 */
export function transformContentForKiloCode(body: string): string {
  let result = body

  // 1. Rewrite paths
  result = result
    .replace(/~\/\.claude\//g, "~/.kilocode/")
    .replace(/\.claude\//g, ".kilocode/")

  // 2. Transform Task agent calls
  const taskPattern = /^(\s*-?\s*)Task\s+([a-z][a-z0-9-]*)\(([^)]+)\)/gm
  result = result.replace(taskPattern, (_match, prefix: string, agentName: string, args: string) => {
    const skillName = normalizeName(agentName)
    return `${prefix}Use the ${skillName} skill to: ${args.trim()}`
  })

  // 3. Transform slash command references (flatten namespaced commands)
  const slashCommandPattern = /(?<![:\w])\/([a-z][a-z0-9_:-]*?)(?=[\s,."')\]}`]|$)/gi
  result = result.replace(slashCommandPattern, (match, commandName: string) => {
    if (commandName.includes("/")) return match // Skip file paths
    if (["dev", "tmp", "etc", "usr", "var", "bin", "home"].includes(commandName)) return match
    const flattened = flattenCommandName(commandName)
    return `/${flattened}`
  })

  // 4. Transform @agent-name references
  const agentRefPattern =
    /@([a-z][a-z0-9-]*-(?:agent|reviewer|researcher|analyst|specialist|oracle|sentinel|guardian|strategist))/gi
  result = result.replace(agentRefPattern, (_match, agentName: string) => {
    return `the ${normalizeName(agentName)} subagent`
  })

  return result
}

/**
 * Flatten a namespaced command name.
 * "ce:plan" → "ce-plan"
 * "workflows:plan" → "workflows-plan"
 */
function flattenCommandName(name: string): string {
  // Replace colons with hyphens for KiloCode compatibility
  return normalizeName(name.replace(/:/g, "-"))
}

/**
 * Normalize a name to lowercase with hyphens.
 */
export function normalizeName(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return "item"
  let normalized = trimmed
    .toLowerCase()
    .replace(/[\\/]+/g, "-")
    .replace(/[:\s]+/g, "-")
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")

  if (normalized.length === 0 || !/^[a-z]/.test(normalized)) {
    return "item"
  }

  return normalized
}

/**
 * Generate a unique name, appending -2, -3, etc. for collisions.
 */
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
