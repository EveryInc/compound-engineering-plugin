import fs from "node:fs"
import path from "node:path"
import type { Grade, Scenario } from "./catalog"
import { TRAILER_NAMES, type Host } from "./hosts"

export type EvalArm = "pre" | "post" | "preview"

export type Trailer = {
  files_read: string
  actions: string
  delegates: string
}

export type HostGrade = {
  host: Host
  ok: boolean
  pointer_ok: boolean
  reasons: string[]
  pointer_reasons: string[]
  trailers: Trailer | null
}

export type ArmGrade = {
  grades: HostGrade[]
  ok: boolean
  pointer_ok: boolean
}

/**
 * A trailer value still carrying the prompt's `<...>` angle-bracket placeholder is
 * the instruction echoed back, not a real answer. Codex writes its whole transcript
 * — including the prompt — to stderr, so without this the echo outranks the answer.
 */
function isPlaceholder(value: string): boolean {
  return /<[^>]*>/.test(value)
}

function lastTrailer(text: string, name: string): string {
  const prefix = `${name}:`
  for (const line of text.split("\n").reverse()) {
    const trimmed = line.trim()
    if (!trimmed.toUpperCase().startsWith(prefix)) continue
    const value = trimmed.slice(prefix.length).trim()
    if (isPlaceholder(value)) continue
    return value
  }
  return ""
}

function trailersIn(text: string): Trailer | null {
  const files = lastTrailer(text, TRAILER_NAMES.files_read)
  const actions = lastTrailer(text, TRAILER_NAMES.actions)
  const delegates = lastTrailer(text, TRAILER_NAMES.delegates)
  if (!files && !actions && !delegates) return null
  return { files_read: files, actions, delegates }
}

/**
 * Parts are tried in order and the first part carrying any trailer wins, so a
 * caller passing (stdout, stderr) grades the model's final answer and falls back
 * to the transcript only when stdout carried no trailer at all.
 */
export function parseTrailers(...parts: string[]): Trailer | null {
  for (const part of parts) {
    const trailers = trailersIn(part)
    if (trailers) return trailers
  }
  return null
}

function readText(file: string): string {
  try {
    return fs.readFileSync(file, "utf8")
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return ""
    throw err
  }
}

function combinedOutput(hostDir: string): { stdout: string; stderr: string; text: string } {
  const stdout = readText(path.join(hostDir, "stdout.txt"))
  const stderr = readText(path.join(hostDir, "stderr.txt"))
  return { stdout, stderr, text: `${stdout}\n${stderr}` }
}

/** An absent trailer is not "none" — it is an ungraded run. Presence is checked separately. */
function isNone(value: string): boolean {
  const v = value.trim().toLowerCase()
  return v === "none" || v === "n/a"
}

