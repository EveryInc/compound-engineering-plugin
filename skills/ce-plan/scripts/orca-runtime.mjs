#!/usr/bin/env node

// Portable on purpose: this file and result-contract.mjs are copied
// byte-for-byte into each supported skill so converted installations never
// depend on the repository-level overlay tree.
import { execFile as nodeExecFile } from "node:child_process"
import { createHash, randomBytes } from "node:crypto"
import { constants as fsConstants, promises as fs } from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { loadResultContract, validateResultContract } from "./result-contract.mjs"

export const EXECUTION_REQUEST_SCHEMA = "ce-orca.execution-request/v1"
export const RESOLVED_EXECUTION_SCHEMA = "ce-orca.resolved-execution/v1"
export const DISPATCH_SCHEMA = "ce-orca.dispatch/v1"
export const PROFILES_SCHEMA = "ce-orca.profiles/v1"
export const PROJECT_CONFIG_SCHEMA = "ce-orca.project-config/v1"

const RUNTIME_MODES = new Set(["auto", "orca", "native"])
const RUNTIME_STATES = new Set(["absent", "healthy", "unhealthy", "incompatible"])
const ORCA_REQUEST_VERSION = "orca.execution-config/v1"
const BACKENDS = new Set(["claude", "codex", "cursor"])
const MODEL_TIERS = new Set(["cheap", "mid", "parent"])
const NO_REASONING = "none"
const EFFORTS = new Set(["low", "medium", "high"])
const ISOLATION = new Set(["shared", "worktree", "worktree-strict"])
const TARGET_FIELDS = ["backend", "model", "reasoning", "effort", "budget", "concurrency", "isolation"]
const ROOT_FIELDS = new Set(["schema", "workflowId", "runtime", "confirmation", "defaults", "stages"])
const STAGE_FIELDS = new Set([...TARGET_FIELDS, "roles"])
const ID_RE = /^[a-z][a-z0-9-]{0,63}$/
const MODEL_RE = /^[A-Za-z0-9][A-Za-z0-9._:/+\[\],=-]{0,127}$/
const LEVEL_RE = /^[a-z][a-z0-9-]{0,31}$/
const PROFILE_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/
const RUN_ID_RE = /^[0-9]{8}-[0-9]{6}-[a-f0-9]{4}$/
const MAX_CHILD_ARTIFACTS = 64
const ARTIFACT_READ_CONCURRENCY = 4
const PROFILE_LOCK_TIMEOUT_MS = 5_000
const PROFILE_LOCK_RETRY_MS = 25
const PROFILE_LOCK_SCHEMA = "ce-orca.profile-lock/v1"
const MKFIFO_COMMAND = "/usr/bin/mkfifo"
const RUN_RESULT_STATES = new Set(["succeeded", "failed", "stopped", "aborted", "timeout", "invalid", "not-found"])
const TERMINAL_RUN_RESULT_STATES = new Set(["succeeded", "failed", "stopped", "aborted"])

const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key)
const isObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value)

export class ExecutionResolutionError extends Error {
  constructor(code, message, details = {}) {
    super(message)
    this.name = "ExecutionResolutionError"
    this.code = code
    this.details = details
  }
}

export function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (!isObject(value)) return value
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]))
}

export const canonicalJson = (value, spacing = 2) => `${JSON.stringify(canonicalize(value), null, spacing)}\n`

const digest = (value) => createHash("sha256").update(canonicalJson(value, 0)).digest("hex")

function fail(code, message, details) {
  throw new ExecutionResolutionError(code, message, details)
}

function rethrowResultContractError(error) {
  if (error?.code === "invalid_result_contract") fail(error.code, error.message, error.details)
  throw error
}

async function loadRuntimeResultContract(options) {
  try {
    return await loadResultContract(options)
  } catch (error) {
    rethrowResultContractError(error)
  }
}

function validateRuntimeResultContract(contract, value) {
  try {
    return validateResultContract(contract, value)
  } catch (error) {
    rethrowResultContractError(error)
  }
}

// Natural-language interpretation belongs to the invoking controller. Raw
// feature prose is deliberately not parsed here; only a schema-tagged,
// data-only controller result can become an execution override.
export function controllerExecutionPatch(candidate) {
  if (!isObject(candidate)) return {}
  if (candidate.schema !== EXECUTION_REQUEST_SCHEMA) {
    fail("invalid_request_schema", `Controller patches must use ${EXECUTION_REQUEST_SCHEMA}.`)
  }
  return candidate
}

function allowedKeys(value, allowed, at) {
  if (!isObject(value)) fail("invalid_shape", `${at} must be an object.`)
  const unknown = Object.keys(value).filter((key) => !allowed.has(key)).sort()
  if (unknown.length) {
    fail("unknown_fields", `${at} contains unsupported fields: ${unknown.join(", ")}.`, { at, unknown })
  }
}

function sanitizeTarget(value, at) {
  allowedKeys(value, new Set(TARGET_FIELDS), at)
  const output = {}
  if (own(value, "backend")) {
    if (!BACKENDS.has(value.backend)) {
      fail("unknown_backend", `${at}.backend ${JSON.stringify(value.backend)} is invalid. Valid backends: ${[...BACKENDS].join(", ")}.`, {
        at,
        requested: value.backend,
        available: [...BACKENDS],
      })
    }
    output.backend = value.backend
  }
  if (own(value, "model")) {
    if (typeof value.model !== "string" || !MODEL_RE.test(value.model)) fail("invalid_model", `${at}.model must be a safe model token.`)
    output.model = value.model
  }
  if (own(value, "reasoning")) {
    if (typeof value.reasoning !== "string" || !LEVEL_RE.test(value.reasoning)) {
      fail("invalid_level", `${at}.reasoning must be a non-empty lowercase level token.`)
    }
    output.reasoning = value.reasoning
  }
  if (output.backend === "cursor" && !own(output, "reasoning")) output.reasoning = NO_REASONING
  if (own(value, "effort")) {
    if (!EFFORTS.has(value.effort)) {
      fail("invalid_effort", `${at}.effort must be one of low, medium, high.`)
    }
    output.effort = value.effort
  }
  for (const field of ["budget", "concurrency"]) {
    if (!own(value, field)) continue
    if (!Number.isInteger(value[field]) || value[field] < 1) fail("invalid_number", `${at}.${field} must be a positive integer.`)
    if (field === "concurrency" && value[field] > 32) fail("invalid_number", `${at}.concurrency cannot exceed 32.`)
    output[field] = value[field]
  }
  if (own(value, "isolation")) {
    if (!ISOLATION.has(value.isolation)) fail("invalid_isolation", `${at}.isolation is invalid. Valid values: ${[...ISOLATION].join(", ")}.`)
    output.isolation = value.isolation
  }
  return output
}

function sanitizeModelTiers(value) {
  allowedKeys(value, MODEL_TIERS, "builtins.modelTiers")
  const output = {}
  for (const tier of MODEL_TIERS) {
    if (!own(value, tier)) fail("invalid_defaults", `builtins.modelTiers.${tier} is required.`)
    output[tier] = sanitizeTarget(value[tier], `builtins.modelTiers.${tier}`)
  }
  return output
}

function registryWorkflow(registry, workflowId) {
  if (!isObject(registry) || registry.schema !== "ce-orca.role-registry/v1") {
    fail("invalid_registry", "The installed CE-Orca role registry is missing or incompatible.")
  }
  if (!ID_RE.test(String(workflowId || ""))) fail("unknown_workflow", "workflowId must be a lowercase installed workflow ID.")
  const workflow = registry.workflows?.[workflowId]
  if (!workflow) {
    const available = Object.keys(registry.workflows || {}).sort()
    fail("unknown_workflow", `Unknown workflow ${JSON.stringify(workflowId)}. Valid workflows: ${available.join(", ") || "(none)"}.`, { requested: workflowId, available })
  }
  return workflow
}

