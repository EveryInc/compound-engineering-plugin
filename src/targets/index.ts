import type { ClaudePlugin } from "../types/claude"
import type { OpenCodeBundle } from "../types/opencode"
import type { CodexBundle } from "../types/codex"
import type { DroidBundle } from "../types/droid"
import type { PiBundle } from "../types/pi"
import type { CopilotBundle } from "../types/copilot"
import type { GeminiBundle } from "../types/gemini"
import type { KiroBundle } from "../types/kiro"
import type { QwenBundle } from "../types/qwen"
import { convertClaudeToOpenCode, type ClaudeToOpenCodeOptions } from "../converters/claude-to-opencode"
import { convertClaudeToCodex } from "../converters/claude-to-codex"
import { convertClaudeToDroid } from "../converters/claude-to-droid"
import { convertClaudeToPi } from "../converters/claude-to-pi"
import { convertClaudeToCopilot } from "../converters/claude-to-copilot"
import { convertClaudeToGemini } from "../converters/claude-to-gemini"
import { convertClaudeToKiro } from "../converters/claude-to-kiro"
import { convertClaudeToQwen, type ClaudeToQwenOptions } from "../converters/claude-to-qwen"
import { writeOpenCodeBundle } from "./opencode"
import { writeCodexBundle } from "./codex"
import { writeDroidBundle } from "./droid"
import { writePiBundle } from "./pi"
import { writeCopilotBundle } from "./copilot"
import { writeGeminiBundle } from "./gemini"
import { writeKiroBundle } from "./kiro"
import { writeQwenBundle } from "./qwen"

export type TargetHandler<TBundle = unknown> = {
  name: string
  implemented: boolean
  convert: (plugin: ClaudePlugin, options: ClaudeToOpenCodeOptions) => TBundle | null
  write: (outputRoot: string, bundle: TBundle) => Promise<void>
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
  qwen: {
    name: "qwen",
    implemented: true,
    convert: convertClaudeToQwen as TargetHandler<QwenBundle>["convert"],
    write: writeQwenBundle as TargetHandler<QwenBundle>["write"],
  },
}
