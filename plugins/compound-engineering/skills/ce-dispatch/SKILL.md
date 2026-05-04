---
name: ce-dispatch
description: "[BETA] Dispatch plan implementation units to external agent workspaces via GitHub issues. Use after ce-plan to fan out execution to Conductor workspaces or any issue-driven agent workflow. One issue per implementation unit, dispatched in dependency order; the orchestrator monitors PRs, gates merges on dependencies, and re-dispatches newly unblocked units."
disable-model-invocation: true
argument-hint: "[Plan doc path. Blank to auto-detect latest plan]"
---

# Dispatch Implementation Units to External Agent Workspaces

Fan out a structured plan's implementation units to external agent workspaces (Conductor or any issue-driven agent platform) by creating one GitHub issue per dispatchable unit. The orchestrator monitors the resulting pull requests, enforces dependency-ordered merges, and re-dispatches units whose dependencies have just merged.

This skill is a sibling to `ce-work` and `ce-work-beta`. Where `ce-work` executes a plan in the **current** session and `ce-work-beta` can delegate to `codex exec`, `ce-dispatch` hands units off to **separate workspaces** that the dispatching session does not control directly. Use it when units are independent enough to parallelize across workspaces, when you want human-in-the-loop review at the PR layer, or when integrating with a workspace platform (e.g., Conductor) that picks up GitHub issues.

For background on Conductor's specific behavior (issue-to-workspace lifecycle, startup scripts, PR creation flow), see `references/conductor-notes.md`. For the structure of the prompt embedded in each issue, see `references/dispatch-prompt-template.md`.

## Interaction Method

When asking the user a question, use the platform's blocking question tool: `AskUserQuestion` in Claude Code (call `ToolSearch` with `select:AskUserQuestion` first if its schema isn't loaded), `request_user_input` in Codex, `ask_user` in Gemini, `ask_user` in Pi (requires the `pi-ask-user` extension). Fall back to numbered options in chat only when no blocking tool exists in the harness or the call errors (e.g., Codex edit modes) — not because a schema load is required. Never silently skip the question.

The Phase 4 monitor loop renders **6 menu options**, which exceeds the 4-option cap most blocking tools enforce. For that menu — and only that menu — render a numbered list directly in chat per the option-overflow exception in `plugins/compound-engineering/AGENTS.md`. Tell the user "Pick a number or describe what you want." so the list retains the open-endedness of the blocking tool. Earlier phases (Phase 0 plan-path confirmation, Phase 3 confirm-before-creating-issues) stay within the 4-option cap and use the blocking tool.

## Input

<input_document> #$ARGUMENTS </input_document>

## Execution Workflow

### Phase 0: Input and Config Resolution

#### 0.1 Resolve the plan path

If `<input_document>` is non-empty:
- Treat it as a repo-relative path to a plan file. Verify the file exists and is readable. If not, ask the user to clarify which plan to dispatch (blocking tool, single-select from `docs/plans/*.md` candidates).

If `<input_document>` is empty:
- Auto-detect the latest plan in `docs/plans/`. Sort by file mtime descending; pick the most recently modified `*.md` whose frontmatter has `status: active`. If multiple plans tie, prefer the one whose filename matches today's or yesterday's date prefix.
- Confirm the auto-detected plan with the user via the blocking question tool before proceeding ("Dispatch plan `<path>`? Yes / Pick another / Cancel"). Never silently dispatch the wrong plan.
- If no candidate plan exists, stop and tell the user to pass a plan path explicitly.

Resolve the plan path to a repo-relative form (relative to `git rev-parse --show-toplevel`) for use in issue bodies. Repo-relative paths only — absolute paths break across machines.

#### 0.2 Read dispatch config

Read `dispatch_*` keys from `.compound-engineering/config.local.yaml` at the repo root (use the native file-read tool — `Read` in Claude Code, `read_file` in Codex). All keys are optional; missing values fall through to the documented defaults below.

Config keys and resolution:

| Key | Values | Default |
|---|---|---|
| `dispatch_mode` | `conductor`, or another short identifier | `conductor` |
| `dispatch_branch_prefix` | any string (no leading/trailing slashes) | `dispatch/` |
| `dispatch_base_branch` | any branch name | repo's default branch (`git symbolic-ref --short refs/remotes/origin/HEAD`) |
| `dispatch_labels` | comma-separated label list | `ce-dispatch` |
| `dispatch_auto_review` | `true` or `false` | `true` |

