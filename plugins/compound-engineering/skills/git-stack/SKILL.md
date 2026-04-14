---
name: git-stack
description: "Split an existing branch into stacked PRs, or manage an existing stack via gh-stack. Use when the user says 'split this into stacked PRs', 'stack my changes', 'break this PR into a stack', 'this PR is too big', 'push the stack', 'submit the stack', 'rebase the stack', 'stack status', or otherwise wants to create, inspect, or operate on a GitHub stacked pull request chain."
argument-hint: "[split|push|submit|view|rebase|sync] — mode is also inferred from the user's phrasing"
---

# Git Stack

Decompose a monolithic feature branch into a reviewable chain of stacked PRs, or drive an existing stack using the `gh stack` GitHub CLI extension.

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

1. **Honor prior decisions in this session.** If the user has already declined to install gh-stack earlier in this conversation, or a caller passed `gh_stack_install_declined: true` as a context signal, do **not** re-ask. Skip to the fall-back described below.
2. **Explain briefly** what gh-stack is (a GitHub CLI extension that creates and manages chains of dependent pull requests so each review is small and focused) and **offer to install and run the command**.
3. Ask the user: "gh-stack is not installed. Install it now so I can proceed? (This runs `gh extension install github/gh-stack`.)" with options: `Yes, install` / `No, skip stacking`.
4. On **Yes**, run:
   ```bash
   gh extension install github/gh-stack
   ```
   Inspect the exit code:
   - **Success (exit 0):** confirm installation, re-check with `gh extension list | grep -q gh-stack`, and continue to Step 2.
   - **Access denied** (the extension is in GitHub's private preview — `gh` may surface a "not authorized" or 404 error): report that the user's account does not yet have preview access, link to https://github.github.com/gh-stack/ so they can request access, and fall back (see below).
   - **Network / auth / other failure:** report the exact error returned by `gh`, then fall back.
5. On **No**, record the decline as a session-level `gh_stack_install_declined` signal in your working memory so no subsequent step re-asks, and fall back.

**Fall-back when gh-stack is unavailable:** stop this skill. Tell the user that stacking is unavailable in this session, and point them to the `git-commit-push-pr` skill to ship their work as a single PR. Do not attempt any `gh stack` commands.

---

## Step 2: Known CLI surface

This skill relies on the `gh stack` subcommands below. Group by purpose:

| Purpose | Commands |
|---------|----------|
| Creation | `gh stack init`, `gh stack add`, `gh stack push`, `gh stack submit` |
| Navigation | `gh stack checkout`, `gh stack bottom`, `gh stack top`, `gh stack up`, `gh stack down` |
| Inspection | `gh stack view` (no `status` subcommand exists — `view` is the canonical inspection command) |
| Cascade / modification | `gh stack rebase` (with `--upstack`, `--downstack`, `--continue`, `--abort`) |
| Post-merge | `gh stack sync`, `gh stack merge` |
| Teardown | `gh stack unstack` |

**Required verification pattern:** before invoking any `gh stack <cmd>`, run `gh stack <cmd> --help` first to verify current flags and behavior. gh-stack is in GitHub's private preview; flags and output formats may evolve between versions. Treat the table above as a routing hint, not a contract.

---

## Step 3: Mode routing

Parse the user's intent to choose an operational mode.

- **Split mode** (default for intent to decompose a branch): triggered by phrases such as "split this into stacked PRs", "stack my changes", "break this into a stack", "this PR is too big", "decompose this branch", or a bare `/git-stack` with no further direction on a branch that has unshipped work.
- **Manage mode** (direct stack operation): triggered by phrases such as "push the stack", "submit the stack", "rebase the stack", "sync the stack", "stack status", "show the stack", "check out the bottom of the stack". These map directly to `gh stack push`, `gh stack submit`, `gh stack rebase`, `gh stack sync`, `gh stack view`, and `gh stack checkout` respectively.

If the user's intent is ambiguous, ask them which mode to use (split vs. manage) and list the available `gh stack` operations.

Also identify the **invocation flavor** — this governs whether the effectiveness gate in Step 5 runs:

- **Manual** — user invoked `/git-stack` or equivalent directly. Intent is declared.
- **Delegated** — a caller (e.g., `git-commit-push-pr`, the shipping workflow, or `resolve-pr-feedback`) passed `delegated: true` as a context signal. The caller already triaged and obtained consent.
- **Auto-invoked** — the model chose to load this skill based on the user's utterance without an explicit `/git-stack`. Intent is inferred, not declared.

If the caller passed `stacking_declined: true` for the current session, exit immediately with a one-line acknowledgement. Per the governing principle, prior user decisions about stacking are respected across invocations.

If **manage mode**, skip to Step 7. Manage mode has nothing to decompose — the basic state gate, effectiveness gate, and split proposal do not apply.

---

## Step 4: Basic state gate (split mode, all invocation flavors)

Run the bundled detection script:

```bash
scripts/stack-detect "<base-branch>"
```

Pass the remote default branch (without the `origin/` prefix) as `<base-branch>`. If the default branch is unresolved, fall back to `main`, then `master`.

Read the `=== TOOL ===`, `=== STACK_STATE ===`, `=== CHANGE_SUMMARY ===`, and `=== COMMIT_LOG ===` sections from the output.

**Runtime access check:** if the `TOOL` section reports that `gh stack` is installed but a runtime access error was surfaced (private preview access not granted for the user's account), explain what the user saw and stop. Do not proceed with a stacking workflow the user cannot complete.

**State check:** verify the current branch is a feature branch (not the default branch, not detached HEAD) and has commits ahead of the base. If either check fails, exit gracefully with:

> Nothing to stack — you are on `<branch>` with no feature work ahead of `<base>`.

This gate runs for manual, delegated, **and** auto-invoked entries, because "nothing to stack" is a state problem, not an intent problem. A user running `/git-stack` on `main` needs the same graceful response as a user whose utterance was auto-routed here.

---

## Step 5: Effectiveness gate (auto-invoked split mode only)

**Manual and delegated invocations skip this step entirely** — intent was already declared by the user or triaged by the caller. Jump to Step 6.

Auto-invoked split entries must pass a two-stage effectiveness test before proposing a split. The test reads signals from the `=== CHANGE_SUMMARY ===` and `=== COMMIT_LOG ===` sections emitted by `scripts/stack-detect` in Step 4.

### Stage 1 — Size/spread hint (mechanical)

The change must be large enough that decomposition is plausibly worth the ceremony. Pass stage 1 if **either** holds:

- Net diff greater than roughly **400 lines of code** (supported by SmartBear/Cisco 2006 and Rigby & Bird 2013 review-defect data: detection degrades sharply above this range), **or**
- Diff crosses more than **2 top-level subsystem boundaries** (distinct top-level directory prefixes, read from the `directories:` field).

If stage 1 fails, push back with:

> This change is small enough that a single PR will review fine — stacking would be ceremony. Ship as a single PR?

Then exit and defer to `git-commit-push-pr`.

### Stage 2 — Effectiveness test (model reasoning)

If stage 1 passes, judge stage 2 from the diff and commit log. Suggest stacking only when **at least two** of the following hold:

1. **Independence** — at least one commit or commit range is reviewable, mergeable, and revertable without the rest (for example, a refactor that stands alone before the feature that uses it).
2. **Reviewer divergence** — distinct parts of the change have different natural reviewers or risk profiles (infra migration + product feature, security-sensitive + routine).
3. **Sequencing value** — staged landing reduces blast radius or unblocks parallel work.
4. **Mixed kinds** — a mechanical change (rename, move, codemod) is bundled with a semantic change; isolating the mechanical part dramatically reduces review load.

### Anti-patterns (reject even when stage 1 passed)

Do **not** suggest stacking when any of these apply:

- **Single logical change** with tightly coupled commits (diff 1 does not compile or pass tests without diff 2). Push back with: "This reads as one logical change — splitting would be ceremony. Ship as a single PR?"
- **Pure mechanical codemod** (rename-only, import shuffle). Detect via `renames_only_commits` dominating the commit count. Push back with: "This is mechanical; reviewers skim the whole thing regardless of size. A single PR is faster."
- **Hotfix or time-critical change** where merge-queue latency dominates.
- **Short-lived exploratory work** likely to be squashed.

### When the test passes

Present a brief layer sketch (N layers, one sentence each, with approximate sizes) and ask:

> This change has N independently reviewable layers: [one-line list]. Want me to proceed with this split?

- **Yes** — continue to Step 6.
- **No** — record `stacking_declined: true` for the remainder of the session, exit, and defer to `git-commit-push-pr` with that signal.

### When stage 1 passes but stage 2 fails

Skip the prompt entirely — asking would be ceremony. Tell the user which signals are absent in one line, offer the single-PR path, and exit.

---

## Step 6: Split mode proposal

Load the full decomposition workflow from `references/splitting-workflow.md` and follow it end-to-end. That reference file covers: analyze, propose layers (with approval), create the stack locally, verify each layer, and submit with `gh stack push` / `gh stack submit`.

**Layer-approval is the second gate and is not skipped.** Manual and delegated invocations skip the effectiveness gate in Step 5 because intent was already declared, but every split must still be approved by the user at the layer-proposal stage inside the splitting workflow. The agent's proposed split is a guess; the user confirms before any branches are created.

If the caller passed plan context (for example, from `/ce:work`'s shipping workflow), use plan units as candidate layer boundaries during analysis.

---

## Step 7: Manage mode

Manage mode runs a single `gh stack` operation against the existing stack. It skips Steps 4–6 entirely — there is nothing to decompose.

Before running the mapped command, run `gh stack <cmd> --help` to verify current flags (per Step 2).

Typical mappings:

| User intent | Command |
|-------------|---------|
| "push the stack" | `gh stack push` |
| "submit the stack" (open / update PRs) | `gh stack submit` |
| "rebase the stack" | `gh stack rebase` (ask whether `--upstack`, `--downstack`, `--continue`, or `--abort` applies) |
| "sync the stack" (post-merge cleanup) | `gh stack sync` |
| "show the stack" / "stack status" | `gh stack view` |
| "check out layer X" / "top" / "bottom" | `gh stack checkout <branch>` / `gh stack top` / `gh stack bottom` / `gh stack up` / `gh stack down` |
| "unstack" / "tear down" | `gh stack unstack` (confirm destructive intent first) |

Run the command, surface its output, and stop. If the command fails, report the exact error and stop — do not attempt automated recovery.

---

## Governing principles

- **Respect prior decisions.** If the user declined stacking, declined installing gh-stack, or approved a specific split earlier in the session, do not re-prompt for the same decision. Re-ask only when circumstances have changed materially (for example, a small change has grown large enough that the earlier decline no longer fits). This applies within a single invocation and across the full chain (`ce:plan` → `ce:work` → shipping → `git-commit-push-pr` → `git-stack` → `resolve-pr-feedback`).
- **Consent before destruction.** Never create branches, push, or submit PRs without an explicit user approval captured in this session.
- **Signal over ceremony.** If the change does not warrant stacking, say so plainly and exit — do not walk the user through a workflow whose premise is already false.
- **One install offer per session.** Once the user has declined to install gh-stack, no downstream skill in this chain should re-ask.

## Delegation-signal handling

Callers (`git-commit-push-pr`, the ce-work / ce-work-beta shipping workflow, future `resolve-pr-feedback` stack-aware flows) can pass these context signals when invoking this skill:

| Signal | Meaning | Effect here |
|--------|---------|-------------|
| `delegated: true` | Caller already triaged size/independence and got user consent. | Skip the effectiveness gate (Step 5). Still run the basic state gate (Step 4) and still require user approval of the layer proposal inside `references/splitting-workflow.md`. |
| `stacking_declined: true` | User declined stacking earlier in this session. | Exit immediately with a brief acknowledgement. Do not re-prompt. |
| `gh_stack_install_declined: true` | User declined installing gh-stack earlier in this session. | If gh-stack is not installed, fall back silently per Step 1 rather than re-asking. |
| `plan_context: <path or summary>` | Caller passed a plan/summary that may hint at layer boundaries. | Use as candidate boundaries during layer proposal in the splitting workflow. |

Primary enforcement of these principles is the agent's own awareness of prior conversation in the session; the structured signals above are a secondary mechanism for explicit skill-to-skill delegation.
