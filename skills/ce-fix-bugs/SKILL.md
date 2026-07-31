---
name: ce-fix-bugs
description: Work through every open checklist item on a Jira ticket — fetch the ticket's checklist, fix each item with a per-item commit, then mark each fixed item "qa ready" by rewriting the checklist markdown via the MCP server. Manual-only; one branch per ticket.
argument-hint: "<JIRA_TICKET_ID> (e.g. HVD-9954)"
disable-model-invocation: true
---

# Work a Jira Ticket's Checklist, Item by Item

`ce-fix-bugs` reads the **Checklist Text** custom field on a Jira ticket and walks through each open item one at a time. For every item you choose to act on, the skill ships a per-item commit whose subject identifies the ticket and item number, then opens a PR. After your review and approval, the skill rewrites the checklist markdown via `mcp-atlassian_jira_update_issue` to flip each worked-on item's state token to `qa ready` — the per-item status IS the bracketed token in the markdown, so rewriting it is what moves the item's status, and the app's progress fields reflect that change.

This skill is **manually invoked only** (`disable-model-invocation: true`). It does not auto-run from any pipeline and is never dispatched by a sibling skill.

## Constants (org-wide, hardcoded)

These are constants for this organization's Jira, not user configuration. The checklist is provided by the **Issue Checklist for Jira** app by Gebsun, installed on `chatous.atlassian.net` — its data lives in Jira custom fields. The per-item status is encoded as the bracketed state token at the start of each line in `customfield_11627`; rewriting that token via the MCP server is what flips the item's status.

| Field ID | Field name | Purpose |
| --- | --- | --- |
| `customfield_11627` | Checklist Text | Raw markdown source. Editable textarea. The per-item status is the bracketed state token at the start of each line (`* [open]`, `* [qa ready]`, …); rewriting that token via the MCP server is what flips the item's status. |
| `customfield_11674` | Checklist Text (view-only) | Forge-rendered mirror of `11627`. Read-only; do not write to it. |
| `customfield_11613` | Checklist Completed | Status summary — `"Not Completed"` or `"All Completed"`. Counts only `[done]` items. |
| `customfield_11628` | Checklist Progress | `"Checklist: <done>/<total>"`. Counts only `[done]` items. |
| `customfield_11629` | Checklist Progress % | `0.0`–`100.0`. Counts only `[done]` items. |
| `customfield_11614` | Checklist Content YAML | Always `null` in this org. Read-only; ignore. |
| `customfield_11645` | Checklist Template | Always `null` in this org. Read-only; ignore. |

- `JIRA_TICKET_PATTERN = ^[A-Z][A-Z0-9_]+-\d+$` — the standard Jira project-key + issue-number shape.
- Per-item state tokens recognised by the app (six of them): `open`, `in progress`, `skipped`, `done`, `qa ready`, `reopen`. Multi-word tokens are written as a single bracket string, e.g. `* [in progress] 1. ...`, `* [qa ready] 2. ...`.
- Org default: `JIRA_URL = https://chatous.atlassian.net`.

The checklist field IDs are hardcoded because they are genuinely org-wide and asking each user to configure them would be friction without benefit. Override only via the env vars listed in "Env-var overrides" below when your org migrates field IDs — never via per-user config.

## Env-var overrides

Each of the field IDs can be overridden via an env var when the org's Jira is migrated to a different field set. The skill defaults to the org-wide values above and reads the env var only when set.

- `JIRA_CHECKLIST_TEXT_FIELD` (default `customfield_11627`)
- `JIRA_CHECKLIST_VIEW_FIELD` (default `customfield_11674`)
- `JIRA_CHECKLIST_COMPLETED_FIELD` (default `customfield_11613`)
- `JIRA_CHECKLIST_PROGRESS_FIELD` (default `customfield_11628`)
- `JIRA_CHECKLIST_PROGRESS_PCT_FIELD` (default `customfield_11629`)

Do not put these in per-user config — the mcp-atlassian MCP server is globally installed and reads its env from the shell profile, not from a per-repo YAML file (see `/ce-setup` Phase 3 for the credential-writing flow).

## MCP server dependency

