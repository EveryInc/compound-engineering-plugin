import { defineCommand } from "citty"
import os from "os"
import path from "path"
import { loadClaudePlugin } from "../parsers/claude"
import { targets, validateScope } from "../targets"
import type { PermissionMode } from "../converters/claude-to-opencode"
import { ensureCodexAgentsFile } from "../utils/codex-agents"
import { expandHome, resolveTargetHome } from "../utils/resolve-home"
import { resolveTargetOutputRoot } from "../utils/resolve-output"

const permissionModes: PermissionMode[] = ["none", "broad", "from-commands"]

export default defineCommand({
  meta: {
    name: "convert",
    description: "Convert a Claude Code plugin into another format",
  },
  args: {
    source: {
      type: "positional",
      required: true,
      description: "Path to the Claude plugin directory",
    },
    to: {
      type: "string",
      default: "opencode",
      description: "Target format (opencode | codex | droid | cursor | pi | copilot | gemini | kiro | windsurf)",
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

    const resolvedScope = validateScope(targetName, target, args.scope ? String(args.scope) : undefined)

    const plugin = await loadClaudePlugin(String(args.source))
    const outputRoot = resolveOutputRoot(args.output)
    const hasExplicitOutput = Boolean(args.output && String(args.output).trim())
    const codexHome = resolveTargetHome(args.codexHome, path.join(os.homedir(), ".codex"))
    const piHome = resolveTargetHome(args.piHome, path.join(os.homedir(), ".pi", "agent"))

    const options = {
      agentMode: String(args.agentMode) === "primary" ? "primary" : "subagent",
      inferTemperature: Boolean(args.inferTemperature),
      permissions: permissions as PermissionMode,
    }

    const primaryOutputRoot = resolveTargetOutputRoot({
      targetName,
      outputRoot,
      codexHome,
      piHome,
      hasExplicitOutput,
      scope: resolvedScope,
    })
    const bundle = target.convert(plugin, options)
    if (!bundle) {
      throw new Error(`Target ${targetName} did not return a bundle.`)
    }

    await target.write(primaryOutputRoot, bundle, resolvedScope)
    console.log(`Converted ${plugin.manifest.name} to ${targetName} at ${primaryOutputRoot}`)

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
        outputRoot: path.join(outputRoot, extra),
        codexHome,
        piHome,
        hasExplicitOutput,
        scope: handler.defaultScope,
      })
      await handler.write(extraRoot, extraBundle, handler.defaultScope)
      console.log(`Converted ${plugin.manifest.name} to ${extra} at ${extraRoot}`)
    }

    if (allTargets.includes("codex")) {
      await ensureCodexAgentsFile(codexHome)
    }
  },
})

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
  return process.cwd()
}

