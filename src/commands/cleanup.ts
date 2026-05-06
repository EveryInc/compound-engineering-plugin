import { defineCommand } from "citty"
import fs from "fs/promises"
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
import { isManagedCodexAgentsSymlink, readCodexInstallManifest, resolveCodexManagedRoots } from "../targets/codex"
import { classifyCodexLegacyPromptOwnership } from "../utils/legacy-cleanup"
import { isSafeManagedPath, pathExists, readJson, sanitizePathName } from "../utils/files"
import { resolveOpenCodeGlobalRoot } from "../utils/opencode-config"
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
      description: "OpenCode root to clean (default: $OPENCODE_CONFIG_DIR or ~/.config/opencode)",
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
    const hasExplicitGeminiHome = hasExplicitValue(args.geminiHome)
    const hasExplicitOpenCodeHome = hasExplicitValue(args.opencodeHome)
    const roots = {
      codexHome: resolveTargetHome(args.codexHome, path.join(os.homedir(), ".codex")),
      piHome: resolveTargetHome(args.piHome, path.join(os.homedir(), ".pi", "agent")),
      // Mirror install: respect OPENCODE_CONFIG_DIR before falling back to the
      // XDG default so cleanup scans the same directory install wrote to.
      opencodeHome: resolveTargetHome(args.opencodeHome, resolveOpenCodeGlobalRoot()),
      geminiHome: resolveTargetHome(args.geminiHome, path.join(os.homedir(), ".gemini")),
      kiroHome: resolveTargetHome(args.kiroHome, path.join(outputRoot, ".kiro")),
      copilotHome: resolveTargetHome(args.copilotHome, path.join(os.homedir(), ".copilot")),
      droidHome: resolveTargetHome(args.droidHome, path.join(os.homedir(), ".factory")),
      qwenHome: resolveTargetHome(args.qwenHome, path.join(os.homedir(), ".qwen")),
      windsurfHome: resolveTargetHome(args.windsurfHome, path.join(os.homedir(), ".codeium", "windsurf")),
      agentsHome: resolveTargetHome(args.agentsHome, path.join(os.homedir(), ".agents")),
      workspaceRoot: outputRoot,
      hasExplicitOutput: hasExplicitValue(args.output),
      hasExplicitGeminiHome,
      hasExplicitOpenCodeHome,
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
    hasExplicitGeminiHome: boolean
    hasExplicitOpenCodeHome: boolean
  },
): Promise<CleanupResult[]> {
  switch (target) {
    case "codex":
      return [
        await cleanupCodex(plugin, roots.codexHome),
        await cleanupCodexSharedAgents(plugin, roots.agentsHome, roots.codexHome),
      ]
    case "opencode": {
      // Mirror install: when `--output <workspace>` is passed (without an
      // explicit `--opencode-home`), install writes managed artifacts under
      // `<workspace>/.opencode/{agents,skills,commands,plugins}`. Cleanup must
      // scan the same directory or stale workspace artifacts get left behind.
      // An explicit `--opencode-home` remains authoritative so users can still
      // target a specific global-style root. When neither is set, fall back to
      // the OpenCode global root (OPENCODE_CONFIG_DIR / XDG default).
      if (roots.hasExplicitOpenCodeHome) {
        return [await cleanupOpenCode(plugin, roots.opencodeHome)]
      }
      if (roots.hasExplicitOutput) {
        return [await cleanupOpenCode(plugin, resolveOpenCodeWorkspaceRoot(roots.workspaceRoot))]
      }
      return [await cleanupOpenCode(plugin, roots.opencodeHome)]
    }
    case "pi":
      return [await cleanupPi(plugin, roots.piHome)]
    case "gemini": {
      // `install`/`convert` write Gemini output to `<cwd>/.gemini` by default
      // (see `resolveTargetOutputRoot`), so cleanup must scan the workspace
      // root in the same default flow. When neither `--gemini-home` nor
      // `--output` is set, also scan `~/.gemini` as a safety net for users
      // who installed to the home-scoped location with an older CLI.
      if (roots.hasExplicitGeminiHome) {
        return [await cleanupGemini(plugin, roots.geminiHome)]
      }
      const workspaceGemini = resolveGeminiWorkspaceRoot(roots.workspaceRoot)
      if (roots.hasExplicitOutput) {
        return [await cleanupGemini(plugin, workspaceGemini)]
      }
      // Deduplicate before launching parallel cleanups: when cwd === $HOME,
      // `<cwd>/.gemini` and `~/.gemini` resolve to the same directory and two
      // concurrent passes would race on renames into legacy-backup, producing
      // intermittent ENOENT failures. `process.cwd()` and `os.homedir()` are
      // already absolute, and `path.join` (inside `resolveGeminiWorkspaceRoot`
      // and `resolveTargetHome`) normalizes the result, so string equality on
      // the post-resolve paths is sufficient.
      const rootsToClean = await dedupeRoots([workspaceGemini, roots.geminiHome])
      return await Promise.all(rootsToClean.map((root) => cleanupGemini(plugin, root)))
    }
    case "kiro":
      return [await cleanupKiro(plugin, roots.kiroHome)]
    case "copilot": {
      // Same race-prevention as Gemini: if a user points `--copilot-home`,
      // `--output`, or `--agents-home` at the same directory these parallel
      // passes collide on renames. Default values are distinct so the dedup
      // is mostly defensive, but keep the shape consistent across targets
      // that fan out with `Promise.all`.
      const rootsToClean = roots.hasExplicitOutput
        ? [resolveCopilotWorkspaceRoot(roots.workspaceRoot)]
        : await dedupeRoots([roots.copilotHome, resolveCopilotWorkspaceRoot(roots.workspaceRoot), roots.agentsHome])
      return await Promise.all(rootsToClean.map((root) => cleanupCopilot(plugin, root)))
    }
    case "droid":
      return [await cleanupDroid(plugin, roots.hasExplicitOutput ? resolveDroidWorkspaceRoot(roots.workspaceRoot) : roots.droidHome)]
    case "qwen":
      return [await cleanupQwen(plugin, roots.qwenHome)]
    case "windsurf": {
      // Same race-prevention as Gemini/Copilot: dedup after path resolution
      // so overlapping overrides can't produce concurrent renames on the
      // same directory.
      const rootsToClean = roots.hasExplicitOutput
        ? [resolveWindsurfWorkspaceRoot(roots.workspaceRoot)]
        : await dedupeRoots([roots.windsurfHome, resolveWindsurfWorkspaceRoot(roots.workspaceRoot)])
      return await Promise.all(rootsToClean.map((root) => cleanupWindsurf(plugin, root)))
    }
  }
}

