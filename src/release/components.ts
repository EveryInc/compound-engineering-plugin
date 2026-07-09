import { readJson } from "../utils/files"
import type {
  BumpLevel,
  BumpOverride,
  ComponentDecision,
  ParsedReleaseIntent,
  ReleaseComponent,
  ReleasePreview,
} from "./types"

const RELEASE_COMPONENTS: ReleaseComponent[] = [
  "compound-engineering",
  "marketplace",
  "cursor-marketplace",
]

const FILE_COMPONENT_MAP: Array<{ component: ReleaseComponent; prefixes: string[] }> = [
  {
    component: "compound-engineering",
    prefixes: [
      "skills/",
      "plugin.json",
      ".claude-plugin/plugin.json",
      ".cursor-plugin/plugin.json",
      ".codex-plugin/",
      ".kimi-plugin/plugin.json",
      ".grok-plugin/",
      ".devin-plugin/plugin.json",
      ".opencode/",
      ".pi/",
      "AGENTS.md",
      "CLAUDE.md",
      ".agy/",
      "GEMINI.md", // retained: agy still reads the Gemini-format context file
      "README.md",
      "package.json",
      "src/",
      "tests/",
    ],
  },
  {
    component: "marketplace",
    prefixes: [".claude-plugin/marketplace.json"],
  },
  {
    component: "cursor-marketplace",
    prefixes: [".cursor-plugin/marketplace.json"],
  },
]

const SCOPES_TO_COMPONENTS: Record<string, ReleaseComponent> = {
  compound: "compound-engineering",
  "compound-engineering": "compound-engineering",
  marketplace: "marketplace",
  "cursor-marketplace": "cursor-marketplace",
}

const NON_RELEASABLE_TYPES = new Set(["docs", "chore", "test", "ci", "build", "style"])
const PATCH_TYPES = new Set(["fix", "perf", "revert"])

type VersionSources = Record<ReleaseComponent, string>

type RootPackageJson = {
  version: string
}

type PluginManifest = {
  version: string
}

type MarketplaceManifest = {
  metadata: {
    version: string
  }
}

export function parseReleaseIntent(rawTitle: string): ParsedReleaseIntent {
  const trimmed = rawTitle.trim()
  const match = /^(?<type>[a-z]+)(?:\((?<scope>[^)]+)\))?(?<bang>!)?:\s+(?<description>.+)$/.exec(trimmed)

  if (!match?.groups) {
    return {
      raw: rawTitle,
      type: null,
      scope: null,
      description: null,
      breaking: false,
    }
  }

  return {
    raw: rawTitle,
    type: match.groups.type ?? null,
    scope: match.groups.scope ?? null,
    description: match.groups.description ?? null,
    breaking: match.groups.bang === "!",
  }
}

export function inferBumpFromIntent(intent: ParsedReleaseIntent): BumpLevel | null {
  if (intent.breaking) return "major"
  if (!intent.type) return null
  if (intent.type === "feat") return "minor"
  if (PATCH_TYPES.has(intent.type)) return "patch"
  if (NON_RELEASABLE_TYPES.has(intent.type)) return null
  return null
}

export function detectComponentsFromFiles(files: string[]): Map<ReleaseComponent, string[]> {
  const componentFiles = new Map<ReleaseComponent, string[]>()

  for (const component of RELEASE_COMPONENTS) {
    componentFiles.set(component, [])
  }

  for (const file of files) {
    for (const mapping of FILE_COMPONENT_MAP) {
      if (mapping.prefixes.some((prefix) => file === prefix || file.startsWith(prefix))) {
        componentFiles.get(mapping.component)!.push(file)
      }
    }
  }

  return componentFiles
}

export function resolveComponentWarnings(
  intent: ParsedReleaseIntent,
  detectedComponents: ReleaseComponent[],
): string[] {
  const warnings: string[] = []

  if (!intent.type) {
    warnings.push("Title does not match the expected conventional format: <type>(optional-scope): description")
    return warnings
  }

  if (intent.scope) {
    const normalized = intent.scope.trim().toLowerCase()
    const expected = SCOPES_TO_COMPONENTS[normalized]
    if (expected && detectedComponents.length > 0 && !detectedComponents.includes(expected)) {
      warnings.push(
        `Optional scope "${intent.scope}" does not match the detected component set: ${detectedComponents.join(", ")}`,
      )
    }
  }

  if (detectedComponents.length === 0 && inferBumpFromIntent(intent) !== null) {
    warnings.push("No releasable component files were detected for this change")
  }

  return warnings
}