function sanitizeLayer(value, { workflowId, registry, label }) {
  if (value == null) return {}
  allowedKeys(value, ROOT_FIELDS, label)
  if (own(value, "schema") && value.schema !== EXECUTION_REQUEST_SCHEMA) {
    fail("invalid_request_schema", `${label}.schema must be ${EXECUTION_REQUEST_SCHEMA}.`)
  }
  if (own(value, "workflowId") && value.workflowId !== workflowId) {
    fail("workflow_mismatch", `${label}.workflowId ${JSON.stringify(value.workflowId)} does not match ${JSON.stringify(workflowId)}.`)
  }
  const workflow = registryWorkflow(registry, workflowId)
  const output = {}
  if (own(value, "runtime")) {
    if (!RUNTIME_MODES.has(value.runtime)) fail("invalid_runtime", `${label}.runtime is invalid. Valid modes: auto, orca, native.`)
    output.runtime = value.runtime
  }
  if (own(value, "confirmation")) {
    if (typeof value.confirmation !== "boolean") fail("invalid_confirmation", `${label}.confirmation must be boolean.`)
    output.confirmation = value.confirmation
  }
  if (own(value, "defaults")) output.defaults = sanitizeTarget(value.defaults, `${label}.defaults`)
  if (own(value, "stages")) {
    if (!isObject(value.stages)) fail("invalid_shape", `${label}.stages must be an object.`)
    output.stages = {}
    for (const [stageId, stageValue] of Object.entries(value.stages)) {
      const installedStage = workflow.stages?.[stageId]
      if (!installedStage) {
        const available = Object.keys(workflow.stages || {}).sort()
        fail("unknown_stage", `Unknown stage ${JSON.stringify(stageId)} for ${workflowId}. Valid stages: ${available.join(", ") || "(none)"}.`, {
          workflowId,
          requested: stageId,
          available,
        })
      }
      allowedKeys(stageValue, STAGE_FIELDS, `${label}.stages.${stageId}`)
      const stageOutput = sanitizeTarget(Object.fromEntries(Object.entries(stageValue).filter(([key]) => key !== "roles")), `${label}.stages.${stageId}`)
      if (own(stageValue, "roles")) {
        if (!isObject(stageValue.roles)) fail("invalid_shape", `${label}.stages.${stageId}.roles must be an object.`)
        stageOutput.roles = {}
        for (const [roleId, roleValue] of Object.entries(stageValue.roles)) {
          if (!installedStage.roles?.[roleId]) {
            const available = Object.keys(installedStage.roles || {}).sort()
            fail("unknown_role", `Unknown role ${JSON.stringify(roleId)} in ${workflowId}.${stageId}. Valid roles: ${available.join(", ") || "(none)"}.`, {
              workflowId,
              stageId,
              requested: roleId,
              available,
            })
          }
          stageOutput.roles[roleId] = sanitizeTarget(roleValue, `${label}.stages.${stageId}.roles.${roleId}`)
        }
      }
      output.stages[stageId] = stageOutput
    }
  }
  return output
}

function mergeLayer(base, layer) {
  const output = {
    ...base,
    ...(own(layer, "runtime") ? { runtime: layer.runtime } : {}),
    ...(own(layer, "confirmation") ? { confirmation: layer.confirmation } : {}),
    defaults: { ...(base.defaults || {}), ...(layer.defaults || {}) },
    stages: { ...(base.stages || {}) },
  }
  for (const [stageId, stageValue] of Object.entries(layer.stages || {})) {
    const previous = output.stages[stageId] || {}
    const { roles: previousRoles = {}, ...previousTarget } = previous
    const { roles: nextRoles = {}, ...nextTarget } = stageValue
    const roles = { ...previousRoles }
    for (const [roleId, roleValue] of Object.entries(nextRoles)) roles[roleId] = { ...(roles[roleId] || {}), ...roleValue }
    output.stages[stageId] = { ...previousTarget, ...nextTarget, ...(Object.keys(roles).length ? { roles } : {}) }
  }
  return output
}

export function mergeExecutionLayers({ workflowId, registry, builtins, project, profile, prompt }) {
  const builtinWorkflow = builtins?.workflows?.[workflowId] || {}
  const builtinLayer = {
    runtime: builtins?.runtime,
    confirmation: builtins?.confirmation,
    defaults: builtins?.defaults,
    stages: builtinWorkflow.stages,
  }
  const layers = [
    sanitizeLayer(builtinLayer, { workflowId, registry, label: "builtins" }),
    sanitizeLayer(project, { workflowId, registry, label: "project" }),
    sanitizeLayer(profile, { workflowId, registry, label: "profile" }),
    sanitizeLayer(prompt, { workflowId, registry, label: "prompt" }),
  ]
  return layers.reduce(mergeLayer, {})
}

function runScopedExecutionOverride({ workflowId, registry, project, profile, prompt }) {
  const merged = [
    sanitizeLayer(project, { workflowId, registry, label: "project" }),
    sanitizeLayer(profile, { workflowId, registry, label: "profile" }),
    sanitizeLayer(prompt, { workflowId, registry, label: "prompt" }),
  ].reduce(mergeLayer, {})
  return canonicalize({
    schema: EXECUTION_REQUEST_SCHEMA,
    workflowId,
    ...(own(merged, "runtime") ? { runtime: merged.runtime } : {}),
    ...(own(merged, "confirmation") ? { confirmation: merged.confirmation } : {}),
    ...(Object.keys(merged.defaults || {}).length ? { defaults: merged.defaults } : {}),
    ...(Object.keys(merged.stages || {}).length ? { stages: merged.stages } : {}),
  })
}

function hasTargetFields(value) {
  return isObject(value) && TARGET_FIELDS.some((field) => own(value, field))
}

function validateTargetApplication({ workflowId, workflow, runtime, runScopedOverride }) {
  const hasExplicitDefaults = hasTargetFields(runScopedOverride.defaults)
  const stageOverrides = Object.entries(runScopedOverride.stages || {})

  if (runtime.selected === "native") {
    const explicitStage = stageOverrides.find(([, value]) => {
      if (hasTargetFields(value)) return true
      return Object.values(value.roles || {}).some(hasTargetFields)
    })
    if (hasExplicitDefaults || explicitStage) {
      fail(
        "native_runtime_target_unconfigurable",
        `${workflowId} selected native runtime, which cannot enforce CE-Orca backend/model target overrides. Remove the target override or select a compatible Orca runtime.`,
        { workflowId, runtime: runtime.selected },
      )
    }
    return
  }

  for (const [stageId, stageOverride] of stageOverrides) {
    const definition = workflow.stages[stageId]
    if (definition.defaultOwner !== "native") continue
    const roleWithTarget = Object.entries(stageOverride.roles || {}).find(([, value]) => hasTargetFields(value))
    if (!hasTargetFields(stageOverride) && !roleWithTarget) continue
    if (definition.nativeTargetHandling === "child-workflow" && !roleWithTarget) continue
    const at = roleWithTarget
      ? `stages.${stageId}.roles.${roleWithTarget[0]}`
      : `stages.${stageId}`
    fail(
      "native_stage_target_unconfigurable",
      `${workflowId}.${at} is native-owned and cannot enforce CE-Orca backend/model target overrides. Configure that stage through the native host, or target an Orca-owned stage.`,
      { workflowId, stageId, at, nativeTargetHandling: definition.nativeTargetHandling || "unconfigurable" },
    )
  }
}

export function routeRuntime(requested, probe) {
  if (!RUNTIME_MODES.has(requested)) fail("invalid_runtime", `Invalid runtime ${JSON.stringify(requested)}.`)
  if (requested === "native") {
    return { requested, selected: "native", state: probe?.state || "not-checked", fallback: false }
  }
  const state = probe?.state
  if (!RUNTIME_STATES.has(state)) fail("probe_required", "Orca must be probed before resolving auto or orca runtime.")
  if (state === "healthy") return { requested, selected: "orca", state, fallback: false }
  if (state === "absent" && requested === "auto") return { requested, selected: "native", state, fallback: true }
  const issues = Array.isArray(probe?.issues) ? probe.issues : []
  const message = state === "absent"
    ? "Orca was explicitly requested but orca-orch is absent."
    : `Orca is ${state}; execution cannot fall back after an installed runtime was detected.`
  fail("runtime_unavailable", message, { requested, state, issues })
}

