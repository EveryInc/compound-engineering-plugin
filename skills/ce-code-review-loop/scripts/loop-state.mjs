#!/usr/bin/env node

import { execFileSync } from "node:child_process"
import { createHash, randomBytes, randomUUID } from "node:crypto"
import { chmodSync, existsSync, linkSync, lstatSync, mkdirSync, readFileSync, realpathSync, renameSync, unlinkSync, writeFileSync } from "node:fs"
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path"

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

function worktreeSnapshot(repo, path) {
  const absolute = resolve(repo, path)
  const stat = regularPath(repo, absolute, { allowMissingLeaf: true })
  if (!stat) return null
  if (stat === "missing") return { path, exists: false }
  const bytes = readFileSync(absolute)
  return {
    path,
    exists: true,
    bytes: bytes.toString("base64"),
    digest: digest(bytes),
    mode: stat.mode & 0o777,
  }
}

function captureWorktreeSnapshots(repo, paths) {
  const snapshots = []
  for (const path of paths) {
    const snapshot = worktreeSnapshot(repo, path)
    if (!snapshot) return null
    snapshots.push(snapshot)
  }
  return snapshots
}

function worktreeSnapshotMismatch(expected, observed) {
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
        || left.mode !== right.mode
      ))
    ) mismatches.push(left.path)
  }
  return mismatches
}

function safeGitPaths(repo, fallback = []) {
  try {
    return gitPaths(repo)
  } catch {
    return [...fallback].sort()
  }
}

function atomicWriteJson(file, value) {
  const temporary = resolve(dirname(file), `.ce-review-loop-${randomUUID()}.tmp`)
  try {
    writeFileSync(temporary, `${JSON.stringify(value)}\n`, { mode: 0o600, flag: "wx" })
    chmodSync(temporary, 0o600)
    renameSync(temporary, file)
  } catch (error) {
    try { unlinkSync(temporary) } catch {}
    throw error
  }
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
    || state.version !== 2
    || state.repo !== repo
    || typeof state.branch !== "string"
    || typeof state.head_sha !== "string"
    || !uniqueStrings(state.paths)
    || !Array.isArray(state.files)
    || state.files.length !== state.paths.length
    || !privateArtifact(repo, state.verification_json)
    || typeof state.phase !== "string"
    || typeof state.lease_id !== "string"
    || !/^[0-9a-f]{32}$/.test(state.lease_id)
    || typeof state.registry_path !== "string"
    || !privateArtifact(repo, state.registry_path)
    || typeof state.packet_path !== "string"
    || !privateArtifact(repo, state.packet_path)
    || typeof state.base_sha !== "string"
    || typeof state.review_run_id !== "string"
    || !record(state.family)
    || (state.seal !== undefined && (
      !state.seal || typeof state.seal !== "object" || Array.isArray(state.seal)
      || !["passed", "failed"].includes(state.seal.verification_status)
      || !Array.isArray(state.seal.files)
      || state.seal.files.length !== state.paths.length
    ))
  ) return null

  for (const files of [state.files, ...(state.seal ? [state.seal.files] : [])]) {
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index]
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
  }
  return state
}

function ensurePrivateDirectory(directory) {
  if (!existsSync(directory)) mkdirSync(directory, { recursive: true, mode: 0o700 })
  const stat = lstatSync(directory)
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error("unsafe lease directory")
  if (typeof process.getuid === "function" && stat.uid !== process.getuid()) throw new Error("foreign lease directory")
  chmodSync(directory, 0o700)
  if ((lstatSync(directory).mode & 0o777) !== 0o700) throw new Error("insecure lease directory")
}

function leaseRegistryPath(repo) {
  const uid = typeof process.getuid === "function" ? process.getuid() : "user"
  const root = process.env.CE_CODE_REVIEW_LOOP_LEASE_BASE
    || join("/tmp", `compound-engineering-${uid}`, "ce-code-review-loop", "leases")
  ensurePrivateDirectory(root)
  const key = digest(Buffer.from(realpathSync(repo)))
  return resolve(root, `${key}.json`)
}

function registryRecord(file) {
  try {
    const stat = lstatSync(file)
    if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0) return null
  } catch {
    return null
  }
  return readJson(file)
}

