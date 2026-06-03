---
name: ce-code-review
description: "Structured code review using tiered persona agents, confidence-gated findings, and a merge/dedup pipeline. In interactive mode it applies safe, verified fixes and commits them when the working tree is clean (it never pushes); in mode:agent it reports only and the caller applies. Use when reviewing code changes before creating a PR."
argument-hint: "[mode:agent] [blank to review current branch, or provide PR link]"
---

# Code Review

Reviews code changes using dynamically selected reviewer personas. Spawns parallel sub-agents that return structured JSON, then merges and deduplicates findings into a single report.

## When to Use

- Before creating a PR
- After completing a task during iterative implementation
- When feedback is needed on any code changes
- Can be invoked standalone
- Can run inside larger workflows; use `mode:agent` when the caller needs JSON instead of markdown tables

## Argument Parsing

Parse `$ARGUMENTS` for optional tokens. Strip each recognized token before interpreting the remainder as a PR number, GitHub URL, or branch name.

| Token | Example | Effect |
|-------|---------|--------|
| `mode:agent` | `mode:agent` | **Report-only**: return **JSON** instead of markdown tables and skip the Stage 5c apply (the caller applies). Does not change reviewer selection, merge logic, or scope rules (see Output format) |
| `mode:headless` | `mode:headless` | **Deprecated alias** for `mode:agent` |
| `mode:report-only` | `mode:report-only` | **Deprecated — ignored.** Former no-artifacts mode; default behavior is review-only without checkout |
| `base:<sha-or-ref>` | `base:abc1234` or `base:origin/main` | Diff base on the **current checkout** (explicit; skips auto base detection) |
| `plan:<path>` | `plan:docs/plans/2026-03-25-001-feat-foo-plan.md` | Plan file for requirements verification (explicit) |

**Mode alias:** `mode:headless` normalizes to `mode:agent`. `mode:agent` + `mode:headless` is not a conflict.

**Conflicting arguments:** Stop without dispatching reviewers when:
- Multiple incompatible scope selectors appear together (e.g. `base:` **and** a PR number/branch target — `base:` means "review the current checkout against this base")
- Multiple distinct `mode:` tokens other than the `mode:agent`/`mode:headless` alias pair

Deprecated `mode:autofix` is **not** a conflict — ignore the token and proceed with the normal flow (see below).

Emit a one-line failure reason. In `mode:agent`, return JSON: `{"status":"failed","reason":"..."}`.

## Operating principles

Same pipeline for default and `mode:agent`:

- **Apply and commit locally; never push.** Never push, open PRs, or file tickets — in any mode (push is the outward-facing step the user owns). In **default (interactive)** mode the review applies safe, verified fixes (Stage 5c); when the working tree was clean before the review it also commits them as an isolated `fix(review):` commit, and on a dirty tree it applies but leaves them for the user's commit. In **`mode:agent`** it never mutates the tree — it reports and the caller applies and commits.
- **No blocking prompts.** Never use `AskUserQuestion`, `request_user_input`, `ask_user`, or other blocking question tools. Infer intent, plan, and scope from explicit tokens, git state, PR metadata, and conversation. Note uncertainty in Coverage or the verdict — do not stop to ask.
- **Explicit mutations only.** Never run `gh pr checkout`, `git checkout`, `git switch`, or similar branch-switch commands. Passing a PR number, URL, or branch name selects **review scope**, not permission to mutate the working tree. To review local uncommitted work on a feature branch, check out that branch yourself (or stay on it) and pass `base:` or no target.
- **Smart defaults.** Untracked files: review tracked changes only and list excluded paths in Coverage. Plan: use `plan:` when passed; otherwise discover conservatively from PR body or branch keywords. Weak advisory P2/P3 from testing/maintainability alone: demote to `testing_gaps` / `residual_risks` per Stage 5.

## Output format

