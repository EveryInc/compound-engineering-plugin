import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const PACKET_SCHEMA = 'ce-orca.lfg-packet/v1'
export const RESULT_SCHEMA = 'ce-orca.lfg-result/v1'
export const CHILD_PATCHES_SCHEMA = 'ce-orca.lfg-child-patches/v1'
const RESOLVED_EXECUTION_SCHEMA = 'ce-orca.resolved-execution/v1'
const EXECUTION_REQUEST_SCHEMA = 'ce-orca.execution-request/v1'
const BASE_ORDER = ['plan', 'work', 'simplify', 'review', 'fixes']
const OPTIONAL_STAGE = 'browser-test'
const REQUIRED_SHIPPING_GATES = new Set(['plan', 'work', 'review'])
const STATUS = new Set(['complete', 'failed', 'blocked', 'skipped'])
const RUNTIME = new Set(['native', 'orca'])
const TARGET_FIELDS = ['backend', 'model', 'reasoning', 'effort', 'budget', 'concurrency', 'isolation']
const ROOT_FIELDS = new Set(['schema', 'workflowId', 'hasRemote', 'browserRequired', 'stages'])
const COMMON_STAGE_FIELDS = ['id', 'status', 'runtime', 'owner', 'artifactRef']
const STAGE_FIELDS = {
  plan: new Set(COMMON_STAGE_FIELDS),
  work: new Set([...COMMON_STAGE_FIELDS, 'returnToCaller', 'standaloneShippingSkipped']),
  simplify: new Set(COMMON_STAGE_FIELDS),
  review: new Set([...COMMON_STAGE_FIELDS, 'mode']),
  fixes: new Set(COMMON_STAGE_FIELDS),
  [OPTIONAL_STAGE]: new Set(COMMON_STAGE_FIELDS),
}
const CHILDREN = {
  implementation: { workflowId: 'ce-work', sourceStage: 'implementation', targetStage: 'implementation' },
  planning: { workflowId: 'ce-plan', sourceStage: 'planning' },
  review: { workflowId: 'ce-code-review', sourceStage: 'review' },
  simplification: { workflowId: 'ce-simplify-code', sourceStage: 'simplification' },
}

const safeRef = (value) => {
  if (typeof value !== 'string' || !value || value.includes('\0') || path.isAbsolute(value)) return false
  const normalized = path.posix.normalize(value.replaceAll('\\', '/'))
  return normalized !== '.' && normalized !== '..' && !normalized.startsWith('../')
}

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const target = (value, label) => {
  if (value === undefined) return {}
  if (!isObject(value)) throw new Error(`${label} must be an object`)
  const unknown = Object.keys(value).filter((field) => !TARGET_FIELDS.includes(field))
  if (unknown.length) {
    throw new Error(`${label} contains unsupported target fields: ${unknown.sort().join(', ')}`)
  }
  return Object.fromEntries(TARGET_FIELDS.filter((field) => Object.hasOwn(value, field)).map((field) => [field, value[field]]))
}

export function deriveLfgChildExecutionPatches(resolved) {
  if (!isObject(resolved) || resolved.schema !== RESOLVED_EXECUTION_SCHEMA || resolved.workflowId !== 'lfg') {
    throw new Error(`resolved execution must use ${RESOLVED_EXECUTION_SCHEMA} for workflow lfg`)
  }
  if (resolved.runtime?.selected !== 'orca') {
    throw new Error('child execution patches require a selected Orca runtime')
  }
  const executionConfig = resolved.executionConfig
  if (!isObject(executionConfig) || executionConfig.workflowId !== 'lfg') {
    throw new Error('resolved executionConfig must belong to workflow lfg')
  }
  const override = resolved.runScopedOverride
  if (!isObject(override) || override.schema !== EXECUTION_REQUEST_SCHEMA || override.workflowId !== 'lfg') {
    throw new Error(`resolved runScopedOverride must use ${EXECUTION_REQUEST_SCHEMA} for workflow lfg`)
  }

  const defaults = target(override.defaults, 'runScopedOverride.defaults')
  const patches = {}
  for (const [childId, mapping] of Object.entries(CHILDREN)) {
    const stageOverride = target(override.stages?.[mapping.sourceStage], `runScopedOverride.stages.${mapping.sourceStage}`)
    const patch = {
      schema: EXECUTION_REQUEST_SCHEMA,
      workflowId: mapping.workflowId,
      runtime: 'orca',
      ...(resolved.confirmationRequired === true ? { confirmation: true } : {}),
    }
    if (mapping.targetStage) {
      if (Object.keys(defaults).length) patch.defaults = defaults
      if (Object.keys(stageOverride).length) patch.stages = { [mapping.targetStage]: stageOverride }
    } else {
      const childDefaults = { ...defaults, ...stageOverride }
      if (Object.keys(childDefaults).length) patch.defaults = childDefaults
    }
    patches[childId] = patch
  }
  return patches
}

