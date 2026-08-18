import { describe, expect, test, beforeEach, setDefaultTimeout } from "bun:test"
import { spawn, spawnSync } from "node:child_process"
import { chmodSync, existsSync, mkdtempSync, writeFileSync, readFileSync, renameSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

setDefaultTimeout(30_000)

// Regression tests for the ce-babysit-pr pr-snapshot claim->act->confirm engine.
// Exercised via --fetch-file (no live PR), following the tests/*-validator.test.ts
// spawnSync pattern. Locks in the ce-code-review fixes: crash-safety, needs-human
// silencing + open_needs_human visibility, checks_terminal, key-collision, null-head.
const SCRIPT = path.join(import.meta.dir, "..", "skills", "ce-babysit-pr", "scripts", "pr-snapshot")
const ORDINARY_TEST_BUDGET_SECONDS = "28800"
const EXPIRING_TEST_INVOCATION = ["--start-invocation", "--invocation-budget-seconds", "1"]

function fetchFile(dir: string, name: string, obj: unknown): string {
  const p = path.join(dir, name)
  writeFileSync(p, JSON.stringify(obj))
  return p
}

function persistedInvocationArgs(stateDir: string): string[] {
  if (!existsSync(path.join(stateDir, "state.json"))) return []
  const state = JSON.parse(readFileSync(path.join(stateDir, "state.json"), "utf8"))
  if (!state.invocation_id || !state.started_at || !state.invocation_budget_seconds) return []
  return ["--invocation-id", state.invocation_id, "--session-started-at", state.started_at,
    "--invocation-budget-seconds", String(state.invocation_budget_seconds)]
}

function snapshot(stateDir: string, fetch: string, extra: string[] = []): any {
  const hasInvocationMode = extra.includes("--start-invocation")
    || extra.includes("--reset-session")
    || extra.includes("--continue-invocation")
    || extra.includes("--invocation-id")
  const persistedArgs = !hasInvocationMode ? persistedInvocationArgs(stateDir) : []
  const startsInvocation = (!hasInvocationMode && persistedArgs.length === 0)
    || extra.includes("--start-invocation")
    || extra.includes("--reset-session")
  const budgetArgs = startsInvocation && !extra.includes("--invocation-budget-seconds")
    ? ["--invocation-budget-seconds", ORDINARY_TEST_BUDGET_SECONDS]
    : []
  const r = spawnSync(
    "python3",
    [SCRIPT, "snapshot", "--pr", "1", "--repo", "o/r", "--state-dir", stateDir, "--fetch-file", fetch,
      ...(hasInvocationMode ? [] : persistedArgs.length > 0 ? persistedArgs : ["--start-invocation"]),
      ...budgetArgs, ...extra],
    { encoding: "utf8" },
  )
  expect(r.status, r.stderr).toBe(0)
  return JSON.parse(r.stdout)
}

function currentInvocationArgs(stateDir: string, fetch: string): string[] {
  const persistedArgs = persistedInvocationArgs(stateDir)
  if (persistedArgs.length > 0) return persistedArgs
  const started = snapshot(stateDir, fetch, ["--start-invocation",
    "--invocation-budget-seconds", ORDINARY_TEST_BUDGET_SECONDS])
  return ["--invocation-id", started.invocation_id, "--session-started-at", started.invocation_started_at,
    "--invocation-budget-seconds", String(started.invocation_budget_seconds)]
}

function mark(stateDir: string, args: string[]): void {
  // Default the at-mark baseline fetch to empty threads (-> lazy first-observation baseline, no gh
  // call); a test exercising at-mark capture passes its own --fetch-file, which we don't override.
  const extra = args.includes("--fetch-file")
    ? []
    : ["--fetch-file", fetchFile(path.dirname(stateDir), "mark-empty.json", { threads: [] })]
  const r = spawnSync("python3", [SCRIPT, "mark", "--state-dir", stateDir,
    ...persistedInvocationArgs(stateDir), ...args, ...extra], { encoding: "utf8" })
  expect(r.status, r.stderr).toBe(0)
}

function markCurrency(stateDir: string, key: string, disposition: string, fingerprint?: string): void {
  const args = ["--currency-key", key, "--currency-disposition", disposition]
  if (fingerprint) args.push("--semantic-conflict-fingerprint", fingerprint)
  mark(stateDir, args)
}

function markCurrencyOutcome(stateDir: string, key: string, outcome: string): void {
  mark(stateDir, ["--currency-key", key, "--currency-outcome", outcome])
}

function markCurrencyInspection(stateDir: string, key: string, fingerprint: string): void {
  mark(stateDir, ["--currency-key", key, "--currency-inspected-fingerprint", fingerprint])
}

function watch(stateDir: string, fetch: string, extra: string[] = []): any {
  const invocationArgs = extra.includes("--invocation-id") ? [] : currentInvocationArgs(stateDir, fetch)
  const r = spawnSync(
    "python3",
    [SCRIPT, "watch", "--pr", "1", "--repo", "o/r", "--state-dir", stateDir, "--fetch-file", fetch,
      "--interval", "0.1", ...invocationArgs, ...extra],
    { encoding: "utf8", timeout: 5000 },
  )
  expect(r.status, r.stderr).toBe(0)
  return JSON.parse(r.stdout.trim().split("\n").pop()!) // the wake sentinel is the final line
}

function startWatch(stateDir: string, fetch: string, extra: string[] = []) {
  const invocationArgs = extra.includes("--invocation-id") ? [] : currentInvocationArgs(stateDir, fetch)
  const child = spawn(
    "python3",
    [SCRIPT, "watch", "--pr", "1", "--repo", "o/r", "--state-dir", stateDir, "--fetch-file", fetch,
      "--interval", "0.05", ...invocationArgs, ...extra],
    { stdio: ["ignore", "pipe", "pipe"] },
  )
  let stdout = ""
  let stderr = ""
  child.stdout.on("data", (chunk) => { stdout += chunk })
  child.stderr.on("data", (chunk) => { stderr += chunk })
  const result = new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve) => {
    child.on("close", (code) => resolve({ code, stdout, stderr }))
  })
  return { child, result }
}

async function waitForWatchGeneration(stateDir: string, previous: string | null = null): Promise<string> {
  const deadline = Date.now() + 5000
  while (Date.now() < deadline) {
    try {
      const generation = JSON.parse(readFileSync(path.join(stateDir, "state.json"), "utf8")).watch_generation
      if (typeof generation === "string" && generation !== previous) return generation
    } catch {
      // The first watcher may still be creating state.json.
    }
    await Bun.sleep(20)
  }
  throw new Error(`watch generation did not advance from ${previous}`)
}

function wakeReason(snapshotValue: unknown, settleSeconds = 0): string | null {
  const r = spawnSync(
    "python3",
    [
      "-c",
      `import json; from importlib.machinery import SourceFileLoader; ` +
        `m=SourceFileLoader('prs', ${JSON.stringify(SCRIPT)}).load_module(); ` +
        `print(json.dumps(m._wake_reason(json.loads(${JSON.stringify(JSON.stringify(snapshotValue))}), ${settleSeconds})))`,
    ],
    { encoding: "utf8" },
  )
  expect(r.status, r.stderr).toBe(0)
  return JSON.parse(r.stdout.trim())
}

function extractFeedback(view: unknown): any[] {
  const r = spawnSync(
    "python3",
    [
      "-c",
      `import json; from importlib.machinery import SourceFileLoader; ` +
        `m=SourceFileLoader('prs', ${JSON.stringify(SCRIPT)}).load_module(); ` +
        `print(json.dumps(m._extract_feedback(json.loads(${JSON.stringify(JSON.stringify(view))}))))`,
    ],
    { encoding: "utf8" },
  )
  expect(r.status, r.stderr).toBe(0)
  return JSON.parse(r.stdout.trim())
}

function eyesReactionIdentities(pages: unknown): string[] {
  const r = spawnSync(
    "python3",
    [
      "-c",
      `import json; from importlib.machinery import SourceFileLoader; ` +
        `m=SourceFileLoader('prs', ${JSON.stringify(SCRIPT)}).load_module(); ` +
        `print(json.dumps(m._eyes_reaction_identities(json.loads(${JSON.stringify(JSON.stringify(pages))}))))`,
    ],
    { encoding: "utf8" },
  )
  expect(r.status, r.stderr).toBe(0)
  return JSON.parse(r.stdout.trim())
}

function probeBaseIdentity(options: {
  refStatus?: number
  refError?: string
  refOid?: string
  gitStatus?: number
  gitOutput?: string
  gitTimeout?: boolean
  gitOSError?: boolean
  historicalOid?: string
  graphqlOid?: string | null
  headOid?: string
  mergeable?: string
  mergeStateStatus?: string
  mergeCommitOid?: string | null
  parentOids?: string[]
  host?: string
}): { base: any; calls: string[][] } {
  const values = {
    refStatus: 0,
    refError: "not found",
    refOid: "2".repeat(40),
    gitStatus: 1,
    gitOutput: "",
    gitTimeout: false,
    gitOSError: false,
    historicalOid: "1".repeat(40),
    graphqlOid: "2".repeat(40) as string | null,
    headOid: "3".repeat(40),
    mergeable: "MERGEABLE",
    mergeStateStatus: "CLEAN",
    mergeCommitOid: "4".repeat(40) as string | null,
    parentOids: ["2".repeat(40), "3".repeat(40)],
    host: "ghe.acme.test",
    ...options,
  }
  const r = spawnSync("python3", ["-c", `
import json, subprocess
from importlib.machinery import SourceFileLoader
m = SourceFileLoader("prs", ${JSON.stringify(SCRIPT)}).load_module()
values = json.loads(${JSON.stringify(JSON.stringify(values))})
calls = []
class Result: pass
def run(cmd):
    calls.append(cmd)
    result = Result()
    result.returncode = values["refStatus"]
    result.stderr = values["refError"] if result.returncode else ""
    result.stdout = values["refOid"] + "\\n" if result.returncode == 0 else ""
    return result
def run_git(cmd):
    calls.append(cmd)
    if values["gitTimeout"]:
        raise subprocess.TimeoutExpired(cmd, 30)
    if values["gitOSError"]:
        raise FileNotFoundError("git")
    result = Result()
    result.returncode = values["gitStatus"]
    result.stderr = "git ref probe failed" if result.returncode else ""
    result.stdout = values["gitOutput"]
    return result
m._run = run
m._run_git = run_git
potential = None if values["mergeCommitOid"] is None else {
    "oid": values["mergeCommitOid"],
    "parents": {"nodes": [{"oid": oid} for oid in values["parentOids"]]},
}
identity = {
    "baseRefOid": values["historicalOid"],
    "headRefOid": values["headOid"],
    "mergeable": values["mergeable"],
    "mergeStateStatus": values["mergeStateStatus"],
    "baseRef": {"target": {"oid": values["graphqlOid"]}},
    "potentialMergeCommit": potential,
}
base = m.fetch_base_ref("o", "r", "main", identity, values["host"])
print(json.dumps({"base": base, "calls": calls}))
`], { encoding: "utf8" })
  expect(r.status, r.stderr).toBe(0)
  return JSON.parse(r.stdout)
}

function probeAwaitingApproval(response: { status: number; stdout?: string }): number | null {
  const r = spawnSync(
    "python3",
    [
      "-c",
      `import json
from importlib.machinery import SourceFileLoader
m = SourceFileLoader("prs", ${JSON.stringify(SCRIPT)}).load_module()
class Result: pass
result = Result()
result.returncode = ${JSON.stringify(response.status)}
result.stdout = ${JSON.stringify(response.stdout ?? "")}
m._run = lambda _cmd: result
print(json.dumps(m.fetch_awaiting_approval("o", "r", "head")))`,
    ],
    { encoding: "utf8" },
  )
  expect(r.status, r.stderr).toBe(0)
  return JSON.parse(r.stdout.trim())
}

function probeChain(options: {
  pr?: number
  url?: string
  baseRef?: string
  headRef?: string
  stackView: { status: number; stdout?: unknown; stderr?: string }
  graphql: { status: number; stdout?: unknown; stderr?: string }
  defaultBranch?: { status: number; stdout?: unknown; stderr?: string }
  openPrs?: unknown[]
}): { chain: any; calls: string[] } {
  const payload = {
    pr: options.pr ?? 42,
    url: options.url ?? "https://github.com/o/r/pull/42",
    base_ref: options.baseRef ?? "main",
    head_ref: options.headRef ?? "feature",
    stack_view: options.stackView,
    graphql: options.graphql,
    default_branch: options.defaultBranch ?? { status: 0, stdout: "main\n" },
    open_prs: options.openPrs ?? [],
  }
  const python = `
import json
from importlib.machinery import SourceFileLoader

m = SourceFileLoader("prs", ${JSON.stringify(SCRIPT)}).load_module()
p = json.loads(${JSON.stringify(JSON.stringify(payload))})
calls = []

class Result:
    pass

def fake(cmd):
    calls.append(" ".join(cmd))
    if cmd[:4] == ["gh", "stack", "view", "--json"]:
        cfg = p["stack_view"]
    elif cmd[:3] == ["gh", "api", "graphql"]:
        cfg = p["graphql"]
    elif cmd[:2] == ["gh", "api"]:
        cfg = p["default_branch"]
    else:
        cfg = {"status": 0, "stdout": p["open_prs"]}
    result = Result()
    result.returncode = cfg["status"]
    value = cfg.get("stdout")
    result.stdout = value if isinstance(value, str) else json.dumps(value)
    result.stderr = cfg.get("stderr", "")
    return result

m._run = fake
chain = m.fetch_pr_chain(p["pr"], "o/r", p["url"], p["base_ref"], p["head_ref"], "o", "r", None)
print(json.dumps({"chain": chain, "calls": calls}))
`
  const r = spawnSync(
    "python3",
    ["-c", python],
    { encoding: "utf8" },
  )
  expect(r.status, r.stderr).toBe(0)
  return JSON.parse(r.stdout.trim())
}

const CODEX_WRAPPER = `
### 💡 Codex Review

Here are some automated review suggestions for this pull request.

**Reviewed commit:** \`50ffb4dd99\`

<details> <summary>ℹ️ About Codex in GitHub</summary>
<br/>

[Your team has set up Codex to review pull requests in this repo](https://chatgpt.com/codex/cloud/settings/general). Reviews are triggered when you
- Open a pull request for review
- Mark a draft as ready
- Comment "@codex review".

If Codex has suggestions, it will comment; otherwise it will react with 👍.

Codex can also answer questions or update the PR. Try commenting "@codex address that feedback".

</details>`

const FAILING = {
  pr_state: "OPEN",
  mergeable: "MERGEABLE",
  merge_state_status: "BLOCKED",
  review_decision: "REVIEW_REQUIRED",
  head_sha: "s1",
  base: {
    host: "github.com",
    repository: "o/r",
    ref: "main",
    oid: "base-1",
    pr_oid: "base-1",
    freshness: "current",
  },
  url: "http://x/1",
  checks: [{ key: "CI/test", name: "test", status: "COMPLETED", conclusion: "FAILURE", details_url: "u" }],
  threads: [{ thread_id: "T1", last_comment_id: "C1", last_comment_at: "t1" }],
}

function currencyFixture(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const fixture = {
    ...FAILING,
    mergeable: "MERGEABLE",
    merge_state_status: "BEHIND",
    base: {
      host: "github.com",
      repository: "o/r",
      ref: "main",
      oid: "base-1",
      pr_oid: "base-1",
      freshness: "current",
    },
    host_branch_update_capability: true,
    pr_chain: {
      manager_status: "absent",
      manager_source: null,
      relationship_status: "independent",
      default_branch: "main",
      parent_prs: [],
      dependent_prs: [],
    },
    ...overrides,
  }
  if (overrides.base && typeof overrides.base === "object") {
    const base = overrides.base as Record<string, unknown>
    fixture.base = {
      pr_oid: base.oid,
      freshness: "current",
      ...base,
    } as typeof fixture.base
  }
  return fixture
}

function quietCurrencyFixture(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return currencyFixture({
    review_decision: "APPROVED",
    checks: [{ key: "CI/test", name: "test", status: "COMPLETED", conclusion: "SUCCESS", details_url: "u" }],
    threads: [],
    ...overrides,
  })
}

