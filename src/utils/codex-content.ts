export type CodexInvocationTargets = {
  promptTargets: Record<string, string>
  skillTargets: Record<string, string>
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
  const unknownSlashBehavior = options.unknownSlashBehavior ?? "prompt"

  const taskPattern = /^(\s*-?\s*)Task\s+([a-z][a-z0-9:-]*)\(([^)]*)\)/gm
  result = result.replace(taskPattern, (_match, prefix: string, agentName: string, args: string) => {
    // For namespaced calls like "compound-engineering:research:repo-research-analyst",
    // use only the final segment as the skill name.
    const finalSegment = agentName.includes(":") ? agentName.split(":").pop()! : agentName
    const skillName = normalizeCodexName(finalSegment)
    const trimmedArgs = args.trim()
    return trimmedArgs
      ? `${prefix}Use the $${skillName} skill to: ${trimmedArgs}`
      : `${prefix}Use the $${skillName} skill`
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
    const skillName = normalizeCodexName(agentName)
    return `$${skillName} skill`
  })

  return result
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
