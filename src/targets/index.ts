import type { ClaudePlugin } from "../types/claude"
import type { OpenCodeBundle } from "../types/opencode"
import type { CodexBundle } from "../types/codex"
import type { DroidBundle } from "../types/droid"
import type { PiBundle } from "../types/pi"
import type { CopilotBundle } from "../types/copilot"
import type { GeminiBundle } from "../types/gemini"
import type { KiroBundle } from "../types/kiro"
import type { WindsurfBundle } from "../types/windsurf"
import { convertClaudeToOpenCode, type ClaudeToOpenCodeOptions } from "../converters/claude-to-opencode"
import { convertClaudeToCodex } from "../converters/claude-to-codex"
import { convertClaudeToDroid } from "../converters/claude-to-droid"
import { convertClaudeToPi } from "../converters/claude-to-pi"
import { convertClaudeToCopilot } from "../converters/claude-to-copilot"
import { convertClaudeToGemini } from "../converters/claude-to-gemini"
import { convertClaudeToKiro } from "../converters/claude-to-kiro"
import { convertClaudeToWindsurf } from "../converters/claude-to-windsurf"
import { writeOpenCodeBundle } from "./opencode"
import { writeCodexBundle } from "./codex"
import { writeDroidBundle } from "./droid"
import { writePiBundle } from "./pi"
import { writeCopilotBundle } from "./copilot"
import { writeGeminiBundle } from "./gemini"
import { writeKiroBundle } from "./kiro"
import { writeWindsurfBundle } from "./windsurf"

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
    write: writeOpenCodeBundle,
  },
  codex: {
    name: "codex",
    implemented: true,
    convert: convertClaudeToCodex as TargetHandler<CodexBundle>["convert"],
    write: writeCodexBundle as TargetHandler<CodexBundle>["write"],
  },
  droid: {
    name: "droid",
    implemented: true,
    convert: convertClaudeToDroid as TargetHandler<DroidBundle>["convert"],
    write: writeDroidBundle as TargetHandler<DroidBundle>["write"],
  },
  pi: {
    name: "pi",
    implemented: true,
    convert: convertClaudeToPi as TargetHandler<PiBundle>["convert"],
    write: writePiBundle as TargetHandler<PiBundle>["write"],
  },
  copilot: {
    name: "copilot",
    implemented: true,
    convert: convertClaudeToCopilot as TargetHandler<CopilotBundle>["convert"],
    write: writeCopilotBundle as TargetHandler<CopilotBundle>["write"],
  },
  gemini: {
    name: "gemini",
    implemented: true,
    convert: convertClaudeToGemini as TargetHandler<GeminiBundle>["convert"],
    write: writeGeminiBundle as TargetHandler<GeminiBundle>["write"],
  },
  kiro: {
    name: "kiro",
    implemented: true,
    convert: convertClaudeToKiro as TargetHandler<KiroBundle>["convert"],
    write: writeKiroBundle as TargetHandler<KiroBundle>["write"],
  },
  windsurf: {
    name: "windsurf",
    implemented: true,
    defaultScope: "global",
    supportedScopes: ["global", "workspace"],
    convert: convertClaudeToWindsurf as TargetHandler<WindsurfBundle>["convert"],
    write: writeWindsurfBundle as TargetHandler<WindsurfBundle>["write"],
  },
}
