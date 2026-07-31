---
title: "fix: Preserve explicit absolute non-WSL bash on Windows"
type: fix
status: active
date: 2026-07-31
origin: "PR #1292 Codex P2 (discussion_r3690011704); follow-up to docs/plans/2026-07-31-002-fix-prefer-git-bash-over-wsl-plan.md"
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
---

# fix: Preserve explicit absolute non-WSL bash on Windows

## Goal Capsule

- **Objective:** When a Windows peer worker argv already names an absolute non-System32 bash/sh (e.g. portable Git), keep that path — do not substitute the preferred resolver result or fail closed because the portable path is undiscoverable.
- **Authority:** Codex P2 on PR #1292; origin plan edge case “explicit absolute non-System32 bash prefix left as-is”; session-settled KD2 from #1268 applies to **bare** bash/sh only.
- **Stop when:** Absolute non-WSL bash is kept at `cmd_start` and spawn; System32 absolute bash still rewritten/fail-closed; bare names still resolve; six runners stay byte-identical; unit coverage proves both behaviors.

---

## Debug Summary (carried into planning)

**Problem:** `start -- C:\PortableGit\bin\bash.exe script.sh …` (or any absolute non-WSL bash) is treated like bare `bash`.

**Root cause:** `cmd_start` keys only on `basename(argv0) in {bash,sh,…}` and always calls `_resolve_windows_posix_shell()`, so the absolute-path branch never runs for `…\bash.exe`. Same basename gate in `_popen_argv` and `_rewrite_windows_env_bash_argv` substitutes preferred Git Bash or raises if the portable path is not in env/well-known/PATH.

**Evidence:** Origin plan U2 edge: “explicit absolute non-System32 bash prefix left as-is (already preferred).” Goal capsule of #1268: explicit Git Bash path already worked before this PR.

**Fix direction:** Treat absolute (drive/sep) bash/sh as caller-supplied: accept if file exists and not System32 WSL; reject System32; resolve only bare names.

---

## Product Contract

### Summary

Keep #1268 Git-Bash preference for **bare** `bash`/`sh` and System32 WSL rewrites, but honor an explicitly supplied absolute non-WSL shell so portable Git and other installs are not silently replaced or spuriously fail-closed.

Product Contract preservation: N/A (bootstrap). Does not reopen fail-closed / no-WSL-fallback / bare-rewrite product decisions — it restores the absolute-path exception already implied by those decisions and the #1268 plan’s edge case.

### Requirements

- R1. On Windows, if worker argv0 (or env-prefixed bash token) is an absolute path to an existing non-System32 bash/sh, use that path unchanged for meta and spawn.
- R2. If that absolute path is System32 WSL bash/sh, do not use it — rewrite via the existing resolver or fail closed (same as bare System32).
- R3. Bare `bash`/`sh`/`bash.exe`/`sh.exe` continue to resolve via `_resolve_windows_posix_shell()` (env → well-known → PATH walk).
- R4. Production change is in canonical `peer-job-runner.py` then byte-copied to all consumer skills; no product change outside shell selection.

### Scope Boundaries

- In: `cmd_start` bash/sh branch, `_popen_argv` bash/sh head, `_rewrite_windows_env_bash_argv`; unit tests; parity copy.
- Out: WindowsApps/Sysnative alias residual; changing resolver precedence; skipping Linux path tests; unrelated PR hygiene.

### Key Decisions

- KD1. Absolute path detection uses the same Windows absolute rule already used elsewhere in `cmd_start` (`os.sep in path` or drive-letter `X:`), not “looks like bash basename only.”
- KD2. Prefer a small shared helper (e.g. resolve-or-keep argv0 / token) used by start + spawn + env-rewrite so the three sites cannot drift.

---

## Planning Contract

### Key Technical Decisions

