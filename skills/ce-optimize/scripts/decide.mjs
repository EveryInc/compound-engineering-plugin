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
  switch (op) {
    case ">=":
      return value >= threshold
    case "<=":
      return value <= threshold
    case ">":
      return value > threshold
    case "<":
      return value < threshold
    case "==":
      return value === threshold
    case "!=":
      return value !== threshold
    default:
      return false
  }
}

function signedDelta(baseline, candidate, direction) {
  return direction === "minimize" ? baseline - candidate : candidate - baseline
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

function metricBundle(source, name) {
  if (!source) return null
  const metrics = source.metrics ?? {}
  const raw = metrics[name]
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const samples = Array.isArray(raw.samples) ? raw.samples.map(Number) : []
    let aggregate = null
    if (raw.aggregate != null) aggregate = Number(raw.aggregate)
    else if (samples.length) aggregate = median(samples)
    else if (source.gates?.[name] != null) aggregate = Number(source.gates[name])
    return { aggregate, samples }
  }
  if (raw != null && typeof raw !== "object") {
    return { aggregate: Number(raw), samples: [Number(raw)] }
  }
  if (source.gates?.[name] != null) {
    return { aggregate: Number(source.gates[name]), samples: [Number(source.gates[name])] }
  }
  return null
}

function comparisonDefaults(spec) {
  const comparison = spec.comparison ?? {}
  return {
    method: comparison.method ?? "absolute",
    noise_threshold: Number(comparison.noise_threshold ?? 0.02),
    relative_threshold: Number(comparison.relative_threshold ?? 0.05),
    minimum_improvement:
      comparison.minimum_improvement != null ? Number(comparison.minimum_improvement) : null,
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
      direction: listedPrimary?.direction ?? primary.direction ?? "maximize",
      role: "required",
      type: listedPrimary?.type ?? primary.type ?? "hard",
      target: listedPrimary?.target ?? primary.target ?? null,
      max_regression: listedPrimary?.max_regression ?? null,
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
  const relative = denom > 0 ? delta / denom : delta
  const absThreshold =
    type === "judge" && comparison.minimum_improvement != null
      ? comparison.minimum_improvement
      : comparison.noise_threshold
  const relativeThreshold = comparison.relative_threshold

  let verdict
  if (comparison.method === "relative") {
    verdict = verdictFromSigned(relative, relativeThreshold)
  } else if (comparison.method === "paired") {
    const baseSamples = baselineSamples?.length ? baselineSamples : [baselineValue]
    const candSamples = candidateSamples?.length ? candidateSamples : [candidateValue]
    const diffs = candSamples.map((value, index) =>
      signedDelta(baseSamples[Math.min(index, baseSamples.length - 1)], value, direction),
    )
    const threshold = denom > 0 ? relativeThreshold * denom : absThreshold
    const lo = Math.min(...diffs)
    const hi = Math.max(...diffs)
    if (lo > threshold) verdict = "improved"
    else if (hi < -threshold) verdict = "regressed"
    else verdict = "inconclusive"
  } else {
    verdict = verdictFromSigned(delta, absThreshold)
  }

  let violated = verdict === "regressed"
  if (maxRegression && verdict !== "improved") {
    const bound =
      maxRegression.type === "relative" ? Number(maxRegression.value) * denom : Number(maxRegression.value)
    if (Number.isFinite(bound)) {
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
    const value = values[gate.name]
    if (value == null || !gatePasses(Number(value), gate.check)) {
      failures.push(gate.name)
    }
  }
  return failures
}

function futilityBound(ladder, baselineValue, direction) {
  const futility = ladder.futility ?? {}
  const factor = Number(futility.worse_factor ?? 0)
  if (!factor || factor <= 1 || baselineValue == null) return null
  return direction === "minimize" ? baselineValue * factor : baselineValue / factor
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
  const futility = ladder.futility ?? {}
  if (!enabled) return false

  if (
    futility.after_elapsed_seconds != null &&
    elapsedSeconds != null &&
    Number(elapsedSeconds) >= Number(futility.after_elapsed_seconds) &&
    signedDelta(baselineValue, candidateValue, direction) <= 0
  ) {
    return true
  }

  const bound = futilityBound(ladder, baselineValue, direction)
  if (bound == null || candidateValue == null) return false
  const worse = signedDelta(bound, candidateValue, direction) <= 0
  return worse && (sampleCount ?? 1) <= (ladder.exploratory_pairs ?? 1)
}

function rankScore(primaryComparison, improved) {
  if (primaryComparison?.verdict === "improved") return primaryComparison.delta
  if (!improved.length) return primaryComparison?.delta ?? 0
  return Math.max(...improved.map((item) => item.relative ?? 0))
}

export function decide(input) {
  const spec = input.spec ?? {}
  const baseline = input.baseline ?? {}
  const candidate = input.candidate ?? {}
  const primary = spec.primary ?? {}
  const comparison = comparisonDefaults(spec)
  const required = requiredObjectives(spec)
  const ladder = spec.ladder ?? {}
  const ladderEnabled = Boolean(ladder.enabled || spec.stability_mode === "ladder")
  const confirmationRepeats = Number(ladder.confirmation_repeats ?? spec.repeat_count ?? 5)
  const exploratoryPairs = Number(ladder.exploratory_pairs ?? 1)
  const sampleCount = Number(candidate.sample_count ?? candidate.metrics?.[primary.name]?.samples?.length ?? 1)

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

  for (const objective of required) {
    const base = metricBundle(baseline, objective.name)
    const cand = metricBundle(candidate, objective.name)
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

  const primaryBundle = candidateBundles[primary.name] ?? metricBundle(candidate, primary.name)
  const baselinePrimary = baselineBundles[primary.name] ?? metricBundle(baseline, primary.name)
  const primaryComparison = comparisons[primary.name] ?? null

  if (
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

  const eligible = improved.length > 0 && violated.length === 0
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
  else if (improved.length === 0 && violated.length === 0) decision = "inconclusive"
  else decision = "revert"

  let nextMeasurement = "none"
  if (ladderEnabled && ladder.smoke_command && candidate.smoke_passed == null) {
    nextMeasurement = "smoke"
  } else if (
    ladderEnabled &&
    sampleCount < confirmationRepeats &&
    (decision === "keep" || decision === "inconclusive")
  ) {
    const confirming = decision === "keep"
    if (confirming) decision = "promising"
    if (sampleCount < exploratoryPairs) nextMeasurement = "exploratory"
    else nextMeasurement = confirming ? "confirm" : "add_sample"
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
