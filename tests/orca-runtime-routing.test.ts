import { describe, expect, test } from "bun:test"
import { promises as fs } from "node:fs"
import os from "node:os"
import path from "node:path"
import { ExecutionResolutionError } from "../integrations/orca/resolve-config.mjs"
import {
  MAX_CONFIDENTIAL_PACKET_BYTES,
  isOrcaTerminal,
  probeRuntime,
  resumeOrcaRun,
  resolveRuntimeCommand,
  routeRuntime,
  runResolvedRequest,
} from "../integrations/orca/runtime-probe.mjs"

const ROOT = path.resolve(import.meta.dir, "..")
const DOC_REVIEW_REGISTRY = path.join(ROOT, "skills", "ce-doc-review", "scripts", "orca-workflow-registry.json")
const PLAN_REGISTRY = path.join(ROOT, "skills", "ce-plan", "scripts", "orca-workflow-registry.json")
const LFG_REGISTRY = path.join(ROOT, "skills", "lfg", "scripts", "orca-workflow-registry.json")

const resultEnvelope = (state = "succeeded") => ({
  ok: state === "succeeded",
  schema: "orca.run-result/v1",
  runId: "20260711-120000-abcd",
  state,
  terminal: ["succeeded", "failed", "stopped", "aborted"].includes(state),
  exitCode: state === "succeeded" ? 0 : 1,
  refs: { run: "runs/20260711-120000-abcd", log: "runs/20260711-120000-abcd/run.log", events: "runs/20260711-120000-abcd/events.jsonl", artifacts: ["runs/20260711-120000-abcd/ce-result.json"] },
})

const validDocReviewResult = () => ({
  schema: "ce-orca.doc-review-result/v1",
  workflowId: "ce-doc-review",
  status: "completed",
  reviewers: [],
  failures: [],
})

function resolved({ selected = "orca", confirmationRequired = false, workflowId = "ce-doc-review" } = {}) {
  return {
    schema: "ce-orca.resolved-execution/v1",
    workflowId,
    runtime: {
      requested: "auto",
      selected,
      state: selected === "orca" ? "healthy" : "absent",
      fallback: selected === "native",
      ...(selected === "orca" ? { worktree: "path:/resolved-repo" } : {}),
    },
    confirmationRequired,
    profile: null,
    identities: { ceVersion: "3.19.0", integrationVersion: "3.19.0-orca.1", registryVersion: "ce-orca.registry/v1@3.19.0-orca.1", protocolVersion: "orca.local-protocol/v1", requestVersion: "orca.execution-config/v1" },
    executionConfig: {
      version: "orca.execution-config/v1",
      workflowId,
      defaults: { backend: "codex", model: "gpt-5.6-sol", reasoning: "medium", effort: "medium", concurrency: 1, isolation: "shared" },
      stages: {},
      ownership: {},
      provenance: { ceVersion: "3.19.0", integrationVersion: "3.19.0-orca.1", registryVersion: "ce-orca.registry/v1@3.19.0-orca.1", profile: "", profileDigest: "" },
      confirmation: confirmationRequired,
      artifacts: [],
    },
  }
}

