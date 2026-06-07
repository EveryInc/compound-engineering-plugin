---
name: ce-verify-before-complete
description: "Verification gate that must pass before claiming any work complete. Use when about to mark a task done, mark a todo completed, summarize finished work, or open or merge a PR. Runs the repo-native verifier, reads back every changed file, ghost-checks removed names, and diffs the result against the original request before any completion claim."
---

# Verify Before Complete

A claim of completion is a defect when its verifier failed or never ran. Optimism is not evidence. Run every gate below before marking work done, marking a todo completed, summarizing finished work, or opening or merging a PR. This is a discipline, not a flexible pattern: do not skip a gate, do not reorder past a failure, do not weaken a check to make it pass.

## Gates

Run all five. Each must pass before the next claim of completion.

| # | Gate | Pass condition |
|---|------|----------------|
| 1 | Verifier | Repo-native test/check suite runs and is green |
| 2 | Read-back | Every file the work claims to have changed contains the change, complete, no truncation, no placeholder |
| 3 | Ghost-check | No surviving reference to any name or path the work claims to have removed or renamed |
| 4 | Request diff | Every explicit requirement is met; any unmet one is reported as not done and blocks the completion claim |
| 5 | Honest report | Failures reported verbatim with their output; no papered-over red gate |

## Gate 1: Verifier

Run the project's own verifier and require green. Discover it in this order, first match wins:

1. Project scripts: a `test`, `check`, or `lint` script in `package.json`; a `justfile` recipe; a `makefile` target.
2. Language-standard runner when no project script exists: `cargo test`, `go test ./...`, `pytest`, `bun test`, and the equivalent for the stack in use.

Run the discovered command. Scope to the changed paths when the runner supports it and the full suite is slow; otherwise run the whole suite. A green run is the only pass. If the verifier cannot run at all (no suite configured, runner missing, sandbox blocks it), do not guess a result: say so explicitly and mark the work unverified.

## Gate 2: Read-back

Read back every file the work claims to have changed. Confirm the claimed change is present and complete. Reject on:

- Truncation: a function, block, or file that ends mid-statement.
- Placeholder: `TODO`, `...`, `FIXME`, stub bodies, or "rest unchanged" left in place of real content.
- Absent edit: the file does not contain the change the summary describes.

Read the file, do not trust the edit tool's diff summary. An edit that silently no-ops still reports success.

## Gate 3: Ghost-check

For every name, symbol, or path the work claims to have removed or renamed, search the repo for surviving references with the native content-search tool (e.g. Grep in Claude Code). A removal is complete only when no caller, import, doc, or config still names the old identifier. A rename is complete only when no occurrence of the old name remains except where intended.

## Gate 4: Request diff

Re-read the original request. List every explicit requirement. For each, mark it met or not done against what was actually delivered. A requirement that was dropped, deferred, or forgotten is reported as not done, not omitted from the summary. Partial delivery is reported as partial. Any unmet requirement blocks the completion claim: the work is reported as incomplete, not complete, until every requirement is met or the user has accepted the reduced scope.

## Gate 5: Honest report

Report the outcome of every gate. When a gate is red, report the failure verbatim with its output and stop; do not claim completion. Never weaken a test, relax an assertion, skip a case, or edit the verifier to turn a gate green. The work is complete only when all five gates pass; otherwise it is unverified or incomplete, and the report says which.
