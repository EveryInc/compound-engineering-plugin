import { createHash, randomUUID } from "node:crypto"
import fs from "node:fs"
import path from "node:path"

export const PACK_SCHEMA_VERSION = 2
// The trusted assessment path, not only gradeArm's immediate dependencies.
// Original mode does not query catalog.ts: its mutable criteria are separately
// snapshotted. Include the entry point and evidence/root helpers, not just scoring.
export const GRADER_FILES = ["extract.ts", "grade.ts", "hosts.ts", "path-shim.ts", "provenance.ts", "regrade.ts"]
const EVIDENCE_ROOTS = ["extract", "workspace", "hosts", "summary.json", "input-manifest.json", "task.md"]

type Entry = { path: string; kind: "file" | "directory" | "symlink"; sha256?: string; executable?: boolean }
export type Fingerprint = { sha256: string; entries: Entry[] }

export function sha256(bytes: string | Buffer): string {
  return createHash("sha256").update(bytes).digest("hex")
}

/** Object key order is irrelevant; array order and exact file bytes are not. */
export function canonicalJSON(value: unknown): string {
  if (value === null || typeof value !== "object") {
    const json = JSON.stringify(value)
    if (json === undefined) throw new Error("value is not JSON-serializable")
    return json
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJSON).join(",")}]`
  return `{${Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJSON(item)}`).join(",")}}`
}

export function valueHash(value: unknown): string {
  return sha256(canonicalJSON(value))
}

/** Do not dereference symlinks or read .git internals, sockets, devices or FIFOs. */
export function fingerprint(root: string, roots?: string[]): Fingerprint {
  const entries: Entry[] = []
  function visit(rel: string) {
    if (rel.split("/").includes(".git")) return
    const file = path.join(root, rel)
    const stat = fs.lstatSync(file)
    if (stat.isSymbolicLink()) {
      entries.push({ path: rel, kind: "symlink", sha256: sha256(fs.readlinkSync(file)) })
    } else if (stat.isDirectory()) {
      entries.push({ path: rel, kind: "directory" })
      for (const name of fs.readdirSync(file).sort()) visit(rel ? `${rel}/${name}` : name)
    } else if (stat.isFile()) {
      entries.push({ path: rel, kind: "file", sha256: sha256(fs.readFileSync(file)), executable: Boolean(stat.mode & 0o111) })
    } else {
      throw new Error(`unsupported evidence file type: ${rel}`)
    }
  }
  for (const rel of (roots ?? fs.readdirSync(root)).slice().sort()) visit(rel)
  return { sha256: valueHash(entries), entries }
}

export function graderFingerprint(dir = import.meta.dir): Fingerprint {
  for (const file of GRADER_FILES) {
    if (!fs.lstatSync(path.join(dir, file)).isFile()) throw new Error(`grader is not a regular file: ${file}`)
  }
  return fingerprint(dir, GRADER_FILES)
}

/** Workspace criteria may read only paths covered by the evidence fingerprint. */
export function verifyWorkspaceGradePaths(paths: string[]): void {
  for (const relative of paths) {
    if (typeof relative !== "string" || !relative || path.isAbsolute(relative) ||
        relative.includes("\\") || relative.includes(":") ||
        relative.split("/").some((part) => !part || part === "." || part === ".." || part === ".git")) {
      throw new Error(`unsafe or unsealed workspace grade path: ${relative}`)
    }
  }
}

/** Refuse existing evidence rather than deleting it to obtain a clean workspace. */
export function prepareOutput(dir: string): string {
  const absolute = path.resolve(dir)
  fs.mkdirSync(absolute, { recursive: true })
  if (fs.lstatSync(absolute).isSymbolicLink() || fs.readdirSync(absolute).length !== 0) {
    throw new Error(`output must be an empty, non-symlink directory: ${absolute}`)
  }
  // Atomic reservation prevents two collectors claiming the same empty directory.
  fs.writeFileSync(path.join(absolute, ".eval-owner"), `${randomUUID()}\n`, { flag: "wx", mode: 0o600 })
  return absolute
}

