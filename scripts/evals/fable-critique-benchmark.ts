#!/usr/bin/env bun

import { createHash, randomBytes } from "node:crypto"
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs"
import path from "node:path"
import { spawn, spawnSync } from "node:child_process"

type Lane = "product-lens" | "whole-doc"
type ArmId = "opus-high" | "fable-high"
type Outcome =
  | "matched"
  | "substituted"
  | "ambiguous"
  | "unverified"
  | "refused"
  | "schema-invalid"
  | "auth-failed"
  | "quota-failed"
  | "timed-out"

type LedgerItem = { id: string; severity: "P0" | "P1" | "P2" | "P3"; summary: string }
type AdoptionCase = {
  id: string
  kind: "seeded" | "clean"
  role: Lane
  document_type: "requirements" | "plan"
  origin: "none"
  path: string
  ledger: LedgerItem[]
}
type Arm = { id: ArmId; provider: "anthropic"; model: "opus" | "fable"; effort: "high" }
type Manifest = {
  schema_version: number
  corpus_license: string
  recipients: string[]
  trials_per_arm: number
  judge_votes_per_output: number
  timeout_ms: number
  review_concurrency: number
  judge_concurrency: number
  arms: Arm[]
  judge: { provider: "openai"; model: string; effort: string }
  planning_cost_assumptions: {
    currency: "USD"
    source: string
    per_call_usd: Record<ArmId | "judge", number>
  }
  adoption_cases: AdoptionCase[]
}

type PreRegisteredTrial = {
  trial_id: string
  case_id: string
  lane: Lane
  arm_id: ArmId
  model_requested: "opus" | "fable"
  trial_index: number
  fixture_digest: string
}

type TrialEvidence = PreRegisteredTrial & {
  outcome: Outcome
  identity_status: "verified" | "ambiguous" | "unverified"
  model_actual: string
  observed_model_ids: string[]
  schema_valid: boolean
  non_refusal: boolean
  deadline_met: boolean
  latency_ms: number
  detected_ledger_ids: string[]
  false_findings: number
}

type Metrics = {
  severity_weighted_detection: number
  noise_per_review: number
  schema_success_rate: number
  receipt_success_rate: number
  non_refusal_success_rate: number
  deadline_success_rate: number
  quality_numerator: number
  quality_denominator: number
  median_latency_ms: number
}

const ORDINARY_LANES = new Set<Lane>(["product-lens", "whole-doc"])
const GUARDED_ROLES = new Set(["security-lens", "adversarial", "code-adversarial"])
const NON_INFERIORITY_MARGIN = -0.1
const MAX_NOISE_DELTA = 0.5
const RAW_EXPORT_KEYS = new Set(["prompt", "stdout", "stderr", "provider_envelope", "judge_vote"])
const FAILURE_OUTCOMES: Outcome[] = [
  "substituted",
  "ambiguous",
  "unverified",
  "refused",
  "schema-invalid",
  "auth-failed",
  "quota-failed",
  "timed-out",
]
const ALLOWED_JUDGE_EFFORTS = new Set(["minimal", "low", "medium", "high", "xhigh", "max", "ultra"])
const DOC_REVIEW_ROOT = path.resolve(import.meta.dir, "../../skills/ce-doc-review")

function fail(message: string): never {
  throw new Error(`fable-critique-benchmark: ${message}`)
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex")
}

function readJson<T>(file: string): T {
  try {
    return JSON.parse(readFileSync(file, "utf8")) as T
  } catch {
    fail(`cannot parse JSON: ${file}`)
  }
}

function defaultManifestPath(): string {
  return path.join(process.cwd(), "tests/fixtures/fable-critique-benchmark/manifest.json")
}

export function defaultScratchRoot(): string {
  const uid = typeof process.getuid === "function" ? process.getuid() : "unknown"
  return path.join("/tmp", `compound-engineering-${uid}`, "fable-critique-benchmark")
}

function ensurePrivateDirectory(directory: string, label: string): void {
  if (!existsSync(directory)) {
    mkdirSync(directory, { recursive: true, mode: 0o700 })
    chmodSync(directory, 0o700)
  }
  const info = lstatSync(directory)
  if (!info.isDirectory() || info.isSymbolicLink()) fail(`${label} must be a real directory`)
  if ((info.mode & 0o777) !== 0o700) fail(`${label} must have mode 700`)
  if (typeof process.getuid === "function" && info.uid !== process.getuid()) fail(`${label} must be owned by the current user`)
}

function makeRunDirectory(scratchRoot: string): string {
  ensurePrivateDirectory(scratchRoot, "scratch directory")
  const runId = `${new Date().toISOString().replace(/[^0-9TZ]/g, "")}-${randomBytes(6).toString("hex")}`
  const runDir = path.join(realpathSync(scratchRoot), runId)
  mkdirSync(runDir, { mode: 0o700 })
  chmodSync(runDir, 0o700)
  ensurePrivateDirectory(runDir, "per-run scratch directory")
  return runDir
}

