# `ce-code-review`

> Structured code review using tiered persona agents, confidence-gated findings, and a merge/dedup pipeline.

`ce-code-review` is the **deep code review** skill. It analyzes the diff (PR, branch, or current changes), selects the right reviewer personas for what was actually touched, dispatches them in parallel, then merges and deduplicates their findings into a single report. Each finding carries a severity (P0-P3), an autofix class (`gated_auto`, `manual`, `advisory`) that signals follow-up shape, and an owner. Review is report-only by default. Local fixes require `apply:local` or an explicit request to apply the review's findings; `mode:agent` always reports and leaves mutation to the caller.

The compound-engineering ideation chain is `/ce-ideate → /ce-brainstorm → /ce-plan → /ce-work`. `ce-code-review` is `/ce-work`'s **Tier 2 escalation** target — invoked automatically for sensitive surfaces, large diffs, or explicit deep-review requests, but also directly invocable any time you want a structured review of the current branch or a specific PR.

---

## TL;DR

| Question | Answer |
|----------|--------|
| What does it do? | Selects reviewer personas based on diff content, dispatches them in parallel, merges findings into one report with confidence gating and auto-fix routing |
| When to use it | Before opening a PR for sensitive/large work; explicit deep review requested; harness has no built-in `/review` |
| What it produces | A structured findings report; with explicit local-apply authority it can also apply verified fixes and add an Applied section (it never pushes) |
| Modes | Markdown report (default) and `mode:agent` JSON handoff; both are report-only unless local apply is separately authorized |

---

## Example invocations

```text
# Deep-review the current branch; relevant plan and session context are discovered automatically
/ce-code-review

# Review a specific PR without checking it out
/ce-code-review https://github.com/acme/widgets/pull/1234

# Review the current branch and fix verified findings in this checkout
/ce-code-review review this branch and fix eligible findings locally

# Ask for a lighter pass when the full multi-agent review is unnecessary
/ce-code-review give this branch a quick review
```

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

- **Diff-aware persona selection** — correctness + project-standards form the core; every other reviewer is gated by the surface actually touched
- **Parallel persona dispatch** — each reviewer focuses on its lens; results return in parallel
- **Bounded dispatch with backpressure** — learns/respects the current harness's active-subagent limit, queues remaining reviewers, and treats capacity errors as retryable backpressure instead of failed review
- **Confidence-gated synthesis** — findings merge, dedupe, promote on cross-persona agreement, and route by autofix class
- **Severity scale (P0-P3) + autofix class** — separates urgency from action ownership
- **Separate presentation and authority** — default markdown and `mode:agent` JSON are report-only; `apply:local` or an explicit apply request grants local mutation authority
- **Caller-owned apply + Residual Work Gate** — in `mode:agent` the caller (e.g. `/ce-work`) applies fixes and runs the Residual Work Gate (accept / file tickets / continue / stop)
- **Quick-review short-circuit** — defers to harness-native `/review` for light passes; multi-agent runs only when warranted

---

## What Makes It Novel

### 1. Diff-aware persona selection

A small low-risk change runs the two-person core. A Rails auth feature with migrations adds the relevant domain lenses. The skill decides which personas fit the diff:

- **Core (every review)** — `correctness-reviewer`, `project-standards-reviewer`
- **Generic conditional** — testing for changed tests/harnesses or meaningful runtime behavior with no corresponding test work; maintainability for large or structural work; agent-native for agent-facing surfaces; learnings only when an existing `docs/solutions/` corpus has plausible matches
- **Cross-cutting conditional** — security, performance, API contract, data migrations, reliability, adversarial, previous-comments — each selected only when the diff touches its concern
- **Stack-specific conditional** — Julik frontend races, Swift/iOS — only when the matching runtime domain is touched. Structural quality (complexity deletion, 1k-line regressions, spaghetti) lives in the conditional maintainability persona.
- **CE conditional (migrations)** — `deployment-verification-agent` for risky migration diffs; schema drift and migration safety are handled by the `data-migration` persona

Persona selection is agent judgment, not keyword matching. Instruction-prose files (Markdown skills, JSON schemas) are product code but skip runtime-focused reviewers (adversarial, races) — they wouldn't apply. The exception is a **silent-pass verification mechanism** (a CI/CD gate, build/deploy step, coverage/lint gate, or test harness/mock that could mask production): even as a small config diff it gets the adversarial + cross-model lens, because its risk is fidelity — going green while the real thing is red — not blast radius.

