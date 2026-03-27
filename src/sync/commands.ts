import path from "path"
import type { ClaudeHomeConfig } from "../parsers/claude-home"
import type { ClaudePlugin } from "../types/claude"
import { backupFile, resolveCommandPath, sanitizePathName, writeText } from "../utils/files"
import { convertClaudeToCodex } from "../converters/claude-to-codex"
import { convertClaudeToCopilot } from "../converters/claude-to-copilot"
import { convertClaudeToDroid } from "../converters/claude-to-droid"
import { convertClaudeToGemini } from "../converters/claude-to-gemini"
import { convertClaudeToKiro } from "../converters/claude-to-kiro"
import { convertClaudeToOpenCode, type ClaudeToOpenCodeOptions } from "../converters/claude-to-opencode"
import { convertClaudeToPi } from "../converters/claude-to-pi"
import { convertClaudeToQwen, type ClaudeToQwenOptions } from "../converters/claude-to-qwen"
import { convertClaudeToWindsurf } from "../converters/claude-to-windsurf"
import { writeWindsurfBundle } from "../targets/windsurf"

type WindsurfSyncScope = "global" | "workspace"

const HOME_SYNC_PLUGIN_ROOT = path.join(process.cwd(), ".compound-sync-home")

const DEFAULT_SYNC_OPTIONS: ClaudeToOpenCodeOptions = {
  agentMode: "subagent",
  inferTemperature: false,
  permissions: "none",
}

const DEFAULT_QWEN_SYNC_OPTIONS: ClaudeToQwenOptions = {
  agentMode: "subagent",
  inferTemperature: false,
}

function hasCommands(config: ClaudeHomeConfig): boolean {
  return (config.commands?.length ?? 0) > 0
}

function buildClaudeHomePlugin(config: ClaudeHomeConfig): ClaudePlugin {
  return {
    root: HOME_SYNC_PLUGIN_ROOT,
    manifest: {
      name: "claude-home",
      version: "1.0.0",
      description: "Personal Claude Code home config",
    },
    agents: [],
    commands: config.commands ?? [],
    skills: config.skills,
    mcpServers: undefined,
  }
}

export async function syncOpenCodeCommands(
  config: ClaudeHomeConfig,
  outputRoot: string,
): Promise<void> {
  if (!hasCommands(config)) return

  const plugin = buildClaudeHomePlugin(config)
  const bundle = convertClaudeToOpenCode(plugin, DEFAULT_SYNC_OPTIONS)

  for (const commandFile of bundle.commandFiles) {
    const commandPath = await resolveCommandPath(path.join(outputRoot, "commands"), commandFile.name, ".md")
    const backupPath = await backupFile(commandPath)
    if (backupPath) {
      console.log(`Backed up existing command file to ${backupPath}`)
    }
    await writeText(commandPath, commandFile.content + "\n")
  }
}

export async function syncCodexCommands(
  config: ClaudeHomeConfig,
  outputRoot: string,
): Promise<void> {
  if (!hasCommands(config)) return

  const plugin = buildClaudeHomePlugin(config)
  const bundle = convertClaudeToCodex(plugin, DEFAULT_SYNC_OPTIONS)
  for (const prompt of bundle.prompts) {
    await writeText(path.join(outputRoot, "prompts", `${prompt.name}.md`), prompt.content + "\n")
  }
  for (const skill of bundle.generatedSkills) {
    await writeText(path.join(outputRoot, "skills", sanitizePathName(skill.name), "SKILL.md"), skill.content + "\n")
  }
}

export async function syncPiCommands(
  config: ClaudeHomeConfig,
  outputRoot: string,
): Promise<void> {
  if (!hasCommands(config)) return

  const plugin = buildClaudeHomePlugin(config)
  const bundle = convertClaudeToPi(plugin, DEFAULT_SYNC_OPTIONS)
  for (const prompt of bundle.prompts) {
    await writeText(path.join(outputRoot, "prompts", `${prompt.name}.md`), prompt.content + "\n")
  }
  for (const extension of bundle.extensions) {
    await writeText(path.join(outputRoot, "extensions", extension.name), extension.content + "\n")
  }
}

