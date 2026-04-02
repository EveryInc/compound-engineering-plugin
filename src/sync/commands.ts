import path from "path"
import type { ClaudeHomeConfig } from "../parsers/claude-home"
import type { ClaudePlugin } from "../types/claude"
import { backupFile, pathExists, readJson, readText, removeFileIfExists, resolveCommandPath, sanitizePathName, writeJson, writeText, writeTextIfChanged } from "../utils/files"
import { collectPiSameRunDependencies } from "../utils/pi-skills"
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
import type { PiBundle, PiManagedArtifact, PiManagedManifest } from "../types/pi"
import { resolvePiLayout } from "../utils/pi-layout"
import { createManagedArtifact } from "../utils/pi-managed"
import { classifyUnsupportedPiSyncStatus, isUnsupportedPiSyncArtifactError } from "./pi-artifact-status"

type WindsurfSyncScope = "global" | "workspace"

export type PiSyncArtifactStatus = "published" | "retryable" | "blocked-by-policy" | "unsupported-final"

export type SyncPiCommandResult = {
  sourceName: string
  emittedName: string
  status: PiSyncArtifactStatus
  artifact?: PiManagedArtifact
  warning?: string
  sameRunDependencies?: {
    skills: string[]
    prompts: string[]
  }
}

let piSyncCommandConversionHookForTests: (() => void | Promise<void>) | null = null

export function setPiSyncCommandConversionHookForTests(hook: (() => void | Promise<void>) | null): void {
  piSyncCommandConversionHookForTests = hook
}

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
  extraNameMaps?: PiManagedManifest["nameMaps"],
  hooks?: {
    onBeforeMutate?: (targetPath: string) => void | Promise<void>
  },
): Promise<SyncPiCommandResult[]> {
  const layout = resolvePiLayout(outputRoot, "sync")
  let syncPrompts: SyncPiCommandResult[] = []
  const commands = [...(config.commands ?? [])].filter((entry) => !entry.disableModelInvocation).sort((a, b) => a.name.localeCompare(b.name))

  if (commands.length > 0) {
    try {
      const bundle = await convertPiSyncCommandBundle({ ...config, commands }, extraNameMaps)
      const promptsBySourceName = new Map(bundle.prompts.map((prompt) => [prompt.sourceName ?? prompt.name, prompt]))

      for (const command of commands) {
        const prompt = promptsBySourceName.get(command.name)
        if (!prompt) continue
        const targetPath = path.join(layout.promptsDir, `${prompt.name}.md`)
        const nextContent = prompt.content + "\n"
        const existing = await readText(targetPath).catch(() => null)
        if (existing !== nextContent) {
          await hooks?.onBeforeMutate?.(targetPath)
        }
        await writeTextIfChanged(targetPath, nextContent, { existingContent: existing })
        syncPrompts.push({
          sourceName: prompt.sourceName ?? prompt.name,
          emittedName: prompt.name,
          status: "published",
          artifact: createManagedArtifact(layout, "prompt", prompt.sourceName ?? prompt.name, prompt.name),
          sameRunDependencies: collectPiSameRunDependencies(command.body),
        })
      }

      return syncPrompts
    } catch (error) {
      if (!isUnsupportedPiSyncArtifactError(error)) {
        throw error
      }
    }

    for (const command of commands) {
      let bundle: PiBundle
      try {
        bundle = await convertPiSyncCommandBundle({ ...config, commands: [command] }, extraNameMaps)
      } catch (error) {
        if (!isUnsupportedPiSyncArtifactError(error)) {
          throw error
        }
        syncPrompts.push({
          sourceName: command.name,
          emittedName: sanitizePathName(command.name),
          status: classifyUnsupportedPiSyncStatus(error.message),
          warning: `Skipping unsupported Pi sync command ${command.name}: ${error.message}`,
        })
        continue
      }

      for (const prompt of bundle.prompts) {
        const targetPath = path.join(layout.promptsDir, `${prompt.name}.md`)
        const nextContent = prompt.content + "\n"
        const existing = await readText(targetPath).catch(() => null)
        if (existing !== nextContent) {
          await hooks?.onBeforeMutate?.(targetPath)
        }
        await writeTextIfChanged(targetPath, nextContent, { existingContent: existing })
        syncPrompts.push({
          sourceName: prompt.sourceName ?? prompt.name,
          emittedName: prompt.name,
          status: "published",
          artifact: createManagedArtifact(layout, "prompt", prompt.sourceName ?? prompt.name, prompt.name),
          sameRunDependencies: collectPiSameRunDependencies(command.body),
        })
      }
    }
  }

  return syncPrompts
}

async function convertPiSyncCommandBundle(
  config: ClaudeHomeConfig,
  extraNameMaps?: PiManagedManifest["nameMaps"],
): Promise<PiBundle> {
  await piSyncCommandConversionHookForTests?.()
  return convertClaudeToPi(buildClaudeHomePlugin({ ...config, skills: [] }), {
    ...DEFAULT_SYNC_OPTIONS,
    extraNameMaps,
    preserveUnknownQualifiedRefs: true,
    rejectUnknownQualifiedTaskRefs: true,
    rejectUnresolvedFirstPartyQualifiedRefs: true,
  })
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
