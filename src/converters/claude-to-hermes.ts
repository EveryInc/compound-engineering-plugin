import {
  type ClaudeAgent,
  type ClaudeCommand,
  type ClaudeMcpServer,
  type ClaudePlugin,
  filterSkillsByPlatform,
} from "../types/claude"
import type {
  HermesBundle,
  HermesGeneratedSkill,
  HermesMcpConfig,
  HermesMcpServer,
} from "../types/hermes"
import { sanitizePathName } from "../utils/files"
import type { ClaudeToOpenCodeOptions } from "./claude-to-opencode"

export type ClaudeToHermesOptions = ClaudeToOpenCodeOptions

const HERMES_DESCRIPTION_MAX_LENGTH = 1024

/**
 * Pure translation from a parsed Claude plugin to a HermesBundle.
 *
 * - Passthrough skills (those with no `ce_platforms` or one that includes
 *   `"hermes"`) are recorded as `passthroughSkills`. The body of each
 *   `SKILL.md` is rewritten via `transformContentForHermes` at write time
 *   (in the writer's `copySkillDir` call); frontmatter is preserved.
 * - Commands and agents materialize as `generatedSkills` named
 *   `cmd-<sanitized>` / `agent-<sanitized>`. The prefix is the load-bearing
 *   identifier; `metadata.hermes.tags` is advisory.
 * - Commands with `disableModelInvocation: true` are dropped with a stderr
 *   warning and tracked in `bundle.droppedCommands`.
 * - MCP entries with neither `command` nor `url` are skipped with a stderr
 *   warning and tracked in `bundle.skippedMcpServers`.
 */
export function convertClaudeToHermes(
  plugin: ClaudePlugin,
  _options: ClaudeToHermesOptions,
): HermesBundle | null {
  const platformSkills = filterSkillsByPlatform(plugin.skills, "hermes")
  const usedSkillNames = new Set<string>()

  const droppedCommands: string[] = []
  const generatedSkills: HermesGeneratedSkill[] = []

  for (const command of plugin.commands) {
    if (command.disableModelInvocation) {
      droppedCommands.push(command.name)
      console.warn(
        `Skipping command '${command.name}' for hermes (disableModelInvocation: true)`,
      )
      continue
    }
    generatedSkills.push(convertCommand(command, plugin, usedSkillNames))
  }

  for (const agent of plugin.agents) {
    generatedSkills.push(convertAgent(agent, plugin, usedSkillNames))
  }

  const passthroughSkills = platformSkills.map((skill) => ({
    name: skill.name,
    sourceDir: skill.sourceDir,
  }))

  const skippedMcpServers: string[] = []
  let mcpConfig: HermesMcpConfig | undefined
  if (plugin.mcpServers) {
    mcpConfig = convertMcpServers(plugin.mcpServers, skippedMcpServers)
  }

  return {
    pluginName: plugin.manifest.name,
    passthroughSkills,
    generatedSkills,
    mcpConfig,
    droppedCommands,
    skippedMcpServers,
  }
}

function convertCommand(
  command: ClaudeCommand,
  plugin: ClaudePlugin,
  usedNames: Set<string>,
): HermesGeneratedSkill {
  const baseName = sanitizeHermesName(command.name)
  const name = uniqueName(`cmd-${baseName}`, usedNames)
  const description = sanitizeDescription(
    command.description ?? `Converted from Claude command ${command.name}`,
  )

  const frontmatter = formatHermesFrontmatter({
    name,
    description,
    version: plugin.manifest.version,
    tag: "Command",
  })

  const body = transformContentForHermes(command.body.trim())
  const content = `${frontmatter}\n\n${body}`.trimEnd() + "\n"

  return { name, content, kind: "command" }
}