### 1b. Cross-model adversarial pass

When adversarial is selected and the working tree is the reviewed head (`local-aligned` / standalone), the same adversarial brief also runs through **one different model provider than the host** in a separate read-only process. Agreement between the in-process `adversarial` persona and the peer (`adversarial-<provider>`) is the strongest promotion signal in synthesis.

**Which target runs the peer** is auto-chosen and overridable — the same independence system as `ce-doc-review`, scoped to the adversarial lens only. Host harness and serving family are tracked separately. Preference order is conversation → `cross_model_peer:` → active project instructions → `codex → claude → grok → composer`; explicit `Cursor` means `cursor-agent` using its configured default/Auto model, while `Composer` means a Composer model through Cursor. Grok prefers its native CLI and may use a sanctioned Grok-via-Cursor route. Cursor Auto does not count as independent agreement unless its serving family is verified different from the host. See the [configuration reference](./configuration.md) for the shared local-config contract.

Declared mappings run first. If a CLI rejects an obsolete or incompatible adapter default, the skill may discover the closest compatible equivalent within the same target/family and hard read-only, host-exclusion, authority, and egress boundaries. It discloses the substitution and actual route; an explicit user model or newly receiving intermediary never changes silently, and recipient-changing retry returns to the host for sanction. The pass stays detached and non-blocking, and a second target remains opt-in (`CROSS_MODEL_MAX_PEERS=2`).

This shares the provider/route kernel with `ce-doc-review` (parity-tested in CI) but keeps code-review's product scope: adversarial-only, diff/work-tree delivery, not doc-review's judgment trio or whole-doc sweep.

Large diffs stay on the same single-peer route without being serialized into one enormous prompt. The orchestrator sends a compact semantic review map — intent, material risk divisions, generated-tree treatment, and cross-division interactions — while the worker keeps the exact diff outside the prompt as a private, selectively readable artifact. Deterministic code never invents risk groups or cuts semantic shards; the adversarial agent works within the orchestrator's divisions and narrows its reads again when needed.

### 2. Severity (P0-P3) and autofix class are orthogonal

Severity answers **urgency** (P0=critical breakage, P3=user discretion). The autofix class is **signal** about follow-up shape (not apply permission):

- `gated_auto` → a concrete `suggested_fix` exists — a clear candidate to apply
- `manual` → actionable work that needs design input or a handoff
- `advisory` → report-only output (learnings, rollout notes, residual risk)

Synthesis owns the final route. Persona-provided routing metadata is input, not the last word — disagreements default to the more conservative route. Whether a finding actually gets applied is a judgment call after apply authority exists, not a function of the class.

### 3. Presentation and apply authority are separate

| Mode | When | Behavior |
|------|------|----------|
| **Default markdown** | Direct user invocation | Report-only markdown with stable findings and an actionable summary |
| **`mode:agent`** | `mode:agent` (alias `mode:headless`) | One JSON object; report-only — the review mutates nothing and the caller (e.g. `/ce-work`) applies findings and owns the Residual Work Gate |
| **Explicit local apply** | Add `apply:local`, or explicitly ask the invoked review to apply/fix its findings | Keeps markdown presentation; Stage 5c may apply verified fixes and commit them when the pre-review tree was clean. Never pushes |

The skill never switches branches: a PR/branch argument selects review *scope* (diffed without checkout), not permission to mutate. Explicit local apply edits the current checkout in place; to review the current checkout against another ref, pass `base:<ref>`.

### 4. Quick-review short-circuit

When the user asks for a "quick", "fast", or "light" review, the skill defers to the harness-native code review (e.g., `/review` in Claude Code) instead of dispatching the multi-agent pipeline. This respects intent — sometimes the right tool is the lighter one. Programmatic callers (`mode:agent`) bypass the short-circuit and always run the full pipeline.

### 5. Synthesis pipeline — merge, dedupe, promote, route

After all dispatched personas return, synthesis:

- Validates each finding against the schema
- Anchors to the actual diff (drops findings about lines that don't exist or aren't in scope)
- Deduplicates across personas (same issue surfaced by multiple reviewers)
- **Promotes confidence on cross-persona agreement** (two reviewers spotting the same issue raises priority)
- Resolves contradictions (different personas disagree about what to do)
- Routes by tier — gated/manual and report-only; an explicitly authorized local-apply run may additionally apply verified findings

