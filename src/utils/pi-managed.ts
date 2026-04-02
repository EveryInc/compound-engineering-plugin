import type { Stats } from "fs"
import { promises as fs } from "fs"
import { createHash } from "crypto"
import os from "os"
import path from "path"
import type {
  PiManagedArtifact,
  PiManagedLegacyArtifact,
  PiManagedManifest,
  PiManagedSection,
  PiManagedVerificationRecord,
  PiManagedVerificationStatus,
} from "../types/pi"
import { captureTextFileSnapshot, ensureDir, isSafePathComponent, pathExists, readJson, readText, removeFileIfExists, restoreTextFileSnapshot, sanitizePathName, writeJsonIfChanged } from "./files"
import type { PiNameMaps } from "./pi-skills"
import { normalizePiSkillName } from "./pi-skills"
import type { PiLayout } from "./pi-layout"
import { canonicalizePiPath, isPathWithinRoot } from "./pi-layout"
import { getPiPolicyFingerprint } from "./pi-policy"

type PiManagedArtifactKind = PiManagedArtifact["kind"]
type PiManagedSectionName = "install" | "sync"

export type PiManagedStateSection = {
  nameMaps: PiNameMaps
  artifacts: PiManagedArtifact[]
  mcpServers: string[]
  sharedResources: {
    compatExtension: boolean
    mcporterConfig: boolean
  }
}

export type PiManagedState = {
  version: 1
  pluginName?: string
  policyFingerprint?: string
  install: PiManagedStateSection
  sync: PiManagedStateSection
  nameMaps: PiNameMaps
}

export type PiManagedStateWithTrust = {
  status: PiManagedVerificationStatus
  state: PiManagedState | null
  verifiedSections: Record<PiManagedSectionName, boolean>
}

export type PiManagedTrustSectionName = PiManagedSectionName

export type PiManagedTrustInfo = {
  status: PiManagedVerificationStatus
  state: PiManagedState | null
  isVerified: boolean
  verifiedSections: Record<PiManagedSectionName, boolean>
}

export type PiLegacyArtifactCandidate = {
  expectedKind: "file" | "directory"
  path: string
}

export type PiLegacyCustomRootInstallCleanupPlan = {
  artifactCandidates: PiLegacyArtifactCandidate[]
  removeCompatExtension: boolean
  pruneMcporterKeys: string[]
  warnings: string[]
}

export type PiManagedSectionHashable = {
  nameMaps?: PiNameMaps
  artifacts?: PiManagedArtifact[]
  mcpServers?: string[]
  sharedResources?: {
    compatExtension?: boolean
    mcporterConfig?: boolean
  }
}

const PI_MANAGED_VERIFICATION_VERSION = 1

function resolvePiManagedStateHome(): string {
  return process.env.COMPOUND_ENGINEERING_HOME || os.homedir()
}

function resolvePiManagedMachineKeyDir(): string {
  return path.join(resolvePiManagedStateHome(), ".compound-engineering")
}

function resolvePiManagedMachineKeyPath(): string {
  return path.join(resolvePiManagedMachineKeyDir(), "pi-managed-key")
}

type PiManagedLoadedVerificationRecord = PiManagedVerificationRecord & {
  machineKey: string
}

export async function loadPiManagedState(layout: PiLayout): Promise<PiManagedState | null> {
  const trusted = await loadPiManagedStateWithTrust(layout)
  return trusted.state
}