function convertAgent(
  agent: ClaudeAgent,
  plugin: ClaudePlugin,
  usedNames: Set<string>,
): HermesGeneratedSkill {
  const baseName = sanitizeHermesName(agent.name)
  const name = uniqueName(`agent-${baseName}`, usedNames)
  const description = sanitizeDescription(
    agent.description ?? `Converted from Claude agent ${agent.name}`,
  )

  const frontmatter = formatHermesFrontmatter({
    name,
    description,
    version: plugin.manifest.version,
    tag: "Agent",
  })

  const sections: string[] = []
  if (agent.capabilities && agent.capabilities.length > 0) {
    const items = agent.capabilities.map((capability) => `- ${capability}`).join("\n")
    sections.push(`## Capabilities\n${items}`)
  }

  const originalBody = agent.body.trim().length > 0
    ? agent.body.trim()
    : `Instructions converted from the ${agent.name} agent.`

  const combined = [...sections, originalBody].join("\n\n")
  const body = transformContentForHermes(combined)

  const content = `${frontmatter}\n\n${body}`.trimEnd() + "\n"
  return { name, content, kind: "agent" }
}

function convertMcpServers(
  servers: Record<string, ClaudeMcpServer>,
  skipped: string[],
): HermesMcpConfig | undefined {
  const mcp_servers: Record<string, HermesMcpServer> = {}

  for (const [name, server] of Object.entries(servers)) {
    if (server.command) {
      mcp_servers[name] = {
        command: server.command,
        ...(server.args !== undefined ? { args: server.args } : {}),
        ...(server.env !== undefined ? { env: server.env } : {}),
      }
      continue
    }
    if (server.url) {
      mcp_servers[name] = {
        url: server.url,
        ...(server.headers !== undefined ? { headers: server.headers } : {}),
      }
      continue
    }

    skipped.push(name)
    console.warn(
      `Skipping MCP server '${name}' for hermes (entry has neither 'command' nor 'url')`,
    )
  }

  if (Object.keys(mcp_servers).length === 0) {
    return undefined
  }

  return { mcp_servers }
}

/**
 * Body rewriter applied to generated skill bodies in the converter and to
 * passthrough SKILL.md bodies at write time. The transforms run in order:
 *
 *   1. `Task agent(args)` -> "Use the agent skill to: args"
 *      (matches the Pi multiline pattern; namespace prefixes stripped, final
 *      segment kept, skill name normalized).
 *   2. `TaskCreate/TaskUpdate/TaskList/TaskGet/TaskStop/TaskOutput/
 *      TodoWrite/TodoRead` -> "the platform's task-tracking primitive".
 *   3. `${CLAUDE_PLUGIN_ROOT}` and `${CLAUDE_SKILL_DIR}` ->
 *      `${HERMES_SKILL_DIR}`.
 *   4. `~/.claude/` -> `~/.hermes/`; `.claude/` -> `.hermes/`.
 *   5. Slash-command namespace stripping (`/workflows:plan` -> `/plan`,
 *      `/prompts:foo` -> `/foo`); `/skill:bar` preserved; URLs and shell
 *      paths in the allowlist pass through unchanged.
 */
