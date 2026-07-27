import { createHash, randomBytes } from "crypto"
import { spawn } from "child_process"
import path from "path"
import { fileURLToPath } from "url"

const CARRIER_PROTOCOL = "ce-routing-intent/v1"
const CARRIER_PATTERN = /^\[\[ce-routing-intent\/v1 ([A-Za-z0-9_-]+)\]\](?:\r?\n|$)/
const NAME_TOKEN = /^[a-z0-9][a-z0-9._-]{0,63}$/
const MODEL_TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/
const EFFORT_TOKEN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/
const HARNESSES = new Set(["claude", "opencode", "codex", "cursor", "grok", "composer", "pi", "antigravity"])
const HOST_WRAPPER = path.join(path.dirname(fileURLToPath(import.meta.url)), "ce-routing-host.py")

function ownKeys(value, keys) {
  return value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).sort().join("\0") === [...keys].sort().join("\0")
}

function validCandidate(value) {
  if (value === "ce-default") return true
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const keys = Object.keys(value)
  if (!keys.includes("harness") || keys.some((key) => !["harness", "model", "effort", "route"].includes(key))) return false
  if (!HARNESSES.has(value.harness)) return false
  if ("model" in value && value.model !== null && (typeof value.model !== "string" || !MODEL_TOKEN.test(value.model))) return false
  if ("effort" in value && value.effort !== null && (typeof value.effort !== "string" || !EFFORT_TOKEN.test(value.effort))) return false
  if ("route" in value && value.route !== null && (typeof value.route !== "string" || !MODEL_TOKEN.test(value.route))) return false
  return true
}

function validBinding(value) {
  if (value === "inherit" || value === "ce-default") return true
  if (ownKeys(value, ["profile", "policy"])) {
    return typeof value.profile === "string" && NAME_TOKEN.test(value.profile)
      && (value.policy === "prefer" || value.policy === "require")
  }
  if (!ownKeys(value, ["policy", "candidates"])) return false
  if (value.policy !== "prefer" && value.policy !== "require") return false
  if (!Array.isArray(value.candidates) || value.candidates.length === 0 || !value.candidates.every(validCandidate)) return false
  const reset = value.candidates.indexOf("ce-default")
  return reset < 0 || reset === value.candidates.length - 1
}

function parseCarrier(text, catalog) {
  const match = text.match(CARRIER_PATTERN)
  if (!match) return { text, carrier: null }
  try {
    const value = JSON.parse(Buffer.from(match[1], "base64url").toString("utf8"))
    if (!ownKeys(value, value.role !== undefined ? ["role", "binding"] : ["class", "binding"])) return { text, carrier: null }
    const target = value.role ?? value.class
    const allowed = value.role !== undefined ? catalog.roles : catalog.classes
    if (typeof target !== "string" || !allowed.has(target) || !validBinding(value.binding)) return { text, carrier: null }
    return {
      text: text.slice(match[0].length),
      carrier: value,
      digest: createHash("sha256").update(match[1], "ascii").digest("hex"),
    }
  } catch {
    return { text, carrier: null }
  }
}

