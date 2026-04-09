import { formatFrontmatter } from "../utils/frontmatter"
import { normalizeModelWithProvider } from "../utils/model"
import { sanitizePathName } from "../utils/files"
import {
  type ClaudeAgent,
  type ClaudeCommand,
  type ClaudePlugin,
  type ClaudeMcpServer,
  filterSkillsByPlatform,
} from "../types/claude"
import type {
  OpenClawBundle,
  OpenClawCommandRegistration,
  OpenClawPluginManifest,
  OpenClawSkillFile,
} from "../types/openclaw"
import type { ClaudeToOpenCodeOptions } from "./claude-to-opencode"

export type ClaudeToOpenClawOptions = ClaudeToOpenCodeOptions

export function convertClaudeToOpenClaw(
  plugin: ClaudePlugin,
  _options: ClaudeToOpenClawOptions,
): OpenClawBundle {
  const enabledCommands = plugin.commands.filter((cmd) => !cmd.disableModelInvocation)

  const agentSkills = plugin.agents.map(convertAgentToSkill)
  const commandSkills = enabledCommands.map(convertCommandToSkill)
  const commands = enabledCommands.map(convertCommand)

  const skills: OpenClawSkillFile[] = [...agentSkills, ...commandSkills]

  const platformSkills = filterSkillsByPlatform(plugin.skills, "openclaw")
  const skillDirCopies = platformSkills.map((skill) => ({
    sourceDir: skill.sourceDir,
    name: skill.name,
  }))

  const allSkillDirs = [
    ...agentSkills.map((s) => sanitizePathName(s.dir)),
    ...commandSkills.map((s) => sanitizePathName(s.dir)),
    ...platformSkills.map((s) => sanitizePathName(s.name)),
  ]

  const manifest = buildManifest(plugin, allSkillDirs)

  const packageJson = buildPackageJson(plugin)

  const openclawConfig = plugin.mcpServers
    ? buildOpenClawConfig(plugin.mcpServers)
    : undefined

  const entryPoint = generateEntryPoint(commands)

  return {
    manifest,
    packageJson,
    entryPoint,
    skills,
    skillDirCopies,
    commands,
    openclawConfig,
  }
}

function buildManifest(plugin: ClaudePlugin, skillDirs: string[]): OpenClawPluginManifest {
  return {
    id: plugin.manifest.name,
    name: formatDisplayName(plugin.manifest.name),
    kind: "tool",
    configSchema: {
      type: "object",
      properties: {},
    },
    skills: skillDirs.map((dir) => `skills/${dir}`),
  }
}

function buildPackageJson(plugin: ClaudePlugin): Record<string, unknown> {
  return {
    name: `openclaw-${plugin.manifest.name}`,
    version: plugin.manifest.version,
    type: "module",
    private: true,
    description: plugin.manifest.description,
    main: "index.ts",
    openclaw: {
      extensions: [
        {
          id: plugin.manifest.name,
          entry: "./index.ts",
        },
      ],
    },
    keywords: [
      "openclaw",
      "openclaw-plugin",
      ...(plugin.manifest.keywords ?? []),
    ],
  }
}

function convertAgentToSkill(agent: ClaudeAgent): OpenClawSkillFile {
  const frontmatter: Record<string, unknown> = {
    name: agent.name,
    description: agent.description,
  }

  if (agent.model && agent.model !== "inherit") {
    frontmatter.model = normalizeModelWithProvider(agent.model)
  }

  const body = rewritePaths(agent.body)
  const content = formatFrontmatter(frontmatter, body)

  return {
    name: agent.name,
    content,
    dir: `agent-${agent.name}`,
  }
}

function convertCommandToSkill(command: ClaudeCommand): OpenClawSkillFile {
  const frontmatter: Record<string, unknown> = {
    name: `cmd-${command.name}`,
    description: command.description,
  }

  if (command.model && command.model !== "inherit") {
    frontmatter.model = normalizeModelWithProvider(command.model)
  }

  const body = rewritePaths(command.body)
  const content = formatFrontmatter(frontmatter, body)

  return {
    name: command.name,
    content,
    dir: `cmd-${command.name}`,
  }
}

function convertCommand(command: ClaudeCommand): OpenClawCommandRegistration {
  return {
    name: command.name.replace(/:/g, "-"),
    description: command.description ?? `Run ${command.name}`,
    acceptsArgs: Boolean(command.argumentHint),
    body: rewritePaths(command.body),
  }
}

function buildOpenClawConfig(
  servers: Record<string, ClaudeMcpServer>,
): Record<string, unknown> {
  const mcpServers: Record<string, unknown> = {}

  for (const [name, server] of Object.entries(servers)) {
    if (server.command) {
      mcpServers[name] = {
        type: "stdio",
        command: server.command,
        args: server.args ?? [],
        env: server.env,
      }
    } else if (server.url) {
      mcpServers[name] = {
        type: "http",
        url: server.url,
        headers: server.headers,
      }
    }
  }

  return { mcpServers }
}

function generateEntryPoint(commands: OpenClawCommandRegistration[]): string {
  const commandRegistrations = commands
    .map((cmd) => {
      const safeName = JSON.stringify(cmd.name)
      const safeDesc = JSON.stringify(cmd.description ?? "")
      const safeBody = JSON.stringify(cmd.body)
      return `  api.registerCommand({
    name: ${safeName},
    description: ${safeDesc},
    acceptsArgs: ${cmd.acceptsArgs},
    requireAuth: false,
    handler: () => ({
      text: ${safeBody},
    }),
  });`
    })
    .join("\n\n")

  return `// Auto-generated OpenClaw plugin entry point
// Converted from Claude Code plugin format by compound-plugin CLI
export default function register(api) {
${commandRegistrations}
}
`
}

function rewritePaths(body: string): string {
  return body
    .replace(/(?<=^|\s|["'`])~\/\.claude\//gm, "~/.openclaw/")
    .replace(/(?<=^|\s|["'`])\.claude\//gm, ".openclaw/")
    .replace(/\.claude-plugin\//g, "openclaw-plugin/")
}

function formatDisplayName(name: string): string {
  return name
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
}
