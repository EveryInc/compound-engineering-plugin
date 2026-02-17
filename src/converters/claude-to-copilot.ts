import { formatFrontmatter } from "../utils/frontmatter"
import type { ClaudeAgent, ClaudeCommand, ClaudeMcpServer, ClaudePlugin } from "../types/claude"
import type {
  CopilotAgent,
  CopilotBundle,
  CopilotGeneratedSkill,
  CopilotMcpServer,
} from "../types/copilot"
import type { ClaudeToOpenCodeOptions } from "./claude-to-opencode"

export type ClaudeToCopilotOptions = ClaudeToOpenCodeOptions

const COPILOT_BODY_CHAR_LIMIT = 30_000

export function convertClaudeToCopilot(
  plugin: ClaudePlugin,
  _options: ClaudeToCopilotOptions,
): CopilotBundle {
  const usedAgentNames = new Set<string>()
  const usedSkillNames = new Set<string>()

  const agents = plugin.agents.map((agent) => convertAgent(agent, usedAgentNames))

  // Reserve skill names first so generated skills (from commands) don't collide
  const skillDirs = plugin.skills.map((skill) => {
    usedSkillNames.add(skill.name)
    return {
      name: skill.name,
      sourceDir: skill.sourceDir,
    }
  })

  const generatedSkills = plugin.commands.map((command) =>
    convertCommandToSkill(command, usedSkillNames),
  )

  const mcpConfig = convertMcpServers(plugin.mcpServers)

  if (plugin.hooks && Object.keys(plugin.hooks.hooks).length > 0) {
    console.warn("Warning: Copilot does not support hooks. Hooks were skipped during conversion.")
  }

  return { agents, generatedSkills, skillDirs, mcpConfig }
}

function convertAgent(agent: ClaudeAgent, usedNames: Set<string>): CopilotAgent {
  const name = uniqueName(normalizeName(agent.name), usedNames)
  const description = agent.description ?? `Converted from Claude agent ${agent.name}`

  const frontmatter: Record<string, unknown> = {
    description,
    tools: ["*"],
    infer: true,
  }

  if (agent.model) {
    frontmatter.model = agent.model
  }

  let body = transformContentForCopilot(agent.body.trim())
  if (agent.capabilities && agent.capabilities.length > 0) {
    const capabilities = agent.capabilities.map((c) => `- ${c}`).join("\n")
    body = `## Capabilities\n${capabilities}\n\n${body}`.trim()
  }
  if (body.length === 0) {
    body = `Instructions converted from the ${agent.name} agent.`
  }

  if (body.length > COPILOT_BODY_CHAR_LIMIT) {
    console.warn(
      `Warning: Agent "${agent.name}" body exceeds ${COPILOT_BODY_CHAR_LIMIT} characters (${body.length}). Copilot may truncate it.`,
    )
  }

  const content = formatFrontmatter(frontmatter, body)
  return { name, content }
}

function convertCommandToSkill(
  command: ClaudeCommand,
  usedNames: Set<string>,
): CopilotGeneratedSkill {
  const name = uniqueName(flattenCommandName(command.name), usedNames)

  const frontmatter: Record<string, unknown> = {
    name,
  }
  if (command.description) {
    frontmatter.description = command.description
  }

  const sections: string[] = []

  if (command.argumentHint) {
    sections.push(`## Arguments\n${command.argumentHint}`)
  }

  const transformedBody = transformContentForCopilot(command.body.trim())
  sections.push(transformedBody)

  const body = sections.filter(Boolean).join("\n\n").trim()
  const content = formatFrontmatter(frontmatter, body)
  return { name, content }
}

export function transformContentForCopilot(body: string): string {
  let result = body

  // 1. Transform Task agent calls
  const taskPattern = /^(\s*-?\s*)Task\s+([a-z][a-z0-9-]*)\(([^)]+)\)/gm
  result = result.replace(taskPattern, (_match, prefix: string, agentName: string, args: string) => {
    const skillName = normalizeName(agentName)
    return `${prefix}Use the ${skillName} skill to: ${args.trim()}`
  })

  // 2. Transform slash command references (replace colons with hyphens)
  const slashCommandPattern = /(?<![:\w])\/([a-z][a-z0-9_:-]*?)(?=[\s,."')\]}`]|$)/gi
  result = result.replace(slashCommandPattern, (match, commandName: string) => {
    if (commandName.includes("/")) return match
    if (["dev", "tmp", "etc", "usr", "var", "bin", "home"].includes(commandName)) return match
    const normalized = flattenCommandName(commandName)
    return `/${normalized}`
  })

  // 3. Rewrite .claude/ paths to .github/ and ~/.claude/ to ~/.copilot/
  result = result
    .replace(/~\/\.claude\//g, "~/.copilot/")
    .replace(/\.claude\//g, ".github/")

  // 4. Transform @agent-name references
  const agentRefPattern =
    /@([a-z][a-z0-9-]*-(?:agent|reviewer|researcher|analyst|specialist|oracle|sentinel|guardian|strategist))/gi
  result = result.replace(agentRefPattern, (_match, agentName: string) => {
    return `the ${normalizeName(agentName)} agent`
  })

  return result
}

function convertMcpServers(
  servers?: Record<string, ClaudeMcpServer>,
): Record<string, CopilotMcpServer> | undefined {
  if (!servers || Object.keys(servers).length === 0) return undefined

  const result: Record<string, CopilotMcpServer> = {}
  for (const [name, server] of Object.entries(servers)) {
    const entry: CopilotMcpServer = {
      type: server.command ? "local" : "sse",
      tools: ["*"],
    }

    if (server.command) {
      entry.command = server.command
      if (server.args && server.args.length > 0) entry.args = server.args
    } else if (server.url) {
      entry.url = server.url
      if (server.headers && Object.keys(server.headers).length > 0) entry.headers = server.headers
    }

    if (server.env && Object.keys(server.env).length > 0) {
      entry.env = prefixEnvVars(server.env)
    }

    result[name] = entry
  }
  return result
}

function prefixEnvVars(env: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(env)) {
    if (key.startsWith("COPILOT_MCP_")) {
      result[key] = value
    } else {
      result[`COPILOT_MCP_${key}`] = value
    }
  }
  return result
}

function flattenCommandName(name: string): string {
  return normalizeName(name)
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