function releaseRegistry(state, stateFile) {
  const registry = registryRecord(state.registry_path)
  if (!registry || registry.repo !== state.repo || registry.lease_id !== state.lease_id || registry.state !== resolve(stateFile)) return false
  try {
    unlinkSync(state.registry_path)
    return true
  } catch {
    return false
  }
}

function terminalProtocolViolation(state, stateFile, dirtyPaths) {
  const failed = finishLease(state, stateFile, "blocked", {
    terminal_reason: "protocol_violation",
    dirty_paths: dirtyPaths,
  })
  return failed ?? {
    status: "protocol_violation",
    phase: "blocked",
    lease_id: state.lease_id,
    dirty_paths: dirtyPaths,
    authorized_paths: state.paths,
    mutation_permitted: false,
  }
}

function finishLease(state, stateFile, phase, extra = {}) {
  state.phase = phase
  Object.assign(state, extra)
  try {
    atomicWriteJson(resolve(stateFile), state)
  } catch {
    return malformed("state")
  }
  if (!releaseRegistry(state, stateFile)) return { status: "registry_invalid", phase }
  return null
}

function terminalFailure(state, stateFile, result) {
  const failed = finishLease(state, stateFile, "blocked", {
    terminal_reason: result.status,
    terminal_result: result,
  })
  return failed ?? { ...result, phase: "blocked", lease_id: state.lease_id }
}

function leasedState(repoValue, stateFile, lease, allowedPhases) {
  if (!repoValue || !stateFile || !lease) return { ok: false, result: malformed("arguments") }
  const repo = resolve(repoValue)
  const state = readCycleState(repo, stateFile)
  if (!state || state.version !== 2) return { ok: false, result: malformed("state") }
  if (state.lease_id !== lease) return { ok: false, result: { status: "lease_mismatch" } }
  if (!allowedPhases.includes(state.phase)) return { ok: false, result: { status: "invalid_phase", phase: state.phase } }
  const registry = registryRecord(state.registry_path)
  if (!registry || registry.repo !== repo || registry.lease_id !== lease || registry.state !== resolve(stateFile)) {
    return { ok: false, result: { status: "registry_invalid", phase: state.phase } }
  }
  return { ok: true, repo, state }
}

function validAuthorizationReview(repo, review, base) {
  const entry = preflight(repo, base)
  if (entry.input !== "valid" || !entry.clean) return { ok: false, result: { ...entry, status: "concurrent_change" } }
  const receipt = review?.review_receipt
  if (
    !record(review)
    || review.status !== "complete"
    || !VERDICTS.has(review.verdict)
    || !validCanonicalEnvelope(review)
    || !record(receipt)
    || receipt.terminal_status !== "complete"
    || receipt.branch !== entry.branch
    || receipt.base_sha !== entry.base_sha
    || receipt.head_sha !== entry.head_sha
    || review.scope.base !== entry.base_sha
    || review.scope.branch !== entry.branch
    || review.scope.head_sha !== entry.head_sha
    || !uniqueStrings(receipt.selected_reviewers)
    || !uniqueStrings(receipt.required_reviewers)
    || !uniqueStrings(receipt.completed_reviewers)
    || !Array.isArray(receipt.failed_reviewers)
    || !receipt.failed_reviewers.every(validFailure)
    || !validReviewerMaterialization(review.reviewers, receipt.selected_reviewers)
    || !receipt.selected_reviewers.includes("correctness-reviewer")
    || !Array.isArray(review.findings)
    || !review.findings.every((finding) => validFinding(finding))
    || !Array.isArray(review.actionable_findings)
    || !review.actionable_findings.every((finding) => validFinding(finding, { actionable: true }))
    || !validateFindingProjection(review.findings, review.actionable_findings)
  ) return { ok: false, result: malformed("review_shape") }
  const selected = new Set(receipt.selected_reviewers)
  const required = new Set(receipt.required_reviewers)
  const completed = new Set(receipt.completed_reviewers)
  const failedNames = receipt.failed_reviewers.map((failure) => failure.reviewer)
  const failed = new Set(failedNames)
  if (
    failed.size !== failedNames.length
    || receipt.required_reviewers.some((reviewer) => !selected.has(reviewer))
    || receipt.completed_reviewers.some((reviewer) => !selected.has(reviewer))
    || failedNames.some((reviewer) => !selected.has(reviewer))
    || receipt.failed_reviewers.some((failure) => failure.required !== required.has(failure.reviewer))
    || receipt.selected_reviewers.some((reviewer) => completed.has(reviewer) === failed.has(reviewer))
  ) return { ok: false, result: malformed("reviewer_roster") }
  if (receipt.required_reviewers.some((reviewer) => !completed.has(reviewer))) return { ok: false, result: { status: "coverage_gap" } }
  return { ok: true, entry }
}

