#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { constants, lstatSync, openSync, closeSync, renameSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import path from 'node:path'

function fail(message) {
  throw new Error(message)
}

function object(value, field) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail(`${field} must be an object`)
  return value
}

function nonempty(value, field) {
  if (typeof value !== 'string' || value.trim() === '') fail(`${field} must be a non-empty string`)
  return value.trim()
}

function integer(value, field, { min = 0 } = {}) {
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < min) fail(`${field} must be an integer >= ${min}`)
  return parsed
}

function strings(value, field, { min = 0, max = Infinity } = {}) {
  if (!Array.isArray(value) || value.length < min || value.length > max) fail(`${field} must contain ${min}-${max} entries`)
  const result = value.map((entry, index) => nonempty(entry, `${field}[${index}]`))
  if (new Set(result).size !== result.length) fail(`${field} must not contain duplicates`)
  return result
}

function safePath(value, field) {
  const candidate = nonempty(value, field)
  if (path.isAbsolute(candidate) || candidate.includes('\0') || /[\r\n\t]/.test(candidate)) fail(`${field} must be a single repo-relative path`)
  if (candidate.startsWith(':') || /[*?\[]/.test(candidate)) fail(`${field} must be a literal path without Git pathspec magic or globs`)
  const normalized = path.posix.normalize(candidate.replaceAll('\\', '/'))
  if (normalized === '.' || normalized === '..' || normalized.startsWith('../')) fail(`${field} escapes the repository`)
  return normalized.replace(/\/$/, '')
}

function division(value, index) {
  const record = object(value, `divisions[${index}]`)
  const id = nonempty(record.id, `divisions[${index}].id`)
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(id)) fail(`divisions[${index}].id is unsafe`)
  const question = nonempty(record.question, `divisions[${index}].question`)
  const focus = record.focus === undefined ? null : nonempty(record.focus, `divisions[${index}].focus`)
  const paths = strings(record.paths, `divisions[${index}].paths`, { min: 1, max: 3 })
    .map((entry, pathIndex) => safePath(entry, `divisions[${index}].paths[${pathIndex}]`))
  const exclusions = record.exclusions === undefined
    ? []
    : strings(record.exclusions, `divisions[${index}].exclusions`, { max: 8 })
      .map((entry, pathIndex) => safePath(entry, `divisions[${index}].exclusions[${pathIndex}]`))
  const dependencyRule = record.dependency_rule === undefined ? null : nonempty(record.dependency_rule, `divisions[${index}].dependency_rule`)
  if (exclusions.length === 0 && dependencyRule === null) fail(`divisions[${index}] needs exclusions or dependency_rule`)
  return { id, question, focus, paths, exclusions, dependency_rule: dependencyRule }
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical)
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]))
  }
  return value
}

function digest(value) {
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex')
}

function readJson(file) {
  const stats = lstatSync(file)
  if (!stats.isFile() || stats.isSymbolicLink()) fail(`${file} must be a regular non-symlink file`)
  return JSON.parse(readFileSync(file, 'utf8'))
}

function isStrictSubset(child, parent) {
  const parentSet = new Set(parent)
  return child.length < parent.length && child.every((entry) => parentSet.has(entry))
}

function isSuperset(child, parent) {
  const childSet = new Set(child)
  return parent.every((entry) => childSet.has(entry))
}

function scopeBase(scope) {
  return {
    coverage_mode: scope.coverage_mode,
    intent: scope.intent,
    divisions: scope.divisions,
    interactions: scope.interactions,
  }
}

function validateScope(scope) {
  object(scope, 'scope')
  if (scope.version !== 1 || !['initial', 'retry'].includes(scope.kind)) fail('scope header is malformed')
  if (!['normal', 'oversized'].includes(scope.coverage_mode)) fail('scope coverage_mode is malformed')
  const maxDivisions = scope.coverage_mode === 'oversized' ? 2 : 8
  if (!Array.isArray(scope.divisions) || scope.divisions.length < 1 || scope.divisions.length > maxDivisions) {
    fail(`${scope.coverage_mode} scope must contain 1-${maxDivisions} divisions`)
  }
  if (!Array.isArray(scope.interactions) || scope.interactions.length > 1) fail('scope interactions are malformed')
  const expected = digest(scopeBase(scope))
  if (scope.scope_digest !== expected) fail('scope digest does not match scope content')
  if (scope.kind === 'retry' && !/^[0-9a-f]{64}$/.test(scope.parent_scope_digest ?? '')) fail('retry parent scope digest is malformed')
  return scope
}

