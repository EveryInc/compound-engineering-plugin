# `ce-code-review`

> Structured code review: risk-selected reviewer personas, confidence-gated findings, one merged report.

`ce-code-review` produces findings on a diff. Point it at a PR, a named branch, or the current checkout. It picks reviewer personas that fit what actually changed, dispatches them in parallel, then merges and deduplicates their findings into one report. Each finding carries a severity (P0-P3), an autofix class (`gated_auto`, `manual`, `advisory`) that describes the follow-up shape, and an owner.

Review is report-only by default. Local fixes need `apply:local` or an explicit request to apply this review's findings. `mode:agent` always reports and leaves mutation to the caller.

What it enforces is yours to set. Write a rule in a `CODING_STANDARDS.md` file in your repository and the review checks against it from then on (see [Repo-owned review criteria](#repo-owned-review-criteria)).

It is not a verdict on a document (`ce-pov`), not findings on a planning doc (`ce-doc-review`), and not an investigation of broken behavior (`ce-debug`).

`ce-work` invokes it as the portable review path before shipping. `ce-optimize` and `ce-debug` also call it on the diffs they produce. You can invoke it directly any time.

---

## TL;DR

| Question | Answer |
|----------|--------|
| What does it do? | Selects reviewer personas from the diff, dispatches them, merges findings into one report with confidence gating |
| When to use it | Before opening a PR, after a large or sensitive change, or when the harness has no built-in `/review` |
| What it produces | A structured findings report. With explicit local-apply authority it can also apply verified fixes and add an Applied section. It never pushes |
| How to customize it | Write rules in `CODING_STANDARDS.md`. The review discovers the file and enforces what it says |
| Modes | Markdown report (default) and `mode:agent` JSON handoff. Both are report-only unless local apply is separately authorized |

---

## Example invocations

```text
# Review the current branch. Base comes from origin/HEAD or PR metadata.
# Relevant plan and session context are discovered automatically.
/ce-code-review

# Review a specific PR without checking it out
/ce-code-review https://github.com/acme/widgets/pull/1234
/ce-code-review 1234

# Review a named branch without checking it out
/ce-code-review feat/notification-mute

# Review the current checkout against an explicit base (skips scope detection)
/ce-code-review base:origin/main

# Load a plan for requirements verification
/ce-code-review plan:docs/plans/2026-03-25-001-feat-foo-plan.md

# JSON handoff for a caller. Always report-only. The caller applies.
/ce-code-review mode:agent

# Review this checkout and apply verified findings locally. Never pushes.
/ce-code-review apply:local
/ce-code-review review this branch and fix eligible findings locally

# Force the full reviewer roster (skip the small-diff lite path)
/ce-code-review depth:full

# Flat report, no thematic groups
/ce-code-review grouping:off

# Ask for a lighter pass. Defers to the harness-native /review when one exists.
/ce-code-review give this branch a quick review
```

Do not combine `base:` with a PR or branch target, or `apply:local` with `mode:agent`. Conflicting mode or grouping flags stop with an error.

---

## Why not a generalist review prompt

Generalist review prompts fail in predictable ways. They produce "consider adding tests" without naming what to test. They give security feedback on a doc-only change and performance feedback on a typo fix. Every finding reads as critical, and a speculative "could be a bug" looks identical to a verified defect. The findings land in chat with no record and no fix queue. And a reviewer that mutates a shared checkout while another agent runs tests produces undefined outcomes.

`ce-code-review` runs review as a pipeline with explicit gates. Persona selection follows the diff: correctness always runs, every other reviewer is gated by the surface actually touched. Personas dispatch in parallel, bounded to the harness's active-subagent limit. Synthesis merges, dedupes, promotes confidence on cross-persona agreement, and routes by autofix class. Severity and autofix class stay orthogonal (urgency vs follow-up shape). Presentation and authority stay separate: the markdown report and `mode:agent` JSON are report-only; `apply:local` grants local mutation. A "quick", "fast", or "light" request skips all of this and defers to the harness-native `/review`.

---

## Diff-aware persona selection

A small low-risk change runs correctness (and project-standards if applicable files exist). A Rails auth feature with migrations adds the relevant domain lenses. The roster:

- **Always-on:** `correctness-reviewer`
- **Standards:** `project-standards-reviewer` only when at least one criteria file governs a changed file (see [Repo-owned review criteria](#repo-owned-review-criteria))
- **Generic conditional:** testing for changed tests/harnesses or meaningful runtime behavior with no corresponding test work; maintainability for large or structural work; agent-native for agent-facing files; learnings only when an existing `docs/solutions/` corpus has plausible matches
- **Cross-cutting conditional:** security, performance, API contract, data migrations, reliability, adversarial, previous-comments. Each selected only when the diff touches its concern
- **Stack-specific:** Julik frontend races, Swift/iOS. Only when the matching runtime domain is touched
- **CE conditional:** `deployment-verification-agent` for risky migration diffs. Schema drift and migration safety live on the `data-migration` persona

Selection is agent judgment, not keyword matching. Instruction-prose files (Markdown skills, JSON schemas) are product code but skip runtime-focused reviewers. The exception is a silent-pass verification mechanism (a CI/CD gate, build/deploy step, coverage/lint gate, or test harness/mock that could mask production): even as a small config diff it gets the adversarial lens, because its risk is going green while the real thing is red, not blast radius.

When you pass a PR number or URL, trivial automated PRs (lockfile bumps, chore version increments) are skipped. Draft PRs are reviewed normally.

`depth:auto` (the default) collapses a 1-39-line, low-risk, code-only diff to a lite roster. `depth:full` disables that path so the full always-on roster runs regardless of size. Neither token invents irrelevant domains.

## Repo-owned review criteria

Everything else the skill checks is what we ship. This is the part you own.

Put a `CODING_STANDARDS.md` in your repository, write the rules your team actually cares about, and the review enforces them. A finding from that file cites the rule it broke, so it arrives as "this violates the rule you wrote" rather than someone's taste.

```markdown
# Coding Standards

- Every exported function declares an explicit return type.
- Nothing in `src/` calls `console.log` directly; route it through the `log()` helper.
```

Four things worth knowing:

- **Placement scopes it.** A file at the repo root governs the whole checkout. One at `skills/CODING_STANDARDS.md` governs only what is under `skills/`. Several can apply to the same file at once.
- **Any format works.** Prose, bullets, tables, nested headings, with or without frontmatter. The content is the contract. A paragraph of plain English is a valid rules file.
- **It replaces the instruction file as criteria, per changed file.** `CLAUDE.md` and `AGENTS.md` remain the criteria for any changed file that no `CODING_STANDARDS.md` governs, so a repo that has never written one keeps the review it already had. No file is ever graded against both kinds, and the report names the fallback in Coverage when it supplies the criteria.
- **It can grow.** An instruction file is loaded into every agent's context on every turn, so it stays short and rules get cut for space. A criteria file is read once, by one reviewer, at review time. That is the reason to keep enforceable rules here rather than in `AGENTS.md`: this file has room, and adding to it costs nothing until review runs.

That last point is what makes review strictness compound. Notice a mistake worth preventing, write the rule down, and every review after that catches it.

## Cross-model adversarial pass

When adversarial is selected and the working tree is the reviewed head (current branch, or a PR whose local tree already matches the PR head), the adversarial lens runs through one model provider different from the host, in a separate read-only process. A started peer replaces the in-process `adversarial` persona; they never both receive the same brief. The in-process persona runs if the peer cannot start, or if the started peer returns only session-quota or auth-context failure. In that case the next announced different-family peer is tried when one is eligible, otherwise the local persona covers the lens. An exact provider-overload 529 gets one same-route retry; repeated overload, another stubborn transient rate limit, or max-turn exhaustion falls back locally without an unbounded retry loop. Remote PR or branch diffs stay on the in-process persona, because that reviewer can inspect the fetched refs.

Agreement between the peer and another in-process reviewer is a strong promotion signal in synthesis.

`cross_model_review_mode: off` in CE config keeps this pass from running at all. No peer is resolved and nothing leaves the host; the in-process reviewers cover the lens and Coverage says the pass was disabled by checkout config. A direct request in conversation for a peer overrides it for one run. The peer target is auto-chosen and overridable, in priority order: conversation, `cross_model_peer:` in CE config, active project instructions, then `codex → claude → grok → composer`. `Cursor` means `cursor-agent` using its configured default/Auto model. `Composer` means a Composer model through Cursor. `Grok` binds the native grok CLI when it is installed; Grok through Cursor is a different route, used when asked or when the grok CLI is missing and Cursor is allowed. Cursor Auto does not count as independent agreement unless its serving family is verified different from the host. `cross_model_model:` and `cross_model_effort:` in CE config pin that target's model (e.g. `fable` for claude or `gpt-5.6-sol` for codex, or a namespace-qualified codex id such as `openai.gpt-5.6-sol` when that CLI routes through a non-default `model_provider`) and reasoning effort; a value the peer cannot honor skips the pass with a stated reason rather than substituting. See the [configuration reference](./configuration.md).

The prerequisite is a peer agent CLI. The pass drives a read-only agent CLI (`codex`, `claude`, `grok`, `cursor-agent`, or `opencode`) so the peer can inspect the tree itself; a bare `OPENAI_API_KEY`, Anthropic key, or Gemini key does not enable it. Peers are discovered on `PATH`, plus the CLI bundled inside the Codex desktop app (`ChatGPT.app/Contents/Resources/codex` since the July 2026 app merger, or `Codex.app/…` on older installs; the app does not link it onto `PATH`). Gemini has no standalone peer target; it participates only through Cursor when `cursor-agent` attests a Gemini serving family. With no peer CLI installed the skill runs the in-process adversarial reviewer and reports "cross-model pass: not run"; the skip reason names what to install.

This shares the provider/route kernel with `ce-doc-review` but keeps a narrower scope: adversarial-only, diff/work-tree delivery, not doc-review's judgment trio or whole-doc sweep.

## Severity and autofix class are orthogonal

Severity answers urgency (P0 = critical breakage, P3 = user discretion). Autofix class describes follow-up shape, not apply permission:

- `gated_auto`: a concrete `suggested_fix` exists. A clear candidate to apply
- `manual`: actionable work that needs design input or a handoff
- `advisory`: report-only (learnings, rollout notes, residual risk)

Synthesis owns the final route. Persona-provided routing metadata is input. Disagreements default to the more conservative route. Whether a finding actually gets applied is a judgment call after apply authority exists.

## Presentation and apply authority are separate

| Mode | When | Behavior |
|------|------|----------|
| **Default markdown** | Direct user invocation | Report-only markdown with stable findings and an Actionable Findings summary |
| **`mode:agent`** | `mode:agent` (alias `mode:headless`) | One JSON object. Report-only. The caller applies findings. `mode:non-interactive` is not this alias (fail closed if passed) |
| **Explicit local apply** | `apply:local`, or an explicit ask to apply/fix this review's findings | Keeps markdown presentation. May apply verified fixes and commit them when the pre-review tree was clean. Never pushes |

The skill never switches branches. A PR or branch argument selects review scope (diffed without checkout), not permission to mutate. Explicit local apply edits the current checkout in place. To review the current checkout against another ref, pass `base:<ref>`.

## Quick-review short-circuit

When you ask for a "quick", "fast", or "light" review, the skill defers to the harness-native code review (for example `/review` in Claude Code) instead of dispatching the multi-agent pipeline. `mode:agent` bypasses the short-circuit and always runs the full pipeline.

## Synthesis, grouping, and plan checks

After reviewers return, synthesis validates each finding, anchors it to the actual diff, deduplicates across personas, promotes confidence on agreement, resolves contradictions, and routes by autofix class. The output is one report with calibrated severity, evidence quotes, and explicit ownership.

When findings span distinct concerns, related ones are grouped under a short theme (`grouping:auto`, the default). Groups are a triage lens, not a restructure: findings keep their stable `#`s, and groups reference them (`#2, #3`). Pass `grouping:off` for a flat report or `grouping:always` to group even small reviews.

When the diff has an associated plan (`docs/plans/*.md` or `.html`), the skill discovers it (`plan:` argument, PR body link, or auto-discovery from branch name) and verifies the diff against Product Contract Requirements and Implementation Units on an implementation-ready artifact.

Pipeline artifacts under `plans/`, `solutions/`, and legacy `brainstorms/` are protected. Findings to delete or gitignore them are discarded.

When a discovered plan carries `session-settled:` decisions, a finding that merely prefers a different approach is routed report-only with a `settled_conflict` stamp. A real defect inside a settled approach keeps its full severity. Reviewers stay blind to the annotations. The orchestrator triages after the fact.

Callers such as `/ce-work` read the Actionable Findings summary (or the JSON `actionable_findings` field) and own residual handling: apply now, file tickets, accept with a durable sink, or stop. This skill does not run that gate.

---

## Quick example

You invoke `/ce-code-review` on a feature branch with a Rails auth change that includes a database migration.

The skill detects you are on a feature branch (no PR yet), resolves the base from `origin/HEAD`, and computes the diff. It writes a 2-3 line intent summary from commit messages, auto-discovers the plan in `docs/plans/` from the branch name, and reads Product Contract Requirements plus implementation U-IDs when the artifact is implementation-ready.

It selects correctness, plus project-standards if applicable files exist, plus testing if the migration changes test or harness code or changes meaningful runtime behavior without corresponding test work, security (auth touched), reliability (background job for token cleanup), data-migration (migration file present), and deployment-verification when the migration is risky. Adversarial is selected for auth and persistence writes. Because this is the current checkout, that lens runs as the cross-model peer rather than the in-process persona.

Synthesis merges the raw findings into a smaller distinct set. Several are `gated_auto` candidates for the caller, two are `manual` deployment decisions, and the rest are advisory. Each finding has anchored evidence and a stable number. Because this was a bare invocation, the review reports them without changing the checkout.

You can then apply selected findings yourself, hand the JSON report to `/ce-work`, or rerun with `apply:local`.

---

## When to reach for it

Use `ce-code-review` when:

- You are about to open a PR for sensitive or large work (auth, payments, migrations, public APIs)
- Your harness lacks a built-in `/review` and you still want a real review
- You want structured findings with calibrated severity, not a chat dump
- You explicitly want a deeper, multi-persona pass ("review this thoroughly", or `depth:full`)
- Another skill is calling it (`/ce-work` before shipping, `/ce-optimize` on the cumulative optimization diff, `/ce-debug` after a non-trivial fix)

Skip it when:

- You want a light review. Ask for "quick review" and the short-circuit defers to the harness-native `/review`
- The change is a typo, formatting, or a small dependency bump. The lite roster is enough
- You want findings on a planning document → `/ce-doc-review`
- You want a holistic take on a plan, not a diff review → `/ce-pov`
- You want to investigate broken behavior → `/ce-debug`

---

## Use as part of the workflow

`ce-code-review` is the portable review path other skills call:

- **`/ce-work`** invokes `mode:agent` before shipping. It self-right-sizes (lite roster for small low-risk code-only diffs, full roster otherwise). Pass `depth:full` when the plan, the task, or the user asked for a thorough review. `ce-work` then applies findings and runs its Residual Work Gate
- **`/ce-optimize`** runs it against the cumulative optimization-branch diff before merging
- **`/ce-debug`** runs it on a non-trivial fix, scoped so it does not wander into unrelated branch work

## Use standalone

- **Current branch (report-only):** `/ce-code-review`
- **Current branch and apply verified findings:** `/ce-code-review apply:local`
- **Specific PR:** `/ce-code-review 1234` or `/ce-code-review <PR URL>`
- **Specific branch:** `/ce-code-review feat/notification-mute`
- **With base ref:** `/ce-code-review base:abc1234` or `base:origin/main`
- **With plan:** `/ce-code-review plan:docs/plans/.../plan.md`

Bare and `mode:agent` reviews are report-only and safe alongside browser tests on the same checkout. Do not run an explicitly authorized local-apply review against a checkout another agent is actively using.

---

## Reference

| Argument | Effect |
|----------|--------|
| _(empty)_ | Reviews the current branch (base from `origin/HEAD` or PR metadata) |
| `<PR number or URL>` | Reviews that PR without checking it out |
| `<branch name>` | Reviews that branch without checking it out |
| `base:<sha-or-ref>` | Skips scope detection. Reviews the current checkout against that ref |
| `plan:<path>` | Loads the plan for requirements verification |
| `mode:agent` | JSON machine handoff. Report-only. `mode:headless` is a deprecated alias. `mode:non-interactive` is not valid here. `mode:report-only` is ignored |
| `apply:local` | Authorize verified local fixes. Conflicts with `mode:agent` |
| `depth:full` / `depth:auto` | `full` forces the full roster (skips the small-diff lite path). `auto` (default) self-right-sizes |
| `grouping:auto` / `grouping:off` / `grouping:always` | Thematic triage grouping (default `auto`). Presentation only. Never changes reviewer selection, merge, or apply |

Conflicting mode flags (or conflicting grouping flags) stop with an error. Combining `base:` with a PR or branch target also errors. Pass one or the other.

---

## FAQ

**Why not just use the harness's built-in `/review`?**
Use it when it is the right tool. The quick-review short-circuit defers to it explicitly. `ce-code-review` is for cases where you want diff-aware persona selection, structured findings with calibrated severity, autofix routing, and a residual handoff the caller can act on.

**How does it decide which personas to dispatch?**
Agent judgment over the actual diff, not keyword matching. Correctness runs for every multi-agent review. Project-standards runs when a criteria file governs at least one changed file. Generic, cross-cutting, and stack-specific personas are added only when their concern is present. Production-file presence alone and non-behavioral edits do not select testing. A silent-pass verification mechanism gets adversarial (and the cross-model pass, when the tree is local) regardless of size.

**What's the difference between default, `mode:agent`, and `apply:local`?**
Default is a human-facing markdown report and is report-only. `mode:agent` is the same pipeline serialized as one JSON object for a caller, always report-only. `apply:local` is separate authority for the markdown run to apply verified findings locally. `mode:headless` is a deprecated alias for `mode:agent`. `mode:non-interactive` means "suppress prompts" in other CE skills and is not valid here.

**What's the difference between this and `ce-doc-review`'s cross-model pass?**
Same independence system (host attestation, multi-provider selection, read-only peer CLI). Different lens policy: code-review runs adversarial only, and a started peer replaces the in-process adversarial persona. Doc-review runs a judgment trio plus a whole-doc sweep alongside the in-process reviewers. Code-review peers review the work tree/diff in place. Doc-review embeds the document into a more isolated scratch.

**Why does it never switch the checkout?**
The skill never runs `git checkout` or `git switch`. Passing a PR or branch selects review scope, not permission to mutate the tree. Explicit local apply may edit the current checkout, but it never switches branches. To review the current checkout against a different ref, pass `base:<ref>`.

**Can it run concurrently with browser tests?**
Bare and `mode:agent` reviews are report-only and safe alongside concurrent tests. An explicitly authorized local-apply run may mutate the working tree, so avoid using it against a checkout another agent is actively using.

**Does it support non-software work?**
No. The skill is coupled to git, code reviewers, and PR contexts. For docs (requirements, plans), use `/ce-doc-review`. For a holistic take on a document, use `/ce-pov`.

---

## See also

- [`ce-work`](./ce-work.md): primary upstream caller. Invokes this skill before shipping
- [`ce-doc-review`](./ce-doc-review.md): sibling skill for documents, not code
- [`ce-pov`](./ce-pov.md): a verdict or holistic take, not findings on a diff
- [`ce-debug`](./ce-debug.md): for investigating broken behavior, including bugs found during review
- [`ce-resolve-pr-feedback`](./ce-resolve-pr-feedback.md): handles incoming reviewer comments after a PR is open
- [`ce-simplify-code`](./ce-simplify-code.md): invoked by `ce-work` before review. Complement, not substitute
