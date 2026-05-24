import fs, { type Dirent } from "fs"
import path from "path"
import { formatFrontmatter } from "../utils/frontmatter"
import { type ClaudeAgent, type ClaudeCommand, type ClaudePlugin, filterSkillsByPlatform } from "../types/claude"
import type { CodexAgent, CodexBundle, CodexGeneratedSkill, CodexGeneratedSkillSidecarDir } from "../types/codex"
import type { ClaudeToOpenCodeOptions } from "./claude-to-opencode"
import {
  normalizeCodexName,
  transformContentForCodex,
  type CodexInvocationTargets,
} from "../utils/codex-content"

export type ClaudeToCodexOptions = ClaudeToOpenCodeOptions

const CODEX_DESCRIPTION_MAX_LENGTH = 1024

export function convertClaudeToCodex(
  plugin: ClaudePlugin,
  options: ClaudeToCodexOptions,
): CodexBundle {
  // Agents-only is the default for --to codex. Skills and commands are
  // expected to install via Codex's native plugin flow (`codex plugin install`)
  // which reads the plugin's .codex-plugin/plugin.json manifest. The Bun
  // converter fills the one gap Codex's native spec leaves open: custom
  // agents. Emitting skills too would double-register them — once from native
  // install, once from this converter.
  const includeSkills = options.codexIncludeSkills ?? false

  const platformSkills = filterSkillsByPlatform(plugin.skills, "codex")
  const invocableCommands = plugin.commands.filter((command) => !command.disableModelInvocation)
  const applyCompoundWorkflowModel = shouldApplyCompoundWorkflowModel(plugin)
  const deprecatedWorkflowAliases = applyCompoundWorkflowModel
    ? platformSkills.filter((skill) => isDeprecatedCodexWorkflowAlias(skill.name))
    : []
  const copiedSkills = applyCompoundWorkflowModel
    ? platformSkills.filter((skill) => !isDeprecatedCodexWorkflowAlias(skill.name))
    : platformSkills
  const skillDirs = copiedSkills.map((skill) => ({
    name: skill.name,
    sourceDir: skill.sourceDir,
  }))
  const promptNames = new Set<string>()
  const usedSkillNames = new Set<string>(skillDirs.map((skill) => normalizeCodexName(skill.name)))

  const commandPromptNames = new Map<string, string>()
  for (const command of invocableCommands) {
    commandPromptNames.set(
      command.name,
      uniqueName(normalizeCodexName(command.name), promptNames),
    )
  }

  const promptTargets: Record<string, string> = {}
  for (const [commandName, promptName] of commandPromptNames) {
    promptTargets[normalizeCodexName(commandName)] = promptName
  }
  const skillTargets: Record<string, string> = {}
  for (const skill of copiedSkills) {
    skillTargets[normalizeCodexName(skill.name)] = skill.name
  }
  for (const alias of deprecatedWorkflowAliases) {
    const canonicalName = toCanonicalWorkflowSkillName(alias.name)
    if (canonicalName) {
      skillTargets[normalizeCodexName(alias.name)] = canonicalName
    }
  }

  // Agents are always converted to TOML custom agents regardless of mode —
  // that's the whole point of --to codex. invocationTargets is populated from
  // the full plugin so agent bodies can reference skills correctly; native
  // install makes those skills discoverable at runtime.
  const agents = plugin.agents.map(convertAgent)
  const agentTargets = buildAgentTargets(plugin, agents)
  const invocationTargets: CodexInvocationTargets = { promptTargets, skillTargets, agentTargets }

  if (!includeSkills) {
    // Default: agents-only. Skills, prompts, command-skills, and MCP are
    // suppressed so native plugin install is the sole source for those
    // artifact types.
    //
    // Pass through current skill NAMES (not contents) so `writeCodexBundle`
    // treats them as "current" and `cleanupLegacyAgentSkillDirs` doesn't
    // move still-active skills under `.codex/skills/<plugin>/<name>/` into
    // legacy-backup. Without this, re-running `install --to codex` after a
    // native plugin install would sweep allow-listed names like `ce-plan`
    // into backup because `currentSkills` (derived from skillDirs and
    // generatedSkills) would be empty while the legacy allow-list still
    // lists them.
    // Mirror the skill-name set that full mode would emit via `skillDirs`:
    // current skills plus the canonical rewrites of deprecated workflow
    // aliases. Deduped via Set so the caller doesn't have to worry about
    // overlap between `copiedSkills` names and `skillTargets` values.
    const externallyManagedSkillNames = Array.from(new Set([
      ...copiedSkills.map((skill) => skill.name),
      ...deprecatedWorkflowAliases
        .map((alias) => toCanonicalWorkflowSkillName(alias.name))
        .filter((name): name is string => name !== null),
    ]))
    return {
      pluginName: plugin.manifest.name,
      prompts: [],
      skillDirs: [],
      generatedSkills: [],
      agents,
      invocationTargets,
      mcpServers: undefined,
      hooks: plugin.hooks,
      externallyManagedSkillNames,
    }
  }

  // Full / legacy / standalone mode: everything goes through the converter.
  const commandSkills: CodexGeneratedSkill[] = []
  const prompts = invocableCommands.map((command) => {
    const promptName = commandPromptNames.get(command.name)!
    const commandSkill = convertCommandSkill(command, usedSkillNames, invocationTargets)
    commandSkills.push(commandSkill)
    const content = renderPrompt(command, commandSkill.name, invocationTargets)
    return { name: promptName, content }
  })

  return {
    pluginName: plugin.manifest.name,
    prompts,
    skillDirs,
    generatedSkills: [...commandSkills],
    agents,
    invocationTargets,
    mcpServers: plugin.mcpServers,
    hooks: plugin.hooks,
  }
}

