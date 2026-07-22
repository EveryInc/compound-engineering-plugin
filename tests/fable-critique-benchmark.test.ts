import { chmodSync, cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { describe, expect, test } from "bun:test"
import {
  assertAggregateExportSafe,
  assertExactTrialSet,
  buildPreRegisteredTrials,
  scoreEvidence,
  verifyCleanup,
} from "../scripts/evals/fable-critique-benchmark"
import * as benchmark from "../scripts/evals/fable-critique-benchmark"

const ROOT = process.cwd()
const BUN = process.execPath
const SCRIPT = path.join(ROOT, "scripts/evals/fable-critique-benchmark.ts")
const FIXTURE_ROOT = path.join(ROOT, "tests/fixtures/fable-critique-benchmark")
const MANIFEST = path.join(FIXTURE_ROOT, "manifest.json")
const REPORT = path.join(ROOT, "docs/plans/2026-07-21-fable-5-critique-benchmark-report.md")

function tempRoot(prefix: string): string {
  const root = mkdtempSync(path.join(tmpdir(), prefix))
  chmodSync(root, 0o700)
  return root
}

function fakeRoutes(root: string): { bin: string; log: string } {
  const bin = path.join(root, "bin")
  const log = path.join(root, "route.log")
  mkdirSync(bin)
  writeFileSync(log, "")
  for (const name of ["claude", "codex"]) {
    const file = path.join(bin, name)
    writeFileSync(file, `#!/bin/sh\nprintf '%s\\n' "$*" >> '${log}'\nif [ "$1" = "--version" ]; then echo '${name} test-version'; exit 0; fi\necho provider-content-call-forbidden >&2\nexit 91\n`)
    chmodSync(file, 0o755)
  }
  return { bin, log }
}

function concurrentFakeRoutes(root: string): { bin: string; reviewState: string; judgeState: string; argvLog: string; promptDir: string } {
  const bin = path.join(root, "concurrent-bin")
  const state = path.join(root, "state")
  const argvLog = path.join(state, "argv.log")
  const promptDir = path.join(state, "prompts")
  mkdirSync(bin)
  mkdirSync(state)
  mkdirSync(promptDir)
  writeFileSync(argvLog, "")
  for (const kind of ["review", "judge"]) {
    const dir = path.join(state, kind)
    mkdirSync(dir)
    writeFileSync(path.join(dir, "active"), "0\n")
    writeFileSync(path.join(dir, "max"), "0\n")
    writeFileSync(path.join(dir, "calls"), "0\n")
  }
  const tracker = `
track_start() {
  state="$1"
  while ! mkdir "$state/lock" 2>/dev/null; do sleep 0.001; done
  active=$(cat "$state/active"); active=$((active + 1)); echo "$active" > "$state/active"
  maximum=$(cat "$state/max"); [ "$active" -le "$maximum" ] || echo "$active" > "$state/max"
  calls=$(cat "$state/calls"); echo $((calls + 1)) > "$state/calls"
  rmdir "$state/lock"
}
track_end() {
  state="$1"
  while ! mkdir "$state/lock" 2>/dev/null; do sleep 0.001; done
  active=$(cat "$state/active"); echo $((active - 1)) > "$state/active"
  rmdir "$state/lock"
}
`
  const claude = path.join(bin, "claude")
  writeFileSync(claude, `#!/bin/sh
if [ "$1" = "--version" ]; then echo 'claude fake-version'; exit 0; fi
${tracker}
prompt='${promptDir}/'$$'-prompt'
cat > "$prompt"
prompt_key=$(cksum "$prompt" | awk '{print $1 ":" $2}')
argv=$(printf '%s' "$*" | tr '\\n' ' ')
while ! mkdir '${path.join(state, "argv-lock")}' 2>/dev/null; do sleep 0.001; done
printf 'claude prompt=%s cwd=%s argv=%s\\n' "$prompt_key" "$PWD" "$argv" >> '${argvLog}'
rmdir '${path.join(state, "argv-lock")}'
track_start '${path.join(state, "review")}'
sleep 0.02
model=opus; previous=
for argument in "$@"; do [ "$previous" = "--model" ] && model="$argument"; previous="$argument"; done
printf '{"stop_reason":"end_turn","structured_output":{"reviewer":"benchmark","findings":[],"residual_risks":[],"deferred_questions":[]},"modelUsage":{"claude-%s-test":{}}}' "$model"
track_end '${path.join(state, "review")}'
`)
  chmodSync(claude, 0o755)

  const codex = path.join(bin, "codex")
  writeFileSync(codex, `#!/bin/sh
if [ "$1" = "--version" ]; then echo 'codex fake-version'; exit 0; fi
${tracker}
while ! mkdir '${path.join(state, "argv-lock")}' 2>/dev/null; do sleep 0.001; done
printf 'codex %s cwd=%s\\n' "$*" "$PWD" >> '${argvLog}'
rmdir '${path.join(state, "argv-lock")}'
track_start '${path.join(state, "judge")}'
sleep 0.02
output=
previous=
for argument in "$@"; do [ "$previous" = "--output-last-message" ] && output="$argument"; previous="$argument"; done
payload='{"detected_ledger_ids":[],"false_findings":0}'
if [ -n "$output" ]; then printf '%s' "$payload" > "$output"; else printf '%s' "$payload"; fi
track_end '${path.join(state, "judge")}'
`)
  chmodSync(codex, 0o755)
  return {
    bin,
    reviewState: path.join(state, "review"),
    judgeState: path.join(state, "judge"),
    argvLog,
    promptDir,
  }
}

function run(args: string[], env: Record<string, string> = {}) {
  return spawnSync(BUN, ["run", SCRIPT, ...args], {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, ...env },
  })
}

