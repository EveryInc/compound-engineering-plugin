import { spawnSync } from "node:child_process"
import path from "node:path"
import { expect, setDefaultTimeout, test } from "bun:test"

// Runs the platform-independent RunRetryGateUnit tests inside the Windows smoke
// fixture, so the fixture's signature-gated `_run` retry (retry only on the
// hosted-runner `_ctypes` DLL-init flake, fail immediately on anything else) is
// exercised on every platform — the smoke class itself is win32-gated and its
// tests only ever hit `_run`'s success path.

setDefaultTimeout(30_000)

// Probe by execution, not presence: on native Windows `python3` can be the
// Microsoft Store stub (a real file on PATH that exits non-zero). See
// docs/solutions/conventions/resolve-python-interpreter-not-python3.md.
const PYTHON = ["python3", "python", "py"].find(
  (cand) => spawnSync(cand, ["-c", ""], { encoding: "utf8" }).status === 0,
)
if (!PYTHON) throw new Error("no working Python 3 interpreter on PATH (tried python3, python, py)")

test("fixture retry gate: _run retries only on the _ctypes flake signature", () => {
  const fixture = path.join(process.cwd(), "tests", "fixtures", "peer-job-runner-windows-smoke.py")
  // The class-name arg keeps win32 runs scoped to the unit class instead of the
  // full Win32 smoke suite (which CI runs as its own signature-retried step);
  // the fixture's non-Windows branch runs only that class regardless.
  const result = spawnSync(PYTHON, [fixture, "RunRetryGateUnit"], { encoding: "utf-8" })
  expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0)
})
