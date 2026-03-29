import { formatFrontmatter } from "../utils/frontmatter"
import type { ClaudeAgent, ClaudeCommand, ClaudePlugin, ClaudeSkill } from "../types/claude"
import type { CodexBundle, CodexGeneratedSkill } from "../types/codex"
import type { ClaudeToOpenCodeOptions } from "./claude-to-opencode"
import { composeAgentBody } from "../utils/agent-content"
import {
  normalizeCodexName,
  transformContentForCodex,
  type CodexInvocationTargets,
} from "../utils/codex-content"

export type ClaudeToCodexOptions = ClaudeToOpenCodeOptions

const CODEX_DESCRIPTION_MAX_LENGTH = 1024

export function convertClaudeToCodex(
  plugin: ClaudePlugin,
  _options: ClaudeToCodexOptions,
): CodexBundle {
  const invocableCommands = plugin.commands.filter((command) => !command.disableModelInvocation)
  const applyCompoundWorkflowModel = shouldApplyCompoundWorkflowModel(plugin)
  const canonicalWorkflowSkills = applyCompoundWorkflowModel
    ? plugin.skills.filter((skill) => isCanonicalCodexWorkflowSkill(skill.name))
    : []
  const deprecatedWorkflowAliases = applyCompoundWorkflowModel
    ? plugin.skills.filter((skill) => isDeprecatedCodexWorkflowAlias(skill.name))
    : []
  const copiedSkills = applyCompoundWorkflowModel
    ? plugin.skills.filter((skill) => !isDeprecatedCodexWorkflowAlias(skill.name))
    : plugin.skills
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

  const workflowPromptNames = new Map<string, string>()
  for (const skill of canonicalWorkflowSkills) {
    workflowPromptNames.set(
      skill.name,
      uniqueName(normalizeCodexName(skill.name), promptNames),
    )
  }

  const promptTargets: Record<string, string> = {}
  for (const [commandName, promptName] of commandPromptNames) {
    promptTargets[normalizeCodexName(commandName)] = promptName
  }
  for (const [skillName, promptName] of workflowPromptNames) {
    promptTargets[normalizeCodexName(skillName)] = promptName
  }
  for (const alias of deprecatedWorkflowAliases) {
    const canonicalName = toCanonicalWorkflowSkillName(alias.name)
    const promptName = canonicalName ? workflowPromptNames.get(canonicalName) : undefined
    if (promptName) {
      promptTargets[normalizeCodexName(alias.name)] = promptName
    }
  }

  const skillTargets: Record<string, string> = {}
  for (const skill of copiedSkills) {
    if (applyCompoundWorkflowModel && isCanonicalCodexWorkflowSkill(skill.name)) continue
    skillTargets[normalizeCodexName(skill.name)] = skill.name
  }

  const invocationTargets: CodexInvocationTargets = { promptTargets, skillTargets }

  const commandSkills: CodexGeneratedSkill[] = []
  const prompts = invocableCommands.map((command) => {
    const promptName = commandPromptNames.get(command.name)!
    const commandSkill = convertCommandSkill(command, usedSkillNames, invocationTargets)
    commandSkills.push(commandSkill)
    const content = renderPrompt(command, commandSkill.name, invocationTargets)
    return { name: promptName, content }
  })
  const workflowPrompts = canonicalWorkflowSkills.map((skill) => ({
    name: workflowPromptNames.get(skill.name)!,
    content: renderWorkflowPrompt(skill),
  }))

  const agentSkills = plugin.agents.map((agent) =>
    convertAgent(agent, usedSkillNames, invocationTargets),
  )
  const generatedSkills = [...commandSkills, ...agentSkills]

  return {
    prompts: [...prompts, ...workflowPrompts],
    skillDirs,
    generatedSkills,
    invocationTargets,
    mcpServers: plugin.mcpServers,
  }
}

function convertAgent(
  agent: ClaudeAgent,
  usedNames: Set<string>,
  invocationTargets: CodexInvocationTargets,
): CodexGeneratedSkill {
  const name = uniqueName(normalizeCodexName(agent.name), usedNames)
  const description = sanitizeDescription(
    agent.description ?? `Converted from Claude agent ${agent.name}`,
  )
  const frontmatter: Record<string, unknown> = { name, description }

  const body = [
    composeAgentBody({
      body: transformContentForCodex(agent.body.trim(), invocationTargets),
      fallback: `Instructions converted from the ${agent.name} agent.`,
      capabilities: agent.capabilities,
    }),
  ]
    .filter(Boolean)
    .join("\n\n")

  const content = formatFrontmatter(frontmatter, body)
  return { name, content }
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

function renderWorkflowPrompt(skill: ClaudeSkill): string {
  const frontmatter: Record<string, unknown> = {
    description: skill.description,
    "argument-hint": skill.argumentHint,
  }
  const body = [
    `Use the ${skill.name} skill for this workflow and follow its instructions exactly.`,
    "Treat any text after the prompt name as the workflow context to pass through.",
  ].join("\n\n")
  return formatFrontmatter(frontmatter, body)
}

function isCanonicalCodexWorkflowSkill(name: string): boolean {
  return name.startsWith("ce:")
}

function isDeprecatedCodexWorkflowAlias(name: string): boolean {
  return name.startsWith("workflows:")
}

function toCanonicalWorkflowSkillName(name: string): string | null {
  if (!isDeprecatedCodexWorkflowAlias(name)) return null
  return `ce:${name.slice("workflows:".length)}`
}

function shouldApplyCompoundWorkflowModel(plugin: ClaudePlugin): boolean {
  return plugin.manifest.name === "compound-engineering"
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
