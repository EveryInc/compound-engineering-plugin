---
title: "Release-please version drift recovery"
category: workflow
date: 2026-04-24
created: 2026-04-24
severity: high
component: release-automation
problem_type: workflow_issue
tags:
  - release-please
  - version-drift
  - plugin-versioning
  - recovery-playbook
  - linked-versions
  - extra-files
---

# Release-please version drift recovery

## Problem

Manual edits to a release-managed version field (any `plugin.json` listed in `extra-files`, `package.json`, or the release-please manifest) cause drift that:

- Breaks `bun run release:validate` on every PR's CI
- Can cause version regression on the next release-please run if left uncorrected
- Is easy to introduce accidentally — a one-line edit during a feature commit
- Has at least three valid recovery paths, each with different user-impact trade-offs

This doc is the playbook when drift is detected. It exists because investigating from scratch takes significant effort and the wrong choice can make things worse.

## File relationship map

The repo has five release components. Each owns one or more files. Release-please reads the manifest and writes the extra-files.

```
.github/.release-please-manifest.json       (release-please memory: last released per component)
├── "."                                     → cli component              (v = X.Y.Z)
├── "plugins/compound-engineering"          → compound-engineering       (v = X.Y.Z)
├── "plugins/coding-tutor"                  → coding-tutor               (v = A.B.C)
├── ".claude-plugin"                        → marketplace                (v = M.N.O)
└── ".cursor-plugin"                        → cursor-marketplace         (v = P.Q.R)

.github/release-please-config.json          (component config: extra-files, plugins)
└── "plugins": [{ type: "linked-versions", components: ["cli", "compound-engineering"] }]
    ← forces cli and compound-engineering to bump together

Each component's extra-files get rewritten by release-please when a release is cut:

  cli (".")                               compound-engineering
  ├── package.json ($.version)            ├── .claude-plugin/plugin.json  ($.version)
                                          ├── .cursor-plugin/plugin.json  ($.version)
                                          └── .codex-plugin/plugin.json   ($.version)

  coding-tutor                            marketplace / cursor-marketplace
  ├── .claude-plugin/plugin.json          ├── marketplace.json ($.metadata.version)
  ├── .cursor-plugin/plugin.json
  └── .codex-plugin/plugin.json
```

**Key invariants:**

- Every file in a component's `extra-files` list must share the same version.
- Because of `linked-versions`, **`cli` and `compound-engineering` must always be at the same version.** That means `package.json` (cli) and all three `compound-engineering/*/plugin.json` files move together.
- Marketplace components (`.claude-plugin`, `.cursor-plugin`) are **independent** — they have their own versions and don't move with plugin bumps.
- `bun run release:validate` enforces these invariants. Its error message names the file(s) that drifted.

## How release-please tracks versions

Release-please treats the **manifest as the source of truth** for "last released version per component." Extra-files are outputs that release-please writes to during a release. The flow is:

1. Push to `main` triggers the `release-pr` workflow
2. Release-please reads the manifest to know what was last released
3. Release-please walks conventional commits since the last release tag
4. Release-please computes the next version (`feat:` → minor, `fix:` → patch, etc.)
5. Release-please opens or updates a "chore: release main" PR that:
   - Bumps the manifest to the new version
   - Bumps every `extra-file` to the new version
6. When the release PR merges, the release is cut (git tag, optional npm publish)

Under normal operation, **humans never touch the manifest or the extra-files**. Both are updated together by release-please during a release PR. Drift is the state where this guarantee has been violated.

## Drift detection

`bun run release:validate` runs on every PR and on every push to `main` via `.github/workflows/ci.yml`. It fails when:

- Any two `extra-files` within the same component have different versions
- A marketplace plugin-list is asymmetric across `.claude-plugin`, `.cursor-plugin`, and `.agents/plugins`
- A Codex manifest is missing required fields or its `skills` directory
- A description has drifted across Claude/Cursor/Codex plugin.json files (auto-corrected with `write: true`)

**Important:** the manifest's memory of last-released version is **not** directly validated against extra-files. This means a state where all extra-files agree at X.Y.Z but the manifest thinks the last release was W.X.Y (W<X) will pass `release:validate` today. It will fail the NEXT release-please run when release-please tries to bump back down from W.X.Y.

## Recovery decision tree

When drift is detected, choose the recovery path before editing anything.

```
release:validate reports drift
    ↓
1. Identify which component(s) have drifted. Check:
    - extra-files vs each other within the component
    - extra-files vs the manifest entry for that component
    - linked-versions: is cli in sync with compound-engineering?
    ↓
2. Is anyone installed at the drifted (higher) version?
    ├── YES (or unknown — developers using `/plugin install --dev` from main)
    │       → Forward-sync: update all lower files UP to match the drifted high
    │
    └── NO (can verify no git tag, no npm publish, no marketplace cache entry)
            → Backward-revert: revert the drifted file DOWN to match the rest
```

### Path A: Forward-sync

Use when any user may have installed the drifted version locally (most common case — developers running `/plugin install` from a main checkout will have whatever version `.claude-plugin/plugin.json` says).

**Scope of changes:**