function copiedCorpus(): { root: string; manifest: string } {
  const root = tempRoot("fable-benchmark-corpus-")
  const corpus = path.join(root, "corpus")
  cpSync(FIXTURE_ROOT, corpus, { recursive: true })
  return { root, manifest: path.join(corpus, "manifest.json") }
}

function preflight(manifest = MANIFEST, scratchRoot?: string) {
  const root = tempRoot("fable-benchmark-preflight-")
  const routes = fakeRoutes(root)
  const scratch = scratchRoot ?? path.join(root, "scratch")
  const result = run(["--preflight", "--manifest", manifest, "--scratch-root", scratch], {
    PATH: `${routes.bin}:${process.env.PATH ?? ""}`,
    FABLE_CRITIQUE_ALLOWED_RECIPIENTS: "anthropic,openai",
  })
  return { result, routes, scratch }
}

function perfectEvidence() {
  const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"))
  const trials = buildPreRegisteredTrials(manifest, MANIFEST)
  const evidence = trials.map((trial) => {
    const item = manifest.adoption_cases.find((candidate: any) => candidate.id === trial.case_id)
    const fable = trial.model_requested === "fable"
    return {
      ...trial,
      outcome: "matched" as const,
      identity_status: "verified" as const,
      model_actual: fable ? "claude-fable-5" : "claude-opus-4-8",
      observed_model_ids: [fable ? "claude-fable-5" : "claude-opus-4-8"],
      schema_valid: true,
      non_refusal: true,
      deadline_met: true,
      latency_ms: 100,
      detected_ledger_ids: item.ledger.map((entry: any) => entry.id),
      false_findings: 0,
    }
  })
  return { manifest, trials, evidence }
}

