#!/usr/bin/env node

// Self-contained on purpose: this file is copied byte-for-byte into each
// supported skill so converted installations never depend on the repository
// level overlay tree.
import { execFile as nodeExecFile } from "node:child_process"
import { createHash, randomBytes } from "node:crypto"
import { promises as fs } from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

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

export async function persistProfileAtomic({ filePath, profileName, request, explicit = false, registry, workflowId }) {
  if (explicit !== true) fail("persistence_not_explicit", "Saving an execution profile requires explicit user intent.")
  if (!PROFILE_RE.test(String(profileName || ""))) fail("invalid_profile_name", "Profile name must use 1-64 letters, digits, dots, underscores, or hyphens.")
  const sanitized = sanitizeLayer(request, { workflowId, registry, label: "profile-write" })
  const profileValue = canonicalize({
    ...(own(sanitized, "runtime") ? { runtime: sanitized.runtime } : {}),
    ...(sanitized.defaults ? { defaults: sanitized.defaults } : {}),
    ...(sanitized.stages ? { stages: sanitized.stages } : {}),
  })
  let store = { schema: PROFILES_SCHEMA, profiles: {} }
  try {
    const existing = JSON.parse(await fs.readFile(path.resolve(filePath), "utf8"))
    if (existing.schema !== PROFILES_SCHEMA || !isObject(existing.profiles)) fail("invalid_profiles_file", `Profiles file must use ${PROFILES_SCHEMA}.`)
    allowedKeys(existing, new Set(["schema", "profiles"]), "profiles")
    store = existing
  } catch (error) {
    if (error?.code !== "ENOENT") throw error
  }
  const previous = isObject(store.profiles[profileName]) && isObject(store.profiles[profileName].workflows)
    ? store.profiles[profileName]
    : { workflows: {} }
  const profileRecord = { workflows: { ...previous.workflows, [workflowId]: profileValue } }
  const next = { schema: PROFILES_SCHEMA, profiles: { ...store.profiles, [profileName]: profileRecord } }
  await writePrivateJsonAtomic(filePath, next)
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

async function hydrateRunResult({ command, execFile, response }) {
  const primaryRef = response.refs?.artifacts?.find((ref) =>
    typeof ref === "string" && ref.endsWith("/ce-result.json"))
  if (!primaryRef) fail("result_artifact_missing", "Orca did not publish ce-result.json.")
  const value = await readPublishedJsonArtifact({ command, execFile, response, ref: primaryRef })
  const prefix = `runs/${response.runId}/`
  const entries = await Promise.all(childArtifactRefs(value).map(async (relative) => {
    if (
      !relative ||
      relative.startsWith("/") ||
      relative.includes("\\") ||
      relative.split("/").includes("..")
    ) fail("invalid_result_artifact", `CE result contains an unsafe artifactRef ${JSON.stringify(relative)}.`)
    const ref = `${prefix}${relative}`
    const artifact = await readPublishedJsonArtifact({ command, execFile, response, ref })
    return [relative, artifact]
  }))
  return { ref: primaryRef, value, artifacts: Object.fromEntries(entries) }
}

async function hydrateFailedRunResult({ command, execFile, response }) {
  const hasPrimaryResult = Array.isArray(response?.refs?.artifacts)
    && response.refs.artifacts.some((ref) => typeof ref === "string" && ref.endsWith("/ce-result.json"))
  if (response?.terminal !== true || !hasPrimaryResult) return {}
  try {
    return { result: await hydrateRunResult({ command, execFile, response }) }
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
  await onDisplay(displayExecutionConfiguration(resolved))
  if (resolved.runtime?.selected === "native") return { schema: DISPATCH_SCHEMA, action: "native", display: displayExecutionConfiguration(resolved) }
  if (resolved.runtime?.selected !== "orca") fail("invalid_resolved_request", "Resolved runtime must be native or orca.")
  if (resolved.confirmationRequired && approved !== true) {
    return { schema: DISPATCH_SCHEMA, action: "awaiting-confirmation", display: displayExecutionConfiguration(resolved) }
  }
  if (!workflowRegistryPath) fail("workflow_registry_required", "An installed skill-local Orca workflow registry is required.")
  if (!Number.isInteger(waitSeconds) || waitSeconds < 1) fail("invalid_wait", "waitSeconds must be a positive integer.")
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
        const failureArtifacts = await hydrateFailedRunResult({ command, execFile, response })
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
    const states = new Set(["succeeded", "failed", "stopped", "aborted", "timeout", "invalid", "not-found"])
    if (response.schema !== "orca.run-result/v1" || !states.has(response.state)) {
      fail("invalid_orca_response", `${command} returned an unsupported run-result envelope.`, { response })
    }
    if (response.state !== "succeeded" || response.ok !== true) {
      const failureArtifacts = await hydrateFailedRunResult({ command, execFile, response })
      fail("orca_run_failed", `Orca run ended ${response.state}.`, { response, ...failureArtifacts })
    }
    const hydratedResult = await hydrateRunResult({ command, execFile, response })
    return {
      schema: DISPATCH_SCHEMA,
      action: "orca",
      response,
      result: hydratedResult,
      display: displayExecutionConfiguration(resolved),
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

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
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
