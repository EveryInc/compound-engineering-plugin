export type CursorRule = {
  name: string
  content: string
}

export type CursorCommand = {
  name: string
  content: string
}

export type CursorSkillDir = {
  name: string
  sourceDir: string
}

export type CursorMcpServer = {
  command?: string
  args?: string[]
  env?: Record<string, string>
  url?: string
  headers?: Record<string, string>
}

export type CursorBundle = {
  rules: CursorRule[]
  commands: CursorCommand[]
  skillDirs: CursorSkillDir[]
  mcpServers?: Record<string, CursorMcpServer>
}
