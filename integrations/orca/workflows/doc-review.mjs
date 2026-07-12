#!/usr/bin/env node

import { promises as fs } from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"

export const PACKET_SCHEMA = "ce-orca.packet/v1"
export const WORKFLOW_ID = "ce-doc-review"
export const RESULT_SCHEMA = "ce-orca.doc-review-result/v1"

export const REVIEWER_ROLES = Object.freeze([
  "adversarial-document-reviewer",
  "coherence-reviewer",
  "design-lens-reviewer",
  "feasibility-reviewer",
  "product-lens-reviewer",
  "scope-guardian-reviewer",
  "security-lens-reviewer",
])

export const REVIEWER_REQUIREMENTS = Object.freeze({
  "adversarial-document-reviewer": false,
  "coherence-reviewer": true,
  "design-lens-reviewer": false,
  "feasibility-reviewer": true,
  "product-lens-reviewer": false,
  "scope-guardian-reviewer": false,
  "security-lens-reviewer": false,
})

const ROLE_SET = new Set(REVIEWER_ROLES)
const PACKET_KEYS = new Set(["schema", "workflowId", "nodes"])
const NODE_KEYS = new Set(["stage", "role", "prompt", "required"])
const FINDING_REQUIRED_FIELDS = Object.freeze([
  "title",
  "severity",
  "section",
  "why_it_matters",
  "finding_type",
  "autofix_class",
  "confidence",
  "evidence",
])
const SEVERITIES = new Set(["P0", "P1", "P2", "P3"])
const FINDING_TYPES = new Set(["error", "omission"])
const AUTOFIX_CLASSES = new Set(["safe_auto", "gated_auto", "manual"])
const CONFIDENCE_ANCHORS = new Set([0, 25, 50, 75, 100])

// Kept inside the workflow because orch-console snapshots a registered workflow
// into the run directory before executing it. This schema gives the Orca
// engine the upstream required/type surface. The engine intentionally supports
// only a small JSON-Schema subset, so the workflow revalidates every returned
// artifact against the remaining upstream constraints before completion.
export const REVIEWER_OUTPUT_SCHEMA = Object.freeze({
  type: "object",
  required: ["reviewer", "findings", "residual_risks", "deferred_questions"],
  properties: {
    reviewer: { type: "string" },
    findings: {
      type: "array",
      items: {
        type: "object",
        required: [
          ...FINDING_REQUIRED_FIELDS,
        ],
        properties: {
          title: { type: "string", maxLength: 100 },
          severity: { type: "string", enum: [...SEVERITIES] },
          section: { type: "string" },
          why_it_matters: { type: "string" },
          finding_type: { type: "string", enum: [...FINDING_TYPES] },
          autofix_class: { type: "string", enum: [...AUTOFIX_CLASSES] },
          confidence: { type: "integer", enum: [...CONFIDENCE_ANCHORS] },
          evidence: { type: "array", minItems: 1, items: { type: "string" } },
        },
      },
    },
    residual_risks: { type: "array", items: { type: "string" } },
    deferred_questions: { type: "array", items: { type: "string" } },
  },
})

const ownKeysAre = (value, allowed) =>
  Object.keys(value).every((key) => allowed.has(key))

const isRecord = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value)

const isNonEmptyString = (value) =>
  typeof value === "string" && value.trim().length > 0

function requireFields(value, fields, at) {
  for (const field of fields) {
    if (!Object.hasOwn(value, field)) throw new Error(`${at}.${field} is required`)
  }
}

function validateStringArray(value, at, { minItems = 0 } = {}) {
  if (!Array.isArray(value) || value.length < minItems || value.some((item) => typeof item !== "string")) {
    const requirement = minItems > 0 ? " must contain at least one string" : " must be an array of strings"
    throw new Error(`${at}${requirement}`)
  }
}

function validateFinding(finding, index) {
  const at = `reviewer.findings[${index}]`
  if (!isRecord(finding)) throw new Error(`${at} must be an object`)
  requireFields(finding, FINDING_REQUIRED_FIELDS, at)
  if (typeof finding.title !== "string" || finding.title.length > 100) {
    throw new Error(`${at}.title must be a string no longer than 100 characters`)
  }
  for (const field of ["section", "why_it_matters"]) {
    if (typeof finding[field] !== "string") throw new Error(`${at}.${field} must be a string`)
  }
  if (!SEVERITIES.has(finding.severity)) {
    throw new Error(`${at}.severity must be one of P0, P1, P2, P3`)
  }
  if (!FINDING_TYPES.has(finding.finding_type)) {
    throw new Error(`${at}.finding_type must be one of error, omission`)
  }
  if (!AUTOFIX_CLASSES.has(finding.autofix_class)) {
    throw new Error(`${at}.autofix_class must be one of safe_auto, gated_auto, manual`)
  }
  if (!Number.isInteger(finding.confidence) || !CONFIDENCE_ANCHORS.has(finding.confidence)) {
    throw new Error(`${at}.confidence must be one of 0, 25, 50, 75, 100`)
  }
  validateStringArray(finding.evidence, `${at}.evidence`, { minItems: 1 })
  if (Object.hasOwn(finding, "suggested_fix")
    && finding.suggested_fix !== null
    && typeof finding.suggested_fix !== "string") {
    throw new Error(`${at}.suggested_fix must be a string or null`)
  }
}