function cycleAuthorize(repoValue, stateFile, pathsFile, verificationFile, familyFile, reviewFile, base, packetFile) {
  if (![repoValue, stateFile, pathsFile, verificationFile, familyFile, reviewFile, base, packetFile].every(nonemptyString)) return malformed("arguments")
  const repo = resolve(repoValue)
  const privateFiles = [stateFile, pathsFile, verificationFile, familyFile, reviewFile, packetFile]
  if (!privateFiles.every((file) => privateArtifact(repo, file)) || dirname(resolve(stateFile)) !== dirname(resolve(packetFile))) return malformed("private_artifact")
  const files = intendedPaths(repo, pathsFile)
  if (!files) return malformed("paths")
  const verification = readJson(verificationFile)
  if (!verification || verification.status !== "planned" || !uniqueStrings(verification.checks) || verification.checks.length === 0) return malformed("verification_json")
  const family = readJson(familyFile)
  if (!family || !nonemptyString(family.family_id) || !nonemptyString(family.root_invariant) || family.authority !== "mechanical" || !Array.isArray(family.finding_ids) || family.finding_ids.length === 0) return malformed("family")
  const familyIds = family.finding_ids.map(findingId)
  if (familyIds.some((id) => id === null) || new Set(familyIds).size !== familyIds.length) return malformed("family")
  const review = readJson(reviewFile)
  const validated = validAuthorizationReview(repo, review, base)
  if (!validated.ok) return validated.result
  if (validated.entry.base_sha !== base) return malformed("base")
  const actionableById = new Map(review.actionable_findings.map((finding) => [findingId(finding["#"]), finding]))
  if (familyIds.some((id) => !actionableById.has(id))) return malformed("family_findings")
  const findings = familyIds.map((id) => actionableById.get(id))
  for (const artifact of [stateFile, packetFile]) {
    try {
      lstatSync(artifact)
      return malformed("artifact_exists", { artifact: resolve(artifact) })
    } catch (error) {
      if (error?.code !== "ENOENT") return malformed("artifact")
    }
  }
  let registryPath
  try {
    registryPath = leaseRegistryPath(repo)
  } catch {
    return { status: "registry_invalid" }
  }
  const existing = registryRecord(registryPath)
  if (existing) return { status: "lease_conflict", lease_id: existing.lease_id, state: existing.state }
  try {
    lstatSync(registryPath)
    return { status: "registry_invalid" }
  } catch (error) {
    if (error?.code !== "ENOENT") return { status: "registry_invalid" }
  }
  const leaseId = randomBytes(16).toString("hex")
  const registry = { version: 1, repo, lease_id: leaseId, state: resolve(stateFile) }
  try {
    writeFileSync(registryPath, `${JSON.stringify(registry)}\n`, { mode: 0o600, flag: "wx" })
    chmodSync(registryPath, 0o600)
  } catch {
    return registryRecord(registryPath) ? { status: "lease_conflict" } : { status: "registry_invalid" }
  }
  const state = {
    version: 2,
    phase: "authorized",
    lease_id: leaseId,
    registry_path: registryPath,
    repo,
    branch: validated.entry.branch,
    head_sha: validated.entry.head_sha,
    base_sha: validated.entry.base_sha,
    review_run_id: review.run_id,
    family: { ...family, findings },
    paths: files.map((file) => file.path),
    files,
    verification_json: resolve(verificationFile),
    packet_path: resolve(packetFile),
  }
  const packet = {
    schema_version: 1,
    lease_id: leaseId,
    state_path: resolve(stateFile),
    repo,
    branch: state.branch,
    checkpoint_head: state.head_sha,
    frozen_base: state.base_sha,
    review_run_id: state.review_run_id,
    family: { family_id: family.family_id, root_invariant: family.root_invariant, findings },
    authorized_paths: state.paths,
    verification_plan: verification,
    first_action: "cycle-begin",
    forbidden_actions: ["commit", "stage", "push", "switch_branch", "create_worktree", "review"],
    scope_expansion: { status: "scope_expansion", required_before_edit: true, fields: ["lease_id", "requested_paths", "reason", "evidence"] },
  }
  let stateCreated = false
  let packetCreated = false
  try {
    writeFileSync(stateFile, `${JSON.stringify(state)}\n`, { mode: 0o600, flag: "wx" })
    stateCreated = true
    chmodSync(stateFile, 0o600)
    writeFileSync(packetFile, `${JSON.stringify(packet)}\n`, { mode: 0o600, flag: "wx" })
    packetCreated = true
    chmodSync(packetFile, 0o600)
  } catch {
    if (stateCreated) try { unlinkSync(stateFile) } catch {}
    if (packetCreated) try { unlinkSync(packetFile) } catch {}
    releaseRegistry(state, stateFile)
    return malformed("state")
  }
  return { status: "authorized", lease_id: leaseId, state: resolve(stateFile), packet: resolve(packetFile), branch: state.branch, head_sha: state.head_sha, paths: state.paths }
}