export async function loadPiManagedStateWithTrust(layout: PiLayout): Promise<PiManagedStateWithTrust> {
  if (!(await pathExists(layout.managedManifestPath))) {
    return { status: "missing", state: null, verifiedSections: { install: false, sync: false } }
  }

  let raw: PiManagedManifest
  try {
    raw = await readJson<PiManagedManifest>(layout.managedManifestPath)
  } catch {
    return { status: "invalid", state: null, verifiedSections: { install: false, sync: false } }
  }

  const install = normalizeSection(
    raw.install,
    filterLegacyNameMapsForSection(raw.nameMaps, "install"),
    raw.installPrompts,
    raw.generatedSkills,
    layout,
    "install",
  )
  const sync = normalizeSection(
    raw.sync,
    filterLegacyNameMapsForSection(raw.nameMaps, "sync"),
    raw.syncPrompts,
    undefined,
    layout,
    "sync",
  )

  const state: PiManagedState = {
    version: 1,
    pluginName: raw.pluginName,
    policyFingerprint: raw.policyFingerprint,
    install,
    sync,
    nameMaps: mergeEffectiveNameMaps(install.nameMaps, sync.nameMaps),
  }

  const verification = await loadVerificationRecord(layout)
  if (!verification) return { status: "legacy", state, verifiedSections: { install: false, sync: false } }

  const currentRoot = path.resolve(layout.root)
  const currentManifestPath = path.resolve(layout.managedManifestPath)
  if (verification.root !== currentRoot || verification.manifestPath !== currentManifestPath) {
    return { status: "stale", state, verifiedSections: { install: false, sync: false } }
  }

  const currentPolicyFingerprint = getPiPolicyFingerprint()
  if (state.policyFingerprint !== currentPolicyFingerprint || verification.policyFingerprint !== currentPolicyFingerprint) {
    return { status: "stale", state, verifiedSections: { install: false, sync: false } }
  }

  const installHash = hashManagedSection(layout, install)
  const syncHash = hashManagedSection(layout, sync)
  const installMatches = (!hasSectionData(install) && !verification.install)
    || verification.install?.hash === signSectionHash(verification.machineKey, installHash)
  const syncMatches = (!hasSectionData(sync) && !verification.sync)
    || verification.sync?.hash === signSectionHash(verification.machineKey, syncHash)

  const verifiedSections = {
    install: hasSectionData(install) ? installMatches : false,
    sync: hasSectionData(sync) ? syncMatches : false,
  }

  const hasUnverifiedSection = (hasSectionData(install) && !verifiedSections.install)
    || (hasSectionData(sync) && !verifiedSections.sync)
  if (!hasUnverifiedSection) {
    return { status: "verified", state, verifiedSections }
  }

  return { status: "stale", state, verifiedSections }
}

export async function writePiManagedState(
  layout: PiLayout,
  state: PiManagedState,
  verifiedSections: Partial<Record<PiManagedSectionName, boolean>> = { install: true, sync: true },
): Promise<boolean> {
  const effectiveState = state.policyFingerprint
    ? state
    : { ...state, policyFingerprint: getPiPolicyFingerprint() }
  if (!shouldWritePiManagedState(state)) {
    const [existingManifest, existingVerification] = await Promise.all([
      readText(layout.managedManifestPath).catch(() => null),
      readText(layout.verificationPath).catch(() => null),
    ])
    if (existingManifest === null && existingVerification === null) {
      return false
    }

    const manifestSnapshot = await captureTextFileSnapshot(layout.managedManifestPath)
    const verificationSnapshot = await captureTextFileSnapshot(layout.verificationPath)
    try {
      await removeFileIfExists(layout.managedManifestPath)
      await removeFileIfExists(layout.verificationPath)
    } catch (error) {
      await restoreTextFileSnapshot(manifestSnapshot)
      await restoreTextFileSnapshot(verificationSnapshot)
      throw error
    }
    return true
  }

  const manifest: PiManagedManifest = {
    version: 1,
    pluginName: effectiveState.pluginName,
    policyFingerprint: effectiveState.policyFingerprint,
    nameMaps: mergeEffectiveNameMaps(effectiveState.install.nameMaps, effectiveState.sync.nameMaps),
    install: serializeSection(effectiveState.install),
    sync: serializeSection(effectiveState.sync),
    installPrompts: serializeLegacyArtifacts(layout, effectiveState.install.artifacts, "prompt"),
    syncPrompts: serializeLegacyArtifacts(layout, effectiveState.sync.artifacts, "prompt"),
    generatedSkills: serializeLegacyArtifacts(layout, effectiveState.install.artifacts, "generated-skill"),
  }

  const verification = await createVerificationRecord(layout, effectiveState, verifiedSections)
  const nextManifestContent = JSON.stringify(manifest, null, 2) + "\n"
  const nextVerificationContent = JSON.stringify(verification, null, 2) + "\n"
  const [existingManifest, existingVerification] = await Promise.all([
    readText(layout.managedManifestPath).catch(() => null),
    readText(layout.verificationPath).catch(() => null),
  ])
  if (existingManifest === nextManifestContent && existingVerification === nextVerificationContent) {
    return false
  }

  const manifestSnapshot = await captureTextFileSnapshot(layout.managedManifestPath)
  const verificationSnapshot = await captureTextFileSnapshot(layout.verificationPath)

  try {
    await writeJsonIfChanged(layout.managedManifestPath, manifest)
    await writeJsonIfChanged(layout.verificationPath, verification)
  } catch (error) {
    await restoreTextFileSnapshot(manifestSnapshot)
    await restoreTextFileSnapshot(verificationSnapshot)
    throw error
  }
  return true
}

