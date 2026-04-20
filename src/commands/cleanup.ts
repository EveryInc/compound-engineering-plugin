import { defineCommand } from "citty"
import os from "os"
import path from "path"
import { fileURLToPath } from "url"
import { loadClaudePlugin } from "../parsers/claude"
import { convertClaudeToCodex } from "../converters/claude-to-codex"
import { convertClaudeToCopilot } from "../converters/claude-to-copilot"
import { convertClaudeToDroid } from "../converters/claude-to-droid"
import { convertClaudeToGemini } from "../converters/claude-to-gemini"
import { convertClaudeToKiro } from "../converters/claude-to-kiro"
import { convertClaudeToOpenCode } from "../converters/claude-to-opencode"
import { convertClaudeToPi } from "../converters/claude-to-pi"
import {
  getLegacyCodexArtifacts,
  getLegacyCopilotArtifacts,
  getLegacyDroidArtifacts,
  getLegacyGeminiArtifacts,
  getLegacyKiroArtifacts,
  getLegacyOpenCodeArtifacts,
  getLegacyPiArtifacts,
  getLegacyPluginArtifacts,
  getLegacyWindsurfArtifacts,
} from "../data/plugin-legacy-artifacts"
import { moveLegacyArtifactToBackup } from "../targets/managed-artifacts"
import { pathExists, readJson, sanitizePathName } from "../utils/files"
import { expandHome, resolveTargetHome } from "../utils/resolve-home"

const cleanupTargets = ["codex", "opencode", "pi", "gemini", "kiro", "copilot", "droid", "qwen", "windsurf"] as const
type CleanupTarget = typeof cleanupTargets[number]

type CleanupResult = {
  target: CleanupTarget
  root: string
  moved: number
}

export default defineCommand({
  meta: {
    name: "cleanup",
    description: "Back up stale compound-engineering artifacts from previous installs",
  },
  args: {
    plugin: {
      type: "positional",
      required: false,
      description: "Plugin name or local plugin path (default: compound-engineering)",
    },
    target: {
      type: "string",
      default: "all",
      description: "Target to clean: codex | opencode | pi | gemini | kiro | copilot | droid | qwen | windsurf | all",
    },
    output: {
      type: "string",
      alias: "o",
      description: "Workspace/project root for workspace-scoped legacy installs",
    },
    codexHome: {
      type: "string",
      alias: "codex-home",
      description: "Codex root to clean (default: ~/.codex)",
    },
    piHome: {
      type: "string",
      alias: "pi-home",
      description: "Pi root to clean (default: ~/.pi/agent)",
    },
    opencodeHome: {
      type: "string",
      alias: "opencode-home",
      description: "OpenCode root to clean (default: ~/.config/opencode)",
    },
    geminiHome: {
      type: "string",
      alias: "gemini-home",
      description: "Gemini root to clean (default: ~/.gemini)",
    },
    kiroHome: {
      type: "string",
      alias: "kiro-home",
      description: "Kiro root to clean (default: ./.kiro)",
    },
    copilotHome: {
      type: "string",
      alias: "copilot-home",
      description: "Copilot root to clean (default: ~/.copilot)",
    },
    droidHome: {
      type: "string",
      alias: "droid-home",
      description: "Droid root to clean (default: ~/.factory)",
    },
    qwenHome: {
      type: "string",
      alias: "qwen-home",
      description: "Qwen root to clean for legacy Bun installs (default: ~/.qwen)",
    },
    windsurfHome: {
      type: "string",
      alias: "windsurf-home",
      description: "Deprecated Windsurf root to clean (default: ~/.codeium/windsurf)",
    },
    agentsHome: {
      type: "string",
      alias: "agents-home",
      description: "Shared .agents root to clean for shadowing skills (default: ~/.agents)",
    },
  },
  async run({ args }) {
    const pluginPath = await resolveCleanupPluginPath(args.plugin ? String(args.plugin) : "compound-engineering")
    const plugin = await loadClaudePlugin(pluginPath)
    if (plugin.manifest.name !== "compound-engineering") {
      throw new Error("Cleanup currently supports only the compound-engineering plugin.")
    }
    const targetNames = resolveCleanupTargets(String(args.target))
    const outputRoot = resolveWorkspaceRoot(args.output)
    const roots = {
      codexHome: resolveTargetHome(args.codexHome, path.join(os.homedir(), ".codex")),
      piHome: resolveTargetHome(args.piHome, path.join(os.homedir(), ".pi", "agent")),
      opencodeHome: resolveTargetHome(args.opencodeHome, path.join(os.homedir(), ".config", "opencode")),
      geminiHome: resolveTargetHome(args.geminiHome, path.join(os.homedir(), ".gemini")),
      kiroHome: resolveTargetHome(args.kiroHome, path.join(outputRoot, ".kiro")),
      copilotHome: resolveTargetHome(args.copilotHome, path.join(os.homedir(), ".copilot")),
      droidHome: resolveTargetHome(args.droidHome, path.join(os.homedir(), ".factory")),
      qwenHome: resolveTargetHome(args.qwenHome, path.join(os.homedir(), ".qwen")),
      windsurfHome: resolveTargetHome(args.windsurfHome, path.join(os.homedir(), ".codeium", "windsurf")),
      agentsHome: resolveTargetHome(args.agentsHome, path.join(os.homedir(), ".agents")),
      workspaceRoot: outputRoot,
      hasExplicitOutput: Boolean(args.output && String(args.output).trim()),
    }

    const results: CleanupResult[] = []
    for (const target of targetNames) {
      results.push(...await cleanupTarget(target, plugin, roots))
    }

    const total = results.reduce((sum, result) => sum + result.moved, 0)
    for (const result of results) {
      console.log(`Cleaned ${result.target} at ${result.root}: backed up ${result.moved} artifact(s)`)
    }
    console.log(`Cleanup complete for ${plugin.manifest.name}: backed up ${total} artifact(s).`)
  },
})

