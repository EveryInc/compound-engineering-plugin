---
title: "Release-please version drift recovery"
category: workflow
date: 2026-04-24
last_refreshed: 2026-06-20
created: 2026-04-24
severity: high
component: release-automation
problem_type: workflow_issue
tags:
  - release-please
  - version-drift
  - plugin-versioning
  - recovery-playbook
  - extra-files
---

# Release-please version drift recovery

## Problem

Manual edits to a release-managed version field cause drift that:

- Breaks `bun run release:validate` on PR CI.
- Can cause version regression on the next release-please run if left uncorrected.
- Is easy to introduce accidentally during a feature commit.
- Has multiple recovery paths with different user-impact trade-offs.

This doc is the playbook when drift is detected. It exists because investigating from scratch takes significant effort and the wrong choice can make things worse.

## File relationship map

The current root-native repo has three release components. Release-please reads `.github/.release-please-manifest.json` and writes each package's configured `extra-files`.

```text
.github/.release-please-manifest.json
├── "."                -> compound-engineering package/plugin (v = X.Y.Z)
├── ".claude-plugin"   -> Claude marketplace                 (v = M.N.O)
└── ".cursor-plugin"   -> Cursor marketplace                 (v = P.Q.R)

.github/release-please-config.json
└── packages
    ├── "." extra-files
    │   ├── package.json
    │   ├── .claude-plugin/plugin.json
    │   ├── .cursor-plugin/plugin.json
    │   ├── .codex-plugin/plugin.json
    │   └── gemini-extension.json
    ├── ".claude-plugin" extra-files
    │   └── marketplace.json ($.metadata.version)
    └── ".cursor-plugin" extra-files
        └── marketplace.json ($.metadata.version)
```

Key invariants:

- Every extra-file inside the root `.` component must share the same plugin version.
- Marketplace components are independent; their metadata versions do not move with every plugin release.
- `bun run release:validate` enforces root package/plugin version parity, marketplace parity, Codex manifest shape, and description sync.
- The repo no longer has separate `cli`, `plugins/compound-engineering`, or `coding-tutor` release components.

## How release-please tracks versions

Release-please treats the manifest as the source of truth for "last released version per component." Extra-files are outputs that release-please writes during a release PR. Under normal operation, humans do not hand-edit the manifest or extra-files. Drift is the state where that guarantee has been violated.

## Drift detection

`bun run release:validate` runs on PRs and pushes to `main`. It fails when:

- Root package/plugin versions disagree across `package.json`, `.claude-plugin/plugin.json`, `.cursor-plugin/plugin.json`, `.codex-plugin/plugin.json`, and `gemini-extension.json`.
- Marketplace plugin lists diverge across Claude, Cursor, and Codex marketplace metadata.
- A Codex manifest is missing required fields or points at a missing `skills/` directory.
- Release-owned descriptions drift across plugin manifests or marketplace entries.
- `release-as` pins become stale relative to the base-branch manifest.

Important: a state where all extra-files agree at X.Y.Z but the manifest still says W.X.Y can pass some local checks and still cause the next release PR to regress versions. Check the manifest when investigating drift.

## Recovery decision tree

```text
release:validate reports drift
    |
    v
1. Identify the affected component:
   - "." root package/plugin
   - ".claude-plugin" marketplace
   - ".cursor-plugin" marketplace
    |
    v
2. Compare:
   - extra-files vs each other within that component
   - extra-files vs .github/.release-please-manifest.json
   - any active release-as pins in .github/release-please-config.json
    |
    v
3. Is anyone installed at the drifted higher version?
   - Yes or unknown -> forward-sync
   - Verified no -> backward-revert
```

### Path A: Forward-sync

Use when any user may have installed the drifted version locally. For the root `.` component, update every root extra-file to the drifted higher version:

- `package.json`
- `.claude-plugin/plugin.json`
- `.cursor-plugin/plugin.json`
- `.codex-plugin/plugin.json`
- `gemini-extension.json`
- `.github/.release-please-manifest.json` entry for `.`

For marketplace drift, sync the affected marketplace `marketplace.json` metadata version and matching manifest entry.

Why the manifest edit is necessary: without it, the next release-please run reads the stale last-released value and may write a lower next version to extra-files, regressing users at the forward-synced version.

### Path B: Backward-revert

Use only when you can verify no user is installed at the drifted version. Revert the drifted extra-file(s) down to the manifest value, leaving the manifest unchanged.

This is fewer files, but it risks user regression if verification was wrong. Default to Path A when in doubt.

### Path C: `release-as` pin

Use when you want release-please itself to drive the recovery via a normal release PR. Forward-sync extra-files up to the drifted version, add a temporary `"release-as": "<drifted+1>"` pin for the affected package, and let the release PR bump above the drifted value.

This has cleanup overhead: remove the pin after the release PR lands. Prefer Path A unless there is a specific reason the release PR should own the bump.

## Summary

| Path | Files changed | When to use | Risk |
|---|---|---|---|
| A -- forward-sync | Extra-files + manifest | Anyone might be at drifted version | Low if executed completely |
| B -- backward-revert | Drifted extra-file(s) only | Verified no one has drifted version | User regression if wrong |
| C -- `release-as` pin | Extra-files + config pin + later cleanup | Want release-please to drive recovery | Stale pin risk |

## Prevention

Direct-to-main merges are the root cause. They bypass PR CI, release validation, tests, and semantic title checks.

Branch protection on `main` is the enforcement. The `test` status check must be required before merge, and admin bypass should be reserved for true emergencies.

Optional guards:

- Dedicated CI detecting manual version bumps by non-release PRs.
- A pre-commit or pre-push hook running `bun run release:validate`.

## Related docs

- `docs/solutions/workflow/manual-release-please-github-releases.md` -- big-picture release model.
- `docs/solutions/plugin-versioning-requirements.md` -- plugin-scoped contributor rules.
- `AGENTS.md` -- repo-level release versioning rules.
- `.github/release-please-config.json` -- package and extra-file configuration.
- `src/release/metadata.ts` -- metadata sync and validation implementation.
