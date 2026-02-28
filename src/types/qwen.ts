export type QwenExtensionConfig = {
  name: string
  version: string
  mcpServers?: Record<string, QwenMcpServer>
  contextFileName?: string
  commands?: string
  skills?: string
  agents?: string
  settings?: QwenSetting[]
}

export type QwenMcpServer = {
  command?: string
  args?: string[]
  env?: Record<string, string>
  cwd?: string
}

export type QwenSetting = {
  name: string
  description: string
  envVar: string
  sensitive?: boolean
}

export type QwenAgentFile = {
  name: string
  content: string
  format: "yaml" | "markdown"
}

export type QwenSkillDir = {
  sourceDir: string
  name: string
}

export type QwenCommandFile = {
  name: string
  content: string
}

export type QwenBundle = {
  config: QwenExtensionConfig
  agents: QwenAgentFile[]
  commandFiles: QwenCommandFile[]
  skillDirs: QwenSkillDir[]
  contextFile?: string
}