- KTD1. Introduce a helper along the lines of “given a bash/sh token, return the absolute shell to use”: if absolute → require `isfile`, reject System32 via `_is_system32_wsl_bash`, else return abspath; if bare → `_resolve_windows_posix_shell()`. (Governs R1–R3)
- KTD2. Wire that helper in `cmd_start`’s basename-bash branch (so absolute `…\bash.exe` no longer always resolves), in `_popen_argv`’s bash/sh head branch, and in `_rewrite_windows_env_bash_argv` for the bash token. (Governs R1, R4)
- KTD3. Fixture-only tests under existing `windows_platform` / `ntpath` helpers: absolute portable kept; absolute System32 rewritten/fail path; bare still resolves. No production behavior change for bare `bash`. (Governs R1–R3)

### Assumptions

- Codex P1 (Linux path semantics in unit fixture) remains addressed by `97ff131`; this plan does not reopen it.
- Callers that pass absolute bash intend that binary; `CE_PEER_BASH` remains the override for bare-name launches, not a silent override of an explicit argv0.

### Patterns to Follow

- Existing `_is_system32_wsl_bash` and absolute-path preflight in `cmd_start`.
- Byte-copy + `tests/peer-job-runner-parity.test.ts`.
- Unit fixture `windows_platform` for portable Windows path mocks.

---

## Implementation Units

### U1. Keep absolute non-WSL bash; resolve only bare names

**Goal:** Explicit absolute shells are preserved; bare and System32 paths still go through preference / fail-closed.

**Requirements:** R1, R2, R3, R4

**Dependencies:** None

**Files:**
- Modify: `skills/ce-doc-review/scripts/peer-job-runner.py` (canonical), then copy to `skills/ce-code-review|ce-pov|ce-work|ce-plan|ce-brainstorm/scripts/peer-job-runner.py`
- Modify: `tests/fixtures/peer-job-runner-unit.py`

**Approach:**
1. Add shared helper per KTD1.
2. Replace unconditional resolve in `cmd_start` bash basename branch with the helper; set `windows_posix_shell` from the kept/resolved path.
3. Same for `_popen_argv` bash/sh head and env-token rewrite.
4. Tests: absolute portable kept; absolute System32 not kept; bare `bash` still rewritten to preferred; env `… absolute_bash …` kept when non-WSL.

**Execution note:** Test-first in the unit fixture (absolute-keep must fail on current code), then implement helper + wire sites, then parity copy.

**Patterns to follow:** `#1268` resolver and System32 helper; `windows_platform` fixture.

**Test scenarios:**
- Happy: `cmd_start` / `_popen_argv` with absolute portable bash → argv0 unchanged; meta `windows_posix_shell` equals that path when recorded.
- Happy: bare `bash` still becomes preferred absolute Git Bash.
- Edge: absolute System32 bash → not used; resolver preferred or fail-closed with actionable message.
- Edge: env-prefixed argv with absolute non-WSL bash token → token kept.
- Error: absolute path that does not exist → preflight failure, no detach.
- Integration: six skill copies byte-identical after copy.

**Verification:** Unit fixture green under Windows and under `windows_platform` on Linux semantics; parity test green; no smoke policy change required.

---

## Verification Contract

- `python tests/fixtures/peer-job-runner-unit.py` exits 0 / prints OK.
- `bun test tests/peer-job-runner-parity.test.ts` passes.
- Manual or fixture assertion covering absolute-keep vs bare-rewrite.

---

## Definition of Done

- Codex P2 resolved on PR #1292 head.
- Origin plan absolute-prefix edge case restored without weakening bare-name Git Bash preference.
- Parity intact across six runners.

## Sources & Research

- https://github.com/EveryInc/compound-engineering-plugin/pull/1292#discussion_r3690011704
- `docs/plans/2026-07-31-002-fix-prefer-git-bash-over-wsl-plan.md` (U2 edge: absolute non-System32 left as-is)
- Prior residual: WindowsApps/Sysnative still out of scope
