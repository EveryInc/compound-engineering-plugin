#!/usr/bin/env node

import { promises as fs } from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"

export const PACKET_SCHEMA = "ce-orca.packet/v1"
export const RESULT_SCHEMA = "ce-orca.read-result/v1"
export const WORKFLOW_ID = "ce-plan"

export const ROLE_POLICY = Object.freeze({
  "project-profile": Object.freeze({
    "repo-profiler": Object.freeze({ required: false, repeatable: false }),
  }),
  "local-research": Object.freeze({
    "repo-research-analyst": Object.freeze({ required: true, repeatable: false }),
    "learnings-researcher": Object.freeze({ required: false, repeatable: false }),
    "agent-native-planning-strategist": Object.freeze({ required: false, repeatable: false }),
  }),
  "flow-analysis": Object.freeze({
    "spec-flow-analyzer": Object.freeze({ required: false, repeatable: false }),
  }),
})

const PACKET_KEYS = new Set(["schema", "workflowId", "nodes"])
const NODE_KEYS = new Set(["id", "stage", "role", "prompt", "required", "wave"])
const SAFE_ID = /^[a-z0-9][a-z0-9._-]{0,79}$/

const isRecord = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value)

const ownKeysAre = (value, allowed) =>
  Object.keys(value).every((key) => allowed.has(key))

const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key)

const nonEmpty = (value) =>
  typeof value === "string" && value.trim().length > 0

function validateNode(node, index, seenIds, seenRoles) {
  if (!isRecord(node) || !ownKeysAre(node, NODE_KEYS)) {
    throw new Error(`nodes[${index}] must be a data-only CE analysis node`)
  }
  if (!SAFE_ID.test(node.id ?? "")) {
    throw new Error(`nodes[${index}].id must be a safe unique identifier`)
  }
  if (seenIds.has(node.id)) throw new Error(`duplicate node id: ${node.id}`)
  if (!hasOwn(ROLE_POLICY, node.stage)) throw new Error(`nodes[${index}].stage is not an installed ${WORKFLOW_ID} stage`)
  const stage = ROLE_POLICY[node.stage]
  if (!hasOwn(stage, node.role)) throw new Error(`nodes[${index}].role is not installed in stage ${node.stage}`)
  const policy = stage[node.role]
  if (!nonEmpty(node.prompt)) throw new Error(`nodes[${index}].prompt must be non-empty`)
  if (node.required !== policy.required) {
    throw new Error(`nodes[${index}].required does not match the installed role policy`)
  }
  if (!Number.isInteger(node.wave) || node.wave < 0) {
    throw new Error(`nodes[${index}].wave must be a non-negative integer`)
  }
  const roleKey = `${node.stage}:${node.role}`
  if (!policy.repeatable && seenRoles.has(roleKey)) {
    throw new Error(`duplicate non-repeatable role: ${roleKey}`)
  }
  seenIds.add(node.id)
  seenRoles.add(roleKey)
}

export function validatePacket(packet) {
  if (!isRecord(packet) || !ownKeysAre(packet, PACKET_KEYS)) {
    throw new Error("packet must contain only schema, workflowId, and nodes")
  }
  if (packet.schema !== PACKET_SCHEMA) throw new Error(`unsupported packet schema: ${packet.schema ?? "missing"}`)
  if (packet.workflowId !== WORKFLOW_ID) throw new Error(`packet workflowId must be ${WORKFLOW_ID}`)
  if (!Array.isArray(packet.nodes) || packet.nodes.length === 0) {
    throw new Error("packet nodes must be a non-empty array")
  }
  if (packet.nodes.length > 24) throw new Error("packet cannot contain more than 24 planning nodes")
  const seenIds = new Set()
  const seenRoles = new Set()
  packet.nodes.forEach((node, index) => validateNode(node, index, seenIds, seenRoles))
  return packet
}

