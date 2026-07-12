# Plan: shared pipeline-mode contract + `lfg` ↔ `ce-babysit-pr` consolidation

> Status: draft for review. Not a `ce-unified-plan` artifact (deliberately — `lfg` must not try to execute this).
> Origin: `lfg` step 9 is a hand-rolled, deficient PR-babysit loop (waits for the whole CI run; no review-comment handling; inline CI fix that doesn't use `ce-debug`; will drift). Consolidate it onto `ce-babysit-pr` while preserving `lfg`'s terminate-and-exit contract. Doing so surfaced a cross-cutting need: a shared **pipeline mode** whose safety posture is coherent across skills.

## The core principle (unchanged)

The safety rule was never "never alter the product." It is **"never *diverge* from intended behavior without a human."** Two kinds of change:

- **Convergent** — fixing a real CI bug / applying a mechanical review fix so the code meets its intended (planned, tested) behavior. Autonomous is correct; `lfg` celebrates this today.
- **Divergent** — reversing a *deliberate* design/product decision (the `ce-resolve-pr-feedback` intent-conflict tripwire; `ce-debug` line 270 "fix needs a product/design decision"). Requires a human.

Interactive mode surfaces divergent items by **asking**. Pipeline mode has no human to ask, so it surfaces them by **deferring as a durable residual** — never blocking, never silently applying. Same principle, different channel.

## The shared pipeline-mode contract

Any skill invoked with `mode:pipeline` (by an orchestrator, unattended) MUST:

1. **Be non-interactive** — never call the blocking-question tool; take the documented conservative default for any choice that would otherwise ask.
2. **Make convergent progress autonomously** — fix real CI failures, apply mechanical fixes, resolve clear review comments.
3. **Defer divergence as a durable residual** — anything that would diverge from intended behavior or needs a product/design decision is NOT applied and NOT blocked; it is surfaced through the native channel (an open thread + `decision_context`, or a run-report comment for non-thread items — see below), **never a PR-body section**.
4. **Terminate on a bound** — return a structured result; never loop waiting on a human or an unbounded external event. A budget (attempts/time) caps it.
5. **Return a structured status** — what it did, what it deferred (residuals), terminal state — so the orchestrator can compose.
6. **State the pipeline behavior explicitly** in the SKILL, distinct from interactive, so the difference is intentional (this is the "call it out" requirement).

### The residual channel — consolidated (DECIDED)

**Principle: the PR body describes the *change*. The PR's open threads and check statuses ARE the live "what's outstanding" ledger — and GitHub already surfaces them (unresolved-conversation count + failing checks in the merge box). Skills never duplicate that ledger into the PR body.** This retires `lfg`'s `## Residual Review Findings` and `## CI Failures Unresolved` body sections — they duplicate GitHub's own UI and go stale on every resolve (forcing a body re-edit).

Deferred items surface through native primitives, by residual type:

- **Review feedback needing a decision → leave the thread OPEN** (self-maintaining ledger). Attach a reply **only to carry the `decision_context`** (what it found, why it's a judgment call, options + tradeoffs, its lean) — the analysis belongs on the thread at the code line. **Never reply just to "confirm it's open"** (open-state already says that); no added analysis → no reply.
- **CI it couldn't fix, or a top-level finding with no inline thread → one point-in-time PR comment** (the run's narrative: "attempted N fixes, check X still red — diagnosis/logs"). The check status is the live ledger; the comment is a snapshot, so it never needs syncing.
- **No PR (fallback only) → the committed `docs/residual-review-findings/<branch-or-sha>.md`** file, as today.

**Ownership:** `ce-resolve-pr-feedback` owns the open-thread + decision_context behavior (it does this today). `lfg` and babysit STOP writing PR-body residual sections; they rely on open threads + one run-report comment.

### The run-report comment

Post **only when there is a residual with no thread to hold it** (default; keeps comment-noise minimal) — not for review-thread residuals, which the open threads already carry. It is a single, point-in-time narrative of the autonomous run.

## Decisions (locked)

- **Defer, not auto-apply.** Divergent items are deferred as durable residuals (per the channel above), never silently applied. Auto-reversing a deliberate decision unattended is where autonomy turns dangerous; defer costs the user no visibility (it's on the PR). Auto-apply remains a possible future opt-in, not the default.
- **No PR-body residual sections.** Consolidate on native threads/checks + one run-report comment.

## Per-skill changes

### 1. `ce-debug` — add `mode:pipeline` (largest change; today it is fully interactive)

Today it prompts at Phase 2 (branch), Phase 4 (handoff "prompt for next action"), residual handling ("ask the user whether to fix now, accept/defer, or stop"), and the compound offer. Pipeline mode:

- Suppress every blocking question; operate on the current branch (orchestrator owns branch context).
- Diagnose + apply the fix **only when it converges to intent** (repair the real bug; never weaken/mock the failing assertion).
- When the fix would need a product/design decision (line 270) → **defer**, do not apply, do not ask. Surface it: if it maps to an open review thread, leave that thread and attach `decision_context`; otherwise include it in the caller's run-report comment (a bare `ce-debug` invocation with no PR posts the `docs/residual-review-findings/` fallback). **No PR-body section.**
- Return structured: `{ status: fixed-and-pushed | diagnosed-no-fix | flaky-infra | needs-human, residuals: [...] }`.
- Quality tail (simplify/review): skip or run lightweight in pipeline to bound cost/nesting.
- **This is the prerequisite for babysit's CI path** — babysit's spec already assumes this structured, autonomous `ce-debug`, which does not exist yet.

### 2. `ce-resolve-pr-feedback` — formalize pipeline behavior (small)

Already non-blocking on `needs-human` (leaves the thread open, reports). Add an explicit `mode:pipeline` note: it never asks; `needs-human` items (including the intent-conflict tripwire) are surfaced by **leaving the thread open with a `decision_context` reply** (the current behavior — which is exactly the consolidated model) and returned as structured residuals. Reply only to carry the analysis, never to "confirm it's open." No PR-body section.

### 3. `ce-babysit-pr` — add `mode:pipeline` (bounded, orchestrator-driven)

- Non-interactive; run as **bounded synchronous ticks** driven by the caller (the orchestrator is the "scheduler" — no self-scheduling needed).
- **Pipeline stop condition:** exit when every check reaches a terminal state AND no actionable backlog remains, or a fix/round budget is hit. **Never** wait for human review/approval or the merge-ready settle window (those are interactive-only stops).
- Surface residuals natively: needs-human threads stay open (via `ce-resolve-pr-feedback`); unfixable CI after budget goes into one run-report comment. **No PR-body section.** Return structured status.
- Delegates in pipeline: comments → `ce-resolve-pr-feedback mode:pipeline`; CI → `ce-debug mode:pipeline`.

### 4. `lfg` — rewire step 9 (the consolidation)

- Replace the hand-rolled CI-watch/autofix loop (step 9) with `invoke ce-babysit-pr mode:pipeline <pr>`.
- **Retire both PR-body residual sections:** step 6's `## Residual Review Findings` and step 9's `## CI Failures Unresolved`. Both hold "no-thread-home" items (ce-code-review findings; unfixable CI), so they consolidate into **one run-report comment** posted at exit — not the PR body. The no-PR fallback (`docs/residual-review-findings/<sha>.md`) stays. Tracker-ticket filing (`tracker-defer.md`) stays and is linked from the comment.
- **Preserve** `lfg`'s guarantees: the no-remote skip, residual-durability ("make residuals durable, then exit" — now via open threads + the run-report comment/fallback doc), and the `<promise>DONE</promise>` exit.
- **Gains for free:** comments-first ordering, handling of review comments that arrive during the CI wait, `ce-debug`-quality diagnosis, claim→confirm dedup, `mergeStateStatus`-based readiness.
- **At `lfg` exit (step 10):** when an open PR exists, point the user to `/ce-babysit-pr <url>` for the ongoing *interactive* watch-through-review-to-merge — because pipeline mode stopped at "CI decided," not "merge-ready." This is the clean pipeline→interactive boundary.

### 5. `ce-commit-push-pr` — babysit default-ON (invert the offer)

The interactive *offer* has a real UX cost: it blocks after the PR opens ("Babysit? [Y/n]") — a user who flips windows during the ~30s PR-open finds it sitting unanswered. Invert it: in **interactive full workflow, auto-invoke `ce-babysit-pr` on the just-opened PR by default** (announce it in one line, don't block), and make *off* the explicit choice. This removes the dead-time entirely (a printed line doesn't block; a blocking prompt does).

- **`babysit:off` token** — per-invocation skip.
- **`auto_babysit: false`** in `.compound-engineering/config.local.yaml` — standing per-repo/user opt-out (mirrors the `pr_teaching_section` gate).
- Optional `babysit:<mode>` to force continuous/checkpoint.

**Hard-off cases (auto-detected — babysit does not fire, no flag needed):** `mode:pipeline` (the orchestrator owns it; `lfg` runs babysit itself), description-only / description-update modes (no new PR), no PR created / no remote, **a head branch you cannot push to** (someone else's PR — skip or observe-only), non-GitHub (babysit's own guard stops it). **Soft-degrade:** a checkpoint-only harness runs one tick + prints the resume command instead of a live loop.

**Fork PRs are NOT a hard-off** (this refines an earlier draft that skipped all forks). A fork-to-upstream PR — the common open-source flow — is drivable whenever you can push to its head branch, which is true for a PR this skill just pushed (you own the fork). Gate on **head-pushability**, not fork-ness: babysit reads PR state on the **base** repo (from the PR URL) and pushes fixes to the **head** repo (the fork). The deeper base/head-explicit handling inside `ce-babysit-pr`/`ce-debug`/`ce-resolve-pr-feedback` (and treating fork CI that awaits maintainer approval as a needs-human stop rather than spinning) is tracked separately as fork-support hardening.

Rationale: the autonomy that made this opt-in is already bounded — babysit **defers** divergent/product-decision changes (never silently alters intended behavior), acts via visible reversible commits, and is trivially disabled. Given that, the explicit opt-in was belt-and-suspenders; default-on with an easy off switch is the better trade. The off-cases are few and all detectable, so the inversion is safe.

## Sequencing (dependency order)

1. `ce-debug` `mode:pipeline` (unblocks babysit's CI path).
2. `ce-resolve-pr-feedback` pipeline note (small; independent).
3. `ce-babysit-pr` `mode:pipeline` (depends on 1 + 2).
4. `lfg` step-9 rewire (depends on 3).

Each step is independently testable; ship incrementally.

## Testing

- **`ce-debug` pipeline** (skill-eval + fixtures): a failing-test fixture → autonomously fixes + returns structured, **no prompt**; a product-decision-fix fixture → defers as residual, no prompt, no apply.
- **`ce-babysit-pr` pipeline** (fixtures with fake `gh`): CI settles green → exits; CI red past budget → `## Unresolved` written to PR body, exits; needs-human thread → residual, exits (does not wait).
- **`lfg`**: existing tests + verify the step-9 rewire delegates to babysit and preserves the no-remote skip. Full e2e needs a live PR (integration test).
- Reuse the `skill-eval` harness for behavioral checks (as done for babysit).

## Risks / scope guards

- **Nesting depth / cost:** `lfg → babysit → ce-debug → subagents`. Keep pipeline budgets tight; skip heavy quality tails in pipeline.
- **Non-convergence / runaway churn:** the round/time budgets above are a blunt cost floor, not a convergence detector. How the loop decides to *stop churning* (ping-pong, review-bot treadmill, whack-a-mole) is designed separately in `babysit-non-convergence-detection.md` — facts in babysit, judgment in the leaves, riding the `needs-human` channel.
- **Silent-drop risk:** a deferred residual MUST be durable and surfaced — test explicitly that nothing is dropped.
- **Don't regress interactive behavior:** pipeline is additive, gated by the `mode:pipeline` token; interactive paths unchanged.
- **Convergent vs divergent classification** is the judgment that matters most in `ce-debug`/`ce-resolve-pr-feedback` pipeline modes — mirror the existing intent-conflict tripwire bar (evidence-gated), and keep it from over-deferring routine fixes.