export function createEmptyPiManagedState(pluginName?: string): PiManagedState {
  return {
    version: 1,
    pluginName,
    policyFingerprint: undefined,
    install: createPiManagedSection(),
    sync: createPiManagedSection(),
    nameMaps: emptyPiNameMaps(),
  }
}

export function replacePiManagedSection(
  state: PiManagedState | null,
  sectionName: PiManagedSectionName,
  nextSection: PiManagedStateSection,
  pluginName?: string,
): PiManagedState {
  const current = state ?? createEmptyPiManagedState(pluginName)
  const nextState: PiManagedState = {
    version: 1,
    pluginName: pluginName ?? current.pluginName,
    policyFingerprint: current.policyFingerprint,
    install: sectionName === "install" ? nextSection : current.install,
    sync: sectionName === "sync" ? nextSection : current.sync,
    nameMaps: emptyPiNameMaps(),
  }
  nextState.nameMaps = mergeEffectiveNameMaps(nextState.install.nameMaps, nextState.sync.nameMaps)
  return nextState
}

export function createPiManagedSection(options?: {
  nameMaps?: PiNameMaps
  artifacts?: PiManagedArtifact[]
  mcpServers?: string[]
  sharedResources?: {
    compatExtension?: boolean
    mcporterConfig?: boolean
  }
}): PiManagedStateSection {
  return {
    nameMaps: normalizeNameMaps(options?.nameMaps),
    artifacts: [...(options?.artifacts ?? [])],
    mcpServers: [...(options?.mcpServers ?? [])].filter(Boolean),
    sharedResources: {
      compatExtension: options?.sharedResources?.compatExtension ?? false,
      mcporterConfig: options?.sharedResources?.mcporterConfig ?? false,
    },
  }
}

export function createManagedArtifact(
  layout: PiLayout,
  kind: PiManagedArtifactKind,
  sourceName: string,
  emittedName: string,
): PiManagedArtifact {
  const relativePath = path.relative(layout.root, resolveArtifactPath(layout, kind, emittedName))
  return { kind, sourceName, emittedName, relativePath }
}

export function resolveManagedArtifactPath(layout: PiLayout, artifact: PiManagedArtifact): string | null {
  const relativePath = normalizeRelativeArtifactPath(artifact.relativePath)
  if (!relativePath) return null

  const absolutePath = path.resolve(layout.root, relativePath)
  if (!isPathWithinRoot(layout.root, absolutePath)) return null
  if (!isArtifactPathExpected(layout, artifact.kind, artifact.emittedName, absolutePath)) return null
  return absolutePath
}

export function getReservedPiTargetNames(state: PiManagedState | null): {
  prompts: Set<string>
  skills: Set<string>
  agents: Set<string>
} {
  const prompts = new Set<string>()
  const skills = new Set<string>()
  const agents = new Set<string>()

  if (!state) return { prompts, skills, agents }

  for (const section of [state.install, state.sync]) {
    for (const value of Object.values(section.nameMaps.prompts ?? {})) prompts.add(value)
    for (const value of Object.values(section.nameMaps.skills ?? {})) skills.add(value)
    for (const value of Object.values(section.nameMaps.agents ?? {})) {
      agents.add(value)
      skills.add(value)
    }
    for (const artifact of section.artifacts) {
      if (artifact.kind === "prompt") {
        prompts.add(artifact.emittedName)
      } else {
        skills.add(artifact.emittedName)
      }
    }
  }

  return { prompts, skills, agents }
}

export async function removeStaleManagedArtifacts(
  layout: PiLayout,
  previous: PiManagedState | null,
  next: PiManagedState,
  removeFile: (filePath: string) => Promise<void>,
  removeDirectory: (dirPath: string) => Promise<void>,
): Promise<void> {
  if (!previous) return

  const retainedPaths = new Set<string>()
  for (const section of [next.install, next.sync]) {
    for (const artifact of section.artifacts) {
      const artifactPath = resolveManagedArtifactPath(layout, artifact)
      if (artifactPath) retainedPaths.add(artifactPath)
    }
  }

  for (const section of [previous.install, previous.sync]) {
    for (const artifact of section.artifacts) {
      const artifactPath = resolveManagedArtifactPath(layout, artifact)
      if (!artifactPath || retainedPaths.has(artifactPath)) continue

      if (artifact.kind === "prompt") {
        await removeFile(artifactPath)
      } else {
        await removeDirectory(artifactPath)
      }
    }
  }
}

