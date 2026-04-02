import { createHash } from "crypto"

const DEFAULT_PI_POLICY_FINGERPRINT = createHash("sha256").update("foreign-qualified-default-deny-v1").digest("hex")

export const PI_COMPAT_EXTENSION_SOURCE = `import { createHash } from "node:crypto"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent"
import { Type } from "@sinclair/typebox"

const MAX_BYTES = 50 * 1024
const DEFAULT_SUBAGENT_TIMEOUT_MS = 10 * 60 * 1000
const MAX_PARALLEL_SUBAGENTS = 8
const PI_MAX_NAME_LENGTH = 60
const PI_POLICY_FINGERPRINT_ENV = "COMPOUND_ENGINEERING_PI_POLICY_FINGERPRINT"
const CURRENT_POLICY_FINGERPRINT = ${JSON.stringify(DEFAULT_PI_POLICY_FINGERPRINT)}

function getCurrentPolicyFingerprint(): string {
  const envOverride = process.env[PI_POLICY_FINGERPRINT_ENV]?.trim()
  return envOverride || CURRENT_POLICY_FINGERPRINT
}

type SubagentTask = {
  agent: string
  task?: string
  cwd?: string
}

type SubagentResult = {
  agent: string
  task: string
  cwd: string
  exitCode: number
  output: string
  stderr: string
}

type PiAliasManifest = {
  version?: number
  nameMaps?: PiNameMaps
  installPrompts?: PiLegacyArtifact[]
  syncPrompts?: PiLegacyArtifact[]
  generatedSkills?: PiLegacyArtifact[]
  install?: PiAliasSection
  sync?: PiAliasSection
}

type PiLegacyArtifact = {
  sourceName?: string
  outputPath?: string
}

type PiAliasSection = {
  nameMaps?: PiNameMaps
  artifacts?: Array<{
    kind?: string
    sourceName?: string
    emittedName?: string
    relativePath?: string
  }>
  mcpServers?: string[]
  sharedResources?: {
    compatExtension?: boolean
    mcporterConfig?: boolean
  }
}

type PiManagedVerificationRecord = {
  version?: number
  root?: string
  manifestPath?: string
  policyFingerprint?: string
  install?: {
    hash?: string
  }
  sync?: {
    hash?: string
  }
}

type PiNameMaps = {
  agents?: Record<string, string>
  skills?: Record<string, string>
  prompts?: Record<string, string>
}

type CachedAliasManifest = {
  mtimeMs: number
  size: number
  manifest: PiAliasManifest | null
}

type CachedAliasResolution = {
  key: string
  signatures: string
  layers: ResolvedAliasLayer[]
}

type AliasManifestSignatureHook = (filePath: string) => void | Promise<void>

type AliasManifestLoadResult = {
  found: boolean
  mtimeMs: number
  size: number
  manifest: PiAliasManifest | null
}

type PiSectionName = "install" | "sync"

type McporterAuthoritySource = "project-sync" | "project-install" | "global" | "bundled"

type McporterCapabilityProvenance = {
  status: "available" | "blocked-unverified-project-sync" | "blocked-unverified-project-install" | "bundled-unverified" | "absent"
  authority: McporterAuthoritySource | null
}

type ResolvedAliasLayer = {
  searchRoot: string
  manifestPath: string
  manifest: PiAliasManifest
  scope: "project" | "global" | "bundled"
  verifiedInstall: boolean
  verifiedSync: boolean
}

function truncate(value: string): string {
  const input = value ?? ""
  if (Buffer.byteLength(input, "utf8") <= MAX_BYTES) return input
  const head = input.slice(0, MAX_BYTES)
  return head + "\\n\\n[Output truncated to 50KB]"
}

function shellEscape(value: string): string {
  return "'" + value.replace(/'/g, "'\\"'\\"'") + "'"
}

function normalizeName(value: string): string {
  const trimmed = String(value || "").trim()
  if (!trimmed) return ""

  const leafName = trimmed.split(":").filter(Boolean).pop() ?? trimmed

  const normalized = leafName
    .toLowerCase()
    .replace(/[\\/]+/g, "-")
    .replace(/[:_\\s]+/g, "-")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")

  return normalized
    .slice(0, PI_MAX_NAME_LENGTH)
    .replace(/-+$/g, "")
}

function isSafeManagedName(value: string): boolean {
  const trimmed = String(value || "").trim()
  if (!trimmed) return false
  if (trimmed.length > 64) return false
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(trimmed)
}

function resolveStateHome(): string {
  return process.env.COMPOUND_ENGINEERING_HOME || os.homedir()
}

function resolveUserHome(): string {
  return process.env.HOME || os.homedir()
}

function canonicalizeManagedPath(targetPath: string): string {
  const resolved = path.resolve(targetPath)
  const normalized = resolved.replace(/[\\/]+$/, "")
  return normalized || resolved
}

function canonicalizeExecutionPath(targetPath: string): string {
  const resolved = path.resolve(targetPath)
  try {
    const realpath = fs.realpathSync.native ? fs.realpathSync.native(resolved) : fs.realpathSync(resolved)
    return canonicalizeManagedPath(realpath)
  } catch {
    return canonicalizeManagedPath(resolved)
  }
}

function resolveMachineKeyPath(): string {
  return path.join(resolveStateHome(), ".compound-engineering", "pi-managed-key")
}

function readMachineKey(): string | null {
  try {
    return fs.readFileSync(resolveMachineKeyPath(), "utf8").trim() || null
  } catch {
    return null
  }
}

function resolveManagedManifestRoot(manifestPath: string): string {
  return canonicalizeManagedPath(path.dirname(path.dirname(manifestPath)))
}

function normalizeNameMapEntries(entries?: Record<string, string>): Record<string, string> {
  const normalized: Record<string, string> = {}

  for (const [alias, emittedName] of Object.entries(entries ?? {})) {
    if (!alias || !isSafeManagedName(emittedName)) continue
    normalized[alias] = emittedName
  }

  return normalized
}

function hasNameMaps(nameMaps?: PiNameMaps): boolean {
  return Boolean(
    Object.keys(nameMaps?.agents ?? {}).length
    || Object.keys(nameMaps?.skills ?? {}).length
    || Object.keys(nameMaps?.prompts ?? {}).length,
  )
}

function normalizeMcpServers(servers?: string[]): string[] {
  return [...new Set((servers ?? []).map((server) => String(server || "").trim()).filter(Boolean))].sort()
}

function normalizeSharedResources(resources?: { compatExtension?: boolean; mcporterConfig?: boolean }) {
  return {
    compatExtension: resources?.compatExtension === true,
    mcporterConfig: resources?.mcporterConfig === true,
  }
}

function normalizeRelativeArtifactPath(relativePath?: string): string | null {
  const trimmed = String(relativePath || "").trim()
  if (!trimmed || path.isAbsolute(trimmed)) return null

  const normalized = path.normalize(trimmed)
  if (normalized === ".." || normalized.startsWith(".." + path.sep)) return null
  return normalized
}

function dedupeArtifacts(artifacts?: PiAliasSection["artifacts"]): NonNullable<PiAliasSection["artifacts"]> {
  const byPath = new Map<string, NonNullable<PiAliasSection["artifacts"]>[number]>()

  for (const artifact of artifacts ?? []) {
    const relativePath = normalizeRelativeArtifactPath(artifact?.relativePath)
    byPath.set(String(artifact?.kind ?? "") + ":" + String(relativePath ?? ""), {
      kind: artifact?.kind,
      sourceName: artifact?.sourceName,
      emittedName: artifact?.emittedName,
      relativePath: relativePath ?? "",
    })
  }

  return [...byPath.values()]
}

function hasSectionData(section?: PiAliasSection): boolean {
  const sharedResources = normalizeSharedResources(section?.sharedResources)
  return hasNameMaps(section?.nameMaps)
    || (section?.artifacts?.length ?? 0) > 0
    || (section?.mcpServers?.length ?? 0) > 0
    || sharedResources.compatExtension
    || sharedResources.mcporterConfig
}

function createSectionHashPayload(root: string, section?: PiAliasSection) {
  return {
    root: path.resolve(root),
    nameMaps: {
      agents: normalizeNameMapEntries(section?.nameMaps?.agents),
      skills: normalizeNameMapEntries(section?.nameMaps?.skills),
      prompts: normalizeNameMapEntries(section?.nameMaps?.prompts),
    },
    artifacts: dedupeArtifacts(section?.artifacts).map((artifact) => ({
      kind: artifact.kind,
      sourceName: artifact.sourceName,
      emittedName: artifact.emittedName,
      relativePath: normalizeRelativeArtifactPath(artifact.relativePath),
    })),
    mcpServers: normalizeMcpServers(section?.mcpServers),
    sharedResources: normalizeSharedResources(section?.sharedResources),
  }
}

function resolveVerificationPath(root: string, manifestPath: string): string {
  const identity = createHash("sha256")
    .update(canonicalizeManagedPath(root) + ":" + canonicalizeManagedPath(manifestPath))
    .digest("hex")
  return path.join(resolveStateHome(), ".compound-engineering", "pi-managed", identity + ".json")
}

function hashManifestSection(root: string, section?: PiAliasSection): string {
  const payload = JSON.stringify(createSectionHashPayload(root, section))

  return createHash("sha256").update(payload).digest("hex")
}

function getEffectiveSectionForVerification(root: string, manifest: PiAliasManifest, sectionName: PiSectionName): PiAliasSection | undefined {
  const artifacts = normalizeLegacyArtifactsForSection(root, manifest, sectionName)
  const section = manifest[sectionName]
  const effectiveSection = section
    ? { ...section, artifacts: dedupeArtifacts([...(section.artifacts ?? []), ...artifacts]) }
    : undefined

  if (effectiveSection) return effectiveSection

  const legacyNameMaps = filterLegacyNameMapsForSection(manifest.nameMaps, sectionName)
  if (!hasNameMaps(legacyNameMaps) && artifacts.length === 0) return undefined

  return { nameMaps: legacyNameMaps, artifacts }
}

function normalizeLegacyArtifactsForSection(root: string, manifest: PiAliasManifest, sectionName: PiSectionName): NonNullable<PiAliasSection["artifacts"]> {
  const artifacts: NonNullable<PiAliasSection["artifacts"]> = []

  if (sectionName === "install") {
    for (const artifact of manifest.installPrompts ?? []) {
      const normalized = normalizeLegacyArtifact(root, artifact, "prompt")
      if (normalized) artifacts.push(normalized)
    }
    for (const artifact of manifest.generatedSkills ?? []) {
      const normalized = normalizeLegacyArtifact(root, artifact, "generated-skill")
      if (normalized) artifacts.push(normalized)
    }
  }

  if (sectionName === "sync") {
    for (const artifact of manifest.syncPrompts ?? []) {
      const normalized = normalizeLegacyArtifact(root, artifact, "prompt")
      if (normalized) artifacts.push(normalized)
    }
  }

  return artifacts
}

function normalizeLegacyArtifact(
  root: string,
  artifact: PiLegacyArtifact,
  kind: NonNullable<PiAliasSection["artifacts"]>[number]["kind"],
): NonNullable<PiAliasSection["artifacts"]>[number] | null {
  if (!artifact?.sourceName || !artifact?.outputPath) return null

  const absolutePath = canonicalizeManagedPath(artifact.outputPath)
  const canonicalRoot = canonicalizeManagedPath(root)
  if (absolutePath !== canonicalRoot && !absolutePath.startsWith(canonicalRoot + path.sep)) return null
  const emittedName = kind === "prompt"
    ? path.basename(absolutePath, path.extname(absolutePath))
    : path.basename(absolutePath)

  if (!isSafeManagedName(emittedName)) return null

  return {
    kind,
    sourceName: artifact.sourceName,
    emittedName,
    relativePath: normalizeRelativeArtifactPath(path.relative(canonicalRoot, absolutePath)) ?? "",
  }
}

function isVerifiedManifestSection(manifestPath: string, manifest: PiAliasManifest, sectionName: "install" | "sync"): boolean {
  const machineKey = readMachineKey()
  if (!machineKey) return false

  const root = resolveManagedManifestRoot(manifestPath)
  const verificationPath = resolveVerificationPath(root, manifestPath)

  try {
    const verification = JSON.parse(fs.readFileSync(verificationPath, "utf8")) as PiManagedVerificationRecord
    if (verification.version !== 1) return false
    if (verification.root !== canonicalizeManagedPath(root)) return false
    if (verification.manifestPath !== canonicalizeManagedPath(manifestPath)) return false
    const currentPolicyFingerprint = getCurrentPolicyFingerprint()
    if (manifest.policyFingerprint !== currentPolicyFingerprint) return false
    if (verification.policyFingerprint !== currentPolicyFingerprint) return false

    const scopedHash = verification[sectionName]?.hash
    if (!scopedHash || !scopedHash.startsWith(machineKey + ":")) return false

    return scopedHash === machineKey + ":" + hashManifestSection(root, getEffectiveSectionForVerification(root, manifest, sectionName))
  } catch {
    return false
  }
}

const aliasManifestCache = new Map<string, CachedAliasManifest>()
const aliasResolutionCache = new Map<string, CachedAliasResolution>()
let aliasManifestSignatureHook: AliasManifestSignatureHook | null = null

export function setAliasManifestSignatureHookForTests(hook: AliasManifestSignatureHook | null): void {
  aliasManifestSignatureHook = hook
}

function resolveBundledAliasManifestPath(): string | undefined {
  try {
    const extensionDir = path.dirname(fileURLToPath(import.meta.url))
    const candidates = [
      path.join(extensionDir, "..", "pi-resources", "compound-engineering", "compound-engineering-managed.json"),
    ]

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) return candidate
    }
  } catch {
    // noop: bundled path is best-effort fallback
  }

  return undefined
}

function resolveAliasManifestPaths(cwd: string, walkedPaths = walkAliasSearchRoots(cwd)): ResolvedAliasLayer[] {
  const layers: ResolvedAliasLayer[] = []
  const bundledManifestPath = resolveBundledAliasManifestPath()
  const bundledRoot = bundledManifestPath
    ? path.resolve(path.dirname(path.dirname(path.dirname(bundledManifestPath))))
    : null

  for (const current of walkedPaths) {
    const projectPaths = [
      path.join(current, "compound-engineering", "compound-engineering-managed.json"),
      path.join(current, ".pi", "compound-engineering", "compound-engineering-managed.json"),
    ]

    for (const projectPath of projectPaths) {
      if (!fs.existsSync(projectPath)) continue
      if (bundledRoot && path.resolve(current) === bundledRoot) continue
      const loaded = loadAliasManifestFromPath(projectPath)
      if (loaded.manifest) {
        layers.push({
          searchRoot: current,
          manifestPath: projectPath,
          manifest: loaded.manifest,
          scope: "project",
          verifiedInstall: isVerifiedManifestSection(projectPath, loaded.manifest, "install"),
          verifiedSync: isVerifiedManifestSection(projectPath, loaded.manifest, "sync"),
        })
      }
    }
  }

  const globalPath = path.join(resolveUserHome(), ".pi", "agent", "compound-engineering", "compound-engineering-managed.json")
  if (fs.existsSync(globalPath)) {
    const loaded = loadAliasManifestFromPath(globalPath)
    if (loaded.manifest) {
      layers.push({
        searchRoot: globalPath,
        manifestPath: globalPath,
        manifest: loaded.manifest,
        scope: "global",
        verifiedInstall: isVerifiedManifestSection(globalPath, loaded.manifest, "install"),
        verifiedSync: isVerifiedManifestSection(globalPath, loaded.manifest, "sync"),
      })
    }
  }

  return layers
}

function walkAliasSearchRoots(cwd: string): string[] {
  const walked = walkUpPaths(cwd)
  const searchRoots: string[] = []

  for (const current of walked) {
    searchRoots.push(current)
    const hasProjectManifest = fs.existsSync(path.join(current, "compound-engineering", "compound-engineering-managed.json"))
      || fs.existsSync(path.join(current, ".pi", "compound-engineering", "compound-engineering-managed.json"))
    if (hasProjectManifest) break
  }

  return searchRoots
}

function isNestedProjectManifestPath(manifestPath: string): boolean {
  return manifestPath.includes(path.sep + ".pi" + path.sep + "compound-engineering" + path.sep)
}

function loadAliasManifest(cwd: string): PiAliasManifest | null {
  return resolveResolvedAliasLayers(cwd)[0]?.manifest ?? null
}

function loadAliasManifestFromPath(filePath: string): AliasManifestLoadResult {
  if (!filePath) {
    return { found: false, mtimeMs: -1, size: -1, manifest: null }
  }

  try {
    const stats = fs.statSync(filePath)
    const cached = aliasManifestCache.get(filePath)
    if (cached && cached.mtimeMs === stats.mtimeMs && cached.size === stats.size) {
      return { found: true, mtimeMs: cached.mtimeMs, size: cached.size, manifest: cached.manifest }
    }

    const manifest = JSON.parse(fs.readFileSync(filePath, "utf8")) as PiAliasManifest
    aliasManifestCache.set(filePath, { mtimeMs: stats.mtimeMs, size: stats.size, manifest })
    return { found: true, mtimeMs: stats.mtimeMs, size: stats.size, manifest }
  } catch {
    aliasManifestCache.delete(filePath)
    return { found: fs.existsSync(filePath), mtimeMs: -1, size: -1, manifest: null }
  }
}

function resolveResolvedAliasLayers(cwd: string): ResolvedAliasLayer[] {
  const resolvedCwd = canonicalizeManagedPath(cwd)
  const walkedPaths = walkAliasSearchRoots(resolvedCwd)
  const cacheKey = walkedPaths.join("|")
  const signatures = buildAliasResolutionSignatures(walkedPaths)
  const cached = aliasResolutionCache.get(cacheKey)
  if (cached?.key === cacheKey && cached.signatures === signatures) return cached.layers

  const layers = resolveAliasManifestPaths(resolvedCwd, walkedPaths)
  aliasResolutionCache.set(cacheKey, { key: cacheKey, signatures, layers })
  return layers
}

function buildAliasResolutionSignatures(walkedPaths: string[]): string {
  const signatures: string[] = []
  signatures.push("policy:" + getCurrentPolicyFingerprint())

  for (const current of walkedPaths) {
    signatures.push(readAliasManifestSignature(path.join(current, "compound-engineering", "compound-engineering-managed.json"), true))
    signatures.push(readAliasManifestSignature(path.join(current, ".pi", "compound-engineering", "compound-engineering-managed.json"), true))
  }

  signatures.push(readAliasManifestSignature(path.join(resolveUserHome(), ".pi", "agent", "compound-engineering", "compound-engineering-managed.json"), true))

  const bundledPath = resolveBundledAliasManifestPath()
  if (bundledPath) {
    signatures.push(readAliasManifestSignature(bundledPath, false))
  }

  return signatures.join("|")
}

function readAliasManifestSignature(filePath: string, includeTrustInputs: boolean): string {
  aliasManifestSignatureHook?.(filePath)
  const loaded = loadAliasManifestFromPath(filePath)
  if (!loaded.found) return filePath + ":missing"
  if (!loaded.manifest) return filePath + ":invalid"

  const manifestSignature = filePath + ":" + loaded.mtimeMs + ":" + loaded.size
  if (!includeTrustInputs) {
    return manifestSignature
  }

  const root = resolveManagedManifestRoot(filePath)
  return [
    manifestSignature,
    readSmallFileSignature(resolveVerificationPath(root, filePath)),
    readSmallFileSignature(resolveMachineKeyPath()),
  ].join(":")
}

function readSmallFileSignature(filePath: string): string {
  try {
    const stats = fs.statSync(filePath)
    return filePath + ":" + stats.mtimeMs + ":" + stats.size
  } catch {
    return filePath + ":missing"
  }
}

function mergeNameMaps(primary?: PiNameMaps, secondary?: PiNameMaps): PiNameMaps {
  return {
    agents: { ...(primary?.agents ?? {}), ...(secondary?.agents ?? {}) },
    skills: { ...(primary?.skills ?? {}), ...(secondary?.skills ?? {}) },
    prompts: { ...(primary?.prompts ?? {}), ...(secondary?.prompts ?? {}) },
  }
}

function getNearestProjectLayersForSection(layers: ResolvedAliasLayer[], sectionName: PiSectionName): {
  layers: ResolvedAliasLayer[]
  blockedByProject: boolean
} {
  let nearestRoot: string | null = null
  const candidateLayers: ResolvedAliasLayer[] = []

  for (const layer of layers) {
    if (layer.scope !== "project") continue

    if (!nearestRoot) {
      nearestRoot = layer.searchRoot
    }

    if (layer.searchRoot !== nearestRoot) break
    if (!hasSectionData(layer.manifest[sectionName]) && !hasNameMaps(filterLegacyNameMapsForSection(layer.manifest.nameMaps, sectionName))) {
      continue
    }
    candidateLayers.push(layer)
  }

  if (candidateLayers.length === 0) {
    return { layers: [], blockedByProject: false }
  }

  if (sectionName === "install") {
    const nestedVerifiedLayers = candidateLayers.filter((layer) => isNestedProjectManifestPath(layer.manifestPath) && layer.verifiedInstall)
    if (nestedVerifiedLayers.length > 0) {
      return { layers: nestedVerifiedLayers, blockedByProject: false }
    }

    const directVerifiedLayers = candidateLayers.filter((layer) => !isNestedProjectManifestPath(layer.manifestPath) && layer.verifiedInstall)
    if (directVerifiedLayers.length > 0) {
      return { layers: directVerifiedLayers, blockedByProject: false }
    }

    return { layers: [], blockedByProject: true }
  }

  const verifiedLayers = candidateLayers.filter((layer) => layer.verifiedSync)
  if (verifiedLayers.length > 0) {
    return { layers: verifiedLayers, blockedByProject: false }
  }

  return { layers: [], blockedByProject: true }
}

function getEffectiveNameMaps(manifest: PiAliasManifest | null): PiNameMaps | null {
  if (!manifest) return null
  return mergeNameMaps(mergeNameMaps(manifest.install?.nameMaps, manifest.sync?.nameMaps), manifest.nameMaps)
}

function getSectionNameMapsWithLegacyFallback(manifest: PiAliasManifest | null, sectionName: PiSectionName): PiNameMaps {
  const section = manifest?.[sectionName]
  if (section) {
    return section.nameMaps ?? {}
  }

  return filterLegacyNameMapsForSection(manifest?.nameMaps, sectionName)
}

function filterLegacyNameMapsForSection(nameMaps: PiNameMaps | undefined, sectionName: PiSectionName): PiNameMaps {
  const namespace = sectionName === "install" ? "compound-engineering:" : "claude-home:"
  return {
    agents: filterLegacyNameMapEntries(nameMaps?.agents, namespace),
    skills: filterLegacyNameMapEntries(nameMaps?.skills, namespace),
    prompts: filterLegacyNameMapEntries(nameMaps?.prompts, namespace),
  }
}

function filterLegacyNameMapEntries(entries: Record<string, string> | undefined, namespace: string): Record<string, string> {
  const filtered: Record<string, string> = {}

  for (const [alias, emittedName] of Object.entries(entries ?? {})) {
    if (!alias.startsWith(namespace) || !isSafeManagedName(emittedName)) continue
    filtered[alias] = emittedName
  }

  return filtered
}

function getNamespaceScopedNameMaps(cwd: string): {
  layers: ResolvedAliasLayer[]
  install: PiNameMaps[]
  sync: PiNameMaps[]
  unqualifiedTiers: PiNameMaps[][]
  unqualified: PiNameMaps[]
} {
  const layers = resolveResolvedAliasLayers(cwd)
  const nearestInstall = getNearestProjectLayersForSection(layers, "install")
  const nearestSync = getNearestProjectLayersForSection(layers, "sync")
  const installLayers = nearestInstall.layers.length > 0
    ? nearestInstall.layers
    : nearestInstall.blockedByProject
      ? []
      : layers.filter((layer) => layer.scope !== "project" && layer.verifiedInstall)
  const syncLayers = nearestSync.layers.length > 0
    ? nearestSync.layers
    : nearestSync.blockedByProject
      ? []
      : layers.filter((layer) => layer.scope !== "project" && layer.verifiedSync)
  return {
    layers,
    install: installLayers
      .map((layer) => getSectionNameMapsWithLegacyFallback(layer.manifest, "install"))
      .filter((maps) => Object.keys(maps.agents ?? {}).length || Object.keys(maps.skills ?? {}).length || Object.keys(maps.prompts ?? {}).length),
    sync: syncLayers
      .map((layer) => getSectionNameMapsWithLegacyFallback(layer.manifest, "sync"))
      .filter((maps) => Object.keys(maps.agents ?? {}).length || Object.keys(maps.skills ?? {}).length || Object.keys(maps.prompts ?? {}).length),
    // Unqualified runtime names are install-facing. Sync aliases remain qualified-only.
    unqualifiedTiers: buildSectionAliasTiers(installLayers, "install"),
    unqualified: installLayers
      .map((layer) => getSectionNameMapsWithLegacyFallback(layer.manifest, "install"))
      .filter((maps) => Object.keys(maps.agents ?? {}).length || Object.keys(maps.skills ?? {}).length || Object.keys(maps.prompts ?? {}).length),
  }
}

function getCachedNamespaceScopedNameMaps(
  cache: Map<string, ReturnType<typeof getNamespaceScopedNameMaps>>,
  cwd: string,
): ReturnType<typeof getNamespaceScopedNameMaps> {
  const key = canonicalizeManagedPath(cwd)
  const cached = cache.get(key)
  if (cached) return cached
  const resolved = getNamespaceScopedNameMaps(cwd)
  cache.set(key, resolved)
  return resolved
}

function listCurrentCapabilities(cwd: string) {
  const scoped = getNamespaceScopedNameMaps(cwd)
  const mcporter = resolveMcporterConfigInfo(cwd)
  const unique = (values: string[]) => [...new Set(values)].sort()

  const flatten = (maps: PiNameMaps[], key: keyof PiNameMaps) =>
    unique(maps.flatMap((map) => Object.keys(map[key] ?? {})))

  return {
    install: {
      agents: flatten(scoped.install, "agents"),
      skills: flatten(scoped.install, "skills"),
      prompts: flatten(scoped.install, "prompts"),
    },
    sync: {
      agents: flatten(scoped.sync, "agents"),
      skills: flatten(scoped.sync, "skills"),
      prompts: flatten(scoped.sync, "prompts"),
    },
    unqualified: {
      agents: flatten(scoped.unqualified, "agents"),
      skills: flatten(scoped.unqualified, "skills"),
      prompts: flatten(scoped.unqualified, "prompts"),
    },
    shared: {
      mcporter: {
        available: Boolean(mcporter.path),
        source: mcporter.source,
        servers: mcporter.servers,
        provenance: mcporter.provenance,
      },
    },
  }
}

function resolveExactAlias(maps: PiNameMaps[], key: string, type: keyof PiNameMaps): string | undefined {
  let match: string | undefined

  for (const map of maps) {
    const value = map[type]?.[key]
    if (!value) continue
    if (!match) {
      match = value
      continue
    }
    if (match !== value) {
      throw new Error("Conflicting qualified subagent target: " + key)
    }
  }

  return match
}

function buildSectionAliasTiers(layers: ResolvedAliasLayer[], sectionName: PiSectionName): PiNameMaps[][] {
  const tiers: PiNameMaps[][] = []
  let currentKey: string | null = null
  let currentTier: PiNameMaps[] = []

  for (const layer of layers) {
    const maps = getSectionNameMapsWithLegacyFallback(layer.manifest, sectionName)
    const hasEntries = Object.keys(maps.agents ?? {}).length || Object.keys(maps.skills ?? {}).length || Object.keys(maps.prompts ?? {}).length
    if (!hasEntries) continue

    const tierKey = layer.scope + ":" + canonicalizeExecutionPath(layer.searchRoot)
    if (tierKey !== currentKey) {
      if (currentTier.length > 0) tiers.push(currentTier)
      currentKey = tierKey
      currentTier = []
    }
    currentTier.push(maps)
  }

  if (currentTier.length > 0) tiers.push(currentTier)
  return tiers
}

function resolveUnqualifiedAlias(tiers: PiNameMaps[][], key: string, type: keyof PiNameMaps): string | undefined {
  for (const tier of tiers) {
    const match = resolveExactAlias(tier, key, type)
    if (match) return match
  }
  return undefined
}

function resolveAgentName(cwd: string, value: string, scopedMaps = getNamespaceScopedNameMaps(cwd)): string {
  const trimmed = String(value || "").trim()
  if (!trimmed) return ""

  const namespace = trimmed.split(":").filter(Boolean)[0] ?? ""
  const qualified = trimmed.includes(":")

  if (qualified && namespace === "compound-engineering") {
    const exactAgent = resolveExactAlias(scopedMaps.install, trimmed, "agents")
    if (exactAgent) return exactAgent

    const exactSkill = resolveExactAlias(scopedMaps.install, trimmed, "skills")
    if (exactSkill) return exactSkill

    throw new Error("Unknown qualified subagent target: " + trimmed)
  }

  if (qualified && namespace === "claude-home") {
    const exactAgent = resolveExactAlias(scopedMaps.sync, trimmed, "agents")
    if (exactAgent) return exactAgent

    const exactSkill = resolveExactAlias(scopedMaps.sync, trimmed, "skills")
    if (exactSkill) return exactSkill

    throw new Error("Unknown qualified subagent target: " + trimmed)
  }

  const exactAgent = resolveUnqualifiedAlias(scopedMaps.unqualifiedTiers, trimmed, "agents")
  if (exactAgent) return exactAgent

  const exactSkill = resolveUnqualifiedAlias(scopedMaps.unqualifiedTiers, trimmed, "skills")
  if (exactSkill) return exactSkill

  if (trimmed.includes(":")) {
    throw new Error("Unknown qualified subagent target: " + trimmed)
  }

  throw new Error("Unknown subagent target: " + trimmed)
}

function resolvePromptName(cwd: string, value: string, scopedMaps = getNamespaceScopedNameMaps(cwd)): string {
  const trimmed = String(value || "").trim()
  if (!trimmed) return ""

  const namespace = trimmed.split(":").filter(Boolean)[0] ?? ""
  const qualified = trimmed.includes(":")

  if (qualified && namespace === "compound-engineering") {
    const exactPrompt = resolveExactAlias(scopedMaps.install, trimmed, "prompts")
    if (exactPrompt) return exactPrompt
    throw new Error("Unknown qualified prompt target: " + trimmed)
  }

  if (qualified && namespace === "claude-home") {
    const exactPrompt = resolveExactAlias(scopedMaps.sync, trimmed, "prompts")
    if (exactPrompt) return exactPrompt
    throw new Error("Unknown qualified prompt target: " + trimmed)
  }

  const exactPrompt = resolveUnqualifiedAlias(scopedMaps.unqualifiedTiers, trimmed, "prompts")
  if (exactPrompt) return exactPrompt

  if (trimmed.includes(":")) {
    throw new Error("Unknown qualified prompt target: " + trimmed)
  }

  throw new Error("Unknown prompt target: " + trimmed)
}

function resolveMcporterConfigInfo(cwd: string): {
  path?: string
  source: McporterAuthoritySource | null
  servers: string[]
  provenance: McporterCapabilityProvenance
} {
  for (const current of walkUpPaths(cwd)) {
    const syncConfigPath = path.join(current, "compound-engineering", "mcporter.json")
    const syncManifestPath = path.join(current, "compound-engineering", "compound-engineering-managed.json")
    if (fs.existsSync(syncConfigPath)) {
      if (!isTrustedMcporterConfigOwner(syncManifestPath, "sync")) {
        return {
          source: null,
          servers: [],
          provenance: { status: "blocked-unverified-project-sync", authority: null },
        }
      }
      return {
        path: syncConfigPath,
        source: "project-sync",
        servers: readMcporterServerNames(syncConfigPath),
        provenance: { status: "available", authority: "project-sync" },
      }
    }

    const installConfigPath = path.join(current, ".pi", "compound-engineering", "mcporter.json")
    const installManifestPath = path.join(current, ".pi", "compound-engineering", "compound-engineering-managed.json")
    if (fs.existsSync(installConfigPath)) {
      if (!isTrustedMcporterConfigOwner(installManifestPath, "install")) {
        return {
          source: null,
          servers: [],
          provenance: { status: "blocked-unverified-project-install", authority: null },
        }
      }
      return {
        path: installConfigPath,
        source: "project-install",
        servers: readMcporterServerNames(installConfigPath),
        provenance: { status: "available", authority: "project-install" },
      }
    }
  }

  const globalPath = path.join(resolveUserHome(), ".pi", "agent", "compound-engineering", "mcporter.json")
  const globalManifestPath = path.join(resolveUserHome(), ".pi", "agent", "compound-engineering", "compound-engineering-managed.json")
  if (fs.existsSync(globalPath) && (isTrustedMcporterConfigOwner(globalManifestPath, "install") || isTrustedMcporterConfigOwner(globalManifestPath, "sync"))) {
    return {
      path: globalPath,
      source: "global",
      servers: readMcporterServerNames(globalPath),
      provenance: { status: "available", authority: "global" },
    }
  }

  const bundled = resolveBundledMcporterConfigInfo()
  if (bundled.path) {
    return {
      path: bundled.path,
      source: "bundled",
      servers: bundled.servers,
      provenance: { status: "available", authority: "bundled" },
    }
  }
  if (bundled.status === "bundled-unverified") {
    return {
      source: null,
      servers: [],
      provenance: { status: "bundled-unverified", authority: null },
    }
  }

  return {
    source: null,
    servers: [],
    provenance: { status: "absent", authority: null },
  }
}

function readMcporterServerNames(configPath: string): string[] {
  try {
    const parsed = JSON.parse(fs.readFileSync(configPath, "utf8")) as { mcpServers?: Record<string, unknown> }
    return Object.keys(parsed.mcpServers ?? {}).sort()
  } catch {
    return []
  }
}

function resolveBundledMcporterConfigPath(): string | undefined {
  return resolveBundledMcporterConfigInfo().path
}

function resolveBundledMcporterConfigInfo(): {
  path?: string
  status: "available" | "bundled-unverified" | "absent"
  servers: string[]
} {
  const bundledManifestPath = resolveBundledAliasManifestPath()
  let bundledConfigPath: string | undefined

  try {
    const extensionDir = path.dirname(fileURLToPath(import.meta.url))
    const candidates = [
      path.join(extensionDir, "..", "pi-resources", "compound-engineering", "mcporter.json"),
    ]

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        bundledConfigPath = candidate
        break
      }
    }
  } catch {
    // noop: bundled path is best-effort fallback
  }

  if (!bundledManifestPath && !bundledConfigPath) {
    return { status: "absent", servers: [] }
  }
  if (!bundledManifestPath || !bundledConfigPath) {
    return { status: "bundled-unverified", servers: [] }
  }

  const loaded = loadAliasManifestFromPath(bundledManifestPath)
  if (!loaded.manifest) {
    return { status: "bundled-unverified", servers: [] }
  }

  if (!normalizeSharedResources(loaded.manifest.install?.sharedResources).mcporterConfig) {
    return { status: "bundled-unverified", servers: [] }
  }
  if (loaded.manifest.policyFingerprint !== getCurrentPolicyFingerprint()) {
    return { status: "bundled-unverified", servers: [] }
  }

  return {
    path: bundledConfigPath,
    status: "available",
    servers: readMcporterServerNames(bundledConfigPath),
  }
}

function resolveMcporterConfigPath(cwd: string, explicit?: string): string | undefined {
  if (explicit && explicit.trim()) {
    console.warn("Warning: mcporter configPath is deprecated and ignored; Compound Engineering will resolve the verified MCPorter config automatically.")
  }

  return resolveMcporterConfigInfo(cwd).path
}

function isTrustedMcporterConfigOwner(manifestPath: string, sectionName: PiSectionName): boolean {
  const loaded = loadAliasManifestFromPath(manifestPath)
  if (!loaded.manifest) return false

  if (!normalizeSharedResources(loaded.manifest[sectionName]?.sharedResources).mcporterConfig) {
    return false
  }

  return isVerifiedManifestSection(manifestPath, loaded.manifest, sectionName)
}

function resolveTaskCwd(
  baseCwd: string,
  taskCwd?: string,
  scopedMaps = getNamespaceScopedNameMaps(baseCwd),
): string {
  if (!taskCwd || !taskCwd.trim()) return baseCwd
  const trimmed = taskCwd.trim()
  if (trimmed === "~" || trimmed.startsWith("~" + path.sep)) {
    throw new Error("ce_subagent cwd is outside the active workspace")
  }

  const workspaceRoot = resolveWorkspaceRoot(baseCwd, scopedMaps)
  const candidate = canonicalizeExecutionPath(path.isAbsolute(trimmed) ? trimmed : path.resolve(baseCwd, trimmed))
  if (candidate !== workspaceRoot && !candidate.startsWith(workspaceRoot + path.sep)) {
    throw new Error("ce_subagent cwd is outside the active workspace")
  }

  return candidate
}

function resolveWorkspaceRoot(cwd: string, scopedMaps = getNamespaceScopedNameMaps(cwd)): string {
  const resolvedCwd = canonicalizeExecutionPath(cwd)
  const projectLayers = scopedMaps.layers.filter((layer) => layer.scope === "project")
  if (projectLayers.length === 0) {
    return findWorkspaceRootFromFilesystem(resolvedCwd)
  }

  const nearestRoot = canonicalizeExecutionPath(projectLayers[0]!.searchRoot)
  const hasAuthoritativeLayer = projectLayers.some((layer) =>
    canonicalizeExecutionPath(layer.searchRoot) === nearestRoot && (layer.verifiedInstall || layer.verifiedSync))

  return hasAuthoritativeLayer ? nearestRoot : findWorkspaceRootFromFilesystem(resolvedCwd)
}

function findWorkspaceRootFromFilesystem(cwd: string): string {
  for (const candidate of walkUpPaths(cwd)) {
    if (hasWorkspaceMarker(candidate)) {
      return candidate
    }
  }

  return cwd
}

function hasWorkspaceMarker(candidate: string): boolean {
  return [".git", "package.json", "bunfig.toml", "tsconfig.json"].some((entry) =>
    fs.existsSync(path.join(candidate, entry)))
}

type PreparedSubagentTask = {
  agent: string
  taskText: string
  cwd: string
}

function prepareSubagentTaskWithCache(
  baseCwd: string,
  task: SubagentTask,
  scopedMapCache: Map<string, ReturnType<typeof getNamespaceScopedNameMaps>>,
): PreparedSubagentTask {
  const baseScopedMaps = getCachedNamespaceScopedNameMaps(scopedMapCache, baseCwd)
  const cwd = resolveTaskCwd(baseCwd, task.cwd, baseScopedMaps)
  const agent = resolveAgentName(cwd, task.agent, getCachedNamespaceScopedNameMaps(scopedMapCache, cwd))
  if (!agent) {
    throw new Error("Subagent task is missing a valid agent name")
  }

  return {
    agent,
    cwd,
    taskText: String(task.task ?? "").trim(),
  }
}

function walkUpPaths(start: string): string[] {
  const paths: string[] = []
  let current = canonicalizeManagedPath(start)

  while (true) {
    paths.push(current)
    const parent = path.dirname(current)
    if (parent === current) break
    current = parent
  }

  return paths
}

async function runSingleSubagent(
  pi: ExtensionAPI,
  prepared: PreparedSubagentTask,
  signal?: AbortSignal,
  timeoutMs = DEFAULT_SUBAGENT_TIMEOUT_MS,
): Promise<SubagentResult> {
  const { cwd, agent, taskText } = prepared
  const prompt = taskText ? "/skill:" + agent + " " + taskText : "/skill:" + agent
  const script = "cd " + shellEscape(cwd) + " && pi --no-session -p " + shellEscape(prompt)
  const result = await pi.exec("bash", ["-lc", script], { signal, timeout: timeoutMs })

  return {
    agent,
    task: taskText,
    cwd,
    exitCode: result.code,
    output: truncate(result.stdout || ""),
    stderr: truncate(result.stderr || ""),
  }
}

async function runParallelSubagents(
  pi: ExtensionAPI,
  tasks: PreparedSubagentTask[],
  signal?: AbortSignal,
  timeoutMs = DEFAULT_SUBAGENT_TIMEOUT_MS,
  maxConcurrency = 4,
  onProgress?: (completed: number, total: number) => void,
): Promise<SubagentResult[]> {
  const safeConcurrency = Math.max(1, Math.min(maxConcurrency, MAX_PARALLEL_SUBAGENTS, tasks.length))
  const results: SubagentResult[] = new Array(tasks.length)

  let nextIndex = 0
  let completed = 0

  const workers = Array.from({ length: safeConcurrency }, async () => {
    while (true) {
      const current = nextIndex
      nextIndex += 1
      if (current >= tasks.length) return

      results[current] = await runSingleSubagent(pi, tasks[current], signal, timeoutMs)
      completed += 1
      onProgress?.(completed, tasks.length)
    }
  })

  await Promise.all(workers)
  return results
}

function formatSubagentSummary(results: SubagentResult[]): string {
  if (results.length === 0) return "No subagent work was executed."

  const success = results.filter((result) => result.exitCode === 0).length
  const failed = results.length - success
  const header = failed === 0
    ? "Subagent run completed: " + success + "/" + results.length + " succeeded."
    : "Subagent run completed: " + success + "/" + results.length + " succeeded, " + failed + " failed."

  const lines = results.map((result) => {
    const status = result.exitCode === 0 ? "ok" : "error"
    const body = result.output || result.stderr || "(no output)"
    const preview = body.split("\\n").slice(0, 6).join("\\n")
    return "\\n[" + status + "] " + result.agent + "\\n" + preview
  })

  return header + lines.join("\\n")
}

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "ask_user_question",
    label: "Ask User Question",
    description: "Ask the user a question with optional choices.",
    parameters: Type.Object({
      question: Type.String({ description: "Question shown to the user" }),
      options: Type.Optional(Type.Array(Type.String(), { description: "Selectable options" })),
      allowCustom: Type.Optional(Type.Boolean({ default: true })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      if (!ctx.hasUI) {
        return {
          isError: true,
          content: [{ type: "text", text: "UI is unavailable in this mode." }],
          details: {},
        }
      }

      const options = params.options ?? []
      const allowCustom = params.allowCustom ?? true

      if (options.length === 0) {
        const answer = await ctx.ui.input(params.question)
        if (!answer) {
          return {
            content: [{ type: "text", text: "User cancelled." }],
            details: { answer: null },
          }
        }

        return {
          content: [{ type: "text", text: "User answered: " + answer }],
          details: { answer, mode: "input" },
        }
      }

      const customLabel = "Other (type custom answer)"
      const selectable = allowCustom ? [...options, customLabel] : options
      const selected = await ctx.ui.select(params.question, selectable)

      if (!selected) {
        return {
          content: [{ type: "text", text: "User cancelled." }],
          details: { answer: null },
        }
      }

      if (selected === customLabel) {
        const custom = await ctx.ui.input("Your answer")
        if (!custom) {
          return {
            content: [{ type: "text", text: "User cancelled." }],
            details: { answer: null },
          }
        }

        return {
          content: [{ type: "text", text: "User answered: " + custom }],
          details: { answer: custom, mode: "custom" },
        }
      }

      return {
        content: [{ type: "text", text: "User selected: " + selected }],
        details: { answer: selected, mode: "select" },
      }
    },
  })

  pi.registerTool({
    name: "ce_list_capabilities",
    label: "Compound Engineering Capabilities",
    description: "List the current verified Pi capabilities available in the active workspace.",
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
      const capabilities = listCurrentCapabilities(ctx.cwd)
      return {
        content: [{ type: "text", text: JSON.stringify(capabilities, null, 2) }],
        details: capabilities,
      }
    },
  })

  pi.registerTool({
    name: "ce_run_prompt",
    label: "Compound Engineering Prompt",
    description: "Run a verified Pi prompt by alias in the active workspace.",
    parameters: Type.Object({
      prompt: Type.String({ description: "Prompt name or qualified alias to invoke" }),
      args: Type.Optional(Type.String({ description: "Optional prompt arguments appended after the prompt name" })),
      cwd: Type.Optional(Type.String({ description: "Optional working directory for this prompt run" })),
      timeoutMs: Type.Optional(Type.Number({ default: DEFAULT_SUBAGENT_TIMEOUT_MS })),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      try {
        const scopedMapCache = new Map<string, ReturnType<typeof getNamespaceScopedNameMaps>>()
        const baseScopedMaps = getCachedNamespaceScopedNameMaps(scopedMapCache, ctx.cwd)
        const cwd = resolveTaskCwd(ctx.cwd, params.cwd, baseScopedMaps)
        const scopedMaps = getCachedNamespaceScopedNameMaps(scopedMapCache, cwd)
        const prompt = resolvePromptName(cwd, params.prompt, scopedMaps)
        if (!prompt) {
          throw new Error("Prompt execution requires a valid prompt name")
        }

        const promptArgs = String(params.args ?? "").trim()
        const promptCommand = promptArgs ? "/" + prompt + " " + promptArgs : "/" + prompt
        const script = "cd " + shellEscape(cwd) + " && pi --no-session -p " + shellEscape(promptCommand)
        const timeoutMs = Number(params.timeoutMs || DEFAULT_SUBAGENT_TIMEOUT_MS)
        const result = await pi.exec("bash", ["-lc", script], { signal, timeout: timeoutMs })
        const output = truncate(result.stdout || result.stderr || "")

        return {
          isError: result.code !== 0,
          content: [{ type: "text", text: output || "(no output)" }],
          details: {
            exitCode: result.code,
            prompt,
            cwd,
            command: promptCommand,
          },
        }
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }],
          details: {},
        }
      }
    },
  })

  const subagentTaskSchema = Type.Object({
    agent: Type.String({ description: "Skill/agent name to invoke" }),
    task: Type.Optional(Type.String({ description: "Task instructions for that skill" })),
    cwd: Type.Optional(Type.String({ description: "Optional working directory for this task" })),
  })

  pi.registerTool({
    name: "ce_subagent",
    label: "Compound Engineering Subagent",
    description: "Run one or more Compound Engineering skill-based subagent tasks. Supports single, parallel, and chained execution.",
    parameters: Type.Object({
      agent: Type.Optional(Type.String({ description: "Single subagent name" })),
      task: Type.Optional(Type.String({ description: "Single subagent task" })),
      cwd: Type.Optional(Type.String({ description: "Working directory for single mode" })),
      tasks: Type.Optional(Type.Array(subagentTaskSchema, { description: "Parallel subagent tasks" })),
      chain: Type.Optional(Type.Array(subagentTaskSchema, { description: "Sequential tasks; supports {previous} placeholder" })),
      maxConcurrency: Type.Optional(Type.Number({ default: 4 })),
      timeoutMs: Type.Optional(Type.Number({ default: DEFAULT_SUBAGENT_TIMEOUT_MS })),
    }),
    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      const hasTasks = Boolean(params.tasks && params.tasks.length > 0)
      const hasChain = Boolean(params.chain && params.chain.length > 0)
      const hasSingle = Boolean(params.agent)
      const modeCount = Number(hasSingle) + Number(hasTasks) + Number(hasChain)

      if (modeCount !== 1) {
        return {
          isError: true,
          content: [{ type: "text", text: "Provide exactly one mode: single (agent with optional task), tasks, or chain." }],
          details: {},
        }
      }

      const timeoutMs = Number(params.timeoutMs || DEFAULT_SUBAGENT_TIMEOUT_MS)
      const scopedMapCache = new Map<string, ReturnType<typeof getNamespaceScopedNameMaps>>()

      try {
        if (hasSingle) {
          const result = await runSingleSubagent(
            pi,
            prepareSubagentTaskWithCache(ctx.cwd, { agent: params.agent!, task: params.task!, cwd: params.cwd }, scopedMapCache),
            signal,
            timeoutMs,
          )

          const body = formatSubagentSummary([result])
          return {
            isError: result.exitCode !== 0,
            content: [{ type: "text", text: body }],
            details: { mode: "single", results: [result] },
          }
        }

        if (hasTasks) {
          const tasks = (params.tasks as SubagentTask[]).map((task) => prepareSubagentTaskWithCache(ctx.cwd, task, scopedMapCache))
          const maxConcurrency = Number(params.maxConcurrency || 4)

          const results = await runParallelSubagents(
            pi,
            tasks,
            signal,
            timeoutMs,
            maxConcurrency,
            (completed, total) => {
              onUpdate?.({
                content: [{ type: "text", text: "Subagent progress: " + completed + "/" + total }],
                details: { mode: "parallel", completed, total },
              })
            },
          )

          const body = formatSubagentSummary(results)
          const hasFailure = results.some((result) => result.exitCode !== 0)

          return {
            isError: hasFailure,
            content: [{ type: "text", text: body }],
            details: { mode: "parallel", results },
          }
        }

        const chain = params.chain as SubagentTask[]
        const preparedChain = chain.map((step) => prepareSubagentTaskWithCache(ctx.cwd, step, scopedMapCache))
        const results: SubagentResult[] = []
        let previous = ""

        for (let i = 0; i < chain.length; i += 1) {
          const step = chain[i]!
          const prepared = preparedChain[i]!
          const resolvedTask = String(step.task ?? "").replace(/\\{previous\\}/g, previous)
          const result = await runSingleSubagent(
            pi,
            { ...prepared, taskText: resolvedTask.trim() },
            signal,
            timeoutMs,
          )
          results.push(result)
          previous = result.output || result.stderr

          onUpdate?.({
            content: [{ type: "text", text: "Subagent chain progress: " + results.length + "/" + chain.length }],
            details: { mode: "chain", completed: results.length, total: chain.length },
          })

          if (result.exitCode !== 0) break
        }

        const body = formatSubagentSummary(results)
        const hasFailure = results.some((result) => result.exitCode !== 0)

        return {
          isError: hasFailure,
          content: [{ type: "text", text: body }],
          details: { mode: "chain", results },
        }
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }],
          details: {},
        }
      }
    },
  })

  pi.registerTool({
    name: "mcporter_list",
    label: "MCPorter List",
    description: "List tools on an MCP server through MCPorter.",
    parameters: Type.Object({
      server: Type.String({ description: "Configured MCP server name" }),
      allParameters: Type.Optional(Type.Boolean({ default: false })),
      json: Type.Optional(Type.Boolean({ default: true })),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const args = ["list", params.server]
      if (params.allParameters) args.push("--all-parameters")
      if (params.json ?? true) args.push("--json")

      const configPath = resolveMcporterConfigPath(ctx.cwd, params.configPath)
      if (configPath) {
        args.push("--config", configPath)
      }

      const result = await pi.exec("mcporter", args, { signal })
      const output = truncate(result.stdout || result.stderr || "")

      return {
        isError: result.code !== 0,
        content: [{ type: "text", text: output || "(no output)" }],
        details: {
          exitCode: result.code,
          command: "mcporter " + args.join(" "),
          configPath,
        },
      }
    },
  })

  pi.registerTool({
    name: "mcporter_call",
    label: "MCPorter Call",
    description: "Call a specific MCP tool through MCPorter.",
    parameters: Type.Object({
      call: Type.Optional(Type.String({ description: "Function-style call, e.g. linear.list_issues(limit: 5)" })),
      server: Type.Optional(Type.String({ description: "Server name (if call is omitted)" })),
      tool: Type.Optional(Type.String({ description: "Tool name (if call is omitted)" })),
      args: Type.Optional(Type.Record(Type.String(), Type.Any(), { description: "JSON arguments object" })),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const args = ["call"]

      if (params.call && params.call.trim()) {
        args.push(params.call.trim())
      } else {
        if (!params.server || !params.tool) {
          return {
            isError: true,
            content: [{ type: "text", text: "Provide either call, or server + tool." }],
            details: {},
          }
        }
        args.push(params.server + "." + params.tool)
        if (params.args) {
          args.push("--args", JSON.stringify(params.args))
        }
      }

      args.push("--output", "json")

      const configPath = resolveMcporterConfigPath(ctx.cwd, params.configPath)
      if (configPath) {
        args.push("--config", configPath)
      }

      const result = await pi.exec("mcporter", args, { signal })
      const output = truncate(result.stdout || result.stderr || "")

      return {
        isError: result.code !== 0,
        content: [{ type: "text", text: output || "(no output)" }],
        details: {
          exitCode: result.code,
          command: "mcporter " + args.join(" "),
          configPath,
        },
      }
    },
  })
}
`
