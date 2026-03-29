import type { ClaudeMcpServer } from "./claude"
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
}

export type CodexHookEventName =
  | "PreToolUse"
  | "PostToolUse" // TODO: depends on openai/codex#15531 merging
  | "UserPromptSubmit"
  | "SessionStart"
  | "Stop"

export type CodexHookCommand = {
  type: "command"
  command: string
  timeout?: number
}

export type CodexHookMatcher = {
  matcher?: string
  hooks: CodexHookCommand[]
}

export type CodexHooks = Partial<Record<CodexHookEventName, CodexHookMatcher[]>>

export type CodexBundle = {
  prompts: CodexPrompt[]
  skillDirs: CodexSkillDir[]
  generatedSkills: CodexGeneratedSkill[]
  invocationTargets?: CodexInvocationTargets
  mcpServers?: Record<string, ClaudeMcpServer>
  hooks?: CodexHooks
}