describe("Fable ordinary-lane critique benchmark", () => {
  test("default scratch root is stable under /tmp regardless of TMPDIR", () => {
    const previous = process.env.TMPDIR
    process.env.TMPDIR = "/var/folders/redirected-by-test"
    try {
      expect((benchmark as any).defaultScratchRoot()).toBe(`/tmp/compound-engineering-${process.getuid()}/fable-critique-benchmark`)
    } finally {
      if (previous === undefined) delete process.env.TMPDIR
      else process.env.TMPDIR = previous
    }
  })

  test("preflight prints the exact ordinary-only inventory, cost gate, and makes zero provider calls", () => {
    const { result, routes, scratch } = preflight()

    expect(result.status).toBe(0)
    expect(result.stdout).toContain("Adoption lanes: product-lens, whole-doc")
    expect(result.stdout).toContain("Corpus inputs: 4 (2 product-lens, 2 whole-doc)")
    expect(result.stdout).toContain("Trials per model/input: 5")
    expect(result.stdout).toContain("Opus/high review calls: 20")
    expect(result.stdout).toContain("Fable/high review calls: 20")
    expect(result.stdout).toContain("Anthropic arm calls: 40")
    expect(result.stdout).toContain("OpenAI judge calls: 120")
    expect(result.stdout).toContain("Total provider calls: 160")
    expect(result.stdout).toContain("Estimated provider spend: $16.00")
    expect(result.stdout).toContain("offline preflight: PASS")
    expect(result.stdout).toContain("No provider content calls were made")
    expect(readFileSync(routes.log, "utf8").trim().split("\n")).toEqual(["--version", "--version"])
    expect(statSync(scratch).mode & 0o777).toBe(0o700)
  })

  test("manifest contains representative seeded and clean inputs only for ordinary roles", () => {
    const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"))
    expect(manifest.trials_per_arm).toBeGreaterThanOrEqual(5)
    expect(new Set(manifest.adoption_cases.map((entry: any) => entry.role))).toEqual(new Set(["product-lens", "whole-doc"]))
    for (const role of ["product-lens", "whole-doc"]) {
      const cases = manifest.adoption_cases.filter((entry: any) => entry.role === role)
      expect(cases.some((entry: any) => entry.kind === "seeded")).toBe(true)
      expect(cases.some((entry: any) => entry.kind === "clean")).toBe(true)
    }
  })

  test.each(["security-lens", "adversarial", "code-adversarial"])("preflight rejects guarded role %s", (role) => {
    const corpus = copiedCorpus()
    const manifest = JSON.parse(readFileSync(corpus.manifest, "utf8"))
    manifest.adoption_cases[0].role = role
    writeFileSync(corpus.manifest, `${JSON.stringify(manifest, null, 2)}\n`)

    const { result } = preflight(corpus.manifest, path.join(corpus.root, "scratch"))
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain(`guarded role is forbidden in adoption corpus: ${role}`)
  })

  test("preflight rejects a fixture containing a credential-shaped value", () => {
    const corpus = copiedCorpus()
    const manifest = JSON.parse(readFileSync(corpus.manifest, "utf8"))
    writeFileSync(path.join(path.dirname(corpus.manifest), manifest.adoption_cases[0].path), 'api_key = "sk-testcredential1234567890"\n')

    const { result } = preflight(corpus.manifest, path.join(corpus.root, "scratch"))
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain("secret/path sentinel rejected")
  })

  test("preflight rejects an insecure scratch root", () => {
    const root = tempRoot("fable-benchmark-insecure-")
    const scratch = path.join(root, "scratch")
    mkdirSync(scratch, { mode: 0o755 })
    chmodSync(scratch, 0o755)
    const { result } = preflight(MANIFEST, scratch)
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain("scratch directory must have mode 700")
  })

  test("paid execution requires both exact call-count and cost confirmations before provider content calls", () => {
    const root = tempRoot("fable-benchmark-paid-gate-")
    const routes = fakeRoutes(root)
    const result = run([
      "--run", "--manifest", MANIFEST, "--scratch-root", path.join(root, "scratch"),
      "--confirm-provider-calls", "159",
    ], {
      PATH: `${routes.bin}:${process.env.PATH ?? ""}`,
      FABLE_CRITIQUE_ALLOWED_RECIPIENTS: "anthropic,openai",
    })

    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain("pass --confirm-provider-calls 160")
    expect(result.stderr).toContain("FABLE_CRITIQUE_COST_ESTIMATE_APPROVED=16.00")
    expect(readFileSync(routes.log, "utf8")).not.toContain("provider-content-call")
  })

  test("paid fake routes use bounded model-isolated review and judge waves with schema-backed Codex output", () => {
    const root = tempRoot("fable-benchmark-concurrency-")
    const routes = concurrentFakeRoutes(root)
    const aggregate = path.join(root, "aggregate.json")
    const result = run([
      "--run", "--manifest", MANIFEST, "--scratch-root", path.join(root, "scratch"),
      "--confirm-provider-calls", "160", "--aggregate-output", aggregate,
    ], {
      PATH: `${routes.bin}:${process.env.PATH ?? ""}`,
      FABLE_CRITIQUE_ALLOWED_RECIPIENTS: "anthropic,openai",
      FABLE_CRITIQUE_COST_ESTIMATE_APPROVED: "16.00",
    })

    expect(result.status).toBe(0)
    expect(Number(readFileSync(path.join(routes.reviewState, "calls"), "utf8"))).toBe(40)
    expect(Number(readFileSync(path.join(routes.judgeState, "calls"), "utf8"))).toBe(120)
    const maxReviews = Number(readFileSync(path.join(routes.reviewState, "max"), "utf8"))
    const maxJudges = Number(readFileSync(path.join(routes.judgeState, "max"), "utf8"))
    expect(maxReviews).toBeGreaterThan(1)
    expect(maxReviews).toBeLessThanOrEqual(4)
    expect(maxJudges).toBeGreaterThan(1)
    expect(maxJudges).toBeLessThanOrEqual(6)
    const argv = readFileSync(routes.argvLog, "utf8")
    const codexLines = argv.split("\n").filter((entry) => entry.startsWith("codex "))
    expect(codexLines).toHaveLength(120)
    expect(codexLines[0]).toContain('-c model_reasoning_effort="xhigh"')
    expect(codexLines[0]).not.toContain("--effort")
    expect(codexLines[0]).toContain("--output-schema")
    expect(codexLines[0]).toContain("--output-last-message")
    for (const line of codexLines) {
      expect(line).toContain(`${realpathSync(path.join(root, "scratch"))}/`)
    }
    const claudeLines = argv.split("\n").filter((entry) => entry.startsWith("claude "))
    expect(claudeLines).toHaveLength(40)
    for (const line of claudeLines) {
      expect(line).toContain(`${realpathSync(path.join(root, "scratch"))}/`)
      expect(line).not.toContain(`cwd=${ROOT}`)
      expect(line).toContain("--permission-mode dontAsk")
      expect(line).toContain("--safe-mode")
      expect(line).toContain("--disable-slash-commands")
      expect(line).toContain("--tools  ")
      expect(line).toContain("--max-turns 15")
      expect(line).toContain("--no-session-persistence")
      expect(line).toContain("--json-schema")
      expect(line).toContain("--output-format json")
    }
    const prompts = readdirSync(routes.promptDir).map((file) => readFileSync(path.join(routes.promptDir, file), "utf8"))
    expect(prompts.some((prompt) => prompt.includes("You are a senior product leader."))).toBe(true)
    expect(prompts.some((prompt) => prompt.includes("# Whole-Document Cross-Model Reviewer"))).toBe(true)
    expect(prompts.every((prompt) => prompt.includes("<output-contract>"))).toBe(true)
    expect(prompts.every((prompt) => prompt.includes("<context-slots-rules>"))).toBe(true)
    expect(prompts.every((prompt) => prompt.includes('"residual_risks"'))).toBe(true)
    expect(prompts.some((prompt) => prompt.includes("Document type: requirements") && prompt.includes("Document path: product-actor.md"))).toBe(true)
    expect(prompts.some((prompt) => prompt.includes("Document type: plan") && prompt.includes("Document path: whole-order.md"))).toBe(true)
    expect(prompts.every((prompt) => prompt.includes("Origin: none") && prompt.includes("Round 1 — no prior decisions."))).toBe(true)
    const argsByPrompt = new Map<string, Set<string>>()
    for (const line of claudeLines) {
      const match = line.match(/^claude prompt=(\S+) cwd=\S+ argv=(.*)$/)
      expect(match).not.toBeNull()
      const normalized = match![2].replace(/--model (?:opus|fable)/, "--model <arm>")
      const values = argsByPrompt.get(match![1]) ?? new Set<string>()
      values.add(normalized)
      argsByPrompt.set(match![1], values)
    }
    expect(argsByPrompt.size).toBe(4)
    expect([...argsByPrompt.values()].every((values) => values.size === 1)).toBe(true)
    expect(JSON.parse(readFileSync(aggregate, "utf8")).redacted_trial_receipts).toHaveLength(40)
  }, 30_000)

  test("matching unambiguous Fable alone enters its quality numerator; every failure remains in the denominator", () => {
    const source = readFileSync(SCRIPT, "utf8")
    expect(source).toContain("qualityEligible")
    expect(source).toContain('trial.model_requested === "fable"')
    expect(source).toContain('trial.outcome === "matched"')
    expect(source).toContain('trial.identity_status === "verified"')
    expect(source).toContain("quality_denominator: expectedTrials")
    for (const outcome of ["substituted", "ambiguous", "unverified", "refused", "schema-invalid", "auth-failed", "quota-failed", "timed-out"]) {
      expect(source).toContain(`"${outcome}"`)
    }

    for (const outcome of ["substituted", "ambiguous", "unverified", "refused", "schema-invalid", "auth-failed", "quota-failed", "timed-out"] as const) {
      const { manifest, evidence } = perfectEvidence()
      const candidate = evidence.find((trial) => trial.lane === "product-lens" && trial.arm_id === "fable-high")!
      candidate.outcome = outcome
      candidate.identity_status = outcome === "ambiguous" ? "ambiguous" : outcome === "substituted" ? "verified" : "unverified"
      if (outcome === "substituted") candidate.model_actual = "claude-opus-4-8"
      const scored = scoreEvidence(manifest, evidence)
      const product = scored.decision_table.find((row) => row.lane === "product-lens")!
      expect(product.fable.quality_numerator).toBe(9)
      expect(product.fable.quality_denominator).toBe(10)
      expect(scored.overall_decision).toBe("stop")
    }
  })

  test("the harness pre-registers one immutable trial set and exposes no selective rerun surface", () => {
    const source = readFileSync(SCRIPT, "utf8")
    expect(source).toContain("buildPreRegisteredTrials")
    expect(source).toContain("assertExactTrialSet")
    expect(source).not.toMatch(/--(?:retry|rerun|replace)-(?:trial|failed)/)
    expect(source).not.toContain("filterFailedTrials")

    const { trials, evidence } = perfectEvidence()
    expect(() => assertExactTrialSet(trials, evidence.slice(1))).toThrow("pre-registered non-replaceable set")
    expect(() => assertExactTrialSet(trials, [...evidence, evidence[0]])).toThrow("pre-registered non-replaceable set")
  })

  test("raw exports, sentinel hits, and cleanup failures are fail-closed", () => {
    const source = readFileSync(SCRIPT, "utf8")
    expect(source).toContain("RAW_EXPORT_KEYS")
    for (const rawKey of ["prompt", "stdout", "stderr", "provider_envelope", "judge_vote"]) {
      expect(source).toContain(`"${rawKey}"`)
    }
    expect(source).toContain("assertAggregateExportSafe")
    expect(source).toContain("verifyCleanup")
    expect(source).toContain("cleanup verification failed")
    expect(source).toContain("secret/path sentinel rejected")

    expect(() => assertAggregateExportSafe({ provider_envelope: { safe: false } })).toThrow("raw-content export is forbidden")
    const uncleared = tempRoot("fable-benchmark-uncleared-")
    expect(() => verifyCleanup(uncleared)).toThrow("cleanup verification failed")
  })

  test("decision gates cover non-inferiority, P0/P1 loss, noise, provider success, and deadlines", () => {
    const source = readFileSync(SCRIPT, "utf8")
    expect(source).toContain("severity_weighted_detection")
    expect(source).toContain("bootstrap_lower_bound_delta")
    expect(source).toContain("p0_p1_regressions")
    expect(source).toContain("noise_per_review")
    expect(source).toContain("schema_success_rate")
    expect(source).toContain("non_refusal_success_rate")
    expect(source).toContain("deadline_success_rate")
    expect(source).toContain("NON_INFERIORITY_MARGIN = -0.1")
    expect(source).toContain("MAX_NOISE_DELTA = 0.5")

    expect(scoreEvidence(perfectEvidence().manifest, perfectEvidence().evidence).overall_decision).toBe("adopt")
    const mutations = [
      (evidence: any[]) => {
        for (const trial of evidence.filter((item) => item.arm_id === "fable-high" && item.lane === "product-lens")) {
          trial.detected_ledger_ids = []
        }
      },
      (evidence: any[]) => {
        for (const trial of evidence.filter((item) => item.arm_id === "fable-high" && item.lane === "whole-doc")) {
          trial.false_findings = 1
        }
      },
      (evidence: any[]) => {
        const trial = evidence.find((item) => item.arm_id === "fable-high")
        trial.outcome = "schema-invalid"
        trial.schema_valid = false
      },
      (evidence: any[]) => {
        const trial = evidence.find((item) => item.arm_id === "fable-high")
        trial.outcome = "refused"
        trial.non_refusal = false
      },
      (evidence: any[]) => {
        const trial = evidence.find((item) => item.arm_id === "fable-high")
        trial.outcome = "timed-out"
        trial.deadline_met = false
      },
    ]
    for (const mutate of mutations) {
      const { manifest, evidence } = perfectEvidence()
      mutate(evidence)
      expect(scoreEvidence(manifest, evidence).overall_decision).toBe("stop")
    }

    const { manifest, evidence } = perfectEvidence()
    for (const trial of evidence.filter((item) => item.arm_id === "fable-high" && item.case_id === "whole-order")) {
      trial.detected_ledger_ids = []
    }
    const whole = scoreEvidence(manifest, evidence).decision_table.find((row) => row.lane === "whole-doc")!
    expect(whole.p0_p1_regressions).toEqual(["WHOLE-2"])
    expect(whole.bootstrap_lower_bound_delta).toBeLessThan(-0.1)
  })

  test("report verification preserves the stopped historical ledger and uses cautious routing language", () => {
    const routeRoot = tempRoot("fable-benchmark-report-routes-")
    const routes = fakeRoutes(routeRoot)
    const valid = run(["--verify-report", REPORT, "--manifest", MANIFEST], { PATH: `${routes.bin}:${process.env.PATH ?? ""}` })
    expect(valid.status).toBe(0)
    expect(valid.stdout).toContain("report verification: PASS (historical stop; ordinary benchmark not run)")
    expect(existsSync(routes.log) ? readFileSync(routes.log, "utf8") : "").toBe("")

    const report = readFileSync(REPORT, "utf8")
    expect(report).toContain("56 Anthropic review calls")
    expect(report).toContain("3 mismatched receipts")
    expect(report).toContain("zero OpenAI judge calls")
    expect(report).toContain("$10.58")
    expect(report).toContain("$16.51")
    expect(report).toContain("$27.09")
    expect(report).toContain("fixture-correlated")
    expect(report).toContain("consistent with Anthropic's documented safety routing")
    expect(report).toContain("does not prove the cause of any individual call")
    expect(report).not.toContain("sustained usage caused")
  })

  test("report verification rejects tampered historical counts or spend", () => {
    const root = tempRoot("fable-benchmark-report-")
    const tampered = path.join(root, "report.md")
    writeFileSync(tampered, readFileSync(REPORT, "utf8").replace('"receipt_mismatches": 3', '"receipt_mismatches": 2'))
    const result = run(["--verify-report", tampered, "--manifest", MANIFEST])
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain("historical stop evidence is invalid")
  })

  test("report verification recomputes a completed ordinary-lane decision table", () => {
    const { manifest, evidence } = perfectEvidence()
    const scored = scoreEvidence(manifest, evidence)
    const payload = {
      schema_version: 2,
      status: "completed",
      redacted_trial_receipts: evidence,
      decision_table: scored.decision_table,
      overall_decision: scored.overall_decision,
    }
    const root = tempRoot("fable-benchmark-completed-report-")
    const report = path.join(root, "report.md")
    writeFileSync(report, `# Completed\n\n\`\`\`benchmark-aggregate-json\n${JSON.stringify(payload, null, 2)}\n\`\`\`\n`)
    const valid = run(["--verify-report", report, "--manifest", MANIFEST])
    expect(valid.status).toBe(0)
    expect(valid.stdout).toContain("report verification: PASS (adopt)")

    payload.overall_decision = "stop"
    writeFileSync(report, `# Tampered\n\n\`\`\`benchmark-aggregate-json\n${JSON.stringify(payload, null, 2)}\n\`\`\`\n`)
    const invalid = run(["--verify-report", report, "--manifest", MANIFEST])
    expect(invalid.status).not.toBe(0)
    expect(invalid.stderr).toContain("report decision does not match recomputed decision")
  })
})
