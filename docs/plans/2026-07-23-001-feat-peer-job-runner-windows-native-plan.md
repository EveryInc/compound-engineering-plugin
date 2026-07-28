---
title: "Native Windows Peer Job Runner - Plan"
type: feat
date: 2026-07-23
topic: peer-job-runner-windows-native
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: issue-1243
execution: code
issue: https://github.com/EveryInc/compound-engineering-plugin/issues/1243
---

# Native Windows Peer Job Runner - Plan

## Goal Capsule

- **Objective:** `peer-job-runner.py` can `start` / `status` / `wait` / `result` / `reap` a detached cross-model peer on native Windows Python (PowerShell / Codex), without requiring WSL, while preserving the existing POSIX path and security posture.
- **Issue:** [#1243](https://github.com/EveryInc/compound-engineering-plugin/issues/1243) (supersedes the unfinished Windows half of #1184; #1186 only added a clear error).
- **Authority:** this plan > repo conventions > implementer judgment on deferred details.
- **Execution split:** Phase A/B on macOS (safe + scaffold). Phase C on a real Windows machine in this same worktree/branch. Do not merge Phase C without Windows smoke evidence.
- **Stop conditions:** stop and surface if (a) the Windows security model cannot match owner-private job dirs without quietly weakening POSIX checks, or (b) detach/reap cannot reliably kill the worker tree on native Windows.
- **Tail ownership:** standalone run owns branch/PR; Windows smoke evidence goes on the PR body.

---

## Resume Contract (read this first on Windows)

This plan is intentionally split so a later session on a Windows box can pick up cold from the worktree.

1. Open this worktree on the Windows machine (same branch).
2. Read this file; jump to **Phase C**.
3. Confirm Phase A is done (grep `#1243` in the runner error; parity green).
4. Confirm Phase B status from the checklist below (scaffold present or not).
5. Implement / iterate Phase C against real Windows Python.
6. Paste smoke evidence into the PR body before merge.

**Do not** treat macOS green as proof of the Windows path. CI has no Windows matrix today.

---

## Product Contract

### Summary

Replace the hard POSIX preflight (`os.fork` / `os.setsid`) with a platform branch: keep the existing setsid double-fork on POSIX; on native Windows, detach via `subprocess.Popen` creation flags, terminate trees via Job Object or `taskkill /T`, and own job dirs via a Windows ACL/SID equivalent of the current `geteuid` + `0700` model.

### Problem Frame

Cross-model review on native Windows never reaches Claude. The runner exits at `_require_posix_detach()` before starting a job. The overall review can fall back to an in-process adversarial reviewer; the independent Claude pass is what is lost. Git Bash does not help: it still launches native Windows Python, which lacks the POSIX process APIs.

### Requirements

- R1. `peer-job-runner.py start` returns a job ID on native Windows Python.
- R2. `status`, `wait`, `result`, and `reap` preserve the existing short-lived lifecycle contract and terminal-state vocabulary.
- R3. Worker stdout/stderr and terminal state remain durable under the job dir across the launching tool call ending.
- R4. Timeout and `reap` terminate the full worker process tree (no orphan Claude/Codex children).
- R5. Job-dir security remains owner-private: do not ship a Windows path that skips ownership checks or world-writable dirs. Prefer ACL/SID checks equivalent to today's `fstat`/`geteuid` + `0700`/`0600`.
- R6. Default jobs root works without `os.geteuid` (today `DEFAULT_ROOT` is `None` when UID APIs are missing). Either a Windows default under the user temp area with ACL hardening, or a documented required override — prefer a working default.
- R7. One shared runner implementation, byte-copied to every consumer skill; `tests/peer-job-runner-parity.test.ts` stays green.
- R8. POSIX behavior and existing Mac/Linux tests remain green; no intentional regression of the setsid path.
- R9. Error text and docs that still cite closed #1184 for the missing Windows path are repointed to #1243.

### Scope Boundaries

- **In scope:** `skills/*/scripts/peer-job-runner.py` (all parity consumers), unit/lifecycle tests, error/docs pointers to #1243.
- **Out of scope:** changing peer worker `.sh` adapters; making Git Bash a supported detach host; weakening security to "make it work." A focused `peer-job-runner-windows` GitHub Actions job (unit fixture + Windows smoke + parity) is in scope as the merge-gate substitute for a full Windows suite matrix.
- **Not source of truth:** `.agy/skills/**` copies are conversion output — edit `skills/` only.

---

## Key Technical Decisions

- **KTD1 — Platform branch inside the shared runner, not a second script.** One file, `if sys.platform == "win32": ... else: ...` at detach/teardown/ownership seams. Parity stays one asset.
- **KTD2 — Detach on Windows = `Popen` with `DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP` (and stdio redirected to the job log / NUL).** Supervisor must outlive the short `start` call the same way the POSIX grandchild does.
- **KTD3 — Teardown = Job Object preferred; `taskkill /T /F` acceptable fallback.** Prefer assigning the worker tree to a Job Object at spawn so reap is deterministic. If Job Object wiring proves too heavy for stdlib-only, document the `taskkill` fallback and prove it in smoke.
- **KTD4 — Security is not optional.** Windows path must verify the current user SID owns the job dir/files before emitting content. Do not delete ownership checks because `geteuid` is missing.
- **KTD5 — Mac can own structure and mocks; Windows owns proof.** Phase B may land behind `win32` branches with unit tests that mock Windows APIs. Merge gate for enabling the path in production is Phase C smoke on real Windows.
- **KTD6 — Edit one canonical copy, then `cp` to all consumers.** Canonical for this work: `skills/ce-doc-review/scripts/peer-job-runner.py` (what the lifecycle suite drives). Propagate to `ce-code-review`, `ce-pov`, `ce-work`, `ce-plan`, `ce-brainstorm`.

---

## Phased Execution

### Phase A — Mac-safe, ship anytime (no Windows runtime needed)

**Status:** do first in this session.

| ID | Work | Done when |
|---|---|---|
| A1 | Repoint runner error + docstring from `#1184` → `#1243` | grep shows `#1243`; no live "wait for Windows path" pointer at closed #1184 |
| A2 | Update unit fixture assertion (`assertIn("1243")`) | `bun test tests/skills/peer-job-runner.test.ts` green |
| A3 | Propagate runner to all consumer skills | `bun test tests/peer-job-runner-parity.test.ts` green |
| A4 | Write this plan into `docs/plans/` | file present on branch |

A1–A4 must not change detach behavior.

### Phase B — Mac scaffold (optional before Windows; still no real win32 APIs)

Land only what can be proven with mocks on macOS. Prefer small, reviewable diffs.

| ID | Work | Mac verification |
|---|---|---|
| B1 | Replace `_require_posix_detach()` with `_require_detach_support()` that allows `win32` | unit test: missing fork on non-win32 still errors; win32 branch not taken on Darwin |
| B2 | Extract `detach_supervisor()` behind a POSIX helper; add `detach_supervisor_windows()` stub/impl gated on `win32` | import/syntax OK; POSIX lifecycle suite still green |
| B3 | Extract teardown/ownership helpers with Windows stubs | no POSIX regression |
| B4 | Jobs-root default for Windows (`%TEMP%` / `LOCALAPPDATA` layout + ACL TODO or first impl) | unit-tested via env/`sys.platform` patches |
| B5 | Unit tests for branch selection and Windows error paths using `unittest.mock` | `peer-job-runner-unit.py` covers them |

**Do not** claim R1–R4 done after Phase B.

### Phase C — Windows machine (resume here)

Run in this worktree on native Windows Python 3.

| ID | Work | Windows verification |
|---|---|---|
| C1 | Implement real `detach_supervisor_windows` | `start` returns job id; process still alive after `start` exits |
| C2 | Implement tree kill (Job Object or `taskkill /T /F`) | after `reap` / timeout, no leftover worker PIDs |
| C3 | Implement owner/ACL checks + default jobs root | mismatched owner → exit 4 / unreadable; content withheld |
| C4 | Lifecycle smoke: stub worker `start → wait → result → reap` | matches POSIX semantics for terminal states |
| C5 | Optional product smoke: `ce-code-review` adversarial path with Claude selected under native Codex/PowerShell | Claude peer actually runs (not just in-process fallback) |
| C6 | Propagate final runner to all consumers; run `bun test` if Bun available, else at least `python` unit fixture + parity check | parity identical; no POSIX regressions if suite runnable |

#### Windows smoke commands (copy/paste)

From repo root, with Python on PATH:

```powershell
# Focused unit fixture (after Phase B/C tests exist)
python tests/fixtures/peer-job-runner-unit.py

# Manual lifecycle against ce-doc-review copy
$env:CE_PEER_JOBS_ROOT = Join-Path $env:TEMP "ce-peer-jobs-smoke"
$runner = "skills/ce-doc-review/scripts/peer-job-runner.py"
python $runner start --skill ce-doc-review --run-id smoke1 -- -- python -c "import time; open(r'$env:CE_PEER_JOBS_ROOT\marker.txt','w').write('ok'); time.sleep(2)"
# then: status / wait / result / reap using the printed job id
```

Adjust the worker argv as needed once `result_path` / meta conventions are wired the same as POSIX tests in `tests/skills/peer-job-runner.test.ts`.

#### Evidence to capture on the PR

- OS build, Python version, PowerShell version
- Output of `start` (job id) + later `status`/`wait` showing `done`
- Proof that reap/timeout leaves no orphan PIDs
- Note whether Job Object or `taskkill` was used

---

## Implementation Units (mapped to phases)

### U1. Issue pointer + plan (Phase A)

- **Files:** all `skills/*/scripts/peer-job-runner.py` consumers; `tests/fixtures/peer-job-runner-unit.py`; this plan.
- **Verification:** focused bun tests above.

### U2. Platform abstraction seams (Phase B)

- **Files:** canonical runner; unit fixture; then propagate.
- **Approach:** minimal extraction — detach, kill_tree, jobs_root_base / ownership — without rewriting the supervisor loop unless required.
- **Verification:** existing `tests/skills/peer-job-runner.test.ts` green on Mac.

### U3. Windows detach + reap + ACL (Phase C)

- **Files:** same runner; tests extended where mockable; PR body evidence for real Windows.
- **Verification:** Phase C checklist + optional product smoke.

### U4. Propagate + close the loop

- **Files:** six skill copies via `cp` from canonical.
- **Verification:** `bun test tests/peer-job-runner-parity.test.ts`.

---

## Verification Contract

| Gate | Where | Proves |
|---|---|---|
| Focused runner + parity tests | Mac (and Windows if Bun present) | A/B safe; no POSIX regression |
| Full `bun run test` | Mac before PR, again after C if practical | No collateral breakage |
| Windows lifecycle smoke | Windows machine | R1–R4 |
| Security spot-check | Windows machine | R5–R6 (owner mismatch withheld) |
| Product smoke (optional but ideal) | Windows Codex/PowerShell | Claude cross-model pass actually starts |

---

## Definition of Done

- [ ] Phase A landed (pointer + plan + tests)
- [ ] Phase B scaffold landed or explicitly skipped with note on PR
- [ ] Phase C smoke evidence on PR body
- [ ] All six skill runner copies byte-identical
- [ ] POSIX lifecycle suite green
- [ ] #1243 can be closed with a link to the shipping PR

---

## Session Checklist

**Mac (this session / next Mac session)**

- [x] Plan written
- [x] A1–A3 issue repoint + tests
- [ ] Decide: start B1–B5 now, or pause for Windows after A

**Windows (resume)**

- [ ] Pull/open same branch worktree
- [ ] Re-read Resume Contract + Phase C
- [ ] Implement C1–C4; capture evidence
- [ ] C5 if time; C6 propagate
- [ ] Open/update PR with evidence
