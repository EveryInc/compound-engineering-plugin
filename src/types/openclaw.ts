export type OpenClawPluginManifest = {
  id: string
  name: string
  kind: "tool"
  configSchema?: {
    type: "object"
    additionalProperties: boolean
    properties: Record<string, OpenClawConfigProperty>
    required?: string[]
  }
  uiHints?: Record<string, OpenClawUiHint>
  skills?: string[]
}

export type OpenClawConfigProperty = {
  type: string
  description?: string
  default?: unknown
}

export type OpenClawUiHint = {
  label: string
  sensitive?: boolean
  placeholder?: string
}

export type OpenClawSkillFile = {
  name: string
  content: string
  /** Subdirectory path inside skills/ (e.g. "agent-native-reviewer") */
  dir: string
}

export type OpenClawCommandRegistration = {
  name: string
  description: string
  acceptsArgs: boolean
  /** The prompt body that becomes the command handler response */
  body: string
}

export type OpenClawBundle = {
  manifest: OpenClawPluginManifest
  packageJson: Record<string, unknown>
  entryPoint: string
  skills: OpenClawSkillFile[]
  /** Skill directories to copy verbatim (original Claude skills with references/) */
  skillDirCopies: { sourceDir: string; name: string }[]
  commands: OpenClawCommandRegistration[]
  /** openclaw.json fragment for MCP servers */
  openclawConfig?: Record<string, unknown>
}
