import { afterEach, describe, expect, test } from "bun:test"
import { constants as fsConstants, promises as fs } from "node:fs"
import os from "node:os"
import path from "node:path"
import {
  canonicalJson,
  controllerExecutionPatch,
  persistProfileAtomic,
  resolveExecutionRequest,
  selectProfile,
  selectProjectConfig,
} from "../integrations/orca/resolve-config.mjs"
import { deriveLfgChildExecutionPatches } from "../integrations/orca/workflows/lfg.mjs"

const ROOT = path.resolve(import.meta.dir, "..")
const scratch: string[] = []
const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds))
const PROFILE_LOCK_SCHEMA = "ce-orca.profile-lock/v1"

afterEach(async () => {
  await Promise.all(scratch.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })))
})

async function data(workflowId: string, mode = "mixed") {
  const registry = JSON.parse(await fs.readFile(path.join(ROOT, `skills/${workflowId}/references/orca-role-registry.json`), "utf8"))
  registry.workflows[workflowId].mode = mode
  const builtins = JSON.parse(await fs.readFile(path.join(ROOT, `skills/${workflowId}/references/orca-defaults.json`), "utf8"))
  return { registry, builtins }
}

async function profileLockOwnerFixture(lockPath: string, token: string, pid: number, live = false) {
  if (typeof process.getuid !== "function") throw new Error("profile lock fixtures require Unix")
  const fifoDirectory = path.dirname(path.resolve(lockPath))
  const fifoPath = `${path.resolve(lockPath)}.${token}.fifo`
  await fs.mkdir(fifoDirectory, { recursive: true, mode: 0o700 })
  await fs.rm(fifoPath, { force: true })
  const child = Bun.spawn(["/usr/bin/mkfifo", fifoPath], {
    stdout: "pipe",
    stderr: "pipe",
  })
  const [exitCode, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()])
  if (exitCode !== 0) throw new Error(`fixture could not create liveness FIFO: ${stderr}`)
  await fs.chmod(fifoPath, 0o600)
  scratch.push(fifoPath)
  const handle = live ? await fs.open(fifoPath, fsConstants.O_RDWR | fsConstants.O_NONBLOCK) : null
  return {
    owner: {
      schema: PROFILE_LOCK_SCHEMA,
      token,
      pid,
      createdAt: new Date().toISOString(),
      liveness: { protocol: "fifo-writer-v1", path: fifoPath },
    },
    fifoPath,
    handle,
  }
}

async function expectFifoWithoutWriter(fifoPath: string) {
  expect((await fs.lstat(fifoPath)).isFIFO()).toBe(true)
  const handle = await fs.open(fifoPath, fsConstants.O_RDONLY | fsConstants.O_NONBLOCK)
  try {
    expect((await handle.read(Buffer.alloc(1), 0, 1, null)).bytesRead).toBe(0)
  } finally {
    await handle.close()
  }
}

const healthyProbe = {
  schema: "orca.capabilities/v1",
  state: "healthy",
  protocol: { version: "orca.local-protocol/v1", compatible: true },
  capabilities: {
    lifecycle: { wait: true },
    results: { artifactRead: { supported: true, maxBytes: 8_388_608 } },
    transport: { confidentialPacket: { supported: true, maxBytes: 8_388_608, delivery: "in-memory-consume-v1", sourceConsumption: "explicit-one-shot-v1" } },
    targets: {
      claude: { available: true, models: ["opus", "sonnet"], reasoning: ["low", "medium", "high"], reasoningByModel: { opus: ["medium", "high"], sonnet: ["low", "medium", "high"] }, mutation: { read: { supported: true, policy: "orca.read-policy/v1", issues: [] }, writer: { supported: true, policy: "orca.writer-policy/v1", issues: [] } } },
      codex: { available: true, models: ["gpt-5.4", "gpt-5.4-mini", "gpt-5.6-sol"], reasoning: ["low", "medium", "high", "xhigh"], reasoningByModel: { "gpt-5.4": ["low", "medium", "high"], "gpt-5.4-mini": ["low", "medium", "high"], "gpt-5.6-sol": ["high", "xhigh"] }, mutation: { read: { supported: true, policy: "orca.read-policy/v1", issues: [] }, writer: { supported: true, policy: "orca.writer-policy/v1", issues: [] } } },
      cursor: { available: true, models: ["composer-2.5"], reasoning: ["none"], reasoningByModel: { "composer-2.5": ["none"] }, mutation: { read: { supported: true, policy: "orca.read-policy/v1", issues: [] }, writer: { supported: false, policy: "orca.writer-policy/v1", issues: ["not attested"] } } },
    },
  },
  issues: [],
}

