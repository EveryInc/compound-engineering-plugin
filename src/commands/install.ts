import { defineCommand } from "citty"
import { promises as fs } from "fs"
import os from "os"
import path from "path"
import { fileURLToPath } from "url"
import { loadClaudePlugin } from "../parsers/claude"
import { targets, validateScope } from "../targets"
import { pathExists } from "../utils/files"
import type { ClaudeToOpenCodeOptions, PermissionMode } from "../converters/claude-to-opencode"
import { ensureCodexAgentsFile } from "../utils/codex-agents"
import { expandHome, resolveTargetHome } from "../utils/resolve-home"
import { resolveOpenCodeWriteScope, resolveTargetOutputRoot } from "../utils/resolve-output"
import { detectInstalledTools } from "../utils/detect-tools"

const permissionModes: PermissionMode[] = ["none", "broad", "from-commands"]

export default defineCommand({
  meta: {
    name: "install",
    description: "Install and convert a Claude plugin",
  },
  args: {
    plugin: {
      type: "positional",
      required: true,
      description: "Plugin name or path",
    },
    to: {
      type: "string",
      default: "opencode",
      description: "Target format (opencode | codex | pi | gemini | kiro | all)",
    },
    output: {
      type: "string",
      alias: "o",
      description: "Output directory (project root)",
    },
    codexHome: {
      type: "string",
      alias: "codex-home",
      description: "Write Codex output to this .codex root (ex: ~/.codex)",
    },
    piHome: {
      type: "string",
      alias: "pi-home",
      description: "Write Pi output to this Pi root (ex: ~/.pi/agent or ./.pi)",
    },
    scope: {
      type: "string",
      description: "Scope level: global | workspace (default varies by target)",
    },
    also: {
      type: "string",
      description: "Comma-separated extra targets to generate (ex: codex)",
    },
    permissions: {
      type: "string",
      default: "none", // Default is "none" -- writing global permissions to opencode.json pollutes user config. See ADR-003.
      description: "Permission mapping written to opencode.json: none (default) | broad | from-command",
    },
    agentMode: {
      type: "string",
      default: "subagent",
      description: "Default agent mode: primary | subagent",
    },
    inferTemperature: {
      type: "boolean",
      default: true,
      description: "Infer agent temperature from name/description",
    },
    includeSkills: {
      type: "boolean",
      default: false,
      alias: "include-skills",
      description: "For --to codex only: also emit skills and commands. Default is agents-only, the recommended pairing with `codex plugin install`. Set this flag for a legacy / standalone install without Codex native plugin install. Ignored by other targets.",
    },
    branch: {
      type: "string",
      description: "Git branch to clone from (e.g. feat/new-agents)",
    },
  },
  async run({ args }) {
    const targetName = String(args.to)

    const permissions = String(args.permissions)
    if (!permissionModes.includes(permissions as PermissionMode)) {
      throw new Error(`Unknown permissions mode: ${permissions}`)
    }

    const branch = args.branch ? String(args.branch) : undefined
    const resolvedPlugin = await resolvePluginPath(String(args.plugin), branch)

    try {
      const plugin = await loadClaudePlugin(resolvedPlugin.path)
      const outputRoot = resolveOutputRoot(args.output)
      const codexHome = resolveTargetHome(args.codexHome, path.join(os.homedir(), ".codex"))
      const piHome = resolveTargetHome(args.piHome, path.join(os.homedir(), ".pi", "agent"))
      const hasExplicitOutput = Boolean(args.output && String(args.output).trim())

      const options: ClaudeToOpenCodeOptions = {
        agentMode: String(args.agentMode) === "primary" ? "primary" : "subagent",
        inferTemperature: Boolean(args.inferTemperature),
        permissions: permissions as PermissionMode,
        codexIncludeSkills: Boolean(args.includeSkills),
      }

      if (targetName === "all") {
        const detected = await detectInstalledTools()
        const activeTargets = detected.filter((t) => t.detected && targets[t.name]?.implemented)

        if (activeTargets.length === 0) {
          console.log("No installable AI coding tools detected. Use native plugin install for Claude Code, Copilot, Droid, and Qwen.")
          return
        }

        console.log(`Detected ${activeTargets.length} installable tool(s):`)
        for (const tool of detected) {
          if (tool.detected && !targets[tool.name]?.implemented) {
            console.log(`  - ${tool.name} — native plugin install; skipped`)
            continue
          }
          console.log(`  ${tool.detected ? "✓" : "✗"} ${tool.name} — ${tool.reason}`)
        }

        for (const tool of activeTargets) {
          const handler = targets[tool.name]
          if (!handler || !handler.implemented) {
            console.warn(`Skipping ${tool.name}: not implemented.`)
            continue
          }
          const bundle = handler.convert(plugin, options)
          if (!bundle) {
            console.warn(`Skipping ${tool.name}: no output returned.`)
            continue
          }
          const root = resolveTargetOutputRoot({
            targetName: tool.name,
            outputRoot,
            codexHome,
            piHome,
            pluginName: plugin.manifest.name,
            hasExplicitOutput,
          })
          const writeScope =
            tool.name === "opencode" ? resolveOpenCodeWriteScope(hasExplicitOutput, undefined) : undefined
          await handler.write(root, bundle, writeScope)
          console.log(`Installed ${plugin.manifest.name} to ${tool.name} at ${root}`)
        }

        if (activeTargets.some((t) => t.name === "codex")) {
          await ensureCodexAgentsFile(codexHome)
        }
        return
      }

      const target = targets[targetName]
      if (!target) {
        throw new Error(`Unknown target: ${targetName}`)
      }
      if (!target.implemented) {
        throw new Error(`Target ${targetName} is registered but not implemented yet.`)
      }

      const resolvedScope = validateScope(targetName, target, args.scope ? String(args.scope) : undefined)

      const bundle = target.convert(plugin, options)
      if (!bundle) {
        throw new Error(`Target ${targetName} did not return a bundle.`)
      }
      const primaryOutputRoot = resolveTargetOutputRoot({
        targetName,
        outputRoot,
        codexHome,
        piHome,
        pluginName: plugin.manifest.name,
        hasExplicitOutput,
        scope: resolvedScope,
      })
      const effectiveScope =
        targetName === "opencode" ? resolveOpenCodeWriteScope(hasExplicitOutput, resolvedScope) : resolvedScope
      await target.write(primaryOutputRoot, bundle, effectiveScope)
      console.log(`Installed ${plugin.manifest.name} to ${primaryOutputRoot}`)

      const extraTargets = parseExtraTargets(args.also)
      const allTargets = [targetName, ...extraTargets]
      for (const extra of extraTargets) {
        const handler = targets[extra]
        if (!handler) {
          console.warn(`Skipping unknown target: ${extra}`)
          continue
        }
        if (!handler.implemented) {
          console.warn(`Skipping ${extra}: not implemented yet.`)
          continue
        }
        const extraBundle = handler.convert(plugin, options)
        if (!extraBundle) {
          console.warn(`Skipping ${extra}: no output returned.`)
          continue
        }
        const extraRoot = resolveTargetOutputRoot({
          targetName: extra,
          outputRoot,
          codexHome,
          piHome,
          pluginName: plugin.manifest.name,
          hasExplicitOutput,
          scope: handler.defaultScope,
        })
        const extraScope =
          extra === "opencode"
            ? resolveOpenCodeWriteScope(hasExplicitOutput, handler.defaultScope)
            : handler.defaultScope
        await handler.write(extraRoot, extraBundle, extraScope)
        console.log(`Installed ${plugin.manifest.name} to ${extraRoot}`)
      }

      if (allTargets.includes("codex")) {
        await ensureCodexAgentsFile(codexHome)
      }
    } finally {
      if (resolvedPlugin.cleanup) {
        await resolvedPlugin.cleanup()
      }
    }
  },
})