export function verifyCleanup(runDir: string): void {
  if (existsSync(runDir)) fail(`cleanup verification failed: ${runDir}`)
}

function cleanupRun(runDir: string): void {
  try {
    rmSync(runDir, { recursive: true, force: false })
  } catch {
    fail(`cleanup verification failed: ${runDir}`)
  }
  verifyCleanup(runDir)
}

function withRunScratch<T>(scratchRoot: string, operation: (runDir: string) => T): T {
  const runDir = makeRunDirectory(scratchRoot)
  try {
    return operation(runDir)
  } finally {
    cleanupRun(runDir)
  }
}

async function withRunScratchAsync<T>(scratchRoot: string, operation: (runDir: string) => Promise<T>): Promise<T> {
  const runDir = makeRunDirectory(scratchRoot)
  try {
    return await operation(runDir)
  } finally {
    cleanupRun(runDir)
  }
}

function fixturePath(manifestPath: string, relativePath: string): string {
  const base = realpathSync(path.dirname(manifestPath))
  const candidate = path.resolve(base, relativePath)
  if (!candidate.startsWith(`${base}${path.sep}`)) fail(`fixture escapes corpus root: ${relativePath}`)
  if (!existsSync(candidate) || !statSync(candidate).isFile()) fail(`fixture is missing: ${relativePath}`)
  return candidate
}

