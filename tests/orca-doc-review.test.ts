import { afterEach, describe, expect, test } from "bun:test"
import { promises as fs } from "node:fs"
import os from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"
import {
  PACKET_SCHEMA,
  REVIEWER_REQUIREMENTS,
  RESULT_SCHEMA,
  WORKFLOW_ID,
  executeDocReview,
  makeReviewerPrompt,
  validatePacket,
  validateReviewerOutput,
} from "../integrations/orca/workflows/doc-review.mjs"

const REPO_ROOT = path.resolve(import.meta.dir, "..")
const tempRoots: string[] = []

const findingOutput = (reviewer: string, title: string) => ({
  reviewer,
  findings: [{
    title,
    severity: "P1",
    section: "Implementation Units",
    why_it_matters: "Implementers would otherwise follow contradictory steps.",
    finding_type: "error",
    autofix_class: "gated_auto",
    confidence: 75,
    evidence: ["Conflicting fixture text"],
    suggested_fix: "Make the two steps consistent.",
  }],
  residual_risks: [],
  deferred_questions: [],
})

const packetFor = (
  nodes: Array<{ role: string; required?: boolean }>,
) => ({
  schema: PACKET_SCHEMA,
  workflowId: WORKFLOW_ID,
  nodes: nodes.map(({ role, required = REVIEWER_REQUIREMENTS[role] ?? false }) => ({
    stage: "persona-review",
    role,
    prompt: `Prompt for ${role}`,
    required,
  })),
})

function fakeEngine(outputs: Record<string, unknown | Error>) {
  const calls: Array<{ prompt: string; options: Record<string, unknown> }> = []
  const phases: string[] = []
  return {
    calls,
    phases,
    phase(name: string) {
      phases.push(name)
    },
    async agent(prompt: string, options: Record<string, unknown>) {
      calls.push({ prompt, options })
      const output = outputs[String(options.role)]
      if (output instanceof Error) throw output
      return output ?? null
    },
    async parallel(thunks: Array<() => Promise<unknown>>) {
      return Promise.all(thunks.map((thunk) => thunk()))
    },
  }
}

async function makeRunDir() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ce-orca-doc-review-"))
  tempRoots.push(root)
  return root
}

async function findingsSchema() {
  return JSON.parse(await fs.readFile(
    path.join(REPO_ROOT, "skills/ce-doc-review/references/findings-schema.json"),
    "utf8",
  ))
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) =>
    fs.rm(root, { recursive: true, force: true })
  ))
})

