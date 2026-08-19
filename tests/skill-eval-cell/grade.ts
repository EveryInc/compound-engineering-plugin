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

function lastTrailer(text: string, name: string): string {
  const prefix = `${name}:`
  for (const line of text.split("\n").reverse()) {
    const trimmed = line.trim()
    if (trimmed.toUpperCase().startsWith(prefix)) {
      return trimmed.slice(prefix.length).trim()
    }
  }
  return ""
}

export function parseTrailers(...parts: string[]): Trailer | null {
  const text = parts.join("\n")
  const files = lastTrailer(text, TRAILER_NAMES.files_read)
  const actions = lastTrailer(text, TRAILER_NAMES.actions)
  const delegates = lastTrailer(text, TRAILER_NAMES.delegates)
  if (!files && !actions && !delegates) return null
  return { files_read: files, actions, delegates }
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

function isNone(value: string): boolean {
  const v = value.trim().toLowerCase()
  return v === "" || v === "none" || v === "n/a"
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
  const needsTrailers =
    Boolean(opts.grade.must_exclude?.length) ||
    Boolean(opts.grade.files_read_post?.length) ||
    opts.grade.actions === "none" ||
    opts.grade.delegates === "none" ||
    opts.grade.delegates === "some"
  if (needsTrailers && !trailers) {
    reasons.push("missing ACTIONS/FILES_READ trailers")
  }

  if ((opts.arm === "post" || opts.arm === "preview") && opts.grade.files_read_post) {
    for (const ref of opts.grade.files_read_post) {
      if (!files.includes(path.basename(ref).toLowerCase())) {
        pointer_reasons.push(`${opts.arm} arm did not name required read ${ref} in ${TRAILER_NAMES.files_read}`)
      }
    }
  }
  for (const needle of opts.grade.must_include ?? []) {
    if (!decision.includes(needle.toLowerCase())) reasons.push(`missing required text: ${needle}`)
  }
  for (const needle of opts.grade.must_exclude ?? []) {
    if (actions.includes(needle)) {
      reasons.push(`forbidden action in ${TRAILER_NAMES.actions}: ${needle}`)
    }
  }
  if (opts.grade.actions === "none") {
    if (!isNone(actions)) reasons.push(`expected ${TRAILER_NAMES.actions}: none, got ${actions}`)
  }
  if (opts.grade.delegates === "some") {
    if (isNone(trailers?.delegates ?? "")) {
      reasons.push(`expected ${TRAILER_NAMES.delegates} to name a peer`)
    }
  }
  if (opts.grade.delegates === "none") {
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
