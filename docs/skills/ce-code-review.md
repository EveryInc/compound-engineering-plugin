# `ce-code-review`

> Structured code review using tiered persona agents, confidence-gated findings, and a merge/dedup pipeline.

`ce-code-review` is the **deep code review** skill. It analyzes the diff (PR, branch, or current changes), selects the right reviewer personas for what was actually touched, dispatches them in parallel, then merges and deduplicates their findings into a single report. Each finding carries a severity (P0-P3), an autofix class (`safe_auto`, `gated_auto`, `manual`, `advisory`), and an owner that determines what happens next. Safe deterministic fixes can be auto-applied; everything else routes through structured user decisions.

The compound-engineering ideation chain is `/ce-ideate → /ce-brainstorm → /ce-plan → /ce-work`. `ce-code-review` is `/ce-work`'s **Tier 2 escalation** target — invoked automatically for sensitive surfaces, large diffs, or explicit deep-review requests, but also directly invocable any time you want a structured review of the current branch or a specific PR.

---

## TL;DR

| Question | Answer |
|----------|--------|
| What does it do? | Selects reviewer personas based on diff content, dispatches them in parallel, merges findings into one report with confidence gating and auto-fix routing |
| When to use it | Before opening a PR for sensitive/large work; explicit deep review requested; harness has no built-in `/review` |
| What it produces | A structured findings report — interactive review, applied fixes, residual work routed via the gate |
| Modes | Interactive (default), Autofix, Report-only, Headless |

---

## The Problem

Generalist code review prompts collapse in predictable ways:

- **Surface-level findings** — "consider adding tests" without naming what to test for
- **Wrong findings for the diff** — security feedback on a doc-only change, performance feedback on a typo fix
- **No severity calibration** — every finding presented as critical, drowning the actual P0s
- **No confidence calibration** — speculative "could be a bug" presented identically to verified defects
- **One pass at one model's reasoning** — a single reviewer biased toward whatever it was last trained on most heavily
- **No structured follow-through** — findings end up in chat; no record, no fix queue, no residual handling
- **Mutating actions on the wrong checkout** — running review on a shared checkout while another agent runs tests in parallel produces undefined outcomes

## The Solution

`ce-code-review` runs review as a structured pipeline with explicit gates:

- **Diff-aware persona selection** — 4 always-on reviewers + 2 CE always-on agents, plus cross-cutting and stack-specific personas chosen for what the diff actually touches
- **Parallel persona dispatch** — each reviewer focuses on its lens; results return in parallel
- **Confidence-gated synthesis** — findings merge, dedupe, promote on cross-persona agreement, and route by autofix class
- **Severity scale (P0-P3) + autofix class** — separates urgency from action ownership
- **Four modes** — Interactive, Autofix, Report-only, Headless — for different invocation contexts
- **Residual Work Gate** — when autofix doesn't resolve everything, structured options for accept / file tickets / continue / stop
- **Quick-review short-circuit** — defers to harness-native `/review` for light passes; multi-agent runs only when warranted

---

## What Makes It Novel

### 1. Diff-aware persona selection

A small config change triggers 6 reviewers (the 4 always-on + 2 CE always-on). A Rails auth feature with migrations might trigger 10. The skill decides which personas fit the diff:

- **Always-on (every review)** — `ce-correctness-reviewer`, `ce-testing-reviewer`, `ce-maintainability-reviewer`, `ce-project-standards-reviewer`, `ce-agent-native-reviewer`, `ce-learnings-researcher`
- **Cross-cutting conditional** — security, performance, API contract, data migrations, reliability, adversarial, previous-comments — each selected only when the diff touches its concern
- **Stack-specific conditional** — DHH-Rails, Kieran-Rails / Python / TypeScript, Julik frontend races, Swift/iOS — only when the matching stack is present
- **CE conditional (migrations)** — schema-drift detector, deployment-verification agent for diffs with migration files

Persona selection is agent judgment, not keyword matching. Instruction-prose files (Markdown skills, JSON schemas) are product code but skip runtime-focused reviewers (adversarial, races) — they wouldn't apply.

### 2. Severity (P0-P3) and autofix class are orthogonal

Severity answers **urgency** (P0=critical breakage, P3=user discretion). The autofix class answers **who acts next**:

- `safe_auto` → `review-fixer` enters the in-skill fixer queue automatically (only when mode allows mutation)
- `gated_auto` → fix exists but changes behavior, contracts, or sensitive boundaries — routes to a downstream resolver or human
- `manual` → actionable work for handoff
- `advisory` → report-only output (learnings, rollout notes, residual risk)

Synthesis owns the final route. Persona-provided routing metadata is input, not the last word — disagreements default to the more conservative route.

### 3. Four modes — different invocation contexts