describe("CE-Orca canonical configuration resolution", () => {
  test("does not reinterpret ordinary product prose as an execution override", async () => {
    const { registry, builtins } = await data("ce-doc-review")
    const prose = "Refactor the domain model so the model object keeps its invariants."
    expect(controllerExecutionPatch(prose)).toEqual({})
    const resolved = resolveExecutionRequest({ workflowId: "ce-doc-review", registry, builtins, prompt: controllerExecutionPatch(prose), probe: healthyProbe })
    expect(resolved.executionConfig.defaults.model).toBe("gpt-5.4")
    expect(canonicalJson(resolved)).not.toContain(prose)
  })

  test("pins the healthy worktree context from preflight into the immutable resolution", async () => {
    const { registry, builtins } = await data("ce-doc-review")
    const resolved = resolveExecutionRequest({
      workflowId: "ce-doc-review",
      registry,
      builtins,
      probe: {
        ...healthyProbe,
        runtime: { context: { worktree: { available: true, selector: "path:/fixture-repo" } } },
      },
    })
    expect(resolved.runtime.worktree).toBe("path:/fixture-repo")
    expect(resolved.display.runtime.worktree).toBe("path:/fixture-repo")
  })

  test("routes network, MCP, and mixed-tool stages natively with explicit target authority", async () => {
    const planningData = await data("ce-plan")
    const planning = resolveExecutionRequest({
      workflowId: "ce-plan",
      ...planningData,
      probe: healthyProbe,
    })
    expect(planning.executionConfig.ownership).toMatchObject({
      "local-research": "orca",
      "organizational-research": "native",
      "external-research": "native",
      deepening: "native",
    })
    expect(planning.display.targetApplication.stages).toMatchObject({
      "local-research": { appliedBy: "orca" },
      "organizational-research": { appliedBy: "native-unconfigurable" },
      "external-research": { appliedBy: "native-unconfigurable" },
      deepening: { appliedBy: "native-unconfigurable" },
    })
    expect(planning.executionConfig.stages["local-research"]).toMatchObject({
      concurrency: 3,
      isolation: "worktree-strict",
    })
    for (const stageId of ["organizational-research", "external-research", "deepening"]) {
      expect(planning.executionConfig.stages[stageId], stageId).toMatchObject({
        isolation: "shared",
      })
    }
    expect(planning.executionConfig.stages["organizational-research"].concurrency).toBe(1)

    const compoundingData = await data("ce-compound")
    const compounding = resolveExecutionRequest({
      workflowId: "ce-compound",
      ...compoundingData,
      probe: healthyProbe,
    })
    expect(compounding.executionConfig.ownership["specialized-review"]).toBe("native")
    expect(compounding.display.targetApplication.stages["specialized-review"]).toEqual({ appliedBy: "native-unconfigurable" })
    expect(compounding.executionConfig.stages["specialized-review"]).toMatchObject({
      isolation: "shared",
    })
  })

  test("materializes upstream model tiers before higher-precedence target overrides", async () => {
    const documentReviewData = await data("ce-doc-review")
    const documentReview = resolveExecutionRequest({
      workflowId: "ce-doc-review",
      ...documentReviewData,
      probe: healthyProbe,
    })
    const documentRoles = documentReview.executionConfig.stages["persona-review"].roles
    expect(documentRoles["coherence-reviewer"]).toMatchObject({
      backend: "codex",
      model: "gpt-5.4-mini",
      reasoning: "low",
    })
    expect(documentRoles["design-lens-reviewer"]).toMatchObject({
      backend: "codex",
      model: "gpt-5.4-mini",
      reasoning: "medium",
    })
    expect(documentRoles["feasibility-reviewer"]).toMatchObject({
      backend: "codex",
      model: "gpt-5.4",
      reasoning: "high",
    })

    const simplificationData = await data("ce-simplify-code")
    const simplification = resolveExecutionRequest({
      workflowId: "ce-simplify-code",
      ...simplificationData,
      probe: healthyProbe,
    })
    for (const target of Object.values<any>(simplification.executionConfig.stages["reviewer-analysis"].roles)) {
      expect(target).toMatchObject({ backend: "codex", model: "gpt-5.4-mini", reasoning: "medium" })
    }

    const overridden = resolveExecutionRequest({
      workflowId: "ce-doc-review",
      ...documentReviewData,
      probe: healthyProbe,
      prompt: {
        defaults: { backend: "claude", model: "opus", reasoning: "high" },
      },
    })
    for (const target of Object.values<any>(overridden.executionConfig.stages["persona-review"].roles)) {
      expect(target).toMatchObject({ backend: "claude", model: "opus", reasoning: "high" })
    }

    const roleOverride = resolveExecutionRequest({
      workflowId: "ce-doc-review",
      ...documentReviewData,
      probe: healthyProbe,
      prompt: {
        stages: {
          "persona-review": {
            roles: {
              "coherence-reviewer": { backend: "claude", model: "opus" },
            },
          },
        },
      },
    })
    expect(roleOverride.executionConfig.stages["persona-review"].roles["coherence-reviewer"])
      .toMatchObject({ backend: "claude", model: "opus", reasoning: "high" })
    expect(roleOverride.executionConfig.stages["persona-review"].roles["design-lens-reviewer"])
      .toMatchObject({ backend: "codex", model: "gpt-5.4-mini", reasoning: "medium" })
  })

  test("fails closed for target overrides that a native owner cannot enforce", async () => {
    const planningData = await data("ce-plan")
    expect(() => resolveExecutionRequest({
      workflowId: "ce-plan",
      ...planningData,
      probe: healthyProbe,
      prompt: { stages: { "external-research": { backend: "claude", model: "opus" } } },
    })).toThrow(/external-research.*native-owned.*cannot enforce/i)
    expect(() => resolveExecutionRequest({
      workflowId: "ce-plan",
      ...planningData,
      probe: healthyProbe,
      prompt: { stages: { "organizational-research": { roles: { "slack-researcher": { model: "opus" } } } } },
    })).toThrow(/organizational-research.*slack-researcher.*native-owned.*cannot enforce/i)

    const nativeData = await data("ce-doc-review")
    expect(() => resolveExecutionRequest({
      workflowId: "ce-doc-review",
      ...nativeData,
      prompt: { runtime: "native", defaults: { backend: "claude", model: "opus" } },
    })).toThrow(/native runtime.*cannot enforce/i)
  })

  test("resolves Opus high for planning and three Codex Sol implementation workers without conflating effort", async () => {
    const { registry, builtins } = await data("lfg", "orca")
    const prompt = controllerExecutionPatch({
      schema: "ce-orca.execution-request/v1",
      workflowId: "lfg",
      stages: {
        planning: { backend: "claude", model: "opus", reasoning: "high" },
        implementation: { backend: "codex", model: "gpt-5.6-sol", reasoning: "xhigh", concurrency: 3 },
      },
    })
    const resolved = resolveExecutionRequest({ workflowId: "lfg", registry, builtins, prompt, probe: healthyProbe })
    expect(resolved.executionConfig.stages.planning).toMatchObject({ backend: "claude", model: "opus", reasoning: "high", effort: "medium" })
    expect(resolved.executionConfig.stages.implementation).toMatchObject({ backend: "codex", model: "gpt-5.6-sol", reasoning: "xhigh", effort: "medium", concurrency: 3 })
    expect(resolved.display.targetApplication.stages).toMatchObject({
      planning: { appliedBy: "child-workflow" },
      implementation: { appliedBy: "child-workflow" },
      "shipping-tail": { appliedBy: "native-unconfigurable" },
    })
    expect(resolved.runScopedOverride).toEqual({
      schema: "ce-orca.execution-request/v1",
      workflowId: "lfg",
      stages: {
        implementation: { backend: "codex", concurrency: 3, model: "gpt-5.6-sol", reasoning: "xhigh" },
        planning: { backend: "claude", model: "opus", reasoning: "high" },
      },
    })
    expect(deriveLfgChildExecutionPatches(resolved)).toMatchObject({
      planning: {
        workflowId: "ce-plan",
        defaults: { backend: "claude", model: "opus", reasoning: "high" },
      },
      implementation: {
        workflowId: "ce-work",
        stages: {
          implementation: {
            backend: "codex",
            model: "gpt-5.6-sol",
            reasoning: "xhigh",
            concurrency: 3,
          },
        },
      },
    })
  })

  test("applies prompt over profile over project over built-in defaults", async () => {
    const { registry, builtins } = await data("ce-doc-review")
    const project = { defaults: { backend: "claude", model: "sonnet", reasoning: "low", effort: "low" } }
    const profile = { stages: { "persona-review": { backend: "codex", model: "gpt-5.4", reasoning: "medium", roles: { "feasibility-reviewer": { concurrency: 2 } } } } }
    const prompt = { schema: "ce-orca.execution-request/v1", workflowId: "ce-doc-review", stages: { "persona-review": { roles: { "feasibility-reviewer": { backend: "claude", model: "opus", reasoning: "high", concurrency: 3 } } } } }
    const resolved = resolveExecutionRequest({ workflowId: "ce-doc-review", registry, builtins, project, profile, profileName: "review", prompt, probe: healthyProbe })
    expect(resolved.executionConfig.defaults).toMatchObject({ backend: "claude", model: "sonnet", reasoning: "low", effort: "low" })
    expect(resolved.executionConfig.stages["persona-review"]).toMatchObject({ backend: "codex", model: "gpt-5.4", reasoning: "medium", effort: "low" })
    expect(resolved.executionConfig.stages["persona-review"].roles["feasibility-reviewer"]).toMatchObject({ backend: "claude", model: "opus", reasoning: "high", effort: "low", concurrency: 3 })
  })

  test("rejects unknown roles and unavailable models with installed choices", async () => {
    const { registry, builtins } = await data("ce-doc-review")
    expect(() => resolveExecutionRequest({
      workflowId: "ce-doc-review",
      registry,
      builtins,
      probe: healthyProbe,
      prompt: { stages: { "persona-review": { roles: { "fork-only-reviewer": { model: "opus" } } } } },
    })).toThrow(/Valid roles:.*coherence-reviewer/)
    expect(() => resolveExecutionRequest({
      workflowId: "ce-doc-review",
      registry,
      builtins,
      probe: healthyProbe,
      prompt: { stages: { "persona-review": { roles: { "coherence-reviewer": { backend: "claude", model: "imaginary" } } } } },
    })).toThrow(/Available models: opus, sonnet/)
    expect(() => resolveExecutionRequest({
      workflowId: "ce-doc-review",
      registry,
      builtins,
      probe: healthyProbe,
      prompt: { defaults: { backend: "codex", model: "gpt-5.6-sol", reasoning: "medium" } },
    })).toThrow(/unsupported for codex\/gpt-5.6-sol.*high, xhigh/)
  })

  test("rejects ambiguous controller output rather than guessing and never activates roles", async () => {
    const { registry, builtins } = await data("ce-doc-review")
    expect(() => resolveExecutionRequest({ workflowId: "ce-doc-review", registry, builtins, probe: healthyProbe, prompt: { conflicts: ["opus", "sonnet"] } as any })).toThrow(/unsupported fields: conflicts/)
    const prompt = { stages: { "persona-review": { roles: { "security-lens-reviewer": { model: "gpt-5.4" } } } } }
    const resolved = resolveExecutionRequest({ workflowId: "ce-doc-review", registry, builtins, probe: healthyProbe, prompt })
    expect(registry.workflows["ce-doc-review"].stages["persona-review"].roles["security-lens-reviewer"].activation).toBe("conditional")
    expect(resolved.executionConfig.stages["persona-review"].roles["security-lens-reviewer"].model).toBe("gpt-5.4")
    expect(canonicalJson(resolved)).not.toContain("activated")
  })

  test("canonicalizes Cursor to explicit no-reasoning without inheriting another backend's level", async () => {
    const { registry, builtins } = await data("ce-doc-review")
    const resolved = resolveExecutionRequest({
      workflowId: "ce-doc-review",
      registry,
      builtins,
      probe: healthyProbe,
      prompt: {
        defaults: { backend: "cursor", model: "composer-2.5" },
        stages: {
          "persona-review": {
            backend: "cursor",
            model: "composer-2.5",
            roles: {
              "feasibility-reviewer": { backend: "cursor", model: "composer-2.5" },
            },
          },
        },
      },
    })
    expect(resolved.executionConfig.defaults).toMatchObject({ backend: "cursor", model: "composer-2.5", reasoning: "none" })
    expect(resolved.executionConfig.stages["persona-review"]).toMatchObject({ backend: "cursor", model: "composer-2.5", reasoning: "none" })
    expect(resolved.executionConfig.stages["persona-review"].roles["feasibility-reviewer"]).toMatchObject({ backend: "cursor", model: "composer-2.5", reasoning: "none" })
    expect(resolved.runScopedOverride).toMatchObject({
      defaults: { backend: "cursor", model: "composer-2.5", reasoning: "none" },
      stages: {
        "persona-review": {
          backend: "cursor",
          model: "composer-2.5",
          reasoning: "none",
          roles: {
            "feasibility-reviewer": { backend: "cursor", model: "composer-2.5", reasoning: "none" },
          },
        },
      },
    })
  })

  test("rejects empty reasoning and keeps provider-attested levels for Claude and Codex", async () => {
    const { registry, builtins } = await data("ce-doc-review")
    expect(() => resolveExecutionRequest({
      workflowId: "ce-doc-review",
      registry,
      builtins,
      probe: healthyProbe,
      prompt: { defaults: { backend: "cursor", model: "composer-2.5", reasoning: "" } },
    })).toThrow(/reasoning must be a non-empty lowercase level token/)

    const claude = resolveExecutionRequest({
      workflowId: "ce-doc-review",
      registry,
      builtins,
      probe: healthyProbe,
      prompt: { defaults: { backend: "claude", model: "opus" } },
    })
    expect(claude.executionConfig.defaults).toMatchObject({ backend: "claude", model: "opus", reasoning: "high" })

    expect(() => resolveExecutionRequest({
      workflowId: "ce-doc-review",
      registry,
      builtins,
      probe: healthyProbe,
      prompt: { defaults: { backend: "codex", model: "gpt-5.4", reasoning: "none" } },
    })).toThrow(/unsupported for codex\/gpt-5\.4/)
  })

  test("rejects effort outside low, medium, or high during resolution", async () => {
    const { registry, builtins } = await data("ce-doc-review")

    expect(() => resolveExecutionRequest({
      workflowId: "ce-doc-review",
      registry,
      builtins,
      probe: healthyProbe,
      prompt: { defaults: { effort: "xhigh" } },
    })).toThrow(/defaults\.effort must be one of low, medium, high/)

    expect(() => resolveExecutionRequest({
      workflowId: "ce-doc-review",
      registry,
      builtins,
      probe: healthyProbe,
      prompt: {
        stages: {
          "persona-review": {
            roles: { "coherence-reviewer": { effort: "max" } },
          },
        },
      },
    })).toThrow(/roles\.coherence-reviewer\.effort must be one of low, medium, high/)
  })

  test("rejects an unattested writer backend before an Orca ce-work run is created", async () => {
    const { registry, builtins } = await data("ce-work", "orca")
    const resolved = resolveExecutionRequest({ workflowId: "ce-work", registry, builtins, probe: healthyProbe })
    expect(resolved.executionConfig.stages.implementation).toMatchObject({
      mutation: "writer",
      roles: { "implementation-unit-worker": { mutation: "writer" } },
    })
    expect(() => resolveExecutionRequest({
      workflowId: "ce-work",
      registry,
      builtins,
      probe: healthyProbe,
      prompt: {
        stages: {
          implementation: {
            backend: "cursor",
            model: "composer-2.5",
            roles: {
              "implementation-unit-worker": {
                backend: "cursor",
                model: "composer-2.5",
              },
            },
          },
        },
      },
    })).toThrow(/no attested mutation-safe writer policy.*Valid writer backends: claude, codex/)
  })

  test("makes confirmation opt-in and produces byte-equivalent immutable resolutions", async () => {
    const { registry, builtins } = await data("ce-doc-review")
    const before = canonicalJson({ registry, builtins })
    const normal = resolveExecutionRequest({ workflowId: "ce-doc-review", registry, builtins, probe: healthyProbe })
    const waiting = resolveExecutionRequest({ workflowId: "ce-doc-review", registry, builtins, probe: healthyProbe, prompt: { confirmation: true } })
    expect(normal.confirmationRequired).toBe(false)
    expect(waiting.confirmationRequired).toBe(true)
    expect(canonicalJson(normal)).toBe(canonicalJson(resolveExecutionRequest({ workflowId: "ce-doc-review", registry, builtins, probe: healthyProbe })))
    expect(canonicalJson({ registry, builtins })).toBe(before)
  })

  test("keeps run overrides temporary and writes profiles atomically only with explicit intent", async () => {
    const { registry, builtins } = await data("ce-doc-review")
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "ce-orca-profiles-"))
    scratch.push(directory)
    const filePath = path.join(directory, "profiles.json")
    const request = { schema: "ce-orca.execution-request/v1", workflowId: "ce-doc-review", defaults: { backend: "claude", model: "opus", reasoning: "high" } }
    await expect(persistProfileAtomic({ filePath, profileName: "review", request, registry, workflowId: "ce-doc-review" })).rejects.toMatchObject({ code: "persistence_not_explicit" })
    const saved = await persistProfileAtomic({ filePath, profileName: "review", request, explicit: true, registry, workflowId: "ce-doc-review" })
    expect(saved.profileDigest).toMatch(/^[a-f0-9]{64}$/)
    expect((await fs.stat(filePath)).mode & 0o777).toBe(0o600)
    const store = JSON.parse(await fs.readFile(filePath, "utf8"))
    expect(selectProfile(store, "review", "ce-doc-review")).toEqual({ defaults: { backend: "claude", model: "opus", reasoning: "high" } })
    const fresh = resolveExecutionRequest({ workflowId: "ce-doc-review", registry, builtins, probe: healthyProbe })
    expect(fresh.executionConfig.defaults.model).toBe("gpt-5.4")
  })

  test("serializes concurrent profile updates without losing successful writes", async () => {
    const { registry } = await data("ce-doc-review")
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "ce-orca-concurrent-profiles-"))
    scratch.push(directory)
    const filePath = path.join(directory, "profiles.json")
    const names = Array.from({ length: 12 }, (_, index) => `review-${index}`)

    await Promise.all(names.map((profileName, index) => persistProfileAtomic({
      filePath,
      profileName,
      request: {
        schema: "ce-orca.execution-request/v1",
        workflowId: "ce-doc-review",
        defaults: { effort: index % 2 === 0 ? "low" : "high" },
      },
      explicit: true,
      registry,
      workflowId: "ce-doc-review",
    })))

    const store = JSON.parse(await fs.readFile(filePath, "utf8"))
    expect(Object.keys(store.profiles).sort()).toEqual([...names].sort())
    for (const [index, profileName] of names.entries()) {
      expect(selectProfile(store, profileName, "ce-doc-review").defaults.effort)
        .toBe(index % 2 === 0 ? "low" : "high")
    }
    await expect(fs.stat(`${filePath}.lock`)).rejects.toMatchObject({ code: "ENOENT" })
  })

  test("elects one recovery owner when concurrent writers find an abandoned profile lock", async () => {
    const { registry } = await data("ce-doc-review")
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "ce-orca-abandoned-profile-lock-"))
    scratch.push(directory)
    const filePath = path.join(directory, "profiles.json")
    const deadPid = 99_999_999
    const token = `${deadPid}-${"a".repeat(24)}`
    const lockPath = `${filePath}.lock`
    const fixture = await profileLockOwnerFixture(lockPath, token, deadPid)
    await fs.writeFile(lockPath, canonicalJson(fixture.owner), { mode: 0o600 })

    await Promise.all(["recovered-a", "recovered-b"].map((profileName) => persistProfileAtomic({
      filePath,
      profileName,
      request: {
        schema: "ce-orca.execution-request/v1",
        workflowId: "ce-doc-review",
        defaults: { effort: "high" },
      },
      explicit: true,
      registry,
      workflowId: "ce-doc-review",
    })))

    const store = JSON.parse(await fs.readFile(filePath, "utf8"))
    expect(Object.keys(store.profiles).sort()).toEqual(["recovered-a", "recovered-b"])
    expect(selectProfile(store, "recovered-a", "ce-doc-review").defaults.effort).toBe("high")
    expect(selectProfile(store, "recovered-b", "ce-doc-review").defaults.effort).toBe("high")
    await expect(fs.stat(`${filePath}.lock`)).rejects.toMatchObject({ code: "ENOENT" })
  })

  test("retries abandoned-lock generation handoffs under high contention", async () => {
    const { registry } = await data("ce-doc-review")
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "ce-orca-contended-profile-lock-"))
    scratch.push(directory)
    const filePath = path.join(directory, "profiles.json")
    const deadPid = 99_999_995
    const token = `${deadPid}-${"f".repeat(24)}`
    const lockPath = `${filePath}.lock`
    const fixture = await profileLockOwnerFixture(lockPath, token, deadPid)
    await fs.writeFile(lockPath, canonicalJson(fixture.owner), { mode: 0o600 })
    const names = Array.from({ length: 128 }, (_, index) => `contended-${index}`)

    const outcomes = await Promise.allSettled(names.map((profileName) => persistProfileAtomic({
      filePath,
      profileName,
      request: {
        schema: "ce-orca.execution-request/v1",
        workflowId: "ce-doc-review",
        defaults: { effort: "medium" },
      },
      explicit: true,
      registry,
      workflowId: "ce-doc-review",
    })))
    const failures = outcomes.flatMap((outcome, index) => outcome.status === "rejected"
      ? [{ index, reason: String(outcome.reason) }]
      : [])

    expect(failures).toEqual([])
    const store = JSON.parse(await fs.readFile(filePath, "utf8"))
    expect(Object.keys(store.profiles).sort()).toEqual([...names].sort())
    await expect(fs.stat(lockPath)).rejects.toMatchObject({ code: "ENOENT" })
  })

  test("advances recovery generations after an elected recovery owner crashes", async () => {
    const { registry } = await data("ce-doc-review")
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "ce-orca-abandoned-recovery-lock-"))
    scratch.push(directory)
    const filePath = path.join(directory, "profiles.json")
    const deadOwnerPid = 99_999_998
    const deadRecoveryPid = 99_999_997
    const ownerToken = `${deadOwnerPid}-${"a".repeat(24)}`
    const recoveryToken = `${deadRecoveryPid}-${"b".repeat(24)}`
    const lockPath = `${filePath}.lock`
    const recoveryBase = `${lockPath}.${ownerToken}.recovery`
    const ownerFixture = await profileLockOwnerFixture(lockPath, ownerToken, deadOwnerPid)
    const recoveryFixture = await profileLockOwnerFixture(lockPath, recoveryToken, deadRecoveryPid)
    await fs.writeFile(lockPath, canonicalJson(ownerFixture.owner), { mode: 0o600 })
    for (let index = 0; index < 40; index += 1) {
      await fs.writeFile(`${recoveryBase}.${index}`, canonicalJson(recoveryFixture.owner), { mode: 0o600 })
    }

    await Promise.all(["generation-a", "generation-b"].map((profileName) => persistProfileAtomic({
      filePath,
      profileName,
      request: {
        schema: "ce-orca.execution-request/v1",
        workflowId: "ce-doc-review",
        defaults: { effort: "medium" },
      },
      explicit: true,
      registry,
      workflowId: "ce-doc-review",
    })))

    const store = JSON.parse(await fs.readFile(filePath, "utf8"))
    expect(Object.keys(store.profiles).sort()).toEqual(["generation-a", "generation-b"])
    expect(selectProfile(store, "generation-a", "ce-doc-review").defaults.effort).toBe("medium")
    expect(selectProfile(store, "generation-b", "ce-doc-review").defaults.effort).toBe("medium")
    await expect(fs.stat(lockPath)).rejects.toMatchObject({ code: "ENOENT" })
    expect((await fs.stat(`${recoveryBase}.0`)).isFile()).toBe(true)
    expect((await fs.stat(`${recoveryBase}.39`)).isFile()).toBe(true)
    expect((await fs.stat(`${recoveryBase}.40`)).isFile()).toBe(true)
    await expect(fs.stat(ownerFixture.fifoPath)).rejects.toMatchObject({ code: "ENOENT" })
    await expectFifoWithoutWriter(recoveryFixture.fifoPath)
    const electedOwner = JSON.parse(await fs.readFile(`${recoveryBase}.40`, "utf8"))
    await expectFifoWithoutWriter(electedOwner.liveness.path)
  })

  test("ignores crash-orphaned unpublished claims without racing a new writer", async () => {
    const { registry } = await data("ce-doc-review")
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "ce-orca-orphan-profile-claim-"))
    scratch.push(directory)
    const filePath = path.join(directory, "profiles.json")
    const lockPath = `${filePath}.lock`
    const token = `${99_999_996}-${"b".repeat(24)}`
    const fixture = await profileLockOwnerFixture(lockPath, token, 99_999_996)
    const claimPath = `${lockPath}.${token}.claim`
    await fs.writeFile(claimPath, canonicalJson(fixture.owner), { mode: 0o600 })

    await persistProfileAtomic({
      filePath,
      profileName: "after-orphan",
      request: {
        schema: "ce-orca.execution-request/v1",
        workflowId: "ce-doc-review",
        defaults: { effort: "medium" },
      },
      explicit: true,
      registry,
      workflowId: "ce-doc-review",
    })

    expect(JSON.parse(await fs.readFile(claimPath, "utf8"))).toEqual(fixture.owner)
    expect((await fs.lstat(fixture.fifoPath)).isFIFO()).toBe(true)
    const store = JSON.parse(await fs.readFile(filePath, "utf8"))
    expect(selectProfile(store, "after-orphan", "ce-doc-review").defaults.effort).toBe("medium")
  })

  test("recovers a dead profile owner even when its PID has been reused", async () => {
    const { registry } = await data("ce-doc-review")
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "ce-orca-reused-profile-pid-"))
    scratch.push(directory)
    const filePath = path.join(directory, "profiles.json")
    const lockPath = `${filePath}.lock`
    const token = `${process.pid}-${"c".repeat(24)}`
    const fixture = await profileLockOwnerFixture(lockPath, token, process.pid)
    await fs.writeFile(lockPath, canonicalJson(fixture.owner), { mode: 0o600 })

    await persistProfileAtomic({
      filePath,
      profileName: "pid-reused",
      request: {
        schema: "ce-orca.execution-request/v1",
        workflowId: "ce-doc-review",
        defaults: { effort: "low" },
      },
      explicit: true,
      registry,
      workflowId: "ce-doc-review",
    })

    const store = JSON.parse(await fs.readFile(filePath, "utf8"))
    expect(selectProfile(store, "pid-reused", "ce-doc-review").defaults.effort).toBe("low")
    await expect(fs.stat(lockPath)).rejects.toMatchObject({ code: "ENOENT" })
    await expect(fs.stat(fixture.fifoPath)).rejects.toMatchObject({ code: "ENOENT" })
  })

  test("keeps a live FIFO owner until the kernel closes its writer", async () => {
    const { registry } = await data("ce-doc-review")
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "ce-orca-live-profile-owner-"))
    scratch.push(directory)
    const filePath = path.join(directory, "profiles.json")
    const lockPath = `${filePath}.lock`
    const token = `${process.pid}-${"d".repeat(24)}`
    const fixture = await profileLockOwnerFixture(lockPath, token, process.pid, true)
    await fs.writeFile(lockPath, canonicalJson(fixture.owner), { mode: 0o600 })

    const saving = persistProfileAtomic({
      filePath,
      profileName: "after-live-owner",
      request: {
        schema: "ce-orca.execution-request/v1",
        workflowId: "ce-doc-review",
        defaults: { effort: "high" },
      },
      explicit: true,
      registry,
      workflowId: "ce-doc-review",
    })
    await wait(100)
    const observedOwner = JSON.parse(await fs.readFile(lockPath, "utf8"))
    await fixture.handle?.close()
    await saving

    expect(observedOwner.token).toBe(token)
    const store = JSON.parse(await fs.readFile(filePath, "utf8"))
    expect(selectProfile(store, "after-live-owner", "ce-doc-review").defaults.effort).toBe("high")
    await expect(fs.stat(fixture.fifoPath)).rejects.toMatchObject({ code: "ENOENT" })
  })

  test("fails closed when FIFO liveness becomes unverifiable", async () => {
    const { registry } = await data("ce-doc-review")
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "ce-orca-unknown-profile-owner-"))
    scratch.push(directory)
    const filePath = path.join(directory, "profiles.json")
    const lockPath = `${filePath}.lock`
    const token = `${process.pid}-${"f".repeat(24)}`
    const fixture = await profileLockOwnerFixture(lockPath, token, process.pid, true)
    await fs.writeFile(lockPath, canonicalJson(fixture.owner), { mode: 0o600 })
    await fs.rm(fixture.fifoPath, { force: true })

    try {
      await expect(persistProfileAtomic({
        filePath,
        profileName: "must-not-guess-liveness",
        request: {
          schema: "ce-orca.execution-request/v1",
          workflowId: "ce-doc-review",
          defaults: { effort: "medium" },
        },
        explicit: true,
        registry,
        workflowId: "ce-doc-review",
      })).rejects.toMatchObject({ code: "profile_lock_liveness_unavailable" })
    } finally {
      await fixture.handle?.close()
    }

    expect(JSON.parse(await fs.readFile(lockPath, "utf8")).token).toBe(token)
    await expect(fs.stat(filePath)).rejects.toMatchObject({ code: "ENOENT" })
  })

  test("fails closed for an unversioned profile lock instead of stealing it", async () => {
    const { registry } = await data("ce-doc-review")
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "ce-orca-legacy-profile-lock-"))
    scratch.push(directory)
    const filePath = path.join(directory, "profiles.json")
    const lockPath = `${filePath}.lock`
    const legacyOwner = {
      token: `${process.pid}-${"e".repeat(24)}`,
      pid: process.pid,
      createdAt: new Date().toISOString(),
    }
    await fs.writeFile(lockPath, canonicalJson(legacyOwner), { mode: 0o600 })

    await expect(persistProfileAtomic({
      filePath,
      profileName: "must-not-steal",
      request: {
        schema: "ce-orca.execution-request/v1",
        workflowId: "ce-doc-review",
        defaults: { effort: "low" },
      },
      explicit: true,
      registry,
      workflowId: "ce-doc-review",
    })).rejects.toMatchObject({ code: "profile_lock_format_unsupported" })

    expect(JSON.parse(await fs.readFile(lockPath, "utf8"))).toEqual(legacyOwner)
    await expect(fs.stat(filePath)).rejects.toMatchObject({ code: "ENOENT" })
  })

  test("round-trips explicit confirmation values through saved profiles", async () => {
    const { registry, builtins } = await data("ce-doc-review")
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "ce-orca-confirmation-profiles-"))
    scratch.push(directory)
    const filePath = path.join(directory, "profiles.json")

    for (const confirmation of [true, false]) {
      const profileName = `confirmation-${confirmation}`
      await persistProfileAtomic({
        filePath,
        profileName,
        request: {
          schema: "ce-orca.execution-request/v1",
          workflowId: "ce-doc-review",
          confirmation,
        },
        explicit: true,
        registry,
        workflowId: "ce-doc-review",
      })
      const store = JSON.parse(await fs.readFile(filePath, "utf8"))
      const profile = selectProfile(store, profileName, "ce-doc-review")
      expect(profile.confirmation).toBe(confirmation)

      const resolved = resolveExecutionRequest({
        workflowId: "ce-doc-review",
        registry,
        builtins,
        profile,
        profileName,
        probe: healthyProbe,
      })
      expect(resolved.confirmationRequired).toBe(confirmation)
      expect(resolved.runScopedOverride.confirmation).toBe(confirmation)
    }
  })

  test("selects stable per-workflow project defaults", () => {
    const store = {
      schema: "ce-orca.project-config/v1",
      workflows: {
        "ce-doc-review": { defaults: { effort: "low" } },
        "ce-plan": { defaults: { effort: "high" } },
      },
    }
    expect(selectProjectConfig(store, "ce-doc-review")).toEqual({ defaults: { effort: "low" } })
    expect(selectProjectConfig(store, "ce-work")).toEqual({})
  })

  test("offers a practical private CLI path for explicit profile persistence and default reload", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "ce-orca-profile-cli-"))
    scratch.push(directory)
    const home = path.join(directory, "home")
    const project = path.join(directory, "project")
    await fs.mkdir(home, { recursive: true })
    await fs.mkdir(project, { recursive: true })
    const requestPath = path.join(directory, "request.json")
    const probePath = path.join(directory, "probe.json")
    await fs.writeFile(requestPath, JSON.stringify({
      schema: "ce-orca.execution-request/v1",
      workflowId: "ce-doc-review",
      runtime: "orca",
      confirmation: true,
      defaults: { backend: "claude", model: "opus", reasoning: "high" },
    }))
    await fs.writeFile(probePath, JSON.stringify(healthyProbe))
    await fs.writeFile(path.join(project, ".ce-orca.json"), JSON.stringify({
      schema: "ce-orca.project-config/v1",
      workflows: { "ce-doc-review": { defaults: { effort: "low" } } },
    }))
    const runtime = path.join(ROOT, "skills/ce-doc-review/scripts/orca-runtime.mjs")
    const profilesPath = path.join(home, ".config/compound-engineering-orca/profiles.json")
    const run = async (args: string[]) => {
      const child = Bun.spawn(["bun", runtime, ...args], { cwd: project, env: { ...Bun.env, HOME: home }, stdout: "pipe", stderr: "pipe" })
      const [exitCode, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()])
      return { exitCode, stdout, stderr }
    }

    const denied = await run(["save-profile", "--workflow", "ce-doc-review", "--name", "review", "--request", requestPath])
    expect(denied.exitCode).toBe(1)
    expect(JSON.parse(denied.stderr).code).toBe("persistence_not_explicit")
    await expect(fs.stat(profilesPath)).rejects.toMatchObject({ code: "ENOENT" })

    const saved = await run(["save-profile", "--workflow", "ce-doc-review", "--name", "review", "--request", requestPath, "--explicit", "true"])
    expect(saved.exitCode, saved.stderr).toBe(0)
    expect(JSON.parse(saved.stdout)).toMatchObject({ ok: true, schema: "ce-orca.profile-saved/v1", profileName: "review" })
    expect((await fs.stat(profilesPath)).mode & 0o777).toBe(0o600)
    expect(selectProfile(
      JSON.parse(await fs.readFile(profilesPath, "utf8")),
      "review",
      "ce-doc-review",
    ).confirmation).toBe(true)

    const loaded = await run(["resolve", "--workflow", "ce-doc-review", "--profile", "review", "--probe", probePath])
    expect(loaded.exitCode, loaded.stderr).toBe(0)
    const resolved = JSON.parse(loaded.stdout)
    expect(resolved.runtime).toMatchObject({ requested: "orca", selected: "orca" })
    expect(resolved.confirmationRequired).toBe(true)
    expect(resolved.executionConfig.defaults).toMatchObject({ backend: "claude", model: "opus", reasoning: "high", effort: "low" })
  })

  test("serializes only allowlisted identities and target data, never credentials", async () => {
    const { registry, builtins } = await data("ce-doc-review")
    expect(() => resolveExecutionRequest({ workflowId: "ce-doc-review", registry, builtins, probe: healthyProbe, project: { apiKey: "top-secret" } as any })).toThrow(/unsupported fields: apiKey/)
    const resolved = resolveExecutionRequest({ workflowId: "ce-doc-review", registry, builtins, probe: healthyProbe })
    expect(resolved.identities).toMatchObject({ ceVersion: "3.19.0", integrationVersion: "3.19.0-orca.1", registryVersion: expect.any(String), protocolVersion: "orca.local-protocol/v1", requestVersion: "orca.execution-config/v1" })
    expect(canonicalJson(resolved)).not.toMatch(/api[_-]?key|token|secret|credential/i)
  })
})
