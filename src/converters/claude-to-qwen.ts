import { formatFrontmatter } from "../utils/frontmatter"
import type { ClaudeAgent, ClaudeCommand, ClaudeMcpServer, ClaudePlugin } from "../types/claude"
import type {
  QwenAgentFile,
  QwenBundle,
  QwenCommandFile,
  QwenExtensionConfig,
  QwenMcpServer,
  QwenSetting,
} from "../types/qwen"

export type ClaudeToQwenOptions = {
  agentMode: "primary" | "subagent"
  inferTemperature: boolean
}

const TOOL_MAP: Record<string, string> = {
  bash: "bash",
  read: "read",
  write: "write",
  edit: "edit",
  grep: "grep",
  glob: "glob",
  list: "list",
  webfetch: "webfetch",
  skill: "skill",
  patch: "patch",
  task: "task",
  question: "question",
  todowrite: "todowrite",
  todoread: "todoread",
}

export function convertClaudeToQwen(plugin: ClaudePlugin, options: ClaudeToQwenOptions): QwenBundle {
  const agentFiles = plugin.agents.map((agent) => convertAgent(agent, options))
  const cmdFiles = convertCommands(plugin.commands)
  const mcp = plugin.mcpServers ? convertMcp(plugin.mcpServers) : undefined
  const settings = extractSettings(plugin.mcpServers)

  const config: QwenExtensionConfig = {
    name: plugin.manifest.name,
    version: plugin.manifest.version || "1.0.0",
    commands: "commands",
    skills: "skills",
    agents: "agents",
  }

  if (mcp && Object.keys(mcp).length > 0) {
    config.mcpServers = mcp
  }

  if (settings && settings.length > 0) {
    config.settings = settings
  }

  const contextFile = generateContextFile(plugin)

  return {
    config,
    agents: agentFiles,
    commandFiles: cmdFiles,
    skillDirs: plugin.skills.map((skill) => ({ sourceDir: skill.sourceDir, name: skill.name })),
    contextFile,
  }
}

function convertAgent(agent: ClaudeAgent, options: ClaudeToQwenOptions): QwenAgentFile {
  const frontmatter: Record<string, unknown> = {
    name: agent.name,
    description: agent.description,
  }

  if (agent.model && agent.model !== "inherit") {
    frontmatter.model = normalizeModel(agent.model)
  }

  if (options.inferTemperature) {
    const temperature = inferTemperature(agent)
    if (temperature !== undefined) {
      frontmatter.temperature = temperature
    }
  }

  // Qwen supports both YAML and Markdown for agents
  // Using YAML format for structured config
  const content = formatFrontmatter(frontmatter, rewriteQwenPaths(agent.body))

  return {
    name: agent.name,
    content,
    format: "yaml",
  }
}

function convertCommands(commands: ClaudeCommand[]): QwenCommandFile[] {
  const files: QwenCommandFile[] = []
  for (const command of commands) {
    if (command.disableModelInvocation) continue
    const frontmatter: Record<string, unknown> = {
      description: command.description,
    }
    if (command.model && command.model !== "inherit") {
      frontmatter.model = normalizeModel(command.model)
    }
    if (command.allowedTools && command.allowedTools.length > 0) {
      frontmatter.allowedTools = command.allowedTools
    }
    const content = formatFrontmatter(frontmatter, rewriteQwenPaths(command.body))
    files.push({ name: command.name, content })
  }
  return files
}

function convertMcp(servers: Record<string, ClaudeMcpServer>): Record<string, QwenMcpServer> {
  const result: Record<string, QwenMcpServer> = {}
  for (const [name, server] of Object.entries(servers)) {
    if (server.command) {
      result[name] = {
        command: server.command,
        args: server.args,
        env: server.env,
        cwd: "${extensionPath}${/}",
      }
      continue
    }

    if (server.url) {
      // Qwen doesn't support remote MCP servers in the same way
      // Convert to local with proxy or skip
      console.warn(`Warning: Remote MCP server '${name}' with URL ${server.url} is not fully supported in Qwen format`)
      result[name] = {
        command: "curl",
        args: [server.url],
        env: server.headers,
      }
    }
  }
  return result
}