| Mode | When | Behavior |
|------|------|----------|
| **Interactive** _(default)_ | Direct user invocation | Apply `safe_auto` fixes, ask policy decisions on `gated_auto`/`manual`, optionally continue into next steps |
| **Autofix** | `mode:autofix` | Apply `safe_auto` only; no user prompts; emit Residual Actionable Work summary for the caller |
| **Report-only** | `mode:report-only` | Strictly read-only; safe to run concurrently with browser tests on the same checkout |
| **Headless** | `mode:headless` | Programmatic mode for skill-to-skill; structured text output with all non-auto findings preserved |

Modes that mutate the checkout refuse to switch branches on a shared checkout — they require an isolated worktree or `base:<ref>` to review without checkout-switching.

### 4. Quick-review short-circuit

When the user asks for a "quick", "fast", or "light" review, the skill defers to the harness-native code review (e.g., `/review` in Claude Code) instead of dispatching the multi-agent pipeline. This respects intent — sometimes the right tool is the lighter one. Programmatic callers (autofix / report-only / headless) bypass the short-circuit and always run the full pipeline.

### 5. Synthesis pipeline — merge, dedupe, promote, route

After all dispatched personas return, synthesis:

- Validates each finding against the schema
- Anchors to the actual diff (drops findings about lines that don't exist or aren't in scope)
- Deduplicates across personas (same issue surfaced by multiple reviewers)
- **Promotes confidence on cross-persona agreement** (two reviewers spotting the same issue raises priority)
- Resolves contradictions (different personas disagree about what to do)
- Auto-promotes safe-auto candidates that meet the bar
- Routes by tier — applied fixes, gated/manual, FYI

The output is one report with calibrated severity, evidence quotes, and explicit ownership — not a flat list of every reviewer's raw output.

### 6. Plan discovery for requirements verification

When the diff has an associated plan (`docs/plans/*.md`), the skill discovers it (via `plan:` argument, PR body link, or auto-discovery from branch name) and reads its Requirements section + Implementation Units. Synthesis then verifies the diff actually satisfies those requirements — catching the case where the code looks fine but doesn't match what the plan said it should do.

### 7. Residual Work Gate

When autofix mode runs and the in-skill fixer can't resolve everything, the residual work doesn't just disappear into chat. The Residual Actionable Work summary lists each unresolved finding with stable numbering, severity, file:line, title, and autofix class. Callers (e.g., `/ce-work` Phase 3.4) read this summary and present user options: apply now, file tickets, accept with durable sink, or stop.

### 8. Protected artifacts

Compound-engineering pipeline artifacts (`docs/brainstorms/*`, `docs/plans/*.md`, `docs/solutions/*.md`) are protected — reviewers' findings to delete or gitignore them are discarded during synthesis. These are decision artifacts the pipeline depends on; reviewers shouldn't garbage-collect them.

---

## Quick Example

You invoke `/ce-code-review` on a feature branch with a Rails auth change that includes a database migration.

The skill detects you're on a feature branch (no PR yet), resolves the base via `scripts/resolve-base.sh`, and computes the diff. Stage 2 reads commit messages and writes a 2-3 line intent summary. Stage 2b auto-discovers the plan in `docs/plans/` from the branch name and reads its Requirements (R1-R8, U1-U6).

Stage 3 selects reviewers: the 6 always-on, plus security (auth touched), reliability (background job for token cleanup), data migrations (migration file present), kieran-rails + dhh-rails (stack), schema-drift detector and deployment-verification agent (CE migration conditionals). Ten reviewers total, dispatched in parallel.

After all return, synthesis merges 23 raw findings into 14 distinct findings. Three are `safe_auto` (typo, rename, dead code) and applied automatically. Six are `gated_auto` for the auth surface — routed into the interactive walk-through. Two are `manual` (deployment Go/No-Go checklist items). Three are `advisory` (FYI notes). Each finding has anchored evidence and a stable number.

You walk through the 6 gated findings, apply 4, defer 1 to follow-up via the tracker, and decline 1 with a cited harm. Final validation runs; the report is saved.

---

## When to Reach For It

Reach for `ce-code-review` when:

- You're about to open a PR for sensitive or large work (auth, payments, migrations, public APIs)
- Your harness lacks a built-in `/review` and you still want a real review
- You want structured handling of residual work, not just findings dumped in chat
- You explicitly want a deeper, multi-persona pass (e.g., "review this thoroughly")
- Another skill is escalating to it (`/ce-work` Phase 3.3 Tier 2, `/ce-optimize` Phase 4.3)

Skip `ce-code-review` when:

- You want a quick light review — your harness's built-in `/review` is right; the short-circuit handles this
- The change is trivial (typo, formatting, dependency bump) — Tier 1 review is sufficient
- You want to fix bugs you find, not review code → use `/ce-debug`

---

## Use as Part of the Workflow

