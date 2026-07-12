import { afterEach, describe, expect, test } from "bun:test"
import { promises as fs } from "node:fs"
import os from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { buildRoleRegistry } from "../integrations/orca/role-registry.mjs"
import * as plan from "../integrations/orca/workflows/plan.mjs"
import * as codeReview from "../integrations/orca/workflows/code-review.mjs"
import * as simplify from "../integrations/orca/workflows/simplify-review.mjs"
import * as debug from "../integrations/orca/workflows/debug.mjs"
import * as compound from "../integrations/orca/workflows/compound.mjs"

const REPO_ROOT = path.resolve(import.meta.dir, "..")
const temporaryRoots: string[] = []
const adapters = [plan, codeReview, simplify, debug, compound]

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) =>
    fs.rm(root, { recursive: true, force: true })
  ))
})

async function runDir() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ce-orca-reader-"))
  temporaryRoots.push(root)
  return root
}

type Adapter = typeof plan
type NodeInput = {
  id: string
  stage: string
  role: string
  wave?: number
  prompt?: string
  required?: boolean
}

function packetFor(adapter: Adapter, nodes: NodeInput[]) {
  return {
    schema: adapter.PACKET_SCHEMA,
    workflowId: adapter.WORKFLOW_ID,
    nodes: nodes.map((node) => ({
      id: node.id,
      stage: node.stage,
      role: node.role,
      prompt: node.prompt ?? `Complete ${node.id}`,
      required: node.required ?? adapter.ROLE_POLICY[node.stage][node.role].required,
      wave: node.wave ?? 0,
    })),
  }
}

function fakeEngine(outputs: Record<string, unknown | Error>) {
  const calls: Array<{ prompt: string; options: Record<string, unknown> }> = []
  const phases: string[] = []
  return {
    calls,
    phases,
    phase(label: string) {
      phases.push(label)
    },
    async agent(prompt: string, options: Record<string, unknown>) {
      calls.push({ prompt, options })
      const output = outputs[String(options.label)]
      if (output instanceof Error) throw output
      return output ?? null
    },
    async parallel(thunks: Array<() => Promise<unknown>>) {
      return Promise.all(thunks.map((thunk) => thunk()))
    },
  }
}

