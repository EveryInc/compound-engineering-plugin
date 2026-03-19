import { readFileSync, existsSync } from "fs"
import path from "path"
import { formatFrontmatter } from "../utils/frontmatter"
import type {
  ClaudeAgent,
  ClaudeCommand,
  ClaudeHookEntry,
  ClaudeHooks,
  ClaudeMcpServer,
  ClaudePlugin,
} from "../types/claude"
import type {
  KiroAgent,
  KiroAgentConfig,
  KiroBundle,
  KiroHookFile,
  KiroHookWhen,
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

  // Convert MCP servers (stdio and remote)
  const mcpServers = convertMcpServers(plugin.mcpServers)

  // Build steering files from CLAUDE.md
  const steeringFiles = buildSteeringFiles(plugin, agentNames)

  // Convert hooks
  const pluginSlug = slugify(plugin.manifest.name || "plugin")
  const hookResult = convertHooks(plugin.hooks, plugin.agents, plugin.root, pluginSlug)
  for (const warning of hookResult.warnings) {
    console.warn(warning)
  }

  return {
    agents,
    generatedSkills,
    skillDirs,
    steeringFiles,
    mcpServers,
    hookFiles: hookResult.hookFiles,
    hookScripts: hookResult.hookScripts,
  }
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
    if (server.command) {
      const entry: KiroMcpServer = { command: server.command }
      if (server.args && server.args.length > 0) entry.args = server.args
      if (server.env && Object.keys(server.env).length > 0) entry.env = server.env
      result[name] = entry
    } else if (server.url) {
      const entry: KiroMcpServer = { url: server.url }
      if (server.headers && Object.keys(server.headers).length > 0) entry.headers = server.headers
      result[name] = entry
    } else {
      console.warn(
        `Warning: MCP server "${name}" has no command or url. Skipping.`,
      )
    }
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

// ── Hook conversion ──────────────────────────────────────────────────

const CLAUDE_EVENT_TO_KIRO: Record<string, KiroHookWhen["type"]> = {
  PreToolUse: "preToolUse",
  PostToolUse: "postToolUse",
  Stop: "agentStop",
  UserPromptSubmit: "promptSubmit",
}

const CLAUDE_TOOL_TO_KIRO_TYPE: Record<string, string> = {
  Bash: "shell",
  Read: "read",
  Write: "write",
  Edit: "write",
  Glob: "read",
  Grep: "read",
  WebFetch: "web",
  Task: "*",
}

const VALID_KIRO_TOOL_TYPES = new Set(["read", "write", "shell", "web", "spec", "*"])

type NamedHookFile = { fileName: string; hook: KiroHookFile }
type ScriptRef = { name: string; sourcePath: string }

type RewriteResult = {
  command: string
  referencedScripts: ScriptRef[]
  scriptPaths: string[]
  referencesScript: boolean
  commandWarnings: string[]
}

function convertHooks(
  hooksConfig: ClaudeHooks | undefined,
  agents: ClaudeAgent[],
  pluginRoot: string,
  pluginSlug: string,
): { hookFiles: NamedHookFile[]; hookScripts: ScriptRef[]; warnings: string[] } {
  const hookFiles: NamedHookFile[] = []
  const hookScripts: ScriptRef[] = []
  const warnings: string[] = []

  if (!hooksConfig || Object.keys(hooksConfig.hooks).length === 0) {
    return { hookFiles, hookScripts, warnings }
  }

  const usedFileNames = new Set<string>()

  for (const [eventName, matcherGroups] of Object.entries(hooksConfig.hooks)) {
    const kiroEventType = CLAUDE_EVENT_TO_KIRO[eventName]
    if (!kiroEventType) {
      warnings.push(`Warning: Hook event "${eventName}" has no Kiro equivalent. Skipped.`)
      continue
    }

    for (const group of matcherGroups) {
      const toolTypes = mapMatcherToToolTypes(group.matcher, warnings)
      const when: KiroHookWhen = { type: kiroEventType }
      if (toolTypes.length > 0) {
        when.toolTypes = toolTypes
      }

      for (let i = 0; i < group.hooks.length; i++) {
        const hook = group.hooks[i]
        const result = convertSingleHook(hook, agents, pluginRoot, when, eventName, group.matcher, i)
        if (result.hookFile) {
          const toolSuffix = toolTypes.length > 0 ? toolTypes.join("-") : "all"
          const baseName = `${pluginSlug}-${slugify(eventName)}-${toolSuffix}-${i}`
          const fileName = uniqueName(baseName, usedFileNames)
          hookFiles.push({ fileName, hook: result.hookFile })
        }
        hookScripts.push(...result.scripts)
        warnings.push(...result.warnings)
      }
    }
  }

  return { hookFiles, hookScripts, warnings }
}

function convertSingleHook(
  hook: ClaudeHookEntry,
  agents: ClaudeAgent[],
  pluginRoot: string,
  when: KiroHookWhen,
  eventName: string,
  matcher: string | undefined,
  index: number,
): { hookFile: KiroHookFile | null; scripts: ScriptRef[]; warnings: string[] } {
  const scripts: ScriptRef[] = []
  const warnings: string[] = []
  const matcherLabel = matcher && matcher !== "*" ? ` (${matcher} matcher)` : ""

  if (hook.type === "command") {
    const { command, referencedScripts, scriptPaths, referencesScript, commandWarnings } = rewriteCommand(hook.command, pluginRoot)
    scripts.push(...referencedScripts)
    warnings.push(...commandWarnings)

    const scriptName = extractScriptName(command)
    const name = `${eventName} ${when.toolTypes?.join("/") ?? "all"} - ${scriptName}`

    if (referencesScript) {
      // Script references $CLAUDE_PLUGIN_ROOT or $CLAUDE_PROJECT_DIR — these scripts
      // expect Claude Code's stdin JSON context which Kiro doesn't provide.
      // Convert to askAgent so the agent can read the script and perform the equivalent.
      const pathList = scriptPaths.join(" and ")
      const prompt = `Read the script at ${pathList} to understand its validation logic, then perform the equivalent check on the file that was just modified. If the script's checks don't apply to the current file, do nothing.`
      let description = `Agent performs equivalent of ${scriptName} on ${eventName}.`
      if (matcherLabel) description += ` Converted from Claude Code ${eventName} hook${matcherLabel}.`
      description += ` Original script converted to askAgent because Kiro runCommand hooks don't receive file context.`

      return {
        hookFile: {
          enabled: true,
          name,
          description,
          version: "1",
          when,
          then: { type: "askAgent", prompt },
        },
        scripts,
        warnings,
      }
    }

    // Inline command — no script reference, safe as runCommand
    let description = `Runs ${scriptName} on ${eventName}.`
    if (matcherLabel) description += ` Converted from Claude Code ${eventName} hook${matcherLabel}.`

    const hookFile: KiroHookFile = {
      enabled: true,
      name,
      description,
      version: "1",
      when,
      then: { type: "runCommand", command, timeout: hook.timeout ?? 0 },
    }

    return { hookFile, scripts, warnings }
  }

  if (hook.type === "prompt") {
    const name = `${eventName} ${when.toolTypes?.join("/") ?? "all"} - prompt`
    const description = `Agent prompt on ${eventName}.${matcherLabel ? ` Converted from Claude Code ${eventName} hook${matcherLabel}.` : ""}`

    return {
      hookFile: {
        enabled: true,
        name,
        description,
        version: "1",
        when,
        then: { type: "askAgent", prompt: hook.prompt },
      },
      scripts,
      warnings,
    }
  }

  if (hook.type === "agent") {
    const agentRef = hook.agent
    const matchedAgent = agents.find(
      (a) => normalizeName(a.name) === normalizeName(agentRef),
    )
    let prompt: string
    if (matchedAgent) {
      const desc = matchedAgent.description ?? matchedAgent.name
      const capabilities = matchedAgent.capabilities?.length
        ? ` Capabilities: ${matchedAgent.capabilities.join(", ")}.`
        : ""
      prompt = `Acting as the ${matchedAgent.name} agent (${desc}), review this action.${capabilities}`
    } else {
      prompt = `Acting as the ${agentRef} agent, review this action.`
      warnings.push(`Warning: Hook references agent "${agentRef}" which was not found in the plugin. Using fallback prompt.`)
    }

    const name = `${eventName} ${when.toolTypes?.join("/") ?? "all"} - ${normalizeName(agentRef)} agent`
    const description = `Delegates to ${agentRef} agent on ${eventName}. Lossy: converted from Claude Code agent hook to askAgent.${matcherLabel ? ` Original matcher: ${matcher}.` : ""}`

    return {
      hookFile: {
        enabled: true,
        name,
        description,
        version: "1",
        when,
        then: { type: "askAgent", prompt },
      },
      scripts,
      warnings,
    }
  }

  warnings.push(`Warning: Unknown hook type. Skipped.`)
  return { hookFile: null, scripts, warnings }
}

function mapMatcherToToolTypes(matcher: string | undefined, warnings: string[] = []): string[] {
  if (!matcher || matcher === "*" || matcher === "") return []

  const parts = matcher.split("|").map((p) => p.trim()).filter(Boolean)
  const types = new Set<string>()
  for (const part of parts) {
    const mapped = CLAUDE_TOOL_TO_KIRO_TYPE[part]
    if (mapped) {
      if (mapped === "*") return [] // Wildcard — match all, omit toolTypes
      types.add(mapped)
    } else {
      const lower = part.toLowerCase()
      if (VALID_KIRO_TOOL_TYPES.has(lower)) {
        types.add(lower)
      } else {
        warnings.push(`Warning: Tool matcher "${part}" has no known Kiro toolType mapping. Skipped.`)
      }
    }
  }
  return [...types].sort()
}

function rewriteCommand(command: string, pluginRoot: string): RewriteResult {
  const scripts: ScriptRef[] = []
  const scriptPaths: string[] = []
  const commandWarnings: string[] = []
  let rewritten = command
  let referencesScript = false

  // Rewrite ${CLAUDE_PLUGIN_ROOT}/path → .kiro/hooks/scripts/<basename> and collect scripts
  const pluginRootPattern = /\$\{?CLAUDE_PLUGIN_ROOT\}?\/([^\s"']+)/g
  rewritten = rewritten.replace(pluginRootPattern, (_match, relativePath: string) => {
    const sourcePath = path.join(pluginRoot, relativePath)
    const scriptBasename = path.basename(relativePath)
    scripts.push({ name: relativePath, sourcePath })
    const kiroPath = `.kiro/hooks/scripts/${scriptBasename}`
    scriptPaths.push(kiroPath)
    referencesScript = true
    return kiroPath
  })

  // Rewrite $CLAUDE_PROJECT_DIR/path → relative path
  const projectDirPattern = /\$\{?CLAUDE_PROJECT_DIR\}?\/([^\s"']+)/g
  rewritten = rewritten.replace(projectDirPattern, (_match, relativePath: string) => {
    const projectPath = `./${relativePath}`
    scriptPaths.push(projectPath)
    referencesScript = true
    return projectPath
  })

  // Warn about other unrecognized $CLAUDE_* env vars
  const otherClaudeVars = rewritten.match(/\$\{?CLAUDE_[A-Z_]+\}?/g)
  if (otherClaudeVars) {
    for (const v of otherClaudeVars) {
      commandWarnings.push(`Warning: Command contains unrecognized env var "${v}" which may not work in Kiro.`)
    }
  }

  return { command: rewritten, referencedScripts: scripts, scriptPaths, referencesScript, commandWarnings }
}

function extractScriptName(command: string): string {
  // Get the basename of the first path-like token, or first word
  const firstToken = command.split(/\s+/)[0]
  const basename = path.basename(firstToken)
  return basename || firstToken
}

function slugify(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

