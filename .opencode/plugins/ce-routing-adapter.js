import { createHash, randomBytes } from "crypto"
import { spawn } from "child_process"
import path from "path"

const CARRIER_PROTOCOL = "ce-routing-intent/v1"
const CARRIER_PATTERN = /^\[\[ce-routing-intent\/v1 ([A-Za-z0-9_-]+)\]\](?:\r?\n|$)/

function ownKeys(value, keys) {
  return value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).sort().join("\0") === [...keys].sort().join("\0")
}

function parseCarrier(text) {
  const match = text.match(CARRIER_PATTERN)
  if (!match) return { text, carrier: null }
  const stripped = text.slice(match[0].length)
  try {
    const value = JSON.parse(Buffer.from(match[1], "base64url").toString("utf8"))
    if (!ownKeys(value, value.role ? ["role", "binding"] : ["class", "binding"])) {
      return { text: stripped, carrier: null }
    }
    const target = value.role ?? value.class
    if (typeof target !== "string" || !target || !value.binding || typeof value.binding !== "object") {
      return { text: stripped, carrier: null }
    }
    return {
      text: stripped,
      carrier: value,
      digest: createHash("sha256").update(match[1], "ascii").digest("hex"),
    }
  } catch {
    return { text: stripped, carrier: null }
  }
}

export function createOpenCodeIntentStore() {
  const sessions = new Map()
  const revisions = new Map()
  const advance = (sessionID) => revisions.set(sessionID, (revisions.get(sessionID) ?? 0) + 1)
  return {
    capture(input) {
      const authorized = input.direct === true && input.synthetic !== true && input.parentID === undefined
      if (!authorized) return { text: input.text, accepted: false }
      const parsed = parseCarrier(input.text)
      advance(input.sessionID)
      sessions.delete(input.sessionID)
      if (!parsed.carrier) return { text: input.text, accepted: false }
      sessions.set(input.sessionID, {
        ...parsed.carrier,
        source: "opencode-direct-input",
        provenance: {
          protocol: CARRIER_PROTOCOL,
          session_id: input.sessionID,
          message_id: input.messageID,
          carrier_digest: parsed.digest,
        },
      })
      return { text: parsed.text, accepted: true }
    },
    intentsFor(sessionID) {
      const intent = sessions.get(sessionID)
      return intent ? [structuredClone(intent)] : []
    },
    revision(sessionID) {
      return revisions.get(sessionID) ?? 0
    },
  }
}

export function createOpaqueHandleStore() {
  const values = new Map()
  return {
    create(value) {
      const handle = `ceh_${randomBytes(24).toString("base64url")}`
      values.set(handle, value)
      return handle
    },
    take(handle, expected) {
      const value = values.get(handle)
      if (!value) throw new Error("unknown or consumed OpenCode routing handle")
      if (value.sessionID !== expected.sessionID) throw new Error("routing handle session changed")
      if (value.role !== expected.role) throw new Error("routing handle role changed")
      if (value.candidateOrdinal !== expected.candidateOrdinal) throw new Error("routing handle candidate changed")
      values.delete(handle)
      return value
    },
  }
}

function modelSelector(candidate, parent, models) {
  const requested = candidate.model
  let providerID
  let modelID
  if (requested) {
    const separator = requested.indexOf("/")
    if (separator > 0) {
      providerID = requested.slice(0, separator)
      modelID = requested.slice(separator + 1)
    } else {
      const matches = models.filter((model) => model.id === requested && model.enabled !== false)
      if (matches.length !== 1) return null
      providerID = matches[0].providerID
      modelID = matches[0].id
    }
  } else {
    providerID = parent.model?.providerID
    modelID = parent.model?.id ?? parent.model?.modelID
  }
  if (!providerID || !modelID) return null
  const model = models.find((item) => item.providerID === providerID && item.id === modelID && item.enabled !== false)
  if (!model) return null
  const variant = candidate.effort
  if (variant && !(model.variants ?? []).some((item) => (item.id ?? item) === variant)) return null
  return { providerID, modelID, variant, model }
}

function taskPermission(parent, general, config) {
  const parentPermission = parent.permission ?? []
  if (!Array.isArray(parentPermission) || !Array.isArray(general.permission)) return null
  const validRule = (rule) => rule && typeof rule.permission === "string" && typeof rule.pattern === "string"
    && ["allow", "ask", "deny"].includes(rule.action)
  if (parentPermission.some((rule) => !validRule(rule)) || general.permission.some((rule) => !validRule(rule))) return null
  const child = parentPermission
    .filter((rule) => rule?.permission === "external_directory" || rule?.action === "deny")
    .map((rule) => structuredClone(rule))
  const has = (permission) => general.permission.some((rule) => rule?.permission === permission)
  if (!has("todowrite")) child.push({ permission: "todowrite", pattern: "*", action: "deny" })
  if (!has("task")) child.push({ permission: "task", pattern: "*", action: "deny" })
  const primaryTools = config?.experimental?.primary_tools ?? []
  if (!Array.isArray(primaryTools) || primaryTools.some((permission) => typeof permission !== "string")) return null
  for (const permission of primaryTools) {
    const deny = { permission, pattern: "*", action: "deny" }
    if (!child.some((rule) => rule.permission === deny.permission && rule.pattern === deny.pattern && rule.action === deny.action)) {
      child.push(deny)
    }
  }
  return child
}

