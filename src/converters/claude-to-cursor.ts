import { formatFrontmatter } from "../utils/frontmatter"
import type { ClaudeAgent, ClaudeCommand, ClaudeMcpServer, ClaudePlugin } from "../types/claude"
import type { CursorBundle, CursorCommand, CursorMcpServer, CursorRule } from "../types/cursor"
import type { ClaudeToOpenCodeOptions } from "./claude-to-opencode"

export type ClaudeToCursorOptions = ClaudeToOpenCodeOptions

export function convertClaudeToCursor(
  plugin: ClaudePlugin,
  _options: ClaudeToCursorOptions,
): CursorBundle {
  const usedRuleNames = new Set<string>()
  const usedCommandNames = new Set<string>()

  const rules = plugin.agents.map((agent) => convertAgentToRule(agent, usedRuleNames))
  const commands = plugin.commands.map((command) => convertCommand(command, usedCommandNames))
  const skillDirs = plugin.skills.map((skill) => ({
    name: skill.name,
    sourceDir: skill.sourceDir,
  }))

  const mcpServers = convertMcpServers(plugin.mcpServers)

  if (plugin.hooks && Object.keys(plugin.hooks.hooks).length > 0) {
    console.warn("Warning: Cursor does not support hooks. Hooks were skipped during conversion.")
  }

  return { rules, commands, skillDirs, mcpServers }
}

function convertAgentToRule(agent: ClaudeAgent, usedNames: Set<string>): CursorRule {
  const name = uniqueName(normalizeName(agent.name), usedNames)
  const description = agent.description ?? `Converted from Claude agent ${agent.name}`

  const frontmatter: Record<string, unknown> = {
    description,
    alwaysApply: false,
  }

  let body = transformContentForCursor(agent.body.trim())
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

function convertCommand(command: ClaudeCommand, usedNames: Set<string>): CursorCommand {
  const name = uniqueName(flattenCommandName(command.name), usedNames)

  const sections: string[] = []

  if (command.description) {
    sections.push(`<!-- ${command.description} -->`)
  }

  if (command.argumentHint) {
    sections.push(`## Arguments\n${command.argumentHint}`)
  }

  const transformedBody = transformContentForCursor(command.body.trim())
  sections.push(transformedBody)

  const content = sections.filter(Boolean).join("\n\n").trim()
  return { name, content }
}

/**
 * Transform Claude Code content to Cursor-compatible content.
 *
 * 1. Task agent calls: Task agent-name(args) -> Use the agent-name skill to: args
 * 2. Slash commands: /workflows:plan -> /plan (flatten namespace)
 * 3. Path rewriting: .claude/ -> .cursor/
 * 4. Agent references: @agent-name -> the agent-name rule
 */
export function transformContentForCursor(body: string): string {
  let result = body

  // 1. Transform Task agent calls
  const taskPattern = /^(\s*-?\s*)Task\s+([a-z][a-z0-9-]*)\(([^)]+)\)/gm
  result = result.replace(taskPattern, (_match, prefix: string, agentName: string, args: string) => {
    const skillName = normalizeName(agentName)
    return `${prefix}Use the ${skillName} skill to: ${args.trim()}`
  })

  // 2. Transform slash command references (flatten namespaces)
  const slashCommandPattern = /(?<![:\w])\/([a-z][a-z0-9_:-]*?)(?=[\s,."')\]}`]|$)/gi
  result = result.replace(slashCommandPattern, (match, commandName: string) => {
    if (commandName.includes("/")) return match
    if (["dev", "tmp", "etc", "usr", "var", "bin", "home"].includes(commandName)) return match
    const flattened = flattenCommandName(commandName)
    return `/${flattened}`
  })

  // 3. Rewrite .claude/ paths to .cursor/
  result = result
    .replace(/~\/\.claude\//g, "~/.cursor/")
    .replace(/\.claude\//g, ".cursor/")

  // 4. Transform @agent-name references
  const agentRefPattern = /@([a-z][a-z0-9-]*-(?:agent|reviewer|researcher|analyst|specialist|oracle|sentinel|guardian|strategist))/gi
  result = result.replace(agentRefPattern, (_match, agentName: string) => {
    return `the ${normalizeName(agentName)} rule`
  })

  return result
}

function convertMcpServers(
  servers?: Record<string, ClaudeMcpServer>,
): Record<string, CursorMcpServer> | undefined {
  if (!servers || Object.keys(servers).length === 0) return undefined

  const result: Record<string, CursorMcpServer> = {}
  for (const [name, server] of Object.entries(servers)) {
    const entry: CursorMcpServer = {}
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

function flattenCommandName(name: string): string {
  const colonIndex = name.lastIndexOf(":")
  const base = colonIndex >= 0 ? name.slice(colonIndex + 1) : name
  return normalizeName(base)
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
