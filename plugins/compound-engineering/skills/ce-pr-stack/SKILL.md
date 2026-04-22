---
name: ce-pr-stack
description: "Decompose an existing feature branch into a chain of stacked pull requests using GitHub's gh-stack CLI extension. Use when the user says 'split this into stacked PRs', 'stack my changes', 'break this PR into a stack', 'this PR is too big', 'decompose this branch', or otherwise wants to restructure completed work into a reviewable PR chain. Does NOT ship the resulting stack — hands off to git-commit-push-pr for push and PR creation."
argument-hint: "[--base <branch>] [--plan <path>] — base defaults to repo default branch; plan path is optional and informs layer boundaries"
---

# CE PR Stack

Decompose a feature branch with completed work into a reviewable chain of stacked pull requests, using the `gh stack` GitHub CLI extension. Scope is decomposition only — analyze the branch, propose layer boundaries, create the layer branches locally, and hand off to `git-commit-push-pr` for the actual push and PR creation.

Why a separate skill: decomposition is a fundamentally different operation from shipping (it restructures an existing branch into multiple branches), and it is rarely invoked directly — the dominant entry point is `git-commit-push-pr` detecting a substantial change and suggesting stacking, then delegating here.

**Asking the user:** When this skill says "ask the user", use the platform's blocking question tool (`AskUserQuestion` in Claude Code, `request_user_input` in Codex, `ask_user` in Gemini). If none is available, present the choices as a numbered list and wait for the user's reply before continuing.

---

## Context

**gh-stack availability:**
!`gh extension list 2>/dev/null | grep -q gh-stack && echo "GH_STACK_INSTALLED" || echo "GH_STACK_NOT_INSTALLED"`

**Current branch:**
!`git branch --show-current 2>/dev/null || echo "DETACHED_OR_NO_REPO"`

**Remote default branch:**
!`git rev-parse --abbrev-ref origin/HEAD 2>/dev/null || echo "DEFAULT_BRANCH_UNRESOLVED"`

### Context fallback (non-Claude-Code platforms)

If the labeled values above did not resolve (literal command strings, empty output, or "unresolved" sentinels), run this one-liner to gather the same data:

```bash
printf '=== GH_STACK ===\n'; gh extension list 2>/dev/null | grep -q gh-stack && echo "GH_STACK_INSTALLED" || echo "GH_STACK_NOT_INSTALLED"; printf '\n=== BRANCH ===\n'; git branch --show-current; printf '\n=== DEFAULT_BRANCH ===\n'; git rev-parse --abbrev-ref origin/HEAD 2>/dev/null || echo 'DEFAULT_BRANCH_UNRESOLVED'
```

---

## Step 1: Availability gate

If the gh-stack status is `GH_STACK_INSTALLED`, continue to Step 2.

If it is `GH_STACK_NOT_INSTALLED`:

