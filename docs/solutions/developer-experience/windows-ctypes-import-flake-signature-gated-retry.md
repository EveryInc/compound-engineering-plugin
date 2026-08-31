---
title: "Hosted windows-latest CI intermittently fails `import ctypes` — signature-gated retry, not a blanket retry"
date: 2026-08-31
category: developer-experience
module: "ci (peer-job-runner-windows-smoke.py, .github/workflows/ci.yml)"
problem_type: test_failure
component: testing_framework
symptoms:
  - "Peer-job-runner Windows smoke CI step fails with dozens of assertion failures from a single flaky launch"
  - "Freshly spawned Windows Python subprocess raises ImportError: DLL load failed while importing _ctypes: A dynamic link library (DLL) initialization routine failed"
  - "Failure is intermittent and unrelated to the code under test; reruns of the same commit sometimes pass"
root_cause: environment_setup
resolution_type: workflow_improvement
severity: medium
tags: [windows, ci, flaky-tests, ctypes, retry, subprocess, peer-job-runner]
---

# Hosted windows-latest CI intermittently fails `import ctypes` — signature-gated retry, not a blanket retry

## Problem

Hosted `windows-latest` CI Python intermittently fails `import ctypes` with a DLL-init error in freshly spawned subprocesses, killing the "Peer-job-runner Windows smoke" step and forcing full-suite reruns whose failure dumps made an otherwise-green run look broken.

## Symptoms

- Python subprocesses raise `ImportError: DLL load failed while importing _ctypes: A dynamic link library (DLL) initialization routine failed` from `skills/ce-doc-review/scripts/peer-job-runner.py`'s module-level `import ctypes` under `IS_WINDOWS` — a hosted-runner environment fault, not a code path exercised by the test.
- One flaky launch failed roughly 39 assertions in a single run of `WindowsPeerJobSmoke`, because each `_run()` call spawns a fresh interpreter and any one of them can hit the flake.
- The step printed the full assertion dump for every attempt, including retried attempts a later attempt made irrelevant, so a healthy retried run was indistinguishable from a real regression at a glance.

## What Didn't Work

- A whole-suite retry alone (rerun `peer-job-runner-windows-smoke.py` up to 3x when the log matched the flake signature) was already in place and was insufficient on its own: a single flaky subprocess launch still failed the entire suite instance (~39 assertions), and the step echoed the failed attempt's full dump even when the very next attempt passed. The old loop did print a one-line flake marker, but only after the full dump.

## Solution

Two retry layers plus dedicated coverage (introduced on branch `tmchow/investigate-ci-failure-pr`, uncommitted as of this writing).

1. `.github/workflows/ci.yml` "Peer-job-runner Windows smoke" step (`shell: pwsh`): a retried flake attempt's log is suppressed and replaced with a one-line marker; the full log prints only on success or the terminal (non-flake or final) failure:

```powershell
$max = 3
for ($i = 1; $i -le $max; $i++) {
  $log = Join-Path $env:TEMP "peer-job-runner-windows-smoke-$i.log"
  python tests/fixtures/peer-job-runner-windows-smoke.py *> $log
  $code = $LASTEXITCODE
  $text = Get-Content -Raw -ErrorAction SilentlyContinue $log
  if (($code -eq 0) -or ($text -notmatch 'DLL load failed while importing _ctypes') -or ($i -eq $max)) {
    if ($null -ne $text) { Write-Host $text }
    exit $code
  }
  Write-Host "Windows smoke hit known _ctypes flake (attempt $i/$max, exit $code); output suppressed, retrying"
  Start-Sleep -Seconds 15
}
```

2. `tests/fixtures/peer-job-runner-windows-smoke.py` `WindowsPeerJobSmoke._run`: each individual runner launch retries itself up to 3 times when the exact signature matches, shrinking one flaky launch's blast radius from "whole suite instance fails" to "one subcommand relaunches":

```python
_CTYPES_FLAKE = "DLL load failed while importing _ctypes"

def _run(self, args, timeout=90):
    for attempt in range(3):
        proc = subprocess.run(
            [sys.executable, RUNNER, *args],
            env=self.env,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        if proc.returncode == 0 or self._CTYPES_FLAKE not in (proc.stderr or ""):
            return proc
        if attempt < 2:
            time.sleep(1)
    return proc
```

   The relaunch is safe because the runner imports `ctypes` at module top level under `IS_WINDOWS`, so a flaked process dies before any side effect. The CI-level whole-suite retry is deliberately kept as backstop for the same flake occurring inside the detached supervisor process, which this spawn site cannot observe.

3. New platform-independent coverage: `RunRetryGateUnit` (same fixture; `subprocess.run` and `time.sleep` stubbed, a `types.SimpleNamespace` stand-in for the win32-gated smoke case) asserts immediate success, immediate non-flake failure, flake-then-success retry, and three-flake exhaustion; `tests/peer-job-runner-retry-gate.test.ts` probes `python3`/`python`/`py` by execution (not presence) and runs the fixture with the `RunRetryGateUnit` argument, so the retry gate runs in the ordinary `bun run test` suite on every platform.

## Why This Works

The root cause is a hosted `windows-latest` runner environment fault in Python's `_ctypes` DLL initialization on process spawn, not a defect in the runner or the tests. Because the failure is a launch-time crash at import, before the process does anything, there is no partial state and relaunching is safe. Gating every retry — both layers — on the exact substring `DLL load failed while importing _ctypes` preserves gate fidelity: any other nonzero exit (real assertion failure, timeout, different exception) fails immediately on the first attempt with no retry and no output suppression, so the mechanism cannot mask an actual regression.

## Prevention

- Signature-gate any CI retry on the exact known-flake text, never on "nonzero exit" generically — a broad retry silently hides real failures.
- Suppress a retried attempt's noisy output, but always print one visible line recording the attempt number and the suppression, so flake frequency stays observable in green runs.
- Per-spawn retry is safe only when the failure is a crash at process launch before any side effect; the pattern does not generalize to failures after partial work.
- Keep an outer whole-run retry alongside an inner per-spawn retry when the outer scope can observe failures the inner site cannot (here: the detached supervisor).
- Retry logic embedded in a platform-gated fixture needs separate platform-independent tests, or its branches run nowhere deterministically.
- Residual risks accepted deliberately: the substring gate delays (up to 3 attempts) rather than masks a real failure whose text contains the phrase; if the upstream error wording drifts, the gate silently reverts to zero retries (loud immediate failure, but no retry) until a human updates the signature; hangs are not retried — they fail via the normal timeout.

## Related Issues

- `docs/solutions/architecture-patterns/posix-process-supervision-on-native-windows.md` — same module and native-Windows workstream; that doc covers the POSIX-to-Windows primitive port, this one the hosted-runner CI flake found while smoking it.
- `docs/solutions/conventions/resolve-python-interpreter-not-python3.md` — same Windows-support workstream; interpreter resolution, a different layer.
- `docs/solutions/developer-experience/windows-crlf-checkout-breaks-newline-anchored-tests.md` — same "diagnose the Windows CI artifact before blaming source" framing, distinct root cause.
- `docs/solutions/skill-design/dispatch-script-failure-degrade-outcome-not-boundary.md` — the general principle behind the gating: a retry/fallback must not weaken the boundary the mechanism enforces.