- All extra-files within the affected component(s) → bump up to the drifted version
- `.github/.release-please-manifest.json` entry for the affected component → bump to match
- **If the affected component is `compound-engineering` or `cli`:** because of `linked-versions`, bump BOTH:
  - manifest's `plugins/compound-engineering` and `.` entries together
  - `package.json` (cli's extra-file) and all three compound-engineering plugin.json files together

**Why the manifest edit is necessary:** without it, the next release-please run reads "last released was W.X.Y" (the stale manifest value), computes next version as W.X.(Y+1), and writes W.X.(Y+1) to extra-files — regressing any user at the forward-synced version.

**This is release-please's documented recovery pattern for out-of-band releases.** The manifest file is in git precisely so it can be manually corrected when a release happened outside release-please's normal flow.

### Path B: Backward-revert

Use when you can verify no user is installed at the drifted version. Requires:

- No git tag exists for the drifted version (e.g., `git tag -l | grep <version>`)
- No npm publish exists (e.g., `npm view @every-env/compound-plugin versions`)
- No marketplace release exists for the drifted version
- No team member has pulled main since the drift was introduced (hard to verify; assume YES if drift has existed longer than ~an hour)

**Scope of changes:**

- The drifted extra-file(s) → revert DOWN to the manifest's value
- Manifest and `package.json` (cli) unchanged — they were already correct

**This is simpler** (fewer files changed, no manifest edit) **but risks user regression** if anyone was installed at the drifted high version. Their local cache dir (e.g., `~/.claude/plugins/cache/.../compound-engineering/<drifted>/`) becomes orphaned, and tooling that treats the version field as monotonic may refuse to downgrade or emit warnings.

### Path C: `release-as` pin

Use when you want release-please itself to perform the sync via a normal release PR, instead of manually editing the manifest.

**Scope of changes:**

- Forward-sync all extra-files UP to the drifted version (same as Path A)
- Add `"release-as": "<drifted+1>"` to each affected component in `.github/release-please-config.json`
- Do NOT edit the manifest
- Next release-please run produces a release PR bumping everything to `<drifted+1>`, which is above the drifted version and avoids regression

**Caveat:** after the release PR merges, the `release-as` pin must be removed — otherwise every subsequent release will be pinned to that same version. The repo has been bitten by stale `release-as` pins before (see `ab44d89b`), so Path C is usually more overhead than Path A. Prefer Path A unless there's a specific reason release-please should drive the bump.

### Summary

| Path | Files changed | When to use | Risk |
|---|---|---|---|
| A — forward-sync | 3–5 (extras + manifest + linked) | Anyone might be at drifted version (default) | None if execution is correct |
| B — backward-revert | 1–2 (just the drifted extras) | Verified no one is at drifted version | User regression if verification was wrong |
| C — `release-as` pin | 3–5 + config change + cleanup after | Want release-please to drive the bump | Requires remembering to remove pin |

## Manifest manual edits

**Release-please normally maintains `.github/.release-please-manifest.json`.** It's updated inside release PRs alongside the extra-files. Humans don't touch it under normal operation.

**Manual edits are legitimate** in exactly one case: recovery from out-of-band releases or version changes, as in Path A above. Release-please's own documentation calls this out — the manifest is tracked in git precisely so it can be corrected when reality diverges from what release-please remembers.

If you find yourself editing the manifest for any reason other than Path A recovery, stop and reconsider. You're probably doing something release-please is meant to own.

## Worked example: 2026-04-24 incident

Between `chore: release main (#675)` (which cut 3.0.3) and PR #677, four direct-to-main merges (`1f20c384`, `f8720da3`, `22d493b1`, `47350c3e`) each bumped `.claude-plugin/plugin.json` by one patch version — 3.0.3 → 3.0.4 → 3.0.5 → 3.0.6 → 3.0.7 — without touching `.cursor-plugin`, `.codex-plugin`, the manifest, or `package.json`. The bumps were added inline with feature work, bypassing PR CI because they landed via direct merge to `main`.

The drift was invisible until PR #677 opened. That PR's CI ran `release:validate` on its merge commit, which inherited main's drifted state (`.claude-plugin` at 3.0.7, everything else at 3.0.3). The validator failed on `.cursor-plugin/plugin.json` and `.codex-plugin/plugin.json` for not matching `.claude-plugin`.

Recovery used Path A (forward-sync to 3.0.7) because:

- Developers installing `compound-engineering` from a local main checkout would have 3.0.7 in their plugin cache by then
- Path B would have orphaned those caches and triggered version-regression warnings
- Path C would have reintroduced a `release-as` pin that had just been cleaned up

PR #678 applied the full Path A fix across five fields in four files and updated a stale test assertion that was also hiding behind the release-validate failure (commit `1f20c384` renumbered steps in `lfg/SKILL.md` but didn't update `tests/review-skill-contract.test.ts`). See PR #678's commits for the exact diff.

## Prevention

Direct-to-main merges are the root cause. They bypass the PR CI that runs `release:validate`, test suites, and semantic title validation.

**Branch protection on `main`** is the enforcement. The `test` status check must be required before merge, and admin bypass should be off (or used only for true emergencies). Without branch protection, the AGENTS.md "don't manually bump" rule is honor-system only — which this incident showed is insufficient.

Optional complementary guards:

- **Dedicated CI job** detecting manual version bumps on non-release-please PR authors. Attacks the cause rather than the symptom, with a clearer error message pointing at AGENTS.md.
- **Pre-commit hook** running `release:validate` locally via `core.hooksPath`. Catches accidents before push. Bypassable with `--no-verify`, so it's a speed-bump, not a lock.

These are nice-to-haves. Branch protection is the real fix.

## Related docs

- `docs/solutions/workflow/manual-release-please-github-releases.md` — big-picture release model
- `docs/solutions/plugin-versioning-requirements.md` — plugin-scoped contributor rules
- `plugins/compound-engineering/AGENTS.md` — "Versioning Requirements" section with the don't-manually-bump rules
- `.github/release-please-config.json` — the extra-files and linked-versions configuration this doc references
- `src/release/metadata.ts` — the `syncReleaseMetadata` function that `release:validate` runs