export function normalizeCapabilities(value) {
  const source = value?.capabilities?.targets || value?.targets || value?.backends || {}
  const backends = {}
  for (const backend of [...BACKENDS].sort()) {
    const record = source[backend]
    if (!record) continue
    const models = [...new Set(Array.isArray(record.models) ? record.models.filter((item) => typeof item === "string") : [])].sort()
    const reasoning = [...new Set(Array.isArray(record.reasoning) ? record.reasoning.filter((item) => typeof item === "string") : [])].sort()
    const reasoningByModel = Object.fromEntries(models.map((model) => [
      model,
      [...new Set(Array.isArray(record.reasoningByModel?.[model]) ? record.reasoningByModel[model].filter((item) => typeof item === "string") : reasoning)].sort(),
    ]))
    backends[backend] = {
      available: record.available !== false,
      models,
      reasoning,
      reasoningByModel,
      mutation: {
        read: {
          supported: record.mutation?.read?.supported === true,
          policy: typeof record.mutation?.read?.policy === "string" ? record.mutation.read.policy : "",
          issues: Array.isArray(record.mutation?.read?.issues)
            ? record.mutation.read.issues.filter((item) => typeof item === "string")
            : [],
        },
        writer: {
          supported: record.mutation?.writer?.supported === true,
          policy: typeof record.mutation?.writer?.policy === "string" ? record.mutation.writer.policy : "",
          issues: Array.isArray(record.mutation?.writer?.issues)
            ? record.mutation.writer.issues.filter((item) => typeof item === "string")
            : [],
        },
      },
    }
  }
  return { backends }
}

function validateReadCapability(target, capabilities, at) {
  const reader = capabilities.backends[target.backend]?.mutation?.read
  if (
    target.isolation === "worktree-strict" &&
    reader?.supported === true &&
    reader.policy === "orca.read-policy/v1"
  ) return
  const available = Object.entries(capabilities.backends)
    .filter(([, record]) => record.available && record.mutation?.read?.supported === true && record.mutation.read.policy === "orca.read-policy/v1")
    .map(([backend]) => backend)
    .sort()
  if (target.isolation !== "worktree-strict") {
    fail(
      "read_isolation_required",
      `${at}.isolation must be worktree-strict for an Orca read agent.`,
      { at, requested: target.isolation, required: "worktree-strict" },
    )
  }
  fail(
    "read_backend_unavailable",
    `${at}.backend ${JSON.stringify(target.backend)} has no attested isolated read policy. Valid read backends: ${available.join(", ") || "(none)"}.`,
    { at, requested: target.backend, available, issues: reader?.issues || [] },
  )
}

function validateWriterCapability(target, capabilities, at) {
  const writer = capabilities.backends[target.backend]?.mutation?.writer
  if (writer?.supported === true && writer.policy === "orca.writer-policy/v1") return
  const available = Object.entries(capabilities.backends)
    .filter(([, record]) => record.available && record.mutation?.writer?.supported === true && record.mutation.writer.policy === "orca.writer-policy/v1")
    .map(([backend]) => backend)
    .sort()
  fail(
    "writer_backend_unavailable",
    `${at}.backend ${JSON.stringify(target.backend)} has no attested mutation-safe writer policy. Valid writer backends: ${available.join(", ") || "(none)"}.`,
    { at, requested: target.backend, available, issues: writer?.issues || [] },
  )
}

function validateTargetCapability(target, capabilities, at) {
  const backend = capabilities.backends[target.backend]
  const availableBackends = Object.entries(capabilities.backends).filter(([, value]) => value.available).map(([key]) => key).sort()
  if (!backend || !backend.available) {
    fail("backend_unavailable", `${at}.backend ${JSON.stringify(target.backend)} is unavailable. Available backends: ${availableBackends.join(", ") || "(none)"}.`, {
      at,
      requested: target.backend,
      available: availableBackends,
    })
  }
  if (!backend.models.includes(target.model)) {
    fail("model_unavailable", `${at}.model ${JSON.stringify(target.model)} is unavailable for ${target.backend}. Available models: ${backend.models.join(", ") || "(none)"}.`, {
      at,
      backend: target.backend,
      requested: target.model,
      available: backend.models,
    })
  }
  const supportedReasoning = backend.reasoningByModel?.[target.model] || backend.reasoning
  if (target.reasoning && !supportedReasoning.includes(target.reasoning)) {
    fail("reasoning_unavailable", `${at}.reasoning ${JSON.stringify(target.reasoning)} is unsupported for ${target.backend}/${target.model}. Available levels: ${supportedReasoning.join(", ") || "(none)"}.`, {
      at,
      backend: target.backend,
      model: target.model,
      requested: target.reasoning,
      available: supportedReasoning,
    })
  }
}

function completeTarget(target, at) {
  for (const field of ["backend", "model", "reasoning", "effort", "concurrency", "isolation"]) {
    if (!own(target, field)) fail("incomplete_target", `${at}.${field} has no effective default.`)
  }
  return Object.fromEntries(TARGET_FIELDS.filter((field) => own(target, field)).map((field) => [field, target[field]]))
}

function restoreTargetFamily(target, explicitTarget, effectiveTarget) {
  if (!own(explicitTarget, "backend") && !own(explicitTarget, "model")) return target
  return {
    ...target,
    backend: effectiveTarget.backend,
    model: effectiveTarget.model,
    reasoning: effectiveTarget.reasoning,
  }
}

function materializeStages(workflow, merged, effectiveDefaults, modelTiers, runScopedOverride) {
  const stages = {}
  for (const stageId of Object.keys(workflow.stages).sort()) {
    const stageDefinition = workflow.stages[stageId]
    const configured = merged.stages?.[stageId] || {}
    const { roles: configuredRoles = {}, ...stageTarget } = configured
    const explicitStageValue = runScopedOverride.stages?.[stageId] || {}
    const { roles: explicitRoles = {}, ...explicitStageTarget } = explicitStageValue
    const explicitDefaults = runScopedOverride.defaults || {}
    const effectiveStage = completeTarget({ ...effectiveDefaults, ...stageTarget }, `stages.${stageId}`)
    const roles = {}
    for (const roleId of Object.keys(stageDefinition.roles || {}).sort()) {
      const modelTier = stageDefinition.roles[roleId].modelTier
      if (!MODEL_TIERS.has(modelTier)) {
        fail("invalid_registry", `${stageId}.${roleId} has unknown model tier ${JSON.stringify(modelTier)}.`)
      }
      let effectiveRole = {
        ...effectiveStage,
        ...modelTiers[modelTier],
        ...explicitDefaults,
      }
      effectiveRole = restoreTargetFamily(effectiveRole, explicitDefaults, effectiveDefaults)
      effectiveRole = { ...effectiveRole, ...stageTarget }
      effectiveRole = restoreTargetFamily(effectiveRole, explicitStageTarget, effectiveStage)
      const configuredRole = configuredRoles[roleId] || {}
      effectiveRole = { ...effectiveRole, ...configuredRole }
      effectiveRole = restoreTargetFamily(
        effectiveRole,
        explicitRoles[roleId] || {},
        { ...effectiveStage, ...configuredRole },
      )
      roles[roleId] = completeTarget(effectiveRole, `stages.${stageId}.roles.${roleId}`)
    }
    stages[stageId] = { ...effectiveStage, ...(Object.keys(roles).length ? { roles } : {}) }
  }
  return stages
}

const executionMutation = (definition) =>
  definition?.mutation === "worktree-write" ? "writer" : "read"

function annotateExecutionMutations(workflow, stages) {
  return Object.fromEntries(Object.entries(stages).map(([stageId, stageValue]) => {
    const definition = workflow.stages[stageId]
    const roles = Object.fromEntries(Object.entries(stageValue.roles || {}).map(([roleId, roleValue]) => [
      roleId,
      { ...roleValue, mutation: executionMutation(definition.roles?.[roleId]) },
    ]))
    return [
      stageId,
      {
        ...stageValue,
        mutation: executionMutation(definition),
        ...(Object.keys(roles).length ? { roles } : {}),
      },
    ]
  }))
}

export function displayExecutionConfiguration(resolved) {
  return canonicalize({
    schema: "ce-orca.execution-display/v1",
    workflowId: resolved.workflowId,
    runtime: resolved.runtime,
    confirmationRequired: resolved.confirmationRequired,
    profile: resolved.profile,
    identities: resolved.identities,
    defaults: resolved.executionConfig.defaults,
    stages: resolved.executionConfig.stages,
    ownership: resolved.executionConfig.ownership,
    targetApplication: resolved.targetApplication,
  })
}