async function cleanupTarget(
  target: CleanupTarget,
  plugin: Awaited<ReturnType<typeof loadClaudePlugin>>,
  roots: {
    codexHome: string
    piHome: string
    opencodeHome: string
    geminiHome: string
    kiroHome: string
    copilotHome: string
    droidHome: string
    qwenHome: string
    windsurfHome: string
    agentsHome: string
    workspaceRoot: string
    hasExplicitOutput: boolean
  },
): Promise<CleanupResult[]> {
  switch (target) {
    case "codex":
      return [
        await cleanupCodex(plugin, roots.codexHome),
        await cleanupCodexSharedAgents(plugin, roots.agentsHome),
      ]
    case "opencode":
      return [await cleanupOpenCode(plugin, roots.opencodeHome)]
    case "pi":
      return [await cleanupPi(plugin, roots.piHome)]
    case "gemini":
      return [await cleanupGemini(plugin, roots.geminiHome)]
    case "kiro":
      return [await cleanupKiro(plugin, roots.kiroHome)]
    case "copilot": {
      const rootsToClean = roots.hasExplicitOutput
        ? [resolveCopilotWorkspaceRoot(roots.workspaceRoot)]
        : [roots.copilotHome, resolveCopilotWorkspaceRoot(roots.workspaceRoot), roots.agentsHome]
      return await Promise.all(rootsToClean.map((root) => cleanupCopilot(plugin, root)))
    }
    case "droid":
      return [await cleanupDroid(plugin, roots.hasExplicitOutput ? resolveDroidWorkspaceRoot(roots.workspaceRoot) : roots.droidHome)]
    case "qwen":
      return [await cleanupQwen(plugin, roots.qwenHome)]
    case "windsurf": {
      const rootsToClean = roots.hasExplicitOutput
        ? [resolveWindsurfWorkspaceRoot(roots.workspaceRoot)]
        : [roots.windsurfHome, resolveWindsurfWorkspaceRoot(roots.workspaceRoot)]
      return await Promise.all(rootsToClean.map((root) => cleanupWindsurf(plugin, root)))
    }
  }
}

