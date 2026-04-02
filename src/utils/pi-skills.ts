import { createHash } from "crypto"
import type { Dirent } from "fs"
import { promises as fs } from "fs"
import os from "os"
import path from "path"
import { dump } from "js-yaml"
import { assertNoSymlinkAncestors, ensureManagedDir, ensureManagedParentDir, pathExists, readText, writeFileAtomicIfChanged, writeTextAtomicIfChanged } from "./files"
import { parseFrontmatter } from "./frontmatter"
import { getPiPolicyFingerprint } from "./pi-policy"

export const PI_CE_SUBAGENT_TOOL = "ce_subagent"

export type PiNameMaps = {
  agents?: Record<string, string>
  skills?: Record<string, string>
  prompts?: Record<string, string>
}

export type PiMaterializationOptions = {
  trustedRoot?: string
}

export type PiTransformOptions = {
  preserveUnknownQualifiedRefs?: boolean
  rejectUnknownQualifiedTaskRefs?: boolean
  preserveUnresolvedFirstPartyQualifiedSkillRefs?: boolean
  rejectUnresolvedFirstPartyQualifiedRefs?: boolean
}

export type PiSkillMutationHooks = {
  onBeforeMutate?: (mode: "incremental" | "replace") => void | Promise<void>
}

type PiSkillFullCompareHook = (targetDir: string) => void | Promise<void>
type PiSkillSourceFingerprintHook = (sourceDir: string) => void | Promise<void>
type PiSkillSourceAnalysisHook = (sourceDir: string) => void | Promise<void>

let piSkillFullCompareHook: PiSkillFullCompareHook | null = null
let piSkillSourceFingerprintHook: PiSkillSourceFingerprintHook | null = null
let piSkillSourceAnalysisHook: PiSkillSourceAnalysisHook | null = null

export function setPiSkillFullCompareHookForTests(hook: PiSkillFullCompareHook | null): void {
  piSkillFullCompareHook = hook
}

export function setPiSkillSourceFingerprintHookForTests(hook: PiSkillSourceFingerprintHook | null): void {
  piSkillSourceFingerprintHook = hook
}

export function setPiSkillSourceAnalysisHookForTests(hook: PiSkillSourceAnalysisHook | null): void {
  piSkillSourceAnalysisHook = hook
}

const PI_MAX_NAME_LENGTH = 60 // Pi allows 64; leave room for dedup suffix like -2
const PI_MANAGED_NAME_LIMIT = 64

export function normalizePiSkillName(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return "item"

  const normalized = trimmed
    .toLowerCase()
    .replace(/[\\/]+/g, "-")
    .replace(/[:_\s]+/g, "-")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, PI_MAX_NAME_LENGTH)
    .replace(/-+$/, "")

  return normalized || "item"
}

export function uniquePiSkillName(base: string, used: Set<string>): string {
  if (!used.has(base)) {
    used.add(base)
    return base
  }

  let index = 2
  while (true) {
    const suffix = `-${index}`
    const trimmedBase = base.slice(0, Math.max(1, PI_MANAGED_NAME_LIMIT - suffix.length)).replace(/-+$/, "") || "item"
    const candidate = `${trimmedBase}${suffix}`
    if (!used.has(candidate)) {
      used.add(candidate)
      return candidate
    }
    index += 1
  }
}

export function buildPiSameRunQualifiedNameMap(
  activeNameMap: Record<string, string>,
  namespace = "claude-home",
): Record<string, string> {
  const qualifiedNameMap: Record<string, string> = {}

  for (const [sourceName, emittedName] of Object.entries(activeNameMap)) {
    if (!sourceName || sourceName.startsWith(`${namespace}:`)) continue
    qualifiedNameMap[`${namespace}:${sourceName}`] = emittedName
  }

  return qualifiedNameMap
}

export function collectPiSameRunDependencies(content: string): {
  skills: string[]
  prompts: string[]
} {
  const skills = new Set<string>()
  const prompts = new Set<string>()
  const text = String(content || "")

  for (const match of text.matchAll(/\/skill:claude-home:([^\s)]+)/g)) {
    if (match[1]) skills.add(match[1])
  }
  for (const match of text.matchAll(/Task\s+claude-home:([^\s(]+)\s*\(/g)) {
    if (match[1]) skills.add(match[1])
  }
  for (const match of text.matchAll(/\/(?:prompt|prompts):claude-home:([^\s)]+)/g)) {
    if (match[1]) prompts.add(match[1])
  }

  return {
    skills: [...skills].sort(),
    prompts: [...prompts].sort(),
  }
}

export function transformPiBodyContent(body: string, nameMaps?: PiNameMaps, options?: PiTransformOptions): string {
  const lineBreak = body.includes("\r\n") ? "\r\n" : "\n"
  const lines = body.split(/\r?\n/)
  const transformed: string[] = []
  let activeFence: { char: "`" | "~"; length: number } | null = null
  let inIndentedCodeBlock = false
  let previousBlankLine = true
  let inBlockquote = false

  for (const line of lines) {
    const fence = readMarkdownFence(line)
    const blankLine = line.trim().length === 0

    if (activeFence) {
      transformed.push(line)
      if (fence && fence.char === activeFence.char && fence.length >= activeFence.length) {
        activeFence = null
      }
      continue
    }

    if (inIndentedCodeBlock) {
      if (blankLine) {
        transformed.push(line)
        previousBlankLine = true
        continue
      }

      if (isIndentedCodeBlockLine(line)) {
        transformed.push(line)
        previousBlankLine = false
        continue
      }

      inIndentedCodeBlock = false
    }

    if (fence) {
      activeFence = fence
      transformed.push(line)
      previousBlankLine = false
      continue
    }

    if (inBlockquote) {
      if (blankLine) {
        inBlockquote = false
        transformed.push(line)
        previousBlankLine = true
        continue
      }

      if (/^\s*>/.test(line) || !isMarkdownBlockStarter(line)) {
        transformed.push(line)
        previousBlankLine = false
        continue
      }

      inBlockquote = false
    }

    if (/^\s*>/.test(line)) {
      inBlockquote = true
      transformed.push(line)
      previousBlankLine = false
      continue
    }

    if (previousBlankLine && isIndentedCodeBlockLine(line) && !isIndentedTaskBulletLine(line)) {
      inIndentedCodeBlock = true
      transformed.push(line)
      previousBlankLine = false
      continue
    }

    transformed.push(transformPiMarkdownLine(line, nameMaps, options))
    previousBlankLine = blankLine
  }

  return transformed.join(lineBreak)
}

export { appendCompatibilityNoteIfNeeded }