function prepare(input, parent) {
  const root = object(input, 'input')
  const coverageMode = nonempty(root.coverage_mode, 'coverage_mode')
  if (!['normal', 'oversized'].includes(coverageMode)) fail('coverage_mode must be normal or oversized')
  const intent = nonempty(root.intent, 'intent')
  const maxDivisions = coverageMode === 'oversized' ? 2 : 8
  if (!Array.isArray(root.divisions) || root.divisions.length < 1 || root.divisions.length > maxDivisions) {
    fail(`${coverageMode} divisions must contain 1-${maxDivisions} entries`)
  }
  const normalized = root.divisions.map(division)
  if (new Set(normalized.map((entry) => entry.id)).size !== normalized.length) fail('division ids must be unique')
  const interactions = root.interactions === undefined ? [] : strings(root.interactions, 'interactions', { max: 1 })
  const base = { coverage_mode: coverageMode, intent, divisions: normalized, interactions }

  if (parent === null) {
    if (normalized.some((entry) => entry.focus !== null)) fail('initial scope cannot contain retry focus')
    return { version: 1, kind: 'initial', ...base, scope_digest: digest(base) }
  }

  validateScope(parent)
  if (parent.kind !== 'initial') fail('parent scope must be initial')
  if (coverageMode !== parent.coverage_mode) fail('retry coverage_mode must match parent coverage_mode')
  if (intent !== parent.intent) fail('retry intent must match parent intent')
  if (normalized.length !== 1) fail('retry must contain exactly one division')
  if (interactions.length !== 0) fail('retry cannot add cross-division interactions')
  const original = parent.divisions.find((entry) => entry.id === normalized[0].id)
  if (!original) fail('retry division must come from the parent scope')
  const retry = normalized[0]
  if (retry.question !== original.question) fail('retry question must match the parent question')
  if (retry.focus === null || retry.focus === original.focus) fail('retry must add a distinct bounded focus')
  if (original.paths.length > 1) {
    if (!isStrictSubset(retry.paths, original.paths)) fail('retry paths must be a strict subset of parent paths')
  } else if (retry.paths.length !== 1 || retry.paths[0] !== original.paths[0]) {
    fail('single-path retry must retain the parent path')
  }
  if (!isSuperset(retry.exclusions, original.exclusions)) fail('retry exclusions cannot be removed')
  if (retry.dependency_rule !== original.dependency_rule) fail('retry dependency_rule must match the parent')
  const scopeDigest = digest(base)
  return {
    version: 1,
    kind: 'retry',
    ...base,
    parent_scope_digest: parent.scope_digest,
    scope_digest: scopeDigest,
  }
}

function brief(scope) {
  const coverage = scope.coverage_mode === 'oversized'
    ? [
        'Coverage: Risk-sampled corroboration. Review only the selected divisions and their authorized paths.',
        'Canonical in-process reviewers retain whole-change-set coverage.',
      ]
    : [
        'Coverage: Bounded cross-model corroboration. Review every selected division and its authorized paths.',
        'Canonical in-process reviewers retain whole-change-set coverage outside this peer scope.',
      ]
  const lines = [
    `Intent: ${scope.intent}`,
    '',
    ...coverage,
    '',
  ]
  for (const item of scope.divisions) {
    lines.push(`## Division: ${item.id}`)
    lines.push(`Failure question: ${item.question}`)
    if (item.focus !== null) lines.push(`Narrowed focus: ${item.focus}`)
    lines.push('Authorized paths:')
    for (const entry of item.paths) lines.push(`- ${entry}`)
    if (item.exclusions.length > 0) {
      lines.push('Exclusions:')
      for (const entry of item.exclusions) lines.push(`- ${entry}`)
    }
    if (item.dependency_rule !== null) lines.push(`Bounded dependency expansion: ${item.dependency_rule}`)
    lines.push('')
  }
  if (scope.interactions.length > 0) lines.push(`Cross-division interaction: ${scope.interactions[0]}`, '')
  lines.push(`Scope digest: ${scope.scope_digest}`)
  if (scope.parent_scope_digest) lines.push(`Parent scope digest: ${scope.parent_scope_digest}`)
  return `${lines.join('\n')}\n`
}

function atomicWrite(file, contents) {
  const directory = path.dirname(file)
  const stats = lstatSync(directory)
  if (!stats.isDirectory() || stats.isSymbolicLink()) fail(`unsafe output directory: ${directory}`)
  const temp = path.join(directory, `.${path.basename(file)}.${process.pid}.${Date.now()}.tmp`)
  let fd
  try {
    fd = openSync(temp, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600)
    writeFileSync(fd, contents)
    closeSync(fd)
    fd = undefined
    renameSync(temp, file)
  } finally {
    if (fd !== undefined) closeSync(fd)
    rmSync(temp, { force: true })
  }
}

function args(values) {
  const result = {}
  for (let index = 0; index < values.length; index += 2) {
    const key = values[index]
    const value = values[index + 1]
    if (!key?.startsWith('--') || value === undefined) fail('arguments must be --key value pairs')
    result[key.slice(2)] = value
  }
  return result
}

function requireOptions(options, names) {
  for (const name of names) if (!options[name]) fail(`${name} is required`)
}

