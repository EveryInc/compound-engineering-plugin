import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { existsSync, lstatSync, readFileSync, statSync, writeFileSync } from "node:fs"
import path from "node:path"
import {
  ctl,
  fakeDoneJob,
  git,
  init,
  makeRepo,
  packetFile,
  registerWorkspaceCleanup,
  seedWarmCheckoutFixture,
  tmp,
} from "./helpers/ce-work-workspace-harness"

setDefaultTimeout(30_000)

registerWorkspaceCleanup()

describe("ce-work unit workspace controller: warm-checkout end-to-end regression (AE1-AE5)", () => {
  test("init -> prepare -> integrate -> verify-run on a node_modules-shaped warm checkout discloses ignored state without touching it", () => {
    const f = makeRepo()
    const fixture = seedWarmCheckoutFixture(f.repo)
    const runs = path.join(tmp("ce-work-runs-"), "ce-work")
    const runId = "run-warm-checkout-e2e"

    const ready = init(runs, runId, f)
    expect(ready.word).toBe("READY")

    const prepared = ctl(
      runs, "prepare", "--run-id", runId, "--unit-id", "U",
      "--base", f.base, "--packet", packetFile("packet"),
    )
    expect(prepared.word).toBe("PREPARED")
    const workspace = path.join(runs, runId, "units", "U", "workspace")
    writeFileSync(path.join(workspace, "keep.txt"), "transport modified\n")
    writeFileSync(path.join(workspace, "integrated.txt"), "integrated\n")

    const job = fakeDoneJob(runs, runId, "U", "packet")
    ctl(runs, "record-job", "--run-id", runId, "--unit-id", "U", "--attempt-id", "attempt-1", "--job-id", job)
    ctl(runs, "terminalize", "--run-id", runId, "--unit-id", "U")

    const integrated = ctl(
      runs, "integrate", "--run-id", runId, "--unit-id", "U",
      "--commit-message", "feat(test): integrate on a node_modules-shaped warm checkout",
      "--", "python3", "-c",
      "from pathlib import Path; " +
      "Path('node_modules/pkg-0000.js').read_text(); " +
      "Path('node_modules/pkg-0005.js').write_text('overwritten during integrate'); " +
      "p = Path('node_modules/.cache/x'); p.parent.mkdir(parents=True); p.write_text('created during integrate')",
    )
    expect(integrated.word).toBe("UNIT_COMMITTED")
    expect(integrated.body).not.toHaveProperty("cleaned")
    expect(integrated.body.cleaned_paths).toEqual([])
    expect(integrated.body.ignored_state).toMatchObject({
      changed: 1,
      created: 1,
      removed: 0,
      restored: false,
      sample: {
        changed: ["node_modules/pkg-0005.js"],
        created: ["node_modules/.cache/x"],
        removed: [],
      },
    })
    expect(integrated.body.ignored_state.before).toBeGreaterThan(512)
    expect(readFileSync(path.join(f.repo, "keep.txt"), "utf8")).toBe("transport modified\n")
    const statusAfterIntegrate = ctl(runs, "status", "--run-id", runId).body
    expect(["committed", "cleaned"]).toContain(statusAfterIntegrate.units.U.state)
    expect(statusAfterIntegrate.units.U.integration.verification.ignored_state).toMatchObject({
      changed: 1,
      created: 1,
      removed: 0,
      restored: false,
    })

    const verified = ctl(
      runs, "verify-run", "--run-id", runId,
      "--verification-summary", "warm-checkout plan verification",
      "--", "python3", "-c",
      "from pathlib import Path; Path('node_modules/pkg-0006.js').write_text('touched during verify-run')",
    )
    expect(verified.word).toBe("RUN_VERIFIED")
    expect(verified.body.cleaned_paths).toEqual([])
    expect(verified.body.ignored_state).toMatchObject({
      changed: 1,
      created: 0,
      removed: 0,
      restored: false,
      sample: { changed: ["node_modules/pkg-0006.js"], created: [], removed: [] },
    })

    // The controller never restores or otherwise touches ignored state: mutations and
    // creations from verification persist, and untouched symlinks/hardlinks are intact.
    expect(readFileSync(path.join(fixture.nodeModules, "pkg-0005.js"), "utf8")).toBe("overwritten during integrate")
    expect(readFileSync(path.join(f.repo, "node_modules", ".cache", "x"), "utf8")).toBe("created during integrate")
    expect(readFileSync(path.join(fixture.nodeModules, "pkg-0006.js"), "utf8")).toBe("touched during verify-run")
    expect(lstatSync(path.join(fixture.bin, "tool-a")).isSymbolicLink()).toBe(true)
    expect(lstatSync(path.join(fixture.bin, "tool-b")).isSymbolicLink()).toBe(true)
    expect(statSync(fixture.files[2]).nlink).toBe(2)
    expect(statSync(path.join(fixture.nodeModules, "pkg-hardlink.js")).nlink).toBe(2)

    const status = ctl(runs, "status", "--run-id", runId).body
    expect(status.verifications[0].ignored_state).toMatchObject({
      changed: 1,
      created: 0,
      removed: 0,
      restored: false,
    })
  })

  test("a failing verification command on a warm checkout restores tracked state exactly and still discloses the ignored mutation", () => {
    const f = makeRepo()
    const fixture = seedWarmCheckoutFixture(f.repo)
    const runs = path.join(tmp("ce-work-runs-"), "ce-work")
    const runId = "run-warm-checkout-failure"

    expect(init(runs, runId, f).word).toBe("READY")
    expect(ctl(
      runs, "prepare", "--run-id", runId, "--unit-id", "U",
      "--base", f.base, "--packet", packetFile("packet"),
    ).word).toBe("PREPARED")
    const workspace = path.join(runs, runId, "units", "U", "workspace")
    writeFileSync(path.join(workspace, "keep.txt"), "transport modified\n")

    const job = fakeDoneJob(runs, runId, "U", "packet")
    ctl(runs, "record-job", "--run-id", runId, "--unit-id", "U", "--attempt-id", "attempt-1", "--job-id", job)
    ctl(runs, "terminalize", "--run-id", runId, "--unit-id", "U")

    const failed = ctl(
      runs, "integrate", "--run-id", runId, "--unit-id", "U",
      "--commit-message", "feat(test): integration must roll back on a warm checkout",
      "--", "python3", "-c",
      "from pathlib import Path; " +
      "Path('node_modules/pkg-0010.js').write_text('mutated during failure'); " +
      "Path('keep.txt').write_text('tracked mutation'); " +
      "raise SystemExit(7)",
    )
    expect(failed.word).toBe("BLOCKED")
    expect(failed.body.verification_exit).toBe(7)
    expect(failed.body.ignored_state.changed).toBeGreaterThanOrEqual(1)
    expect(failed.body.ignored_state.sample.changed).toContain("node_modules/pkg-0010.js")

    expect(git(f.repo, "rev-parse", "HEAD")).toBe(f.base)
    expect(git(f.repo, "status", "--porcelain")).toBe("")
    expect(readFileSync(path.join(f.repo, "keep.txt"), "utf8")).toBe("keep\n")
    expect(existsSync(path.join(f.repo, "integrated.txt"))).toBe(false)

    // Ignored mutation is disclosed but left in place, never restored.
    expect(readFileSync(path.join(fixture.nodeModules, "pkg-0010.js"), "utf8")).toBe("mutated during failure")
  })
})