export function applyOverride(
  inferred: BumpLevel | null,
  override: BumpOverride,
): BumpLevel | null {
  if (override === "auto") return inferred
  return override
}

export function bumpVersion(version: string, bump: BumpLevel | null): string | null {
  if (!bump) return null

  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version)
  if (!match) {
    throw new Error(`Unsupported version format: ${version}`)
  }

  const major = Number(match[1])
  const minor = Number(match[2])
  const patch = Number(match[3])

  switch (bump) {
    case "major":
      return `${major + 1}.0.0`
    case "minor":
      return `${major}.${minor + 1}.0`
    case "patch":
      return `${major}.${minor}.${patch + 1}`
  }
}

export async function loadCurrentVersions(cwd = process.cwd()): Promise<VersionSources> {
  const root = await readJson<RootPackageJson>(`${cwd}/package.json`)
  const ce = await readJson<PluginManifest>(`${cwd}/.claude-plugin/plugin.json`)
  const antigravity = await readJson<PluginManifest>(`${cwd}/plugin.json`)
  const kimi = await readJson<PluginManifest>(`${cwd}/.kimi-plugin/plugin.json`)
  const grok = await readJson<PluginManifest>(`${cwd}/.grok-plugin/plugin.json`)
  const devin = await readJson<PluginManifest>(`${cwd}/.devin-plugin/plugin.json`)
  const marketplace = await readJson<MarketplaceManifest>(`${cwd}/.claude-plugin/marketplace.json`)
  const cursorMarketplace = await readJson<MarketplaceManifest>(`${cwd}/.cursor-plugin/marketplace.json`)

  if (root.version !== ce.version) {
    throw new Error(`package.json version ${root.version} does not match .claude-plugin/plugin.json version ${ce.version}`)
  }

  if (root.version !== antigravity.version) {
    throw new Error(`package.json version ${root.version} does not match plugin.json version ${antigravity.version}`)
  }

  if (root.version !== kimi.version) {
    throw new Error(`package.json version ${root.version} does not match .kimi-plugin/plugin.json version ${kimi.version}`)
  }

  if (root.version !== grok.version) {
    throw new Error(`package.json version ${root.version} does not match .grok-plugin/plugin.json version ${grok.version}`)
  }

  if (root.version !== devin.version) {
    throw new Error(`package.json version ${root.version} does not match .devin-plugin/plugin.json version ${devin.version}`)
  }

  return {
    "compound-engineering": ce.version,
    marketplace: marketplace.metadata.version,
    "cursor-marketplace": cursorMarketplace.metadata.version,
  }
}

export async function buildReleasePreview(options: {
  title: string
  files: string[]
  overrides?: Partial<Record<ReleaseComponent, BumpOverride>>
  cwd?: string
}): Promise<ReleasePreview> {
  const intent = parseReleaseIntent(options.title)
  const inferredBump = inferBumpFromIntent(intent)
  const componentFilesMap = detectComponentsFromFiles(options.files)
  const currentVersions = await loadCurrentVersions(options.cwd)

  const detectedComponents = RELEASE_COMPONENTS.filter(
    (component) => (componentFilesMap.get(component) ?? []).length > 0,
  )

  const warnings = resolveComponentWarnings(intent, detectedComponents)

  const components: ComponentDecision[] = detectedComponents.map((component) => {
    const override = options.overrides?.[component] ?? "auto"
    const effectiveBump = applyOverride(inferredBump, override)
    const currentVersion = currentVersions[component]

    return {
      component,
      files: componentFilesMap.get(component) ?? [],
      currentVersion,
      inferredBump,
      effectiveBump,
      override,
      nextVersion: bumpVersion(currentVersion, effectiveBump),
    }
  })

  return {
    intent,
    warnings,
    components,
  }
}