async function cleanupCodex(plugin: Awaited<ReturnType<typeof loadClaudePlugin>>, codexRoot: string): Promise<CleanupResult> {
  const bundle = convertClaudeToCodex(plugin, {
    agentMode: "subagent",
    inferTemperature: true,
    permissions: "none",
    // Cleanup needs the FULL bundle (skills, command-skills, agents) to know
    // what's "current" vs "legacy." The agents-only default of `--to codex`
    // is wrong here; it would make cleanup think every existing skill is
    // legacy and remove them.
    codexIncludeSkills: true,
  })
  const artifacts = getLegacyCodexArtifacts(bundle)
  const currentNamespacedSkills = new Set([
    ...bundle.skillDirs.map((skill) => sanitizePathName(skill.name)),
    ...bundle.generatedSkills.map((skill) => sanitizePathName(skill.name)),
  ])
  const currentPrompts = new Set(bundle.prompts.map((prompt) => `${sanitizePathName(prompt.name)}.md`))
  const currentAgents = new Set((bundle.agents ?? []).map((agent) => `${sanitizePathName(agent.name)}.toml`))
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
    // Ownership gate: `~/.codex/prompts/` is a shared directory across plugins
    // and user-authored prompts. A filename match against the historical CE
    // allow-list is not a strong enough signal — a user who creates
    // `~/.codex/prompts/ce-plan.md` for their own workflow would otherwise see
    // it swept into `compound-engineering/legacy-backup/` on every cleanup run.
    // Mirror the body + frontmatter check used by `cleanupStalePrompts` so
    // install-time and standalone cleanup paths treat ownership identically.
    // "unknown" (no fingerprint on record) falls through so fully-retired
    // historical wrappers still get cleaned up. Manifest-driven migration
    // below is already safe because it only touches files CE recorded writing.
    const promptPath = path.join(codexRoot, "prompts", promptFile)
    const ownership = await classifyCodexLegacyPromptOwnership(promptPath)
    if (ownership === "foreign") continue
    moved += await moveIfExists(managedDir, "prompts", path.join(codexRoot, "prompts"), promptFile, "Codex")
  }

  // Manifest-driven migration: read the previous install's manifest and
  // migrate any entries that are no longer in the current bundle. This
  // catches artifacts whose *type or emission format* has changed between
  // CE versions (e.g., agents that were previously emitted as generated
  // skills under `skills/<plugin>/<agent-name>/` but are now emitted as
  // TOML custom agents under `agents/<plugin>/<name>.toml`). The historical
  // allow-list only covers renamed/removed names — it does not cover
  // current-named artifacts that moved locations.
  const installedManifest = await readCodexInstallManifest(codexRoot, plugin.manifest.name)
  if (installedManifest) {
    for (const skillName of installedManifest.skills) {
      if (currentNamespacedSkills.has(skillName)) continue
      moved += await moveIfExists(
        managedDir,
        "skills",
        path.join(codexRoot, "skills", plugin.manifest.name),
        skillName,
        "Codex",
      )
    }
    for (const promptFile of installedManifest.prompts) {
      if (currentPrompts.has(promptFile)) continue
      moved += await moveIfExists(managedDir, "prompts", path.join(codexRoot, "prompts"), promptFile, "Codex")
    }
    for (const agentFile of installedManifest.agents) {
      if (currentAgents.has(agentFile)) continue
      moved += await moveIfExists(
        managedDir,
        "agents",
        path.join(codexRoot, "agents", plugin.manifest.name),
        agentFile,
        "Codex",
      )
    }
  }

  return { target: "codex", root: codexRoot, moved }
}

