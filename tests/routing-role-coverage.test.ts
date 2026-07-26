import { readFile, readdir, stat } from "fs/promises"
import path from "path"
import { describe, expect, test } from "bun:test"

const repoRoot = path.join(import.meta.dir, "..")
const skillsRoot = path.join(repoRoot, "skills")
const catalogPath = path.join(repoRoot, "scripts", "routing", "dispatch-roles.json")

type RoleMetadata = {
  class: string
  owner: string
  adapter_family: string
  built_in_tier: string
}

type SiteValue = string | Record<string, string>

type SiteMetadata = {
  file: string
  source_marker?: string
  roles: string[]
  adapter_family: SiteValue
  posture: string
  built_in_tier: SiteValue
  prompt_assets?: Record<string, string[]>
}

type Catalog = {
  classes: string[]
  roles: Record<string, RoleMetadata>
  sites: Record<string, SiteMetadata>
}

type Occurrence = {
  file: string
  line: number
  text: string
  annotation?: { kind: "site" | "exclude"; value: string; line: number }
}

const markerPattern = /ce-dispatch-(site|exclude):([a-z0-9][a-z0-9.-]*)/
const tokenPattern = /^[a-z0-9][a-z0-9-]*$/
const modelActorSource = "(?:sub-?agents?|agents?|workers?|reviewers?|personas?|peers?|scouts?|researchers?|verifiers?|validators?|judges?|fixers?|analysts?|critics?|generators?|investigators?|authors?|mappers?|experiments?|rosters?|fleets?|teams?)"
const dispatchModifiers = "(?:(?:one|a|an|the|each|every|all|selected|these|those|parallel|generic|read-only|lightweight|fresh|fresh-context|single|multiple|second|three|\\d+|~?\\d+|extraction-tier|generation-tier|ceiling-tier|general-purpose|recovery|singleton|evaluation|basis|fix|frame|research|ideation|local|materialized|full|default|same|affected|remaining|applicable|in-process)\\s+){0,6}"
const modelCli = /(?:codex(?:\s+--search)?\s+exec|claude\s+-p|grok\s+--prompt-file|cursor-agent\s+-p)/
const modelWorkerScript = /(?:elevation-dispatch|cross-model-adversarial-review|cross-model-doc-review|cross-model-pov|cross-model-work)\.sh/

async function catalogText(): Promise<string> {
  return readFile(catalogPath, "utf8")
}

async function catalog(): Promise<Catalog> {
  return JSON.parse(await catalogText()) as Catalog
}

async function walk(dir: string): Promise<string[]> {
  const files: string[] = []
  for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const file = path.join(dir, entry.name)
    if (entry.isDirectory()) files.push(...await walk(file))
    else if (entry.isFile()) files.push(file)
  }
  return files
}

function objectKeys(raw: string, property: string): string[] {
  const propertyIndex = raw.indexOf(JSON.stringify(property))
  if (propertyIndex < 0) return []
  const start = raw.indexOf("{", propertyIndex + property.length + 2)
  if (start < 0) return []

  const keys: string[] = []
  let depth = 1
  let index = start + 1
  while (index < raw.length && depth > 0) {
    const character = raw[index]
    if (character === '"') {
      const stringStart = index
      index++
      let escaped = false
      while (index < raw.length) {
        const current = raw[index]
        if (!escaped && current === '"') break
        escaped = !escaped && current === "\\"
        if (current !== "\\") escaped = false
        index++
      }
      const stringEnd = index
      index++
      if (depth === 1) {
        let cursor = index
        while (/\s/.test(raw[cursor] ?? "")) cursor++
        if (raw[cursor] === ":") keys.push(JSON.parse(raw.slice(stringStart, stringEnd + 1)) as string)
      }
      continue
    }
    if (character === "{") depth++
    else if (character === "}") depth--
    index++
  }
  return keys
}

function duplicates(values: string[]): string[] {
  const seen = new Set<string>()
  const repeated = new Set<string>()
  for (const value of values) {
    if (seen.has(value)) repeated.add(value)
    seen.add(value)
  }
  return [...repeated].sort()
}

function normalizeId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.|\.$/g, "")
}

function normalizationCollisions(values: string[]): string[] {
  const normalized = new Map<string, Set<string>>()
  for (const value of values) {
    const key = normalizeId(value)
    const aliases = normalized.get(key) ?? new Set<string>()
    aliases.add(value)
    normalized.set(key, aliases)
  }
  return [...normalized.entries()]
    .filter(([, aliases]) => aliases.size > 1)
    .map(([key, aliases]) => `${key}: ${[...aliases].sort().join(", ")}`)
    .sort()
}

