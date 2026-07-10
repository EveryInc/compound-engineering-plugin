---
title: "A preserve-user-content guard must cover every destructive path to the target, not just the main one"
date: 2026-07-09
category: docs/solutions/best-practices/
module: src/targets
problem_type: best_practice
component: tooling
severity: high
applies_when:
  - "Adding a guard so an installer/writer stops clobbering user-managed files (symlink overrides, hand-authored dirs)"
  - "A target writer removes-then-rewrites content and more than one function can delete or move that same path"
  - "Reviewing a fix that protects a resource against one operation when sibling operations touch it too"
tags: [pi-writer, symlink, user-content, install, choke-point, adversarial-review, converters]
---

# A preserve-user-content guard must cover every destructive path to the target, not just the main one

## Context

The Pi writer (`src/targets/pi.ts`) clobbered user-managed symlink overrides on every `install ... --to pi` (issue #1048): the main skill/agent loop did `fs.rm(target, { recursive: true, force: true })` then copied fresh upstream content, deactivating a symlink that pointed at a user's fork. PR #1089 fixed the main loop by `lstat`-ing the target first and skipping both the `rm` and the copy for symlinks and unmanaged dirs.

That fix was correct but **incomplete**. The Pi writer has more than one code path that destroys a target skill/agent path:

1. the main write loop (`cleanupCurrentManagedSkillDir` / `cleanupCurrentManagedAgentFile`) — guarded by the PR;
2. the removed-entry sweeps (`cleanupRemovedSkills` / `cleanupRemovedAgents`) — also guarded by the PR;
3. the **legacy-artifact sweep** (`cleanupKnownLegacyPiArtifacts` → `moveLegacyArtifactToBackup`), which `fs.rename`s CE-owned legacy skill/agent paths into `legacy-backup/` — **missed**.

The gap was not academic: the issue's own repro skill, `ce-session-inventory`, is a legacy-only skill (dropped from the bundle, still listed in `EXTRA_LEGACY_ARTIFACTS_BY_PLUGIN["compound-engineering"]`). Because it is absent from the bundle it never reaches the guarded main loop — it flows straight to the legacy sweep, which followed the symlink and renamed it away, *while the run had already logged that the symlink was preserved*. The headline scenario of the bug was still broken after the "fix," and an adversarial reviewer (Codex, P1 on the PR) is what surfaced it.

## Guidance

When you add a guard to preserve user content against a destructive writer, treat the **set of destructive paths to that target as a completeness obligation**, the same way a correctness cache treats its invalidation-input set (see Related). Guarding the one path in front of you is a partial fix by default.

1. **Enumerate every function that can `rm`, `rename`, overwrite, or move the protected target — then guard all of them.** In the Pi writer that meant three call sites, not one. Grep the module for `fs.rm`, `fs.rename`, `fs.unlink`, `writeText`/copy-into-place against the same directory root.
2. **Prefer guarding the single destructive choke point over each call site.** The follow-up fix put the `lstat` check inside `moveLegacyArtifactToBackup` (`src/targets/pi.ts:561`), the one function all five legacy sweeps (skills, agents, prompts, extensions, mcporter) funnel through — reusing the existing `isPreservedSymlink` helper (`src/targets/pi.ts:434`) and covering kinds the reviewer didn't even name, for free. A choke-point guard cannot be forgotten by a future sibling call the way a per-call-site guard can.
3. **Order the guard before any existence check that follows the link.** `pathExists` (stat/access) follows a symlink and reports a dangling link as absent; `lstat` sees the link node. Check `isPreservedSymlink` *before* `pathExists` so live and dangling user symlinks are both preserved.
4. **Distrust a fix whose own reproduction case routes through the unguarded path.** If the bug report's example still traverses code you didn't touch, the fix is unverified — reproduce the exact reported case, don't just test the path you changed.

## Why This Matters

Silent user-data loss is the worst failure class for an installer: no error, and the run actively logs reassurance ("existing user-managed symlink (not overwritten)") while a different code path deletes the same override moments later. A partial guard is arguably worse than no guard because the warning manufactures false confidence.

The failure mode is structural, not a one-off: a resource protected against operation A is still exposed to sibling operations B and C that touch it independently. This plugin has the exact shape waiting in two more writers — `src/targets/codex.ts` (`cleanupCurrentManagedSkillDir`) and `src/targets/managed-artifacts.ts` (`cleanupCurrentManagedDirectory`, used by the OpenCode writer) share the unconditional rm-then-copy pattern and would clobber symlinks the same way. Naming them keeps the completeness obligation visible for the next fix.

## When to Apply

- You are adding "skip if the user owns this path" logic to any target writer or installer.
- A resource is mutated by more than one function and you are protecting it against one of them.
- You are reviewing a preserve-user-content or don't-clobber fix — audit for sibling destructive paths and for whether the original repro actually exercises the changed code.

## Examples

Guarding the choke point instead of the call site — one edit covers every legacy sweep:

```ts
// src/targets/pi.ts — moveLegacyArtifactToBackup
async function moveLegacyArtifactToBackup(managedDir, kind, artifactPath) {
  // Checked before pathExists (which follows the link) so a user symlink is
  // preserved whether it is live or dangling.
  if (await isPreservedSymlink(artifactPath)) return
  if (!(await pathExists(artifactPath))) return
  // ... ensureDir + fs.rename(artifactPath, backupPath)
}
```

Testing the exact repro, not just the changed path. The regression test symlinks `ce-session-inventory` (a legacy-only skill that reaches *only* the legacy sweep) and asserts ownership would have fired absent the guard, so it fails loudly if the fingerprint ever drifts instead of passing for the wrong reason:

```ts
// Guard against silent false-green: if the fingerprint stops matching,
// ownership goes false and the sweep skips for the wrong reason.
expect(await isLegacySkillArtifactOwned(symlinkPath, "ce-session-inventory")).toBe(true)
await writePiBundle(outputRoot, bundle) // bundle omits the skill -> legacy sweep only
expect((await fs.lstat(symlinkPath)).isSymbolicLink()).toBe(true)
expect(await exists(path.join(outputRoot, "compound-engineering", "legacy-backup"))).toBe(false)
```

That false-green assertion earned its keep on the first run: an em-dash mismatch in the fork's description made ownership return `false`, which the assertion caught — otherwise the test would have "passed" without exercising the guard at all.

## Related
- [A correctness cache needs a COMPLETE, schema-derived invalidation input set](cache-invalidation-input-set-completeness.md) — sibling pattern: a safety-relevant set (there, invalidation inputs) that must be complete, with the gap found by adversarial review.
- Issue #1048 (repro) and PR #1089 (merged), which fixed both the main-loop clobber and — as a follow-up commit on the same branch — the legacy-sweep gap described here.