async function cleanupCodexSharedAgents(
  plugin: Awaited<ReturnType<typeof loadClaudePlugin>>,
  agentsRoot: string,
  codexRoot: string,
): Promise<CleanupResult> {
  // Ownership check: `~/.agents/skills/` is a cross-plugin shared store, so a
  // name collision alone is not a strong enough signal to move an entry. CE
  // only ever emitted symlinks into this tree pointing at skill directories
  // inside its own Codex install root, so we restrict cleanup to symlinks
  // whose resolved target lives inside a CE-managed Codex root. Plain files
  // or directories at colliding names are user-authored by definition and
  // left alone; symlinks pointing elsewhere (another plugin, a user's own
  // skill checkout) are similarly skipped. Mirrors
  // `cleanupLegacyAgentsSkillSymlinks` in `src/targets/codex.ts`, which uses
  // the same ownership gate at install time.
  const bundle = convertClaudeToCodex(plugin, {
    agentMode: "subagent",
    inferTemperature: true,
    permissions: "none",
    // Same reason as cleanupCodex: cleanup needs the full bundle to make
    // current-vs-legacy decisions correctly.
    codexIncludeSkills: true,
  })
  const artifacts = getLegacyCodexArtifacts(bundle)
  const managedDir = path.join(agentsRoot, "compound-engineering")
  const agentsSkillsDir = path.join(agentsRoot, "skills")
  const managedRoots = await resolveCodexManagedRoots(codexRoot, plugin.manifest.name)
  let moved = 0
  for (const skillName of artifacts.skills) {
    moved += await moveIfSymlinkManaged(
      managedDir,
      "skills",
      agentsSkillsDir,
      skillName,
      ".agents",
      managedRoots,
    )
  }
  return { target: "codex", root: agentsRoot, moved }
}

