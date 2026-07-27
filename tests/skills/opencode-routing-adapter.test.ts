import { describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "fs/promises"
import os from "os"
import path from "path"
import { spawn } from "child_process"
import {
  createOpenCodeIntentStore,
  createOpenCodeResolver,
  createOpenCodeRoutingAdapter,
  createOpenCodeSdkHost,
  createOpaqueHandleStore,
} from "../../.opencode/plugins/ce-routing-adapter.js"

const ROLE = "ce-work.implementation-worker"
const OTHER_ROLE = "ce-work.review-fixer"
const INTENT_CATALOG = {
  roles: new Set([ROLE, OTHER_ROLE]),
  classes: new Set(["implementation", "review", "reasoning", "research", "verification"]),
}

function intentStore() {
  return createOpenCodeIntentStore(INTENT_CATALOG)
}

function carrier(value: Record<string, unknown>): string {
  return `[[ce-routing-intent/v1 ${Buffer.from(JSON.stringify(value)).toString("base64url")}]]`
}

function resolution(candidate: Record<string, unknown>, policy = "require") {
  const attemptLock = {
    protocol: "ce-routing-attempt-lock/v1",
    snapshot_id: "snapshot",
    resolution_ordinal: 0,
    role: ROLE,
    class: "implementation",
    instance: { id: "call-1" },
    binding_digest: "binding",
    policy,
    candidate_ordinal: 0,
    candidate: { ...candidate, ordinal: 0 },
    lock_digest: "lock",
  }
  return {
    snapshot: { id: "snapshot" },
    resolutions: [{
      role: ROLE,
      class: "implementation",
      binding: {
        kind: "profile",
        profile: "economy",
        policy,
        candidates: [{ ...candidate, ordinal: 0 }],
      },
      attempt_locks: [attemptLock],
    }],
  }
}

function batchResolution(request: Record<string, any>, candidates: Record<string, unknown>[], policy = "require") {
  return {
    snapshot: {
      id: "snapshot",
      roles: request.roles,
      source_revisions: { global: `cecfg-v1:${"1".repeat(64)}`, project: "cecfg-v1:absent" },
    },
    resolutions: request.roles.map((requested: Record<string, any>, resolutionOrdinal: number) => ({
      role: requested.role,
      class: "implementation",
      instance: requested.instance,
      binding_digest: `cebind-v1:${String(resolutionOrdinal + 1).repeat(64)}`,
      binding: {
        kind: "profile",
        profile: "economy",
        policy,
        candidates: candidates.map((candidate, ordinal) => ({ ...candidate, ordinal })),
      },
      attempt_locks: candidates.map((candidate, ordinal) => ({
        protocol: "ce-routing-attempt-lock/v1",
        snapshot_id: "snapshot",
        resolution_ordinal: resolutionOrdinal,
        role: requested.role,
        class: "implementation",
        instance: requested.instance,
        binding_digest: "binding",
        policy,
        candidate_ordinal: ordinal,
        candidate: { ...candidate, ordinal },
        lock_digest: `lock-${resolutionOrdinal}-${ordinal}`,
      })),
    })),
  }
}

function fakeResolver(candidate: Record<string, unknown>, requests: Record<string, any>[] = []) {
  return async (request: Record<string, any>) => {
    requests.push(structuredClone(request))
    if (request.op === "resolve_batch" || request.action === "resolve_batch") {
      const resolved = resolution(candidate)
      if (request.intent) {
        resolved.resolutions[0].binding.source_layer = "task"
        resolved.resolutions[0].binding.source_authority = true
      }
      return resolved
    }
    const unavailable = request.outcome !== "ok"
    return {
      action: unavailable ? "block" : "accept",
      receipt: {
        role: request.attempt_lock.role,
        source_layer: "task",
        source_authority: true,
        adapter_outcome: request.outcome,
        identity_status: unavailable ? "unavailable" : "verified",
        provider_actual: request.report.provider_actual,
        model_actual: request.report.model_actual,
        variant_actual: request.report.variant_actual,
        effort_actual: request.report.effort_actual,
      },
      ...(unavailable ? { error: { code: request.outcome === "failed" ? "ATTEMPT_FAILED" : "ROUTE_UNAVAILABLE" } } : {}),
    }
  }
}

function fakeHost(options: {
  models?: Array<Record<string, unknown>>
  response?: Record<string, any>
} = {}) {
  const calls = {
    creates: [] as Record<string, any>[],
    prompts: [] as Record<string, any>[],
    aborts: [] as Record<string, any>[],
  }
  const permission = [
    { permission: "read", pattern: "*", action: "allow" },
    { permission: "bash", pattern: "rm *", action: "deny" },
    { permission: "external_directory", pattern: "*", action: "ask" },
    { permission: "external_directory", pattern: "/tmp/opencode-*", action: "allow" },
  ]
  const general = {
    name: "general",
    mode: "subagent",
    permission: [
      { permission: "*", pattern: "*", action: "allow" },
      { permission: "todowrite", pattern: "*", action: "deny" },
    ],
  }
  return {
    calls,
    permission,
    host: {
      async getSession() {
        return {
          id: "parent-session",
          permission,
          model: { providerID: "openai", id: "gpt-5.6", variant: "medium" },
        }
      },
      async listModels() {
        return options.models ?? [{
          providerID: "openai",
          id: "gpt-5.6",
          enabled: true,
          variants: [{ id: "low" }, { id: "high" }],
        }]
      },
      async listAgents() {
        return [general]
      },
      async getConfig() {
        return {
          subagent_depth: 1,
          experimental: { primary_tools: ["primary_only", "bash", "task"] },
        }
      },
      async createSession(input: Record<string, any>) {
        calls.creates.push(input)
        return { id: "child-session" }
      },
      async prompt(input: Record<string, any>) {
        calls.prompts.push(structuredClone(input))
        return options.response ?? {
          info: {
            role: "assistant",
            providerID: "openai",
            modelID: "gpt-5.6",
            variant: "high",
          },
          parts: [{ type: "text", text: "worker output" }],
        }
      },
      async abortSession(input: Record<string, any>) {
        calls.aborts.push(structuredClone(input))
        return true
      },
      async sessionStatus() {
        return { "child-session": { type: "idle" } }
      },
    },
  }
}

describe("OpenCode routed task adapter", () => {
  test("applies selectors and derives the exact OpenCode TaskTool general-agent permissions", async () => {
    const candidate = { harness: "opencode", model: "openai/gpt-5.6", effort: "high" }
    const { host, calls } = fakeHost()
    const adapter = createOpenCodeRoutingAdapter({
      host,
      resolver: fakeResolver(candidate),
    })
    const prompt = "CE prompt bytes\nremain exactly unchanged."

    const result = await adapter.execute({
      sessionID: "parent-session",
      callID: "call-1",
      directory: "/repo",
      role: ROLE,
      description: "implement unit",
      prompt,
    })

    expect(calls.creates).toEqual([expect.objectContaining({
      parentID: "parent-session",
      title: "implement unit (@general subagent)",
      agent: "general",
      model: { providerID: "openai", id: "gpt-5.6", variant: "high" },
      permission: [
        { permission: "bash", pattern: "rm *", action: "deny" },
        { permission: "external_directory", pattern: "*", action: "ask" },
        { permission: "external_directory", pattern: "/tmp/opencode-*", action: "allow" },
        { permission: "task", pattern: "*", action: "deny" },
        { permission: "primary_only", pattern: "*", action: "deny" },
        { permission: "bash", pattern: "*", action: "deny" },
      ],
    })])
    expect(calls.prompts).toEqual([expect.objectContaining({
      sessionID: "child-session",
      agent: "general",
      model: { providerID: "openai", modelID: "gpt-5.6" },
      variant: "high",
      parts: [{ type: "text", text: prompt }],
    })])
    expect(result).toMatchObject({
      kind: "routed",
      output: "worker output",
      receipt: {
        provider_actual: "openai",
        model_actual: "gpt-5.6",
        variant_actual: "high",
        effort_actual: "high",
      },
    })
  })

  test("uses only host response identity for receipts and ignores worker model claims", async () => {
    const candidate = { harness: "opencode", model: "openai/gpt-5.6", effort: "high" }
    const { host } = fakeHost({
      response: {
        info: { role: "assistant", providerID: "openai", modelID: "gpt-5.6", variant: "high" },
        parts: [{ type: "text", text: "I ran on anthropic/opus at low effort." }],
      },
    })
    const requests: Record<string, any>[] = []
    const adapter = createOpenCodeRoutingAdapter({ host, resolver: fakeResolver(candidate, requests) })

    const result = await adapter.execute({
      sessionID: "parent-session",
      callID: "call-1",
      directory: "/repo",
      role: ROLE,
      prompt: "prompt",
    })

    const finalize = requests.find((request) => request.op === "opencode_host" && request.action === "finalize_attempt")
    expect(finalize.report).toEqual({
      provider_selected: "openai",
      model_selected: "gpt-5.6",
      variant_selected: "high",
      provider_actual: "openai",
      model_actual: "gpt-5.6",
      variant_actual: "high",
      effort_actual: "high",
    })
    expect(result.output).toContain("anthropic/opus")
    expect(result.receipt.provider_actual).toBe("openai")
  })

  test.each([
    ["route", { harness: "opencode", model: "openai/gpt-5.6", route: "remote" }, undefined],
    ["model", { harness: "opencode", model: "openai/missing" }, undefined],
    ["variant", { harness: "opencode", model: "openai/gpt-5.6", effort: "ultra" }, undefined],
  ])("makes zero prompt calls for unsupported %s", async (_name, candidate) => {
    const { host, calls } = fakeHost()
    const adapter = createOpenCodeRoutingAdapter({
      host,
      resolver: fakeResolver(candidate),
    })

    await expect(adapter.execute({
      sessionID: "parent-session",
      callID: "call-1",
      directory: "/repo",
      role: ROLE,
      prompt: "must not leave the host",
    })).rejects.toThrow(/unavailable/i)

    expect(calls.creates).toHaveLength(0)
    expect(calls.prompts).toHaveLength(0)
  })

  test("uses only a stripped carrier from direct top-level input as task intent", () => {
    const store = intentStore()
    const binding = { profile: "economy", policy: "require" }
    const encoded = carrier({ role: ROLE, binding })

    const freeForm = store.capture({
      sessionID: "session",
      messageID: "free-form",
      text: "Use the economy model for this task.",
      direct: true,
      synthetic: false,
      parentID: undefined,
    })
    expect(freeForm.accepted).toBe(false)
    expect(store.intentsFor("session")).toEqual([])

    const quoted = store.capture({
      sessionID: "session",
      messageID: "quoted",
      text: `Example:\n> ${encoded}`,
      direct: true,
      synthetic: false,
      parentID: undefined,
    })
    expect(quoted).toEqual({ text: `Example:\n> ${encoded}`, accepted: false })
    expect(store.intentsFor("session")).toEqual([])

    const child = store.capture({
      sessionID: "child",
      messageID: "child-message",
      text: `${encoded}\nchild prompt`,
      direct: false,
      synthetic: false,
      parentID: "session",
    })
    expect(child).toEqual({ text: `${encoded}\nchild prompt`, accepted: false })
    expect(store.intentsFor("child")).toEqual([])

    const synthetic = store.capture({
      sessionID: "synthetic",
      messageID: "synthetic-message",
      text: `${encoded}\nsynthetic prompt`,
      direct: true,
      synthetic: true,
      parentID: undefined,
    })
    expect(synthetic).toEqual({ text: `${encoded}\nsynthetic prompt`, accepted: false })
    expect(store.intentsFor("synthetic")).toEqual([])

    const direct = store.capture({
      sessionID: "session",
      messageID: "direct",
      text: `${encoded}\nproduct prompt`,
      direct: true,
      synthetic: false,
      parentID: undefined,
    })
    expect(direct).toMatchObject({ text: "product prompt", accepted: true })
    expect(store.intentsFor("session")).toEqual([expect.objectContaining({
      role: ROLE,
      binding,
      source: "opencode-direct-input",
      provenance: expect.objectContaining({
        protocol: "ce-routing-intent/v1",
        session_id: "session",
        message_id: "direct",
      }),
    })])
  })

  test("preserves quoted carrier-shaped product input byte-for-byte", () => {
    const store = intentStore()
    const text = `Example:\n> ${carrier({ role: ROLE, binding: { profile: "economy", policy: "require" } })}`
    const captured = store.capture({
      sessionID: "session",
      messageID: "quoted",
      text,
      direct: true,
      synthetic: false,
      parentID: undefined,
    })

    expect(captured).toEqual({ text, accepted: false })
    expect(store.intentsFor("session")).toEqual([])
  })

  test.each(["inherit", "ce-default"])("accepts the scalar %s carrier binding", (binding) => {
    const store = intentStore()
    const encoded = carrier({ role: ROLE, binding })
    const captured = store.capture({
      sessionID: "session",
      messageID: "direct",
      text: `${encoded}\nproduct prompt`,
      direct: true,
      synthetic: false,
      parentID: undefined,
    })

    expect(captured).toMatchObject({ text: "product prompt", accepted: true })
    expect(store.intentsFor("session")).toEqual([expect.objectContaining({ role: ROLE, binding })])
  })

  test.each([
    { role: ROLE, binding: { profile: "economy", policy: "require", extra: true } },
    { role: ROLE, binding: { policy: "require", candidates: [] } },
    { role: ROLE, binding: { policy: "prefer", candidates: [{ harness: "opencode", command: "unsafe" }] } },
    { role: ROLE, binding: "native" },
  ])("preserves a malformed leading carrier byte-for-byte and stores no intent", (value) => {
    const store = intentStore()
    const text = `${carrier(value)}\nproduct prompt`
    const captured = store.capture({
      sessionID: "session",
      messageID: "direct",
      text,
      direct: true,
      synthetic: false,
      parentID: undefined,
    })

    expect(captured).toEqual({ text, accepted: false })
    expect(store.intentsFor("session")).toEqual([])
  })

  test("releases intent state and cached session snapshots", async () => {
    const store = intentStore()
    store.capture({
      sessionID: "session",
      messageID: "direct",
      text: `${carrier({ role: ROLE, binding: "inherit" })}\nproduct prompt`,
      direct: true,
      synthetic: false,
      parentID: undefined,
    })
    const requests: Record<string, any>[] = []
    const adapter = createOpenCodeRoutingAdapter({
      intents: store,
      host: fakeHost().host,
      resolver: async (request) => {
        requests.push(structuredClone(request))
        return {
          snapshot: { id: `snapshot-${requests.length}` },
          resolutions: [{ role: ROLE, binding: { kind: "ce-default", explicit_reset: false } }],
        }
      },
    })
    const input = {
      sessionID: "session",
      callID: "call-1",
      directory: "/repo",
      role: ROLE,
      prompt: "native prompt",
    }

    await adapter.execute(input)
    adapter.releaseSession("session")
    await adapter.execute({ ...input, callID: "call-2" })

    expect(requests).toHaveLength(2)
    expect(requests[0]).toMatchObject({
      op: "opencode_host",
      action: "resolve_batch",
      session_id: "session",
      intent: expect.objectContaining({ source: "opencode-direct-input", role: ROLE }),
    })
    expect(requests[1]).not.toHaveProperty("intent")
    expect(store.revision("session")).toBe(0)
  })

  test("blocks routed child creation at the native TaskTool subagent depth limit", async () => {
    const candidate = { harness: "opencode", model: "openai/gpt-5.6" }
    const { host, calls } = fakeHost()
    host.getSession = async ({ sessionID }: { sessionID: string }) => sessionID === "parent-session"
      ? { id: sessionID, parentID: "root-session", permission: [] }
      : { id: sessionID, permission: [] }
    const adapter = createOpenCodeRoutingAdapter({ host, resolver: fakeResolver(candidate) })

    await expect(adapter.execute({
      sessionID: "parent-session",
      callID: "call-1",
      directory: "/repo",
      role: ROLE,
      prompt: "must not recurse",
    })).rejects.toThrow(/unavailable/i)

    expect(calls.creates).toHaveLength(0)
    expect(calls.prompts).toHaveLength(0)
  })

  test("fails capability preflight closed when agent permission data is unavailable", async () => {
    const candidate = { harness: "opencode", model: "openai/gpt-5.6" }
    const { host, calls } = fakeHost()
    host.listAgents = undefined as never
    const adapter = createOpenCodeRoutingAdapter({ host, resolver: fakeResolver(candidate) })

    await expect(adapter.execute({
      sessionID: "parent-session",
      callID: "call-1",
      directory: "/repo",
      role: ROLE,
      prompt: "must not weaken permissions",
    })).rejects.toThrow(/unavailable/i)

    expect(calls.creates).toHaveLength(0)
    expect(calls.prompts).toHaveLength(0)
  })

  test.each(["abortSession", "sessionStatus"])("fails capability preflight before child creation without %s", async (method) => {
    const candidate = { harness: "opencode", model: "openai/gpt-5.6" }
    const { host, calls } = fakeHost()
    host[method] = undefined as never
    const adapter = createOpenCodeRoutingAdapter({ host, resolver: fakeResolver(candidate) })

    await expect(adapter.execute({
      sessionID: "parent-session",
      callID: "call-1",
      directory: "/repo",
      role: ROLE,
      prompt: "must retain lifecycle proof",
    })).rejects.toThrow(/unavailable/i)

    expect(calls.creates).toHaveLength(0)
    expect(calls.prompts).toHaveLength(0)
  })

  test("binds capability preflight to the installed SDK session, agent, config, and model APIs", async () => {
    const calls: Array<[string, unknown]> = []
    const client = {
      session: {
        get: (input: unknown) => { calls.push(["session.get", input]); return { data: { id: "parent" } } },
        create: (input: unknown, options: unknown) => { calls.push(["session.create", [input, options]]); return { data: { id: "child" } } },
        prompt: (input: unknown, options: unknown) => { calls.push(["session.prompt", [input, options]]); return { data: { info: {}, parts: [] } } },
        abort: (input: unknown) => { calls.push(["session.abort", input]); return { data: true } },
        status: (input: unknown) => { calls.push(["session.status", input]); return { data: { child: { type: "idle" } } } },
      },
      model: {
        list: (input: unknown) => { calls.push(["model.list", input]); return { data: { data: [{ id: "model" }] } } },
      },
      app: {
        agents: (input: unknown) => { calls.push(["app.agents", input]); return { data: [{ name: "general" }] } },
      },
      config: {
        get: (input: unknown) => { calls.push(["config.get", input]); return { data: { subagent_depth: 1 } } },
      },
    }
    const host = createOpenCodeSdkHost(client)

    expect(await host.getSession({ sessionID: "parent", directory: "/repo" })).toEqual({ id: "parent" })
    expect(await host.listAgents({ directory: "/repo" })).toEqual([{ name: "general" }])
    expect(await host.getConfig({ directory: "/repo" })).toEqual({ subagent_depth: 1 })
    expect(await host.listModels({ directory: "/repo" })).toEqual([{ id: "model" }])
    const controller = new AbortController()
    expect(await host.createSession({ parentID: "parent", directory: "/repo", signal: controller.signal })).toEqual({ id: "child" })
    await host.prompt({ sessionID: "child", directory: "/repo" })
    await host.abortSession({ sessionID: "child", directory: "/repo" })
    await host.sessionStatus({ directory: "/repo" })
    expect(calls).toEqual([
      ["session.get", { sessionID: "parent", directory: "/repo" }],
      ["app.agents", { directory: "/repo" }],
      ["config.get", { directory: "/repo" }],
      ["model.list", { location: { directory: "/repo" } }],
      ["session.create", [{ parentID: "parent", directory: "/repo" }, { signal: controller.signal }]],
      ["session.prompt", [{ sessionID: "child", directory: "/repo" }, undefined]],
      ["session.abort", { sessionID: "child", directory: "/repo" }],
      ["session.status", { directory: "/repo" }],
    ])
  })

  test("direct carrier wins in adapter resolution while free-form intent stays native", async () => {
    const store = intentStore()
    const direct = store.capture({
      sessionID: "session",
      messageID: "direct",
      text: `${carrier({ role: ROLE, binding: { policy: "require", candidates: [{ harness: "opencode", model: "openai/gpt-5.6" }] } })}\nproduct prompt`,
      direct: true,
      synthetic: false,
      parentID: undefined,
    })
    const { host, calls } = fakeHost()
    const requests: Record<string, any>[] = []
    const adapter = createOpenCodeRoutingAdapter({
      host,
      intents: store,
      resolver: fakeResolver({ harness: "opencode", model: "openai/gpt-5.6" }, requests),
    })

    const routed = await adapter.execute({
      sessionID: "session",
      callID: "call-1",
      directory: "/repo",
      role: ROLE,
      prompt: "worker prompt",
    })

    expect(direct.text).toBe("product prompt")
    expect(requests[0]).toMatchObject({
      op: "opencode_host",
      action: "resolve_batch",
      session_id: "session",
      intent: expect.objectContaining({ source: "opencode-direct-input", role: ROLE }),
    })
    expect(routed.receipt).toMatchObject({ source_layer: "task", source_authority: true })
    expect(routed.kind).toBe("routed")
    expect(calls.prompts).toHaveLength(1)

    store.capture({
      sessionID: "another-session",
      messageID: "free-form",
      text: "Use openai/gpt-5.6 for this task.",
      direct: true,
      synthetic: false,
      parentID: undefined,
    })
    const nativeRequests: Record<string, any>[] = []
    const native = createOpenCodeRoutingAdapter({
      host,
      intents: store,
      resolver: async (request) => {
        nativeRequests.push(structuredClone(request))
        return {
          snapshot: { id: "native-snapshot" },
          resolutions: [{ role: ROLE, binding: { kind: "ce-default", explicit_reset: false } }],
        }
      },
    })
    const nativeResult = await native.execute({
      sessionID: "another-session",
      callID: "native-call",
      directory: "/repo",
      role: ROLE,
      prompt: "native prompt",
    })
    expect(nativeRequests[0]).toMatchObject({ op: "opencode_host", action: "resolve_batch" })
    expect(nativeRequests[0]).not.toHaveProperty("intent")
    expect(nativeResult.kind).toBe("native")
  })

  test("freezes one selected-wave snapshot and consumes exact session, role, and instance-bound state", async () => {
    let configuredModel = "gpt-5.6"
    const requests: Record<string, any>[] = []
    const resolver = async (request: Record<string, any>) => {
      requests.push(structuredClone(request))
      if (request.op === "resolve_batch" || request.action === "resolve_batch") {
        return batchResolution(request, [{ harness: "opencode", model: `openai/${configuredModel}`, effort: "high" }])
      }
      return {
        action: "accept",
        receipt: {
          role: request.attempt_lock.role,
          identity_status: "verified",
          provider_actual: request.report.provider_actual,
          model_actual: request.report.model_actual,
        },
      }
    }
    const { host, calls } = fakeHost()
    const adapter = createOpenCodeRoutingAdapter({ host, resolver })
    const prepared = await adapter.prepare({
      sessionID: "session",
      directory: "/repo",
      role: ROLE,
      instances: ["U1", "U2"],
    })
    configuredModel = "drifted-model"

    await expect(adapter.execute({
      sessionID: "session",
      routingHandle: prepared.handle,
      instanceID: "wrong-instance",
      callID: "wrong",
      directory: "/repo",
      role: ROLE,
      prompt: "prompt",
    })).rejects.toThrow(/instance/i)

    for (const instanceID of ["U1", "U2"]) {
      await adapter.execute({
        sessionID: "session",
        routingHandle: prepared.handle,
        instanceID,
        callID: `call-${instanceID}`,
        directory: "/repo",
        role: ROLE,
        prompt: `prompt ${instanceID}`,
      })
    }

    expect(requests.filter((request) => request.action === "resolve_batch")).toHaveLength(1)
    expect(requests[0].roles.map((item: any) => item.instance.id)).toEqual(["U1", "U2"])
    expect(calls.creates.map((call) => call.model.id)).toEqual(["gpt-5.6", "gpt-5.6"])
    await expect(adapter.execute({
      sessionID: "session",
      routingHandle: prepared.handle,
      instanceID: "U1",
      callID: "replay",
      directory: "/repo",
      role: ROLE,
      prompt: "replay",
    })).rejects.toThrow(/unknown|consumed/i)
    await expect(adapter.prepare({
      sessionID: "session",
      directory: "/repo",
      role: ROLE,
      instances: ["U1"],
    })).rejects.toThrow(/already prepared or dispatched/i)
  })

  test("rejects duplicate preparation before the original handle is claimed", async () => {
    const adapter = createOpenCodeRoutingAdapter({
      host: fakeHost().host,
      resolver: async (request) => batchResolution(request, [{ harness: "opencode", model: "openai/gpt-5.6" }]),
    })
    await adapter.prepare({ sessionID: "session", directory: "/repo", role: ROLE, instances: ["U1"] })
    await expect(adapter.prepare({
      sessionID: "session",
      directory: "/repo",
      role: ROLE,
      instances: ["U1"],
    })).rejects.toThrow(/already prepared or dispatched/i)
  })

  test("releases a blocked prepared instance for same-snapshot recovery", async () => {
    const candidate = { harness: "opencode", model: "openai/recovery-model" }
    const requests: Record<string, any>[] = []
    const availableModels: Record<string, unknown>[] = []
    const { host, calls } = fakeHost({ models: availableModels })
    host.listModels = async () => availableModels
    host.prompt = async (input: Record<string, any>) => {
      calls.prompts.push(input)
      return {
        info: { role: "assistant", providerID: "openai", modelID: "recovery-model" },
        parts: [{ type: "text", text: "recovered" }],
      }
    }
    const adapter = createOpenCodeRoutingAdapter({ host, resolver: fakeResolver(candidate, requests) })
    const prepared = await adapter.prepare({
      sessionID: "session",
      directory: "/repo",
      role: ROLE,
      instances: ["U1"],
    })
    const input = {
      sessionID: "session",
      routingHandle: prepared.handle,
      instanceID: "U1",
      callID: "call-U1",
      directory: "/repo",
      role: ROLE,
      prompt: "prompt",
    }

    await expect(adapter.execute(input)).rejects.toThrow(/unavailable/i)
    availableModels.push({ providerID: "openai", id: "recovery-model", enabled: true })
    const recovered = await adapter.execute(input)

    expect(recovered.output).toBe("recovered")
    expect(requests.filter((request) => request.action === "resolve_batch")).toHaveLength(1)
    expect(calls.creates).toHaveLength(1)
  })

  test("poisons a prepared instance as soon as child creation starts", async () => {
    const candidate = { harness: "opencode", model: "openai/gpt-5.6" }
    const { host } = fakeHost()
    host.createSession = async () => { throw new Error("create transport failed") }
    const adapter = createOpenCodeRoutingAdapter({ host, resolver: fakeResolver(candidate) })
    const prepared = await adapter.prepare({
      sessionID: "session",
      directory: "/repo",
      role: ROLE,
      instances: ["U1"],
    })
    const input = {
      sessionID: "session",
      routingHandle: prepared.handle,
      instanceID: "U1",
      callID: "call-U1",
      directory: "/repo",
      role: ROLE,
      prompt: "prompt",
    }

    await expect(adapter.execute(input)).rejects.toThrow(/unavailable/i)
    await expect(adapter.execute(input)).rejects.toThrow(/unknown|consumed|poisoned/i)
    await expect(adapter.prepare({
      sessionID: "session",
      directory: "/repo",
      role: ROLE,
      instances: ["U1"],
    })).rejects.toThrow(/already prepared or dispatched/i)
  })

  test("keeps assistant-error and finalizer-block attempts consumed", async () => {
    for (const mode of ["assistant-error", "finalizer-block"] as const) {
      const { host } = fakeHost({
        response: mode === "assistant-error"
          ? { info: { role: "assistant", error: { name: "ProviderError" } }, parts: [] }
          : undefined,
      })
      const adapter = createOpenCodeRoutingAdapter({
        host,
        resolver: async (request) => {
          if (request.action === "resolve_batch") {
            return batchResolution(request, [{ harness: "opencode", model: "openai/gpt-5.6" }])
          }
          return {
            action: "block",
            receipt: { attempts: [], identity_status: mode === "assistant-error" ? "failed" : "mismatched" },
            error: { code: mode === "assistant-error" ? "ATTEMPT_FAILED" : "IDENTITY_REQUIRED" },
          }
        },
      })
      const prepared = await adapter.prepare({
        sessionID: mode,
        directory: "/repo",
        role: ROLE,
        instances: ["U1"],
      })
      await expect(adapter.execute({
        sessionID: mode,
        routingHandle: prepared.handle,
        instanceID: "U1",
        directory: "/repo",
        role: ROLE,
        prompt: "prompt",
      })).rejects.toThrow(mode === "assistant-error" ? /ATTEMPT_FAILED/ : /IDENTITY_REQUIRED/)
      await expect(adapter.prepare({
        sessionID: mode,
        directory: "/repo",
        role: ROLE,
        instances: ["U1"],
      })).rejects.toThrow(/already prepared or dispatched/i)
    }
  })

  test("removes a terminal child even when canonical finalization rejects", async () => {
    let finalizations = 0
    const adapter = createOpenCodeRoutingAdapter({
      host: fakeHost().host,
      resolver: async (request) => {
        if (request.action === "resolve_batch") {
          return batchResolution(request, [{ harness: "opencode", model: "openai/gpt-5.6" }])
        }
        finalizations += 1
        throw new Error("finalizer transport failed")
      },
    })
    const prepared = await adapter.prepare({ sessionID: "session", directory: "/repo", role: ROLE, instances: ["U1"] })
    await expect(adapter.execute({
      sessionID: "session",
      routingHandle: prepared.handle,
      instanceID: "U1",
      directory: "/repo",
      role: ROLE,
      prompt: "prompt",
    })).rejects.toThrow(/finalizer transport failed/i)
    expect(finalizations).toBe(1)
    expect(await adapter.releaseCompletedSession("session")).toBe(true)
  })

  test("accepts absent status as terminal even when abort transport throws", async () => {
    const { host } = fakeHost()
    host.prompt = async () => { throw new Error("prompt transport failed") }
    host.abortSession = async () => { throw new Error("abort transport failed") }
    host.sessionStatus = async () => ({})
    const adapter = createOpenCodeRoutingAdapter({
      host,
      resolver: fakeResolver({ harness: "opencode", model: "openai/gpt-5.6" }),
    })
    await expect(adapter.execute({
      sessionID: "session",
      callID: "call-1",
      directory: "/repo",
      role: ROLE,
      prompt: "prompt",
    })).rejects.toThrow(/ATTEMPT_FAILED/)
    expect(await adapter.releaseCompletedSession("session")).toBe(true)
  })

  test("reconciles delayed child idle without allowing parent cleanup during an active claim", async () => {
    const { host, calls } = fakeHost()
    let releasePrompt: (value: Record<string, any>) => void
    host.prompt = () => new Promise((resolve) => { releasePrompt = resolve })
    const adapter = createOpenCodeRoutingAdapter({
      host,
      resolver: async (request) => request.action === "resolve_batch"
        ? batchResolution(request, [{ harness: "opencode", model: "openai/gpt-5.6" }])
        : { action: "accept", receipt: { identity_status: "verified" } },
    })
    const prepared = await adapter.prepare({ sessionID: "session", directory: "/repo", role: ROLE, instances: ["U1"] })
    const execution = adapter.execute({
      sessionID: "session",
      routingHandle: prepared.handle,
      instanceID: "U1",
      directory: "/repo",
      role: ROLE,
      prompt: "prompt",
    })
    while (calls.creates.length === 0) await Bun.sleep(1)
    expect(await adapter.releaseCompletedSession("child-session")).toBe(true)
    expect(await adapter.releaseCompletedSession("session")).toBe(false)
    releasePrompt!({ info: { role: "assistant", providerID: "openai", modelID: "gpt-5.6" }, parts: [] })
    await execution
    expect(await adapter.releaseCompletedSession("session")).toBe(true)
  })

  test("blocks after prompt transport failure and never starts a second preferred child", async () => {
    const candidates = [
      { harness: "opencode", model: "openai/first" },
      { harness: "opencode", model: "openai/second" },
    ]
    const requests: Record<string, any>[] = []
    const resolver = async (request: Record<string, any>) => {
      requests.push(structuredClone(request))
      if (request.op === "resolve_batch" || request.action === "resolve_batch") return batchResolution(request, candidates, "prefer")
      expect(request.attempt).toMatchObject({ phase: "dispatched", retry_safety: "none" })
      return {
        action: "block",
        receipt: { attempts: [], identity_status: "failed" },
        error: { code: "RETRY_UNSAFE" },
      }
    }
    const { host, calls } = fakeHost({
      models: candidates.map((candidate) => ({
        providerID: "openai",
        id: candidate.model.slice(candidate.model.indexOf("/") + 1),
        enabled: true,
      })),
    })
    const controller = new AbortController()
    host.prompt = async (input: Record<string, any>) => {
      calls.prompts.push(input)
      expect(input.signal).toBe(controller.signal)
      controller.abort()
      throw new Error("transport aborted")
    }
    const adapter = createOpenCodeRoutingAdapter({ host, resolver })
    const prepared = await adapter.prepare({
      sessionID: "parent-session",
      directory: "/repo",
      role: ROLE,
      instances: ["U1"],
    })

    const execution = adapter.execute({
      sessionID: "parent-session",
      routingHandle: prepared.handle,
      instanceID: "U1",
      callID: "call-1",
      directory: "/repo",
      role: ROLE,
      prompt: "prompt",
      signal: controller.signal,
    })
    await expect(execution).rejects.toThrow(/RETRY_UNSAFE/)

    expect(calls.creates).toHaveLength(1)
    expect(calls.prompts).toHaveLength(1)
    expect(calls.aborts).toHaveLength(1)
    expect(requests.filter((request) => request.op === "opencode_host" && request.action === "finalize_attempt")).toHaveLength(1)
    await expect(adapter.prepare({
      sessionID: "parent-session",
      directory: "/repo",
      role: ROLE,
      instances: ["U1"],
    })).rejects.toThrow(/already prepared or dispatched/i)
  })

  test("fails closed as in-flight when transport failure cannot prove child cancellation", async () => {
    const candidate = { harness: "opencode", model: "openai/gpt-5.6" }
    const requests: Record<string, any>[] = []
    const { host, calls } = fakeHost()
    host.prompt = async () => { throw new Error("connection lost") }
    host.sessionStatus = async () => ({ "child-session": { type: "busy" } })
    const adapter = createOpenCodeRoutingAdapter({ host, resolver: fakeResolver(candidate, requests) })

    await expect(adapter.execute({
      sessionID: "parent-session",
      callID: "call-1",
      directory: "/repo",
      role: ROLE,
      prompt: "prompt",
    })).rejects.toThrow(/in flight/i)

    expect(calls.creates).toHaveLength(1)
    expect(requests.filter((request) => request.action === "finalize_attempt")).toHaveLength(0)
    expect(await adapter.releaseSession("parent-session")).toBe(false)
    adapter.noteSessionDeleted("child-session")
    expect(await adapter.releaseSession("parent-session")).toBe(false)
    host.sessionStatus = async () => ({})
    expect(await adapter.releaseSession("parent-session")).toBe(true)
  })

  test("treats parent deletion during child creation as closing and never prompts", async () => {
    const candidate = { harness: "opencode", model: "openai/gpt-5.6" }
    const { host, calls } = fakeHost()
    let adapter: ReturnType<typeof createOpenCodeRoutingAdapter>
    host.createSession = async (input: Record<string, any>) => {
      calls.creates.push(input)
      adapter.noteSessionDeleted("parent-session")
      return { id: "child-session" }
    }
    adapter = createOpenCodeRoutingAdapter({ host, resolver: fakeResolver(candidate) })
    const prepared = await adapter.prepare({
      sessionID: "parent-session",
      directory: "/repo",
      role: ROLE,
      instances: ["U1"],
    })

    await expect(adapter.execute({
      sessionID: "parent-session",
      routingHandle: prepared.handle,
      instanceID: "U1",
      callID: "call-U1",
      directory: "/repo",
      role: ROLE,
      prompt: "must not leave the closing parent",
    })).rejects.toThrow(/ATTEMPT_FAILED/)

    expect(calls.creates).toHaveLength(1)
    expect(calls.prompts).toHaveLength(0)
    expect(calls.aborts).toHaveLength(1)
  })

  test("invalidates abandoned prepared handles and the turn snapshot on parent idle", async () => {
    let resolutions = 0
    const adapter = createOpenCodeRoutingAdapter({
      host: fakeHost().host,
      resolver: async () => {
        resolutions += 1
        return {
          snapshot: { id: `snapshot-${resolutions}` },
          resolutions: [{ role: ROLE, binding: { kind: "ce-default", explicit_reset: false } }],
        }
      },
    })
    const prepared = await adapter.prepare({
      sessionID: "session",
      directory: "/repo",
      role: ROLE,
      instances: ["U1"],
    })

    expect(await adapter.releaseCompletedSession("session")).toBe(true)
    await expect(adapter.execute({
      sessionID: "session",
      routingHandle: prepared.handle,
      instanceID: "U1",
      callID: "call-U1",
      directory: "/repo",
      role: ROLE,
      prompt: "prompt",
    })).rejects.toThrow(/unknown|consumed/i)
    expect((await adapter.execute({
      sessionID: "session",
      callID: "call-U2",
      directory: "/repo",
      role: ROLE,
      prompt: "prompt",
    })).kind).toBe("native")
    expect(resolutions).toBe(2)
  })

  test("fails prompt references unavailable unless the host exposes native expansion", async () => {
    const candidate = { harness: "opencode", model: "openai/gpt-5.6", effort: "high" }
    const prompt = "Inspect @src/file.ts, @src/directory, and @general before responding."
    const unavailableHost = fakeHost()
    const unavailable = createOpenCodeRoutingAdapter({
      host: unavailableHost.host,
      resolver: fakeResolver(candidate),
    })
    await expect(unavailable.execute({
      sessionID: "parent-session",
      callID: "call-1",
      directory: "/repo",
      role: ROLE,
      prompt,
    })).rejects.toThrow(/unavailable/i)
    expect(unavailableHost.calls.creates).toHaveLength(0)

    const capableHost = fakeHost()
    const expanded = [
      { type: "text", text: "Inspect expanded context." },
      { type: "file", mime: "text/plain", url: "file:///repo/src/file.ts" },
      { type: "agent", name: "general" },
    ]
    capableHost.host.resolvePromptParts = async ({ prompt: value }: { prompt: string }) => {
      expect(value).toBe(prompt)
      return expanded
    }
    const capable = createOpenCodeRoutingAdapter({ host: capableHost.host, resolver: fakeResolver(candidate) })
    await capable.execute({
      sessionID: "parent-session",
      callID: "call-2",
      directory: "/repo",
      role: ROLE,
      prompt,
    })
    expect(capableHost.calls.prompts[0].parts).toEqual(expanded)
  })

  test("matches OpenCode prompt references without treating emails or backticked packages as files", async () => {
    const candidate = { harness: "opencode", model: "openai/gpt-5.6" }
    const ordinary = fakeHost()
    const ordinaryAdapter = createOpenCodeRoutingAdapter({ host: ordinary.host, resolver: fakeResolver(candidate) })

    await ordinaryAdapter.execute({
      sessionID: "parent-session",
      callID: "call-1",
      directory: "/repo",
      role: ROLE,
      prompt: "Email dev@example.com and install `@scope/package`.",
    })
    expect(ordinary.calls.creates).toHaveLength(1)

    const referenced = fakeHost()
    const referencedAdapter = createOpenCodeRoutingAdapter({ host: referenced.host, resolver: fakeResolver(candidate) })
    await expect(referencedAdapter.execute({
      sessionID: "parent-session",
      callID: "call-2",
      directory: "/repo",
      role: ROLE,
      prompt: "Inspect @src/file.ts before responding.",
    })).rejects.toThrow(/unavailable/i)
    expect(referenced.calls.creates).toHaveLength(0)
  })

  test("rejects carrier targets outside the exact CE role and class catalog", () => {
    for (const target of [
      { role: "CE-WORK.IMPLEMENTATION-WORKER", binding: "ce-default" },
      { role: "openai/gpt-5.6", binding: "ce-default" },
      { role: "ce-work.unknown-worker", binding: "ce-default" },
      { class: "Implementation", binding: "ce-default" },
      { class: "provider/review", binding: "ce-default" },
    ]) {
      const store = intentStore()
      const text = `${carrier(target)}\nproduct prompt`
      expect(store.capture({
        sessionID: "session",
        messageID: "direct",
        text,
        direct: true,
        synthetic: false,
        parentID: undefined,
      })).toEqual({ text, accepted: false })
      expect(store.intentsFor("session")).toEqual([])
    }
  })

  test("reuses one turn snapshot and retains a role-targeted intent across a nonmatching wave", async () => {
    const store = intentStore()
    store.capture({
      sessionID: "session",
      messageID: "direct",
      text: `${carrier({ role: ROLE, binding: { policy: "require", candidates: [{ harness: "opencode", model: "openai/gpt-5.6" }] } })}\nproduct prompt`,
      direct: true,
      synthetic: false,
      parentID: undefined,
    })
    const requests: Record<string, any>[] = []
    const resolver = async (request: Record<string, any>) => {
      requests.push(structuredClone(request))
      const requestedRole = request.roles[0].role
      return {
        snapshot: {
          id: `snapshot-${requests.length}`,
          roles: request.roles,
          intents: request.intent ? [request.intent] : request.parent_snapshot?.intents ?? [],
        },
        resolutions: [{
          role: requestedRole,
          class: "implementation",
          binding: requestedRole === ROLE
            ? { kind: "profile", source_layer: "task", policy: "require", candidates: [{ harness: "opencode", model: "openai/gpt-5.6", ordinal: 0 }] }
            : { kind: "ce-default", explicit_reset: false },
          attempt_locks: requestedRole === ROLE ? [{ candidate_ordinal: 0, candidate: { harness: "opencode", model: "openai/gpt-5.6", ordinal: 0 } }] : [],
        }],
      }
    }
    const adapter = createOpenCodeRoutingAdapter({ host: fakeHost().host, intents: store, resolver })

    await adapter.prepare({ sessionID: "session", directory: "/repo", role: OTHER_ROLE, instances: ["review"] })
    expect(store.intentsFor("session")).toHaveLength(1)
    await adapter.prepare({ sessionID: "session", directory: "/repo", role: ROLE, instances: ["U1"] })

    expect(requests).toHaveLength(2)
    expect(requests[0]).toMatchObject({ op: "opencode_host", action: "resolve_batch", intent: { role: ROLE } })
    expect(requests[1]).toMatchObject({ op: "opencode_host", action: "resolve_batch", parent_snapshot: { id: "snapshot-1" } })
    expect(requests[1]).not.toHaveProperty("intent")
    expect(store.intentsFor("session")).toEqual([])
  })

  test("hands configured external-first routes to CE Work with comparison-only identifiers", async () => {
    const external = { harness: "codex", model: "gpt-5.6" }
    const native = { harness: "opencode", model: "openai/gpt-5.6" }
    const configured = createOpenCodeRoutingAdapter({
      host: fakeHost().host,
      resolver: async (request) => batchResolution(request, [external, native], "prefer"),
    })
    const prepared = await configured.prepare({
      sessionID: "configured",
      directory: "/repo",
      role: ROLE,
      instances: ["U1"],
    })
    expect(prepared).toEqual({
      kind: "external",
      handle: null,
      instances: 1,
      comparison: {
        protocol: "ce-opencode-external-handoff/v1",
        source_revisions: { global: `cecfg-v1:${"1".repeat(64)}`, project: "cecfg-v1:absent" },
        bindings: [{ instance: "U1", binding_digest: `cebind-v1:${"1".repeat(64)}` }],
      },
    })
  })

  test("keeps configured OpenCode-first candidates native and blocks cross-adapter continuation", async () => {
    const candidates = [
      { harness: "opencode", model: "openai/unavailable" },
      { harness: "codex", model: "gpt-5.6" },
    ]
    const adapter = createOpenCodeRoutingAdapter({
      host: fakeHost({ models: [] }).host,
      resolver: async (request) => {
        if (request.action === "resolve_batch") return batchResolution(request, candidates, "prefer")
        return { action: "next_candidate", receipt: { attempts: [{ ordinal: 0, adapter_outcome: "unavailable" }] } }
      },
    })
    const prepared = await adapter.prepare({ sessionID: "configured", directory: "/repo", role: ROLE, instances: ["U1"] })
    expect(prepared.kind).toBe("opencode")
    await expect(adapter.execute({
      sessionID: "configured",
      routingHandle: prepared.handle,
      instanceID: "U1",
      directory: "/repo",
      role: ROLE,
      prompt: "prompt",
    })).resolves.toMatchObject({ kind: "mixed_adapter_blocked", code: "MIXED_ADAPTER_CONTINUATION_UNSUPPORTED" })
  })

  test("advances direct external-first intent only to a later in-process candidate", async () => {
    const candidates = [
      { harness: "codex", model: "gpt-5.6" },
      { harness: "opencode", model: "openai/gpt-5.6" },
    ]
    const requests: Record<string, any>[] = []
    const adapter = createOpenCodeRoutingAdapter({
      host: fakeHost().host,
      resolver: async (request) => {
        requests.push(structuredClone(request))
        if (request.action === "resolve_batch") {
          const resolved = batchResolution(request, candidates, "prefer")
          resolved.resolutions[0].binding.source_layer = "task"
          return resolved
        }
        if (request.attempt_lock.candidate_ordinal === 0) {
          return { action: "next_candidate", receipt: { attempts: [{ ordinal: 0, adapter_outcome: "unavailable" }] } }
        }
        return { action: "accept", receipt: { identity_status: "verified" } }
      },
    })
    const prepared = await adapter.prepare({ sessionID: "direct", directory: "/repo", role: ROLE, instances: ["U1"] })
    expect(prepared.kind).toBe("opencode")
    await expect(adapter.execute({
      sessionID: "direct",
      routingHandle: prepared.handle,
      instanceID: "U1",
      directory: "/repo",
      role: ROLE,
      prompt: "prompt",
    })).resolves.toMatchObject({ kind: "routed" })
    expect(requests.filter((request) => request.action === "finalize_attempt")).toHaveLength(2)
  })

  test("blocks direct intent when ordered fallback reaches an external candidate", async () => {
    const candidates = [
      { harness: "opencode", model: "openai/unavailable" },
      { harness: "codex", model: "gpt-5.6" },
    ]
    const adapter = createOpenCodeRoutingAdapter({
      host: fakeHost({ models: [] }).host,
      resolver: async (request) => {
        if (request.action === "resolve_batch") {
          const resolved = batchResolution(request, candidates, "prefer")
          resolved.resolutions[0].binding.source_layer = "task"
          return resolved
        }
        if (request.attempt_lock.candidate_ordinal === 0) {
          return { action: "next_candidate", receipt: { attempts: [{ ordinal: 0, adapter_outcome: "unavailable" }] } }
        }
        return { action: "block", receipt: { attempts: [], identity_status: "unavailable" }, error: { code: "ROUTE_UNAVAILABLE" } }
      },
    })
    const prepared = await adapter.prepare({ sessionID: "direct", directory: "/repo", role: ROLE, instances: ["U1"] })
    await expect(adapter.execute({
      sessionID: "direct",
      routingHandle: prepared.handle,
      instanceID: "U1",
      directory: "/repo",
      role: ROLE,
      prompt: "prompt",
    })).rejects.toThrow(/cannot dispatch through an external CE Work adapter/)
  })

  test("blocks direct external-only intent", async () => {
    const external = { harness: "codex", model: "gpt-5.6" }

    const store = intentStore()
    store.capture({
      sessionID: "direct",
      messageID: "direct",
      text: `${carrier({ role: ROLE, binding: { policy: "require", candidates: [external] } })}\nproduct prompt`,
      direct: true,
      synthetic: false,
      parentID: undefined,
    })
    const direct = createOpenCodeRoutingAdapter({
      host: fakeHost().host,
      intents: store,
      resolver: async (request) => {
        const resolved = batchResolution(request, [external], "require")
        resolved.resolutions[0].binding.source_layer = "task"
        return resolved
      },
    })
    await expect(direct.prepare({
      sessionID: "direct",
      directory: "/repo",
      role: ROLE,
      instances: ["U1"],
    })).rejects.toThrow(/direct task intent cannot select an external CE Work route/i)
  })

  test("prefers the selected general agent model over the parent for model-less candidates", async () => {
    const candidate = { harness: "opencode" }
    const { host, calls } = fakeHost({
      models: [
        { providerID: "openai", id: "gpt-5.6", enabled: true },
        { providerID: "anthropic", id: "general-model", enabled: true },
      ],
      response: {
        info: { role: "assistant", providerID: "anthropic", modelID: "general-model" },
        parts: [{ type: "text", text: "worker output" }],
      },
    })
    const agents = await host.listAgents()
    agents[0].model = { providerID: "anthropic", modelID: "general-model" }
    host.listAgents = async () => agents
    const adapter = createOpenCodeRoutingAdapter({ host, resolver: fakeResolver(candidate) })

    await adapter.execute({
      sessionID: "parent-session",
      callID: "call-1",
      directory: "/repo",
      role: ROLE,
      prompt: "prompt",
    })

    expect(calls.creates[0].model).toEqual({ providerID: "anthropic", id: "general-model" })
    expect(calls.prompts[0].model).toEqual({ providerID: "anthropic", modelID: "general-model" })
  })

  test("evicts rejected resolution promises and releases completed roots on idle", async () => {
    let calls = 0
    const resolver = async () => {
      calls += 1
      if (calls === 1) throw new Error("transient resolver failure")
      return {
        snapshot: { id: `snapshot-${calls}` },
        resolutions: [{ role: ROLE, class: "implementation", binding: { kind: "ce-default", explicit_reset: false } }],
      }
    }
    const adapter = createOpenCodeRoutingAdapter({ host: fakeHost().host, resolver })
    const input = {
      sessionID: "session",
      callID: "stable-call",
      directory: "/repo",
      role: ROLE,
      prompt: "prompt",
    }

    await expect(adapter.execute(input)).rejects.toThrow(/transient/)
    expect((await adapter.execute(input)).kind).toBe("native")
    expect((await adapter.execute(input)).kind).toBe("native")
    expect(calls).toBe(2)
    expect(await adapter.releaseCompletedSession("session")).toBe(true)
    expect((await adapter.execute(input)).kind).toBe("native")
    expect(calls).toBe(3)
  })

  test("retains the frozen turn snapshot when a later role resolution fails", async () => {
    const requests: Record<string, any>[] = []
    let childFailed = false
    const adapter = createOpenCodeRoutingAdapter({
      host: fakeHost().host,
      resolver: async (request) => {
        requests.push(structuredClone(request))
        if (request.parent_snapshot && !childFailed) {
          childFailed = true
          throw new Error("transient child resolution failure")
        }
        return {
          snapshot: { id: request.parent_snapshot ? "child-snapshot" : "turn-snapshot" },
          resolutions: request.roles.map(({ role }: { role: string }) => ({
            role,
            binding: { kind: "ce-default", explicit_reset: false },
          })),
        }
      },
    })

    await adapter.prepare({ sessionID: "session", directory: "/repo", role: ROLE, instances: ["U1"] })
    await expect(adapter.prepare({
      sessionID: "session",
      directory: "/repo",
      role: OTHER_ROLE,
      instances: ["fix-1"],
    })).rejects.toThrow(/transient child resolution failure/)
    await adapter.prepare({ sessionID: "session", directory: "/repo", role: OTHER_ROLE, instances: ["fix-2"] })

    expect(requests).toHaveLength(3)
    expect(requests[1].parent_snapshot).toEqual({ id: "turn-snapshot" })
    expect(requests[2].parent_snapshot).toEqual({ id: "turn-snapshot" })
    expect(requests[2]).not.toHaveProperty("session_id")
  })

  test("uses only the fixed plugin wrapper and bounds timeout, output, cancellation, stdin, and nonzero exits", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "ce-opencode-resolver-"))
    const scripts = path.join(root, "skills", "ce-work", "scripts")
    const resolverPath = path.join(scripts, "ce-routing.py")
    await mkdir(scripts, { recursive: true })
    const wrapperArgs: string[][] = []
    const spawnProcess = (command: string, args: string[], options: Record<string, unknown>) => {
      wrapperArgs.push(args)
      return spawn(command, ["-I", "-S", resolverPath], options)
    }
    const run = (options: Record<string, unknown> = {}, request: Record<string, unknown> = {}) => createOpenCodeResolver({
      timeoutMs: 200,
      maxStdoutBytes: 128,
      maxStderrBytes: 128,
      spawnProcess,
      ...options,
    })(request, { role: ROLE, directory: root })
    try {
      await writeFile(resolverPath, "import time\ntime.sleep(60)\n")
      await expect(run()).rejects.toThrow(/timed out/i)

      await writeFile(resolverPath, "import sys\nsys.stdout.write('x' * 4096)\n")
      await expect(run()).rejects.toThrow(/stdout exceeded/i)

      await writeFile(resolverPath, "import sys\nsys.stderr.write('x' * 4096)\n")
      await expect(run()).rejects.toThrow(/stderr exceeded/i)

      await writeFile(resolverPath, "import sys\nprint('{}')\nraise SystemExit(7)\n")
      await expect(run()).rejects.toThrow(/exited 7/i)

      await writeFile(resolverPath, [
        "import json",
        "print(json.dumps({'protocol': 'ce-routing/v1', 'op': 'opencode_host', 'action': 'block', 'error': {'code': 'IDENTITY_REQUIRED'}, 'receipt': {}}))",
        "raise SystemExit(4)",
        "",
      ].join("\n"))
      await expect(run({}, { op: "opencode_host", action: "finalize_attempt" })).resolves.toMatchObject({
        action: "block",
        error: { code: "IDENTITY_REQUIRED" },
      })

      const controller = new AbortController()
      await writeFile(resolverPath, "import time\ntime.sleep(60)\n")
      const cancelled = createOpenCodeResolver({ timeoutMs: 5_000, spawnProcess })(
        {},
        { role: ROLE, directory: root, signal: controller.signal },
      )
      controller.abort()
      await expect(cancelled).rejects.toThrow(/cancelled/i)

      await writeFile(resolverPath, "import os, time\nos.close(0)\ntime.sleep(1)\n")
      await expect(run({ timeoutMs: 2_000 }, { payload: "x".repeat(2_000_000) })).rejects.toThrow(/stdin failed/i)
      expect(wrapperArgs.every((args) => args[2]?.endsWith("/.opencode/plugins/ce-routing-host.py"))).toBe(true)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test("opaque handles reject session, role, and candidate changes", () => {
    const handles = createOpaqueHandleStore()
    const handle = handles.create({ sessionID: "session", role: ROLE, candidateOrdinal: 1, value: "locked" })

    expect(handle).toMatch(/^ceh_[A-Za-z0-9_-]+$/)
    expect(handle).not.toContain(ROLE)
    expect(() => handles.take(handle, { sessionID: "other", role: ROLE, candidateOrdinal: 1 })).toThrow(/session/i)
    expect(() => handles.take(handle, { sessionID: "session", role: "ce-plan.plan-author", candidateOrdinal: 1 })).toThrow(/role/i)
    expect(() => handles.take(handle, { sessionID: "session", role: ROLE, candidateOrdinal: 0 })).toThrow(/candidate/i)
    expect(handles.take(handle, { sessionID: "session", role: ROLE, candidateOrdinal: 1 }).value).toBe("locked")
    expect(() => handles.take(handle, { sessionID: "session", role: ROLE, candidateOrdinal: 1 })).toThrow(/unknown/i)
  })
})
