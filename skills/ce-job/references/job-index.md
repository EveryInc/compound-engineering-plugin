# Job index

Use this reference for `ce-job list` and `ce-job status --all`.

## Scan

Resolve the job root and read every Markdown ledger under it. A file with missing frontmatter or missing required sections is still reported, but its row is `invalid` and its next action is to repair the ledger shape. Do not read unrelated artifact roots or chat logs.

## Status classification

Classify from durable ledger state first:

| Condition | Display state | Next action |
|---|---|---|
| `status: complete` and proof summary exists | complete | none unless user asks to reopen |
| missing done evidence for a requested `done` check | blocked | collect missing evidence |
| non-empty Open questions with material blockers | needs decision | answer or route to planning |
| plan linked but no plan review receipt for guarded mode | needs plan review | run `ce-doc-review` |
| implementation evidence exists but no code-review receipt for behavior-bearing work | needs review | run `ce-code-review` |
| test requests exist without evidence | needs evidence | run or request the named test |
| `status: paused` | paused | resume or leave paused |
| otherwise non-complete | active | continue the recorded next action |

Herdr state may refine the row (`working`, `blocked`, `done`, `unknown`, unavailable), but it never overrides durable completion. A live agent in `done` means ready for input, not that the job is done.

## Report shape

For multiple jobs, report a compact table or bullets with:

- job id or path
- status / display state
- mode
- branch
- owner or attached worker
- last update
- open question or blocker count
- review state
- latest evidence summary
- live state when available
- next safe action

For one job, include the same fields plus the goal and linked plan path.

## Herdr enrichment

If a ledger has a live binding, read `references/herdr-control.md` before asking Herdr for live state. If Herdr is unavailable, show `live: unavailable` and keep the durable row. Do not fail the whole index because one live attachment is stale.