function validateArtifacts(options) {
  requireOptions(options, ['scope', 'brief'])
  const scope = validateScope(readJson(options.scope))
  const actualBrief = readFileSync(options.brief, 'utf8')
  if (actualBrief !== brief(scope)) fail('review brief does not match validated scope')
  if (options['coverage-mode'] && scope.coverage_mode !== options['coverage-mode']) fail('scope coverage mode does not match review mode')
  return scope
}
function writePaths(options) {
  requireOptions(options, ['scope', 'out'])
  const scope = validateScope(readJson(options.scope))
  const paths = [...new Set(scope.divisions.flatMap((item) => item.paths))].sort()
  const exclusions = [...new Set(scope.divisions.flatMap((item) => item.exclusions))].sort()
  if (paths.length === 0) fail('scope has no authorized paths')
  const records = [
    ...paths.map((entry) => `include\t${entry}`),
    ...exclusions.map((entry) => `exclude\t${entry}`),
  ]
  atomicWrite(options.out, `${records.join('\n')}\n`)
}


function writeProgress(options) {
  requireOptions(options, ['scope', 'out', 'terminal-reason', 'elapsed-secs', 'last-activity-age-secs', 'provider', 'route', 'requested-model', 'effort', 'base-ref', 'hard-cap-secs', 'attempt-label'])
  const scope = validateScope(readJson(options.scope))
  if (!['initial', 'retry'].includes(options['attempt-label'])) fail('attempt-label must be initial or retry')
  const payload = {
    version: 1,
    terminal_reason: options['terminal-reason'].slice(0, 64),
    elapsed_secs: integer(options['elapsed-secs'], 'elapsed-secs'),
    last_peer_activity_age_secs: integer(options['last-activity-age-secs'], 'last-activity-age-secs', { min: -1 }),
    provider: options.provider.slice(0, 32),
    route: options.route.slice(0, 32),
    requested_model: options['requested-model'].slice(0, 128),
    effort: options.effort.slice(0, 64),
    base_ref: options['base-ref'].slice(0, 256),
    hard_cap_secs: integer(options['hard-cap-secs'], 'hard-cap-secs', { min: 1 }),
    attempt_label: options['attempt-label'],
    retry_count: options['attempt-label'] === 'initial' ? 0 : 1,
    scope_digest: scope.scope_digest,
    parent_scope_digest: scope.parent_scope_digest ?? null,
    divisions: scope.divisions.slice(0, 2).map((item) => item.id.slice(0, 64)),
    usable_review_output: false,
  }
  atomicWrite(options.out, `${JSON.stringify(canonical(payload))}\n`)
}

function validateRetry(options) {
  requireOptions(options, ['progress', 'scope', 'brief', 'provider', 'route', 'requested-model', 'effort', 'base-ref', 'hard-cap-secs'])
  const progress = readJson(options.progress)
  const scope = validateArtifacts(options)
  const expected = {
    provider: options.provider,
    route: options.route,
    requested_model: options['requested-model'],
    effort: options.effort,
    base_ref: options['base-ref'],
    hard_cap_secs: integer(options['hard-cap-secs'], 'hard-cap-secs', { min: 1 }),
  }
  if (progress.terminal_reason !== 'productive_scope_timeout' || progress.retry_count !== 0) fail('retry requires an initial productive scope timeout')
  for (const [key, value] of Object.entries(expected)) if (progress[key] !== value) fail(`retry ${key} differs from initial attempt`)
  if (scope.kind !== 'retry' || scope.parent_scope_digest !== progress.scope_digest) fail('retry scope lineage is invalid')
}

function main() {
  const [command, ...rest] = process.argv.slice(2)
  const options = args(rest)
  if (command === 'prepare') {
    requireOptions(options, ['input', 'scope-out', 'brief-out'])
    const parent = options.parent ? readJson(options.parent) : null
    const scope = prepare(readJson(options.input), parent)
    atomicWrite(options['scope-out'], `${JSON.stringify(canonical(scope))}\n`)
    atomicWrite(options['brief-out'], brief(scope))
    process.stdout.write(`${JSON.stringify({ status: 'prepared', kind: scope.kind, scope_digest: scope.scope_digest, divisions: scope.divisions.map((item) => item.id) })}\n`)
    return
  }
  if (command === 'validate-artifacts') {
    const scope = validateArtifacts(options)
    process.stdout.write(`${JSON.stringify({ status: 'valid', scope_digest: scope.scope_digest })}\n`)
    return
  }
  if (command === 'write-paths') {
    writePaths(options)
    process.stdout.write('{"status":"written"}\n')
    return
  }
  if (command === 'write-progress') {
    writeProgress(options)
    return
  }
  if (command === 'validate-retry') {
    validateRetry(options)
    process.stdout.write('{"status":"valid"}\n')
    return
  }
  fail('supported commands: prepare, validate-artifacts, write-paths, write-progress, validate-retry')
}

try {
  main()
} catch (error) {
  process.stderr.write(`cross-model scope error: ${error.message}\n`)
  process.exitCode = 1
}
