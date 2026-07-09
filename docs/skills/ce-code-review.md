# `ce-code-review`

> Structured code review using tiered persona agents, confidence-gated findings, and a merge/dedup pipeline.

`ce-code-review` is the **deep code review** skill. It analyzes the diff (PR, branch, or current changes), selects the right reviewer personas for what was actually touched, dispatches them in parallel, then merges and deduplicates their findings into a single report. Each finding carries a severity (P0-P3), an autofix class (`gated_auto`, `manual`, `advisory`) that signals follow-up shape, and an owner. In interactive mode the review applies the safe, verified fixes itself and commits them when the working tree is clean (it never pushes); in `mode:agent` it reports and the caller applies.

The compound-engineering ideation chain is `/ce-ideate → /ce-brainstorm → /ce-plan → /ce-work`. `ce-code-review` is `/ce-work`'s **Tier 2 escalation** target — invoked automatically for sensitive surfaces, large diffs, or explicit deep-review requests, but also directly invocable any time you want a structured review of the current branch or a specific PR.

---

## TL;DR

| Question | Answer |
|----------|--------|
| What does it do? | Selects reviewer personas based on diff content, dispatches them in parallel, merges findings into one report with confidence gating and auto-fix routing |
| When to use it | Before opening a PR for sensitive/large work; explicit deep review requested; harness has no built-in `/review` |
| What it produces | A structured findings report; in interactive mode it also applies safe, verified fixes (an Applied section), committing them as a `fix(review):` commit when your tree is clean — or leaving them for your commit if it was dirty (it never pushes) |
| Modes | Interactive (default — applies safe fixes) and `mode:agent` (JSON; report-only, caller applies) |

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
- **Bounded dispatch with backpressure** — learns/respects the current harness's active-subagent limit, queues remaining reviewers, and treats capacity errors as retryable backpressure instead of failed review
- **Confidence-gated synthesis** — findings merge, dedupe, promote on cross-persona agreement, and route by autofix class
- **Severity scale (P0-P3) + autofix class** — separates urgency from action ownership
- **Two modes** — Interactive (default; applies safe verified fixes itself) and `mode:agent` (JSON machine handoff; report-only, the caller applies)
- **Caller-owned apply + Residual Work Gate** — in `mode:agent` the caller (e.g. `/ce-work`) applies fixes and runs the Residual Work Gate (accept / file tickets / continue / stop); in interactive mode the review commits its applied fixes on a clean tree, and it never pushes
- **Quick-review short-circuit** — defers to harness-native `/review` for light passes; multi-agent runs only when warranted

---

## What Makes It Novel

### 1. Diff-aware persona selection

A small config change triggers 6 reviewers (the 4 always-on + 2 CE always-on). A Rails auth feature with migrations might trigger 10. The skill decides which personas fit the diff:

- **Always-on (every review)** — `correctness-reviewer`, `testing-reviewer`, `maintainability-reviewer`, `project-standards-reviewer`, `agent-native-reviewer`, `learnings-researcher`
- **Cross-cutting conditional** — security, performance, API contract, data migrations, reliability, adversarial, previous-comments — each selected only when the diff touches its concern
- **Stack-specific conditional** — Julik frontend races, Swift/iOS — only when the matching runtime domain is touched. Structural quality (complexity deletion, 1k-line regressions, spaghetti) lives in the always-on maintainability persona.
- **CE conditional (migrations)** — `deployment-verification-agent` for risky migration diffs; schema drift and migration safety are handled by the `data-migration` persona

Persona selection is agent judgment, not keyword matching. Instruction-prose files (Markdown skills, JSON schemas) are product code but skip runtime-focused reviewers (adversarial, races) — they wouldn't apply. The exception is a **silent-pass verification mechanism** (a CI/CD gate, build/deploy step, coverage/lint gate, or test harness/mock that could mask production): even as a small config diff it gets the adversarial + cross-model lens, because its risk is fidelity — going green while the real thing is red — not blast radius.

### 2. Severity (P0-P3) and autofix class are orthogonal

Severity answers **urgency** (P0=critical breakage, P3=user discretion). The autofix class is **signal** about follow-up shape (not apply permission):

- `gated_auto` → a concrete `suggested_fix` exists — a clear candidate to apply
- `manual` → actionable work that needs design input or a handoff
- `advisory` → report-only output (learnings, rollout notes, residual risk)

