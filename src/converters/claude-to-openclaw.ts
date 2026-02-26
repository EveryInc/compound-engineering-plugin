import { formatFrontmatter } from "../utils/frontmatter"
import type {
  ClaudeAgent,
  ClaudeCommand,
  ClaudePlugin,
  ClaudeMcpServer,
} from "../types/claude"
import type {
  OpenClawBundle,
  OpenClawCommandRegistration,
  OpenClawPluginManifest,
  OpenClawSkillFile,
} from "../types/openclaw"
import type { ClaudeToOpenCodeOptions } from "./claude-to-opencode"

export function convertClaudeToOpenClaw(
  plugin: ClaudePlugin,
  _options: ClaudeToOpenCodeOptions,
): OpenClawBundle {
  const manifest = buildManifest(plugin)
  const packageJson = buildPackageJson(plugin)

  const agentSkills = plugin.agents.map(convertAgentToSkill)
  const commandSkills = plugin.commands
    .filter((cmd) => !cmd.disableModelInvocation)
    .map(convertCommandToSkill)

  const commands = plugin.commands
    .filter((cmd) => !cmd.disableModelInvocation)
    .map(convertCommand)

  const skills: OpenClawSkillFile[] = [...agentSkills, ...commandSkills]

  const skillDirCopies = plugin.skills.map((skill) => ({
    sourceDir: skill.sourceDir,
    name: skill.name,
  }))

  // Add original skill names to manifest.skills
  const allSkillDirs = [
    ...agentSkills.map((s) => s.dir),
    ...commandSkills.map((s) => s.dir),
    ...plugin.skills.map((s) => s.name),
  ]
  manifest.skills = allSkillDirs.map((dir) => `skills/${dir}`)

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

function buildManifest(plugin: ClaudePlugin): OpenClawPluginManifest {
  return {
    id: plugin.manifest.name,
    name: formatDisplayName(plugin.manifest.name),
    kind: "tool",
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
    frontmatter.model = agent.model
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
    frontmatter.model = command.model
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
      const escapedName = cmd.name.replace(/"/g, '\\"')
      const escapedDesc = (cmd.description ?? "").replace(/"/g, '\\"')
      return `  api.registerCommand({
    name: "${escapedName}",
    description: "${escapedDesc}",
    acceptsArgs: ${cmd.acceptsArgs},
    requireAuth: false,
    handler: (ctx) => ({
      text: skills["${escapedName}"] ?? "Command ${escapedName} not found. Check skills directory.",
    }),
  });`
    })
    .join("\n\n")

  return `// Auto-generated OpenClaw plugin entry point
// Converted from Claude Code plugin format by compound-plugin CLI
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Pre-load skill bodies for command responses
const skills = {};

async function loadSkills() {
  const skillsDir = path.join(__dirname, "skills");
  try {
    const entries = await fs.readdir(skillsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const skillPath = path.join(skillsDir, entry.name, "SKILL.md");
      try {
        const content = await fs.readFile(skillPath, "utf8");
        // Strip frontmatter
        const body = content.replace(/^---[\\s\\S]*?---\\n*/, "");
        skills[entry.name.replace(/^cmd-/, "")] = body.trim();
      } catch {
        // Skill file not found, skip
      }
    }
  } catch {
    // Skills directory not found
  }
}

export default async function register(api) {
  await loadSkills();

${commandRegistrations}
}
`
}

function rewritePaths(body: string): string {
  return body
    .replace(/~\/\.claude\//g, "~/.openclaw/")
    .replace(/\.claude\//g, ".openclaw/")
    .replace(/\.claude-plugin\//g, "openclaw-plugin/")
}

function formatDisplayName(name: string): string {
  return name
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
}