export async function skillFileMatchesPiTarget(
  skillPath: string,
  targetName: string,
  nameMaps?: PiNameMaps,
  options?: PiTransformOptions,
): Promise<boolean> {
  if (!(await pathExists(skillPath))) {
    return false
  }

  const raw = await readText(skillPath)

  try {
    const parsed = parseFrontmatter(raw)
    if (Object.keys(parsed.data).length === 0 && parsed.body === raw) {
      return transformPiBodyContent(raw, nameMaps, options) === raw
    }

    if (parsed.data.name !== targetName) {
      return false
    }

    return transformPiBodyContent(parsed.body, nameMaps, options) === parsed.body
  } catch (error) {
    console.warn(`Pi sync: failed to parse frontmatter in ${skillPath}:`, (error as Error).message)
    const rewritten = renderPiSkillContent(raw, targetName, nameMaps, skillPath, options)
    return rewritten === raw
  }
}

export async function piSkillTargetMatchesMaterializedSource(
  sourceDir: string,
  targetDir: string,
  targetName: string,
  nameMaps?: PiNameMaps,
  options?: PiMaterializationOptions,
  transformOptions?: PiTransformOptions,
): Promise<boolean> {
  const targetStats = await fs.lstat(targetDir).catch(() => null)
  if (!targetStats || targetStats.isSymbolicLink() || !targetStats.isDirectory()) {
    return false
  }

  return materializedDirMatches(sourceDir, targetDir, targetName, nameMaps, new Set<string>(), options, transformOptions)
}

async function materializedDirMatches(
  sourceDir: string,
  targetDir: string,
  targetName: string,
  nameMaps?: PiNameMaps,
  activeRealDirs = new Set<string>(),
  options?: PiMaterializationOptions,
  transformOptions?: PiTransformOptions,
): Promise<boolean> {
  const realSourceDir = await fs.realpath(sourceDir)
  if (activeRealDirs.has(realSourceDir)) {
    throw cyclicPiSkillSymlinkError(sourceDir)
  }

  activeRealDirs.add(realSourceDir)

  try {
    const [sourceEntries, targetEntries] = await Promise.all([
      fs.readdir(sourceDir, { withFileTypes: true }),
      fs.readdir(targetDir, { withFileTypes: true }),
    ])

    const comparableSourceEntries = (await Promise.all(
      sourceEntries.map(async (entry) => resolvePiMaterializedEntry(path.join(sourceDir, entry.name), entry, undefined, options)),
    )).filter((entry): entry is PiMaterializedEntry => entry !== null && entry.kind !== "skip")

    const sourceNames = comparableSourceEntries.map((entry) => entry.name).sort()
    const targetNames = targetEntries.map((entry) => entry.name).sort()
    if (sourceNames.length !== targetNames.length) {
      return false
    }
    for (let i = 0; i < sourceNames.length; i += 1) {
      if (sourceNames[i] !== targetNames[i]) return false
    }

    for (const entry of comparableSourceEntries) {
      const sourcePath = entry.sourcePath
      const targetPath = path.join(targetDir, entry.name)
      const targetStats = await fs.lstat(targetPath).catch(() => null)
      if (!targetStats || targetStats.isSymbolicLink()) {
        return false
      }

      if (entry.kind === "directory") {
        if (!targetStats.isDirectory()) return false
        const matches = await materializedDirMatches(sourcePath, targetPath, targetName, nameMaps, activeRealDirs, options, transformOptions)
        if (!matches) return false
        continue
      }

      if (entry.kind === "file") {
        if (!targetStats.isFile()) return false
        if (entry.name === "SKILL.md") {
          const rewrittenMatches = await materializedSkillFileMatches(sourcePath, targetPath, targetName, nameMaps, transformOptions)
          if (!rewrittenMatches) return false
          continue
        }
        const matches = await fileContentsMatch(sourcePath, targetPath)
        if (!matches) return false
        continue
      }

      return false
    }

    return true
  } catch (error) {
    if (error instanceof Error && error.message.includes("cyclic directory symlink")) {
      throw error
    }
    return false
  } finally {
    activeRealDirs.delete(realSourceDir)
  }
}

export async function preparePiSkillTargetForReplacement(targetDir: string): Promise<void> {
  await assertNoSymlinkAncestors(targetDir)
  const existingStats = await fs.lstat(targetDir).catch(() => null)
  if (!existingStats) return

  if (existingStats.isSymbolicLink()) {
    await assertNoSymlinkAncestors(targetDir)
    const rechecked = await fs.lstat(targetDir).catch(() => null)
    if (!rechecked) return
    if (!rechecked.isSymbolicLink()) {
      throw new Error(`Refusing to replace unexpected Pi skill path ${targetDir}`)
    }
    await fs.unlink(targetDir)
    return
  }

  const parentDir = path.dirname(targetDir)
  const baseName = path.basename(targetDir)
  const existingBackups = (await fs.readdir(parentDir))
    .filter((entry) => entry.startsWith(`${baseName}.bak.`))

  for (const oldBackup of existingBackups.sort().slice(0, -1)) {
    const backupPath = path.join(parentDir, oldBackup)
    await assertNoSymlinkAncestors(backupPath)
    const backupStats = await fs.lstat(backupPath)
    if (backupStats.isSymbolicLink()) continue
    await fs.rm(backupPath, { recursive: true, force: true })
  }

  const backupPath = `${targetDir}.bak.${new Date().toISOString().replace(/[:.]/g, "-")}`
  await assertNoSymlinkAncestors(targetDir)
  await fs.rename(targetDir, backupPath)
  console.warn(`Backed up existing Pi skill directory to ${backupPath}`)
}

export async function copySkillDirForPi(
  sourceDir: string,
  targetDir: string,
  targetName: string,
  nameMaps?: PiNameMaps,
  options?: PiMaterializationOptions,
  transformOptions?: PiTransformOptions,
  hooks?: PiSkillMutationHooks,
): Promise<void> {
  await validatePiSkillSourceForPi(sourceDir, targetName, nameMaps, transformOptions)
  const planningResult = await planPiSkillDirUpdate(
    sourceDir,
    targetDir,
    targetName,
    nameMaps,
    options,
    transformOptions,
  )

  if (planningResult.result === "nochange") {
    await writePiSkillFastPathRecord(targetDir, planningResult.renderSignature, planningResult.sourceMetadataSignature, planningResult.sourceFingerprint, planningResult.targetMetadataSignature)
    return
  }

  if (planningResult.result === "apply") {
    await hooks?.onBeforeMutate?.("incremental")
    await applyPiIncrementalOps(targetDir, planningResult.ops)
    await writePiSkillFastPathRecord(
      targetDir,
      planningResult.renderSignature,
      planningResult.sourceMetadataSignature,
      planningResult.sourceFingerprint,
      await buildPiTargetMetadataSignature(targetDir),
    )
    return
  }

  await hooks?.onBeforeMutate?.("replace")
  await preparePiSkillTargetForReplacement(targetDir)
  await copyDirForPiMaterialization(sourceDir, targetDir, new Set<string>(), options)
  await rewriteSkillFileForPi(path.join(targetDir, "SKILL.md"), targetName, nameMaps, transformOptions)
}