If a key has an unrecognized value, fall through to the default for that key. Do not error.

Store the resolved values for the rest of the workflow:
- `mode` — string identifier; affects the wording of in-prompt hints (e.g., "Conductor's `Create PR` action") but never gates behavior. Unknown modes still work — they just get generic phrasing.
- `branch_prefix` — used to suggest branch names in the dispatch prompt
- `base_branch` — recorded in metadata; the in-workspace agent targets this branch with the PR
- `labels` — list of labels applied to each created issue
- `auto_review` — when true, Phase 4's review action invokes `ce-code-review` automatically; when false, the user must opt in per PR

### Phase 1: Parse Plan and Build Dependency Graph

Read the plan file and extract the structured fields needed for dispatch.

#### 1.1 Identify implementation units

Locate the `Implementation Units` section. Each unit is a top-level bullet whose heading is `- U<N>. **<Name>**` (e.g., `- U1. **Add rate limiter**`). For each unit, capture:

- **U-ID** (e.g., `U1`, `U3`)
- **Name** (the bolded heading text)
- **Goal** (the unit's "Goal" or "Why" field)
- **Files** (the unit's `Files:` section — Create, Modify, Read paths)
- **Patterns** (the unit's `Patterns to follow` field, if present)
- **Approach** (the unit's `Approach` field, if present)
- **Verification** (the unit's `Verification` or `Test scenarios` field)
- **Dependencies** (the unit's `**Dependencies:**` field listing other U-IDs — this is the canonical label `ce-plan` emits per its unit template; also accept `Depends on:` as an alias for hand-edited or external plans. If neither label is present, fall back to inferring from the plan's sequencing prose; default to `none` only when nothing is found. Do **not** default to `none` silently when a `**Dependencies:**` line exists with parseable U-IDs — that would let dependent units look like roots and dispatch out of order.)

If the plan has no recognizable Implementation Units section, stop and tell the user the plan must contain implementation units before dispatch. Do not invent units.

#### 1.2 Build the dependency graph

Construct a directed graph from the captured `Dependencies` lists. Nodes are U-IDs, edges point from a dependency to its dependent (so `U2 depends on U1` means `U1 → U2`).

- **Cycle check**: detect cycles via topological sort. If any cycle exists, stop and tell the user which U-IDs form the cycle — dispatch cannot proceed until the plan is corrected.
- **Roots** (units with `Dependencies: none`) are the initial dispatch candidates.

#### 1.3 Parallel Safety Check

Mirror the parallel-safety analysis from `ce-work` (the canonical version lives in `plugins/compound-engineering/skills/ce-work/SKILL.md`'s "Parallel Safety Check" section). Build a file-to-unit mapping from every unit's `Files:` section (Create, Modify, and Test paths). Detect intersections.

Each external workspace runs in its own working tree (Conductor: one workspace = one branch = one isolated working tree), so file overlap between units in different workspaces does **not** corrupt git state — but it predicts merge conflicts when those PRs land.

For each pair of units that share files, log the predicted overlap (e.g., "U2 and U4 both modify `config/routes.rb` — expect a merge conflict on the second PR; the agent in the second workspace should rebase before opening the PR"). Carry this forecast into the dispatch prompts (the `<constraints>` block already tells agents to scope tightly; predicted-overlap pairs additionally get a one-line hint at the bottom of `<constraints>` naming the other U-ID).

### Phase 2: Generate Dispatch Prompts

For each dispatchable unit (initially the roots; later, units whose dependencies have all merged), render a self-contained prompt using the template in `references/dispatch-prompt-template.md`. Load that file now and follow its required structure.

Substitute concrete values for every section:
- `<context>` — plan file repo-relative path; one-sentence project context
- `<task>` — Goal from the unit (single-unit case)
- `<files>` — the unit's combined Create/Modify/Read file list
- `<patterns>` — the unit's `Patterns to follow` content (or the fallback line)
- `<approach>` — the unit's Approach field
- `<constraints>` — the template's constraints, plus any predicted-overlap hint
- `<testing>` — the template's testing guidance, anchored to this unit's test scenarios
- `<verify>` — the project's combined test/lint commands (read from the plan or from the repo's package manifest)
- `<ce-plugin>` — the template's ce-plugin block, unchanged
- `<output-contract>` — the template's PR-description schema, unchanged

After the rendered XML body, append the metadata HTML comment from the template, populated with:
- `plan: <repo-relative plan path>`
- `unit_ids: <e.g. U3>`
- `dependencies: <comma-separated, or "none">`
- `expected_branch: <branch_prefix><U-ID>-<slugged-unit-name>` (e.g., `dispatch/U3-add-rate-limiter`)
- `base_branch: <resolved base_branch>`
- `labels: <resolved labels list>`
- `dispatched_at: <ISO 8601 UTC>`

**Coalescing units into one issue:** by default, dispatch one unit per issue. Coalesce two or more units into one issue **only** when (a) they share no dependency edges with each other, (b) they share substantial context (same files or same patterns), and (c) coalescing actually reduces work for the in-workspace agent. Default to one-per-issue when in doubt — splitting later costs less than re-merging conflicting PRs.

### Phase 3: Create Issues

Before creating any issue, present the dispatch plan to the user via the blocking question tool: list each unit being dispatched in this round (U-ID, name, expected branch), the labels that will be applied, and the base branch. Options: `Create all`, `Create one at a time`, `Cancel`. Default to `Create all` when the user picks it explicitly.

For each unit being dispatched in this round (only units whose dependencies are already merged or have none):

```bash
gh issue create \
  --title "[CE-Dispatch] <U-ID>: <unit goal, trimmed to ~60 chars>" \
  --body-file <rendered prompt path> \
  --label <comma-separated labels>
```

Notes:
- Write the rendered prompt to a per-run scratch file under `mktemp -d -t ce-dispatch-XXXXXX` (per the repo's "Scratch Space" guidance in `AGENTS.md`). The scratch directory holds one file per dispatched unit so retries can re-use them.
- The label list comes from `dispatch_labels` (default `ce-dispatch`). If a label does not yet exist in the repo, `gh` prints a warning — surface it to the user once and offer to create the label via `gh label create` (single confirmation, not per-issue).
- After each successful issue creation, capture the issue URL and number and append them to an in-memory `dispatched_units` map keyed by U-ID: `{ U3: { issue_number: 142, issue_url: "...", expected_branch: "dispatch/U3-...", status: "issue_created", pr: null } }`.
- If `gh issue create` fails (auth error, rate limit, etc.), stop the round and surface the error. Do not try to "recover" by retrying with different flags — the user needs to fix the underlying problem.

After all issues in the round are created, summarize to the user: count, U-IDs dispatched, base branch, and the expectation that workspaces will pick them up.

### Phase 4: Monitor and Review

This phase is an **interactive loop**. Each iteration the orchestrator presents the user with a numbered menu (rendered in chat — six options exceeds the blocking tool's 4-option cap; see "Interaction Method" above). The user picks an option (or describes what they want in free text); the orchestrator acts; the loop repeats until the user picks `Done for now` or all units are merged.

Render the menu as a numbered list and tell the user "Pick a number or describe what you want."

```
Dispatch status: <count merged> / <total units> merged. <count open> open PRs. <count blocked> waiting on dependencies.
1. Check PR status — pull latest gh pr view / gh pr checks for every dispatched unit
2. Review a PR — run ce-code-review on a specific PR
3. Merge a PR — squash-merge a PR whose dependencies are all merged and CI is green
4. Dispatch newly unblocked units — re-run Phases 2-3 for units whose dependencies just merged
5. Show dependency graph — render the current state of the dispatch graph (merged / open / blocked)
6. Done for now — exit the loop; the dispatched issues and PRs persist
```

#### 4.1 Routing

Act on the user's selection — do not just announce it. The bare per-option action lives inline below. Elaborate sub-flows (review tool selection, conflict resolution prose) live further down.

- **Check PR status (1)** — for each dispatched unit, run `gh pr list --state all --search "head:<expected_branch>"` (or query by linked issue if the workspace renamed the branch); `--state all` is required because `gh pr list` defaults to open PRs only and would otherwise miss PRs merged outside this orchestrator (GitHub UI, Conductor, another shell). For each match, run `gh pr view <number> --json state,mergeable,statusCheckRollup,headRefName`. Update `dispatched_units` with the latest PR number, state (`OPEN`, `MERGED`, `CLOSED`), CI rollup, and mergeable flag. Re-render the loop status line and re-render the menu.

- **Review a PR (2)** — ask the user which U-ID's PR to review (blocking tool single-select from open PRs in `dispatched_units`). Then invoke the `ce-code-review` skill via the platform's skill-invocation primitive (`Skill` in Claude Code, `Skill` in Codex, the equivalent on Gemini/Pi), passing the PR URL as the argument. When `dispatch_auto_review: true`, also auto-trigger this for every newly opened PR before the user is asked to merge it (record per-PR `reviewed: true` so it isn't re-run).

- **Merge a PR (3)** — ask which U-ID's PR to merge (blocking tool single-select from PRs that pass the merge gate below). Apply this gate before merging:
  - All of the unit's dependencies (per the dependency graph) are already in state `MERGED` in `dispatched_units`. If any dependency is not yet merged, refuse with the message "Cannot merge `<U-ID>` — dependency `<U-dep>` is still <state>. Merge it first." and re-render the menu.
  - CI rollup on the PR is green (no `FAILURE` or `ERROR` checks). If checks are pending, ask the user whether to wait or skip.
  - The PR has a `## Dispatch Result` section in its body with `Status: completed`. If the section is missing or `Status` is `partial` / `failed`, refuse and surface the issue back to the user.

  When all gates pass, run `gh pr merge <number> --squash --delete-branch`. `gh pr merge` lands the merge on GitHub but does not touch the local checkout, so before running any verification commands locally, sync the working tree to the merged base: `git fetch origin && git checkout <base_branch> && git pull --ff-only origin <base_branch>`. Without this sync the test suite would run against pre-merge code and could report a false green even when the merged commit is broken. Then run the project's test suite (`bun test`, `pytest`, etc., as inferred from the plan or repo manifest); if it fails, surface the failure prominently and ask the user whether to revert. Update `dispatched_units[<U-ID>].status` to `merged`.

  On merge conflict (`gh pr merge` reports the PR is not mergeable due to conflicts), do **not** attempt to resolve the conflict in the dispatching session — the conflict belongs to the workspace that produced the PR. Surface the conflict and advise the user: "Open the workspace, run `git fetch origin && git rebase origin/<base_branch>`, resolve conflicts, push, and re-run option 1 to refresh status." Re-render the menu without merging.

- **Dispatch newly unblocked units (4)** — recompute the dispatchable set: U-IDs whose dependencies are all `merged` and that have not yet been dispatched. Re-enter Phases 2-3 for that set. If the set is empty, say so and re-render the menu.

- **Show dependency graph (5)** — render an ASCII graph (or a Mermaid diagram if the harness renders one) of all U-IDs, with each node labeled by U-ID and current state (`merged` / `open #PR` / `blocked` / `pending`). Re-render the menu.

- **Done for now (6)** — print a summary (units merged, units still open, units blocked) and exit the loop. The dispatched issues and PRs persist in GitHub; the user can re-invoke `ce-dispatch` later to resume monitoring.

If the user enters free text instead of a number, interpret intent and route to the closest option, or ask one clarifying question and resume the loop.

#### 4.2 Completion

The skill is **not** complete until the user picks `Done for now` or every unit in the plan is in state `merged`. Re-rendering the menu and stopping at the user's selection without acting on it is not completion — fire the routed action.

When every unit is merged, congratulate the user, optionally run the plan's final verification command (e.g., the full test suite from `<verify>`), and exit the loop. Do not auto-close the dispatched issues — `gh pr merge` typically closes them via the linked-issue mechanism, but verify and report.

## Pipeline Mode

If `ce-dispatch` is invoked from an automated workflow (e.g., LFG, or any `disable-model-invocation` upstream), skip the Phase 4 interactive loop and return immediately after Phase 3 with a structured summary of dispatched units. The caller decides what to do with the open PRs.

## What ce-dispatch does NOT do

- It does not programmatically create Conductor workspaces. Conductor opens workspaces from issues at the user's discretion (per `references/conductor-notes.md`, section 1).
- It does not write to or modify the dispatched workspace's filesystem. The orchestrating session only touches GitHub via `gh` and the local plan file.
- It does not edit the plan file. Plan mutations are `ce-plan`'s job; execution progress lives in git and the dispatched-units map, never in the plan body.
- It does not run a long-running background poller. The Phase 4 menu refreshes on user request — there is no implicit "watch" loop between menu interactions.
