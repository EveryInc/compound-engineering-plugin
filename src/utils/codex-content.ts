export type CodexInvocationTargets = {
  promptTargets: Record<string, string>
  skillTargets: Record<string, string>
  agentTargets?: Record<string, string>
}

export type CodexTransformOptions = {
  unknownSlashBehavior?: "prompt" | "preserve"
}

/**
 * Transform Claude Code content to Codex-compatible content.
 *
 * Handles multiple syntax differences:
 * 1. Task agent calls: Task agent-name(args) -> Use the $agent-name skill to: args
 * 2. Slash command references:
 *    - known prompt entrypoints -> /prompts:prompt-name
 *    - known skills -> the exact skill name
 *    - unknown slash refs -> /prompts:command-name
 * 3. Agent references: @agent-name -> $agent-name skill
 * 4. Claude config paths: .claude/ -> .codex/
 */
export function transformContentForCodex(
  body: string,
  targets?: CodexInvocationTargets,
  options: CodexTransformOptions = {},
): string {
  let result = body
  const promptTargets = targets?.promptTargets ?? {}
  const skillTargets = targets?.skillTargets ?? {}
  const agentTargets = targets?.agentTargets ?? {}
  const unknownSlashBehavior = options.unknownSlashBehavior ?? "prompt"

  const taskPattern = /^(\s*-?\s*)Task\s+([a-z][a-z0-9:-]*)\(([^)]*)\)/gm
  result = result.replace(taskPattern, (_match, prefix: string, agentName: string, args: string) => {
    const agentTarget = resolveAgentTarget(agentName, agentTargets)
    const trimmedArgs = args.trim()
    if (agentTarget) {
      return trimmedArgs
        ? `${prefix}Spawn the custom agent \`${agentTarget}\` with task: ${trimmedArgs}`
        : `${prefix}Spawn the custom agent \`${agentTarget}\``
    }

    // For namespaced calls like "compound-engineering:research:repo-research-analyst",
    // use only the final segment as the skill name when no custom agent target exists.
    const finalSegment = agentName.includes(":") ? agentName.split(":").pop()! : agentName
    const skillName = normalizeCodexName(finalSegment)
    return trimmedArgs
      ? `${prefix}Use the $${skillName} skill to: ${trimmedArgs}`
      : `${prefix}Use the $${skillName} skill`
  })

  const backtickedAgentPattern = /`([a-z][a-z0-9-]*(?::[a-z][a-z0-9-]*){1,2})`/gi
  result = result.replace(backtickedAgentPattern, (match, agentName: string) => {
    const agentTarget = resolveAgentTarget(agentName, agentTargets)
    return agentTarget ? `custom agent \`${agentTarget}\`` : match
  })

  const slashCommandPattern = /(?<![:\w>}\]\)])\/([a-z][a-z0-9_:-]*?)(?=[\s,."')\]}`]|$)/gi
  result = result.replace(slashCommandPattern, (match, commandName: string) => {
    if (commandName.includes("/")) return match
    if (["dev", "tmp", "etc", "usr", "var", "bin", "home"].includes(commandName)) return match

    const normalizedName = normalizeCodexName(commandName)
    if (promptTargets[normalizedName]) {
      return `/prompts:${promptTargets[normalizedName]}`
    }
    if (skillTargets[normalizedName]) {
      return `the ${skillTargets[normalizedName]} skill`
    }
    if (unknownSlashBehavior === "preserve") {
      return match
    }
    return `/prompts:${normalizedName}`
  })

  result = result
    .replace(/~\/\.claude\//g, "~/.codex/")
    .replace(/\.claude\//g, ".codex/")

  const agentRefPattern = /@([a-z][a-z0-9-]*-(?:agent|reviewer|researcher|analyst|specialist|oracle|sentinel|guardian|strategist))/gi
  result = result.replace(agentRefPattern, (_match, agentName: string) => {
    const agentTarget = resolveAgentTarget(agentName, agentTargets)
    if (agentTarget) return `custom agent \`${agentTarget}\``
    const skillName = normalizeCodexName(agentName)
    return `$${skillName} skill`
  })

  return result
}

function resolveAgentTarget(value: string, agentTargets: Record<string, string>): string | null {
  const parts = value.split(":").filter(Boolean)
  const candidates = [
    normalizeCodexName(value),
    parts.length >= 2 ? normalizeCodexName(parts.slice(-2).join(":")) : "",
    parts.length >= 1 ? normalizeCodexName(parts[parts.length - 1]) : "",
  ].filter(Boolean)

  for (const candidate of candidates) {
    const target = agentTargets[candidate]
    if (target) return target
  }
  return null
}

export function normalizeCodexName(value: string): string {
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