async function cleanupCodex(plugin: Awaited<ReturnType<typeof loadClaudePlugin>>, codexRoot: string): Promise<CleanupResult> {
  const bundle = convertClaudeToCodex(plugin, {
    agentMode: "subagent",
    inferTemperature: true,
    permissions: "none",
  })
  const artifacts = getLegacyCodexArtifacts(bundle)
  const currentNamespacedSkills = new Set([
    ...bundle.skillDirs.map((skill) => sanitizePathName(skill.name)),
    ...bundle.generatedSkills.map((skill) => sanitizePathName(skill.name)),
  ])
  const managedDir = path.join(codexRoot, plugin.manifest.name)
  let moved = 0
  for (const skillName of artifacts.skills) {
    moved += await moveIfExists(managedDir, "skills", path.join(codexRoot, "skills"), skillName, "Codex")
    if (!currentNamespacedSkills.has(skillName)) {
      moved += await moveIfExists(
        managedDir,
        "skills",
        path.join(codexRoot, "skills", plugin.manifest.name),
        skillName,
        "Codex",
      )
    }
  }
  for (const promptFile of artifacts.prompts) {
    moved += await moveIfExists(managedDir, "prompts", path.join(codexRoot, "prompts"), promptFile, "Codex")
  }
  return { target: "codex", root: codexRoot, moved }
}

async function cleanupCodexSharedAgents(plugin: Awaited<ReturnType<typeof loadClaudePlugin>>, agentsRoot: string): Promise<CleanupResult> {
  const bundle = convertClaudeToCodex(plugin, {
    agentMode: "subagent",
    inferTemperature: true,
    permissions: "none",
  })
  const artifacts = getLegacyCodexArtifacts(bundle)
  const managedDir = path.join(agentsRoot, "compound-engineering")
  let moved = 0
  for (const skillName of artifacts.skills) {
    moved += await moveIfExists(managedDir, "skills", path.join(agentsRoot, "skills"), skillName, ".agents")
  }
  return { target: "codex", root: agentsRoot, moved }
}

async function cleanupOpenCode(plugin: Awaited<ReturnType<typeof loadClaudePlugin>>, opencodeRoot: string): Promise<CleanupResult> {
  const bundle = convertClaudeToOpenCode(plugin, {
    agentMode: "subagent",
    inferTemperature: true,
    permissions: "none",
  })
  const artifacts = getLegacyOpenCodeArtifacts(bundle)
  const managedDir = path.join(opencodeRoot, "compound-engineering")
  let moved = 0
  for (const skillName of artifacts.skills) {
    moved += await moveIfExists(managedDir, "skills", path.join(opencodeRoot, "skills"), skillName, "OpenCode")
  }
  for (const agentPath of artifacts.agents) {
    moved += await moveIfExists(managedDir, "agents", path.join(opencodeRoot, "agents"), agentPath, "OpenCode")
  }
  for (const commandPath of artifacts.commands) {
    moved += await moveIfExists(managedDir, "commands", path.join(opencodeRoot, "commands"), commandPath, "OpenCode")
  }
  return { target: "opencode", root: opencodeRoot, moved }
}

async function cleanupPi(plugin: Awaited<ReturnType<typeof loadClaudePlugin>>, piRoot: string): Promise<CleanupResult> {
  const bundle = convertClaudeToPi(plugin, {
    agentMode: "subagent",
    inferTemperature: true,
    permissions: "none",
  })
  const artifacts = getLegacyPiArtifacts(bundle)
  const managedDir = path.join(piRoot, "compound-engineering")
  let moved = 0
  for (const skillName of artifacts.skills) {
    moved += await moveIfExists(managedDir, "skills", path.join(piRoot, "skills"), skillName, "Pi")
  }
  for (const promptFile of artifacts.prompts) {
    moved += await moveIfExists(managedDir, "prompts", path.join(piRoot, "prompts"), promptFile, "Pi")
  }
  return { target: "pi", root: piRoot, moved }
}

