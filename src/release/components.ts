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
  "cli",
  "compound-engineering",
  "coding-tutor",
  "marketplace",
  "cursor-marketplace",
]

const FILE_COMPONENT_MAP: Array<{ component: ReleaseComponent; prefixes: string[] }> = [
  {
    component: "cli",
    prefixes: ["src/", "package.json", "bun.lock", "tests/cli.test.ts"],
  },
  {
    component: "compound-engineering",
    prefixes: ["plugins/compound-engineering/"],
  },
  {
    component: "coding-tutor",
    prefixes: ["plugins/coding-tutor/"],
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
  cli: "cli",
  compound: "compound-engineering",
  "compound-engineering": "compound-engineering",
  "coding-tutor": "coding-tutor",
  marketplace: "marketplace",
  "cursor-marketplace": "cursor-marketplace",
}

const NON_RELEASABLE_TYPES = new Set(["docs", "chore", "test", "ci", "build", "style"])
const PATCH_TYPES = new Set(["fix", "perf", "refactor", "revert"])

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

  for (const [component, matchedFiles] of componentFiles.entries()) {
    if (component === "cli" && matchedFiles.length === 0) continue
    if (component !== "cli" && matchedFiles.length === 0) continue
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
  const ce = await readJson<PluginManifest>(`${cwd}/plugins/compound-engineering/.claude-plugin/plugin.json`)
  const codingTutor = await readJson<PluginManifest>(`${cwd}/plugins/coding-tutor/.claude-plugin/plugin.json`)
  const marketplace = await readJson<MarketplaceManifest>(`${cwd}/.claude-plugin/marketplace.json`)
  const cursorMarketplace = await readJson<MarketplaceManifest>(`${cwd}/.cursor-plugin/marketplace.json`)

  return {
    cli: root.version,
    "compound-engineering": ce.version,
    "coding-tutor": codingTutor.version,
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