export function collectLegacyArtifactCandidates(
  layout: PiLayout,
  artifacts: PiManagedArtifact[],
  options?: { legacyRoot?: string },
): PiLegacyArtifactCandidate[] {
  const legacyRoot = path.resolve(options?.legacyRoot ?? layout.root)
  const seen = new Set<string>()
  const candidates: PiLegacyArtifactCandidate[] = []

  for (const artifact of artifacts) {
    const canonicalPath = resolveManagedArtifactPath(layout, artifact)
    const legacyNames = new Set<string>([artifact.emittedName])
    const sourceLegacyName = resolveLegacyArtifactSourceName(artifact.sourceName)
    if (sourceLegacyName) legacyNames.add(sourceLegacyName)

    for (const name of legacyNames) {
      const legacyPath = path.resolve(resolveArtifactPathFromRoot(legacyRoot, artifact.kind, name))
      if (canonicalPath && path.resolve(canonicalPath) === legacyPath) continue

      const key = `${artifact.kind}:${legacyPath}`
      if (seen.has(key)) continue
      seen.add(key)

      candidates.push({
        expectedKind: artifact.kind === "prompt" ? "file" : "directory",
        path: legacyPath,
      })
    }
  }

  return candidates
}

export async function removeLegacyArtifactCandidates(
  candidates: PiLegacyArtifactCandidate[],
  removeFile: (filePath: string) => Promise<void>,
  removeDirectory: (dirPath: string) => Promise<void>,
): Promise<void> {
  for (const candidate of candidates) {
      let stats: Stats
    try {
      stats = await fs.lstat(candidate.path)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue
      throw error
    }

    if (candidate.expectedKind === "file") {
      if (!stats.isFile() || stats.isSymbolicLink()) {
        console.warn(`Warning: found ambiguous legacy Pi artifact at ${candidate.path}; leaving it in place because ownership cannot be proven.`)
        continue
      }
      await removeFile(candidate.path)
      continue
    }

    if (!stats.isDirectory() || stats.isSymbolicLink()) {
      console.warn(`Warning: found ambiguous legacy Pi artifact at ${candidate.path}; leaving it in place because ownership cannot be proven.`)
      continue
    }

    await removeDirectory(candidate.path)
  }
}

export async function planLegacyCustomRootInstallCleanup(options: {
  legacyLayout: PiLayout
  legacyTrustInfo: PiManagedTrustInfo
  artifactCandidates?: PiLegacyArtifactCandidate[]
}): Promise<PiLegacyCustomRootInstallCleanupPlan> {
  const { legacyLayout, legacyTrustInfo } = options
  const warnings: string[] = []
  const artifactCandidates: PiLegacyArtifactCandidate[] = []
  const installCleanupVerified = legacyTrustInfo.verifiedSections.install
  const syncCleanupVerified = legacyTrustInfo.verifiedSections.sync
  const installSection = installCleanupVerified ? legacyTrustInfo.state?.install : undefined
  const syncSection = syncCleanupVerified ? legacyTrustInfo.state?.sync : undefined
  const installArtifactPaths = new Set<string>()
  const syncArtifactPaths = new Set<string>()

  for (const artifact of installSection?.artifacts ?? []) {
    const artifactPath = resolveManagedArtifactPath(legacyLayout, artifact)
    if (artifactPath) installArtifactPaths.add(canonicalizePiPath(artifactPath))
  }

  for (const artifact of syncSection?.artifacts ?? []) {
    const artifactPath = resolveManagedArtifactPath(legacyLayout, artifact)
    if (artifactPath) syncArtifactPaths.add(canonicalizePiPath(artifactPath))
  }

  for (const candidate of options.artifactCandidates ?? []) {
    const resolvedPath = canonicalizePiPath(candidate.path)
    if (!installCleanupVerified || !installArtifactPaths.has(resolvedPath)) {
      if (await pathExists(resolvedPath)) {
        warnings.push(`Warning: found ambiguous legacy Pi artifact at ${resolvedPath}; leaving it in place because install ownership cannot be proven.`)
      }
      continue
    }

    if (syncCleanupVerified) {
      if (syncArtifactPaths.has(resolvedPath)) continue
      artifactCandidates.push({ ...candidate, path: resolvedPath })
      continue
    }

    if (await pathExists(resolvedPath)) {
      warnings.push(`Warning: found ambiguous legacy Pi artifact at ${resolvedPath}; leaving it in place because sync ownership cannot be proven.`)
    }
  }

  let removeCompatExtension = false
  if (installSection?.sharedResources.compatExtension) {
    const compatPath = path.join(legacyLayout.extensionsDir, "compound-engineering-compat.ts")
    if (syncCleanupVerified) {
      removeCompatExtension = syncSection?.sharedResources.compatExtension !== true
    } else if (await pathExists(compatPath)) {
      warnings.push(`Warning: found ambiguous legacy Pi shared resource at ${compatPath}; leaving it in place because sync ownership cannot be proven.`)
    }
  }

  let pruneMcporterKeys: string[] = []
  if ((installSection?.mcpServers.length ?? 0) > 0) {
    if (syncCleanupVerified) {
      const syncServers = new Set(syncSection?.mcpServers ?? [])
      pruneMcporterKeys = installSection?.mcpServers.filter((server) => !syncServers.has(server)) ?? []
    } else if (await pathExists(legacyLayout.mcporterConfigPath)) {
      warnings.push(`Warning: found ambiguous legacy mcporter.json at ${legacyLayout.mcporterConfigPath}; leaving it untouched because sync ownership cannot be proven.`)
    }
  }

  return {
    artifactCandidates,
    removeCompatExtension,
    pruneMcporterKeys,
    warnings,
  }
}