describe("CE-Orca first-wave read adapters", () => {
  test("allowlists only installed workflow roles and preserves registry failure policy", async () => {
    const registry = await buildRoleRegistry(REPO_ROOT)

    for (const adapter of adapters) {
      const workflow = registry.workflows[adapter.WORKFLOW_ID]
      expect(workflow).toBeDefined()
      for (const [stageId, roles] of Object.entries(adapter.ROLE_POLICY)) {
        expect(workflow.stages[stageId]).toBeDefined()
        expect(Object.keys(roles).sort(), `${adapter.WORKFLOW_ID}.${stageId} role coverage`).toEqual(
          Object.keys(workflow.stages[stageId].roles).sort(),
        )
        for (const [roleId, policy] of Object.entries(roles)) {
          const registered = workflow.stages[stageId].roles[roleId]
          expect(registered, `${adapter.WORKFLOW_ID}.${stageId}.${roleId}`).toBeDefined()
          expect(policy.required).toBe(registered.required)
          expect(policy.repeatable).toBe(registered.activation === "repeatable")
        }
      }
    }

    expect(Object.keys(plan.ROLE_POLICY["local-research"]).sort()).toEqual([
      "agent-native-planning-strategist",
      "learnings-researcher",
      "repo-research-analyst",
    ])
    expect(plan.ROLE_POLICY["organizational-research"]).toBeUndefined()
    expect(plan.ROLE_POLICY["external-research"]).toBeUndefined()
    expect(plan.ROLE_POLICY.deepening).toBeUndefined()
    expect(plan.ROLE_POLICY.authoring).toBeUndefined()
    expect(compound.ROLE_POLICY["specialized-review"]).toBeUndefined()
    expect(codeReview.ROLE_POLICY["scope-triage"]).toBeUndefined()
    expect(codeReview.ROLE_POLICY["adversarial-peer"]).toBeUndefined()
  })

  test("rejects code-like fields, unknown roles, unsafe ids, and required-policy drift", () => {
    const valid = packetFor(plan, [{
      id: "repo-research",
      stage: "local-research",
      role: "repo-research-analyst",
    }])

    expect(() => plan.validatePacket({
      ...valid,
      nodes: [{ ...valid.nodes[0], command: "rm -rf /" }],
    })).toThrow("data-only")
    expect(() => plan.validatePacket(packetFor(plan, [{
      id: "unknown",
      stage: "local-research",
      role: "not-installed",
      required: false,
    }]))).toThrow("not installed")
    expect(() => plan.validatePacket({
      ...valid,
      nodes: [{ ...valid.nodes[0], stage: "constructor", role: "prototype", required: false }],
    })).toThrow("not an installed")
    expect(() => plan.validatePacket({
      ...valid,
      nodes: [{ ...valid.nodes[0], id: "../../escape" }],
    })).toThrow("safe unique identifier")
    expect(() => plan.validatePacket({
      ...valid,
      nodes: [{ ...valid.nodes[0], required: false }],
    })).toThrow("installed role policy")
  })

  test("runs only packet-selected local roles and respects explicit waves", async () => {
    const engine = fakeEngine({
      learnings: "learnings result",
      strategy: "strategy result",
    })
    const directory = await runDir()
    const packet = packetFor(plan, [
      { id: "learnings", stage: "local-research", role: "learnings-researcher", wave: 0 },
      { id: "strategy", stage: "local-research", role: "agent-native-planning-strategist", wave: 1 },
    ])

    const result = await plan.executeReadWorkflow({ engine, packet, runDir: directory })

    expect(engine.calls.map(({ options }) => options.role)).toEqual([
      "learnings-researcher",
      "agent-native-planning-strategist",
    ])
    expect(engine.phases).toHaveLength(2)
    expect(result.status).toBe("completed")
    expect(result.ownership).toEqual({
      selection: "ce-controller",
      dispatch: "orca",
      synthesis: "ce-controller",
    })
  })

  test("rejects native-owned network, MCP, and mixed-tool stages from Orca packets", () => {
    expect(() => plan.validatePacket(packetFor(plan, [{
      id: "slack",
      stage: "organizational-research",
      role: "slack-researcher",
      required: false,
    }]))).toThrow("not an installed ce-plan stage")

    expect(() => plan.validatePacket(packetFor(plan, [{
      id: "web",
      stage: "external-research",
      role: "web-researcher",
      required: false,
    }]))).toThrow("not an installed ce-plan stage")

    expect(() => plan.validatePacket(packetFor(plan, [{
      id: "deepen",
      stage: "deepening",
      role: "architecture-strategist",
      required: false,
    }]))).toThrow("not an installed ce-plan stage")

    expect(() => compound.validatePacket(packetFor(compound, [{
      id: "specialized",
      stage: "specialized-review",
      role: "framework-docs-researcher",
      required: false,
    }]))).toThrow("not an installed ce-compound stage")
  })

  test("persists structured artifacts and fails a required simplification lens", async () => {
    const engine = fakeEngine({
      reuse: "reuse suggestions",
      quality: new Error("worker unavailable"),
      efficiency: "efficiency suggestions",
    })
    const directory = await runDir()
    const packet = packetFor(simplify, [
      { id: "reuse", stage: "reviewer-analysis", role: "code-reuse-reviewer" },
      { id: "quality", stage: "reviewer-analysis", role: "code-quality-reviewer" },
      { id: "efficiency", stage: "reviewer-analysis", role: "efficiency-reviewer" },
    ])

    const result = await simplify.executeReadWorkflow({ engine, packet, runDir: directory })
    expect(result.status).toBe("failed")
    expect(result.failures).toEqual([{
      id: "quality",
      stage: "reviewer-analysis",
      role: "code-quality-reviewer",
      required: true,
      code: "worker_failed",
    }])
    expect(JSON.parse(await fs.readFile(path.join(directory, "ce-result.json"), "utf8"))).toEqual(result)
    expect(JSON.parse(await fs.readFile(path.join(directory, "nodes/reuse.json"), "utf8"))).toMatchObject({
      schema: "ce-orca.node-artifact/v1",
      workflowId: "ce-simplify-code",
      role: "code-reuse-reviewer",
      status: "completed",
      output: "reuse suggestions",
    })
  })

  test("supports repeatable probes and validators without manufacturing extra nodes", async () => {
    const debugPacket = packetFor(debug, [
      { id: "hypothesis-a", stage: "hypothesis-investigation", role: "hypothesis-probe" },
      { id: "hypothesis-b", stage: "hypothesis-investigation", role: "hypothesis-probe" },
    ])
    expect(debug.validatePacket(debugPacket)).toBe(debugPacket)

    const validatorPacket = packetFor(codeReview, [
      { id: "finding-1", stage: "finding-validation", role: "finding-validator" },
      { id: "finding-2", stage: "finding-validation", role: "finding-validator" },
    ])
    expect(codeReview.validatePacket(validatorPacket)).toBe(validatorPacket)

    const duplicatePersona = packetFor(codeReview, [
      { id: "correctness-a", stage: "persona-review", role: "correctness-reviewer" },
      { id: "correctness-b", stage: "persona-review", role: "correctness-reviewer" },
    ])
    expect(() => codeReview.validatePacket(duplicatePersona)).toThrow("duplicate non-repeatable role")
  })

  test("fails closed when a fixed upstream fan-out is only partially packetized", () => {
    expect(() => simplify.validatePacket(packetFor(simplify, [{
      id: "reuse",
      stage: "reviewer-analysis",
      role: "code-reuse-reviewer",
    }]))).toThrow("exactly the three installed simplification roles")

    expect(() => compound.validatePacket(packetFor(compound, [{
      id: "context",
      stage: "research",
      role: "context-analyzer",
    }]))).toThrow("exactly the three installed core research roles")
  })

  test("marks optional debug failure degraded and forbids nested delegation", async () => {
    const engine = fakeEngine({ probe: new Error("no evidence") })
    const directory = await runDir()
    const packet = packetFor(debug, [{
      id: "probe",
      stage: "hypothesis-investigation",
      role: "hypothesis-probe",
    }])
    const result = await debug.executeReadWorkflow({ engine, packet, runDir: directory })

    expect(result.status).toBe("degraded")
    const prompt = debug.makeWorkerPrompt(packet.nodes[0])
    expect(prompt).toContain("Do not invoke Agent, Task, spawn_agent, a Skill")
    expect(prompt).toContain("Do not create, edit, or delete project files")
    expect(prompt).toEndWith(packet.nodes[0].prompt)
  })

  test("keeps every workflow executable after a one-file Orca snapshot", async () => {
    const directory = await runDir()
    const names = ["plan", "code-review", "simplify-review", "debug", "compound"]

    for (const name of names) {
      const source = path.join(REPO_ROOT, "integrations/orca/workflows", `${name}.mjs`)
      const snapshot = path.join(directory, `${name}.mjs`)
      await fs.copyFile(source, snapshot)
      const module = await import(`${pathToFileURL(snapshot).href}?snapshot=${name}`)
      expect(module.PACKET_SCHEMA).toBe("ce-orca.packet/v1")
      expect(module.RESULT_SCHEMA).toBe("ce-orca.read-result/v1")
    }
  })

  test("consumes planning and compounding packets from engine memory", async () => {
    const directory = await runDir()
    const engineFile = path.join(directory, "engine.mjs")
    await fs.writeFile(engineFile, [
      "export function consumeConfidentialPacketJson() { return JSON.parse(process.env.TEST_PACKET_JSON) }",
      "export async function run(_workflowId, callback) { return callback() }",
      "export function phase() {}",
      "export async function parallel(thunks) { return Promise.all(thunks.map((thunk) => thunk())) }",
      "export async function agent() { return 'confidential result' }",
    ].join("\n"))

    for (const adapter of [plan, compound]) {
      const source = path.join(
        REPO_ROOT,
        "integrations/orca/workflows",
        adapter === plan ? "plan.mjs" : "compound.mjs",
      )
      const adapterRunDir = path.join(directory, adapter.WORKFLOW_ID)
      await fs.mkdir(adapterRunDir)
      const packet = packetFor(adapter, [{
        id: "profile",
        stage: "project-profile",
        role: "repo-profiler",
      }])
      const child = Bun.spawn(["bun", source], {
        cwd: REPO_ROOT,
        env: {
          ...Bun.env,
          ORCH_ENGINE_URL: pathToFileURL(engineFile).href,
          ORCH_RUN_DIR: adapterRunDir,
          TEST_PACKET_JSON: JSON.stringify(packet),
        },
        stdout: "pipe",
        stderr: "pipe",
      })
      const [exitCode, stderr] = await Promise.all([
        child.exited,
        new Response(child.stderr).text(),
      ])

      expect(exitCode, `${adapter.WORKFLOW_ID}: ${stderr}`).toBe(0)
      expect(JSON.parse(await fs.readFile(path.join(adapterRunDir, "ce-result.json"), "utf8")))
        .toMatchObject({ workflowId: adapter.WORKFLOW_ID, status: "completed" })
      expect(await fs.readFile(source, "utf8")).not.toContain("ORCH_PACKET_FILE")
    }
  })

  test("keeps native workflow prose behind bounded hooks", async () => {
    const checks = [
      ["ce-plan", "ce-plan.read-analysis", "All specialist research and deepening prompts used in this phase are skill-local prompt assets"],
      ["ce-code-review", "ce-code-review.persona-dispatch", "### Stage 4: Spawn sub-agents"],
      ["ce-simplify-code", "ce-simplify-code.reviewer-analysis", "Dispatch three generic subagents"],
      ["ce-debug", "ce-debug.hypothesis-investigation", "**Parallel investigation option:**"],
      ["ce-compound", "ce-compound.research-dispatch", "Launch research subagents."],
    ]

    for (const [skillName, hook, nativeText] of checks) {
      const skill = await fs.readFile(path.join(REPO_ROOT, "skills", skillName, "SKILL.md"), "utf8")
      expect(skill).toContain(`<!-- ce-orca-hook:start ${hook} -->`)
      expect(skill).toContain(`<!-- ce-orca-hook:end ${hook} -->`)
      expect(skill).toContain(nativeText)
      expect(skill).toContain("references/orca-routing.md")
    }
  })

  test("publishes one result contract for every first-wave adapter", async () => {
    const contract = JSON.parse(await fs.readFile(
      path.join(REPO_ROOT, "integrations/orca/contracts/read-result.schema.json"),
      "utf8",
    ))
    expect(contract.properties.schema.const).toBe("ce-orca.read-result/v1")
    expect(contract.properties.workflowId.enum.sort()).toEqual(
      adapters.map(({ WORKFLOW_ID }) => WORKFLOW_ID).sort(),
    )
  })
})
