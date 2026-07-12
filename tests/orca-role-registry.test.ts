import { afterAll, describe, expect, test } from "bun:test"
import { promises as fs } from "node:fs"
import os from "node:os"
import path from "node:path"
import { buildRoleRegistry, firstWaveWorkflowIds } from "../integrations/orca/role-registry.mjs"
import { generateSkillBundles } from "../integrations/orca/generate-skill-bundles.mjs"

const ROOT = path.resolve(import.meta.dir, "..")
const tempRoots: string[] = []

afterAll(async () => {
  await Promise.all(tempRoots.map((root) => fs.rm(root, { recursive: true, force: true })))
})

async function readJson(relative: string) {
  return JSON.parse(await fs.readFile(path.join(ROOT, relative), "utf8"))
}

function promptAssetDecisions(registry: any, baseline: any, workflowId: string) {
  const workflow = registry.workflows[workflowId]
  const promptRoot = baseline.promptAssetSources[workflowId]
  const registered = new Set<string>()
  for (const stage of Object.values<any>(workflow.stages)) {
    for (const role of Object.values<any>(stage.roles || {})) {
      if (role.sourceKind === "prompt-asset" && role.sourcePath.startsWith(`${promptRoot}/`)) {
        registered.add(path.basename(role.sourcePath, ".md"))
      }
    }
  }
  return new Set([...registered, ...Object.keys(workflow.excludedPromptAssets || {})])
}