export function transformContentForHermes(body: string): string {
  let result = body

  // 1. Task agent(args) -> "Use the <agent> skill to: <args>" or bare
  // "Use the <agent> skill" when args absent. Pattern matches Pi exactly so
  // the same multiline / list-prefix shapes are recognized.
  const taskPattern = /^(\s*-?\s*)Task\s+([a-z][a-z0-9:-]*)\(([^)]*)\)/gm
  result = result.replace(
    taskPattern,
    (_match, prefix: string, agentName: string, args: string) => {
      const finalSegment = agentName.includes(":")
        ? agentName.split(":").pop()!
        : agentName
      const skillName = normalizeName(finalSegment)
      const trimmedArgs = args.trim().replace(/\s+/g, " ")
      return trimmedArgs
        ? `${prefix}Use the ${skillName} skill to: ${trimmedArgs}`
        : `${prefix}Use the ${skillName} skill`
    },
  )

  // 2. Task* and Todo* tools -> platform-generic phrasing.
  result = result.replace(
    /\bTask(?:Create|Update|List|Get|Stop|Output)\b/g,
    "the platform's task-tracking primitive",
  )
  result = result.replace(/\bTodoWrite\b/g, "the platform's task-tracking primitive")
  result = result.replace(/\bTodoRead\b/g, "the platform's task-tracking primitive")

  // 3. Claude template variables -> Hermes equivalent.
  result = result.replace(/\$\{CLAUDE_PLUGIN_ROOT\}/g, "${HERMES_SKILL_DIR}")
  result = result.replace(/\$\{CLAUDE_SKILL_DIR\}/g, "${HERMES_SKILL_DIR}")

  // 4. Path rewrite. Order matters: rewrite ~/.claude/ before .claude/ so
  // the unanchored second pattern doesn't double-rewrite something we just
  // touched, then rewrite remaining .claude/ occurrences.
  result = result.replace(/~\/\.claude\//g, "~/.hermes/")
  result = result.replace(/\.claude\//g, ".hermes/")

  // 5. Slash-command namespace stripping. Mirrors Pi's negative-lookahead
  // boundary regex and adds an extended allowlist for path segments the
  // doc review flagged as false-match risks.
  const slashCommandPattern = /(?<![:\w])\/([a-z][a-z0-9_:-]*?)(?=[\s,."')\]}`]|$)/gi
  result = result.replace(slashCommandPattern, (match, commandName: string) => {
    if (commandName.includes("/")) return match

    // First segment of the path (before any `:`); compared against the
    // allowlist case-insensitively for `Applications` / `Users` etc.
    const firstSegment = commandName.split(":")[0]
    const allowlistLower = [
      "dev",
      "tmp",
      "etc",
      "usr",
      "var",
      "bin",
      "home",
      "users",
      "opt",
      "sys",
      "proc",
      "applications",
    ]
    if (allowlistLower.includes(firstSegment.toLowerCase())) {
      return match
    }

    if (commandName.startsWith("skill:")) {
      const skillName = commandName.slice("skill:".length)
      return `/skill:${normalizeName(skillName)}`
    }

    let withoutPrefix = commandName
    if (withoutPrefix.startsWith("prompts:")) {
      withoutPrefix = withoutPrefix.slice("prompts:".length)
    } else if (withoutPrefix.startsWith("workflows:")) {
      withoutPrefix = withoutPrefix.slice("workflows:".length)
    }

    return `/${normalizeName(withoutPrefix)}`
  })

  return result
}

type HermesFrontmatterFields = {
  name: string
  description: string
  version?: string
  tag: "Command" | "Agent"
}

/**
 * Build the YAML frontmatter block for a generated skill. Inline string
 * construction (NOT `formatFrontmatter`) is required because `metadata`
 * carries a nested object the shared helper can't serialize.
 *
 * Output shape:
 *
 *     ---
 *     name: cmd-ce-plan
 *     description: "..."
 *     version: "3.4.1"
 *     metadata:
 *       hermes:
 *         tags:
 *           - Command
 *     ---
 */
function formatHermesFrontmatter(fields: HermesFrontmatterFields): string {
  const lines: string[] = ["---"]
  lines.push(`name: ${fields.name}`)
  lines.push(`description: ${quoteIfNeeded(fields.description)}`)
  if (fields.version !== undefined) {
    lines.push(`version: ${JSON.stringify(fields.version)}`)
  }
  lines.push("metadata:")
  lines.push("  hermes:")
  lines.push("    tags:")
  lines.push(`      - ${fields.tag}`)
  lines.push("---")
  return lines.join("\n")
}

/**
 * Mirror the YAML quoting rules in `utils/frontmatter.ts:formatYamlValue` so
 * descriptions containing colons or other YAML metacharacters round-trip
 * cleanly.
 */
function quoteIfNeeded(value: string): string {
  if (
    value.includes(":") ||
    value.startsWith("[") ||
    value.startsWith("{") ||
    value === "*" ||
    value.startsWith('"')
  ) {
    return JSON.stringify(value)
  }
  return value
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

function sanitizeDescription(
  value: string,
  maxLength = HERMES_DESCRIPTION_MAX_LENGTH,
): string {
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

/**
 * Hermes-local name sanitizer: NFKD-normalize, strip combining marks, then
 * apply `sanitizePathName` (which currently only handles `:`). This handles
 * non-ASCII inputs like `ce:plán` (-> `ce-plan`) without mutating the
 * shared helper used by other targets.
 *
 * Beyond combining marks, any leftover non-ASCII characters are mapped to
 * `-` so the resulting name stays within `[a-z0-9_-]` after `normalizeName`
 * downstream consumers run.
 */
function sanitizeHermesName(name: string): string {
  const decomposed = name.normalize("NFKD")
  // Strip combining marks (Unicode category Mn).
  const withoutMarks = decomposed.replace(/[̀-ͯ]/g, "")
  return sanitizePathName(withoutMarks)
}
