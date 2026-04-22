import { formatFrontmatter } from "../utils/frontmatter"
import { type ClaudeAgent, type ClaudeCommand, type ClaudeMcpServer, type ClaudePlugin, filterSkillsByPlatform } from "../types/claude"
import type {
  PiBundle,
  PiGeneratedAgent,
  PiMcporterConfig,
  PiMcporterServer,
} from "../types/pi"
import type { ClaudeToOpenCodeOptions } from "./claude-to-opencode"

export type ClaudeToPiOptions = ClaudeToOpenCodeOptions

const PI_DESCRIPTION_MAX_LENGTH = 1024

export function convertClaudeToPi(
  plugin: ClaudePlugin,
  _options: ClaudeToPiOptions,
): PiBundle {
  const platformSkills = filterSkillsByPlatform(plugin.skills, "pi")
  const promptNames = new Set<string>()
  // Pi agents and skills live in separate directories (.pi/agents/<name>.md vs
  // .pi/skills/<name>/SKILL.md), so their names don't need to be deduplicated
  // against each other — nicobailon/pi-subagents resolves agents by filename
  // match and ignores skill dirs.
  const usedAgentNames = new Set<string>()

  const prompts = plugin.commands
    .filter((command) => !command.disableModelInvocation)
    .map((command) => convertPrompt(command, promptNames))

  const agents = plugin.agents.map((agent) => convertAgent(agent, usedAgentNames))

  return {
    pluginName: plugin.manifest.name,
    prompts,
    skillDirs: platformSkills.map((skill) => ({
      name: skill.name,
      sourceDir: skill.sourceDir,
    })),
    generatedSkills: [],
    agents,
    extensions: [],
    mcporterConfig: plugin.mcpServers ? convertMcpToMcporter(plugin.mcpServers) : undefined,
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

function convertPrompt(command: ClaudeCommand, usedNames: Set<string>) {
  const name = uniqueName(normalizeName(command.name), usedNames)
  const frontmatter: Record<string, unknown> = {
    description: command.description,
    "argument-hint": command.argumentHint,
  }

  const body = transformContentForPi(command.body)

  return {
    name,
    content: formatFrontmatter(frontmatter, body.trim()),
  }
}

function convertAgent(agent: ClaudeAgent, usedNames: Set<string>): PiGeneratedAgent {
  const name = uniqueName(normalizeName(agent.name), usedNames)
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

  const body = [
    ...sections,
    agent.body.trim().length > 0
      ? agent.body.trim()
      : `Instructions converted from the ${agent.name} agent.`,
  ].join("\n\n")

  return {
    name,
    content: formatFrontmatter(frontmatter, body),
  }
}

export function transformContentForPi(body: string): string {
  let result = body

  // Task repo-research-analyst(feature_description) or Task compound-engineering:research:repo-research-analyst(args)
  // -> Run subagent with agent="repo-research-analyst" and task="feature_description"
  const taskPattern = /^(\s*-?\s*)Task\s+([a-z][a-z0-9:-]*)\(([^)]*)\)/gm
  result = result.replace(taskPattern, (_match, prefix: string, agentName: string, args: string) => {
    const finalSegment = agentName.includes(":") ? agentName.split(":").pop()! : agentName
    const skillName = normalizeName(finalSegment)
    const trimmedArgs = args.trim().replace(/\s+/g, " ")
    return trimmedArgs
      ? `${prefix}Run subagent with agent=\"${skillName}\" and task=\"${trimmedArgs}\".`
      : `${prefix}Run subagent with agent=\"${skillName}\".`
  })

  // Claude Code task-tracking primitives: current Task* API (TaskCreate/TaskUpdate/TaskList/TaskGet/TaskStop/TaskOutput)
  // plus the deprecated legacy pair (TodoWrite/TodoRead). All map to the platform's task-tracking primitive.
  result = result.replace(
    /\bTask(?:Create|Update|List|Get|Stop|Output)\b/g,
    "the platform's task-tracking primitive",
  )
  result = result.replace(/\bTodoWrite\b/g, "the platform's task-tracking primitive")
  result = result.replace(/\bTodoRead\b/g, "the platform's task-tracking primitive")

  // /command-name or /workflows:command-name -> /workflows-command-name
  const slashCommandPattern = /(?<![:\w])\/([a-z][a-z0-9_:-]*?)(?=[\s,."')\]}`]|$)/gi
  result = result.replace(slashCommandPattern, (match, commandName: string) => {
    if (commandName.includes("/")) return match
    if (["dev", "tmp", "etc", "usr", "var", "bin", "home"].includes(commandName)) {
      return match
    }

    if (commandName.startsWith("skill:")) {
      const skillName = commandName.slice("skill:".length)
      return `/skill:${normalizeName(skillName)}`
    }

    const withoutPrefix = commandName.startsWith("prompts:")
      ? commandName.slice("prompts:".length)
      : commandName

    return `/${normalizeName(withoutPrefix)}`
  })

  return result
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

function sanitizeDescription(value: string, maxLength = PI_DESCRIPTION_MAX_LENGTH): string {
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