export function resolveExecutionRequest({
  workflowId,
  registry,
  builtins,
  project = {},
  profile = {},
  profileName = null,
  prompt = {},
  probe,
  capabilities = probe,
}) {
  const workflow = registryWorkflow(registry, workflowId)
  if (builtins?.schema !== "ce-orca.defaults/v1") fail("invalid_defaults", "Built-in defaults are missing or incompatible.")
  if (profileName !== null && !PROFILE_RE.test(String(profileName))) fail("invalid_profile_name", "Profile name must use 1-64 letters, digits, dots, underscores, or hyphens.")
  const merged = mergeExecutionLayers({ workflowId, registry, builtins, project, profile, prompt })
  const runScopedOverride = runScopedExecutionOverride({ workflowId, registry, project, profile, prompt })
  const routedRuntime = routeRuntime(merged.runtime || "auto", probe)
  const probedWorktree = probe?.runtime?.context?.worktree?.selector
  const runtime = canonicalize({
    ...routedRuntime,
    ...(routedRuntime.selected === "orca" && typeof probedWorktree === "string" && probedWorktree
      ? { worktree: probedWorktree }
      : {}),
  })
  if (runtime.selected === "orca" && workflow.mode === "native") {
    fail("workflow_not_integrated", `${workflowId} has no Orca adapter in this installed CE version. Use runtime native.`, {
      workflowId,
      mode: workflow.mode,
    })
  }
  validateTargetApplication({ workflowId, workflow, runtime, runScopedOverride })
  const defaults = completeTarget(merged.defaults || {}, "defaults")
  const modelTiers = sanitizeModelTiers(builtins.modelTiers)
  const stages = materializeStages(workflow, merged, defaults, modelTiers, runScopedOverride)
  const executionStages = annotateExecutionMutations(workflow, stages)
  const normalizedCapabilities = normalizeCapabilities(capabilities)
  if (runtime.selected === "orca") {
    validateTargetCapability(defaults, normalizedCapabilities, "defaults")
    for (const [stageId, stageValue] of Object.entries(stages)) {
      validateTargetCapability(stageValue, normalizedCapabilities, `stages.${stageId}`)
      for (const [roleId, roleValue] of Object.entries(stageValue.roles || {})) {
        validateTargetCapability(roleValue, normalizedCapabilities, `stages.${stageId}.roles.${roleId}`)
      }
      const definition = workflow.stages[stageId]
      if (definition.defaultOwner === "orca") {
        if (executionMutation(definition) === "read") {
          validateReadCapability(stageValue, normalizedCapabilities, `stages.${stageId}`)
        }
        const mutatingRoles = Object.entries(definition.roles || {})
          .filter(([, role]) => role.mutation === "worktree-write")
        if (definition.mutation === "worktree-write" && mutatingRoles.length === 0) {
          validateWriterCapability(stageValue, normalizedCapabilities, `stages.${stageId}`)
        }
        for (const [roleId] of mutatingRoles) {
          validateWriterCapability(stageValue.roles[roleId], normalizedCapabilities, `stages.${stageId}.roles.${roleId}`)
        }
        for (const [roleId, role] of Object.entries(definition.roles || {})) {
          if (executionMutation(role) === "read") {
            validateReadCapability(stageValue.roles[roleId], normalizedCapabilities, `stages.${stageId}.roles.${roleId}`)
          }
        }
      }
    }
  }
  const identities = canonicalize(registry.identities)
  const ownership = Object.fromEntries(Object.keys(workflow.stages).sort().map((stageId) => [
    stageId,
    runtime.selected === "native" ? "native" : workflow.stages[stageId].defaultOwner,
  ]))
  const targetApplication = canonicalize({
    defaults: { appliedBy: runtime.selected === "orca" ? "orca" : "native-unconfigurable" },
    stages: Object.fromEntries(Object.keys(workflow.stages).sort().map((stageId) => {
      const definition = workflow.stages[stageId]
      const appliedBy = runtime.selected !== "orca"
        ? "native-unconfigurable"
        : definition.defaultOwner === "orca"
          ? "orca"
          : definition.nativeTargetHandling === "child-workflow"
            ? "child-workflow"
            : "native-unconfigurable"
      return [stageId, { appliedBy }]
    })),
  })
  const provenance = {
    ceVersion: identities.ceVersion,
    integrationVersion: identities.integrationVersion,
    registryVersion: identities.registryVersion,
    profile: profileName || "",
    profileDigest: profileName ? digest(sanitizeLayer(profile, { workflowId, registry, label: "profile" })) : "",
  }
  const executionConfig = canonicalize({
    version: identities.requestVersion,
    workflowId,
    defaults,
    stages: executionStages,
    ownership,
    provenance,
    confirmation: merged.confirmation === true,
    artifacts: [],
  })
  const resolved = canonicalize({
    schema: RESOLVED_EXECUTION_SCHEMA,
    workflowId,
    runtime,
    confirmationRequired: merged.confirmation === true,
    profile: profileName || null,
    identities,
    runScopedOverride,
    targetApplication,
    executionConfig,
  })
  return { ...resolved, display: displayExecutionConfiguration(resolved) }
}

function executeFile(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    nodeExecFile(command, args, { encoding: "utf8", maxBuffer: 8 * 1024 * 1024, ...options }, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout || ""
        error.stderr = stderr || ""
        reject(error)
        return
      }
      resolve({ stdout: stdout || "", stderr: stderr || "", exitCode: 0 })
    })
  })
}

export function resolveRuntimeCommand(env = process.env) {
  const configured = typeof env?.CE_ORCA_COMMAND === "string" ? env.CE_ORCA_COMMAND.trim() : ""
  if (configured.includes("\0")) fail("invalid_orca_command", "CE_ORCA_COMMAND must not contain NUL bytes.")
  return configured || "orca-orch"
}

export async function probeRuntime({
  command = resolveRuntimeCommand(),
  protocolVersion = "orca.local-protocol/v1",
  requestVersion = ORCA_REQUEST_VERSION,
  worktree = "",
  requiredAdapters = [],
  execFile = executeFile,
} = {}) {
  const args = ["capabilities", "--protocol", protocolVersion]
  if (worktree) args.push("--worktree", worktree)
  if (requiredAdapters.length) args.push("--require-adapters", [...new Set(requiredAdapters)].sort().join(","))
  let result
  try {
    result = await execFile(command, args, { timeout: 10_000 })
  } catch (error) {
    if (error?.code === "ENOENT") {
      return { schema: "orca.capabilities/v1", state: "absent", protocol: { version: null, compatible: null }, issues: [{ code: "orca-command-missing", message: `${command} is not on PATH.` }] }
    }
    return { schema: "orca.capabilities/v1", state: "unhealthy", protocol: { version: null, compatible: null }, issues: [{ code: "orca-command-failed", message: error?.stderr || error?.message || String(error) }] }
  }
  let envelope
  try {
    envelope = JSON.parse(String(result.stdout || "").trim())
  } catch {
    return { schema: "orca.capabilities/v1", state: "unhealthy", protocol: { version: null, compatible: null }, issues: [{ code: "invalid-capabilities-json", message: `${command} returned invalid JSON.` }] }
  }
  if (envelope.schema !== "orca.capabilities/v1" || !RUNTIME_STATES.has(envelope.state)) {
    return { schema: "orca.capabilities/v1", state: "unhealthy", protocol: envelope.protocol || { version: null, compatible: null }, issues: [{ code: "invalid-capabilities-envelope", message: `${command} returned an unsupported capabilities envelope.` }] }
  }
  const protocolAttested = envelope.protocol?.version === protocolVersion
    && envelope.protocol?.compatible === true
    && Array.isArray(envelope.protocol?.supportedRequestVersions)
    && envelope.protocol.supportedRequestVersions.includes(requestVersion)
  if (!protocolAttested) {
    return {
      ...envelope,
      state: "incompatible",
      issues: [
        ...(Array.isArray(envelope.issues) ? envelope.issues : []),
        {
          code: "protocol-attestation-mismatch",
          message: `The Orca endpoint must attest protocol ${protocolVersion} with compatible=true and request version ${requestVersion}.`,
        },
      ],
    }
  }
  if (envelope.state === "healthy") {
    const packetTransport = envelope.capabilities?.transport?.confidentialPacket
    const requiredTransport = packetTransport?.supported === true
      && packetTransport.delivery === "in-memory-consume-v1"
      && packetTransport.sourceConsumption === "explicit-one-shot-v1"
    const requiredWait = envelope.capabilities?.lifecycle?.wait === true
    const requiredArtifactRead = envelope.capabilities?.results?.artifactRead?.supported === true
    if (!requiredTransport || !requiredWait || !requiredArtifactRead) {
      return {
        ...envelope,
        state: "incompatible",
        issues: [
          ...(Array.isArray(envelope.issues) ? envelope.issues : []),
          {
            code: "required-capability-missing",
            message: "The Orca endpoint must support lifecycle.wait, in-memory-consume-v1 confidential packets, explicit-one-shot-v1 packet-source consumption, and opaque artifact reads.",
          },
        ],
      }
    }
  }
  return envelope
}