describe("ce-babysit-pr pr-snapshot engine", () => {
  let dir: string
  let state: string
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "prsnap-"))
    state = path.join(dir, "state")
  })

  test("branch currency: complete remote base identity creates one stable normal-base observation", () => {
    const fetch = fetchFile(dir, "currency-stable.json", currencyFixture())
    const first = snapshot(state, fetch)
    const second = snapshot(state, fetch)

    expect(first.branch_currency).toMatchObject({
      disposition: "open",
      route: "normal-base",
      host: "github.com",
      base_repository: "o/r",
      base_ref: "main",
      base_oid: "base-1",
      head_sha: "s1",
      status: "BEHIND",
      host_branch_update_capability: true,
    })
    expect(second.branch_currency.key).toBe(first.branch_currency.key)
    expect(second.branch_currency.disposition).toBe("open")
    expect(second.mergeability_certain).toBe(true)
    expect(second.branch_currency_blocker).toEqual({
      key: second.branch_currency.key,
      disposition: "open",
      recovery_state: null,
    })
  })

  test("branch currency: an old state file gains safe defaults without consuming the unseen item", () => {
    const fetch = fetchFile(dir, "currency-migration.json", currencyFixture())
    snapshot(state, fetch)
    const statePath = path.join(state, "state.json")
    const legacy = JSON.parse(readFileSync(statePath, "utf8"))
    delete legacy.branch_currency_state
    writeFileSync(statePath, JSON.stringify(legacy))

    const migrated = snapshot(state, fetch)
    expect(migrated.branch_currency.disposition).toBe("open")
    const persisted = JSON.parse(readFileSync(statePath, "utf8"))
    expect(persisted.branch_currency_state.current_key).toBe(migrated.branch_currency.key)
  })

  test("branch currency: UNKNOWN mergeability re-polls without creating or consuming an item", () => {
    const uncertain = currencyFixture({
      mergeable: "UNKNOWN",
      merge_state_status: "UNKNOWN",
    })
    const value = snapshot(state, fetchFile(dir, "currency-unknown.json", uncertain))
    expect(value.mergeability_certain).toBe(false)
    expect(value.branch_currency).toBeNull()
    expect(value.branch_currency_blocker).toBeNull()
    const persisted = JSON.parse(readFileSync(path.join(state, "state.json"), "utf8"))
    expect(persisted.branch_currency_state.current_key).toBeNull()
    expect(persisted.branch_currency_state.items).toEqual({})
  })

  test("branch currency: wake precedence favors review and failing CI, while passive checks do not delay maintenance", () => {
    const open = snapshot(state, fetchFile(dir, "currency-wake.json", quietCurrencyFixture({
      checks: [{ key: "CI/test", name: "test", status: "IN_PROGRESS", conclusion: null, details_url: "u" }],
      review_in_progress: true,
    })))
    expect(open.branch_currency.attention).toBe("claim")
    expect(wakeReason(open)).toBe("branch-currency")
    expect(wakeReason({ ...open, counts: { ...open.counts, threads: 1 } })).toBe("actionable")
    expect(wakeReason({
      ...open,
      open_needs_human: 1,
      needs_human_ids: ["parked-review-decision"],
    })).toBe("branch-currency")
    expect(wakeReason({ ...open, blocked_external: true })).toBe("branch-currency")
    expect(wakeReason({
      ...open,
      counts: { ...open.counts, ci: 0 },
      has_failing_checks: true,
      checks_terminal: true,
    })).toBe("blocked-failing")
  }, 15000)

  test("branch currency: claim re-entry reconciles, permits one proven-no-mutation retry, and never retries ambiguity", () => {
    const fetch = fetchFile(dir, "currency-lifecycle.json", quietCurrencyFixture())
    const first = snapshot(state, fetch)
    markCurrency(state, first.branch_currency.key, "claimed")

    const sameInvocation = snapshot(state, fetch)
    expect(sameInvocation.branch_currency).toMatchObject({
      disposition: "claimed",
      attention: null,
      retry_count: 0,
      mutation_consumed: false,
    })

    const resumed = snapshot(state, fetch, ["--start-invocation",
      "--invocation-budget-seconds", ORDINARY_TEST_BUDGET_SECONDS])
    expect(resumed.branch_currency.attention).toBe("reconcile")
    expect(wakeReason(resumed)).toBe("branch-currency")

    markCurrencyOutcome(state, resumed.branch_currency.key, "proven-no-mutation")
    const backingOff = snapshot(state, fetch)
    expect(backingOff.branch_currency).toMatchObject({
      disposition: "open",
      attention: null,
      retry_count: 1,
      recovery_state: "retry-authorized",
    })
    expect(backingOff.branch_currency.retry_wait_seconds).toBeGreaterThan(0)
    const earlyRetry = spawnSync("python3", [SCRIPT, "mark", "--state-dir", state,
      ...persistedInvocationArgs(state), "--currency-key", backingOff.branch_currency.key,
      "--currency-disposition", "claimed"], { encoding: "utf8" })
    expect(earlyRetry.status).not.toBe(0)

    const statePath = path.join(state, "state.json")
    const afterBackoff = JSON.parse(readFileSync(statePath, "utf8"))
    afterBackoff.branch_currency_state.items[backingOff.branch_currency.key].retry_not_before = "2000-01-01T00:00:00Z"
    writeFileSync(statePath, JSON.stringify(afterBackoff))
    const retry = snapshot(state, fetch)
    expect(retry.branch_currency.attention).toBe("claim")

    markCurrency(state, retry.branch_currency.key, "claimed")
    markCurrencyOutcome(state, retry.branch_currency.key, "proven-no-mutation")
    const exhausted = snapshot(state, fetch)
    expect(exhausted.branch_currency).toMatchObject({
      disposition: "needs-human",
      attention: null,
      retry_count: 1,
      recovery_state: "retry-exhausted",
    })

    const ambiguousState = path.join(dir, "currency-ambiguous")
    const ambiguous = snapshot(ambiguousState, fetch)
    markCurrency(ambiguousState, ambiguous.branch_currency.key, "claimed")
    markCurrencyOutcome(ambiguousState, ambiguous.branch_currency.key, "ambiguous")
    expect(snapshot(ambiguousState, fetch).branch_currency).toMatchObject({
      disposition: "claimed",
      attention: null,
      recovery_state: "ambiguous",
      mutation_consumed: false,
    })
    const ambiguousResume = snapshot(ambiguousState, fetch, ["--start-invocation",
      "--invocation-budget-seconds", ORDINARY_TEST_BUDGET_SECONDS])
    expect(ambiguousResume.branch_currency.attention).toBe("reconcile")
    markCurrency(ambiguousState, ambiguous.branch_currency.key, "claimed")
    const persisted = JSON.parse(readFileSync(path.join(ambiguousState, "state.json"), "utf8"))
    expect(persisted.branch_currency_state.items[ambiguous.branch_currency.key].recovery_state).toBe("ambiguous")
  }, 20000)

  test("branch currency: mutation observation consumes the attempt and remains reconciliation-only", () => {
    const fetch = fetchFile(dir, "currency-consumed.json", quietCurrencyFixture())
    const observed = snapshot(state, fetch)
    markCurrency(state, observed.branch_currency.key, "claimed")
    markCurrencyOutcome(state, observed.branch_currency.key, "mutation-observed")
    const current = snapshot(state, fetch)
    expect(current.branch_currency).toMatchObject({
      disposition: "claimed",
      attention: null,
      mutation_consumed: true,
      recovery_state: "mutation-observed",
    })
    expect(wakeReason({
      ...current,
      mergeable: "MERGEABLE",
      merge_state_status: "CLEAN",
      checks_terminal: true,
      has_failing_checks: false,
      review_in_progress: false,
      quiet_seconds: 2000,
    }, 0)).toBeNull()

    const invalidRetry = spawnSync("python3", [SCRIPT, "mark", "--state-dir", state,
      ...persistedInvocationArgs(state), "--currency-key", observed.branch_currency.key,
      "--currency-outcome", "proven-no-mutation"], { encoding: "utf8" })
    expect(invalidRetry.status).not.toBe(0)

    const directReopen = spawnSync("python3", [SCRIPT, "mark", "--state-dir", state,
      ...persistedInvocationArgs(state), "--currency-key", observed.branch_currency.key,
      "--currency-disposition", "open"], { encoding: "utf8" })
    expect(directReopen.status).not.toBe(0)
    expect(snapshot(state, fetch).branch_currency).toMatchObject({
      disposition: "claimed",
      mutation_consumed: true,
      recovery_state: "mutation-observed",
    })

    const resumed = snapshot(state, fetch, ["--start-invocation",
      "--invocation-budget-seconds", ORDINARY_TEST_BUDGET_SECONDS])
    expect(resumed.branch_currency.attention).toBe("reconcile")
  }, 20000)

  test("branch currency: async evidence movement re-wakes a same-invocation mutation claim once", () => {
    const behind = fetchFile(dir, "currency-async-mutation-behind.json", quietCurrencyFixture())
    const observed = snapshot(state, behind)
    markCurrency(state, observed.branch_currency.key, "claimed")
    markCurrencyOutcome(state, observed.branch_currency.key, "mutation-observed")

    const unchanged = snapshot(state, behind)
    expect(unchanged.branch_currency).toMatchObject({
      key: observed.branch_currency.key,
      disposition: "claimed",
      attention: null,
      reconciliation_only: true,
    })

    const updated = fetchFile(dir, "currency-async-mutation-clean.json", quietCurrencyFixture({
      head_sha: "s2",
      mergeable: "MERGEABLE",
      merge_state_status: "CLEAN",
    }))
    const moved = snapshot(state, updated)
    expect(moved.branch_currency).toMatchObject({
      key: observed.branch_currency.key,
      disposition: "claimed",
      attention: "reconcile",
      reconciliation_only: true,
      mutation_consumed: true,
    })
    expect(wakeReason(moved)).toBe("branch-currency")

    markCurrency(state, observed.branch_currency.key, "confirmed")
    const confirmed = snapshot(state, updated)
    expect(confirmed.branch_currency).toBeNull()
    expect(confirmed.branch_currency_blocker).toBeNull()
    expect(wakeReason({ ...confirmed, quiet_seconds: 0 }, 300)).toBeNull()
  }, 15000)

  test("branch currency: async evidence movement also re-wakes an ambiguous same-invocation claim", () => {
    const behind = fetchFile(dir, "currency-async-ambiguous-behind.json", quietCurrencyFixture())
    const observed = snapshot(state, behind)
    markCurrency(state, observed.branch_currency.key, "claimed")
    markCurrencyOutcome(state, observed.branch_currency.key, "ambiguous")

    expect(snapshot(state, behind).branch_currency.attention).toBeNull()

    const moved = snapshot(state, fetchFile(dir, "currency-async-ambiguous-clean.json", quietCurrencyFixture({
      head_sha: "s2",
      mergeable: "MERGEABLE",
      merge_state_status: "CLEAN",
    })))
    expect(moved.branch_currency).toMatchObject({
      key: observed.branch_currency.key,
      disposition: "claimed",
      attention: "reconcile",
      recovery_state: "ambiguous",
      reconciliation_only: true,
    })
    expect(wakeReason(moved)).toBe("branch-currency")
  }, 15000)

  test("branch currency: a BEHIND capability park reopens when the same observation becomes updateable", () => {
    for (const capability of [false, "unknown"] as const) {
      const capabilityState = path.join(dir, `currency-capability-${capability}`)
      const unavailable = fetchFile(dir, `currency-capability-${capability}-off.json`, quietCurrencyFixture({
        host_branch_update_capability: capability,
      }))
      const observed = snapshot(capabilityState, unavailable)
      markCurrency(capabilityState, observed.branch_currency.key, "needs-human")
      expect(snapshot(capabilityState, unavailable).branch_currency).toMatchObject({
        disposition: "needs-human",
        attention: null,
      })

      const enabled = snapshot(capabilityState, fetchFile(dir, `currency-capability-${capability}-on.json`, quietCurrencyFixture({
        host_branch_update_capability: true,
      })))
      expect(enabled.branch_currency).toMatchObject({
        key: observed.branch_currency.key,
        disposition: "open",
        attention: "claim",
        host_branch_update_capability: true,
      })
      expect(wakeReason(enabled)).toBe("branch-currency")
    }
  }, 15000)

  test("branch currency: standing confirmed and needs-human residuals stay quiet, and max-runtime outranks new work", () => {
    const fetch = fetchFile(dir, "currency-standing.json", quietCurrencyFixture())
    for (const disposition of ["confirmed", "needs-human"]) {
      const residualState = path.join(dir, `currency-standing-${disposition}`)
      const observed = snapshot(residualState, fetch)
      markCurrency(residualState, observed.branch_currency.key, "claimed")
      markCurrency(residualState, observed.branch_currency.key, disposition,
        disposition === "needs-human" ? "semantic-v1" : undefined)
      const residualPath = path.join(residualState, "state.json")
      const expiredResidual = JSON.parse(readFileSync(residualPath, "utf8"))
      expiredResidual.started_at = "2000-01-01T00:00:00Z"
      expiredResidual.invocation_budget_seconds = 1
      writeFileSync(residualPath, JSON.stringify(expiredResidual))
      expect(watch(residualState, fetch).reason).toBe("max-runtime")
    }

    const budgetState = path.join(dir, "currency-budget")
    snapshot(budgetState, fetch)
    const statePath = path.join(budgetState, "state.json")
    const expired = JSON.parse(readFileSync(statePath, "utf8"))
    expired.started_at = "2000-01-01T00:00:00Z"
    expired.invocation_budget_seconds = 1
    writeFileSync(statePath, JSON.stringify(expired))
    expect(watch(budgetState, fetch).reason).toBe("max-runtime")
    const lateClaim = spawnSync("python3", [SCRIPT, "mark", "--state-dir", budgetState,
      ...persistedInvocationArgs(budgetState), "--currency-key",
      expired.branch_currency_state.current_key, "--currency-disposition", "claimed"],
    { encoding: "utf8" })
    expect(lateClaim.status).not.toBe(0)
  }, 20000)

  // Active-watch-capability budget: the 8h cap is spent in active time, not raw wall-clock.
  // A suspended machine (laptop asleep) is excluded; the 3-day backstop stays wall-clock.
  const FAILING_ACTIONABLE = {
    pr_state: "OPEN", mergeable: "MERGEABLE", merge_state_status: "UNSTABLE", review_decision: null,
    head_sha: "h1", url: "https://github.com/o/r/pull/1", threads: [],
    checks: [{ key: "CI/test", name: "test", status: "COMPLETED", conclusion: "FAILURE", details_url: "u" }],
    feedback: [], awaiting_approval: 0,
  }
  const isoAgo = (seconds: number) =>
    new Date(Date.now() - seconds * 1000).toISOString().replace(/\.\d+Z$/, "Z")
  function patchState(stateDir: string, patch: Record<string, unknown>): void {
    const p = path.join(stateDir, "state.json")
    writeFileSync(p, JSON.stringify({ ...JSON.parse(readFileSync(p, "utf8")), ...patch }))
  }
  function readState(stateDir: string): any {
    return JSON.parse(readFileSync(path.join(stateDir, "state.json"), "utf8"))
  }

  test("active-time budget: a suspended span (stale activity heartbeat) is excluded from the 8h cap", () => {
    // Covers AE1. started_at and last_activity both ~6h stale (machine was suspended), budget 8h.
    const fetch = fetchFile(dir, "active-suspend.json", FAILING_ACTIONABLE)
    snapshot(state, fetch)
    patchState(state, { started_at: isoAgo(6 * 3600), last_activity_at: isoAgo(6 * 3600),
      dead_time_seconds: 0 })
    // The watch arms, measures the ~6h activity gap, charges it to dead time, and does NOT max-runtime.
    expect(watch(state, fetch).reason).toBe("actionable")
    const after = readState(state)
    // ~6h minus the 15-min threshold is charged to dead time (excluded from the active budget).
    expect(after.dead_time_seconds).toBeGreaterThan(6 * 3600 - 15 * 60 - 60)
    expect(after.dead_time_seconds).toBeLessThan(6 * 3600)
  }, 20000)

  test("active-time budget: steady sub-threshold polling accrues no dead time", () => {
    // Covers AE2. A recent heartbeat (well under the 15-min threshold) never registers as suspend.
    const fetch = fetchFile(dir, "active-steady.json", FAILING_ACTIONABLE)
    snapshot(state, fetch)
    patchState(state, { started_at: isoAgo(2 * 3600), last_activity_at: isoAgo(30),
      dead_time_seconds: 0 })
    expect(watch(state, fetch).reason).toBe("actionable")
    expect(readState(state).dead_time_seconds).toBe(0)
  }, 20000)

  test("3-day backstop: raw wall-clock expiry fires even when active elapsed is ~0", () => {
    // Covers AE4. started_at 4 days ago, dead_time ~4 days (active ~0), heartbeat fresh so the poll
    // adds nothing. The 8h active cap is nowhere near hit, but the wall-clock backstop terminates.
    const fetch = fetchFile(dir, "backstop.json", FAILING_ACTIONABLE)
    snapshot(state, fetch)
    patchState(state, { started_at: isoAgo(4 * 86400), last_activity_at: isoAgo(10),
      dead_time_seconds: 4 * 86400 })
    const wake = watch(state, fetch)
    expect(wake.reason).toBe("max-runtime")
    expect(wake.max_runtime_ceiling).toBe("backstop")
  }, 20000)

  test("active cap: active elapsed past the 8h budget fires max-runtime with the active-budget ceiling", () => {
    // started_at 9h ago, no dead time, wall-clock < 3-day backstop -> the active budget is the ceiling.
    const fetch = fetchFile(dir, "active-cap.json", FAILING_ACTIONABLE)
    snapshot(state, fetch)
    patchState(state, { started_at: isoAgo(9 * 3600), last_activity_at: isoAgo(10),
      dead_time_seconds: 0 })
    const wake = watch(state, fetch)
    expect(wake.reason).toBe("max-runtime")
    expect(wake.max_runtime_ceiling).toBe("active-budget")
  }, 20000)

  test("legacy state without active-time fields migrates on load", () => {
    // Covers U1. A pre-existing state file lacking the new fields gains them with safe defaults.
    const fetch = fetchFile(dir, "migrate.json", quietCurrencyFixture())
    snapshot(state, fetch)
    const legacy = readState(state)
    delete legacy.last_activity_at
    delete legacy.dead_time_seconds
    delete legacy.invocation_backstop_seconds
    writeFileSync(path.join(state, "state.json"), JSON.stringify(legacy))
    snapshot(state, fetch)
    const migrated = readState(state)
    expect(migrated.dead_time_seconds).toBe(0)
    expect(migrated.last_activity_at).toBeTruthy()
    expect(migrated.invocation_backstop_seconds).toBe(3 * 24 * 60 * 60)
  }, 20000)

  test("legacy migration does not refund pre-migration time: an expired old invocation still max-runtimes", () => {
    // Regression (Cursor/Codex): seeding last_activity to the OLD started_at made the first poll
    // charge the whole historical invocation as one suspend gap, so a 9h-old 8h run read as ~15 min
    // active and never expired. Seeding to load time keeps it on wall-clock -> it must still expire.
    const fetch = fetchFile(dir, "legacy-expire.json", FAILING_ACTIONABLE)
    snapshot(state, fetch)
    const legacy = readState(state)
    legacy.started_at = isoAgo(9 * 3600)
    legacy.invocation_budget_seconds = 8 * 3600
    delete legacy.last_activity_at
    delete legacy.dead_time_seconds
    delete legacy.invocation_backstop_seconds
    writeFileSync(path.join(state, "state.json"), JSON.stringify(legacy))
    const wake = watch(state, fetch)
    expect(wake.reason).toBe("max-runtime")
    expect(wake.max_runtime_ceiling).toBe("active-budget")
    // The historical span was not laundered into dead time.
    expect(readState(state).dead_time_seconds).toBe(0)
  }, 20000)

  test("re-arm preserves accumulated dead time and the backstop (no reset, no extend)", () => {
    // Covers AE5. A continue-invocation re-arm keeps the accumulated dead time rather than resetting.
    const fetch = fetchFile(dir, "rearm.json", quietCurrencyFixture())
    snapshot(state, fetch)
    patchState(state, { dead_time_seconds: 1234, last_activity_at: isoAgo(10) })
    const inv = persistedInvocationArgs(state)
    const r = spawnSync("python3", [SCRIPT, "snapshot", "--pr", "1", "--repo", "o/r",
      "--state-dir", state, "--fetch-file", fetch, "--continue-invocation", ...inv],
      { encoding: "utf8" })
    expect(r.status, r.stderr).toBe(0)
    const after = readState(state)
    expect(after.dead_time_seconds).toBe(1234)
    expect(after.invocation_backstop_seconds).toBe(3 * 24 * 60 * 60)
  }, 20000)

  test("checkpoint mode: an agent snapshot with a stale heartbeat never accumulates dead time", () => {
    // KTD4 scope guard: only the in-session watch (watch_generation) accumulates. A plain agent
    // snapshot bumps the heartbeat with accumulate=False, so checkpoint/durable runs stay wall-clock.
    const fetch = fetchFile(dir, "checkpoint.json", quietCurrencyFixture())
    snapshot(state, fetch)
    patchState(state, { started_at: isoAgo(6 * 3600), last_activity_at: isoAgo(6 * 3600),
      dead_time_seconds: 0 })
    const observed = snapshot(state, fetch) // plain (non-watch) agent snapshot
    expect(readState(state).dead_time_seconds).toBe(0)
    // Wall-clock retained: elapsed reflects the full ~6h with nothing refunded.
    expect(observed.invocation_elapsed_seconds).toBeGreaterThan(6 * 3600 - 120)
  }, 20000)

  test("an agent mark bumps the activity heartbeat without accumulating dead time", () => {
    // A long tick that only marks keeps the heartbeat fresh, so the next watch poll charges nothing.
    const fetch = fetchFile(dir, "markbump.json", FAILING_ACTIONABLE)
    snapshot(state, fetch)
    patchState(state, { last_activity_at: isoAgo(6 * 3600), dead_time_seconds: 0 })
    mark(state, ["--check", "CI/test"])
    const after = readState(state)
    expect(after.dead_time_seconds).toBe(0)
    expect(new Date(after.last_activity_at).getTime()).toBeGreaterThan(Date.now() - 60 * 1000)
  }, 20000)

  test("clock-backward safety: a future heartbeat/anchor never produces negative accounting", () => {
    const fetch = fetchFile(dir, "clockback.json", FAILING_ACTIONABLE)
    snapshot(state, fetch)
    patchState(state, { started_at: new Date(Date.now() + 3600 * 1000).toISOString(),
      last_activity_at: new Date(Date.now() + 3600 * 1000).toISOString(), dead_time_seconds: 0 })
    const wake = watch(state, fetch)
    expect(wake.reason).not.toBe("max-runtime")
    const after = readState(state)
    expect(after.dead_time_seconds).toBeGreaterThanOrEqual(0)
  }, 20000)

  test("continue-invocation adopting a new id into a used state dir resets the active-time clock", () => {
    // Regression: adopting a fresh invocation must not inherit a prior invocation's dead time.
    const fetch = fetchFile(dir, "adopt.json", quietCurrencyFixture())
    snapshot(state, fetch)
    patchState(state, { dead_time_seconds: 5000, last_activity_at: isoAgo(6 * 3600) })
    const prior = readState(state)
    const r = spawnSync("python3", [SCRIPT, "snapshot", "--pr", "1", "--repo", "o/r",
      "--state-dir", state, "--fetch-file", fetch, "--continue-invocation",
      "--invocation-id", "adopted-new-id", "--session-started-at", prior.started_at,
      "--invocation-budget-seconds", String(prior.invocation_budget_seconds)],
      { encoding: "utf8" })
    expect(r.status, r.stderr).toBe(0)
    const after = readState(state)
    expect(after.invocation_id).toBe("adopted-new-id")
    expect(after.dead_time_seconds).toBe(0)
  }, 20000)

  test("managed-stack continuation carries accumulated dead time to the next layer's state dir", () => {
    // Codex P2: the shared active-time budget spans stack layers, but dead time is per-state-dir.
    // --continue-dead-time-seconds threads the prior layer's excluded-suspend total into the new
    // layer so it is not re-counted as active. Absent the arg, an adopt still resets to 0.
    const fetch = fetchFile(dir, "stack-carry.json", quietCurrencyFixture())
    snapshot(state, fetch)
    const prior = readState(state)
    const cont = (stateDir: string, extra: string[]) => spawnSync("python3",
      [SCRIPT, "snapshot", "--pr", "1", "--repo", "o/r", "--state-dir", stateDir, "--fetch-file", fetch,
        "--continue-invocation", "--invocation-id", prior.invocation_id,
        "--session-started-at", prior.started_at,
        "--invocation-budget-seconds", String(prior.invocation_budget_seconds), ...extra],
      { encoding: "utf8" })
    const layer2 = path.join(dir, "layer2")
    const r = cont(layer2, ["--continue-dead-time-seconds", "4200"])
    expect(r.status, r.stderr).toBe(0)
    expect(readState(layer2).dead_time_seconds).toBe(4200)
    const layer3 = path.join(dir, "layer3")
    const r2 = cont(layer3, [])
    expect(r2.status, r2.stderr).toBe(0)
    expect(readState(layer3).dead_time_seconds).toBe(0)
  }, 20000)

  test("carry arg on a same-id re-continue raises the dead-time floor without clobbering accumulation", () => {
    // Bugbot: the carry must be honored on a later same-id re-continue (early-return path), not only
    // the first adopt. It sets a monotonic floor — raises 0 to the carry, never lowers a larger value.
    const fetch = fetchFile(dir, "recont.json", quietCurrencyFixture())
    snapshot(state, fetch)
    const prior = readState(state)
    const layer = path.join(dir, "recont-layer")
    const cont = (extra: string[]) => spawnSync("python3",
      [SCRIPT, "snapshot", "--pr", "1", "--repo", "o/r", "--state-dir", layer, "--fetch-file", fetch,
        "--continue-invocation", "--invocation-id", prior.invocation_id,
        "--session-started-at", prior.started_at,
        "--invocation-budget-seconds", String(prior.invocation_budget_seconds), ...extra],
      { encoding: "utf8" })
    expect(cont([]).status).toBe(0) // first continue (adopt), no carry -> 0
    expect(readState(layer).dead_time_seconds).toBe(0)
    expect(cont(["--continue-dead-time-seconds", "3000"]).status).toBe(0) // re-continue raises floor
    expect(readState(layer).dead_time_seconds).toBe(3000)
    expect(cont(["--continue-dead-time-seconds", "1000"]).status).toBe(0) // lower carry never clobbers
    expect(readState(layer).dead_time_seconds).toBe(3000)
  }, 20000)

  test("branch currency: a carried semantic park wakes only for inspection and unchanged evidence stays parked", () => {
    const dirty = quietCurrencyFixture({ mergeable: "CONFLICTING", merge_state_status: "DIRTY" })
    const original = snapshot(state, fetchFile(dir, "currency-inspect-1.json", dirty))
    markCurrency(state, original.branch_currency.key, "claimed")
    markCurrency(state, original.branch_currency.key, "needs-human", "conflict-v1")

    const moved = snapshot(state, fetchFile(dir, "currency-inspect-2.json", quietCurrencyFixture({
      mergeable: "CONFLICTING",
      merge_state_status: "DIRTY",
      base: { host: "github.com", repository: "o/r", ref: "main", oid: "base-2" },
    })))
    expect(moved.branch_currency.attention).toBe("inspect")
    expect(wakeReason(moved)).toBe("branch-currency")

    const prematureClaim = spawnSync("python3", [SCRIPT, "mark", "--state-dir", state,
      ...persistedInvocationArgs(state), "--currency-key", moved.branch_currency.key,
      "--currency-disposition", "claimed"], { encoding: "utf8" })
    expect(prematureClaim.status).not.toBe(0)

    markCurrencyInspection(state, moved.branch_currency.key, "conflict-v1")
    expect(snapshot(state, fetchFile(dir, "currency-inspect-same.json", quietCurrencyFixture({
      mergeable: "CONFLICTING",
      merge_state_status: "DIRTY",
      base: { host: "github.com", repository: "o/r", ref: "main", oid: "base-2" },
    }))).branch_currency).toMatchObject({
      disposition: "needs-human",
      attention: null,
      recovery_state: "semantic-unchanged",
    })

    const changed = snapshot(state, fetchFile(dir, "currency-inspect-3.json", quietCurrencyFixture({
      mergeable: "CONFLICTING",
      merge_state_status: "DIRTY",
      base: { host: "github.com", repository: "o/r", ref: "main", oid: "base-3" },
    })))
    expect(changed.branch_currency.attention).toBe("inspect")
    markCurrencyInspection(state, changed.branch_currency.key, "conflict-v2")
    expect(snapshot(state, fetchFile(dir, "currency-inspect-changed.json", quietCurrencyFixture({
      mergeable: "CONFLICTING",
      merge_state_status: "DIRTY",
      base: { host: "github.com", repository: "o/r", ref: "main", oid: "base-3" },
    }))).branch_currency).toMatchObject({
      disposition: "open",
      attention: "claim",
      inspection_result: "changed",
    })
    const persisted = JSON.parse(readFileSync(path.join(state, "state.json"), "utf8"))
    expect(persisted.branch_currency_state.semantic_parks).toEqual({})

    const nextBase = snapshot(state, fetchFile(dir, "currency-inspect-4.json", quietCurrencyFixture({
      mergeable: "CONFLICTING",
      merge_state_status: "DIRTY",
      base: { host: "github.com", repository: "o/r", ref: "main", oid: "base-4" },
    })))
    expect(nextBase.branch_currency).toMatchObject({
      disposition: "open",
      attention: "claim",
      parked_semantic_fingerprints: [],
    })
  }, 20000)

  test("branch currency: unresolved claims survive base and expected head movement until reconciled", () => {
    const first = snapshot(state, fetchFile(dir, "currency-key-1.json", currencyFixture()))
    markCurrency(state, first.branch_currency.key, "claimed")
    expect(snapshot(state, fetchFile(dir, "currency-key-1b.json", currencyFixture())).branch_currency.disposition).toBe("claimed")

    const movedWhileClaimed = snapshot(state, fetchFile(dir, "currency-key-2.json", currencyFixture({
      base: { host: "github.com", repository: "o/r", ref: "main", oid: "base-2" },
    })))
    expect(movedWhileClaimed.branch_currency).toMatchObject({
      key: first.branch_currency.key,
      disposition: "claimed",
      reconciliation_only: true,
    })
    expect(movedWhileClaimed.branch_currency_blocker.key).toBe(first.branch_currency.key)

    const resumed = snapshot(state, fetchFile(dir, "currency-key-2-resumed.json", currencyFixture({
      base: { host: "github.com", repository: "o/r", ref: "main", oid: "base-2" },
    })), ["--start-invocation", "--invocation-budget-seconds", ORDINARY_TEST_BUDGET_SECONDS])
    expect(resumed.branch_currency.attention).toBe("reconcile")
    markCurrencyOutcome(state, first.branch_currency.key, "proven-no-mutation")
    const statePath = path.join(state, "state.json")
    const retryState = JSON.parse(readFileSync(statePath, "utf8"))
    retryState.branch_currency_state.items[first.branch_currency.key].retry_not_before = "2000-01-01T00:00:00Z"
    writeFileSync(statePath, JSON.stringify(retryState))

    const movedBase = snapshot(state, fetchFile(dir, "currency-key-2-open.json", currencyFixture({
      base: { host: "github.com", repository: "o/r", ref: "main", oid: "base-2" },
    })))
    expect(movedBase.branch_currency.key).not.toBe(first.branch_currency.key)
    expect(movedBase.branch_currency.disposition).toBe("open")
    markCurrency(state, movedBase.branch_currency.key, "claimed")
    markCurrencyOutcome(state, movedBase.branch_currency.key, "mutation-observed")

    const movedHead = snapshot(state, fetchFile(dir, "currency-key-3.json", currencyFixture({
      head_sha: "s2",
      mergeable: "MERGEABLE",
      merge_state_status: "CLEAN",
      base: { host: "github.com", repository: "o/r", ref: "main", oid: "base-2" },
    })))
    expect(movedHead.branch_currency).toMatchObject({
      key: movedBase.branch_currency.key,
      disposition: "claimed",
      mutation_consumed: true,
      reconciliation_only: true,
    })
    expect(movedHead.branch_currency_blocker.key).toBe(movedBase.branch_currency.key)
    markCurrency(state, movedBase.branch_currency.key, "confirmed")
    const confirmed = snapshot(state, fetchFile(dir, "currency-key-3-confirmed.json", currencyFixture({
      head_sha: "s2",
      mergeable: "MERGEABLE",
      merge_state_status: "CLEAN",
      base: { host: "github.com", repository: "o/r", ref: "main", oid: "base-2" },
    })))
    expect(confirmed.branch_currency).toBeNull()
    expect(confirmed.branch_currency_blocker).toBeNull()
    const persisted = JSON.parse(readFileSync(path.join(state, "state.json"), "utf8"))
    expect(persisted.branch_currency_state.current_key).toBeNull()
  }, 20000)

  test("branch currency: invocation-fenced transitions preserve an unchanged semantic park", () => {
    const observed = snapshot(state, fetchFile(dir, "currency-park.json", currencyFixture({
      mergeable: "CONFLICTING",
      merge_state_status: "DIRTY",
    })))
    markCurrency(state, observed.branch_currency.key, "claimed")
    markCurrency(state, observed.branch_currency.key, "needs-human", "conflict-v1")
    const parked = snapshot(state, fetchFile(dir, "currency-park-again.json", currencyFixture({
      mergeable: "CONFLICTING",
      merge_state_status: "DIRTY",
    })))
    expect(parked.branch_currency).toMatchObject({
      key: observed.branch_currency.key,
      disposition: "needs-human",
      semantic_conflict_fingerprint: "conflict-v1",
    })

    const stale = spawnSync("python3", [SCRIPT, "mark", "--state-dir", state,
      "--invocation-id", "stale", "--session-started-at", parked.invocation_started_at,
      "--invocation-budget-seconds", String(parked.invocation_budget_seconds),
      "--currency-key", observed.branch_currency.key, "--currency-disposition", "open"],
    { encoding: "utf8" })
    expect(stale.status).not.toBe(0)
    const stillParked = snapshot(state, fetchFile(dir, "currency-park-still.json", currencyFixture({
      mergeable: "CONFLICTING",
      merge_state_status: "DIRTY",
    })))
    expect(stillParked.branch_currency.disposition).toBe("needs-human")
    markCurrency(state, stillParked.branch_currency.key, "open")
    expect(snapshot(state, fetchFile(dir, "currency-park-reopened.json", currencyFixture({
      mergeable: "CONFLICTING",
      merge_state_status: "DIRTY",
    }))).branch_currency.disposition).toBe("open")
  }, 15000)

  test("branch currency: base-only movement retains the semantic park for later inspection", () => {
    const dirty = currencyFixture({ mergeable: "CONFLICTING", merge_state_status: "DIRTY" })
    const parkedObservation = snapshot(state, fetchFile(dir, "currency-park-base-1.json", dirty))
    markCurrency(state, parkedObservation.branch_currency.key, "claimed")
    markCurrency(state, parkedObservation.branch_currency.key, "needs-human", "conflict-v1")

    const moved = snapshot(state, fetchFile(dir, "currency-park-base-2.json", currencyFixture({
      mergeable: "CONFLICTING",
      merge_state_status: "DIRTY",
      base: { host: "github.com", repository: "o/r", ref: "main", oid: "base-2" },
    })))
    expect(moved.branch_currency.key).not.toBe(parkedObservation.branch_currency.key)
    expect(moved.branch_currency.disposition).toBe("open")
    expect(moved.branch_currency.parked_semantic_fingerprints).toEqual(["conflict-v1"])

    const persisted = JSON.parse(readFileSync(path.join(state, "state.json"), "utf8"))
    expect(persisted.branch_currency_state.semantic_parks["conflict-v1"]).toMatchObject({
      head_sha: "s1",
      status: "DIRTY",
      route: "normal-base",
      observation_key: parkedObservation.branch_currency.key,
    })
    expect(persisted.branch_currency_state.semantic_parks["conflict-v1"]).not.toHaveProperty("base_oid")
    expect(persisted.branch_currency_state.items[parkedObservation.branch_currency.key].disposition).toBe("needs-human")
  }, 15000)

  test("branch currency: a carried DIRTY semantic park does not divert a later BEHIND update into inspection", () => {
    const dirty = currencyFixture({ mergeable: "CONFLICTING", merge_state_status: "DIRTY" })
    const parkedObservation = snapshot(state, fetchFile(dir, "currency-dirty-to-behind-1.json", dirty))
    markCurrency(state, parkedObservation.branch_currency.key, "claimed")
    markCurrency(state, parkedObservation.branch_currency.key, "needs-human", "conflict-v1")

    const behind = snapshot(state, fetchFile(dir, "currency-dirty-to-behind-2.json", currencyFixture({
      base: { host: "github.com", repository: "o/r", ref: "main", oid: "base-2" },
    })))
    expect(behind.branch_currency).toMatchObject({
      status: "BEHIND",
      disposition: "open",
      attention: "claim",
      inspection_required: false,
      parked_semantic_fingerprints: ["conflict-v1"],
    })

    markCurrency(state, behind.branch_currency.key, "claimed")
    const persisted = JSON.parse(readFileSync(path.join(state, "state.json"), "utf8"))
    expect(persisted.branch_currency_state.semantic_parks).toHaveProperty("conflict-v1")
  }, 15000)

  test("branch currency: dependents do not block a normal-base root, but managed, open-parent, and uncertain routes do", () => {
    const dependentRoot = snapshot(path.join(dir, "currency-dependent-root"), fetchFile(dir, "currency-dependent-root.json", currencyFixture({
      pr_chain: {
        manager_status: "absent",
        relationship_status: "dependent",
        default_branch: "main",
        parent_prs: [],
        dependent_prs: [{ number: 2, state: "OPEN", baseRefName: "feature", headRefName: "child" }],
      },
    })))
    expect(dependentRoot.branch_currency.route).toBe("normal-base")

    const exclusions = [
      { manager_status: "confirmed", relationship_status: "independent", default_branch: "main", parent_prs: [], dependent_prs: [] },
      { manager_status: "absent", relationship_status: "dependent", default_branch: "main", parent_prs: [{ number: 3, state: "OPEN" }], dependent_prs: [] },
      { manager_status: "probe-error", relationship_status: "independent", default_branch: "main", parent_prs: [], dependent_prs: [] },
      { manager_status: "absent", relationship_status: "probe-error", default_branch: "main", parent_prs: [], dependent_prs: [] },
      { manager_status: "absent", relationship_status: "independent", default_branch: null, parent_prs: [], dependent_prs: [] },
    ]
    for (const [index, prChain] of exclusions.entries()) {
      const value = snapshot(path.join(dir, `currency-excluded-${index}`), fetchFile(dir, `currency-excluded-${index}.json`, currencyFixture({ pr_chain: prChain })))
      expect(value.branch_currency).toBeNull()
    }
  }, 15000)

  test("live fetch binds mergeability to GraphQL base/head parents plus the host-qualified exact ref", () => {
    const python = `
import json
from importlib.machinery import SourceFileLoader
m = SourceFileLoader("prs", ${JSON.stringify(SCRIPT)}).load_module()
calls = []
historical_oid = "1111111111111111111111111111111111111111"
reported_base_oid = "2222222222222222222222222222222222222222"
current_base_oid = reported_base_oid
head_oid = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
identity_head_oid = head_oid
identity_base_ref = "main"
ref_probe_status = 0
class Result: pass
def checked(cmd, label):
    calls.append(cmd)
    result = Result()
    result.returncode = 0
    result.stderr = ""
    result.stdout = json.dumps({
        "state": "OPEN", "mergeable": "MERGEABLE", "mergeStateStatus": "BEHIND",
        "reviewDecision": "APPROVED", "headRefOid": head_oid,
        "baseRefOid": historical_oid,
        "baseRefName": "main", "headRefName": "feature", "number": 7,
        "url": "https://ghe.acme.test/o/r/pull/7", "statusCheckRollup": [],
        "author": {"login": "author"}, "comments": [], "reviews": []})
    return result
def run(cmd):
    calls.append(cmd)
    result = Result()
    if "graphql" in cmd:
        result.returncode = 0
        result.stderr = ""
        result.stdout = json.dumps({"data": {"repository": {"pullRequest": {
            "mergeable": "MERGEABLE", "mergeStateStatus": "BEHIND",
            "headRefOid": identity_head_oid, "baseRefOid": historical_oid,
            "baseRefName": identity_base_ref,
            "viewerCanUpdateBranch": True,
            "baseRef": {"target": {"oid": reported_base_oid}},
            "potentialMergeCommit": {"oid": "4444444444444444444444444444444444444444",
                "parents": {"nodes": [{"oid": reported_base_oid}, {"oid": head_oid}]}}
        }}}})
        return result
    result.returncode = ref_probe_status
    result.stderr = "base ref probe failed" if result.returncode else ""
    result.stdout = current_base_oid + "\\n" if result.returncode == 0 else ""
    return result
m._run_checked = checked
m._run = run
m.fetch_eyes_reactors = lambda *args: []
m.fetch_threads = lambda *args: []
m.fetch_awaiting_approval = lambda *args: 0
m.fetch_pr_chain = lambda *args: {"manager_status": "absent", "relationship_status": "independent",
                                  "default_branch": "main", "parent_prs": [], "dependent_prs": []}
current = m.fetch(7, "ghe.acme.test/o/r")
identity_head_oid = head_oid.upper()
same_head_mixed_case = m.fetch(7, "ghe.acme.test/o/r")
identity_head_oid = "6666666666666666666666666666666666666666"
head_race = m.fetch(7, "ghe.acme.test/o/r")
identity_head_oid = head_oid
current_base_oid = "5555555555555555555555555555555555555555"
race = m.fetch(7, "ghe.acme.test/o/r")
ref_probe_status = 1
probe_error = m.fetch(7, "ghe.acme.test/o/r")
print(json.dumps({"current": current, "same_head_mixed_case": same_head_mixed_case,
                  "head_race": head_race, "race": race,
                  "probe_error": probe_error, "calls": calls}))
`
    const r = spawnSync("python3", ["-c", python], { encoding: "utf8" })
    expect(r.status, r.stderr).toBe(0)
    const result = JSON.parse(r.stdout)
    expect(result.calls[0].join(" ")).toContain("baseRefOid")
    const refCalls = result.calls.filter((call: string[]) => call.includes("repos/o/r/git/ref/heads/main"))
    expect(refCalls).toHaveLength(5)
    for (const call of refCalls) {
      expect(call).toContain("--hostname")
      expect(call).toContain("ghe.acme.test")
    }
    const identityCalls = result.calls.filter((call: string[]) => call.includes("graphql") && call.join(" ").includes("potentialMergeCommit"))
    expect(identityCalls).toHaveLength(5)
    for (const call of identityCalls) {
      expect(call).toContain("--hostname")
      expect(call).toContain("ghe.acme.test")
    }
    expect(result.current.base).toEqual({
      host: "ghe.acme.test",
      repository: "o/r",
      ref: "main",
      oid: "2222222222222222222222222222222222222222",
      graphql_oid: "2222222222222222222222222222222222222222",
      historical_oid: "1111111111111111111111111111111111111111",
      merge_commit_oid: "4444444444444444444444444444444444444444",
      merge_parent_oids: ["2222222222222222222222222222222222222222", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"],
      identity: "current",
    })
    expect(result.current.host_branch_update_capability).toBe(true)
    expect(result.same_head_mixed_case.base.identity).toBe("current")
    expect(result.head_race.head_sha).toBe("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")
    expect(result.head_race.base.identity).toBe("race")
    expect(result.head_race.host_branch_update_capability).toBe("unknown")
    expect(result.race.base.identity).toBe("race")
    expect(result.race.base.oid).toBe("5555555555555555555555555555555555555555")
    expect(result.race.host_branch_update_capability).toBe("unknown")
    expect(result.probe_error.base.identity).toBe("probe-error")
    expect(result.probe_error.base.oid).toBeNull()
    expect(result.probe_error.host_branch_update_capability).toBe("unknown")
  })

  test("base-ref freshness blocks readiness, resets quiet on current-to-stale, and fails closed on probe error", () => {
    const clean = {
      ...FAILING,
      merge_state_status: "CLEAN",
      review_decision: "APPROVED",
      checks: [{ key: "CI/test", name: "test", status: "COMPLETED", conclusion: "SUCCESS", details_url: "u" }],
      threads: [],
    }
    const currentFile = fetchFile(dir, "base-current.json", clean)
    snapshot(state, currentFile)
    const statePath = path.join(state, "state.json")
    const settled = JSON.parse(readFileSync(statePath, "utf8"))
    settled.last_change_at = "2026-07-17T12:00:00+00:00"
    writeFileSync(statePath, JSON.stringify(settled))

    const current = snapshot(state, currentFile)
    expect(current.base_ref_blocker).toBeNull()
    expect(current.mergeability_certain).toBe(true)
    expect(current.changed_this_tick).toBe(false)
    expect(current.quiet_seconds).toBeGreaterThan(60)
    expect(wakeReason(current, 0)).toBe("merge-ready")

    const stale = snapshot(state, fetchFile(dir, "base-stale.json", {
      ...clean,
      base: {
        host: "github.com",
        repository: "o/r",
        ref: "main",
        oid: "base-2",
        pr_oid: "base-1",
        freshness: "stale",
      },
    }))
    expect(stale.base_ref_blocker).toBe("stale")
    expect(stale.mergeability_certain).toBe(false)
    expect(stale.changed_this_tick).toBe(true)
    expect(stale.quiet_seconds).toBeLessThan(2)
    expect(stale.branch_currency).toBeNull()
    expect(wakeReason(stale, 0)).toBe("base-ref-blocked")

    const probeError = snapshot(state, fetchFile(dir, "base-probe-error.json", {
      ...clean,
      base: {
        host: "github.com",
        repository: "o/r",
        ref: "main",
        oid: null,
        pr_oid: "base-1",
        freshness: "probe-error",
      },
    }))
    expect(probeError.base_ref_blocker).toBe("probe-error")
    expect(probeError.mergeability_certain).toBe(false)
    expect(probeError.branch_currency).toBeNull()
    expect(wakeReason(probeError, 0)).toBe("base-ref-blocked")
  })

  test("historical base movement does not block a merge computation proven against the current base", () => {
    const historicalBase = "60a8e4348581471105797264808676f1f562bea5"
    const liveBase = "5c8913cd7466b57bed5aee0d9809bf90b9e83115"
    const head = "d0108be80bf04447ee768dfb6c925301c4cdc74f"
    const clean = {
      ...FAILING,
      head_sha: head,
      merge_state_status: "CLEAN",
      review_decision: "APPROVED",
      checks: [{ key: "CI/test", name: "test", status: "COMPLETED", conclusion: "SUCCESS", details_url: "u" }],
      threads: [],
      base: {
        host: "github.com",
        repository: "Esper-Labs/nugget",
        ref: "main",
        oid: liveBase,
        graphql_oid: liveBase,
        historical_oid: historicalBase,
        merge_commit_oid: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        merge_parent_oids: [liveBase, head],
        identity: "current",
      },
    }

    const current = snapshot(state, fetchFile(dir, "historical-base-current.json", clean))
    expect(current.base_ref_blocker).toBeNull()
    expect(current.mergeability_certain).toBe(true)
    expect(current.base.historical_oid).toBe(historicalBase)
    expect(current.base.oid).toBe(liveBase)
    expect(wakeReason(current, 0)).toBe("merge-ready")
  })

  test("base identity fails closed for races, pending merge generation, malformed refs, and deleted refs", () => {
    const race = probeBaseIdentity({ refOid: "5".repeat(40) }).base
    const pending = probeBaseIdentity({ mergeCommitOid: null }).base
    expect(race.identity).toBe("race")
    expect(pending.identity).toBe("mergeability-pending")
    expect(probeBaseIdentity({ refOid: "not-a-sha" }).base.identity).toBe("probe-error")
    expect(probeBaseIdentity({ refStatus: 1 }).base.identity).toBe("probe-error")
    expect(probeBaseIdentity({ parentOids: ["2".repeat(40)] }).base.identity).toBe("probe-error")
    expect(probeBaseIdentity({ parentOids: ["not-an-oid", "3".repeat(40)] }).base.identity).toBe("probe-error")
    expect(probeBaseIdentity({ parentOids: ["3".repeat(40), "2".repeat(40)] }).base.identity).toBe("race")
    expect(probeBaseIdentity({ parentOids: ["5".repeat(40), "3".repeat(40)] }).base.identity).toBe("race")

    expect(probeBaseIdentity({
      mergeable: "CONFLICTING",
      mergeStateStatus: "CLEAN",
      mergeCommitOid: null,
    }).base.identity).toBe("mergeability-pending")

    for (const [name, base] of [["race", race], ["pending", pending]] as const) {
      const value = snapshot(path.join(dir, `base-${name}`), fetchFile(dir, `base-${name}.json`, {
        ...FAILING,
        head_sha: "3".repeat(40),
        merge_state_status: "CLEAN",
        review_decision: "APPROVED",
        checks: [{ key: "CI/test", name: "test", status: "COMPLETED", conclusion: "SUCCESS", details_url: "u" }],
        threads: [],
        base,
      }))
      expect(value.base_ref_blocker).toBe(base.identity)
      expect(value.mergeability_certain).toBe(false)
      expect(wakeReason(value, 0)).toBe("base-ref-blocked")
    }
  })

  test("base identity accepts SHA-1 and SHA-256 object IDs and routes GitHub Enterprise probes", () => {
    for (const length of [40, 64]) {
      const baseOid = "a".repeat(length)
      const headOid = "b".repeat(length)
      const result = probeBaseIdentity({
        refOid: baseOid,
        graphqlOid: baseOid,
        headOid,
        historicalOid: "c".repeat(length),
        mergeCommitOid: "d".repeat(length),
        parentOids: [baseOid, headOid],
      })
      expect(result.base.identity).toBe("current")
      expect(result.calls[0]).toContain("--hostname")
      expect(result.calls[0]).toContain("ghe.acme.test")
    }
  })

  test("private REST ref 404 falls back to an exact non-interactive Git ref probe", () => {
    const baseOid = "a".repeat(40)
    const headOid = "b".repeat(40)
    const result = probeBaseIdentity({
      refStatus: 1,
      refError: "gh: Not Found (HTTP 404)",
      gitStatus: 0,
      gitOutput: `${baseOid}\trefs/heads/main\n`,
      graphqlOid: baseOid,
      headOid,
      mergeCommitOid: "d".repeat(40),
      parentOids: [baseOid, headOid],
    })

    expect(result.base.identity).toBe("current")
    expect(result.base.oid).toBe(baseOid)
    expect(result.calls).toHaveLength(2)
    expect(result.calls[1]).toEqual([
      "git", "-c", "core.askPass=",
      "-c", "credential.helper=",
      "-c", "credential.helper=!gh auth git-credential",
      "ls-remote", "--exit-code", "--refs",
      "https://ghe.acme.test/o/r.git", "refs/heads/main",
    ])

    expect(probeBaseIdentity({
      refStatus: 1,
      refError: "gh: Not Found (HTTP 404)",
      gitStatus: 1,
    }).base.identity).toBe("probe-error")
    expect(probeBaseIdentity({
      refStatus: 1,
      refError: "gh: Not Found (HTTP 404)",
      gitStatus: 0,
      gitOutput: `${baseOid}\trefs/heads/not-main\n`,
    }).base.identity).toBe("probe-error")
    expect(probeBaseIdentity({
      refStatus: 1,
      refError: "gh: Not Found (HTTP 404)",
      gitStatus: 0,
      gitOutput: `not-an-oid\trefs/heads/main\n`,
    }).base.identity).toBe("probe-error")
    expect(probeBaseIdentity({
      refStatus: 1,
      refError: "gh: Not Found (HTTP 404)",
      gitStatus: 0,
      gitOutput: `${baseOid}\trefs/heads/main\n${baseOid}\trefs/heads/main\n`,
    }).base.identity).toBe("probe-error")
    expect(probeBaseIdentity({
      refStatus: 1,
      refError: "gh: Not Found (HTTP 404)",
      gitTimeout: true,
    }).base.identity).toBe("probe-error")
    expect(probeBaseIdentity({
      refStatus: 1,
      refError: "gh: Not Found (HTTP 404)",
      gitOSError: true,
    }).base.identity).toBe("probe-error")

    const forbidden = probeBaseIdentity({
      refStatus: 1,
      refError: "gh: Forbidden (HTTP 403)",
      gitStatus: 0,
      gitOutput: `${baseOid}\trefs/heads/main\n`,
    })
    expect(forbidden.base.identity).toBe("probe-error")
    expect(forbidden.calls).toHaveLength(1)
  })

  test("private ref fallback clears configured helpers and delegates credentials to gh auth", () => {
    const credentialDir = mkdtempSync(path.join(tmpdir(), "ce-babysit-pr-credential-"))
    const fakeGh = path.join(credentialDir, "gh")
    const poisonHelper = path.join(credentialDir, "poison-helper")
    const poisonMarker = path.join(credentialDir, "poison-invoked")
    writeFileSync(fakeGh, `#!/bin/sh
if [ "$1 $2 $3" != "auth git-credential get" ]; then
  exit 92
fi
printf 'username=oauth-user\\npassword=session-token\\n'
`)
    writeFileSync(poisonHelper, `#!/bin/sh
: > "$PR_SNAPSHOT_POISON_MARKER"
exit 91
`)
    chmodSync(fakeGh, 0o755)
    chmodSync(poisonHelper, 0o755)
    writeFileSync(path.join(credentialDir, ".gitconfig"), `[credential]
\thelper = !${poisonHelper}
`)

    const result = spawnSync("git", [
      "-c", "core.askPass=",
      "-c", "credential.helper=",
      "-c", "credential.helper=!gh auth git-credential",
      "credential", "fill",
    ], {
      encoding: "utf8",
      input: "protocol=https\nhost=ghe.acme.test\n\n",
      env: {
        ...process.env,
        HOME: credentialDir,
        GIT_CONFIG_NOSYSTEM: "1",
        GIT_TERMINAL_PROMPT: "0",
        GCM_INTERACTIVE: "never",
        GIT_ASKPASS: "",
        SSH_ASKPASS: "",
        PATH: `${credentialDir}:${process.env.PATH ?? ""}`,
        PR_SNAPSHOT_POISON_MARKER: poisonMarker,
      },
    })

    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain("username=oauth-user")
    expect(result.stdout).toContain("password=session-token")
    expect(existsSync(poisonMarker)).toBe(false)
  })

  test("Git ref probes are bounded and non-interactive", () => {
    const r = spawnSync("python3", ["-c", `
import json, os
from importlib.machinery import SourceFileLoader
m = SourceFileLoader("pr_snapshot", ${JSON.stringify(SCRIPT)}).load_module()
observed = {}
class Result:
    returncode = 1
    stdout = ""
    stderr = ""
def run(cmd, **kwargs):
    observed.update(kwargs)
    observed["inherited"] = kwargs["env"].get("PR_SNAPSHOT_TEST_ENV")
    return Result()
m.subprocess.run = run
os.environ["PR_SNAPSHOT_TEST_ENV"] = "preserved"
m._run_git(["git", "ls-remote"])
print(json.dumps({
    "prompt": observed["env"].get("GIT_TERMINAL_PROMPT"),
    "gcm": observed["env"].get("GCM_INTERACTIVE"),
    "askpass": observed["env"].get("GIT_ASKPASS"),
    "ssh_askpass": observed["env"].get("SSH_ASKPASS"),
    "inherited": observed["inherited"],
    "timeout": observed["timeout"],
}))
`], { encoding: "utf8" })
    expect(r.status, r.stderr).toBe(0)
    expect(JSON.parse(r.stdout)).toEqual({
      prompt: "0",
      gcm: "never",
      askpass: "",
      ssh_askpass: "",
      inherited: "preserved",
      timeout: 30,
    })
  })

  test("DIRTY conflict state does not require a generated test merge commit", () => {
    const baseOid = "a".repeat(40)
    const result = probeBaseIdentity({
      refOid: baseOid,
      graphqlOid: baseOid,
      mergeable: "CONFLICTING",
      mergeStateStatus: "DIRTY",
      mergeCommitOid: null,
    })
    expect(result.base.identity).toBe("current")
    expect(result.base.merge_commit_oid).toBeNull()
  })

  test("BEHIND emits branch currency when current merge identity is proven despite historical base movement", () => {
    const historicalBase = "1".repeat(40)
    const liveBase = "2".repeat(40)
    const head = "3".repeat(40)
    const behind = snapshot(state, fetchFile(dir, "behind-historical-base.json", quietCurrencyFixture({
      head_sha: head,
      base: {
        host: "github.com",
        repository: "o/r",
        ref: "main",
        oid: liveBase,
        graphql_oid: liveBase,
        historical_oid: historicalBase,
        merge_commit_oid: "4".repeat(40),
        merge_parent_oids: [liveBase, head],
        identity: "current",
      },
    })))
    expect(behind.base_ref_blocker).toBeNull()
    expect(behind.mergeability_certain).toBe(true)
    expect(behind.branch_currency).toMatchObject({ status: "BEHIND", base_oid: liveBase, head_sha: head })
    expect(wakeReason(behind, 0)).toBe("branch-currency")
  })

  test("watch does not turn ordinary historical base movement into a standing base-ref residual", () => {
    const historicalBase = "1".repeat(40)
    const liveBase = "2".repeat(40)
    const head = "3".repeat(40)
    const clean = {
      ...FAILING,
      head_sha: head,
      merge_state_status: "CLEAN",
      review_decision: "APPROVED",
      checks: [{ key: "CI/test", name: "test", status: "COMPLETED", conclusion: "SUCCESS", details_url: "u" }],
      threads: [],
      base: {
        host: "github.com",
        repository: "o/r",
        ref: "main",
        oid: liveBase,
        graphql_oid: liveBase,
        historical_oid: historicalBase,
        merge_commit_oid: "4".repeat(40),
        merge_parent_oids: [liveBase, head],
        identity: "current",
      },
    }
    const cleanFile = fetchFile(dir, "base-moved-current.json", clean)
    const cleanState = path.join(dir, "base-moved-current")
    snapshot(cleanState, cleanFile)
    expect(watch(cleanState, cleanFile, ["--settle-seconds", "0"]).reason).toBe("merge-ready")
  }, 15000)

  test("first snapshot: thread + failing check are actionable; checks terminal", () => {
    const d = snapshot(state, fetchFile(dir, "a.json", FAILING))
    expect(d.counts.threads).toBe(1)
    expect(d.counts.ci).toBe(1)
    expect(d.has_failing_checks).toBe(true)
    expect(d.checks_terminal).toBe(true)
  })

  test("crash-safety: un-marked items stay actionable on the next tick", () => {
    const f = fetchFile(dir, "a.json", FAILING)
    const first = snapshot(state, f)
    const second = snapshot(state, f)
    expect(second.counts.threads).toBe(first.counts.threads)
    expect(second.counts.ci).toBe(first.counts.ci)
  })

  test("needs-human thread: silenced despite the resolver's own reply moving identity, but stays visible via open_needs_human", () => {
    snapshot(state, fetchFile(dir, "a.json", FAILING))
    mark(state, ["--thread", "T1", "--disposition", "needs-human"])
    // The resolver posts decision_context, moving the thread's last-comment identity.
    const replied = { ...FAILING, threads: [{ thread_id: "T1", last_comment_id: "C2", last_comment_at: "t2" }] }
    const d = snapshot(state, fetchFile(dir, "b.json", replied))
    expect(d.counts.threads).toBe(0) // no re-actionize (the P1 fix)
    expect(d.open_needs_human).toBe(1) // still blocks merge-ready
  })

  test("mark --check silences it; a new head SHA re-actionizes", () => {
    const f = fetchFile(dir, "a.json", FAILING)
    snapshot(state, f)
    mark(state, ["--check", "CI/test"])
    expect(snapshot(state, f).counts.ci).toBe(0)
    const newHead = { ...FAILING, head_sha: "s2" }
    expect(snapshot(state, fetchFile(dir, "c.json", newHead)).counts.ci).toBe(1)
  })

  test("checks_terminal is false while a check is IN_PROGRESS; all_checks_ok stays false", () => {
    const inprog = {
      ...FAILING,
      checks: [{ key: "CI/test", name: "test", status: "IN_PROGRESS", conclusion: null, details_url: "u" }],
    }
    const d = snapshot(state, fetchFile(dir, "ip.json", inprog))
    expect(d.checks_terminal).toBe(false)
    expect(d.all_checks_ok).toBe(false)
    expect(d.has_failing_checks).toBe(false)
  })

  test("clean + terminal + approved: all_checks_ok true, mergeStateStatus passthrough, no open needs-human", () => {
    const clean = {
      ...FAILING,
      merge_state_status: "CLEAN",
      review_decision: "APPROVED",
      checks: [{ key: "CI/test", name: "test", status: "COMPLETED", conclusion: "SUCCESS", details_url: "u" }],
      threads: [],
    }
    const d = snapshot(state, fetchFile(dir, "cl.json", clean))
    expect(d.all_checks_ok).toBe(true)
    expect(d.checks_terminal).toBe(true)
    expect(d.merge_state_status).toBe("CLEAN")
    expect(d.open_needs_human).toBe(0)
  })

  test("gh stack view is the first probe and a target match supplies managed freshness without GraphQL", () => {
    const { chain, calls } = probeChain({
      stackView: {
        status: 0,
        stdout: {
          trunk: "main",
          currentBranch: "feature",
          branches: [
            { name: "parent", needsRebase: false, pr: { number: 41, url: "https://github.com/o/r/pull/41", state: "OPEN" } },
            { name: "feature", isCurrent: true, needsRebase: true, pr: { number: 42, url: "https://GITHUB.COM/O/R/pull/42/", state: "OPEN" } },
            { name: "child", needsRebase: false, pr: { number: 43, url: "https://github.com/o/r/pull/43", state: "OPEN", isDraft: true } },
          ],
        },
      },
      graphql: { status: 1, stderr: "must not run" },
    })
    expect(calls[0]).toBe("gh stack view --json")
    expect(calls.some((call) => call.includes("api graphql"))).toBe(false)
    expect(chain.manager_status).toBe("confirmed")
    expect(chain.manager_source).toBe("gh-stack")
    expect(chain.relationship_status).toBe("dependent")
    expect(chain.target_position).toBe(2)
    expect(chain.target_needs_rebase).toBe(true)
    expect(chain.entries[2].isDraft).toBe(true)
    expect(chain.dependent_prs[0].isDraft).toBe(true)
  })

  test("a successful view of another local stack falls back to GraphQL instead of misclassifying the target", () => {
    const { chain, calls } = probeChain({
      stackView: {
        status: 0,
        stdout: { trunk: "main", currentBranch: "other", branches: [{ name: "other", pr: { number: 7 } }] },
      },
      graphql: {
        status: 0,
        stdout: {
          data: { repository: { pullRequest: {
            stackEntry: { position: 2 },
            stack: {
              id: "STACK_1", number: 99, size: 3, baseRefName: "main",
              entries: { nodes: [
                { position: 1, pullRequest: { number: 41, url: "https://github.com/o/r/pull/41", state: "OPEN", headRefName: "parent" } },
                { position: 2, pullRequest: { number: 42, url: "https://github.com/o/r/pull/42", state: "OPEN", headRefName: "feature" } },
                { position: 3, pullRequest: { number: 43, url: "https://github.com/o/r/pull/43", state: "OPEN", headRefName: "child" } },
              ] },
            },
          } } },
        },
      },
    })
    expect(calls.some((call) => call.includes("api graphql"))).toBe(true)
    expect(chain.manager_status).toBe("confirmed")
    expect(chain.manager_source).toBe("graphql")
    expect(chain.target_position).toBe(2)
    expect(chain.target_needs_rebase).toBeNull()
  })

  test("a local stack entry with the target number in another repository falls back to GraphQL", () => {
    const { chain, calls } = probeChain({
      stackView: {
        status: 0,
        stdout: {
          trunk: "main",
          currentBranch: "feature",
          branches: [
            {
              name: "feature",
              isCurrent: true,
              needsRebase: true,
              pr: { number: 42, url: "https://github.com/another/repository/pull/42", state: "OPEN" },
            },
          ],
        },
      },
      graphql: {
        status: 0,
        stdout: {
          data: { repository: {
            defaultBranchRef: { name: "main" },
            pullRequest: {
              stackEntry: { position: 1 },
              stack: {
                id: "STACK_2", number: 100, size: 1, baseRefName: "main",
                entries: { nodes: [
                  { position: 1, pullRequest: { number: 42, url: "https://github.com/o/r/pull/42", state: "OPEN", headRefName: "feature" } },
                ] },
              },
            },
          } },
        },
      },
    })
    expect(calls.some((call) => call.includes("api graphql"))).toBe(true)
    expect(chain.manager_status).toBe("confirmed")
    expect(chain.manager_source).toBe("graphql")
    expect(chain.target_needs_rebase).toBeNull()
  })

  test("successful null GraphQL stack classifies an ordinary manual dependency chain", () => {
    const { chain, calls } = probeChain({
      baseRef: "parent",
      headRef: "feature",
      stackView: { status: 1, stderr: "no current stack" },
      graphql: { status: 0, stdout: { data: { repository: {
        defaultBranchRef: { name: "main" },
        pullRequest: { stackEntry: null, stack: null },
      } } } },
      openPrs: [
        { number: 41, url: "https://github.com/o/r/pull/41", state: "MERGED", baseRefName: "main", headRefName: "parent" },
        { number: 42, url: "https://github.com/o/r/pull/42", state: "OPEN", baseRefName: "parent", headRefName: "feature" },
        { number: 43, url: "https://github.com/o/r/pull/43", state: "OPEN", baseRefName: "feature", headRefName: "child" },
      ],
    })
    expect(chain.manager_status).toBe("absent")
    expect(calls.some((call) => call.includes("gh pr list") && call.includes("--state all") && call.includes("--head parent"))).toBe(true)
    expect(calls.some((call) => call.includes("gh pr list") && call.includes("--state open") && call.includes("--base feature"))).toBe(true)
    expect(chain.relationship_status).toBe("dependent")
    expect(chain.parent_prs.map((pr: any) => pr.number)).toEqual([41])
    expect(chain.dependent_prs.map((pr: any) => pr.number)).toEqual([43])
  })

  test("a PR based on the default branch ignores unrelated PRs whose head has the default-branch name", () => {
    const { chain, calls } = probeChain({
      baseRef: "main",
      headRef: "feature",
      stackView: { status: 1, stderr: "no current stack" },
      graphql: { status: 0, stdout: { data: { repository: {
        defaultBranchRef: { name: "main" },
        pullRequest: { stackEntry: null, stack: null },
      } } } },
      openPrs: [
        { number: 500, url: "https://github.com/o/r/pull/500", state: "OPEN", baseRefName: "main", headRefName: "main" },
        { number: 320, url: "https://github.com/o/r/pull/320", state: "OPEN", baseRefName: "main", headRefName: "main" },
      ],
    })
    expect(calls.some((call) => call.includes("gh pr list") && call.includes("--head main"))).toBe(false)
    expect(calls.some((call) => call.includes("gh pr list") && call.includes("--base feature"))).toBe(true)
    expect(chain.manager_status).toBe("absent")
    expect(chain.relationship_status).toBe("independent")
    expect(chain.parent_prs).toEqual([])
    expect(chain.dependent_prs).toEqual([])
  })

  test("manager probe failure remains unknown and never collapses to absent", () => {
    const { chain, calls } = probeChain({
      stackView: { status: 1, stderr: "no current stack" },
      graphql: { status: 1, stderr: "gh: HTTP 401: Bad credentials" },
    })
    expect(chain.manager_status).toBe("probe-error")
    expect(chain.manager_status).not.toBe("absent")
    expect(calls.filter((call) => call.startsWith("gh api ")).length).toBe(1)
  })

  test("unavailable stack fields fall back to the default branch and manual-chain classification", () => {
    const { chain, calls } = probeChain({
      baseRef: "parent",
      headRef: "feature",
      stackView: { status: 1, stderr: "no current stack" },
      graphql: { status: 1, stderr: "gh: Field 'stackEntry' doesn't exist on type 'PullRequest'" },
      defaultBranch: { status: 0, stdout: "main\n" },
      openPrs: [
        { number: 41, url: "https://github.com/o/r/pull/41", state: "OPEN", baseRefName: "main", headRefName: "parent" },
        { number: 43, url: "https://github.com/o/r/pull/43", state: "OPEN", baseRefName: "feature", headRefName: "child" },
      ],
    })
    expect(calls).toContain("gh api repos/o/r --jq .default_branch")
    expect(chain.manager_status).toBe("absent")
    expect(chain.relationship_status).toBe("dependent")
    expect(chain.parent_prs.map((pr: any) => pr.number)).toEqual([41])
    expect(chain.dependent_prs.map((pr: any) => pr.number)).toEqual([43])
  })

  test("stack fields unavailable with no default-branch fallback remains a manager probe error", () => {
    const { chain } = probeChain({
      stackView: { status: 1, stderr: "no current stack" },
      graphql: { status: 1, stderr: "GraphQL: Cannot query field \"stack\" on type \"PullRequest\"." },
      defaultBranch: { status: 1, stderr: "network unavailable" },
    })
    expect(chain.manager_status).toBe("probe-error")
  })

  test("colliding check keys are disambiguated (both failing checks surface, neither shadows)", () => {
    const collide = {
      ...FAILING,
      checks: [
        { key: "test", name: "test", status: "COMPLETED", conclusion: "FAILURE", details_url: "u1" },
        { key: "test", name: "test", status: "COMPLETED", conclusion: "FAILURE", details_url: "u2" },
      ],
    }
    expect(snapshot(state, fetchFile(dir, "co.json", collide)).counts.ci).toBe(2)
  })

  test("transient null head falls back to the last known head — no ci_dispatched wipe / re-dispatch thrash", () => {
    const f = fetchFile(dir, "a.json", FAILING)
    snapshot(state, f)
    mark(state, ["--check", "CI/test"])
    const nullHead = { ...FAILING, head_sha: null }
    const d = snapshot(state, fetchFile(dir, "nh.json", nullHead))
    expect(d.head_changed).toBe(false)
    expect(d.counts.ci).toBe(0) // still silenced
  })

  // --- trajectory: deterministic cross-tick facts for non-convergence detection ---
  const GREEN_CHECK = { key: "CI/test", name: "test", status: "COMPLETED", conclusion: "SUCCESS", details_url: "u" }
  const RED_CHECK = { key: "CI/test", name: "test", status: "COMPLETED", conclusion: "FAILURE", details_url: "u" }

  test("check recurrence: fail -> clear -> fail on a NEW head increments recur (ping-pong signal)", () => {
    snapshot(state, fetchFile(dir, "r1.json", { ...FAILING, head_sha: "s1", checks: [RED_CHECK] }))
    snapshot(state, fetchFile(dir, "r2.json", { ...FAILING, head_sha: "s2", checks: [GREEN_CHECK] }))
    const d = snapshot(state, fetchFile(dir, "r3.json", { ...FAILING, head_sha: "s3", checks: [RED_CHECK] }))
    expect(d.trajectory.check_recur_max).toBe(1)
    expect(d.trajectory.recurring_checks).toEqual([{ key: "CI/test", recur: 1 }])
  })

  test("same-head flapping is NOT recurrence (flaky, not ping-pong)", () => {
    const f = { ...FAILING, head_sha: "s1" }
    snapshot(state, fetchFile(dir, "f1.json", { ...f, checks: [RED_CHECK] }))
    snapshot(state, fetchFile(dir, "f2.json", { ...f, checks: [GREEN_CHECK] }))
    const d = snapshot(state, fetchFile(dir, "f3.json", { ...f, checks: [RED_CHECK] }))
    expect(d.trajectory.check_recur_max).toBe(0)
  })

  test("review backlog trend rises and new-thread arrivals are counted (treadmill signal)", () => {
    const th = (ids: string[]) => ids.map((id) => ({ thread_id: id, last_comment_id: `c-${id}`, last_comment_at: id }))
    snapshot(state, fetchFile(dir, "t1.json", { ...FAILING, checks: [], threads: th(["T1"]) }))
    snapshot(state, fetchFile(dir, "t2.json", { ...FAILING, checks: [], threads: th(["T1", "T2"]) }))
    const d = snapshot(state, fetchFile(dir, "t3.json", { ...FAILING, checks: [], threads: th(["T1", "T2", "T3", "T4"]) }))
    expect(d.trajectory.unresolved_trend).toBe("rising")
    expect(d.trajectory.new_threads_this_tick).toBe(2) // T3, T4 are new this tick
    expect(d.trajectory.unresolved_threads).toBe(4)
  })

  test("check_recur_max does not stay elevated after the recurring check leaves CI (stale-key prune)", () => {
    snapshot(state, fetchFile(dir, "p1.json", { ...FAILING, head_sha: "s1", checks: [RED_CHECK] }))
    snapshot(state, fetchFile(dir, "p2.json", { ...FAILING, head_sha: "s2", checks: [GREEN_CHECK] }))
    expect(snapshot(state, fetchFile(dir, "p3.json", { ...FAILING, head_sha: "s3", checks: [RED_CHECK] })).trajectory.check_recur_max).toBe(1)
    // CI/test is gone from the run (renamed/removed); its recurrence must not linger.
    const other = { key: "CI/other", name: "other", status: "COMPLETED", conclusion: "SUCCESS", details_url: "u" }
    const d = snapshot(state, fetchFile(dir, "p4.json", { ...FAILING, head_sha: "s4", checks: [other] }))
    expect(d.trajectory.check_recur_max).toBe(0)
  })

  test("heads_since_progress climbs on a persistent failure across heads, but resets on progressive migration", () => {
    // Same check red across three new heads with nothing clearing = a stall.
    snapshot(state, fetchFile(dir, "s1.json", { ...FAILING, head_sha: "h1", checks: [RED_CHECK], threads: [] }))
    expect(snapshot(state, fetchFile(dir, "s2.json", { ...FAILING, head_sha: "h2", checks: [RED_CHECK], threads: [] })).trajectory.heads_since_progress).toBe(1)
    expect(snapshot(state, fetchFile(dir, "s3.json", { ...FAILING, head_sha: "h3", checks: [RED_CHECK], threads: [] })).trajectory.heads_since_progress).toBe(2)
    // A different check now fails (A cleared, B appeared) = progressive migration, not a stall -> reset.
    const other = { key: "CI/other", name: "other", status: "COMPLETED", conclusion: "FAILURE", details_url: "u" }
    expect(snapshot(state, fetchFile(dir, "s4.json", { ...FAILING, head_sha: "h4", checks: [other], threads: [] })).trajectory.heads_since_progress).toBe(0)
  })

  test("parking a thread counts as progress: it leaves the non-parked problem set, so no-progress resets", () => {
    const withThread = (headSha: string) => ({
      ...FAILING,
      head_sha: headSha,
      checks: [RED_CHECK],
      threads: [{ thread_id: "T1", last_comment_id: "c1", last_comment_at: "t1" }],
    })
    snapshot(state, fetchFile(dir, "pk1.json", withThread("h1"))) // problems: {CI/test, T1}
    mark(state, ["--thread", "T1", "--disposition", "needs-human"])
    // New head, CI/test still red, T1 now parked (excluded from problems) -> total drops 2->1 = a new low.
    const d = snapshot(state, fetchFile(dir, "pk2.json", withThread("h2")))
    expect(d.open_needs_human).toBe(1)
    expect(d.trajectory.heads_since_progress).toBe(0) // progress was made (a problem left the set), despite the head change
  })

  test("a rerun (IN_PROGRESS) is not a clear — no false recurrence when it fails again", () => {
    snapshot(state, fetchFile(dir, "ir1.json", { ...FAILING, head_sha: "s1", checks: [RED_CHECK] }))
    const rerun = { ...FAILING, head_sha: "s2", checks: [{ key: "CI/test", name: "test", status: "IN_PROGRESS", conclusion: null, details_url: "u" }] }
    snapshot(state, fetchFile(dir, "ir2.json", rerun))
    const d = snapshot(state, fetchFile(dir, "ir3.json", { ...FAILING, head_sha: "s3", checks: [RED_CHECK] }))
    expect(d.trajectory.check_recur_max).toBe(0)
  })

  test("mark --disposition open re-actionizes a parked needs-human thread (the re-open path)", () => {
    const f = fetchFile(dir, "ro.json", FAILING)
    snapshot(state, f)
    mark(state, ["--thread", "T1", "--disposition", "needs-human"])
    expect(snapshot(state, f).open_needs_human).toBe(1) // parked, not actionable
    mark(state, ["--thread", "T1", "--disposition", "open"])
    const d = snapshot(state, f)
    expect(d.counts.threads).toBe(1) // re-opened -> actionable again
    expect(d.open_needs_human).toBe(0)
  })

  test("a dispatched thread reactivates when a later reviewer comment moves its identity, but not on our own reply (acted_identity baseline)", () => {
    // The false-green fix: a dispatched-but-unresolved thread with fresh reviewer activity must
    // return to actionable, or it stays hidden from counts.threads and lets merge-ready fire.
    const sd = path.join(dir, "react")
    const thr = (cid: string) => ({
      pr_state: "OPEN", mergeable: "MERGEABLE", merge_state_status: "CLEAN", review_decision: null,
      head_sha: "s1", url: "http://x/1", checks: [],
      threads: [{ thread_id: "T1", last_comment_id: cid, last_comment_at: cid }],
    })
    snapshot(sd, fetchFile(dir, "r1.json", thr("C1"))) // open -> actionable
    mark(sd, ["--thread", "T1", "--disposition", "dispatched"])
    // first post-action observation adopts the current identity (our reply) as baseline -> silenced
    expect(snapshot(sd, fetchFile(dir, "r2.json", thr("C1"))).counts.threads).toBe(0)
    // same identity on a later tick -> still silenced (our own reply does not re-trigger)
    expect(snapshot(sd, fetchFile(dir, "r3.json", thr("C1"))).counts.threads).toBe(0)
    // a genuine reviewer reply moves the identity to C2 -> reactivated
    expect(snapshot(sd, fetchFile(dir, "r4.json", thr("C2"))).counts.threads).toBe(1)
  })

  test("a needs-human thread reactivates when a human answers it (a later reply past the baseline), not on our own decision_context reply", () => {
    const sd = path.join(dir, "nhreact")
    const thr = (cid: string) => ({
      ...FAILING, checks: [], threads: [{ thread_id: "T1", last_comment_id: cid, last_comment_at: cid }],
    })
    snapshot(sd, fetchFile(dir, "nh1.json", thr("C1")))
    mark(sd, ["--thread", "T1", "--disposition", "needs-human"])
    // first observation after our decision_context reply (C2) -> adopt as baseline, stays parked
    const d1 = snapshot(sd, fetchFile(dir, "nh2.json", thr("C2")))
    expect(d1.counts.threads).toBe(0)
    expect(d1.open_needs_human).toBe(1) // still parked, blocks merge-ready
    // a human replies past the baseline (C3) -> reactivated to actionable, no longer parked
    const d2 = snapshot(sd, fetchFile(dir, "nh3.json", thr("C3")))
    expect(d2.counts.threads).toBe(1) // reopened -> the loop reprocesses with the human's input
    expect(d2.open_needs_human).toBe(0)
  })

  test("blocked_external waits for other running checks — does not fire while a check is still IN_PROGRESS", () => {
    const RUNNING = { key: "CI/b", name: "b", status: "IN_PROGRESS", conclusion: null, details_url: "u" }
    const GREEN = { key: "CI/a", name: "a", status: "COMPLETED", conclusion: "SUCCESS", details_url: "u" }
    // awaiting approval + a still-running check -> NOT blocked_external yet (that check could fail)
    const running = { ...FAILING, threads: [], checks: [RUNNING], awaiting_approval: 1 }
    expect(snapshot(path.join(dir, "be1"), fetchFile(dir, "be1.json", running)).blocked_external).toBe(false)
    // awaiting approval + all other checks terminal -> blocked_external
    const terminal = { ...FAILING, threads: [], checks: [GREEN], awaiting_approval: 1 }
    expect(snapshot(path.join(dir, "be2"), fetchFile(dir, "be2.json", terminal)).blocked_external).toBe(true)
  })

  test("a dispatched (handled) top-level comment does not inflate heads_since_progress across heads", () => {
    // A handled comment never drops out of the fetch, so counting it as an open problem would keep
    // heads_since_progress climbing forever and falsely trip non-convergence on unrelated later work.
    const sd = path.join(dir, "stall")
    const fb = (head: string) => ({
      ...FAILING, head_sha: head, checks: [], threads: [], feedback: [{ id: "IC_1", kind: "comment", author: "r", edit_id: "h" }],
    })
    snapshot(sd, fetchFile(dir, "st1.json", fb("s1"))) // IC_1 open -> a problem
    mark(sd, ["--comment", "IC_1", "--disposition", "dispatched", "--acted-edit-id", "h"])
    const d = snapshot(sd, fetchFile(dir, "st2.json", fb("s2"))) // dispatched + head moved -> handled, progress
    expect(d.trajectory.heads_since_progress).toBe(0)
  })

  test("a watch poll does not consume new_threads_this_tick — the agent's tick still sees the new arrival", () => {
    // The watch's waking poll persists change-detection state but must NOT roll the trajectory, or it
    // marks the just-arrived thread "seen" and the agent's real tick reads 0 new arrivals — hiding a
    // review-bot treadmill from the non-convergence trigger.
    const sd = path.join(dir, "trajwatch")
    const noThreads = { ...FAILING, checks: [], threads: [] }
    snapshot(sd, fetchFile(dir, "tw1.json", noThreads)) // agent tick: baseline, no threads
    const withThread = { ...FAILING, checks: [], threads: [{ thread_id: "T1", last_comment_id: "C1", last_comment_at: "C1" }] }
    expect(watch(sd, fetchFile(dir, "tw2.json", withThread)).reason).toBe("actionable") // a poll wakes on the new thread
    // the agent's real tick then still counts T1 as newly arrived (the poll didn't mark it seen)
    expect(snapshot(sd, fetchFile(dir, "tw3.json", withThread)).trajectory.new_threads_this_tick).toBe(1)
  }, 15000)

  test("heads_since_progress counts head moves across AGENT ticks even when a poll observed the new head first (C2)", () => {
    const sd = path.join(dir, "hspwatch")
    const failAt = (head: string) => ({ ...FAILING, head_sha: head, threads: [], checks: [{ key: "CI/x", name: "x", status: "COMPLETED", conclusion: "FAILURE", details_url: "u" }] })
    snapshot(sd, fetchFile(dir, "hw1.json", failAt("s1"))) // agent tick: persistent failure at head s1
    watch(sd, fetchFile(dir, "hw2.json", failAt("s2"))) // a poll observes+persists head s2 (no trajectory roll)
    const d = snapshot(sd, fetchFile(dir, "hw3.json", failAt("s2"))) // agent tick at s2
    expect(d.trajectory.heads_since_progress).toBe(1) // head moved s1->s2 between agent ticks; not starved by the poll
  }, 15000)

  test("check recurrence catches a CLEAR observed only on a watch poll (C1)", () => {
    const sd = path.join(dir, "recurwatch")
    const RED = { key: "CI/x", name: "x", status: "COMPLETED", conclusion: "FAILURE", details_url: "u" }
    const GREEN = { key: "CI/x", name: "x", status: "COMPLETED", conclusion: "SUCCESS", details_url: "u" }
    snapshot(sd, fetchFile(dir, "rw1.json", { ...FAILING, head_sha: "s1", threads: [], checks: [RED] }),
      EXPIRING_TEST_INVOCATION) // fail h1; the watch below deliberately expires
    watch(sd, fetchFile(dir, "rw2.json", { ...FAILING, head_sha: "s2", threads: [], checks: [GREEN] })) // a poll observes the CLEAR
    const d = snapshot(sd, fetchFile(dir, "rw3.json", { ...FAILING, head_sha: "s3", threads: [], checks: [RED] })) // fail h3
    expect(d.trajectory.check_recur_max).toBe(1) // fail -> clear(seen only on a poll) -> fail = recurrence
  }, 15000)

  test("snapshot refuses to inherit an old budget without an explicit invocation boundary", () => {
    const sd = path.join(dir, "sess")
    snapshot(sd, fetchFile(dir, "se1.json", FAILING))
    // simulate resuming days later against persisted state: backdate started_at
    const statePath = path.join(sd, "state.json")
    const st = JSON.parse(readFileSync(statePath, "utf8"))
    st.started_at = "2020-01-01T00:00:00Z"
    writeFileSync(statePath, JSON.stringify(st))
    const bare = spawnSync("python3", [SCRIPT, "snapshot", "--pr", "1", "--repo", "o/r", "--state-dir", sd,
      "--fetch-file", fetchFile(dir, "se2.json", FAILING)], { encoding: "utf8" })
    expect(bare.status).not.toBe(0)
    expect(bare.stderr).toContain("requires --start-invocation or --invocation-id")

    const fresh = snapshot(sd, fetchFile(dir, "se3.json", FAILING), ["--start-invocation"])
    expect(fresh.invocation_elapsed_seconds).toBeLessThan(10)
  })

  test("a new invocation clock starts after a slow first fetch", () => {
    const sd = path.join(dir, "slow-first-fetch")
    const python = `
import json
from datetime import datetime, timedelta, timezone
from importlib.machinery import SourceFileLoader
from types import SimpleNamespace
m = SourceFileLoader("prs", ${JSON.stringify(SCRIPT)}).load_module()
before_fetch = datetime(2026, 1, 1, tzinfo=timezone.utc)
after_fetch = before_fetch + timedelta(seconds=61)
clock_reads = 0
def fake_now():
    global clock_reads
    clock_reads += 1
    return before_fetch if clock_reads == 1 else after_fetch
m._now = fake_now
m._fetch_snapshot = lambda args: json.loads(${JSON.stringify(JSON.stringify(FAILING))})
args = SimpleNamespace(state_dir=${JSON.stringify(sd)}, pr=1, repo="o/r", fetch_file=None,
                       reset_session=False, start_invocation=True, continue_invocation=False,
                       invocation_id=None, session_started_at=None,
                       invocation_budget_seconds=28800)
m.cmd_snapshot(args)
`
    const r = spawnSync("python3", ["-c", python], { encoding: "utf8" })
    expect(r.status, r.stderr).toBe(0)
    const value = JSON.parse(r.stdout)
    expect(value.invocation_started_at).toBe("2026-01-01T00:01:01+00:00")
    expect(value.invocation_elapsed_seconds).toBe(0)
  })

  test("a new invocation defaults to one fixed eight-hour budget", () => {
    const sd = path.join(dir, "default-invocation-budget")
    const r = spawnSync("python3", [
      SCRIPT, "snapshot", "--pr", "1", "--repo", "o/r", "--state-dir", sd,
      "--fetch-file", fetchFile(dir, "default-invocation-budget.json", FAILING),
      "--start-invocation",
    ], { encoding: "utf8" })

    expect(r.status, r.stderr).toBe(0)
    const value = JSON.parse(r.stdout)
    expect(value.invocation_budget_seconds).toBe(28_800)
    expect(value.invocation_remaining_seconds).toBeGreaterThan(28_790)
  })

  test("a new invocation preserves PR history but receives one fresh fixed eight-hour budget", () => {
    const sd = path.join(dir, "invocation-boundary")
    const current = {
      ...FAILING,
      threads: [{ thread_id: "T1", last_comment_id: "C1", last_comment_at: "C1" }],
      checks: [{ key: "CI/test", name: "test", status: "IN_PROGRESS", conclusion: null, details_url: "u" }],
    }
    const initial = snapshot(sd, fetchFile(dir, "ib1.json", current), [
      "--start-invocation", "--invocation-budget-seconds", "28800",
    ])
    mark(sd, ["--thread", "T1", "--disposition", "dispatched"])

    const statePath = path.join(sd, "state.json")
    const old = JSON.parse(readFileSync(statePath, "utf8"))
    old.state_created_at = new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString()
    old.started_at = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString()
    old.trajectory.stream_series = ["review", "ci"]
    writeFileSync(statePath, JSON.stringify(old))

    // A later explicit skill invocation does not opt into the old clock. Durable review and
    // trajectory state survives, while the invocation clock starts near zero by default.
    const fresh = snapshot(sd, fetchFile(dir, "ib2.json", current), [
      "--start-invocation", "--invocation-budget-seconds", "28800",
    ])
    expect(fresh.invocation_id).not.toBe(initial.invocation_id)
    expect(fresh.invocation_elapsed_seconds).toBeLessThanOrEqual(1)
    expect(fresh.persisted_state_age_seconds).toBeGreaterThan(28_700)
    expect(fresh.counts.threads).toBe(0)
    expect(JSON.parse(readFileSync(statePath, "utf8")).trajectory.stream_series).toEqual(["review", "ci"])

    // Re-arms present the invocation token and preserve its fixed anchor. Put that anchor one
    // second before the real eight-hour cap so the watch proves it stops against the same budget.
    const almostExpired = new Date(Date.now() - 28_799_000).toISOString().replace("Z", "+00:00")
    const persisted = JSON.parse(readFileSync(statePath, "utf8"))
    persisted.started_at = almostExpired
    writeFileSync(statePath, JSON.stringify(persisted))

    const rearmed = snapshot(sd, fetchFile(dir, "ib3.json", current), [
      "--invocation-id", fresh.invocation_id,
      "--session-started-at", almostExpired,
      "--invocation-budget-seconds", "28800",
    ])
    expect(rearmed.invocation_id).toBe(fresh.invocation_id)
    expect(rearmed.invocation_started_at).toBe(almostExpired)

    const wake = watch(sd, fetchFile(dir, "ib4.json", current), [
      "--invocation-id", fresh.invocation_id,
      "--session-started-at", almostExpired,
      "--invocation-budget-seconds", "28800",
    ])
    expect(wake.reason).toBe("max-runtime")
    expect(wake.invocation_elapsed_seconds).toBeGreaterThanOrEqual(28_800)
    expect(wake.invocation_budget_seconds).toBe(28_800)
    expect(wake.invocation_started_at).toBe(almostExpired)
  }, 10000)

  test("an invocation session start carries into a new managed-stack layer state dir", () => {
    const started = new Date(Date.now() - 3_600_000).toISOString()
    const d = snapshot(
      path.join(dir, "next-layer"),
      fetchFile(dir, "next-layer.json", FAILING),
      ["--continue-invocation", "--invocation-id", "managed-stack-invocation",
        "--session-started-at", started, "--invocation-budget-seconds", "28800"],
    )

    expect(new Date(d.invocation_started_at).getTime()).toBe(new Date(started).getTime())
    expect(d.invocation_elapsed_seconds).toBeGreaterThan(3_500)
  })

  test("re-arming watch preserves the invocation budget instead of resetting it", () => {
    const sd = path.join(dir, "watch-budget")
    const started = new Date(Date.now() - 10_000).toISOString()
    const waiting = {
      ...FAILING,
      threads: [],
      checks: [{ key: "CI/test", name: "test", status: "IN_PROGRESS", conclusion: null, details_url: "u" }],
    }
    snapshot(sd, fetchFile(dir, "watch-budget-snapshot.json", waiting), [
      "--continue-invocation", "--invocation-id", "watch-budget-invocation",
      "--session-started-at", started, "--invocation-budget-seconds", "1",
    ])

    const wake = watch(
      sd,
      fetchFile(dir, "watch-budget-watch.json", waiting),
      ["--invocation-id", "watch-budget-invocation", "--session-started-at", started,
        "--invocation-budget-seconds", "1"],
    )

    expect(wake.reason).toBe("max-runtime")
  }, 15000)

  test("a re-arm cannot extend the fixed invocation budget", () => {
    const sd = path.join(dir, "watch-budget-extension")
    const started = snapshot(sd, fetchFile(dir, "watch-budget-extension-start.json", FAILING), [
      "--start-invocation", "--invocation-budget-seconds", "28800",
    ])
    const r = spawnSync("python3", [
      SCRIPT, "snapshot", "--pr", "1", "--repo", "o/r", "--state-dir", sd,
      "--fetch-file", fetchFile(dir, "watch-budget-extension-resume.json", FAILING),
      "--invocation-id", started.invocation_id,
      "--session-started-at", started.invocation_started_at,
      "--invocation-budget-seconds", "57600",
    ], { encoding: "utf8" })

    expect(r.status).not.toBe(0)
    expect(r.stderr).toContain("does not match the persisted fixed budget")
    expect(JSON.parse(readFileSync(path.join(sd, "state.json"), "utf8")).invocation_budget_seconds).toBe(28800)
  })

  test("the fixed cap outranks newly actionable work instead of allowing another round", () => {
    const sd = path.join(dir, "budget-outranks-actionable")
    const started = new Date(Date.now() - 2_000).toISOString()
    snapshot(sd, fetchFile(dir, "budget-outranks-actionable-start.json", FAILING), [
      "--continue-invocation", "--invocation-id", "expired-actionable-invocation",
      "--session-started-at", started, "--invocation-budget-seconds", "1",
    ])

    const wake = watch(sd, fetchFile(dir, "budget-outranks-actionable-watch.json", FAILING), [
      "--invocation-id", "expired-actionable-invocation",
      "--session-started-at", started, "--invocation-budget-seconds", "1",
    ])
    expect(wake.reason).toBe("max-runtime")
    expect(wake.invocation_elapsed_seconds).toBeGreaterThanOrEqual(2)
  })

  test("the fixed cap fetches terminal PR state before emitting max-runtime", async () => {
    const sd = path.join(dir, "budget-terminal-precedence")
    const waiting = {
      ...FAILING,
      threads: [],
      checks: [{ key: "CI/test", name: "test", status: "IN_PROGRESS", conclusion: null, details_url: "u" }],
    }
    const fetch = fetchFile(dir, "budget-terminal-precedence.json", waiting)
    const started = snapshot(sd, fetch, ["--start-invocation", "--invocation-budget-seconds", "1"])
    const watcher = startWatch(sd, fetch, [
      "--interval", "5",
      "--invocation-id", started.invocation_id,
      "--session-started-at", started.invocation_started_at,
      "--invocation-budget-seconds", "1",
    ])
    await waitForWatchGeneration(sd)

    const replacement = fetchFile(dir, "budget-terminal-precedence-closed.json", {
      ...waiting,
      pr_state: "CLOSED",
    })
    renameSync(replacement, fetch)

    const result = await watcher.result
    expect(result.code, result.stderr).toBe(0)
    const wake = JSON.parse(result.stdout.trim().split("\n").pop()!)
    expect(wake.reason).toBe("terminal")
    expect(wake.pr_state).toBe("CLOSED")
  }, 5000)

  test("the fixed cap preserves a merge-ready result from its final refresh", async () => {
    const sd = path.join(dir, "budget-ready-precedence")
    const waiting = {
      ...FAILING,
      threads: [],
      checks: [{ key: "CI/test", name: "test", status: "IN_PROGRESS", conclusion: null, details_url: "u" }],
    }
    const fetch = fetchFile(dir, "budget-ready-precedence.json", waiting)
    const started = snapshot(sd, fetch, ["--start-invocation", "--invocation-budget-seconds", "1"])
    const watcher = startWatch(sd, fetch, [
      "--interval", "5", "--settle-seconds", "0",
      "--invocation-id", started.invocation_id,
      "--session-started-at", started.invocation_started_at,
      "--invocation-budget-seconds", "1",
    ])
    await waitForWatchGeneration(sd)

    const replacement = fetchFile(dir, "budget-ready-precedence-clean.json", {
      ...waiting,
      mergeable: "MERGEABLE",
      merge_state_status: "CLEAN",
      checks: [{ key: "CI/test", name: "test", status: "COMPLETED", conclusion: "SUCCESS", details_url: "u" }],
    })
    renameSync(replacement, fetch)

    const result = await watcher.result
    expect(result.code, result.stderr).toBe(0)
    expect(JSON.parse(result.stdout.trim()).reason).toBe("merge-ready")
  }, 5000)

  test("watch cannot start or reset an invocation budget", () => {
    const sd = path.join(dir, "watch-cannot-reset")
    const waiting = {
      ...FAILING,
      threads: [],
      checks: [{ key: "CI/test", name: "test", status: "IN_PROGRESS", conclusion: null, details_url: "u" }],
    }
    const started = snapshot(sd, fetchFile(dir, "watch-cannot-reset-start.json", waiting), ["--start-invocation"])
    const r = spawnSync("python3", [
      SCRIPT, "watch", "--pr", "1", "--repo", "o/r", "--state-dir", sd,
      "--fetch-file", fetchFile(dir, "watch-cannot-reset-watch.json", waiting),
      "--invocation-id", started.invocation_id,
      "--session-started-at", started.invocation_started_at,
      "--invocation-budget-seconds", String(started.invocation_budget_seconds),
      "--reset-session",
    ], { encoding: "utf8" })
    expect(r.status).not.toBe(0)
    expect(r.stderr).toContain("unrecognized arguments: --reset-session")
  })

  test("mark requires the current invocation tuple before mutating dispositions", () => {
    const sd = path.join(dir, "mark-invocation-fence")
    const fetch = fetchFile(dir, "mark-invocation-fence.json", FAILING)
    snapshot(sd, fetch)
    const oldInvocation = persistedInvocationArgs(sd)
    snapshot(sd, fetch, ["--start-invocation"])

    const tokenless = spawnSync("python3", [SCRIPT, "mark", "--state-dir", sd,
      "--thread", "T1", "--disposition", "dispatched"], { encoding: "utf8" })
    expect(tokenless.status).not.toBe(0)

    const stale = spawnSync("python3", [SCRIPT, "mark", "--state-dir", sd, ...oldInvocation,
      "--thread", "T1", "--disposition", "dispatched"], { encoding: "utf8" })
    expect(stale.status).not.toBe(0)
    const persisted = JSON.parse(readFileSync(path.join(sd, "state.json"), "utf8"))
    expect(persisted.threads?.T1?.disposition).not.toBe("dispatched")

    mark(sd, ["--thread", "T1", "--disposition", "dispatched"])
    const updated = JSON.parse(readFileSync(path.join(sd, "state.json"), "utf8"))
    expect(updated.threads.T1.disposition).toBe("dispatched")
  })

  test("clearing a fork approval gate is movement (resets the settle clock so merge-ready waits for check-runs)", () => {
    const sd = path.join(dir, "appr")
    const gated = { ...FAILING, merge_state_status: "CLEAN", review_decision: "APPROVED", checks: [], threads: [], awaiting_approval: 1 }
    snapshot(sd, fetchFile(dir, "ap1.json", gated)) // first tick
    expect(snapshot(sd, fetchFile(dir, "ap2.json", gated)).changed_this_tick).toBe(false) // stable gate, no movement
    // approval clears (no check-runs created yet) -> registered as movement so quiet resets
    expect(snapshot(sd, fetchFile(dir, "ap3.json", { ...gated, awaiting_approval: 0 })).changed_this_tick).toBe(true)
  })

  test("mark --thread captures the acted baseline at mark time (closes the reviewer-reply race)", () => {
    const sd = path.join(dir, "atmark")
    const thr = (cid: string) => ({
      ...FAILING, checks: [], threads: [{ thread_id: "T1", last_comment_id: cid, last_comment_at: cid }],
    })
    snapshot(sd, fetchFile(dir, "am1.json", thr("C1")))
    // our decision_context reply is C2; marking WITH the current fetch captures C2 as the baseline now
    mark(sd, ["--thread", "T1", "--disposition", "needs-human", "--fetch-file", fetchFile(dir, "am2.json", thr("C2"))])
    // a reviewer reply that raced in (C3) before the next snapshot -> reactivated, not swallowed as baseline
    const d = snapshot(sd, fetchFile(dir, "am3.json", thr("C3")))
    expect(d.counts.threads).toBe(1) // C3 != the C2 baseline captured at mark -> reopened
    expect(d.open_needs_human).toBe(0)
  })

  test("mark --comment needs-human with --acted-edit-id captures the baseline at mark time (closes the answered-by-edit race)", () => {
    const sd = path.join(dir, "cmark")
    const fb = (edit: string) => ({
      ...FAILING, merge_state_status: "CLEAN", review_decision: "APPROVED", checks: [], threads: [],
      feedback: [{ id: "IC_1", kind: "comment", author: "reviewer", edit_id: edit }],
    })
    snapshot(sd, fetchFile(dir, "cm1.json", fb("h1")))
    // park needs-human with the snapshot-time edit_id as the explicit baseline
    mark(sd, ["--comment", "IC_1", "--disposition", "needs-human", "--acted-edit-id", "h1"])
    // an edit that races in (h2) before the next snapshot -> reactivated, not swallowed as baseline
    const raced = snapshot(sd, fetchFile(dir, "cm2.json", fb("h2")))
    expect(raced.counts.comments).toBe(1)
    expect(raced.open_needs_human).toBe(0)
    // on a dispatched mark the same flag is stored but never read: an edit stays silenced
    mark(sd, ["--comment", "IC_1", "--disposition", "dispatched", "--acted-edit-id", "h2"])
    expect(snapshot(sd, fetchFile(dir, "cm3.json", fb("h3"))).counts.comments).toBe(0)
  })

  test("a needs-human comment reactivates when a human answers by editing it (lazy baseline), while parked it blocks merge-ready", () => {
    const sd = path.join(dir, "nhedit")
    const fb = (edit: string) => ({
      ...FAILING, merge_state_status: "CLEAN", review_decision: "APPROVED", checks: [], threads: [],
      feedback: [{ id: "IC_q", kind: "comment", author: "reviewer", edit_id: edit }],
    })
    snapshot(sd, fetchFile(dir, "nh1.json", fb("q1")))
    mark(sd, ["--comment", "IC_q", "--disposition", "needs-human"]) // lazy baseline
    const parked = snapshot(sd, fetchFile(dir, "nh2.json", fb("q1")))
    expect(parked.counts.comments).toBe(0)
    expect(parked.open_needs_human).toBe(1) // parked -> blocks merge-ready
    // the human answers by editing the same comment -> reactivated and actionable again
    const answered = snapshot(sd, fetchFile(dir, "nh3.json", fb("q2")))
    expect(answered.counts.comments).toBe(1)
    expect(answered.open_needs_human).toBe(0)
  })

  test("a dispatched thread reactivates when an EARLIER comment is edited (same last_comment_id, bumped last_comment_at)", () => {
    // fetch_threads sets last_comment_at = max edit/create time across the whole thread, so an edit
    // to an earlier comment (last_comment_id unchanged) still moves the identity and reopens it.
    const sd = path.join(dir, "editearlier")
    const thr = (at: string) => ({
      ...FAILING, checks: [], threads: [{ thread_id: "T1", last_comment_id: "R1", last_comment_at: at }],
    })
    snapshot(sd, fetchFile(dir, "ee1.json", thr("t1")))
    mark(sd, ["--thread", "T1", "--disposition", "dispatched"]) // lazy baseline
    expect(snapshot(sd, fetchFile(dir, "ee2.json", thr("t1"))).counts.threads).toBe(0) // baseline (R1,t1) -> silenced
    // reviewer edits an earlier comment: last_comment_id stays R1 but the thread's max edit time bumps
    expect(snapshot(sd, fetchFile(dir, "ee3.json", thr("t2"))).counts.threads).toBe(1) // reactivated
  })

  test("a dispatched top-level comment does NOT reactivate when its body is edited; a new comment id still does (#1309)", () => {
    // Status bots (changeset-bot, CodeRabbit, Codecov) rewrite their own comment bodies on every
    // push. Edit-keyed reactivation re-actionized the handled comment on every rewrite, so
    // counts.comments never reached 0 and merge-ready could never fire. A marked comment stays
    // silenced across edits; a genuinely new request is a new comment id and stays actionable.
    const sd = path.join(dir, "editfb")
    const fb = (feedback: object[]) => ({
      ...FAILING, merge_state_status: "CLEAN", review_decision: "APPROVED", checks: [], threads: [],
      feedback,
    })
    const bot = (edit: string) => ({ id: "IC_1", kind: "comment", author: "changeset-bot", edit_id: edit })
    snapshot(sd, fetchFile(dir, "e1.json", fb([bot("h1")]))) // actionable
    mark(sd, ["--comment", "IC_1", "--disposition", "dispatched"])
    expect(snapshot(sd, fetchFile(dir, "e2.json", fb([bot("h1")]))).counts.comments).toBe(0) // same body -> silenced
    // bot rewrites its status comment on the next push -> STAYS silenced, but the edit is still
    // review activity: it must reset the settle clock so merge-ready cannot fire off an old quiet
    // window right after fresh edits (edit_id is part of _change_sig even though it no longer
    // reopens the item)
    patchState(sd, { last_change_at: isoAgo(60 * 60) })
    const edited = snapshot(sd, fetchFile(dir, "e3.json", fb([bot("h2")])))
    expect(edited.counts.comments).toBe(0)
    expect(edited.changed_this_tick).toBe(true)
    expect(edited.quiet_seconds).toBeLessThan(2)
    // an unchanged tick after the edit settles normally
    patchState(sd, { last_change_at: isoAgo(60 * 60) })
    const settled = snapshot(sd, fetchFile(dir, "e3b.json", fb([bot("h2")])))
    expect(settled.changed_this_tick).toBe(false)
    expect(settled.quiet_seconds).toBeGreaterThan(60)
    expect(snapshot(sd, fetchFile(dir, "e4.json", fb([bot("h3")]))).counts.comments).toBe(0)
    // a brand-new comment is a new id -> actionable; the handled one stays out of the count
    const next = snapshot(sd, fetchFile(dir, "e5.json", fb([bot("h3"), { id: "IC_2", kind: "comment", author: "reviewer", edit_id: "x1" }])))
    expect(next.counts.comments).toBe(1)
    expect(next.actionable.comments.map((c: any) => c.id)).toEqual(["IC_2"])
    // explicit re-open still works
    mark(sd, ["--comment", "IC_1", "--disposition", "open"])
    expect(snapshot(sd, fetchFile(dir, "e6.json", fb([bot("h3"), { id: "IC_2", kind: "comment", author: "reviewer", edit_id: "x1" }]))).counts.comments).toBe(2)
  })

  test("a fork-PR workflow awaiting maintainer approval blocks 'all_checks_ok' and flags blocked_external", () => {
    const gated = {
      ...FAILING,
      merge_state_status: "UNSTABLE",
      review_decision: "",
      checks: [{ key: "Track", name: "Track", status: "COMPLETED", conclusion: "SUCCESS", details_url: "u" }],
      threads: [],
      awaiting_approval: 1, // real CI hasn't run — awaiting a base-repo maintainer's approval
    }
    const d = snapshot(state, fetchFile(dir, "aa.json", gated))
    expect(d.checks_awaiting_approval).toBe(1)
    expect(d.has_failing_checks).toBe(false)
    expect(d.all_checks_ok).toBe(false) // not "ok" — the gated CI is invisible to the rollup
    expect(d.blocked_external).toBe(true)
  })

  test("an approval probe failure is unknown rather than a proven-clear gate", () => {
    expect(probeAwaitingApproval({ status: 1 })).toBeNull()
    expect(probeAwaitingApproval({ status: 0, stdout: "not-a-count" })).toBeNull()
    expect(probeAwaitingApproval({ status: 0, stdout: "0" })).toBe(0)
  })

  test("approval review-drain clock is head-scoped and resets only on external review movement", () => {
    const sd = path.join(dir, "approval-drain-state")
    const gated = {
      ...FAILING,
      head_sha: "gated-h1",
      merge_state_status: "UNSTABLE",
      checks: [{ key: "Track", name: "Track", status: "COMPLETED", conclusion: "SUCCESS", details_url: "u" }],
      threads: [],
      feedback: [],
      awaiting_approval: 1,
    }

    const first = snapshot(sd, fetchFile(dir, "approval-drain-first.json", gated))
    expect(first.blocked_external).toBe(true)
    expect(first.blocked_external_review_quiet_seconds).toBeLessThan(2)
    const startedAt = first.blocked_external_review_last_activity_at

    patchState(sd, { blocked_external_review_last_activity_at: isoAgo(10 * 60) })
    const unchanged = snapshot(sd, fetchFile(dir, "approval-drain-unchanged.json", gated))
    expect(unchanged.blocked_external_review_quiet_seconds).toBeGreaterThanOrEqual(9 * 60)

    const activityBeforeProbeFailure = unchanged.blocked_external_review_last_activity_at
    const unknown = snapshot(sd, fetchFile(dir, "approval-drain-probe-failed.json", {
      ...gated,
      awaiting_approval: null,
    }))
    expect(unknown.checks_awaiting_approval).toBe(1)
    expect(unknown.blocked_external).toBe(true)
    expect(unknown.blocked_external_review_last_activity_at).toBe(activityBeforeProbeFailure)
    const recovered = snapshot(sd, fetchFile(dir, "approval-drain-probe-recovered.json", gated))
    expect(recovered.blocked_external_review_last_activity_at).toBe(activityBeforeProbeFailure)
    expect(recovered.blocked_external_review_quiet_seconds).toBeGreaterThanOrEqual(9 * 60)

    const persistentFeedback = {
      ...gated,
      feedback: [{ id: "C1", kind: "comment", author: "reviewer", edit_id: "e1" }],
    }
    snapshot(sd, fetchFile(dir, "approval-drain-feedback-baseline.json", persistentFeedback))
    patchState(sd, { blocked_external_review_last_activity_at: isoAgo(10 * 60) })
    mark(sd, ["--comment", "C1", "--disposition", "dispatched", "--acted-edit-id", "e1"])
    const dispositionOnly = snapshot(sd, fetchFile(dir, "approval-drain-disposition.json", persistentFeedback))
    expect(dispositionOnly.blocked_external_review_quiet_seconds).toBeGreaterThanOrEqual(9 * 60)

    const newFeedback = {
      ...persistentFeedback,
      feedback: [
        { id: "C1", kind: "comment", author: "reviewer", edit_id: "e1" },
        { id: "C2", kind: "comment", author: "reviewer", edit_id: "e2" },
      ],
    }
    const moved = snapshot(sd, fetchFile(dir, "approval-drain-feedback.json", newFeedback))
    expect(moved.blocked_external).toBe(false)
    expect(moved.blocked_external_review_quiet_seconds).toBeLessThan(2)
    expect(moved.blocked_external_review_last_activity_at).not.toBe(startedAt)

    const newHead = snapshot(sd, fetchFile(dir, "approval-drain-head.json", {
      ...gated,
      head_sha: "gated-h2",
    }))
    expect(newHead.blocked_external_review_quiet_seconds).toBeLessThan(2)

    const cleared = snapshot(sd, fetchFile(dir, "approval-drain-cleared.json", {
      ...gated,
      head_sha: "gated-h2",
      awaiting_approval: 0,
    }))
    expect(cleared.blocked_external_review_last_activity_at).toBeNull()
    expect(cleared.blocked_external_review_quiet_seconds).toBe(0)
  })

  test("external review movement resets a confirmed approval drain when the current probe is unknown", () => {
    const sd = path.join(dir, "approval-drain-unknown-movement")
    const gated = {
      ...FAILING,
      head_sha: "gated-h1",
      merge_state_status: "UNSTABLE",
      checks: [{ key: "Track", name: "Track", status: "COMPLETED", conclusion: "SUCCESS", details_url: "u" }],
      threads: [],
      feedback: [],
      awaiting_approval: 1,
    }
    snapshot(sd, fetchFile(dir, "approval-drain-unknown-start.json", gated))
    patchState(sd, { blocked_external_review_last_activity_at: isoAgo(10 * 60) })

    const withExternalMovement = {
      ...gated,
      feedback: [{ id: "C1", kind: "comment", author: "reviewer", edit_id: "e1" }],
      awaiting_approval: null,
    }
    const moved = snapshot(sd, fetchFile(dir, "approval-drain-unknown-moved.json", withExternalMovement))
    expect(moved.checks_awaiting_approval).toBe(1)
    expect(moved.blocked_external_review_moved_this_tick).toBe(true)
    expect(moved.blocked_external_review_quiet_seconds).toBeLessThan(2)
    const resetAt = moved.blocked_external_review_last_activity_at

    const unchanged = snapshot(sd, fetchFile(dir, "approval-drain-unknown-unchanged.json", withExternalMovement))
    expect(unchanged.blocked_external_review_moved_this_tick).toBe(false)
    expect(unchanged.blocked_external_review_last_activity_at).toBe(resetAt)

    const cleared = snapshot(sd, fetchFile(dir, "approval-drain-unknown-cleared.json", {
      ...withExternalMovement,
      awaiting_approval: 0,
    }))
    expect(cleared.checks_awaiting_approval).toBe(0)
    expect(cleared.blocked_external_review_last_activity_at).toBeNull()
  })

  test("approval drain ignores the resolver reply baseline but wakes for a later reviewer reply", () => {
    const gated = (cid: string) => ({
      ...FAILING,
      head_sha: "gated-h1",
      merge_state_status: "UNSTABLE",
      checks: [{ key: "Track", name: "Track", status: "COMPLETED", conclusion: "SUCCESS", details_url: "u" }],
      threads: [{ thread_id: "T1", last_comment_id: cid, last_comment_at: cid }],
      feedback: [],
      awaiting_approval: 1,
    })

    const drainedState = path.join(dir, "approval-drain-resolver-reply")
    snapshot(drainedState, fetchFile(dir, "approval-drain-reviewer-c1.json", gated("C1")))
    const resolverReply = fetchFile(dir, "approval-drain-resolver-c2.json", gated("C2"))
    mark(drainedState, ["--thread", "T1", "--disposition", "dispatched", "--fetch-file", resolverReply])
    patchState(drainedState, { blocked_external_review_last_activity_at: isoAgo(10) })
    const resolverObserved = snapshot(drainedState, resolverReply)
    expect(resolverObserved.blocked_external_review_moved_this_tick).toBe(false)
    expect(resolverObserved.blocked_external_review_quiet_seconds).toBeGreaterThanOrEqual(1)
    const drained = watch(drainedState, resolverReply, ["--blocked-external-drain-seconds", "1"])
    expect(drained.reason).toBe("blocked-external-drained")
    expect(drained.blocked_external_review_quiet_seconds).toBeGreaterThanOrEqual(1)

    const wakeState = path.join(dir, "approval-drain-later-reviewer")
    snapshot(wakeState, fetchFile(dir, "approval-drain-reviewer-start.json", gated("C1")))
    mark(wakeState, ["--thread", "T1", "--disposition", "dispatched", "--fetch-file", resolverReply])
    patchState(wakeState, { blocked_external_review_last_activity_at: isoAgo(10) })
    const reviewerReply = fetchFile(dir, "approval-drain-reviewer-c3.json", gated("C3"))
    const reviewerObserved = snapshot(wakeState, reviewerReply)
    expect(reviewerObserved.blocked_external_review_moved_this_tick).toBe(true)
    expect(reviewerObserved.blocked_external_review_quiet_seconds).toBeLessThan(2)
    expect(reviewerObserved.counts.threads).toBe(1)
    expect(wakeReason(reviewerObserved)).toBe("actionable")
  })

  test("approval drain ignores loop-owned thread resolution but wakes for a needs-human removal", () => {
    const gated = {
      ...FAILING,
      head_sha: "gated-h1",
      merge_state_status: "UNSTABLE",
      checks: [{ key: "Track", name: "Track", status: "COMPLETED", conclusion: "SUCCESS", details_url: "u" }],
      threads: [{ thread_id: "T1", last_comment_id: "C1", last_comment_at: "C1" }],
      feedback: [],
      awaiting_approval: 1,
    }
    const resolved = fetchFile(dir, "approval-drain-resolved.json", { ...gated, threads: [] })

    const dispatchedState = path.join(dir, "approval-drain-dispatched-resolution")
    snapshot(dispatchedState, fetchFile(dir, "approval-drain-dispatched-start.json", gated))
    mark(dispatchedState, ["--thread", "T1", "--disposition", "dispatched", "--fetch-file",
      fetchFile(dir, "approval-drain-dispatched-baseline.json", gated)])
    patchState(dispatchedState, { blocked_external_review_last_activity_at: isoAgo(10) })
    const loopResolved = snapshot(dispatchedState, resolved)
    expect(loopResolved.blocked_external_review_moved_this_tick).toBe(false)
    expect(loopResolved.blocked_external_review_quiet_seconds).toBeGreaterThanOrEqual(1)

    const needsHumanState = path.join(dir, "approval-drain-needs-human-removal")
    snapshot(needsHumanState, fetchFile(dir, "approval-drain-needs-human-start.json", gated))
    mark(needsHumanState, ["--thread", "T1", "--disposition", "needs-human", "--fetch-file",
      fetchFile(dir, "approval-drain-needs-human-baseline.json", gated)])
    patchState(needsHumanState, { blocked_external_review_last_activity_at: isoAgo(10) })
    const externallyRemoved = snapshot(needsHumanState, resolved)
    expect(externallyRemoved.blocked_external_review_moved_this_tick).toBe(true)
    expect(externallyRemoved.blocked_external_review_quiet_seconds).toBeLessThan(2)
  })

  test("approval review-drain wakes terminally after its selected quiet bound", () => {
    const sd = path.join(dir, "approval-drain-expiry")
    const gated = {
      ...FAILING,
      head_sha: "gated-h1",
      merge_state_status: "UNSTABLE",
      checks: [{ key: "Track", name: "Track", status: "COMPLETED", conclusion: "SUCCESS", details_url: "u" }],
      threads: [],
      feedback: [],
      awaiting_approval: 1,
    }
    snapshot(sd, fetchFile(dir, "approval-drain-expiry-first.json", gated))
    patchState(sd, { blocked_external_review_last_activity_at: isoAgo(10) })

    const expired = watch(sd, fetchFile(dir, "approval-drain-expiry-watch.json", gated), [
      "--blocked-external-drain-seconds", "1",
    ])
    expect(expired.reason).toBe("blocked-external-drained")
    expect(expired.blocked_external_review_quiet_seconds).toBeGreaterThanOrEqual(1)
    expect(expired.blocked_external_drain_seconds).toBe(1)
  })

  test("the invocation budget outranks an expired approval review-drain", () => {
    const sd = path.join(dir, "approval-drain-budget")
    const gated = {
      ...FAILING,
      head_sha: "gated-h1",
      merge_state_status: "UNSTABLE",
      checks: [{ key: "Track", name: "Track", status: "COMPLETED", conclusion: "SUCCESS", details_url: "u" }],
      threads: [],
      feedback: [],
      awaiting_approval: 1,
    }
    snapshot(sd, fetchFile(dir, "approval-drain-budget-first.json", gated))
    patchState(sd, {
      started_at: isoAgo(9 * 3600),
      last_activity_at: isoAgo(10),
      dead_time_seconds: 0,
      blocked_external_review_last_activity_at: isoAgo(10),
    })

    const expired = watch(sd, fetchFile(dir, "approval-drain-budget-watch.json", gated), [
      "--blocked-external-drain-seconds", "1",
    ])
    expect(expired.reason).toBe("max-runtime")
  })

  test("new review feedback outranks an expired approval review-drain", () => {
    const sd = path.join(dir, "approval-drain-feedback-wake")
    const gated = {
      ...FAILING,
      head_sha: "gated-h1",
      merge_state_status: "UNSTABLE",
      checks: [{ key: "Track", name: "Track", status: "COMPLETED", conclusion: "SUCCESS", details_url: "u" }],
      threads: [],
      feedback: [],
      awaiting_approval: 1,
    }
    snapshot(sd, fetchFile(dir, "approval-drain-feedback-first.json", gated))
    patchState(sd, { blocked_external_review_last_activity_at: isoAgo(10) })
    const withFeedback = {
      ...gated,
      feedback: [{ id: "C1", kind: "comment", author: "reviewer", edit_id: "e1" }],
    }

    const wake = watch(sd, fetchFile(dir, "approval-drain-feedback-watch.json", withFeedback), [
      "--blocked-external-drain-seconds", "1",
    ])
    expect(wake.reason).toBe("feedback-candidate")
  })

  test("a review lifecycle starting during an approval drain wakes for a longer bound", () => {
    const sd = path.join(dir, "approval-drain-signal")
    const gated = {
      ...FAILING,
      head_sha: "gated-h1",
      merge_state_status: "UNSTABLE",
      checks: [{ key: "Track", name: "Track", status: "COMPLETED", conclusion: "SUCCESS", details_url: "u" }],
      threads: [],
      feedback: [],
      awaiting_approval: 1,
      review_in_progress: false,
      review_signal_count: 0,
      review_signal_identities: [],
    }
    snapshot(sd, fetchFile(dir, "approval-drain-signal-first.json", gated))
    const withSignal = {
      ...gated,
      review_in_progress: true,
      review_signal_count: 1,
      review_signal_identities: ["review-bot"],
    }

    const wake = watch(sd, fetchFile(dir, "approval-drain-signal-watch.json", withSignal), [
      "--blocked-external-drain-seconds", "300",
    ])
    expect(wake.reason).toBe("blocked-external")
  })

  test("an empty statusCheckRollup (no check-runs yet) is not ok — checks_present false blocks a pipeline false-success", () => {
    const noChecks = { ...FAILING, merge_state_status: "CLEAN", review_decision: "APPROVED", checks: [], threads: [] }
    const d = snapshot(state, fetchFile(dir, "nc.json", noChecks))
    expect(d.checks_present).toBe(false)
    expect(d.all_checks_ok).toBe(false) // no observed checks -> not "ok"; the pipeline stop must not exit-success
    expect(d.checks_terminal).toBe(true) // vacuously terminal on an empty set — exactly why checks_present is needed
  })

  test("_resolve_repo_ref parses the host from the PR URL so gh api targets GHE, not github.com", () => {
    const r = spawnSync(
      "python3",
      [
        "-c",
        `from importlib.machinery import SourceFileLoader; ` +
          `m=SourceFileLoader('prs', ${JSON.stringify(SCRIPT)}).load_module(); ` +
          `print(m._resolve_repo_ref('', 'https://ghe.acme.com/o/r/pull/5')); ` +
          `print(m._host_args('ghe.acme.com')); print(m._host_args(None))`,
      ],
      { encoding: "utf8" },
    )
    expect(r.status, r.stderr).toBe(0)
    const lines = r.stdout.trim().split("\n")
    expect(lines[0]).toBe("('o', 'r', 'ghe.acme.com')")
    expect(lines[1]).toBe("['--hostname', 'ghe.acme.com']")
    expect(lines[2]).toBe("[]")
  })

  test("cross-stream alternation: ci-only then review-only then ci-only ticks flip (churn signal)", () => {
    const th = (ids: string[]) => ids.map((id) => ({ thread_id: id, last_comment_id: `c-${id}`, last_comment_at: id }))
    snapshot(state, fetchFile(dir, "a1.json", { ...FAILING, head_sha: "s1", checks: [RED_CHECK], threads: [] }))
    snapshot(state, fetchFile(dir, "a2.json", { ...FAILING, head_sha: "s2", checks: [GREEN_CHECK], threads: th(["T1"]) }))
    const d = snapshot(state, fetchFile(dir, "a3.json", { ...FAILING, head_sha: "s3", checks: [RED_CHECK], threads: [] }))
    expect(d.trajectory.stream_alternations).toBe(2) // ci -> review -> ci
  })

  test("non-thread feedback: a top-level comment / review body is actionable, mark --comment silences it, needs-human blocks ready", () => {
    const withFeedback = {
      ...FAILING,
      merge_state_status: "CLEAN",
      review_decision: "APPROVED",
      checks: [GREEN_CHECK],
      threads: [],
      feedback: [
        { id: "IC_1", kind: "comment", author: "reviewer" },
        { id: "PRR_1", kind: "review", author: "coderabbit", state: "COMMENTED" },
      ],
    }
    const f = fetchFile(dir, "fb.json", withFeedback)
    const d = snapshot(state, f)
    expect(d.counts.comments).toBe(2) // both surfaced as feedback candidates with no inline thread
    expect(d.actionable.comments.map((c: any) => c.id).sort()).toEqual(["IC_1", "PRR_1"])

    mark(state, ["--comment", "IC_1", "--disposition", "dispatched"])
    mark(state, ["--comment", "PRR_1", "--disposition", "needs-human"])
    const d2 = snapshot(state, f)
    expect(d2.counts.comments).toBe(0) // dispatched item silenced; needs-human item parked, not actionable
    expect(d2.open_needs_human).toBe(1) // parked comment blocks merge-ready just like a parked thread
  })

  test("_extract_feedback surfaces every non-empty body, the PR author's included", () => {
    const v = {
      author: { login: "me" },
      comments: [
        // The PR author's own top-level ask is how a human requests a change on an agent-opened
        // PR. Excluding it here kept the tick from ever invoking ce-resolve-pr-feedback for it.
        { id: "c-me", author: { login: "me" }, body: "please rename check_id to validate_id" },
        { id: "c-cov", author: { login: "codecov[bot]" }, body: "coverage -0.1%" },
        { id: "c-wrapper", author: { login: "chatgpt-codex-connector" }, body: CODEX_WRAPPER },
        { id: "c-near-match", author: { login: "chatgpt-codex-connector" }, body: `${CODEX_WRAPPER}\n\nP1: Preserve this appended actionable finding.` },
        { id: "c-claude", author: { login: "github-actions" }, body: "<!-- claude-review-summary -->\n## Claude Review\nBLOCKING: regenerate code" },
        { id: "c-ghost", author: null, body: "feedback from an unavailable account" },
        { id: "c-empty", author: { login: "octo-reviewer" }, body: "   " }, // empty -> excluded
      ],
      reviews: [
        { id: "r-wrapper", author: { login: "chatgpt-codex-connector" }, body: CODEX_WRAPPER.replace("50ffb4dd99", "1f95273c71"), state: "COMMENTED" },
        { id: "r-codex", author: { login: "chatgpt-codex-connector" }, body: `### 💡 Codex Review\n\nhttps://github.com/o/r/blob/abc/file.ts#L1-L2\n**P2 Block archiving core questions**\n\nAdd the invariant guard.\n\n<details> <summary>ℹ️ About Codex in GitHub</summary></details>`, state: "COMMENTED" },
        { id: "r-cr", author: { login: "coderabbitai[bot]" }, body: "Actionable comments posted: 1\n\nInline review comments failed to post. Fix the custom agent ID path.", state: "COMMENTED" },
        { id: "r-empty", author: { login: "octo-reviewer" }, body: "", state: "APPROVED" }, // empty body -> excluded
      ],
    }
    expect(extractFeedback(v).map((f: any) => f.id).sort()).toEqual([
      "c-claude", "c-cov", "c-ghost", "c-me", "c-near-match", "c-wrapper", "r-codex", "r-cr", "r-wrapper",
    ])
  })

  test("watch: wakes on actionable backlog, terminal, and merge-ready-after-settle; times out on clean-not-settled", () => {
    const GREEN = { key: "CI/test", name: "test", status: "COMPLETED", conclusion: "SUCCESS", details_url: "u" }
    // actionable backlog (FAILING has an unresolved thread + a failing check) -> wake
    expect(watch(path.join(dir, "w1"), fetchFile(dir, "wa.json", FAILING)).reason).toBe("actionable")
    // terminal PR -> wake regardless of backlog
    const term = fetchFile(dir, "wt.json", { ...FAILING, pr_state: "CLOSED", threads: [], checks: [] })
    expect(watch(path.join(dir, "w2"), term).reason).toBe("terminal")
    // clean + green but not yet settled (settle 300 > quiet ~0) -> keep watching -> times out
    const clean = { ...FAILING, merge_state_status: "CLEAN", review_decision: "APPROVED", threads: [], checks: [GREEN] }
    const cf = fetchFile(dir, "wc.json", clean)
    const unsettledDir = path.join(dir, "w3")
    snapshot(unsettledDir, cf, EXPIRING_TEST_INVOCATION)
    expect(watch(unsettledDir, cf, ["--settle-seconds", "300"]).reason).toBe("max-runtime")
    // same clean state with a zero settle window -> merge-ready wake
    expect(watch(path.join(dir, "w4"), cf, ["--settle-seconds", "0"]).reason).toBe("merge-ready")
  }, 15000) // spawns 4 watch subprocesses incl. a max-runtime timeout -> explicit timeout over Bun's 5s default

  test("watch: a newer valid watcher supersedes the old watcher and owns the only wake", async () => {
    const sd = path.join(dir, "watch-owner")
    const running = {
      ...FAILING,
      threads: [],
      checks: [{ key: "CI/test", name: "test", status: "IN_PROGRESS", conclusion: null, details_url: "u" }],
    }
    const fetch = fetchFile(dir, "watch-owner.json", running)
    snapshot(sd, fetch)
    const beforeTakeover = JSON.parse(readFileSync(path.join(sd, "state.json"), "utf8"))

    const oldWatch = startWatch(sd, fetch)
    const oldGeneration = await waitForWatchGeneration(sd)
    const newWatch = startWatch(sd, fetch)
    await waitForWatchGeneration(sd, oldGeneration)
    const afterTakeover = JSON.parse(readFileSync(path.join(sd, "state.json"), "utf8"))
    expect(afterTakeover.started_at).toBe(beforeTakeover.started_at)
    expect(afterTakeover.last_change_at).toBe(beforeTakeover.last_change_at)

    const nextFetch = `${fetch}.next`
    writeFileSync(nextFetch, JSON.stringify({
      ...running,
      threads: [{ thread_id: "T-new", last_comment_id: "C1", last_comment_at: "t1" }],
    }))
    renameSync(nextFetch, fetch)

    const [oldResult, newResult] = await Promise.all([oldWatch.result, newWatch.result])
    expect(oldResult.code, oldResult.stderr).toBe(0)
    expect(newResult.code, newResult.stderr).toBe(0)

    const wakes = [oldResult.stdout, newResult.stdout]
      .flatMap((output) => output.trim() ? output.trim().split("\n") : [])
      .map((line) => JSON.parse(line))
      .filter((event) => event.event === "BABYSIT_WAKE")
    expect(wakes).toHaveLength(1)
    expect(wakes[0].reason).toBe("actionable")
    expect(wakes[0].watch_generation).toEqual(expect.any(String))
    expect(oldResult.stdout).toBe("")

    const persisted = JSON.parse(readFileSync(path.join(sd, "state.json"), "utf8"))
    expect(persisted.watch_generation).toBe(wakes[0].watch_generation)
    expect(snapshot(sd, fetch).watch_generation).toBe(wakes[0].watch_generation)
  }, 15000)

  test("watch: a replacement that fails preflight leaves the existing watcher active", async () => {
    const sd = path.join(dir, "watch-preflight")
    const running = {
      ...FAILING,
      threads: [],
      checks: [{ key: "CI/test", name: "test", status: "IN_PROGRESS", conclusion: null, details_url: "u" }],
    }
    const fetch = fetchFile(dir, "watch-preflight.json", running)
    snapshot(sd, fetch)

    const existingWatch = startWatch(sd, fetch)
    const activeGeneration = await waitForWatchGeneration(sd)

    const invalidFetch = path.join(dir, "invalid-watch-preflight.json")
    writeFileSync(invalidFetch, "not json")
    const failedReplacement = startWatch(sd, invalidFetch)
    const failedResult = await failedReplacement.result
    expect(failedResult.code).not.toBe(0)
    expect(JSON.parse(readFileSync(path.join(sd, "state.json"), "utf8")).watch_generation).toBe(activeGeneration)

    const nextFetch = `${fetch}.next`
    writeFileSync(nextFetch, JSON.stringify({
      ...running,
      threads: [{ thread_id: "T-after-failure", last_comment_id: "C1", last_comment_at: "t1" }],
    }))
    renameSync(nextFetch, fetch)

    const existingResult = await existingWatch.result
    expect(existingResult.code, existingResult.stderr).toBe(0)
    const wake = JSON.parse(existingResult.stdout.trim())
    expect(wake.reason).toBe("actionable")
    expect(wake.watch_generation).toBe(activeGeneration)
  }, 15000)

  test("watch: an existing stop file wakes before reservation or preflight", () => {
    const sd = path.join(dir, "watch-stopped-before-arm")
    const fetch = fetchFile(dir, "watch-stopped-before-arm.json", {
      ...FAILING,
      head_sha: "incumbent-head",
      threads: [],
      checks: [{ key: "CI/test", name: "test", status: "IN_PROGRESS", conclusion: null, details_url: "u" }],
    })
    snapshot(sd, fetch)
    const statePath = path.join(sd, "state.json")
    const incumbent = JSON.parse(readFileSync(statePath, "utf8"))
    incumbent.watch_generation = "incumbent-generation"
    incumbent.watch_pid = 999999
    incumbent.watch_process_identity = "incumbent-identity"
    const before = JSON.stringify(incumbent)
    writeFileSync(statePath, before)

    const stopFile = path.join(dir, "watch-stopped-before-arm.stop")
    writeFileSync(stopFile, "stop")
    const missingFetch = path.join(dir, "watch-stopped-before-arm-must-not-fetch.json")
    const r = spawnSync(
      "python3",
      [SCRIPT, "watch", "--pr", "1", "--repo", "o/r", "--state-dir", sd,
        "--fetch-file", missingFetch, "--stop-file", stopFile,
        "--invocation-id", incumbent.invocation_id,
        "--session-started-at", incumbent.started_at,
        "--invocation-budget-seconds", String(incumbent.invocation_budget_seconds)],
      { encoding: "utf8", timeout: 5000 },
    )

    expect(r.status, r.stderr).toBe(0)
    expect(JSON.parse(r.stdout.trim())).toMatchObject({
      event: "BABYSIT_WAKE",
      reason: "stop-signal",
      watch_generation: "incumbent-generation",
    })
    expect(readFileSync(statePath, "utf8")).toBe(before)
    expect(existsSync(path.join(sd, "watch-candidate.json"))).toBe(false)
  })

  test("watch: a newer invocation supersedes an older candidate with a slow preflight", async () => {
    const sd = path.join(dir, "watch-candidate-order")
    const running = {
      ...FAILING,
      threads: [],
      checks: [{ key: "CI/test", name: "test", status: "IN_PROGRESS", conclusion: null, details_url: "u" }],
    }
    const initial = fetchFile(dir, "watch-candidate-initial.json", running)
    snapshot(sd, initial)

    const slowFetch = path.join(dir, "watch-candidate-slow.fifo")
    const mkfifo = spawnSync("mkfifo", [slowFetch], { encoding: "utf8" })
    expect(mkfifo.status, mkfifo.stderr).toBe(0)
    const olderCandidate = startWatch(sd, slowFetch)
    await Bun.sleep(200) // the older invocation is blocked in its first fetch

    const fastFetch = fetchFile(dir, "watch-candidate-fast.json", running)
    const newerCandidate = startWatch(sd, fastFetch)
    const activeGeneration = await waitForWatchGeneration(sd)
    const olderStopped = await Promise.race([
      olderCandidate.result.then(() => true),
      Bun.sleep(1000).then(() => false),
    ])
    if (!olderStopped) {
      olderCandidate.child.kill("SIGKILL")
      newerCandidate.child.kill("SIGTERM")
      await Promise.all([olderCandidate.result, newerCandidate.result])
    }
    expect(olderStopped).toBe(true)

    const nextFetch = `${fastFetch}.next`
    writeFileSync(nextFetch, JSON.stringify({
      ...running,
      threads: [{ thread_id: "T-candidate", last_comment_id: "C1", last_comment_at: "t1" }],
    }))
    renameSync(nextFetch, fastFetch)
    const newerResult = await newerCandidate.result
    expect(newerResult.code, newerResult.stderr).toBe(0)
    const wake = JSON.parse(newerResult.stdout.trim())
    expect(wake.watch_generation).toBe(activeGeneration)
  }, 15000)

  test("watch: an explicit invocation replacement emits a non-action supersession wake", async () => {
    const sd = path.join(dir, "watch-invocation-superseded")
    const running = {
      ...FAILING,
      threads: [],
      checks: [{ key: "CI/test", name: "test", status: "IN_PROGRESS", conclusion: null, details_url: "u" }],
    }
    const fetch = fetchFile(dir, "watch-invocation-superseded.json", running)
    const initial = snapshot(sd, fetch, ["--start-invocation", "--invocation-budget-seconds", "28800"])
    const oldWatch = startWatch(sd, fetch)
    await waitForWatchGeneration(sd)

    const replacement = snapshot(sd, fetch, ["--start-invocation", "--invocation-budget-seconds", "12345"])
    const replacementClock = {
      invocation_id: replacement.invocation_id,
      started_at: replacement.invocation_started_at,
      invocation_budget_seconds: replacement.invocation_budget_seconds,
    }

    const result = await oldWatch.result
    expect(result.code, result.stderr).toBe(0)
    const wake = JSON.parse(result.stdout.trim())
    expect(wake).toEqual({
      event: "BABYSIT_WAKE",
      reason: "invocation-superseded",
      watch_generation: expect.any(String),
      superseded_invocation_id: initial.invocation_id,
      current_invocation_id: replacement.invocation_id,
    })

    const persisted = JSON.parse(readFileSync(path.join(sd, "state.json"), "utf8"))
    expect({
      invocation_id: persisted.invocation_id,
      started_at: persisted.started_at,
      invocation_budget_seconds: persisted.invocation_budget_seconds,
    }).toEqual(replacementClock)
  }, 15000)

  test("watch: an expired old budget cannot emit max-runtime after invocation replacement", async () => {
    const sd = path.join(dir, "watch-expired-invocation-superseded")
    const running = {
      ...FAILING,
      threads: [],
      checks: [{ key: "CI/test", name: "test", status: "IN_PROGRESS", conclusion: null, details_url: "u" }],
    }
    const fetch = fetchFile(dir, "watch-expired-invocation-superseded.json", running)
    const initial = snapshot(sd, fetch, EXPIRING_TEST_INVOCATION)
    const oldWatch = startWatch(sd, fetch, [
      "--interval", "5",
      "--invocation-id", initial.invocation_id,
      "--session-started-at", initial.invocation_started_at,
      "--invocation-budget-seconds", "1",
    ])
    await waitForWatchGeneration(sd)

    const replacement = snapshot(sd, fetch, ["--start-invocation", "--invocation-budget-seconds", "28800"])
    const result = await oldWatch.result
    expect(result.code, result.stderr).toBe(0)
    expect(JSON.parse(result.stdout.trim())).toEqual({
      event: "BABYSIT_WAKE",
      reason: "invocation-superseded",
      watch_generation: expect.any(String),
      superseded_invocation_id: initial.invocation_id,
      current_invocation_id: replacement.invocation_id,
    })
  }, 15000)

  test("watch: takeover interrupts an old watcher blocked in its next fetch", async () => {
    const sd = path.join(dir, "watch-blocked-fetch")
    const running = {
      ...FAILING,
      threads: [],
      checks: [{ key: "CI/test", name: "test", status: "IN_PROGRESS", conclusion: null, details_url: "u" }],
    }
    const oldFetch = fetchFile(dir, "watch-blocked-old.json", running)
    snapshot(sd, oldFetch)

    const oldWatch = startWatch(sd, oldFetch, ["--interval", "0.2"])
    const oldGeneration = await waitForWatchGeneration(sd)
    const fifo = `${oldFetch}.fifo`
    const mkfifo = spawnSync("mkfifo", [fifo], { encoding: "utf8" })
    expect(mkfifo.status, mkfifo.stderr).toBe(0)
    renameSync(fifo, oldFetch)
    await Bun.sleep(300) // the old generation is now blocked opening the FIFO for its next fetch

    const replacementFetch = fetchFile(dir, "watch-blocked-new.json", running)
    const replacement = startWatch(sd, replacementFetch)
    await waitForWatchGeneration(sd, oldGeneration)

    const stoppedPromptly = await Promise.race([
      oldWatch.result.then(() => true),
      Bun.sleep(1000).then(() => false),
    ])
    if (!stoppedPromptly) oldWatch.child.kill("SIGKILL")
    expect(stoppedPromptly).toBe(true)
    replacement.child.kill("SIGTERM")
    await replacement.result
  }, 15000)

  test("watch: an in-flight poll cannot persist after its generation becomes stale", async () => {
    const sd = path.join(dir, "watch-stale-poll")
    const running = {
      ...FAILING,
      head_sha: "current-head",
      threads: [],
      checks: [{ key: "CI/test", name: "test", status: "IN_PROGRESS", conclusion: null, details_url: "u" }],
    }
    const fetch = fetchFile(dir, "watch-stale-poll.json", running)
    snapshot(sd, fetch)
    const oldWatch = startWatch(sd, fetch, ["--interval", "0.2"])
    await waitForWatchGeneration(sd)

    const fifo = `${fetch}.fifo`
    const mkfifo = spawnSync("mkfifo", [fifo], { encoding: "utf8" })
    expect(mkfifo.status, mkfifo.stderr).toBe(0)
    renameSync(fifo, fetch)
    await Bun.sleep(300)

    const statePath = path.join(sd, "state.json")
    const replacementState = JSON.parse(readFileSync(statePath, "utf8"))
    replacementState.watch_generation = "replacement-generation"
    const nextState = `${statePath}.next`
    writeFileSync(nextState, JSON.stringify(replacementState))
    renameSync(nextState, statePath)
    writeFileSync(fetch, JSON.stringify({ ...running, head_sha: "stale-head" }))

    const result = await oldWatch.result
    expect(result.code, result.stderr).toBe(0)
    const persisted = JSON.parse(readFileSync(statePath, "utf8"))
    expect(persisted.watch_generation).toBe("replacement-generation")
    expect(persisted.head_sha).toBe("current-head")
  }, 15000)

  test("watch: preflight stays read-only until activation fences incumbent persistence", () => {
    const sd = path.join(dir, "watch-preflight-fence")
    const base = fetchFile(dir, "watch-preflight-fence-base.json", {
      ...FAILING,
      head_sha: "base-head",
      threads: [],
      checks: [{ key: "CI/test", name: "test", status: "IN_PROGRESS", conclusion: null, details_url: "u" }],
    })
    const incumbent = fetchFile(dir, "watch-preflight-fence-incumbent.json", {
      ...FAILING,
      head_sha: "incumbent-head",
      threads: [],
      checks: [{ key: "CI/test", name: "test", status: "IN_PROGRESS", conclusion: null, details_url: "u" }],
    })
    const successor = fetchFile(dir, "watch-preflight-fence-successor.json", {
      ...FAILING,
      head_sha: "successor-head",
      threads: [],
      checks: [{ key: "CI/test", name: "test", status: "IN_PROGRESS", conclusion: null, details_url: "u" }],
    })
    snapshot(sd, base)
    const statePath = path.join(sd, "state.json")
    const active = JSON.parse(readFileSync(statePath, "utf8"))
    active.watch_generation = "incumbent-generation"
    writeFileSync(statePath, JSON.stringify(active))

    const python = `
import json, subprocess, time
from importlib.machinery import SourceFileLoader
from types import SimpleNamespace
m = SourceFileLoader("prs", ${JSON.stringify(SCRIPT)}).load_module()
state_dir = ${JSON.stringify(sd)}
state_path = ${JSON.stringify(statePath)}
invocation = json.load(open(state_path))
args = SimpleNamespace(state_dir=state_dir, pr=1, repo="o/r",
                       fetch_file=${JSON.stringify(successor)}, reset_session=False,
                       start_invocation=False, continue_invocation=False,
                       invocation_id=invocation["invocation_id"],
                       session_started_at=invocation["started_at"],
                       invocation_budget_seconds=invocation["invocation_budget_seconds"])
generation = "successor-generation"
m._reserve_watch_candidate(args, generation)
cur = m._fetch_snapshot(args)
assert json.load(open(state_path))["head_sha"] == "base-head", "preflight mutated persisted state"

original_diff = m.diff
child = None
def diff_with_incumbent_race(state, current, now=None, advance_trajectory=True):
    global child
    child_code = '''
import json
from importlib.machinery import SourceFileLoader
from types import SimpleNamespace
m = SourceFileLoader("prs_child", ${JSON.stringify(SCRIPT)}).load_module()
invocation = json.load(open(${JSON.stringify(statePath)}))
args = SimpleNamespace(state_dir=${JSON.stringify(sd)}, pr=1, repo="o/r",
                       fetch_file=${JSON.stringify(incumbent)}, reset_session=False,
                       start_invocation=False, continue_invocation=False,
                       invocation_id=invocation["invocation_id"],
                       session_started_at=invocation["started_at"],
                       invocation_budget_seconds=invocation["invocation_budget_seconds"])
try:
    m._run_snapshot(args, m._now(), advance_trajectory=False,
                    watch_generation="incumbent-generation")
except m._WatchSuperseded:
    pass
else:
    raise SystemExit("stale incumbent persist was not rejected")
'''
    child = subprocess.Popen(["python3", "-c", child_code], stdout=subprocess.PIPE,
                             stderr=subprocess.PIPE, text=True)
    time.sleep(0.2)
    assert child.poll() is None, "incumbent was not blocked by atomic activation"
    return original_diff(state, current, now, advance_trajectory=advance_trajectory)

m.diff = diff_with_incumbent_race
previous, actionable = m._activate_watch(args, generation, m._now(), cur)
stdout, stderr = child.communicate(timeout=5)
assert child.returncode == 0, stderr
persisted = json.load(open(state_path))
print(json.dumps({"generation": persisted["watch_generation"], "head": persisted["head_sha"]}))
`
    const r = spawnSync("python3", ["-c", python], { encoding: "utf8", timeout: 10000 })
    expect(r.status, r.stderr).toBe(0)
    expect(JSON.parse(r.stdout)).toEqual({ generation: "successor-generation", head: "successor-head" })
  })

  test("watch: PID identity must still match before a replaced watcher is signaled", () => {
    const python = `
import json
from importlib.machinery import SourceFileLoader
m = SourceFileLoader("prs", ${JSON.stringify(SCRIPT)}).load_module()
signals = []
m.os.kill = lambda pid, sig: signals.append([pid, sig])
m._process_identity = lambda pid: {123: "different", 124: None, 125: "same"}.get(pid)
for pid, identity in ((123, "old"), (124, "old"), (125, "same")):
    m._terminate_replaced_watch({"pid": pid, "process_identity": identity})
print(json.dumps(signals))
`
    const r = spawnSync("python3", ["-c", python], { encoding: "utf8" })
    expect(r.status, r.stderr).toBe(0)
    expect(JSON.parse(r.stdout)).toEqual([[125, 15]])
  })

  test("watch: takeover interrupts and reaps an active fetch subprocess", () => {
    const childPid = path.join(dir, "watch-fetch-child.pid")
    const python = `
import os, signal, subprocess, threading, time
from importlib.machinery import SourceFileLoader
from types import SimpleNamespace
m = SourceFileLoader("prs", ${JSON.stringify(SCRIPT)}).load_module()
pid_file = ${JSON.stringify(childPid)}
def fake_snapshot(args, now, advance_trajectory=True, watch_generation=None):
    subprocess.run(["sh", "-c", "echo $$ > " + pid_file + "; exec sleep 30"], check=True)
    return {"counts": {}, "pr_state": "OPEN", "session_seconds": 0}
def stop_when_child_starts():
    deadline = time.time() + 5
    while time.time() < deadline and not os.path.exists(pid_file):
        time.sleep(0.01)
    os.kill(os.getpid(), signal.SIGTERM)
m._run_snapshot = fake_snapshot
m._fetch_snapshot = lambda args: {}
m._reserve_watch_candidate = lambda args, generation: {}
m._clear_watch_candidate = lambda args, generation: None
m._activate_watch = lambda args, generation, now, cur: (
    {}, {"counts": {}, "pr_state": "OPEN", "session_seconds": 0})
m._terminate_replaced_watch = lambda previous: None
m._watch_is_current = lambda args, generation: True
m._wake_reason = lambda actionable, settle_seconds: None
threading.Thread(target=stop_when_child_starts, daemon=True).start()
args = SimpleNamespace(reset_session=False, stop_file=None, settle_seconds=300, max_runtime=0,
                       interval=0.01, state_dir=${JSON.stringify(dir)}, pr=1, repo="o/r")
started = time.time()
m.cmd_watch(args)
pid = int(open(pid_file).read())
alive = True
try:
    os.kill(pid, 0)
except ProcessLookupError:
    alive = False
print(f"{alive} {time.time() - started:.3f}")
`
    const r = spawnSync("python3", ["-c", python], { encoding: "utf8", timeout: 5000 })
    expect(r.status, r.stderr).toBe(0)
    const [alive, elapsed] = r.stdout.trim().split(" ")
    expect(alive).toBe("False")
    expect(Number(elapsed)).toBeLessThan(2)
  })

  test("watch: stale teardown ignores a late takeover SIGTERM and ordinary teardown restores it", () => {
    const python = `
import json, os, signal, threading, time
from importlib.machinery import SourceFileLoader
from types import SimpleNamespace
m = SourceFileLoader("prs", ${JSON.stringify(SCRIPT)}).load_module()
args = SimpleNamespace(reset_session=False, stop_file=None, settle_seconds=300, max_runtime=0,
                       interval=0.01, state_dir=${JSON.stringify(dir)}, pr=1, repo="o/r")
actionable = {"counts": {}, "pr_state": "OPEN", "session_seconds": 0}
m._reserve_watch_candidate = lambda args, generation: {}
m._clear_watch_candidate = lambda args, generation: None
m._fetch_snapshot = lambda args: {}
m._activate_watch = lambda args, generation, now, cur: ({}, actionable)
m._terminate_replaced_watch = lambda previous: None
m._emit_wake_if_current = lambda *args, **kwargs: True

real_signal = signal.signal
signal_calls = 0
final_handler_installed = threading.Event()
def track_signal(signum, handler):
    global signal_calls
    result = real_signal(signum, handler)
    if signum == signal.SIGTERM:
        signal_calls += 1
        if signal_calls == 2:
            final_handler_installed.set()
            time.sleep(0.2)
    return result
def send_late_takeover_signal():
    if not final_handler_installed.wait(2):
        os._exit(2)
    os.kill(os.getpid(), signal.SIGTERM)

m.signal.signal = track_signal
m._watch_is_current = lambda args, generation: False
sender = threading.Thread(target=send_late_takeover_signal)
sender.start()
m.cmd_watch(args)
sender.join(timeout=2)
assert not sender.is_alive()

m.signal.signal = real_signal
def caller_handler(_signum, _frame):
    pass
real_signal(signal.SIGTERM, caller_handler)
m._watch_is_current = lambda args, generation: True
m._wake_reason = lambda actionable, settle_seconds: "actionable"
m.cmd_watch(args)
print(json.dumps({"ordinary_restored": signal.getsignal(signal.SIGTERM) is caller_handler}))
`
    const r = spawnSync("python3", ["-c", python], { encoding: "utf8", timeout: 5000 })
    expect(r.status, r.stderr).toBe(0)
    expect(JSON.parse(r.stdout)).toEqual({ ordinary_restored: true })
  })

  test("fetch_threads follows every GraphQL page before returning unresolved threads", () => {
    const python = `
import json
from importlib.machinery import SourceFileLoader
m = SourceFileLoader("prs", ${JSON.stringify(SCRIPT)}).load_module()
calls = []
class Result: pass
def fake(args, label):
    calls.append(args)
    second = any(arg == "cursor=page-2" for arg in args)
    node = {"id": "T2" if second else "T1", "isResolved": False, "path": "x", "line": 1,
            "comments": {"nodes": [{"id": "C2" if second else "C1", "createdAt": "t2" if second else "t1", "lastEditedAt": None}]}}
    page = {"nodes": [node], "pageInfo": {"hasNextPage": not second, "endCursor": None if second else "page-2"}}
    result = Result()
    result.returncode = 0
    result.stderr = ""
    result.stdout = json.dumps({"data": {"repository": {"pullRequest": {"reviewThreads": page}}}})
    return result
m._run_checked = fake
threads = m.fetch_threads(1, "o", "r")
print(json.dumps({"ids": [t["thread_id"] for t in threads], "calls": calls}))
`
    const r = spawnSync("python3", ["-c", python], { encoding: "utf8" })
    expect(r.status, r.stderr).toBe(0)
    const result = JSON.parse(r.stdout)
    expect(result.ids).toEqual(["T1", "T2"])
    expect(result.calls).toHaveLength(2)
    expect(result.calls[1]).toContain("cursor=page-2")
  })

  test("watch: managed target freshness blocks ordinary CLEAN merge-ready", () => {
    const GREEN = { key: "CI/test", name: "test", status: "COMPLETED", conclusion: "SUCCESS", details_url: "u" }
    const managedStale = {
      ...FAILING,
      merge_state_status: "CLEAN",
      review_decision: "APPROVED",
      checks: [GREEN],
      threads: [],
      pr_chain: {
        manager_status: "confirmed",
        manager_source: "gh-stack",
        relationship_status: "dependent",
        target_needs_rebase: true,
        upstack_needs_rebase: [],
      },
    }
    expect(wakeReason(snapshot(path.join(dir, "stack-stale"), fetchFile(dir, "stack-stale.json", managedStale)))).toBe("stack-blocked")
  }, 15000)

  test("watch: unknown managed freshness blocks ready, while stale upstack alone still permits ready-as-next", () => {
    const GREEN = { key: "CI/test", name: "test", status: "COMPLETED", conclusion: "SUCCESS", details_url: "u" }
    const base = {
      ...FAILING,
      merge_state_status: "CLEAN",
      review_decision: "APPROVED",
      checks: [GREEN],
      threads: [],
    }
    const unknown = {
      ...base,
      pr_chain: {
        manager_status: "confirmed",
        manager_source: "graphql",
        relationship_status: "dependent",
        target_needs_rebase: null,
        upstack_needs_rebase: [],
      },
    }
    expect(wakeReason(snapshot(path.join(dir, "stack-unknown"), fetchFile(dir, "stack-unknown.json", unknown)))).toBe("stack-blocked")

    const readyAsNext = {
      ...base,
      pr_chain: {
        manager_status: "confirmed",
        manager_source: "gh-stack",
        relationship_status: "dependent",
        target_needs_rebase: false,
        upstack_needs_rebase: [{ number: 43, position: 3 }],
      },
    }
    expect(wakeReason(snapshot(path.join(dir, "stack-up"), fetchFile(dir, "stack-up.json", readyAsNext)))).toBe("merge-ready")
  }, 15000)

  test("watch: manager probe error is a residual, not an unmanaged merge-ready fallback", () => {
    const GREEN = { key: "CI/test", name: "test", status: "COMPLETED", conclusion: "SUCCESS", details_url: "u" }
    const probeError = {
      ...FAILING,
      merge_state_status: "CLEAN",
      review_decision: "APPROVED",
      checks: [GREEN],
      threads: [],
      pr_chain: {
        manager_status: "probe-error",
        manager_source: null,
        relationship_status: "independent",
        target_needs_rebase: null,
        upstack_needs_rebase: [],
      },
    }
    expect(wakeReason(snapshot(path.join(dir, "stack-error"), fetchFile(dir, "stack-error.json", probeError)))).toBe("stack-blocked")
  }, 15000)

  test("watch: unresolved ordinary relationship classification also blocks an independent-readiness claim", () => {
    const GREEN = { key: "CI/test", name: "test", status: "COMPLETED", conclusion: "SUCCESS", details_url: "u" }
    const relationshipError = {
      ...FAILING,
      merge_state_status: "CLEAN",
      review_decision: "APPROVED",
      checks: [GREEN],
      threads: [],
      pr_chain: {
        manager_status: "absent",
        manager_source: null,
        relationship_status: "probe-error",
        target_needs_rebase: null,
        upstack_needs_rebase: [],
      },
    }
    expect(wakeReason(snapshot(path.join(dir, "relationship-error"), fetchFile(dir, "relationship-error.json", relationshipError)))).toBe("stack-blocked")
  }, 15000)

  test("watch: labels a comments-only wake as a feedback candidate while CI is running", () => {
    const RUNNING = { key: "CI/test", name: "test", status: "IN_PROGRESS", conclusion: null, details_url: "u" }
    const candidate = {
      ...FAILING,
      threads: [],
      checks: [RUNNING],
      feedback: [{ id: "IC_status", kind: "comment", author: "review-bot", edit_id: "status-v1" }],
    }
    expect(watch(path.join(dir, "wfc"), fetchFile(dir, "wfc.json", candidate)).reason).toBe("feedback-candidate")
  }, 15000)

  test("watch: an in-progress review signal blocks until the 15-minute stale-review check", () => {
    const base = {
      ...FAILING,
      merge_state_status: "CLEAN",
      review_decision: "APPROVED",
      threads: [],
      checks: [GREEN_CHECK],
      counts: { threads: 0, ci: 0, comments: 0 },
      checks_terminal: true,
      has_failing_checks: false,
      checks_awaiting_approval: 0,
      open_needs_human: 0,
      stack_blocker: null,
    }
    expect(wakeReason({ ...base, review_in_progress: true, quiet_seconds: 899 }, 0)).toBeNull()
    expect(wakeReason({ ...base, review_in_progress: true, quiet_seconds: 900 }, 0)).toBe("merge-ready")
    expect(wakeReason({ ...base, review_in_progress: false, quiet_seconds: 0 }, 0)).toBe("merge-ready")
  })

  test("snapshot: remembers an incomplete current-head review after the eyes signal disappears", () => {
    const base = {
      ...FAILING,
      merge_state_status: "CLEAN",
      review_decision: "APPROVED",
      threads: [],
      checks: [GREEN_CHECK],
    }

    snapshot(state, fetchFile(dir, "signal-absent.json", { ...base, review_in_progress: false }))
    const statePath = path.join(state, "state.json")
    const prior = JSON.parse(readFileSync(statePath, "utf8"))
    prior.last_change_at = "2026-07-17T12:00:00+00:00"
    writeFileSync(statePath, JSON.stringify(prior))

    const started = snapshot(state, fetchFile(dir, "signal-started.json", { ...base, review_in_progress: true }))
    expect(started.review_signal_seen_on_head).toBe(true)
    expect(started.review_signal_first_seen_at).toBe(started.review_signal_last_changed_at)
    expect(started.review_signal_first_seen_at).not.toBe(prior.last_change_at)
    const firstSeenAt = started.review_signal_first_seen_at

    const disappeared = snapshot(state, fetchFile(dir, "signal-disappeared.json", { ...base, review_in_progress: false }))
    expect(disappeared.review_in_progress).toBe(false)
    expect(disappeared.review_signal_seen_on_head).toBe(true)
    expect(disappeared.review_signal_first_seen_at).toBe(firstSeenAt)
    expect(disappeared.review_signal_last_changed_at).not.toBe(firstSeenAt)
    expect(disappeared.changed_this_tick).toBe(true)
    expect(disappeared.quiet_seconds).toBeLessThan(2)

    const nextHead = snapshot(state, fetchFile(dir, "signal-new-head.json", {
      ...base,
      head_sha: "s2",
      review_in_progress: false,
    }))
    expect(nextHead.review_signal_seen_on_head).toBe(false)
    expect(nextHead.review_signal_first_seen_at).toBeNull()
    expect(nextHead.review_signal_last_changed_at).toBeNull()
  })

  test("snapshot: eyes identity changes reset quiet time even when the count stays fixed", () => {
    expect(eyesReactionIdentities([[
      { content: "eyes", user: { node_id: "U_bot_b" } },
      { content: "eyes", user: { node_id: "U_bot_a" } },
      { content: "+1", user: { node_id: "U_other" } },
    ]])).toEqual(["U_bot_a", "U_bot_b"])

    const base = {
      ...FAILING,
      merge_state_status: "CLEAN",
      review_decision: "APPROVED",
      threads: [],
      checks: [GREEN_CHECK],
      review_in_progress: true,
    }
    const first = snapshot(state, fetchFile(dir, "signal-count-one.json", {
      ...base,
      review_signal_identities: ["U_bot_a"],
    }))
    expect(first.review_signal_count).toBe(1)
    expect(first.review_signal_identities).toEqual(["U_bot_a"])
    const statePath = path.join(state, "state.json")
    const prior = JSON.parse(readFileSync(statePath, "utf8"))
    prior.last_change_at = "2026-07-17T12:00:00+00:00"
    prior.review_signal_last_changed_at = prior.last_change_at
    writeFileSync(statePath, JSON.stringify(prior))

    const swapped = snapshot(state, fetchFile(dir, "signal-reviewer-swapped.json", {
      ...base,
      review_signal_identities: ["U_bot_b"],
    }))
    expect(swapped.review_in_progress).toBe(true)
    expect(swapped.review_signal_count).toBe(1)
    expect(swapped.review_signal_identities).toEqual(["U_bot_b"])
    expect(swapped.review_signal_last_changed_at).not.toBe(prior.review_signal_last_changed_at)
    expect(swapped.changed_this_tick).toBe(true)
    expect(swapped.quiet_seconds).toBeLessThan(2)

    const persisted = JSON.parse(readFileSync(statePath, "utf8"))
    persisted.last_change_at = "2026-07-17T12:00:00+00:00"
    persisted.review_signal_last_changed_at = persisted.last_change_at
    writeFileSync(statePath, JSON.stringify(persisted))

    const unchanged = snapshot(state, fetchFile(dir, "signal-reviewer-unchanged.json", {
      ...base,
      review_signal_identities: ["U_bot_b"],
    }))
    expect(unchanged.review_in_progress).toBe(true)
    expect(unchanged.review_signal_count).toBe(1)
    expect(unchanged.changed_this_tick).toBe(false)
    expect(unchanged.quiet_seconds).toBeGreaterThan(60)
  })

  test("snapshot: a count-only legacy review signal migrates to reactor identities", () => {
    const base = {
      ...FAILING,
      merge_state_status: "CLEAN",
      review_decision: "APPROVED",
      threads: [],
      checks: [GREEN_CHECK],
      review_in_progress: true,
      review_signal_count: 1,
    }
    snapshot(state, fetchFile(dir, "signal-legacy-count.json", base))
    const statePath = path.join(state, "state.json")
    const legacy = JSON.parse(readFileSync(statePath, "utf8"))
    delete legacy.review_signal_identities
    legacy.last_change_at = "2026-07-17T12:00:00+00:00"
    legacy.review_signal_last_changed_at = legacy.last_change_at
    writeFileSync(statePath, JSON.stringify(legacy))

    const migrated = snapshot(state, fetchFile(dir, "signal-identity-aware.json", {
      ...base,
      review_signal_identities: ["U_bot_a"],
    }))
    expect(migrated.review_in_progress).toBe(true)
    expect(migrated.review_signal_count).toBe(1)
    expect(migrated.review_signal_identities).toEqual(["U_bot_a"])
    expect(migrated.review_signal_seen_on_head).toBe(true)
    expect(migrated.changed_this_tick).toBe(true)
    expect(migrated.quiet_seconds).toBeLessThan(2)
  })

  test("watch: a no-check MERGEABLE/CLEAN PR still reaches merge-ready (the >=1-check guard is pipeline-only)", () => {
    // A repo with no configured checks: all_checks_ok is false (no observed check), but the
    // interactive merge-ready wake must still fire for a CLEAN/MERGEABLE PR with no backlog.
    const nochecks = { ...FAILING, merge_state_status: "CLEAN", review_decision: "APPROVED", threads: [], checks: [] }
    expect(watch(path.join(dir, "nc1"), fetchFile(dir, "nc1.json", nochecks), ["--settle-seconds", "0"]).reason).toBe("merge-ready")
  }, 15000)

  test("watch: a dispatched terminal-red check present at arm is a standing residual — kept watching, not re-woken", () => {
    // A failing check ce-debug marked dispatched leaves counts.ci == 0 while has_failing_checks stays
    // true. It was already surfaced when it was dispatched, so it is in the watch's arm-time baseline
    // and must NOT re-wake the loop (that was the pre-gating behavior); the watch keeps running for
    // other streams. `blocked-failing` only fires on a *later* transition to terminal-red (e.g. a
    // rerun completing red) — the same wake-on-new path the parked-needs-human test exercises.
    const red = { ...FAILING, threads: [], checks: [{ key: "CI/test", name: "test", status: "COMPLETED", conclusion: "FAILURE", details_url: "u" }] }
    const rf = fetchFile(dir, "wbf.json", red)
    const sd = path.join(dir, "wbf")
    snapshot(sd, rf, EXPIRING_TEST_INVOCATION) // this standing-residual watch deliberately expires
    mark(sd, ["--check", "CI/test"]) // now dispatched -> counts.ci == 0, terminal-red residual, already surfaced
    expect(watch(sd, rf).reason).toBe("max-runtime")
  }, 15000)

  test("watch: a parked needs-human does not wake or end the loop — it keeps watching the other streams", () => {
    // The stop-vs-residual fix: a standing needs-human present at arm time must NOT re-wake the
    // detector (that would busy-wake / falsely terminate the self-sustaining watch); the watch keeps
    // polling for new work and only wakes when something genuinely new arrives.
    const sd = path.join(dir, "nhwatch")
    const base = (extra: any[] = []) => ({
      pr_state: "OPEN", mergeable: "MERGEABLE", merge_state_status: "CLEAN", review_decision: null,
      head_sha: "s1", url: "http://x/1", checks: [],
      threads: [{ thread_id: "T1", last_comment_id: "C1", last_comment_at: "C1" }, ...extra],
    })
    snapshot(sd, fetchFile(dir, "nhw1.json", base()), EXPIRING_TEST_INVOCATION)
    mark(sd, ["--thread", "T1", "--disposition", "needs-human"])
    // parked needs-human, nothing else actionable -> keeps watching, times out (does NOT wake needs-human)
    expect(watch(sd, fetchFile(dir, "nhw2.json", base())).reason).toBe("max-runtime")
    // The capped invocation is over. A later explicit invocation preserves the parked disposition,
    // while a new actionable thread still wakes that new invocation.
    const withNew = fetchFile(dir, "nhw3.json", base([{ thread_id: "T2", last_comment_id: "D1", last_comment_at: "D1" }]))
    snapshot(sd, withNew, ["--start-invocation"])
    expect(watch(sd, withNew).reason).toBe("actionable")
  }, 15000)

  // Incident: two CLEAN PRs received `git merge origin/main` after a sibling merged, one pushed
  // (restarting green CI). Ordinary base movement with CLEAN never yields a currency item, so the
  // engine flags a two-parent head whose second parent is the base tip and no claimed item
  // produced it. The wake is a distinct reason so the tick reports it as a defect, not maintenance.
  test("unrequested base merge: a base-parent merge head with no claimed currency item is flagged and wakes once", () => {
    const base = { host: "github.com", repository: "o/r", ref: "main",
      oid: "2222222222222222222222222222222222222222", graphql_oid: "2222222222222222222222222222222222222222",
      historical_oid: "1111111111111111111111111111111111111111", identity: "current" }
    const clean = {
      ...FAILING, merge_state_status: "CLEAN", review_decision: "APPROVED",
      checks: [{ key: "CI/test", name: "test", status: "COMPLETED", conclusion: "SUCCESS", details_url: "u" }],
      threads: [], base, head_sha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      head_parents: ["9999999999999999999999999999999999999999"],
    }
    const first = snapshot(state, fetchFile(dir, "ubm-1.json", clean))
    expect(first.unrequested_base_merge).toBeNull()

    // A plain new commit (single parent) is not flagged.
    const plain = snapshot(state, fetchFile(dir, "ubm-2.json", { ...clean,
      head_sha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      head_parents: ["aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"] }))
    expect(plain.unrequested_base_merge).toBeNull()

    // A merge whose second parent is the base tip, with no currency item ever claimed → flagged.
    const merged = snapshot(state, fetchFile(dir, "ubm-3.json", { ...clean,
      head_sha: "cccccccccccccccccccccccccccccccccccccccc",
      head_parents: ["bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", "2222222222222222222222222222222222222222"] }))
    expect(merged.unrequested_base_merge).toEqual(expect.objectContaining({
      head: "cccccccccccccccccccccccccccccccccccccccc",
      base_parent: "2222222222222222222222222222222222222222",
    }))
    expect(wakeReason(merged)).toBe("unrequested-base-merge")
    // Persists on the same head across polls; cleared by the next head.
    const again = snapshot(state, fetchFile(dir, "ubm-3.json", { ...clean,
      head_sha: "cccccccccccccccccccccccccccccccccccccccc",
      head_parents: ["bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", "2222222222222222222222222222222222222222"] }))
    expect(again.unrequested_base_merge?.head).toBe("cccccccccccccccccccccccccccccccccccccccc")
    const next = snapshot(state, fetchFile(dir, "ubm-4.json", { ...clean,
      head_sha: "dddddddddddddddddddddddddddddddddddddddd",
      head_parents: ["cccccccccccccccccccccccccccccccccccccccc"] }))
    expect(next.unrequested_base_merge).toBeNull()
    expect(wakeReason(next)).not.toBe("unrequested-base-merge")
  })

  // Observed live (tmchow/pr-stack-test, 2026-08-17): after a squash-merge to main GitHub kept
  // MERGEABLE/CLEAN but left potentialMergeCommit on the old base for 20+ minutes, so `race`
  // never cleared and every harness idled to budget. The degrade accepts the cached verdict once
  // head and live base have been stable that long, and discloses it.
  test("stale merge computation: a head-matching race degrades to stale-computation after the bounded window", () => {
    const race = {
      ...FAILING, merge_state_status: "CLEAN", review_decision: "APPROVED",
      checks: [{ key: "CI/test", name: "test", status: "COMPLETED", conclusion: "SUCCESS", details_url: "u" }],
      threads: [], head_sha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      base: { host: "github.com", repository: "o/r", ref: "main",
        oid: "2222222222222222222222222222222222222222", graphql_oid: "2222222222222222222222222222222222222222",
        historical_oid: "1111111111111111111111111111111111111111",
        merge_parent_oids: ["1111111111111111111111111111111111111111", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"],
        identity: "race", stale_computation_candidate: true },
    }
    const file = fetchFile(dir, "stale-race.json", race)
    const first = snapshot(state, file)
    expect(first.base_ref_blocker).toBe("race")
    expect(first.mergeability_certain).toBe(false)
    expect(wakeReason(first)).toBe("base-ref-blocked")

    const statePath = path.join(state, "state.json")
    const persisted = JSON.parse(readFileSync(statePath, "utf8"))
    expect(persisted.stale_merge_computation?.key).toBe(
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:2222222222222222222222222222222222222222")
    persisted.stale_merge_computation.first_seen_at = "2026-07-17T12:00:00+00:00"
    persisted.last_change_at = "2026-07-17T12:00:00+00:00"
    writeFileSync(statePath, JSON.stringify(persisted))

    const later = snapshot(state, file)
    expect(later.base.identity).toBe("stale-computation")
    expect(later.base.merge_computation_stale).toBe(true)
    expect(later.base_ref_blocker).toBeNull()
    expect(later.mergeability_certain).toBe(true)
    expect(wakeReason(later)).toBe("merge-ready")

    // A pending (unclassified) head forces uncertainty even through the stale-computation degrade.
    const pendingStale = snapshot(state, fetchFile(dir, "stale-race-pending.json", { ...race,
      head_sha: "cccccccccccccccccccccccccccccccccccccccc", head_parents: null,
      base: { ...race.base, merge_parent_oids: ["1111111111111111111111111111111111111111", "cccccccccccccccccccccccccccccccccccccccc"] } }))
    expect(pendingStale.unrequested_base_merge_pending).toBe(true)
    const sp = JSON.parse(readFileSync(statePath, "utf8"))
    sp.stale_merge_computation.first_seen_at = "2026-07-17T12:00:00+00:00"
    writeFileSync(statePath, JSON.stringify(sp))
    const pendingStale2 = snapshot(state, fetchFile(dir, "stale-race-pending.json", { ...race,
      head_sha: "cccccccccccccccccccccccccccccccccccccccc", head_parents: null,
      base: { ...race.base, merge_parent_oids: ["1111111111111111111111111111111111111111", "cccccccccccccccccccccccccccccccccccccccc"] } }))
    expect(pendingStale2.base_ref_blocker).toBe("mergeability-pending")
    expect(pendingStale2.mergeability_certain).toBe(false)

    // A base parent that does not match the head is a genuine race, never degraded.
    const genuine = snapshot(path.join(dir, "genuine-race"), fetchFile(dir, "genuine-race.json", {
      ...race, base: { ...race.base, stale_computation_candidate: false } }))
    expect(genuine.base_ref_blocker).toBe("race")
    // A moved head resets the window.
    const moved = snapshot(state, fetchFile(dir, "stale-race-moved.json", { ...race,
      head_sha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      base: { ...race.base, merge_parent_oids: ["1111111111111111111111111111111111111111", "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"] } }))
    expect(moved.base_ref_blocker).toBe("race")
  })

  // Pipelined stack traversal: the watcher polls the active (upper) layer and keeps probing the
  // lower layers it was told about. A NEW thread / comment / failing check / head below wakes
  // `downstack-actionable` so the walk returns to the lowest unsettled layer; what was already
  // there at arm time (parked, dispatched) does not.
  test("downstack probe: a new lower-layer item wakes downstack-actionable; the arm-time baseline does not", async () => {
    const quietUpper = {
      ...FAILING, merge_state_status: "BLOCKED", review_decision: null,
      checks: [{ key: "CI/test", name: "test", status: "IN_PROGRESS", conclusion: null, details_url: "u" }],
      threads: [], head_sha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    }
    const upperFile = fetchFile(dir, "upper.json", quietUpper)
    const lowerQuiet = { pr_state: "OPEN", head_sha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", threads: [], feedback: [],
      checks: [{ key: "CI/test", status: "COMPLETED", conclusion: "SUCCESS" }] }
    const lowerFile = fetchFile(dir, "lower.json", lowerQuiet)
    // Baseline: an already-open lower thread at arm time is not a wake.
    writeFileSync(lowerFile, JSON.stringify({ ...lowerQuiet, threads: [{ thread_id: "OLD", last_comment_id: "c", last_comment_at: "t" }] }))
    snapshot(state, upperFile, ["--start-invocation"])
    const { child, result } = startWatch(state, upperFile, ["--downstack-pr", "7", "--downstack-fetch-file", `7=${lowerFile}`,
      "--interval", "0.2"])
    await waitForWatchGeneration(state)
    await Bun.sleep(600)
    expect(child.exitCode).toBeNull()   // still watching: baseline item did not wake
    // A new lower-layer thread arrives.
    writeFileSync(lowerFile, JSON.stringify({ ...lowerQuiet, threads: [
      { thread_id: "OLD", last_comment_id: "c", last_comment_at: "t" },
      { thread_id: "NEW", last_comment_id: "c2", last_comment_at: "t2" }] }))
    const out = await Promise.race([result, Bun.sleep(4000).then(() => null)])
    expect(out).not.toBeNull()
    const wake = JSON.parse(out!.stdout.trim().split("\n").pop()!)
    expect(wake.reason).toBe("downstack-actionable")
    expect(wake.downstack_prs).toEqual([7])
  })

  test("downstack probe: a lower-layer head change alone wakes; an unrequested-base-merge residual does not re-wake after re-arm", async () => {
    const quietUpper = {
      ...FAILING, merge_state_status: "BLOCKED", review_decision: null,
      checks: [{ key: "CI/test", name: "test", status: "IN_PROGRESS", conclusion: null, details_url: "u" }],
      threads: [], head_sha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    }
    const upperFile = fetchFile(dir, "upper2.json", quietUpper)
    const lowerQuiet = { pr_state: "OPEN", head_sha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", threads: [], feedback: [],
      checks: [{ key: "CI/test", status: "COMPLETED", conclusion: "SUCCESS" }] }
    const lowerFile = fetchFile(dir, "lower2.json", lowerQuiet)
    snapshot(state, upperFile, ["--start-invocation"])
    const { child, result } = startWatch(state, upperFile, ["--downstack-pr", "7", "--downstack-fetch-file", `7=${lowerFile}`, "--interval", "0.2"])
    await waitForWatchGeneration(state)
    await Bun.sleep(400)
    expect(child.exitCode).toBeNull()
    // Loss of quiescence with no new event: the lower layer turns DIRTY on the same head.
    writeFileSync(lowerFile, JSON.stringify({ ...lowerQuiet, merge_state_status: "DIRTY" }))
    const out = await Promise.race([result, Bun.sleep(4000).then(() => null)])
    expect(out).not.toBeNull()
    expect(JSON.parse(out!.stdout.trim().split("\n").pop()!).reason).toBe("downstack-actionable")
    // Loss of manager confirmation on the same head wakes; so does an edit in an existing thread.
    const s4 = path.join(dir, "ds-mgr")
    const lower4 = fetchFile(dir, "lower4.json", { ...lowerQuiet, pr_chain: { manager_status: "confirmed", target_needs_rebase: false },
      threads: [{ thread_id: "T", last_comment_id: "c", last_comment_at: "t1" }] })
    snapshot(s4, upperFile, ["--start-invocation"])
    const w4 = startWatch(s4, upperFile, ["--downstack-pr", "7", "--downstack-fetch-file", `7=${lower4}`, "--interval", "0.2"])
    await waitForWatchGeneration(s4)
    await Bun.sleep(400)
    writeFileSync(lower4, JSON.stringify({ ...lowerQuiet, pr_chain: { manager_status: "probe-error", target_needs_rebase: null },
      threads: [{ thread_id: "T", last_comment_id: "c", last_comment_at: "t1" }] }))
    const out4 = await Promise.race([w4.result, Bun.sleep(4000).then(() => null)])
    expect(out4).not.toBeNull()
    expect(JSON.parse(out4!.stdout.trim().split("\n").pop()!).reason).toBe("downstack-actionable")
    const s5 = path.join(dir, "ds-edit")
    const lower5 = fetchFile(dir, "lower5.json", { ...lowerQuiet, threads: [{ thread_id: "T", last_comment_id: "c", last_comment_at: "t1" }] })
    snapshot(s5, upperFile, ["--start-invocation"])
    const w5 = startWatch(s5, upperFile, ["--downstack-pr", "7", "--downstack-fetch-file", `7=${lower5}`, "--interval", "0.2"])
    await waitForWatchGeneration(s5)
    await Bun.sleep(400)
    writeFileSync(lower5, JSON.stringify({ ...lowerQuiet, threads: [{ thread_id: "T", last_comment_id: "c", last_comment_at: "t2" }] }))
    const out5 = await Promise.race([w5.result, Bun.sleep(4000).then(() => null)])
    expect(out5).not.toBeNull()
    expect(JSON.parse(out5!.stdout.trim().split("\n").pop()!).reason).toBe("downstack-actionable")

    // And a head change alone.
    const s3 = path.join(dir, "ds-head")
    const lower3 = fetchFile(dir, "lower3.json", lowerQuiet)
    snapshot(s3, upperFile, ["--start-invocation"])
    const w3 = startWatch(s3, upperFile, ["--downstack-pr", "7", "--downstack-fetch-file", `7=${lower3}`, "--interval", "0.2"])
    await waitForWatchGeneration(s3)
    await Bun.sleep(400)
    writeFileSync(lower3, JSON.stringify({ ...lowerQuiet, head_sha: "cccccccccccccccccccccccccccccccccccccccc" }))
    const out3 = await Promise.race([w3.result, Bun.sleep(4000).then(() => null)])
    expect(out3).not.toBeNull()
    expect(JSON.parse(out3!.stdout.trim().split("\n").pop()!).reason).toBe("downstack-actionable")

    // Residual suppression: an unrequested_base_merge present at arm time is in the baseline.
    const flagged = { ...quietUpper, checks: [], head_sha: "dddddddddddddddddddddddddddddddddddddddd",
      base: { host: "github.com", repository: "o/r", ref: "main", oid: "2222222222222222222222222222222222222222",
        graphql_oid: "2222222222222222222222222222222222222222", identity: "current" },
      head_parents: ["aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "2222222222222222222222222222222222222222"] }
    const s2 = path.join(dir, "ubm-rearm")
    snapshot(s2, fetchFile(dir, "ubm-r1.json", { ...quietUpper, checks: [] }), ["--start-invocation"])
    const flaggedFile = fetchFile(dir, "ubm-r2.json", flagged)
    expect(snapshot(s2, flaggedFile).unrequested_base_merge).not.toBeNull()
    const w2 = startWatch(s2, flaggedFile, ["--interval", "0.2"])
    await waitForWatchGeneration(s2)
    await Bun.sleep(700)
    expect(w2.child.exitCode).toBeNull()   // did not immediately re-wake on the already-surfaced residual
    w2.child.kill()
    await w2.result
  })

  test("unrequested base merge: a claimed DIRTY repair that observed its mutation is not flagged", () => {
    const fixture = currencyFixture({ merge_state_status: "DIRTY", mergeable: "CONFLICTING",
      head_sha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      base: { host: "github.com", repository: "o/r", ref: "main",
        oid: "2222222222222222222222222222222222222222", graphql_oid: "2222222222222222222222222222222222222222",
        identity: "current" } }) as any
    const dirty = snapshot(state, fetchFile(dir, "ubm-dirty-1.json", fixture))
    const key = dirty.branch_currency?.key
    expect(key).toBeTruthy()
    markCurrency(state, key, "claimed")
    markCurrencyOutcome(state, key, "mutation-observed")
    const baseOid = String(fixture.base.oid)
    const repaired = snapshot(state, fetchFile(dir, "ubm-dirty-2.json", { ...fixture,
      merge_state_status: "CLEAN", mergeable: "MERGEABLE",
      head_sha: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
      head_parents: [String(fixture.head_sha), baseOid] }))
    expect(repaired.unrequested_base_merge).toBeNull()

    // Control: the same merge head on a fresh state with no claim is flagged.
    const control = path.join(dir, "ubm-control-state")
    snapshot(control, fetchFile(dir, "ubm-dirty-1.json", fixture))
    const flagged = snapshot(control, fetchFile(dir, "ubm-dirty-3.json", { ...fixture,
      merge_state_status: "CLEAN", mergeable: "MERGEABLE",
      head_sha: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
      head_parents: [String(fixture.head_sha), baseOid] }))
    expect(flagged.unrequested_base_merge?.base_parent).toBe(baseOid)

    // A transient parents-probe failure on the head-change tick keeps the head unclassified and
    // retryable: detection fires on the first later snapshot that carries parents.
    const s3 = path.join(dir, "ubm-retry")
    snapshot(s3, fetchFile(dir, "ubm-t1.json", fixture), ["--start-invocation"])
    const noParents = snapshot(s3, fetchFile(dir, "ubm-t2.json", { ...fixture,
      merge_state_status: "CLEAN", mergeable: "MERGEABLE",
      head_sha: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee", head_parents: null }))
    expect(noParents.unrequested_base_merge).toBeNull()
    expect(noParents.unrequested_base_merge_pending).toBe(true)
    expect(noParents.base_ref_blocker).toBe("mergeability-pending")
    expect(noParents.mergeability_certain).toBe(false)
    const recovered = snapshot(s3, fetchFile(dir, "ubm-t3.json", { ...fixture,
      merge_state_status: "CLEAN", mergeable: "MERGEABLE",
      head_sha: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
      head_parents: [String(fixture.head_sha), baseOid] }))
    expect(recovered.unrequested_base_merge?.base_parent).toBe(baseOid)
    expect(recovered.unrequested_base_merge_pending).toBe(false)

    // A consumed item for base A does not exempt a merge of the same head with a newer base B.
    const s6 = path.join(dir, "ubm-newer-base")
    snapshot(s6, fetchFile(dir, "ubm-nb1.json", fixture))
    const k6 = snapshot(s6, fetchFile(dir, "ubm-nb1.json", fixture)).branch_currency?.key
    markCurrency(s6, k6, "claimed"); markCurrencyOutcome(s6, k6, "mutation-observed")
    const newerBase = "3333333333333333333333333333333333333333"
    const withB = snapshot(s6, fetchFile(dir, "ubm-nb2.json", { ...fixture,
      merge_state_status: "CLEAN", mergeable: "MERGEABLE",
      base: { ...fixture.base, oid: newerBase, graphql_oid: newerBase },
      head_sha: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
      head_parents: [String(fixture.head_sha), newerBase] }))
    expect(withB.unrequested_base_merge?.base_parent).toBe(newerBase)

    // A consumed item from an earlier head does not exempt a later, unrelated base merge.
    const stale = snapshot(state, fetchFile(dir, "ubm-dirty-4.json", { ...fixture,
      merge_state_status: "CLEAN", mergeable: "MERGEABLE",
      head_sha: "ffffffffffffffffffffffffffffffffffffffff",
      head_parents: ["eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee", baseOid] }))
    expect(stale.unrequested_base_merge?.base_parent).toBe(baseOid)
  })
})

// UTF-8 gh/git output under a non-UTF-8 locale (issue #1346)
//
// _run() used subprocess.run(..., text=True) with no encoding=, so Python decoded
// stdout with the locale encoding (cp1252 on Windows, ascii under C). gh emits UTF-8;
// a curly quote (U+201D, last byte 0x9d) crashed the reader thread and left stdout None.
// Forcing C + PYTHONUTF8=0 reproduces that decode failure on UTF-8 CI.
describe("pr-snapshot _run pins UTF-8 under a non-UTF-8 locale (#1346)", () => {
  const NON_UTF8_LOCALE = {
    ...process.env,
    LC_ALL: "C",
    LANG: "C",
    LC_CTYPE: "C",
    PYTHONUTF8: "0",
    PYTHONCOERCECLOCALE: "0",
  }

  test("_run decodes UTF-8 curly-quote stdout instead of raising UnicodeDecodeError", () => {
    const python = `
import json, sys
from importlib.machinery import SourceFileLoader
m = SourceFileLoader("prs", ${JSON.stringify(SCRIPT)}).load_module()
child = [sys.executable, "-c",
         "import sys; sys.stdout.buffer.write(b'{\\"title\\": \\"hello \\\\xe2\\\\x80\\\\x9d world\\"}')"]
r = m._run(child)
print(json.dumps({"returncode": r.returncode, "stdout": r.stdout, "title": json.loads(r.stdout)["title"]}))
`
    const r = spawnSync("python3", ["-c", python], { encoding: "utf8", env: NON_UTF8_LOCALE })
    expect(r.status, r.stderr).toBe(0)
    expect(JSON.parse(r.stdout)).toEqual({
      returncode: 0,
      stdout: '{"title": "hello \u201d world"}',
      title: "hello \u201d world",
    })
  })
})
