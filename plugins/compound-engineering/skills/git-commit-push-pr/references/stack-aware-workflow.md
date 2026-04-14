# Stack-Aware Ship Workflow

This reference is loaded by `SKILL.md` between Step 5 (Push) and Step 6 (Generate PR title/body) when stacking may be relevant. It owns the four-case routing (in-stack, not-in-stack, not-installed, monolithic), the stacking suggestion heuristic, and the per-PR description loop for stacked ships.

For the monolithic case (Case 4), this file simply hands control back to `SKILL.md` Steps 5-7, which remain the single source of truth for monolithic shipping.

Use the platform's blocking question tool whenever this workflow says "ask the user" (`AskUserQuestion` in Claude Code, `request_user_input` in Codex, `ask_user` in Gemini). If none is available, present numbered options and wait for the user's reply before continuing.

When looping over multiple PRs (Case 1), track per-PR progress with the platform's task-tracking tool (`TaskCreate` / `TaskUpdate` / `TaskList` in Claude Code, `update_plan` in Codex). Create one task per PR in the stack.

---

## CLI verification pattern (read first)

Before invoking any `gh stack <cmd>`, run `gh stack <cmd> --help` first to verify current flags and behavior. gh-stack is in GitHub's private preview; flags and output formats may evolve between versions.

This workflow invokes only:

- `gh stack view` — discover the stack and its PRs (both plain and `--json` forms)
- `gh stack push` — push all layer branches (cascades across the stack)
- `gh stack submit` — create any missing PRs across the stack (draft, auto-linked)

Treat command-shape assumptions in this file as routing hints, not a contract. If `--help` output disagrees with the invocation below, follow the `--help` output.

---

## Determine the current case

Using the pre-resolved `gh-stack availability` from `SKILL.md` context plus a quick stack-membership probe, select one of four cases.

**Stack-membership probe** (only if `GH_STACK_INSTALLED`):

```bash
gh stack view 2>/dev/null
```

If the command succeeds and reports the current branch as part of a stack, treat the branch as in-stack. If it errors (not a stack) or returns nothing informative, treat the branch as not in a stack.

**Routing table:**

| Availability | Branch in stack? | Case |
|---|---|---|
| `GH_STACK_INSTALLED` | Yes | Case 1 — stacked ship |
| `GH_STACK_INSTALLED` | No | Case 2 — maybe suggest stacking |
| `GH_STACK_NOT_INSTALLED` | n/a | Case 3 — maybe offer install |
| any | Description-only update mode | Fall through; stacking does not apply |

Detached HEAD, default branch, and description-only update mode bypass this workflow entirely — defer to `SKILL.md`'s existing handling.

---

## Case 1 — Stacked ship (branch is in a stack)

The user is already on a stack. Ship the whole stack in one operation. No stacking suggestion fires here.

This case **replaces** `SKILL.md` Steps 5-7 (push + create/update PR). After completion, report URLs and exit — do not fall through to Step 6.

### 1. Push all layer branches

```bash
gh stack push
```

Cascades pushes across the full stack. If the push reports any failure, surface the error verbatim and stop — do not attempt to continue with submit or description updates on a partial push.

### 2. Submit any missing PRs

```bash
gh stack submit --draft --auto
```

Creates any missing PRs across the stack as drafts with base-branch wiring between layers. Idempotent when PRs already exist.

### 3. Discover the PRs in the stack

```bash
gh stack view --json
```

Parse the output to get the list of PR numbers and their layer branch names. If `--json` is not supported by the installed version (verify via `gh stack view --help`), fall back to parsing the plain `gh stack view` output for PR numbers.

Create a task list with one entry per PR in the stack so the loop below is observable.

### 4. Per-PR description loop

For each PR in the stack, from bottom to top:

1. Load the `ce-pr-description` skill with `pr: <PR number>`. The skill returns `{title, body}` without applying or prompting. If it returns a graceful-exit message instead (e.g., closed PR), skip that PR and record the reason.
2. Apply via `gh pr edit`:

   ```bash
   gh pr edit <PR number> --title "<returned title>" --body "$(cat <<'EOF'
   <returned body>
   EOF
   )"
   ```

3. Mark the task complete and continue to the next PR.

### 5. Report

Output the list of PR URLs (one per layer). Exit — do not return to `SKILL.md` Step 6.

---

<!--
SYNC OBLIGATION: this stacking heuristic must stay identical across:
- plugins/compound-engineering/skills/git-commit-push-pr/references/stack-aware-workflow.md  (this file)
- plugins/compound-engineering/skills/ce-work/references/shipping-workflow.md                 (Unit 7)
- plugins/compound-engineering/skills/ce-work-beta/references/shipping-workflow.md            (Unit 7)
- plugins/compound-engineering/skills/ce-plan/SKILL.md or relevant reference (Unit 9)
When changing this heuristic, update all four atomically.
-->

## Case 2 — Branch is not in a stack (maybe suggest stacking)