1. **Honor prior decisions in this session.** If the user has already declined to install gh-stack earlier in this conversation, do **not** re-ask. Skip to the fall-back below.
2. **Explain briefly** what gh-stack is (a GitHub CLI extension that creates and manages chains of dependent pull requests so each review is small and focused), and **offer to install and run the command**.
3. Ask: "gh-stack is not installed. Install it now so I can proceed? (This runs `gh extension install github/gh-stack`.)" with options: `Yes, install` / `No, skip stacking`.
4. On **Yes**, run:
   ```bash
   gh extension install github/gh-stack
   ```
   Inspect the exit code:
   - **Success (exit 0):** confirm installation, re-check with `gh extension list | grep -q gh-stack`, and continue to Step 2.
   - **Access denied** (gh-stack is in GitHub's private preview — `gh` may surface a "not authorized" or 404 error): report that the user's account does not yet have preview access, link to https://github.github.com/gh-stack/ so they can request access, and fall back.
   - **Network / auth / other failure:** report the exact error returned by `gh`, then fall back.
5. On **No**, note the decline for the remainder of the session (the governing principle below ensures no subsequent skill will re-ask), and fall back.

**Fall-back when gh-stack is unavailable:** stop this skill. Tell the user that stacking is unavailable in this session, and point them to `git-commit-push-pr` to ship their work as a single PR. Do not attempt any `gh stack` commands.

---

## Step 2: Known CLI surface (decomposition only)

This skill invokes only the subset of `gh stack` needed for decomposition. Ship operations (`push`, `submit`) are invoked by `git-commit-push-pr` after this skill hands off — not here.

| Purpose | Commands |
|---------|----------|
| Create a stack + add layers | `gh stack init`, `gh stack add` |
| Inspect state | `gh stack view` |
| Rollback (local only) | `gh stack unstack --local` |

**Required verification pattern:** before invoking any `gh stack <cmd>`, run `gh stack <cmd> --help` first to verify current flags and behavior. gh-stack is in GitHub's private preview; flags and output formats may evolve between versions. Treat the table above as a routing hint, not a contract.

---

## Step 3: Basic state gate

Run the bundled detection script:

```bash
scripts/stack-detect "<base-branch>"
```

Pass the remote default branch (without the `origin/` prefix) as `<base-branch>`. If the default branch is unresolved, fall back to `main`, then `master`.

Read the `=== TOOL ===`, `=== STACK_STATE ===`, `=== CHANGE_SUMMARY ===`, and `=== COMMIT_LOG ===` sections from the output.

**Runtime access check:** if the `TOOL` section reports that `gh stack` is installed but a runtime access error was surfaced (private preview access not granted), explain what the user saw and stop. Do not proceed with a workflow the user cannot complete.

**State check:** verify the current branch is a feature branch (not the default branch, not detached HEAD) and has commits ahead of the base. If either check fails, exit gracefully with:

> Nothing to stack — you are on `<branch>` with no feature work ahead of `<base>`.

This gate runs regardless of how the skill was invoked, because "nothing to stack" is a state problem, not an intent problem.

---

## Step 4: Consent check

The governing principle (see the bottom of this file) respects prior user decisions about stacking within the session. This step applies that principle:

1. **Inspect the conversation context for prior consent or decline.** Signals to look for:
   - The user just said "yes" to a stacking suggestion from `git-commit-push-pr` or the shipping workflow → consent given, skip the prompt.
   - The user invoked `/ce-pr-stack` directly or said "split this into stacked PRs" → declared intent, skip the prompt.
   - The user has already declined stacking earlier in this session → exit immediately with a one-line acknowledgement. Do not re-prompt for the same decision unless circumstances have changed materially.

2. **If no prior signal** (the skill was auto-loaded on an ambiguous utterance like "this PR is too big"), run the two-stage effectiveness test defined in the `git-commit-push-pr` stack-aware workflow — do not duplicate it here. Read that workflow when applying the test so the heuristic stays in sync across all touchpoints. Then prompt:

   > This change has N independently reviewable layers: [one-line list]. Want me to proceed with this split?

   On **Yes** → continue to Step 5. On **No** → exit with a one-line acknowledgement; the governing principle ensures downstream skills respect the decline.

3. **Anti-pattern short-circuits.** Even with prior consent, surface a push-back and ask for confirmation if the state-gate output reveals:
   - A single logical change with tightly coupled commits → "This reads as one logical change — splitting would be ceremony. Still split?"
   - A pure mechanical codemod (rename-only commits dominate `renames_only_commits`) → "This is mechanical; reviewers skim the whole thing regardless of size. Still split?"

   These are cases where the earlier consent may have been given without seeing the specific shape of the change. A one-sentence confirmation respects the prior consent while giving the user a chance to reverse course once informed.

**Layer approval in Step 5 is the second gate and always runs,** regardless of what happened here. The agent's proposed split is a guess; the user confirms before any branches are created.

---

## Step 5: Load decomposition workflow

Load the full decomposition workflow from `references/splitting-workflow.md` and follow it end-to-end. The workflow covers three phases:

1. **Analyze** — read diff + commit log, optionally using a provided plan to inform candidate layer boundaries
2. **Propose layers** — present a split plan, get user approval (second gate)
3. **Create the stack locally** — `gh stack init`, `gh stack add`, selective file checkout, per-layer commit, verify each layer builds

If a `--plan <path>` was passed as an argument or context, use plan implementation-unit boundaries as the primary signal for candidate layers, with commit boundaries as secondary cross-check.

**After local construction completes, hand off to `git-commit-push-pr`** — it handles `gh stack push`, `gh stack submit`, and per-PR description generation via `ce-pr-description`. This skill does not push or submit directly.

---

## Governing principles

- **Respect prior decisions.** If the user declined stacking, declined installing gh-stack, or approved a specific split earlier in the session, do not re-prompt for the same decision. Re-ask only when circumstances have changed materially (for example, a small change has grown large enough that the earlier decline no longer fits). This applies within a single invocation and across the full chain (`ce:plan` → `ce:work` → shipping → `git-commit-push-pr` → `ce-pr-stack`).
- **Consent before destruction.** Never create branches or modify working-tree state without an explicit user approval captured in this session.
- **Signal over ceremony.** If the change does not warrant stacking, say so plainly and exit — do not walk the user through a workflow whose premise is already false.
- **One install offer per session.** Once the user has declined to install gh-stack, no downstream skill in this chain should re-ask.
- **Primary enforcement is the agent's awareness of prior conversation.** Structured context signals at explicit delegation boundaries are a secondary mechanism and are not required for correctness. The governing principle above is the contract.

---

## Scope

This skill's single responsibility is **decomposing a branch into a stack of layer branches, locally**. Things this skill does NOT do:

- **Push or submit PRs** — handed off to `git-commit-push-pr` after local construction completes.
- **Rebase an existing stack** (`gh stack rebase`) — invoke `gh stack rebase` directly when needed; no skill wrapping required.
- **View or navigate an existing stack** (`gh stack view`, `checkout`, `top`, `bottom`, `up`, `down`) — invoke `gh stack <cmd>` directly.
- **Post-merge cleanup** (`gh stack sync`) — invoke directly.
- **Tear down a stack on the remote** (`gh stack unstack` without `--local`) — invoke directly, confirming destructive intent with the user first.

If the user asks for any of these, point them to the relevant `gh stack` command or to `git-commit-push-pr` (for push/submit). This skill's scope is intentionally narrow.
