#!/usr/bin/env node

const SHA_PATTERN = /^(?:[0-9a-fA-F]{40}|[0-9a-fA-F]{64})$/
const TERMINAL_STATUSES = new Set(['complete', 'degraded', 'failed'])

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
  string(requireField(root, 'verdict'), 'verdict', { nonempty: true })

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

  stringArray(requireField(root, 'reviewers'), 'reviewers')
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

async function main() {
  const chunks = []
  for await (const chunk of process.stdin) chunks.push(chunk)
  const input = Buffer.concat(chunks).toString('utf8')
  if (input.trim() === '') fail('stdin must contain one JSON object')

  let payload
  try {
    payload = JSON.parse(input)
  } catch (error) {
    fail(`stdin is not valid JSON: ${error.message}`)
  }

  const validated = validateReceipt(payload)
  process.stdout.write(`${JSON.stringify(canonicalize(validated))}\n`)
}

main().catch((error) => {
  process.stderr.write(`review receipt error: ${error.message}\n`)
  process.exitCode = 1
})
