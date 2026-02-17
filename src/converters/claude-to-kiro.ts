import { readFileSync, existsSync } from "fs"
import path from "path"
import { formatFrontmatter } from "../utils/frontmatter"
import type { ClaudeAgent, ClaudeCommand, ClaudeMcpServer, ClaudePlugin } from "../types/claude"
import type {
  KiroAgent,
  KiroAgentConfig,
  KiroBundle,
  KiroMcpServer,
  KiroSkill,
  KiroSteeringFile,
} from "../types/kiro"
import type { ClaudeToOpenCodeOptions } from "./claude-to-opencode"

export type ClaudeToKiroOptions = ClaudeToOpenCodeOptions

const KIRO_SKILL_NAME_MAX_LENGTH = 64
const KIRO_SKILL_NAME_PATTERN = /^[a-z][a-z0-9-]*$/
const KIRO_DESCRIPTION_MAX_LENGTH = 1024

const CLAUDE_TO_KIRO_TOOLS: Record<string, string> = {
  Bash: "shell",
  Write: "write",
  Read: "read",
  Edit: "write", // NOTE: Kiro write is full-file, not surgical edit. Lossy mapping.
  Glob: "glob",
  Grep: "grep",
  WebFetch: "web_fetch",
  Task: "use_subagent",
}

export function convertClaudeToKiro(
  plugin: ClaudePlugin,
  _options: ClaudeToKiroOptions,
): KiroBundle {
  const usedSkillNames = new Set<string>()

  // Pass-through skills are processed first — they're the source of truth
  const skillDirs = plugin.skills.map((skill) => ({
    name: skill.name,
    sourceDir: skill.sourceDir,
  }))
  for (const skill of skillDirs) {
    usedSkillNames.add(normalizeName(skill.name))
  }

  // Convert agents to Kiro custom agents
  const agentNames = plugin.agents.map((a) => normalizeName(a.name))
  const agents = plugin.agents.map((agent) => convertAgentToKiroAgent(agent, agentNames))

  // Convert commands to skills (generated)
  const generatedSkills = plugin.commands.map((command) =>
    convertCommandToSkill(command, usedSkillNames, agentNames),
  )

  // Convert MCP servers (stdio only)
  const mcpServers = convertMcpServers(plugin.mcpServers)

  // Build steering files from CLAUDE.md
  const steeringFiles = buildSteeringFiles(plugin, agentNames)

  // Warn about hooks
  if (plugin.hooks && Object.keys(plugin.hooks.hooks).length > 0) {
    console.warn(
      "Warning: Kiro CLI hooks use a different format (preToolUse/postToolUse inside agent configs). Hooks were skipped during conversion.",
    )
  }

  return { agents, generatedSkills, skillDirs, steeringFiles, mcpServers }
}

function convertAgentToKiroAgent(agent: ClaudeAgent, knownAgentNames: string[]): KiroAgent {
  const name = normalizeName(agent.name)
  const description = sanitizeDescription(
    agent.description ?? `Use this agent for ${agent.name} tasks`,
  )

  const config: KiroAgentConfig = {
    name,
    description,
    prompt: `file://./prompts/${name}.md`,
    tools: ["*"],
    resources: [
      "file://.kiro/steering/**/*.md",
      "skill://.kiro/skills/**/SKILL.md",
    ],
    includeMcpJson: true,
    welcomeMessage: `Switching to the ${name} agent. ${description}`,
  }

  let body = transformContentForKiro(agent.body.trim(), knownAgentNames)
  if (agent.capabilities && agent.capabilities.length > 0) {
    const capabilities = agent.capabilities.map((c) => `- ${c}`).join("\n")
    body = `## Capabilities\n${capabilities}\n\n${body}`.trim()
  }
  if (body.length === 0) {
    body = `Instructions converted from the ${agent.name} agent.`
  }

  return { name, config, promptContent: body }
}

function convertCommandToSkill(
  command: ClaudeCommand,
  usedNames: Set<string>,
  knownAgentNames: string[],
): KiroSkill {
  const rawName = normalizeName(command.name)
  const name = uniqueName(rawName, usedNames)

  const description = sanitizeDescription(
    command.description ?? `Converted from Claude command ${command.name}`,
  )

  const frontmatter: Record<string, unknown> = { name, description }

  let body = transformContentForKiro(command.body.trim(), knownAgentNames)
  if (body.length === 0) {
    body = `Instructions converted from the ${command.name} command.`
  }

  const content = formatFrontmatter(frontmatter, body)
  return { name, content }
}