async function validatePiSkillSourceForPi(
  sourceDir: string,
  targetName: string,
  nameMaps?: PiNameMaps,
  options?: PiTransformOptions,
): Promise<void> {
  const skillPath = path.join(sourceDir, "SKILL.md")
  if (!(await pathExists(skillPath))) {
    return
  }

  const raw = await readText(skillPath)
  void renderPiSkillContent(raw, targetName, nameMaps, skillPath, options)
}

function cyclicPiSkillSymlinkError(sourcePath: string): Error {
  return new Error(`Pi skill materialization detected a cyclic directory symlink at ${sourcePath}`)
}

async function copyDirForPiMaterialization(
  sourceDir: string,
  targetDir: string,
  activeRealDirs = new Set<string>(),
  options?: PiMaterializationOptions,
): Promise<void> {
  const realSourceDir = await fs.realpath(sourceDir)
  if (activeRealDirs.has(realSourceDir)) {
    throw cyclicPiSkillSymlinkError(sourceDir)
  }

  activeRealDirs.add(realSourceDir)

  try {
    await assertNoSymlinkAncestors(targetDir)
    await fs.mkdir(targetDir, { recursive: true })
    const entries = await fs.readdir(sourceDir, { withFileTypes: true })

    for (const entry of entries) {
      const sourcePath = path.join(sourceDir, entry.name)
      const targetPath = path.join(targetDir, entry.name)
      const resolvedEntry = await resolvePiMaterializedEntry(sourcePath, entry, { logSkippedDanglingSymlinks: true }, options)

      if (!resolvedEntry || resolvedEntry.kind === "skip") {
        continue
      }

      const materializedSourcePath = resolvedEntry.sourcePath

      if (resolvedEntry.kind === "directory") {
        await copyDirForPiMaterialization(materializedSourcePath, targetPath, activeRealDirs, options)
        continue
      }

      if (resolvedEntry.kind === "file") {
        await fs.mkdir(path.dirname(targetPath), { recursive: true })
        await writeFileAtomicIfChanged({
          filePath: targetPath,
          content: await fs.readFile(materializedSourcePath),
        })
        continue
      }
    }
  } finally {
    activeRealDirs.delete(realSourceDir)
  }
}

export async function rewriteSkillFileForPi(
  skillPath: string,
  targetName: string,
  nameMaps?: PiNameMaps,
  options?: PiTransformOptions,
): Promise<void> {
  if (!(await pathExists(skillPath))) {
    return
  }

  const raw = await readText(skillPath)
  const updated = renderPiSkillContent(raw, targetName, nameMaps, skillPath, options)

  if (updated !== raw) {
    await writeTextAtomicIfChanged({ filePath: skillPath, content: updated })
  }
}

function renderPiSkillContent(
  raw: string,
  targetName: string,
  nameMaps?: PiNameMaps,
  sourceLabel?: string,
  options?: PiTransformOptions,
): string {
  try {
    const parsed = parseFrontmatter(raw)
    if (Object.keys(parsed.data).length === 0 && parsed.body === raw) {
      return transformPiBodyContent(raw, nameMaps, options)
    }

    return formatPiFrontmatter(
      { ...parsed.data, name: targetName },
      transformPiBodyContent(parsed.body, nameMaps, options),
    )
  } catch (error) {
    console.warn(`Pi sync: failed to parse frontmatter in ${sourceLabel ?? "<inline content>"}:`, (error as Error).message)
    const split = splitRawAtFrontmatterEnd(raw)
    const body = split ? split.body : raw
    const rewrittenBody = transformPiBodyContent(body, nameMaps, options)
    return formatPiFrontmatter({ name: targetName }, rewrittenBody)
  }
}

async function materializedSkillFileMatches(
  sourcePath: string,
  targetPath: string,
  targetName: string,
  nameMaps?: PiNameMaps,
  options?: PiTransformOptions,
): Promise<boolean> {
  const [sourceRaw, targetRaw] = await Promise.all([readText(sourcePath), readText(targetPath)])
  return renderPiSkillContent(sourceRaw, targetName, nameMaps, sourcePath, options) === targetRaw
}

async function fileContentsMatch(sourcePath: string, targetPath: string): Promise<boolean> {
  const [sourceBuffer, targetBuffer] = await Promise.all([
    fs.readFile(sourcePath),
    fs.readFile(targetPath),
  ])

  return sourceBuffer.equals(targetBuffer)
}

function formatPiFrontmatter(data: Record<string, unknown>, body: string): string {
  const yaml = dump(data, { lineWidth: -1, noRefs: true }).trimEnd()
  if (yaml.length === 0) {
    return body
  }

  return ["---", yaml, "---", "", body].join("\n")
}

function splitRawAtFrontmatterEnd(raw: string): { frontmatter: string; body: string } | null {
  const lines = raw.split(/\r?\n/)
  if (lines[0]?.trim() !== "---") return null
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      return {
        frontmatter: lines.slice(0, i + 1).join("\n") + "\n",
        body: lines.slice(i + 1).join("\n"),
      }
    }
  }
  return null
}

function normalizePiTaskAgentName(value: string, nameMaps?: PiNameMaps, options?: PiTransformOptions): string {
  return resolvePiMappedName(value, {
    primary: nameMaps?.agents,
    secondary: nameMaps?.skills,
    fallback: "leaf",
    preserveUnknownQualifiedRefs: options?.preserveUnknownQualifiedRefs,
    unresolvedFirstPartyQualifiedPolicy: options?.rejectUnresolvedFirstPartyQualifiedRefs ? "reject" : undefined,
  })
}

function normalizePiSkillReferenceName(value: string, nameMaps?: PiNameMaps, options?: PiTransformOptions): string {
  return resolvePiMappedName(value, {
    primary: nameMaps?.skills,
    secondary: nameMaps?.agents,
    fallback: "full",
    preserveUnknownQualifiedRefs: options?.preserveUnknownQualifiedRefs,
    unresolvedFirstPartyQualifiedPolicy: options?.preserveUnresolvedFirstPartyQualifiedSkillRefs === false ? "reject" : "preserve",
  })
}