async function cleanupGemini(plugin: Awaited<ReturnType<typeof loadClaudePlugin>>, geminiRoot: string): Promise<CleanupResult> {
  const bundle = convertClaudeToGemini(plugin, {
    agentMode: "subagent",
    inferTemperature: true,
    permissions: "none",
  })
  const artifacts = getLegacyGeminiArtifacts(bundle)
  const managedDir = path.join(geminiRoot, "compound-engineering")
  let moved = 0
  for (const skillName of artifacts.skills) {
    moved += await moveIfExists(managedDir, "skills", path.join(geminiRoot, "skills"), skillName, "Gemini")
  }
  for (const agentPath of artifacts.agents) {
    moved += await moveIfExists(managedDir, "agents", path.join(geminiRoot, "agents"), agentPath, "Gemini")
  }
  for (const commandPath of artifacts.commands) {
    moved += await moveIfExists(managedDir, "commands", path.join(geminiRoot, "commands"), commandPath, "Gemini")
  }
  return { target: "gemini", root: geminiRoot, moved }
}

async function cleanupKiro(plugin: Awaited<ReturnType<typeof loadClaudePlugin>>, kiroRoot: string): Promise<CleanupResult> {
  const bundle = convertClaudeToKiro(plugin, {
    agentMode: "subagent",
    inferTemperature: true,
    permissions: "none",
  })
  const artifacts = getLegacyKiroArtifacts(bundle)
  const skillNames = new Set([
    ...artifacts.skills,
    ...bundle.skillDirs.map((skill) => sanitizePathName(skill.name)),
    ...bundle.generatedSkills.map((skill) => sanitizePathName(skill.name)),
  ])
  const agentNames = new Set([
    ...artifacts.agents,
    ...bundle.agents.map((agent) => sanitizePathName(agent.name)),
  ])
  const managedDir = path.join(kiroRoot, "compound-engineering")
  let moved = 0
  for (const skillName of skillNames) {
    moved += await moveIfExists(managedDir, "skills", path.join(kiroRoot, "skills"), skillName, "Kiro")
  }
  for (const agentName of agentNames) {
    moved += await moveIfExists(managedDir, "agents", path.join(kiroRoot, "agents"), `${agentName}.json`, "Kiro")
    moved += await moveIfExists(managedDir, "agents", path.join(kiroRoot, "agents", "prompts"), `${agentName}.md`, "Kiro")
  }
  return { target: "kiro", root: kiroRoot, moved }
}

async function cleanupCopilot(plugin: Awaited<ReturnType<typeof loadClaudePlugin>>, copilotRoot: string): Promise<CleanupResult> {
  const bundle = convertClaudeToCopilot(plugin, {
    agentMode: "subagent",
    inferTemperature: true,
    permissions: "none",
  })
  const artifacts = getLegacyCopilotArtifacts(bundle)
  const skillNames = new Set([
    ...artifacts.skills,
    ...bundle.skillDirs.map((skill) => sanitizePathName(skill.name)),
    ...bundle.generatedSkills.map((skill) => sanitizePathName(skill.name)),
  ])
  const agentPaths = new Set([
    ...artifacts.agents,
    ...bundle.agents.map((agent) => `${sanitizePathName(agent.name)}.agent.md`),
  ])
  const managedDir = path.join(copilotRoot, "compound-engineering")
  let moved = 0
  for (const skillName of skillNames) {
    moved += await moveIfExists(managedDir, "skills", path.join(copilotRoot, "skills"), skillName, "Copilot")
  }
  for (const agentPath of agentPaths) {
    moved += await moveIfExists(managedDir, "agents", path.join(copilotRoot, "agents"), agentPath, "Copilot")
  }
  return { target: "copilot", root: copilotRoot, moved }
}

