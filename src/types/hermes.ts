export type HermesPassthroughSkill = {
  name: string
  sourceDir: string
}

export type HermesGeneratedSkill = {
  name: string
  content: string
  kind: "command" | "agent"
}

export type HermesMcpTools = {
  include?: string[]
  exclude?: string[]
  resources?: boolean
  prompts?: boolean
}

export type HermesMcpSampling = {
  enabled?: boolean
  model?: string
  max_tokens_cap?: number
  timeout?: number
  max_rpm?: number
  max_tool_rounds?: number
  allowed_models?: string[]
  log_level?: string
}

export type HermesMcpStdioServer = {
  command: string
  args?: string[]
  env?: Record<string, string>
  cwd?: string
  timeout?: number
  connect_timeout?: number
  enabled?: boolean
  tools?: HermesMcpTools
  sampling?: HermesMcpSampling
}

export type HermesMcpHttpServer = {
  url: string
  headers?: Record<string, string>
  timeout?: number
  connect_timeout?: number
  enabled?: boolean
  tools?: HermesMcpTools
  sampling?: HermesMcpSampling
}

export type HermesMcpServer = HermesMcpStdioServer | HermesMcpHttpServer

export type HermesMcpConfig = {
  mcp_servers: Record<string, HermesMcpServer>
}

export type HermesBundle = {
  pluginName?: string
  passthroughSkills: HermesPassthroughSkill[]
  generatedSkills: HermesGeneratedSkill[]
  mcpConfig?: HermesMcpConfig
  droppedCommands: string[]
  skippedMcpServers: string[]
}
