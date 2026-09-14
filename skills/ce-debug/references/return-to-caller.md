# ce-debug — return-to-caller mode (non-interactive, caller owns the steps after the fix)

Loaded when `ce-debug` is invoked with `mode:return-to-caller` by an orchestrator such as `lfg` on its defect route. The caller asked for the bug fixed and owns everything after the fix: simplify, review, compound, commit of anything further, push, PR, and CI. This skill investigates, fixes, verifies, commits on a feature branch, and returns a structured result. It never pushes and never asks.

This is not `mode:pipeline`. Pipeline mode serves the babysitter on a PR branch it already owns: it is seeded with failing jobs, pushes its own commit, and skips review because the babysitter scopes review. Here nothing is pushed and the caller reviews.

## What stays the same

Phases 0 through 3 run as the body defines them, with the investigation rigor unchanged: the causal-chain gate, reproduction, the escalation table, the test-first fix sequence in `references/fix.md`, and the issue-of-record rule. The **Branch** rule in Phase 3 applies in full: on the default branch, detached, or unsure, create a feature branch named from the bug before the first edit and say which branch you moved to. `/lfg fix this bug` invoked on `main` must not commit to `main`. The pre-fix scope record and the fix-owned file list are kept, because the return is built from them: the caller ships only what the user offered, and this return is the only place it can learn what was already in the tree or on the branch before the fix.

## What changes

- **Phase 0:** if an issue fetch fails, continue with the input you have and record the gap in the return. Never ask the user to paste content.
- **Phase 2 gate:** there is no fix-choice question. The caller's invocation authorized the fix, so proceed to Phase 3 with a **convergent** fix only. A **divergent** fix, one that would reverse a deliberate contract, behavior, or product decision, including a "failing" test that asserts intended behavior, is deferred as `needs-human` with a `decision_context`, never applied. Never route to `ce-brainstorm`; a design problem is a `needs-human` residual. When reproduction cannot run in this environment, continue on the best evidence in reach; if the causal chain still has a gap, return `needs-human` naming what reproduction requires and what was tried.
- **Phase 3:** apply the fix on the feature branch, verify it as `references/fix.md` defines (red then green where a test can run here; otherwise the reproduction check or characterization that file allows, recorded in the evidence), and commit only the fix-owned files (`fix: <summary>`, or `fix(<scope>): <summary>` when the project's conventions carry a scope). Do not push. A file the fix must touch that already carries the user's uncommitted edits stops the run before the first edit to it: return `blocked` naming the file, with nothing applied, since no commit could separate their edits from the fix and the caller cannot answer for the user. The pre-fix scope record makes this known before Phase 3 edits anything.
- **Phase 4:** skip the Debug Summary block, the post-fix polish and review steps (`references/post-fix-handoff.md`), the commit/PR routing, and the learning-capture offer. Emit the structured return below as the final output.

## Structured return

The final output is machine-readable; the caller parses it and branches on the exact `status` spellings, so never rename, abbreviate, or add to them.

```json
{
  "status": "fixed | diagnosed-no-fix | needs-human | blocked",
  "summary": "<one line: what happened>",
  "root_cause": "<the causal chain, trigger to symptom, with file:line references>",
  "changed_files": ["<fix-owned files, tests included>"],
  "head_sha": "<sha of the fix commit, when fixed>",
  "branch": "<branch the fix was committed on, when fixed>",
  "pre_fix_scope": {
    "head": "<HEAD before the fix commit>",
    "dirty_files": ["<files already modified or untracked before Phase 3 that are not fix-owned; left untouched>"],
    "commits_beyond_base": ["<commits the branch carried beyond the default branch before the fix, oldest first; empty on a fresh branch>"],
    "started_on_default_branch": false
  },
  "behavior_change": true,
  "verification_evidence": {
    "regression_test": "<file and case>",
    "existing_tests_inspected": ["..."],
    "tests_added_or_changed": ["..."],
    "red_before_fix": "<the failure observed before the fix, or the characterization when a red run was impossible>",
    "verification_run": "<commands and results>",
    "exception_reason": null
  },
  "residuals": [ { "type": "needs-human", "sources": [ ... ], "decision_context": { ... }, "thread_urls": [] } ],
  "issue_of_record": { "id": "<identifier>", "url": "<url>" },
  "blockers": [],
  "standalone_shipping_skipped": true
}
```

- `fixed`: a convergent fix is applied, its regression test went red then green, and the fix-owned files are committed on the feature branch. Nothing was pushed.
- `diagnosed-no-fix`: the root cause is established but no safe convergent fix exists this run; `residuals` says why.
- `needs-human`: the fix would be divergent, or the causal chain could not be closed without a decision only a person can make; nothing applied; `residuals` carries the `decision_context` in the same typed residual contract `references/pipeline-mode.md` defines.
- `blocked`: a required read failed, a fix-owned file carried the user's edits, or the workspace could not be prepared; `blockers` names it and nothing was committed.

`pre_fix_scope` is present on every return and records what the branch and tree carried before the fix, as observed facts: the pre-fix `HEAD`, the files that were already dirty and are not fix-owned (the fix never touched them), and the commits beyond the default branch, pushed or not. It carries no verdict about what the user offered; the caller decides that, and this record is what it decides from. `issue_of_record` is `null` when the input carried no ticket. `verification_evidence` is present on every `fixed` return; when `behavior_change` is `false` (a pure test or tooling fix), `exception_reason` says why no red-then-green was possible. `residuals` is an empty array when there are none.