function normalizePiPromptReferenceName(value: string, nameMaps?: PiNameMaps, options?: PiTransformOptions): string {
  const trimmed = value.trim()
  const rootNamespace = trimmed.split(":").filter(Boolean)[0] ?? ""
  const isFirstPartyQualified = trimmed.includes(":") && ["compound-engineering", "claude-home"].includes(rootNamespace)
  const leafName = trimmed.split(":").filter(Boolean).pop() ?? trimmed
  if (isFirstPartyQualified && options?.rejectUnresolvedFirstPartyQualifiedRefs) {
    if (!nameMaps?.prompts?.[trimmed] && !nameMaps?.prompts?.[leafName]) {
      throw new Error(`Unsupported unresolved first-party qualified ref for Pi sync: ${trimmed}`)
    }
  }

  return resolvePiMappedName(value, {
    primary: nameMaps?.prompts,
    fallback: "full",
    preserveUnknownQualifiedRefs: options?.preserveUnknownQualifiedRefs,
    unresolvedFirstPartyQualifiedPolicy: options?.rejectUnresolvedFirstPartyQualifiedRefs ? "reject" : undefined,
  })
}

function resolvePiMappedName(
  value: string,
  options: {
    primary?: Record<string, string>
    secondary?: Record<string, string>
    fallback: "full" | "leaf"
    preserveUnknownQualifiedRefs?: boolean
    unresolvedFirstPartyQualifiedPolicy?: "preserve" | "reject"
  },
): string {
  const trimmed = value.trim()
  const leafName = trimmed.split(":").filter(Boolean).pop() ?? trimmed
  const isQualified = trimmed.includes(":")
  const rootNamespace = trimmed.split(":").filter(Boolean)[0] ?? ""

  const exactPrimary = options.primary?.[trimmed]
  if (exactPrimary) return exactPrimary

  const exactSecondary = options.secondary?.[trimmed]
  if (exactSecondary) return exactSecondary

  if (
    options.preserveUnknownQualifiedRefs
    && isQualified
    && !["compound-engineering", "claude-home"].includes(rootNamespace)
  ) {
    return trimmed
  }

  const leafPrimary = options.primary?.[leafName]
  const isFirstPartyQualified = isQualified && ["compound-engineering", "claude-home"].includes(rootNamespace)
  if (isFirstPartyQualified && leafPrimary && options.unresolvedFirstPartyQualifiedPolicy === "preserve") {
    return trimmed
  }
  if (isFirstPartyQualified && leafPrimary && options.unresolvedFirstPartyQualifiedPolicy === "reject") {
    throw new Error(`Unsupported unresolved first-party qualified ref for Pi sync: ${trimmed}`)
  }
  if (leafPrimary) return leafPrimary

  const leafSecondary = options.secondary?.[leafName]
  if (isFirstPartyQualified && leafSecondary && options.unresolvedFirstPartyQualifiedPolicy === "preserve") {
    return trimmed
  }
  if (isFirstPartyQualified && leafSecondary && options.unresolvedFirstPartyQualifiedPolicy === "reject") {
    throw new Error(`Unsupported unresolved first-party qualified ref for Pi sync: ${trimmed}`)
  }
  if (leafSecondary) return leafSecondary

  if (isFirstPartyQualified && rootNamespace === "claude-home" && options.unresolvedFirstPartyQualifiedPolicy === "preserve") {
    return trimmed
  }

  return options.fallback === "full"
    ? normalizePiSkillName(trimmed)
    : normalizePiSkillName(leafName)
}

const PI_MCPORTER_SENTINEL = "<!-- PI_MCPORTER_NOTE -->"

function appendCompatibilityNoteIfNeeded(body: string): string {
  if (!/\bmcp\b/i.test(body)) return body
  if (body.includes(PI_MCPORTER_SENTINEL)) return body

  const note = [
    "",
    PI_MCPORTER_SENTINEL,
    "## Pi + MCPorter note",
    "For MCP access in Pi, use MCPorter via the generated tools:",
    "- `mcporter_list` to inspect available MCP tools",
    "- `mcporter_call` to invoke a tool",
    "",
  ].join("\n")

  return body + note
}

type PiMaterializedEntry = {
  kind: "directory" | "file"
  name: string
  sourcePath: string
}

type PiMaterializedTreeNode =
  | {
    kind: "directory"
    children: Map<string, PiMaterializedTreeNode>
  }
  | {
    kind: "file"
    sourcePath: string
    renderedContent?: string
  }

type PiMaterializedTreeAnalysis = {
  tree: PiMaterializedTreeNode
  fingerprint: string
  metadataSignature: string
}

type PiMaterializedMetadataNode = {
  kind: "directory" | "file"
  name: string
  sourcePath: string
  metadataSignature?: string
  children?: PiMaterializedMetadataNode[]
}

type PiMaterializedMetadataSummary = {
  metadataSignature: string
  root: PiMaterializedMetadataNode
}

type PiTargetTreeNode = {
  kind: "directory" | "file" | "symlink" | "other"
  children?: Map<string, PiTargetTreeNode>
}

type PiTargetTreeAnalysis = {
  tree: PiTargetTreeNode
  metadataSignature: string
}

type PiIncrementalOp =
  | {
    type: "createDir"
    relativePath: string
  }
  | {
    type: "writeFile"
    relativePath: string
    sourcePath?: string
    renderedContent?: string
  }
  | {
    type: "remove"
    relativePath: string
    targetKind: "directory" | "file"
  }

type PiMutationSnapshot = {
  targetPath: string
  existed: boolean
  kind?: "directory" | "file"
  tempPath?: string
  mode?: number
}

type PiSkillFastPathRecord = {
  version: 3
  policyFingerprint: string
  renderSignature: string
  sourceMetadataSignature: string
  sourceFingerprint: string
  targetMetadataSignature: string
}

async function planPiSkillDirUpdate(
  sourceDir: string,
  targetDir: string,
  targetName: string,
  nameMaps?: PiNameMaps,
  options?: PiMaterializationOptions,
  transformOptions?: PiTransformOptions,
): Promise<
  | { result: "nochange"; renderSignature: string; sourceMetadataSignature: string; sourceFingerprint: string; targetMetadataSignature: string }
  | { result: "apply"; ops: PiIncrementalOp[]; renderSignature: string; sourceMetadataSignature: string; sourceFingerprint: string }
  | { result: "fallback" }
