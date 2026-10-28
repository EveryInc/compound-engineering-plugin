---
title: Shared Managed File Guard - Plan
type: refactor
date: 2026-10-28
artifact_contract: ce-unified-plan/v1
product_contract_source: ce-plan-bootstrap
execution: code
---

# Shared Managed File Guard - Plan

## Goal Capsule

- Objective: Codex, Pi, and OpenCode installs keep deciding the same way whether an existing file is the user's (skip it) or the plugin's (rewrite it), with that decision made in one place so the targets cannot drift apart again.
- Means: one exported per-file guard in `src/targets/managed-artifacts.ts` that all three writers call (KTD1).
- Authority: this plan, then the existing writer tests as the behavior baseline.
- Stop conditions: any existing writer test changes outcome, or a warning message changes.
- Execution profile: one small refactor, two units.
- Finishes and ships: `ce-work`, then the calling `lfg` run opens the PR.

## Product Contract

### Summary

Replace the three private `cleanupCurrentManagedFile` helpers in `src/targets/codex.ts`, `src/targets/pi.ts`, and `src/targets/opencode.ts` with one exported helper next to `cleanupCurrentManagedDirectory`. Install outcomes and warning text stay the same.

### Problem Frame

PR #1919 left three copies of the per-file guard. The Codex and Pi copies are identical. The OpenCode copy differs in three ways: it checks containment under the store first, it treats a missing manifest as "everything unmanaged", and it does not delete the owned file before rewriting. Separate copies are how the OpenCode containment check ended up missing from the others, and how the next fix would land in one target only.

### Requirements

- R1. One exported helper in `src/targets/managed-artifacts.ts` makes the per-file preserve-or-rewrite decision for Codex prompts and agents, Pi prompts, agents, and extensions, and OpenCode agents, commands, and plugins.
- R2. Every writer reaches the same outcome (skipped, or rewritten) for every existing-file case as it does on `main`, and prints the same warning text.
- R3. No private `cleanupCurrentManagedFile` remains in `src/targets/codex.ts`, `src/targets/pi.ts`, or `src/targets/opencode.ts`.

### Scope Boundaries

- Considered and not built: adding the per-file containment check to Codex and Pi. Each Codex and Pi store directory is already checked as a whole by `storeRootEscapesManagedRoot`, and every file name is a single flattened segment (`normalizeCodexName`, Pi's `normalizeName`, `sanitizePathName`), so there is no nested path for a symlinked parent to escape through. The only case it would catch is a leaf symlink, which the symlink check already skips; turning containment on would only change that case's warning text. Evidence that would change this: a Codex or Pi entry name that can contain a path separator.
- Not changed: the directory guard `cleanupCurrentManagedDirectory` and the Codex/Pi skill-directory guards.

## Planning Contract

### Key Technical Decisions

- KTD1. **Single exported helper in managed-artifacts.ts.** (session-settled: user-approved — chosen over leaving per-target copies in codex.ts, pi.ts, and opencode.ts: the copies already drifted, since OpenCode has a containment check the others lack.) Governs R1, R3.
- KTD2. **Unlinking an owned file before rewrite is opt-in.** Codex and Pi pass the option and keep today's `fs.rm` of an owned file, which runs only when ownership is tracked. Unlinking first means a hardlink the user made to that file is not written through, and a file the user made read-only can still be replaced, since removal needs write permission only on the directory. OpenCode leaves the option off, because its command path reads the old text after the guard to skip identical rewrites and to back up changed ones.
- KTD3. **Containment is opt-in through an optional store-directory argument.** OpenCode passes its store directory and keeps its "resolves outside the managed store" check running first, exactly as today. Codex and Pi omit it (see Scope Boundaries), which keeps their leaf-symlink warning unchanged.
- KTD4. **Ownership is passed as a list, with `null` meaning "no ownership tracking".** Codex and Pi already pass `null` when the install has no plugin name, which allows overwrite. OpenCode passes `manifest?.groups[group] ?? []`, so a missing manifest still reads as unmanaged and skips, matching its current behavior.

## Implementation Units

### U1. Add the shared guard and its unit tests

- **Goal:** Export the per-file guard from `src/targets/managed-artifacts.ts` next to `cleanupCurrentManagedDirectory`.
- **Requirements:** R1, R2 (KTD1, KTD2, KTD3, KTD4)
- **Dependencies:** none
- **Files:** `src/targets/managed-artifacts.ts`, `tests/managed-file-guard.test.ts` (new)
- **Approach:** Order of checks: the containment check when a store directory is given, then a missing path (not preserved), then a symlink (preserved, warns), then `null` ownership (not preserved), then an entry missing from the owned list (preserved, warns), then the owned case (not preserved, unlinked first when that option is set). Reuse the existing warning strings verbatim. The two options (store directory, unlink owned) are optional and off by default.
- **Patterns to follow:** `cleanupCurrentManagedDirectory` and `isPreservedSymlink` in the same file.
- **Test scenarios:**
  - A missing target is not preserved, and nothing is warned.
  - A symlinked target is preserved with the "existing user-managed symlink" warning, and its link target is unchanged.
  - With `null` ownership, an existing regular file is not preserved and is left on disk.
  - A regular file absent from the owned list is preserved with the "existing unmanaged file" warning.
  - A regular file present in the owned list is not preserved, and the file still exists afterward when unlinking is off.
  - With unlinking on, an owned file is removed, and a hardlink to it elsewhere keeps its content.
  - With unlinking on and `null` ownership, an existing file is left on disk.
  - With a store directory given and the target reached through a symlinked subdirectory that points outside the store, the target is preserved with the "resolves outside the managed store" warning.
- **Verification:** the new test file passes.

### U2. Point the three writers at the shared guard

- **Goal:** Delete the three private helpers and call the shared guard.
- **Requirements:** R1, R2, R3 (KTD2, KTD3, KTD4)
- **Dependencies:** U1
- **Files:** `src/targets/codex.ts`, `src/targets/pi.ts`, `src/targets/opencode.ts`
- **Approach:**
  1. Codex and Pi: same arguments as today, with unlinking on and no store directory. Drop imports that become unused.
  2. OpenCode: pass the store directory it passes today, plus `manifest?.groups[group] ?? []` as the owned list, with unlinking off.
- **Patterns to follow:** the current call sites, unchanged apart from the helper name and the OpenCode argument shape.
- **Test expectation:** none new. The existing tests in `tests/codex-writer.test.ts`, `tests/pi-writer.test.ts`, and `tests/opencode-writer.test.ts` are the behavior baseline, including the preserved-symlink, unmanaged-file, and identical-reinstall cases from #1919, and they must pass unchanged.
- **Verification:** the three writer test files pass without edits.

## Verification Contract

| Check | Command | Proves |
|---|---|---|
| Shared guard behavior | `bun test tests/managed-file-guard.test.ts` | U1 scenarios |
| Writer behavior unchanged | `bun test tests/codex-writer.test.ts tests/pi-writer.test.ts tests/opencode-writer.test.ts` | R2 |
| Full suite | `bun run test` | no regressions elsewhere |
| Types | `bun run typecheck` | unused imports and signatures |
| Release metadata | `bun run release:validate` | unaffected; run because CI does |

## Definition of Done

- R1 to R3 hold, and `rg "function cleanupCurrentManagedFile" src/targets` finds nothing.
- No existing test was edited to pass.
- No abandoned-attempt code is left in the diff.