function convertAgent(agent: ClaudeAgent): CodexAgent {
  const name = buildCodexAgentName(agent)
  const description = sanitizeDescription(
    agent.description ?? `Converted from Claude agent ${agent.name}`,
  )
  let instructions = agent.body.trim()
  if (agent.capabilities && agent.capabilities.length > 0) {
    const capabilities = agent.capabilities.map((capability) => `- ${capability}`).join("\n")
    instructions = `## Capabilities\n${capabilities}\n\n${instructions}`.trim()
  }
  if (instructions.length === 0) {
    instructions = `Instructions converted from the ${agent.name} agent.`
  }

  return { name, description, instructions, sidecarDirs: collectReferencedSidecarDirs(agent) }
}

function convertCommandSkill(
  command: ClaudeCommand,
  usedNames: Set<string>,
  invocationTargets: CodexInvocationTargets,
): CodexGeneratedSkill {
  const name = uniqueName(normalizeCodexName(command.name), usedNames)
  const frontmatter: Record<string, unknown> = {
    name,
    description: sanitizeDescription(
      command.description ?? `Converted from Claude command ${command.name}`,
    ),
  }
  const sections: string[] = []
  if (command.argumentHint) {
    sections.push(`## Arguments\n${command.argumentHint}`)
  }
  if (command.allowedTools && command.allowedTools.length > 0) {
    sections.push(`## Allowed tools\n${command.allowedTools.map((tool) => `- ${tool}`).join("\n")}`)
  }
  const transformedBody = transformContentForCodex(command.body.trim(), invocationTargets)
  sections.push(transformedBody)
  const body = sections.filter(Boolean).join("\n\n").trim()
  const content = formatFrontmatter(frontmatter, body.length > 0 ? body : command.body)
  return { name, content }
}

function renderPrompt(
  command: ClaudeCommand,
  skillName: string,
  invocationTargets: CodexInvocationTargets,
): string {
  const frontmatter: Record<string, unknown> = {
    description: command.description,
    "argument-hint": command.argumentHint,
  }
  const instructions = `Use the $${skillName} skill for this command and follow its instructions.`
  const transformedBody = transformContentForCodex(command.body, invocationTargets)
  const body = [instructions, "", transformedBody].join("\n").trim()
  return formatFrontmatter(frontmatter, body)
}

function isDeprecatedCodexWorkflowAlias(name: string): boolean {
  return name.startsWith("workflows:")
}

const WORKFLOW_ALIAS_OVERRIDES: Record<string, string> = {
  "workflows:review": "ce-code-review",
}

function toCanonicalWorkflowSkillName(name: string): string | null {
  if (!isDeprecatedCodexWorkflowAlias(name)) return null
  return WORKFLOW_ALIAS_OVERRIDES[name] ?? `ce-${name.slice("workflows:".length)}`
}

function shouldApplyCompoundWorkflowModel(plugin: ClaudePlugin): boolean {
  return plugin.manifest.name === "compound-engineering"
}

function buildAgentTargets(plugin: ClaudePlugin, agents: CodexAgent[]): Record<string, string> {
  const targets: Record<string, string> = {}
  plugin.agents.forEach((agent, index) => {
    const targetName = agents[index]?.name
    if (!targetName) return
    const category = getAgentCategory(agent)
    const aliases = [
      agent.name,
      normalizeCodexName(agent.name),
      agent.name.startsWith("ce-") ? agent.name.slice("ce-".length) : "",
      category ? `${category}:${agent.name}` : "",
      category && agent.name.startsWith("ce-") ? `${category}:${agent.name.slice("ce-".length)}` : "",
      category ? `${plugin.manifest.name}:${category}:${agent.name}` : "",
      category && agent.name.startsWith("ce-") ? `${plugin.manifest.name}:${category}:${agent.name.slice("ce-".length)}` : "",
    ].filter(Boolean)

    for (const alias of aliases) {
      targets[normalizeCodexName(alias)] = targetName
    }
  })
  return targets
}

function buildCodexAgentName(agent: ClaudeAgent): string {
  const category = getAgentCategory(agent)
  const agentName = normalizeCodexName(agent.name)
  return category ? `${normalizeCodexName(category)}-${agentName}` : agentName
}

function getAgentCategory(agent: ClaudeAgent): string | null {
  const parts = agent.sourcePath.split(path.sep)
  const agentsIndex = parts.lastIndexOf("agents")
  if (agentsIndex === -1) return null
  const next = parts[agentsIndex + 1]
  if (!next || next.endsWith(".md")) return null
  return next
}

function sanitizeDescription(value: string, maxLength = CODEX_DESCRIPTION_MAX_LENGTH): string {
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

function collectReferencedSidecarDirs(agent: ClaudeAgent): CodexGeneratedSkillSidecarDir[] {
  const sourceDir = path.dirname(agent.sourcePath)
  let entries: Dirent[]

  try {
    entries = fs.readdirSync(sourceDir, { withFileTypes: true })
  } catch {
    return []
  }

  return entries
    .filter((entry) => entry.isDirectory())
    .filter((entry) => agent.body.includes(`${entry.name}/`) || agent.body.includes(`\`${entry.name}\``))
    .map((entry) => ({
      sourceDir: path.join(sourceDir, entry.name),
      targetName: entry.name,
    }))
}