export async function getPiManagedTrustInfo(layout: PiLayout): Promise<PiManagedTrustInfo> {
  const trusted = await loadPiManagedStateWithTrust(layout)
  return {
    status: trusted.status,
    state: trusted.state,
    isVerified: trusted.status === "verified",
    verifiedSections: trusted.verifiedSections,
  }
}

export function canUseTrustedNameMaps(info: PiManagedTrustInfo, sectionName: PiManagedTrustSectionName): boolean {
  return Boolean(info.state && info.verifiedSections[sectionName] && hasSectionData(info.state[sectionName]))
}

export function canUseVerifiedCleanup(info: PiManagedTrustInfo, sectionName: PiManagedTrustSectionName): boolean {
  return info.verifiedSections[sectionName] || info.status === "verified"
}

export function filterPiManagedStateForVerifiedSections(
  state: PiManagedState | null,
  verifiedSections: Partial<Record<PiManagedSectionName, boolean>>,
): PiManagedState | null {
  if (!state) return null

  return {
    ...state,
    install: verifiedSections.install ? state.install : createPiManagedSection(),
    sync: verifiedSections.sync ? state.sync : createPiManagedSection(),
    nameMaps: mergeEffectiveNameMaps(
      verifiedSections.install ? state.install.nameMaps : emptyPiNameMaps(),
      verifiedSections.sync ? state.sync.nameMaps : emptyPiNameMaps(),
    ),
  }
}

export function shouldWritePiManagedState(state: PiManagedState): boolean {
  return hasSectionData(state.install) || hasSectionData(state.sync)
}

export function isSafePiManagedName(name: string): boolean {
  const trimmed = String(name || "").trim()
  if (!trimmed) return false
  if (trimmed.length > 64) return false
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(trimmed)
}

export function mergePiNameMaps(primary?: PiNameMaps, secondary?: PiNameMaps): PiNameMaps {
  return {
    agents: { ...(primary?.agents ?? {}), ...(secondary?.agents ?? {}) },
    skills: { ...(primary?.skills ?? {}), ...(secondary?.skills ?? {}) },
    prompts: { ...(primary?.prompts ?? {}), ...(secondary?.prompts ?? {}) },
  }
}

export function createPiManagedSectionHashPayload(root: string, section?: PiManagedSectionHashable): {
  root: string
  nameMaps: PiNameMaps
  artifacts: Array<{
    kind: PiManagedArtifact["kind"] | undefined
    sourceName: string | undefined
    emittedName: string | undefined
    relativePath: string | null
  }>
  mcpServers: string[]
  sharedResources: {
    compatExtension: boolean
    mcporterConfig: boolean
  }
} {
  return {
    root: path.resolve(root),
    nameMaps: normalizeNameMaps(section?.nameMaps),
    artifacts: dedupeArtifacts([...(section?.artifacts ?? [])]).map((artifact) => ({
      kind: artifact.kind,
      sourceName: artifact.sourceName,
      emittedName: artifact.emittedName,
      relativePath: normalizeRelativeArtifactPath(artifact.relativePath),
    })),
    mcpServers: normalizeMcpServers(section?.mcpServers),
    sharedResources: normalizeSharedResources(section?.sharedResources),
  }
}