The output is one report with calibrated severity, evidence quotes, and explicit ownership — not a flat list of every reviewer's raw output. When a finding's judgment depends on line history (pre-existing vs this-diff, intentional design, or high-severity confidence that needs authorship/age), evidence is expected to include one concise git provenance line (short hash, author, subject/date) — never a full-file blame dump, and never when the finding is already justified from the diff alone.

Synthesis also builds **thematic triage groups** (`grouping:auto`, the default): when findings span distinct concerns, related ones are grouped under a short theme — shared root cause, overlapping fix path, one design decision resolving several findings — so a 20-finding review reads as a handful of themes instead of 20 independent items. Groups are a triage lens, not a restructure: findings keep their stable `#`s and severity tables, groups reference them (`#2, #3`), and the `mode:agent` JSON carries the same groups in a `triage_groups` field — a lens over every finding, not an apply queue, so a caller batches by theme only after filtering each group to the actionable subset. Pass `grouping:off` for a flat report or `grouping:always` to group even small reviews.

### 6. Plan discovery for requirements verification

When the diff has an associated plan (`docs/plans/*.md`), the skill discovers it (via `plan:` argument, PR body link, or auto-discovery from branch name) and reads its Requirements section + Implementation Units. Synthesis then verifies the diff actually satisfies those requirements — catching the case where the code looks fine but doesn't match what the plan said it should do.

### 7. Residual Work Gate

Actionable work does not disappear into chat. The Residual Actionable Work summary lists each unresolved finding with stable numbering, severity, file:line, title, and autofix class. Callers (e.g., `/ce-work` Phase 3.4) read this summary after their own apply pass and present user options: apply now, file tickets, accept with durable sink, or stop. A bare review reports the same actionable set without applying it.

### 8. Protected artifacts

Compound-engineering pipeline artifacts (`docs/brainstorms/*` legacy/evidence artifacts, `docs/plans/*.{md,html}` unified plans, `docs/solutions/*.md`) are protected — reviewers' findings to delete or gitignore them are discarded during synthesis. These are decision artifacts the pipeline depends on; reviewers shouldn't garbage-collect them.

### 9. Settled-decision triage — preference versus defect

When the discovered plan carries `session-settled:` KTDs, synthesis routes a finding that merely prefers a different approach to the report-only queue with a `settled_conflict` stamp naming the KTD — including when local apply was explicitly authorized, so a decision the user already made is never gate-dropped for reviewer taste. A real defect inside a settled approach keeps its full severity, and evidence that a settled decision cannot work is surfaced prominently (so an upstream pipeline gate can halt on it). Reviewers themselves stay blind to the annotations — they're excluded from reviewer bundles and the intent summary, including the cross-model adversarial pass — and the orchestrator triages post-hoc, so no lens is anchored by knowing a choice was already blessed.

---

## Quick Example

You invoke `/ce-code-review` on a feature branch with a Rails auth change that includes a database migration.

The skill detects you're on a feature branch (no PR yet), resolves the base from `origin/HEAD` (or PR metadata when an open PR exists), and computes the diff. Stage 2 reads commit messages and writes a 2-3 line intent summary. Stage 2b auto-discovers the plan in `docs/plans/` from the branch name, classifies readiness, and reads Product Contract Requirements plus implementation U-IDs when the artifact is implementation-ready.

Stage 3 selects the correctness and project-standards core, plus testing if the migration changes test or harness code or changes meaningful runtime behavior without corresponding test work, security (auth touched), reliability (background job for token cleanup), data-migration (migration file present), and deployment-verification when the migration is risky. Only the applicable reviewers are dispatched in parallel.

After all return, synthesis merges the raw findings into a smaller distinct set. Several are `gated_auto` candidates for the caller, two are `manual` deployment decisions, and the rest are advisory. Each finding has anchored evidence and a stable number. Because this was a bare invocation, the review reports them without changing the checkout.

You can then apply selected findings yourself, hand the JSON report to `/ce-work`, or rerun with explicit local-apply authority. Pipeline callers apply what they can and route unresolved work through the Residual Work Gate.

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

