---
title: "Agent-Friendly CLIs: An Absent Artifact Is Not an Error"
date: 2026-03-26
module: cli
problem_type: best_practice
component: tooling
severity: medium
tags:
  - agent-cli
  - cli-design
  - error-handling
  - exit-codes
  - peer-job-runner
last_updated: 2026-09-02
---

# Agent-Friendly CLIs: An Absent Artifact Is Not an Error

General agent-CLI hygiene (non-interactive by default, `--json` output, examples in `--help`, actionable errors, idempotent retries, bounded output) is covered by public guidance such as Anthropic's tool-design notes and the Command Line Interface Guidelines and is not repeated here. This doc keeps the one lesson those guides do not state and that this repo paid for.

## Not every failure is an error

A CLI's "not found" path often serves two different callers at once: a genuine read failure, and a caller correctly discovering there is nothing there. When the same errno answers both, the routine case is reported as a crash.

`peer-job-runner.py result --path` reads a peer's output artifact. A peer whose gate is not met exits 0 and writes nothing, so an absent artifact is the ordinary outcome, but the command answered with the raw syscall error either way:

```
# Bad -- the expected outcome, reported as a crash
$ peer-job-runner.py result --path <run-dir>/adversarial-codex.json
peer-job-runner: file missing or unreadable: [Errno 2] No such file or directory: '...'

# Better -- name the outcome, and resolve the id into a state
$ peer-job-runner.py result "<job-id>" --path <run-dir>/adversarial-codex.json
peer-job-runner: no artifact at <run-dir>/adversarial-codex.json
peer-job-runner: job <job-id>: done (worker exited 0)
```

Measured: that gap accounted for 91 of 124 recorded failures across 58 sessions in three weeks on one machine (`EveryInc/compound-engineering-plugin#1607`), a benign condition logged as an error every time.

Two moves fix it. **Name the outcome** rather than the syscall that failed. And **when a stateful id is available at the call site** (job id, resource id, request id) resolve it and report that state, because "still running" and "ran and produced nothing" are different answers that collapse into one error if you stop at the errno.

## Splitting one error into several outcomes is where the next bug hides

Once a single error path branches into several, each branch must keep the exit code its contract already assigns it. The first cut of the #1607 fix folded an ownership failure and an unresolvable job id into the same code as the routine "settled, nothing there" case. That re-creates the original conflation in the opposite direction, and it is worse: it hides an alarming condition inside the code callers already treat as "nothing to do, move on."

The shipped version keeps each outcome on its own documented code (running, ownership failure, unknown id, settled-with-no-artifact; the mapping is in the `result` handler's docstring in `skills/*/scripts/peer-job-runner.py`). When you split an error path, re-read the tool's documented exit-code contract and check that every new branch lands on the code its callers already switch on, not the nearest convenient one.

## Rejected alternative: make the absence unreachable

The tempting fix was to declare the expected output up front so a job is only "done" once the artifact exists. That was wrong here: the same runner classifies a declared-but-absent result after a clean exit as a failure, which would have relabelled every legitimate gate-skip. When one signal has two consumers, fix the reporting rather than redefining what the signal means.

**Evaluation goal for any agent-facing CLI:** a caller can tell an expected empty result from a genuine failure, and each distinct failure keeps its own exit code.
