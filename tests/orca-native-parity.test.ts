import { afterEach, describe, expect, test } from "bun:test"
import { promises as fs } from "node:fs"
import os from "node:os"
import path from "node:path"
import {
  REVIEWER_OUTPUT_SCHEMA,
  REVIEWER_REQUIREMENTS,
  REVIEWER_ROLES,
  executeDocReview,
} from "../integrations/orca/workflows/doc-review.mjs"
import { buildRoleRegistry } from "../integrations/orca/role-registry.mjs"

const REPO_ROOT = path.resolve(import.meta.dir, "..")
const SKILL_FILE = path.join(REPO_ROOT, "skills/ce-doc-review/SKILL.md")
const tempRoots: string[] = []

const NATIVE_DISPATCH = "Dispatch generic subagents using **bounded parallelism** with the platform's subagent primitive (e.g., `Agent` in Claude Code, `spawn_agent` in Codex) where available; otherwise run the work inline or serially. Omit the `mode` parameter so the user's configured permission settings apply. Respect the current harness's active-subagent limit: queue selected reviewers, dispatch only as many as the harness accepts, and fill freed slots as reviewers complete. Treat active-agent/thread/concurrency-limit spawn errors as backpressure, not reviewer failure: leave the reviewer queued and retry after a slot frees. Record a reviewer as failed only after a successful dispatch times out/fails, or when dispatch fails for a non-capacity reason."

const fixtureOutput = (reviewer: string) => ({
  reviewer,
  findings: [],
  residual_risks: [`${reviewer} residual`],
  deferred_questions: [],
})

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) =>
    fs.rm(root, { recursive: true, force: true })
  ))
})

async function makeRunDir() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ce-orca-parity-"))
  tempRoots.push(root)
  return root
}

describe("native and Orca document review parity", () => {
  test("keeps the upstream native dispatch paragraph byte-for-byte", async () => {
    const skill = await fs.readFile(SKILL_FILE, "utf8")
    expect(skill.split(NATIVE_DISPATCH)).toHaveLength(2)
    expect(skill.indexOf("<!-- ce-orca-hook:start ce-doc-review.persona-dispatch -->"))
      .toBeLessThan(skill.indexOf(NATIVE_DISPATCH))
    expect(skill).toContain("## Phases 3-5: Synthesis, Presentation, and Next Action")
  })

  test("maps the complete upstream persona inventory without fork-only roles", async () => {
    const personaDir = path.join(REPO_ROOT, "skills/ce-doc-review/references/personas")
    const upstreamRoles = (await fs.readdir(personaDir))
      .filter((file) => file.endsWith(".md"))
      .map((file) => file.replace(/\.md$/, ""))
      .sort()

    expect([...REVIEWER_ROLES].sort()).toEqual(upstreamRoles)

    const registry = await buildRoleRegistry(REPO_ROOT)
    const registeredRoles = registry.workflows["ce-doc-review"].stages["persona-review"].roles
    expect(Object.keys(registeredRoles).sort()).toEqual(upstreamRoles)
    expect(Object.fromEntries(Object.entries(registeredRoles).map(([role, value]) => [
      role,
      value.required,
    ]))).toEqual(REVIEWER_REQUIREMENTS)
  })

  test("returns the same reviewer payloads to the unchanged synthesis join", async () => {
    const runDir = await makeRunDir()
    const roles = ["coherence-reviewer", "feasibility-reviewer"]
    const nativeResults = roles.map((role) => fixtureOutput(role))
    const outputs = Object.fromEntries(roles.map((role, index) => [role, nativeResults[index]]))
    const engine = {
      phase() {},
      async agent(_prompt: string, options: { role: string }) {
        return outputs[options.role]
      },
      async parallel(thunks: Array<() => Promise<unknown>>) {
        return Promise.all(thunks.map((thunk) => thunk()))
      },
    }
    const findingsSchema = JSON.parse(await fs.readFile(
      path.join(REPO_ROOT, "skills/ce-doc-review/references/findings-schema.json"),
      "utf8",
    ))

    const result = await executeDocReview({
      engine,
      packet: {
        schema: "ce-orca.packet/v1",
        workflowId: "ce-doc-review",
        nodes: roles.map((role) => ({
          stage: "persona-review",
          role,
          prompt: `Fixture prompt for ${role}`,
          required: true,
        })),
      },
      runDir,
      findingsSchema,
    })
    const orcaResults = await Promise.all(result.reviewers.map(async ({ artifactRef }) =>
      JSON.parse(await fs.readFile(path.join(runDir, artifactRef), "utf8")).output
    ))

    expect(result.status).toBe("completed")
    expect(result.failures).toEqual([])
    expect(orcaResults).toEqual(nativeResults)
  })

  test("preserves parent ownership of selection, synthesis, and safe fixes", async () => {
    const [skill, dispatchReference] = await Promise.all([
      fs.readFile(SKILL_FILE, "utf8"),
      fs.readFile(
        path.join(REPO_ROOT, "skills/ce-doc-review/references/orca-dispatch.md"),
        "utf8",
      ),
    ])

    expect(skill).toContain("### Select Conditional Personas")
    expect(skill).toContain("After all dispatched agents return, read `references/synthesis-and-presentation.md`")
    expect(dispatchReference).toContain("Keep document classification, persona selection, prompt construction,")
    expect(dispatchReference).toContain("synthesis, `safe_auto` edits, interactive questions, and final presentation")
    expect(dispatchReference).toContain("An Orca reviewer must not")
  })

  test("publishes the durable result and reviewer artifact gates", async () => {
    const [contract, upstreamOutputSchema] = await Promise.all([
      fs.readFile(
        path.join(REPO_ROOT, "integrations/orca/contracts/doc-review-result.schema.json"),
        "utf8",
      ).then(JSON.parse),
      fs.readFile(
        path.join(REPO_ROOT, "skills/ce-doc-review/references/findings-schema.json"),
        "utf8",
      ).then(JSON.parse),
    ])

    expect(contract.required).toEqual([
      "schema",
      "workflowId",
      "status",
      "reviewers",
      "failures",
    ])
    expect(contract.properties.status.enum).toEqual(["completed", "degraded", "failed"])
    expect(contract.properties.reviewers.items.required).toContain("artifactRef")
    expect(contract.properties.failures.items.required).toContain("required")
    expect(REVIEWER_OUTPUT_SCHEMA.required).toEqual(upstreamOutputSchema.required)
    expect(REVIEWER_OUTPUT_SCHEMA.properties.findings.items.required)
      .toEqual(upstreamOutputSchema.properties.findings.items.required)
  })
})
