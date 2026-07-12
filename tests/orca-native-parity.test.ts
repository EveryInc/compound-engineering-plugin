import { afterEach, describe, expect, test } from "bun:test"
import { promises as fs } from "node:fs"
import os from "node:os"
import path from "node:path"
import {
  PACKET_SCHEMA as DOC_PACKET_SCHEMA,
  REVIEWER_OUTPUT_SCHEMA,
  REVIEWER_REQUIREMENTS,
  REVIEWER_ROLES,
  RESULT_SCHEMA as DOC_RESULT_SCHEMA,
  WORKFLOW_ID as DOC_WORKFLOW_ID,
  executeDocReview,
} from "../integrations/orca/workflows/doc-review.mjs"
import {
  buildRoleRegistry,
  firstWaveWorkflowIds,
} from "../integrations/orca/role-registry.mjs"
import { loadUpstreamBaseline } from "../integrations/orca/upstream-parity.mjs"
import * as codeReviewWorkflow from "../integrations/orca/workflows/code-review.mjs"
import * as compoundWorkflow from "../integrations/orca/workflows/compound.mjs"
import * as debugWorkflow from "../integrations/orca/workflows/debug.mjs"
import * as lfgWorkflow from "../integrations/orca/workflows/lfg.mjs"
import * as planWorkflow from "../integrations/orca/workflows/plan.mjs"
import * as simplifyWorkflow from "../integrations/orca/workflows/simplify-review.mjs"
import * as workWorkflow from "../integrations/orca/workflows/work.mjs"

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

type HookSeam = {
  id: string
  before: string
  after: string
}

type JsonRecord = Record<string, unknown>

type ParityCase = {
  workflowId: string
  controller: "ce-controller" | "lfg-controller"
  upstreamAnchor: string
  hooks: HookSeam[]
  reference: string
  controllerAnchors: string[]
  contract: string
  resultSchema: string
  workflowField: "workflowId" | "workflow_id"
  status: string
  artifactCollection: "nodes" | "reviewers" | null
  artifactCount: number
  ownership: Record<string, string> | null
  gate: "read" | "work" | "lfg"
  run: (runDir: string) => Promise<JsonRecord>
}

const READ_OWNERSHIP = {
  selection: "ce-controller",
  dispatch: "orca",
  synthesis: "ce-controller",
}

function makeReadParityCase(input: {
  adapter: ReadAdapter
  upstreamAnchor: string
  hooks: HookSeam[]
  reference: string
  controllerAnchors: string[]
  nodes: ReadNode[]
}): ParityCase {
  const { adapter, nodes, ...anchors } = input
  return {
    ...anchors,
    workflowId: adapter.WORKFLOW_ID,
    controller: "ce-controller",
    contract: "integrations/orca/contracts/read-result.schema.json",
    resultSchema: adapter.RESULT_SCHEMA,
    workflowField: "workflowId",
    status: "completed",
    artifactCollection: "nodes",
    artifactCount: nodes.length,
    ownership: READ_OWNERSHIP,
    gate: "read",
    run: (runDir) => runReadAdapter(adapter, nodes, runDir),
  }
}

