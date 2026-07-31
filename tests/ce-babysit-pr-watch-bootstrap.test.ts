import { describe, expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import path from "node:path"

// Regression test for the observed illegal start path (Nugget PR #1933): an agent
// arming the change detector with a bare `pr-snapshot watch --pr N --interval 60`,
// skipping ce-babysit-pr's Step 2 bootstrap. The CLI must stay fail-closed (exit 2)
// AND the refusal must carry its own recovery path pointing at the bootstrap.
// Kept out of ce-babysit-pr-snapshot.test.ts so this stays a fast file.
const SCRIPT = path.join(import.meta.dir, "..", "skills", "ce-babysit-pr", "scripts", "pr-snapshot")

// Probe by execution, not presence: on native Windows `python3` can be the
// Microsoft Store stub (a real file on PATH that exits non-zero). See
// docs/solutions/conventions/resolve-python-interpreter-not-python3.md.
const PYTHON = ["python3", "python", "py"].find(
  (cand) => spawnSync(cand, ["-c", ""], { encoding: "utf8" }).status === 0,
)
if (!PYTHON) throw new Error("no working Python 3 interpreter on PATH (tried python3, python, py)")

function run(args: string[]) {
  return spawnSync(PYTHON, [SCRIPT, ...args], { encoding: "utf8" })
}

describe("pr-snapshot watch bootstrap refusal", () => {
  test("bare watch fails closed with bootstrap guidance", () => {
    const r = run(["watch", "--pr", "1933", "--interval", "60"])
    expect(r.status).toBe(2)
    expect(r.stderr).toContain("the following arguments are required")
    expect(r.stderr).toContain("watch cannot start a babysit run")
    expect(r.stderr).toContain("--start-invocation")
    expect(r.stderr).toContain("ce-babysit-pr Step 2")
    // The recovery path must route through the skill, not a raw command recipe.
    expect(r.stderr).toContain("invoke the ce-babysit-pr skill")
  })

  test("watch missing only a non-bootstrap flag gets the plain argparse error", () => {
    const r = run([
      "watch", "--state-dir", "/tmp/does-not-matter-parse-only",
      "--invocation-id", "inv", "--session-started-at", "2026-01-01T00:00:00Z",
      "--invocation-budget-seconds", "100",
    ])
    expect(r.status).toBe(2)
    expect(r.stderr).toContain("--pr")
    expect(r.stderr).not.toContain("watch cannot start a babysit run")
  })

  test("snapshot and mark errors never carry the watch hint", () => {
    const r = run(["mark", "--thread", "T1"])
    expect(r.status).toBe(2)
    expect(r.stderr).not.toContain("watch cannot start a babysit run")
  })
})
