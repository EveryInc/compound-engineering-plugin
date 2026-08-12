#!/usr/bin/env node
import { constants, lstat, open, realpath, rename, rm } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import path from 'node:path'

const SHA_PATTERN = /^(?:[0-9a-fA-F]{40}|[0-9a-fA-F]{64})$/
const TERMINAL_STATUSES = new Set(['complete', 'degraded', 'failed'])
const VERDICTS = new Set(['Ready to merge', 'Ready with fixes', 'Not ready'])
const FINDING_CONFIDENCES = new Set([0, 25, 50, 75, 100])
const ACTIONABLE_AUTOFIX_CLASSES = new Set(['gated_auto', 'manual'])
const LOCAL_REVIEWER_IDENTITIES = new Map([
  ['correctness', 'correctness-reviewer'],
  ['project-standards', 'project-standards-reviewer'],
  ['testing', 'testing-reviewer'],
  ['maintainability', 'maintainability-reviewer'],
  ['agent-native', 'agent-native-reviewer'],
  ['learnings', 'learnings-researcher'],
  ['security', 'security-reviewer'],
  ['performance', 'performance-reviewer'],
  ['api-contract', 'api-contract-reviewer'],
  ['data-migration', 'data-migration-reviewer'],
  ['reliability', 'reliability-reviewer'],
  ['adversarial', 'adversarial-reviewer'],
  ['previous-comments', 'previous-comments-reviewer'],
  ['julik-frontend-races', 'julik-frontend-races-reviewer'],
  ['swift-ios', 'swift-ios-reviewer'],
])

function fail(message) {
  throw new Error(message)
}