`gh-stack` is installed but the current branch is a standard feature branch. Apply the two-stage stacking check. If it passes, offer to decompose via `ce-pr-stack`. If not, fall through to Case 4.

### Two-stage stacking check

**Stage 1 — size/spread hint (cheap, mechanical).** Trigger stage 2 only if the change is big enough that decomposition is plausibly worth the overhead. Compute against the resolved base branch (use the base resolution logic from `SKILL.md` Step 6 — remote default branch from context, else `gh repo view`, else common names):

```bash
git diff --stat <base-remote>/<base-branch>..HEAD
git diff --name-only <base-remote>/<base-branch>..HEAD
```

Pass if either:

- Net diff > ~400 LOC (SmartBear/Cisco 2006 and Rigby & Bird 2013: review defect detection degrades sharply above this range), OR
- Diff crosses > 2 top-level subsystem boundaries (distinct top-level directory prefixes — spread proxy)

If stage 1 fails, skip to Case 4 silently. No prompt.

**Stage 2 — effectiveness test (model reasoning over diff + commit log).** Read the full diff and commit list. Suggest stacking only if at least two of the following hold:

1. **Independence** — at least one commit or commit range is reviewable, mergeable, and revertable without the rest (e.g., a refactor that stands alone before the feature that uses it).
2. **Reviewer divergence** — distinct parts of the change have different natural reviewers or risk profiles (infra migration + product feature; security-sensitive + routine).
3. **Sequencing value** — staged landing reduces blast radius or unblocks parallel work.
4. **Mixed kinds** — a mechanical change (rename, move, codemod) bundled with a semantic change; isolating the mechanical part dramatically reduces review load.

**Anti-patterns — do NOT suggest stacking even when stage 1 passes:**

- Single logical change with tightly coupled commits (diff 1 does not compile or pass tests without diff 2).
- Pure mechanical codemod (rename-only, import shuffle). Detect via commits whose diff is purely renames/moves dominating the commit count — reviewers skim the whole thing regardless of size.
- Hotfix or time-critical change where merge-queue latency dominates.
- Short-lived exploratory work likely to be squashed.

**When stage 1 passes but stage 2 fails:** skip the prompt entirely — asking would be ceremony. Fall through to Case 4.

### Prompt (only when both stages pass)

Honor the governing principle: if the user has already declined stacking earlier in this session, skip the prompt and fall through to Case 4.

Otherwise ask:

> This change has N independently reviewable layers: [one-line list per layer]. Splitting would let reviewer X land the refactor while you iterate on the feature. Want to split? [Yes / No, ship as one PR]

- **Yes** — load the `ce-pr-stack` skill. When `ce-pr-stack` completes decomposition and hands back, re-enter this workflow from the top: the branch is now in a stack, so routing lands in Case 1. Single semantic loop — no duplicate ship logic here.
- **No** — record the decline for the session (governing principle) and fall through to Case 4.

---

## Case 3 — gh-stack not installed (maybe offer install)

`GH_STACK_NOT_INSTALLED`. Run stage 1 only (stage 2 requires more context than is worth gathering before knowing whether the tool is even available). If stage 1 fails, fall through to Case 4 silently.

Honor the governing principle: if the user has already declined to install gh-stack earlier in the session, skip this offer and fall through to Case 4.

Otherwise ask:

> This change is large enough that stacked PRs could speed up review. Want me to install gh-stack now? (This runs `gh extension install github/gh-stack`.) [Yes, install / No, ship as single PR]

- **Yes** — run:

  ```bash
  gh extension install github/gh-stack
  ```

  Inspect the exit code:
  - **Success (exit 0):** confirm installation, re-enter this workflow from the top — availability is now `GH_STACK_INSTALLED`, routing lands in Case 2.
  - **Access denied** (gh-stack is in private preview — `gh` may surface "not authorized" or 404): report that the user's account does not yet have preview access, link to https://github.github.com/gh-stack/ so they can request access, and fall through to Case 4.
  - **Network / auth / other failure:** report the exact error returned by `gh`, then fall through to Case 4.

- **No** — record the decline for the session (governing principle ensures no re-offer) and fall through to Case 4.

---

## Case 4 — Monolithic (fall through)

No stacking. Return to `SKILL.md`:

1. Run `git push -u origin HEAD` per Step 5.
2. Proceed to Step 6 (generate title and body via `ce-pr-description`) and Step 7 (create or update the PR).

This is the existing post-Unit-5 behavior. Nothing here duplicates the monolithic flow — `SKILL.md` owns it.

---

## Governing principles

- **Respect prior decisions.** If the user declined stacking or declined installing gh-stack earlier in this session, do not re-prompt for the same decision. Re-ask only when circumstances have changed materially.
- **One install offer per session.** Once the user has declined to install gh-stack, do not re-offer in subsequent invocations within the session.
- **Single ship path.** Whether monolithic or stacked, description generation always goes through `ce-pr-description`. Do not duplicate the writing logic here.
- **Primary enforcement is the agent's awareness of prior conversation.** Structured context signals at explicit delegation boundaries are a secondary mechanism and are not required for correctness.