describe("CE-Orca document review workflow", () => {
  test("maps each selected persona one-to-one to an Orca reviewer node", async () => {
    const runDir = await makeRunDir()
    const coherence = findingOutput("coherence", "Contradictory sequence")
    const feasibility = findingOutput("feasibility", "Missing executable check")
    const engine = fakeEngine({
      "coherence-reviewer": coherence,
      "feasibility-reviewer": feasibility,
    })
    const packet = packetFor([
      { role: "coherence-reviewer" },
      { role: "feasibility-reviewer" },
    ])

    const result = await executeDocReview({
      engine,
      packet,
      runDir,
      findingsSchema: await findingsSchema(),
    })

    expect(engine.calls.map(({ options }) => options)).toEqual([
      expect.objectContaining({
        label: "coherence-reviewer",
        stage: "persona-review",
        role: "coherence-reviewer",
        required: true,
      }),
      expect.objectContaining({
        label: "feasibility-reviewer",
        stage: "persona-review",
        role: "feasibility-reviewer",
        required: true,
      }),
    ])
    expect(engine.phases).toEqual(["persona-review"])
    expect(engine.calls.every(({ prompt }) =>
      prompt.includes("Do not invoke Agent, spawn_agent, a Skill, or any other delegation primitive.")
    )).toBe(true)
    expect(result).toMatchObject({
      schema: RESULT_SCHEMA,
      workflowId: WORKFLOW_ID,
      status: "completed",
      failures: [],
    })
    expect(result.reviewers.map(({ role }) => role)).toEqual(packet.nodes.map(({ role }) => role))

    const persisted = JSON.parse(await fs.readFile(path.join(runDir, "ce-result.json"), "utf8"))
    expect(persisted).toEqual(result)
    const artifact = JSON.parse(await fs.readFile(
      path.join(runDir, result.reviewers[0].artifactRef),
      "utf8",
    ))
    expect(artifact).toMatchObject({
      schema: "ce-orca.doc-reviewer-artifact/v1",
      role: "coherence-reviewer",
      status: "completed",
      output: coherence,
      error: null,
    })
  })

  test("rejects code-like fields, unknown roles, and duplicate reviewers before dispatch", () => {
    const valid = packetFor([{ role: "coherence-reviewer" }])

    expect(() => validatePacket({
      ...valid,
      nodes: [{ ...valid.nodes[0], command: "rm -rf /" }],
    })).toThrow("data-only reviewer node")
    expect(() => validatePacket(packetFor([{ role: "not-installed" }]))).toThrow(
      "not an installed doc-review role",
    )
    expect(() => validatePacket(packetFor([
      { role: "coherence-reviewer" },
      { role: "coherence-reviewer" },
    ]))).toThrow("duplicate reviewer role")
    expect(() => validatePacket(packetFor([
      { role: "coherence-reviewer", required: false },
    ]))).toThrow("does not match the installed role registry")
  })

  test("persists successful artifacts while declaring a required reviewer failure", async () => {
    const runDir = await makeRunDir()
    const coherence = findingOutput("coherence", "Contradictory sequence")
    const engine = fakeEngine({
      "coherence-reviewer": coherence,
      "feasibility-reviewer": new Error("worker stopped"),
    })

    const result = await executeDocReview({
      engine,
      packet: packetFor([
        { role: "coherence-reviewer" },
        { role: "feasibility-reviewer" },
      ]),
      runDir,
      findingsSchema: await findingsSchema(),
    })

    expect(result.status).toBe("failed")
    expect(result.failures).toEqual([{
      stage: "persona-review",
      role: "feasibility-reviewer",
      required: true,
      code: "reviewer_failed",
    }])
    expect(JSON.parse(await fs.readFile(
      path.join(runDir, "reviewers/coherence-reviewer.json"),
      "utf8",
    ))).toMatchObject({ status: "completed", output: coherence })
    expect(JSON.parse(await fs.readFile(
      path.join(runDir, "reviewers/feasibility-reviewer.json"),
      "utf8",
    ))).toMatchObject({
      status: "failed",
      output: null,
      error: { code: "reviewer_failed" },
    })
  })

  test("validates the complete upstream reviewer shape and rejects malformed findings", () => {
    const valid = findingOutput("coherence", "Contradictory sequence")

    expect(validateReviewerOutput(valid)).toEqual(valid)
    expect(() => validateReviewerOutput({ ...valid, residual_risks: undefined })).toThrow(
      /residual_risks must be an array/i,
    )
    expect(() => validateReviewerOutput({
      ...valid,
      findings: [{ ...valid.findings[0], severity: "critical" }],
    })).toThrow(/severity must be one of P0, P1, P2, P3/i)
    expect(() => validateReviewerOutput({
      ...valid,
      findings: [{ ...valid.findings[0], confidence: 80 }],
    })).toThrow(/confidence must be one of 0, 25, 50, 75, 100/i)
    expect(() => validateReviewerOutput({
      ...valid,
      findings: [{ ...valid.findings[0], evidence: [] }],
    })).toThrow(/evidence must contain at least one string/i)

    const missingRequired = { ...valid.findings[0] }
    Reflect.deleteProperty(missingRequired, "why_it_matters")
    expect(() => validateReviewerOutput({ ...valid, findings: [missingRequired] })).toThrow(
      /why_it_matters is required/i,
    )
  })

  test("fails a required reviewer closed when its returned artifact violates the upstream shape", async () => {
    const runDir = await makeRunDir()
    const malformed = findingOutput("coherence", "Contradictory sequence")
    malformed.findings[0].confidence = 80
    const engine = fakeEngine({ "coherence-reviewer": malformed })

    const result = await executeDocReview({
      engine,
      packet: packetFor([{ role: "coherence-reviewer" }]),
      runDir,
      findingsSchema: await findingsSchema(),
    })

    expect(result.status).toBe("failed")
    expect(result.failures).toEqual([{
      stage: "persona-review",
      role: "coherence-reviewer",
      required: true,
      code: "reviewer_failed",
    }])
    expect(JSON.parse(await fs.readFile(
      path.join(runDir, "reviewers/coherence-reviewer.json"),
      "utf8",
    ))).toMatchObject({ status: "failed", output: null })
  })

  test("marks an optional reviewer failure as degraded", async () => {
    const runDir = await makeRunDir()
    const engine = fakeEngine({
      "design-lens-reviewer": new Error("unavailable"),
    })

    const result = await executeDocReview({
      engine,
      packet: packetFor([{ role: "design-lens-reviewer" }]),
      runDir,
      findingsSchema: await findingsSchema(),
    })

    expect(result.status).toBe("degraded")
    expect(result.failures[0]).toMatchObject({
      role: "design-lens-reviewer",
      required: false,
    })
  })

  test("adds the reviewer-only boundary without changing the supplied prompt", () => {
    const node = packetFor([{ role: "product-lens-reviewer" }]).nodes[0]
    const prompt = makeReviewerPrompt(node)

    expect(prompt).toEndWith(node.prompt)
    expect(prompt).toContain("You own exactly one CE document-review persona")
    expect(prompt).toContain("Do not edit the reviewed document or any project file.")
  })

  test("remains executable after orch-console snapshots the workflow file", async () => {
    const snapshotDir = await makeRunDir()
    const source = path.join(
      REPO_ROOT,
      "integrations/orca/workflows/doc-review.mjs",
    )
    const snapshot = path.join(snapshotDir, "workflow.mjs")
    await fs.copyFile(source, snapshot)

    const module = await import(`${pathToFileURL(snapshot).href}?snapshot=1`)
    expect(module.WORKFLOW_ID).toBe(WORKFLOW_ID)
    expect(module.REVIEWER_OUTPUT_SCHEMA.required).toEqual([
      "reviewer",
      "findings",
      "residual_risks",
      "deferred_questions",
    ])
  })

  test("documents immutable resolve-then-run dispatch", async () => {
    const reference = await fs.readFile(
      path.join(REPO_ROOT, "skills/ce-doc-review/references/orca-dispatch.md"),
      "utf8",
    )
    expect(reference).toContain("resolve --workflow ce-doc-review --out <resolved.json>")
    expect(reference).toContain("--resolved <private-resolved.json>")
  })
})