function object(value, field) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${field} must be an object`)
  }
  return value
}

function string(value, field, { nonempty = false } = {}) {
  if (typeof value !== 'string') fail(`${field} must be a string`)
  if (nonempty && value.trim() === '') fail(`${field} must be non-empty`)
  return value
}

function boolean(value, field) {
  if (typeof value !== 'boolean') fail(`${field} must be a boolean`)
  return value
}

function array(value, field) {
  if (!Array.isArray(value)) fail(`${field} must be an array`)
  return value
}

function stringArray(value, field) {
  return array(value, field).map((entry, index) =>
    string(entry, `${field}[${index}]`, { nonempty: true }),
  )
}

function unique(values, field) {
  if (new Set(values).size !== values.length) fail(`${field} must not contain duplicates`)
}

function integer(value, field, { minimum } = {}) {
  if (!Number.isInteger(value)) fail(`${field} must be an integer`)
  if (minimum !== undefined && value < minimum) fail(`${field} must be at least ${minimum}`)
  return value
}

function nullableString(value, field) {
  if (value !== null) string(value, field, { nonempty: true })
  return value
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]),
    )
  }
  return value
}

function validateResultShape(root) {
  const verdict = string(requireField(root, 'verdict'), 'verdict', { nonempty: true })
  if (!VERDICTS.has(verdict)) fail('verdict must be Ready to merge, Ready with fixes, or Not ready')

  const scope = object(requireField(root, 'scope'), 'scope')
  string(requireField(scope, 'base', 'scope.'), 'scope.base', { nonempty: true })
  string(requireField(scope, 'branch', 'scope.'), 'scope.branch', { nonempty: true })
  concreteSha(requireField(scope, 'head_sha', 'scope.'), 'scope.head_sha')
  nullableString(requireField(scope, 'pr_url', 'scope.'), 'scope.pr_url')
  integer(requireField(scope, 'files_changed', 'scope.'), 'scope.files_changed', { minimum: 0 })

  string(requireField(root, 'intent'), 'intent', { nonempty: true })
  const intentConfidence = string(requireField(root, 'intent_confidence'), 'intent_confidence')
  if (!new Set(['explicit', 'inferred', 'uncertain']).has(intentConfidence)) {
    fail('intent_confidence must be explicit, inferred, or uncertain')
  }

  const reviewers = stringArray(requireField(root, 'reviewers'), 'reviewers')
  unique(reviewers, 'reviewers')
  if (reviewers.length === 0) fail('reviewers must contain at least one reviewer')
  for (const field of [
    'findings',
    'actionable_findings',
    'triage_groups',
    'pre_existing_findings',
    'learnings',
    'agent_native_gaps',
    'deployment_notes',
    'residual_risks',
    'testing_gaps',
  ]) array(requireField(root, field), field)

  const completeness = requireField(root, 'requirements_completeness')
  if (completeness !== null && typeof completeness !== 'object') {
    fail('requirements_completeness must be null, an array, or an object')
  }
  object(requireField(root, 'coverage'), 'coverage')
  string(requireField(root, 'artifact_path'), 'artifact_path', { nonempty: true })
  string(requireField(root, 'run_id'), 'run_id', { nonempty: true })
}

function validateFindingConfidence(finding, field, { actionable = false } = {}) {
  const value = object(finding, field)
  const confidence = requireField(value, 'confidence', `${field}.`)
  if (!FINDING_CONFIDENCES.has(confidence)) {
    fail(`${field}.confidence must be one of 0, 25, 50, 75, or 100`)
  }
  if (confidence === 0 || confidence === 25) {
    fail(`${field} uses suppressed confidence ${confidence}`)
  }
  if (actionable) {
    const severity = string(requireField(value, 'severity', `${field}.`), `${field}.severity`, { nonempty: true })
    const autofixClass = string(requireField(value, 'autofix_class', `${field}.`), `${field}.autofix_class`, { nonempty: true })
    const owner = string(requireField(value, 'owner', `${field}.`), `${field}.owner`, { nonempty: true })
    if (!ACTIONABLE_AUTOFIX_CLASSES.has(autofixClass) || owner !== 'downstream-resolver') {
      fail(`${field} is not canonically actionable`)
    }
    if (confidence !== 75 && confidence !== 100 && !(severity === 'P0' && confidence === 50)) {
      fail(`${field} must use confidence 75 or 100, except the documented P0 plus 50 exception`)
    }
  }
}

function materializedReviewerIdentity(reviewer) {
  if (LOCAL_REVIEWER_IDENTITIES.has(reviewer)) return LOCAL_REVIEWER_IDENTITIES.get(reviewer)
  if (LOCAL_REVIEWER_IDENTITIES.has(reviewer.replace(/-reviewer$/, ''))) {
    return LOCAL_REVIEWER_IDENTITIES.get(reviewer.replace(/-reviewer$/, ''))
  }
  if (/^adversarial-[a-z0-9][a-z0-9-]*$/.test(reviewer)) return reviewer
  return null
}

function validateReviewerMaterialization(reviewers, selected) {
  const materialized = reviewers.map((reviewer, index) => {
    const identity = materializedReviewerIdentity(reviewer)
    if (!identity) fail(`reviewers[${index}] has no explicit canonical identity mapping`)
    return identity
  })
  unique(materialized, 'materialized reviewer identities')
  if (materialized.length !== selected.length || materialized.some((reviewer) => !selected.includes(reviewer))) {
    fail('top-level reviewers must materialize exactly to review_receipt.selected_reviewers')
  }
}
function concreteSha(value, field) {
  string(value, field)
  if (!SHA_PATTERN.test(value)) fail(`${field} must be a concrete 40- or 64-character hexadecimal SHA`)
}

function requireField(record, field, prefix = '') {
  if (!Object.hasOwn(record, field)) fail(`${prefix}${field} is required`)
  return record[field]
}

function validateFailure(value, index) {
  const field = `review_receipt.failed_reviewers[${index}]`
  const failure = object(value, field)
  string(requireField(failure, 'reviewer', `${field}.`), `${field}.reviewer`, { nonempty: true })
  string(requireField(failure, 'reason', `${field}.`), `${field}.reason`, { nonempty: true })
  boolean(requireField(failure, 'required', `${field}.`), `${field}.required`)
  return failure
}

function validateReceipt(payload) {
  const root = object(payload, 'input')
  const status = string(requireField(root, 'status'), 'status')
  if (!TERMINAL_STATUSES.has(status)) {
    fail('status must be complete, degraded, or failed after reviewer dispatch')
  }
  validateResultShape(root)

  const scope = object(requireField(root, 'scope'), 'scope')
  const scopeBranch = string(requireField(scope, 'branch', 'scope.'), 'scope.branch', { nonempty: true })
  const scopeHead = requireField(scope, 'head_sha', 'scope.')
  concreteSha(scopeHead, 'scope.head_sha')

  const receipt = object(requireField(root, 'review_receipt'), 'review_receipt')
  const baseSha = requireField(receipt, 'base_sha', 'review_receipt.')
  const headSha = requireField(receipt, 'head_sha', 'review_receipt.')
  concreteSha(baseSha, 'review_receipt.base_sha')
  concreteSha(headSha, 'review_receipt.head_sha')
  const branch = string(
    requireField(receipt, 'branch', 'review_receipt.'),
    'review_receipt.branch',
    { nonempty: true },
  )

  const selected = stringArray(
    requireField(receipt, 'selected_reviewers', 'review_receipt.'),
    'review_receipt.selected_reviewers',
  )
  const required = stringArray(
    requireField(receipt, 'required_reviewers', 'review_receipt.'),
    'review_receipt.required_reviewers',
  )
  const completed = stringArray(
    requireField(receipt, 'completed_reviewers', 'review_receipt.'),
    'review_receipt.completed_reviewers',
  )
  const failures = array(
    requireField(receipt, 'failed_reviewers', 'review_receipt.'),
    'review_receipt.failed_reviewers',
  ).map(validateFailure)
  const terminalStatus = string(
    requireField(receipt, 'terminal_status', 'review_receipt.'),
    'review_receipt.terminal_status',
  )

  unique(selected, 'review_receipt.selected_reviewers')
  unique(required, 'review_receipt.required_reviewers')
  unique(completed, 'review_receipt.completed_reviewers')
  unique(failures.map((failure) => failure.reviewer), 'review_receipt.failed_reviewers reviewer identities')
  if (selected.length === 0) fail('review_receipt.selected_reviewers must contain at least one reviewer')
  if (!selected.includes('correctness-reviewer')) {
    fail('review_receipt.selected_reviewers must include correctness-reviewer')
  }
  validateReviewerMaterialization(root.reviewers, selected)

  root.findings.forEach((finding, index) => validateFindingConfidence(finding, `findings[${index}]`))
  root.actionable_findings.forEach((finding, index) =>
    validateFindingConfidence(finding, `actionable_findings[${index}]`, { actionable: true }),
  )

  if (!TERMINAL_STATUSES.has(terminalStatus)) {
    fail('review_receipt.terminal_status must be complete, degraded, or failed')
  }
  if (status !== terminalStatus) {
    fail('top-level status must agree with review_receipt.terminal_status')
  }
  if (scopeHead !== headSha) fail('scope.head_sha must agree with review_receipt.head_sha')
  if (scopeBranch !== branch) fail('scope.branch must agree with review_receipt.branch')

  const selectedSet = new Set(selected)
  const requiredSet = new Set(required)
  const completedSet = new Set(completed)
  const failureByReviewer = new Map(failures.map((failure) => [failure.reviewer, failure]))

  for (const reviewer of required) {
    if (!selectedSet.has(reviewer)) fail(`required reviewer ${reviewer} is not selected`)
  }
  for (const reviewer of completed) {
    if (!selectedSet.has(reviewer)) fail(`completed reviewer ${reviewer} is not selected`)
    if (failureByReviewer.has(reviewer)) fail(`reviewer ${reviewer} cannot be both completed and failed`)
  }
  for (const failure of failures) {
    if (!selectedSet.has(failure.reviewer)) fail(`failed reviewer ${failure.reviewer} is not selected`)
    if (failure.required !== requiredSet.has(failure.reviewer)) {
      fail(`failed reviewer ${failure.reviewer} required flag disagrees with required_reviewers`)
    }
  }

  for (const reviewer of selected) {
    if (!completedSet.has(reviewer) && !failureByReviewer.has(reviewer)) {
      const classification = requiredSet.has(reviewer) ? 'required reviewer' : 'selected reviewer'
      fail(`${classification} ${reviewer} has no terminal outcome`)
    }
  }

  const failedRequired = failures.filter((failure) => failure.required)

  if (terminalStatus === 'complete' && failedRequired.length > 0) {
    fail(`complete receipt contains failed required reviewer: ${failedRequired.map((failure) => failure.reviewer).join(', ')}`)
  }
  if (completed.length === 0 && terminalStatus !== 'failed') {
    fail('receipt with no usable completed reviewer return must use failed status')
  }
  if (completed.length > 0 && terminalStatus === 'failed') {
    fail('failed status requires no usable completed reviewer returns; use degraded when required coverage is missing')
  }
  if (terminalStatus === 'degraded' && failedRequired.length === 0) {
    fail('degraded receipt requires a failed required reviewer')
  }

  return root
}

function parseArgs(args) {
  if (args.length === 0) return { inputPath: null, outputPath: null }

  let inputPath = null
  let outputPath = null
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index]
    const value = args[index + 1]
    if ((flag !== '--input' && flag !== '--output') || value === undefined || value === '') {
      fail('usage: review-receipt.mjs --input <path> --output <path>')
    }
    if (flag === '--input') {
      if (inputPath !== null) fail('--input must be specified exactly once')
      inputPath = value
    } else {
      if (outputPath !== null) fail('--output must be specified exactly once')
      outputPath = value
    }
  }
  if (inputPath === null || outputPath === null) {
    fail('--input and --output must be provided together')
  }
  return { inputPath, outputPath }
}

async function readStdin() {
  const chunks = []
  for await (const chunk of process.stdin) chunks.push(chunk)
  return Buffer.concat(chunks).toString('utf8')
}

async function readSafeInput(inputPath) {
  const inputStats = await lstat(inputPath).catch((error) => {
    fail(`input path is not accessible: ${error.message}`)
  })
  if (inputStats.isSymbolicLink()) fail('input path must not be a symlink')
  if (!inputStats.isFile()) fail('input path must be a regular file')

  const inputHandle = await open(inputPath, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
  try {
    const openedStats = await inputHandle.stat()
    if (!openedStats.isFile()) fail('input path must be a regular file')
    if (openedStats.dev !== inputStats.dev || openedStats.ino !== inputStats.ino) {
      fail('input path changed while it was being opened')
    }
    return await inputHandle.readFile('utf8')
  } finally {
    await inputHandle.close()
  }
}

async function validateOutputPath(outputPath) {
  const outputDirectory = path.dirname(outputPath)
  const directoryStats = await lstat(outputDirectory).catch((error) => {
    fail(`output directory is not accessible: ${error.message}`)
  })
  if (directoryStats.isSymbolicLink()) fail('output directory must not be a symlink')
  if (!directoryStats.isDirectory()) fail('output directory must be a directory')

  const outputStats = await lstat(outputPath).catch((error) => {
    if (error.code === 'ENOENT') return null
    fail(`output path is not accessible: ${error.message}`)
  })
  if (outputStats?.isSymbolicLink()) fail('output path must not be a symlink')
  if (outputStats !== null && !outputStats.isFile()) fail('output path must be a regular file')

  return realpath(outputDirectory)
}

async function writeAtomic(outputPath, bytes) {
  const outputDirectory = await validateOutputPath(outputPath)
  const tempPath = path.join(outputDirectory, `.${path.basename(outputPath)}.${randomUUID()}.tmp`)
  let tempHandle
  try {
    tempHandle = await open(tempPath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600)
    await tempHandle.writeFile(bytes)
    await tempHandle.sync()
    await tempHandle.close()
    tempHandle = null
    await rename(tempPath, outputPath)
  } finally {
    if (tempHandle !== null && tempHandle !== undefined) await tempHandle.close().catch(() => {})
    await rm(tempPath, { force: true }).catch(() => {})
  }
}

async function main() {
  const { inputPath, outputPath } = parseArgs(process.argv.slice(2))
  const source = inputPath === null ? 'stdin' : 'input file'
  const input = inputPath === null ? await readStdin() : await readSafeInput(inputPath)
  if (input.trim() === '') fail(`${source} must contain one JSON object`)

  let payload
  try {
    payload = JSON.parse(input)
  } catch (error) {
    fail(`${source} is not valid JSON: ${error.message}`)
  }

  const validated = validateReceipt(payload)
  const bytes = Buffer.from(`${JSON.stringify(canonicalize(validated))}\n`)
  if (outputPath !== null) await writeAtomic(outputPath, bytes)
  process.stdout.write(bytes)
}

main().catch((error) => {
  process.stderr.write(`review receipt error: ${error.message}\n`)
  process.exitCode = 1
})