export async function syncDroidCommands(
  config: ClaudeHomeConfig,
  outputRoot: string,
): Promise<void> {
  if (!hasCommands(config)) return

  const plugin = buildClaudeHomePlugin(config)
  const bundle = convertClaudeToDroid(plugin, DEFAULT_SYNC_OPTIONS)
  for (const command of bundle.commands) {
    await writeText(path.join(outputRoot, "commands", `${command.name}.md`), command.content + "\n")
  }
}

export async function syncCopilotCommands(
  config: ClaudeHomeConfig,
  outputRoot: string,
): Promise<void> {
  if (!hasCommands(config)) return

  const plugin = buildClaudeHomePlugin(config)
  const bundle = convertClaudeToCopilot(plugin, DEFAULT_SYNC_OPTIONS)

  for (const skill of bundle.generatedSkills) {
    await writeText(path.join(outputRoot, "skills", sanitizePathName(skill.name), "SKILL.md"), skill.content + "\n")
  }
}

export async function syncGeminiCommands(
  config: ClaudeHomeConfig,
  outputRoot: string,
): Promise<void> {
  if (!hasCommands(config)) return

  const plugin = buildClaudeHomePlugin(config)
  const bundle = convertClaudeToGemini(plugin, DEFAULT_SYNC_OPTIONS)
  for (const command of bundle.commands) {
    await writeText(path.join(outputRoot, "commands", `${command.name}.toml`), command.content + "\n")
  }
}

export async function syncKiroCommands(
  config: ClaudeHomeConfig,
  outputRoot: string,
): Promise<void> {
  if (!hasCommands(config)) return

  const plugin = buildClaudeHomePlugin(config)
  const bundle = convertClaudeToKiro(plugin, DEFAULT_SYNC_OPTIONS)
  for (const skill of bundle.generatedSkills) {
    await writeText(path.join(outputRoot, "skills", sanitizePathName(skill.name), "SKILL.md"), skill.content + "\n")
  }
}

export async function syncWindsurfCommands(
  config: ClaudeHomeConfig,
  outputRoot: string,
  scope: WindsurfSyncScope = "global",
): Promise<void> {
  if (!hasCommands(config)) return

  const plugin = buildClaudeHomePlugin(config)
  const bundle = convertClaudeToWindsurf(plugin, DEFAULT_SYNC_OPTIONS)
  await writeWindsurfBundle(outputRoot, {
    agentSkills: [],
    commandWorkflows: bundle.commandWorkflows,
    skillDirs: [],
    mcpConfig: null,
  }, scope)
}

export async function syncQwenCommands(
  config: ClaudeHomeConfig,
  outputRoot: string,
): Promise<void> {
  if (!hasCommands(config)) return

  const plugin = buildClaudeHomePlugin(config)
  const bundle = convertClaudeToQwen(plugin, DEFAULT_QWEN_SYNC_OPTIONS)

  for (const commandFile of bundle.commandFiles) {
    const parts = commandFile.name.split(":")
    if (parts.length > 1) {
      const nestedDir = path.join(outputRoot, "commands", ...parts.slice(0, -1))
      await writeText(path.join(nestedDir, `${parts[parts.length - 1]}.md`), commandFile.content + "\n")
      continue
    }

    await writeText(path.join(outputRoot, "commands", `${commandFile.name}.md`), commandFile.content + "\n")
  }
}

export function warnUnsupportedOpenClawCommands(config: ClaudeHomeConfig): void {
  if (!hasCommands(config)) return

  console.warn(
    "Warning: OpenClaw personal command sync is skipped because this sync target currently has no documented user-level command surface.",
  )
}
