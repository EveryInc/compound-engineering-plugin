export type OpenCodePermission = "allow" | "ask" | "deny"

export type OpenCodeConfig = {
  $schema?: string
  model?: string
  default_agent?: string
  /** @deprecated OpenCode v1.1.1+ uses permission as the canonical control surface. */
  tools?: Record<string, boolean>
  permission?: Record<string, OpenCodePermission | Record<string, OpenCodePermission>>
  agent?: Record<string, OpenCodeAgentConfig>
  mcp?: Record<string, OpenCodeMcpServer>
  skills?: OpenCodeSkillsConfig
}

export type OpenCodeAgentConfig = {
  description?: string
  mode?: "primary" | "subagent" | "all"
  model?: string
  variant?: string
  temperature?: number
  top_p?: number
  prompt?: string
  disable?: boolean
  hidden?: boolean
  color?: string
  steps?: number
  /** @deprecated Use steps instead. */
  maxSteps?: number
  options?: Record<string, unknown>
  /** @deprecated OpenCode v1.1.1+ uses permission as the canonical control surface. */
  tools?: Record<string, boolean>
  permission?: Record<string, OpenCodePermission | Record<string, OpenCodePermission>>
}

export type OpenCodeSkillsConfig = {
  paths?: string[]
  urls?: string[]
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
  pluginName?: string
  config: OpenCodeConfig
  agents: OpenCodeAgentFile[]
  // Commands are written as individual .md files, not in opencode.json. See ADR-001.
  commandFiles: OpenCodeCommandFile[]
  plugins: OpenCodePluginFile[]
  skillDirs: { sourceDir: string; name: string }[]
}