function extractSettings(mcpServers?: Record<string, ClaudeMcpServer>): QwenSetting[] {
  const settings: QwenSetting[] = []
  if (!mcpServers) return settings

  for (const [name, server] of Object.entries(mcpServers)) {
    if (server.env) {
      for (const [envVar, value] of Object.entries(server.env)) {
        // Only add settings for environment variables that look like placeholders
        if (value.startsWith("${") || value.includes("YOUR_") || value.includes("XXX")) {
          settings.push({
            name: formatSettingName(envVar),
            description: `Environment variable for ${name} MCP server`,
            envVar,
            sensitive: envVar.toLowerCase().includes("key") || envVar.toLowerCase().includes("token") || envVar.toLowerCase().includes("secret"),
          })
        }
      }
    }
  }

  return settings
}

function formatSettingName(envVar: string): string {
  return envVar
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function generateContextFile(plugin: ClaudePlugin): string {
  const sections: string[] = []

  // Plugin description
  sections.push(`# ${plugin.name}`)
  sections.push("")
  if (plugin.description) {
    sections.push(plugin.description)
    sections.push("")
  }

  // Agents section
  if (plugin.agents.length > 0) {
    sections.push("## Agents")
    sections.push("")
    for (const agent of plugin.agents) {
      sections.push(`- **${agent.name}**: ${agent.description || "No description"}`)
    }
    sections.push("")
  }

  // Commands section
  if (plugin.commands.length > 0) {
    sections.push("## Commands")
    sections.push("")
    for (const command of plugin.commands) {
      if (!command.disableModelInvocation) {
        sections.push(`- **/${command.name}**: ${command.description || "No description"}`)
      }
    }
    sections.push("")
  }

  // Skills section
  if (plugin.skills.length > 0) {
    sections.push("## Skills")
    sections.push("")
    for (const skill of plugin.skills) {
      sections.push(`- ${skill.name}`)
    }
    sections.push("")
  }

  return sections.join("\n")
}

function rewriteQwenPaths(body: string): string {
  return body
    .replace(/~\/\.claude\//g, "~/.qwen/")
    .replace(/\.claude\//g, ".qwen/")
    .replace(/~\/\.config\/opencode\//g, "~/.qwen/")
    .replace(/\.opencode\//g, ".qwen/")
}

const CLAUDE_FAMILY_ALIASES: Record<string, string> = {
  haiku: "claude-haiku",
  sonnet: "claude-sonnet",
  opus: "claude-opus",
}

function normalizeModel(model: string): string {
  if (model.includes("/")) return model
  if (CLAUDE_FAMILY_ALIASES[model]) {
    const resolved = `anthropic/${CLAUDE_FAMILY_ALIASES[model]}`
    console.warn(
      `Warning: bare model alias "${model}" mapped to "${resolved}".`,
    )
    return resolved
  }
  if (/^claude-/.test(model)) return `anthropic/${model}`
  if (/^(gpt-|o1-|o3-)/.test(model)) return `openai/${model}`
  if (/^gemini-/.test(model)) return `google/${model}`
  if (/^qwen-/.test(model)) return `qwen/${model}`
  return `anthropic/${model}`
}

function inferTemperature(agent: ClaudeAgent): number | undefined {
  const sample = `${agent.name} ${agent.description ?? ""}`.toLowerCase()
  if (/(review|audit|security|sentinel|oracle|lint|verification|guardian)/.test(sample)) {
    return 0.1
  }
  if (/(plan|planning|architecture|strategist|analysis|research)/.test(sample)) {
    return 0.2
  }
  if (/(doc|readme|changelog|editor|writer)/.test(sample)) {
    return 0.3
  }
  if (/(brainstorm|creative|ideate|design|concept)/.test(sample)) {
    return 0.6
  }
  return 0.3
}