const PARITY_CASES: ParityCase[] = [
  makeReadParityCase({
    adapter: planWorkflow,
    upstreamAnchor: "All specialist research and deepening prompts used in this phase are skill-local prompt assets",
    hooks: [{
      id: "ce-plan.read-analysis",
      before: "All specialist research and deepening prompts used in this phase are skill-local prompt assets",
      after: "Model tiering lives in this caller, not in prompt assets.",
    }],
    reference: "skills/ce-plan/references/orca-read-analysis.md",
    controllerAnchors: [
      "Keep scope classification, cache lookup, research intent, conditional-role selection",
      "synthesis, document review, and every project write in the CE controller.",
    ],
    nodes: [{
      id: "repo-research",
      stage: "local-research",
      role: "repo-research-analyst",
      required: true,
      wave: 0,
    }],
  }),
  {
    workflowId: "ce-work",
    controller: "ce-controller",
    upstreamAnchor: "**Dispatch** uses your harness's subagent/worker mechanism.",
    hooks: [{
      id: "ce-work-engine",
      before: "4. **Choose Execution Engine, then Strategy**",
      after: "For an implementation-ready unified code plan, first pick the **engine**",
    }],
    reference: "skills/ce-work/references/orca-execution.md",
    controllerAnchors: [
      "The `ce-work` controller parses the plan, builds dependency layers, chooses batches",
      "The Orca engine never owns the standalone tail.",
    ],
    contract: "integrations/orca/contracts/work-result.schema.json",
    resultSchema: workWorkflow.RESULT_SCHEMA,
    workflowField: "workflow_id",
    status: "complete",
    artifactCollection: null,
    artifactCount: 0,
    ownership: {
      implementation: "orca",
      integration: "ce-controller",
      verification: "ce-controller",
      shipping: "caller",
    },
    gate: "work",
    run: runWorkAdapter,
  },
  makeReadParityCase({
    adapter: simplifyWorkflow,
    upstreamAnchor: "Dispatch three generic subagents",
    hooks: [{
      id: "ce-simplify-code.reviewer-analysis",
      before: "## Step 2: Launch 3 review agents in parallel",
      after: "Dispatch three generic subagents",
    }],
    reference: "skills/ce-simplify-code/references/orca-review-dispatch.md",
    controllerAnchors: [
      "The CE controller selects the unchanged diff/file scope",
      "The CE controller alone applies and verifies changes.",
    ],
    nodes: [
      { id: "reuse", stage: "reviewer-analysis", role: "code-reuse-reviewer", required: true, wave: 0 },
      { id: "quality", stage: "reviewer-analysis", role: "code-quality-reviewer", required: true, wave: 0 },
      { id: "efficiency", stage: "reviewer-analysis", role: "efficiency-reviewer", required: true, wave: 0 },
    ],
  }),
  makeReadParityCase({
    adapter: codeReviewWorkflow,
    upstreamAnchor: "### Stage 4: Spawn sub-agents",
    hooks: [
      {
        id: "ce-code-review.project-profile",
        before: "Only resolve the cache when the working tree is the reviewed tree",
        after: "On `HIT`, load the profile JSON as the agnostic project orientation.",
      },
      {
        id: "ce-code-review.persona-dispatch",
        before: "#### Spawning",
        after: "Omit the `mode` parameter when dispatching sub-agents",
      },
      {
        id: "ce-code-review.finding-validation",
        before: "Independent verification gate.",
        after: "**When this stage runs:** After Stage 5 whenever at least one finding survives",
      },
    ],
    reference: "skills/ce-code-review/references/orca-review-dispatch.md",
    controllerAnchors: [
      "Keep scope resolution, intent discovery, cache gating, persona selection",
      "fixes, synthesis, and all writes in the CE controller.",
    ],
    nodes: [{
      id: "correctness",
      stage: "persona-review",
      role: "correctness-reviewer",
      required: true,
      wave: 0,
    }],
  }),
  makeReadParityCase({
    adapter: debugWorkflow,
    upstreamAnchor: "**Parallel investigation option:**",
    hooks: [{
      id: "ce-debug.hypothesis-investigation",
      before: "| Fix works but prediction was wrong | Symptom fix, not root cause |",
      after: "**Parallel investigation option:**",
    }],
    reference: "skills/ce-debug/references/orca-investigation.md",
    controllerAnchors: [
      "The CE controller owns reproduction, hypothesis ranking, root-cause judgment",
      "every fix, verification, and git workflow.",
    ],
    nodes: [{
      id: "hypothesis-a",
      stage: "hypothesis-investigation",
      role: "hypothesis-probe",
      required: false,
      wave: 0,
    }],
  }),
  {
    workflowId: DOC_WORKFLOW_ID,
    controller: "ce-controller",
    upstreamAnchor: "## Phase 2: Announce and Dispatch Personas",
    hooks: [{
      id: "ce-doc-review.persona-dispatch",
      before: "### Dispatch",
      after: NATIVE_DISPATCH,
    }],
    reference: "skills/ce-doc-review/references/orca-dispatch.md",
    controllerAnchors: [
      "Keep document classification, persona selection, prompt construction",
      "synthesis, `safe_auto` edits, interactive questions, and final presentation",
    ],
    contract: "integrations/orca/contracts/doc-review-result.schema.json",
    resultSchema: DOC_RESULT_SCHEMA,
    workflowField: "workflowId",
    status: "completed",
    artifactCollection: "reviewers",
    artifactCount: 1,
    ownership: null,
    gate: "read",
    run: runDocReviewAdapter,
  },
  makeReadParityCase({
    adapter: compoundWorkflow,
    upstreamAnchor: "Launch research subagents.",
    hooks: [
      {
        id: "ce-compound.research-dispatch",
        before: "Launch research subagents.",
        after: "**Run ID and run dir (before dispatching any subagent):**",
      },
      {
        id: "ce-compound.grounding-validation",
        before: "2. **Semantic grounding validator (Full and headless; lightweight skips it).**",
        after: "### Phase 2.5: Selective Refresh Check",
      },
    ],
    reference: "skills/ce-compound/references/orca-read-analysis.md",
    controllerAnchors: [
      "Keep mode selection, cache/probe logic, session discovery and relevance gate",
      "every `docs/` or `CONCEPTS.md` write, and final output in the CE controller.",
    ],
    nodes: [
      { id: "context", stage: "research", role: "context-analyzer", required: true, wave: 0 },
      { id: "solution", stage: "research", role: "solution-extractor", required: true, wave: 0 },
      { id: "related", stage: "research", role: "related-docs-finder", required: true, wave: 0 },
    ],
  }),
  {
    workflowId: "lfg",
    controller: "lfg-controller",
    upstreamAnchor: "Invoke the `ce-work` skill with `mode:return-to-caller",
    hooks: [{
      id: "lfg-controller",
      before: "When invoking any skill referenced below, resolve its name against the available-skills list",
      after: "1. Invoke the `ce-plan` skill with `$ARGUMENTS`.",
    }],
    reference: "skills/lfg/references/orca-lfg.md",
    controllerAnchors: [
      "LFG remains the single lifecycle and shipping controller.",
      "The LFG controller remains the only fix owner.",
    ],
    contract: "integrations/orca/contracts/lfg-result.schema.json",
    resultSchema: lfgWorkflow.RESULT_SCHEMA,
    workflowField: "workflow_id",
    status: "ready-to-ship",
    artifactCollection: null,
    artifactCount: 0,
    ownership: {
      lifecycle: "lfg-controller",
      child_dispatch: "configured-per-stage",
      fixes: "lfg-controller",
      commit: "lfg-controller",
      push: "lfg-controller",
      pull_request: "lfg-controller",
      ci_repair: "lfg-controller",
    },
    gate: "lfg",
    run: runLfgAdapter,
  },
]