function normalizeSection(
  rawSection: PiManagedSection | undefined,
  legacyNameMaps: PiNameMaps | undefined,
  legacyPrompts: PiManagedLegacyArtifact[] | undefined,
  legacyGeneratedSkills: PiManagedLegacyArtifact[] | undefined,
  layout: PiLayout,
  owner: PiManagedSectionName,
): PiManagedStateSection {
  const rawNameMaps = rawSection ? rawSection.nameMaps : legacyNameMaps
  const artifacts: PiManagedArtifact[] = []

  for (const artifact of rawSection?.artifacts ?? []) {
    const normalized = normalizeArtifact(artifact, layout)
    if (normalized) artifacts.push(normalized)
  }

  if (owner === "install") {
    for (const artifact of legacyPrompts ?? []) {
      const normalized = normalizeLegacyArtifact(artifact, "prompt", layout)
      if (normalized) artifacts.push(normalized)
    }
    for (const artifact of legacyGeneratedSkills ?? []) {
      const normalized = normalizeLegacyArtifact(artifact, "generated-skill", layout)
      if (normalized) artifacts.push(normalized)
    }
  }

  if (owner === "sync") {
    for (const artifact of legacyPrompts ?? []) {
      const normalized = normalizeLegacyArtifact(artifact, "prompt", layout)
      if (normalized) artifacts.push(normalized)
    }
  }

  return {
    nameMaps: normalizeNameMaps(rawNameMaps),
    artifacts: dedupeArtifacts(artifacts),
    mcpServers: normalizeMcpServers(rawSection?.mcpServers),
    sharedResources: {
      compatExtension: rawSection?.sharedResources?.compatExtension === true,
      mcporterConfig: rawSection?.sharedResources?.mcporterConfig === true,
    },
  }
}

function normalizeArtifact(artifact: PiManagedArtifact, layout: PiLayout): PiManagedArtifact | null {
  if (!artifact || !artifact.kind || !artifact.sourceName || !isSafePiManagedName(artifact.emittedName)) {
    return null
  }

  const normalized: PiManagedArtifact = {
    kind: artifact.kind,
    sourceName: artifact.sourceName,
    emittedName: artifact.emittedName,
    relativePath: normalizeRelativeArtifactPath(artifact.relativePath) ?? "",
  }

  return resolveManagedArtifactPath(layout, normalized) ? normalized : null
}

function normalizeLegacyArtifact(
  artifact: PiManagedLegacyArtifact,
  kind: PiManagedArtifactKind,
  layout: PiLayout,
): PiManagedArtifact | null {
  if (!artifact?.sourceName || !artifact?.outputPath) return null

  const absolutePath = path.resolve(artifact.outputPath)
  if (!isPathWithinRoot(layout.root, absolutePath)) return null

  const emittedName = kind === "prompt"
    ? path.basename(absolutePath, path.extname(absolutePath))
    : path.basename(absolutePath)

  if (!isSafePiManagedName(emittedName)) return null

  const normalized: PiManagedArtifact = {
    kind,
    sourceName: artifact.sourceName,
    emittedName,
    relativePath: path.relative(layout.root, absolutePath),
  }

  return resolveManagedArtifactPath(layout, normalized) ? normalized : null
}

function normalizeNameMaps(nameMaps?: PiNameMaps): PiNameMaps {
  return {
    agents: normalizeNameMapEntries(nameMaps?.agents),
    skills: normalizeNameMapEntries(nameMaps?.skills),
    prompts: normalizeNameMapEntries(nameMaps?.prompts),
  }
}

function filterLegacyNameMapsForSection(nameMaps: PiNameMaps | undefined, owner: PiManagedSectionName): PiNameMaps {
  const namespace = owner === "install" ? "compound-engineering:" : "claude-home:"
  return {
    agents: filterLegacyNameMapEntries(nameMaps?.agents, namespace),
    skills: filterLegacyNameMapEntries(nameMaps?.skills, namespace),
    prompts: filterLegacyNameMapEntries(nameMaps?.prompts, namespace),
  }
}

function filterLegacyNameMapEntries(entries: Record<string, string> | undefined, namespace: string): Record<string, string> {
  const filtered: Record<string, string> = {}

  for (const [alias, emittedName] of Object.entries(entries ?? {})) {
    if (!alias.startsWith(namespace) || !isSafePiManagedName(emittedName)) continue
    filtered[alias] = emittedName
  }

  return filtered
}

