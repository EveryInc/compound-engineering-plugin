import { describe, expect, test, beforeEach } from "bun:test"
import { spawn, spawnSync } from "node:child_process"
import { existsSync, mkdtempSync, writeFileSync, readFileSync, renameSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

// Regression tests for the ce-babysit-pr pr-snapshot claim->act->confirm engine.
// Exercised via --fetch-file (no live PR), following the tests/*-validator.test.ts
// spawnSync pattern. Locks in the ce-code-review fixes: crash-safety, needs-human
// silencing + open_needs_human visibility, checks_terminal, key-collision, null-head.
const SCRIPT = path.join(import.meta.dir, "..", "skills", "ce-babysit-pr", "scripts", "pr-snapshot")

function fetchFile(dir: string, name: string, obj: unknown): string {
  const p = path.join(dir, name)
  writeFileSync(p, JSON.stringify(obj))
  return p
}

function snapshot(stateDir: string, fetch: string, extra: string[] = []): any {
  const r = spawnSync(
    "python3",
    [SCRIPT, "snapshot", "--pr", "1", "--repo", "o/r", "--state-dir", stateDir, "--fetch-file", fetch, ...extra],
    { encoding: "utf8" },
  )
  expect(r.status, r.stderr).toBe(0)
  return JSON.parse(r.stdout)
}

function mark(stateDir: string, args: string[]): void {
  // Default the at-mark baseline fetch to empty threads (-> lazy first-observation baseline, no gh
  // call); a test exercising at-mark capture passes its own --fetch-file, which we don't override.
  const extra = args.includes("--fetch-file")
    ? []
    : ["--fetch-file", fetchFile(path.dirname(stateDir), "mark-empty.json", { threads: [] })]
  const r = spawnSync("python3", [SCRIPT, "mark", "--state-dir", stateDir, ...args, ...extra], { encoding: "utf8" })
  expect(r.status, r.stderr).toBe(0)
}

function watch(stateDir: string, fetch: string, extra: string[] = []): any {
  const r = spawnSync(
    "python3",
    [SCRIPT, "watch", "--pr", "1", "--repo", "o/r", "--state-dir", stateDir, "--fetch-file", fetch,
      "--interval", "0.1", "--max-runtime", "1", ...extra],
    { encoding: "utf8", timeout: 5000 },
  )
  expect(r.status, r.stderr).toBe(0)
  return JSON.parse(r.stdout.trim().split("\n").pop()!) // the wake sentinel is the final line
}

function startWatch(stateDir: string, fetch: string, extra: string[] = []) {
  const child = spawn(
    "python3",
    [SCRIPT, "watch", "--pr", "1", "--repo", "o/r", "--state-dir", stateDir, "--fetch-file", fetch,
      "--interval", "0.05", "--max-runtime", "5", ...extra],
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
  url: "http://x/1",
  checks: [{ key: "CI/test", name: "test", status: "COMPLETED", conclusion: "FAILURE", details_url: "u" }],
  threads: [{ thread_id: "T1", last_comment_id: "C1", last_comment_at: "t1" }],
}

describe("ce-babysit-pr pr-snapshot engine", () => {
  let dir: string
  let state: string
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "prsnap-"))
    state = path.join(dir, "state")
  })

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
    snapshot(sd, fetchFile(dir, "rw1.json", { ...FAILING, head_sha: "s1", threads: [], checks: [RED] })) // fail h1
    watch(sd, fetchFile(dir, "rw2.json", { ...FAILING, head_sha: "s2", threads: [], checks: [GREEN] })) // a poll observes the CLEAR
    const d = snapshot(sd, fetchFile(dir, "rw3.json", { ...FAILING, head_sha: "s3", threads: [], checks: [RED] })) // fail h3
    expect(d.trajectory.check_recur_max).toBe(1) // fail -> clear(seen only on a poll) -> fail = recurrence
  }, 15000)

  test("--reset-session restarts the budget clock so a resumed watch is not instantly over-budget", () => {
    const sd = path.join(dir, "sess")
    snapshot(sd, fetchFile(dir, "se1.json", FAILING)) // creates state with started_at = now
    // simulate resuming days later against persisted state: backdate started_at
    const statePath = path.join(sd, "state.json")
    const st = JSON.parse(readFileSync(statePath, "utf8"))
    st.started_at = "2020-01-01T00:00:00+00:00"
    writeFileSync(statePath, JSON.stringify(st))
    // without reset -> session_seconds is huge (measured from 2020)
    expect(snapshot(sd, fetchFile(dir, "se2.json", FAILING)).session_seconds).toBeGreaterThan(1_000_000)
    // with --reset-session -> the clock restarts, session_seconds ~0
    const r = spawnSync("python3", [SCRIPT, "snapshot", "--pr", "1", "--repo", "o/r", "--state-dir", sd,
      "--fetch-file", fetchFile(dir, "se3.json", FAILING), "--reset-session"], { encoding: "utf8" })
    expect(r.status, r.stderr).toBe(0)
    expect(JSON.parse(r.stdout).session_seconds).toBeLessThan(10)
  })

  test("an invocation session start carries into a new managed-stack layer state dir", () => {
    const started = new Date(Date.now() - 3_600_000).toISOString()
    const d = snapshot(
      path.join(dir, "next-layer"),
      fetchFile(dir, "next-layer.json", FAILING),
      ["--session-started-at", started],
    )

    expect(new Date(d.session_started_at).getTime()).toBe(new Date(started).getTime())
    expect(d.session_seconds).toBeGreaterThan(3_500)
  })

  test("re-arming watch preserves the invocation budget instead of resetting it", () => {
    const sd = path.join(dir, "watch-budget")
    const started = new Date(Date.now() - 10_000).toISOString()
    const waiting = {
      ...FAILING,
      threads: [],
      checks: [{ key: "CI/test", name: "test", status: "IN_PROGRESS", conclusion: null, details_url: "u" }],
    }
    snapshot(sd, fetchFile(dir, "watch-budget-snapshot.json", waiting), ["--session-started-at", started])

    const wake = watch(
      sd,
      fetchFile(dir, "watch-budget-watch.json", waiting),
      ["--session-started-at", started],
    )

    expect(wake.reason).toBe("max-runtime")
  }, 15000)

  test("watch --reset-session resets once, not on every poll", () => {
    const waiting = {
      ...FAILING,
      threads: [],
      checks: [{ key: "CI/test", name: "test", status: "IN_PROGRESS", conclusion: null, details_url: "u" }],
    }
    const wake = watch(
      path.join(dir, "watch-reset-once"),
      fetchFile(dir, "watch-reset-once.json", waiting),
      ["--reset-session"],
    )

    expect(wake.reason).toBe("max-runtime")
  }, 10000)

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

  test("mark --comment with --acted-edit-id captures the baseline at mark time (closes the edit race)", () => {
    const sd = path.join(dir, "cmark")
    const fb = (edit: string) => ({
      ...FAILING, merge_state_status: "CLEAN", review_decision: "APPROVED", checks: [], threads: [],
      feedback: [{ id: "IC_1", kind: "comment", author: "reviewer", edit_id: edit }],
    })
    snapshot(sd, fetchFile(dir, "cm1.json", fb("h1")))
    // mark dispatched with the snapshot-time edit_id (h1) as the explicit baseline (our reply never edits it)
    mark(sd, ["--comment", "IC_1", "--disposition", "dispatched", "--acted-edit-id", "h1"])
    // an edit that races in (h2) before the next snapshot -> reactivated, not swallowed as baseline
    expect(snapshot(sd, fetchFile(dir, "cm2.json", fb("h2"))).counts.comments).toBe(1)
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

  test("a dispatched top-level comment reactivates when its body is edited (edit_id changes), not on our reply", () => {
    // A non-actionable wrapper marked dispatched, later edited to add an actionable request, must
    // return to actionable — our own reply is a separate top-level comment and never edits it.
    const sd = path.join(dir, "editfb")
    const fb = (edit: string) => ({
      ...FAILING, merge_state_status: "CLEAN", review_decision: "APPROVED", checks: [], threads: [],
      feedback: [{ id: "IC_1", kind: "comment", author: "reviewer", edit_id: edit }],
    })
    snapshot(sd, fetchFile(dir, "e1.json", fb("h1"))) // actionable
    mark(sd, ["--comment", "IC_1", "--disposition", "dispatched"])
    expect(snapshot(sd, fetchFile(dir, "e2.json", fb("h1"))).counts.comments).toBe(0) // same body -> silenced
    expect(snapshot(sd, fetchFile(dir, "e3.json", fb("h2"))).counts.comments).toBe(1) // edited -> reactivated
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

  test("_extract_feedback surfaces every non-empty external body for agent judgment", () => {
    const v = {
      author: { login: "me" },
      comments: [
        { id: "c-me", author: { login: "me" }, body: "my own note" }, // author -> excluded
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
      "c-claude", "c-cov", "c-ghost", "c-near-match", "c-wrapper", "r-codex", "r-cr", "r-wrapper",
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
    expect(watch(path.join(dir, "w3"), cf, ["--settle-seconds", "300"]).reason).toBe("max-runtime")
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
        "--fetch-file", missingFetch, "--stop-file", stopFile],
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
args = SimpleNamespace(state_dir=state_dir, pr=1, repo="o/r",
                       fetch_file=${JSON.stringify(successor)}, reset_session=False,
                       session_started_at=None)
generation = "successor-generation"
m._reserve_watch_candidate(args, generation)
cur = m._fetch_snapshot(args)
assert json.load(open(state_path))["head_sha"] == "base-head", "preflight mutated persisted state"

original_diff = m.diff
child = None
def diff_with_incumbent_race(state, current, now=None, advance_trajectory=True):
    global child
    child_code = '''
from importlib.machinery import SourceFileLoader
from types import SimpleNamespace
m = SourceFileLoader("prs_child", ${JSON.stringify(SCRIPT)}).load_module()
args = SimpleNamespace(state_dir=${JSON.stringify(sd)}, pr=1, repo="o/r",
                       fetch_file=${JSON.stringify(incumbent)}, reset_session=False,
                       session_started_at=None)
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

  test("watch: an in-progress review signal blocks the merge-ready wake regardless of quiet time", () => {
    // "Looks ready" is signal-gated: a green/CLEAN PR with a review still in flight (review_in_progress)
    // must NOT wake merge-ready even with a zero settle window — time is not the gate.
    const GREEN = { key: "CI/test", name: "test", status: "COMPLETED", conclusion: "SUCCESS", details_url: "u" }
    const base = { ...FAILING, merge_state_status: "CLEAN", review_decision: "APPROVED", threads: [], checks: [GREEN] }
    const inprog = fetchFile(dir, "rip1.json", { ...base, review_in_progress: true })
    expect(watch(path.join(dir, "rip1"), inprog, ["--settle-seconds", "0"]).reason).toBe("max-runtime")
    const nosig = fetchFile(dir, "rip2.json", { ...base, review_in_progress: false })
    expect(watch(path.join(dir, "rip2"), nosig, ["--settle-seconds", "0"]).reason).toBe("merge-ready")
  }, 15000)

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
    snapshot(sd, rf) // the failing check is actionable on this first tick
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
    snapshot(sd, fetchFile(dir, "nhw1.json", base()))
    mark(sd, ["--thread", "T1", "--disposition", "needs-human"])
    // parked needs-human, nothing else actionable -> keeps watching, times out (does NOT wake needs-human)
    expect(watch(sd, fetchFile(dir, "nhw2.json", base())).reason).toBe("max-runtime")
    // a new actionable thread arrives while the needs-human stays parked -> wakes on the new work
    const withNew = fetchFile(dir, "nhw3.json", base([{ thread_id: "T2", last_comment_id: "D1", last_comment_at: "D1" }]))
    expect(watch(sd, withNew).reason).toBe("actionable")
  }, 15000)
})
