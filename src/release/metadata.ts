import { promises as fs } from "fs"
import path from "path"
import { readJson, writeJson } from "../utils/files"
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

type CodexPluginManifest = {
  name: string
  version: string
  description?: string
  skills?: string
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

type CodexMarketplaceManifest = {
  name: string
  plugins: Array<{
    name: string
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
  errors: string[]
}

export type CompoundEngineeringCounts = {
  agents: number
  skills: number
  mcpServers: number
}

const COMPOUND_ENGINEERING_DESCRIPTION =
  "AI-powered development tools for code review, research, design, and workflow automation."

const COMPOUND_ENGINEERING_MARKETPLACE_DESCRIPTION =
  "AI-powered development tools that get smarter with every use. Make each unit of engineering work easier than the last."

function resolveExpectedVersion(
  explicitVersion: string | undefined,
  fallbackVersion: string,
): string {
  return explicitVersion ?? fallbackVersion
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
  try {
    const manifest = await readJson<{ mcpServers?: Record<string, unknown> }>(mcpPath)
    return Object.keys(manifest.mcpServers ?? {}).length
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return 0
    throw err
  }
}

export async function getCompoundEngineeringCounts(root: string): Promise<CompoundEngineeringCounts> {
  const pluginRoot = path.join(root, "plugins", "compound-engineering")
  const [agents, skills, mcpServers] = await Promise.all([
    countMarkdownFiles(path.join(pluginRoot, "agents")),
    countSkillDirectories(path.join(pluginRoot, "skills")),
    countMcpServers(pluginRoot),
  ])

  return { agents, skills, mcpServers }
}

export async function buildCompoundEngineeringDescription(_root: string): Promise<string> {
  return COMPOUND_ENGINEERING_DESCRIPTION
}

export async function buildCompoundEngineeringMarketplaceDescription(_root: string): Promise<string> {
  return COMPOUND_ENGINEERING_MARKETPLACE_DESCRIPTION
}

export async function syncReleaseMetadata(options: SyncOptions = {}): Promise<MetadataSyncResult> {
  const root = options.root ?? process.cwd()
  const write = options.write ?? false
  const versions = options.componentVersions ?? {}
  const updates: FileUpdate[] = []
  const errors: string[] = []

  const compoundDescription = await buildCompoundEngineeringDescription(root)
  const compoundMarketplaceDescription = await buildCompoundEngineeringMarketplaceDescription(root)

  const compoundClaudePath = path.join(root, "plugins", "compound-engineering", ".claude-plugin", "plugin.json")
  const compoundCursorPath = path.join(root, "plugins", "compound-engineering", ".cursor-plugin", "plugin.json")
  const codingTutorClaudePath = path.join(root, "plugins", "coding-tutor", ".claude-plugin", "plugin.json")
  const codingTutorCursorPath = path.join(root, "plugins", "coding-tutor", ".cursor-plugin", "plugin.json")
  const marketplaceClaudePath = path.join(root, ".claude-plugin", "marketplace.json")
  const marketplaceCursorPath = path.join(root, ".cursor-plugin", "marketplace.json")

  const compoundClaude = await readJson<ClaudePluginManifest>(compoundClaudePath)
  const compoundCursor = await readJson<CursorPluginManifest>(compoundCursorPath)
  const codingTutorClaude = await readJson<ClaudePluginManifest>(codingTutorClaudePath)
  const codingTutorCursor = await readJson<CursorPluginManifest>(codingTutorCursorPath)
  const marketplaceClaude = await readJson<MarketplaceManifest>(marketplaceClaudePath)
  const marketplaceCursor = await readJson<MarketplaceManifest>(marketplaceCursorPath)
  const expectedCompoundVersion = resolveExpectedVersion(
    versions["compound-engineering"],
    compoundClaude.version,
  )
  const expectedCodingTutorVersion = resolveExpectedVersion(
    versions["coding-tutor"],
    codingTutorClaude.version,
  )

  let changed = false
  if (compoundClaude.version !== expectedCompoundVersion) {
    compoundClaude.version = expectedCompoundVersion
    changed = true
  }
  if (compoundClaude.description !== compoundDescription) {
    compoundClaude.description = compoundDescription
    changed = true
  }
  updates.push({ path: compoundClaudePath, changed })
  if (write && changed) await writeJson(compoundClaudePath, compoundClaude)

  changed = false
  if (compoundCursor.version !== expectedCompoundVersion) {
    compoundCursor.version = expectedCompoundVersion
    changed = true
  }
  if (compoundCursor.description !== compoundDescription) {
    compoundCursor.description = compoundDescription
    changed = true
  }
  updates.push({ path: compoundCursorPath, changed })
  if (write && changed) await writeJson(compoundCursorPath, compoundCursor)

  changed = false
  if (codingTutorClaude.version !== expectedCodingTutorVersion) {
    codingTutorClaude.version = expectedCodingTutorVersion
    changed = true
  }
  updates.push({ path: codingTutorClaudePath, changed })
  if (write && changed) await writeJson(codingTutorClaudePath, codingTutorClaude)

  changed = false
  if (codingTutorCursor.version !== expectedCodingTutorVersion) {
    codingTutorCursor.version = expectedCodingTutorVersion
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
      if (plugin.description !== compoundMarketplaceDescription) {
        plugin.description = compoundMarketplaceDescription
        changed = true
      }
    }
    // Plugin versions are not synced in marketplace.json -- the canonical
    // version lives in each plugin's own plugin.json. Duplicating versions
    // here creates drift that release-please can't maintain.
  }

  updates.push({ path: marketplaceClaudePath, changed })
  if (write && changed) await writeJson(marketplaceClaudePath, marketplaceClaude)

  changed = false
  if (versions["cursor-marketplace"] && marketplaceCursor.metadata.version !== versions["cursor-marketplace"]) {
    marketplaceCursor.metadata.version = versions["cursor-marketplace"]
    changed = true
  }

  for (const plugin of marketplaceCursor.plugins) {
    if (plugin.name === "compound-engineering") {
      if (plugin.description !== compoundMarketplaceDescription) {
        plugin.description = compoundMarketplaceDescription
        changed = true
      }
    }
  }

  updates.push({ path: marketplaceCursorPath, changed })
  if (write && changed) await writeJson(marketplaceCursorPath, marketplaceCursor)

  // Codex manifests. Unlike Claude/Cursor, the Codex plugin.json is a
  // different schema at `.codex-plugin/plugin.json` and the marketplace lives
  // at `.agents/plugins/marketplace.json` (no metadata.version field). Plugin
  // version sync is DETECT-ONLY here — release-please owns the bump via
  // `extra-files` in `.github/release-please-config.json`. Duplicating the
  // write would create a second authority for the same field.
  const compoundCodexPath = path.join(root, "plugins", "compound-engineering", ".codex-plugin", "plugin.json")
  const codingTutorCodexPath = path.join(root, "plugins", "coding-tutor", ".codex-plugin", "plugin.json")
  const marketplaceCodexPath = path.join(root, ".agents", "plugins", "marketplace.json")

  const codexPluginTargets: Array<{
    claudePath: string
    claude: ClaudePluginManifest
    codexPath: string
    expectedName: string
  }> = [
    {
      claudePath: compoundClaudePath,
      claude: compoundClaude,
      codexPath: compoundCodexPath,
      expectedName: "compound-engineering",
    },
    {
      claudePath: codingTutorClaudePath,
      claude: codingTutorClaude,
      codexPath: codingTutorCodexPath,
      expectedName: "coding-tutor",
    },
  ]

  for (const { claudePath, claude, codexPath, expectedName } of codexPluginTargets) {
    let codex: CodexPluginManifest
    try {
      codex = await readJson<CodexPluginManifest>(codexPath)
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        errors.push(`${codexPath} is missing but ${claudePath} exists. Codex manifest parity required.`)
        updates.push({ path: codexPath, changed: false })
        continue
      }
      throw err
    }

    if (codex.name !== expectedName) {
      errors.push(`${codexPath}: name "${codex.name}" does not match expected "${expectedName}"`)
    }

    let codexChanged = false

    // Version: detect-only (release-please owns the write via extra-files).
    if (codex.version !== claude.version) {
      codexChanged = true
    }

    // Description: write-enabled (same pattern as Claude/Cursor description sync).
    if (claude.description !== undefined && codex.description !== claude.description) {
      codex.description = claude.description
      codexChanged = true
    }

    // Skills declaration: required. Codex native install is the source of
    // skills for each plugin (and `--to codex` defaults to agents-only), so a
    // missing `skills` field silently produces a broken install with no skills
    // registered. Enforce presence, then verify the directory exists.
    if (codex.skills === undefined) {
      errors.push(`${codexPath} (${expectedName}): missing required field "skills". Codex plugins must declare a skills path (e.g., "./skills/").`)
    } else {
      const pluginDir = path.dirname(path.dirname(codexPath))
      const skillsDir = path.resolve(pluginDir, codex.skills)
      try {
        const stat = await fs.stat(skillsDir)
        if (!stat.isDirectory()) {
          errors.push(`${codexPath} declares skills: "${codex.skills}" but ${skillsDir} is not a directory`)
        }
      } catch (err: unknown) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") {
          errors.push(`${codexPath} declares skills: "${codex.skills}" but ${skillsDir} does not exist`)
        } else {
          throw err
        }
      }
    }

    updates.push({ path: codexPath, changed: codexChanged })
    if (write && codexChanged) await writeJson(codexPath, codex)
  }

  // Codex marketplace: plugin-list parity with Claude marketplace. The Codex
  // marketplace has no metadata.version field and is treated as static content
  // (no release-please entry). Plugin list must mirror Claude exactly.
  try {
    const marketplaceCodex = await readJson<CodexMarketplaceManifest>(marketplaceCodexPath)
    const claudeNames = [...marketplaceClaude.plugins.map((p) => p.name)].sort()
    const codexNames = [...marketplaceCodex.plugins.map((p) => p.name)].sort()
    if (claudeNames.join("|") !== codexNames.join("|")) {
      errors.push(
        `${marketplaceCodexPath}: plugin list [${codexNames.join(", ")}] does not match ${marketplaceClaudePath} [${claudeNames.join(", ")}]`,
      )
    }
    updates.push({ path: marketplaceCodexPath, changed: false })
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      errors.push(`${marketplaceCodexPath} is missing but ${marketplaceClaudePath} exists. Codex marketplace parity required.`)
      updates.push({ path: marketplaceCodexPath, changed: false })
    } else {
      throw err
    }
  }

  return { updates, errors }
}