> {
  const targetStats = await fs.lstat(targetDir).catch(() => null)
  if (!targetStats) {
    return { result: "fallback" }
  }

  if (targetStats.isSymbolicLink() || !targetStats.isDirectory()) {
    return { result: "fallback" }
  }

  const sourceMetadataSummary = await buildPiMaterializedTreeMetadataSummary(sourceDir, options)
  const sourceMetadataSignature = sourceMetadataSummary.metadataSignature
  const renderSignature = buildPiSkillRenderSignature(targetName, nameMaps, transformOptions)
  const targetAnalysis = await buildPiTargetTree(targetDir)
  const targetMetadataSignature = targetAnalysis.metadataSignature
  const cachedFastPath = await readPiSkillFastPathRecord(targetDir)
  if (cachedFastPath
    && cachedFastPath.policyFingerprint === getPiPolicyFingerprint()
    && cachedFastPath.renderSignature === renderSignature
    && cachedFastPath.sourceMetadataSignature === sourceMetadataSignature
    && cachedFastPath.targetMetadataSignature === targetMetadataSignature) {
    return { result: "nochange", renderSignature, sourceMetadataSignature, sourceFingerprint: cachedFastPath.sourceFingerprint, targetMetadataSignature }
  }

  if (piSkillSourceFingerprintHook) {
    await piSkillSourceFingerprintHook(sourceDir)
  }

  await piSkillSourceAnalysisHook?.(sourceDir)
  const sourceAnalysis = await analyzePiMaterializedTree(sourceMetadataSummary.root, targetName, nameMaps, transformOptions)

  if (piSkillFullCompareHook) {
    await piSkillFullCompareHook(targetDir)
  }

  const comparison = await planPiIncrementalOps(sourceAnalysis.tree, targetAnalysis.tree, targetDir)

  if (comparison.result === "nochange") {
    return {
      result: "nochange",
      renderSignature,
      sourceMetadataSignature,
      sourceFingerprint: sourceAnalysis.fingerprint,
      targetMetadataSignature,
    }
  }

  if (comparison.result === "fallback") {
    return { result: "fallback" }
  }

  return {
    result: "apply",
    ops: comparison.ops,
    renderSignature,
    sourceMetadataSignature: sourceAnalysis.metadataSignature,
    sourceFingerprint: sourceAnalysis.fingerprint,
  }
}

function buildPiSkillRenderSignature(
  targetName: string,
  nameMaps?: PiNameMaps,
  transformOptions?: PiTransformOptions,
): string {
  return createHash("sha256").update(JSON.stringify(canonicalizeJsonValue({
    targetName,
    nameMaps: nameMaps ?? null,
    transformOptions: transformOptions ?? null,
  }))).digest("hex")
}

function canonicalizeJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalizeJsonValue)
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entryValue]) => [key, canonicalizeJsonValue(entryValue)]),
    )
  }

  return value
}

async function analyzePiMaterializedTree(
  summary: PiMaterializedMetadataNode,
  targetName: string,
  nameMaps?: PiNameMaps,
  transformOptions?: PiTransformOptions,
): Promise<PiMaterializedTreeAnalysis> {
  if (summary.kind !== "directory") {
    throw new Error(`Expected Pi materialized directory summary for ${summary.sourcePath}`)
  }

  const node: PiMaterializedTreeNode = { kind: "directory", children: new Map() }
  const fingerprintHash = createHash("sha256")

  for (const child of summary.children ?? []) {
    fingerprintHash.update(child.kind)
    fingerprintHash.update("")
    fingerprintHash.update(child.name)
    fingerprintHash.update("")

    if (child.kind === "directory") {
      const childAnalysis = await analyzePiMaterializedTree(child, targetName, nameMaps, transformOptions)
      node.children.set(child.name, childAnalysis.tree)
      fingerprintHash.update(childAnalysis.fingerprint)
      continue
    }

    if (child.name === "SKILL.md") {
      const raw = await readText(child.sourcePath)
      const renderedContent = renderPiSkillContent(raw, targetName, nameMaps, child.sourcePath, transformOptions)
      node.children.set(child.name, {
        kind: "file",
        sourcePath: child.sourcePath,
        renderedContent,
      })
      fingerprintHash.update(renderedContent)
      continue
    }

    node.children.set(child.name, {
      kind: "file",
      sourcePath: child.sourcePath,
    })
    fingerprintHash.update(await fs.readFile(child.sourcePath))
  }

  return {
    tree: node,
    fingerprint: fingerprintHash.digest("hex"),
    metadataSignature: summary.metadataSignature ?? "",
  }
}

async function buildPiMaterializedTreeMetadataSummary(
  sourceDir: string,
  options?: PiMaterializationOptions,
  activeRealDirs = new Set<string>(),
): Promise<PiMaterializedMetadataSummary> {
  const realSourceDir = await fs.realpath(sourceDir)
  if (activeRealDirs.has(realSourceDir)) {
    throw cyclicPiSkillSymlinkError(sourceDir)
  }

  activeRealDirs.add(realSourceDir)

  try {
    const hash = createHash("sha256")
    const root: PiMaterializedMetadataNode = {
      kind: "directory",
      name: path.basename(sourceDir),
      sourcePath: sourceDir,
      children: [],
    }
    const entries = await fs.readdir(sourceDir, { withFileTypes: true })

    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      const sourcePath = path.join(sourceDir, entry.name)
      const resolvedEntry = await resolvePiMaterializedEntry(sourcePath, entry, undefined, options)
      if (!resolvedEntry || resolvedEntry.kind === "skip") continue

      const stats = await fs.lstat(resolvedEntry.sourcePath)
      hash.update(resolvedEntry.kind)
      hash.update("")
      hash.update(resolvedEntry.name)
      hash.update("")
      hash.update(String(stats.size))
      hash.update(":")
      hash.update(String(stats.mtimeMs))
      hash.update("")

      if (resolvedEntry.kind === "directory") {
        const childSummary = await buildPiMaterializedTreeMetadataSummary(resolvedEntry.sourcePath, options, activeRealDirs)
        root.children!.push({
          kind: "directory",
          name: resolvedEntry.name,
          sourcePath: resolvedEntry.sourcePath,
          metadataSignature: childSummary.metadataSignature,
          children: childSummary.root.children,
        })
        hash.update(childSummary.metadataSignature)
        continue
      }

      root.children!.push({
        kind: "file",
        name: resolvedEntry.name,
        sourcePath: resolvedEntry.sourcePath,
      })
    }

    const metadataSignature = hash.digest("hex")
    root.metadataSignature = metadataSignature
    return { metadataSignature, root }
  } finally {
    activeRealDirs.delete(realSourceDir)
  }
}

async function buildPiTargetTree(targetDir: string): Promise<PiTargetTreeAnalysis> {
  const hash = createHash("sha256")
  const tree = await buildPiTargetTreeNode(targetDir, hash, "")
  return {
    tree,
    metadataSignature: hash.digest("hex"),
  }
}

async function buildPiTargetMetadataSignature(targetDir: string): Promise<string> {
  return (await buildPiTargetTree(targetDir)).metadataSignature
}

