export type KiroAgent = {
  name: string
  config: KiroAgentConfig
  promptContent: string
}

export type KiroAgentConfig = {
  name: string
  description: string
  prompt: `file://${string}`
  tools: ["*"]
  resources: string[]
  includeMcpJson: true
  welcomeMessage?: string
}

export type KiroSkill = {
  name: string
  content: string // Full SKILL.md with YAML frontmatter
}

export type KiroSkillDir = {
  name: string
  sourceDir: string
}

export type KiroSteeringFile = {
  name: string
  content: string
}

export type KiroMcpServer = {
  command?: string
  args?: string[]
  env?: Record<string, string>
  url?: string
  headers?: Record<string, string>
}

export type KiroHookWhen = {
  type: "preToolUse" | "postToolUse" | "agentStop" | "promptSubmit"
  toolTypes?: string[]
}

export type KiroHookThen =
  | { type: "runCommand"; command: string; timeout: number }
  | { type: "askAgent"; prompt: string }

export type KiroHookFile = {
  enabled: boolean
  name: string
  description: string
  version: "1"
  when: KiroHookWhen
  then: KiroHookThen
}

export type KiroBundle = {
  agents: KiroAgent[]
  generatedSkills: KiroSkill[]
  skillDirs: KiroSkillDir[]
  steeringFiles: KiroSteeringFile[]
  mcpServers: Record<string, KiroMcpServer>
  hookFiles: { fileName: string; hook: KiroHookFile }[]
  hookScripts: { name: string; sourcePath: string }[]
}