function validateSiteValues(value: SiteValue, roles: string[], field: string, site: string): void {
  if (typeof value === "string") {
    expect(value, `${site}.${field} must be a stable token`).toMatch(tokenPattern)
    return
  }
  expect(Object.keys(value).sort(), `${site}.${field} must describe every site role`).toEqual([...roles].sort())
  for (const role of roles) {
    expect(value[role], `${site}.${field}.${role} must be a stable token`).toMatch(tokenPattern)
  }
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function isPromptOrGenerated(relative: string): boolean {
  return relative.endsWith("/references/execution-routing.md")
    || relative.includes("/references/agents/")
    || relative.includes("/references/personas/")
    || relative.includes("/references/sources/")
    || relative.includes("/assets/")
    || /(?:^|\/)(?:[^/]+-)?(?:prompt|subagent|validator)-template\.md$/.test(relative)
    || /-eval\.md$/.test(relative)
}

function annotationBefore(lines: string[], index: number): Occurrence["annotation"] {
  let annotationIndex = index - 1
  if (/^\s*```/.test(lines[annotationIndex] ?? "")) annotationIndex--
  const match = (lines[annotationIndex] ?? "").match(markerPattern)
  if (!match) return undefined
  return { kind: match[1] as "site" | "exclude", value: match[2], line: annotationIndex + 1 }
}

function hasPositiveModelVerb(line: string, verb: "dispatch" | "spawn" | "launch"): boolean {
  const pattern = new RegExp(`\\b(?:re-)?${verb}(?:ing)?\\s+${dispatchModifiers}${modelActorSource}\\b`, "ig")
  for (const match of line.matchAll(pattern)) {
    const prefix = line.slice(Math.max(0, match.index! - 40), match.index)
    if (/(?:do not|don't|never|without)\b[^.!?;:]{0,32}$/i.test(prefix)) continue
    if (/\bbefore\s+$/i.test(prefix)) continue
    if (/\bwill\s+$/i.test(prefix)) continue
    return true
  }
  return false
}

function isDispatchLine(lines: string[], index: number, extension: string): boolean {
  const line = lines[index]
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith("<!--") || (extension === ".sh" && trimmed.startsWith("#"))) return false
  if (extension === ".md" && trimmed.startsWith("|")) return false
  if (modelCli.test(line) && (/^\s*(?:CMD=\(|printf\b|cat\b)/.test(line)
    || /^\s*(?:codex(?:\s+--search)?\s+exec|claude\s+-p|grok\s+--prompt-file|cursor-agent\s+-p)/.test(line))) return true
  if (modelWorkerScript.test(line) && /(?:bash|peer-job-runner\.py[^\n]*\bstart\b)/.test(line)) return true
  if (/^#{1,6}\s/.test(trimmed)) return false
  if (/\buse\s+(?:generic\s+)?sub-?agents?\b/i.test(line)) return true
  if (new RegExp(`\\brun\\s+(?:these|the|selected|all|\\d+)\\s+${modelActorSource}\\b`, "i").test(line)) return true
  if (/\brun\s+(?:the\s+)?(?:judge evaluation|validator batch)\b/i.test(line)) return true
  if (/\brun:\s*$/i.test(line)) {
    const next = lines.slice(index + 1, index + 4).find((candidate) => candidate.trim() && !candidate.includes("ce-dispatch-")) ?? ""
    if (/references\/(?:agents|personas)\//.test(next)) return true
  }
  if (/\b(?:re-)?dispatch(?:ing)?\s+(?:parallel\s+)?(?:research|web searches?|cross-model calls?|model calls?)\b/i.test(line)) return true
  if (/\b(?:re-)?dispatch(?:ing)?\s+web research\b/i.test(line)) return true
  if (/\b(?:re-)?dispatch(?:ing)?\s+it\s+to\s+(?:parallel\s+)?scout sub-?agents?\b/i.test(line)) return true
  if (/\bdispatch\s+by\b.*\bsubagent primitive\b/i.test(line)) return true
  if (/\bdispatch\s+via\s+(?:Codex|Claude|Grok|Cursor|Composer)\b/i.test(line)) return true
  if (/\bdispatch\s+the\s+`ceil\([^`]+\)`\s+judge sub-?agents?\b/i.test(line)) return true
  if (/\bdispatch(?:ing)?\s+frames as parallel sub-?agents?\b/i.test(line)) return true
  if (/\*\*Native in-harness dispatch\.\*\*\s+Attempt the platform subagent primitive\b/i.test(line)) return true
  if (/\*\*Native dispatch \(inline\/subagent engines only\)\*\* uses your harness's subagent\/worker mechanism\b/i.test(line)) return true
  if (/\blaunch\s+the selected local prompt assets as generic subagents\b/i.test(line)) return true
  return hasPositiveModelVerb(line, "dispatch")
    || hasPositiveModelVerb(line, "spawn")
    || hasPositiveModelVerb(line, "launch")
}

function scanSource(relative: string, source: string): { occurrences: Occurrence[]; annotations: Occurrence["annotation"][] } {
  const extension = path.extname(relative)
  const lines = source.split("\n")
  const occurrences: Occurrence[] = []
  const annotations: Occurrence["annotation"][] = []
  let inFrontmatter = relative.endsWith("/SKILL.md") && lines[0] === "---"
  let inFence = false

  for (let index = 0; index < lines.length; index++) {
    if (inFrontmatter) {
      if (index > 0 && lines[index] === "---") inFrontmatter = false
      continue
    }
    if (extension === ".md" && /^\s*```/.test(lines[index])) {
      inFence = !inFence
      continue
    }
    const marker = lines[index].match(markerPattern)
    if (marker) annotations.push({ kind: marker[1] as "site" | "exclude", value: marker[2], line: index + 1 })
    if (inFence) continue
    if (!isDispatchLine(lines, index, extension)) continue
    occurrences.push({
      file: relative,
      line: index + 1,
      text: lines[index].trim(),
      annotation: annotationBefore(lines, index),
    })
  }
  return { occurrences, annotations }
}

async function dispatchSources(): Promise<Map<string, string>> {
  const sources = new Map<string, string>()
  for (const file of await walk(skillsRoot)) {
    const relative = path.relative(repoRoot, file)
    if (!/\.(?:md|sh)$/.test(file) || isPromptOrGenerated(relative)) continue
    sources.set(relative, await readFile(file, "utf8"))
  }
  return sources
}

describe("dispatch role coverage", () => {
  test("catalog IDs are unique before and after normalization", async () => {
    const raw = await catalogText()
    const roleIds = objectKeys(raw, "roles")
    const siteIds = objectKeys(raw, "sites")

    expect(roleIds.length).toBeGreaterThan(80)
    expect(siteIds.length).toBeGreaterThan(0)
    expect(duplicates(roleIds), "duplicate role keys must not be hidden by JSON.parse").toEqual([])
    expect(duplicates(siteIds), "duplicate site keys must not be hidden by JSON.parse").toEqual([])
    expect(normalizationCollisions(roleIds), "role IDs must remain unique after separator/case normalization").toEqual([])
    expect(normalizationCollisions(siteIds), "site IDs must remain unique after separator/case normalization").toEqual([])
  })

  test("all roles use stable CE-owned IDs and exactly one class", async () => {
    const value = await catalog()
    const validClasses = new Set(value.classes)

    expect(value.classes).toEqual(["implementation", "review", "reasoning", "research", "verification"])
    expect(Object.keys(value.roles).length).toBeGreaterThan(80)
    for (const [role, metadata] of Object.entries(value.roles)) {
      expect(role).toMatch(/^[a-z0-9-]+\.[a-z0-9][a-z0-9.-]*$/)
      expect(role.startsWith(`${metadata.owner}.`)).toBe(true)
      expect(validClasses.has(metadata.class)).toBe(true)
      expect(metadata.adapter_family).toMatch(tokenPattern)
      expect(metadata.built_in_tier).toMatch(tokenPattern)
      expect(role).not.toMatch(/(?:^|[.-])(?:claude|opencode|codex|cursor|grok|composer)(?:[.-]|$)/)
      await expect(stat(path.join(skillsRoot, metadata.owner, "SKILL.md"))).resolves.toMatchObject({})
    }
  })

  test("catalog sites, source markers, and roles form a checked graph", async () => {
    const value = await catalog()
    const covered = new Set<string>()
    const promptRoles = new Set<string>()
    const promptAssets = new Set<string>()

    for (const [site, metadata] of Object.entries(value.sites)) {
      expect(site).toMatch(/^[a-z0-9][a-z0-9.-]*$/)
      expect(metadata.file).toMatch(/^skills\/[a-z0-9-]+\/.+\.(?:md|sh)$/)
      expect(path.posix.normalize(metadata.file)).toBe(metadata.file)
      expect(metadata.roles.length, `${site} must cover at least one role`).toBeGreaterThan(0)
      expect(new Set(metadata.roles).size, `${site} repeats a role`).toBe(metadata.roles.length)
      expect(metadata.posture, `${site}.posture must be a stable token`).toMatch(tokenPattern)
      validateSiteValues(metadata.adapter_family, metadata.roles, "adapter_family", site)
      validateSiteValues(metadata.built_in_tier, metadata.roles, "built_in_tier", site)

      const source = await readFile(path.join(repoRoot, metadata.file), "utf8")
      const sourceMarker = metadata.source_marker ?? site
      expect(sourceMarker).toMatch(/^[a-z0-9][a-z0-9.-]*$/)
      const marker = `ce-dispatch-site:${sourceMarker}`
      const markerLine = metadata.file.endsWith(".sh") ? `# ${marker}` : `<!-- ${marker} -->`
      expect(source.split("\n").filter((line) => line.trim() === markerLine).length, `${metadata.file} must contain ${marker} exactly once`).toBe(1)
      const owners = new Set<string>()
      for (const role of metadata.roles) {
        expect(Object.hasOwn(value.roles, role), `${site} references unknown role ${role}`).toBe(true)
        owners.add(value.roles[role].owner)
        covered.add(role)
      }
      expect(owners.size, `${site} must not cross skill ownership`).toBe(1)
      expect(metadata.file.startsWith(`skills/${[...owners][0]}/`), `${site} must live under its role owner`).toBe(true)

      for (const [role, assets] of Object.entries(metadata.prompt_assets ?? {})) {
        expect(metadata.roles, `${site} prompt metadata has orphan role ${role}`).toContain(role)
        expect(assets.length, `${site} prompt metadata for ${role} must not be empty`).toBeGreaterThan(0)
        expect(new Set(assets).size, `${site} repeats a prompt asset for ${role}`).toBe(assets.length)
        promptRoles.add(role)
        for (const asset of assets) {
          expect(asset.startsWith(`skills/${value.roles[role].owner}/`), `${site} prompt asset must stay in its owner skill`).toBe(true)
          expect(path.posix.normalize(asset)).toBe(asset)
          promptAssets.add(asset)
        }
      }
    }

    expect([...covered].sort(), "catalog contains an orphan role").toEqual(Object.keys(value.roles).sort())

    const promptFiles = (await walk(skillsRoot))
      .map((file) => path.relative(repoRoot, file))
      .filter((file) => /\/references\/(?:agents|personas)\/[^/]+\.md$/.test(file))
    for (const [role, metadata] of Object.entries(value.roles)) {
      const stem = role.slice(metadata.owner.length + 1)
      if (promptFiles.includes(`skills/${metadata.owner}/references/agents/${stem}.md`)
        || promptFiles.includes(`skills/${metadata.owner}/references/personas/${stem}.md`)) {
        expect(promptRoles, `${role} has a prompt asset but no site metadata names it`).toContain(role)
      }
    }

    const activeSourceByOwner = new Map<string, string>()
    for (const [relative, source] of await dispatchSources()) {
      const owner = relative.split("/")[1]
      activeSourceByOwner.set(owner, `${activeSourceByOwner.get(owner) ?? ""}\n${source}`)
    }
    for (const asset of [...promptAssets].sort()) {
      const absolute = path.join(repoRoot, asset)
      const details = await stat(absolute)
      expect(details.isFile(), `${asset} must be a file`).toBe(true)
      const body = await readFile(absolute, "utf8")
      expect(body.trim().length, `${asset} must not be empty`).toBeGreaterThan(0)
      expect(body.startsWith("---\n"), `${asset} must remain frontmatter-free`).toBe(false)

      const [, owner, ...ownerPath] = asset.split("/")
      const relativeAsset = ownerPath.join("/")
      const activeSource = activeSourceByOwner.get(owner) ?? ""
      const dynamicSourceAsset = relativeAsset.replace(/references\/sources\/[^/]+\.md$/, "references/sources/<type>.md")
      const promptStem = path.posix.basename(relativeAsset, ".md")
      const dynamicPromptAsset = new RegExp(`${escapeRegex(path.posix.dirname(relativeAsset))}/<[^/<>]+>\\.md`).test(activeSource)
        && new RegExp(`(?:^|[^a-z0-9-])${escapeRegex(promptStem)}(?=$|[^a-z0-9-])`, "m").test(activeSource)
      expect(
        activeSource.includes(relativeAsset)
          || activeSource.includes(path.posix.basename(relativeAsset))
          || activeSource.includes(dynamicSourceAsset)
          || dynamicPromptAsset,
        `${asset} is present but inactive in ${owner}`,
      ).toBe(true)
    }
  })

  test("every dispatch occurrence has its own site or narrow exclusion", async () => {
    const value = await catalog()
    const sources = await dispatchSources()
    const occurrences: Occurrence[] = []
    const annotations: Array<Occurrence["annotation"] & { file: string }> = []
    const sourceSiteByMarker = new Map<string, string>()

    for (const [site, metadata] of Object.entries(value.sites)) {
      const key = `${metadata.file}:${metadata.source_marker ?? site}`
      expect(sourceSiteByMarker.has(key), `${metadata.file} repeats source marker ${metadata.source_marker ?? site}`).toBe(false)
      sourceSiteByMarker.set(key, site)
    }

    for (const [relative, source] of sources) {
      const scanned = scanSource(relative, source)
      occurrences.push(...scanned.occurrences)
      annotations.push(...scanned.annotations.map((annotation) => ({ ...annotation!, file: relative })))
    }

    const unclassified = occurrences
      .filter((occurrence) => !occurrence.annotation)
      .map((occurrence) => `${occurrence.file}:${occurrence.line}: ${occurrence.text}`)
    expect(unclassified, `unclassified dispatches:\n${unclassified.join("\n")}`).toEqual([])

    const usedAnnotations = new Set(occurrences.flatMap((occurrence) => occurrence.annotation
      ? [`${occurrence.file}:${occurrence.annotation.line}`]
      : []))
    const orphanAnnotations = annotations
      .filter((annotation) => !usedAnnotations.has(`${annotation.file}:${annotation.line}`))
      .map((annotation) => `${annotation.file}:${annotation.line}: ${annotation.kind}:${annotation.value}`)
    expect(orphanAnnotations, "annotations must be occurrence-local, not file-wide exemptions").toEqual([])

    for (const occurrence of occurrences) {
      const annotation = occurrence.annotation!
      const sourceLine = sources.get(occurrence.file)!.split("\n")[annotation.line - 1]
      if (occurrence.file.endsWith(".sh")) {
        expect(sourceLine).toMatch(/^\s*# ce-dispatch-(?:site|exclude):[a-z0-9][a-z0-9.-]*\s*$/)
      } else {
        expect(sourceLine).toMatch(/^\s*<!-- ce-dispatch-(?:site|exclude):[a-z0-9][a-z0-9.-]* -->\s*$/)
      }
      if (annotation.kind === "site") {
        const site = sourceSiteByMarker.get(`${occurrence.file}:${annotation.value}`)
        expect(site, `${occurrence.file}:${occurrence.line} has unknown site marker ${annotation.value}`).toBeDefined()
      }
      else expect(annotation.value).not.toMatch(/^(?:ignore|other|false-positive|file|whole-file|exempt)$/)
    }

    const sourceSites = occurrences
      .filter((occurrence) => occurrence.annotation?.kind === "site")
      .map((occurrence) => sourceSiteByMarker.get(`${occurrence.file}:${occurrence.annotation!.value}`)!)
    expect(duplicates(sourceSites), "a site ID must classify exactly one occurrence").toEqual([])
    expect(sourceSites.sort()).toEqual(Object.keys(value.sites).sort())
  })

  test("scanner does not exempt a whole file after one marker", () => {
    const source = [
      "<!-- ce-dispatch-site:ce-test.first -->",
      "Dispatch one generic subagent to inspect the first area.",
      "Dispatch one generic subagent to inspect the second area.",
    ].join("\n")
    const occurrences = scanSource("skills/ce-test/SKILL.md", source).occurrences

    expect(occurrences).toHaveLength(2)
    expect(occurrences[0].annotation?.value).toBe("ce-test.first")
    expect(occurrences[1].annotation).toBeUndefined()
  })

  test("raw duplicate keys and normalization aliases remain observable", () => {
    const raw = '{"roles":{"ce-test.foo-bar":{},"ce-test.foo.bar":{},"ce-test.foo-bar":{}},"sites":{}}'
    const roleIds = objectKeys(raw, "roles")

    expect(duplicates(roleIds)).toEqual(["ce-test.foo-bar"])
    expect(normalizationCollisions(roleIds)).toEqual(["ce.test.foo.bar: ce-test.foo-bar, ce-test.foo.bar"])
  })

  test("role catalog remains byte-identical in generated consumers", async () => {
    const expected = await readFile(catalogPath)
    const owners = new Set(Object.values((await catalog()).roles).map((role) => role.owner))
    for (const owner of owners) {
      expect(await readFile(path.join(skillsRoot, owner, "references", "dispatch-roles.json"))).toEqual(expected)
    }
  })
})