export async function writeLfgChildExecutionPatches({ resolved, outDir }) {
  if (typeof outDir !== 'string' || !outDir) throw new Error('outDir is required')
  const patches = deriveLfgChildExecutionPatches(resolved)
  const absolute = path.resolve(outDir)
  try {
    await fs.mkdir(absolute, { mode: 0o700 })
  } catch (error) {
    if (error?.code === 'EEXIST') throw new Error(`child override directory already exists: ${absolute}`)
    throw error
  }
  await fs.chmod(absolute, 0o700)
  const children = {}
  try {
    for (const childId of Object.keys(patches).sort()) {
      const patchPath = path.join(absolute, `${childId}.json`)
      await fs.writeFile(patchPath, `${JSON.stringify(patches[childId], null, 2)}\n`, { flag: 'wx', mode: 0o600 })
      await fs.chmod(patchPath, 0o600)
      children[childId] = { workflowId: patches[childId].workflowId, patchPath }
    }
  } catch (error) {
    await fs.rm(absolute, { recursive: true, force: true })
    throw error
  }
  return { schema: CHILD_PATCHES_SCHEMA, sourceWorkflowId: 'lfg', children }
}

export function validateLfgPacket(packet) {
  const errors = []
  if (!packet || typeof packet !== 'object' || Array.isArray(packet)) return ['packet must be an object']
  const unknownRoot = Object.keys(packet).filter((field) => !ROOT_FIELDS.has(field)).sort()
  if (unknownRoot.length) errors.push(`packet contains unsupported fields: ${unknownRoot.join(', ')}`)
  if (packet.schema !== PACKET_SCHEMA) errors.push(`schema must be ${PACKET_SCHEMA}`)
  if (packet.workflowId !== 'lfg') errors.push('workflowId must be lfg')
  if (typeof packet.hasRemote !== 'boolean') errors.push('hasRemote must be boolean')
  if (Object.hasOwn(packet, 'browserRequired') && typeof packet.browserRequired !== 'boolean') {
    errors.push('browserRequired must be boolean when present')
  }
  if (!Array.isArray(packet.stages)) return [...errors, 'stages must be an array']

  const expected = [...BASE_ORDER, ...(packet.browserRequired ? [OPTIONAL_STAGE] : [])]
  const artifactRefs = new Set()
  if (packet.stages.length !== expected.length) errors.push(`stages must be exactly: ${expected.join(', ')}`)
  packet.stages.forEach((stage, index) => {
    const at = `stages[${index}]`
    if (!stage || typeof stage !== 'object' || Array.isArray(stage)) {
      errors.push(`${at} must be an object`)
      return
    }
    const allowed = STAGE_FIELDS[expected[index]] || new Set(COMMON_STAGE_FIELDS)
    const unknown = Object.keys(stage).filter((field) => !allowed.has(field)).sort()
    if (unknown.length) errors.push(`${at} contains unsupported fields: ${unknown.join(', ')}`)
    if (stage.id !== expected[index]) errors.push(`${at}.id must be ${expected[index] || '<none>'}`)
    if (!STATUS.has(stage.status)) errors.push(`${at}.status is invalid`)
    if (!RUNTIME.has(stage.runtime)) errors.push(`${at}.runtime is invalid`)
    if (stage.owner !== 'lfg-controller') errors.push(`${at}.owner must be lfg-controller`)
    if (!safeRef(stage.artifactRef)) errors.push(`${at}.artifactRef must be a contained relative reference`)
    else if (artifactRefs.has(stage.artifactRef)) errors.push(`${at}.artifactRef must be unique`)
    else artifactRefs.add(stage.artifactRef)
  })

  const work = packet.stages.find((stage) => stage?.id === 'work')
  if (work && work.returnToCaller !== true) errors.push('work.returnToCaller must be true')
  if (work && work.standaloneShippingSkipped !== true) errors.push('work.standaloneShippingSkipped must be true')
  const review = packet.stages.find((stage) => stage?.id === 'review')
  if (review && review.mode !== 'agent') errors.push('review.mode must be agent')
  const terminal = packet.stages.findIndex((stage) => ['failed', 'blocked'].includes(stage?.status))
  if (terminal >= 0 && packet.stages.slice(terminal + 1).some((stage) => stage?.status !== 'skipped')) {
    errors.push(`stages after ${packet.stages[terminal].id} failure must be skipped`)
  }
  return errors
}