describe("CE-Orca role registry", () => {
  test("exposes only the eight first-wave CE workflows with anchored installed sources", async () => {
    const registry = await buildRoleRegistry(ROOT)
    expect(registry.schema).toBe("ce-orca.role-registry/v1")
    expect(Object.keys(registry.workflows).sort()).toEqual(firstWaveWorkflowIds())
    expect(registry.identities).toEqual({
      ceVersion: "3.19.0",
      integrationVersion: "3.19.0-orca.1",
      registryVersion: "ce-orca.registry/v1@3.19.0-orca.1",
      protocolVersion: "orca.local-protocol/v1",
      requestVersion: "orca.execution-config/v1",
    })

    for (const [workflowId, workflow] of Object.entries<any>(registry.workflows)) {
      expect(Object.keys(workflow.stages).length, workflowId).toBeGreaterThan(0)
      for (const [stageId, stage] of Object.entries<any>(workflow.stages)) {
        expect(["native", "orca"], `${workflowId}.${stageId}`).toContain(stage.defaultOwner)
        if (stage.defaultOwner === "native") {
          expect(["unconfigurable", "child-workflow"], `${workflowId}.${stageId}`).toContain(stage.nativeTargetHandling)
        } else {
          expect(stage.nativeTargetHandling, `${workflowId}.${stageId}`).toBeUndefined()
        }
        expect(stage.sourcePath.startsWith(`skills/${workflowId}/`)).toBe(true)
        expect((await fs.stat(path.join(ROOT, stage.sourcePath))).isFile()).toBe(true)
        for (const [roleId, role] of Object.entries<any>(stage.roles)) {
          expect(["prompt-asset", "workflow-role"], `${workflowId}.${stageId}.${roleId}`).toContain(role.sourceKind)
          expect(role.sourcePath.startsWith(`skills/${workflowId}/`)).toBe(true)
          expect((await fs.stat(path.join(ROOT, role.sourcePath))).isFile()).toBe(true)
        }
      }
    }
  })

  test("declares the mixed ownership boundary implemented by the first-wave adapters", async () => {
    const registry = await buildRoleRegistry(ROOT)
    const nativeStages: Record<string, string[]> = {
      "ce-plan": ["authoring", "deepening", "external-research", "organizational-research"],
      "ce-code-review": ["adversarial-peer", "scope-triage"],
      "ce-compound": ["specialized-review"],
      "ce-work": ["design-validation", "review-fixes"],
      lfg: ["implementation", "planning", "review", "shipping-tail", "simplification"],
    }
    for (const [workflowId, workflow] of Object.entries<any>(registry.workflows)) {
      const actual = Object.entries<any>(workflow.stages).filter(([, stage]) => stage.defaultOwner === "native").map(([stageId]) => stageId).sort()
      expect(actual, workflowId).toEqual(nativeStages[workflowId] || [])
    }
  })

  test("keeps network and MCP-dependent roles under native ownership", async () => {
    const registry = await buildRoleRegistry(ROOT)
    const planning = registry.workflows["ce-plan"].stages
    const compounding = registry.workflows["ce-compound"].stages

    expect(Object.keys(planning["local-research"].roles).sort()).toEqual([
      "agent-native-planning-strategist",
      "learnings-researcher",
      "repo-research-analyst",
    ])
    expect(planning["organizational-research"]).toMatchObject({
      defaultOwner: "native",
      roles: { "slack-researcher": { sourceKind: "prompt-asset" } },
    })
    expect(planning["external-research"].defaultOwner).toBe("native")
    expect(planning.deepening.defaultOwner).toBe("native")
    expect(compounding["specialized-review"].defaultOwner).toBe("native")
  })

  test("allows native target forwarding only for the four tested LFG child workflows", async () => {
    const registry = await buildRoleRegistry(ROOT)
    const forwarded = Object.entries<any>(registry.workflows.lfg.stages)
      .filter(([, stage]) => stage.nativeTargetHandling === "child-workflow")
      .map(([stageId]) => stageId)
      .sort()
    expect(forwarded).toEqual(["implementation", "planning", "review", "simplification"])
    expect(registry.workflows.lfg.stages["shipping-tail"].nativeTargetHandling).toBe("unconfigurable")
  })

  test("preserves upstream model-tier intent for configurable reviewer roles", async () => {
    const registry = await buildRoleRegistry(ROOT)
    const codeReviewRoles = registry.workflows["ce-code-review"].stages["persona-review"].roles
    const parentRoles = Object.entries<any>(codeReviewRoles)
      .filter(([, role]) => role.modelTier === "parent")
      .map(([roleId]) => roleId)
      .sort()
    const midRoles = Object.entries<any>(codeReviewRoles)
      .filter(([, role]) => role.modelTier === "mid")
      .map(([roleId]) => roleId)
      .sort()

    expect(parentRoles).toEqual([
      "adversarial-reviewer",
      "correctness-reviewer",
      "security-reviewer",
    ])
    expect(midRoles).toEqual([
      "agent-native-reviewer",
      "api-contract-reviewer",
      "data-migration-reviewer",
      "deployment-verification-agent",
      "julik-frontend-races-reviewer",
      "learnings-researcher",
      "maintainability-reviewer",
      "performance-reviewer",
      "previous-comments-reviewer",
      "project-standards-reviewer",
      "reliability-reviewer",
      "swift-ios-reviewer",
      "testing-reviewer",
    ])

    const simplifyRoles = registry.workflows["ce-simplify-code"].stages["reviewer-analysis"].roles
    expect(Object.values<any>(simplifyRoles).map((role) => role.modelTier)).toEqual([
      "mid",
      "mid",
      "mid",
    ])
  })

  test("requires an explicit decision for every upstream prompt asset", async () => {
    const registry = await buildRoleRegistry(ROOT)
    const baseline = await readJson("integrations/orca/upstream.json")
    for (const workflowId of Object.keys(baseline.promptAssetSources).sort()) {
      const decisions = promptAssetDecisions(registry, baseline, workflowId)
      const expected = baseline.promptAssets[workflowId].map((file: string) => path.basename(file, ".md")).sort()
      expect([...decisions].sort(), workflowId).toEqual(expected)
    }

    const simulatedUpstream = structuredClone(baseline)
    simulatedUpstream.promptAssets["ce-doc-review"].push("new-upstream-reviewer.md")
    const decisions = promptAssetDecisions(registry, simulatedUpstream, "ce-doc-review")
    const unresolved = simulatedUpstream.promptAssets["ce-doc-review"]
      .map((file: string) => path.basename(file, ".md"))
      .filter((role: string) => !decisions.has(role))
    expect(unresolved).toEqual(["new-upstream-reviewer"])
  })

  test("keeps generated skill-local bundles deterministic and self-contained", async () => {
    expect(await generateSkillBundles({ check: true })).toMatchObject({ ok: true, drift: [] })
    const canonicalRuntime = await fs.readFile(path.join(ROOT, "integrations/orca/runtime-bundle.mjs"), "utf8")
    const canonicalResultContract = await fs.readFile(path.join(ROOT, "integrations/orca/result-contract.mjs"), "utf8")
    const canonicalRouting = await fs.readFile(path.join(ROOT, "integrations/orca/references/execution-routing.md"), "utf8")
    const canonicalSchema = await fs.readFile(path.join(ROOT, "integrations/orca/execution-request.schema.json"), "utf8")

    for (const workflowId of firstWaveWorkflowIds()) {
      const skillRoot = path.join(ROOT, "skills", workflowId)
      expect(await fs.readFile(path.join(skillRoot, "scripts/orca-runtime.mjs"), "utf8")).toBe(canonicalRuntime)
      expect(await fs.readFile(path.join(skillRoot, "scripts/result-contract.mjs"), "utf8")).toBe(canonicalResultContract)
      expect(await fs.readFile(path.join(skillRoot, "references/orca-routing.md"), "utf8")).toBe(canonicalRouting)
      expect(await fs.readFile(path.join(skillRoot, "references/orca-execution-request.schema.json"), "utf8")).toBe(canonicalSchema)
      const localRegistry = await readJson(`skills/${workflowId}/references/orca-role-registry.json`)
      for (const stage of Object.values<any>(localRegistry.workflows[workflowId].stages)) {
        expect(stage.sourcePath.startsWith("skills/")).toBe(false)
        expect(stage.sourcePath.includes("..")).toBe(false)
        for (const role of Object.values<any>(stage.roles || {})) {
          expect(role.sourcePath.startsWith("skills/")).toBe(false)
          expect(role.sourcePath.includes("..")).toBe(false)
        }
      }
      const generatedFiles = await Array.fromAsync(new Bun.Glob("**/*").scan({ cwd: skillRoot, onlyFiles: true }))
      for (const relative of generatedFiles.filter((file) => file.includes("orca-"))) {
        expect(await fs.readFile(path.join(skillRoot, relative), "utf8"), `${workflowId}/${relative}`).not.toContain("integrations/orca")
      }
    }
  })

  test("survives a real standalone Codex conversion without repository-level assets", async () => {
    const temp = await fs.mkdtemp(path.join(os.tmpdir(), "ce-orca-convert-"))
    tempRoots.push(temp)
    const output = path.join(temp, "codex")
    const process = Bun.spawn([
      "bun",
      "run",
      "src/index.ts",
      "convert",
      ROOT,
      "--to",
      "codex",
      "--codex-home",
      output,
      "--include-skills",
    ], { cwd: ROOT, stdout: "pipe", stderr: "pipe", env: { ...Bun.env, HOME: path.join(temp, "home") } })
    const exit = await process.exited
    const stderr = await new Response(process.stderr).text()
    expect(exit, stderr).toBe(0)
    for (const workflowId of firstWaveWorkflowIds()) {
      const converted = path.join(output, "skills", "compound-engineering", workflowId)
      expect((await fs.stat(path.join(converted, "scripts/orca-runtime.mjs"))).isFile()).toBe(true)
      expect((await fs.stat(path.join(converted, "scripts/result-contract.mjs"))).isFile()).toBe(true)
      expect((await fs.stat(path.join(converted, "references/orca-role-registry.json"))).isFile()).toBe(true)
      expect(await fs.readFile(path.join(converted, "scripts/orca-runtime.mjs"), "utf8")).not.toContain("integrations/orca")
    }
  }, 60_000)
})
