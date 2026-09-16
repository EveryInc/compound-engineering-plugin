import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "fs/promises"
import os from "os"
import path from "path"
import { describe, expect, test } from "bun:test"

const repoRoot = path.join(import.meta.dir, "..", "..")
const ceJobScript = path.join(repoRoot, "skills", "ce-job", "scripts", "ce-job")

type RunResult = {
  exitCode: number
  stdout: string
  stderr: string
}

async function runCeJob(cwd: string, args: string[]): Promise<RunResult> {
  const proc = Bun.spawn([ceJobScript, ...args], {
    cwd,
    env: {
      ...process.env,
      PATH: process.env.PATH ?? "/usr/bin:/bin",
    },
    stdout: "pipe",
    stderr: "pipe",
  })
  const [exitCode, stdout, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])
  return { exitCode, stdout, stderr }
}

async function initRepo(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "ce-job-script-"))
  await Bun.$`git init -q`.cwd(root).quiet()
  await Bun.$`git checkout -b feat/job-script`.cwd(root).quiet()
  return root
}

describe("ce-job script", () => {
  test("creates a ledger, an event log, durable feedback, and test requests", async () => {
    const root = await initRepo()
    try {
      const started = await runCeJob(root, [
        "start",
        "--id",
        "demo-job",
        "--title",
        "Demo job",
        "--goal",
        "Ship deterministic job commands",
        "--mode",
        "guarded",
      ])
      expect(started.exitCode).toBe(0)
      expect(started.stdout).toContain("docs/jobs/demo-job.md")

      const decision = await runCeJob(root, ["feedback", "demo-job", "--kind", "decision", "--message", "Use the script for file mechanics"])
      expect(decision.exitCode).toBe(0)
      expect(decision.stdout).toContain("Decisions")

      const testRequest = await runCeJob(root, ["test", "demo-job", "--message", "Run targeted tests before done"])
      expect(testRequest.exitCode).toBe(0)
      expect(testRequest.stdout).toContain("Test requests")

      const status = await runCeJob(root, ["status", "demo-job", "--json"])
      expect(status.exitCode).toBe(0)
      const parsed = JSON.parse(status.stdout)
      expect(parsed).toMatchObject({
        job_id: "demo-job",
        status: "active",
        mode: "guarded",
        branch: "feat/job-script",
        bucket: "needs-evidence",
        next: "collect requested evidence",
      })
      expect(parsed.test_requests).toContain("Run targeted tests before done")

      const ledger = await readFile(path.join(root, "docs", "jobs", "demo-job.md"), "utf8")
      expect(ledger).toContain("## Decisions\n\n- ")
      expect(ledger).toContain("Use the script for file mechanics")
      expect(ledger).toContain("## Test requests\n\n- ")

      const events = await readFile(path.join(root, "docs", "jobs", ".events", "demo-job.jsonl"), "utf8")
      expect(events).toContain('"type": "job.started"')
      expect(events).toContain('"type": "decision.added"')
      expect(events).toContain('"type": "test_request.added"')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  }, { timeout: 15000 })

  test("resolves configured docs_root and local job_state_root with repo-bound validation", async () => {
    const root = await initRepo()
    try {
      await mkdir(path.join(root, ".compound-engineering"), { recursive: true })
      await writeFile(path.join(root, ".compound-engineering", "config.yaml"), "docs_root: ce-docs\n")
      await writeFile(path.join(root, ".compound-engineering", "config.local.yaml"), "job_state_root: .context/jobs\n")

      const rootResult = await runCeJob(root, ["root", "--json"])
      expect(rootResult.exitCode).toBe(0)
      expect(JSON.parse(rootResult.stdout).job_root).toBe(path.join(await realpath(root), ".context", "jobs"))

      await writeFile(path.join(root, ".compound-engineering", "config.yaml"), "docs_root: ce-docs\njob_state_root: tracked-jobs\n")
      await writeFile(path.join(root, ".compound-engineering", "config.local.yaml"), "job_state_root: ../outside\n")
      const fallback = await runCeJob(root, ["root", "--json"])
      expect(fallback.exitCode).toBe(0)
      expect(JSON.parse(fallback.stdout).job_root).toBe(path.join(await realpath(root), "tracked-jobs"))
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test("gates done on proof and lists only complete jobs when proof passes", async () => {
    const root = await initRepo()
    try {
      await runCeJob(root, ["start", "--id", "active-job", "--goal", "Keep working"])
      await runCeJob(root, ["start", "--id", "closed-job", "--goal", "Close me"])

      const prematureDone = await runCeJob(root, ["done", "closed-job", "--message", "All criteria proven"])
      expect(prematureDone.exitCode).not.toBe(0)
      expect(prematureDone.stderr).toContain("code-review receipt")

      await runCeJob(root, ["receipt", "closed-job", "code-review", "--status", "passed", "--artifact", "docs/reviews/closed.md"])
      const done = await runCeJob(root, ["done", "closed-job", "--message", "All criteria proven"])
      expect(done.exitCode).toBe(0)

      const activeOnly = await runCeJob(root, ["list"])
      expect(activeOnly.exitCode).toBe(0)
      expect(activeOnly.stdout).toContain("active-job")
      expect(activeOnly.stdout).not.toContain("closed-job")

      const all = await runCeJob(root, ["list", "--all", "--json"])
      expect(all.exitCode).toBe(0)
      const ids = JSON.parse(all.stdout).map((row: { job_id: string }) => row.job_id)
      expect(ids).toEqual(["active-job", "closed-job"])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test("records typed receipts, queue buckets, sidecar state, and operator next action", async () => {
    const root = await initRepo()
    try {
      await runCeJob(root, ["start", "--id", "factory-job", "--goal", "Run a factory job", "--mode", "guarded", "--priority", "p1", "--assignee", "agent"])
      await runCeJob(root, ["receipt", "factory-job", "plan", "--status", "passed", "--artifact", "docs/plans/factory.md"])
      await runCeJob(root, ["receipt", "factory-job", "doc-review", "--status", "passed", "--artifact", "docs/reviews/factory-doc.md"])
      await runCeJob(root, ["attach", "factory-job", "agent:worker-1", "--target-type", "herdr-agent", "--summary", "working"])

      const queue = await runCeJob(root, ["queue", "--json"])
      expect(queue.exitCode).toBe(0)
      const rows = JSON.parse(queue.stdout)
      expect(rows[0]).toMatchObject({ job_id: "factory-job", bucket: "ready-for-work", priority: "p1", assignee: "agent" })
      expect(rows[0].live).toMatchObject({ target: "agent:worker-1", target_type: "herdr-agent" })

      const next = await runCeJob(root, ["next", "factory-job", "--json"])
      expect(next.exitCode).toBe(0)
      expect(JSON.parse(next.stdout)).toMatchObject({ action: "run-work" })

      const operator = await runCeJob(root, ["operator-status", "factory-job", "--json"])
      expect(operator.exitCode).toBe(0)
      expect(JSON.parse(operator.stdout).suggested_action.action).toBe("run-work")
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test("local job visibility stores events under the local sidecar root", async () => {
    const root = await initRepo()
    try {
      await mkdir(path.join(root, ".compound-engineering"), { recursive: true })
      await writeFile(path.join(root, ".compound-engineering", "config.local.yaml"), "job_state_visibility: local\n")
      await runCeJob(root, ["start", "--id", "local-job", "--goal", "Keep local events"])
      await runCeJob(root, ["feedback", "local-job", "--message", "local note"])
      const events = await readFile(path.join(root, ".context", "compound-engineering", "jobs", "local-job", "events.jsonl"), "utf8")
      expect(events).toContain("local note")
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test("rejects non-ledger paths before mutating files", async () => {
    const root = await initRepo()
    try {
      await writeFile(path.join(root, "README.md"), "# Keep me\n\nOriginal content.\n")
      const result = await runCeJob(root, ["feedback", "README.md", "--message", "oops"])
      expect(result.exitCode).not.toBe(0)
      expect(result.stderr).toContain("not a ce-job ledger")
      expect(await readFile(path.join(root, "README.md"), "utf8")).toBe("# Keep me\n\nOriginal content.\n")
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test("gates ready-for-work for guarded jobs on plan and doc-review receipts", async () => {
    const root = await initRepo()
    try {
      await runCeJob(root, ["start", "--id", "guarded-job", "--goal", "Guard the job", "--mode", "guarded"])
      const premature = await runCeJob(root, ["ready", "guarded-job"])
      expect(premature.exitCode).not.toBe(0)
      expect(premature.stderr).toContain("plan receipt or plan link")
      await runCeJob(root, ["receipt", "guarded-job", "plan", "--status", "passed", "--artifact", "docs/plans/guarded.md"])
      await runCeJob(root, ["receipt", "guarded-job", "doc-review", "--status", "failed", "--artifact", "docs/reviews/guarded.md"])
      const failedReview = await runCeJob(root, ["ready", "guarded-job"])
      expect(failedReview.exitCode).not.toBe(0)
      expect(failedReview.stderr).toContain("passing or user-approved doc-review receipt")
      await runCeJob(root, ["receipt", "guarded-job", "doc-review", "--status", "passed", "--artifact", "docs/reviews/guarded.md"])
      const ready = await runCeJob(root, ["ready", "guarded-job"])
      expect(ready.exitCode).toBe(0)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test("requires each test request to have matching evidence", async () => {
    const root = await initRepo()
    try {
      await runCeJob(root, ["start", "--id", "proof-job", "--goal", "Prove all requests"])
      await runCeJob(root, ["test", "proof-job", "--message", "Run unit tests"])
      await runCeJob(root, ["test", "proof-job", "--message", "Run integration tests"])
      await runCeJob(root, ["receipt", "proof-job", "test", "--status", "passed", "--check", "Run unit tests"])
      await runCeJob(root, ["receipt", "proof-job", "code-review", "--status", "passed", "--artifact", "docs/reviews/proof.md"])
      const missing = await runCeJob(root, ["prove", "proof-job", "--json"])
      expect(missing.exitCode).toBe(0)
      expect(JSON.parse(missing.stdout).missing).toContain("test request evidence for: Run integration tests")
      const done = await runCeJob(root, ["done", "proof-job"])
      expect(done.exitCode).not.toBe(0)
      await runCeJob(root, ["receipt", "proof-job", "test", "--status", "passed", "--check", "Run integration tests"])
      const proven = await runCeJob(root, ["prove", "proof-job", "--json"])
      expect(JSON.parse(proven.stdout).status).toBe("proven")
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test("keeps concurrent feedback in the rendered ledger", async () => {
    const root = await initRepo()
    try {
      await runCeJob(root, ["start", "--id", "concurrent-job", "--goal", "Keep all feedback"])
      const runs = await Promise.all(
        Array.from({ length: 12 }, (_, index) => runCeJob(root, ["feedback", "concurrent-job", "--message", `note ${index}`])),
      )
      expect(runs.every((result) => result.exitCode === 0)).toBe(true)
      const ledger = await readFile(path.join(root, "docs", "jobs", "concurrent-job.md"), "utf8")
      for (let index = 0; index < 12; index += 1) {
        expect(ledger).toContain(`note ${index}`)
      }
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  }, { timeout: 15000 })

  test("rejects unsafe ledger IDs and preserves extra sections", async () => {
    const root = await initRepo()
    try {
      await mkdir(path.join(root, "docs", "jobs"), { recursive: true })
      const unsafePath = path.join(root, "docs", "jobs", "unsafe.md")
      await writeFile(unsafePath, "---\njob_id: ../../victim\nstatus: active\nmode: assist\n---\n\n# Unsafe\n\n## Goal\n\nkeep safe\n")
      const unsafe = await runCeJob(root, ["feedback", unsafePath, "--message", "must fail"])
      expect(unsafe.exitCode).not.toBe(0)
      expect(unsafe.stderr).toContain("invalid ledger job_id")

      await runCeJob(root, ["start", "--id", "extra-job", "--goal", "Keep extra sections"])
      const ledgerPath = path.join(root, "docs", "jobs", "extra-job.md")
      await writeFile(ledgerPath, `${await readFile(ledgerPath, "utf8")}\n## Research Notes\n\nDo not delete me.\n`)
      const feedback = await runCeJob(root, ["feedback", "extra-job", "--message", "normal update"])
      expect(feedback.exitCode).toBe(0)
      expect(await readFile(ledgerPath, "utf8")).toContain("## Research Notes\n\nDo not delete me.")
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test("guarded proof requires plan review and maps done criteria", async () => {
    const root = await initRepo()
    try {
      await runCeJob(root, ["start", "--id", "guarded-proof", "--goal", "Guard proof", "--mode", "guarded"])
      await runCeJob(root, ["receipt", "guarded-proof", "code-review", "--status", "passed", "--artifact", "docs/reviews/guarded-proof.md"])
      const premature = await runCeJob(root, ["done", "guarded-proof"])
      expect(premature.exitCode).not.toBe(0)
      expect(premature.stderr).toContain("plan receipt or plan link")

      await runCeJob(root, ["receipt", "guarded-proof", "plan", "--status", "passed", "--artifact", "docs/plans/guarded-proof.md"])
      await runCeJob(root, ["receipt", "guarded-proof", "doc-review", "--status", "passed", "--artifact", "docs/reviews/guarded-proof-doc.md"])
      await runCeJob(root, ["feedback", "guarded-proof", "--section", "Done criteria", "--label", "done", "--message", "First criterion"])
      await runCeJob(root, ["feedback", "guarded-proof", "--section", "Done criteria", "--label", "done", "--message", "Second criterion"])
      await runCeJob(root, ["receipt", "guarded-proof", "test", "--status", "passed", "--check", "First criterion"])
      const missing = await runCeJob(root, ["done", "guarded-proof"])
      expect(missing.exitCode).not.toBe(0)
      expect(missing.stderr).toContain("done criteria evidence for: Second criterion")
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test("force-start archives stale receipt history", async () => {
    const root = await initRepo()
    try {
      await runCeJob(root, ["start", "--id", "force-job", "--goal", "Old job"])
      await runCeJob(root, ["receipt", "force-job", "code-review", "--status", "passed", "--artifact", "docs/reviews/old.md"])
      await runCeJob(root, ["start", "--id", "force-job", "--goal", "New job", "--force"])
      const proof = await runCeJob(root, ["prove", "force-job", "--json"])
      expect(JSON.parse(proof.stdout).proven).not.toContain("code-review gate recorded")
      expect(JSON.parse(proof.stdout).missing).toContain("code-review receipt or explicit user-approved skip")
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