export function gradeHost(opts: {
  host: Host
  hostDir: string
  grade: Grade
  arm: EvalArm
}): HostGrade {
  const { stdout, stderr } = combinedOutput(opts.hostDir)
  const trailers = parseTrailers(stdout, stderr)
  const reasons: string[] = []
  const pointer_reasons: string[] = []
  const decision = stdout.toLowerCase()
  const files = (trailers?.files_read ?? "").toLowerCase()
  const actions = trailers?.actions ?? ""
  const workspace = path.join(opts.hostDir, "workspace")
  const exitRaw = readText(path.join(opts.hostDir, "exit.json"))
  if (exitRaw) {
    try {
      const exit = JSON.parse(exitRaw) as { exitCode: number | null; timedOut?: boolean }
      if (exit.timedOut) reasons.push("host timed out")
      else if (exit.exitCode !== 0) reasons.push(`host exit ${exit.exitCode}`)
    } catch {
      reasons.push("exit.json is not valid JSON")
    }
  }
  // Each grade term names the trailer it reads, so a run that emitted only some of
  // them cannot pass a term vacuously.
  const gradesPointers = (opts.arm === "post" || opts.arm === "preview") &&
    Boolean(opts.grade.files_read_post?.length)
  const required = new Set<string>()
  if (Boolean(opts.grade.must_exclude?.length) || opts.grade.actions === "none") {
    required.add(TRAILER_NAMES.actions)
  }
  if (opts.grade.delegates) required.add(TRAILER_NAMES.delegates)
  if (gradesPointers) required.add(TRAILER_NAMES.files_read)
  const present: Record<string, string> = {
    [TRAILER_NAMES.actions]: trailers?.actions ?? "",
    [TRAILER_NAMES.delegates]: trailers?.delegates ?? "",
    [TRAILER_NAMES.files_read]: trailers?.files_read ?? "",
  }
  const missing = [...required].filter((name) => !present[name])
  for (const name of missing) reasons.push(`missing ${name} trailer`)
  const has = (name: string) => !missing.includes(name)

  if (gradesPointers && opts.grade.files_read_post) {
    for (const ref of opts.grade.files_read_post) {
      if (!files.includes(path.basename(ref).toLowerCase())) {
        pointer_reasons.push(`${opts.arm} arm did not name required read ${ref} in ${TRAILER_NAMES.files_read}`)
      }
    }
  }
  for (const needle of opts.grade.must_include ?? []) {
    if (!decision.includes(needle.toLowerCase())) reasons.push(`missing required text: ${needle}`)
  }
  for (const needle of has(TRAILER_NAMES.actions) ? opts.grade.must_exclude ?? [] : []) {
    if (actions.includes(needle)) {
      reasons.push(`forbidden action in ${TRAILER_NAMES.actions}: ${needle}`)
    }
  }
  if (opts.grade.actions === "none" && has(TRAILER_NAMES.actions)) {
    if (!isNone(actions)) reasons.push(`expected ${TRAILER_NAMES.actions}: none, got ${actions}`)
  }
  if (opts.grade.delegates === "some" && has(TRAILER_NAMES.delegates)) {
    if (isNone(trailers?.delegates ?? "")) {
      reasons.push(`expected ${TRAILER_NAMES.delegates} to name a peer`)
    }
  }
  if (opts.grade.delegates === "none" && has(TRAILER_NAMES.delegates)) {
    if (!isNone(trailers?.delegates ?? "")) {
      reasons.push(`expected ${TRAILER_NAMES.delegates}: none, got ${trailers?.delegates}`)
    }
  }
  if (opts.grade.structured_status) {
    const re = new RegExp(`"status"\\s*:\\s*"${opts.grade.structured_status}"`)
    if (!re.test(stdout)) reasons.push(`missing structured status ${opts.grade.structured_status}`)
  }
  const statusLines = opts.grade.git || opts.grade.committed_must_not
    ? readText(path.join(opts.hostDir, "git-status.txt")).split("\n")
    : []
  if (opts.grade.git) {
    const dirty = statusLines
      .map((l) => l.trim())
      .some((l) => l && !l.startsWith("(") && !l.startsWith("#") && !l.startsWith("fatal:"))
    if (opts.grade.git === "clean" && dirty) reasons.push("workspace git status is dirty")
    if (opts.grade.git === "dirty" && !dirty) reasons.push("workspace git status is clean")
  }
  for (const check of opts.grade.workspace_contains ?? []) {
    const contents = readText(path.join(workspace, check.path))
    if (!contents.includes(check.needle)) {
      reasons.push(`${check.path} does not contain ${JSON.stringify(check.needle)}`)
    }
  }
  if (opts.grade.committed_must_not) {
    const head = readText(path.join(opts.hostDir, "git-head-files.txt"))
    for (const name of opts.grade.committed_must_not) {
      const inHead = head.split("\n").some((l) => l.trim() === name || l.trim().endsWith(`/${name}`))
      const staged = statusLines.some((l) => /^[ACDMR]./.test(l) && l.includes(name))
      if (inHead || staged) reasons.push(`${name} was staged or committed`)
    }
  }
  const allReasons = [...reasons, ...pointer_reasons]
  return {
    host: opts.host,
    ok: allReasons.length === 0,
    pointer_ok: pointer_reasons.length === 0,
    reasons: allReasons,
    pointer_reasons,
    trailers,
  }
}

export function gradeArm(opts: { out: string; scenario: Scenario; arm: EvalArm }): ArmGrade {
  const summary = JSON.parse(readText(path.join(opts.out, "summary.json"))) as {
    hosts_run: Host[]
  }
  const grades = (summary.hosts_run ?? []).map((host) =>
    gradeHost({
      host,
      hostDir: path.join(opts.out, "hosts", host),
      grade: opts.scenario.grade,
      arm: opts.arm,
    }),
  )
  return {
    grades,
    ok: grades.every((g) => g.ok),
    pointer_ok: grades.every((g) => g.pointer_ok),
  }
}