async function buildPiTargetTreeNode(targetDir: string, hash: ReturnType<typeof createHash>, relativeDir: string): Promise<PiTargetTreeNode> {
  const entries = await fs.readdir(targetDir, { withFileTypes: true })
  const children = new Map<string, PiTargetTreeNode>()

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const targetPath = path.join(targetDir, entry.name)
    const relativePath = relativeDir ? path.join(relativeDir, entry.name) : entry.name
    const stats = await fs.lstat(targetPath)
    const kind = entry.isDirectory() ? "directory" : entry.isFile() ? "file" : entry.isSymbolicLink() ? "symlink" : "other"
    hash.update(kind)
    hash.update("")
    hash.update(relativePath)
    hash.update("")
    hash.update(String(stats.size))
    hash.update(":")
    hash.update(String(stats.mtimeMs))
    hash.update("")

    if (entry.isDirectory()) {
      children.set(entry.name, await buildPiTargetTreeNode(targetPath, hash, relativePath))
      continue
    }

    if (entry.isFile()) {
      children.set(entry.name, { kind: "file" })
      continue
    }

    if (entry.isSymbolicLink()) {
      children.set(entry.name, { kind: "symlink" })
      continue
    }

    children.set(entry.name, { kind: "other" })
  }

  return { kind: "directory", children }
}

async function planPiIncrementalOps(
  sourceTree: PiMaterializedTreeNode,
  targetTree: PiTargetTreeNode,
  targetDir: string,
): Promise<
  | { result: "nochange" }
  | { result: "fallback" }
  | { result: "apply"; ops: PiIncrementalOp[] }
> {
  const ops: PiIncrementalOp[] = []
  const comparison = await comparePiDirectoryNodes(sourceTree, targetTree, targetDir, "", ops)

  if (comparison === "fallback") {
    return { result: "fallback" }
  }

  if (ops.length === 0) {
    return { result: "nochange" }
  }

  return { result: "apply", ops }
}

async function comparePiDirectoryNodes(
  sourceNode: PiMaterializedTreeNode,
  targetNode: PiTargetTreeNode,
  targetDir: string,
  relativeDir: string,
  ops: PiIncrementalOp[],
): Promise<"ok" | "fallback"> {
  if (sourceNode.kind !== "directory" || targetNode.kind !== "directory") {
    return "fallback"
  }

  const sourceChildren = sourceNode.children
  const targetChildren = targetNode.children ?? new Map<string, PiTargetTreeNode>()
  const names = [...new Set([...sourceChildren.keys(), ...targetChildren.keys()])].sort()

  for (const name of names) {
    const sourceChild = sourceChildren.get(name)
    const targetChild = targetChildren.get(name)
    const relativePath = relativeDir ? path.join(relativeDir, name) : name

    if (!sourceChild && targetChild) {
      if (targetChild.kind === "symlink" || targetChild.kind === "other") {
        throw new Error(`Refusing to mutate unsafe Pi skill path ${path.join(targetDir, relativePath)}`)
      }

      ops.push({
        type: "remove",
        relativePath,
        targetKind: targetChild.kind,
      })
      continue
    }

    if (sourceChild && !targetChild) {
      appendPiCreateOps(sourceChild, relativePath, ops)
      continue
    }

    if (!sourceChild || !targetChild) {
      continue
    }

    if (targetChild.kind === "symlink" || targetChild.kind === "other") {
      throw new Error(`Refusing to mutate unsafe Pi skill path ${path.join(targetDir, relativePath)}`)
    }

    if (sourceChild.kind !== targetChild.kind) {
      return "fallback"
    }

    if (sourceChild.kind === "directory") {
      const nested = await comparePiDirectoryNodes(sourceChild, targetChild, targetDir, relativePath, ops)
      if (nested === "fallback") {
        return "fallback"
      }
      continue
    }

    const matches = await materializedFileNodeMatchesTarget(sourceChild, path.join(targetDir, relativePath))
    if (!matches) {
      ops.push({
        type: "writeFile",
        relativePath,
        sourcePath: sourceChild.sourcePath,
        renderedContent: sourceChild.renderedContent,
      })
    }
  }

  return "ok"
}

function appendPiCreateOps(node: PiMaterializedTreeNode, relativePath: string, ops: PiIncrementalOp[]): void {
  if (node.kind === "directory") {
    ops.push({ type: "createDir", relativePath })
    for (const [name, child] of [...node.children.entries()].sort(([left], [right]) => left.localeCompare(right))) {
      appendPiCreateOps(child, path.join(relativePath, name), ops)
    }
    return
  }

  ops.push({
    type: "writeFile",
    relativePath,
    sourcePath: node.sourcePath,
    renderedContent: node.renderedContent,
  })
}

async function materializedFileNodeMatchesTarget(node: Extract<PiMaterializedTreeNode, { kind: "file" }>, targetPath: string): Promise<boolean> {
  if (node.renderedContent !== undefined) {
    const targetRaw = await readText(targetPath)
    return node.renderedContent === targetRaw
  }

  return fileContentsMatch(node.sourcePath, targetPath)
}

async function readPiSkillFastPathRecord(targetDir: string): Promise<PiSkillFastPathRecord | null> {
  const recordPath = resolvePiSkillFastPathRecordPath(targetDir)
  try {
    const parsed = JSON.parse(await readText(recordPath)) as PiSkillFastPathRecord
    if (parsed.version !== 3) return null
    if (!parsed.policyFingerprint || !parsed.renderSignature || !parsed.sourceMetadataSignature || !parsed.sourceFingerprint || !parsed.targetMetadataSignature) return null
    return parsed
  } catch {
    return null
  }
}

async function writePiSkillFastPathRecord(
  targetDir: string,
  renderSignature: string,
  sourceMetadataSignature: string,
  sourceFingerprint: string,
  targetMetadataSignature: string,
): Promise<void> {
  const recordPath = resolvePiSkillFastPathRecordPath(targetDir)
  const record: PiSkillFastPathRecord = {
    version: 3,
    policyFingerprint: getPiPolicyFingerprint(),
    renderSignature,
    sourceMetadataSignature,
    sourceFingerprint,
    targetMetadataSignature,
  }

  await fs.mkdir(path.dirname(recordPath), { recursive: true })
  await writeTextAtomicIfChanged({
    filePath: recordPath,
    content: JSON.stringify(record, null, 2) + "\n",
  })
}

function resolvePiSkillFastPathRecordPath(targetDir: string): string {
  const stateHome = process.env.COMPOUND_ENGINEERING_HOME || os.homedir()
  const identity = createHash("sha256").update(path.resolve(targetDir)).digest("hex")
  return path.join(stateHome, ".compound-engineering", "pi-skill-fingerprints", `${identity}.json`)
}

async function applyPiIncrementalOps(targetDir: string, ops: PiIncrementalOp[]): Promise<void> {
  const snapshotRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pi-skill-update-"))
  const snapshots = new Map<string, PiMutationSnapshot>()

  try {
    for (const op of ops) {
      const targetPath = path.join(targetDir, op.relativePath)
      await capturePiMutationSnapshotIfNeeded(targetPath, snapshotRoot, snapshots)
      await applyPiIncrementalOp(targetDir, op)
    }
  } catch (error) {
    await restorePiMutationSnapshots(snapshots)
    throw error
  } finally {
    await fs.rm(snapshotRoot, { recursive: true, force: true }).catch(() => undefined)
  }
}

