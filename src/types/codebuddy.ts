import type { ClaudeMcpServer, ClaudeHooks } from "./claude"

export type CodeBuddyPrompt = {
  name: string
  content: string
}

export type CodeBuddySkillDir = {
  name: string
  sourceDir: string
}

export type CodeBuddyGeneratedSkill = {
  name: string
  content: string
  sidecarDirs?: CodeBuddyGeneratedSkillSidecarDir[]
}

export type CodeBuddyGeneratedSkillSidecarDir = {
  sourceDir: string
  targetName: string
}

export type CodeBuddyAgent = {
  name: string
  description: string
  instructions: string
  sidecarDirs?: CodeBuddyGeneratedSkillSidecarDir[]
}

export type CodeBuddyBundle = {
  pluginName?: string
  prompts: CodeBuddyPrompt[]
  skillDirs: CodeBuddySkillDir[]
  generatedSkills: CodeBuddyGeneratedSkill[]
  agents?: CodeBuddyAgent[]
  mcpServers?: Record<string, ClaudeMcpServer>
  hooks?: ClaudeHooks
  externallyManagedSkillNames?: string[]
}
