import type { ClaudePlugin } from "../types/claude"
import { convertClaudeToOpenCode, type ClaudeToOpenCodeOptions } from "../converters/claude-to-opencode"
import { convertClaudeToCodex } from "../converters/claude-to-codex"
import { convertClaudeToPi } from "../converters/claude-to-pi"
import { convertClaudeToGemini } from "../converters/claude-to-gemini"
import { convertClaudeToKiro } from "../converters/claude-to-kiro"
import { writeOpenCodeBundle } from "./opencode"
import { writeCodexBundle } from "./codex"
import { writePiBundle } from "./pi"
import { writeGeminiBundle } from "./gemini"
import { writeKiroBundle } from "./kiro"

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
    write: ((outputRoot, bundle) =>
      writeCodexBundle(outputRoot, bundle as Parameters<typeof writeCodexBundle>[1], {
        outputIsCodexRoot: true,
      })) as TargetHandler["write"],
  },
  pi: {
    name: "pi",
    implemented: true,
    convert: convertClaudeToPi as TargetHandler["convert"],
    write: writePiBundle as TargetHandler["write"],
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
}

/**
 * The list of valid `--to` values, derived from the registry so it can never
 * drift. `all` is a valid `--to` value handled by an early branch in each
 * command (before the registry lookup), so it is appended here for the
 * help/error text but is never passed to `assertKnownTarget` at runtime.
 */
function supportedTargetNames(): string[] {
  return [...Object.keys(targets), "all"]
}

/**
 * Resolve a `--to` value to its handler, or throw an enriched error that lists
 * the supported target names. Returning the handler yields a single clean call
 * site and avoids a non-null assertion that could desync from the lookup.
 */
export function assertKnownTarget(targetName: string): TargetHandler {
  const target = targets[targetName]
  if (!target) {
    throw new Error(
      `Unknown target: ${targetName}. Supported targets: ${supportedTargetNames().join(", ")}`,
    )
  }
  return target
}