type ReadNode = {
  id: string
  stage: string
  role: string
  required: boolean
  wave: number
}

type ReadAdapter = {
  PACKET_SCHEMA: string
  RESULT_SCHEMA: string
  WORKFLOW_ID: string
  executeReadWorkflow: (input: {
    engine: ReturnType<typeof makeReadEngine>
    packet: {
      schema: string
      workflowId: string
      nodes: Array<ReadNode & { prompt: string }>
    }
    runDir: string
  }) => Promise<JsonRecord>
}

function makeReadEngine() {
  return {
    phase() {},
    async agent(_prompt: string, options: { label: string }) {
      return `deterministic output for ${options.label}`
    },
    async parallel(thunks: Array<() => Promise<unknown>>) {
      return Promise.all(thunks.map((thunk) => thunk()))
    },
  }
}

async function runReadAdapter(adapter: ReadAdapter, nodes: ReadNode[], runDir: string) {
  return adapter.executeReadWorkflow({
    engine: makeReadEngine(),
    packet: {
      schema: adapter.PACKET_SCHEMA,
      workflowId: adapter.WORKFLOW_ID,
      nodes: nodes.map((node) => ({
        ...node,
        prompt: `Deterministic fixture for ${node.stage}/${node.role}`,
      })),
    },
    runDir,
  })
}

async function runDocReviewAdapter(runDir: string) {
  const role = "coherence-reviewer"
  return executeDocReview({
    engine: {
      phase() {},
      async agent() {
        return fixtureOutput(role)
      },
      async parallel(thunks: Array<() => Promise<unknown>>) {
        return Promise.all(thunks.map((thunk) => thunk()))
      },
    },
    packet: {
      schema: DOC_PACKET_SCHEMA,
      workflowId: DOC_WORKFLOW_ID,
      nodes: [{
        stage: "persona-review",
        role,
        prompt: `Deterministic fixture for ${role}`,
        required: true,
      }],
    },
    runDir,
  })
}

