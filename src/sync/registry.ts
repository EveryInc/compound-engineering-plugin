import os from "os"
import path from "path"
import type { ClaudeHomeConfig } from "../parsers/claude-home"
import { syncToCodex } from "./codex"
import { syncToCopilot } from "./copilot"
import { syncToDroid } from "./droid"
import { syncToGemini } from "./gemini"
import { syncToKiro } from "./kiro"
import { syncToOpenClaw } from "./openclaw"
import { syncToOpenCode } from "./opencode"
import { syncToPi } from "./pi"
import { syncToQwen } from "./qwen"
import { syncToWindsurf } from "./windsurf"

function getCopilotHomeRoot(home: string): string {
  return path.join(home, ".copilot")
}

function getGeminiHomeRoot(home: string): string {
  return path.join(home, ".gemini")
}

export type SyncTargetName =
  | "opencode"
  | "codex"
  | "pi"
  | "droid"
  | "copilot"
  | "gemini"
  | "windsurf"
  | "kiro"
  | "qwen"
  | "openclaw"

export type SyncTargetDefinition = {
  name: SyncTargetName
  detectPaths: (home: string, cwd: string) => string[]
  resolveOutputRoot: (home: string, cwd: string) => string
  sync: (config: ClaudeHomeConfig, outputRoot: string) => Promise<void>
}

export const syncTargets: SyncTargetDefinition[] = [
  {
    name: "opencode",
    detectPaths: (home, cwd) => [
      path.join(home, ".config", "opencode"),
      path.join(cwd, ".opencode"),
    ],
    resolveOutputRoot: (home) => path.join(home, ".config", "opencode"),
    sync: syncToOpenCode,
  },
  {
    name: "codex",
    detectPaths: (home) => [path.join(home, ".codex")],
    resolveOutputRoot: (home) => path.join(home, ".codex"),
    sync: syncToCodex,
  },
  {
    name: "pi",
    detectPaths: (home) => [path.join(home, ".pi")],
    resolveOutputRoot: (home) => path.join(home, ".pi", "agent"),
    sync: syncToPi,
  },
  {
    name: "droid",
    detectPaths: (home) => [path.join(home, ".factory")],
    resolveOutputRoot: (home) => path.join(home, ".factory"),
    sync: syncToDroid,
  },
  {
    name: "copilot",
    detectPaths: (home, cwd) => [
      getCopilotHomeRoot(home),
      path.join(cwd, ".github", "skills"),
      path.join(cwd, ".github", "agents"),
      path.join(cwd, ".github", "copilot-instructions.md"),
    ],
    resolveOutputRoot: (home) => getCopilotHomeRoot(home),
    sync: syncToCopilot,
  },
  {
    name: "gemini",
    detectPaths: (home, cwd) => [
      path.join(cwd, ".gemini"),
      getGeminiHomeRoot(home),
    ],
    resolveOutputRoot: (home) => getGeminiHomeRoot(home),
    sync: syncToGemini,
  },
  {
    name: "windsurf",
    detectPaths: (home, cwd) => [
      path.join(home, ".codeium", "windsurf"),
      path.join(cwd, ".windsurf"),
    ],
    resolveOutputRoot: (home) => path.join(home, ".codeium", "windsurf"),
    sync: syncToWindsurf,
  },
  {
    name: "kiro",
    detectPaths: (home, cwd) => [
      path.join(home, ".kiro"),
      path.join(cwd, ".kiro"),
    ],
    resolveOutputRoot: (home) => path.join(home, ".kiro"),
    sync: syncToKiro,
  },
  {
    name: "qwen",
    detectPaths: (home, cwd) => [
      path.join(home, ".qwen"),
      path.join(cwd, ".qwen"),
    ],
    resolveOutputRoot: (home) => path.join(home, ".qwen"),
    sync: syncToQwen,
  },
  {
    name: "openclaw",
    detectPaths: (home) => [path.join(home, ".openclaw")],
    resolveOutputRoot: (home) => path.join(home, ".openclaw"),
    sync: syncToOpenClaw,
  },
]

export const syncTargetNames = syncTargets.map((target) => target.name)

// Cleanup scans `<output-root>/skills/` for flat entries whose names collide
// with the namespaced plugin skills written by install/convert. This is the
// install-side legacy cleanup path — users who installed with pre-namespace
// versions end up with flat entries that now coexist with the new
// `compound-engineering/` namespaced entries, and cleanup removes the flat
// duplicates.
//
// Sync writes user-owned home config which is NOT namespaced, so sync does
// not contribute to the legacy state cleanup handles. OpenClaw is excluded
// because its install/convert writes into an isolated
// `~/.openclaw/extensions/<plugin>/skills/` package that cleanup never
// scans — there is no shared-root legacy state for openclaw to clean up.
const legacyFlatSkillCleanupTargets = new Set<SyncTargetName>([
  "opencode",
  "codex",
  "pi",
  "droid",
  "copilot",
  "gemini",
  "windsurf",
  "kiro",
  "qwen",
])

export function isSyncTargetName(value: string): value is SyncTargetName {
  return syncTargetNames.includes(value as SyncTargetName)
}

export function getSyncTarget(name: SyncTargetName): SyncTargetDefinition {
  const target = syncTargets.find((entry) => entry.name === name)
  if (!target) {
    throw new Error(`Unknown sync target: ${name}`)
  }
  return target
}

export function supportsLegacyFlatSkillCleanup(targetName: SyncTargetName): boolean {
  return legacyFlatSkillCleanupTargets.has(targetName)
}

export function resolveSyncSkillsRoot(
  target: SyncTargetDefinition,
  home: string,
  cwd: string,
): string | null {
  if (!supportsLegacyFlatSkillCleanup(target.name)) {
    return null
  }

  const outputRoot = target.resolveOutputRoot(home, cwd)
  return path.join(outputRoot, "skills")
}

export function getDefaultSyncRegistryContext(): { home: string; cwd: string } {
  return { home: os.homedir(), cwd: process.cwd() }
}
