import { promises as fs } from "fs"
import path from "path"
import { readJson, readText, writeJson, writeText } from "../utils/files"
import type { ReleaseComponent } from "./types"

type ClaudePluginManifest = {
  version: string
  description?: string
  mcpServers?: Record<string, unknown>
}

type CursorPluginManifest = {
  version: string
  description?: string
}

type MarketplaceManifest = {
  metadata: {
    version: string
    description?: string
  }
  plugins: Array<{
    name: string
    version?: string
    description?: string
  }>
}

type SyncOptions = {
  root?: string
  componentVersions?: Partial<Record<ReleaseComponent, string>>
  write?: boolean
}

type FileUpdate = {
  path: string
  changed: boolean
}

export type MetadataSyncResult = {
  updates: FileUpdate[]
}

export async function countMarkdownFiles(root: string): Promise<number> {
  const entries = await fs.readdir(root, { withFileTypes: true })
  let total = 0

  for (const entry of entries) {
    const fullPath = path.join(root, entry.name)
    if (entry.isDirectory()) {
      total += await countMarkdownFiles(fullPath)
      continue
    }
    if (entry.isFile() && entry.name.endsWith(".md")) {
      total += 1
    }
  }

  return total
}

export async function countSkillDirectories(root: string): Promise<number> {
  const entries = await fs.readdir(root, { withFileTypes: true })
  let total = 0

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const skillPath = path.join(root, entry.name, "SKILL.md")
    try {
      await fs.access(skillPath)
      total += 1
    } catch {
      // Ignore non-skill directories.
    }
  }

  return total
}

export async function countMcpServers(pluginRoot: string): Promise<number> {
  const mcpPath = path.join(pluginRoot, ".mcp.json")
  const manifest = await readJson<{ mcpServers?: Record<string, unknown> }>(mcpPath)
  return Object.keys(manifest.mcpServers ?? {}).length
}

export async function buildCompoundEngineeringDescription(root: string): Promise<string> {
  const pluginRoot = path.join(root, "plugins", "compound-engineering")
  const agents = await countMarkdownFiles(path.join(pluginRoot, "agents"))
  const skills = await countSkillDirectories(path.join(pluginRoot, "skills"))
  const mcpServers = await countMcpServers(pluginRoot)
  return `AI-powered development tools. ${agents} agents, ${skills} skills, ${mcpServers} MCP server${mcpServers === 1 ? "" : "s"} for code review, research, design, and workflow automation.`
}

