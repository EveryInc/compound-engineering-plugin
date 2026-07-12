import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

export const PACKET_SCHEMA = 'ce-orca.packet/v1'
export const RESULT_SCHEMA = 'ce-orca.work-result/v1'
const ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/
const UNSAFE_FILE_PATTERN = /\0|[*?[\]{}]|[!+@]\(/
const MAX_BATCH = 5
const WORKER_STATUSES = ['complete', 'blocked', 'failed']
const WORKER_STATUS_SET = new Set(WORKER_STATUSES)
const isRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const workerSchema = {
  type: 'object',
  required: ['status', 'unit_id', 'changed_files', 'verification_evidence', 'behavior_change', 'blockers'],
  properties: {
    status: { type: 'string', enum: WORKER_STATUSES },
    unit_id: { type: 'string' },
    changed_files: { type: 'array', items: { type: 'string' } },
    verification_evidence: { type: 'object' },
    behavior_change: { type: 'boolean' },
    blockers: { type: 'array', items: { type: 'string' } },
  },
}

const normalizedFile = (value) => {
  if (
    typeof value !== 'string'
    || !value
    || path.isAbsolute(value)
    || UNSAFE_FILE_PATTERN.test(value)
  ) return null
  const normalized = path.posix.normalize(value.replaceAll('\\', '/'))
  return normalized === '.' || normalized === '..' || normalized.startsWith('../') || normalized.endsWith('/')
    ? null
    : normalized
}

const scopesOverlap = (left, right) => {
  const rightSet = new Set(right)
  return left.some((entry) => rightSet.has(entry))
}

export function validatePacket(packet) {
  const errors = []
  if (!packet || typeof packet !== 'object' || Array.isArray(packet)) return ['packet must be an object']
  if (packet.schema !== PACKET_SCHEMA) errors.push(`schema must be ${PACKET_SCHEMA}`)
  if (packet.workflowId !== 'ce-work') errors.push('workflowId must be ce-work')
  if (!Array.isArray(packet.nodes) || packet.nodes.length < 1 || packet.nodes.length > MAX_BATCH) {
    errors.push(`nodes must contain 1-${MAX_BATCH} implementation units`)
    return errors
  }

  const ids = new Set()
  for (const [index, node] of packet.nodes.entries()) {
    const at = `nodes[${index}]`
    if (!node || typeof node !== 'object' || Array.isArray(node)) {
      errors.push(`${at} must be an object`)
      continue
    }
    if (!ID.test(node.id || '')) errors.push(`${at}.id is invalid`)
    else if (ids.has(node.id)) errors.push(`${at}.id is duplicated`)
    else ids.add(node.id)
    if (node.stage !== 'implementation') errors.push(`${at}.stage must be implementation`)
    if (node.role !== 'implementation-unit-worker') {
      errors.push(`${at}.role must be implementation-unit-worker`)
    }
    if (typeof node.prompt !== 'string' || !node.prompt.trim()) errors.push(`${at}.prompt is required`)
    if (!Array.isArray(node.predictedFiles) || node.predictedFiles.length === 0) {
      errors.push(`${at}.predictedFiles is required`)
    } else if (node.predictedFiles.some((file) => !normalizedFile(file))) {
      errors.push(`${at}.predictedFiles contains an unsafe path`)
    }
  }

  if (packet.nodes.length > 1) {
    for (let left = 0; left < packet.nodes.length; left += 1) {
      for (let right = left + 1; right < packet.nodes.length; right += 1) {
        const leftFiles = (packet.nodes[left].predictedFiles || []).map(normalizedFile).filter(Boolean)
        const rightFiles = (packet.nodes[right].predictedFiles || []).map(normalizedFile).filter(Boolean)
        if (scopesOverlap(leftFiles, rightFiles)) {
          errors.push(`nodes ${packet.nodes[left].id} and ${packet.nodes[right].id} overlap; serialize them`)
        }
      }
    }
  }
  return errors
}

const ownership = {
  implementation: 'orca',
  integration: 'ce-controller',
  verification: 'ce-controller',
  shipping: 'caller',
}

const workerPrompt = (node) => `${node.prompt.trim()}

[CE-ORCA UNIT CONTRACT]
Implement only unit ${node.id}. You are a writing worker in an isolated worktree.
Do not run git add, commit, push, open a PR, watch CI, or invoke another agent/subagent.
Do not run the global shipping tail. Focused tests for this unit are allowed.
Report actual changed_files and the evidence you observed; never invent red-before evidence.`

const unitRecord = (node, status, value = null) => ({
  id: node.id,
  status,
  changed_files: Array.isArray(value?.changed_files) ? value.changed_files : [],
  verification_evidence: value?.verification_evidence || {},
  behavior_change: value?.behavior_change === true,
  blockers: Array.isArray(value?.blockers) ? value.blockers : [],
})

const validWorkerIdentity = (node, value) =>
  isRecord(value) && WORKER_STATUS_SET.has(value.status) && value.unit_id === node.id

const validWorkerFiles = (files) =>
  Array.isArray(files) && files.every((file) => normalizedFile(file))

const validWorkerEvidence = (value) =>
  isRecord(value.verification_evidence)
  && typeof value.behavior_change === 'boolean'
  && Array.isArray(value.blockers)
  && value.blockers.every((blocker) => typeof blocker === 'string')

const validWorkerValue = (node, value) =>
  validWorkerIdentity(node, value)
  && validWorkerFiles(value.changed_files)
  && validWorkerEvidence(value)

const normalizedWorkerValue = (node, outcome) => {
  if (outcome.status !== 'fulfilled') return null
  if (!isRecord(outcome.value)) return null
  return validWorkerValue(node, outcome.value.value) ? outcome.value.value : null
}

const completedChange = (outcome, value) =>
  value?.status === 'complete' && outcome.status === 'fulfilled' && Boolean(outcome.value.change)

async function writeResult(runDir, result) {
  const target = path.join(runDir, 'ce-result.json')
  const temporary = `${target}.tmp`
  await fs.writeFile(temporary, `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 })
  await fs.rename(temporary, target)
}

export async function executeWorkBatch(packet, engine, runDir) {
  const errors = validatePacket(packet)
  if (errors.length) throw new Error(`invalid ce-work packet: ${errors.join('; ')}`)

  engine.phase(`CE implementation batch: ${packet.nodes.map((node) => node.id).join(', ')}`)
  const settled = await Promise.allSettled(
    packet.nodes.map((node) =>
      engine.agentWithChanges(workerPrompt(node), {
        label: node.id,
        stage: node.stage,
        role: node.role,
        schema: workerSchema,
        allowedFiles: node.predictedFiles.map(normalizedFile),
      }),
    ),
  )

  const workerValues = settled.map((outcome, index) => normalizedWorkerValue(packet.nodes[index], outcome))
  const units = workerValues.map((value, index) =>
    unitRecord(packet.nodes[index], value?.status || 'failed', value),
  )
  const failed = settled.some((outcome, index) => !completedChange(outcome, workerValues[index]))
  if (failed) {
    const result = {
      schema: RESULT_SCHEMA,
      workflow_id: 'ce-work',
      status: 'failed',
      units,
      ownership,
      failure_reason: 'At least one isolated implementation worker failed; no batch integration was attempted.',
    }
    await writeResult(runDir, result)
    throw new Error(result.failure_reason)
  }

  for (let index = 0; index < settled.length; index += 1) {
    try {
      const integration = await engine.integrateChange(settled[index].value.change)
      if (!isRecord(integration) || !Array.isArray(integration.files)) {
        throw new Error('integration did not attest actual changed files')
      }
      units[index].integration = integration
      units[index].changed_files = integration.files
    } catch (error) {
      units[index].status = 'failed'
      const result = {
        schema: RESULT_SCHEMA,
        workflow_id: 'ce-work',
        status: 'failed',
        units,
        ownership,
        failure_reason: `Integration failed for ${units[index].id}: ${error.message}`,
      }
      await writeResult(runDir, result)
      throw error
    }
  }

  const result = { schema: RESULT_SCHEMA, workflow_id: 'ce-work', status: 'complete', units, ownership }
  await writeResult(runDir, result)
  return result
}

export async function main(env = process.env) {
  if (!env.ORCH_ENGINE_URL || !env.ORCH_RUN_DIR) {
    throw new Error('ORCH_ENGINE_URL and ORCH_RUN_DIR are required')
  }
  const engine = await import(env.ORCH_ENGINE_URL)
  const packet = engine.consumeConfidentialPacketJson()
  await engine.run('ce-work', () => executeWorkBatch(packet, engine, env.ORCH_RUN_DIR))
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
if (invokedDirectly) await main()