function assertNoSecretOrPathSentinel(value: string, label: string): void {
  const sentinels: RegExp[] = [
    /\b(?:api[_-]?key|access[_-]?token|client[_-]?secret|authorization)\b\s*[:=]/i,
    /\bsk-[A-Za-z0-9_-]{16,}\b/,
    /-----BEGIN [A-Z ]+PRIVATE KEY-----/,
    /(?:^|[\s`"'])(?:\/Users\/|\/home\/|[A-Za-z]:\\Users\\)/m,
  ]
  if (sentinels.some((pattern) => pattern.test(value))) fail(`secret/path sentinel rejected ${label}`)
}

function validateManifest(manifest: Manifest, manifestPath: string): void {
  if (manifest.schema_version !== 2) fail("manifest schema_version must be 2")
  if (manifest.recipients.join(",") !== "anthropic,openai") fail("manifest recipients must be anthropic,openai")
  if (!Number.isInteger(manifest.trials_per_arm) || manifest.trials_per_arm < 5) fail("at least five trials per arm/input are required")
  if (manifest.judge_votes_per_output !== 3) fail("exactly three judge votes per output are required")
  if (!Number.isInteger(manifest.timeout_ms) || manifest.timeout_ms < 1) fail("timeout_ms must be positive")
  if (!Number.isInteger(manifest.review_concurrency) || manifest.review_concurrency < 1 || manifest.review_concurrency > 16) {
    fail("review_concurrency must be an integer from 1 through 16")
  }
  if (!Number.isInteger(manifest.judge_concurrency) || manifest.judge_concurrency < 1 || manifest.judge_concurrency > 32) {
    fail("judge_concurrency must be an integer from 1 through 32")
  }
  if (!ALLOWED_JUDGE_EFFORTS.has(manifest.judge.effort)) fail("judge effort is not allowlisted")
  if (manifest.arms.length !== 2 || manifest.arms[0]?.id !== "opus-high" || manifest.arms[1]?.id !== "fable-high") {
    fail("benchmark arms must be Opus/high then Fable/high")
  }
  if (manifest.adoption_cases.length === 0) fail("adoption corpus is empty")
  const ids = new Set<string>()
  const roleKinds = new Map<Lane, Set<string>>()
  for (const item of manifest.adoption_cases) {
    if (GUARDED_ROLES.has(String(item.role))) fail(`guarded role is forbidden in adoption corpus: ${item.role}`)
    if (!ORDINARY_LANES.has(item.role)) fail(`unknown adoption role: ${item.role}`)
    if (item.document_type !== "requirements" && item.document_type !== "plan") fail(`invalid document type for ${item.id}`)
    if (item.origin !== "none") fail(`synthetic benchmark origin must be none: ${item.id}`)
    if (ids.has(item.id)) fail(`duplicate adoption case: ${item.id}`)
    ids.add(item.id)
    const kinds = roleKinds.get(item.role) ?? new Set<string>()
    kinds.add(item.kind)
    roleKinds.set(item.role, kinds)
    const file = fixturePath(manifestPath, item.path)
    const document = readFileSync(file, "utf8")
    assertNoSecretOrPathSentinel(document, item.path)
    productionReviewPrompt(item, document)
  }
  for (const lane of ORDINARY_LANES) {
    const kinds = roleKinds.get(lane)
    if (!kinds?.has("seeded") || !kinds.has("clean")) fail(`${lane} requires seeded and clean fixtures`)
  }
  assertNoSecretOrPathSentinel(JSON.stringify(manifest), "manifest")
}

function assertRecipientApproval(): void {
  const actual = (process.env.FABLE_CRITIQUE_ALLOWED_RECIPIENTS ?? "").split(",").map((item) => item.trim()).filter(Boolean)
  if (actual.join(",") !== "anthropic,openai") fail("recipient allowlist must be exactly: anthropic,openai")
}

function routeVersion(command: string): string {
  const result = spawnSync(command, ["--version"], { encoding: "utf8", timeout: 10_000 })
  if (result.status !== 0) fail(`${command} route is unavailable`)
  return result.stdout.trim()
}

function fixtureDigests(manifest: Manifest, manifestPath: string): Record<string, string> {
  return Object.fromEntries(manifest.adoption_cases.map((item) => [item.id, sha256(readFileSync(fixturePath(manifestPath, item.path))) ]))
}

export function buildPreRegisteredTrials(manifest: Manifest, manifestPath: string): PreRegisteredTrial[] {
  const digests = fixtureDigests(manifest, manifestPath)
  const trials: PreRegisteredTrial[] = []
  for (const item of manifest.adoption_cases) {
    for (const arm of manifest.arms) {
      for (let trialIndex = 1; trialIndex <= manifest.trials_per_arm; trialIndex += 1) {
        trials.push({
          trial_id: `${item.id}/${arm.id}/${String(trialIndex).padStart(2, "0")}`,
          case_id: item.id,
          lane: item.role,
          arm_id: arm.id,
          model_requested: arm.model,
          trial_index: trialIndex,
          fixture_digest: digests[item.id],
        })
      }
    }
  }
  return trials
}

export function assertExactTrialSet(expected: PreRegisteredTrial[], observed: TrialEvidence[]): void {
  const expectedIds = expected.map((trial) => trial.trial_id).sort()
  const observedIds = observed.map((trial) => trial.trial_id).sort()
  if (new Set(observedIds).size !== observedIds.length || JSON.stringify(expectedIds) !== JSON.stringify(observedIds)) {
    fail("observed trials do not exactly match the pre-registered non-replaceable set")
  }
}

function inventory(manifest: Manifest) {
  const inputs = manifest.adoption_cases.length
  const callsPerArm = inputs * manifest.trials_per_arm
  const anthropic = callsPerArm * manifest.arms.length
  const openai = anthropic * manifest.judge_votes_per_output
  const total = anthropic + openai
  const prices = manifest.planning_cost_assumptions.per_call_usd
  const spend = callsPerArm * prices["opus-high"] + callsPerArm * prices["fable-high"] + openai * prices.judge
  return { inputs, callsPerArm, anthropic, openai, total, spend }
}

function printInventory(manifest: Manifest): void {
  const counts = inventory(manifest)
  const product = manifest.adoption_cases.filter((item) => item.role === "product-lens").length
  const whole = manifest.adoption_cases.filter((item) => item.role === "whole-doc").length
  process.stdout.write(`Adoption lanes: product-lens, whole-doc\n`)
  process.stdout.write(`Corpus inputs: ${counts.inputs} (${product} product-lens, ${whole} whole-doc)\n`)
  process.stdout.write(`Trials per model/input: ${manifest.trials_per_arm}\n`)
  process.stdout.write(`Opus/high review calls: ${counts.callsPerArm}\n`)
  process.stdout.write(`Fable/high review calls: ${counts.callsPerArm}\n`)
  process.stdout.write(`Anthropic arm calls: ${counts.anthropic}\n`)
  process.stdout.write(`OpenAI judge calls: ${counts.openai}\n`)
  process.stdout.write(`Total provider calls: ${counts.total}\n`)
  process.stdout.write(`Estimated provider spend: $${counts.spend.toFixed(2)}\n`)
}

function preflight(manifestPath: string, scratchRoot: string): { manifest: Manifest; trials: PreRegisteredTrial[] } {
  const manifest = readJson<Manifest>(manifestPath)
  validateManifest(manifest, manifestPath)
  assertRecipientApproval()
  const trials = buildPreRegisteredTrials(manifest, manifestPath)
  withRunScratch(scratchRoot, (runDir) => {
    writeFileSync(path.join(runDir, "run-plan.json"), `${JSON.stringify({ schema_version: 2, trials }, null, 2)}\n`, { mode: 0o600 })
  })
  printInventory(manifest)
  process.stdout.write(`Claude route: ${routeVersion("claude")}\n`)
  process.stdout.write(`Codex route: ${routeVersion("codex")}\n`)
  process.stdout.write("offline preflight: PASS\n")
  process.stdout.write("No provider content calls were made.\n")
  return { manifest, trials }
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

export function qualityEligible(trial: TrialEvidence): boolean {
  if (trial.model_requested === "fable") {
    return trial.outcome === "matched" && trial.identity_status === "verified" && trial.model_actual.startsWith("claude-fable-")
  }
  return trial.outcome === "matched" && trial.identity_status === "verified" && trial.model_actual.startsWith("claude-opus-")
}

function armMetrics(manifest: Manifest, lane: Lane, armId: ArmId, trials: TrialEvidence[]): Metrics {
  const laneCases = manifest.adoption_cases.filter((item) => item.role === lane)
  const armTrials = trials.filter((trial) => trial.lane === lane && trial.arm_id === armId)
  const expectedTrials = laneCases.length * manifest.trials_per_arm
  const severity = { P0: 8, P1: 5, P2: 3, P3: 1 } as const
  const ledgerWeight = laneCases.reduce((sum, item) => sum + item.ledger.reduce((inner, ledger) => inner + severity[ledger.severity], 0), 0)
  let detectedWeight = 0
  let falseFindings = 0
  for (const trial of armTrials) {
    if (!qualityEligible(trial)) continue
    const item = laneCases.find((candidate) => candidate.id === trial.case_id)
    for (const ledger of item?.ledger ?? []) if (trial.detected_ledger_ids.includes(ledger.id)) detectedWeight += severity[ledger.severity]
    falseFindings += trial.false_findings
  }
  const eligible = armTrials.filter(qualityEligible)
  return {
    severity_weighted_detection: ledgerWeight === 0 ? 1 : detectedWeight / (ledgerWeight * manifest.trials_per_arm),
    noise_per_review: falseFindings / expectedTrials,
    schema_success_rate: armTrials.filter((trial) => trial.schema_valid).length / expectedTrials,
    receipt_success_rate: eligible.length / expectedTrials,
    non_refusal_success_rate: armTrials.filter((trial) => trial.non_refusal).length / expectedTrials,
    deadline_success_rate: armTrials.filter((trial) => trial.deadline_met).length / expectedTrials,
    quality_numerator: eligible.length,
    quality_denominator: expectedTrials,
    median_latency_ms: median(armTrials.map((trial) => trial.latency_ms)),
  }
}

function detectedInMajority(trials: TrialEvidence[], armId: ArmId, caseId: string, ledgerId: string): boolean {
  const eligible = trials.filter((trial) => trial.arm_id === armId && trial.case_id === caseId && qualityEligible(trial))
  return eligible.filter((trial) => trial.detected_ledger_ids.includes(ledgerId)).length >= Math.ceil(eligible.length / 2)
}

function pairedBootstrapLowerBound(manifest: Manifest, lane: Lane, trials: TrialEvidence[]): number {
  const severity = { P0: 8, P1: 5, P2: 3, P3: 1 } as const
  const differences: number[] = []
  for (const item of manifest.adoption_cases.filter((candidate) => candidate.role === lane && candidate.ledger.length > 0)) {
    const totalWeight = item.ledger.reduce((sum, ledger) => sum + severity[ledger.severity], 0)
    for (let trialIndex = 1; trialIndex <= manifest.trials_per_arm; trialIndex += 1) {
      const score = (armId: ArmId) => {
        const trial = trials.find((candidate) => candidate.case_id === item.id && candidate.arm_id === armId && candidate.trial_index === trialIndex)
        if (!trial || !qualityEligible(trial)) return 0
        return item.ledger.reduce((sum, ledger) => sum + (trial.detected_ledger_ids.includes(ledger.id) ? severity[ledger.severity] : 0), 0) / totalWeight
      }
      differences.push(score("fable-high") - score("opus-high"))
    }
  }
  if (differences.length === 0) return -1
  let state = lane === "product-lens" ? 0x50f1ab1e : 0x7a11d0c5
  const estimates: number[] = []
  for (let sample = 0; sample < 2_000; sample += 1) {
    let sum = 0
    for (let draw = 0; draw < differences.length; draw += 1) {
      state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0
      sum += differences[state % differences.length]
    }
    estimates.push(sum / differences.length)
  }
  estimates.sort((a, b) => a - b)
  return estimates[Math.floor(0.025 * (estimates.length - 1))]
}

export function scoreEvidence(manifest: Manifest, trials: TrialEvidence[]) {
  const decision_table = [...ORDINARY_LANES].map((lane) => {
    const opus = armMetrics(manifest, lane, "opus-high", trials)
    const fable = armMetrics(manifest, lane, "fable-high", trials)
    const detectionDelta = fable.severity_weighted_detection - opus.severity_weighted_detection
    const bootstrap_lower_bound_delta = pairedBootstrapLowerBound(manifest, lane, trials)
    const p0_p1_regressions = manifest.adoption_cases
      .filter((item) => item.role === lane)
      .flatMap((item) => item.ledger.map((ledger) => ({ caseId: item.id, ledger })))
      .filter(({ caseId, ledger }) => (ledger.severity === "P0" || ledger.severity === "P1") && detectedInMajority(trials, "opus-high", caseId, ledger.id) && !detectedInMajority(trials, "fable-high", caseId, ledger.id))
      .map(({ ledger }) => ledger.id)
    const noiseDelta = fable.noise_per_review - opus.noise_per_review
    const providerSuccessRegression =
      fable.schema_success_rate < opus.schema_success_rate ||
      fable.receipt_success_rate < opus.receipt_success_rate ||
      fable.non_refusal_success_rate < opus.non_refusal_success_rate
    const deadlineRegression = fable.deadline_success_rate < opus.deadline_success_rate
    const pass =
      detectionDelta >= NON_INFERIORITY_MARGIN &&
      bootstrap_lower_bound_delta >= NON_INFERIORITY_MARGIN &&
      p0_p1_regressions.length === 0 &&
      noiseDelta <= MAX_NOISE_DELTA &&
      !providerSuccessRegression &&
      !deadlineRegression
    return {
      lane,
      opus,
      fable,
      detection_delta: detectionDelta,
      bootstrap_lower_bound_delta,
      p0_p1_regressions,
      noise_delta: noiseDelta,
      schema_regression: fable.schema_success_rate < opus.schema_success_rate,
      receipt_regression: fable.receipt_success_rate < opus.receipt_success_rate,
      refusal_regression: fable.non_refusal_success_rate < opus.non_refusal_success_rate,
      deadline_regression: deadlineRegression,
      decision: pass ? "pass" : "stop",
    }
  })
  return { decision_table, overall_decision: decision_table.every((row) => row.decision === "pass") ? "adopt" : "stop" }
}

export function assertAggregateExportSafe(value: unknown, keyPath = "aggregate"): void {
  if (typeof value === "string") {
    assertNoSecretOrPathSentinel(value, keyPath)
    return
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertAggregateExportSafe(entry, `${keyPath}[${index}]`))
    return
  }
  if (!value || typeof value !== "object") return
  for (const [key, entry] of Object.entries(value)) {
    if (RAW_EXPORT_KEYS.has(key)) fail(`raw-content export is forbidden: ${key}`)
    assertAggregateExportSafe(entry, `${keyPath}.${key}`)
  }
}

type CapturedProcess = {
  status: number | null
  stdout: string
  stderr: string
  error?: Error
}

async function spawnCaptured(
  command: string,
  args: string[],
  options: { input: string; cwd?: string; timeout: number },
): Promise<CapturedProcess> {
  return await new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
    })
    const stdout: Buffer[] = []
    const stderr: Buffer[] = []
    let processError: Error | undefined
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      child.kill("SIGKILL")
    }, options.timeout)
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk))
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk))
    child.on("error", (error) => { processError = error })
    child.on("close", (status) => {
      clearTimeout(timer)
      resolve({
        status,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
        error: timedOut ? Object.assign(new Error("timed out"), { name: "ETIMEDOUT" }) : processError,
      })
    })
    child.stdin.on("error", () => {})
    child.stdin.end(options.input)
  })
}

async function parallelMap<T, R>(items: T[], concurrency: number, operation: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length)
  let nextIndex = 0
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const index = nextIndex
      nextIndex += 1
      if (index >= items.length) return
      results[index] = await operation(items[index], index)
    }
  })
  await Promise.all(workers)
  return results
}

function observedModels(envelope: any): string[] {
  return Object.keys(envelope?.modelUsage ?? {}).filter((model) => model.startsWith("claude-")).sort()
}

function classifyTrial(base: PreRegisteredTrial, result: CapturedProcess, elapsed: number): TrialEvidence & { structured?: any } {
  const empty: TrialEvidence = {
    ...base,
    outcome: "unverified",
    identity_status: "unverified",
    model_actual: "unverified",
    observed_model_ids: [],
    schema_valid: false,
    non_refusal: false,
    deadline_met: result.error?.name !== "ETIMEDOUT",
    latency_ms: elapsed,
    detected_ledger_ids: [],
    false_findings: 0,
  }
  if (result.error?.name === "ETIMEDOUT") return { ...empty, outcome: "timed-out" }
  const errorText = String(result.stderr ?? "")
  if (/auth|login|credential/i.test(errorText)) return { ...empty, outcome: "auth-failed" }
  if (/quota|rate.?limit|credit/i.test(errorText)) return { ...empty, outcome: "quota-failed" }
  let envelope: any
  try {
    envelope = JSON.parse(String(result.stdout ?? ""))
  } catch {
    return empty
  }
  const models = observedModels(envelope)
  const families = new Set(models.map((model) => model.includes("fable") ? "fable" : model.includes("opus") ? "opus" : "other"))
  const structured = envelope?.structured_output
  const schemaValid =
    typeof structured?.reviewer === "string" &&
    Array.isArray(structured?.findings) &&
    Array.isArray(structured?.residual_risks) &&
    Array.isArray(structured?.deferred_questions)
  const refused = envelope?.stop_reason === "refusal"
  const expectedPrefix = base.model_requested === "fable" ? "claude-fable-" : "claude-opus-"
  const actual = models.length === 1 ? models[0] : "unverified"
  let outcome: Outcome = "unverified"
  let identity: TrialEvidence["identity_status"] = "unverified"
  if (refused) outcome = "refused"
  else if (!schemaValid) outcome = "schema-invalid"
  else if (families.size > 1) { outcome = "ambiguous"; identity = "ambiguous" }
  else if (models.length === 0) outcome = "unverified"
  else if (models.every((model) => model.startsWith(expectedPrefix))) { outcome = "matched"; identity = "verified" }
  else outcome = "substituted"
  return {
    ...empty,
    outcome,
    identity_status: identity,
    model_actual: actual,
    observed_model_ids: models,
    schema_valid: schemaValid,
    non_refusal: !refused,
    structured,
  }
}

function taggedBlock(template: string, tag: "output-contract" | "context-slots-rules"): string {
  const match = template.match(new RegExp(`<${tag}>[\\s\\S]*?</${tag}>`))
  if (!match) fail(`production document-review template is missing <${tag}>`)
  return match[0]
}

function productionReviewPrompt(item: AdoptionCase, document: string): { prompt: string; schema: string } {
  const personaName = item.role === "product-lens" ? "product-lens-reviewer.md" : "whole-doc-reviewer.md"
  const persona = readFileSync(path.join(DOC_REVIEW_ROOT, "references/personas", personaName), "utf8").trimEnd()
  const schema = readFileSync(path.join(DOC_REVIEW_ROOT, "references/findings-schema.json"), "utf8").trimEnd()
  const template = readFileSync(path.join(DOC_REVIEW_ROOT, "references/subagent-template.md"), "utf8")
  const outputContract = taggedBlock(template, "output-contract")
  const contextSlots = taggedBlock(template, "context-slots-rules")
  return {
    schema,
    prompt: [
      persona,
      "\n\n---\n\n",
      outputContract,
      "\n\nThis is an authorized document review of the maintainer's own repository.\n",
      "Return ONE JSON object and nothing else (no prose, no code fence) matching this schema:\n\n",
      schema,
      `\n\nSet the top-level "reviewer" field to "${item.role}" (it will be namespaced to the peer provider on fold-in).\n`,
      "\n<review-context>\n",
      `Document type: ${item.document_type}\n`,
      `Document path: ${path.basename(item.path)}\n`,
      `Origin: ${item.origin}\n\n`,
      "<prior-decisions>\nRound 1 — no prior decisions.\n</prior-decisions>\n\n",
      "Document content:\n",
      document,
      "\n</review-context>\n\n",
      contextSlots,
      "\n",
    ].join(""),
  }
}

async function runReviewTrial(manifest: Manifest, manifestPath: string, trial: PreRegisteredTrial, runDir: string): Promise<TrialEvidence & { structured?: any }> {
  const item = manifest.adoption_cases.find((candidate) => candidate.id === trial.case_id)
  if (!item) fail(`missing case for trial ${trial.trial_id}`)
  const { prompt, schema } = productionReviewPrompt(item, readFileSync(fixturePath(manifestPath, item.path), "utf8"))
  const reviewDir = path.join(runDir, "reviews", sha256(trial.trial_id).slice(0, 24))
  mkdirSync(reviewDir, { recursive: true, mode: 0o700 })
  chmodSync(reviewDir, 0o700)
  const started = Date.now()
  const result = await spawnCaptured("claude", [
    "-p",
    "--model", trial.model_requested,
    "--effort", "high",
    "--permission-mode", "dontAsk",
    "--safe-mode",
    "--disable-slash-commands",
    "--tools", "",
    "--max-turns", "15",
    "--no-session-persistence",
    "--json-schema", schema,
    "--output-format", "json",
  ], {
    input: prompt,
    cwd: reviewDir,
    timeout: manifest.timeout_ms,
  })
  const classified = classifyTrial(trial, result, Date.now() - started)
  writeFileSync(path.join(reviewDir, "provider-envelope.json"), String(result.stdout ?? ""), { mode: 0o600 })
  return classified
}

type JudgeVote = { detected_ledger_ids: string[]; false_findings: number }

async function runJudgeVote(
  manifest: Manifest,
  item: AdoptionCase,
  trial: TrialEvidence & { structured?: any },
  voteIndex: number,
  runDir: string,
): Promise<JudgeVote> {
  const judgeDir = path.join(runDir, "judges", `${sha256(trial.trial_id).slice(0, 20)}-${voteIndex + 1}`)
  mkdirSync(judgeDir, { recursive: true, mode: 0o700 })
  chmodSync(judgeDir, 0o700)
  const schemaPath = path.join(judgeDir, "schema.json")
  const outputPath = path.join(judgeDir, "last-message.json")
  const judgeSchema = {
    type: "object",
    additionalProperties: false,
    required: ["detected_ledger_ids", "false_findings"],
    properties: {
      detected_ledger_ids: { type: "array", items: { type: "string" } },
      false_findings: { type: "integer", minimum: 0 },
    },
  }
  writeFileSync(schemaPath, `${JSON.stringify(judgeSchema)}\n`, { mode: 0o600 })
  const prompt = `Blindly score the review against this synthetic ledger. Return only the requested JSON.\nLedger: ${JSON.stringify(item.ledger)}\nReview: ${JSON.stringify(trial.structured)}`
  await spawnCaptured("codex", [
    "exec",
    "--ephemeral",
    "--ignore-user-config",
    "--skip-git-repo-check",
    "--sandbox", "read-only",
    "--model", manifest.judge.model,
    "-c", `model_reasoning_effort="${manifest.judge.effort}"`,
    "--output-schema", schemaPath,
    "--output-last-message", outputPath,
    "-",
  ], { input: prompt, cwd: judgeDir, timeout: manifest.timeout_ms })
  try {
    const parsed = readJson<any>(outputPath)
    return {
      detected_ledger_ids: Array.isArray(parsed.detected_ledger_ids) ? parsed.detected_ledger_ids.map(String) : [],
      false_findings: Number.isInteger(parsed.false_findings) && parsed.false_findings >= 0 ? parsed.false_findings : 0,
    }
  } catch {
    return { detected_ledger_ids: [], false_findings: item.ledger.length === 0 ? 1 : 0 }
  }
}

function aggregateJudgeVotes(item: AdoptionCase, votes: JudgeVote[]): Pick<TrialEvidence, "detected_ledger_ids" | "false_findings"> {
  const detected = item.ledger.filter((ledger) => votes.filter((vote) => vote.detected_ledger_ids.includes(ledger.id)).length >= 2).map((ledger) => ledger.id)
  return { detected_ledger_ids: detected, false_findings: Math.round(median(votes.map((vote) => vote.false_findings))) }
}

async function runPaid(manifestPath: string, scratchRoot: string, confirmedCalls: number | undefined, aggregateOutput: string | undefined): Promise<void> {
  const { manifest, trials } = preflight(manifestPath, scratchRoot)
  const counts = inventory(manifest)
  const approvedCost = process.env.FABLE_CRITIQUE_COST_ESTIMATE_APPROVED
  const errors: string[] = []
  if (confirmedCalls !== counts.total) errors.push(`pass --confirm-provider-calls ${counts.total}`)
  if (approvedCost !== counts.spend.toFixed(2)) errors.push(`set FABLE_CRITIQUE_COST_ESTIMATE_APPROVED=${counts.spend.toFixed(2)}`)
  if (errors.length) fail(errors.join(" and "))

  await withRunScratchAsync(scratchRoot, async (runDir) => {
    const observed: TrialEvidence[] = []
    // Keep model arms in separate waves so load and routing observations from one arm cannot overlap the other.
    for (const arm of manifest.arms) {
      const armTrials = trials.filter((trial) => trial.arm_id === arm.id)
      const reviews = await parallelMap(armTrials, manifest.review_concurrency, async (trial) => {
        return await runReviewTrial(manifest, manifestPath, trial, runDir)
      })
      const judgeTasks = reviews.flatMap((review) => qualityEligible(review)
        ? Array.from({ length: manifest.judge_votes_per_output }, (_, voteIndex) => ({ review, voteIndex }))
        : [])
      const votes = await parallelMap(judgeTasks, manifest.judge_concurrency, async ({ review, voteIndex }) => {
        const item = manifest.adoption_cases.find((candidate) => candidate.id === review.case_id)!
        return { trialId: review.trial_id, vote: await runJudgeVote(manifest, item, review, voteIndex, runDir) }
      })
      for (const review of reviews) {
        const item = manifest.adoption_cases.find((candidate) => candidate.id === review.case_id)!
        const trialVotes = votes.filter((entry) => entry.trialId === review.trial_id).map((entry) => entry.vote)
        const judged = qualityEligible(review)
          ? aggregateJudgeVotes(item, trialVotes)
          : { detected_ledger_ids: [], false_findings: 0 }
        observed.push({ ...review, ...judged, structured: undefined })
      }
    }
    assertExactTrialSet(trials, observed)
    const scored = scoreEvidence(manifest, observed)
    const aggregate = {
      schema_version: 2,
      status: "completed",
      manifest_digest: sha256(readFileSync(manifestPath)),
      fixture_digests: fixtureDigests(manifest, manifestPath),
      provider_call_inventory: counts,
      trial_outcome_counts: Object.fromEntries(["matched", ...FAILURE_OUTCOMES].map((outcome) => [outcome, observed.filter((trial) => trial.outcome === outcome).length])),
      redacted_trial_receipts: observed,
      ...scored,
    }
    assertAggregateExportSafe(aggregate)
    if (aggregateOutput) writeFileSync(aggregateOutput, `${JSON.stringify(aggregate, null, 2)}\n`, { mode: 0o600 })
    process.stdout.write(`${JSON.stringify({ overall_decision: scored.overall_decision, decision_table: scored.decision_table }, null, 2)}\n`)
  })
}

function extractAggregate(reportPath: string): any {
  const text = readFileSync(reportPath, "utf8")
  const match = text.match(/```benchmark-aggregate-json\s*([\s\S]*?)```/)
  if (!match) fail("report is missing benchmark-aggregate-json")
  try {
    return JSON.parse(match[1])
  } catch {
    fail("report aggregate JSON is invalid")
  }
}

function verifyHistoricalStop(payload: any, manifest: Manifest): void {
  const counts = inventory(manifest)
  const stop = payload?.historical_stop
  const next = payload?.ordinary_adoption_benchmark
  const valid =
    payload?.schema_version === 2 && payload?.status === "historical-stop" &&
    stop?.gate === "receipt-mismatch" && stop?.requested_model === "fable" && stop?.served_model === "claude-opus-4-8" &&
    stop?.review_calls_completed === 56 && stop?.matching_fable_receipts === 53 && stop?.receipt_mismatches === 3 &&
    stop?.judge_calls_completed === 0 && stop?.provider_successes === 56 && stop?.schema_valid_outputs === 56 &&
    stop?.stopped_run_spend_usd === 10.58 && stop?.diagnostic_pilots_spend_usd === 16.51 && stop?.total_anthropic_spend_usd === 27.09 &&
    next?.status === "not-run" && next?.provider_call_counts?.anthropic === counts.anthropic &&
    next?.provider_call_counts?.openai === counts.openai && next?.provider_call_counts?.total === counts.total &&
    next?.estimated_spend_usd === Number(counts.spend.toFixed(2)) && payload?.tracks?.length === 0 &&
    payload?.decision_table?.length === 0 && payload?.overall_decision === "not-run"
  if (!valid) fail("historical stop evidence is invalid")
}

function verifyReport(reportPath: string, manifestPath: string): void {
  const manifest = readJson<Manifest>(manifestPath)
  validateManifest(manifest, manifestPath)
  const payload = extractAggregate(reportPath)
  assertAggregateExportSafe(payload)
  if (payload.status === "historical-stop") {
    verifyHistoricalStop(payload, manifest)
    process.stdout.write("report verification: PASS (historical stop; ordinary benchmark not run)\n")
    return
  }
  if (payload.status !== "completed" || !Array.isArray(payload.redacted_trial_receipts)) fail("report benchmark status is invalid")
  const expected = buildPreRegisteredTrials(manifest, manifestPath)
  assertExactTrialSet(expected, payload.redacted_trial_receipts)
  const scored = scoreEvidence(manifest, payload.redacted_trial_receipts)
  if (JSON.stringify(payload.decision_table) !== JSON.stringify(scored.decision_table) || payload.overall_decision !== scored.overall_decision) {
    fail("report decision does not match recomputed decision")
  }
  process.stdout.write(`report verification: PASS (${scored.overall_decision})\n`)
}

function parseArgs(argv: string[]) {
  let mode: "preflight" | "run" | "verify-report" | undefined
  let reportPath: string | undefined
  let manifestPath = defaultManifestPath()
  let scratchRoot = defaultScratchRoot()
  let confirmedCalls: number | undefined
  let aggregateOutput: string | undefined
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--preflight" || arg === "--run") {
      if (mode) fail("choose exactly one mode")
      mode = arg.slice(2) as "preflight" | "run"
    } else if (arg === "--verify-report") {
      if (mode) fail("choose exactly one mode")
      mode = "verify-report"
      reportPath = argv[++index]
    } else if (arg === "--manifest") manifestPath = argv[++index]
    else if (arg === "--scratch-root") scratchRoot = argv[++index]
    else if (arg === "--confirm-provider-calls") confirmedCalls = Number(argv[++index])
    else if (arg === "--aggregate-output") aggregateOutput = argv[++index]
    else fail(`unknown argument: ${arg}`)
  }
  if (!mode) fail("use --preflight, --run, or --verify-report <path>")
  if (mode === "verify-report" && !reportPath) fail("--verify-report requires a path")
  return { mode, reportPath, manifestPath, scratchRoot, confirmedCalls, aggregateOutput }
}

if (import.meta.main) {
  try {
    const args = parseArgs(process.argv.slice(2))
    if (args.mode === "preflight") preflight(args.manifestPath, args.scratchRoot)
    else if (args.mode === "run") await runPaid(args.manifestPath, args.scratchRoot, args.confirmedCalls, args.aggregateOutput)
    else verifyReport(args.reportPath!, args.manifestPath)
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exit(1)
  }
}