async function runWorkAdapter(runDir: string) {
  return workWorkflow.executeWorkBatch({
    schema: workWorkflow.PACKET_SCHEMA,
    workflowId: "ce-work",
    nodes: [{
      id: "U1",
      stage: "implementation",
      role: "implementation-unit-worker",
      prompt: "Implement the deterministic U1 fixture.",
      predictedFiles: ["src/u1.ts"],
    }],
  }, {
    phase() {},
    async agentWithChanges() {
      return {
        value: {
          status: "complete",
          unit_id: "U1",
          changed_files: ["untrusted/self-report.ts"],
          verification_evidence: { command: "bun test U1", result: "pass" },
          behavior_change: true,
          blockers: [],
        },
        change: { id: "change-U1" },
      }
    },
    async integrateChange() {
      return {
        schema: "orca.change-integration/v1",
        files: ["src/u1.ts"],
      }
    },
  }, runDir)
}

const successfulLfgPacket = () => ({
  schema: lfgWorkflow.PACKET_SCHEMA,
  workflowId: "lfg",
  hasRemote: true,
  browserRequired: false,
  stages: [
    { id: "plan", status: "complete", runtime: "native", owner: "lfg-controller", artifactRef: "plan.json" },
    {
      id: "work",
      status: "complete",
      runtime: "orca",
      owner: "lfg-controller",
      artifactRef: "work.json",
      returnToCaller: true,
      standaloneShippingSkipped: true,
    },
    { id: "simplify", status: "complete", runtime: "orca", owner: "lfg-controller", artifactRef: "simplify.json" },
    {
      id: "review",
      status: "complete",
      runtime: "orca",
      owner: "lfg-controller",
      artifactRef: "review.json",
      mode: "agent",
    },
    { id: "fixes", status: "complete", runtime: "native", owner: "lfg-controller", artifactRef: "fixes.json" },
  ],
})

async function runLfgAdapter(runDir: string) {
  return lfgWorkflow.executeLfgGate(successfulLfgPacket(), { phase() {} }, runDir)
}

const normalizeWhitespace = (value: string) => value.replace(/\s+/g, " ").trim()

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

