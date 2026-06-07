# LFG Run Ledger

The run ledger is the durable control plane for a plan-bounded autopilot run. It is both human-readable and structured enough for a later agent turn to resume without asking the user to restate "yes, continue."

## Location

Prefer a repo-local ledger only when the active project repo has this path ignored or explicitly allowed:

```text
.context/compound-engineering/autopilot-runs/<run-id>/
```

If `.context/` is not ignored or repo policy does not allow repo-local scratch state, use the stable Unix-like temp fallback:

```text
<os-temp>/compound-engineering/lfg/<run-id>/
```

For this repo's skill policy, `<os-temp>` resolves to `/tmp`, so the concrete reusable fallback is:

```text
/tmp/compound-engineering/lfg/<run-id>/
```

Skills authored here assume Unix-like shells; native Windows is not a current target.

Always surface the chosen path in the run summary and write it into the ledger itself. Never create an unignored `.context/` ledger in a user's project repo.

## Files

Use a markdown file with a small fenced JSON block:

```text
ledger.md
```

The markdown explains the run for humans. The JSON block is the resume contract for agents.

## Required Fields

The JSON state block must include:

```json
{
  "run_id": "<run-id>",
  "ledger_path": "<os-temp>/compound-engineering/lfg/<run-id>/ledger.md",
  "repo_root": "/absolute/path/to/repo",
  "repo_remote": "git@github.com:org/repo.git",
  "plan_path": "docs/plans/example-plan.md",
  "branch": "feature/example",
  "head_sha": "<git sha>",
  "current_phase": "planning | implementation | review | review_followup | residual_handoff | browser_test | draft_pr | ci | done | paused",
  "retry_counters": {
    "review_iterations": 0,
    "ci_fix_iterations": 0,
    "tool_failures": 0
  },
  "last_verification": {
    "command": "bun test ...",
    "result": "passed | failed | skipped",
    "summary": ""
  },
  "open_residuals": [],
  "github_write_boundary": {
    "commit_allowed": true,
    "push_allowed": true,
    "draft_pr_allowed": true,
    "pr_body_update_allowed": true
  },
  "accumulated_residual_findings": [],
  "escalation_state": {
    "paused": false,
    "reason": ""
  },
  "next_action": "invoke ce-work with autopilot:true implementation-only:true plan:<plan-path> ledger:<ledger-path>"
}
```

## Update Rules

- Create the ledger before implementation begins.
- Record `repo_root` from `git rev-parse --show-toplevel` and `repo_remote` from `git remote get-url origin` when available. If `origin` is missing, use the first configured remote URL; if no remote exists, set `repo_remote` to `null` and rely on `repo_root`.
- Update `current_phase` and `next_action` before leaving every major LFG step.
- Update `head_sha` after commits.
- Update `retry_counters.review_iterations` after every code-review pass.
- Update `retry_counters.ci_fix_iterations` after every CI repair attempt.
- Store unresolved review or CI issues in `open_residuals` before composing a PR body or fallback residual file.
- Store the plan's GitHub write boundary in `github_write_boundary` before implementation. Missing or ambiguous permission for a write type is `false` for that write. LFG must record blocked commit, push, draft PR, or PR-body-update attempts as residuals instead of crossing the boundary.
- Append significant human/release/advisory/capped review residuals to `accumulated_residual_findings` as soon as they are observed. Do not clear them just because a later review iteration returns clean; clear them only after the residual handoff has made them durable.
- When a user message is only context, append it to the markdown narrative and keep `next_action` moving.
- When a user message says pause, stop, hold, change course, or conflicts with the plan, set `current_phase` to `paused`, set `escalation_state.paused` to `true`, record the reason, and stop.

## Resume Selection

For a resume signal, choose the latest active ledger that matches the current repo identity and branch. Match repo identity first: prefer exact `repo_root`; otherwise match `repo_remote` when both the current checkout and ledger have a non-null remote. Then require the current branch to match `branch`. Prefer exact matches on `plan_path` and `head_sha` after repo and branch have matched. If multiple ledgers match or the safe next action is ambiguous, pause and ask for human direction.