async function moveIfSymlinkManaged(
  managedDir: string,
  kind: string,
  artifactRoot: string,
  relativePath: string,
  label: string,
  managedRoots: string[],
): Promise<number> {
  // Defense in depth — same guard as `moveIfExists`: even though legacy
  // allow-list names are safe by construction, re-check the join so a future
  // caller can't issue an out-of-tree rename via `moveLegacyArtifactToBackup`.
  if (!isSafeManagedPath(artifactRoot, relativePath)) return 0
  const artifactPath = path.join(artifactRoot, ...relativePath.split("/"))
  if (!(await isManagedCodexAgentsSymlink(artifactPath, managedRoots))) return 0
  await moveLegacyArtifactToBackup(managedDir, kind, artifactRoot, relativePath, label)
  return 1
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
  // IMPORTANT: legacy detection for Copilot roots must be driven exclusively
  // by the historical allow-list returned from `getLegacyCopilotArtifacts`
  // (see EXTRA_LEGACY_ARTIFACTS_BY_PLUGIN). Mirrors the Codex/Droid/Windsurf
  // cleanup fixes: seeding candidates from the current plugin bundle would
  // sweep up user-authored files at workspace paths like
  // `.github/skills/ce-plan/SKILL.md` or `.github/agents/<name>.agent.md` that
  // happen to share a name with a current CE artifact but were never
  // installed by this plugin. The Copilot writer has been removed — users now
  // install via `copilot plugin install` — so this cleanup exists solely to
  // back up stale files from past manual installs, which means the current
  // bundle was never a valid candidate source.
  const bundle = convertClaudeToCopilot(plugin, {
    agentMode: "subagent",
    inferTemperature: true,
    permissions: "none",
  })
  const artifacts = getLegacyCopilotArtifacts(bundle)
  const managedDir = path.join(copilotRoot, "compound-engineering")
  let moved = 0
  for (const skillName of artifacts.skills) {
    moved += await moveIfExists(managedDir, "skills", path.join(copilotRoot, "skills"), skillName, "Copilot")
  }
  for (const agentPath of artifacts.agents) {
    moved += await moveIfExists(managedDir, "agents", path.join(copilotRoot, "agents"), agentPath, "Copilot")
  }
  return { target: "copilot", root: copilotRoot, moved }
}

async function cleanupDroid(plugin: Awaited<ReturnType<typeof loadClaudePlugin>>, droidRoot: string): Promise<CleanupResult> {
  // IMPORTANT: legacy detection for `~/.factory/{skills,droids,commands}` must
  // be driven exclusively by the historical allow-list returned from
  // `getLegacyDroidArtifacts` (see EXTRA_LEGACY_ARTIFACTS_BY_PLUGIN). Mirrors
  // the Codex cleanup fix: seeding candidates from the current plugin bundle
  // would sweep up user-authored files at `~/.factory/commands/<name>.md`
  // (or the skills/droids equivalents) that happen to share a name with a
  // current CE artifact but were never installed by this plugin.
  const bundle = convertClaudeToDroid(plugin, {
    agentMode: "subagent",
    inferTemperature: true,
    permissions: "none",
  })
  const artifacts = getLegacyDroidArtifacts(bundle)
  const managedDir = path.join(droidRoot, "compound-engineering")
  let moved = 0
  for (const skillName of artifacts.skills) {
    moved += await moveIfExists(managedDir, "skills", path.join(droidRoot, "skills"), skillName, "Droid")
  }
  for (const droidPath of artifacts.droids) {
    moved += await moveIfExists(managedDir, "droids", path.join(droidRoot, "droids"), droidPath, "Droid")
  }
  for (const commandPath of artifacts.commands) {
    moved += await moveIfExists(managedDir, "commands", path.join(droidRoot, "commands"), commandPath, "Droid")
  }
  return { target: "droid", root: droidRoot, moved }
}

