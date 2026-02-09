export type ClaudeMcpServer = {
  type?: string
  command?: string
  args?: string[]
  url?: string
  env?: Record<string, string>
  headers?: Record<string, string>
}

export type ClaudeManifest = {
  name: string
  version: string
  description?: string
  author?: {
    name?: string
    email?: string
    url?: string
  }
  keywords?: string[]
  agents?: string | string[]
  commands?: string | string[]
  skills?: string | string[]
  hooks?: string | string[] | ClaudeHooks
  mcpServers?: Record<string, ClaudeMcpServer> | string | string[]
}

export type ClaudeAgent = {
  name: string
  description?: string
  capabilities?: string[]
  model?: string
  body: string
  sourcePath: string
}

export type ClaudeCommand = {
  name: string
  description?: string
  argumentHint?: string
  model?: string
  allowedTools?: string[]
  disableModelInvocation?: boolean
  body: string
  sourcePath: string
}

export type ClaudeSkill = {
  name: string
  description?: string
  disableModelInvocation?: boolean
  sourceDir: string
  skillPath: string
}

export type ClaudePlugin = {
  root: string
  manifest: ClaudeManifest
  agents: ClaudeAgent[]
  commands: ClaudeCommand[]
  skills: ClaudeSkill[]
  hooks?: ClaudeHooks
  mcpServers?: Record<string, ClaudeMcpServer>
}

export type ClaudeHookCommand = {
  type: "command"
  command: string
  timeout?: number
}

export type ClaudeHookPrompt = {
  type: "prompt"
  prompt: string
}

export type ClaudeHookAgent = {
  type: "agent"
  agent: string
}

export type ClaudeHookEntry = ClaudeHookCommand | ClaudeHookPrompt | ClaudeHookAgent

export type ClaudeHookMatcher = {
  matcher?: string
  hooks: ClaudeHookEntry[]
}

export type ClaudeHooks = {
  hooks: Record<string, ClaudeHookMatcher[]>
}