/**
 * Transform Claude Code content to Kiro-compatible content.
 *
 * 1. Task agent calls: Task agent-name(args) -> Use the use_subagent tool ...
 * 2. Path rewriting: .claude/ -> .kiro/, ~/.claude/ -> ~/.kiro/
 * 3. Slash command refs: /workflows:plan -> use the workflows-plan skill
 * 4. Claude tool names: Bash -> shell, Read -> read, etc.
 * 5. Agent refs: @agent-name -> the agent-name agent (only for known agent names)
 */
export function transformContentForKiro(body: string, knownAgentNames: string[] = []): string {
  let result = body

  // 1. Transform Task agent calls
  const taskPattern = /^(\s*-?\s*)Task\s+([a-z][a-z0-9-]*)\(([^)]+)\)/gm
  result = result.replace(taskPattern, (_match, prefix: string, agentName: string, args: string) => {
    return `${prefix}Use the use_subagent tool to delegate to the ${normalizeName(agentName)} agent: ${args.trim()}`
  })

  // 2. Rewrite .claude/ paths to .kiro/ (with word-boundary-like lookbehind)
  result = result.replace(/(?<=^|\s|["'`])~\/\.claude\//gm, "~/.kiro/")
  result = result.replace(/(?<=^|\s|["'`])\.claude\//gm, ".kiro/")

  // 3. Slash command refs: /command-name -> skill activation language
  result = result.replace(/(?<=^|\s)`?\/([a-zA-Z][a-zA-Z0-9_:-]*)`?/gm, (_match, cmdName: string) => {
    const skillName = normalizeName(cmdName)
    return `the ${skillName} skill`
  })

  // 4. Claude tool names -> Kiro tool names
  for (const [claudeTool, kiroTool] of Object.entries(CLAUDE_TO_KIRO_TOOLS)) {
    // Match tool name references: "the X tool", "using X", "use X to"
    const toolPattern = new RegExp(`\\b${claudeTool}\\b(?=\\s+tool|\\s+to\\s)`, "g")
    result = result.replace(toolPattern, kiroTool)
  }

  // 5. Transform @agent-name references (only for known agent names)
  if (knownAgentNames.length > 0) {
    const escapedNames = knownAgentNames.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    const agentRefPattern = new RegExp(`@(${escapedNames.join("|")})\\b`, "g")
    result = result.replace(agentRefPattern, (_match, agentName: string) => {
      return `the ${normalizeName(agentName)} agent`
    })
  }

  return result
}

function convertMcpServers(
  servers?: Record<string, ClaudeMcpServer>,
): Record<string, KiroMcpServer> {
  if (!servers || Object.keys(servers).length === 0) return {}

  const result: Record<string, KiroMcpServer> = {}
  for (const [name, server] of Object.entries(servers)) {
    if (!server.command) {
      console.warn(
        `Warning: MCP server "${name}" has no command (HTTP/SSE transport). Kiro only supports stdio. Skipping.`,
      )
      continue
    }

    const entry: KiroMcpServer = { command: server.command }
    if (server.args && server.args.length > 0) entry.args = server.args
    if (server.env && Object.keys(server.env).length > 0) entry.env = server.env

    console.log(`MCP server "${name}" will execute: ${server.command}${server.args ? " " + server.args.join(" ") : ""}`)
    result[name] = entry
  }
  return result
}

function buildSteeringFiles(plugin: ClaudePlugin, knownAgentNames: string[]): KiroSteeringFile[] {
  const claudeMdPath = path.join(plugin.root, "CLAUDE.md")
  if (!existsSync(claudeMdPath)) return []

  let content: string
  try {
    content = readFileSync(claudeMdPath, "utf8")
  } catch {
    return []
  }

  if (!content || content.trim().length === 0) return []

  const transformed = transformContentForKiro(content, knownAgentNames)
  return [{ name: "compound-engineering", content: transformed }]
}

function normalizeName(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return "item"
  let normalized = trimmed
    .toLowerCase()
    .replace(/[\\/]+/g, "-")
    .replace(/[:\s]+/g, "-")
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-") // Collapse consecutive hyphens (Agent Skills standard)
    .replace(/^-+|-+$/g, "")

  // Enforce max length (truncate at last hyphen boundary)
  if (normalized.length > KIRO_SKILL_NAME_MAX_LENGTH) {
    normalized = normalized.slice(0, KIRO_SKILL_NAME_MAX_LENGTH)
    const lastHyphen = normalized.lastIndexOf("-")
    if (lastHyphen > 0) {
      normalized = normalized.slice(0, lastHyphen)
    }
    normalized = normalized.replace(/-+$/g, "")
  }

  // Ensure name starts with a letter
  if (normalized.length === 0 || !/^[a-z]/.test(normalized)) {
    return "item"
  }

  return normalized
}

function sanitizeDescription(value: string, maxLength = KIRO_DESCRIPTION_MAX_LENGTH): string {
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