Synthesis owns the final route. Persona-provided routing metadata is input, not the last word — disagreements default to the more conservative route. Whether a finding actually gets applied is a judgment call (interactive review's Stage 5c, or the caller in `mode:agent`), not a function of the class.

### 3. Two modes — human view and machine handoff

| Mode | When | Behavior |
|------|------|----------|
| **Interactive** _(default)_ | Direct user invocation | Markdown report; the review applies the safe, verified fixes itself (Stage 5c → Applied section), pushes back on findings it disagrees with, and commits them as an isolated `fix(review):` commit when your tree was clean (or leaves them for your commit if it was dirty). Never pushes |
| **`mode:agent`** | `mode:agent` (alias `mode:headless`) | One JSON object; report-only — the review mutates nothing and the caller (e.g. `/ce-work`) applies findings and owns the Residual Work Gate |

The skill never switches branches: a PR/branch argument selects review *scope* (diffed without checkout), not permission to mutate. Interactive apply edits the current checkout in place; to review the current checkout against another ref, pass `base:<ref>`.

### 4. Quick-review short-circuit

When the user asks for a "quick", "fast", or "light" review, the skill defers to the harness-native code review (e.g., `/review` in Claude Code) instead of dispatching the multi-agent pipeline. This respects intent — sometimes the right tool is the lighter one. Programmatic callers (`mode:agent`) bypass the short-circuit and always run the full pipeline.

### 5. Synthesis pipeline — merge, dedupe, promote, route

After all dispatched personas return, synthesis:

- Validates each finding against the schema
- Anchors to the actual diff (drops findings about lines that don't exist or aren't in scope)
- Deduplicates across personas (same issue surfaced by multiple reviewers)
- **Promotes confidence on cross-persona agreement** (two reviewers spotting the same issue raises priority)
- Resolves contradictions (different personas disagree about what to do)
- Routes by tier — applied fixes, gated/manual, FYI

The output is one report with calibrated severity, evidence quotes, and explicit ownership — not a flat list of every reviewer's raw output.

Synthesis also builds **thematic triage groups** (`grouping:auto`, the default): when findings span distinct concerns, related ones are grouped under a short theme — shared root cause, overlapping fix path, one design decision resolving several findings — so a 20-finding review reads as a handful of themes instead of 20 independent items. Groups are a triage lens, not a restructure: findings keep their stable `#`s and severity tables, groups reference them (`#2, #3`), and the `mode:agent` JSON carries the same groups in a `triage_groups` field — a lens over every finding, not an apply queue, so a caller batches by theme only after filtering each group to the actionable subset. Pass `grouping:off` for a flat report or `grouping:always` to group even small reviews.

### 6. Plan discovery for requirements verification

When the diff has an associated plan (`docs/plans/*.md`), the skill discovers it (via `plan:` argument, PR body link, or auto-discovery from branch name) and reads its Requirements section + Implementation Units. Synthesis then verifies the diff actually satisfies those requirements — catching the case where the code looks fine but doesn't match what the plan said it should do.

### 7. Residual Work Gate

When autofix mode runs and the in-skill fixer can't resolve everything, the residual work doesn't just disappear into chat. The Residual Actionable Work summary lists each unresolved finding with stable numbering, severity, file:line, title, and autofix class. Callers (e.g., `/ce-work` Phase 3.4) read this summary and present user options: apply now, file tickets, accept with durable sink, or stop.

### 8. Protected artifacts

Compound-engineering pipeline artifacts (`docs/brainstorms/*` legacy/evidence artifacts, `docs/plans/*.{md,html}` unified plans, `docs/solutions/*.md`) are protected — reviewers' findings to delete or gitignore them are discarded during synthesis. These are decision artifacts the pipeline depends on; reviewers shouldn't garbage-collect them.

---

## Quick Example

You invoke `/ce-code-review` on a feature branch with a Rails auth change that includes a database migration.

The skill detects you're on a feature branch (no PR yet), resolves the base from `origin/HEAD` (or PR metadata when an open PR exists), and computes the diff. Stage 2 reads commit messages and writes a 2-3 line intent summary. Stage 2b auto-discovers the plan in `docs/plans/` from the branch name, classifies readiness, and reads Product Contract Requirements plus implementation U-IDs when the artifact is implementation-ready.

Stage 3 selects reviewers: the 6 always-on, plus security (auth touched), reliability (background job for token cleanup), data-migration (migration file present), and deployment-verification agent when the migration is risky. Seven or eight reviewers total, dispatched in parallel.

After all return, synthesis merges 23 raw findings into 14 distinct findings. Three are clean, reversible fixes (a typo, a rename, dead-code removal) the review applies and verifies itself (Stage 5c → Applied section). Six are `gated_auto` for the auth surface — concrete candidates the review applies, flagging them prominently as green-but-unverifiable (auth) for your review. Two are `manual` (deployment Go/No-Go checklist items). Three are `advisory` (FYI notes). Each finding has anchored evidence and a stable number.

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

- **`/ce-work` Phase 3.3** — escalates to `ce-code-review mode:agent` for sensitive surfaces, ≥400 lines + diffuse, ≥1,000 lines, or explicit thorough-review requests; ce-work then applies the findings
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

Concurrent use note: `mode:agent` is report-only and never mutates, so it's safe alongside browser tests on the same checkout. Interactive mode may apply fixes to the working tree, so avoid running it against a checkout another agent is actively using.

---

## Reference

| Argument | Effect |
|----------|--------|
| _(empty)_ | Reviews current branch (detects base from `origin/HEAD` or PR metadata) |
| `<PR number or URL>` | Reviews that PR without checking it out (reads metadata + remote diff) |
| `<branch name>` | Reviews that branch without checking it out (remote/local ref diff) |
| `base:<sha-or-ref>` | Skips scope detection; reviews current checkout against that ref |
| `plan:<path>` | Loads the plan for requirements verification |
| `mode:agent` | JSON machine handoff; report-only (the caller applies). `mode:headless` is a deprecated alias; `mode:report-only` is ignored |
| `grouping:auto` / `grouping:off` / `grouping:always` | Thematic triage grouping of findings (default `auto`: group when findings span distinct concerns). Presentation only — never changes reviewer selection, merge logic, or apply behavior |

Conflicting mode flags (or conflicting grouping flags) stop execution with an error. Combining `base:` with a PR/branch target also errors — pass one or the other.

---

## FAQ

**Why not just use the harness's built-in `/review`?**
Use it when it's the right tool — the quick-review short-circuit defers to it explicitly. `ce-code-review` is for cases where you want diff-aware persona selection, structured findings with calibrated severity, autofix routing, and residual work handling. It's the heavier tool; reach for it when the work warrants.

**How does it decide which personas to dispatch?**
Agent judgment over the actual diff — not keyword matching. The 4 always-on + 2 CE always-on personas run for every review. Cross-cutting and stack-specific personas are added when their concern is touched (e.g., security if auth files changed; `data-migration-reviewer` when migration or schema dump files are present). Instruction-prose files skip runtime-focused reviewers (adversarial, races) — except a silent-pass verification mechanism (CI/CD gate, build/deploy step, coverage/lint gate, test harness/mock), which gets adversarial + the cross-model pass regardless of size.

**What's the difference between interactive (default) and `mode:agent`?**
Interactive is the human-facing mode: a markdown report, and the review applies the safe, verified fixes itself (an Applied section) and commits them when your tree is clean (leaving them for your commit if it was dirty); it never pushes. `mode:agent` is the machine handoff: one JSON object, report-only — the review mutates nothing and the caller (e.g. `/ce-work`) applies findings on its own terms. `mode:headless` is a deprecated alias for `mode:agent`.

**What's the Residual Work Gate?**
A caller-owned step (not part of the review skill): in `mode:agent`, the caller (typically `/ce-work`) applies what it can, then presents the findings it didn't apply and asks the user: apply now, file tickets, accept with durable sink, or stop. "Accept" requires a real durable record (Known Residuals in PR description, or `docs/residual-review-findings/<sha>.md`) — findings can't disappear into chat.

**Why does it never switch the checkout?**
The skill never runs `git checkout`/`switch` — passing a PR/branch selects review *scope*, not permission to mutate the tree (it diffs remote/local refs without checking out). Interactive mode may *apply* fixes to the current checkout (a reversible edit), but it never switches branches. To review the current checkout against a different ref, pass `base:<ref>`.

**Can it run concurrently with browser tests?**
`mode:agent` is report-only and never mutates, so it's safe alongside concurrent tests. Interactive mode may apply fixes to the working tree, so avoid running it against a checkout another agent is actively using.

**Does it support non-software work?**
No — the skill is tightly coupled to git, code reviewers, and PR contexts. For docs (requirements, plans), use `/ce-doc-review` instead.

---

## See Also

- [`ce-work`](./ce-work.md) — primary upstream caller; escalates to `ce-code-review` at Phase 3.3
- [`ce-doc-review`](./ce-doc-review.md) — sibling skill for documents (requirements, plans), not code
- [`ce-debug`](./ce-debug.md) — for fixing bugs found during review, when root-cause investigation matters
- [`ce-resolve-pr-feedback`](./ce-resolve-pr-feedback.md) — handles incoming reviewer comments after a PR is open
- [`ce-simplify-code`](./ce-simplify-code.md) — invoked by `ce-work` before review; complement, not substitute