| Invocation | Deliverable |
|------------|-------------|
| **Default** | Markdown report (pipe-delimited finding tables) + Actionable Findings summary |
| **`mode:agent`** | One JSON object (see ### JSON output format below) + the same `/tmp/.../ce-code-review/<run-id>/` artifacts |

`mode:agent` is **report-only**: it skips the Stage 5c apply (the caller applies) and serializes findings as JSON instead of markdown. It does not change reviewer selection, merge logic, or scope rules.

The `mode:agent` JSON is the **deterministic, machine-readable contract** for programmatic and cross-harness callers (Codex, Gemini, etc.) — route automation through it, not through the markdown. The default markdown is the **human-readable view**; it will render differently across terminals and harnesses, so keep it ASCII-safe (pipe tables, `->` not middot `·`, no box-drawing) so it degrades gracefully where rendering differs.

## Quick Review Short-Circuit

If `$ARGUMENTS` indicates the user wants a quick, fast, or light code review — and **`mode:agent` is not active** — do not dispatch the multi-agent flow.

**Announce the chosen path** before any other work (Quick review vs Multi-agent review). Skip this announcement when `mode:agent` is active.

Sequence:

1. **Run the harness's built-in code review.** Forward any review target after stripping tokens. Then stop — do not dispatch the multi-agent pipeline.
2. **Exemption:** If no built-in review exists, continue into the full multi-agent review.
3. **`mode:agent` bypasses this short-circuit** — always run the full multi-agent review and return JSON.

**Deprecated:** `mode:autofix` is no longer supported — there is no apply *mode*. Default (interactive) runs apply safe fixes automatically (Stage 5c); `mode:agent` reports and the caller applies (e.g. `ce-work` `review-findings-followup.md`). If `mode:autofix` is passed, ignore the token and proceed with the normal flow.

## Severity Scale

All reviewers use P0-P3:

| Level | Meaning | Action |
|-------|---------|--------|
| **P0** | Critical breakage, exploitable vulnerability, data loss/corruption | Must fix before merge |
| **P1** | High-impact defect likely hit in normal usage, breaking contract | Should fix |
| **P2** | Moderate issue with meaningful downside (edge case, perf regression, maintainability trap) | Fix if straightforward |
| **P3** | Low-impact, narrow scope, minor improvement | User's discretion |

## Action Routing

Severity answers **urgency**. `autofix_class` and `owner` are **signal** describing intrinsic follow-up shape for callers — **not apply permission or an apply gate.** In `mode:agent` this skill does not mutate the checkout — the caller applies; in default (interactive) mode the review applies safe fixes itself (Stage 5c). The apply decision is judgment (Stage 5c), not a function of `autofix_class`. See `references/action-class-rubric.md` for persona guidance.

| `autofix_class` | Default owner | Meaning |
|-----------------|---------------|---------|
| `gated_auto` | `downstream-resolver` or `human` | Concrete `suggested_fix` proposed; caller applies after judgment |
| `manual` | `downstream-resolver` or `human` | Actionable work needing design input or handoff |
| `advisory` | `human` or `release` | Report-only — learnings, rollout notes, residual risk |

Routing rules:

- **Synthesis owns the final route.** Persona-provided routing metadata is input, not the last word.
- **Choose the more conservative route on disagreement.** A merged finding may move from `gated_auto` to `manual`, but never widen without stronger evidence.
- **Reject `safe_auto` and `review-fixer` if present** — drop the finding or remap to `gated_auto` / `downstream-resolver` during synthesis.
- **`requires_verification: true` means any caller-applied fix needs targeted tests or follow-up validation.**

## Reviewers

14 reviewer personas in layered conditionals, plus CE-specific agents. See the persona catalog included below for the full catalog.

**Always-on (every review):**

| Agent | Focus |
|-------|-------|
| `ce-correctness-reviewer` | Logic errors, edge cases, state bugs, error propagation |
| `ce-testing-reviewer` | Coverage gaps, weak assertions, brittle tests |
| `ce-maintainability-reviewer` | Structural quality, complexity deletion, 1k-line regressions, coupling, type-boundary leaks, dead code, abstraction debt |
| `ce-project-standards-reviewer` | CLAUDE.md and AGENTS.md compliance -- frontmatter, references, naming, portability |
| `ce-agent-native-reviewer` | Verify new features are agent-accessible |
| `ce-learnings-researcher` | Search docs/solutions/ for past issues related to this PR |

**Cross-cutting conditional (selected per diff):**

| Agent | Select when diff touches... |
|-------|---------------------------|
| `ce-security-reviewer` | Auth, public endpoints, user input, permissions |
| `ce-performance-reviewer` | DB queries, data transforms, caching, async |
| `ce-api-contract-reviewer` | Routes, serializers, type signatures, versioning |
| `ce-data-migration-reviewer` | Migration files, schema dumps (`db/schema.rb`, `structure.sql`), backfills, data-transform scripts — **not** model/query-only changes without migration artifacts |
| `ce-reliability-reviewer` | Error handling, retries, timeouts, background jobs |
| `ce-adversarial-reviewer` | Diff >=50 changed non-test/non-generated/non-lockfile lines, or auth, payments, data mutations, external APIs |
| `ce-previous-comments-reviewer` | Reviewing a PR that has existing review comments or threads |

**Stack-specific conditional (selected per diff):**

| Agent | Select when diff touches... |
|-------|---------------------------|
| `ce-julik-frontend-races-reviewer` | Stimulus/Turbo controllers, DOM events, timers, animations, or async UI flows |
| `ce-swift-ios-reviewer` | Swift files, SwiftUI views, UIKit controllers, entitlements, privacy manifests, Core Data models, SPM manifests, storyboards/XIBs, or semantic build-setting/target/signing changes in .pbxproj |

**CE conditional (migration-specific):**

| Agent | Select when diff includes migration files |
|-------|------------------------------------------|
| `ce-deployment-verification-agent` | Produces deployment checklist with SQL verification queries and rollback procedures |

Schema drift detection is folded into `ce-data-migration-reviewer` (Step 0) and surfaces as P1 findings — not a separate agent or report section.

## Review Scope

Every review spawns all 4 always-on personas plus the 2 CE always-on agents, then adds whichever cross-cutting and stack-specific conditionals fit the diff. The model naturally right-sizes: a small config change triggers 0 conditionals = 6 reviewers. A Rails auth feature might trigger security + reliability + adversarial = 9 reviewers.

## Protected Artifacts

The following paths are compound-engineering pipeline artifacts and must never be flagged for deletion, removal, or gitignore by any reviewer:

- `docs/brainstorms/*` -- requirements documents created by ce-brainstorm
- `docs/plans/*.md` -- plan files created by ce-plan (decision artifacts; execution progress is derived from git, not stored in plan bodies)
- `docs/solutions/*.md` -- solution documents created during the pipeline

If a reviewer flags any file in these directories for cleanup or removal, discard that finding during synthesis.

## How to Run

### Stage 1: Determine scope

Compute the diff range, file list, and diff. Minimize permission prompts by combining into as few commands as possible.

**If `base:` argument is provided (fast path):**

The caller already knows the diff base. Skip all base-branch detection, remote resolution, and merge-base computation. Use the provided value directly:

```
BASE_ARG="{base_arg}"
BASE=$(git merge-base HEAD "$BASE_ARG" 2>/dev/null) || BASE="$BASE_ARG"
```

Then produce the same output as the other paths:

```
echo "BASE:$BASE" && echo "FILES:" && git diff --name-only $BASE && echo "DIFF:" && git diff -U10 $BASE && echo "UNTRACKED:" && git ls-files --others --exclude-standard
```

This path works with any ref — a SHA, `origin/main`, a branch name. Callers reviewing the current checkout should pass explicit `base:` when auto-detection is unnecessary. **Do not combine `base:` with a PR number or branch target.** If both are present, stop with an error: "Cannot use `base:` with a PR number or branch target — `base:` implies the current checkout is already the correct branch. Pass `base:` alone, or pass the target alone and let scope detection resolve the base." This avoids scope/intent mismatches where the diff base comes from one source but the code and metadata come from another.

**If a PR number or GitHub URL is provided as an argument:**

Do **not** check out the PR branch. Scope comes from GitHub read APIs plus optional local alignment when HEAD already matches the PR head branch.

**Skip-condition pre-check.** Before scope detection, run a PR-state probe:

```
gh pr view <number-or-url> --json state,title,body,files
```

Apply skip rules in order:

- `state` is `CLOSED` or `MERGED` -> stop with reason `PR is closed/merged; not reviewing.`
- **Trivial-PR judgment**: spawn a lightweight sub-agent (use `model: haiku` in Claude Code; gpt-5.4-nano or equivalent in Codex) with the PR title, body, and changed file paths. The agent's task: "Is this an automated or trivial PR that does not warrant a code review? Consider: dependency lock-file or manifest-only bumps, automated release commits, chore version increments with no substantive code changes. When in doubt, answer no — false negatives (skipped reviews that should have run) are more costly than false positives (unnecessary reviews)." If the judgment returns yes: stop with reason `PR appears to be a trivial automated PR; not reviewing. Run without a PR argument to review the current branch, or pass base:<ref> if review is intended.`

When any skip rule fires, stop without dispatching reviewers. **Default mode:** emit the reason as plain text. **`mode:agent`:** emit JSON only — `{"status":"skipped","reason":"<same message>"}` — so programmatic callers can parse the outcome. **Standalone**, **`base:`**, and **branch-remote** paths are unaffected. **Draft PRs are reviewed normally.**

If no skip rule fires, fetch PR metadata **without checkout**:

```
gh pr view <number-or-url> --json title,body,baseRefName,headRefName,headRefOid,isCrossRepository,url,files,reviews,comments --jq '{title, body, baseRefName, headRefName, headRefOid, isCrossRepository, url, files: [.files[].path], hasPriorComments: ((.reviews | map(select(.state != "APPROVED" or .body != "")) | length) > 0 or (.comments | length) > 0)}'
```

Set `BASE:` to `pr:<number-or-url>` (logical marker — not a git SHA). Set `UNTRACKED:` from `git ls-files --others --exclude-standard` on the **current** checkout (usually empty during PR-remote review).

**PR scope mode.** Classify as **`local-aligned`** only when **all** of these hold; otherwise use **`pr-remote`**. A matching branch name alone is not enough — a fork PR or a stale local branch can share a name with the PR head while pointing at unrelated code, and trusting the name would diff and inspect the wrong tree.

1. `git rev-parse --abbrev-ref HEAD` equals `headRefName`.
2. The PR is **not** cross-repository (`isCrossRepository` is false). A fork PR whose branch name coincides with the local branch is **not** the local tree.
3. The PR head commit is contained in the local checkout: `git merge-base --is-ancestor <headRefOid> HEAD` exits 0. This confirms the working tree actually carries the PR head (allowing unpushed local fixes layered on top) rather than an unrelated same-named branch.

- **`local-aligned`** — all three checks pass. Local Read/Grep/git blame against workspace files are valid for PR changed paths.
- **`pr-remote`** — any check fails. The working tree is **not** the PR head; workspace file contents for changed paths may be stale or unrelated.

**Diff by scope mode** (do not mix remote and local diffs — contradictory hunks cause false positives):

- **`local-aligned`:** Resolve `<resolved-base-ref>` from `baseRefName` (fetch if needed). Compute `BASE=$(git merge-base HEAD <resolved-base-ref>)`, then set `FILES:` from `git diff --name-only $BASE` and `DIFF:` from `git diff -U10 $BASE` (includes committed, staged, and unstaged changes on the PR branch). Do **not** call `gh pr diff` or append remote hunks — when unpushed fixes exist, the local tree is canonical. Note in Coverage: `scope: local-aligned (PR; local tree diff)`.
- **`pr-remote`:** Set `FILES:` from the PR `files` array. Set `DIFF:` from `gh pr diff <number-or-url> --color=never`. If `gh pr diff` fails, stop with an actionable error — do not fall back to checkout.

When **`pr-remote`**, before Stage 4:

1. Best-effort fetch PR head without checkout: `git fetch --no-tags origin <headRefName>:refs/review/pr-<number>-head` (substitute PR number from metadata).
2. When fetch succeeds, set `PR_HEAD_REF=refs/review/pr-<number>-head` for reviewers and validators. When fetch fails, omit `PR_HEAD_REF` and note in Coverage — reviewers must rely on diff hunks only.
3. Best-effort fetch the PR base without checkout: `git fetch --no-tags origin <baseRefName>`. When it succeeds, resolve a concrete ref with `git rev-parse FETCH_HEAD` and set `PR_BASE_REF` to that SHA — a **real git base ref** reviewers and validators use for file-level git diffs (e.g. `ce-data-migration-reviewer` runs `git diff <PR_BASE_REF> -- db/schema.rb`/`structure.sql`). The `pr:<number-or-url>` logical marker in `BASE:` stays the scope marker; `PR_BASE_REF` is the diffable base. When the fetch fails, omit `PR_BASE_REF` and note in Coverage — schema-drift and other git-diff checks fall back to diff hunks only and must **not** assume `main`.
4. Include `<pr-scope-mode>pr-remote</pr-scope-mode>` and, when set, `<pr-head-ref>...</pr-head-ref>` and `<pr-base-ref>...</pr-base-ref>` in the Stage 4 review context bundle.

Reviewers and Stage 5b validators in **`pr-remote`** mode must **not** Read/Grep workspace paths for files in `FILES:`. Inspect via `git show <PR_HEAD_REF>:<path>` when `PR_HEAD_REF` is set, otherwise use only the provided diff hunks. **`local-aligned`** uses normal workspace inspection.

**If a branch name is provided as an argument:**

Substitute the provided branch name as `<branch>`. Do **not** check out `<branch>`.

If `git rev-parse --abbrev-ref HEAD` equals `<branch>`, use the **standalone (current branch)** path below — same tree, explicit branch name; do not use remote-only diff.

Otherwise diff the remote/local ref **without checkout**:

1. Try `gh pr view <branch> --json baseRefName,url,headRefName` — if a PR exists, prefer the **PR number/URL path** above (same remote diff rules).
2. Else resolve `<branch>` as `origin/<branch>` or `<branch>` after `git fetch --no-tags origin <branch>` when needed.
3. Resolve default base branch (same logic as standalone). Compute `BASE=$(git merge-base <base-ref> <branch-ref>)` and `git diff -U10 $BASE <branch-ref>`.
4. If `<branch-ref>` cannot be resolved locally, stop: "Cannot diff branch `<branch>` without checkout. Check out that branch, pass its open PR URL/number, or review the current branch with `base:`."

On success for remote branch diff, set **branch-remote scope**. The working tree is **not** `<branch>`. Include `<pr-scope-mode>branch-remote</pr-scope-mode>` and `<branch-head-ref><branch-ref></branch-head-ref>` in the Stage 4 review context bundle. Reviewers and Stage 5b validators must **not** Read/Grep workspace paths for files in `FILES:`. Inspect via `git show <branch-ref>:<path>` or diff hunks only.

Produce:

```
echo "BASE:$BASE" && echo "FILES:" && git diff --name-only $BASE <branch-ref> && echo "DIFF:" && git diff -U10 $BASE <branch-ref> && echo "UNTRACKED:" && git ls-files --others --exclude-standard
```

**If no argument (standalone on current branch):**

Apply the same base-detection logic as branch mode above, using the current branch (i.e., `gh pr view --json baseRefName,url` with no argument defaults to the current branch).

If no base can be resolved, **stop**. Do not fall back to `git diff HEAD` — a standalone review without the base would only show uncommitted changes and silently miss all committed work on the branch.

On success, produce the diff:

```
echo "BASE:$BASE" && echo "FILES:" && git diff --name-only $BASE && echo "DIFF:" && git diff -U10 $BASE && echo "UNTRACKED:" && git ls-files --others --exclude-standard
```

Using `git diff $BASE` (without `..HEAD`) diffs the merge-base against the working tree, which includes committed, staged, and unstaged changes together.

**Untracked file handling:** Always inspect `UNTRACKED:`. Untracked paths are out of scope unless staged. When non-empty, list excluded files in Coverage and continue on tracked changes only — never stop or prompt.

### Stage 2: Intent discovery

Understand what the change is trying to accomplish. The source of intent depends on which Stage 1 path was taken:

**PR/URL mode:** Use the PR title, body, and linked issues from `gh pr view` metadata. Supplement with commit messages from the PR if the body is sparse.

**Branch mode:** Run `git log --oneline ${BASE}..<branch-ref>` using the resolved merge-base and resolved branch ref from Stage 1. Use `<branch-ref>` (the resolved `origin/<branch>` or fetched ref), not the raw `<branch>` argument — a remote-only branch has no matching local ref, so the raw name would fail or read a stale same-named local branch.

**Standalone (current branch):** Run:

```
echo "BRANCH:" && git rev-parse --abbrev-ref HEAD && echo "COMMITS:" && git log --oneline ${BASE}..HEAD
```

Combined with conversation context (plan section summary, PR description), write a 2-3 line intent summary:

```
Intent: Simplify tax calculation by replacing the multi-tier rate lookup
with a flat-rate computation. Must not regress edge cases in tax-exempt handling.
```

Pass this to every reviewer in their spawn prompt. Intent shapes *how hard each reviewer looks*, not which reviewers are selected.

**When intent is ambiguous:** Infer from branch name, commits, PR title/body, diff, `plan:`, and conversation. Write the best-effort intent summary and note uncertainty in Coverage — never block on a clarifying question.

### Stage 2b: Plan discovery (requirements verification)

Locate the plan document so Stage 6 can verify requirements completeness. Check these sources in priority order — stop at the first hit:

1. **`plan:` argument.** If the caller passed a plan path, use it directly. Read the file to confirm it exists.
2. **PR body.** If PR metadata was fetched in Stage 1, scan the body for paths matching `docs/plans/*.md`. If exactly one match is found and the file exists, use it as `plan_source: explicit`. If multiple plan paths appear, treat as ambiguous — demote to `plan_source: inferred` for the most recent match that exists on disk, or skip if none exist or none clearly relate to the PR title/intent. Always verify the selected file exists before using it — stale or copied plan links in PR descriptions are common.
3. **Auto-discover.** Extract 2-3 keywords from the branch name (e.g., `feat/onboarding-skill` -> `onboarding`, `skill`). Glob `docs/plans/*` and filter filenames containing those keywords. If exactly one match, use it. If multiple matches or the match looks ambiguous (e.g., generic keywords like `review`, `fix`, `update` that could hit many plans), **skip auto-discovery** — a wrong plan is worse than no plan. If zero matches, skip.

**Confidence tagging:** Record how the plan was found:
- `plan:` argument -> `plan_source: explicit` (high confidence)
- Single unambiguous PR body match -> `plan_source: explicit` (high confidence)
- Multiple/ambiguous PR body matches -> `plan_source: inferred` (lower confidence)
- Auto-discover with single unambiguous match -> `plan_source: inferred` (lower confidence)

If a plan is found, read its **Requirements** section — `## Requirements` in current plans, `## Requirements Trace` in legacy ones — and the R-IDs (R1, R2, etc.) listed there, plus **Implementation Units** (current numeric subsections such as `### U1.`, `### U2.`, or `### Unit 1:` under `## Implementation Units`; legacy bullet or checkbox unit entries under that section also count). Store the extracted requirements list and `plan_source` for Stage 6. Do not block the review if no plan is found — requirements verification is additive, not required.

### Stage 3: Select reviewers

Read the diff and file list from Stage 1. The 4 always-on personas and 2 CE always-on agents are automatic. For each cross-cutting and stack-specific conditional persona in the persona catalog included below, decide whether the diff warrants it. This is agent judgment, not keyword matching.

**File-type awareness for conditional selection:** Instruction-prose files (Markdown skill definitions, JSON schemas, config files) are product code but do not benefit from runtime-focused reviewers. The adversarial reviewer's techniques (race conditions, cascade failures, abuse cases) target executable code behavior. For diffs that only change instruction-prose files, skip adversarial unless the prose describes auth, payment, or data-mutation behavior. Count only executable code lines toward line-count thresholds.

**`previous-comments` is PR-only AND comment-gated.** Only select this persona when both conditions hold:

1. Stage 1 gathered PR metadata (PR number or URL was provided as an argument, or `gh pr view` returned metadata for the current branch).
2. `hasPriorComments` from Stage 1 is true (the PR has at least one review submission or issue comment).

Skip it for standalone branch reviews with no associated PR, and skip it for PRs with no prior feedback yet -- there is nothing for the persona to verify, and a spawned subagent that returns empty findings still costs the full subagent startup overhead (persona spec, diff, schema, plus its own gh calls).

Stack-specific personas are additive when runtime behavior warrants them. A Hotwire UI change may warrant `julik-frontend-races`; a TypeScript API diff may warrant `api-contract` and `reliability`. Structural and maintainability concerns are handled by the always-on `maintainability` persona — do not spawn extra reviewers for convention or philosophy passes.

**`data-migration` spawn gate.** Select `ce-data-migration-reviewer` only when the diff includes at least one migration or schema artifact: `db/migrate/*`, `db/schema.rb`, `db/structure.sql`, Alembic/Flyway/Liquibase migration paths, or explicit backfill/data-transform scripts (rake tasks, one-off data migration classes). **Do not spawn** for model-only changes, query-only refactors, serializers/controllers that reference columns without a migration or schema dump in the diff, or migration tests alone.

For `ce-deployment-verification-agent`, use the same migration-artifact gate when the change is risky (destructive DDL, backfills, NOT NULL without default, column renames/drops).

Announce the team before spawning:

```
Review team:
- correctness (always)
- testing (always)
- maintainability (always)
- project-standards (always)
- ce-agent-native-reviewer (always)
- ce-learnings-researcher (always)
- security -- new endpoint in routes.rb accepts user-provided redirect URL
- julik-frontend-races -- Stimulus controller with async DOM updates
- data-migration -- adds migration 20260303_add_index_to_orders
- ce-deployment-verification-agent -- destructive migration with backfill
```

This is progress reporting, not a blocking confirmation.

### Stage 3b: Discover project standards paths

Before spawning sub-agents, find the file paths (not contents) of all relevant standards files for the `project-standards` persona. Use the native file-search/glob tool to locate:

1. Use the native file-search tool (e.g., Glob in Claude Code) to find all `**/CLAUDE.md` and `**/AGENTS.md` in the repo.
2. Filter to those whose directory is an ancestor of at least one changed file. A standards file governs all files below it (e.g., `plugins/compound-engineering/AGENTS.md` applies to everything under `plugins/compound-engineering/`).

Pass the resulting path list to the `project-standards` persona inside a `<standards-paths>` block in its review context (see Stage 4). The persona reads the files itself, targeting only the sections relevant to the changed file types. This keeps the orchestrator's work cheap (path discovery only) and avoids bloating the subagent prompt with content the reviewer may not fully need.

### Stage 4: Spawn sub-agents

#### Model tiering

Three reviewers inherit the session model with no override: `ce-correctness-reviewer`, `ce-security-reviewer`, and `ce-adversarial-reviewer`. These perform the highest-stakes analysis — logic bugs, security vulnerabilities, adversarial failure scenarios — and should run at whatever capability level the user has configured. If the user is on Opus, these get Opus.

All other persona sub-agents and CE agents use the platform's mid-tier model to reduce cost and latency. See the Spawning subsection below for the exact dispatch-time override — the imperative lives there so it lands at the point of action when spawning many agents in parallel.

The orchestrator (this skill) also inherits the session model; it handles intent discovery, reviewer selection, finding merge/dedup, and synthesis -- tasks that benefit from the same reasoning capability the user configured.

#### Run ID

Generate a unique run identifier before dispatching any agents. This ID scopes all agent artifact files and the post-review run artifact to the same directory.

```bash
RUN_ID=$(date +%Y%m%d-%H%M%S)-$(head -c4 /dev/urandom | od -An -tx1 | tr -d ' ')
mkdir -p "/tmp/compound-engineering/ce-code-review/$RUN_ID"
```

Pass `{run_id}` to every persona sub-agent so they can write their full analysis to `/tmp/compound-engineering/ce-code-review/{run_id}/{reviewer_name}.json`.

#### Spawning

Omit the `mode` parameter when dispatching sub-agents so the user's configured permission settings apply. Do not pass `mode: "auto"`.

**Model override at dispatch time.** Pass the platform's mid-tier model on every dispatch except `ce-correctness-reviewer`, `ce-security-reviewer`, and `ce-adversarial-reviewer`, which inherit the session model (per the Model tiering subsection above). In Claude Code, add `model: "sonnet"` to the `Agent` tool call. In Codex, pass the equivalent mid-tier on `spawn_agent` (e.g., `gpt-5.4-mini` as of April 2026). In Pi, pass the equivalent on `subagent` via the `pi-subagents` extension. On platforms where the dispatch primitive has no model-override parameter or the available model names are unknown, omit the override — a working review on the parent model beats a broken dispatch on an unrecognized name. Check this on every Agent / `spawn_agent` / `subagent` call in the parallel dispatch; omitting it on Opus sessions silently 3-4x's the cost of a review.

**Bounded parallel dispatch.** Respect the current harness's active-subagent limit. Queue selected reviewers, dispatch only as many as the harness accepts, and fill freed slots as reviewers complete. Treat active-agent/thread/concurrency-limit spawn errors as backpressure, not reviewer failure: leave the reviewer queued and retry after a slot frees. Record a reviewer as failed only after a successful dispatch times out/fails, or when dispatch fails for a non-capacity reason.

Spawn each selected persona reviewer using the subagent template included below. Each persona sub-agent receives:

1. Their persona file content (identity, failure modes, calibration, suppress conditions)
2. Shared diff-scope rules from the diff-scope reference included below
3. The JSON output contract from the findings schema included below
4. PR metadata: title, body, and URL when reviewing a PR (empty string otherwise). Passed in a `<pr-context>` block so reviewers can verify code against stated intent
5. Review context: intent summary, file list, diff, scope mode (`local-aligned` | `pr-remote` | `branch-remote`), and remote head ref (`PR_HEAD_REF` or `<branch-head-ref>`) when set
6. Run ID and reviewer name for the artifact file path
7. **For `project-standards` only:** the standards file path list from Stage 3b, wrapped in a `<standards-paths>` block appended to the review context
8. **For `data-migration` only:** the resolved review base ref from Stage 1 (`BASE:` marker), wrapped in `<review-base>` inside the review context so schema drift checks never assume `main`

Persona sub-agents are **read-only** with respect to the project: they review and return structured JSON. They do not edit project files or propose refactors. The one permitted write is saving their full analysis to the run-artifact path specified in the output contract (under `/tmp/compound-engineering/ce-code-review/<run-id>/`).

Read-only here means **non-mutating**, not "no shell access." Reviewer sub-agents may use non-mutating inspection commands when needed to gather evidence or verify scope, including read-oriented `git` / `gh` usage such as `git diff`, `git show`, `git blame`, `git log`, and `gh pr view`. In **`pr-remote`** or **`branch-remote`** scope (see Stage 1), inspect changed files via `git show <remote-head-ref>:<path>` or diff hunks — do not Read/Grep workspace paths for files in scope. They must not edit project files, change branches, commit, push, create PRs, or otherwise mutate the checkout or repository state.

Each persona sub-agent writes full JSON (all schema fields) to `/tmp/compound-engineering/ce-code-review/{run_id}/{reviewer_name}.json` and returns compact JSON with merge-tier fields only:

```json
{
  "reviewer": "security",
  "findings": [
    {
      "title": "User-supplied ID in account lookup without ownership check",
      "severity": "P0",
      "file": "orders_controller.rb",
      "line": 42,
      "confidence": 100,
      "autofix_class": "gated_auto",
      "owner": "downstream-resolver",
      "requires_verification": true,
      "pre_existing": false,
      "suggested_fix": "Add current_user.owns?(account) guard before lookup"
    }
  ],
  "residual_risks": [...],
  "testing_gaps": [...]
}
```

Detail-tier fields (`why_it_matters`, `evidence`) are in the artifact file only. `suggested_fix` is optional in both tiers -- included in compact returns when present so callers can apply fixes after review. If the file write fails, the compact return still provides everything the merge needs.

**CE always-on agents** (ce-agent-native-reviewer, ce-learnings-researcher) are dispatched as standard Agent calls through the same bounded parallel scheduler as the persona agents. Give them the same review context bundle the personas receive: entry mode, any PR metadata gathered in Stage 1, intent summary, review base branch name when known, `BASE:` marker, file list, diff, and `UNTRACKED:` scope notes. Do not invoke them with a generic "review this" prompt. Their output is unstructured and synthesized separately in Stage 6.

**CE conditional agents** (`ce-deployment-verification-agent` only) are dispatched as standard Agent calls through the same bounded parallel scheduler when the migration-artifact gate applies. Pass the same review context bundle plus the applicability reason (for example, which migration files triggered the agent). Their output is unstructured and must be preserved for Stage 6 synthesis just like the CE always-on agents. Schema drift is handled by the `data-migration` persona as structured findings — not here.

### Stage 5: Merge findings

Convert multiple reviewer compact JSON returns into one deduplicated, confidence-gated finding set. The compact returns contain merge-tier fields (title, severity, file, line, confidence, autofix_class, owner, requires_verification, pre_existing) plus the optional suggested_fix. Detail-tier fields (why_it_matters, evidence) are on disk in the per-agent artifact files and are not loaded at this stage.

`confidence` is one of 5 discrete anchors (`0`, `25`, `50`, `75`, `100`) with behavioral definitions in the findings schema. Synthesis treats anchors as integers; do not coerce to floats.

1. **Validate.** Check each compact return for required top-level and per-finding fields, plus value constraints. Drop malformed returns or findings. Record the drop count.
   - **Top-level required:** reviewer (string), findings (array), residual_risks (array), testing_gaps (array). Drop the entire return if any are missing or wrong type.
   - **Per-finding required:** title, severity, file, line, confidence, autofix_class, owner, requires_verification, pre_existing
   - **Value constraints:**
     - severity: P0 | P1 | P2 | P3
     - autofix_class: gated_auto | manual | advisory
     - owner: downstream-resolver | human | release
     - confidence: integer in {0, 25, 50, 75, 100}
     - line: positive integer
     - pre_existing, requires_verification: boolean
   - Do not validate against the full schema here -- the full schema (including why_it_matters and evidence) applies to the artifact files on disk, not the compact returns.
2. **Deduplicate.** Compute fingerprint: `normalize(file) + line_bucket(line, +/-3) + normalize(title)`. When fingerprints match, merge: keep highest severity, keep highest anchor, note which reviewers flagged it. Dedup runs over the full validated set (including anchor 50) so cross-reviewer promotion in step 3 can lift matching anchor-50 findings into the actionable tier.
3. **Cross-reviewer agreement.** When 2+ independent reviewers flag the same issue (same fingerprint), promote the merged finding by one anchor step: `50 -> 75`, `75 -> 100`, `100 -> 100`. Cross-reviewer corroboration is a stronger signal than any single reviewer's anchor; the promotion routes a previously-soft finding into the actionable tier or strengthens its already-actionable position. Note the agreement in the Reviewer column of the output (e.g., "security, correctness").
4. **Separate pre-existing.** Pull out findings with `pre_existing: true` into a separate list.
5. **Resolve disagreements.** When reviewers flag the same code region but disagree on severity, autofix_class, or owner, annotate the Reviewer column with the disagreement (e.g., "security (P0), correctness (P1) -- kept P0"). This transparency helps the user understand why a finding was routed the way it was.
6. **Normalize routing.** For each merged finding, set the final `autofix_class`, `owner`, and `requires_verification`. If reviewers disagree, keep the more conservative route. Remap any legacy `safe_auto` or `review-fixer` to `gated_auto` / `downstream-resolver`.
6b. **Mode-aware demotion of weak general-quality findings.** Some persona output is real signal but does not warrant primary-findings attention. Reroute it to the existing soft buckets so the primary findings table stays focused on actionable issues.

A finding qualifies for demotion when **all** of these hold:
   - Severity is P2 or P3 (P0 and P1 always stay in primary findings)
   - `autofix_class` is `advisory` (concrete-fix findings stay in primary)
   - **All** contributing reviewers are `testing` or `maintainability` — if any other persona also flagged this finding, cross-reviewer corroboration is present and the finding stays in primary findings regardless of its severity or advisory status (expand the weak-signal list later only with evidence)

When a finding qualifies:
   - Move demoted findings out of the primary set. If the contributing reviewer is `testing`, append `<file:line> -- <title>` to `testing_gaps`. If `maintainability`, append to `residual_risks`. Use title-only lines (compact return omits `why_it_matters`). Record the demotion count for Coverage.

Demotion is intentionally narrow. The conservative scope (testing/maintainability + P2/P3 + advisory) is the starting point; do not expand the rule by guessing which other personas overproduce noise. If real review runs show another persona consistently emitting weak signal, expand with evidence.

7. **Confidence gate.** After dedup, promotion, and demotion have shaped the primary set, suppress remaining findings below anchor 75. Exception: P0 findings at anchor 50+ survive the gate -- critical-but-uncertain issues must not be silently dropped. Record the suppressed count by anchor (so Coverage can report "N findings suppressed at anchor 50, M at anchor 25"). The gate runs late deliberately: anchor-50 findings need a chance to be promoted by step 3 (cross-reviewer corroboration) or rerouted by step 6b (mode-aware demotion to soft buckets) before any drop decision.
8. **Partition the work.** Build two sets:
   - actionable queue: `gated_auto` or `manual` findings whose owner is `downstream-resolver` (hand off to caller)
   - report-only queue: `advisory` findings plus anything owned by `human` or `release`
9. **Sort and number.** Order by severity (P0 first) -> anchor (descending) -> file path -> line number, then assign monotonically increasing `#` values across the full primary finding set in that sorted order. Do not restart numbering inside each severity table or autofix/routing bucket. If later sections repeat a finding (for example Actionable Findings), reuse the same stable `#` so users and downstream workflows can reference findings by `#` across the report and caller handoff.
10. **Collect coverage data.** Union residual_risks and testing_gaps across reviewers.
11. **Preserve CE agent artifacts.** Keep the learnings, agent-native, and deployment-verification outputs alongside the merged finding set. Do not drop unstructured agent output just because it does not match the persona JSON schema. Schema drift from `data-migration` is already in the merged finding set.

### Stage 5b: Validation pass (optional quality gate)

Independent verification gate. Spawn one validator sub-agent per surviving finding using `references/validator-template.md`. Findings the validator rejects are dropped; confirmed findings flow through unchanged.

**When this stage runs:** After Stage 5 whenever at least one finding survives. Skip only when zero findings survive. When more than 15 survive, do **not** skip the stage — validate the highest-severity 15 per step 2 and record the over-budget remainder in Coverage. **P0 and P1 findings are always validated** (never dropped for budget); if P0/P1 alone exceed 15, raise the cap to cover all of them rather than ship an unvalidated critical or high finding. Same rule for default and `mode:agent`.

**Steps:**

1. **Select findings to validate.** All survivors of Stage 5.
2. **Apply dispatch budget cap.** If the selected set exceeds 15 findings, validate the highest-severity 15 (P0 first, then P1, then P2, then P3, breaking ties by anchor descending), dropping only from the P2/P3 tail. **Never drop a P0 or P1 from validation** — if P0/P1 findings alone exceed 15, raise the cap to include all of them. Record the over-budget count (the dropped P2/P3 tail) for the Coverage section. Dropping the low-severity tail is intentional; the long tail of P2/P3 does not change the user's triage, but an unvalidated critical or high finding does.
3. **Spawn validators with bounded parallelism.** One sub-agent per finding, dispatched independently using the validator template and the same bounded scheduler from Stage 4. Each validator receives:
   - The finding's title, severity, file, line, suggested_fix, original reviewer name, and confidence anchor
   - `why_it_matters` when available — loaded from the per-agent artifact file at `/tmp/compound-engineering/ce-code-review/{run_id}/{reviewer_name}.json`; omit when the file is absent or the artifact write failed. The validator proceeds without it, using the diff and cited code directly.
   - The full diff
   - The scope mode and remote head ref, mirroring the Stage 4 reviewer bundle: inject `<pr-scope-mode>local-aligned | pr-remote | branch-remote</pr-scope-mode>` and, when set, `<pr-head-ref>...</pr-head-ref>` or `<branch-head-ref>...</branch-head-ref>`. The validator template defaults to local-aligned workspace inspection when these are absent, so omitting them in `pr-remote`/`branch-remote` makes validators verify findings against the stale working tree — dropping valid findings or confirming false ones on the wrong tree.
   - Inspection access scoped by mode: in `local-aligned`, Read/Grep/git blame the cited code, callers, guards, framework defaults, and history; in `pr-remote`/`branch-remote`, inspect via `git show <remote-head-ref>:<path>` or the provided diff hunks only — do not Read/Grep workspace paths for files in scope.
4. **Collect verdicts.** Each validator returns `{ "validated": true | false, "reason": "<one sentence>" }`.
   - `validated: true` -> finding survives unchanged into Stage 6
   - `validated: false` -> finding is dropped; record the validator's reason in Coverage
   - Validator **infrastructure** failure (timeout, dispatch error, malformed JSON — not a `validated:false` verdict): for **P2/P3**, drop the finding with reason "validator failed" (conservative bias). For **P0/P1**, do **not** drop on infra failure — keep the finding and mark its validation **degraded** (note in Coverage). A transient validator failure must never silently remove a critical/high finding; a genuine `validated:false` rejection above still drops at any severity.
5. **Use mid-tier model for validators.** Same model class (sonnet) the persona reviewers use. Validators are read-only — same constraints as persona reviewers. They may use non-mutating inspection commands (Read, Grep, Glob, git blame, gh).
6. **Record metrics for Coverage.** Total dispatched, validated true count, validated false count (with reasons), infra failures (and any P0/P1 kept-on-failure as degraded), and over-budget drops.

**Orchestrator direct verification (complement, not a skip).** When a finding's severity hinges on a fact the orchestrator can check cheaply and authoritatively — a pinned dependency's source, a wiring/config fact in this repo, a build tag — verify it directly in addition to (not instead of) the validator subagent; a first-party source read is stronger than a subagent re-read. Use single-purpose native tools (Read/Grep/Glob, one git command at a time), never chained or error-suppressed shell. Fold confirmed facts into synthesis and note them in Coverage. This never replaces the validator wave for P0/P1 — those still get an independent validator per the cap rule above.

**Why per-finding bounded dispatch (not batched):** Independence is the point. A single batched validator looking at all findings together pattern-matches across them and recreates the persona-bias problem. Per-finding dispatch preserves fresh context while the scheduler respects harness limits. Per-file batching is a plausible future optimization for reviews with many findings clustered in few files; not implemented today.

### Stage 5c: Act on findings (default mode only)

**Skip entirely in `mode:agent`** — that mode is a machine handoff and the caller owns apply. In default (interactive) mode the review is the top-level agent, so it applies the fixes it is confident in before presenting the report.

**Act policy (bias to act).** Default to applying every finding that is a clear improvement and a reversible edit, regardless of severity. The work is a tracked, visible diff that can be reverted — so leaving a clean fix unapplied "to be safe" is the failure mode, not the safe choice. Decide by judgment, not a safety checklist:

- **Apply** clear improvements — the common case (test hardening, dead-code removal, a localized fix with a concrete `suggested_fix`).
- **Push back** — do not apply — when the reviewer is wrong; keep the finding and state the disagreement with reasoning.
- **Skip with judgment** taste calls and conflicting suggestions, but surface what was skipped and why. Never silently drop.

Severity, confidence, and cross-reviewer agreement tell you what to do first and what to flag loudly — they do not gate the decision. There is no deny-list: a code-review fix is an edit to a tracked tree, reversible by construction, so downside is controlled after the fact (revert + visible diff + the commit checkpoint), not by a precondition.

**Scope invariant.** Apply only when the working tree *is* what was reviewed — `local-aligned` or standalone. In `pr-remote` / `branch-remote` the working tree is not the reviewed head; do not apply — report instead.

**Verify, then keep.** After applying, run the affected tests and lint (targeted by default; broaden when fixes span files). If they fail, revert that fix and report it as a finding instead — an unverified fix is not finished. Never leave the tree red.

**Commit when the pre-review tree was clean.** Before applying, note whether the working tree already had uncommitted changes (`git status --porcelain`). The permanence gate is the **push**, not the commit — a local commit is private and reversible (`git reset --soft HEAD~1`).

- **Clean before the review:** after applying and verifying, commit the fixes as one isolated `fix(review): <summary>` commit. The only changes are the review's own, so the commit is purely the fixes — labeled and reversible — and it returns the tree to a known state instead of leaving a dangling uncommitted obligation the user has to track.
- **Dirty before the review:** apply but do **not** commit. The fixes are interleaved with the user's in-flight work, so a fix-only commit can't be cleanly isolated; they ride along with the commit the user was already going to make. The Applied section lists what changed.
- **Never push, open a PR, or file tickets** — that's the outward-facing step the user owns.

(In `mode:agent` Stage 5c is skipped: the review applies and commits nothing; the caller applies and commits.)

**Surface green-but-unverifiable edits.** When an applied fix touches auth/authz, a public or cross-service contract/schema, or concurrency/ordering, a passing test does not prove safety — flag it prominently in the Applied section so the diff reviewer's attention goes there.

### Stage 6: Synthesize and present

Assemble the final report. **Default:** pipe-delimited markdown tables for findings (mandatory — see review output template). **`mode:agent`:** skip markdown and emit JSON (see ### JSON output format). Other sections (Actionable Findings, Learnings, Coverage, etc.) use bullets and `---` before the verdict in markdown mode only.

**Before writing the report, load `references/review-output-template.md` and mirror it** — that file is the canonical skeleton (full per-section structure). The block below is the always-loaded fallback so the shape survives a long session even if the template was not reloaded.

**Findings table shape (default mode — load-bearing, do not improvise).** Every finding is a row in a pipe-delimited table grouped by severity, with a **terse** `Issue` cell; depth goes in a keyed detail line under the table. Copy this shape; do not invent a layout:

| # | File | Issue | Reviewer | Confidence |
|---|------|-------|----------|------------|
| 1 | `path/to/file.go:42` | One terse line — the scannable index | correctness | 100 |

- **#1** — full explanation here (why it matters + concrete fix direction), as a keyed detail line under the table.

Per-severity tables are **5 columns** — `Route` is not shown here (it appears only in the Actionable Findings table and the JSON). Keep the `Issue` cell to **one short clause** (roughly 12 words or fewer, no second sentence, no because/so/which explanation) — it is the scannable index, not the explanation. The moment a cell wants a comma-plus-clause or a reason, move that depth into the **keyed detail line** (`- **#N** — …`) instead of packing it in — usually for P0/P1; P2/P3 are typically terse-only.

**Never produce these shapes (instant fail — if you catch one mid-draft, re-render before delivering):**
- A finding's index rendered as `Field:`-prefixed blocks (`Sev:` / `File:` / `Issue:` / `Route:` lines) — depth goes in the keyed detail line, never a field block
- Per-finding separators made of horizontal rules or box-drawing characters (`────`, `———`)
- The severity index as a plain bulleted/numbered list **instead of** a table (the keyed `- **#N** —` detail line under a table is a supplement, not a replacement — that is expected)
- Unicode separators or arrows in cells (middot `·`); use ASCII `->`
- **Inconsistent treatment across severities** (e.g. P1 as blocks while P2/P3 are tables) — every severity uses the same table + optional detail-line shape

1. **Header.** Scope, intent, mode, reviewer team with per-conditional justifications.
2. **Applied (default mode only).** When Stage 5c applied fixes, list them first — before the findings tables — in an Applied section (see review output template): `# | File | Fix | Reviewer`, then a one-line validation outcome (e.g. "pin tests 4 -> 6; suite 94 pass, lint clean") and commit status (committed as `fix(review): …` on a clean tree, or left uncommitted for the user on a dirty one). Flag green-but-unverifiable edits (auth/contract/concurrency) prominently. Omit this section in `mode:agent` and when nothing was applied. Applied findings appear here, not in the severity tables.
3. **Findings.** Pipe-delimited tables grouped by severity (`### P0 -- Critical`, `### P1 -- High`, `### P2 -- Moderate`, `### P3 -- Low`), terse `Issue` cell (one short clause — depth goes in the detail line), 5 columns (`#`, file, issue, reviewer(s), confidence) — route is **not** shown here (it's in Actionable Findings and the JSON). Under each table, add a keyed detail line (`- **#N** — …`) for findings whose one-liner is not self-sufficient (usually P0/P1). Omit empty severity levels. Use the **same** shape for every severity — never render one severity as field-blocks and another as a table. Finding numbers come from the stable assignment in Stage 5 -- never re-derive them per severity table.
4. **Requirements Completeness.** Include only when a plan was found in Stage 2b. For each requirement (R1, R2, etc.) and implementation unit in the plan, report whether corresponding work appears in the diff. Use a simple checklist: met / not addressed / partially addressed. Routing depends on `plan_source`:
   - **`explicit`** (caller-provided or PR body): Flag unaddressed requirements or implementation units as P1 findings with `autofix_class: manual`, `owner: downstream-resolver`. These enter the actionable queue.
   - **`inferred`** (auto-discovered): Flag unaddressed requirements or implementation units as P3 findings with `autofix_class: advisory`, `owner: human`. These stay in the report only — no autonomous follow-up. An inferred plan match is a hint, not a contract.
   Omit this section entirely when no plan was found — do not mention the absence of a plan.
5. **Actionable Findings.** Include when the actionable queue is non-empty — findings the caller should address (`gated_auto` / `manual` with `downstream-resolver`), plus anything Stage 5c chose not to apply. In default mode, findings already applied appear in the Applied section, not here.
6. **Pre-existing.** Separate section, does not count toward verdict.
7. **Learnings & Past Solutions.** Surface ce-learnings-researcher results: if past solutions are relevant, flag them as "Known Pattern" with links to docs/solutions/ files.
8. **Agent-Native Gaps.** Surface ce-agent-native-reviewer results. Omit section if no gaps found.
9. **Deployment Notes.** If ce-deployment-verification-agent ran, surface the key Go/No-Go items: blocking pre-deploy checks, the most important verification queries, rollback caveats, and monitoring focus areas. Keep the checklist actionable rather than dropping it into Coverage. Schema drift appears in the findings tables as `data-migration` P1 rows — do not add a separate Schema Drift section.
10. **Coverage.** Applied count (when Stage 5c ran), suppressed count by anchor (e.g., "N findings suppressed at anchor 50, M at anchor 25"), mode-aware demotion count, validator drop count and reasons (when Stage 5b ran), any P0/P1 with degraded validation (kept on validator infra failure), validator over-budget drops (when the 15-cap fired), residual risks, testing gaps, failed/timed-out reviewers, and inferred-intent uncertainty when applicable.
11. **Verdict.** Ready to merge / Ready with fixes / Not ready. Fix order if applicable. When an `explicit` plan has unaddressed requirements or implementation units, the verdict must reflect it — a PR that's code-clean but missing planned requirements is "Not ready" unless the omission is intentional. When an `inferred` plan has unaddressed requirements or implementation units, note it in the verdict reasoning but do not block on it alone.

Do not include time estimates.

**Format verification (default only — last gate before delivering).** Scan the assembled report for the failure signatures above: if any severity's finding index appears as `Field:`-prefixed lines, as a plain bulleted/numbered list replacing the table, separated by `────`/box-drawing/middot `·` characters, or if severities are rendered inconsistently (one as blocks, another as tables), STOP and re-render every severity as the same pipe-delimited table (`| # | File | Issue | ... |`) before delivering. The keyed `- **#N** —` detail line under a table is expected — do not flag it. Skip this check only when `mode:agent` is active — JSON is the deliverable.

### JSON output format (`mode:agent` only)

Emit **one raw JSON object** as the primary response — a single bare JSON value, **no markdown code fence**. A leading ```` ```json ```` fence makes the response start with backticks and breaks naive `JSON.parse` consumers, so never wrap it. Also write `review.json` under `/tmp/compound-engineering/ce-code-review/<run-id>/` with the same payload.

`mode:agent` does not apply fixes — the caller does — so there is no `applied_fixes` field; the handoff is `actionable_findings`. Applied work surfaces only in the default-mode markdown Applied section (Stage 5c/6).

Minimum shape:

```json
{
  "status": "complete",
  "verdict": "Ready to merge | Ready with fixes | Not ready",
  "scope": {
    "base": "<merge-base sha, pr:NNN marker, or base: ref>",
    "branch": "<current branch name>",
    "head_sha": "<git rev-parse HEAD>",
    "pr_url": "<url or null>",
    "files_changed": 0
  },
  "intent": "<2-3 line summary>",
  "intent_confidence": "explicit | inferred | uncertain",
  "reviewers": ["correctness", "security"],
  "findings": [],
  "actionable_findings": [],
  "pre_existing_findings": [],
  "requirements_completeness": null,
  "learnings": [],
  "agent_native_gaps": [],
  "deployment_notes": [],
  "residual_risks": [],
  "testing_gaps": [],
  "coverage": {},
  "artifact_path": "/tmp/compound-engineering/ce-code-review/<run-id>/",
  "run_id": "<run-id>"
}
```

Each object in `findings` uses the merged finding fields: `#`, `title`, `severity`, `file`, `line`, `confidence`, `autofix_class`, `owner`, `requires_verification`, `pre_existing`, `suggested_fix`, `why_it_matters`, `evidence`, `reviewers`.

`actionable_findings` lists the `gated_auto` / `manual` + `downstream-resolver` subset with the same fields plus stable `#`.

On failure before review completes, set `"status": "failed"` and `"reason": "<one sentence>"`. When all reviewers fail, use `"status": "degraded"` with a reason. When a PR skip rule fires (closed/merged/trivial), use `"status": "skipped"` with the skip reason. Do not emit markdown tables when `mode:agent` is active.

## Quality Gates

Before delivering the review, verify:

1. **Every finding is actionable.** Re-read each finding. If it says "consider", "might want to", or "could be improved" without a concrete fix, rewrite it with a specific action. Vague findings waste engineering time.
2. **No false positives from skimming.** For each finding, verify the surrounding code was actually read. Check that the "bug" isn't handled elsewhere in the same function, that the "unused import" isn't used in a type annotation, that the "missing null check" isn't guarded by the caller.
3. **Severity is calibrated.** A style nit is never P0. A SQL injection is never P3. Re-check every severity assignment.
4. **Line numbers are accurate.** Verify each cited line number against the file content. A finding pointing to the wrong line is worse than no finding.
5. **Protected artifacts are respected.** Discard any findings that recommend deleting or gitignoring files in `docs/brainstorms/`, `docs/plans/`, or `docs/solutions/`.
6. **Findings don't duplicate linter output.** Don't flag things the project's linter/formatter would catch (missing semicolons, wrong indentation). Focus on semantic issues.

## Language-Aware Conditionals

This skill uses stack-specific reviewer agents when the diff touches runtime behavior those stacks specialize in (async UI races, iOS/Swift lifecycle). Structural quality — complexity deletion, 1k-line regressions, spaghetti growth, type-boundary leaks — lives in the always-on `ce-maintainability-reviewer`. Do not spawn extra reviewers for language conventions, philosophy, or "strict bar" passes; that signal is folded into maintainability.

Do not spawn stack reviewers mechanically from file extensions alone. The trigger is meaningful changed behavior in that stack's runtime domain.

## After Review

After Stage 6, stop. Never push, open PRs, or file tickets from this skill. In default (interactive) mode, Stage 5c has applied the safe fixes (Applied section) — committed as an isolated `fix(review):` commit when the tree was clean, or left for the user's commit when it wasn't. In `mode:agent` the review mutates nothing — the caller (for example `ce-work`) and the user apply fixes, file tickets, or accept residual risk using the report and artifact.

### Emit actionable findings summary (default mode only)

After Stage 6 **in default mode**, emit a compact **Actionable Findings** summary for callers:

- List each actionable finding (`gated_auto` or `manual` with `downstream-resolver`) with stable `#`, severity, file:line, title, `autofix_class`, whether `suggested_fix` is present, and `confidence`.
- Include the run-artifact path when one was written: `/tmp/compound-engineering/ce-code-review/<run-id>/`
- When the actionable queue is empty, state `Actionable findings: none.` explicitly.

In `mode:agent` do **not** emit this markdown summary — the actionable findings are carried solely by the `actionable_findings` field of the JSON object. Emit nothing after the JSON object, so the response stays a single parseable JSON value.

Do not run post-review triage (no per-finding walk-through, bulk ticket filing, or routing questions). The report and summary are the complete handoff.

### Mode-specific completion

| Mode | After Stage 6 + actionable summary |
|------|-----------------------------------|
| **Default** | Markdown tables + Actionable Findings summary. |
| **`mode:agent`** | JSON object + `review.json` in run artifact dir. |

Do not offer push/PR/create-branch next steps from this skill.

#### Run artifacts

Always write run artifacts under `/tmp/compound-engineering/ce-code-review/<run-id>/`:

- synthesized findings
- actionable findings list
- advisory outputs
- per-agent `{reviewer_name}.json` from Stage 4

`metadata.json` minimum fields:

```json
{
  "run_id": "<run-id>",
  "branch": "<git branch --show-current at dispatch time>",
  "head_sha": "<git rev-parse HEAD at dispatch time>",
  "verdict": "<Ready to merge | Ready with fixes | Not ready>",
  "completed_at": "<ISO 8601 UTC timestamp>"
}
```

Capture `branch` and `head_sha` at dispatch time (no in-skill fixes will land afterward).

## Fallback

If the platform doesn't support parallel sub-agents, run reviewers sequentially. If the platform supports sub-agents but caps active concurrency, use the bounded queueing rules in Stage 4 rather than treating cap-related spawn failures as reviewer failures. Everything else (stages, output format, merge pipeline) stays the same.

---

## Included References

### Persona Catalog

@./references/persona-catalog.md

### Subagent Template

@./references/subagent-template.md

### Diff Scope Rules

@./references/diff-scope.md

### Action class rubric

@./references/action-class-rubric.md

### Findings Schema

@./references/findings-schema.json

### Review Output Template

@./references/review-output-template.md