`ce-code-review` is invoked from multiple skills as the deep-review path:

- **`/ce-work` Phase 3.3** — escalates to `ce-code-review mode:autofix` for sensitive surfaces, ≥400 lines + diffuse, ≥1,000 lines, or explicit thorough-review requests
- **`/ce-work` Phase 3.4 Residual Work Gate** — reads the Residual Actionable Work summary `ce-code-review` returned and presents user options
- **`/ce-optimize` Phase 4.3** — runs against the cumulative optimization branch diff before merging
- **`/ce-doc-review`** — sibling skill for docs (requirements, plans), not code

Tier 1 (harness-native `/review`) handles most cases; `ce-code-review` is the Tier 2 escalation.

---

## Use Standalone

The skill works directly from any starting state:

- **Current branch** — `/ce-code-review`
- **Specific PR** — `/ce-code-review 1234` or `/ce-code-review <PR URL>`
- **Specific branch** — `/ce-code-review feat/notification-mute`
- **With base ref** — `/ce-code-review base:abc1234` or `base:origin/main` (skips scope detection; reviews against that ref)
- **With plan** — `/ce-code-review plan:docs/plans/.../plan.md` for explicit requirements verification

Concurrent use note: `mode:report-only` is the only mode safe to run alongside browser tests on the same checkout. Other modes mutate (apply `safe_auto` fixes); they need isolated checkouts when running concurrently.

---

## Reference

| Argument | Effect |
|----------|--------|
| _(empty)_ | Reviews current branch (uses `scripts/resolve-base.sh` to detect base) |
| `<PR number or URL>` | Reviews that PR (checks out, fetches metadata, reviews against PR base) |
| `<branch name>` | Checks out and reviews against detected base |
| `base:<sha-or-ref>` | Skips scope detection; reviews current checkout against that ref |
| `plan:<path>` | Loads the plan for requirements verification |
| `mode:autofix` | No prompts; apply `safe_auto` only; emit Residual Actionable Work summary |
| `mode:report-only` | Strictly read-only; safe with concurrent browser tests |
| `mode:headless` | Skill-to-skill; structured text output |

Conflicting mode flags stop execution with an error. Combining `base:` with a PR/branch target also errors — pass one or the other.

---

## FAQ

**Why not just use the harness's built-in `/review`?**
Use it when it's the right tool — the quick-review short-circuit defers to it explicitly. `ce-code-review` is for cases where you want diff-aware persona selection, structured findings with calibrated severity, autofix routing, and residual work handling. It's the heavier tool; reach for it when the work warrants.

**How does it decide which personas to dispatch?**
Agent judgment over the actual diff — not keyword matching. The 4 always-on + 2 CE always-on personas run for every review. Cross-cutting and stack-specific personas are added when their concern is touched (e.g., security if auth files changed; data-migrations-reviewer if migration files are present). Instruction-prose files skip runtime-focused reviewers (adversarial, races).

**What's the difference between Autofix and Headless?**
Autofix applies `safe_auto` fixes silently and emits a Residual Actionable Work summary for the caller to route. Headless is similar but returns *all* findings as structured text (including `safe_auto`) and never enters bounded re-review rounds. Headless is for programmatic skill-to-skill invocation; Autofix is for orchestrators that own the residual-handling UI.

**What's the Residual Work Gate?**
The structured presentation of findings the autofix pass couldn't resolve. The caller (typically `/ce-work` Phase 3.4) reads the summary and asks the user: apply now, file tickets, accept with durable sink, or stop. "Accept" requires a real durable record (Known Residuals in PR description, or `docs/residual-review-findings/<sha>.md`) — findings can't disappear into chat.

**Why does it refuse to switch the shared checkout in some modes?**
Because mutating modes (Interactive, Autofix, Headless) write files. Switching the shared checkout while another agent is running tests or holding state produces undefined outcomes. The skill instead asks for `base:<ref>` (review the current checkout against a different ref) or an isolated worktree.

**Can it run concurrently with browser tests?**
Only `mode:report-only`. The other modes mutate, so they need isolated checkouts.

**Does it support non-software work?**
No — the skill is tightly coupled to git, code reviewers, and PR contexts. For docs (requirements, plans), use `/ce-doc-review` instead.

---

## See Also

- [`ce-work`](./ce-work.md) — primary upstream caller; escalates to `ce-code-review` at Phase 3.3
- [`ce-doc-review`](./ce-doc-review.md) — sibling skill for documents (requirements, plans), not code
- [`ce-debug`](./ce-debug.md) — for fixing bugs found during review, when root-cause investigation matters
- [`ce-resolve-pr-feedback`](./ce-resolve-pr-feedback.md) — handles incoming reviewer comments after a PR is open
- [`ce-simplify-code`](./ce-simplify-code.md) — invoked by `ce-work` before review; complement, not substitute
