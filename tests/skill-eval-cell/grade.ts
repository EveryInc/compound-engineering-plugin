import fs from "node:fs"
import path from "node:path"
import type { Grade, Scenario } from "./catalog"
import { TRAILER_NAMES, type Host } from "./hosts"
import { SHIM_LOG } from "./path-shim"

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

/**
 * Read a labeled block: the text after the last line that is the label itself
 * (`ROUTING`, `ROUTING:`, `## ROUTING`, `**ROUTING:**`), up to the next Markdown
 * heading, the next `LABEL:` field line, or the trailers, whichever comes first. A
 * `LABEL: value` line keeps single-line semantics. Hosts render a requested field as a
 * heading or a bold label as often as `LABEL:`, and a field whose content is a list
 * never fits on the label line; ending at the next section keeps a decision stated in
 * a later section from satisfying a needle scoped to this one.
 */
function isFieldBoundary(line: string): boolean {
  const trimmed = line.trim()
  // A boundary is a syntactic label signal, the same shapes the opener accepts: a
  // Markdown heading; a line that opens with a bold segment (`**DETAILS**`,
  // `**Details and Rationale**`, `**DETAILS:** explanation`); or a `Label:` line whose
  // label is one to five capitalized words, connectors allowed (`DETAILS:`, `Details:`,
  // `Details and Rationale:`). A bare unmarked word on its own line is content
  // (`## OUTCOME` then `unresolved` is a one-word value), and prose that starts with an
  // acronym or a lowercase-word phrase before a colon ("PR creation ...",
  // "API behavior: ...") is content too, so none of those close a field.
  if (/^#{1,6}\s+\S/.test(trimmed)) return true
  // A marked label (bold, or a line that is only `words:`) is one to five words with no
  // sentence punctuation, in any case: `**Next steps**`, `Next steps:`, `**DETAILS:**`,
  // `Details and Rationale:`. `**Candidate A: discard.** It merely...` has a colon and a
  // period inside the bold, so it is a finding that opens in bold and stays content.
  const marked = /^[A-Za-z][A-Za-z0-9_-]*(\s+[A-Za-z0-9_-]+){0,4}:?$/
  // Bold is structural by syntax alone, whatever the words inside: the bold segment is
  // the whole line (`**Next steps**`, `**Risks & Trade-offs**`), or a colon follows it,
  // inside or outside the markup (`**DETAILS:** explanation`, `**Details**: explanation`).
  // `**PR creation** preserves the stamp` and `**Candidate A: discard.** It merely...`
  // are emphasized lead-ins on prose lines and stay content.
  const bold = trimmed.match(/^\*\*([^*]+)\*\*(.*)$/)
  if (bold) {
    const inner = bold[1].trim()
    const rest = bold[2].trim()
    return rest === "" || rest.startsWith(":") || inner.endsWith(":")
  }
  if (marked.test(trimmed) && trimmed.endsWith(":")) return true
  // `Label: value` with content after the colon needs capitalized label words, so
  // "API behavior: revocation compares..." stays content while `DETAILS: ...` closes.
  return /^[A-Z][A-Za-z0-9_-]*(\s+(?:and|or|of|the|to|for|[A-Z][A-Za-z0-9_-]*)){0,4}:\s/.test(trimmed)
}

function lastFieldBlock(text: string, name: string): string {
  const lines = text.split("\n")
  const upper = name.toUpperCase()
  for (let i = lines.length - 1; i >= 0; i--) {
    const plain = lines[i].trim().replace(/^#{1,6}\s+/, "").replaceAll("**", "").trim()
    const head = plain.toUpperCase()
    if (head !== upper && head !== `${upper}:` && !head.startsWith(`${upper}:`)) continue
    const onLabelLine = plain.slice(upper.length).replace(/^:/, "").trim()
    if (onLabelLine) {
      // `LABEL: value` keeps single-line semantics, placeholder check included.
      if (isPlaceholder(onLabelLine)) continue
      return onLabelLine
    }
    const rest = lines.slice(i + 1)
    // The block ends at the next label line, as isFieldBoundary decides, and nowhere
    // else. A field whose value must survive intervening labels is graded with
    // `declared` (one line per value), not with a block.
    const end = rest.findIndex(isFieldBoundary)
    const following = (end === -1 ? rest : rest.slice(0, end))
      .filter((line) => !/^(FILES_READ|ACTIONS|DELEGATES_DISPATCHED|TEAM):/i.test(line.trim()))
      .join("\n")
      .trim()
    const firstLine = following.split("\n").find((line) => line.trim()) ?? ""
    if (!following || isPlaceholder(firstLine)) continue
    return following
  }
  return ""
}

/** Read a standalone labeled field while ignoring Markdown heading/bold decoration. */
// A marker opens the block only at the end of a line and closes it only at the start
// of one: the summary after the block may mention RESULT-START and RESULT-END by name
// mid-sentence, and a substring search would select that mention instead of the
// result. Grok narrates on the same line as the opening marker, so the line need not
// be the marker alone. The first complete pair wins.
function resultBlock(text: string): string | null {
  const lines = text.split("\n")
  const opens = (line: string) => line.trim().endsWith("RESULT-START")
  const closes = (line: string) => line.trim().startsWith("RESULT-END")
  for (let i = 0; i < lines.length; i++) {
    if (!opens(lines[i])) continue
    const end = lines.findIndex((line, j) => j > i && closes(line))
    if (end < 0) return null
    return lines.slice(i + 1, end).join("\n")
  }
  return null
}

/**
 * Every line of the answer that is `LABEL: value`, decoration ignored, wherever it sits.
 * Position is not the signal: Grok narrates to stdout before the answer, so line one
 * is often not the answer at all. The task asks for exactly one such line, so the
 * caller fails on zero or several and grades the value of the single one.
 */
function declaredLines(text: string, name: string): string[] {
  const prefix = `${name.toUpperCase()}:`
  return text
    .split("\n")
    .map((line) => line.trim().replace(/^#{1,6}\s+/, "").replaceAll("**", "").trim())
    .filter((plain) => plain.toUpperCase().startsWith(prefix))
    .map((plain) => plain.slice(prefix.length).trim())
}

function lastField(text: string, name: string): string {
  const prefix = `${name}:`
  for (const line of text.split("\n").reverse()) {
    const plain = line.trim().replace(/^#{1,6}\s+/, "").replaceAll("**", "")
    if (!plain.toUpperCase().startsWith(prefix)) continue
    const value = plain.slice(prefix.length).trim()
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

function normalizeTrailerPath(p: string): string {
  return p.trim().replaceAll("\\", "/").replace(/^\.\//, "")
}

function trailerNames(filesRead: string[], required: string): boolean {
  const want = normalizeTrailerPath(required.toLowerCase())
  return filesRead.some((entry) => entry === want || entry.endsWith(`/${want}`))
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
  const gradesWorkspaceRead = Boolean(opts.grade.workspace_read?.length)
  const hasActions = Boolean(trailers?.actions)
  const hasDelegates = Boolean(trailers?.delegates)
  const gradesActions = Boolean(opts.grade.must_exclude?.length) || opts.grade.actions === "none"
  if (gradesActions && !hasActions) reasons.push(`missing ${TRAILER_NAMES.actions} trailer`)
  if (opts.grade.delegates && !hasDelegates) {
    reasons.push(`missing ${TRAILER_NAMES.delegates} trailer`)
  }
  if ((gradesPointers || gradesWorkspaceRead) && !trailers?.files_read) {
    reasons.push(`missing ${TRAILER_NAMES.files_read} trailer`)
  }

  // Match the required path, not its basename: a common name like method.md would
  // otherwise be satisfied by any docs/method.md the run happened to read.
  const filesRead = files
    .split(",")
    .map((entry) => normalizeTrailerPath(entry))
    .filter(Boolean)
  if (gradesPointers && opts.grade.files_read_post) {
    for (const ref of opts.grade.files_read_post) {
      if (!trailerNames(filesRead, ref)) {
        pointer_reasons.push(`${opts.arm} arm did not name required read ${ref} in ${TRAILER_NAMES.files_read}`)
      }
    }
  }
  if (gradesWorkspaceRead && opts.grade.workspace_read) {
    for (const rel of opts.grade.workspace_read) {
      if (!trailerNames(filesRead, rel)) {
        reasons.push(`did not name workspace read ${rel} in ${TRAILER_NAMES.files_read}`)
      }
    }
  }
  // A roster probe grades the declared team, not narration that merely mentions a
  // persona. must_not_include marks a roster probe: it reads only the `TEAM:` trailer
  // and fails when the run declared none, so a run cannot pass by staying quiet.
  // must_include reads that trailer when present and the whole answer otherwise.
  const team = lastTrailer(decision, "TEAM")
  // must_include_field scopes the needles to one delimited field of the answer. The
  // trailers wrapPrompt mandates are part of stdout, so an unscoped needle can be
  // satisfied by a read path or a branch name instead of the text under test. A run
  // that emitted no such field fails rather than passing on the trailers.
  const scopeField = opts.grade.must_include_field
  const scopedText = scopeField ? lastFieldBlock(stdout, scopeField).toLowerCase() : ""
  if (scopeField && !scopedText) reasons.push(`missing ${scopeField} field`)
  const textScope = scopeField ? scopedText : team || decision
  for (const needle of scopeField && !scopedText ? [] : opts.grade.must_include ?? []) {
    if (!textScope.includes(needle.toLowerCase())) reasons.push(`missing required text: ${needle}`)
  }
  for (const options of scopeField && !scopedText ? [] : opts.grade.must_include_any ?? []) {
    if (!options.some((needle) => textScope.includes(needle.toLowerCase()))) {
      reasons.push(`missing required text (any of): ${options.join(" | ")}`)
    }
  }
  if (opts.grade.result_must_not_include?.length) {
    const block = resultBlock(stdout)
    if (block === null) reasons.push("missing RESULT-START/RESULT-END block")
    for (const needle of block === null ? [] : opts.grade.result_must_not_include) {
      if (block.toLowerCase().includes(needle.toLowerCase())) {
        reasons.push(`source phrase survived in RESULT block: ${needle}`)
      }
    }
  }
  if (opts.grade.must_not_include?.length && !team) reasons.push("missing TEAM trailer")
  for (const needle of team ? opts.grade.must_not_include ?? [] : []) {
    if (team.includes(needle.toLowerCase())) reasons.push(`forbidden text in TEAM trailer: ${needle}`)
  }
  for (const [label, want] of Object.entries(opts.grade.declared ?? {})) {
    const values = declaredLines(stdout, label)
    if (values.length === 0) reasons.push(`expected one ${label} line: ${want}, got none`)
    else if (values.length > 1) reasons.push(`expected one ${label} line, got ${values.length}`)
    else if (values[0].toLowerCase() !== want.toLowerCase()) {
      reasons.push(`expected ${label}: ${want}, got ${values[0]}`)
    }
  }
  if (opts.grade.classification) {
    const actual = lastField(stdout, "CLASSIFICATION")
    if (actual !== opts.grade.classification) {
      reasons.push(
        `expected Classification: ${opts.grade.classification}, got ${actual || "no classification"}`,
      )
    }
  }
  for (const needle of hasActions ? opts.grade.must_exclude ?? [] : []) {
    if (actions.includes(needle)) {
      reasons.push(`forbidden action in ${TRAILER_NAMES.actions}: ${needle}`)
    }
  }
  if (opts.grade.actions === "none" && hasActions) {
    if (!isNone(actions)) reasons.push(`expected ${TRAILER_NAMES.actions}: none, got ${actions}`)
  }
  if (opts.grade.delegates === "some" && hasDelegates) {
    if (isNone(trailers?.delegates ?? "")) {
      reasons.push(`expected ${TRAILER_NAMES.delegates} to name a peer`)
    }
  }
  if (opts.grade.delegates_must_not_include?.length) {
    if (!hasDelegates) reasons.push(`missing ${TRAILER_NAMES.delegates} trailer`)
    const declared = (trailers?.delegates ?? "").toLowerCase()
    for (const needle of hasDelegates ? opts.grade.delegates_must_not_include : []) {
      if (declared.includes(needle.toLowerCase())) {
        reasons.push(`forbidden delegate in ${TRAILER_NAMES.delegates}: ${needle}`)
      }
    }
  }
  if (opts.grade.delegates === "none" && hasDelegates) {
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
  for (const needle of opts.grade.shim_log_must_not ?? []) {
    // The attempt, not the model's account of it: a shimmed command fails, so a
    // skill can truthfully report ACTIONS: none and still have made the call.
    const log = readText(path.join(opts.hostDir, ".bin", SHIM_LOG))
    if (log.includes(needle)) reasons.push(`forbidden text reached shim log: ${needle}`)
  }
  if (opts.grade.committed_must) {
    const head = readText(path.join(opts.hostDir, "git-head-files.txt"))
    for (const name of opts.grade.committed_must) {
      const inHead = head.split("\n").some((l) => l.trim() === name || l.trim().endsWith(`/${name}`))
      if (!inHead) reasons.push(`${name} was never committed`)
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
