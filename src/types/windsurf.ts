export type WindsurfWorkflow = {
  name: string
  description: string
  body: string
}

export type WindsurfGeneratedSkill = {
  name: string
  content: string
}

export type WindsurfSkillDir = {
  name: string
  sourceDir: string
}

export type WindsurfMcpServerEntry = {
  command?: string
  args?: string[]
  env?: Record<string, string>
  serverUrl?: string
  headers?: Record<string, string>
}

export type WindsurfMcpConfig = {
  mcpServers: Record<string, WindsurfMcpServerEntry>
}

export type WindsurfBundle = {
  agentSkills: WindsurfGeneratedSkill[]
  commandWorkflows: WindsurfWorkflow[]
  skillDirs: WindsurfSkillDir[]
  mcpConfig: WindsurfMcpConfig | null
}