- **Current branch (report-only)** — `/ce-code-review`
- **Current branch and apply verified findings** — `/ce-code-review apply:local`
- **Specific PR** — `/ce-code-review 1234` or `/ce-code-review <PR URL>`
- **Specific branch** — `/ce-code-review feat/notification-mute`
- **With base ref** — `/ce-code-review base:abc1234` or `base:origin/main` (skips scope detection; reviews against that ref)
- **With plan** — `/ce-code-review plan:docs/plans/.../plan.md` for explicit requirements verification

Concurrent use note: bare and `mode:agent` reviews are report-only and safe alongside browser tests on the same checkout. Do not run an explicitly authorized local-apply review against a checkout another agent is actively using.

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
| `apply:local` | Explicitly authorize verified local fixes; conflicts with `mode:agent` |
| `grouping:auto` / `grouping:off` / `grouping:always` | Thematic triage grouping of findings (default `auto`: group when findings span distinct concerns). Presentation only — never changes reviewer selection, merge logic, or apply behavior |

Conflicting mode flags (or conflicting grouping flags) stop execution with an error. Combining `base:` with a PR/branch target also errors — pass one or the other.

---

## FAQ

**Why not just use the harness's built-in `/review`?**
Use it when it's the right tool — the quick-review short-circuit defers to it explicitly. `ce-code-review` is for cases where you want diff-aware persona selection, structured findings with calibrated severity, autofix routing, and residual work handling. It's the heavier tool; reach for it when the work warrants.

**How does it decide which personas to dispatch?**
Agent judgment over the actual diff — not keyword matching. Correctness and project-standards run for every multi-agent review. Generic, cross-cutting, and stack-specific personas are added only when their concern is present (e.g., testing when tests/harnesses changed or when meaningful runtime behavior changed without corresponding test work, security for auth, `data-migration-reviewer` for migration artifacts). Production-file presence alone and non-behavioral edits do not select testing. A silent-pass verification mechanism (CI/CD gate, build/deploy step, coverage/lint gate, test harness/mock) gets adversarial + the cross-model pass regardless of size.

**What's the difference between default, `mode:agent`, and `apply:local`?**
Default is a human-facing markdown report and is report-only. `mode:agent` is the same review pipeline serialized as one JSON object for a caller; it is always report-only. `apply:local` is separate authority for the markdown run to apply verified findings locally. `mode:headless` is a deprecated alias for `mode:agent`.

**What's the Residual Work Gate?**
A caller-owned step (not part of the review skill): in `mode:agent`, the caller (typically `/ce-work`) applies what it can, then presents the findings it didn't apply and asks the user: apply now, file tickets, accept with durable sink, or stop. "Accept" requires a real durable record (Known Residuals in PR description, or `docs/residual-review-findings/<sha>.md`) — findings can't disappear into chat.

**What's the difference between this and `ce-doc-review`'s cross-model pass?**
Same independence *system* (host attestation, multi-provider selection, read-only peer CLI run as a detached job polled in bounded slices, requested-vs-served model receipts, fold-in as `<lens>-<provider>`, agreement promotion). Different *lens policy*: code-review runs **adversarial only**; doc-review runs a judgment trio plus a whole-doc sweep because document judgment is spread across more lenses. Code-review peers review the work tree/diff in-place; doc-review embeds the document into a more isolated scratch.

**Why does it never switch the checkout?**
The skill never runs `git checkout`/`switch` — passing a PR/branch selects review *scope*, not permission to mutate the tree (it diffs remote/local refs without checking out). Explicit local apply may edit the current checkout, but it never switches branches. To review the current checkout against a different ref, pass `base:<ref>`.

**Can it run concurrently with browser tests?**
Bare and `mode:agent` reviews are report-only and safe alongside concurrent tests. An explicitly authorized local-apply run may mutate the working tree, so avoid using it against a checkout another agent is actively using.

**Does it support non-software work?**
No — the skill is tightly coupled to git, code reviewers, and PR contexts. For docs (requirements, plans), use `/ce-doc-review` instead.

---

## See Also

- [`ce-work`](./ce-work.md) — primary upstream caller; escalates to `ce-code-review` at Phase 3.3
- [`ce-doc-review`](./ce-doc-review.md) — sibling skill for documents (requirements, plans), not code
- [`ce-debug`](./ce-debug.md) — for fixing bugs found during review, when root-cause investigation matters
- [`ce-resolve-pr-feedback`](./ce-resolve-pr-feedback.md) — handles incoming reviewer comments after a PR is open
- [`ce-simplify-code`](./ce-simplify-code.md) — invoked by `ce-work` before review; complement, not substitute