export async function writePrivateJsonAtomic(filePath, value) {
  const absolute = path.resolve(filePath)
  await fs.mkdir(path.dirname(absolute), { recursive: true, mode: 0o700 })
  const temporary = path.join(path.dirname(absolute), `.${path.basename(absolute)}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`)
  try {
    const handle = await fs.open(temporary, "wx", 0o600)
    try {
      await handle.writeFile(canonicalJson(value), "utf8")
      await handle.sync()
    } finally {
      await handle.close()
    }
    await fs.chmod(temporary, 0o600)
    await fs.rename(temporary, absolute)
    await fs.chmod(absolute, 0o600)
  } catch (error) {
    await fs.rm(temporary, { force: true })
    throw error
  }
  return absolute
}

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

function profileLockFifoPath(lockPath, token) {
  if (typeof process.getuid !== "function") {
    fail("profile_lock_platform_unsupported", "Atomic profile persistence requires a Unix-like runtime with process ownership support.")
  }
  const absoluteLockPath = path.resolve(lockPath)
  return { directory: path.dirname(absoluteLockPath), fifoPath: `${absoluteLockPath}.${token}.fifo` }
}

async function startProfileLockLiveness(lockPath, token) {
  const { directory, fifoPath } = profileLockFifoPath(lockPath, token)
  await fs.mkdir(directory, { recursive: true, mode: 0o700 })
  await fs.rm(fifoPath, { force: true })
  let handle
  try {
    await executeFile(MKFIFO_COMMAND, [fifoPath], { timeout: 1_000 })
    await fs.chmod(fifoPath, 0o600)
    handle = await fs.open(fifoPath, fsConstants.O_RDWR | fsConstants.O_NONBLOCK)
  } catch (error) {
    await handle?.close().catch(() => {})
    await fs.rm(fifoPath, { force: true })
    throw error
  }
  let closed = false
  return {
    descriptor: { protocol: "fifo-writer-v1", path: fifoPath },
    close: async ({ removePath = true } = {}) => {
      if (closed) return
      closed = true
      try {
        await handle.close()
      } finally {
        if (removePath) await fs.rm(fifoPath, { force: true })
      }
    },
  }
}

async function assertFifoPath(fifoPath) {
  const stats = await fs.lstat(fifoPath)
  if (!stats.isFIFO()) {
    fail("profile_lock_liveness_unavailable", `Profile lock liveness path is not a FIFO: ${JSON.stringify(fifoPath)}.`)
  }
}

async function readFifoWriterState(handle) {
  try {
    const { bytesRead } = await handle.read(Buffer.alloc(1), 0, 1, null)
    return bytesRead > 0
  } catch (error) {
    if (error?.code === "EAGAIN" || error?.code === "EWOULDBLOCK") return true
    throw error
  }
}

function rethrowFifoLivenessError(error, fifoPath) {
  if (error?.code === "profile_lock_liveness_unavailable") throw error
  fail("profile_lock_liveness_unavailable", `Profile lock liveness could not be verified at ${JSON.stringify(fifoPath)}.`, {
    cause: error?.code || error?.name || "unknown",
  })
}

async function fifoHasWriter(fifoPath) {
  let handle
  try {
    await assertFifoPath(fifoPath)
    handle = await fs.open(fifoPath, fsConstants.O_RDONLY | fsConstants.O_NONBLOCK)
    return await readFifoWriterState(handle)
  } catch (error) {
    rethrowFifoLivenessError(error, fifoPath)
  } finally {
    await handle?.close().catch(() => {})
  }
}

function invalidProfileLockFormat(lockPath, owner, message) {
  fail("profile_lock_format_unsupported", message, {
    lockPath,
    schema: isObject(owner) && typeof owner.schema === "string" ? owner.schema : null,
  })
}

function validateProfileLockOwner(owner, lockPath) {
  if (
    !isObject(owner)
    || owner.schema !== PROFILE_LOCK_SCHEMA
    || !/^[0-9]+-[a-f0-9]{24}$/.test(owner.token || "")
    || owner.liveness?.protocol !== "fifo-writer-v1"
    || typeof owner.liveness.path !== "string"
  ) {
    invalidProfileLockFormat(
      lockPath,
      owner,
      `Profile lock at ${JSON.stringify(lockPath)} uses an unsupported or incomplete format; verify no older writer is active before removing it.`,
    )
  }
  const { fifoPath } = profileLockFifoPath(lockPath, owner.token)
  if (owner.liveness.path !== fifoPath) {
    invalidProfileLockFormat(
      lockPath,
      owner,
      `Profile lock at ${JSON.stringify(lockPath)} has an invalid liveness path; refusing unsafe recovery.`,
    )
  }
  return fifoPath
}

async function profileLockOwnerIsAlive(owner, lockPath) {
  const fifoPath = validateProfileLockOwner(owner, lockPath)
  return fifoHasWriter(fifoPath)
}

async function currentProfileLockLiveness(owner, lockPath) {
  try {
    return await profileLockOwnerIsAlive(owner, lockPath) ? "alive" : "dead"
  } catch (error) {
    if (error?.code !== "profile_lock_liveness_unavailable" || error?.details?.cause !== "ENOENT") {
      throw error
    }
    const current = await readProfileLockOwner(lockPath, lockPath)
    if (!current || current.token !== owner.token) return "changed"
    throw error
  }
}

async function removeStaleProfileLockLiveness(owner, lockPath) {
  const fifoPath = validateProfileLockOwner(owner, lockPath)
  await fs.rm(fifoPath, { force: true })
}

async function readProfileLockOwner(filePath, lockPath) {
  try {
    const owner = JSON.parse(await fs.readFile(filePath, "utf8"))
    validateProfileLockOwner(owner, lockPath)
    return owner
  } catch (error) {
    if (error?.code === "ENOENT") return null
    if (error?.code === "profile_lock_format_unsupported") throw error
    invalidProfileLockFormat(
      lockPath,
      null,
      `Profile lock at ${JSON.stringify(filePath)} is unreadable; refusing unsafe recovery.`,
    )
  }
}

async function latestRecoveryClaim(recoveryBase) {
  const directory = path.dirname(recoveryBase)
  const prefix = `${path.basename(recoveryBase)}.`
  const names = await fs.readdir(directory)
  let index = -1
  let recoveryPath = null
  for (const name of names) {
    if (!name.startsWith(prefix)) continue
    const suffix = name.slice(prefix.length)
    if (!/^\d+$/.test(suffix)) continue
    const candidate = Number(suffix)
    if (Number.isSafeInteger(candidate) && candidate > index) {
      index = candidate
      recoveryPath = path.join(directory, name)
    }
  }
  return { index, recoveryPath }
}

async function recoveryClaimIsLive(recoveryPath, lockPath) {
  if (!recoveryPath) return false
  const owner = await readProfileLockOwner(recoveryPath, lockPath)
  if (!owner) return false
  return profileLockOwnerIsAlive(owner, lockPath)
}

async function electProfileLockRecovery(recoveryBase, claimPath, lockPath, deadline) {
  while (Date.now() < deadline) {
    const latest = await latestRecoveryClaim(recoveryBase)
    if (await recoveryClaimIsLive(latest.recoveryPath, lockPath)) return false
    const recoveryPath = `${recoveryBase}.${latest.index + 1}`
    try {
      await fs.link(claimPath, recoveryPath)
      return true
    } catch (error) {
      if (error?.code !== "EEXIST") throw error
    }
  }
  return false
}

async function replaceAbandonedProfileLock(lockPath, claimPath, owner) {
  const current = await readProfileLockOwner(lockPath, lockPath)
  if (!current || current.token !== owner.token) return false
  if (await currentProfileLockLiveness(current, lockPath) !== "dead") return false
  await fs.rename(claimPath, lockPath)
  await fs.link(lockPath, claimPath)
  await removeStaleProfileLockLiveness(owner, lockPath)
  return true
}

async function recoverAbandonedProfileLock(lockPath, claimPath, deadline) {
  const owner = await readProfileLockOwner(lockPath, lockPath)
  if (!owner) return false
  if (await currentProfileLockLiveness(owner, lockPath) !== "dead") return false
  const claimant = await readProfileLockOwner(claimPath, lockPath)
  if (!claimant) return false
  const recoveryBase = `${lockPath}.${owner.token}.recovery`
  const elected = await electProfileLockRecovery(recoveryBase, claimPath, lockPath, deadline)
  if (!elected) return false
  // Recovery claims are deliberately retained. Removing and later reusing a
  // generation creates an ABA race where an older cleaner can unlink a newer
  // claimant's liveness FIFO. They are inert once the owner token changes and
  // only accumulate after an actual writer crash.
  return replaceAbandonedProfileLock(lockPath, claimPath, owner)
}