export function createOpenCodeIntentStore(catalog = {}) {
  const allowed = {
    roles: catalog.roles instanceof Set ? catalog.roles : new Set(catalog.roles ?? []),
    classes: catalog.classes instanceof Set ? catalog.classes : new Set(catalog.classes ?? []),
  }
  const sessions = new Map()
  const revisions = new Map()
  const pendingCommands = new Map()
  const advance = (sessionID) => revisions.set(sessionID, (revisions.get(sessionID) ?? 0) + 1)
  const clearPending = (sessionID) => {
    const pending = pendingCommands.get(sessionID)
    if (pending?.timer) clearTimeout(pending.timer)
    pendingCommands.delete(sessionID)
  }
  return {
    capture(input) {
      const authorized = input.direct === true && input.synthetic !== true && input.parentID === undefined
      if (!authorized) return { text: input.text, accepted: false }
      if (input.origin !== "command") {
        const pending = pendingCommands.get(input.sessionID)
        if (pending?.textDigest === createHash("sha256").update(input.text, "utf8").digest("hex")) {
          clearPending(input.sessionID)
          const intent = sessions.get(input.sessionID)
          if (intent) intent.provenance.message_id = input.messageID
          return { text: input.text, accepted: false, preservedCommand: true }
        }
        clearPending(input.sessionID)
      }
      const parsed = parseCarrier(input.text, allowed)
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
    armCommand(sessionID, text) {
      if (!sessions.has(sessionID) || typeof text !== "string") return false
      clearPending(sessionID)
      const timer = setTimeout(() => {
        pendingCommands.delete(sessionID)
        sessions.delete(sessionID)
        advance(sessionID)
      }, 5_000)
      timer.unref?.()
      pendingCommands.set(sessionID, {
        textDigest: createHash("sha256").update(text, "utf8").digest("hex"),
        timer,
      })
      return true
    },
    intentsFor(sessionID) {
      const intent = sessions.get(sessionID)
      return intent ? [structuredClone(intent)] : []
    },
    consume(sessionID) {
      const intent = sessions.get(sessionID)
      sessions.delete(sessionID)
      clearPending(sessionID)
      return intent ? structuredClone(intent) : null
    },
    revision(sessionID) {
      return revisions.get(sessionID) ?? 0
    },
    release(sessionID) {
      sessions.delete(sessionID)
      revisions.delete(sessionID)
      clearPending(sessionID)
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

function createPreparedWaveStore() {
  const values = new Map()
  return {
    create(value) {
      const handle = `cew_${randomBytes(24).toString("base64url")}`
      values.set(handle, value)
      return handle
    },
    claim(handle, expected) {
      const wave = values.get(handle)
      if (!wave) throw new Error("unknown or consumed OpenCode prepared-wave handle")
      if (wave.sessionID !== expected.sessionID) throw new Error("prepared-wave handle session changed")
      if (wave.role !== expected.role) throw new Error("prepared-wave handle role changed")
      const entry = wave.instances.get(expected.instanceID)
      if (!entry) throw new Error("prepared-wave handle instance changed or was already consumed")
      if (entry.poisoned) throw new Error("prepared-wave handle instance is poisoned")
      if (entry.claimed) throw new Error("prepared-wave handle instance is already in flight")
      entry.claimed = true
      let settled = false
      const remove = () => {
        wave.instances.delete(expected.instanceID)
        if (wave.instances.size === 0) values.delete(handle)
      }
      return {
        state: entry.state,
        get poisoned() {
          return entry.poisoned
        },
        poison() {
          if (settled || entry.poisoned) return
          entry.poisoned = true
          entry.markDispatched?.()
          remove()
        },
        complete() {
          if (settled) return
          settled = true
          remove()
        },
        release() {
          if (settled) return
          settled = true
          if (entry.poisoned) remove()
          else entry.claimed = false
        },
      }
    },
    hasSession(sessionID) {
      return [...values.values()].some((value) => value.sessionID === sessionID)
    },
    releaseSession(sessionID) {
      for (const [handle, value] of values) {
        if (value.sessionID === sessionID) values.delete(handle)
      }
    },
  }
}

function modelSelector(candidate, parent, general, models) {
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
    providerID = general.model?.providerID ?? parent.model?.providerID
    modelID = general.model?.modelID ?? general.model?.id ?? parent.model?.id ?? parent.model?.modelID
  }
  if (!providerID || !modelID) return null
  const model = models.find((item) => item.providerID === providerID && item.id === modelID && item.enabled !== false)
  if (!model) return null
  const variant = candidate.effort
  if (variant && !(model.variants ?? []).some((item) => (item.id ?? item) === variant)) return null
  return { providerID, modelID, variant }
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
  for (const method of [
    "getSession",
    "listModels",
    "listAgents",
    "getConfig",
    "createSession",
    "prompt",
    "abortSession",
    "sessionStatus",
  ]) {
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
    return { parent, permission, models, agentName, general }
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

function servingReport(response, selector) {
  const info = response?.info
  const report = {
    provider_selected: selector.providerID,
    model_selected: selector.modelID,
    ...(selector.variant ? { variant_selected: selector.variant } : {}),
  }
  if (!info || info.role !== "assistant") return report
  if (typeof info.providerID === "string") report.provider_actual = info.providerID
  if (typeof info.modelID === "string") report.model_actual = info.modelID
  if (typeof info.variant === "string") {
    report.variant_actual = info.variant
    report.effort_actual = info.variant
  }
  return report
}

function containsPromptReference(prompt) {
  return /(?<![\w`])@(\.?[^\s`,.]*(?:\.[^\s`,.]+)*)/.test(prompt)
}

async function promptParts(host, prompt, input) {
  if (!containsPromptReference(prompt)) return [{ type: "text", text: prompt }]
  if (typeof host.resolvePromptParts !== "function") return null
  const parts = await host.resolvePromptParts({ prompt, directory: input.directory, sessionID: input.sessionID })
  if (!Array.isArray(parts) || parts.length === 0) return null
  const allowed = new Set(["text", "file", "agent", "subtask"])
  return parts.every((part) => part && typeof part === "object" && allowed.has(part.type))
    ? structuredClone(parts)
    : null
}

function routeError(finalized) {
  const code = finalized.error?.code ?? "ROUTE_UNAVAILABLE"
  const error = new Error(`OpenCode routed task unavailable: ${code}`)
  error.receipt = finalized.receipt
  return error
}

export function createOpenCodeRoutingAdapter(options) {
  const handles = createOpaqueHandleStore()
  const preparedWaves = createPreparedWaveStore()
  const intents = options.intents ?? createOpenCodeIntentStore()
  const roots = new Map()
  const activeChildren = new Map()
  const activeClaims = new Map()
  const closingSessions = new Set()
  const closingChildren = new Set()
  const preparationStates = new Map()
  const epochs = new Map()
  const currentEpoch = (sessionID) => epochs.get(sessionID) ?? 0
  const clearRoots = (sessionID) => roots.delete(sessionID)
  const cleanupSession = (sessionID) => {
    preparedWaves.releaseSession(sessionID)
    clearRoots(sessionID)
    intents.release?.(sessionID)
    for (const [key, value] of preparationStates) {
      if (value.sessionID === sessionID) preparationStates.delete(key)
    }
  }
  const forgetChild = (childID) => {
    activeChildren.delete(childID)
    closingChildren.delete(childID)
  }

  async function resolve(input, roleRequests) {
    const revision = intents.revision(input.sessionID)
    const rolesDigest = createHash("sha256").update(JSON.stringify(roleRequests), "utf8").digest("hex")
    let root = roots.get(input.sessionID)
    if (!root || root.revision !== revision) {
      const intent = intents.intentsFor(input.sessionID)[0]
      root = {
        sessionID: input.sessionID,
        revision,
        rolesDigest,
        promise: options.resolver({
          protocol: "ce-routing/v1",
          op: "opencode_host",
          action: "resolve_batch",
          session_id: input.sessionID,
          cwd: input.directory,
          host: { harness: "opencode", serving_family: "host-reported" },
          ...(intent ? { intent } : {}),
          roles: roleRequests,
        }, { role: input.role, directory: input.directory, signal: input.signal }),
      }
      roots.set(input.sessionID, root)
    }
    let parent
    try {
      parent = await root.promise
    } catch (error) {
      if (roots.get(input.sessionID) === root) roots.delete(input.sessionID)
      throw error
    }
    if (root.rolesDigest === rolesDigest) return { resolved: parent, rootSnapshotID: parent.snapshot.id }
    const resolved = await options.resolver({
      protocol: "ce-routing/v1",
      op: "opencode_host",
      action: "resolve_batch",
      cwd: input.directory,
      parent_snapshot: parent.snapshot,
      roles: roleRequests,
    }, { role: input.role, directory: input.directory, signal: input.signal })
    return { resolved, rootSnapshotID: parent.snapshot.id }
  }

  async function finalize(state, outcome, report, priorAttempts = [], attempt = {}) {
    const attemptState = {
      ordinal: state.candidateOrdinal,
      terminal: true,
      integrated: false,
      phase: "dispatched",
      retry_safety: "none",
      ...attempt,
    }
    return options.resolver({
      protocol: "ce-routing/v1",
      op: "opencode_host",
      action: "finalize_attempt",
      cwd: state.directory,
      snapshot: state.snapshot,
      attempt_lock: state.attemptLock,
      attempt: attemptState,
      outcome,
      report,
      prior_attempts: priorAttempts,
    }, { role: state.role, directory: state.directory })
  }

  async function childStopped(childID, state) {
    try {
      await options.host.abortSession({ directory: state.directory, sessionID: childID })
    } catch {}
    try {
      const statuses = await options.host.sessionStatus({ directory: state.directory })
      return !statuses?.[childID] || statuses[childID].type === "idle"
    } catch {
      return false
    }
  }

  async function executeHandle(handle, expected, priorAttempts) {
    const state = handles.take(handle, expected)
    let response
    let child
    let creationStarted = false
    let terminalOutcome = null
    if (closingSessions.has(state.sessionID) || state.epoch !== currentEpoch(state.sessionID)) {
      return { finalized: await finalize(state, "unavailable", {}, priorAttempts, { phase: "preflight" }) }
    }
    try {
      state.preparationClaim?.poison()
      creationStarted = true
      child = await options.host.createSession({
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
        signal: state.signal,
      })
      activeChildren.set(child.id, {
        parentID: state.sessionID,
        directory: state.directory,
        preparationClaim: state.preparationClaim,
      })
      if (closingSessions.has(state.sessionID) || closingChildren.has(child.id) || state.epoch !== currentEpoch(state.sessionID)) {
        if (!await childStopped(child.id, state)) {
          const unknown = new Error("OpenCode routed child status is unknown and may still be in flight")
          unknown.inFlight = true
          throw unknown
        }
        forgetChild(child.id)
        terminalOutcome = "failed"
      } else {
        response = await options.host.prompt({
          directory: state.directory,
          sessionID: child.id,
          agent: state.agentName,
          model: { providerID: state.selector.providerID, modelID: state.selector.modelID },
          ...(state.selector.variant ? { variant: state.selector.variant } : {}),
          parts: state.parts,
          signal: state.signal,
        })
        const active = activeChildren.get(child.id)
        if (closingSessions.has(state.sessionID) || closingChildren.has(child.id) || active?.closing) {
          if (!await childStopped(child.id, state)) {
            const unknown = new Error("OpenCode routed child status is unknown and may still be in flight")
            unknown.inFlight = true
            throw unknown
          }
          forgetChild(child.id)
          terminalOutcome = "failed"
        } else {
          forgetChild(child.id)
          if (response?.info?.error) terminalOutcome = "failed"
        }
      }
    } catch (error) {
      if (!child) {
        return {
          finalized: await finalize(
            state,
            "unavailable",
            {},
            priorAttempts,
            { phase: creationStarted ? "dispatched" : "preflight" },
          ),
        }
      }
      if (!await childStopped(child.id, state)) {
        const unknown = new Error("OpenCode routed child status is unknown and may still be in flight")
        unknown.cause = error
        unknown.inFlight = true
        throw unknown
      }
      forgetChild(child.id)
      return { finalized: await finalize(state, "failed", {}, priorAttempts) }
    }
    if (terminalOutcome) return { finalized: await finalize(state, terminalOutcome, {}, priorAttempts) }
    const finalized = await finalize(state, "ok", servingReport(response, state.selector), priorAttempts)
    const active = activeChildren.get(child.id)
    if (closingSessions.has(state.sessionID) || closingChildren.has(child.id) || active?.closing) {
      if (!await childStopped(child.id, state)) {
        const unknown = new Error("OpenCode routed child status is unknown and may still be in flight")
        unknown.inFlight = true
        throw unknown
      }
      forgetChild(child.id)
      const closing = new Error("OpenCode routed child closed before its output could be accepted")
      closing.receipt = finalized.receipt
      throw closing
    }
    return { finalized, response }
  }

  function externalComparison(resolved, instances) {
    const sourceRevisions = resolved.snapshot?.source_revisions
    if (!sourceRevisions || typeof sourceRevisions.global !== "string" || typeof sourceRevisions.project !== "string") {
      throw new Error("OpenCode external routing resolution omitted source revisions")
    }
    const bindings = resolved.resolutions.map((item, index) => {
      if (typeof item?.binding_digest !== "string") throw new Error("OpenCode external routing resolution omitted a binding digest")
      return { instance: instances[index], binding_digest: item.binding_digest }
    })
    return {
      protocol: "ce-opencode-external-handoff/v1",
      source_revisions: structuredClone(sourceRevisions),
      bindings,
    }
  }

  async function executeResolved(input, resolved, prepared) {
    const item = prepared.item
    if (!item) throw new Error(`OpenCode routing resolution missing role ${input.role}`)
    if (item.binding.kind === "ce-default") return { kind: "native", explicit_reset: item.binding.explicit_reset === true }
    if (input.requirePreparation && !input.routingHandle) {
      throw new Error("OpenCode routed task requires a host-prepared selected-wave handle")
    }

    const candidates = item.binding.candidates ?? []
    let priorAttempts = []
    let context
    for (let index = 0; index < candidates.length; index += 1) {
      const candidate = candidates[index]
      const attemptLock = item.attempt_locks[index]
      const state = {
        sessionID: input.sessionID,
        role: input.role,
        candidate,
        candidateOrdinal: candidate.ordinal,
        directory: input.directory,
        description: input.description,
        prompt: input.prompt,
        snapshot: resolved.snapshot,
        attemptLock,
        item,
        epoch: prepared.epoch,
        preparationClaim: prepared.preparationClaim,
      }
      if (candidate.kind !== "ce-default" && candidate.harness !== "opencode") {
        if (item.binding.source_layer === "task") {
          const finalized = await finalize(state, "unavailable", {}, priorAttempts, { phase: "preflight" })
          if (finalized.action === "next_candidate") {
            priorAttempts = finalized.receipt.attempts
            continue
          }
          const error = new Error("OpenCode direct task intent cannot dispatch through an external CE Work adapter")
          error.code = "DIRECT_EXTERNAL_UNSUPPORTED"
          error.receipt = finalized.receipt
          throw error
        }
        return {
          kind: "mixed_adapter_blocked",
          code: "MIXED_ADAPTER_CONTINUATION_UNSUPPORTED",
          message: "A native OpenCode preflight cannot transfer authoritative attempt history to CE Work's external controller.",
        }
      }
      if (candidate.kind === "ce-default") {
        const finalized = await finalize(state, "ok", {}, priorAttempts, { phase: "preflight" })
        if (finalized.action !== "accept") throw routeError(finalized)
        return { kind: "native", explicit_reset: true, receipt: finalized.receipt }
      }

      let selector = null
      if (
        candidate.harness === "opencode"
        && candidate.route == null
      ) {
        context ??= await taskContext(options.host, input)
        if (context) selector = modelSelector(candidate, context.parent, context.general, context.models)
      }
      if (!selector) {
        const finalized = await finalize(state, "unavailable", {}, priorAttempts, { phase: "preflight" })
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
          const finalized = await finalize(state, "unavailable", {}, priorAttempts, { phase: "preflight" })
          if (finalized.action === "next_candidate") {
            priorAttempts = finalized.receipt.attempts
            continue
          }
          throw routeError(finalized)
        }
      }
      let parts
      try {
        parts = await promptParts(options.host, input.prompt, input)
      } catch {
        parts = null
      }
      if (!parts) {
        const finalized = await finalize(state, "unavailable", {}, priorAttempts, { phase: "preflight" })
        if (finalized.action === "next_candidate") {
          priorAttempts = finalized.receipt.attempts
          continue
        }
        throw routeError(finalized)
      }
      const handle = handles.create({
        ...state,
        permission: context.permission,
        agentName: context.agentName,
        selector,
        parts,
        signal: input.signal,
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
  }

  async function releaseSession(sessionID) {
    closingSessions.add(sessionID)
    let confirmed = true
    for (const [childID, state] of activeChildren) {
      if (state.parentID !== sessionID) continue
      if (await childStopped(childID, state)) {
        state.preparationClaim?.complete()
        forgetChild(childID)
      } else confirmed = false
    }
    if ([...activeClaims.values()].some((value) => value.sessionID === sessionID)) confirmed = false
    if (!confirmed) return false
    cleanupSession(sessionID)
    return true
  }

  return {
    intents,
    noteSessionDeleted(sessionID) {
      const active = activeChildren.get(sessionID)
      if (active) {
        active.closing = true
        closingChildren.add(sessionID)
        return { kind: "child", parentID: active.parentID }
      }
      closingSessions.add(sessionID)
      return { kind: "session", sessionID }
    },
    async releaseDeletedSession(sessionID) {
      const active = activeChildren.get(sessionID)
      if (!active) return releaseSession(sessionID)
      if (!await childStopped(sessionID, active)) return false
      active.preparationClaim?.complete()
      activeChildren.delete(sessionID)
      return true
    },
    async releaseCompletedSession(sessionID) {
      const active = activeChildren.get(sessionID)
      if (active) {
        active.preparationClaim?.complete()
        forgetChild(sessionID)
        return true
      }
      if ([...activeChildren.values()].some((value) => value.parentID === sessionID)) return false
      if ([...activeClaims.values()].some((value) => value.sessionID === sessionID)) return false
      epochs.set(sessionID, currentEpoch(sessionID) + 1)
      cleanupSession(sessionID)
      return true
    },
    releaseSession,
    async prepare(input) {
      if (!Array.isArray(input.instances) || input.instances.length === 0 || input.instances.some((id) => typeof id !== "string" || !MODEL_TOKEN.test(id))) {
        throw new Error("OpenCode selected wave requires one or more safe instance IDs")
      }
      if (new Set(input.instances).size !== input.instances.length) throw new Error("OpenCode selected wave instance IDs must be unique")
      const roleRequests = input.instances.map((id, ordinal) => ({ role: input.role, instance: { id, ordinal } }))
      const { resolved, rootSnapshotID } = await resolve(input, roleRequests)
      const instances = new Map()
      const preparationKeys = input.instances.map((id) => JSON.stringify([input.sessionID, rootSnapshotID, input.role, id]))
      if (preparationKeys.some((key) => preparationStates.has(key))) {
        throw new Error("OpenCode selected-wave instance was already prepared or dispatched for this session turn")
      }
      for (let index = 0; index < roleRequests.length; index += 1) {
        const item = resolved.resolutions?.[index]
        if (!item || item.role !== input.role) throw new Error(`OpenCode routing resolution missing role ${input.role}`)
        instances.set(input.instances[index], {
          state: { item, resolved, epoch: currentEpoch(input.sessionID) },
          claimed: false,
          poisoned: false,
          markDispatched: () => {
            const current = preparationStates.get(preparationKeys[index])
            if (current) current.state = "dispatched"
          },
        })
      }
      const kinds = new Set([...instances.values()].map(({ state }) => {
        const candidates = state.item.binding?.candidates ?? []
        const candidate = candidates[0]
        if (!candidate || candidate.kind === "ce-default") return "native"
        if (candidate.harness !== "opencode") {
          if (
            state.item.binding?.source_layer === "task"
            && candidates.some((later) => later.kind === "ce-default" || later.harness === "opencode")
          ) return "opencode"
          return "external"
        }
        return "opencode"
      }))
      if (kinds.size !== 1) throw new Error("OpenCode selected wave resolved to mixed adapter families")
      const kind = [...kinds][0]
      if (kind === "external" && resolved.resolutions.some((item) => item.binding?.source_layer === "task")) {
        throw new Error("OpenCode direct task intent cannot select an external CE Work route; direct-input authority cannot leave the native plugin boundary")
      }
      const comparison = kind === "external" ? externalComparison(resolved, input.instances) : null
      for (let index = 0; index < preparationKeys.length; index += 1) {
        preparationStates.set(preparationKeys[index], {
          sessionID: input.sessionID,
          state: "prepared",
        })
      }
      if (kind === "external") {
        return {
          handle: null,
          instances: input.instances.length,
          kind,
          comparison,
        }
      }
      const handle = preparedWaves.create({ sessionID: input.sessionID, role: input.role, instances })
      if (resolved.resolutions.some((item) => item.binding?.source_layer === "task")) intents.consume?.(input.sessionID)
      return { handle, instances: input.instances.length, kind }
    },
    async execute(input) {
      let resolved
      let prepared
      let preparationClaim
      let claimToken
      if (input.routingHandle) {
        preparationClaim = preparedWaves.claim(input.routingHandle, {
          sessionID: input.sessionID,
          role: input.role,
          instanceID: input.instanceID,
        })
        prepared = preparationClaim.state
        resolved = prepared.resolved
        claimToken = Symbol(input.instanceID)
        activeClaims.set(claimToken, { sessionID: input.sessionID, epoch: prepared.epoch })
      } else {
        const instanceID = input.instanceID ?? input.callID
        const resolution = await resolve(input, [{ role: input.role, instance: { id: instanceID } }])
        resolved = resolution.resolved
        prepared = { item: resolved.resolutions?.[0], resolved, epoch: currentEpoch(input.sessionID) }
      }
      try {
        const result = await executeResolved(input, resolved, { ...prepared, preparationClaim })
        preparationClaim?.complete()
        if (prepared.item?.binding?.source_layer === "task") intents.consume?.(input.sessionID)
        return result
      } catch (error) {
        if (!error?.inFlight) {
          if (preparationClaim?.poisoned) preparationClaim.complete()
          else preparationClaim?.release()
        }
        throw error
      } finally {
        if (claimToken) activeClaims.delete(claimToken)
        if (
          closingSessions.has(input.sessionID)
          && ![...activeChildren.values()].some((value) => value.parentID === input.sessionID)
          && ![...activeClaims.values()].some((value) => value.sessionID === input.sessionID)
        ) cleanupSession(input.sessionID)
      }
    },
  }
}

export function createOpenCodeResolver({
  timeoutMs = 10_000,
  maxStdoutBytes = 1_048_576,
  maxStderrBytes = 65_536,
  spawnProcess = spawn,
}) {
  return async function resolve(request, context) {
    return new Promise((resolve, reject) => {
      const child = spawnProcess("python3", ["-I", "-S", HOST_WRAPPER], {
        cwd: context.directory,
        env: process.env,
        stdio: ["pipe", "pipe", "pipe"],
      })
      let stdout = ""
      let stderr = ""
      let stdoutBytes = 0
      let stderrBytes = 0
      let failure = null
      let closed = false
      const failAndKill = (error) => {
        failure ??= error
        if (!closed) {
          try { child.kill("SIGKILL") } catch {}
        }
      }
      const onAbort = () => failAndKill(new Error("OpenCode routing resolver cancelled"))
      const timer = setTimeout(() => failAndKill(new Error("OpenCode routing resolver timed out")), timeoutMs)
      timer.unref?.()
      child.stdout.setEncoding("utf8")
      child.stderr.setEncoding("utf8")
      child.stdout.on("data", (chunk) => {
        stdoutBytes += Buffer.byteLength(chunk, "utf8")
        if (stdoutBytes > maxStdoutBytes) failAndKill(new Error("OpenCode routing resolver stdout exceeded its limit"))
        else stdout += chunk
      })
      child.stderr.on("data", (chunk) => {
        stderrBytes += Buffer.byteLength(chunk, "utf8")
        if (stderrBytes > maxStderrBytes) failAndKill(new Error("OpenCode routing resolver stderr exceeded its limit"))
        else stderr += chunk
      })
      child.stdin.on("error", () => failAndKill(new Error("OpenCode routing resolver stdin failed")))
      child.on("error", (error) => { failure ??= error })
      context.signal?.addEventListener("abort", onAbort, { once: true })
      child.on("close", (code) => {
        closed = true
        clearTimeout(timer)
        context.signal?.removeEventListener("abort", onAbort)
        if (failure) {
          reject(failure)
          return
        }
        if (code !== 0) {
          try {
            const body = JSON.parse(stdout)
            if (
              request.op === "opencode_host"
              && request.action === "finalize_attempt"
              && body?.protocol === "ce-routing/v1"
              && body?.op === "opencode_host"
              && body?.action === "block"
            ) {
              resolve(body)
              return
            }
            const detail = body?.error?.code ? ` ${body.error.code}` : ""
            reject(new Error(`OpenCode routing resolver exited ${code}:${detail} ${stderr.slice(0, 500)}`))
          } catch {
            reject(new Error(`OpenCode routing resolver exited ${code}: ${stderr.slice(0, 500)}`))
          }
          return
        }
        try {
          const body = JSON.parse(stdout)
          if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("invalid root")
          resolve(body)
        } catch {
          reject(new Error(`OpenCode routing resolver returned invalid output: ${stderr.slice(0, 500)}`))
        }
      })
      if (context.signal?.aborted) onAbort()
      try {
        child.stdin.end(JSON.stringify(request))
      } catch {
        failAndKill(new Error("OpenCode routing resolver stdin failed"))
      }
    })
  }
}

export function createOpenCodeSdkHost(client) {
  const unwrap = async (promise) => {
    const result = await promise
    if (result?.error) throw new Error(result.error.message ?? "OpenCode SDK request failed")
    return result?.data ?? result
  }
  const host = {
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
  }
  if (typeof client.session?.create === "function") {
    host.createSession = async (input) => {
      const { signal, ...request } = input
      return unwrap(client.session.create(request, signal ? { signal } : undefined))
    }
  }
  if (typeof client.session?.prompt === "function") {
    host.prompt = async (input) => {
      const { signal, ...request } = input
      return unwrap(client.session.prompt(request, signal ? { signal } : undefined))
    }
  }
  if (typeof client.session?.abort === "function") {
    host.abortSession = async (input) => unwrap(client.session.abort(input))
  }
  if (typeof client.session?.status === "function") {
    host.sessionStatus = async (input) => unwrap(client.session.status(input))
  }
  return host
}
