# Test and Eval Coding Standards

Criteria for `tests/**`, including `tests/skill-eval-cell/`, on top of the root `CODING_STANDARDS.md`.

## Suite mechanics

- A test file never depends on another file's leftovers, and it writes only inside its own `mktemp` directory. The suite runs files in parallel worker processes.
- A flaky `TimeoutError` is not answered with a `retry` count: a retry runs inside the same wedged worker, and `scripts/run-tests.ts` already re-runs timeout-only failures in a fresh process.
- No test or script pins a worker count.
- A test file is split or sized by its measured run time, not its line count.

## Guards that can fail

- Each new contract pin or eval grade goes red on the regressing variant. The PR shows that, or the reviewer can see it from the assertion.
- A pin reads the file or field that owns the rule, not a concatenated corpus. Its needle does not also match the task prompt, a negation (`commented` inside `non-commented`), or neighboring text.
- A guard that cannot fail reports false safety and costs more than a missing one.

## Evals

- A grade for a mutation or a decision checks an artifact the model cannot author: commits since the seed revision, workspace bytes, or shim invocation logs. Trailers and narration alone let a regression grade itself green.
- A forbidden call fails loudly under the shim and is graded from the shim's log.
- `baseline_ref` is an immutable SHA reachable from `main`. A row that grades behavior the baseline lacks is `post_only`.

## Hermetic tests

- Child processes get an environment built from an allowlist, or one with every harness, proxy, and session variable scrubbed (`CODEX_*`, `CLAUDE_*`, `HTTP_PROXY`).
- Fixture repos set branch name and signing explicitly. Tests that depend on permissions account for running as root.
- Tests synchronize on observable state, never a fixed sleep.
- A test that runs a bundled script that inspects a repository points it at a throwaway repo.

## Subprocess budgets

- A file that spawns subprocesses sets a file-level `setDefaultTimeout`.
- Each subprocess scenario is its own case (`test.each`), not one iteration of a loop inside a single test.
- No per-test override is lower than the file default.

## Settled: answer with the standard

- Requests to replace a string pin with a fresh-agent eval: behavioral evals are best-effort evidence, not CI (AGENTS.md "What belongs where").
- Timeout raises without a reproduction or timing: answer with the measured run.
- Repo conventions applied to fixture content: fixtures model other repos.
