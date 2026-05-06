export type GeminiSkill = {
  name: string
  content: string // Full SKILL.md with YAML frontmatter
}

export type GeminiSkillDir = {
  name: string
  sourceDir: string
}

export type GeminiCommand = {
  name: string // e.g. "plan" or "workflows/plan"
  content: string // Full TOML content
}

export type GeminiAgent = {
  name: string
  content: string // Full agent Markdown file with YAML frontmatter
}

export type GeminiMcpServer = {
  command?: string
  args?: string[]
  env?: Record<string, string>
  url?: string
  headers?: Record<string, string>
}

export type GeminiBundle = {
  pluginName?: string
  generatedSkills: GeminiSkill[] // Target-specific generated skills, if any
  skillDirs: GeminiSkillDir[] // From skills (pass-through)
  agents?: GeminiAgent[] // From Claude agents
  commands: GeminiCommand[]
  mcpServers?: Record<string, GeminiMcpServer>
}
