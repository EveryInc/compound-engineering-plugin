export type KimiInvocationTargets = {
  /**
   * Normalized name -> Kimi skill name. Covers pass-through skills as well as
   * skills generated from Claude commands, so a `/command` reference can be
   * rewritten to the `/skill:<name>` form Kimi understands.
   */
  skillTargets: Record<string, string>
  /** Normalized agent name -> Kimi skill name (agents convert to skills). */
  agentTargets?: Record<string, string>
}

export type KimiTransformOptions = {
  /**
   * What to do with a slash reference that matches no known skill target.
   * `preserve` keeps it verbatim (default — it is likely a Kimi built-in
   * command or a filesystem path); `skill` rewrites it to `/skill:<name>`.
   */
  unknownSlashBehavior?: "preserve" | "skill"
}

/**
 * Transform Claude Code content to Kimi CLI-compatible content.
 *
 * Handles the syntax differences that matter for Kimi:
 * 1. Task agent calls: `Task agent-name(args)` -> `Use the \`agent-name\` skill to: args`
 * 2. Slash command references: known commands/skills -> `/skill:<name>`
 * 3. Agent references: `@agent-name` -> the `agent-name` skill
 * 4. Claude config paths: `.claude/` -> `.kimi/`
 */
export function transformContentForKimi(
  body: string,
  targets?: KimiInvocationTargets,
  options: KimiTransformOptions = {},
): string {
  let result = body
  const skillTargets = targets?.skillTargets ?? {}
  const agentTargets = targets?.agentTargets ?? {}
  const unknownSlashBehavior = options.unknownSlashBehavior ?? "preserve"

  const taskPattern = /^(\s*-?\s*)Task\s+([a-z][a-z0-9:-]*)\(([^)]*)\)/gm
  result = result.replace(taskPattern, (_match, prefix: string, agentName: string, args: string) => {
    const target = resolveTarget(agentName, agentTargets, skillTargets)
    const trimmedArgs = args.trim()
    const skillName = target ?? normalizeKimiName(finalSegment(agentName))
    return trimmedArgs
      ? `${prefix}Use the \`${skillName}\` skill to: ${trimmedArgs}`
      : `${prefix}Use the \`${skillName}\` skill`
  })

  const slashCommandPattern = /(?<![:\w>}\]\)])\/([a-z][a-z0-9_:-]*?)(?=[\s,."')\]}`]|$)/gi
  result = result.replace(slashCommandPattern, (match, commandName: string) => {
    if (commandName.includes("/")) return match
    if (["dev", "tmp", "etc", "usr", "var", "bin", "home"].includes(commandName)) return match

    const normalizedName = normalizeKimiName(commandName)
    const target = skillTargets[normalizedName]
    if (target) return `/skill:${target}`
    if (unknownSlashBehavior === "skill") return `/skill:${normalizedName}`
    return match
  })

  result = result
    .replace(/~\/\.claude\//g, "~/.kimi/")
    .replace(/\.claude\//g, ".kimi/")

  const agentRefPattern = /@([a-z][a-z0-9-]*-(?:agent|reviewer|researcher|analyst|specialist|oracle|sentinel|guardian|strategist))/gi
  result = result.replace(agentRefPattern, (_match, agentName: string) => {
    const target = resolveTarget(agentName, agentTargets, skillTargets)
    return `the \`${target ?? normalizeKimiName(agentName)}\` skill`
  })

  return result
}

function resolveTarget(
  value: string,
  agentTargets: Record<string, string>,
  skillTargets: Record<string, string>,
): string | null {
  const parts = value.split(":").filter(Boolean)
  const candidates = [
    normalizeKimiName(value),
    parts.length >= 2 ? normalizeKimiName(parts.slice(-2).join(":")) : "",
    parts.length >= 1 ? normalizeKimiName(parts[parts.length - 1]) : "",
  ].filter(Boolean)

  for (const candidate of candidates) {
    if (agentTargets[candidate]) return agentTargets[candidate]
  }
  for (const candidate of candidates) {
    if (skillTargets[candidate]) return skillTargets[candidate]
  }
  return null
}

function finalSegment(value: string): string {
  return value.includes(":") ? value.split(":").pop()! : value
}

/**
 * Kimi's 13 supported hook lifecycle events. Claude events outside this set
 * (e.g. PermissionRequest, Setup) have no Kimi equivalent and are dropped.
 * Shared by the converter (to warn) and the writer (to render).
 */
export const KIMI_HOOK_EVENTS = new Set<string>([
  "PreToolUse",
  "PostToolUse",
  "PostToolUseFailure",
  "UserPromptSubmit",
  "Stop",
  "StopFailure",
  "SessionStart",
  "SessionEnd",
  "SubagentStart",
  "SubagentStop",
  "PreCompact",
  "PostCompact",
  "Notification",
])

export function isKimiHookEvent(event: string): boolean {
  return KIMI_HOOK_EVENTS.has(event)
}

/**
 * Normalize a name into a valid Kimi skill name: 1-64 chars, lowercase
 * letters, digits, and hyphens only.
 */
export function normalizeKimiName(value: string): string {
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