export function writeJSON(file: string, value: unknown, exclusive = false): void {
  const body = `${JSON.stringify(value, null, 2)}\n`
  if (exclusive) {
    fs.writeFileSync(file, body, { flag: "wx", mode: 0o600 })
    return
  }
  // Only collectors replace their own in-progress summaries. Regrades use wx.
  const temp = `${file}.${randomUUID()}.tmp`
  try {
    fs.writeFileSync(temp, body, { flag: "wx", mode: 0o600 })
    fs.renameSync(temp, file)
  } finally {
    try { fs.unlinkSync(temp) } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
    }
  }
}

export function sealEvidence(out: string): string {
  const manifest = {
    schema_version: 1,
    roots: EVIDENCE_ROOTS,
    fingerprint: fingerprint(out, EVIDENCE_ROOTS),
    exclusions: [".git internals", "symlink target contents", "provider state", "user configuration and credentials"],
  }
  writeJSON(path.join(out, "evidence-manifest.json"), manifest, true)
  return valueHash(manifest)
}

export function verifyEvidence(out: string, expectedManifestHash?: string): void {
  const file = path.join(out, "evidence-manifest.json")
  if (!fs.lstatSync(file).isFile()) throw new Error("evidence manifest must be a regular file")
  const manifest = JSON.parse(fs.readFileSync(file, "utf8"))
  if (manifest.schema_version !== 1 || canonicalJSON(manifest.roots) !== canonicalJSON(EVIDENCE_ROOTS)) {
    throw new Error("unsupported evidence manifest")
  }
  if ((expectedManifestHash && valueHash(manifest) !== expectedManifestHash) ||
      !Array.isArray(manifest.fingerprint?.entries) ||
      valueHash(manifest.fingerprint.entries) !== manifest.fingerprint.sha256 ||
      fingerprint(out, EVIDENCE_ROOTS).sha256 !== manifest.fingerprint.sha256) {
    throw new Error(`evidence changed or is incomplete: ${out}`)
  }
  // grade.ts can read paths. Links would let it read target bytes we did not seal.
  if (manifest.fingerprint.entries.some((entry: Entry) => entry.kind === "symlink")) {
    throw new Error("historical regrading does not support symlink evidence")
  }
  const summary = JSON.parse(fs.readFileSync(path.join(out, "summary.json"), "utf8"))
  const input = JSON.parse(fs.readFileSync(path.join(out, "input-manifest.json"), "utf8"))
  const skillDir = containedPath(out, `extract/skills/${summary.skill}`)
  if (input.schema_version !== 1 || input.task_sha256 !== sha256(fs.readFileSync(path.join(out, "task.md"))) ||
      input.skill?.sha256 !== fingerprint(skillDir).sha256 ||
      input.initial_workspace?.sha256 !== fingerprint(path.join(out, "workspace")).sha256) {
    throw new Error("recorded inputs differ from collected bytes")
  }
  if (!Array.isArray(summary.hosts_run) || summary.hosts_run.length === 0 ||
      new Set(summary.hosts_run).size !== summary.hosts_run.length) {
    throw new Error("no unique host results were collected")
  }
  for (const host of summary.hosts_run) {
    if (!["claude", "codex", "grok", "opencode"].includes(host)) throw new Error("unknown recorded host")
    const dir = containedPath(out, `hosts/${host}`)
    for (const name of ["stdout.txt", "stderr.txt", "exit.json", "prompt.md", "argv.json", "git-status.txt", "git-head-files.txt"]) {
      if (!fs.lstatSync(path.join(dir, name)).isFile()) throw new Error(`missing regular host evidence: ${name}`)
    }
    const exit = JSON.parse(fs.readFileSync(path.join(dir, "exit.json"), "utf8"))
    if (!(exit.exitCode === null || Number.isInteger(exit.exitCode)) || typeof exit.timedOut !== "boolean") {
      throw new Error("invalid exit evidence")
    }
  }
}

/** Packs are relocatable. Never trust an archived absolute out path. */
export function containedPath(root: string, relative: string): string {
  if (typeof relative !== "string" || !relative || path.isAbsolute(relative) ||
      relative.includes("\\") || relative.includes(":") ||
      relative.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error(`invalid relative evidence path: ${relative}`)
  }
  const base = fs.realpathSync(root)
  let current = base
  for (const part of relative.split("/")) {
    current = path.join(current, part)
    if (fs.lstatSync(current).isSymbolicLink()) throw new Error(`symlink in evidence path: ${relative}`)
  }
  return current
}