describe("first-wave native and Orca parity matrix", () => {
  test("enumerates every bounded hook and preserves its native upstream order", async () => {
    const upstream = await loadUpstreamBaseline(REPO_ROOT)
    expect(PARITY_CASES.map(({ workflowId }) => workflowId).sort())
      .toEqual(firstWaveWorkflowIds())

    for (const parity of PARITY_CASES) {
      const skill = await fs.readFile(
        path.join(REPO_ROOT, "skills", parity.workflowId, "SKILL.md"),
        "utf8",
      )
      expect(
        upstream.hookAnchors.some((anchor) =>
          anchor.file === `skills/${parity.workflowId}/SKILL.md`
          && anchor.contains === parity.upstreamAnchor),
        `${parity.workflowId}: recorded upstream seam`,
      ).toBe(true)
      expect(skill, `${parity.workflowId}: recorded upstream anchor`).toContain(parity.upstreamAnchor)
      expect(skill.match(/<!-- ce-orca-hook:start /g) ?? [], `${parity.workflowId}: complete hook table`)
        .toHaveLength(parity.hooks.length)

      for (const hook of parity.hooks) {
        const startMarker = `<!-- ce-orca-hook:start ${hook.id} -->`
        const endMarker = `<!-- ce-orca-hook:end ${hook.id} -->`
        expect(skill.split(startMarker), `${hook.id}: one start marker`).toHaveLength(2)
        expect(skill.split(endMarker), `${hook.id}: one end marker`).toHaveLength(2)

        const start = skill.indexOf(startMarker)
        const end = skill.indexOf(endMarker)
        const before = skill.lastIndexOf(hook.before, start)
        const after = skill.indexOf(hook.after, end + endMarker.length)
        expect(before, `${hook.id}: upstream anchor before hook`).toBeGreaterThanOrEqual(0)
        expect(before, `${hook.id}: upstream anchor order`).toBeLessThan(start)
        expect(start, `${hook.id}: bounded hook order`).toBeLessThan(end)
        expect(after, `${hook.id}: native continuation after hook`).toBeGreaterThan(end)
        expect(normalizeWhitespace(skill.slice(start, end)), `${hook.id}: Orca-only hook body`)
          .toContain("Orca")
      }
    }
  })

  test("keeps synthesis, integration, and shipping ownership in the CE controller", async () => {
    const registry = await buildRoleRegistry(REPO_ROOT)

    for (const parity of PARITY_CASES) {
      const reference = normalizeWhitespace(await fs.readFile(
        path.join(REPO_ROOT, parity.reference),
        "utf8",
      ))
      for (const anchor of parity.controllerAnchors) {
        expect(reference, `${parity.workflowId}: ${anchor}`).toContain(normalizeWhitespace(anchor))
      }
      expect(registry.workflows[parity.workflowId]).toMatchObject({
        mode: "mixed",
        controller: parity.controller,
      })
    }

    expect(registry.workflows["ce-work"].stages.implementation.defaultOwner).toBe("orca")
    expect(registry.workflows.lfg.stages["shipping-tail"]).toMatchObject({
      defaultOwner: "native",
      resultMode: "controller",
      mutation: "shipping-tail",
    })
  })

  test("writes each durable adapter contract and enforces its deterministic gate", async () => {
    for (const parity of PARITY_CASES) {
      const runDir = await makeRunDir()
      const result = await parity.run(runDir)
      const contract = JSON.parse(await fs.readFile(
        path.join(REPO_ROOT, parity.contract),
        "utf8",
      ))
      const persisted = JSON.parse(await fs.readFile(
        path.join(runDir, "ce-result.json"),
        "utf8",
      ))

      expect(persisted, `${parity.workflowId}: durable ce-result`).toEqual(result)
      expect(result.schema, `${parity.workflowId}: result schema`).toBe(parity.resultSchema)
      expect(result[parity.workflowField], `${parity.workflowId}: workflow identity`)
        .toBe(parity.workflowId)
      expect(result.status, `${parity.workflowId}: success gate`).toBe(parity.status)
      for (const field of contract.required as string[]) {
        expect(Object.hasOwn(result, field), `${parity.workflowId}: contract field ${field}`).toBe(true)
      }
      expect(contract.properties.schema.const, `${parity.workflowId}: contract schema const`)
        .toBe(parity.resultSchema)
      const workflowContract = contract.properties[parity.workflowField]
      if (workflowContract.const) {
        expect(workflowContract.const, `${parity.workflowId}: contract workflow const`)
          .toBe(parity.workflowId)
      } else {
        expect(workflowContract.enum, `${parity.workflowId}: contract workflow enum`)
          .toContain(parity.workflowId)
      }
      if (parity.ownership) {
        expect(result.ownership, `${parity.workflowId}: controller ownership`).toEqual(parity.ownership)
      }

      const collection = parity.artifactCollection
        ? result[parity.artifactCollection]
        : []
      expect(Array.isArray(collection), `${parity.workflowId}: artifact collection`).toBe(true)
      expect(collection as unknown[], `${parity.workflowId}: artifact count`)
        .toHaveLength(parity.artifactCount)
      for (const record of collection as Array<{ artifactRef: string; status: string }>) {
        expect(record.status, `${parity.workflowId}: completed child gate`).toBe("completed")
        const artifact = JSON.parse(await fs.readFile(
          path.join(runDir, record.artifactRef),
          "utf8",
        ))
        expect(artifact.status, `${parity.workflowId}: durable child artifact`).toBe("completed")
      }

      if (parity.gate === "read") {
        expect(result.failures).toEqual([])
      } else if (parity.gate === "work") {
        const units = result.units as Array<{
          changed_files: string[]
          integration: { files: string[] }
        }>
        expect(units[0].changed_files).toEqual(["src/u1.ts"])
        expect(units[0].integration.files).toEqual(["src/u1.ts"])
      } else {
        expect(result.shipping_allowed).toBe(true)
        expect(result.tail_mode).toBe("remote")
        expect((result.stage_trace as Array<{ id: string }>).map(({ id }) => id))
          .toEqual(["plan", "work", "simplify", "review", "fixes"])
      }
    }

    const blockedDir = await makeRunDir()
    const blockedPacket = successfulLfgPacket()
    blockedPacket.stages[3].status = "failed"
    blockedPacket.stages[4].status = "skipped"
    await expect(lfgWorkflow.executeLfgGate(blockedPacket, { phase() {} }, blockedDir))
      .rejects.toThrow("shipping tail is forbidden")
    expect(JSON.parse(await fs.readFile(path.join(blockedDir, "ce-result.json"), "utf8")))
      .toMatchObject({
        status: "failed",
        shipping_allowed: false,
        ownership: {
          lifecycle: "lfg-controller",
          commit: "lfg-controller",
          pull_request: "lfg-controller",
          ci_repair: "lfg-controller",
        },
      })
  })
})

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
