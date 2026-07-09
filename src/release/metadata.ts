import { promises as fs } from "fs"
import type { Dirent } from "fs"
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

type RootPackageJson = {
  version: string
}

type CodexPluginManifest = {
  name: string
  version: string
  description?: string
  skills?: string
}

type KimiPluginManifest = {
  name: string
  version: string
  description?: string
  skills?: string
}

// Devin CLI manifests have no `skills` path field — Devin loads root `skills/`
// by convention. See docs/specs/devin.md.
type DevinPluginManifest = {
  name: string
  version: string
  description?: string
}

type AntigravityManifest = {
  version: string
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
    source?: {
      source?: string
      path?: string
      url?: string
    }
  }>
}

type KimiMarketplaceManifest = {
  version: string
  plugins: Array<{
    id: string
    displayName?: string
    source?: string
  }>
}

type GrokPluginManifest = {
  name: string
  version: string
  description?: string
  skills?: string
}

type GrokMarketplaceManifest = {
  name?: string
  owner?: { name?: string }
  plugins: Array<{
    name: string
    source?: {
      source?: string
      type?: string
      url?: string
      path?: string
    }
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
  "Brainstorm, plan, debug, review, and compound learnings with AI agents"

const COMPOUND_ENGINEERING_MARKETPLACE_DESCRIPTION =
  "Brainstorm, plan, debug, review, and compound learnings with AI agents"

function resolveExpectedVersion(
  explicitVersion: string | undefined,
  fallbackVersion: string,
): string {
  return explicitVersion ?? fallbackVersion
}

export async function countMarkdownFiles(root: string): Promise<number> {
  let entries: Dirent[]
  try {
    entries = await fs.readdir(root, { withFileTypes: true })
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return 0
    throw err
  }
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
  const pluginRoot = root
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

async function validateDeclaredSkillsPath(
  manifestPath: string,
  pluginName: string,
  platformName: string,
  skills: string | undefined,
  errors: string[],
): Promise<void> {
  if (skills === undefined) {
    errors.push(`${manifestPath} (${pluginName}): missing required field "skills". ${platformName} plugins must declare a skills path (e.g., "./skills/").`)
    return
  }

  const pluginDir = path.dirname(path.dirname(manifestPath))
  const skillsDir = path.resolve(pluginDir, skills)
  try {
    const stat = await fs.stat(skillsDir)
    if (!stat.isDirectory()) {
      errors.push(`${manifestPath} declares skills: "${skills}" but ${skillsDir} is not a directory`)
    }
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      errors.push(`${manifestPath} declares skills: "${skills}" but ${skillsDir} does not exist`)
    } else {
      throw err
    }
  }
}

export async function syncReleaseMetadata(options: SyncOptions = {}): Promise<MetadataSyncResult> {
  const root = options.root ?? process.cwd()
  const write = options.write ?? false
  const versions = options.componentVersions ?? {}
  const updates: FileUpdate[] = []
  const errors: string[] = []

  const compoundDescription = await buildCompoundEngineeringDescription(root)
  const compoundMarketplaceDescription = await buildCompoundEngineeringMarketplaceDescription(root)

  const compoundPackagePath = path.join(root, "package.json")
  const compoundClaudePath = path.join(root, ".claude-plugin", "plugin.json")
  const compoundCursorPath = path.join(root, ".cursor-plugin", "plugin.json")
  const compoundAntigravityPath = path.join(root, "plugin.json")
  const compoundKimiPath = path.join(root, ".kimi-plugin", "plugin.json")
  const compoundDevinPath = path.join(root, ".devin-plugin", "plugin.json")
  const marketplaceClaudePath = path.join(root, ".claude-plugin", "marketplace.json")
  const marketplaceCursorPath = path.join(root, ".cursor-plugin", "marketplace.json")

  const compoundPackage = await readJson<RootPackageJson>(compoundPackagePath)
  const compoundClaude = await readJson<ClaudePluginManifest>(compoundClaudePath)
  const compoundCursor = await readJson<CursorPluginManifest>(compoundCursorPath)
  const marketplaceClaude = await readJson<MarketplaceManifest>(marketplaceClaudePath)
  const marketplaceCursor = await readJson<MarketplaceManifest>(marketplaceCursorPath)
  const expectedCompoundVersion = resolveExpectedVersion(
    versions["compound-engineering"],
    compoundClaude.version,
  )

  updates.push({
    path: compoundPackagePath,
    changed: compoundPackage.version !== expectedCompoundVersion,
  })

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

  // Antigravity bundle version sync is detect-only. release-please owns the
  // write via extra-files, same as the Codex native plugin manifest.
  try {
    const compoundAntigravity = await readJson<AntigravityManifest>(compoundAntigravityPath)
    updates.push({
      path: compoundAntigravityPath,
      changed: compoundAntigravity.version !== expectedCompoundVersion,
    })
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      errors.push(`${compoundAntigravityPath} is missing but ${compoundClaudePath} exists. Antigravity plugin.json parity required.`)
      updates.push({ path: compoundAntigravityPath, changed: false })
    } else {
      throw err
    }
  }

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
  const compoundCodexPath = path.join(root, ".codex-plugin", "plugin.json")
  const marketplaceCodexPath = path.join(root, ".agents", "plugins", "marketplace.json")
  const marketplaceKimiPath = path.join(root, ".kimi-plugin", "marketplace.json")

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
    await validateDeclaredSkillsPath(codexPath, expectedName, "Codex", codex.skills, errors)

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
    for (const plugin of marketplaceCodex.plugins) {
      if (plugin.source?.source === "local" && plugin.source.path === "./") {
        errors.push(
          `${marketplaceCodexPath}: plugin "${plugin.name}" uses source.path "./"; Codex does not enumerate marketplace entries that point back at the marketplace root. Use a plugin subdirectory path or a Git URL source.`,
        )
      }
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

  // Kimi manifests. Kimi Code CLI supports root-native plugin manifests at
  // `.kimi-plugin/plugin.json`; like Codex, its marketplace catalog has no
  // release-owned metadata version, so the plugin version is detect-only here
  // and release-please owns the write via the root component's extra-files.
  let kimi: KimiPluginManifest
  let kimiManifestMissing = false
  try {
    kimi = await readJson<KimiPluginManifest>(compoundKimiPath)
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      kimiManifestMissing = true
      errors.push(`${compoundKimiPath} is missing but ${compoundClaudePath} exists. Kimi manifest parity required.`)
      updates.push({ path: compoundKimiPath, changed: false })
      kimi = { name: "compound-engineering", version: compoundClaude.version }
    } else {
      throw err
    }
  }

  if (kimi.name !== "compound-engineering") {
    errors.push(`${compoundKimiPath}: name "${kimi.name}" does not match expected "compound-engineering"`)
  }

  let kimiChanged = false
  if (kimi.version !== compoundClaude.version) {
    kimiChanged = true
  }
  if (compoundClaude.description !== undefined && kimi.description !== compoundClaude.description) {
    kimi.description = compoundClaude.description
    kimiChanged = true
  }
  await validateDeclaredSkillsPath(compoundKimiPath, "compound-engineering", "Kimi", kimi.skills, errors)
  updates.push({ path: compoundKimiPath, changed: kimiChanged })
  if (write && kimiChanged && !kimiManifestMissing) await writeJson(compoundKimiPath, kimi)

  try {
    const marketplaceKimi = await readJson<KimiMarketplaceManifest>(marketplaceKimiPath)
    if (marketplaceKimi.version !== "2") {
      errors.push(`${marketplaceKimiPath}: version "${marketplaceKimi.version}" does not match expected Kimi marketplace schema version "2"`)
    }
    const claudeNames = [...marketplaceClaude.plugins.map((p) => p.name)].sort()
    const kimiIds = [...marketplaceKimi.plugins.map((p) => p.id)].sort()
    if (claudeNames.join("|") !== kimiIds.join("|")) {
      errors.push(
        `${marketplaceKimiPath}: plugin list [${kimiIds.join(", ")}] does not match ${marketplaceClaudePath} [${claudeNames.join(", ")}]`,
      )
    }
    for (const plugin of marketplaceKimi.plugins) {
      if (typeof plugin.source !== "string" || plugin.source.trim() === "") {
        errors.push(
          `${marketplaceKimiPath}: plugin "${plugin.id}" is missing required field "source". Kimi marketplace entries must point to a local path, zip URL, or GitHub URL.`,
        )
      } else if (plugin.source === "./" || plugin.source === ".") {
        errors.push(
          `${marketplaceKimiPath}: plugin "${plugin.id}" uses source "${plugin.source}". Use a GitHub URL so Kimi can install the root-native plugin from a published marketplace catalog.`,
        )
      }
    }
    updates.push({ path: marketplaceKimiPath, changed: false })
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      errors.push(`${marketplaceKimiPath} is missing but ${marketplaceClaudePath} exists. Kimi marketplace parity required.`)
      updates.push({ path: marketplaceKimiPath, changed: false })
    } else {
      throw err
    }
  }

  // Grok manifests. Grok Build supports a native plugin manifest at
  // `.grok-plugin/plugin.json` (shadowed by root plugin.json at runtime in this
  // multi-platform repo, but the required native surface for xai-org submission).
  // Like Codex/Kimi, its marketplace catalog has no release-owned metadata
  // version, so the plugin version is detect-only here and release-please owns
  // the write via the root component's extra-files.
  const compoundGrokPath = path.join(root, ".grok-plugin", "plugin.json")
  const marketplaceGrokPath = path.join(root, ".grok-plugin", "marketplace.json")

  let grok: GrokPluginManifest
  let grokManifestMissing = false
  try {
    grok = await readJson<GrokPluginManifest>(compoundGrokPath)
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      grokManifestMissing = true
      errors.push(`${compoundGrokPath} is missing but ${compoundClaudePath} exists. Grok manifest parity required.`)
      updates.push({ path: compoundGrokPath, changed: false })
      grok = { name: "compound-engineering", version: compoundClaude.version }
    } else {
      throw err
    }
  }

  if (grok.name !== "compound-engineering") {
    errors.push(`${compoundGrokPath}: name "${grok.name}" does not match expected "compound-engineering"`)
  }

  let grokChanged = false
  if (grok.version !== compoundClaude.version) {
    grokChanged = true
  }
  if (compoundClaude.description !== undefined && grok.description !== compoundClaude.description) {
    grok.description = compoundClaude.description
    grokChanged = true
  }
  await validateDeclaredSkillsPath(compoundGrokPath, "compound-engineering", "Grok", grok.skills, errors)
  updates.push({ path: compoundGrokPath, changed: grokChanged })
  if (write && grokChanged && !grokManifestMissing) await writeJson(compoundGrokPath, grok)

  // Grok marketplace: plugin-list parity with Claude, and a valid non-self-
  // referential source per plugin. Grok (like Codex/Kimi) does not enumerate
  // marketplace entries that point back at the marketplace root, so a bare Git
  // URL source is required; the catalog has no release-owned version field.
  try {
    const marketplaceGrok = await readJson<GrokMarketplaceManifest>(marketplaceGrokPath)
    const claudeNames = [...marketplaceClaude.plugins.map((p) => p.name)].sort()
    const grokNames = [...marketplaceGrok.plugins.map((p) => p.name)].sort()
    if (claudeNames.join("|") !== grokNames.join("|")) {
      errors.push(
        `${marketplaceGrokPath}: plugin list [${grokNames.join(", ")}] does not match ${marketplaceClaudePath} [${claudeNames.join(", ")}]`,
      )
    }
    for (const plugin of marketplaceGrok.plugins) {
      const src = plugin.source
      if (!src || (typeof src.url !== "string" && typeof src.path !== "string")) {
        errors.push(
          `${marketplaceGrokPath}: plugin "${plugin.name}" is missing a valid "source". Grok marketplace entries need a URL source ({ "source": "url", "url": ... }) or a local path source.`,
        )
      } else if (src.path === "./" || src.path === ".") {
        errors.push(
          `${marketplaceGrokPath}: plugin "${plugin.name}" uses a self-referential local source "${src.path}". Grok does not enumerate marketplace entries that point back at the marketplace root; use a Git URL source.`,
        )
      }
    }
    updates.push({ path: marketplaceGrokPath, changed: false })
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      errors.push(`${marketplaceGrokPath} is missing but ${marketplaceClaudePath} exists. Grok marketplace parity required.`)
      updates.push({ path: marketplaceGrokPath, changed: false })
    } else {
      throw err
    }
  }

  // Devin manifest. Devin CLI installs the repo natively from
  // `.devin-plugin/plugin.json` plus the root `skills/` directory. The manifest
  // schema has no `skills` path field and Devin has no marketplace catalog, so
  // unlike Kimi there is no declared-skills-path or marketplace parity check.
  // Version sync is detect-only — release-please owns the write via extra-files.
  // A missing manifest short-circuits after the parity error (same as Codex),
  // so it reports exactly one unchanged update entry.
  let devin: DevinPluginManifest | undefined
  try {
    devin = await readJson<DevinPluginManifest>(compoundDevinPath)
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      errors.push(`${compoundDevinPath} is missing but ${compoundClaudePath} exists. Devin manifest parity required.`)
      updates.push({ path: compoundDevinPath, changed: false })
    } else {
      throw err
    }
  }

  if (devin) {
    if (devin.name !== "compound-engineering") {
      errors.push(`${compoundDevinPath}: name "${devin.name}" does not match expected "compound-engineering"`)
    }

    let devinChanged = false
    if (devin.version !== compoundClaude.version) {
      devinChanged = true
    }
    if (compoundClaude.description !== undefined && devin.description !== compoundClaude.description) {
      devin.description = compoundClaude.description
      devinChanged = true
    }
    updates.push({ path: compoundDevinPath, changed: devinChanged })
    if (write && devinChanged) await writeJson(compoundDevinPath, devin)
  }

  return { updates, errors }
}
