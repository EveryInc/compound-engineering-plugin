import type { ClaudeMcpServer, ClaudeHooks } from "./claude"
import type { CodexInvocationTargets } from "../utils/codex-content"

export type CodexPrompt = {
  name: string
  content: string
}

export type CodexSkillDir = {
  name: string
  sourceDir: string
}

export type CodexGeneratedSkill = {
  name: string
  content: string
  sidecarDirs?: CodexGeneratedSkillSidecarDir[]
}

export type CodexGeneratedSkillSidecarDir = {
  sourceDir: string
  targetName: string
}

export type CodexAgent = {
  name: string
  description: string
  instructions: string
  sidecarDirs?: CodexGeneratedSkillSidecarDir[]
}

export type CodexBundle = {
  pluginName?: string
  prompts: CodexPrompt[]
  skillDirs: CodexSkillDir[]
  generatedSkills: CodexGeneratedSkill[]
  agents?: CodexAgent[]
  invocationTargets?: CodexInvocationTargets
  mcpServers?: Record<string, ClaudeMcpServer>
  hooks?: ClaudeHooks
  /**
   * Names of skills CE owns in the Codex managed tree that are NOT written by
   * this bundle. Used in agents-only installs (default `--to codex`) where
   * skill contents are installed via Codex's native plugin flow, but cleanup
   * still needs to recognize those skill names as "current" (and therefore
   * not legacy) when re-running the install. Entries are sanitized skill
   * names (same shape as `skillDirs[].name` after `sanitizePathName`).
   */
  externallyManagedSkillNames?: string[]
}
