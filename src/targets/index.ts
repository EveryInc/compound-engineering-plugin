import type { ClaudePlugin } from "../types/claude"
import { convertClaudeToOpenCode, type ClaudeToOpenCodeOptions } from "../converters/claude-to-opencode"
import { convertClaudeToCodex } from "../converters/claude-to-codex"
import { convertClaudeToDroid } from "../converters/claude-to-droid"
import { convertClaudeToPi } from "../converters/claude-to-pi"
import { convertClaudeToCopilot } from "../converters/claude-to-copilot"
import { convertClaudeToGemini } from "../converters/claude-to-gemini"
import { convertClaudeToKiro } from "../converters/claude-to-kiro"
import { convertClaudeToWindsurf } from "../converters/claude-to-windsurf"
import { convertClaudeToOpenClaw } from "../converters/claude-to-openclaw"
import { convertClaudeToQwen } from "../converters/claude-to-qwen"
import { writeOpenCodeBundle } from "./opencode"
import { writeCodexBundle } from "./codex"
import { writeDroidBundle } from "./droid"
import { writePiBundle } from "./pi"
import { writeCopilotBundle } from "./copilot"
import { writeGeminiBundle } from "./gemini"
import { writeKiroBundle } from "./kiro"
import { writeWindsurfBundle } from "./windsurf"
import { writeOpenClawBundle } from "./openclaw"
import { writeQwenBundle } from "./qwen"

export type TargetScope = "global" | "workspace"

export function isTargetScope(value: string): value is TargetScope {
  return value === "global" || value === "workspace"
}

/**
 * Validate a --scope flag against a target's supported scopes.
 * Returns the resolved scope (explicit or default) or throws on invalid input.
 */
export function validateScope(
  targetName: string,
  target: TargetHandler,
  scopeArg: string | undefined,
): TargetScope | undefined {
  if (scopeArg === undefined) return target.defaultScope

  if (!target.supportedScopes) {
    throw new Error(`Target "${targetName}" does not support the --scope flag.`)
  }
  if (!isTargetScope(scopeArg) || !target.supportedScopes.includes(scopeArg)) {
    throw new Error(`Target "${targetName}" does not support --scope ${scopeArg}. Supported: ${target.supportedScopes.join(", ")}`)
  }
  return scopeArg
}

export type TargetHandler<TBundle = unknown> = {
  name: string
  implemented: boolean
  /** Default scope when --scope is not provided. Only meaningful when supportedScopes is defined. */
  defaultScope?: TargetScope
  /** Valid scope values. If absent, the --scope flag is rejected for this target. */
  supportedScopes?: TargetScope[]
  convert: (plugin: ClaudePlugin, options: ClaudeToOpenCodeOptions) => TBundle | null
  write: (outputRoot: string, bundle: TBundle, scope?: TargetScope) => Promise<void>
}

export const targets: Record<string, TargetHandler> = {
  opencode: {
    name: "opencode",
    implemented: true,
    convert: convertClaudeToOpenCode,
    write: writeOpenCodeBundle as TargetHandler["write"],
  },
  codex: {
    name: "codex",
    implemented: true,
    convert: convertClaudeToCodex as TargetHandler["convert"],
    write: writeCodexBundle as TargetHandler["write"],
  },
  droid: {
    name: "droid",
    implemented: true,
    convert: convertClaudeToDroid as TargetHandler["convert"],
    write: writeDroidBundle as TargetHandler["write"],
  },
  pi: {
    name: "pi",
    implemented: true,
    convert: convertClaudeToPi as TargetHandler["convert"],
    write: writePiBundle as TargetHandler["write"],
  },
  copilot: {
    name: "copilot",
    implemented: true,
    convert: convertClaudeToCopilot as TargetHandler["convert"],
    write: writeCopilotBundle as TargetHandler["write"],
  },
  gemini: {
    name: "gemini",
    implemented: true,
    convert: convertClaudeToGemini as TargetHandler["convert"],
    write: writeGeminiBundle as TargetHandler["write"],
  },
  kiro: {
    name: "kiro",
    implemented: true,
    convert: convertClaudeToKiro as TargetHandler["convert"],
    write: writeKiroBundle as TargetHandler["write"],
  },
  windsurf: {
    name: "windsurf",
    implemented: true,
    defaultScope: "global",
    supportedScopes: ["global", "workspace"],
    convert: convertClaudeToWindsurf as TargetHandler["convert"],
    write: writeWindsurfBundle as TargetHandler["write"],
  },
  openclaw: {
    name: "openclaw",
    implemented: true,
    convert: convertClaudeToOpenClaw as TargetHandler["convert"],
    write: writeOpenClawBundle as TargetHandler["write"],
  },
  qwen: {
    name: "qwen",
    implemented: true,
    convert: convertClaudeToQwen as TargetHandler["convert"],
    write: writeQwenBundle as TargetHandler["write"],
  },
}
