---
name: ce-dogfood
description: "Hands-off, diff-scoped browser QA of the active branch: maps user flows, drives a real browser, autonomously fixes small breakages with regression tests and commits, judges experience against product personas, and writes a durable dogfood report. Manual invocation only."
disable-model-invocation: true
argument-hint: "[PR number, branch name, or blank for current branch] [--port PORT]"
---

# Dogfood

Act as a QA engineer who dogfoods the **active branch** end-to-end, autonomously, until it is genuinely ready.

**Outcome:** every user-visible change this branch introduced has been driven in a real browser along its whole journey, judged for correctness and for how it feels to the product's personas, with small breakages fixed, regression-tested, and committed. **Done:** every matrix scenario is `Pass`, `Fixed`, `Skipped`, or in a terminal `Blocked` state; the project's automated suite has been run once and its result recorded; and the report at `<root>/dogfood-reports/<YYYY-MM-DD>-<branch-slug>-dogfood.md` is finalized against its template and committed. A green matrix over a red suite finalizes as a not-ready verdict rather than a ready one. Chasing that suite green is not this run's job.

This is **diff-scoped**, not whole-app exploration. You test what *this branch* introduced or modified versus the trunk.

**Read `references/phases.md` before Phase 0 (Scope) and follow it.** It defines every phase in detail; the run cannot be executed correctly from the phase list below.

## Boundaries

- Drive one browser for the whole run. Prefer a built-in browser over the `agent-browser` CLI when it can cover the matrix; Phase 3 in `references/phases.md` says how to find and choose one. Never add a third stack: no standalone Playwright or Puppeteer, no separately configured extension or MCP such as `mcp__claude-in-chrome__*`, no `npx agent-browser`.
- Never dogfood the trunk on a branch-name or blank target — there is no diff. A PR target always has a base, so it is always diffable even when its head branch is named `main`.
- A numeric target stays a PR identity through isolation and checkout — never collapse it to its head ref, whose name may itself be `main`.
- Never switch the primary checkout out from under the user. Isolate a PR or another named ref through `ce-worktree` without asking; `ce-worktree` owns the mechanics and reports the verdict. A blank or current-branch target runs in place.
- Screenshots and other transient artifacts go to OS temp (`mktemp -d "${TMPDIR:-/tmp}/ce-dogfood-XXXXXX"`), never the repo root; copy one in only to embed it in the report.
- Auto-fix only what is small, well-understood, and low-risk. A change that needs an architectural or schema decision, alters product behavior or UX intent, spans many files, or has plausible competing solutions is escalated to the report's **Decisions for a human** section, never implemented to clear a matrix item.

## Prerequisites

**User-runnable invocation rendering.** In prerequisite failures, default to `/ce-setup` and `/ce-dogfood <original arguments>`; use `$ce-setup` and `$ce-dogfood <original arguments>` only when the active host is Codex or explicitly documents dollar-prefixed skill invocation. On oh-my-pi (`omp`), use `/skill:ce-setup` and `/skill:ce-dogfood <original arguments>`. Render only each invocation as inline code and output one form only.

- A local dev server you can start (`bin/dev`, `rails server`, `npm run dev`, etc.).
- A browser per the Boundaries. When the run needs `agent-browser` and it is not installed, stop and tell the user to install it: print the rendered `ce-setup` invocation for the current install command, followed by the rendered `ce-dogfood <original arguments>` invocation to retry.

## Artifact Root

Reports live under `<root>/dogfood-reports/` and personas under `<root>/personas/`. Resolve `<root>` the first time you compose any `<root>/` path, whether you are reading or writing, and never before. A run that composes none skips it.

<!-- ce-docs-root:start -->
**Resolve the CE artifact root `<root>` before composing any artifact path.**

- **Read** `docs_root` from `<repo-root>/.compound-engineering/config.yaml` only (`<repo-root>` = `git rev-parse --show-toplevel`). Do not read it from `config.local.yaml`. Unset -> `<root>` is `docs`, exactly as before.
- **Validate** a set value: a repo-relative directory whose real, symlink-resolved path stays inside the repo and is neither the repo root nor under `.git/`. Otherwise stop with an error naming `docs_root` and the value -- never fall back to `docs`.
- **Use** `<root>` as the sole artifact location: create it if absent, compose each path as `<root>/<subdir>` with this skill's own subdirectory, and never also read `docs`.
<!-- ce-docs-root:end -->

## Delegation

`ce-dogfood` is an orchestrator: prefer an existing CE skill over re-deriving its behavior. Isolate a PR or named-branch target with `ce-worktree`; take a non-obvious root cause to `ce-debug`; commit each fix with `ce-commit`; capture a reusable lesson with `ce-compound`.

## Compound Packs

The repo's declared Compound Packs supply personas and criteria. A pack rule that describes a user is a persona the flows are walked as; one that prescribes how the product must look or behave is a criterion each scenario it reaches is judged against, and a contradiction is a failure that enters the fix loop with its `(pack: <id>, <path within the pack>)` citation. A contradiction the branch intends is a decision for a human about the rule, not a fix. Judgments that generalize go back to the packs through `ce-compound`; this skill never writes a pack. `references/phases.md` defines how packs are applied.

## Phase order

Scope -> analyze the diff -> map the flows -> derive the matrix -> serve -> execute -> fix loop -> report. The order is the invariant: the flow model precedes the matrix, and the matrix precedes any browser work. Work one scenario at a time, judged for correctness *and* for how it feels to each persona. A fix is not done until a regression test fails before it and passes after, or the report says why no automated test was meaningful.

**Checkpoint, not a final write.** Create the report from `references/dogfood-report-template.md` as soon as the matrix exists, with every scenario at `Pending`, and update it after each scenario is judged and each fix is committed. The task list is session-scoped, but the report on disk is what a later run or a teammate resumes from, so an interrupted run must leave a template-shaped checkpoint rather than a bare matrix.

**Involving a person.** Stop and ask only in two cases. The first is when the run cannot continue without something only the user has, such as secrets the app needs to start. The second is when the next step would change the user's own work, such as switching their checkout. Everything else a person must do is recorded and handed back once, at the end. `Blocked (needs human verify)` (an outside-service leg that the branch changed and that no local stand-in covers) and `Blocked (human decision)` (a fix too big to make autonomously) are those records. Each ends that scenario, not the run: continue the rest of the matrix, and never silently re-queue a blocked scenario, on this run or on resume.