type ResolvedPluginPath = {
  path: string
  cleanup?: () => Promise<void>
}

async function resolvePluginPath(input: string, branch?: string): Promise<ResolvedPluginPath> {
  // Only treat as a local path if it explicitly looks like one
  if (input.startsWith(".") || input.startsWith("/") || input.startsWith("~")) {
    const expanded = expandHome(input)
    const directPath = path.resolve(expanded)
    if (await pathExists(directPath)) return { path: directPath }
    throw new Error(`Local plugin path not found: ${directPath}`)
  }

  // Skip bundled plugins when a branch is specified — the user wants a specific remote version
  if (!branch) {
    const bundledPluginPath = await resolveBundledPluginPath(input)
    if (bundledPluginPath) {
      return { path: bundledPluginPath }
    }
  }

  // Otherwise, fetch from GitHub (optionally from a specific branch)
  return await resolveGitHubPluginPath(input, branch)
}

function parseExtraTargets(value: unknown): string[] {
  if (!value) return []
  return String(value)
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
}

function resolveOutputRoot(value: unknown): string {
  if (value && String(value).trim()) {
    const expanded = expandHome(String(value).trim())
    return path.resolve(expanded)
  }
  // Per-target defaults are applied in `resolveTargetOutputRoot` -- e.g.,
  // OpenCode falls back to `OPENCODE_CONFIG_DIR` / `~/.config/opencode`,
  // Codex falls back to `~/.codex`. Falling through to `process.cwd()` keeps
  // workspace-rooted targets (gemini, kiro) using the user's project root
  // when neither `--output` nor a target-specific home flag was supplied.
  return process.cwd()
}

async function resolveBundledPluginPath(pluginName: string): Promise<string | null> {
  const bundledRoot = fileURLToPath(new URL("../../plugins/", import.meta.url))
  const pluginPath = path.join(bundledRoot, pluginName)
  const manifestPath = path.join(pluginPath, ".claude-plugin", "plugin.json")
  if (await pathExists(manifestPath)) {
    return pluginPath
  }
  return null
}

async function resolveGitHubPluginPath(pluginName: string, branch?: string): Promise<ResolvedPluginPath> {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "compound-plugin-"))
  const source = resolveGitHubSource()
  try {
    await cloneGitHubRepo(source, tempRoot, branch)
  } catch (error) {
    await fs.rm(tempRoot, { recursive: true, force: true })
    throw error
  }

  const pluginPath = path.join(tempRoot, "plugins", pluginName)
  if (!(await pathExists(pluginPath))) {
    await fs.rm(tempRoot, { recursive: true, force: true })
    throw new Error(`Could not find plugin ${pluginName} in ${source}.`)
  }

  return {
    path: pluginPath,
    cleanup: async () => {
      await fs.rm(tempRoot, { recursive: true, force: true })
    },
  }
}

function resolveGitHubSource(): string {
  const override = process.env.COMPOUND_PLUGIN_GITHUB_SOURCE
  if (override && override.trim()) return override.trim()
  return "https://github.com/EveryInc/compound-engineering-plugin"
}

async function cloneGitHubRepo(source: string, destination: string, branch?: string): Promise<void> {
  const args = ["git", "clone", "--depth", "1"]
  if (branch) args.push("--branch", branch)
  args.push(source, destination)
  const proc = Bun.spawn(args, {
    stdout: "pipe",
    stderr: "pipe",
  })
  const exitCode = await proc.exited
  const stderr = await new Response(proc.stderr).text()
  if (exitCode !== 0) {
    throw new Error(`Failed to clone ${source}. ${stderr.trim()}`)
  }
}
