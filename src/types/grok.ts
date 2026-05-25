export type GrokSkill = {
  name: string
  content: string // Full SKILL.md with YAML frontmatter
}

export type GrokSkillDir = {
  name: string
  sourceDir: string
}

export type GrokCommand = {
  name: string
  content: string // Full command file content
}

export type GrokAgent = {
  name: string
  content: string // Full agent Markdown file with Grok-style YAML frontmatter
}

export type GrokMcpServer = {
  command?: string
  args?: string[]
  env?: Record<string, string>
  url?: string
  headers?: Record<string, string>
}

export type GrokPluginJson = {
  name: string
  version: string
  description?: string
}

export type GrokBundle = {
  pluginName?: string
  generatedSkills: GrokSkill[] // Target-specific generated skills (usually empty for Grok)
  skillDirs: GrokSkillDir[] // From skills (pass-through)
  agents?: GrokAgent[] // From Claude agents, transformed
  commands: GrokCommand[]
  mcpServers?: Record<string, GrokMcpServer>
  pluginJson?: GrokPluginJson
}