async function cleanupDroid(plugin: Awaited<ReturnType<typeof loadClaudePlugin>>, droidRoot: string): Promise<CleanupResult> {
  const bundle = convertClaudeToDroid(plugin, {
    agentMode: "subagent",
    inferTemperature: true,
    permissions: "none",
  })
  const artifacts = getLegacyDroidArtifacts(bundle)
  const skillNames = new Set([
    ...artifacts.skills,
    ...bundle.skillDirs.map((skill) => sanitizePathName(skill.name)),
  ])
  const droidPaths = new Set([
    ...artifacts.droids,
    ...bundle.droids.map((droid) => `${sanitizePathName(droid.name)}.md`),
  ])
  const commandPaths = new Set([
    ...artifacts.commands,
    ...bundle.commands.map((command) => `${sanitizePathName(command.name)}.md`),
  ])
  const managedDir = path.join(droidRoot, "compound-engineering")
  let moved = 0
  for (const skillName of skillNames) {
    moved += await moveIfExists(managedDir, "skills", path.join(droidRoot, "skills"), skillName, "Droid")
  }
  for (const droidPath of droidPaths) {
    moved += await moveIfExists(managedDir, "droids", path.join(droidRoot, "droids"), droidPath, "Droid")
  }
  for (const commandPath of commandPaths) {
    moved += await moveIfExists(managedDir, "commands", path.join(droidRoot, "commands"), commandPath, "Droid")
  }
  return { target: "droid", root: droidRoot, moved }
}

async function cleanupQwen(plugin: Awaited<ReturnType<typeof loadClaudePlugin>>, qwenRoot: string): Promise<CleanupResult> {
  const managedDir = path.join(qwenRoot, plugin.manifest.name)
  const extras = getLegacyPluginArtifacts(plugin.manifest.name)
  const skillNames = new Set([
    ...plugin.skills.map((skill) => sanitizePathName(skill.name)),
    ...(extras.skills ?? []).map(sanitizePathName),
  ])
  const agentNames = new Set([
    ...plugin.agents.map((agent) => sanitizePathName(agent.name)),
    ...(extras.agents ?? []).map(sanitizePathName),
  ])
  // The old Bun-based Qwen writer wrote commands via `resolveCommandPath`,
  // which split colon-namespaced names into nested directories (e.g.
  // `compound:plan` -> `commands/compound/plan.md`). We also probe the flat
  // sanitized form (`commands/compound-plan.md`) in case a historical install
  // landed commands there. Both shapes need cleanup so stale files can't
  // shadow native plugin commands after migration.
  const commandPaths = new Set<string>()
  for (const command of plugin.commands) {
    commandPaths.add(`${sanitizePathName(command.name)}.md`)
    if (command.name.includes(":")) {
      commandPaths.add(`${command.name.split(":").join("/")}.md`)
    }
  }
  for (const name of extras.commands ?? []) {
    commandPaths.add(`${sanitizePathName(name)}.md`)
    if (name.includes(":")) {
      commandPaths.add(`${name.split(":").join("/")}.md`)
    }
  }

  let moved = 0

  if (await isLegacyQwenExtensionInstall(qwenRoot, plugin.manifest.name)) {
    moved += await moveIfExists(
      managedDir,
      "extensions",
      path.join(qwenRoot, "extensions"),
      plugin.manifest.name,
      "Qwen",
    )
  }

  for (const skillName of skillNames) {
    moved += await moveIfExists(managedDir, "skills", path.join(qwenRoot, "skills"), skillName, "Qwen")
  }
  for (const agentName of agentNames) {
    moved += await moveIfExists(managedDir, "agents", path.join(qwenRoot, "agents"), `${agentName}.yaml`, "Qwen")
    moved += await moveIfExists(managedDir, "agents", path.join(qwenRoot, "agents"), `${agentName}.md`, "Qwen")
  }
  for (const commandPath of commandPaths) {
    moved += await moveIfExists(managedDir, "commands", path.join(qwenRoot, "commands"), commandPath, "Qwen")
  }

  return { target: "qwen", root: qwenRoot, moved }
}