function normalizeNameMapEntries(entries?: Record<string, string>): Record<string, string> {
  const normalized: Record<string, string> = {}

  for (const [alias, emittedName] of Object.entries(entries ?? {})) {
    if (!alias || !isSafePiManagedName(emittedName)) continue
    normalized[alias] = emittedName
  }

  return normalized
}

function mergeEffectiveNameMaps(...maps: PiNameMaps[]): PiNameMaps {
  return {
    agents: mergeEffectiveNameMapEntries(...maps.map((map) => map.agents ?? {})),
    skills: mergeEffectiveNameMapEntries(...maps.map((map) => map.skills ?? {})),
    prompts: mergeEffectiveNameMapEntries(...maps.map((map) => map.prompts ?? {})),
  }
}

function mergeEffectiveNameMapEntries(...maps: Record<string, string>[]): Record<string, string> {
  const merged: Record<string, string> = {}
  const conflicts = new Set<string>()

  for (const entries of maps) {
    for (const [alias, emittedName] of Object.entries(entries)) {
      if (conflicts.has(alias)) continue

      const existing = merged[alias]
      if (!existing) {
        merged[alias] = emittedName
        continue
      }

      if (existing !== emittedName) {
        delete merged[alias]
        conflicts.add(alias)
      }
    }
  }

  return merged
}

function dedupeArtifacts(artifacts: PiManagedArtifact[]): PiManagedArtifact[] {
  const byPath = new Map<string, PiManagedArtifact>()

  for (const artifact of artifacts) {
    byPath.set(`${artifact.kind}:${artifact.relativePath}`, artifact)
  }

  return [...byPath.values()]
}

function resolveArtifactPath(layout: PiLayout, kind: PiManagedArtifactKind, emittedName: string): string {
  return resolveArtifactPathFromRoot(layout.root, kind, emittedName)
}

function resolveArtifactPathFromRoot(root: string, kind: PiManagedArtifactKind, emittedName: string): string {
  if (kind === "prompt") {
    return path.join(root, "prompts", `${emittedName}.md`)
  }

  return path.join(root, "skills", emittedName)
}

function isArtifactPathExpected(
  layout: PiLayout,
  kind: PiManagedArtifactKind,
  emittedName: string,
  absolutePath: string,
): boolean {
  const expectedPath = resolveArtifactPath(layout, kind, emittedName)
  return path.resolve(expectedPath) === path.resolve(absolutePath)
}

function normalizeRelativeArtifactPath(relativePath: string): string | null {
  const trimmed = String(relativePath || "").trim()
  if (!trimmed || path.isAbsolute(trimmed)) return null

  const normalized = path.normalize(trimmed)
  if (normalized === ".." || normalized.startsWith(`..${path.sep}`)) return null
  return normalized
}

function resolveLegacyArtifactSourceName(sourceName: string): string | null {
  const trimmed = String(sourceName || "").trim()
  if (!trimmed) return null

  const legacyName = sanitizePathName(trimmed)
  return isSafePathComponent(legacyName) ? legacyName : null
}

function serializeSection(section: PiManagedStateSection): PiManagedSection | undefined {
  const nameMaps = normalizeNameMaps(section.nameMaps)
  const artifacts = dedupeArtifacts(section.artifacts)
  const mcpServers = normalizeMcpServers(section.mcpServers)
  const sharedResources = normalizeSharedResources(section.sharedResources)

  if (!hasNameMaps(nameMaps) && artifacts.length === 0 && mcpServers.length === 0 && !sharedResources.compatExtension && !sharedResources.mcporterConfig) return undefined
  return {
    nameMaps: hasNameMaps(nameMaps) ? nameMaps : undefined,
    artifacts: artifacts.length > 0 ? artifacts : undefined,
    mcpServers: mcpServers.length > 0 ? mcpServers : undefined,
    sharedResources: sharedResources.compatExtension || sharedResources.mcporterConfig ? sharedResources : undefined,
  }
}

function serializeLegacyArtifacts(
  layout: PiLayout,
  artifacts: PiManagedArtifact[],
  kind: PiManagedArtifactKind,
): PiManagedLegacyArtifact[] | undefined {
  const legacy = artifacts
    .filter((artifact) => artifact.kind === kind)
    .map((artifact) => {
      const outputPath = resolveManagedArtifactPath(layout, artifact)
      if (!outputPath) return null
      return {
        sourceName: artifact.sourceName,
        outputPath,
      }
    })
    .filter((artifact): artifact is PiManagedLegacyArtifact => artifact !== null)

  return legacy.length > 0 ? legacy : undefined
}

