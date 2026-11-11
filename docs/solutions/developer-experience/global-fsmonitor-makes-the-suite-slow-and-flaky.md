---
title: "A global core.fsmonitor=true makes the subprocess-heavy suite 2.6x slower and flaky"
date: 2026-09-08
category: developer-experience
module: test-suite
problem_type: test_failure
component: testing_framework
symptoms:
  - "bun run test finishes in 220s instead of ~85s and 2-5 tests time out at 20000ms on every run"
  - "The timed-out tests differ from run to run and pass in isolation in under a second"
  - "The log shows 'killed 1 dangling process' before a beforeEach hook timeout that ran git commit"
root_cause: config_error
resolution_type: environment_setup
severity: medium
tags:
  - git
  - fsmonitor
  - flaky-tests
  - cursor-cloud-agent
  - test-timeouts
---

# A global core.fsmonitor=true makes the subprocess-heavy suite 2.6x slower and flaky

## Problem

On a Cursor cloud-agent VM, `bun run test` ran in 220s with two to five 20s timeouts on every run, each time in a different git-heavy file (`cli.test.ts`, `codex-dev.test.ts`, `ce-code-review-mechanics.test.ts`, `doc-claims-validator.test.ts`). Every timed-out file passed in isolation in seconds, so the failures looked like ordinary 4-core load flakiness and were about to be written off as such.

## Symptoms

- Suite wall time 216-244s on a 4-core VM versus ~81s on CI's 4-core runner.
- A rotating set of timeouts: `CLI > install --branch clones a specific branch`, `Codex development installation transitions > ...`, `scope helper excludes base-only changes after the base advances`.
- `killed 1 dangling process` printed before a `beforeEach` hook timeout whose body was `git commit`.

## What Didn't Work

- Rerunning the timed-out files in isolation: they passed, which hides the cause rather than finding it.
- Attributing it to CPU contention alone: the suite is idle-bound (blocked on `git`, `python3`, `bash`), so contention should not have turned a 3s file into a 20s timeout.

## Solution

The VM's global git config (`git config --global --list`) carried `core.fsmonitor=true`. The suite creates hundreds of throwaway repos with `git init`, and with that setting every first `git` command in a fresh repo starts an fsmonitor daemon; the daemons pile up, some `git commit`/`git status` calls block on them, and Bun eventually kills the dangling processes.

Running the suite with a minimal global config that keeps the identity and drops the setting made it green and fast on the same tree:

```bash
printf '[user]\n\tname = Cursor Agent\n\temail = cursoragent@cursor.com\n' > /tmp/min-gitconfig
GIT_CONFIG_GLOBAL=/tmp/min-gitconfig bun run test
# 3941 pass / 0 fail in 83.7s, versus 220s and 5 timeouts with the VM's default config
```

Per-file confirmation: `tests/codex-dev.test.ts` took 30s with one timeout under the VM config and 266ms with the minimal one.

## Why This Works

fsmonitor is a per-repository watcher meant for one long-lived checkout. A test suite that mass-produces short-lived repos turns it into a daemon per repo, and the daemons' startup and IPC dominate the git calls the tests are blocked on. Removing the setting restores git to the plain stat-based path the suite was measured against.

## Prevention

- Before blaming load for git-test timeouts, check `git config --global --get core.fsmonitor`; a `true` there explains a rotating set of timeouts in git-heavy files.
- When running the suite inside a Cursor cloud agent, pass `GIT_CONFIG_GLOBAL` pointing at a minimal config as above, or run `git config --global --unset core.fsmonitor` for the session. CI runners do not carry the setting, so CI results were never affected.
- Some fixtures now isolate global git config themselves: the ce-work workspace harness (`tests/skills/helpers/ce-work-workspace-harness.ts`, which also forces `core.fsmonitor=false`), the packs fixtures (`tests/skills/helpers/packs-fixtures.ts`), and `tests/skills/ce-code-review-cross-model-routes.test.ts`. The rest of the suite, including `cli.test.ts` and `codex-dev.test.ts`, still inherits the host config.
- Tell this apart from the bun lost-exit defect ([bun-parallel-worker-loses-subprocess-exit.md](bun-parallel-worker-loses-subprocess-exit.md)), which shares the `killed 1 dangling process` line: fsmonitor gives a slow suite with rotating timeouts in git-heavy files that pass in isolation, while the bun defect fails at exactly the per-test timeout with empty child output, or leaves a zombie child under a wedged worker.

## Related Issues

- Measured while dogfooding PR #1656 (Compound Packs merged with main); every suite run before the fix reported "load-induced" timeouts that were actually this.
