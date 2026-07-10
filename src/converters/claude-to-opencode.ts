import { formatFrontmatter } from "../utils/frontmatter"
import { normalizeModelWithProvider, rejectsSamplingParams } from "../utils/model"
import { commandNameToRelativePath } from "../utils/files"
import {
  type ClaudeAgent,
  type ClaudeCommand,
  type ClaudeHooks,
  type ClaudePlugin,
  type ClaudeMcpServer,
  type ClaudeSkill,
  filterSkillsByPlatform,
} from "../types/claude"
import type {
  OpenCodeBundle,
  OpenCodeCommandFile,
  OpenCodeConfig,
  OpenCodeMcpServer,
} from "../types/opencode"

export type PermissionMode = "none" | "broad" | "from-commands"

export type ClaudeToOpenCodeOptions = {
  agentMode: "primary" | "subagent"
  inferTemperature: boolean
  permissions: PermissionMode
  /**
   * Codex-only option. Ignored by other targets.
   *
   * When false (default), `convertClaudeToCodex` emits only agent conversions.
   * Skills and commands are expected to install via Codex's native plugin flow
   * (`codex plugin install`), which the Bun converter complements rather than
   * duplicates. Without this setting, running both native install and the Bun
   * converter registers skills twice — once from the native plugin manifest,
   * once from the converter output — creating conflicts.
   *
   * When true, the converter emits skills (copied as-is), commands (as prompts
   * and generated skills), and agents together. Use when installing without
   * Codex native plugin install (legacy / standalone flow).
   *
   * Obsolete once Codex's native plugin spec supports custom agents; at that
   * point the entire `--to codex` converter path is expected to be deprecated.
   */
  codexIncludeSkills?: boolean
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

type HookEventMapping = {
  events: string[]
  type: "tool" | "session" | "permission" | "message"
  requireError?: boolean
  note?: string
}

const HOOK_EVENT_MAP: Record<string, HookEventMapping> = {
  PreToolUse: { events: ["tool.execute.before"], type: "tool" },
  PostToolUse: { events: ["tool.execute.after"], type: "tool" },
  PostToolUseFailure: { events: ["tool.execute.after"], type: "tool", requireError: true, note: "Claude PostToolUseFailure" },
  SessionStart: { events: ["session.created"], type: "session" },
  SessionEnd: { events: ["session.deleted"], type: "session" },
  Stop: { events: ["session.idle"], type: "session" },
  PreCompact: { events: ["experimental.session.compacting"], type: "session" },
  PermissionRequest: { events: ["permission.requested", "permission.replied"], type: "permission", note: "Claude PermissionRequest" },
  UserPromptSubmit: { events: ["message.created", "message.updated"], type: "message", note: "Claude UserPromptSubmit" },
  Notification: { events: ["message.updated"], type: "message", note: "Claude Notification" },
  Setup: { events: ["session.created"], type: "session", note: "Claude Setup" },
  SubagentStart: { events: ["message.updated"], type: "message", note: "Claude SubagentStart" },
  SubagentStop: { events: ["message.updated"], type: "message", note: "Claude SubagentStop" },
}

export function convertClaudeToOpenCode(
  plugin: ClaudePlugin,
  options: ClaudeToOpenCodeOptions,
): OpenCodeBundle {
  const agentFiles = plugin.agents.map((agent) => convertAgent(agent, options))
  const openCodeSkills = filterSkillsByPlatform(plugin.skills, "opencode")
  // Commands from the plugin's commands/ directory take priority; skill stubs
  // are only appended for names that don't already have an explicit command.
  // Dedup uses the normalized path key (colons -> slashes) to match the writer's
  // on-disk layout -- "foo:bar" and a skill named "foo/bar" both resolve to
  // commands/foo/bar.md, so they must be treated as the same command here.
  const explicitCommands = convertCommands(plugin.commands)
  const explicitCommandPaths = new Set(explicitCommands.map((c) => commandNameToRelativePath(c.name)))
  // Also deduplicate stubs against each other by normalized path, in case two
  // skills resolve to the same commands/<path>.md. Keep the first occurrence.
  const seenStubPaths = new Set<string>()
  const skillStubs = convertSkillsToCommands(openCodeSkills).filter((stub) => {
    const normalizedPath = commandNameToRelativePath(stub.name)
    if (explicitCommandPaths.has(normalizedPath) || seenStubPaths.has(normalizedPath)) return false
    seenStubPaths.add(normalizedPath)
    return true
  })
  const cmdFiles = [...explicitCommands, ...skillStubs]
  const mcp = plugin.mcpServers ? convertMcp(plugin.mcpServers) : undefined
  const plugins = plugin.hooks ? [convertHooks(plugin.hooks)] : []

  const config: OpenCodeConfig = {
    $schema: "https://opencode.ai/config.json",
    mcp: mcp && Object.keys(mcp).length > 0 ? mcp : undefined,
  }

  applyPermissions(config, plugin.commands, options.permissions, skillStubs.length > 0)

  return {
    pluginName: plugin.manifest.name,
    config,
    agents: agentFiles,
    commandFiles: cmdFiles,
    plugins,
    skillDirs: openCodeSkills.map((skill) => ({ sourceDir: skill.sourceDir, name: skill.name })),
  }
}

function convertAgent(agent: ClaudeAgent, options: ClaudeToOpenCodeOptions) {
  const frontmatter: Record<string, unknown> = {
    description: agent.description,
    mode: options.agentMode,
  }

  // Only write model for primary agents. Subagents inherit from the parent
  // session, making them provider-agnostic. Writing an explicit model like
  // "anthropic/claude-haiku-4-5" on a subagent causes ProviderModelNotFoundError
  // when the user's OpenCode env uses a different provider. See #477.
  if (agent.model && agent.model !== "inherit" && options.agentMode === "primary") {
    frontmatter.model = normalizeModelWithProvider(agent.model)
  }

  if (options.inferTemperature) {
    const temperature = inferTemperature(agent)
    // A written model that rejects non-default sampling params (Sonnet 5, Opus
    // 4.7+) returns HTTP 400 if paired with a temperature. We only write model
    // for primary agents, so suppression only applies there; subagents inherit
    // the parent session's model and are out of scope.
    const modelRejectsTemperature =
      frontmatter.model !== undefined &&
      typeof agent.model === "string" &&
      rejectsSamplingParams(agent.model)
    if (temperature !== undefined && !modelRejectsTemperature) {
      frontmatter.temperature = temperature
    }
  }

  const content = formatFrontmatter(frontmatter, rewriteClaudePaths(agent.body))

  return {
    name: agent.name,
    content,
  }
}

// Commands are written as individual .md files rather than entries in opencode.json.
// Chosen over JSON map because opencode resolves commands by filename at runtime (ADR-001).
function convertCommands(commands: ClaudeCommand[]): OpenCodeCommandFile[] {
  const files: OpenCodeCommandFile[] = []
  for (const command of commands) {
    if (command.disableModelInvocation) continue
    const frontmatter: Record<string, unknown> = {
      description: command.description,
    }
    if (command.model && command.model !== "inherit") {
      frontmatter.model = normalizeModelWithProvider(command.model)
    }
    const content = formatFrontmatter(frontmatter, rewriteClaudePaths(command.body))
    files.push({ name: command.name, content })
  }
  return files
}

// Generate a slash-command stub for each skill so OpenCode users can invoke
// /ce-work, /ce-plan, etc. just like Claude Code users do.
// The stub body delegates to the skill tool so the full skill content is loaded.
//
// Only `user-invocable: false` suppresses a stub. `disable-model-invocation`
// does NOT: that flag means the skill is user-invocation-only (e.g. ce-polish,
// whose description says "type /ce-polish to run it"), so a slash command is the
// only entry point it has -- exactly the skill that most needs a stub.
function convertSkillsToCommands(skills: ClaudeSkill[]): OpenCodeCommandFile[] {
  const files: OpenCodeCommandFile[] = []
  for (const skill of skills) {
    if (skill.userInvocable === false) continue
    const frontmatter: Record<string, unknown> = {
      description: skill.description,
    }
    if (skill.argumentHint) {
      frontmatter["argument-hint"] = skill.argumentHint
    }
    const body = `Load and execute the \`${skill.name}\` skill.\n\n$ARGUMENTS`
    const content = formatFrontmatter(frontmatter, body)
    files.push({ name: skill.name, content })
  }
  return files
}

function convertMcp(servers: Record<string, ClaudeMcpServer>): Record<string, OpenCodeMcpServer> {
  const result: Record<string, OpenCodeMcpServer> = {}
  for (const [name, server] of Object.entries(servers)) {
    if (server.command) {
      result[name] = {
        type: "local",
        command: [server.command, ...(server.args ?? [])],
        environment: server.env,
        enabled: true,
      }
      continue
    }

    if (server.url) {
      result[name] = {
        type: "remote",
        url: server.url,
        headers: server.headers,
        enabled: true,
      }
    }
  }
  return result
}

function convertHooks(hooks: ClaudeHooks) {
  const handlerBlocks: string[] = []
  const hookMap = hooks.hooks
  const unmappedEvents: string[] = []

  for (const [eventName, matchers] of Object.entries(hookMap)) {
    const mapping = HOOK_EVENT_MAP[eventName]
    if (!mapping) {
      unmappedEvents.push(eventName)
      continue
    }
    if (matchers.length === 0) continue
    for (const event of mapping.events) {
      handlerBlocks.push(
        renderHookHandlers(event, matchers, {
          useToolMatcher: mapping.type === "tool" || mapping.type === "permission",
          requireError: mapping.requireError ?? false,
          note: mapping.note,
        }),
      )
    }
  }

  const unmappedComment = unmappedEvents.length > 0
    ? `// Unmapped Claude hook events: ${unmappedEvents.join(", ")}\n`
    : ""

  const content = `${unmappedComment}import type { Plugin } from "@opencode-ai/plugin"\n\nexport const ConvertedHooks: Plugin = async ({ $ }) => {\n  return {\n${handlerBlocks.join(",\n")}\n  }\n}\n\nexport default ConvertedHooks\n`

  return {
    name: "converted-hooks.ts",
    content,
  }
}

function renderHookHandlers(
  event: string,
  matchers: ClaudeHooks["hooks"][string],
  options: { useToolMatcher: boolean; requireError: boolean; note?: string },
) {
  const statements: string[] = []
  for (const matcher of matchers) {
    statements.push(...renderHookStatements(matcher, options.useToolMatcher))
  }
  const rendered = statements.map((line) => `    ${line}`).join("\n")
  const wrapped = options.requireError
    ? `    if (input?.error) {\n${statements.map((line) => `      ${line}`).join("\n")}\n    }`
    : rendered

  // Wrap tool.execute.before handlers in try-catch to prevent a failing hook
  // from crashing parallel tool call batches (causes API 400 errors).
  // See: https://github.com/EveryInc/compound-engineering-plugin/issues/85
  const isPreToolUse = event === "tool.execute.before"
  const note = options.note ? `    // ${options.note}\n` : ""
  if (isPreToolUse) {
    return `    "${event}": async (input) => {\n${note}    try {\n  ${wrapped}\n    } catch (err) {\n      console.error("[hook] ${event} error (non-fatal):", err)\n    }\n    }`
  }
  return `    "${event}": async (input) => {\n${note}${wrapped}\n    }`
}

function renderHookStatements(
  matcher: ClaudeHooks["hooks"][string][number],
  useToolMatcher: boolean,
): string[] {
  if (!matcher.hooks || matcher.hooks.length === 0) return []
  const tools = matcher.matcher
    ? matcher.matcher
        .split("|")
        .map((tool) => tool.trim().toLowerCase())
        .filter(Boolean)
    : []

  const useMatcher = useToolMatcher && tools.length > 0 && !tools.includes("*")
  const condition = useMatcher
    ? tools.map((tool) => `input.tool === "${tool}"`).join(" || ")
    : null
  const statements: string[] = []

  for (const hook of matcher.hooks) {
    if (hook.type === "command") {
      if (condition) {
        statements.push(`if (${condition}) { await $\`${hook.command}\` }`)
      } else {
        statements.push(`await $\`${hook.command}\``)
      }
      if (hook.timeout) {
        statements.push(`// timeout: ${hook.timeout}s (not enforced)`)
      }
      continue
    }
    if (hook.type === "prompt") {
      statements.push(`// Prompt hook for ${matcher.matcher ?? "*"}: ${hook.prompt.replace(/\n/g, " ")}`)
      continue
    }
    statements.push(`// Agent hook for ${matcher.matcher ?? "*"}: ${hook.agent}`)
  }

  return statements
}

function rewriteClaudePaths(body: string): string {
  return body
    .replace(/~\/\.claude\//g, "~/.config/opencode/")
    .replace(/\.claude\//g, ".opencode/")
}

/**
 * Transform skill/agent content for OpenCode compatibility.
 * Composes path rewriting with fully-qualified agent name flattening.
 *
 * OpenCode resolves agents by flat filename, so fully-qualified agent
 * references must be flattened. Both 3-segment legacy refs
 * (`compound-engineering:document-review:coherence-reviewer` -> `coherence-reviewer`)
 * and 2-segment category-qualified refs (`review:ce-correctness-reviewer` ->
 * `ce-correctness-reviewer`) are handled. 2-segment skill references without
 * `ce-` prefix (e.g. `compound-engineering:document-review`) are left unchanged.
 * See #477.
 */
export function transformSkillContentForOpenCode(body: string): string {
  let result = rewriteClaudePaths(body)
  // Rewrite 3-segment FQ agent refs: plugin:category:agent-name -> agent-name.
  // Boundary assertions prevent partial matching on 4+ segment names
  // (e.g. `a:b:c:d` would otherwise produce `c:d` or `a:d`).
  // The `/` in the lookbehind prevents rewriting slash commands like
  // `/team:ops:deploy` — agent names are never preceded by `/`.
  result = result.replace(
    /(?<![a-z0-9:/-])[a-z][a-z0-9-]*:[a-z][a-z0-9-]*:([a-z][a-z0-9-]*)(?![a-z0-9:-])/g,
    "$1",
  )
  // Rewrite 2-segment category-qualified agent refs: category:ce-agent -> ce-agent.
  // Only matches when the agent segment starts with `ce-` to avoid false positives
  // on slash commands or other colon-separated patterns.
  result = result.replace(
    /(?<![a-z0-9:/-])[a-z][a-z0-9-]*:(ce-[a-z][a-z0-9-]*)(?![a-z0-9:-])/g,
    "$1",
  )
  return result
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

function applyPermissions(
  config: OpenCodeConfig,
  commands: ClaudeCommand[],
  mode: PermissionMode,
  hasSkillStubs = false,
) {
  if (mode === "none") return

  const sourceTools = [
    "read",
    "write",
    "edit",
    "bash",
    "grep",
    "glob",
    "list",
    "webfetch",
    "skill",
    "patch",
    "task",
    "question",
    "todowrite",
    "todoread",
  ]
  let enabled = new Set<string>()
  const patterns: Record<string, Set<string>> = {}

  if (mode === "broad") {
    enabled = new Set(sourceTools)
  } else {
    for (const command of commands) {
      if (!command.allowedTools) continue
      for (const tool of command.allowedTools) {
        const parsed = parseToolSpec(tool)
        if (!parsed.tool) continue
        enabled.add(parsed.tool)
        if (parsed.pattern) {
          const normalizedPattern = normalizePattern(parsed.tool, parsed.pattern)
          if (!patterns[parsed.tool]) patterns[parsed.tool] = new Set()
          patterns[parsed.tool].add(normalizedPattern)
        }
      }
    }
    // Skill stubs require the `skill` tool to load the skill at invocation time.
    // If we're emitting stubs, ensure `skill` is allowed even when no explicit
    // command listed it in allowed-tools, and even when a command listed a
    // patterned skill(foo-*) rule: a pattern-scoped permission would still
    // block stubs for skills outside the pattern. Clear any skill patterns so
    // the permission build emits a flat "allow" for the skill tool.
    if (hasSkillStubs) {
      enabled.add("skill")
      delete patterns["skill"]
      // `from-commands` only allows tools that explicit commands declare. A
      // generated stub can load its skill, but the skill body may need tools
      // (read/bash/edit/...) that no command declared, so this mode denies
      // them and the skill stalls mid-run. We allow `skill` so the stub at
      // least loads; warn so the user can pick `none`/`broad` if their skills
      // need to act. (The default install mode is `none`, which writes no
      // permission block and is unaffected.)
      if (enabled.size === 1 && enabled.has("skill")) {
        console.warn(
          "Warning: --permissions from-commands restricts tools to those declared by explicit commands, " +
            "but this plugin's slash commands are skill stubs with no declared tools. The stubs can load " +
            "their skills, but the skills may be blocked from using read/bash/edit/etc. Use --permissions none " +
            "(default) or broad if your skills need to act.",
        )
      }
    }
  }

  const permission: Record<string, "allow" | "deny" | Record<string, "allow" | "deny">> = {}

  if (mode === "broad") {
    for (const tool of sourceTools) {
      permission[tool] = "allow"
    }
  } else {
    for (const tool of sourceTools) {
      const toolPatterns = patterns[tool]
      if (toolPatterns && toolPatterns.size > 0) {
        const patternPermission: Record<string, "allow" | "deny"> = { "*": "deny" }
        for (const pattern of toolPatterns) {
          patternPermission[pattern] = "allow"
        }
        ;(permission)[tool] = patternPermission
      } else {
        permission[tool] = enabled.has(tool) ? "allow" : "deny"
      }
    }
  }

  if (enabled.has("write") || enabled.has("edit")) {
    if (typeof permission.edit === "string") permission.edit = "allow"
    if (typeof permission.write === "string") permission.write = "allow"
  }
  if (patterns.write || patterns.edit) {
    const combined = new Set<string>()
    for (const pattern of patterns.write ?? []) combined.add(pattern)
    for (const pattern of patterns.edit ?? []) combined.add(pattern)
    const combinedPermission: Record<string, "allow" | "deny"> = { "*": "deny" }
    for (const pattern of combined) {
      combinedPermission[pattern] = "allow"
    }
    ;(permission).edit = combinedPermission
    ;(permission).write = combinedPermission
  }

  config.permission = permission
}

function parseToolSpec(raw: string): { tool: string | null; pattern?: string } {
  const trimmed = raw.trim()
  if (!trimmed) return { tool: null }
  const [namePart, patternPart] = trimmed.split("(", 2)
  const name = namePart.trim().toLowerCase()
  const tool = TOOL_MAP[name] ?? null
  if (!patternPart) return { tool }
  const normalizedPattern = patternPart.endsWith(")")
    ? patternPart.slice(0, -1).trim()
    : patternPart.trim()
  return { tool, pattern: normalizedPattern }
}

function normalizePattern(tool: string, pattern: string): string {
  if (tool === "bash") {
    return pattern.replace(/:/g, " ").trim()
  }
  return pattern
}