export async function syncReleaseMetadata(options: SyncOptions = {}): Promise<MetadataSyncResult> {
  const root = options.root ?? process.cwd()
  const write = options.write ?? false
  const versions = options.componentVersions ?? {}
  const updates: FileUpdate[] = []

  const compoundDescription = await buildCompoundEngineeringDescription(root)

  const compoundClaudePath = path.join(root, "plugins", "compound-engineering", ".claude-plugin", "plugin.json")
  const compoundCursorPath = path.join(root, "plugins", "compound-engineering", ".cursor-plugin", "plugin.json")
  const codingTutorClaudePath = path.join(root, "plugins", "coding-tutor", ".claude-plugin", "plugin.json")
  const codingTutorCursorPath = path.join(root, "plugins", "coding-tutor", ".cursor-plugin", "plugin.json")
  const marketplaceClaudePath = path.join(root, ".claude-plugin", "marketplace.json")

  const compoundClaude = await readJson<ClaudePluginManifest>(compoundClaudePath)
  const compoundCursor = await readJson<CursorPluginManifest>(compoundCursorPath)
  const codingTutorClaude = await readJson<ClaudePluginManifest>(codingTutorClaudePath)
  const codingTutorCursor = await readJson<CursorPluginManifest>(codingTutorCursorPath)
  const marketplaceClaude = await readJson<MarketplaceManifest>(marketplaceClaudePath)

  let changed = false
  if (versions["compound-engineering"] && compoundClaude.version !== versions["compound-engineering"]) {
    compoundClaude.version = versions["compound-engineering"]
    changed = true
  }
  if (compoundClaude.description !== compoundDescription) {
    compoundClaude.description = compoundDescription
    changed = true
  }
  updates.push({ path: compoundClaudePath, changed })
  if (write && changed) await writeJson(compoundClaudePath, compoundClaude)

  changed = false
  if (versions["compound-engineering"] && compoundCursor.version !== versions["compound-engineering"]) {
    compoundCursor.version = versions["compound-engineering"]
    changed = true
  }
  if (compoundCursor.description !== compoundDescription) {
    compoundCursor.description = compoundDescription
    changed = true
  }
  updates.push({ path: compoundCursorPath, changed })
  if (write && changed) await writeJson(compoundCursorPath, compoundCursor)

  changed = false
  if (versions["coding-tutor"] && codingTutorClaude.version !== versions["coding-tutor"]) {
    codingTutorClaude.version = versions["coding-tutor"]
    changed = true
  }
  updates.push({ path: codingTutorClaudePath, changed })
  if (write && changed) await writeJson(codingTutorClaudePath, codingTutorClaude)

  changed = false
  if (versions["coding-tutor"] && codingTutorCursor.version !== versions["coding-tutor"]) {
    codingTutorCursor.version = versions["coding-tutor"]
    changed = true
  }
  updates.push({ path: codingTutorCursorPath, changed })
  if (write && changed) await writeJson(codingTutorCursorPath, codingTutorCursor)

  changed = false
  if (versions.marketplace && marketplaceClaude.metadata.version !== versions.marketplace) {
    marketplaceClaude.metadata.version = versions.marketplace
    changed = true
  }

  for (const plugin of marketplaceClaude.plugins) {
    if (plugin.name === "compound-engineering") {
      if (versions["compound-engineering"] && plugin.version !== versions["compound-engineering"]) {
        plugin.version = versions["compound-engineering"]
        changed = true
      }
      if (plugin.description !== `AI-powered development tools that get smarter with every use. Make each unit of engineering work easier than the last. Includes ${await countMarkdownFiles(path.join(root, "plugins", "compound-engineering", "agents"))} specialized agents and ${await countSkillDirectories(path.join(root, "plugins", "compound-engineering", "skills"))} skills.`) {
        plugin.description = `AI-powered development tools that get smarter with every use. Make each unit of engineering work easier than the last. Includes ${await countMarkdownFiles(path.join(root, "plugins", "compound-engineering", "agents"))} specialized agents and ${await countSkillDirectories(path.join(root, "plugins", "compound-engineering", "skills"))} skills.`
        changed = true
      }
    }

    if (plugin.name === "coding-tutor" && versions["coding-tutor"] && plugin.version !== versions["coding-tutor"]) {
      plugin.version = versions["coding-tutor"]
      changed = true
    }
  }

  updates.push({ path: marketplaceClaudePath, changed })
  if (write && changed) await writeJson(marketplaceClaudePath, marketplaceClaude)

  return { updates }
}

export async function updateRootChangelog(options: {
  root?: string
  entries: Array<{ component: ReleaseComponent; version: string; date: string; sections: Record<string, string[]> }>
  write?: boolean
}): Promise<{ path: string; changed: boolean; content: string }> {
  const root = options.root ?? process.cwd()
  const changelogPath = path.join(root, "CHANGELOG.md")
  const existing = await readText(changelogPath)
  const renderedEntries = options.entries
    .map((entry) => renderChangelogEntry(entry.component, entry.version, entry.date, entry.sections))
    .join("\n\n")
  const next = `${existing.trimEnd()}\n\n${renderedEntries}\n`
  const changed = next !== existing
  if (options.write && changed) {
    await writeText(changelogPath, next)
  }
  return { path: changelogPath, changed, content: next }
}

export function renderChangelogEntry(
  component: ReleaseComponent,
  version: string,
  date: string,
  sections: Record<string, string[]>,
): string {
  const lines = [`## ${component} v${version} - ${date}`]
  for (const [section, items] of Object.entries(sections)) {
    if (items.length === 0) continue
    lines.push("", `### ${section}`)
    for (const item of items) {
      lines.push(`- ${item}`)
    }
  }
  return lines.join("\n")
}