async function cleanupQwen(plugin: Awaited<ReturnType<typeof loadClaudePlugin>>, qwenRoot: string): Promise<CleanupResult> {
  // IMPORTANT: legacy detection for `~/.qwen/{skills,agents,commands}` must be
  // driven exclusively by the historical allow-list in
  // `EXTRA_LEGACY_ARTIFACTS_BY_PLUGIN`. Mirrors the Codex/Droid/Windsurf/
  // Copilot cleanup fixes: the Bun-based Qwen writer was replaced by native
  // `qwen extensions install`, so this cleanup exists solely to back up stale
  // files from legacy manual installs. Seeding from the current plugin bundle
  // (`plugin.skills`, `plugin.agents`, `plugin.commands`) would sweep up
  // user-authored files at paths like `~/.qwen/skills/ce-debug/SKILL.md` or
  // `~/.qwen/agents/ce-correctness-reviewer.md` that happen to share a name
  // with a current CE artifact but were never installed by this plugin.
  const managedDir = path.join(qwenRoot, plugin.manifest.name)
  const extras = getLegacyPluginArtifacts(plugin.manifest.name)
  const skillNames = new Set((extras.skills ?? []).map(sanitizePathName))
  const agentNames = new Set((extras.agents ?? []).map(sanitizePathName))
  // The old Bun-based Qwen writer wrote commands via `resolveCommandPath`,
  // which split colon-namespaced names into nested directories (e.g.
  // `compound:plan` -> `commands/compound/plan.md`). We also probe the flat
  // sanitized form (`commands/compound-plan.md`) in case a historical install
  // landed commands there. Both shapes need cleanup so stale files can't
  // shadow native plugin commands after migration. Candidates come exclusively
  // from the historical allow-list, not from the current plugin bundle.
  const commandPaths = new Set<string>()
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
  // Defense in depth: relativePath comes from either the historical legacy
  // allow-list (safe by construction) or an install-manifest entry that
  // `readManagedInstallManifest` / `readInstallManifest` already filtered.
  // Re-check here so any future caller that skips the read layer cannot
  // issue an out-of-tree rename via `moveLegacyArtifactToBackup`.
  if (!isSafeManagedPath(artifactRoot, relativePath)) return 0
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

function resolveGeminiWorkspaceRoot(outputRoot: string): string {
  return path.basename(outputRoot) === ".gemini" ? outputRoot : path.join(outputRoot, ".gemini")
}

function resolveOpenCodeWorkspaceRoot(outputRoot: string): string {
  return path.basename(outputRoot) === ".opencode" ? outputRoot : path.join(outputRoot, ".opencode")
}

function hasExplicitValue(value: unknown): boolean {
  return Boolean(value && String(value).trim())
}

async function dedupeRoots(roots: string[]): Promise<string[]> {
  const seen = new Set<string>()
  const result: string[] = []
  for (const root of roots) {
    // Resolve symlinks before comparing. Plain string equality is not enough
    // on macOS where `$HOME` is typically `/Users/<name>` but `process.cwd()`
    // on a directory under `/var/folders` resolves to `/private/var/folders`,
    // and similar per-user tmpdir setups produce two strings that point at
    // the same inode. Falling back to `path.normalize` on the raw string when
    // the directory doesn't yet exist (e.g. the first `install` ever) keeps
    // the pre-realpath behavior as a safety net.
    const key = await resolveCanonicalPath(root)
    if (seen.has(key)) continue
    seen.add(key)
    result.push(root)
  }
  return result
}

async function resolveCanonicalPath(target: string): Promise<string> {
  const normalized = path.normalize(target)
  try {
    return await fs.realpath(normalized)
  } catch {
    // Directory does not exist yet — fall back to the normalized string. This
    // is fine because a non-existent path has no filesystem aliases to race
    // against.
    return normalized
  }
}

function resolveDroidWorkspaceRoot(outputRoot: string): string {
  return path.basename(outputRoot) === ".factory" ? outputRoot : path.join(outputRoot, ".factory")
}

function resolveWindsurfWorkspaceRoot(outputRoot: string): string {
  return path.basename(outputRoot) === ".windsurf" ? outputRoot : path.join(outputRoot, ".windsurf")
}