async function applyPiIncrementalOp(targetDir: string, op: PiIncrementalOp): Promise<void> {
  const targetPath = path.join(targetDir, op.relativePath)

  if (op.type === "createDir") {
    await ensureSafePiMutationTarget(targetPath, "missing")
    await ensureManagedDir(targetPath)
    await assertNoSymlinkAncestors(targetPath)
    return
  }

  if (op.type === "remove") {
    await removePiMaterializedPath(targetPath, op.targetKind)
    return
  }

  await ensureManagedParentDir(targetPath)
  await ensureSafePiMutationTarget(targetPath, "file")

  if (op.renderedContent !== undefined) {
    await writeTextAtomicIfChanged({ filePath: targetPath, content: op.renderedContent })
    return
  }

  if (!op.sourcePath) {
    throw new Error(`Missing Pi materialized source for ${targetPath}`)
  }

  const sourceBuffer = await fs.readFile(op.sourcePath)
  await writeFileAtomicIfChanged({ filePath: targetPath, content: sourceBuffer })
}

async function ensureSafePiMutationTarget(targetPath: string, expected: "missing" | "file"): Promise<void> {
  await assertNoSymlinkAncestors(targetPath)
  const stats = await fs.lstat(targetPath).catch(() => null)
  if (!stats) return
  if (stats.isSymbolicLink()) {
    throw new Error(`Refusing to mutate unsafe Pi skill path ${targetPath}`)
  }
  if (expected === "missing") {
    if (stats.isDirectory()) return
    throw new Error(`Refusing to replace unexpected Pi skill path ${targetPath}`)
  }
  if (!stats.isFile()) {
    throw new Error(`Refusing to replace unexpected Pi skill path ${targetPath}`)
  }
}

async function removePiMaterializedPath(targetPath: string, expectedKind: "directory" | "file"): Promise<void> {
  await assertNoSymlinkAncestors(targetPath)
  const stats = await fs.lstat(targetPath).catch(() => null)
  if (!stats) return
  if (stats.isSymbolicLink()) {
    throw new Error(`Refusing to remove unsafe Pi skill path ${targetPath}`)
  }

  if (expectedKind === "directory") {
    if (!stats.isDirectory()) {
      throw new Error(`Refusing to remove unexpected Pi skill path ${targetPath}`)
    }
    await assertNoSymlinkAncestors(targetPath)
    const rechecked = await fs.lstat(targetPath)
    if (!rechecked.isDirectory() || rechecked.isSymbolicLink()) {
      throw new Error(`Refusing to remove unexpected Pi skill path ${targetPath}`)
    }
    await fs.rm(targetPath, { recursive: true, force: true })
    return
  }

  if (!stats.isFile()) {
    throw new Error(`Refusing to remove unexpected Pi skill path ${targetPath}`)
  }
  await assertNoSymlinkAncestors(targetPath)
  const rechecked = await fs.lstat(targetPath)
  if (!rechecked.isFile() || rechecked.isSymbolicLink()) {
    throw new Error(`Refusing to remove unexpected Pi skill path ${targetPath}`)
  }
  await fs.unlink(targetPath)
}

async function capturePiMutationSnapshotIfNeeded(
  targetPath: string,
  snapshotRoot: string,
  snapshots: Map<string, PiMutationSnapshot>,
): Promise<void> {
  if (snapshots.has(targetPath)) return

  await assertNoSymlinkAncestors(targetPath)
  const stats = await fs.lstat(targetPath).catch(() => null)
  if (!stats) {
    snapshots.set(targetPath, { targetPath, existed: false })
    return
  }

  if (stats.isSymbolicLink()) {
    throw new Error(`Refusing to snapshot symlink target ${targetPath}`)
  }

  const tempPath = path.join(snapshotRoot, `${snapshots.size}`)

  if (stats.isDirectory()) {
    await copyPiSnapshotDirectory(targetPath, tempPath)
    snapshots.set(targetPath, {
      targetPath,
      existed: true,
      kind: "directory",
      tempPath,
      mode: stats.mode & 0o777,
    })
    return
  }

  if (!stats.isFile()) {
    throw new Error(`Refusing to snapshot non-file target ${targetPath}`)
  }

    await ensureManagedParentDir(tempPath)
    await fs.copyFile(targetPath, tempPath)
  snapshots.set(targetPath, {
    targetPath,
    existed: true,
    kind: "file",
    tempPath,
    mode: stats.mode & 0o777,
  })
}

async function restorePiMutationSnapshots(snapshots: Map<string, PiMutationSnapshot>): Promise<void> {
  const ordered = [...snapshots.values()].sort((left, right) => right.targetPath.length - left.targetPath.length)

  for (const snapshot of ordered) {
    if (!snapshot.existed) {
      await removePiMutationTargetIfPresent(snapshot.targetPath)
      continue
    }

    if (snapshot.kind === "directory") {
      await removePiMutationTargetIfPresent(snapshot.targetPath)
      await assertNoSymlinkAncestors(snapshot.targetPath)
      await copyPiSnapshotDirectory(snapshot.tempPath!, snapshot.targetPath)
      if (snapshot.mode !== undefined) {
        await fs.chmod(snapshot.targetPath, snapshot.mode)
      }
      continue
    }

    await removePiMutationTargetIfPresent(snapshot.targetPath)
    await assertNoSymlinkAncestors(snapshot.targetPath)
    await ensureManagedParentDir(snapshot.targetPath)
    await fs.copyFile(snapshot.tempPath!, snapshot.targetPath)
    if (snapshot.mode !== undefined) {
      await fs.chmod(snapshot.targetPath, snapshot.mode)
    }
  }
}

async function removePiMutationTargetIfPresent(targetPath: string): Promise<void> {
  await assertNoSymlinkAncestors(targetPath)
  const stats = await fs.lstat(targetPath).catch(() => null)
  if (!stats) return
  if (stats.isSymbolicLink()) {
    throw new Error(`Refusing to restore through symlink target ${targetPath}`)
  }
  if (stats.isDirectory()) {
    await assertNoSymlinkAncestors(targetPath)
    const rechecked = await fs.lstat(targetPath)
    if (!rechecked.isDirectory() || rechecked.isSymbolicLink()) {
      throw new Error(`Refusing to restore unexpected Pi skill path ${targetPath}`)
    }
    await fs.rm(targetPath, { recursive: true, force: true })
    return
  }
  if (stats.isFile()) {
    await assertNoSymlinkAncestors(targetPath)
    const rechecked = await fs.lstat(targetPath)
    if (!rechecked.isFile() || rechecked.isSymbolicLink()) {
      throw new Error(`Refusing to restore unexpected Pi skill path ${targetPath}`)
    }
    await fs.unlink(targetPath)
    return
  }
  throw new Error(`Refusing to restore unexpected Pi skill path ${targetPath}`)
}

