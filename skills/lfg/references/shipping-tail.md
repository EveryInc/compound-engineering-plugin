# Shipping tail (LFG steps 8–10)

LFG's body owns the shipping precondition and the two invocation strings. This file owns everything that decides *which* handoff runs, what LFG threads into it, what it does with the result, and how the run closes out.

## Step 8 — a project-defined process may own the handoff

The goal is the remaining work committed, pushed, and in an open PR whose URL you hold.

If the project's active instructions name a process that owns that handoff — a named skill or command, a stacking tool, or documented steps, but not commit or PR-title conventions, which the default already honors, and a skill directory alone is not a directive — run it non-interactively with the same plan path and context below instead of the default. It is done only when the work is pushed and you hold the URL of an open PR containing it — one the process opened, or a PR that already exists for the branch. If it cannot run headlessly, is unavailable, or ends short of that state, stop as **blocked** naming the process — do not fall through to the default or to step 9.

## Step 8 — what LFG threads into the default

Thread the recorded plan path from step 1 into the `ce-commit-push-pr` invocation, along with any proceeded-and-flagged `settled_decision_conflicts` entries from step 2, so the PR body's settled-decisions provenance line and its proceed-under-flag clause can fire.

This commits any remaining changes, pushes the branch, and opens a pull request — non-interactively, per the mode token. If it prints a `New concepts:` trailer after the PR URL, record the concept name(s) for step 10. Once the PR URL is known, back-fill it into any residual tickets filed in step 6 (the `filed` list) so each ticket links to the PR carrying the finding — best-effort, and never block DONE on a failed ticket update. If a PR already exists for the branch (check with `gh pr view --json number,url,state 2>/dev/null`), skip PR creation but still commit and push any uncommitted changes.

**Per the shipping precondition, when no remote is configured, do NOT invoke `ce-commit-push-pr` or a project-defined shipping process** — the default's commit step pushes unconditionally (`git push -u origin HEAD`), so a literal invocation would still hit the impossible push. Instead commit any remaining changes locally yourself (`git add -A && git commit`) and skip the push and PR creation entirely.

## Step 9 — stack handoff from step 8

If step 8's `ce-commit-push-pr` completed a stack-mode submit and handed off `ce-babysit-pr` on the **bottom open non-draft** PR with `posture:stack-ready` or `posture:stack-land`:

- Do **not** start a second bare `mode:pipeline` babysit on the current-branch URL (that can supersede the stack-aware run as target-only or watch the wrong layer).
- Prefer the structured result already returned from that handoff when it reflects a completed pipeline stop.
- If step 8 only confirmed babysit **started** (or no structured result is available), re-invoke `ce-babysit-pr mode:pipeline <bottom-pr-url> posture:<same>` and wait for its pipeline completion — never treat "started" as DONE.
- Record the bottom PR URL and posture for step 10's user-facing resume line.
- Collect `{ status, fixes_applied, residuals }` and proceed to step 10.

## Step 9 — the default babysit

Otherwise invoke `ce-babysit-pr mode:pipeline <pr-url>` on the current open PR. It runs the bounded pipeline loop: watches CI, repairs real (convergent) failures via `ce-debug mode:pipeline` — never weakening, skipping, or mocking an assertion — resolves any review comments that arrived via `ce-resolve-pr-feedback mode:pipeline`, and stops when CI is decided or its budget (default 3 fix rounds) is hit. This replaces LFG's former hand-rolled CI loop; do not reimplement CI-watching here. Invoke it unconditionally whenever an open PR exists **and** step 8 did not already hand off stack babysit — a run whose CI looks likely-clean is not a reason to skip babysit and poll `gh pr checks` yourself. Green CI at one instant is not this step's goal: babysit also resolves review comments across the PR's life, so a passing check while advisory checks (e.g. Bugbot) are still pending or comments are unhandled is not "done" and never substitutes for the invocation.

Collect its structured result (`{ status, fixes_applied, residuals }`).

## Step 9 — common result gate

Whichever handoff produced the result, preserve its canonical typed `needs-human` residual set unchanged. Before DONE, render the complete set under `## Needs your decision`, including each residual's quoted feedback, investigation, decision reason, options and tradeoffs, recommendation if any, and every open-thread link. A non-empty set is a decision handoff, never successful completion; a generic count or PR link is not propagation. Unfixable CI still belongs in the babysitter's run-report comment, never a PR-body section.

## Step 10 — close out

Everything below happens before LFG outputs `<promise>DONE</promise>`.

### Rendering the user-runnable invocations

For the two handoffs below, default to `/ce-explain <name>` / `/ce-babysit-pr <pr-url>`. Use `$ce-explain <name>` / `$ce-babysit-pr <pr-url>` only when the active host is Codex or explicitly documents dollar-prefixed skill invocation. Render only the invocation as inline code and output one form only.

### New concepts

If step 8 recorded a `New concepts:` trailer, first echo one line per concept: `New concept introduced: <name> — run <rendered ce-explain invocation> to go deeper.`

### The open PR

If an open PR exists, add one line pointing the user to the interactive watch-to-merge (pipeline mode stopped at "CI decided," not "merged"): `PR is moving — run <rendered ce-babysit-pr invocation> to watch it through review to merge.`

When step 8/9 used a stack handoff, render that invocation for the **bottom open non-draft** PR URL with the same `posture:stack-ready` or `posture:stack-land` token — never a bare current-branch URL that would supersede stack scope.

### The optional next-work offer

Inspect the canonical plan from step 1 for the semantic role `work-relationships`. Load `references/next-work-handoff.md` when that role exists, or when an older unmarked Product Contract appears to name the area this plan owns plus future separately planned areas and their relationships; that reference owns the cautious legacy semantic fallback, candidate selection, and the opt-in offer contract. Do not match an exact visible heading, treat ordinary non-goals as future work, or invoke `ce-handoff` before the user explicitly accepts the offer. If neither semantic signal exists, do not load the reference and make no next-work offer.

Then output the DONE promise.