function hasNameMaps(nameMaps?: PiNameMaps): boolean {
  if (!nameMaps) return false
  return Boolean(
    Object.keys(nameMaps.agents ?? {}).length
    || Object.keys(nameMaps.skills ?? {}).length
    || Object.keys(nameMaps.prompts ?? {}).length,
  )
}

function hasSectionData(section: PiManagedStateSection): boolean {
  return hasNameMaps(section.nameMaps)
    || section.artifacts.length > 0
    || section.mcpServers.length > 0
    || section.sharedResources.compatExtension
    || section.sharedResources.mcporterConfig
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

function emptyPiNameMaps(): PiNameMaps {
  return {
    agents: {},
    skills: {},
    prompts: {},
  }
}

export function resolveSafePiName(sourceName: string): string {
  const normalized = normalizePiSkillName(sourceName)
  return isSafePiManagedName(normalized) ? normalized : "item"
}

async function loadVerificationRecord(layout: PiLayout): Promise<PiManagedLoadedVerificationRecord | null> {
  if (!(await pathExists(layout.verificationPath))) return null

  try {
    const machineKey = await readMachineKey()
    const verification = await readJson<PiManagedVerificationRecord>(layout.verificationPath)
    if (verification.version !== PI_MANAGED_VERIFICATION_VERSION) return null

    const scopedInstallHash = verification.install?.hash
    const scopedSyncHash = verification.sync?.hash
    if ((scopedInstallHash && !scopedInstallHash.startsWith(machineKey + ":")) || (scopedSyncHash && !scopedSyncHash.startsWith(machineKey + ":"))) {
      return null
    }

    return { ...verification, machineKey }
  } catch {
    return null
  }
}

async function createVerificationRecord(
  layout: PiLayout,
  state: PiManagedState,
  verifiedSections: Partial<Record<PiManagedSectionName, boolean>>,
): Promise<PiManagedVerificationRecord> {
  const machineKey = await readMachineKey()
  return {
    version: PI_MANAGED_VERIFICATION_VERSION,
    root: path.resolve(layout.root),
    manifestPath: path.resolve(layout.managedManifestPath),
    policyFingerprint: state.policyFingerprint,
    install: verifiedSections.install !== false && hasSectionData(state.install)
      ? { hash: signSectionHash(machineKey, hashManagedSection(layout, state.install)) }
      : undefined,
    sync: verifiedSections.sync !== false && hasSectionData(state.sync)
      ? { hash: signSectionHash(machineKey, hashManagedSection(layout, state.sync)) }
      : undefined,
  }
}

async function readMachineKey(): Promise<string> {
  const machineKeyPath = resolvePiManagedMachineKeyPath()
  await ensureDir(resolvePiManagedMachineKeyDir())
  const existing = await readPersistedMachineKey(machineKeyPath)
  if (existing) return existing

  const key = createHash("sha256").update(`${os.hostname()}:${process.pid}:${Date.now()}:${Math.random()}`).digest("hex")
  try {
    const handle = await fs.open(machineKeyPath, "wx", 0o600)
    try {
      await handle.writeFile(key + "\n", { encoding: "utf8" })
      await handle.chmod(0o600)
    } finally {
      await handle.close()
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
      throw error
    }
  }

  const persisted = await readPersistedMachineKey(machineKeyPath)
  if (!persisted) {
    throw new Error(`Invalid Pi managed machine key at ${machineKeyPath}`)
  }
  return persisted
}

async function readPersistedMachineKey(machineKeyPath: string): Promise<string | null> {
  if (!(await pathExists(machineKeyPath))) {
    return null
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const existing = (await readText(machineKeyPath)).trim()
    if (existing) {
      return existing
    }

    await new Promise((resolve) => setTimeout(resolve, 5))
  }

  throw new Error(`Invalid Pi managed machine key at ${machineKeyPath}`)
}

function hashManagedSection(layout: PiLayout, section: PiManagedStateSection): string {
  const payload = JSON.stringify(createPiManagedSectionHashPayload(layout.root, section))

  return createHash("sha256").update(payload).digest("hex")
}

function signSectionHash(machineKey: string, hash: string): string {
  return `${machineKey}:${hash}`
}