const ownership = {
  lifecycle: 'lfg-controller',
  child_dispatch: 'configured-per-stage',
  fixes: 'lfg-controller',
  commit: 'lfg-controller',
  push: 'lfg-controller',
  pull_request: 'lfg-controller',
  ci_repair: 'lfg-controller',
}

async function writeResult(runDir, result) {
  const target = path.join(runDir, 'ce-result.json')
  const temporary = `${target}.tmp`
  await fs.writeFile(temporary, `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 })
  await fs.rename(temporary, target)
}

export async function executeLfgGate(packet, engine, runDir) {
  const errors = validateLfgPacket(packet)
  if (errors.length) throw new Error(`invalid lfg packet: ${errors.join('; ')}`)
  for (const stage of packet.stages) engine.phase(`LFG gate: ${stage.id} (${stage.runtime})`)

  const failed = packet.stages.find((stage) => ['failed', 'blocked'].includes(stage.status))
  const incompleteRequiredGate = packet.stages.find(
    (stage) => REQUIRED_SHIPPING_GATES.has(stage.id) && stage.status !== 'complete',
  )
  const blocker = failed || incompleteRequiredGate
  const failureReason = failed
    ? `${failed.id} ended ${failed.status}; the shipping tail is forbidden.`
    : incompleteRequiredGate
      ? `${incompleteRequiredGate.id} is a required upstream gate and must complete; the shipping tail is forbidden.`
      : null
  const result = {
    schema: RESULT_SCHEMA,
    workflow_id: 'lfg',
    status: blocker ? 'failed' : 'ready-to-ship',
    completed_stages: packet.stages.filter((stage) => stage.status === 'complete').map((stage) => stage.id),
    stage_trace: packet.stages.map(({ id, status, runtime, owner, artifactRef }) => ({
      id,
      status,
      runtime,
      owner,
      artifact_ref: artifactRef,
    })),
    ownership,
    shipping_allowed: !blocker,
    tail_mode: packet.hasRemote ? 'remote' : 'local-only',
    ...(failureReason ? { failure_reason: failureReason } : {}),
  }
  await writeResult(runDir, result)
  if (blocker) throw new Error(result.failure_reason)
  return result
}

export async function main(env = process.env) {
  if (!env.ORCH_ENGINE_URL || !env.ORCH_RUN_DIR) {
    throw new Error('ORCH_ENGINE_URL and ORCH_RUN_DIR are required')
  }
  const engine = await import(env.ORCH_ENGINE_URL)
  const packet = engine.consumeConfidentialPacketJson()
  await engine.run('lfg', () => executeLfgGate(packet, engine, env.ORCH_RUN_DIR))
}

async function deriveChildPatchesCli(args) {
  const flags = {}
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index]
    if (!token.startsWith('--') || !args[index + 1] || args[index + 1].startsWith('--')) {
      throw new Error('Usage: orca-workflow.mjs derive-child-patches --resolved <file> --out-dir <new-private-directory>')
    }
    flags[token.slice(2)] = args[index + 1]
    index += 1
  }
  if (!flags.resolved || !flags['out-dir'] || Object.keys(flags).some((key) => !['resolved', 'out-dir'].includes(key))) {
    throw new Error('Usage: orca-workflow.mjs derive-child-patches --resolved <file> --out-dir <new-private-directory>')
  }
  const resolved = JSON.parse(await fs.readFile(path.resolve(flags.resolved), 'utf8'))
  const manifest = await writeLfgChildExecutionPatches({ resolved, outDir: flags['out-dir'] })
  process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`)
}

async function isMainModule() {
  if (!process.argv[1]) return false
  const entryPath = path.resolve(process.argv[1])
  const modulePath = fileURLToPath(import.meta.url)
  if (entryPath === modulePath) return true
  const [realEntryPath, realModulePath] = await Promise.all([
    fs.realpath(entryPath).catch(() => entryPath),
    fs.realpath(modulePath).catch(() => modulePath),
  ])
  return realEntryPath === realModulePath
}

if (await isMainModule()) {
  if (process.argv[2] === 'derive-child-patches') await deriveChildPatchesCli(process.argv.slice(3))
  else await main()
}