async function statIfExists(filePath) {
  try {
    return await fs.stat(filePath)
  } catch (error) {
    if (error?.code === "ENOENT") return null
    throw error
  }
}

const releaseProfileLock = (lockPath, claimPath, closeLiveness) => async () => {
  let removeLivenessPath = false
  try {
    const [claimed, current] = await Promise.all([
      fs.stat(claimPath),
      statIfExists(lockPath),
    ])
    const ownsCurrent = Boolean(current && current.dev === claimed.dev && current.ino === claimed.ino)
    if (ownsCurrent) {
      await fs.rm(lockPath, { force: true })
    }
    // A recovery hardlink may intentionally outlive this owner so generation
    // names are never reused. Keep its FIFO node (with no writer after close)
    // so later contenders can prove that retained recovery claim is dead.
    removeLivenessPath = claimed.nlink <= 1 + Number(ownsCurrent)
  } finally {
    try {
      await fs.rm(claimPath, { force: true })
    } finally {
      await closeLiveness({ removePath: removeLivenessPath })
    }
  }
}

async function lockBelongsToToken(lockPath, token) {
  try {
    const owner = JSON.parse(await fs.readFile(lockPath, "utf8"))
    return owner?.schema === PROFILE_LOCK_SCHEMA && owner?.token === token
  } catch (error) {
    if (error?.code === "ENOENT") return false
    return true
  }
}

async function claimHasOtherLinks(claimPath) {
  try {
    return (await fs.stat(claimPath)).nlink > 1
  } catch (error) {
    if (error?.code === "ENOENT") return false
    return true
  }
}

async function acquireProfileLock(filePath) {
  const absolute = path.resolve(filePath)
  const lockPath = `${absolute}.lock`
  const token = `${process.pid}-${randomBytes(12).toString("hex")}`
  const claimPath = `${lockPath}.${token}.claim`
  const deadline = Date.now() + PROFILE_LOCK_TIMEOUT_MS
  await fs.mkdir(path.dirname(absolute), { recursive: true, mode: 0o700 })
  const liveness = await startProfileLockLiveness(lockPath, token)
  try {
    const claim = await fs.open(claimPath, "wx", 0o600)
    try {
      await claim.writeFile(canonicalJson({
        schema: PROFILE_LOCK_SCHEMA,
        token,
        pid: process.pid,
        createdAt: new Date().toISOString(),
        liveness: liveness.descriptor,
      }), "utf8")
      await claim.sync()
    } finally {
      await claim.close()
    }
    while (true) {
      try {
        await fs.link(claimPath, lockPath)
        return releaseProfileLock(lockPath, claimPath, liveness.close)
      } catch (error) {
        if (error?.code !== "EEXIST") throw error
        if (await recoverAbandonedProfileLock(lockPath, claimPath, deadline)) {
          return releaseProfileLock(lockPath, claimPath, liveness.close)
        }
        if (Date.now() >= deadline) {
          fail("profile_lock_timeout", `Timed out waiting to update profiles at ${JSON.stringify(absolute)}.`, {
            filePath: absolute,
            timeoutMs: PROFILE_LOCK_TIMEOUT_MS,
          })
        }
        await delay(Math.min(PROFILE_LOCK_RETRY_MS, Math.max(1, deadline - Date.now())))
      }
    }
  } catch (error) {
    const preserveLivenessPath = await lockBelongsToToken(lockPath, token) || await claimHasOtherLinks(claimPath)
    try {
      await fs.rm(claimPath, { force: true })
    } finally {
      await liveness.close({ removePath: !preserveLivenessPath })
    }
    throw error
  }
}

async function readProfilesStore(filePath) {
  try {
    const existing = JSON.parse(await fs.readFile(path.resolve(filePath), "utf8"))
    if (existing.schema !== PROFILES_SCHEMA || !isObject(existing.profiles)) {
      fail("invalid_profiles_file", `Profiles file must use ${PROFILES_SCHEMA}.`)
    }
    allowedKeys(existing, new Set(["schema", "profiles"]), "profiles")
    return existing
  } catch (error) {
    if (error?.code === "ENOENT") return { schema: PROFILES_SCHEMA, profiles: {} }
    throw error
  }
}

function updatedProfilesStore(store, profileName, workflowId, profileValue) {
  const existing = store.profiles[profileName]
  const previous = isObject(existing) && isObject(existing.workflows) ? existing : { workflows: {} }
  const profileRecord = { workflows: { ...previous.workflows, [workflowId]: profileValue } }
  return { schema: PROFILES_SCHEMA, profiles: { ...store.profiles, [profileName]: profileRecord } }
}

async function writeProfileUpdate(filePath, profileName, workflowId, profileValue) {
  const store = await readProfilesStore(filePath)
  const next = updatedProfilesStore(store, profileName, workflowId, profileValue)
  await writePrivateJsonAtomic(filePath, next)
}

export async function persistProfileAtomic({ filePath, profileName, request, explicit = false, registry, workflowId }) {
  if (explicit !== true) fail("persistence_not_explicit", "Saving an execution profile requires explicit user intent.")
  if (!PROFILE_RE.test(String(profileName || ""))) fail("invalid_profile_name", "Profile name must use 1-64 letters, digits, dots, underscores, or hyphens.")
  const sanitized = sanitizeLayer(request, { workflowId, registry, label: "profile-write" })
  const profileValue = canonicalize({
    ...(own(sanitized, "runtime") ? { runtime: sanitized.runtime } : {}),
    ...(own(sanitized, "confirmation") ? { confirmation: sanitized.confirmation } : {}),
    ...(sanitized.defaults ? { defaults: sanitized.defaults } : {}),
    ...(sanitized.stages ? { stages: sanitized.stages } : {}),
  })
  const releaseLock = await acquireProfileLock(filePath)
  let operationError = null
  try {
    await writeProfileUpdate(filePath, profileName, workflowId, profileValue)
  } catch (error) {
    operationError = error
  }
  let releaseError = null
  try {
    await releaseLock()
  } catch (error) {
    releaseError = error
  }
  if (operationError) throw operationError
  if (releaseError) throw releaseError
  return { profileName, profileDigest: digest(profileValue), filePath: path.resolve(filePath) }
}

export function selectProfile(store, profileName, workflowId = null) {
  if (!profileName) return {}
  if (!isObject(store) || store.schema !== PROFILES_SCHEMA || !isObject(store.profiles)) fail("invalid_profiles_file", `Profiles file must use ${PROFILES_SCHEMA}.`)
  allowedKeys(store, new Set(["schema", "profiles"]), "profiles")
  if (!own(store.profiles, profileName)) {
    const available = Object.keys(store.profiles).sort()
    fail("unknown_profile", `Unknown profile ${JSON.stringify(profileName)}. Valid profiles: ${available.join(", ") || "(none)"}.`, { requested: profileName, available })
  }
  const record = store.profiles[profileName]
  if (isObject(record?.workflows)) {
    allowedKeys(record, new Set(["workflows"]), `profiles.${profileName}`)
    if (!workflowId || !own(record.workflows, workflowId)) {
      const available = Object.keys(record.workflows).sort()
      fail("profile_workflow_missing", `Profile ${JSON.stringify(profileName)} has no settings for ${JSON.stringify(workflowId)}. Available workflows: ${available.join(", ") || "(none)"}.`, { profileName, workflowId, available })
    }
    return record.workflows[workflowId]
  }
  return record
}

export function selectProjectConfig(store, workflowId) {
  if (!isObject(store)) fail("invalid_project_config", "Project configuration must be an object.")
  if (store.schema !== PROJECT_CONFIG_SCHEMA) return store
  allowedKeys(store, new Set(["schema", "workflows"]), "project")
  if (!isObject(store.workflows)) fail("invalid_project_config", `${PROJECT_CONFIG_SCHEMA} requires a workflows object.`)
  return store.workflows[workflowId] || {}
}

function childArtifactRefs(result) {
  const refs = []
  for (const key of ["nodes", "reviewers", "units"]) {
    for (const record of Array.isArray(result?.[key]) ? result[key] : []) {
      if (typeof record?.artifactRef === "string") refs.push(record.artifactRef)
    }
  }
  return [...new Set(refs)].sort()
}

