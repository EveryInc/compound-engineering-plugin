import { formatFrontmatter } from "../utils/frontmatter"
import { findServersWithPotentialSecrets } from "../utils/secrets"
import type { ClaudeAgent, ClaudeCommand, ClaudeMcpServer, ClaudePlugin } from "../types/claude"
import type { WindsurfBundle, WindsurfGeneratedSkill, WindsurfMcpConfig, WindsurfMcpServerEntry, WindsurfWorkflow } from "../types/windsurf"
import type { ClaudeToOpenCodeOptions } from "./claude-to-opencode"

export type ClaudeToWindsurfOptions = ClaudeToOpenCodeOptions

const WINDSURF_WORKFLOW_CHAR_LIMIT = 12_000

export function convertClaudeToWindsurf(
  plugin: ClaudePlugin,
  _options: ClaudeToWindsurfOptions,
): WindsurfBundle {
  const knownAgentNames = plugin.agents.map((a) => normalizeName(a.name))

  // Pass-through skills (collected first so agent skill names can deduplicate against them)
  const skillDirs = plugin.skills.map((skill) => ({
    name: skill.name,
    sourceDir: skill.sourceDir,
  }))

  // Convert agents to skills (seed usedNames with pass-through skill names)
  const usedSkillNames = new Set<string>(skillDirs.map((s) => s.name))
  const agentSkills = plugin.agents.map((agent) =>
    convertAgentToSkill(agent, knownAgentNames, usedSkillNames),
  )

  // Convert commands to workflows
  const usedCommandNames = new Set<string>()
  const commandWorkflows = plugin.commands.map((command) =>
    convertCommandToWorkflow(command, knownAgentNames, usedCommandNames),
  )

  // Build MCP config
  const mcpConfig = buildMcpConfig(plugin.mcpServers)

  // Warn about hooks
  if (plugin.hooks && Object.keys(plugin.hooks.hooks).length > 0) {
    console.warn(
      "Warning: Windsurf has no hooks equivalent. Hooks were skipped during conversion.",
    )
  }

  return { agentSkills, commandWorkflows, skillDirs, mcpConfig }
}

function convertAgentToSkill(
  agent: ClaudeAgent,
  knownAgentNames: string[],
  usedNames: Set<string>,
): WindsurfGeneratedSkill {
  const name = uniqueName(normalizeName(agent.name), usedNames)
  const description = sanitizeDescription(
    agent.description ?? `Converted from Claude agent ${agent.name}`,
  )

  let body = transformContentForWindsurf(agent.body.trim(), knownAgentNames)
  if (agent.capabilities && agent.capabilities.length > 0) {
    const capabilities = agent.capabilities.map((c) => `- ${c}`).join("\n")
    body = `## Capabilities\n${capabilities}\n\n${body}`.trim()
  }
  if (body.length === 0) {
    body = `Instructions converted from the ${agent.name} agent.`
  }

  const content = formatFrontmatter({ name, description }, `# ${name}\n\n${body}`) + "\n"
  return { name, content }
}

function convertCommandToWorkflow(
  command: ClaudeCommand,
  knownAgentNames: string[],
  usedNames: Set<string>,
): WindsurfWorkflow {
  const name = uniqueName(normalizeName(command.name), usedNames)
  const description = sanitizeDescription(
    command.description ?? `Converted from Claude command ${command.name}`,
  )

  let body = transformContentForWindsurf(command.body.trim(), knownAgentNames)
  if (command.argumentHint) {
    body = `> Arguments: ${command.argumentHint}\n\n${body}`
  }
  if (body.length === 0) {
    body = `Instructions converted from the ${command.name} command.`
  }

  const frontmatter: Record<string, unknown> = { description }
  const fullContent = formatFrontmatter(frontmatter, `# ${name}\n\n${body}`)
  if (fullContent.length > WINDSURF_WORKFLOW_CHAR_LIMIT) {
    console.warn(
      `Warning: Workflow "${name}" is ${fullContent.length} characters (limit: ${WINDSURF_WORKFLOW_CHAR_LIMIT}). It may be truncated by Windsurf.`,
    )
  }

  return { name, description, body }
}

/**
 * Transform Claude Code content to Windsurf-compatible content.
 *
 * 1. Path rewriting: .claude/ -> .windsurf/, ~/.claude/ -> ~/.codeium/windsurf/
 * 2. Slash command refs: /workflows:plan -> /workflows-plan (Windsurf invokes workflows as /{name})
 * 3. @agent-name refs: kept as @agent-name (already Windsurf skill invocation syntax)
 * 4. Task agent calls: Task agent-name(args) -> Use the @agent-name skill: args
 */
export function transformContentForWindsurf(body: string, knownAgentNames: string[] = []): string {
  let result = body

  // 1. Rewrite paths
  result = result.replace(/(?<=^|\s|["'`])~\/\.claude\//gm, "~/.codeium/windsurf/")
  result = result.replace(/(?<=^|\s|["'`])\.claude\//gm, ".windsurf/")

  // 2. Slash command refs: /workflows:plan -> /workflows-plan (Windsurf invokes as /{name})
  result = result.replace(/(?<=^|\s)`?\/([a-zA-Z][a-zA-Z0-9_:-]*)`?/gm, (_match, cmdName: string) => {
    const workflowName = normalizeName(cmdName)
    return `/${workflowName}`
  })

  // 3. @agent-name references: no transformation needed.
  // In Windsurf, @skill-name is the native invocation syntax for skills.
  // Since agents are now mapped to skills, @agent-name already works correctly.

  // 4. Transform Task agent calls to skill references
  const taskPattern = /^(\s*-?\s*)Task\s+([a-z][a-z0-9-]*)\(([^)]+)\)/gm
  result = result.replace(taskPattern, (_match, prefix: string, agentName: string, args: string) => {
    return `${prefix}Use the @${normalizeName(agentName)} skill: ${args.trim()}`
  })

  return result
}

function buildMcpConfig(servers?: Record<string, ClaudeMcpServer>): WindsurfMcpConfig | null {
  if (!servers || Object.keys(servers).length === 0) return null

  const result: Record<string, WindsurfMcpServerEntry> = {}
  for (const [name, server] of Object.entries(servers)) {
    if (server.command) {
      // stdio transport
      const entry: WindsurfMcpServerEntry = { command: server.command }
      if (server.args?.length) entry.args = server.args
      if (server.env && Object.keys(server.env).length > 0) entry.env = server.env
      result[name] = entry
    } else if (server.url) {
      // HTTP/SSE transport
      const entry: WindsurfMcpServerEntry = { serverUrl: server.url }
      if (server.headers && Object.keys(server.headers).length > 0) entry.headers = server.headers
      if (server.env && Object.keys(server.env).length > 0) entry.env = server.env
      result[name] = entry
    } else {
      console.warn(`Warning: MCP server "${name}" has no command or URL. Skipping.`)
      continue
    }
  }

  if (Object.keys(result).length === 0) return null

  // Warn about secrets (don't redact — they're needed for the config to work)
  const flagged = findServersWithPotentialSecrets(result)
  if (flagged.length > 0) {
    console.warn(
      `Warning: MCP servers contain env vars that may include secrets: ${flagged.join(", ")}.\n` +
      "   These will be written to mcp_config.json. Review before sharing the config file.",
    )
  }

  return { mcpServers: result }
}

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

function sanitizeDescription(value: string): string {
  return value.replace(/\s+/g, " ").trim()
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