describe("CE-Orca runtime routing", () => {
  test("uses CE_ORCA_COMMAND as an executable-only runtime override", () => {
    expect(resolveRuntimeCommand({ CE_ORCA_COMMAND: "/opt/orch console/bin/orca-orch" })).toBe("/opt/orch console/bin/orca-orch")
    expect(resolveRuntimeCommand({ CE_ORCA_COMMAND: "  " })).toBe("orca-orch")
    expect(() => resolveRuntimeCommand({ CE_ORCA_COMMAND: "orca-orch\0--unsafe" })).toThrow(/NUL/)
  })

  test("implements absent, healthy, unhealthy, and incompatible routing without degraded fallback", () => {
    const orcaTerminal = { orcaTerminal: true }
    expect(routeRuntime("auto", { state: "absent" }, orcaTerminal)).toEqual({ requested: "auto", selected: "native", state: "absent", fallback: true })
    expect(routeRuntime("auto", { state: "healthy" }, orcaTerminal)).toEqual({ requested: "auto", selected: "orca", state: "healthy", fallback: false })
    expect(routeRuntime("auto", {
      state: "healthy",
      runtime: { context: { worktree: { available: true, selector: "path:/registered-repo" } } },
    }, { orcaTerminal: false })).toEqual({
      requested: "auto",
      selected: "native",
      state: "not-checked",
      fallback: true,
      reason: "outside-orca-terminal",
    })
    expect(() => routeRuntime("auto", { state: "unhealthy" }, orcaTerminal)).toThrow(/cannot fall back/)
    expect(() => routeRuntime("auto", { state: "incompatible" }, orcaTerminal)).toThrow(/cannot fall back/)
    expect(() => routeRuntime("orca", { state: "absent" }, orcaTerminal)).toThrow(/explicitly requested/)
    expect(() => routeRuntime("orca", { state: "healthy" }, { orcaTerminal: false })).toThrow(/Orca terminal/)
    expect(routeRuntime("native", { state: "incompatible" })).toMatchObject({ selected: "native", fallback: false })
  })

  test("attests a real Orca terminal instead of the mere presence of Orca environment hooks", () => {
    expect(isOrcaTerminal({ TERM_PROGRAM: "Orca", ORCA_TERMINAL_HANDLE: "term_123" })).toBe(true)
    expect(isOrcaTerminal({ TERM_PROGRAM: "Orca" })).toBe(false)
    expect(isOrcaTerminal({ ORCA_TERMINAL_HANDLE: "term_123" })).toBe(false)
    expect(isOrcaTerminal({
      TERM_PROGRAM: "Apple_Terminal",
      ORCA_TERMINAL_HANDLE: "",
      ORCA_AGENT_HOOK_ENDPOINT: "/tmp/orca-hook",
      ORCA_APP_VERSION: "1.4.137",
    })).toBe(false)
  })

  test("probes the versioned endpoint and requires wait plus confidential packet capabilities", async () => {
    let observed: { command?: string; args?: string[] } = {}
    const envelope = {
      schema: "orca.capabilities/v1",
      state: "healthy",
      protocol: {
        version: "orca.local-protocol/v1",
        compatible: true,
        supportedRequestVersions: ["orca.execution-config/v1"],
      },
      capabilities: {
        lifecycle: { wait: true },
        results: { artifactRead: { supported: true, maxBytes: 8_388_608 } },
        transport: { confidentialPacket: { supported: true, delivery: "in-memory-consume-v1", sourceConsumption: "explicit-one-shot-v1" } },
        targets: {},
      },
      issues: [],
    }
    const probe = await probeRuntime({
      worktree: "path:/repo",
      requiredAdapters: ["codex", "claude", "codex"],
      execFile: async (command: string, args: string[]) => {
        observed = { command, args }
        return { stdout: JSON.stringify(envelope), stderr: "", exitCode: 0 }
      },
    })
    expect(observed).toEqual({ command: "orca-orch", args: ["capabilities", "--protocol", "orca.local-protocol/v1", "--worktree", "path:/repo", "--require-adapters", "claude,codex"] })
    expect(probe.state).toBe("healthy")

    for (const protocol of [
      { ...envelope.protocol, version: "orca.local-protocol/v0" },
      { ...envelope.protocol, compatible: null },
      { ...envelope.protocol, supportedRequestVersions: [] },
    ]) {
      const protocolMismatch = await probeRuntime({
        execFile: async () => ({ stdout: JSON.stringify({ ...envelope, protocol }) }) as any,
      })
      expect(protocolMismatch.state).toBe("incompatible")
      expect(protocolMismatch.issues.at(-1)?.code).toBe("protocol-attestation-mismatch")
    }

    const incompatible = await probeRuntime({ execFile: async () => ({ stdout: JSON.stringify({ ...envelope, capabilities: { lifecycle: { wait: false }, transport: { confidentialPacket: { supported: false } } } }) }) as any })
    expect(incompatible.state).toBe("incompatible")
    expect(incompatible.issues.at(-1)?.code).toBe("required-capability-missing")

    const staleFileTransport = await probeRuntime({
      execFile: async () => ({
        stdout: JSON.stringify({
          ...envelope,
          capabilities: {
            ...envelope.capabilities,
            transport: { confidentialPacket: { supported: true } },
          },
        }),
      }) as any,
    })
    expect(staleFileTransport.state).toBe("incompatible")
    expect(staleFileTransport.issues.at(-1)?.message).toContain("in-memory-consume-v1")

    const staleSourceLifetime = await probeRuntime({
      execFile: async () => ({
        stdout: JSON.stringify({
          ...envelope,
          capabilities: {
            ...envelope.capabilities,
            transport: { confidentialPacket: { supported: true, delivery: "in-memory-consume-v1" } },
          },
        }),
      }) as any,
    })
    expect(staleSourceLifetime.state).toBe("incompatible")
    expect(staleSourceLifetime.issues.at(-1)?.message).toContain("explicit-one-shot-v1")
  })

  test("reports an absent command and malformed output as distinct states", async () => {
    const missing = await probeRuntime({ execFile: async () => { const error: any = new Error("missing"); error.code = "ENOENT"; throw error } })
    expect(missing.state).toBe("absent")
    const malformed = await probeRuntime({ execFile: async () => ({ stdout: "not-json" }) as any })
    expect(malformed.state).toBe("unhealthy")
  })

  test("displays then waits without touching Orca when confirmation was requested", async () => {
    let calls = 0
    const displays: any[] = []
    const result = await runResolvedRequest({
      resolved: resolved({ confirmationRequired: true }),
      workflowRegistryPath: "/not/read/before-confirmation.json",
      execFile: async () => { calls += 1; return { stdout: JSON.stringify(resultEnvelope()) } },
      onDisplay: async (display: any) => displays.push(display),
    })
    expect(result.action).toBe("awaiting-confirmation")
    expect(calls).toBe(0)
    expect(displays).toHaveLength(1)
  })

  test("rejects non-boolean or divergent confirmation snapshots before routing", async () => {
    const snapshots: any[] = []
    const nativeMismatch = resolved({ selected: "native" })
    nativeMismatch.confirmationRequired = true
    snapshots.push(nativeMismatch)
    const orcaMismatch = resolved({ confirmationRequired: true })
    orcaMismatch.executionConfig.confirmation = false
    snapshots.push(orcaMismatch)
    const nonBoolean = resolved() as any
    nonBoolean.confirmationRequired = "yes"
    snapshots.push(nonBoolean)

    let calls = 0
    for (const snapshot of snapshots) {
      await expect(runResolvedRequest({
        resolved: snapshot,
        workflowRegistryPath: DOC_REVIEW_REGISTRY,
        execFile: async () => { calls += 1; return {} as any },
      })).rejects.toMatchObject({ code: "invalid_resolved_request" })
    }
    expect(calls).toBe(0)
  })

  test("continues without confirmation and invokes the exact private run-request contract", async () => {
    let observed: any = null
    const packet = { schema: "ce-orca.packet/v1", workflowId: "ce-doc-review", secretPrompt: "private prompt" }
    const result = await runResolvedRequest({
      resolved: resolved(),
      workflowRegistryPath: DOC_REVIEW_REGISTRY,
      packet,
      waitSeconds: 42,
      worktree: "path:/repo",
      execFile: async (command: string, args: string[], options: { timeout: number }) => {
        if (args[0] === "artifact-read") {
          return { stdout: JSON.stringify(validDocReviewResult()), stderr: "", exitCode: 0 }
        }
        observed = { command, args: [...args], timeout: options.timeout, request: JSON.parse(await fs.readFile(args[1], "utf8")), packet: JSON.parse(await fs.readFile(args[args.indexOf("--packet") + 1], "utf8")), requestMode: (await fs.stat(args[1])).mode & 0o777, packetMode: (await fs.stat(args[args.indexOf("--packet") + 1])).mode & 0o777 }
        return { stdout: JSON.stringify(resultEnvelope()), stderr: "", exitCode: 0 }
      },
    })
    expect(result.action).toBe("orca")
    expect(result.response.schema).toBe("orca.run-result/v1")
    expect(result.result).toMatchObject({
      ref: "runs/20260711-120000-abcd/ce-result.json",
      value: validDocReviewResult(),
      artifacts: {},
    })
    expect(observed.command).toBe("orca-orch")
    expect(observed.args.slice(0, 4)).toEqual(["run-request", expect.any(String), "--registry", DOC_REVIEW_REGISTRY])
    expect(observed.args).toContain("--packet")
    expect(observed.args).toContain("--consume-packet-source")
    expect(observed.args[observed.args.indexOf("--consume-packet-source") + 1]).toBe("true")
    expect(observed.args[observed.args.indexOf("--worktree") + 1]).toBe("path:/repo")
    expect(observed.args).toContain("42")
    expect(observed.timeout).toBe(72_000)
    expect(observed.request).not.toHaveProperty("display")
    expect(observed.packet).toEqual(packet)
    expect(observed.requestMode).toBe(0o600)
    expect(observed.packetMode).toBe(0o600)
    await expect(fs.stat(observed.args[1])).rejects.toMatchObject({ code: "ENOENT" })
  })

  test("derives the run wait and process windows from the largest Orca-dispatched budget", async () => {
    for (const [budget, expectedWaitSeconds] of [[900, 930], [1200, 1230], [1800, 1830], [2700, 2730]] as const) {
      const snapshot = resolved()
      snapshot.executionConfig.stages = {
        dispatch: {
          budget: 900,
          roles: {
            worker: { budget },
          },
        },
        nativeOnly: {
          budget: 9999,
        },
      }
      snapshot.executionConfig.ownership = { dispatch: "orca", nativeOnly: "native" }
      let observed: { args: string[]; timeout: number } | null = null

      const result = await runResolvedRequest({
        resolved: snapshot,
        workflowRegistryPath: DOC_REVIEW_REGISTRY,
        execFile: async (_command: string, args: string[], options: { timeout: number }) => {
          if (args[0] === "run-request") {
            observed = { args, timeout: options.timeout }
            return { stdout: JSON.stringify(resultEnvelope()), stderr: "", exitCode: 0 }
          }
          return { stdout: JSON.stringify(validDocReviewResult()), stderr: "", exitCode: 0 }
        },
      })

      expect(result.action).toBe("orca")
      expect(observed).toEqual({
        args: expect.arrayContaining(["--wait", String(expectedWaitSeconds)]),
        timeout: (budget + 60) * 1_000,
      })
    }
  })

  test("rejects malformed confidential packet JSON before invoking Orca", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "ce-orca-invalid-packet-"))
    const packetPath = path.join(directory, "packet.json")
    await fs.writeFile(packetPath, '{"prompt":"invalid \\`backtick\\` escape"}', { mode: 0o600 })
    let calls = 0
    try {
      await expect(runResolvedRequest({
        resolved: resolved(),
        workflowRegistryPath: DOC_REVIEW_REGISTRY,
        packetPath,
        execFile: async () => {
          calls += 1
          return { stdout: "{}", stderr: "", exitCode: 0 }
        },
      })).rejects.toMatchObject({
        code: "invalid_packet_json",
        message: "Confidential packet must be valid JSON.",
      })
      expect(calls).toBe(0)
    } finally {
      await fs.rm(directory, { recursive: true, force: true })
    }
  })

  test("rejects oversized confidential packet sources before invoking Orca", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "ce-orca-oversized-packet-"))
    const packetPath = path.join(directory, "packet.json")
    await fs.writeFile(packetPath, "{}", { mode: 0o600 })
    await fs.truncate(packetPath, MAX_CONFIDENTIAL_PACKET_BYTES + 1)
    let calls = 0
    try {
      await expect(runResolvedRequest({
        resolved: resolved(),
        workflowRegistryPath: DOC_REVIEW_REGISTRY,
        packetPath,
        execFile: async () => {
          calls += 1
          return { stdout: "{}", stderr: "", exitCode: 0 }
        },
      })).rejects.toMatchObject({ code: "invalid_packet_source" })
      expect(calls).toBe(0)
    } finally {
      await fs.rm(directory, { recursive: true, force: true })
    }
  })

  test("gates controller inputs on the endpoint transport capability and forwards --inputs-dir", async () => {
    const capabilitiesEnvelope = (controllerInputs: unknown) => JSON.stringify({
      schema: "orca.capabilities/v1",
      state: "healthy",
      protocol: { version: "orca.local-protocol/v1", compatible: true, supportedRequestVersions: ["orca.execution-config/v1"] },
      capabilities: {
        lifecycle: { wait: true },
        results: { artifactRead: { supported: true, maxBytes: 8_388_608 } },
        transport: {
          confidentialPacket: { supported: true, delivery: "in-memory-consume-v1", sourceConsumption: "explicit-one-shot-v1" },
          ...(controllerInputs ? { controllerInputs } : {}),
        },
        targets: {},
      },
      issues: [],
    })
    const inputsDir = await fs.mkdtemp(path.join(os.tmpdir(), "ce-orca-inputs-"))
    try {
      let runArgs: string[] = []
      const result = await runResolvedRequest({
        resolved: resolved(),
        workflowRegistryPath: DOC_REVIEW_REGISTRY,
        inputsDir,
        execFile: async (_command: string, args: string[]) => {
          if (args[0] === "capabilities") {
            return { stdout: capabilitiesEnvelope({ supported: true, maxFiles: 32, maxBytes: 8_388_608, delivery: "private-node-copy-v1" }), stderr: "", exitCode: 0 }
          }
          if (args[0] === "run-request") {
            runArgs = [...args]
            return { stdout: JSON.stringify(resultEnvelope()), stderr: "", exitCode: 0 }
          }
          return { stdout: JSON.stringify(validDocReviewResult()), stderr: "", exitCode: 0 }
        },
      })
      expect(result.action).toBe("orca")
      expect(runArgs[runArgs.indexOf("--inputs-dir") + 1]).toBe(inputsDir)

      // An endpoint that does not attest private-node-copy-v1 controller
      // inputs must fail closed before any run-request is issued.
      let runRequestCalls = 0
      await expect(runResolvedRequest({
        resolved: resolved(),
        workflowRegistryPath: DOC_REVIEW_REGISTRY,
        inputsDir,
        execFile: async (_command: string, args: string[]) => {
          if (args[0] === "capabilities") return { stdout: capabilitiesEnvelope(null), stderr: "", exitCode: 0 }
          if (args[0] === "run-request") runRequestCalls += 1
          return { stdout: JSON.stringify(resultEnvelope()), stderr: "", exitCode: 0 }
        },
      })).rejects.toMatchObject({ code: "controller_inputs_unsupported" })
      expect(runRequestCalls).toBe(0)
    } finally {
      await fs.rm(inputsDir, { recursive: true, force: true })
    }
  })

  test("reuses the worktree attested during resolution when dispatch has no override", async () => {
    let args: string[] = []
    await runResolvedRequest({
      resolved: resolved(),
      workflowRegistryPath: DOC_REVIEW_REGISTRY,
      execFile: async (_command: string, nextArgs: string[]) => {
        if (nextArgs[0] === "run-request") {
          args = nextArgs
          return { stdout: JSON.stringify(resultEnvelope()), stderr: "", exitCode: 0 }
        }
        return { stdout: JSON.stringify(validDocReviewResult()), stderr: "", exitCode: 0 }
      },
    })
    expect(args[args.indexOf("--worktree") + 1]).toBe("path:/resolved-repo")
  })

  test("hydrates child artifacts through the opaque artifact-read operation", async () => {
    const nodeRef = "reviewers/security.json"
    const publishedNodeRef = `runs/20260711-120000-abcd/${nodeRef}`
    const response = resultEnvelope()
    response.refs.artifacts.push(publishedNodeRef)
    const calls: string[] = []
    const result = await runResolvedRequest({
      resolved: resolved(),
      workflowRegistryPath: DOC_REVIEW_REGISTRY,
      execFile: async (_command: string, args: string[]) => {
        calls.push(args.join(" "))
        if (args[0] === "run-request") return { stdout: JSON.stringify(response), stderr: "", exitCode: 0 }
        if (args[0] === "artifact-read" && args[2].endsWith("/ce-result.json")) {
          return {
            stdout: JSON.stringify({
              schema: "ce-orca.doc-review-result/v1",
              workflowId: "ce-doc-review",
              status: "completed",
              reviewers: [{ stage: "persona-review", role: "security", required: true, status: "completed", artifactRef: nodeRef }],
              failures: [],
            }),
            stderr: "",
            exitCode: 0,
          }
        }
        if (args[0] === "artifact-read" && args[2] === publishedNodeRef) {
          return { stdout: JSON.stringify({ schema: "ce-orca.reviewer-artifact/v1", output: { findings: [] } }), stderr: "", exitCode: 0 }
        }
        throw new Error(`unexpected command: ${args.join(" ")}`)
      },
    })

    expect(result.result.artifacts[nodeRef]).toEqual({
      schema: "ce-orca.reviewer-artifact/v1",
      output: { findings: [] },
    })
    expect(calls.filter((call) => call.startsWith("artifact-read "))).toEqual([
      "artifact-read 20260711-120000-abcd runs/20260711-120000-abcd/ce-result.json",
      `artifact-read 20260711-120000-abcd ${publishedNodeRef}`,
    ])
  })

  test("rejects every violated JSON Schema assertion declared by distributed result contracts", async () => {
    const missingFailures: any = validDocReviewResult()
    delete missingFailures.failures
    const reviewer = {
      stage: "persona-review",
      role: "security",
      required: true,
      status: "completed",
      artifactRef: "reviewers/security.json",
    }
    const cases: any[] = [
      { result: { ...validDocReviewResult(), status: "complete" }, instancePath: "/status", keyword: "enum" },
      { result: missingFailures, instancePath: "", keyword: "required" },
      { result: { ...validDocReviewResult(), reviewers: {} }, instancePath: "/reviewers", keyword: "type" },
      { result: { ...validDocReviewResult(), unexpected: true }, instancePath: "", keyword: "additionalProperties" },
      { result: { ...validDocReviewResult(), reviewers: [{ ...reviewer, stage: "wrong" }] }, instancePath: "/reviewers/0/stage", keyword: "const" },
      { result: { ...validDocReviewResult(), reviewers: [{ ...reviewer, artifactRef: "../secret.json" }] }, instancePath: "/reviewers/0/artifactRef", keyword: "pattern" },
      {
        snapshot: resolved({ workflowId: "ce-plan" }),
        registry: PLAN_REGISTRY,
        result: {
          schema: "ce-orca.read-result/v1",
          workflowId: "ce-plan",
          status: "completed",
          ownership: { selection: "ce-controller", dispatch: "orca", synthesis: "ce-controller" },
          nodes: [],
          failures: [],
        },
        instancePath: "/nodes",
        keyword: "minItems",
      },
    ]

    for (const testCase of cases) {
      let caught: any = null
      try {
        await runResolvedRequest({
          resolved: testCase.snapshot || resolved(),
          workflowRegistryPath: testCase.registry || DOC_REVIEW_REGISTRY,
          execFile: async (_command: string, args: string[]) => args[0] === "run-request"
            ? { stdout: JSON.stringify(resultEnvelope()), stderr: "", exitCode: 0 }
            : { stdout: JSON.stringify(testCase.result), stderr: "", exitCode: 0 },
        })
      } catch (error) {
        caught = error
      }
      expect(caught).toBeInstanceOf(ExecutionResolutionError)
      expect(caught.code).toBe("invalid_result_contract")
      expect(caught.details.errors).toEqual(expect.arrayContaining([
        expect.objectContaining({ instancePath: testCase.instancePath, keyword: testCase.keyword }),
      ]))
    }
  })

  test("fails closed before dispatch when a distributed contract adds an unsupported keyword", async () => {
    const skillRoot = await fs.mkdtemp(path.join(os.tmpdir(), "ce-orca-contract-"))
    const scriptsDir = path.join(skillRoot, "scripts")
    const referencesDir = path.join(skillRoot, "references")
    const registryPath = path.join(scriptsDir, "orca-workflow-registry.json")
    const schemaPath = path.join(referencesDir, "orca-result.schema.json")
    let calls = 0
    try {
      await Promise.all([
        fs.mkdir(scriptsDir, { recursive: true }),
        fs.mkdir(referencesDir, { recursive: true }),
      ])
      await fs.copyFile(DOC_REVIEW_REGISTRY, registryPath)
      const schema = JSON.parse(await fs.readFile(path.join(ROOT, "skills", "ce-doc-review", "references", "orca-result.schema.json"), "utf8"))
      schema.properties.status.minLength = 1
      await fs.writeFile(schemaPath, JSON.stringify(schema), "utf8")

      let caught: any = null
      try {
        await runResolvedRequest({
          resolved: resolved(),
          workflowRegistryPath: registryPath,
          execFile: async () => { calls += 1; return {} as any },
        })
      } catch (error) {
        caught = error
      }
      expect(caught).toMatchObject({ code: "invalid_result_contract" })
      expect(caught.details.errors).toEqual(expect.arrayContaining([
        expect.objectContaining({ keyword: "minLength" }),
      ]))
      expect(calls).toBe(0)
    } finally {
      await fs.rm(skillRoot, { recursive: true, force: true })
    }
  })

  test("requires exact result schema and selected workflow identities", async () => {
    const cases = [
      {
        snapshot: resolved(),
        registry: DOC_REVIEW_REGISTRY,
        result: { ...validDocReviewResult(), schema: "ce-orca.read-result/v1" },
        instancePath: "/schema",
      },
      {
        snapshot: resolved({ workflowId: "ce-plan" }),
        registry: PLAN_REGISTRY,
        result: {
          schema: "ce-orca.read-result/v1",
          workflowId: "ce-code-review",
          status: "completed",
          ownership: { selection: "ce-controller", dispatch: "orca", synthesis: "ce-controller" },
          nodes: [{ id: "scope", stage: "research", role: "researcher", required: true, status: "completed", artifactRef: "nodes/scope.json" }],
          failures: [],
        },
        instancePath: "/workflowId",
      },
    ]

    for (const testCase of cases) {
      let caught: any = null
      try {
        await runResolvedRequest({
          resolved: testCase.snapshot,
          workflowRegistryPath: testCase.registry,
          execFile: async (_command: string, args: string[]) => args[0] === "run-request"
            ? { stdout: JSON.stringify(resultEnvelope()), stderr: "", exitCode: 0 }
            : { stdout: JSON.stringify(testCase.result), stderr: "", exitCode: 0 },
        })
      } catch (error) {
        caught = error
      }
      expect(caught).toBeInstanceOf(ExecutionResolutionError)
      expect(caught.code).toBe("invalid_result_contract")
      expect(caught.details.errors).toEqual(expect.arrayContaining([
        expect.objectContaining({ instancePath: testCase.instancePath, keyword: "identity" }),
      ]))
    }
  })

  test("never calls Orca for native and propagates terminal run failures", async () => {
    let calls = 0
    expect((await runResolvedRequest({ resolved: resolved({ selected: "native" }), execFile: async () => { calls += 1; return {} as any } })).action).toBe("native")
    expect(calls).toBe(0)
    const failed: any = new Error("exit 1")
    failed.stdout = JSON.stringify(resultEnvelope("failed"))
    await expect(runResolvedRequest({ resolved: resolved(), workflowRegistryPath: DOC_REVIEW_REGISTRY, execFile: async () => { throw failed } })).rejects.toMatchObject({ code: "orca_run_failed", details: { response: { state: "failed" } } })
  })

  test("surfaces the bounded terminal reason in Orca run failure messages", async () => {
    const response = {
      ...resultEnvelope("failed"),
      error: "confidential packet is not valid JSON",
      refs: { ...resultEnvelope("failed").refs, artifacts: [] },
    }
    await expect(runResolvedRequest({
      resolved: resolved(),
      workflowRegistryPath: DOC_REVIEW_REGISTRY,
      execFile: async () => ({ stdout: JSON.stringify(response), stderr: "", exitCode: 1 }),
    })).rejects.toMatchObject({
      code: "orca_run_failed",
      message: "Orca run ended failed: confidential packet is not valid JSON",
    })
  })

  test("turns a stopped Orca-owned LFG stage into a hard boundary before shipping", async () => {
    const response = resultEnvelope("stopped")
    response.refs.artifacts = []
    let shippingCalls = 0
    let artifactReads = 0

    const lfgController = async () => {
      await runResolvedRequest({
        resolved: resolved({ workflowId: "lfg" }),
        workflowRegistryPath: LFG_REGISTRY,
        execFile: async (_command: string, args: string[]) => {
          if (args[0] === "run-request") {
            return { stdout: JSON.stringify(response), stderr: "", exitCode: 1 }
          }
          artifactReads += 1
          return { stdout: "{}", stderr: "", exitCode: 0 }
        },
      })
      shippingCalls += 1
    }

    await expect(lfgController()).rejects.toMatchObject({
      code: "orca_run_failed",
      details: { response: { state: "stopped", terminal: true } },
    })
    expect(shippingCalls).toBe(0)
    expect(artifactReads).toBe(0)
  })

  test("preserves completed artifacts on a terminal failed run", async () => {
    const nodeRef = "reviewers/security.json"
    const response = resultEnvelope("failed")
    response.refs.artifacts.push(`runs/${response.runId}/${nodeRef}`)
    const commandError: any = new Error("exit 1")
    commandError.stdout = JSON.stringify(response)
    const execution = runResolvedRequest({
      resolved: resolved(),
      workflowRegistryPath: DOC_REVIEW_REGISTRY,
      execFile: async (_command: string, args: string[]) => {
        if (args[0] === "run-request") throw commandError
        if (args[0] === "artifact-read" && args[2].endsWith("/ce-result.json")) {
          return {
            stdout: JSON.stringify({
              schema: "ce-orca.doc-review-result/v1",
              workflowId: "ce-doc-review",
              status: "completed",
              reviewers: [{
                stage: "persona-review",
                role: "security",
                required: true,
                status: "completed",
                artifactRef: nodeRef,
              }],
              failures: [],
            }),
            stderr: "",
            exitCode: 0,
          }
        }
        if (args[0] === "artifact-read" && args[2].endsWith(nodeRef)) {
          return { stdout: JSON.stringify({ output: { findings: ["kept"] } }), stderr: "", exitCode: 0 }
        }
        throw new Error(`unexpected command: ${args.join(" ")}`)
      },
    })

    await expect(execution).rejects.toMatchObject({
      code: "orca_run_failed",
      details: {
        response: { state: "failed" },
        result: {
          value: {
            schema: "ce-orca.doc-review-result/v1",
            workflowId: "ce-doc-review",
            status: "completed",
            reviewers: [{
              stage: "persona-review",
              role: "security",
              required: true,
              status: "completed",
              artifactRef: nodeRef,
            }],
            failures: [],
          },
          artifacts: { [nodeRef]: { output: { findings: ["kept"] } } },
        },
      },
    })
  })

  test("keeps readable failed-run artifacts when a sibling artifact cannot be hydrated", async () => {
    const readableRef = "reviewers/security.json"
    const missingRef = "reviewers/reliability.json"
    const response = resultEnvelope("failed")
    response.refs.artifacts.push(
      `runs/${response.runId}/${readableRef}`,
      `runs/${response.runId}/${missingRef}`,
    )
    const commandError: any = new Error("exit 1")
    commandError.stdout = JSON.stringify(response)
    const reviewers = [readableRef, missingRef].map((artifactRef) => ({
      stage: "persona-review",
      role: path.basename(artifactRef, ".json"),
      required: true,
      status: "completed",
      artifactRef,
    }))

    const execution = runResolvedRequest({
      resolved: resolved(),
      workflowRegistryPath: DOC_REVIEW_REGISTRY,
      execFile: async (_command: string, args: string[]) => {
        if (args[0] === "run-request") throw commandError
        if (args[2].endsWith("/ce-result.json")) {
          return {
            stdout: JSON.stringify({
              schema: "ce-orca.doc-review-result/v1",
              workflowId: "ce-doc-review",
              status: "completed",
              reviewers,
              failures: [],
            }),
            stderr: "",
            exitCode: 0,
          }
        }
        if (args[2].endsWith(readableRef)) {
          return { stdout: JSON.stringify({ output: { findings: ["kept"] } }), stderr: "", exitCode: 0 }
        }
        throw new Error("artifact disappeared")
      },
    })

    await expect(execution).rejects.toMatchObject({
      code: "orca_run_failed",
      details: {
        result: {
          artifacts: { [readableRef]: { output: { findings: ["kept"] } } },
          artifactErrors: [{
            artifactRef: missingRef,
            code: "artifact_read_failed",
          }],
        },
      },
    })
  })

  test("caps child artifacts before fan-out and bounds successful hydration concurrency", async () => {
    const makeReviewers = (count: number) => Array.from({ length: count }, (_, index) => ({
      stage: "persona-review",
      role: `reviewer-${index}`,
      required: true,
      status: "completed",
      artifactRef: `reviewers/reviewer-${index}.json`,
    }))
    const resultFor = (reviewers: ReturnType<typeof makeReviewers>) => ({
      schema: "ce-orca.doc-review-result/v1",
      workflowId: "ce-doc-review",
      status: "completed",
      reviewers,
      failures: [],
    })

    const oversizedReviewers = makeReviewers(65)
    const oversizedResponse = resultEnvelope()
    oversizedResponse.refs.artifacts.push(...oversizedReviewers.map(({ artifactRef }) =>
      `runs/${oversizedResponse.runId}/${artifactRef}`))
    let oversizedChildReads = 0
    await expect(runResolvedRequest({
      resolved: resolved(),
      workflowRegistryPath: DOC_REVIEW_REGISTRY,
      execFile: async (_command: string, args: string[]) => {
        if (args[0] === "run-request") return { stdout: JSON.stringify(oversizedResponse), stderr: "", exitCode: 0 }
        if (args[2].endsWith("/ce-result.json")) {
          return { stdout: JSON.stringify(resultFor(oversizedReviewers)), stderr: "", exitCode: 0 }
        }
        oversizedChildReads += 1
        return { stdout: "{}", stderr: "", exitCode: 0 }
      },
    })).rejects.toMatchObject({ code: "result_artifact_limit" })
    expect(oversizedChildReads).toBe(0)

    const reviewers = makeReviewers(12)
    const response = resultEnvelope()
    response.refs.artifacts.push(...reviewers.map(({ artifactRef }) =>
      `runs/${response.runId}/${artifactRef}`))
    let active = 0
    let maxActive = 0
    const hydrated = await runResolvedRequest({
      resolved: resolved(),
      workflowRegistryPath: DOC_REVIEW_REGISTRY,
      execFile: async (_command: string, args: string[]) => {
        if (args[0] === "run-request") return { stdout: JSON.stringify(response), stderr: "", exitCode: 0 }
        if (args[2].endsWith("/ce-result.json")) {
          return { stdout: JSON.stringify(resultFor(reviewers)), stderr: "", exitCode: 0 }
        }
        active += 1
        maxActive = Math.max(maxActive, active)
        await new Promise((resolve) => setTimeout(resolve, 5))
        active -= 1
        return { stdout: JSON.stringify({ ok: true }), stderr: "", exitCode: 0 }
      },
    })
    expect(Object.keys(hydrated.result.artifacts)).toHaveLength(12)
    expect(maxActive).toBe(4)
  })

  test("drains in-flight strict reads and stops scheduling after the first child failure", async () => {
    const reviewers = Array.from({ length: 8 }, (_, index) => ({
      stage: "persona-review",
      role: `reviewer-${index}`,
      required: true,
      status: "completed",
      artifactRef: `reviewers/reviewer-${index}.json`,
    }))
    const response = resultEnvelope()
    response.refs.artifacts.push(...reviewers.map(({ artifactRef }) =>
      `runs/${response.runId}/${artifactRef}`))
    let active = 0
    let started = 0

    await expect(runResolvedRequest({
      resolved: resolved(),
      workflowRegistryPath: DOC_REVIEW_REGISTRY,
      execFile: async (_command: string, args: string[]) => {
        if (args[0] === "run-request") return { stdout: JSON.stringify(response), stderr: "", exitCode: 0 }
        if (args[2].endsWith("/ce-result.json")) {
          return {
            stdout: JSON.stringify({
              schema: "ce-orca.doc-review-result/v1",
              workflowId: "ce-doc-review",
              status: "completed",
              reviewers,
              failures: [],
            }),
            stderr: "",
            exitCode: 0,
          }
        }
        started += 1
        active += 1
        if (args[2].endsWith("reviewer-0.json")) {
          active -= 1
          throw new Error("first child failed")
        }
        await new Promise((resolve) => setTimeout(resolve, 10))
        active -= 1
        return { stdout: "{}", stderr: "", exitCode: 0 }
      },
    })).rejects.toMatchObject({ code: "artifact_read_failed" })
    expect(started).toBeLessThanOrEqual(4)
    expect(active).toBe(0)
  })

  test("returns a resumable running result for a nonterminal client timeout without attempting hydration or redispatch", async () => {
    let runRequests = 0
    let artifactReads = 0
    const result = await runResolvedRequest({
      resolved: resolved(),
      workflowRegistryPath: DOC_REVIEW_REGISTRY,
      execFile: async (_command: string, args: string[]) => {
        if (args[0] === "run-request") {
          runRequests += 1
          const timeout: any = new Error("process timed out")
          timeout.killed = true
          timeout.stdout = JSON.stringify(resultEnvelope("timeout"))
          throw timeout
        }
        artifactReads += 1
        return { stdout: "{}", stderr: "", exitCode: 0 }
      },
    })
    expect(result).toMatchObject({
      schema: "ce-orca.dispatch/v1",
      action: "orca-running",
      response: { runId: "20260711-120000-abcd", state: "timeout", terminal: false },
    })
    expect(runRequests).toBe(1)
    expect(artifactReads).toBe(0)
  })

  test("resumes the same run without redispatch and hydrates its terminal result", async () => {
    let runRequests = 0
    let waits = 0
    let artifactReads = 0
    const execFile = async (_command: string, args: string[], options: { timeout: number }) => {
      if (args[0] === "run-request") {
        runRequests += 1
        const timeout: any = new Error("process timed out")
        timeout.stdout = JSON.stringify(resultEnvelope("timeout"))
        throw timeout
      }
      if (args[0] === "wait") {
        waits += 1
        expect(args).toEqual(["wait", "20260711-120000-abcd", "--timeout", "75"])
        expect(options.timeout).toBe(105_000)
        return { stdout: JSON.stringify(resultEnvelope()), stderr: "", exitCode: 0 }
      }
      artifactReads += 1
      expect(args).toEqual(["artifact-read", "20260711-120000-abcd", "runs/20260711-120000-abcd/ce-result.json"])
      return { stdout: JSON.stringify(validDocReviewResult()), stderr: "", exitCode: 0 }
    }
    const running = await runResolvedRequest({
      resolved: resolved(),
      workflowRegistryPath: DOC_REVIEW_REGISTRY,
      execFile,
    })

    const resumed = await resumeOrcaRun({
      dispatch: running,
      workflowRegistryPath: DOC_REVIEW_REGISTRY,
      waitSeconds: 75,
      execFile,
    })

    expect(resumed).toMatchObject({
      schema: "ce-orca.dispatch/v1",
      action: "orca",
      response: { runId: "20260711-120000-abcd", state: "succeeded", terminal: true },
      result: { value: validDocReviewResult(), artifacts: {} },
    })
    expect(runRequests).toBe(1)
    expect(waits).toBe(1)
    expect(artifactReads).toBe(1)
  })

  test("keeps a resumed run resumable when the same run is still nonterminal", async () => {
    let runRequests = 0
    let waits = 0
    let artifactReads = 0
    const execFile = async (_command: string, args: string[]) => {
      if (args[0] === "run-request") {
        runRequests += 1
        const timeout: any = new Error("process timed out")
        timeout.stdout = JSON.stringify(resultEnvelope("timeout"))
        throw timeout
      }
      if (args[0] === "wait") {
        waits += 1
        expect(args[1]).toBe("20260711-120000-abcd")
        const timeout: any = new Error("wait timed out")
        timeout.stdout = JSON.stringify(resultEnvelope("timeout"))
        throw timeout
      }
      artifactReads += 1
      return { stdout: "{}", stderr: "", exitCode: 0 }
    }
    const running = await runResolvedRequest({
      resolved: resolved(),
      workflowRegistryPath: DOC_REVIEW_REGISTRY,
      execFile,
    })

    const resumed = await resumeOrcaRun({
      dispatch: running,
      workflowRegistryPath: DOC_REVIEW_REGISTRY,
      waitSeconds: 1,
      execFile,
    })

    expect(resumed).toMatchObject({
      schema: "ce-orca.dispatch/v1",
      action: "orca-running",
      response: { runId: "20260711-120000-abcd", state: "timeout", terminal: false },
    })
    expect(runRequests).toBe(1)
    expect(waits).toBe(1)
    expect(artifactReads).toBe(0)
  })

  test("rejects a wait result for a different run before hydration", async () => {
    const running = {
      schema: "ce-orca.dispatch/v1",
      action: "orca-running",
      response: resultEnvelope("timeout"),
      display: { workflowId: "ce-doc-review", stages: {}, ownership: {} },
    }
    const wrongRun = resultEnvelope()
    wrongRun.runId = "20260711-120000-dead"
    wrongRun.refs = {
      run: "runs/20260711-120000-dead",
      log: "runs/20260711-120000-dead/run.log",
      events: "runs/20260711-120000-dead/events.jsonl",
      artifacts: ["runs/20260711-120000-dead/ce-result.json"],
    }
    let artifactReads = 0

    await expect(resumeOrcaRun({
      dispatch: running,
      workflowRegistryPath: DOC_REVIEW_REGISTRY,
      execFile: async (_command: string, args: string[]) => {
        if (args[0] === "wait") return { stdout: JSON.stringify(wrongRun), stderr: "", exitCode: 0 }
        artifactReads += 1
        return { stdout: "{}", stderr: "", exitCode: 0 }
      },
    })).rejects.toMatchObject({ code: "invalid_orca_response" })
    expect(artifactReads).toBe(0)
  })

  test("persists CLI resume output while invoking only wait and artifact-read", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "ce-orca-resume-cli-"))
    try {
      const dispatchPath = path.join(directory, "dispatch.json")
      const logPath = path.join(directory, "calls.jsonl")
      const fakeOrca = path.join(directory, "orca-orch")
      await fs.writeFile(dispatchPath, JSON.stringify({
        schema: "ce-orca.dispatch/v1",
        action: "orca-running",
        response: resultEnvelope("timeout"),
        display: { workflowId: "ce-doc-review", stages: {}, ownership: {} },
      }), { mode: 0o600 })
      await fs.writeFile(fakeOrca, `#!/usr/bin/env node
const fs = require("node:fs")
const args = process.argv.slice(2)
fs.appendFileSync(process.env.CE_ORCA_FAKE_LOG, JSON.stringify(args) + "\\n")
if (args[0] === "wait") {
  process.stdout.write(JSON.stringify(${JSON.stringify(resultEnvelope())}))
} else if (args[0] === "artifact-read") {
  process.stdout.write(JSON.stringify(${JSON.stringify(validDocReviewResult())}))
} else {
  process.stderr.write("unexpected operation: " + args[0])
  process.exitCode = 9
}
`, { mode: 0o700 })

      const runtime = path.join(ROOT, "skills", "ce-doc-review", "scripts", "orca-runtime.mjs")
      const child = Bun.spawn([
        "node",
        runtime,
        "resume",
        "--dispatch",
        dispatchPath,
        "--registry",
        DOC_REVIEW_REGISTRY,
        "--wait",
        "2",
        "--out",
        dispatchPath,
      ], {
        cwd: ROOT,
        env: { ...Bun.env, CE_ORCA_COMMAND: fakeOrca, CE_ORCA_FAKE_LOG: logPath },
        stdout: "pipe",
        stderr: "pipe",
      })
      const [exitCode, stdout, stderr] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ])

      expect(exitCode, stderr).toBe(0)
      const returned = JSON.parse(stdout)
      const persisted = JSON.parse(await fs.readFile(dispatchPath, "utf8"))
      expect(persisted).toEqual(returned)
      expect(returned).toMatchObject({
        action: "orca",
        response: { runId: "20260711-120000-abcd", state: "succeeded" },
        result: { value: validDocReviewResult() },
      })
      expect((await fs.stat(dispatchPath)).mode & 0o777).toBe(0o600)
      const calls = (await fs.readFile(logPath, "utf8")).trim().split("\n").map((line) => JSON.parse(line))
      expect(calls).toEqual([
        ["wait", "20260711-120000-abcd", "--timeout", "2"],
        ["artifact-read", "20260711-120000-abcd", "runs/20260711-120000-abcd/ce-result.json"],
      ])
    } finally {
      await fs.rm(directory, { recursive: true, force: true })
    }
  })

  test("rejects non-terminal and cross-run success envelopes before artifact reads", async () => {
    const cases: any[] = []
    const nonTerminal = resultEnvelope()
    nonTerminal.terminal = false
    cases.push(nonTerminal)
    const invalidRunId = resultEnvelope()
    invalidRunId.runId = "../escape"
    cases.push(invalidRunId)
    const crossRun = resultEnvelope()
    crossRun.refs.artifacts[0] = "runs/20260711-120000-dead/ce-result.json"
    cases.push(crossRun)
    const duplicatePrimary = resultEnvelope()
    duplicatePrimary.refs.artifacts.push(duplicatePrimary.refs.artifacts[0])
    cases.push(duplicatePrimary)
    const malformedRefs = resultEnvelope()
    malformedRefs.refs.artifacts = {} as any
    cases.push(malformedRefs)
    const nullArtifact = resultEnvelope()
    nullArtifact.refs.artifacts.push(null as any)
    cases.push(nullArtifact)

    for (const response of cases) {
      let artifactReads = 0
      await expect(runResolvedRequest({
        resolved: resolved(),
        workflowRegistryPath: DOC_REVIEW_REGISTRY,
        execFile: async (_command: string, args: string[]) => {
          if (args[0] === "run-request") return { stdout: JSON.stringify(response), stderr: "", exitCode: 0 }
          artifactReads += 1
          return { stdout: "{}", stderr: "", exitCode: 0 }
        },
      })).rejects.toMatchObject({ code: "invalid_orca_response" })
      expect(artifactReads).toBe(0)
    }
  })

  test("rejects malformed success responses instead of guessing", async () => {
    try {
      await runResolvedRequest({ resolved: resolved(), workflowRegistryPath: DOC_REVIEW_REGISTRY, execFile: async () => ({ stdout: JSON.stringify({ ok: true, runId: "x" }) }) as any })
      throw new Error("expected failure")
    } catch (error) {
      expect(error).toBeInstanceOf(ExecutionResolutionError)
      expect((error as ExecutionResolutionError).code).toBe("invalid_orca_response")
    }
  })
})
