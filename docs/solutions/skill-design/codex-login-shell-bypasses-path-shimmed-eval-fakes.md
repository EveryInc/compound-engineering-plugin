---
title: "Codex runs commands in a login shell that silently bypasses PATH-shimmed eval fakes"
date: 2026-10-26
category: skill-design
module: compound-engineering-plugin skill evaluation
problem_type: test_failure
component: testing_framework
severity: medium
symptoms:
  - "Every Codex cell ends in about half a minute while the Claude cells of the same scenarios run normally"
  - "Codex transcripts stop at `gh repo view` against real GitHub with 'could not identify a GitHub repository'"
  - "The fake gh writes no call log (gh-calls.jsonl) for the Codex cells"
root_cause: config_error
resolution_type: environment_setup
tags:
  - skill-evals
  - fake-cli
  - codex
  - login-shell
  - path-shim
  - macos
related_components:
  - development_workflow
---

# Codex runs commands in a login shell that silently bypasses PATH-shimmed eval fakes

## Problem

A behavioral eval that puts a fake `gh` (or `git`) first on `PATH` works under `claude -p` but not under `codex exec` on macOS. Codex runs each shell command as `zsh -lc`, and login-shell startup reorders `PATH` so the real binary wins. Nothing errors, so the eval reads as a skill failure rather than a harness failure.

## Symptoms

Seen while running the `ce-babysit-pr` stale-intake pack (`tests/skill-eval-cell/packs/ce-babysit-pr-stale-intake.md`), 11 Codex cells in parallel:

- Every Codex cell finished in 21 to 32 seconds; the Claude cells of the same scenarios took 42 to 151 seconds.
- The Codex transcripts showed `/bin/zsh -lc 'gh repo view ...'` exiting 1, then a report that no GitHub repository could be identified and the skill must stop.
- The fake `gh` wrote no call log for those cells; the Claude cells logged the full sequence.

## What Didn't Work

- Prepending the fixture's bin directory to `PATH` in the spawned host's environment. That is enough for `claude -p`, whose Bash tool keeps the inherited `PATH`, and it is what `docs/solutions/skill-design/paired-old-vs-new-injection-skill-evals.md` recommends. Under Codex the prepended entry survives only until each command's login shell starts.
- Reading the 25-second runs as the skill behaving badly. The final reports looked like a correct GitHub-only stop, so the failure was easy to misattribute to the change under test.

## Solution

Run Codex commands without a login shell, and keep the user's zsh startup files out of the cell. The stale-intake runner does both (`tests/skill-eval-cell/packs/ce-babysit-pr-stale-intake/run-scenario.ts:56` and `:222-225`):

```ts
// codex argv: no login shell, so /etc/zprofile's path_helper never runs
[...argv.slice(0, -1), "-c", "allow_login_shell=false", "--json", "-o", finalFile, prompt]

// env: an empty ZDOTDIR, so ~/.zshenv (which may eval `brew shellenv`) is not sourced
const env = { ...plan.env, ZDOTDIR: zdotdir, PATH: `${path.join(cell, "bin")}${path.delimiter}${plan.env.PATH ?? ""}` }
```

After the change, a single Codex probe cell logged 12 fake-`gh` calls and completed an ordinary checkpoint tick, and the rerun of all 11 Codex cells produced verdicts graded from artifacts.

An earlier fixture reached the same cause with a different fix: `tests/skill-eval-cell/fixtures/resolver-caller-publication/README.md` points `ZDOTDIR` at a directory whose `.zshenv` and `.zprofile` re-prepend the fixture bin directory after `path_helper` runs. Either works; the point is that something must act after login-shell startup or prevent it.

## Why This Works

Two macOS startup paths reorder `PATH` inside the shell Codex spawns:

- A login shell runs `/etc/zprofile`, which calls `path_helper`. `path_helper` builds `PATH` from `/etc/paths` and `/etc/paths.d/*` first and appends the inherited entries after them. `/etc/paths.d/homebrew` lists `/opt/homebrew/bin`, where the real `gh` lives, so it lands ahead of the fixture's bin directory.
- Every zsh, login or not, sources `$ZDOTDIR/.zshenv` (default `~/.zshenv`). A `.zshenv` that runs `eval "$(brew shellenv)"`, a common setup so non-interactive agent shells find Homebrew, prepends `/opt/homebrew/bin` again.

`allow_login_shell=false` removes the first path and an empty `ZDOTDIR` removes the second, so the inherited `PATH` reaches each command unchanged.

## Prevention

- Before trusting any Codex cell that relies on a PATH fake, check that the fake's call log is non-empty and covers the commands the skill must run. An empty log means the run tested the real tool, whatever the transcript concluded.
- Apply the same two settings in any runner that launches `codex exec` against PATH fakes. The repository's cell driver does not today: `tests/skill-eval-cell/hosts.ts:140-157` builds the `codex exec` argv without `allow_login_shell=false`, and `tests/skill-eval-cell/path-shim.ts:151` only prepends `PATH`, so its `--shim-gh-pr` and `--shim-git-push` shims are exposed to the same bypass on macOS. That exposure is inferred from the mechanism and was not re-run here.
- When one host's cells finish several times faster than another's on the same scenario, inspect the harness before grading the skill.