async function isLegacyQwenExtensionInstall(qwenRoot: string, pluginName: string): Promise<boolean> {
  const configPath = path.join(qwenRoot, "extensions", pluginName, "qwen-extension.json")
  if (!(await pathExists(configPath))) return false
  try {
    const config = await readJson<Record<string, unknown>>(configPath)
    return "_compound_managed_mcp" in config || "_compound_managed_keys" in config
  } catch {
    return false
  }
}

async function cleanupWindsurf(plugin: Awaited<ReturnType<typeof loadClaudePlugin>>, windsurfRoot: string): Promise<CleanupResult> {
  const artifacts = getLegacyWindsurfArtifacts(plugin)
  const managedDir = path.join(windsurfRoot, "compound-engineering")
  let moved = 0
  for (const skillName of artifacts.skills) {
    moved += await moveIfExists(managedDir, "skills", path.join(windsurfRoot, "skills"), skillName, "Windsurf")
  }
  for (const workflowPath of artifacts.workflows) {
    moved += await moveIfExists(managedDir, "global_workflows", path.join(windsurfRoot, "global_workflows"), workflowPath, "Windsurf")
    moved += await moveIfExists(managedDir, "workflows", path.join(windsurfRoot, "workflows"), workflowPath, "Windsurf")
  }
  return { target: "windsurf", root: windsurfRoot, moved }
}

async function moveIfExists(
  managedDir: string,
  kind: string,
  artifactRoot: string,
  relativePath: string,
  label: string,
): Promise<number> {
  const artifactPath = path.join(artifactRoot, ...relativePath.split("/"))
  if (!(await pathExists(artifactPath))) return 0
  await moveLegacyArtifactToBackup(managedDir, kind, artifactRoot, relativePath, label)
  return 1
}

function resolveCleanupTargets(targetArg: string): CleanupTarget[] {
  if (targetArg === "all") return [...cleanupTargets]
  const targets = targetArg.split(",").map((entry) => entry.trim()).filter(Boolean)
  for (const target of targets) {
    if (!cleanupTargets.includes(target as CleanupTarget)) {
      throw new Error(`Unknown cleanup target: ${target}. Use one of: ${cleanupTargets.join(", ")}, all`)
    }
  }
  return targets as CleanupTarget[]
}

async function resolveCleanupPluginPath(input: string): Promise<string> {
  if (input.startsWith(".") || input.startsWith("/") || input.startsWith("~")) {
    const expanded = expandHome(input)
    const directPath = path.resolve(expanded)
    if (await pathExists(directPath)) return directPath
    throw new Error(`Local plugin path not found: ${directPath}`)
  }

  const bundledRoot = fileURLToPath(new URL("../../plugins/", import.meta.url))
  const pluginPath = path.join(bundledRoot, input)
  const manifestPath = path.join(pluginPath, ".claude-plugin", "plugin.json")
  if (await pathExists(manifestPath)) return pluginPath

  throw new Error(`Unknown bundled plugin: ${input}`)
}

function resolveWorkspaceRoot(value: unknown): string {
  if (value && String(value).trim()) {
    return path.resolve(expandHome(String(value).trim()))
  }
  return process.cwd()
}

function resolveCopilotWorkspaceRoot(outputRoot: string): string {
  return path.basename(outputRoot) === ".github" ? outputRoot : path.join(outputRoot, ".github")
}

function resolveDroidWorkspaceRoot(outputRoot: string): string {
  return path.basename(outputRoot) === ".factory" ? outputRoot : path.join(outputRoot, ".factory")
}

function resolveWindsurfWorkspaceRoot(outputRoot: string): string {
  return path.basename(outputRoot) === ".windsurf" ? outputRoot : path.join(outputRoot, ".windsurf")
}
