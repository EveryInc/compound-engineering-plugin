/**
 * KiloCode CLI bundle types.
 *
 * KiloCode uses:
 * - .kilocode/skills/ for project skills (SKILL.md format)
 * - ~/.kilocode/skills/ for global skills
 * - .kilo/agents/ or ~/.config/kilo/agents/ for custom subagents
 * - kilo.json for MCP configuration with "mcp" key
 *
 * @see https://kilocode.ai/docs/features/skills
 * @see https://kilocode.ai/docs/features/mcp
 */

export type KiloCodeSkillDir = {
  name: string
  sourceDir: string
}

export type KiloCodeAgent = {
  name: string
  content: string // Full file content with YAML frontmatter
}

export type KiloCodeMcpServer = {
  type: "local" | "remote"
  command?: string[]
  url?: string
  environment?: Record<string, string>
  headers?: Record<string, string>
  enabled?: boolean
}

export type KiloCodeConfig = {
  mcp?: Record<string, KiloCodeMcpServer>
}

export type KiloCodeBundle = {
  agents: KiloCodeAgent[]
  skillDirs: KiloCodeSkillDir[]
  mcpConfig: KiloCodeConfig
}
