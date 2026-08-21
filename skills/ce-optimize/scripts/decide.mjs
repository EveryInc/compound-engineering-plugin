#!/usr/bin/env node
// Decide keep / revert / inconclusive / censored / degenerate for one
// candidate against the current best. Owns multi-objective eligibility,
// noise-aware comparison, and the measurement-ladder next step.
//
// Usage:
//   node decide.mjs                 # JSON on stdin
//   node decide.mjs <input.json>
//
// A spec with no `objectives` and no `ladder` reproduces the legacy
// single-primary + absolute noise_threshold rule, except that a delta
// inside the threshold is `inconclusive` rather than a silent revert.

export function median(values) {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

function parseCheck(check) {
  const match = String(check).trim().match(/^(>=|<=|==|!=|>|<)\s*(.+)$/)
  if (!match) {
    throw new Error(`invalid gate check: ${check}`)
  }
  return { op: match[1], threshold: Number(match[2]) }
}

export function gatePasses(value, check) {
  const { op, threshold } = parseCheck(check)
  const n = finiteNumber(value)
  if (n == null || !Number.isFinite(threshold)) return false
  switch (op) {
    case ">=":
      return n >= threshold
    case "<=":
      return n <= threshold
    case ">":
      return n > threshold
    case "<":
      return n < threshold
    case "==":
      return n === threshold
    case "!=":
      return n !== threshold
    default:
      return false
  }
}

function signedDelta(baseline, candidate, direction) {
  return direction === "minimize" ? baseline - candidate : candidate - baseline
}

function finiteNumber(value) {
  if (value == null || value === "") return null
  const n = typeof value === "number" ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

function firstNonNegativeNumber(values, fallback) {
  for (const value of values) {
    const n = finiteNumber(value)
    if (n != null && n >= 0) return n
  }
  return fallback
}

function positiveInteger(value, fallback) {
  const n = typeof value === "number" ? value : Number(value)
  if (!Number.isInteger(n) || n < 1) return fallback
  return n
}

function verdictFromSigned(delta, threshold) {
  if (delta > threshold) return "improved"
  if (delta < -threshold) return "regressed"
  return "inconclusive"
}

function closedResult(fields) {
  return {
    eligible: false,
    next_measurement: "none",
    target_reached: false,
    improved_objectives: [],
    violated_objectives: [],
    comparisons: {},
    primary_delta: null,
    rank_score: 0,
    ...fields,
  }
}

function configuredAggregation(value) {
  return value === "mean" || value === "min" || value === "max" ? value : "median"
}

function aggregateSamples(samples, method) {
  if (!samples.length) return null
  if (method === "mean") return samples.reduce((sum, value) => sum + value, 0) / samples.length
  if (method === "min") return Math.min(...samples)
  if (method === "max") return Math.max(...samples)
  return median(samples)
}

function valueBundle(raw, aggregation = "median") {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const samples = Array.isArray(raw.samples) ? raw.samples.map(finiteNumber) : []
    if (samples.some((n) => n == null)) return { aggregate: null, samples: [] }
    const aggregate = samples.length
      ? aggregateSamples(samples, aggregation)
      : finiteNumber(raw.aggregate)
    return { aggregate: aggregate ?? null, samples }
  }
  if (raw != null && typeof raw !== "object") {
    const n = finiteNumber(raw)
    return n == null ? { aggregate: null, samples: [] } : { aggregate: n, samples: [] }
  }
  return null
}

function metricBundle(source, name, aggregation, type) {
  if (!source) return null
  const containers =
    type === "judge"
      ? [source.judge?.[name], source.metrics?.[name], source.diagnostics?.[name], source.gates?.[name]]
      : [source.metrics?.[name], source.judge?.[name], source.diagnostics?.[name], source.gates?.[name]]
  for (const raw of containers) {
    if (raw === undefined) continue
    return valueBundle(raw, aggregation)
  }
  return null
}

function normalizeSpec(spec) {
  const metric = spec.metric ?? {}
  const measurement = spec.measurement ?? {}
  const stability = spec.stability ?? measurement.stability ?? {}
  const primary = spec.primary ?? metric.primary ?? {}
  const judge = spec.judge ?? metric.judge
  const comparison = spec.comparison ?? stability.comparison
  return {
    ...spec,
    primary,
    objectives: spec.objectives ?? metric.objectives,
    degenerate_gates: spec.degenerate_gates ?? metric.degenerate_gates,
    judge,
    comparison,
    ladder: spec.ladder ?? stability.ladder ?? {},
    stability_mode: spec.stability_mode ?? stability.mode,
    aggregation: configuredAggregation(spec.aggregation ?? stability.aggregation),
    repeat_count: spec.repeat_count ?? stability.repeat_count,
    noise_threshold: spec.noise_threshold ?? stability.noise_threshold,
    minimum_improvement:
      spec.minimum_improvement ?? comparison?.minimum_improvement ?? judge?.minimum_improvement,
    measurement,
    stability,
  }
}

function comparisonDefaults(spec) {
  const stability = spec.stability ?? spec.measurement?.stability ?? {}
  const comparison = spec.comparison ?? stability.comparison ?? {}
  const usesJudge = spec.primary?.type === "judge" || spec.judge != null
  return {
    method: comparison.method ?? "absolute",
    noise_threshold: firstNonNegativeNumber(
      [comparison.noise_threshold, spec.noise_threshold, stability.noise_threshold],
      0.02,
    ),
    relative_threshold: firstNonNegativeNumber([comparison.relative_threshold], 0.05),
    minimum_improvement: firstNonNegativeNumber(
      [comparison.minimum_improvement, spec.minimum_improvement, spec.judge?.minimum_improvement],
      usesJudge ? 0.3 : null,
    ),
  }
}

function requiredObjectives(spec) {
  const primary = spec.primary ?? {}
  const listed = Array.isArray(spec.objectives) ? spec.objectives : []
  const extras = listed
    .map((objective) => ({
      name: objective.name,
      direction: objective.direction ?? primary.direction ?? "maximize",
      role: objective.role ?? "required",
      type: objective.type ?? "hard",
      target: objective.target ?? null,
      max_regression: objective.max_regression ?? null,
    }))
    .filter((objective) => objective.role !== "secondary")
  if (!primary.name) return extras
  const listedPrimary = extras.find((objective) => objective.name === primary.name)
  return [
    {
      name: primary.name,
      direction: primary.direction ?? listedPrimary?.direction ?? "maximize",
      role: "required",
      type: primary.type ?? listedPrimary?.type ?? "hard",
      target: primary.target ?? listedPrimary?.target ?? null,
      max_regression: listedPrimary?.max_regression ?? primary.max_regression ?? null,
    },
    ...extras.filter((objective) => objective.name !== primary.name),
  ]
}

export function compareObjective({
  baselineValue,
  candidateValue,
  baselineSamples,
  candidateSamples,
  direction,
  type,
  comparison,
  maxRegression,
}) {
  const delta = signedDelta(baselineValue, candidateValue, direction)
  const denom = Math.abs(baselineValue)
  const relative = denom > 0 ? delta / denom : 0
  const absThreshold =
    type === "judge" && comparison.minimum_improvement != null
      ? comparison.minimum_improvement
      : comparison.noise_threshold
  const relativeThreshold = comparison.relative_threshold

  let verdict
  if ((comparison.method === "relative" || comparison.method === "paired") && denom <= 0) {
    verdict = "inconclusive"
  } else if (comparison.method === "relative") {
    verdict = verdictFromSigned(relative, relativeThreshold)
  } else if (comparison.method === "paired") {
    const baseSamples = baselineSamples?.filter((n) => n != null) ?? []
    const candSamples = candidateSamples?.filter((n) => n != null) ?? []
    const threshold = relativeThreshold * denom
    if (!baseSamples.length || !candSamples.length) {
      verdict =
        type === "judge"
          ? verdictFromSigned(delta, absThreshold)
          : verdictFromSigned(delta, threshold) === "regressed"
            ? "regressed"
            : "inconclusive"
    } else {
      const diffs = candSamples.map((value, index) =>
        signedDelta(baseSamples[Math.min(index, baseSamples.length - 1)], value, direction),
      )
      const lo = Math.min(...diffs)
      const hi = Math.max(...diffs)
      if (verdictFromSigned(lo, threshold) === "improved") verdict = "improved"
      else if (verdictFromSigned(hi, threshold) === "regressed") verdict = "regressed"
      else verdict = "inconclusive"
    }
  } else {
    verdict = verdictFromSigned(delta, absThreshold)
  }

  if (
    type === "judge" &&
    comparison.minimum_improvement != null &&
    verdict === "improved" &&
    delta <= comparison.minimum_improvement
  ) {
    verdict = "inconclusive"
  }

  let violated = verdict === "regressed"
  if (maxRegression && verdict !== "improved") {
    const rawBound = Number(maxRegression.value)
    if (Number.isFinite(rawBound) && rawBound >= 0) {
      const bound = maxRegression.type === "relative" ? rawBound * denom : rawBound
      violated = -delta > bound
      if (violated) verdict = "regressed"
    }
  }

  return { verdict, delta, relative, violated }
}

function evaluateGates(spec, candidate) {
  const gates = Array.isArray(spec.degenerate_gates) ? spec.degenerate_gates : []
  const values = candidate?.gates ?? {}
  const failures = []
  for (const gate of gates) {
    if (!gatePasses(values[gate.name], gate.check)) {
      failures.push(gate.name)
    }
  }
  return failures
}

function futilityBound(futility, baselineValue, direction) {
  const factor = finiteNumber(futility.worse_factor ?? 1.2)
  const baseline = finiteNumber(baselineValue)
  if (factor == null || factor <= 1 || baseline == null || baseline <= 0) return null
  return direction === "minimize" ? baseline * factor : baseline / factor
}

function isFutile({
  ladder,
  direction,
  baselineValue,
  candidateValue,
  elapsedSeconds,
  sampleCount,
  enabled,
}) {
  const futility = ladder.futility
  if (!enabled || futility == null || typeof futility !== "object") return false

  const afterElapsed = finiteNumber(futility.after_elapsed_seconds)
  if (
    afterElapsed != null &&
    afterElapsed > 0 &&
    elapsedSeconds != null &&
    Number(elapsedSeconds) >= afterElapsed &&
    signedDelta(baselineValue, candidateValue, direction) <= 0
  ) {
    return true
  }

  const bound = futilityBound(futility, baselineValue, direction)
  if (bound == null || candidateValue == null) return false
  const worse = signedDelta(bound, candidateValue, direction) <= 0
  return worse && (sampleCount ?? 1) <= (ladder.exploratory_pairs ?? 1)
}

function rankScore(primaryComparison, improved) {
  if (primaryComparison?.verdict === "improved") return primaryComparison.relative ?? 0
  if (!improved.length) return primaryComparison?.relative ?? 0
  return Math.max(...improved.map((item) => item.relative ?? 0))
}

export function decide(input) {
  const spec = normalizeSpec(input.spec ?? {})
  const baseline = input.baseline ?? {}
  const candidate = input.candidate ?? {}
  const primary = spec.primary ?? {}
  if (!primary.name) {
    return closedResult({ decision: "error", reason: "missing primary metric" })
  }
  const comparison = comparisonDefaults(spec)
  const required = requiredObjectives(spec)
  const ladder = spec.ladder ?? {}
  const ladderEnabled = Boolean(ladder.enabled || spec.stability_mode === "ladder")
  const exploratoryPairs = positiveInteger(ladder.exploratory_pairs, 1)
  let confirmationRepeats = positiveInteger(ladder.confirmation_repeats ?? spec.repeat_count, 5)
  if (confirmationRepeats < exploratoryPairs) confirmationRepeats = exploratoryPairs

  if (candidate.smoke_passed === false) {
    return closedResult({ decision: "degenerate", reason: "smoke test failed" })
  }

  const gateFailures = evaluateGates(spec, candidate)
  if (gateFailures.length) {
    return closedResult({
      decision: "degenerate",
      violated_objectives: gateFailures,
      reason: `degenerate gate failed: ${gateFailures.join(", ")}`,
    })
  }

  const comparisons = {}
  const improved = []
  const violated = []
  const missing = []
  const candidateBundles = {}
  const baselineBundles = {}
  const aggregation = spec.aggregation ?? "median"

  for (const objective of required) {
    const base = metricBundle(baseline, objective.name, aggregation, objective.type)
    const cand = metricBundle(candidate, objective.name, aggregation, objective.type)
    baselineBundles[objective.name] = base
    candidateBundles[objective.name] = cand
    if (!base || base.aggregate == null || !cand || cand.aggregate == null) {
      missing.push(objective.name)
      continue
    }
    const result = compareObjective({
      baselineValue: base.aggregate,
      candidateValue: cand.aggregate,
      baselineSamples: base.samples,
      candidateSamples: cand.samples,
      direction: objective.direction,
      type: objective.type,
      comparison,
      maxRegression: objective.max_regression,
    })
    comparisons[objective.name] = result
    if (result.verdict === "improved") improved.push({ name: objective.name, ...result })
    if (result.violated) violated.push(objective.name)
  }

  if (missing.length) {
    return closedResult({
      decision: "error",
      comparisons,
      reason: `missing required metric: ${missing.join(", ")}`,
    })
  }

  const primaryBundle =
    candidateBundles[primary.name] ?? metricBundle(candidate, primary.name, aggregation, primary.type)
  const baselinePrimary =
    baselineBundles[primary.name] ?? metricBundle(baseline, primary.name, aggregation, primary.type)
  const primaryComparison = comparisons[primary.name] ?? null
  const eligible = improved.length > 0 && violated.length === 0
  const stillContending = required.some(
    (objective) => comparisons[objective.name]?.verdict === "inconclusive",
  )
  const sampleCount = Math.min(
    ...required.map((objective) => {
      const fromSamples = candidateBundles[objective.name]?.samples?.length
      if (Number.isInteger(fromSamples) && fromSamples > 0) return fromSamples
      return positiveInteger(candidate.sample_count, 1)
    }),
  )

  if (
    !eligible &&
    !stillContending &&
    isFutile({
      ladder,
      direction: primary.direction,
      baselineValue: baselinePrimary?.aggregate,
      candidateValue: primaryBundle?.aggregate,
      elapsedSeconds: candidate.elapsed_seconds,
      sampleCount,
      enabled: ladderEnabled,
    })
  ) {
    return closedResult({
      decision: "censored",
      improved_objectives: improved.map((item) => item.name),
      violated_objectives: violated,
      comparisons,
      primary_delta: primaryComparison?.delta ?? null,
      reason: "noncompetitive under the predeclared futility bound",
    })
  }

  const withTargets = required.filter((objective) => objective.target != null)
  const targetReached =
    withTargets.length > 0 &&
    withTargets.every((objective) => {
      const value = candidateBundles[objective.name]?.aggregate
      if (value == null) return false
      return signedDelta(objective.target, value, objective.direction) >= 0
    })

  let decision
  if (eligible) decision = "keep"
  else if (violated.length) decision = "revert"
  else if (stillContending) decision = "inconclusive"
  else decision = "revert"

  let nextMeasurement = "none"
  if (ladderEnabled && ladder.smoke_command && candidate.smoke_passed == null) {
    nextMeasurement = "smoke"
  } else if (ladderEnabled && (decision === "keep" || decision === "inconclusive")) {
    const confirming = decision === "keep"
    const sampleBudget = confirming
      ? confirmationRepeats
      : Math.min(exploratoryPairs + 1, confirmationRepeats)
    if (sampleCount < sampleBudget) {
      if (confirming) decision = "promising"
      if (sampleCount < exploratoryPairs) nextMeasurement = "exploratory"
      else nextMeasurement = confirming ? "confirm" : "add_sample"
    }
  }

  let reason = "no required objective improved"
  if (eligible) {
    reason = `improved ${improved.map((item) => item.name).join(", ")} without violating other required objectives`
  } else if (decision === "inconclusive") {
    reason = "delta inside the comparison threshold"
  } else if (violated.length) {
    reason = `violated ${violated.join(", ")}`
  }

  return {
    decision,
    eligible,
    next_measurement: nextMeasurement,
    target_reached: targetReached,
    improved_objectives: improved.map((item) => item.name),
    violated_objectives: violated,
    comparisons,
    primary_delta: primaryComparison?.delta ?? null,
    rank_score: rankScore(primaryComparison, improved),
    reason,
  }
}

function isCli(argv = process.argv) {
  const entry = argv[1] ?? ""
  return entry.endsWith("decide.mjs")
}

async function runCli(argv = process.argv, io = process) {
  const { readFileSync } = await import("node:fs")
  const source = argv[2] && argv[2] !== "-" ? argv[2] : 0
  const input = JSON.parse(readFileSync(source, "utf8"))
  io.stdout.write(`${JSON.stringify(decide(input), null, 2)}\n`)
}

if (isCli()) {
  await runCli()
}
