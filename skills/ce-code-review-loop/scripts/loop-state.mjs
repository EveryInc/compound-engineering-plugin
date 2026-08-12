#!/usr/bin/env node

import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { chmodSync, lstatSync, readFileSync, unlinkSync, writeFileSync } from "node:fs"
import { isAbsolute, relative, resolve, sep } from "node:path"

function regularPath(repo, absolute, { allowMissingLeaf = false } = {}) {
  const rel = relative(repo, absolute)
  if (!rel || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return null
  const components = rel.split(sep)
  let current = repo
  for (let index = 0; index < components.length; index += 1) {
    current = resolve(current, components[index])
    try {
      const stat = lstatSync(current)
      if (stat.isSymbolicLink()) return null
      if (index < components.length - 1 && !stat.isDirectory()) return null
      if (index === components.length - 1 && !stat.isFile()) return null
      if (index === components.length - 1) return stat
    } catch (error) {
      if (allowMissingLeaf && index === components.length - 1 && error?.code === "ENOENT") return "missing"
      return null
    }
  }
  return null
}
const INPUTS = new Set([
  "valid",
  "not_repository",
  "detached_head",
  "invalid_base",
  "invalid_head",
  "git_error",
])

function git(repo, args, { allowFailure = false } = {}) {
  try {
    return execFileSync("git", ["-C", repo, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim()
  } catch (error) {
    if (allowFailure) return null
    throw error
  }
}

function gitBytes(repo, args) {
  return execFileSync("git", ["-C", repo, ...args], {
    stdio: ["ignore", "pipe", "pipe"],
  })
}

function nulPaths(bytes) {
  return bytes.toString("utf8").split("\0").filter(Boolean).sort()
}

function gitPaths(repo) {
  const changed = execFileSync("git", ["-C", repo, "diff", "--name-only", "-z", "HEAD"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  })
  const untracked = execFileSync("git", ["-C", repo, "ls-files", "--others", "--exclude-standard", "-z"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  })
  return [...new Set(`${changed}${untracked}`.split("\0").filter(Boolean))].sort()
}

function commitPaths(repo, parent, commit) {
  return nulPaths(gitBytes(repo, ["diff", "--name-only", "--no-renames", "-z", parent, commit, "--"]))
}

function parseArgs(argv) {
  const [command, ...tokens] = argv
  const options = {}
  for (let index = 0; index < tokens.length; index += 2) {
    const flag = tokens[index]
    const value = tokens[index + 1]
    if (!flag?.startsWith("--") || value === undefined || options[flag.slice(2)] !== undefined) {
      return { command, options: null }
    }
    options[flag.slice(2)] = value
  }
  return { command, options }
}

function emit(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`)
}

function preflight(repo, base) {
  const result = {
    status: "blocked",
    input: "git_error",
    branch: null,
    base_sha: null,
    head_sha: null,
    clean: false,
  }

  if (!repo || !base) return result
  const inside = git(repo, ["rev-parse", "--is-inside-work-tree"], { allowFailure: true })
  if (inside !== "true") return { ...result, input: "not_repository" }

  const headSha = git(repo, ["rev-parse", "--verify", "HEAD^{commit}"], { allowFailure: true })
  if (!headSha) return { ...result, input: "invalid_head" }
  result.head_sha = headSha

  const resolvedBase = git(repo, ["rev-parse", "--verify", `${base}^{commit}`], { allowFailure: true })
  if (!resolvedBase) return { ...result, input: "invalid_base" }
  const baseSha = git(repo, ["merge-base", "HEAD", resolvedBase], { allowFailure: true })
  if (!baseSha) return { ...result, input: "invalid_base" }
  result.base_sha = baseSha

  const branch = git(repo, ["symbolic-ref", "--quiet", "--short", "HEAD"], { allowFailure: true })
  const porcelain = git(repo, ["status", "--porcelain=v1", "--untracked-files=all"], { allowFailure: true })
  if (porcelain === null) return result
  result.clean = porcelain.length === 0

  if (!branch) return { ...result, input: "detached_head" }
  return {
    status: "ok",
    input: "valid",
    branch,
    base_sha: baseSha,
    head_sha: headSha,
    clean: result.clean,
  }
}

function readJson(file) {
  try {
    const value = JSON.parse(readFileSync(file, "utf8"))
    return value && typeof value === "object" && !Array.isArray(value) ? value : null
  } catch {
    return null
  }
}

function uniqueStrings(value) {
  return stringArray(value) && new Set(value).size === value.length
}

function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex")
}

function parseGitEntry(bytes, expectedPath, source) {
  if (bytes.length === 0) return null
  const terminator = bytes.indexOf(0)
  if (terminator < 0 || terminator !== bytes.length - 1) return undefined
  const entry = bytes.subarray(0, terminator).toString("utf8")
  const tab = entry.indexOf("\t")
  if (tab < 0 || entry.slice(tab + 1) !== expectedPath) return undefined
  const fields = entry.slice(0, tab).split(" ")
  if (fields.length !== 3) return undefined
  if (source === "index") return { mode: fields[0], type: "blob", oid: fields[1] }
  return { mode: fields[0], type: fields[1], oid: fields[2] }
}

function blobSnapshot(repo, path, source) {
  const entryBytes = source === "index"
    ? gitBytes(repo, ["ls-files", "--stage", "-z", "--", path])
    : gitBytes(repo, ["ls-tree", "-z", source, "--", path])
  const entry = parseGitEntry(entryBytes, path, source)
  if (entry === null) return { path, exists: false }
  if (!entry || entry.type !== "blob" || !/^[0-7]{6}$/.test(entry.mode) || !/^[0-9a-f]+$/.test(entry.oid)) return null
  const bytes = gitBytes(repo, ["cat-file", "blob", entry.oid])
  return {
    path,
    exists: true,
    bytes: bytes.toString("base64"),
    digest: digest(bytes),
    blob_oid: entry.oid,
    mode: entry.mode,
  }
}

function captureSnapshots(repo, paths, source) {
  const snapshots = []
  for (const path of paths) {
    const snapshot = blobSnapshot(repo, path, source)
    if (!snapshot) return null
    snapshots.push(snapshot)
  }
  return snapshots
}

function snapshotMismatch(expected, observed) {
  const mismatches = []
  for (let index = 0; index < expected.length; index += 1) {
    const left = expected[index]
    const right = observed[index]
    if (
      !right
      || left.path !== right.path
      || left.exists !== right.exists
      || (left.exists && (
        left.bytes !== right.bytes
        || left.digest !== right.digest
        || left.blob_oid !== right.blob_oid
        || left.mode !== right.mode
      ))
    ) mismatches.push(left.path)
  }
  return mismatches
}

function pathSetDifference(expected, observed) {
  const expectedSet = new Set(expected)
  const observedSet = new Set(observed)
  return [...new Set([
    ...expected.filter((path) => !observedSet.has(path)),
    ...observed.filter((path) => !expectedSet.has(path)),
  ])].sort()
}

function commitIntegrityFailure(reason, commitSha, changedPaths, clean) {
  return {
    status: "commit_integrity_failure",
    reason,
    commit_sha: commitSha,
    changed_paths: changedPaths,
    clean,
  }
}

function insideRepo(repo, file) {
  const value = relative(repo, file)
  return value === "" || (!value.startsWith(`..${sep}`) && value !== ".." && !isAbsolute(value))
}

function privateArtifact(repo, file) {
  if (typeof file !== "string" || file.length === 0) return false
  return !insideRepo(repo, resolve(file))
}

function intendedPaths(repo, pathsFile) {
  let value
  try {
    value = JSON.parse(readFileSync(pathsFile, "utf8"))
  } catch {
    return null
  }
  if (!uniqueStrings(value)) return null

  const paths = []
  for (const candidate of value) {
    if (candidate.includes("\0") || candidate.includes("\\") || isAbsolute(candidate)) return null
    const absolute = resolve(repo, candidate)
    const canonical = relative(repo, absolute).split(sep).join("/")
    if (!canonical || canonical !== candidate || canonical.startsWith("../")) return null
    const stat = regularPath(repo, absolute, { allowMissingLeaf: true })
    if (!stat) return null
    if (stat === "missing") {
      paths.push({ path: canonical, exists: false })
      continue
    }
    const bytes = readFileSync(absolute)
    paths.push({
      path: canonical,
      exists: true,
      bytes: bytes.toString("base64"),
      digest: digest(bytes),
      mode: stat.mode & 0o777,
    })
  }
  return paths.length > 0 ? paths : null
}

function readCycleState(repo, stateFile) {
  if (!privateArtifact(repo, stateFile)) return null
  try {
    const stat = lstatSync(stateFile)
    if (!stat.isFile() || stat.isSymbolicLink()) return null
  } catch {
    return null
  }
  const state = readJson(stateFile)
  if (
    !state
    || state.version !== 1
    || state.repo !== repo
    || typeof state.branch !== "string"
    || typeof state.head_sha !== "string"
    || !uniqueStrings(state.paths)
    || !Array.isArray(state.files)
    || state.files.length !== state.paths.length
    || !privateArtifact(repo, state.verification_json)
  ) return null
  for (let index = 0; index < state.files.length; index += 1) {
    const file = state.files[index]
    if (
      !file || typeof file !== "object" || Array.isArray(file)
      || file.path !== state.paths[index]
      || typeof file.exists !== "boolean"
    ) return null
    if (!file.exists) {
      if (Object.keys(file).some((key) => !["path", "exists"].includes(key))) return null
      continue
    }
    if (
      typeof file.bytes !== "string"
      || typeof file.digest !== "string"
      || !Number.isInteger(file.mode)
    ) return null
    const bytes = Buffer.from(file.bytes, "base64")
    if (digest(bytes) !== file.digest) return null
  }
  return state
}

function cycleGuard(repo, state) {
  const branch = git(repo, ["symbolic-ref", "--quiet", "--short", "HEAD"], { allowFailure: true })
  const headSha = git(repo, ["rev-parse", "--verify", "HEAD^{commit}"], { allowFailure: true })
  const changedPaths = gitPaths(repo)
  const intended = new Set(state.paths)
  const unrelated = changedPaths.filter((file) => !intended.has(file))
  if (branch !== state.branch || headSha !== state.head_sha || unrelated.length > 0) {
    return {
      ok: false,
      result: {
        status: "concurrent_change",
        branch,
        head_sha: headSha,
        changed_paths: unrelated,
      },
    }
  }
  return { ok: true, branch, headSha, changedPaths }
}

function cycleCheckpoint(repoValue, stateFile, pathsFile, verificationFile) {
  if (!repoValue || !stateFile || !pathsFile || !verificationFile) return malformed("arguments")
  const repo = resolve(repoValue)
  if (![stateFile, pathsFile, verificationFile].every((file) => privateArtifact(repo, file))) {
    return malformed("private_artifact")
  }
  const files = intendedPaths(repo, pathsFile)
  if (!files) return malformed("paths")
  const entry = preflight(repo, "HEAD")
  if (entry.input !== "valid" || !entry.clean) return { ...entry, status: "concurrent_change" }

  const state = {
    version: 1,
    repo,
    branch: entry.branch,
    head_sha: entry.head_sha,
    paths: files.map((file) => file.path),
    files,
    verification_json: resolve(verificationFile),
  }
  try {
    writeFileSync(stateFile, `${JSON.stringify(state)}\n`, { mode: 0o600, flag: "wx" })
    chmodSync(stateFile, 0o600)
  } catch {
    return malformed("state")
  }
  return {
    status: "checkpointed",
    branch: state.branch,
    head_sha: state.head_sha,
    paths: state.paths,
  }
}

function cycleRestore(repoValue, stateFile) {
  if (!repoValue || !stateFile) return malformed("arguments")
  const repo = resolve(repoValue)
  const state = readCycleState(repo, stateFile)
  if (!state) return malformed("state")
  const guarded = cycleGuard(repo, state)
  if (!guarded.ok) return guarded.result

  const currentFiles = []
  for (const file of state.files) {
    const absolute = resolve(repo, file.path)
    const current = regularPath(repo, absolute, { allowMissingLeaf: true })
    if (!current) {
      return { status: "concurrent_change", branch: guarded.branch, head_sha: guarded.headSha, changed_paths: [file.path] }
    }
    currentFiles.push({ file, absolute, current })
  }
  for (const { file, absolute, current } of currentFiles) {
    if (!file.exists) {
      if (current !== "missing") unlinkSync(absolute)
      continue
    }
    writeFileSync(absolute, Buffer.from(file.bytes, "base64"))
    chmodSync(absolute, file.mode)
  }
  const remaining = gitPaths(repo)
  if (remaining.length > 0) return { status: "restore_failed", changed_paths: remaining }
  return { status: "restored", clean: true, paths: state.paths }
}

function cycleCommit(repoValue, stateFile, message) {
  if (!repoValue || !stateFile || typeof message !== "string" || message.length === 0 || message.includes("\0")) {
    return malformed("arguments")
  }
  const repo = resolve(repoValue)
  const state = readCycleState(repo, stateFile)
  if (!state) return malformed("state")
  const guarded = cycleGuard(repo, state)
  if (!guarded.ok) return guarded.result

  try {
    const verificationStat = lstatSync(state.verification_json)
    if (!verificationStat.isFile() || verificationStat.isSymbolicLink()) return malformed("verification_json")
  } catch {
    return malformed("verification_json")
  }
  const verification = readJson(state.verification_json)
  if (!verification || verification.status !== "passed") {
    return { status: "verification_failed", verification_status: verification?.status ?? "malformed" }
  }

  const expectedPaths = [...state.paths].sort()
  if (
    guarded.changedPaths.length !== expectedPaths.length
    || guarded.changedPaths.some((file, index) => file !== expectedPaths[index])
  ) return malformed("diff_paths", { changed_paths: guarded.changedPaths })

  for (const file of state.paths) {
    const absolute = resolve(repo, file)
    if (!regularPath(repo, absolute, { allowMissingLeaf: true })) return malformed("unsafe_path", { path: file })
  }

  let verifiedSnapshots
  try {
    git(repo, ["add", "--", ...state.paths])
    verifiedSnapshots = captureSnapshots(repo, state.paths, "index")
    if (!verifiedSnapshots) return { status: "commit_failed", reason: "staged_snapshot", paths: state.paths }
  } catch {
    return { status: "commit_failed", reason: "staging", paths: state.paths }
  }

  let commitCommandFailed = false
  try {
    git(repo, ["commit", "-m", message])
  } catch {
    commitCommandFailed = true
  }
  const commitSha = git(repo, ["rev-parse", "--verify", "HEAD^{commit}"], { allowFailure: true })
  if (!commitSha) return commitIntegrityFailure("missing_commit_sha", null, gitPaths(repo), false)
  if (commitCommandFailed && commitSha === state.head_sha) return { status: "commit_failed", paths: state.paths }

  const changedAfterCommit = gitPaths(repo)
  const clean = changedAfterCommit.length === 0
  const ancestry = git(repo, ["rev-list", "--parents", "-n", "1", commitSha], { allowFailure: true })?.split(" ")
  if (!ancestry || ancestry.length !== 2 || ancestry[0] !== commitSha || ancestry[1] !== state.head_sha) {
    return commitIntegrityFailure("unexpected_parent", commitSha, [], clean)
  }

  let committedPaths
  try {
    committedPaths = commitPaths(repo, state.head_sha, commitSha)
  } catch {
    return commitIntegrityFailure("commit_diff_unreadable", commitSha, [], clean)
  }
  const diffMismatch = pathSetDifference(expectedPaths, committedPaths)
  if (diffMismatch.length > 0) {
    return commitIntegrityFailure("commit_diff_paths_mismatch", commitSha, diffMismatch, clean)
  }

  let committedSnapshots
  try {
    committedSnapshots = captureSnapshots(repo, state.paths, commitSha)
  } catch {
    return commitIntegrityFailure("committed_snapshot_unreadable", commitSha, state.paths, clean)
  }
  if (!committedSnapshots) {
    return commitIntegrityFailure("committed_snapshot_unreadable", commitSha, state.paths, clean)
  }
  const snapshotChangedPaths = snapshotMismatch(verifiedSnapshots, committedSnapshots)
  if (snapshotChangedPaths.length > 0) {
    return commitIntegrityFailure("committed_snapshot_mismatch", commitSha, snapshotChangedPaths, clean)
  }
  if (!clean) return commitIntegrityFailure("working_tree_not_clean", commitSha, changedAfterCommit, false)

  return { status: "committed", commit_sha: commitSha, clean: true, paths: state.paths }
}
function stringArray(value) {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string" && entry.length > 0)
}

function validFailure(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    && typeof value.reviewer === "string" && value.reviewer.length > 0
    && typeof value.reason === "string" && value.reason.length > 0
    && typeof value.required === "boolean"
}

const VERDICTS = new Set(["Ready to merge", "Ready with fixes", "Not ready"])
const TERMINAL_STATUSES = new Set(["complete", "degraded", "failed"])
const SEVERITIES = new Set(["P0", "P1", "P2", "P3"])
const CONFIDENCES = new Set([0, 25, 50, 75, 100])
const AUTOFIX_CLASSES = new Set(["gated_auto", "manual", "advisory"])
const OWNERS = new Set(["downstream-resolver", "human", "release"])

function findingId(value) {
  if (typeof value === "number") return Number.isInteger(value) && value > 0 ? String(value) : null
  return typeof value === "string" && value.trim().length > 0 ? value : null
}

function validLine(value) {
  return (Number.isInteger(value) && value > 0)
    || (typeof value === "string" && value.trim().length > 0)
}

function validFinding(value) {
  const suggestedFix = value?.suggested_fix
  const firstEvidence = value?.first_evidence
  return value && typeof value === "object" && !Array.isArray(value)
    && findingId(value["#"]) !== null
    && typeof value.title === "string" && value.title.length > 0
    && SEVERITIES.has(value.severity)
    && typeof value.file === "string" && value.file.length > 0
    && validLine(value.line)
    && CONFIDENCES.has(value.confidence)
    && AUTOFIX_CLASSES.has(value.autofix_class)
    && OWNERS.has(value.owner)
    && typeof value.requires_verification === "boolean"
    && typeof value.pre_existing === "boolean"
    && (suggestedFix === null || (typeof suggestedFix === "string" && suggestedFix.length > 0))
    && (firstEvidence === undefined || (typeof firstEvidence === "string" && firstEvidence.length > 0))
    && typeof value.why_it_matters === "string" && value.why_it_matters.length > 0
    && Array.isArray(value.evidence) && value.evidence.length > 0
    && value.evidence.every((entry) => typeof entry === "string" && entry.length > 0)
    && uniqueStrings(value.reviewers)
    && uniqueStrings(value.independent_reviewers)
    && value.independent_reviewers.every((reviewer) => value.reviewers.includes(reviewer))
}

function canonicalJson(value) {
  if (Array.isArray(value)) return value.map(canonicalJson)
  if (!value || typeof value !== "object") return value
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalJson(value[key])]))
}

function jsonEqual(left, right) {
  return JSON.stringify(canonicalJson(left)) === JSON.stringify(canonicalJson(right))
}

function validateFindingProjection(findings, actionableFindings) {
  const findingIds = findings.map((finding) => findingId(finding["#"]))
  const actionableIds = actionableFindings.map((finding) => findingId(finding["#"]))
  if (new Set(findingIds).size !== findingIds.length || new Set(actionableIds).size !== actionableIds.length) {
    return false
  }

  const findingsById = new Map(findings.map((finding) => [findingId(finding["#"]), finding]))
  const expectedIds = new Set(findings
    .filter((finding) => ["gated_auto", "manual"].includes(finding.autofix_class)
      && finding.owner === "downstream-resolver")
    .map((finding) => findingId(finding["#"])))
  if (expectedIds.size !== actionableIds.length || actionableIds.some((id) => !expectedIds.has(id))) return false

  return actionableFindings.every((finding) => {
    const fullFinding = findingsById.get(findingId(finding["#"]))
    return fullFinding && jsonEqual(finding, fullFinding)
  })
}

function malformed(reason, observed = {}) {
  return { status: "malformed", reason, ...observed }
}

function validateReview(repo, expectedFile, reviewFile, { final = false } = {}) {
  const expected = readJson(expectedFile)
  const review = readJson(reviewFile)
  if (!expected) return malformed("expected_json")
  if (!review) return malformed("review_json")
  if (
    typeof expected.branch !== "string"
    || typeof expected.base_sha !== "string"
    || typeof expected.head_sha !== "string"
  ) return malformed("expected_shape")

  const actual = preflight(repo, expected.base_sha)
  const observed = {
    branch: actual.branch,
    base_sha: actual.base_sha,
    head_sha: actual.head_sha,
    clean: actual.clean,
  }
  if (
    actual.input !== "valid"
    || actual.branch !== expected.branch
    || actual.base_sha !== expected.base_sha
    || actual.head_sha !== expected.head_sha
    || !actual.clean
  ) return { status: "concurrent_change", ...observed }

  const receipt = review.review_receipt
  if (
    !TERMINAL_STATUSES.has(review.status)
    || !VERDICTS.has(review.verdict)
    || !receipt || typeof receipt !== "object" || Array.isArray(receipt)
    || !TERMINAL_STATUSES.has(receipt.terminal_status)
    || review.status !== receipt.terminal_status
    || typeof receipt.branch !== "string"
    || typeof receipt.base_sha !== "string"
    || typeof receipt.head_sha !== "string"
    || !uniqueStrings(receipt.selected_reviewers)
    || !uniqueStrings(receipt.required_reviewers)
    || !uniqueStrings(receipt.completed_reviewers)
    || !Array.isArray(receipt.failed_reviewers)
    || !receipt.failed_reviewers.every(validFailure)
    || !Array.isArray(review.findings)
    || !review.findings.every(validFinding)
    || !Array.isArray(review.actionable_findings)
    || !review.actionable_findings.every(validFinding)
    || !validateFindingProjection(review.findings, review.actionable_findings)
    || !Array.isArray(review.triage_groups)
  ) return malformed("review_shape", observed)

  const selected = new Set(receipt.selected_reviewers)
  const required = new Set(receipt.required_reviewers)
  const completed = new Set(receipt.completed_reviewers)
  const failedNames = receipt.failed_reviewers.map((entry) => entry.reviewer)
  const failed = new Set(failedNames)
  if (
    failed.size !== failedNames.length
    || receipt.required_reviewers.some((reviewer) => !selected.has(reviewer))
    || receipt.completed_reviewers.some((reviewer) => !selected.has(reviewer))
    || failedNames.some((reviewer) => !selected.has(reviewer))
    || receipt.failed_reviewers.some((entry) => entry.required !== required.has(entry.reviewer))
    || receipt.selected_reviewers.some((reviewer) => completed.has(reviewer) === failed.has(reviewer))
  ) return malformed("reviewer_roster", observed)
  if (
    receipt.branch !== expected.branch
    || receipt.base_sha !== expected.base_sha
    || receipt.head_sha !== expected.head_sha
  ) return malformed("receipt_mismatch", observed)

  if (receipt.completed_reviewers.length === 0 && receipt.terminal_status !== "failed") {
    return malformed("terminal_status", observed)
  }
  if (receipt.completed_reviewers.length > 0 && receipt.terminal_status === "failed") {
    return malformed("terminal_status", observed)
  }

  const failedRequired = receipt.failed_reviewers
    .filter((entry) => entry.required)
    .map((entry) => entry.reviewer)
  const missingRequired = receipt.required_reviewers.filter((reviewer) => !completed.has(reviewer))
  if (missingRequired.length > 0 || failedRequired.length > 0) {
    return {
      status: "coverage_gap",
      terminal_status: receipt.terminal_status,
      missing_required_reviewers: missingRequired,
      failed_required_reviewers: failedRequired,
      ...observed,
    }
  }
  if (receipt.terminal_status === "degraded") {
    return malformed("degraded_without_coverage_gap", observed)
  }
  if (receipt.terminal_status === "failed") {
    if (receipt.completed_reviewers.length > 0) return malformed("terminal_status", observed)
    return {
      status: "failed_review",
      terminal_status: receipt.terminal_status,
      failed_reviewers: failedNames,
      ...observed,
    }
  }

  if (final && (review.verdict !== "Ready to merge" || review.actionable_findings.length !== 0)) {
    return {
      status: "not_final",
      reason: review.verdict !== "Ready to merge" ? "verdict" : "actionable_findings",
      verdict: review.verdict,
      actionable_findings: review.actionable_findings.length,
      ...observed,
    }
  }

  return { status: "valid", ...observed }
}

const { command, options } = parseArgs(process.argv.slice(2))
if (!options) {
  emit({ status: "malformed", reason: "arguments" })
} else if (command === "preflight") {
  const result = preflight(options.repo, options.base)
  if (!INPUTS.has(result.input)) result.input = "git_error"
  emit(result)
} else if (command === "validate-review" || command === "validate-final") {
  emit(validateReview(options.repo, options.expected, options.review, { final: command === "validate-final" }))
} else if (command === "cycle-checkpoint") {
  emit(cycleCheckpoint(options.repo, options.state, options["paths-json"], options["verification-json"]))
} else if (command === "cycle-restore") {
  emit(cycleRestore(options.repo, options.state))
} else if (command === "cycle-commit") {
  emit(cycleCommit(options.repo, options.state, options.message))
} else {
  emit({ status: "malformed", reason: "command" })
}
