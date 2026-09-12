---
title: "Always-on AGENTS.md vs task-loaded contributor notes"
date: 2026-09-12
last_updated: 2026-09-12
category: developer-experience
module: compound-engineering
problem_type: best_practice
component: development_workflow
severity: medium
applies_when:
  - Editing root AGENTS.md / CLAUDE.md
  - Changing CI layout, scratch roots, platform-variable skill prose, or adding a target provider
  - Deciding whether an instruction belongs in the always-on file
tags:
  - agents-md
  - context-tax
  - astra
  - ci
  - scratch
  - portability
---

# Always-on AGENTS.md vs task-loaded notes

Root `AGENTS.md` (also `CLAUDE.md`) loads on every turn. Keep invariants there. Load the sections below only when the task needs them.

[OpenAI's Astra note](https://developers.openai.com/blog/rethinking-skills-and-prompts-for-gpt-6-astra) is the reason this split exists: a stack of docs before every edit burns context, and extra test-cheerleading causes extra tests. The always-on file already has Lean Repo Grounding. These notes are the essays that used to sit beside it.

## Scratch-root layout

Default to OS temp. Use `.context/` only when the artifact is repo-bound and user-curated, branch-inseparable, or the path is core UX. Copy the scratch-root preamble from any shipped skill (for example `skills/ce-code-review/SKILL.md`); do not re-derive it. `tests/scratch-root-preamble-executes.test.ts` runs every copy, including the fallback.

- **Per-run throwaway:** `mktemp -d "${TMPDIR:-/tmp}/<prefix>-XXXXXX"`. Always pass an explicit template under `${TMPDIR:-/tmp}`. Do not use bare `mktemp`, `mktemp -d`, `mktemp -t`, or `mktemp -d -t`: those ignore `$TMPDIR` on macOS.
- **Cross-invocation reusable:** `/tmp/compound-engineering-<effective-uid>/<skill-name>/`. Derive the UID with `id -u`, reject a symlink or path not owned by the current user, and create or repair the top-level root to mode `0700`. Probe writability (`[ -w ]`) before committing to `/tmp`; if that root cannot be created, is not yours, or is not writable, use `${TMPDIR:-/tmp}/compound-engineering-<effective-uid>` instead. Claude Code's macOS sandbox allowlists `$TMPDIR` (`/tmp/claude-<uid>`) but not `/tmp` itself.
- **Discoverable collection exception:** omit the per-run directory only when later invocations enumerate sibling final artifacts as core product behavior. Use a stable collection namespace, descriptive immutable filenames, and no-overwrite collision handling that atomically reserves the final filename and retries with the next suffix on collision; never check availability and then write.
- Prefer `/tmp` over `$TMPDIR` so paths stay inspectable. `$TMPDIR` is the fallback, never the first choice.
- Namespace `.context/` under `.context/compound-engineering/<workflow-or-skill-name>/`.
- Durable outputs belong in `docs/` or another tracked location.
- Native Windows is a supported target for Python interpreter resolution and peer-job detach — never hardcode `python3`; probe execution per `docs/solutions/conventions/resolve-python-interpreter-not-python3.md`.

## CI wall-time notes

Load when changing test-file layout, worker counts, or CI proxies.

The `test` script is `scripts/run-tests.ts`: one `bun test --parallel` pass (implies `--isolate`), then a TimeoutError-only serial re-run in a fresh process. Do not pin a worker count. `--parallel` with no value tracks the runner's core count. The re-run contract: `docs/solutions/developer-experience/bun-parallel-worker-loses-subprocess-exit.md`.

Raising it looks free — the suite is idle-bound — but it was measured on CI and it is not: at `--parallel=8` on a 4-core runner, wall time improved ~9% (102s -> 93s) while total test-CPU inflated from 223s to 343s, and five tests crossed the 5000ms default per-test timeout. A file that legitimately runs for seconds should call `setDefaultTimeout`.

A file never splits across workers, so an oversized file sets a floor. `tests/skills/ce-work-unit-workspace.test.ts` was 4,564 lines and 86 tests under one `describe`; it is now five `ce-work-unit-workspace-*.test.ts` files sharing `tests/skills/helpers/ce-work-workspace-harness.ts`. Measured with three `workflow_dispatch` runs per ref, the `Run tests` step went from a median of 88s (87/112/88) to 81s (83/80/81).

Splitting bought ~8% of CI wall time and most of the run-to-run variance — baseline spread 25s, split spread 3s. Do not use `bun test --parallel=4` on a many-core laptop as a CI proxy. It predicted a 26% CI win where the real number was 8%. Dispatch the real workflow on both refs instead.

Size a test file by its measured time, not its line count. A file is a wall-time problem when it approaches the suite's slowest-file ceiling. Get per-file times with:

```bash
bun test --parallel --reporter=junit --reporter-outfile=/tmp/t.xml
```

The `ce-work-unit-workspace-*` shards run 10-23s each against a ~36s ceiling (`tests/ce-babysit-pr-snapshot.test.ts`). Put shared fixtures in `tests/skills/helpers/`.

A test that runs a bundled script which inspects the repository must point that script at a throwaway repo, never this checkout. The fixture pattern is `dirtyFixtureRepo()` in `tests/skills/ce-code-review-cross-model-routes.test.ts`.

## Plugin-cache confirmation

Load when deciding whether a Claude Code session is running your current skill edit.

A version-matched cache is not automatically stale — confirm by content, not by version. When this working tree is the local marketplace source, a session (re)start re-copies it into `~/.claude/plugins/cache/.../compound-engineering/<version>/` (a plain copy, no `.git`; `<version>` is the working tree's `.claude-plugin/plugin.json` version). Version match proves only that the cache was built from this release. Diff the specific cache file against the working-tree file. Never infer "stale" or "current" from the version segment alone. Do not edit `~/.claude/plugins/cache/` or `~/.claude/plugins/marketplaces/` to force a reload.

## Adding a target provider

Load when adding a `--to` / `--also` provider.

Only add a provider when the target format is stable, documented, and has a clear mapping for tools/permissions/hooks.

1. Add a handler in `src/targets/index.ts` with `implemented: false` until complete. Use a dedicated writer module.
2. Add provider-specific types under `src/types/`. Implement conversion in `src/converters/`. Keep mappings explicit.
3. Ensure `convert` and `install` support `--to <provider>` and `--also`. Write to a clean provider root, consistent with OpenCode.
4. Tests: extend `tests/fixtures/sample-plugin`, add mapping coverage in `tests/converter.test.ts`, a writer test, and a CLI test.
5. Update README with the new `--to` option and output locations.

## Platform-variable tiers

Load when writing executed shell in a skill. The always-on file keeps the invariant and the `SKILL_DIR` shape.

How a bundled-file reference resolves depends on who resolves it and whether a shell is involved.

- **Tier 1 — Read-time:** relative path from the skill root. No variable prefix.
- **Tier 2 — Prose pointer:** relative path plus "from this skill's directory".
- **Tier 3 — Executed shell:** model-filled `SKILL_DIR` with a trailing `;` on the assignment line, then `bash "$SKILL_DIR/scripts/…"`. Keep the `;` — some hosts flatten the newline into a space and the prefix form expands `$SKILL_DIR` before the assignment.

`SKILL_DIR` is not an env var. A child script derives its own directory from `BASH_SOURCE`, not `SKILL_DIR`. Avoid `${CLAUDE_SKILL_DIR}` in this cross-host plugin — it is empty off Claude Code. Do not use `!` load-time pre-resolution (`tests/skill-shell-safety.test.ts`). Gather context at runtime with one argv-style command per shell tool call.

Claude Code's permission checker evaluates every subcommand of a compound command. A bare `[ -f … ]` test is not pre-approved, so wrapping a pinned `bash "…sh"` call in `if … then … fi` defeats a narrow `Bash(bash *…sh)` allow-rule. The model-filled `SKILL_DIR` path is dynamic and will not match a static pin anyway.

When a platform variable is unavoidable, resolve it at runtime with a single shell tool call and include an explicit fallback if the value is empty, a literal command string, or an error.
