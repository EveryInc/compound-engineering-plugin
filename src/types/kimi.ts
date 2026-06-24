import type { ClaudeMcpServer, ClaudeHooks } from "./claude"
import type { KimiInvocationTargets } from "../utils/kimi-content"

export type KimiSkillDir = {
  name: string
  sourceDir: string
}

export type KimiGeneratedSkillSidecarDir = {
  sourceDir: string
  targetName: string
}

export type KimiGeneratedSkill = {
  name: string
  content: string
  sidecarDirs?: KimiGeneratedSkillSidecarDir[]
}

export type KimiBundle = {
  pluginName?: string
  /** Pass-through Claude skills copied verbatim (with content transform). */
  skillDirs: KimiSkillDir[]
  /**
   * Skills generated from Claude commands and agents. Kimi has no command-file
   * or auto-discovered agent-directory concept, so both surface as skills that
   * the user invokes with `/skill:<name>`.
   */
  generatedSkills: KimiGeneratedSkill[]
  invocationTargets?: KimiInvocationTargets
  mcpServers?: Record<string, ClaudeMcpServer>
  hooks?: ClaudeHooks
}