function validateRelativeArtifactRef(relative) {
  if (
    typeof relative !== "string"
    || !relative
    || relative.startsWith("/")
    || relative.includes("\\")
    || relative.split("/").some((part) => !part || part === "." || part === "..")
  ) fail("invalid_result_artifact", `CE result contains an unsafe artifactRef ${JSON.stringify(relative)}.`)
  return relative
}

async function mapWithConcurrency(values, concurrency, mapper) {
  const results = new Array(values.length)
  let nextIndex = 0
  let firstError = null
  const workers = Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (firstError === null && nextIndex < values.length) {
      const index = nextIndex
      nextIndex += 1
      try {
        results[index] = await mapper(values[index], index)
      } catch (error) {
        if (firstError === null) firstError = error
      }
    }
  })
  await Promise.allSettled(workers)
  if (firstError !== null) throw firstError
  return results
}

function runScopedRef(value, runRoot, { root = false } = {}) {
  if (value === null) return true
  if (typeof value !== "string" || value.includes("\\")) return false
  if (root && value === runRoot) return true
  if (!value.startsWith(`${runRoot}/`)) return false
  const relative = value.slice(runRoot.length + 1)
  return Boolean(relative) && relative.split("/").every((part) => part && part !== "." && part !== "..")
}

function validRunArtifactRefs(refs, runRoot) {
  if (!Array.isArray(refs)) return false
  const pathsAreValid = refs.every((ref) => typeof ref === "string" && runScopedRef(ref, runRoot))
  return pathsAreValid && new Set(refs).size === refs.length
}

function validRunResultRefs(refs, runRoot) {
  if (!isObject(refs)) return false
  const checks = [
    runScopedRef(refs.run, runRoot, { root: true }),
    runScopedRef(refs.log, runRoot),
    runScopedRef(refs.events, runRoot),
    refs.terminalResult === undefined || runScopedRef(refs.terminalResult, runRoot),
    validRunArtifactRefs(refs.artifacts, runRoot),
  ]
  return checks.every(Boolean)
}

function runResultId(response) {
  return typeof response?.runId === "string" ? response.runId : ""
}

function primaryArtifactCount(refs, expectedPrimary, validRefs) {
  if (!validRefs) return 0
  return refs.artifacts.filter((ref) => ref === expectedPrimary).length
}

function validSucceededRunRefs(succeeded, refs, runRoot, primaryCount) {
  if (!succeeded) return true
  return refs?.run === runRoot && primaryCount === 1
}

function validateRunResultEnvelope(response) {
  const runId = runResultId(response)
  const runRoot = `runs/${runId}`
  const refs = response?.refs
  const validState = RUN_RESULT_STATES.has(response?.state)
  const validRefs = validRunResultRefs(refs, runRoot)
  const expectedPrimary = `${runRoot}/ce-result.json`
  const primaryCount = primaryArtifactCount(refs, expectedPrimary, validRefs)
  const succeeded = response?.state === "succeeded"
  const terminal = TERMINAL_RUN_RESULT_STATES.has(response?.state)
  const validSuccess = validSucceededRunRefs(succeeded, refs, runRoot, primaryCount)
  const envelopeChecks = [
    response?.schema === "orca.run-result/v1",
    validState,
    response?.terminal === terminal,
    RUN_ID_RE.test(runId),
    response?.ok === succeeded,
    validRefs,
    validSuccess,
  ]
  if (!envelopeChecks.every(Boolean)) {
    fail("invalid_orca_response", "orca-orch returned an unsupported or non-terminal run-result envelope.", {
      response,
      expectedPrimary,
    })
  }
  return { expectedPrimary, primaryCount }
}

async function readPublishedJsonArtifact({ command, execFile, response, ref }) {
  if (!Array.isArray(response?.refs?.artifacts) || !response.refs.artifacts.includes(ref)) {
    fail("result_artifact_missing", `Orca did not publish required artifact ${JSON.stringify(ref)}.`)
  }
  let output
  try {
    output = await execFile(command, ["artifact-read", response.runId, ref], { timeout: 15_000 })
  } catch (error) {
    fail("artifact_read_failed", `Orca could not read published artifact ${JSON.stringify(ref)}: ${error?.stderr || error?.message || String(error)}`)
  }
  try {
    return JSON.parse(String(output.stdout || ""))
  } catch {
    fail("invalid_result_artifact", `Published artifact ${JSON.stringify(ref)} is not valid JSON.`)
  }
}

async function hydrateRunResult({ command, execFile, response, resultContract = null, tolerateChildErrors = false }) {
  const primaryRef = `runs/${response.runId}/ce-result.json`
  const value = await readPublishedJsonArtifact({ command, execFile, response, ref: primaryRef })
  if (resultContract) validateRuntimeResultContract(resultContract, value)
  const prefix = `runs/${response.runId}/`
  const relatives = childArtifactRefs(value).map(validateRelativeArtifactRef)
  if (relatives.length > MAX_CHILD_ARTIFACTS) {
    fail("result_artifact_limit", `CE result publishes ${relatives.length} child artifacts; the limit is ${MAX_CHILD_ARTIFACTS}.`, {
      count: relatives.length,
      limit: MAX_CHILD_ARTIFACTS,
    })
  }
  const outcomes = await mapWithConcurrency(relatives, ARTIFACT_READ_CONCURRENCY, async (relative) => {
    try {
      const artifact = await readPublishedJsonArtifact({ command, execFile, response, ref: `${prefix}${relative}` })
      return { ok: true, relative, artifact }
    } catch (error) {
      if (!tolerateChildErrors) throw error
      return {
        ok: false,
        relative,
        error: {
          artifactRef: relative,
          code: error?.code || "artifact_read_failed",
          message: error?.message || String(error),
        },
      }
    }
  })
  const artifacts = Object.fromEntries(outcomes.filter(({ ok }) => ok).map(({ relative, artifact }) => [relative, artifact]))
  const artifactErrors = outcomes.filter(({ ok }) => !ok).map(({ error }) => error)
  return {
    ref: primaryRef,
    value,
    artifacts,
    ...(artifactErrors.length ? { artifactErrors } : {}),
  }
}

async function hydrateFailedRunResult({ command, execFile, response, resultContract }) {
  const primaryRef = `runs/${response?.runId}/ce-result.json`
  const hasPrimaryResult = Array.isArray(response?.refs?.artifacts) && response.refs.artifacts.includes(primaryRef)
  if (response?.terminal !== true || !hasPrimaryResult) return {}
  try {
    return {
      result: await hydrateRunResult({
        command,
        execFile,
        response,
        resultContract,
        tolerateChildErrors: true,
      }),
    }
  } catch (error) {
    return {
      resultHydrationError: {
        code: error?.code || "artifact_read_failed",
        message: error?.message || String(error),
      },
    }
  }
}