async function taskContext(host, input) {
  for (const method of ["getSession", "listModels", "listAgents", "getConfig", "createSession", "prompt"]) {
    if (typeof host[method] !== "function") return null
  }
  try {
    const parent = await host.getSession({ sessionID: input.sessionID, directory: input.directory })
    const config = await host.getConfig({ directory: input.directory })
    let current = parent
    let depth = 0
    while (current.parentID) {
      depth += 1
      current = await host.getSession({ sessionID: current.parentID, directory: input.directory })
    }
    const limit = config?.subagent_depth ?? 1
    if (!Number.isInteger(limit) || depth >= limit) return null
    const agents = await host.listAgents({ directory: input.directory })
    if (!Array.isArray(agents)) return null
    const agentName = config?.agent?.general?.name ?? "general"
    if (typeof agentName !== "string") return null
    const general = agents.find((agent) => agent?.name === agentName)
    if (!general) return null
    const permission = taskPermission(parent, general, config)
    if (!permission) return null
    const models = await host.listModels({ directory: input.directory })
    if (!Array.isArray(models)) return null
    return { parent, permission, models, agentName }
  } catch {
    return null
  }
}

function textOutput(response) {
  return (response.parts ?? [])
    .filter((part) => part.type === "text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("")
}

function servingReport(response) {
  const info = response?.info
  if (!info || info.role !== "assistant") return {}
  const report = {}
  if (typeof info.providerID === "string") report.provider_actual = info.providerID
  if (typeof info.modelID === "string") report.model_actual = info.modelID
  if (typeof info.variant === "string") {
    report.variant_actual = info.variant
    report.effort_actual = info.variant
  }
  return report
}

function routeError(finalized) {
  const code = finalized.error?.code ?? "ROUTE_UNAVAILABLE"
  const error = new Error(`OpenCode routed task unavailable: ${code}`)
  error.receipt = finalized.receipt
  return error
}

export function createOpenCodeRoutingAdapter(options) {
  const handles = createOpaqueHandleStore()
  const intents = options.intents ?? createOpenCodeIntentStore()
  const roots = new Map()

  async function resolve(input) {
    const key = `${input.sessionID}:${intents.revision(input.sessionID)}`
    let root = roots.get(key)
    if (!root) {
      root = {
        callID: input.callID,
        promise: options.resolver({
          protocol: "ce-routing/v1",
          op: "resolve_batch",
          cwd: input.directory,
          host: { harness: "opencode", serving_family: "host-reported" },
          intents: intents.intentsFor(input.sessionID),
          roles: [{ role: input.role, instance: { id: input.callID } }],
        }, { role: input.role, directory: input.directory }),
      }
      roots.set(key, root)
    }
    const first = await root.promise
    if (root.callID === input.callID) return first
    return options.resolver({
      protocol: "ce-routing/v1",
      op: "resolve_batch",
      cwd: input.directory,
      parent_snapshot: first.snapshot,
      parent_snapshot_id: first.snapshot.id,
      roles: [{ role: input.role, instance: { id: input.callID } }],
    }, { role: input.role, directory: input.directory })
  }

  async function finalize(state, outcome, report, priorAttempts = []) {
    return options.resolver({
      protocol: "ce-routing/v1",
      op: "finalize_attempt",
      cwd: state.directory,
      snapshot: state.snapshot,
      attempt_lock: state.attemptLock,
      attempt: { ordinal: state.candidateOrdinal, terminal: true, integrated: false },
      outcome,
      report,
      prior_attempts: priorAttempts,
    }, { role: state.role, directory: state.directory })
  }

  async function executeHandle(handle, expected, priorAttempts) {
    const state = handles.take(handle, expected)
    let response
    try {
      const child = await options.host.createSession({
        directory: state.directory,
        parentID: state.sessionID,
        title: `${state.description} (@${state.agentName} subagent)`,
        agent: state.agentName,
        model: {
          providerID: state.selector.providerID,
          id: state.selector.modelID,
          ...(state.selector.variant ? { variant: state.selector.variant } : {}),
        },
        permission: state.permission,
      })
      response = await options.host.prompt({
        directory: state.directory,
        sessionID: child.id,
        agent: state.agentName,
        model: { providerID: state.selector.providerID, modelID: state.selector.modelID },
        ...(state.selector.variant ? { variant: state.selector.variant } : {}),
        parts: [{ type: "text", text: state.prompt }],
      })
      if (response?.info?.error) throw new Error("OpenCode child session failed")
    } catch {
      return { finalized: await finalize(state, "failed", {}, priorAttempts) }
    }
    const finalized = await finalize(state, "ok", servingReport(response), priorAttempts)
    return { finalized, response }
  }

  return {
    intents,
    async execute(input) {
      const resolved = await resolve(input)
      const item = resolved.resolutions?.find((candidate) => candidate.role === input.role)
      if (!item) throw new Error(`OpenCode routing resolution missing role ${input.role}`)
      if (item.binding.kind === "ce-default") return { kind: "native", explicit_reset: item.binding.explicit_reset === true }

      const candidates = item.binding.candidates ?? []
      let priorAttempts = []
      let context
      for (let index = 0; index < candidates.length; index += 1) {
        const candidate = candidates[index]
        const attemptLock = item.attempt_locks[index]
        const state = {
          sessionID: input.sessionID,
          role: input.role,
          candidateOrdinal: candidate.ordinal,
          directory: input.directory,
          description: input.description,
          prompt: input.prompt,
          snapshot: resolved.snapshot,
          attemptLock,
        }
        if (candidate.kind === "ce-default") {
          const finalized = await finalize(state, "ok", {}, priorAttempts)
          if (finalized.action !== "accept") throw routeError(finalized)
          return { kind: "native", explicit_reset: true, receipt: finalized.receipt }
        }

        let selector = null
        if (
          candidate.harness === "opencode"
          && candidate.route == null
        ) {
          context ??= await taskContext(options.host, input)
          if (context) selector = modelSelector(candidate, context.parent, context.models)
        }
        if (!selector) {
          const finalized = await finalize(state, "unavailable", {}, priorAttempts)
          if (finalized.action === "next_candidate") {
            priorAttempts = finalized.receipt.attempts
            continue
          }
          throw routeError(finalized)
        }

        if (input.authorizeTask) {
          try {
            await input.authorizeTask()
          } catch {
            const finalized = await finalize(state, "unavailable", {}, priorAttempts)
            if (finalized.action === "next_candidate") {
              priorAttempts = finalized.receipt.attempts
              continue
            }
            throw routeError(finalized)
          }
        }
        const handle = handles.create({
          ...state,
          parent: context.parent,
          permission: context.permission,
          agentName: context.agentName,
          selector,
        })
        const attempted = await executeHandle(handle, {
          sessionID: input.sessionID,
          role: input.role,
          candidateOrdinal: candidate.ordinal,
        }, priorAttempts)
        if (attempted.finalized.action === "next_candidate") {
          priorAttempts = attempted.finalized.receipt.attempts
          continue
        }
        if (attempted.finalized.action !== "accept") throw routeError(attempted.finalized)
        return {
          kind: "routed",
          output: textOutput(attempted.response),
          receipt: attempted.finalized.receipt,
        }
      }
      throw new Error("OpenCode routed task unavailable: candidate list exhausted")
    },
  }
}

export function createOpenCodeResolver({ skillsDir }) {
  return async function resolve(request, context) {
    const owner = context.role.slice(0, context.role.indexOf("."))
    if (!/^ce-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(owner)) throw new Error("invalid CE routing role owner")
    const resolver = path.join(skillsDir, owner, "scripts", "ce-routing.py")
    return new Promise((resolve, reject) => {
      const child = spawn("python3", ["-I", "-S", resolver], {
        cwd: context.directory,
        env: process.env,
        stdio: ["pipe", "pipe", "pipe"],
      })
      let stdout = ""
      let stderr = ""
      child.stdout.setEncoding("utf8")
      child.stderr.setEncoding("utf8")
      child.stdout.on("data", (chunk) => { stdout += chunk })
      child.stderr.on("data", (chunk) => { stderr += chunk })
      child.on("error", reject)
      child.on("close", () => {
        try {
          resolve(JSON.parse(stdout))
        } catch {
          reject(new Error(`OpenCode routing resolver returned invalid output: ${stderr.slice(0, 500)}`))
        }
      })
      child.stdin.end(JSON.stringify(request))
    })
  }
}

export function createOpenCodeSdkHost(client) {
  const unwrap = async (promise) => {
    const result = await promise
    if (result?.error) throw new Error(result.error.message ?? "OpenCode SDK request failed")
    return result?.data ?? result
  }
  return {
    async getSession(input) {
      return unwrap(client.session.get(input))
    },
    async listModels(input) {
      const body = await unwrap(client.model.list({ location: { directory: input.directory } }))
      return body.data ?? body
    },
    async listAgents(input) {
      return unwrap(client.app.agents({ directory: input.directory }))
    },
    async getConfig(input) {
      return unwrap(client.config.get({ directory: input.directory }))
    },
    async createSession(input) {
      return unwrap(client.session.create(input))
    },
    async prompt(input) {
      return unwrap(client.session.prompt(input))
    },
  }
}