export function validateReviewerOutput(output) {
  if (!isRecord(output)) throw new Error("reviewer output must be an object")
  requireFields(output, ["reviewer", "findings", "residual_risks", "deferred_questions"], "reviewer")
  if (typeof output.reviewer !== "string") throw new Error("reviewer.reviewer must be a string")
  if (!Array.isArray(output.findings)) throw new Error("reviewer.findings must be an array")
  output.findings.forEach(validateFinding)
  validateStringArray(output.residual_risks, "reviewer.residual_risks")
  validateStringArray(output.deferred_questions, "reviewer.deferred_questions")
  return output
}

function validateNode(node, index, seenRoles) {
  if (!isRecord(node) || !ownKeysAre(node, NODE_KEYS)) {
    throw new Error(`nodes[${index}] must be a data-only reviewer node`)
  }
  if (node.stage !== "persona-review") {
    throw new Error(`nodes[${index}].stage must be persona-review`)
  }
  if (!ROLE_SET.has(node.role)) {
    throw new Error(`nodes[${index}].role is not an installed doc-review role`)
  }
  if (seenRoles.has(node.role)) {
    throw new Error(`duplicate reviewer role: ${node.role}`)
  }
  if (!isNonEmptyString(node.prompt)) {
    throw new Error(`nodes[${index}].prompt must be a non-empty string`)
  }
  if (typeof node.required !== "boolean") {
    throw new Error(`nodes[${index}].required must be boolean`)
  }
  if (node.required !== REVIEWER_REQUIREMENTS[node.role]) {
    throw new Error(`nodes[${index}].required does not match the installed role registry`)
  }
  seenRoles.add(node.role)
}

export function validatePacket(packet) {
  if (!isRecord(packet) || !ownKeysAre(packet, PACKET_KEYS)) {
    throw new Error("packet must contain only schema, workflowId, and nodes")
  }
  if (packet.schema !== PACKET_SCHEMA) {
    throw new Error(`unsupported packet schema: ${packet.schema ?? "missing"}`)
  }
  if (packet.workflowId !== WORKFLOW_ID) {
    throw new Error(`packet workflowId must be ${WORKFLOW_ID}`)
  }
  if (!Array.isArray(packet.nodes) || packet.nodes.length === 0) {
    throw new Error("packet nodes must be a non-empty array")
  }
  const seenRoles = new Set()
  packet.nodes.forEach((node, index) => validateNode(node, index, seenRoles))
  return packet
}

export function makeReviewerPrompt(node) {
  return [
    "<orca-reviewer-boundary>",
    `You own exactly one CE document-review persona: ${node.role}.`,
    "Do not invoke Agent, spawn_agent, a Skill, or any other delegation primitive.",
    "Do not edit the reviewed document or any project file.",
    "Return only the structured reviewer result requested below.",
    "</orca-reviewer-boundary>",
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

function reviewerArtifact(node, output) {
  const completed = output !== null
  return {
    schema: "ce-orca.doc-reviewer-artifact/v1",
    stage: node.stage,
    role: node.role,
    required: node.required,
    status: completed ? "completed" : "failed",
    output: completed ? output : null,
    error: completed ? null : { code: "reviewer_failed" },
  }
}

function overallStatus(failures) {
  if (failures.some((failure) => failure.required)) return "failed"
  return failures.length > 0 ? "degraded" : "completed"
}

async function runReviewer(engine, node, findingsSchema) {
  try {
    const output = await engine.agent(makeReviewerPrompt(node), {
      label: node.role,
      stage: node.stage,
      role: node.role,
      required: node.required,
      schema: findingsSchema,
    })
    return validateReviewerOutput(output)
  } catch {
    return null
  }
}

export async function executeDocReview({
  engine,
  packet,
  runDir,
  findingsSchema = REVIEWER_OUTPUT_SCHEMA,
}) {
  validatePacket(packet)
  if (!isNonEmptyString(runDir)) throw new Error("ORCH_RUN_DIR is required")

  engine.phase("persona-review")
  const outputs = await engine.parallel(
    packet.nodes.map((node) => () => runReviewer(engine, node, findingsSchema)),
  )
  const reviewers = []
  const failures = []

  for (const [index, node] of packet.nodes.entries()) {
    const artifact = reviewerArtifact(node, outputs[index] ?? null)
    const artifactRef = path.posix.join("reviewers", `${node.role}.json`)
    await writeJsonAtomic(path.join(runDir, artifactRef), artifact)
    reviewers.push({
      stage: node.stage,
      role: node.role,
      required: node.required,
      status: artifact.status,
      artifactRef,
    })
    if (artifact.status === "failed") {
      failures.push({
        stage: node.stage,
        role: node.role,
        required: node.required,
        code: "reviewer_failed",
      })
    }
  }

  const result = {
    schema: RESULT_SCHEMA,
    workflowId: WORKFLOW_ID,
    status: overallStatus(failures),
    reviewers,
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
  await engine.run(WORKFLOW_ID, () =>
    executeDocReview({ engine, packet, runDir }),
  )
}

const invokedAsScript = process.argv[1]
  && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url

if (invokedAsScript) {
  await main()
}