export function makeWorkerPrompt(node) {
  return [
    "<ce-orca-owner-boundary>",
    `You own exactly one already-selected CE analysis node: ${node.stage}/${node.role}.`,
    "Do not invoke Agent, Task, spawn_agent, a Skill, or any other delegation primitive.",
    "Do not create, edit, or delete project files; return analysis only.",
    "Return the complete result requested by the supplied CE prompt.",
    "</ce-orca-owner-boundary>",
    "",
    node.prompt.trim(),
  ].join("\n")
}

async function writeJsonAtomic(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true })
  const temporary = `${file}.tmp`
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 })
  await fs.rename(temporary, file)
}

async function runWorker(engine, node) {
  try {
    return await engine.agent(makeWorkerPrompt(node), {
      label: node.id,
      stage: node.stage,
      role: node.role,
      required: node.required,
    })
  } catch {
    return null
  }
}

const completed = (output) =>
  output !== null && output !== undefined && (typeof output !== "string" || output.trim().length > 0)

function statusFor(failures) {
  if (failures.some(({ required }) => required)) return "failed"
  return failures.length > 0 ? "degraded" : "completed"
}

function waveGroups(nodes) {
  const groups = new Map()
  for (const node of nodes) {
    if (!groups.has(node.wave)) groups.set(node.wave, [])
    groups.get(node.wave).push(node)
  }
  return [...groups.entries()].sort(([left], [right]) => left - right)
}

export async function executeReadWorkflow({ engine, packet, runDir }) {
  validatePacket(packet)
  if (!nonEmpty(runDir)) throw new Error("ORCH_RUN_DIR is required")
  const records = new Map()

  for (const [wave, nodes] of waveGroups(packet.nodes)) {
    engine.phase(`analysis wave ${wave}: ${[...new Set(nodes.map(({ stage }) => stage))].join(", ")}`)
    const outputs = await engine.parallel(nodes.map((node) => () => runWorker(engine, node)))
    nodes.forEach((node, index) => records.set(node.id, outputs[index] ?? null))
  }

  const results = []
  const failures = []
  for (const node of packet.nodes) {
    const output = records.get(node.id)
    const ok = completed(output)
    const artifactRef = path.posix.join("nodes", `${node.id}.json`)
    await writeJsonAtomic(path.join(runDir, artifactRef), {
      schema: "ce-orca.node-artifact/v1",
      workflowId: WORKFLOW_ID,
      id: node.id,
      stage: node.stage,
      role: node.role,
      required: node.required,
      status: ok ? "completed" : "failed",
      output: ok ? output : null,
      error: ok ? null : { code: "worker_failed" },
    })
    results.push({
      id: node.id,
      stage: node.stage,
      role: node.role,
      required: node.required,
      status: ok ? "completed" : "failed",
      artifactRef,
    })
    if (!ok) failures.push({ id: node.id, stage: node.stage, role: node.role, required: node.required, code: "worker_failed" })
  }

  const result = {
    schema: RESULT_SCHEMA,
    workflowId: WORKFLOW_ID,
    status: statusFor(failures),
    ownership: { selection: "ce-controller", dispatch: "orca", synthesis: "ce-controller" },
    nodes: results,
    failures,
  }
  await writeJsonAtomic(path.join(runDir, "ce-result.json"), result)
  return result
}

export async function main() {
  const engineUrl = process.env.ORCH_ENGINE_URL
  const runDir = process.env.ORCH_RUN_DIR
  if (!engineUrl) throw new Error("ORCH_ENGINE_URL is required")
  if (!runDir) throw new Error("ORCH_RUN_DIR is required")
  const engine = await import(engineUrl)
  const packet = validatePacket(engine.consumeConfidentialPacketJson())
  await engine.run(WORKFLOW_ID, () => executeReadWorkflow({ engine, packet, runDir }))
}

const invokedAsScript = process.argv[1]
  && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url

if (invokedAsScript) await main()