export async function runResolvedRequest({
  resolved,
  workflowRegistryPath,
  packet = null,
  packetPath = "",
  approved = false,
  waitSeconds = 900,
  worktree = "",
  command = resolveRuntimeCommand(),
  execFile = executeFile,
  onDisplay = () => {},
} = {}) {
  if (!isObject(resolved) || resolved.schema !== RESOLVED_EXECUTION_SCHEMA) fail("invalid_resolved_request", `Resolved request must use ${RESOLVED_EXECUTION_SCHEMA}.`)
  if (typeof resolved.confirmationRequired !== "boolean") {
    fail("invalid_resolved_request", "Resolved confirmationRequired must be boolean.", {
      confirmationRequired: resolved.confirmationRequired,
    })
  }
  if (!isObject(resolved.executionConfig) || typeof resolved.executionConfig.confirmation !== "boolean") {
    fail("invalid_resolved_request", "Resolved executionConfig.confirmation must be boolean.", {
      executionConfigConfirmation: resolved.executionConfig?.confirmation,
    })
  }
  if (resolved.confirmationRequired !== resolved.executionConfig.confirmation) {
    fail("invalid_resolved_request", "Resolved confirmation fields must agree.", {
      confirmationRequired: resolved.confirmationRequired,
      executionConfigConfirmation: resolved.executionConfig.confirmation,
    })
  }
  const confirmationRequired = resolved.executionConfig.confirmation
  const display = displayExecutionConfiguration(resolved)
  await onDisplay(display)
  if (resolved.runtime?.selected === "native") return { schema: DISPATCH_SCHEMA, action: "native", display }
  if (resolved.runtime?.selected !== "orca") fail("invalid_resolved_request", "Resolved runtime must be native or orca.")
  if (confirmationRequired && approved !== true) {
    return { schema: DISPATCH_SCHEMA, action: "awaiting-confirmation", display }
  }
  if (!workflowRegistryPath) fail("workflow_registry_required", "An installed skill-local Orca workflow registry is required.")
  if (!Number.isInteger(waitSeconds) || waitSeconds < 1) fail("invalid_wait", "waitSeconds must be a positive integer.")
  const resultContract = await loadRuntimeResultContract({ workflowRegistryPath, workflowId: resolved.workflowId })
  const scratch = await fs.mkdtemp(path.join(os.tmpdir(), "ce-orca-dispatch-"))
  await fs.chmod(scratch, 0o700)
  try {
    const requestPath = await writePrivateJsonAtomic(path.join(scratch, "execution-config.json"), resolved.executionConfig)
    let effectivePacketPath = packetPath ? path.resolve(packetPath) : ""
    if (packet !== null) effectivePacketPath = await writePrivateJsonAtomic(path.join(scratch, "packet.json"), packet)
    const args = ["run-request", requestPath, "--registry", path.resolve(workflowRegistryPath)]
    if (effectivePacketPath) args.push("--packet", effectivePacketPath, "--consume-packet-source", "true")
    const resolvedWorktree = worktree || resolved.runtime?.worktree || ""
    if (typeof resolvedWorktree !== "string" || resolvedWorktree.includes("\0")) {
      fail("invalid_resolved_request", "Resolved Orca worktree must be a NUL-free selector string.")
    }
    if (resolvedWorktree) args.push("--worktree", resolvedWorktree)
    args.push("--wait", String(waitSeconds))
    let result
    try {
      result = await execFile(command, args, { timeout: (waitSeconds + 30) * 1_000 })
    } catch (error) {
      let response = null
      try {
        response = JSON.parse(String(error?.stdout || "").trim())
      } catch {
        // Keep the command error below; stderr/stdout contents are never put
        // into the persisted execution request.
      }
      if (response?.schema === "orca.run-result/v1") {
        validateRunResultEnvelope(response)
        const failureArtifacts = await hydrateFailedRunResult({ command, execFile, response, resultContract })
        fail("orca_run_failed", `Orca run ended ${response.state}.`, { response, ...failureArtifacts })
      }
      fail("orca_dispatch_failed", error?.stderr || error?.stdout || error?.message || String(error), { command, args: args.map((arg, index) => index === 1 ? "<private-request>" : arg) })
    }
    let response
    try {
      response = JSON.parse(String(result.stdout || "").trim())
    } catch {
      fail("invalid_orca_response", `${command} returned invalid JSON.`)
    }
    validateRunResultEnvelope(response)
    if (response.state !== "succeeded" || response.ok !== true) {
      const failureArtifacts = await hydrateFailedRunResult({ command, execFile, response, resultContract })
      fail("orca_run_failed", `Orca run ended ${response.state}.`, { response, ...failureArtifacts })
    }
    const hydratedResult = await hydrateRunResult({
      command,
      execFile,
      response,
      resultContract,
    })
    return {
      schema: DISPATCH_SCHEMA,
      action: "orca",
      response,
      result: hydratedResult,
      display,
    }
  } finally {
    await fs.rm(scratch, { recursive: true, force: true })
  }
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(path.resolve(filePath), "utf8"))
}

async function readJsonIfExists(filePath, fallback) {
  try {
    return await readJson(filePath)
  } catch (error) {
    if (error?.code === "ENOENT") return fallback
    throw error
  }
}

const defaultProfilesPath = () => path.join(os.homedir(), ".config", "compound-engineering-orca", "profiles.json")

function parseArgs(argv) {
  const positional = []
  const flags = {}
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (!token.startsWith("--")) {
      positional.push(token)
      continue
    }
    const key = token.slice(2)
    const next = argv[index + 1]
    if (!next || next.startsWith("--")) flags[key] = true
    else {
      flags[key] = next
      index += 1
    }
  }
  return { positional, flags }
}

async function cli() {
  const [commandName, ...rest] = process.argv.slice(2)
  const { positional, flags } = parseArgs(rest)
  const scriptDir = path.dirname(fileURLToPath(import.meta.url))
  const skillRoot = path.resolve(scriptDir, "..")
  const references = path.join(skillRoot, "references")
  if (commandName === "resolve") {
    const workflowId = String(flags.workflow || positional[0] || "")
    const registry = await readJson(String(flags.registry || path.join(references, "orca-role-registry.json")))
    const builtins = await readJson(String(flags.defaults || path.join(references, "orca-defaults.json")))
    const projectStore = flags.project
      ? await readJson(String(flags.project))
      : await readJsonIfExists(path.join(process.cwd(), ".ce-orca.json"), {})
    const project = selectProjectConfig(projectStore, workflowId)
    const prompt = flags.patch ? controllerExecutionPatch(await readJson(String(flags.patch))) : {}
    const profilesPath = String(flags.profiles || defaultProfilesPath())
    const profiles = await readJsonIfExists(profilesPath, { schema: PROFILES_SCHEMA, profiles: {} })
    const profileName = flags.profile ? String(flags.profile) : null
    const profile = selectProfile(profiles, profileName, workflowId)
    const requestedRuntime = prompt.runtime ?? profile.runtime ?? project.runtime ?? builtins.runtime ?? "auto"
    const probe = flags.probe
      ? await readJson(String(flags.probe))
      : requestedRuntime === "native"
        ? undefined
        : await probeRuntime({
            protocolVersion: registry.identities.protocolVersion,
            requestVersion: registry.identities.requestVersion,
            worktree: String(flags.worktree || ""),
          })
    const resolved = resolveExecutionRequest({ workflowId, registry, builtins, project, profile, profileName, prompt, probe })
    if (flags.out) await writePrivateJsonAtomic(String(flags.out), resolved)
    process.stdout.write(canonicalJson(resolved))
    return
  }
  if (commandName === "save-profile") {
    const workflowId = String(flags.workflow || positional[0] || "")
    const profileName = String(flags.name || "")
    const requestPath = String(flags.request || "")
    if (!workflowId || !profileName || !requestPath) {
      fail("usage", "Usage: orca-runtime.mjs save-profile --workflow <id> --name <name> --request <patch.json> --explicit true [--profiles <file>].")
    }
    const registry = await readJson(String(flags.registry || path.join(references, "orca-role-registry.json")))
    const request = await readJson(requestPath)
    const saved = await persistProfileAtomic({
      filePath: String(flags.profiles || defaultProfilesPath()),
      profileName,
      request,
      explicit: flags.explicit === "true",
      registry,
      workflowId,
    })
    process.stdout.write(canonicalJson({ ok: true, schema: "ce-orca.profile-saved/v1", ...saved }))
    return
  }
  if (commandName === "run") {
    const resolvedPath = String(flags.resolved || positional[0] || "")
    if (!resolvedPath) fail("usage", "Usage: orca-runtime.mjs run --resolved <file> --registry <file> [--packet <file>] [--approved true].")
    const resolved = await readJson(resolvedPath)
    const result = await runResolvedRequest({
      resolved,
      workflowRegistryPath: String(flags.registry || path.join(scriptDir, "orca-workflow-registry.json")),
      packetPath: flags.packet ? String(flags.packet) : "",
      approved: flags.approved === "true",
      waitSeconds: flags.wait ? Number(flags.wait) : 900,
      worktree: String(flags.worktree || ""),
      onDisplay: async (display) => process.stderr.write(`Effective CE-Orca configuration:\n${canonicalJson(display)}`),
    })
    process.stdout.write(canonicalJson(result))
    return
  }
  fail("usage", "Usage: orca-runtime.mjs <resolve|save-profile|run> ...")
}

async function isMainModule() {
  if (!process.argv[1]) return false
  const entryPath = path.resolve(process.argv[1])
  const modulePath = fileURLToPath(import.meta.url)
  if (entryPath === modulePath) return true
  const [realEntryPath, realModulePath] = await Promise.all([
    fs.realpath(entryPath).catch(() => entryPath),
    fs.realpath(modulePath).catch(() => modulePath),
  ])
  return realEntryPath === realModulePath
}

if (await isMainModule()) {
  try {
    await cli()
  } catch (error) {
    const response = {
      ok: false,
      schema: "ce-orca.error/v1",
      code: error?.code || "unexpected_error",
      message: error?.message || String(error),
      ...(error?.details && Object.keys(error.details).length ? { details: error.details } : {}),
    }
    process.stderr.write(canonicalJson(response))
    process.exitCode = 1
  }
}
