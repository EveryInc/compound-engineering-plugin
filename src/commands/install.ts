import { defineCommand } from "citty"
import { promises as fs } from "fs"
import os from "os"
import path from "path"
import { loadClaudePlugin } from "../parsers/claude"
import { targets } from "../targets"
import { pathExists } from "../utils/files"
import type { PermissionMode } from "../converters/claude-to-opencode"
import { ensureCodexAgentsFile } from "../utils/codex-agents"
import { expandHome, resolveTargetHome } from "../utils/resolve-home"

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
      description: "Target format (opencode | codex | droid | cursor | pi | gemini | kiro)",
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
    also: {
      type: "string",
      description: "Comma-separated extra targets to generate (ex: codex)",
    },
    permissions: {
      type: "string",
      default: "broad",
      description: "Permission mapping: none | broad | from-commands",
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
  },
  async run({ args }) {
    const targetName = String(args.to)
    const target = targets[targetName]
    if (!target) {
      throw new Error(`Unknown target: ${targetName}`)
    }
    if (!target.implemented) {
      throw new Error(`Target ${targetName} is registered but not implemented yet.`)
    }

    const permissions = String(args.permissions)
    if (!permissionModes.includes(permissions as PermissionMode)) {
      throw new Error(`Unknown permissions mode: ${permissions}`)
    }

    const resolvedPlugin = await resolvePluginPath(String(args.plugin))

    try {
      const plugin = await loadClaudePlugin(resolvedPlugin.path)
      const outputRoot = resolveOutputRoot(args.output)
      const codexHome = resolveTargetHome(args.codexHome, path.join(os.homedir(), ".codex"))
      const piHome = resolveTargetHome(args.piHome, path.join(os.homedir(), ".pi", "agent"))

      const options = {
        agentMode: String(args.agentMode) === "primary" ? "primary" : "subagent",
        inferTemperature: Boolean(args.inferTemperature),
        permissions: permissions as PermissionMode,
      }

      const bundle = target.convert(plugin, options)
      if (!bundle) {
        throw new Error(`Target ${targetName} did not return a bundle.`)
      }
      const hasExplicitOutput = Boolean(args.output && String(args.output).trim())
      const primaryOutputRoot = resolveTargetOutputRoot(targetName, outputRoot, codexHome, piHome, hasExplicitOutput)
      await target.write(primaryOutputRoot, bundle)
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
        const extraRoot = resolveTargetOutputRoot(extra, path.join(outputRoot, extra), codexHome, piHome, hasExplicitOutput)
        await handler.write(extraRoot, extraBundle)
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

async function resolvePluginPath(input: string): Promise<ResolvedPluginPath> {
  // Only treat as a local path if it explicitly looks like one
  if (input.startsWith(".") || input.startsWith("/") || input.startsWith("~")) {
    const expanded = expandHome(input)
    const directPath = path.resolve(expanded)
    if (await pathExists(directPath)) return { path: directPath }
    throw new Error(`Local plugin path not found: ${directPath}`)
  }

  // Otherwise, always fetch the latest from GitHub
  return await resolveGitHubPluginPath(input)
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
  // OpenCode global config lives at ~/.config/opencode per XDG spec
  // See: https://opencode.ai/docs/config/
  return path.join(os.homedir(), ".config", "opencode")
}

function resolveTargetOutputRoot(
  targetName: string,
  outputRoot: string,
  codexHome: string,
  piHome: string,
  hasExplicitOutput: boolean,
): string {
  if (targetName === "codex") return codexHome
  if (targetName === "pi") return piHome
  if (targetName === "droid") return path.join(os.homedir(), ".factory")
  if (targetName === "cursor") {
    const base = hasExplicitOutput ? outputRoot : process.cwd()
    return path.join(base, ".cursor")
  }
  if (targetName === "gemini") {
    const base = hasExplicitOutput ? outputRoot : process.cwd()
    return path.join(base, ".gemini")
  }
  if (targetName === "kiro") {
    const base = hasExplicitOutput ? outputRoot : process.cwd()
    return path.join(base, ".kiro")
  }
  return outputRoot
}

async function resolveGitHubPluginPath(pluginName: string): Promise<ResolvedPluginPath> {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "compound-plugin-"))
  const source = resolveGitHubSource()
  try {
    await cloneGitHubRepo(source, tempRoot)
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

async function cloneGitHubRepo(source: string, destination: string): Promise<void> {
  const proc = Bun.spawn(["git", "clone", "--depth", "1", source, destination], {
    stdout: "pipe",
    stderr: "pipe",
  })
  const exitCode = await proc.exited
  const stderr = await new Response(proc.stderr).text()
  if (exitCode !== 0) {
    throw new Error(`Failed to clone ${source}. ${stderr.trim()}`)
  }
}