This skill reads from and writes to Jira. **Reads and writes both go through the `mcp-atlassian` MCP server exclusively** — there is no `curl` write fallback (mutation needs the MCP server's authenticated session; a raw `curl` write path would invite credential leakage and bypass the server's retry/validation logic). The MCP server is configured by `/ce-setup` Phase 3.

Discover the `mcp-atlassian_*` tools via the platform's tool-discovery primitive (e.g. `ToolSearch` in Claude Code) — do not assume they are loaded. If the MCP server is not reachable, **stop** and surface: "Run `/ce-setup` to configure the Atlassian MCP server, then re-run `/ce-fix-bugs`." Do not proceed to write via `curl` under any circumstance.

The per-item status flip to `qa ready` (the last step of the workflow) also goes through the MCP server: it is a rewrite of `customfield_11627` with the new state token. Rewriting the prefixed token is what flips the item's status — no UI automation is involved.

## Checklist markdown shape

The raw markdown in `customfield_11627` looks like this on a real ticket (HVD-9954 as of writing):

```
# Default checklist
* [open] 1. Searching for random long name  clear "X"  icon overlapped on typed string on the search field.
* [open] 2. "No Maches" string below search is slightly left aligned to search bar.
* [open] 3. When type in the search bar and click on Search icon the "X" (clear) icon is animated at the beginning of the search bar instead of at the end. After this, i am unable  to type anything in the search field and need to click again to continue typing.
```

The shape to recognise:

- A single header line `# <checklist name>` (the app names checklists when there are multiple; one is the common case).
- One item per line, starting with `* [STATE] ` where `STATE` is one of the six tokens above.
- The item number (`1.`, `2.`, …) follows the state token, separated by a space.
- Free text after the number is the item body.
- A trailing newline is conventional but not guaranteed.

When the app is updated, line breaks can appear inside an item body (the textarea wraps); treat the entire line as the item. **Do not** split a wrapped item into two.

## Workflow

The workflow has seven steps. Steps 1-3 are read-only. Steps 4-6 are the per-item loop. Step 7 is the bulk markdown rewrite that flips worked-on items to `qa ready` after review.

### Step 1: Resolve and validate the ticket ID

The skill is invoked as `/ce-fix-bugs <JIRA_TICKET_ID>`. The argument is required.

1. Strip any CI/CD hash suffix (`#`) and any trailing `-<segment>` whose preceding part is a bare ID — exactly the normalisation `ce-jira-update` and `ce-jira-ticket-context` apply. The skill uses the **bare** ID (`HVD-9954`, never `HVD-9954#` or `HVD-9954-hotfix`) for every MCP call.
2. Validate the bare ID against `^[A-Z][A-Z0-9_]+-\d+$`. On mismatch, report and stop.
3. If the argument is blank, ask once via the platform's blocking question tool: "Jira ticket ID for the checklist you want to work through? (examples: `HVD-9954`, `HVD-9954#`, or `HVD-9954-2`)". On a second blank, stop with "No Jira ticket ID provided; nothing to fix."

### Step 2: Fetch the checklist

Call `mcp-atlassian_jira_get_issue` with `issue_key: <JIRA_TICKET_ID>` and `fields: summary,status,description,customfield_11627,customfield_11674,customfield_11613,customfield_11628,customfield_11629`.

Carry forward:

- The `summary` (printed at the top of the report).
- The current ticket `status.name` (informational; do not change it as part of this skill).
- The `description` (printed in the report so the user has ticket context).
- The `customfield_11627` text (the raw markdown to parse).
- The progress triple (`11613` / `11628` / `11629`) for the report's "before" snapshot.

If `customfield_11627` is `null` or empty, the ticket has no checklist. Stop and report: "`<TICKET>` has no checklist (customfield_11627 is empty). This skill only works on tickets with a checklist." Do not invent items.

If the MCP call errors or the tool is unreachable, stop — do not fall back to `curl`. Surface the `/ce-setup` message.

### Step 3: Parse the items and present them

Parse `customfield_11627` into a numbered list. The parser:

- Skips the `# <name>` header line.
- Matches `^\* \[(<state>)\] (\d+)\. (.*)$` per item (state is the literal token inside the brackets; the number is what the user types; the body is everything after `N. `).
- Normalises the state token to lowercase for comparison but preserves its exact original casing and any whitespace when rewriting the field.
- Strips a single trailing newline per item, preserves everything else (item bodies often have Figma links, video references, double-spaces, and Unicode quotes — all of which are part of the source and must not be "cleaned up").
- Numbers items by their appearance order, **not** by the embedded `N.` (which the app assigns but the user can edit). The user's mental model and the per-item commit message both refer to the appearance order — `Checklist item #1` is the first line after the header, `#2` is the second, and so on. If the embedded numbers disagree with appearance order, surface the discrepancy in the report and use appearance order for the commit prefix anyway.

Filter to **actionable** items — those whose state token is `open` or `reopen`. Items in any other state (`in progress`, `skipped`, `done`, `qa ready`) are listed but not worked on in this run.

Print:

```
Ticket:    <TICKET_ID> — <summary>
URL:       <JIRA_URL>/browse/<TASKET>
Checklist: <done>/<total> complete (<pct>%) — status: <customfield_11613>
Actionable items (state = open | reopen): <N>
  #1  [open]    <body of item 1, first ~80 chars>
  #2  [open]    <body of item 2, first ~80 chars>
  #3  [reopen]  <body of item 3, first ~80 chars>
Other items (skipped this run):
  #4  [in progress] <body of item 4, first ~80 chars>
  #5  [done]        <body of item 5, first ~80 chars>
```

If there are zero actionable items, stop with: "`<TICKET>` has no `open` or `reopen` items. Nothing to fix." Do not loop, do not commit, do not flip items to `qa ready`.

### Step 4: Set up the working branch

This skill produces **one branch per ticket**, with all of this run's per-item commits stacked on it. The branch name follows the `<pr-prefix>/<TICKET>` convention established by `/ce-commit-push-pr` and `/ce-commit` (read `JIRA_URL` for the org's default branch naming and read `GITHUB_PR_PREFIX_USERNAME` from the environment when set — fall back to the current OS user when unset).

1. Resolve the current branch and the default branch the same way `ce-work` does (`git rev-parse --abbrev-ref origin/HEAD` → strip → `gh repo view --json defaultBranchRef --jq '.defaultBranchRef.name'` → `main`).
2. If on the default branch, fetch and create the new ticket branch. If on an existing feature branch, ask the user once: "Continue working on `<current>`, or create a new ticket branch `<new>`?" and act on the answer.
3. Branch name shape: `<pr-prefix>/<TICKET>-checklist` is the canonical form (e.g. `shrey/HVD-9954-checklist`). It carries the **bare** ticket ID so `ce-commit-push-pr` can resolve it; if a CI/CD hash or hotfix suffix applies, append it per the conventions `ce-jira-update` uses for the suffix form.

Use the harness's native isolation if available (harness worktrees, etc.) — the skill does not run `git worktree add` itself.

### Step 5: Per-item loop

For each actionable item, in order, repeat the steps below. Track which items you `fixed`, `skipped`, and `failed` as you go.

#### Step 5a: Route the item

Inspect the item body. Decide:

- If the body describes a **bug** (broken behaviour, wrong output, an error, an unexpected state) → fix via `/ce-debug`. Pass the ticket ID and the item body as the bug description.
- If the body describes a **change, feature, or implementation** (a new control, a polish item, an alignment fix the design intends, a feature gap) → fix via `/ce-work`. Pass the item body as the work prompt.
- If the body is **ambiguous** (could be either, or you genuinely cannot tell) → ask the user via the platform's blocking question tool: "Item #N looks like it could be a bug or a feature. Which path?" with the two options. Do not guess on ambiguous items.

For trivial items (single-file alignment, a one-line CSS fix, a typo, a label change), `/ce-debug` or `/ce-work` may be more ceremony than the change warrants — still pick one of the two based on the bug-vs-feature heuristic above; do not invent a third path.

**Frontend/UI items — `ce-ui-engineering` awareness.** When the checklist item touches frontend/UI code (`.tsx`, `.jsx`, `.css`, `.scss`, component, page, layout, or state files), the delegated skill (`ce-debug` or `ce-work`) must invoke `ce-ui-engineering` to load the UI engineering conventions into context. When delegating, include in the handoff prompt: "This item touches frontend/UI code — invoke `ce-ui-engineering` for authoritative UI engineering conventions (naming, component structure, state management, JSX hygiene, styling, cleanup, Red Flags). Authority order: repo instructions (`AGENTS.md`, `architecture.md`, `projectbrief.md`) > repo `docs/solutions/*` > `ce-ui-engineering` > general guidance."

