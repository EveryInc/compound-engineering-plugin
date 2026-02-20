export type OpenCodePermission = "allow" | "ask" | "deny"

export type OpenCodeConfig = {
  $schema?: string
  model?: string
  default_agent?: string
  tools?: Record<string, boolean>
  permission?: Record<string, OpenCodePermission | Record<string, OpenCodePermission>>
  agent?: Record<string, OpenCodeAgentConfig>
  mcp?: Record<string, OpenCodeMcpServer>
}

export type OpenCodeAgentConfig = {
  description?: string
  mode?: "primary" | "subagent"
  model?: string
  temperature?: number
  tools?: Record<string, boolean>
  permission?: Record<string, OpenCodePermission>
}

export type OpenCodeMcpServer = {
  type: "local" | "remote"
  command?: string[]
  url?: string
  environment?: Record<string, string>
  headers?: Record<string, string>
  enabled?: boolean
}

export type OpenCodeAgentFile = {
  name: string
  content: string
}

export type OpenCodePluginFile = {
  name: string
  content: string
}

export type OpenCodeCommandFile = {
  name: string
  content: string
}

export type OpenCodeBundle = {
  config: OpenCodeConfig
  agents: OpenCodeAgentFile[]
  // Commands are written as individual .md files, not in opencode.json. See ADR-001.
  commandFiles: OpenCodeCommandFile[]
  plugins: OpenCodePluginFile[]
  skillDirs: { sourceDir: string; name: string }[]
}