async function copyPiSnapshotDirectory(sourceDir: string, targetDir: string): Promise<void> {
  await assertNoSymlinkAncestors(targetDir)
  await fs.mkdir(targetDir, { recursive: true })
  const entries = await fs.readdir(sourceDir, { withFileTypes: true })

  for (const entry of entries) {
    const sourcePath = path.join(sourceDir, entry.name)
    const targetPath = path.join(targetDir, entry.name)

    if (entry.isDirectory()) {
      await copyPiSnapshotDirectory(sourcePath, targetPath)
      continue
    }

    if (entry.isFile()) {
      await assertNoSymlinkAncestors(targetPath)
      await fs.mkdir(path.dirname(targetPath), { recursive: true })
      await fs.copyFile(sourcePath, targetPath)
      continue
    }

    throw new Error(`Refusing to snapshot unexpected Pi skill path ${sourcePath}`)
  }
}

function transformPiMarkdownLine(line: string, nameMaps?: PiNameMaps, options?: PiTransformOptions): string {
  const literals: string[] = []
  const protectedLine = line.replace(/(`+)([^`]*?)\1/g, (match) => {
    const index = literals.push(match) - 1
    return `@@PI_LITERAL_${index}@@`
  })

  const taskPattern = /^(\s*(?:(?:[-*])\s+|\d+\.\s+)?)Task\s+([a-z][a-z0-9:_-]*)\(([^)]*)\)/
  let result = protectedLine.replace(taskPattern, (_match, prefix: string, agentName: string, args: string) => {
    const normalizedAgent = normalizePiTaskAgentName(agentName, nameMaps, options)
    if (normalizedAgent === agentName && normalizedAgent.includes(":") && options?.preserveUnknownQualifiedRefs) {
      if (options.rejectUnknownQualifiedTaskRefs) {
        throw new Error(`Unsupported foreign qualified Task ref for Pi sync: ${agentName}`)
      }
      return _match
    }
    const trimmedArgs = args.trim().replace(/\s+/g, " ").replace(/^["']|["']$/g, "")
    return trimmedArgs
      ? `${prefix}Run ${PI_CE_SUBAGENT_TOOL} with agent="${normalizedAgent}" and task="${trimmedArgs}".`
      : `${prefix}Run ${PI_CE_SUBAGENT_TOOL} with agent="${normalizedAgent}".`
  })

  result = result.replace(/\bRun (?:subagent|ce_subagent) with agent="([^"]+)"/g, (_match, agentName: string) => {
    const normalizedAgent = normalizePiTaskAgentName(agentName, nameMaps, options)
    return `Run ${PI_CE_SUBAGENT_TOOL} with agent="${normalizedAgent}"`
  })
  result = result.replace(/\bAskUserQuestion\b/g, "ask_user_question")
  result = result.replace(/\bTodoWrite\b/g, "file-based todos (todos/ + /skill:todo-create)")
  result = result.replace(/\bTodoRead\b/g, "file-based todos (todos/ + /skill:todo-create)")

  const slashCommandPattern = /(?<![:\/\w])\/([a-z][a-z0-9_:-]*?)(?=[\s,."')\]}`]|$)/gi
  result = result.replace(slashCommandPattern, (match, commandName: string) => {
    if (commandName.includes("/")) return match
    if (["dev", "tmp", "etc", "usr", "var", "bin", "home"].includes(commandName)) {
      return match
    }

    if (commandName.startsWith("skill:")) {
      const skillName = commandName.slice("skill:".length)
      return `/skill:${normalizePiSkillReferenceName(skillName, nameMaps, options)}`
    }

    if (commandName.startsWith("prompts:")) {
      const promptName = commandName.slice("prompts:".length)
      const normalizedPrompt = normalizePiPromptReferenceName(promptName, nameMaps, options)
      if (normalizedPrompt === promptName && normalizedPrompt.includes(":")) {
        return match
      }
      return `/${normalizedPrompt}`
    }

    const withoutPrefix = commandName.startsWith("prompts:")
      ? commandName.slice("prompts:".length)
      : commandName

    return `/${nameMaps?.prompts?.[withoutPrefix] ?? normalizePiSkillName(withoutPrefix)}`
  })

  return result.replace(/@@PI_LITERAL_(\d+)@@/g, (_match, index: string) => literals[Number(index)] ?? _match)
}

function readMarkdownFence(line: string): { char: "`" | "~"; length: number } | null {
  const trimmed = line.trimStart()
  const match = trimmed.match(/^(`{3,}|~{3,})/)
  if (!match) return null
  return {
    char: match[1][0] as "`" | "~",
    length: match[1].length,
  }
}

function isIndentedCodeBlockLine(line: string): boolean {
  return /^(?: {4}|\t)/.test(line)
}

function isIndentedTaskBulletLine(line: string): boolean {
  return /^\s+(?:[-*]\s+|\d+\.\s+)Task\s+[a-z][a-z0-9:_-]*\(/.test(line)
}

function isMarkdownBlockStarter(line: string): boolean {
  const trimmed = line.trimStart()
  if (trimmed.length === 0) return false
  return /^(?:[-*+]\s+|\d+\.\s+|#{1,6}\s|```|~~~|>)/.test(trimmed)
}

async function resolvePiMaterializedEntry(
  sourcePath: string,
  entry: Dirent,
  options?: { logSkippedDanglingSymlinks?: boolean },
  materialization?: PiMaterializationOptions,
): Promise<PiMaterializedEntry | { kind: "skip" } | null> {
  if (entry.isDirectory()) {
    return { kind: "directory", name: entry.name, sourcePath }
  }

  if (entry.isFile()) {
    return { kind: "file", name: entry.name, sourcePath }
  }

  if (!entry.isSymbolicLink()) {
    return null
  }

  try {
    const [stats, resolvedPath] = await Promise.all([
      fs.stat(sourcePath),
      fs.realpath(sourcePath),
    ])

    if (materialization?.trustedRoot) {
      const trustedRoot = path.resolve(materialization.trustedRoot)
      const withinTrustedRoot = resolvedPath === trustedRoot || resolvedPath.startsWith(trustedRoot + path.sep)
      if (!withinTrustedRoot) {
        console.warn(`Pi sync: skipping symlink outside trusted root ${sourcePath} -> ${resolvedPath}`)
        return { kind: "skip" }
      }
    }

    if (stats.isDirectory()) {
      return { kind: "directory", name: entry.name, sourcePath: resolvedPath }
    }

    if (stats.isFile()) {
      return { kind: "file", name: entry.name, sourcePath: resolvedPath }
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      if (options?.logSkippedDanglingSymlinks) {
        console.warn(`Pi sync: skipping dangling symlink ${sourcePath}`)
      }
      return { kind: "skip" }
    }
    throw error
  }

  return null
}
