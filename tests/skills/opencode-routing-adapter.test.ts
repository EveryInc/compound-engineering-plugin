import { describe, expect, test } from "bun:test"
import {
  createOpenCodeIntentStore,
  createOpenCodeRoutingAdapter,
  createOpenCodeSdkHost,
  createOpaqueHandleStore,
} from "../../.opencode/plugins/ce-routing-adapter.js"

const ROLE = "ce-work.implementation-worker"

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

function fakeResolver(candidate: Record<string, unknown>, requests: Record<string, any>[] = []) {
  return async (request: Record<string, any>) => {
    requests.push(structuredClone(request))
    if (request.op === "resolve_batch") return resolution(candidate)
    const unavailable = request.outcome === "unavailable"
    return {
      action: unavailable ? "block" : "accept",
      receipt: {
        role: request.attempt_lock.role,
        adapter_outcome: request.outcome,
        identity_status: unavailable ? "unavailable" : "verified",
        provider_actual: request.report.provider_actual,
        model_actual: request.report.model_actual,
        variant_actual: request.report.variant_actual,
        effort_actual: request.report.effort_actual,
      },
      ...(unavailable ? { error: { code: "ROUTE_UNAVAILABLE" } } : {}),
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
        calls.creates.push(structuredClone(input))
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

    const finalize = requests.find((request) => request.op === "finalize_attempt")
    expect(finalize.report).toEqual({
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
    const store = createOpenCodeIntentStore()
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
    const store = createOpenCodeIntentStore()
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

  test("releases intent state and cached session snapshots", async () => {
    const store = createOpenCodeIntentStore()
    store.capture({
      sessionID: "session",
      messageID: "direct",
      text: `${carrier({ role: ROLE, binding: { profile: "economy", policy: "require" } })}\nproduct prompt`,
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
    expect(requests[0].intents).toHaveLength(1)
    expect(requests[1].intents).toEqual([])
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

  test("binds capability preflight to the installed SDK session, agent, config, and model APIs", async () => {
    const calls: Array<[string, unknown]> = []
    const client = {
      session: {
        get: (input: unknown) => { calls.push(["session.get", input]); return { data: { id: "parent" } } },
        create: (input: unknown) => { calls.push(["session.create", input]); return { data: { id: "child" } } },
        prompt: (input: unknown) => { calls.push(["session.prompt", input]); return { data: { info: {}, parts: [] } } },
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
    expect(await host.createSession({ parentID: "parent", directory: "/repo" })).toEqual({ id: "child" })
    await host.prompt({ sessionID: "child", directory: "/repo" })
    expect(calls).toEqual([
      ["session.get", { sessionID: "parent", directory: "/repo" }],
      ["app.agents", { directory: "/repo" }],
      ["config.get", { directory: "/repo" }],
      ["model.list", { location: { directory: "/repo" } }],
      ["session.create", { parentID: "parent", directory: "/repo" }],
      ["session.prompt", { sessionID: "child", directory: "/repo" }],
    ])
  })

  test("direct carrier wins in adapter resolution while free-form intent stays native", async () => {
    const store = createOpenCodeIntentStore()
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
    expect(requests[0].intents).toEqual([expect.objectContaining({ source: "opencode-direct-input" })])
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
    expect(nativeRequests[0].intents).toEqual([])
    expect(nativeResult.kind).toBe("native")
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
