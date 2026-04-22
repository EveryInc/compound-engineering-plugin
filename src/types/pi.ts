export type PiPrompt = {
  name: string
  content: string
}

export type PiSkillDir = {
  name: string
  sourceDir: string
}

export type PiGeneratedSkill = {
  name: string
  content: string
}

export type PiGeneratedAgent = {
  name: string
  content: string
}

export type PiExtensionFile = {
  name: string
  content: string
}

export type PiMcporterServer = {
  description?: string
  baseUrl?: string
  command?: string
  args?: string[]
  env?: Record<string, string>
  headers?: Record<string, string>
}

export type PiMcporterConfig = {
  mcpServers: Record<string, PiMcporterServer>
}

export type PiBundle = {
  pluginName?: string
  prompts: PiPrompt[]
  skillDirs: PiSkillDir[]
  generatedSkills: PiGeneratedSkill[]
  agents: PiGeneratedAgent[]
  extensions: PiExtensionFile[]
  mcporterConfig?: PiMcporterConfig
}
