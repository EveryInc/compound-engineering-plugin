# Evals

Behavioral evaluations for agents and skills shipped by this repo's plugins. **Repo-only — these do not ship with the plugin.**

## When to use this directory

Use `evals/` when validating behavior that is shaped by an agent or skill prompt and can only be measured by running an LLM. Examples:

- Confirming an agent adheres to a tool-call cap or stop-when-complete rule
- Comparing dispatch-prompt variants for token / wall-time efficiency
- Catching regressions where an agent's behavioral guardrails get unwound

For deterministic checks that do not need a live LLM (script output, parser correctness, manifest parity), use `tests/` and run via `bun test`.

## How evals run

Evals dispatch the target agent via the Agent tool from inside an active Claude Code session. They cannot run via `bun test` — there is no Agent tool in the test runner. Each eval is a self-contained directory with:

- `fixtures/` — synthetic inputs (e.g., session-file layouts under `~/.claude/projects/-tmp-eval-...`)
- `run.ts` (or `run.md`) — orchestration: set up fixtures, dispatch the agent, capture metrics, clean up, report
- `expected.md` — success criteria

Each eval cleans up its own fixtures on completion. No shared global state.

## Critical caveat: agent definitions load at session start

Claude Code appears to load plugin agent definitions once at session start and hold them in memory for the duration of the session. **Edits to an agent's `.agent.md` file made after session start are not picked up by subsequent Agent-tool dispatches in that same session** — the dispatched agent runs against the in-memory copy from session start.

Practical consequences:

- Iterating on an agent definition and re-running the eval inside the same session does **not** test your edits. You will see identical behavior across iterations.
- A test was confirmed during the development of this framework: a uniquely-identifiable marker was added to the agent definition with an instruction to echo a corresponding string in any response. After file-syncing the change to every cached path under `~/.claude/plugins/`, the dispatched agent did not echo the string — confirming it was running an in-memory copy not refreshed from disk.

How to validate agent edits with this framework:

1. Make and commit the agent edits in the repo.
2. **Restart your Claude Code session** so the new definition loads at session start.
3. Run the eval in the fresh session.

Mechanical primitives (skill scripts like the `--keyword` mode on `extract-metadata.py`) do not have this restriction — `bun test` always runs the current source. Only LLM-driven agent behavior is affected.

## Running an eval

From within Claude Code in this repo, ask the agent to run a specific eval:

```
Run evals/session-historian/run.ts and report the results
```

The orchestration script handles fixture setup, agent dispatch, measurement, and cleanup.

## Why a top-level directory

Evals are conceptually distinct from `tests/` (deterministic, fast, runs in CI) and `scripts/release/` (build/release tooling). They cost real LLM tokens and wall time per run, which is why they live separately and are not invoked from `bun test`. The dedicated directory makes the shipping boundary explicit: `evals/` never lands in `~/.claude/plugins/cache/...` after a marketplace install.