If the delegated skill returns with the bug/work still open (e.g. `ce-debug` couldn't reproduce, or `ce-work` decided the spec needs to be revisited), do **not** commit and mark the item as `failed`. Surface the reason to the user; the loop continues to the next item. Failed items stay `open` in the markdown (the workflow does not invent transitions for them).

#### Step 5b: Commit per item

When the delegated skill returns with a real change on disk, commit it **with a per-item subject** that identifies the ticket and the item. The exact format is:

```
<TICKET> - Checklist item #<N> - <one short sentence describing the fix>
```

Example: `HVD-9954 - Checklist item 1 - clear X icon sits inside search input padding`.

Conventions for the fix description:

- Lead with the user-visible change, not the implementation. "Clear X icon no longer overlaps typed text" beats "Add padding-right to .search-input".
- One sentence; one idea. If you cannot fit the fix into one short sentence, the commit message is too long — split the change into two items or shorten.
- Match the casing style of the existing repo (read a few recent commit subjects from `git log --oneline -10` first; if the repo's style is sentence-case, the fix description is sentence-case too).
- Do **not** add a `feat:` / `fix:` conventional-commits prefix. The `<TICKET> - Checklist item #N -` part is the prefix for this commit series; it stacks with whatever convention the team uses for ticket-prefixed commits.

Stage only the files the delegated skill changed for this item — do not run `git add .`. Verify with `git diff --cached --stat` before committing. The commit is created with `/ce-commit` (interactive mode is fine; the per-item subject above carries the meaning).

If the delegated skill produced no diff at all (e.g. it decided the item was already fixed, or the bug was a non-issue), skip the commit entirely and mark the item as `skipped` in the loop's running tally.

#### Step 5c: Update the checklist markdown after the commit

After each successful commit, write `customfield_11627` back via `mcp-atlassian_jira_update_issue` with the same field path. The only change in the rewritten markdown is:

- The just-fixed item's state token flips from `open` (or `reopen`) to `in progress` **only** if the delegated skill is mid-flight and the fix spans multiple turns — the per-item status is the bracketed token in the markdown, so the flip is immediately published to the ticket's progress surface. For a one-shot fix that lands in the commit, the state stays `open` until the final batch rewrite in Step 7.
- Items the user marked as `skip` in the loop get a brief uppercase reason appended inside parentheses at the end of the item's text. The shape is:

  ```
  * [open] 1. <original body> (SKIPPED: REASON_GOES_HERE)
  ```

  The reason must be uppercase letters, numbers, spaces, and the punctuation `():,-/` — convert the user's natural-language reason into that shape (e.g. "Already fixed in another ticket" → `ALREADY FIXED IN ANOTHER TICKET`). If the user does not provide a reason when prompted, ask once more and accept a brief phrase on a second prompt; on a third blank, use `NO REASON PROVIDED`.

  Do **not** change the state token for skipped items — they remain `open` (or whatever they were). The `SKIPPED: ...` annotation is the only marker; the state token drives the app's progress counts and we do not want a skipped item to look like a completed one.

The MCP write is **a single call per successful fix** — send the full new `customfield_11627` text (the textarea field replaces, not appends). Preserve every other item's line exactly as parsed; do not normalise whitespace, fix typos in unrelated items, or re-flow line breaks.

If the MCP call errors, surface the error to the user but do not roll back the commit. The commit stands; the checklist annotation can be retried on the next run.

### Step 6: Push the branch and ask for review

When the loop is done (every actionable item has been `fixed`, `skipped`, or `failed`), print the running tally:

```
<HVD-9954> checklist run summary
  fixed:   2  (#1 search-bar padding, #3 search icon position)
  skipped: 1  (#2 alignment — already fixed in another ticket)
  failed:  0
  branch:  shrey/HVD-9954-checklist
  commits: 2  (one per fixed item)
  PR:      <not opened yet>
```

Ask via the platform's blocking question tool:

```
Open a PR for <branch> now?

  1. Yes — open it with /ce-commit-push-pr
  2. No  — leave the branch local, I'll push later
  3. Proceed to Step 7 — verify PR re-approval via gh, then flip the <N> worked-on items to "qa ready"
```

- Option 1 — invoke `/ce-commit-push-pr` with the standard ticket-prefix conventions. The PR title and description are generated by that skill; do not hand-edit. After approval lands, re-run `/ce-fix-bugs <TICKET>` and pick Option 3 to flip.
- Option 2 — stop after this. The branch and commits are local; the user will push and open a PR themselves.
- Option 3 — proceed to Step 7. Step 7's gate verifies via `gh` that a PR is open for the branch and has an `APPROVED` review on the current HEAD; if not, it stops with guidance. The pre-approval work (push, open PR, request review) is the user's to drive before this option will succeed.

### Step 7: Flip worked-on items to "qa ready" via the MCP server

This step rewrites `customfield_11627` via `mcp-atlassian_jira_update_issue` to flip each worked-on item's state token from `open` (or `reopen`) to `qa ready`. The per-item status **is** the bracketed state token in the markdown — rewriting the token is what moves the item's status. No UI automation is involved.

#### Step 7a: Verify PR re-approval via `gh` (gate)

Before any MCP write, verify that a PR exists for the current branch and has been **re-approved on the current HEAD**. The per-item commits from Step 5 are the "changes" that mandate re-approval — an approval on an earlier HEAD is stale and does not qualify. This gate is mandatory: the skill never flips items to `qa ready` without a current-HEAD approval on record.

1. Resolve the local HEAD and branch with two separate `gh`-friendly calls: `git rev-parse HEAD` and `git rev-parse --abbrev-ref HEAD` (one argv-style command per Bash tool call; no `&&` or pipes).
2. Look up the PR for the current branch: `gh pr view --json number,url,state,headRefOid,reviews`.
   - If `gh` reports "no pull requests found" (no PR exists for the branch), stop and surface: "No PR for `<branch>`. Open one via `/ce-commit-push-pr`, get it re-approved on the current HEAD, then re-run `/ce-fix-bugs <TICKET>` and pick Option 3." Do not proceed to the flip.
   - If `gh` errors on auth or the repo has no `origin`, stop and surface the `/ce-setup` GitHub-configuration line.
3. Verify the PR `state` is `OPEN`. If `CLOSED` or `MERGED`, stop and surface: "PR <N> is `<state>`; the qa-ready flip only runs against an open PR."
4. Verify the PR's `headRefOid` equals the local HEAD. If it doesn't, the local commits aren't pushed — push with `git push origin <branch>` and re-check. If push is rejected (remote diverged), stop and surface the divergence; the user must rebase before the flip can proceed.
5. Verify re-approval: scan the `reviews` array for at least one entry where `state == "APPROVED"` AND `commit_id == headRefOid`. An approval whose `commit_id` predates the current HEAD is stale and does not count — the approval must be on the current HEAD, because the per-item commits changed the diff after the prior approval. If no qualifying review exists, stop and surface: "PR <N> has no approval on the current HEAD (`<short-sha>`). Get the PR re-approved after the latest commits, then re-run `/ce-fix-bugs <TICKET>` and pick Option 3."

Only after all five checks pass, proceed to Step 7b. Branch-protection rules and `gh pr view --json reviewDecision` are not a substitute for this check — `reviewDecision` reflects repo-wide rules and may consider an approval valid even after new commits land, while this gate is stricter by design: the approval's `commit_id` must equal the current HEAD.

#### Step 7b: Rewrite the markdown and verify

The flip is a single `mcp-atlassian_jira_update_issue` call that writes the full updated `customfield_11627` text. For each item the loop marked as `fixed`, rewrite the state token from `[open]` (or `[reopen]`) to `[qa ready]`; leave every other line byte-for-byte unchanged (including skipped items' `SKIPPED: ...` annotation, and including `failed` items left as `open`). Send the full new markdown — the textarea field replaces, not appends.

After the write, re-read the ticket via `mcp-atlassian_jira_get_issue` and verify the markdown landed with the new `[qa ready]` tokens. The progress fields (`customfield_11613` / `11628` / `11629`) count only `[done]` items, so a `[qa ready]` flip will not move the progress count — verify against the markdown text itself, not against the progress percent.

Print a final summary:

```
<HVD-9954> checklist status flip complete
  PR:       #4512 — approved on <short-sha>
  flipped to "qa ready":
    #1  clear X icon overlap        — verified (markdown token: [qa ready])
    #3  search icon position        — verified (markdown token: [qa ready])
  skipped (left as open):
    #2  "No Matches" alignment      — skipped by user; reason logged in markdown
  not flipped (failed):
    (none)
```

If the MCP write errors, surface the error and stop. The branch and commits stand; the user can re-run `/ce-fix-bugs <TICKET>` to retry — the loop is idempotent for items already in `qa ready` (Step 3's filter excludes them), and Step 7a's gate is safe to re-run (an `APPROVED` review on the HEAD stays valid until the HEAD moves).

## What this skill does NOT do

- Does not edit, transition, or comment on the ticket's `status` field. The ticket status (`To Do` / `In Progress` / `In Review` / etc.) is the team's existing workflow; this skill only touches the per-item checklist.
- Does not transition the ticket itself — that's `ce-jira-update`'s job, after the PR is approved.
- Does not write to `customfield_11643` (Test Behaviors) — that's `ce-jira-update`'s job.
- Does not run tests, lint, or build — the delegated skill (`/ce-debug` or `/ce-work`) owns those.
- Does not auto-dispatch. `disable-model-invocation: true` is intentional: this skill is invoked manually per ticket. Auto-dispatch from another skill would let a sibling assume the user wants the bug fixed when they only wanted to talk about it.
- Does not write to the ticket via `curl` for any field. All Jira writes go through `mcp-atlassian`, including the per-item status flip in Step 7 — that flip is a markdown rewrite of `customfield_11627`, not a UI action.
- Does not flip items to `qa ready` without a current-HEAD PR approval. Step 7a's `gh`-based gate is mandatory and stricter than repo-wide `reviewDecision`: the approval's `commit_id` must equal the current HEAD, because the per-item commits changed the diff after any prior approval.
- Does not invent transitions for failed items. If `/ce-debug` could not reproduce or `/ce-work` decided the spec needs revisiting, the item stays `open` and the user is told.

## Quick example

You invoke `/ce-fix-bugs HVD-9954` on a ticket whose `customfield_11627` is:

```
# Default checklist
* [open] 1. Searching for random long name  clear "X"  icon overlapped on typed string on the search field.
* [open] 2. "No Maches" string below search is slightly left aligned to search bar.
* [open] 3. When type in the search bar and click on Search icon the "X" (clear) icon is animated at the beginning of the search bar instead of at the end. After this, i am unable  to type anything in the search field and need to click again to continue typing.
```

The skill resolves the bare ID, fetches the ticket, parses three `open` items, sets up `shrey/HVD-9954-checklist`, and walks the loop:

- Item #1 — bug-shaped (icon overlap), routed to `/ce-debug`. The delegated skill traces the issue to the search input's right padding, fixes it, returns. Commit `HVD-9954 - Checklist item 1 - clear X icon no longer overlaps typed text`.
- Item #2 — alignment, but the user types `skip 2 — already fixed in another ticket, see #HVD-9931`. The reason is uppercased to `ALREADY FIXED IN ANOTHER TICKET, SEE #HVD-9931`, appended inside parens at the end of item #2's text in the rewritten `customfield_11627`. No commit.
- Item #3 — bug-shaped (icon position + broken re-focus). Routed to `/ce-debug`. The delegated skill fixes the animation order and the focus restoration. Commit `HVD-9954 - Checklist item 3 - clear X icon stays at end after typing and re-focus is restored`.

Loop summary: `fixed: 2, skipped: 1, failed: 0, branch: shrey/HVD-9954-checklist, commits: 2`. The user picks "open the PR"; `/ce-commit-push-pr` opens PR #4512. The user picks "proceed to Step 7"; the skill runs `gh pr view --json number,state,headRefOid,reviews` on `shrey/HVD-9954-checklist`, confirms PR #4512 is `OPEN` with an `APPROVED` review whose `commit_id` equals the local HEAD, then rewrites `customfield_11627` via `mcp-atlassian_jira_update_issue` with `[open]` → `[qa ready]` for items #1 and #3 (item #2's text keeps its `SKIPPED: ...` annotation; its state token stays `open`), and re-reads the ticket to verify the markdown landed with the new tokens.
