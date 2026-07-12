import { afterAll, describe, expect, test } from "bun:test"
import { promises as fs } from "node:fs"
import os from "node:os"
import path from "node:path"
import { firstWaveWorkflowIds } from "../integrations/orca/role-registry.mjs"

const ROOT = path.resolve(import.meta.dir, "..")
const tempRoots: string[] = []
const TARGET_FIELDS = [
  "backend",
  "model",
  "reasoning",
  "effort",
  "budget",
  "concurrency",
  "isolation",
] as const

afterAll(async () => {
  await Promise.all(tempRoots.splice(0).map((root) =>
    fs.rm(root, { recursive: true, force: true })
  ))
})

async function spawnChecked(command: string[], options: {
  cwd: string
  env: Record<string, string | undefined>
}) {
  const process = Bun.spawn(command, {
    ...options,
    stdout: "pipe",
    stderr: "pipe",
  })
  const [exitCode, stdout, stderr] = await Promise.all([
    process.exited,
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
  ])
  expect(exitCode, stderr).toBe(0)
  return { stdout, stderr }
}

async function spawnJson(command: string[], options: {
  cwd: string
  env: Record<string, string | undefined>
}) {
  const result = await spawnChecked(command, options)
  return { value: JSON.parse(result.stdout), stderr: result.stderr }
}

function expectCompleteTarget(target: Record<string, unknown>, at: string) {
  for (const field of TARGET_FIELDS) {
    expect(Object.hasOwn(target, field), `${at}.${field}`).toBe(true)
  }
}

describe("standalone CE-Orca installation without Orca", () => {
  test("converts and runs every first-wave Codex skill through native fallback", async () => {
    const temp = await fs.mkdtemp(path.join(os.tmpdir(), "ce-orca-install-e2e-"))
    tempRoots.push(temp)
    const codexHome = path.join(temp, "codex")
    const runtimeHome = path.join(temp, "runtime-home")
    const project = path.join(temp, "project")
    const resolutions = path.join(temp, "resolutions")
    await Promise.all([
      fs.mkdir(runtimeHome, { recursive: true }),
      fs.mkdir(project, { recursive: true }),
      fs.mkdir(resolutions, { recursive: true }),
    ])

    await spawnChecked([
      "bun",
      "run",
      "src/index.ts",
      "convert",
      ROOT,
      "--to",
      "codex",
      "--codex-home",
      codexHome,
      "--include-skills",
    ], {
      cwd: ROOT,
      env: { ...Bun.env, HOME: path.join(temp, "conversion-home") },
    })

    const missingOrca = path.join(temp, "missing", "orca-orch")
    const env = {
      ...Bun.env,
      HOME: runtimeHome,
      CE_ORCA_COMMAND: missingOrca,
    }

    for (const workflowId of firstWaveWorkflowIds()) {
      const skillRoot = path.join(
        codexHome,
        "skills",
        "compound-engineering",
        workflowId,
      )
      const runtime = path.join(skillRoot, "scripts", "orca-runtime.mjs")
      const resultContract = path.join(skillRoot, "scripts", "result-contract.mjs")
      const resolvedPath = path.join(resolutions, `${workflowId}.json`)
      const [runtimeSource, resultContractSource] = await Promise.all([
        fs.readFile(runtime, "utf8"),
        fs.readFile(resultContract, "utf8"),
      ])
      expect(runtimeSource, workflowId).not.toContain("integrations/orca")
      expect(resultContractSource, workflowId).not.toContain("integrations/orca")

      const resolved = (await spawnJson([
        "node",
        runtime,
        "resolve",
        "--workflow",
        workflowId,
        "--out",
        resolvedPath,
      ], { cwd: project, env })).value

      expect(resolved, workflowId).toMatchObject({
        schema: "ce-orca.resolved-execution/v1",
        workflowId,
        confirmationRequired: false,
        runtime: {
          requested: "auto",
          selected: "native",
          state: "absent",
          fallback: true,
        },
        targetApplication: {
          defaults: { appliedBy: "native-unconfigurable" },
        },
      })
      expect(JSON.stringify(resolved), workflowId).not.toContain(ROOT)
      expectCompleteTarget(resolved.executionConfig.defaults, `${workflowId}.defaults`)

      const stages = resolved.executionConfig.stages as Record<string, Record<string, unknown>>
      expect(Object.keys(stages).length, workflowId).toBeGreaterThan(0)
      for (const [stageId, stage] of Object.entries(stages)) {
        expectCompleteTarget(stage, `${workflowId}.${stageId}`)
        expect(resolved.targetApplication.stages[stageId]).toEqual({
          appliedBy: "native-unconfigurable",
        })
        for (const [roleId, role] of Object.entries(
          (stage.roles ?? {}) as Record<string, Record<string, unknown>>,
        )) {
          expectCompleteTarget(role, `${workflowId}.${stageId}.${roleId}`)
        }
      }

      expect(JSON.parse(await fs.readFile(resolvedPath, "utf8"))).toEqual(resolved)
      const dispatch = await spawnJson([
        "node",
        runtime,
        "run",
        "--resolved",
        resolvedPath,
      ], { cwd: project, env })
      expect(dispatch.value, workflowId).toMatchObject({
        schema: "ce-orca.dispatch/v1",
        action: "native",
      })
      expect(dispatch.stderr, workflowId).toContain("Effective CE-Orca configuration:")
    }

    const symlinkWorkflowId = "ce-plan"
    const symlinkTarget = path.join(
      codexHome,
      "skills",
      "compound-engineering",
      symlinkWorkflowId,
      "scripts",
      "orca-runtime.mjs",
    )
    const symlinkedRuntime = path.join(temp, "symlinked-orca-runtime.mjs")
    const symlinkResolvedPath = path.join(resolutions, `${symlinkWorkflowId}-symlink.json`)
    await fs.symlink(symlinkTarget, symlinkedRuntime)
    expect(path.resolve(symlinkedRuntime)).not.toBe(await fs.realpath(symlinkedRuntime))

    const symlinkResolved = (await spawnJson([
      "node",
      symlinkedRuntime,
      "resolve",
      "--workflow",
      symlinkWorkflowId,
      "--out",
      symlinkResolvedPath,
    ], { cwd: project, env })).value
    expect(symlinkResolved).toMatchObject({
      workflowId: symlinkWorkflowId,
      runtime: {
        selected: "native",
        state: "absent",
        fallback: true,
      },
    })

    expect(await fs.readdir(project)).toEqual([])
    await expect(fs.stat(path.join(project, "runs"))).rejects.toMatchObject({ code: "ENOENT" })
    await expect(fs.stat(path.join(runtimeHome, ".config", "compound-engineering-orca")))
      .rejects.toMatchObject({ code: "ENOENT" })
  }, 120_000)
})