function cycleBegin(repoValue, stateFile, lease) {
  const leased = leasedState(repoValue, stateFile, lease, ["authorized"])
  if (!leased.ok) return leased.result
  const guarded = cycleGuard(leased.repo, leased.state)
  if (!guarded.ok) return terminalProtocolViolation(leased.state, stateFile, guarded.result.changed_paths ?? [])
  if (guarded.changedPaths.length > 0) return terminalProtocolViolation(leased.state, stateFile, guarded.changedPaths)
  leased.state.phase = "dispatched"
  try { atomicWriteJson(resolve(stateFile), leased.state) } catch { return malformed("state") }
  return { status: "dispatched", lease_id: lease, paths: leased.state.paths, family_id: leased.state.family.family_id }
}

function cycleStatus(repoValue, stateFile, lease) {
  const leased = leasedState(repoValue, stateFile, lease, ["authorized", "dispatched", "sealed"])
  if (!leased.ok) return leased.result
  let guarded
  try { guarded = cycleGuard(leased.repo, leased.state) } catch { return terminalProtocolViolation(leased.state, stateFile, []) }
  const dirtyPaths = guarded.ok ? guarded.changedPaths : safeGitPaths(leased.repo)
  if (!guarded.ok || (leased.state.phase === "authorized" && dirtyPaths.length > 0)) {
    return terminalProtocolViolation(leased.state, stateFile, dirtyPaths)
  }
  return { status: "ok", phase: leased.state.phase, lease_id: lease, branch_match: true, head_match: true, dirty_paths: dirtyPaths, authorized_paths: leased.state.paths, mutation_permitted: leased.state.phase === "dispatched" }
}

function cycleCancel(repoValue, stateFile, lease) {
  const leased = leasedState(repoValue, stateFile, lease, ["authorized"])
  if (!leased.ok) return leased.result
  const status = cycleStatus(repoValue, stateFile, lease)
  if (status.status !== "ok" || status.dirty_paths.length > 0) return { ...status, status: "protocol_violation", mutation_permitted: false }
  const failed = finishLease(leased.state, stateFile, "canceled")
  return failed ?? { status: "canceled", lease_id: lease }
}

function cycleScopeExpansion(repoValue, stateFile, lease, resultFile) {
  const leased = leasedState(repoValue, stateFile, lease, ["authorized", "dispatched"])
  if (!leased.ok) return leased.result
  const result = readJson(resultFile)
  if (!result || result.status !== "scope_expansion" || result.lease_id !== lease || !uniqueStrings(result.requested_paths) || !nonemptyString(result.reason) || !uniqueStrings(result.evidence)) {
    return terminalFailure(leased.state, stateFile, malformed("scope_expansion"))
  }
  const status = cycleStatus(repoValue, stateFile, lease)
  if (status.status !== "ok" || status.dirty_paths.length > 0) return { ...status, status: "protocol_violation", mutation_permitted: false }
  const temporaryPaths = resolve(dirname(resultFile), `.scope-paths-${randomUUID()}.json`)
  try {
    writeFileSync(temporaryPaths, JSON.stringify(result.requested_paths), { mode: 0o600, flag: "wx" })
    if (!intendedPaths(leased.repo, temporaryPaths)) return terminalFailure(leased.state, stateFile, malformed("scope_paths"))
  } finally {
    try { unlinkSync(temporaryPaths) } catch {}
  }
  const failed = finishLease(leased.state, stateFile, "scope_expansion", { scope_expansion: result })
  return failed ?? { status: "scope_expansion", lease_id: lease, requested_paths: result.requested_paths }
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

function verificationResult(state) {
  try {
    const verificationStat = lstatSync(state.verification_json)
    if (!verificationStat.isFile() || verificationStat.isSymbolicLink()) return null
  } catch {
    return null
  }
  const verification = readJson(state.verification_json)
  return verification && ["passed", "failed"].includes(verification.status) ? verification : null
}

function cycleSeal(repoValue, stateFile, lease) {
  if (!repoValue || !stateFile) return malformed("arguments")
  const repo = resolve(repoValue)
  const state = readCycleState(repo, stateFile)
  if (!state || state.seal) return malformed("state")
  const leased = leasedState(repoValue, stateFile, lease, ["dispatched"])
  if (!leased.ok) return leased.result
  const guarded = cycleGuard(repo, state)
  if (!guarded.ok) return guarded.result
  const verification = verificationResult(state)
  if (!verification) return malformed("verification_json")
  if (pathSetDifference(state.paths, guarded.changedPaths).length > 0) {
    return malformed("diff_paths", { changed_paths: guarded.changedPaths })
  }

  let files
  try {
    files = captureWorktreeSnapshots(repo, state.paths)
  } catch {
    return malformed("unsafe_path")
  }
  if (!files) return malformed("unsafe_path")
  state.seal = { verification_status: verification.status, files }
  state.phase = "sealed"
  try {
    atomicWriteJson(resolve(stateFile), state)
  } catch {
    return malformed("state")
  }
  return { status: "sealed", verification_status: verification.status, paths: state.paths }
}

function sealedGuard(repo, state, guarded) {
  if (!state.seal) return { ok: false, result: malformed("seal") }
  let current
  try {
    current = captureWorktreeSnapshots(repo, state.paths)
  } catch {
    current = null
  }
  const changedPaths = current ? worktreeSnapshotMismatch(state.seal.files, current) : state.paths
  if (changedPaths.length > 0) {
    return {
      ok: false,
      result: {
        status: "concurrent_change",
        branch: guarded.branch,
        head_sha: guarded.headSha,
        changed_paths: changedPaths,
      },
    }
  }
  return { ok: true }
}


function cycleRestore(repoValue, stateFile, lease) {
  if (!repoValue || !stateFile) return malformed("arguments")
  const repo = resolve(repoValue)
  const state = readCycleState(repo, stateFile)
  if (!state) return malformed("state")
  const leased = leasedState(repoValue, stateFile, lease, ["sealed"])
  if (!leased.ok) return leased.result
  let guarded
  try {
    guarded = cycleGuard(repo, state)
  } catch {
    return terminalFailure(state, stateFile, { status: "restore_failed", restored_paths: [], pending_paths: state.paths, changed_paths: safeGitPaths(repo, state.paths) })
  }
  if (!guarded.ok) return guarded.result
  const sealed = sealedGuard(repo, state, guarded)
  if (!sealed.ok) return sealed.result

  const operations = []
  try {
    for (const file of state.files) {
      const absolute = resolve(repo, file.path)
      const current = regularPath(repo, absolute, { allowMissingLeaf: true })
      if (!current) return { status: "concurrent_change", branch: guarded.branch, head_sha: guarded.headSha, changed_paths: [file.path] }
      const desired = file.exists ? resolve(dirname(absolute), `.ce-review-loop-restore-${randomUUID()}.tmp`) : null
      if (desired) {
        writeFileSync(desired, Buffer.from(file.bytes, "base64"), { mode: file.mode, flag: "wx" })
        chmodSync(desired, file.mode)
      }
      operations.push({ file, absolute, current, desired, displaced: resolve(dirname(absolute), `.ce-review-loop-displaced-${randomUUID()}.tmp`) })
    }
  } catch {
    for (const operation of operations) if (operation.desired) try { unlinkSync(operation.desired) } catch {}
    return terminalFailure(state, stateFile, { status: "restore_failed", restored_paths: [], pending_paths: state.paths, changed_paths: safeGitPaths(repo, state.paths) })
  }

  const restoredPaths = []
  for (let index = 0; index < operations.length; index += 1) {
    const operation = operations[index]
    try {
      const current = captureWorktreeSnapshots(repo, [operation.file.path])
      const sealedFile = state.seal.files[index]
      if (!current || worktreeSnapshotMismatch([sealedFile], current).length > 0) {
        throw Object.assign(new Error("concurrent change"), { code: "CONCURRENT" })
      }
      if (operation.current !== "missing") {
        renameSync(operation.absolute, operation.displaced)
        const displaced = readFileSync(operation.displaced)
        if (!sealedFile.exists || digest(displaced) !== sealedFile.digest || (lstatSync(operation.displaced).mode & 0o777) !== sealedFile.mode) {
          if (!existsSync(operation.absolute)) linkSync(operation.displaced, operation.absolute)
          throw Object.assign(new Error("concurrent displacement"), { code: "CONCURRENT" })
        }
      }
      if (operation.file.exists) {
        linkSync(operation.desired, operation.absolute)
        unlinkSync(operation.desired)
        operation.desired = null
      }
      if (existsSync(operation.displaced)) unlinkSync(operation.displaced)
      restoredPaths.push(operation.file.path)
    } catch (error) {
      for (const remaining of operations.slice(index)) if (remaining.desired) try { unlinkSync(remaining.desired) } catch {}
      const result = error?.code === "CONCURRENT"
        ? { status: "concurrent_change", branch: guarded.branch, head_sha: guarded.headSha, changed_paths: [operation.file.path], preserved_path: existsSync(operation.displaced) ? operation.displaced : null }
        : { status: "restore_failed", restored_paths: restoredPaths, pending_paths: state.paths.filter((path) => !restoredPaths.includes(path)), changed_paths: safeGitPaths(repo, state.paths.filter((path) => !restoredPaths.includes(path))), preserved_path: existsSync(operation.displaced) ? operation.displaced : null }
      return terminalFailure(state, stateFile, result)
    }
  }

  const remaining = safeGitPaths(repo, state.paths)
  if (remaining.length > 0) return terminalFailure(state, stateFile, { status: "restore_failed", restored_paths: restoredPaths, pending_paths: [], changed_paths: remaining })
  const failed = finishLease(state, stateFile, "restored")
  if (failed) return failed
  return { status: "restored", clean: true, paths: state.paths }
}

function cycleCommit(repoValue, stateFile, lease, message) {
  if (!repoValue || !stateFile || typeof message !== "string" || message.length === 0 || message.includes("\0")) {
    return malformed("arguments")
  }
  const repo = resolve(repoValue)
  const state = readCycleState(repo, stateFile)
  if (!state) return malformed("state")
  const leased = leasedState(repoValue, stateFile, lease, ["sealed"])
  if (!leased.ok) return leased.result
  const guarded = cycleGuard(repo, state)
  if (!guarded.ok) return guarded.result
  const verification = verificationResult(state)
  if (!verification) return malformed("verification_json")
  if (state.seal?.verification_status !== verification.status) return malformed("verification_seal")
  const sealed = sealedGuard(repo, state, guarded)
  if (!sealed.ok) return sealed.result
  if (verification.status !== "passed") {
    return { status: "verification_failed", verification_status: verification.status }
  }

  const expectedPaths = [...state.paths].sort()
  if (pathSetDifference(expectedPaths, guarded.changedPaths).length > 0) {
    return malformed("diff_paths", { changed_paths: guarded.changedPaths })
  }
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
  if (!commitSha) return commitIntegrityFailure("missing_commit_sha", null, safeGitPaths(repo), false)
  if (commitCommandFailed && commitSha === state.head_sha) {
    const failedPaths = safeGitPaths(repo)
    const failedPathMismatch = pathSetDifference(expectedPaths, failedPaths)
    if (failedPathMismatch.length > 0) {
      return commitIntegrityFailure("failed_commit_paths_mismatch", null, failedPathMismatch, false)
    }
    let failedSnapshots
    try {
      failedSnapshots = captureSnapshots(repo, state.paths, "index")
    } catch {
      failedSnapshots = null
    }
    if (!failedSnapshots) {
      return commitIntegrityFailure("failed_commit_snapshot_unreadable", null, state.paths, false)
    }
    const failedSnapshotMismatch = snapshotMismatch(verifiedSnapshots, failedSnapshots)
    if (failedSnapshotMismatch.length > 0) {
      return commitIntegrityFailure("failed_commit_snapshot_mismatch", null, failedSnapshotMismatch, false)
    }
    const failedWorktree = captureWorktreeSnapshots(repo, state.paths)
    const failedWorktreeMismatch = failedWorktree
      ? worktreeSnapshotMismatch(state.seal.files, failedWorktree)
      : state.paths
    if (failedWorktreeMismatch.length > 0) {
      return commitIntegrityFailure("failed_commit_snapshot_mismatch", null, failedWorktreeMismatch, false)
    }
    return { status: "commit_failed", paths: state.paths }
  }

  const changedAfterCommit = safeGitPaths(repo)
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

  const failed = finishLease(state, stateFile, "committed", { commit_sha: commitSha })
  if (failed) return failed
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
const REVIEW_SHA_PATTERN = /^(?:[0-9a-fA-F]{40}|[0-9a-fA-F]{64})$/
const INTENT_CONFIDENCES = new Set(["explicit", "inferred", "uncertain"])
const LOCAL_REVIEWER_IDENTITIES = new Map([
  ["correctness", "correctness-reviewer"],
  ["project-standards", "project-standards-reviewer"],
  ["testing", "testing-reviewer"],
  ["maintainability", "maintainability-reviewer"],
  ["agent-native", "agent-native-reviewer"],
  ["learnings", "learnings-researcher"],
  ["security", "security-reviewer"],
  ["performance", "performance-reviewer"],
  ["api-contract", "api-contract-reviewer"],
  ["data-migration", "data-migration-reviewer"],
  ["reliability", "reliability-reviewer"],
  ["adversarial", "adversarial-reviewer"],
  ["previous-comments", "previous-comments-reviewer"],
  ["julik-frontend-races", "julik-frontend-races-reviewer"],
  ["swift-ios", "swift-ios-reviewer"],
])

function record(value) {
  return value && typeof value === "object" && !Array.isArray(value)
}

function nonemptyString(value) {
  return typeof value === "string" && value.trim().length > 0
}

function materializedReviewerIdentity(reviewer) {
  if (LOCAL_REVIEWER_IDENTITIES.has(reviewer)) return LOCAL_REVIEWER_IDENTITIES.get(reviewer)
  if (reviewer.endsWith("-reviewer")) {
    const persona = reviewer.slice(0, -"-reviewer".length)
    if (LOCAL_REVIEWER_IDENTITIES.has(persona)) return LOCAL_REVIEWER_IDENTITIES.get(persona)
  }
  if (/^adversarial-[a-z0-9][a-z0-9-]*$/.test(reviewer)) return reviewer
  return null
}

function validReviewerMaterialization(reviewers, selectedReviewers) {
  if (!uniqueStrings(reviewers) || reviewers.length === 0) return false
  const materialized = reviewers.map(materializedReviewerIdentity)
  return materialized.every(Boolean)
    && new Set(materialized).size === materialized.length
    && materialized.length === selectedReviewers.length
    && materialized.every((reviewer) => selectedReviewers.includes(reviewer))
}

function validRequirementsCompleteness(value) {
  return value === null || (typeof value === "object" && value !== null)
}

function validCanonicalEnvelope(review) {
  if (!record(review.scope)) return false
  if (
    !nonemptyString(review.scope.base)
    || !nonemptyString(review.scope.branch)
    || !REVIEW_SHA_PATTERN.test(review.scope.head_sha)
    || !(review.scope.pr_url === null || nonemptyString(review.scope.pr_url))
    || !Number.isInteger(review.scope.files_changed)
    || review.scope.files_changed < 0
    || !nonemptyString(review.intent)
    || !INTENT_CONFIDENCES.has(review.intent_confidence)
    || !uniqueStrings(review.reviewers)
    || review.reviewers.length === 0
    || !Array.isArray(review.pre_existing_findings)
    || !validRequirementsCompleteness(review.requirements_completeness)
    || !Array.isArray(review.learnings)
    || !Array.isArray(review.agent_native_gaps)
    || !Array.isArray(review.deployment_notes)
    || !Array.isArray(review.residual_risks)
    || !Array.isArray(review.testing_gaps)
    || !record(review.coverage)
    || !nonemptyString(review.artifact_path)
    || !nonemptyString(review.run_id)
  ) return false
  return true
}

function confidenceAllowed(finding, { actionable = false } = {}) {
  if (finding.confidence === 0 || finding.confidence === 25) return false
  if (!actionable) return true
  return finding.confidence === 75
    || finding.confidence === 100
    || (finding.severity === "P0" && finding.confidence === 50)
}

function findingId(value) {
  if (typeof value === "number") return Number.isInteger(value) && value > 0 ? String(value) : null
  return typeof value === "string" && value.trim().length > 0 ? value : null
}

function validLine(value) {
  return (Number.isInteger(value) && value > 0)
    || (typeof value === "string" && value.trim().length > 0)
}

function validFinding(value, { actionable = false } = {}) {
  const suggestedFix = value?.suggested_fix
  const firstEvidence = value?.first_evidence
  return value && typeof value === "object" && !Array.isArray(value)
    && findingId(value["#"]) !== null
    && typeof value.title === "string" && value.title.length > 0
    && SEVERITIES.has(value.severity)
    && typeof value.file === "string" && value.file.length > 0
    && validLine(value.line)
    && CONFIDENCES.has(value.confidence)
    && confidenceAllowed(value, { actionable })
    && AUTOFIX_CLASSES.has(value.autofix_class)
    && OWNERS.has(value.owner)
    && (!actionable || (["gated_auto", "manual"].includes(value.autofix_class) && value.owner === "downstream-resolver"))
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
    || !validCanonicalEnvelope(review)
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
    || !review.findings.every((finding) => validFinding(finding))
    || !Array.isArray(review.actionable_findings)
    || !review.actionable_findings.every((finding) => validFinding(finding, { actionable: true }))
    || !validateFindingProjection(review.findings, review.actionable_findings)
    || !Array.isArray(review.triage_groups)
    || receipt.selected_reviewers.length === 0
    || !receipt.selected_reviewers.includes("correctness-reviewer")
    || !validReviewerMaterialization(review.reviewers, receipt.selected_reviewers)
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
    || review.scope.base !== expected.base_sha
    || review.scope.branch !== expected.branch
    || review.scope.head_sha !== expected.head_sha
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
} else if (command === "cycle-authorize") {
  emit(cycleAuthorize(options.repo, options.state, options["paths-json"], options["verification-json"], options["family-json"], options.review, options.base, options.packet))
} else if (command === "cycle-begin") {
  emit(cycleBegin(options.repo, options.state, options.lease))
} else if (command === "cycle-status") {
  emit(cycleStatus(options.repo, options.state, options.lease))
} else if (command === "cycle-seal") {
  emit(cycleSeal(options.repo, options.state, options.lease))
} else if (command === "cycle-scope-expansion") {
  emit(cycleScopeExpansion(options.repo, options.state, options.lease, options.result))
} else if (command === "cycle-cancel") {
  emit(cycleCancel(options.repo, options.state, options.lease))
} else if (command === "cycle-restore") {
  emit(cycleRestore(options.repo, options.state, options.lease))
} else if (command === "cycle-commit") {
  emit(cycleCommit(options.repo, options.state, options.lease, options.message))
} else {
  emit({ status: "malformed", reason: "command" })
}
