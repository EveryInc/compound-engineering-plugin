---
name: ce-code-review
description: "Structured code review for bugs, regressions, tests, and standards. Use before PRs or when asked for review; report-only by default, with explicit local apply available for user-directed fix workflows."
argument-hint: "[mode:agent] [apply:local] [blank to review current branch, or provide PR link]"
---

# Code Review

Reviews code changes using dynamically selected reviewer personas. Dispatches bounded specialist subagents that return structured JSON, then merges and deduplicates findings into a single report.

## When to Use

- Before creating a PR
- After completing a task during iterative implementation
- When feedback is needed on any code changes
- Can be invoked standalone
- Can run inside larger workflows; use `mode:agent` when the caller needs JSON instead of markdown tables

## Artifact Root

This skill discovers plans under `<root>/plans/`, scans learnings under `<root>/solutions/`, and passes the resolved root to `review-scope.py` (`--docs-root`) and to its persona subagents. Resolve `<root>` before you first compose a `<root>/` path or the `--docs-root "<root>"` argument (per the block below), and substitute it everywhere those appear.

<!-- ce-docs-root:start -->
**Resolve the CE artifact root `<root>` before composing any artifact path.**

- **Read** `docs_root` from `<repo-root>/.compound-engineering/config.local.yaml`, then `config.yaml`; first non-empty value wins (`<repo-root>` = `git rev-parse --show-toplevel`). Unset -> `<root>` is `docs`, exactly as before.
- **Validate** a set value: a repo-relative directory whose real, symlink-resolved path stays inside the repo and is neither the repo root nor under `.git/`. Otherwise stop with an error naming `docs_root` and the value -- never fall back to `docs`.
- **Use** `<root>` as the sole artifact location: create it if absent, compose each path as `<root>/<subdir>` with this skill's own subdirectory, and never also read `docs`.
<!-- ce-docs-root:end -->

## Execution spine

Follow these boundaries in order; references supply the detail but never change the order:

1. Resolve the reviewed diff and intent.
2. Read `references/persona-catalog.md`, then select the risk-driven reviewer roster and discover applicable standards paths. Do not select or dispatch personas without that catalog load.
3. When adversarial is selected for a local reviewed tree, start and persist the sanctioned cross-model job **before any local persona dispatch**. Invoking this skill authorizes its configured/allowlisted peer route after the required recipient-and-code-egress disclosure; do not ask for a second confirmation or skip merely because the user did not separately repeat that authorization. An explicit user prohibition on external review still wins. A started peer replaces the local adversarial persona; only an actual scope, allowlist, availability, authentication, or start failure leaves the local fallback.
4. Before any local dispatch, read `references/dispatch-reviewers.md`; if it is not loaded, stop and load it. Then dispatch the materialized local roster as a foreground concurrent batch sized to the host's active-agent cap — spawn multiple reviewers in one message with background execution off where the harness runs same-message calls concurrently, and collect every reviewer before synthesis (one blocking wait on Claude-style harnesses; repeated non-polling collection waits on async `spawn_agent` harnesses); degrade to serial where it does not. Detaching local review into a polled background job is forbidden; the cross-model peer is the only detached work and overlaps with this batch. Shell no-ops and wakeup polling are forbidden.
5. After the reviewer returns are ready, read `references/finish-review.md`; if it is not loaded, stop and load it. Fold in the peer once, run the documented findings mechanics, run every validator the reference selects, and only then return the report. Never synthesize directly from raw reviewer artifacts. The exact Actionable Findings, Coverage, and Verdict completion fields are required. When a peer ran, Coverage must record its route plus the literal keyed fields `model_requested`, `model_actual`, `effort_requested`, `effort_actual`, `receipt_supported`, and `independence_verified` from the artifact; never shorten that tuple to a model family or vague "high reasoning" claim. In the multi-agent path, emit only this skill's report; do not also invoke a harness-native findings/reporting tool. The native review tool belongs only to the explicit Quick Review Short-Circuit. Bare and `mode:agent` reviews never apply fixes; only explicit `apply:local` can enter the apply stage.

Bundled helper contracts in the stage references are authoritative. Run the documented commands directly; do not inspect helper source, grep model mappings, dry-run adapters, or probe `--help` unless a documented command actually fails with an incompatibility.

## Task Visibility

For the multi-agent path, once the review scope is resolved, use the platform's task-tracking capability when available to show a short user-facing view derived from the execution spine. Track review outcomes, not individual personas, setup mechanics, or tool calls; add conditional work only when its gate fires, and update the view at meaningful transitions. If no task-tracking capability is available, continue with the normal progress and final report without simulating a task list in chat.

## Argument Parsing

Parse the arguments you were invoked with for optional tokens. Strip each recognized token before interpreting the remainder as a PR number, GitHub URL, or branch name.

| Token | Example | Effect |
|-------|---------|--------|
| `mode:agent` | `mode:agent` | **Report-only**: return **JSON** instead of markdown tables and skip the Stage 5c apply (the caller applies). Does not change reviewer selection, merge logic, or scope rules (see Output format) |
| `mode:headless` | `mode:headless` | **Deprecated alias** for `mode:agent` |
| `mode:report-only` | `mode:report-only` | **Deprecated — ignored.** Former no-artifacts mode; default behavior is review-only without checkout |
| `apply:local` | `apply:local` | Explicitly authorize Stage 5c to apply verified findings to the reviewed local checkout. This is authority, not an output mode; bare review remains report-only. |
| `base:<sha-or-ref>` | `base:abc1234` or `base:origin/main` | Diff base on the **current checkout** (explicit; skips auto base detection) |
| `plan:<path>` | `plan:<root>/plans/2026-03-25-001-feat-foo-plan.md` | Plan file for requirements verification (explicit). Supports markdown and HTML unified plans. |
| `depth:full` | `depth:full` | **Force the full reviewer roster** — skip the Stage 3c small-diff lite path so every always-on persona runs regardless of diff size. Use when a deep/thorough review is explicitly requested (the one escalation signal Stage 3c cannot infer from the diff). Does not change conditional selection, merge, or scope. |
| `depth:auto` | `depth:auto` | **Default** — self-right-size via Stage 3c (lite roster for trivial, low-risk, code-only diffs; full roster otherwise). |
| `grouping:auto` | `grouping:auto` | **Default** — build thematic triage groups when findings span distinct concerns (Stage 5 step 9b) |
| `grouping:off` | `grouping:off` | Suppress triage groups: no Triage Groups section, empty `triage_groups` in JSON |
| `grouping:always` | `grouping:always` | Always build triage groups, even for small reviews |

**Grouping is presentation, not a mode.** The `grouping:` tokens change how the finding set is organized for triage — never reviewer selection, merge logic, scope rules, or the Stage 5c apply decision.

**Mode alias:** `mode:headless` normalizes to `mode:agent`. `mode:agent` + `mode:headless` is not a conflict.

**Conflicting arguments:** Stop without dispatching reviewers when:
- Multiple incompatible scope selectors appear together (e.g. `base:` **and** a PR number/branch target — `base:` means "review the current checkout against this base")
- Multiple distinct `mode:` tokens other than the `mode:agent`/`mode:headless` alias pair
- `apply:local` together with `mode:agent` — pipeline handoffs are always report-only
- Multiple distinct `grouping:` tokens (e.g. `grouping:off` **and** `grouping:always`)

Deprecated `mode:autofix` is **not** a conflict — ignore the token and proceed with the normal flow (see below).

Emit a one-line failure reason. In `mode:agent`, return JSON: `{"status":"failed","reason":"..."}`.

## Operating principles

Same review pipeline for default and `mode:agent`:

- **Report-only by default; never push.** A bare `ce-code-review` invocation produces findings and does not apply them. Local mutation requires `apply:local` or an explicit user request in the invoking prompt to apply/fix this review's findings. `mode:agent` never mutates the tree, even when nested inside a workflow that later applies findings. Never push, open PRs, or file tickets in any mode.
- **No blocking prompts.** Never use `AskUserQuestion`, `request_user_input`, `ask_user`, or other blocking question tools. Infer intent, plan, and scope from explicit tokens, git state, PR metadata, and conversation. Note uncertainty in Coverage or the verdict — do not stop to ask.
- **Explicit mutations only.** Never run `gh pr checkout`, `git checkout`, `git switch`, or similar branch-switch commands. Passing a PR number, URL, or branch name selects **review scope**, not permission to mutate the working tree. To review local uncommitted work on a feature branch, check out that branch yourself (or stay on it) and pass `base:` or no target.
- **Smart defaults.** Untracked files: review tracked changes only and list excluded paths in Coverage. Plan: use `plan:` when passed; otherwise discover conservatively from PR body or branch keywords. Weak advisory P2/P3 from testing/maintainability alone: demote to `testing_gaps` / `residual_risks` per Stage 5.
- **Report outcomes, not machinery.** What you show the user is about the review: what's being examined (the PR/branch), which coverage is included and the one-line reason for each conditional lens, the independent cross-model pass and which model runs it, and the findings. Keep the skill's internals out of user-facing text — model-tier assignments, raw scope-mode codenames (`local-aligned`/`pr-remote`), staging the diff to disk, loading persona files, parallel-dispatch bookkeeping, and step-by-step narration of your own setup. Name what the user would recognize (a PR number, a reviewer's concern, a peer model), not the plumbing. This governs *what* you surface and suppress; it does not script the wording — use your own voice.

## Output format

| Invocation | Deliverable |
|------------|-------------|
| **Default** | Report-only markdown (pipe-delimited finding tables) + Actionable Findings summary |
| **Explicit local apply** | The same markdown report plus verified local fixes and an Applied section |
| **`mode:agent`** | One JSON object (see ### JSON output format below) + the same `/tmp/.../ce-code-review/<run-id>/` artifacts |

Default and `mode:agent` are **report-only**. `mode:agent` changes only the serialization from markdown to JSON for programmatic callers; it does not change reviewer selection, merge logic, or scope rules. `apply:local` is separate mutation authority, not an output mode. The default markdown is the human view; keep it ASCII-safe (pipe tables, `->` not middot `·`, no box-drawing) so it degrades gracefully across terminals.

## Quick Review Short-Circuit

If the invocation arguments indicate the user wants a quick, fast, or light code review — and **`mode:agent` is not active** — do not dispatch the multi-agent flow.

**Announce the chosen path** before any other work (Quick review vs Multi-agent review). Skip this announcement when `mode:agent` is active.

Sequence:

1. **Run the harness's built-in code review.** Forward any review target after stripping tokens. Then stop — do not dispatch the multi-agent pipeline.
2. **Exemption:** If no built-in review exists, continue into the full multi-agent review.
3. **`mode:agent` bypasses this short-circuit** — always run the full multi-agent review and return JSON.

**Deprecated:** `mode:autofix` is no longer supported. If passed, ignore it and proceed report-only; it does not grant local apply authority.

## Severity Scale

All reviewers use P0-P3:

| Level | Meaning | Action |
|-------|---------|--------|
| **P0** | Critical breakage, exploitable vulnerability, data loss/corruption | Must fix before merge |
| **P1** | High-impact defect likely hit in normal usage, breaking contract | Should fix |
| **P2** | Moderate issue with meaningful downside (edge case, perf regression, maintainability trap) | Fix if straightforward |
| **P3** | Low-impact, narrow scope, minor improvement | User's discretion |

## Action Routing

Severity answers **urgency**. `autofix_class` and `owner` are **signal** describing follow-up shape for callers; this metadata does not grant apply permission. Apply authority is separate, explicit, and checked before Stage 5c. See `references/action-class-rubric.md` for persona guidance.

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

Reviewer personas are selected in layers. The persona catalog in `references/persona-catalog.md` (read it at Stage 3) has the full selection criteria and spawn gates. Each selected reviewer is a generic subagent seeded with a local prompt file from `references/personas/`; do not dispatch standalone agents by type/name.

**Core (always-on):** `correctness-reviewer`.

**Standards conditional:** `project-standards-reviewer` runs only when Stage 3b finds at least one applicable standards file. An empty successful search is a disclosed skip, because this persona is not allowed to invent standards beyond those files.

**Generic conditional:**

- `testing-reviewer` — test files, test infrastructure, mocks, fixtures, or harness behavior changed; or the diff changes meaningful runtime behavior without corresponding test work. Behavioral triggers include new or changed branches, state mutation, API/control-flow behavior, and error handling. Production-file presence alone and non-behavioral edits do not select it.
- `maintainability-reviewer` — a large or structural diff: substantial refactor, new abstractions, file moves, coupling/type-boundary changes, or at least 200 executable changed lines.
- `agent-native-reviewer` — an agent-facing feature or surface changed (skills, agents, prompts, tools, MCP, commands, or a product capability expected to be accessible to agents).
- `learnings-researcher` — `<root>/solutions/` exists and a cheap path/title search finds a plausible match for the changed modules or patterns. The existence of a corpus alone is not enough.

**Cross-cutting conditional (per diff):**

- `security-reviewer` — auth, public endpoints, user input, permissions
- `performance-reviewer` — DB queries, data transforms, caching, async
- `api-contract-reviewer` — routes, serializers, type signatures, versioning
- `data-migration-reviewer` — migration files / schema dumps / backfills (see spawn gate in Stage 3)
- `reliability-reviewer` — error handling, retries, timeouts, background jobs
- `adversarial-reviewer` lens — >=50 changed code lines, or auth / payments / persistence writes / event publication / retry or concurrency semantics / external APIs, or a **silent-pass verification mechanism** regardless of size. Satisfy this lens with the independent cross-model adversarial pass when a sanctioned peer job starts successfully. Dispatch the in-process `adversarial-reviewer` only as the fallback when the peer cannot start; do not run both same-brief reviews.
- `previous-comments-reviewer` — PR with existing review comments (PR-only, comment-gated)

**Stack-specific conditional (per diff):** `julik-frontend-races-reviewer` (Stimulus/Turbo, DOM events, async UI) and `swift-ios-reviewer` (Swift/SwiftUI/UIKit, entitlements, Core Data, `.pbxproj`).

**CE conditional (migration-specific):** local prompt asset `deployment-verification-agent` — deployment checklist + rollback when the migration gate applies and the change is risky.

## Review Scope

A full review always spawns correctness, adds project-standards when applicable files exist, then adds only the generic, cross-cutting, stack-specific, and CE conditionals justified by the diff. `depth:full` disables the small-diff lite path; it does not invent irrelevant domains. A Rails auth feature might add security, reliability, and adversarial while still skipping agent-native and learnings when those surfaces are absent.

## Protected Artifacts

Compound-engineering pipeline artifacts must never be flagged for deletion, removal, or gitignore by any reviewer. A protected artifact is any file **under** a `plans/`, `solutions/`, or legacy `brainstorms/` directory **whose immediate parent is the artifact root** — a directory named `docs` (the default, and where unmigrated legacy artifacts stay even after a project sets `docs_root`) or the configured `docs_root` when this run resolved it:

- `plans/` under the artifact root -- unified plan artifacts created by ce-brainstorm or ce-plan (decision artifacts; execution progress is derived from git, not stored in plan bodies)
- `solutions/` under the artifact root -- solution documents created during the pipeline (categories nest, e.g. `solutions/<category>/foo.md`)
- the legacy `brainstorms/` -- requirements documents created by older ce-brainstorm versions

Matching by the immediate parent covers nested category files while leaving a same-named directory elsewhere — a skill's own `references/personas/` prompt assets, parented by `references` — as ordinary code whose deletion finding stands. A run that never resolved a configured root still protects the `docs`-parented tree; a configured-root artifact seen by such a run is the one honest gap. Discard any such file's cleanup or removal finding during synthesis.

## Plan Requirements Completeness

When a plan is provided via `plan:<path>` or discovered from PR/branch context,
classify readiness before checking completeness:

- Unified artifact: metadata includes `artifact_contract: ce-unified-plan/v1`.
  - `artifact_readiness: requirements-only` can inform product intent, but it
    must not trigger implementation-unit completeness findings. Report that the
    artifact was not implementation-ready if the diff appears to implement it.
  - `artifact_readiness: implementation-ready` is eligible for full
    requirements and U-ID completeness checks.
  - Invalid progress-like readiness values (`active`, `in_progress`,
    `completed`, `done`) are contract errors.
- Legacy plan: use the existing completeness checks.

Extract requirements from these shapes, in order:

1. Unified `Product Contract` -> `### Requirements`
2. Legacy top-level `## Requirements`
3. Legacy `## Requirements Trace`

For unified implementation-ready plans, also extract U-IDs from
`## Implementation Units` and compare against PR body/branch context when
available. Do not require every Product Contract R-ID to map one-to-one to a
single U-ID; verify that implemented U-IDs cite the relevant R/F/AE/KTD IDs and
that no claimed U-ID is missing from the plan.

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

This path works with any ref — a SHA, `origin/main`, a branch name. Callers reviewing the current checkout should pass explicit `base:` when auto-detection is unnecessary. **Do not combine `base:` with a PR number or branch target.** If both are present, stop with an error: "Cannot use `base:` with a PR number or branch target — `base:` implies the current checkout is already the correct branch. Pass `base:` alone, or pass the target alone and let scope detection resolve the base."

**If a PR number or GitHub URL is provided as an argument:**

Do **not** check out the PR branch. Scope comes from GitHub read APIs plus optional local alignment when HEAD already matches the PR head branch.

**Skip-condition pre-check.** Before scope detection, run a PR-state probe:

```
gh pr view <number-or-url> --json state,title,body,files
```

Apply skip rules in order:

- `state` is `CLOSED` or `MERGED` -> stop with reason `PR is closed/merged; not reviewing.`
- **Trivial-PR judgment**: spawn a lightweight sub-agent on the platform's cheapest capable model when a known override exists; otherwise omit the model override and inherit. Give it the PR title, body, and changed file paths. The agent's task: "Is this an automated or trivial PR that does not warrant a code review? Consider: dependency lock-file or manifest-only bumps, automated release commits, chore version increments with no substantive code changes. When in doubt, answer no — false negatives (skipped reviews that should have run) are more costly than false positives (unnecessary reviews)." If the judgment returns yes: stop with reason `PR appears to be a trivial automated PR; not reviewing. Run without a PR argument to review the current branch, or pass base:<ref> if review is intended.`

When any skip rule fires, stop without dispatching reviewers. **Default mode:** emit the reason as plain text. **`mode:agent`:** emit JSON only — `{"status":"skipped","reason":"<same message>"}` — so programmatic callers can parse the outcome. **Standalone**, **`base:`**, and **branch-remote** paths are unaffected. **Draft PRs are reviewed normally.**

If no skip rule fires, fetch PR metadata **without checkout**:

```
gh pr view <number-or-url> --json title,body,baseRefName,headRefName,headRefOid,isCrossRepository,url,files,reviews,comments --jq '{title, body, baseRefName, headRefName, headRefOid, isCrossRepository, url, files: [.files[].path], hasPriorComments: ((.reviews | map(select(.state != "APPROVED" or .body != "")) | length) > 0 or (.comments | length) > 0)}'
```

Set `BASE:` to `pr:<number-or-url>` (logical marker — not a git SHA). Set `UNTRACKED:` from `git ls-files --others --exclude-standard` on the **current** checkout (usually empty during PR-remote review).

**PR scope mode.** Classify as **`local-aligned`** only when **all** of these hold; otherwise use **`pr-remote`**. A matching branch name alone is not enough — a fork PR or a stale local branch can share a name with the PR head while pointing at unrelated code, and trusting the name would diff and inspect the wrong tree.

1. `git rev-parse --abbrev-ref HEAD` equals `headRefName`.
2. The PR is **not** cross-repository (`isCrossRepository` is false).
3. The PR head commit is contained in the local checkout: `git merge-base --is-ancestor <headRefOid> HEAD` exits 0. This confirms the working tree actually carries the PR head (allowing unpushed local fixes layered on top) rather than an unrelated same-named branch.

- **`local-aligned`** — all three checks pass. Local Read/Grep/git blame against workspace files are valid for PR changed paths.
- **`pr-remote`** — any check fails. The working tree is **not** the PR head; workspace file contents for changed paths may be stale or unrelated.

**Diff by scope mode** (do not mix remote and local diffs — contradictory hunks cause false positives):

- **`local-aligned`:** Resolve `<resolved-base-ref>` from `baseRefName` (fetch if needed). Compute `BASE=$(git merge-base HEAD <resolved-base-ref>)`, then set `FILES:` from `git diff --name-only $BASE` and `DIFF:` from `git diff -U10 $BASE` (includes committed, staged, and unstaged changes on the PR branch). Do **not** call `gh pr diff` or append remote hunks — when unpushed fixes exist, the local tree is canonical. Note in Coverage: `scope: local-aligned (PR; local tree diff)`.
- **`pr-remote`:** Set `FILES:` from the PR `files` array. Set `DIFF:` from `gh pr diff <number-or-url> --color=never`. If `gh pr diff` fails, stop with an actionable error — do not fall back to checkout.

When **`pr-remote`**, before Stage 4:

1. Best-effort fetch PR head without checkout: `git fetch --no-tags origin <headRefName>:refs/review/pr-<number>-head` (substitute PR number from metadata).
2. When fetch succeeds, set `PR_HEAD_REF=refs/review/pr-<number>-head` for reviewers and validators. When fetch fails, omit `PR_HEAD_REF` and note in Coverage — reviewers must rely on diff hunks only.
3. Best-effort fetch the PR base without checkout: `git fetch --no-tags origin <baseRefName>`. When it succeeds, resolve a concrete ref with `git rev-parse FETCH_HEAD` and set `PR_BASE_REF` to that SHA — a **real git base ref** reviewers and validators use for file-level git diffs (e.g. `data-migration-reviewer` runs `git diff <PR_BASE_REF> -- db/schema.rb`/`structure.sql`). The `pr:<number-or-url>` logical marker in `BASE:` stays the scope marker; `PR_BASE_REF` is the diffable base. When the fetch fails, omit `PR_BASE_REF` and note in Coverage — schema-drift and other git-diff checks fall back to diff hunks only and must **not** assume `main`.
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

### Stage 1b: Compute scope signals (cheap, deterministic)

Derive deterministic signals once with `scripts/review-scope.py` from this skill's directory. The helper owns endpoint validation, executable-line counting, changed-path signals, and the fail-closed lite eligibility calculation; do not reproduce those mechanics in prose or estimate them from diff hunks.

Set `SCOPE_MODE` to the Stage 1 scope mode and set `DIFF_A`/`DIFF_B` to its two endpoints:
- **`local-aligned` / standalone / `base:`** — `DIFF_A="$BASE"` (a real SHA/ref), `DIFF_B` empty (diffs base vs working tree).
- **`pr-remote` / `branch-remote`** — `DIFF_A=<PR_BASE_REF>`, `DIFF_B=<PR_HEAD_REF>` (or `<branch-head-ref>`) — the fetched refs from Stage 1.

```bash
SKILL_DIR="<absolute path of the directory containing the SKILL.md you just read>";
if [ "$SCOPE_MODE" = "pr-remote" ] || [ "$SCOPE_MODE" = "branch-remote" ]; then
  python3 "$SKILL_DIR/scripts/review-scope.py" --base "${DIFF_A:-}" --head "${DIFF_B:-}" --docs-root "<root>";
else
  python3 "$SKILL_DIR/scripts/review-scope.py" --base "$DIFF_A" --docs-root "<root>";
fi
```

Remote scope always passes both endpoint flags, even when a best-effort fetch left one value empty; the helper then fails closed instead of comparing the fetched base to the unrelated local worktree. Load the JSON result. `exec_lines: null`, any `uncounted_files > 0`, or helper failure disqualifies the lite path. `signals` are path heuristics, not selection decisions. Stage 3 still judges content-based risk such as auth, payments, mutation, external I/O, concurrency, and process execution. Use `test_files_changed`, `agent_surface`, and `has_learnings_corpus` as inputs to the generic reviewer gates, not as automatic spawn decisions.

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

Pass this to every reviewer in their spawn prompt. Intent shapes *how hard each reviewer looks*, not which reviewers are selected. Keep any `session-settled:` annotations (from a plan or the conversation) out of this summary — reviewers stay blind to settlement (Stage 2b).

**When intent is ambiguous:** Infer from branch name, commits, PR title/body, diff, `plan:`, and conversation. Write the best-effort intent summary and note uncertainty in Coverage — never block on a clarifying question.

### Stage 2b: Plan discovery (requirements verification)

Locate the plan document so Stage 6 can verify requirements completeness. Check these sources in priority order — stop at the first hit:

1. **`plan:` argument.** If the caller passed a plan path, use it directly. Read the file to confirm it exists.
2. **PR body.** If PR metadata was fetched in Stage 1, scan the body for paths matching `<root>/plans/*.{md,html}` (unified plans may be markdown or HTML). If exactly one match is found and the file exists, use it as `plan_source: explicit`. If multiple plan paths appear, treat as ambiguous — demote to `plan_source: inferred` for the most recent match that exists on disk, or skip if none exist or none clearly relate to the PR title/intent. Always verify the selected file exists before using it — stale or copied plan links in PR descriptions are common.
3. **Auto-discover.** Extract 2-3 keywords from the branch name (e.g., `feat/onboarding-skill` -> `onboarding`, `skill`). Glob `<root>/plans/*` and filter filenames containing those keywords. If exactly one match, use it. If multiple matches or the match looks ambiguous (e.g., generic keywords like `review`, `fix`, `update` that could hit many plans), **skip auto-discovery** — a wrong plan is worse than no plan. If zero matches, skip.

**Confidence tagging:** Record how the plan was found:
- `plan:` argument -> `plan_source: explicit` (high confidence)
- Single unambiguous PR body match -> `plan_source: explicit` (high confidence)
- Multiple/ambiguous PR body matches -> `plan_source: inferred` (lower confidence)
- Auto-discover with single unambiguous match -> `plan_source: inferred` (lower confidence)

If a plan is found, classify readiness before extraction (see "Plan Requirements Completeness" above): for a unified plan read the metadata/header first, and treat a requirements-only artifact as product intent only — it must not drive implementation-unit completeness findings. Then read its **Requirements** in this order — unified `Product Contract` -> `### Requirements`, then legacy top-level `## Requirements`, then legacy `## Requirements Trace` — and the R-IDs (R1, R2, etc.) listed there, plus **Implementation Units** (current numeric subsections such as `### U1.`, `### U2.`, or `### Unit 1:` under `## Implementation Units`; legacy bullet or checkbox unit entries under that section also count). For HTML unified plans the same section names and R-/U-IDs appear as visible headings/anchors — match on the section name, ignoring HTML wrapper tags. Store the extracted requirements list and `plan_source` for Stage 6. Do not block the review if no plan is found — requirements verification is additive, not required.

When the discovered plan's Key Technical Decisions carry `session-settled:` annotations (classes `user-directed` / `user-approved`), extract each labeled KTD — the decision, its class, and the rejected alternative — for your own use in Stage 5 triage (step 6c). Settlement annotations are **orchestrator-only context**: exclude them from the Stage 2 intent summary and from every reviewer bundle, including the cross-model adversarial pass. Reviewer independence is the point: lenses must stay free to re-derive the rejected alternative on the merits; the orchestrator triages settlement conflicts post-hoc.

### Stage 2c: Keep grounding review-specific

Use the project's active instructions already in context plus the current diff and source. Give each reviewer only the task-relevant context for its lens; the `project-standards` reviewer reads the actual standards sources. If a reviewer cannot scope the affected area from the diff and supplied context, allow one targeted probe.

In `pr-remote` / `branch-remote`, current source and any targeted probe must use `git show` against the supplied reviewed head ref, or the supplied diff hunks when no head ref is available; never inspect workspace paths.

### Stage 3: Select reviewers

Read the diff and file list from Stage 1 and the helper JSON from Stage 1b. Correctness is automatic; project-standards is governed by the Stage 3b path result. Read `references/persona-catalog.md` from this skill's directory now; it owns every other spawn gate. Select generic reviewers before domain reviewers: testing for changed test/harness surfaces, or when meaningful runtime behavior changed without corresponding test work; maintainability only for large or structural work; agent-native only for agent-facing work; and learnings only after a cheap search finds plausible matches in an existing `<root>/solutions/` corpus. For the behavioral testing trigger, require concrete diff evidence such as new or changed branches, state mutation, API/control-flow behavior, or error handling. Do not select testing from production-file presence alone or for non-behavioral edits. For each remaining conditional, decide whether the diff warrants it. Helper signals are prompts to consider a persona, never automatic selection.

**File-type awareness for conditional selection:** Instruction-prose files (Markdown skill definitions, JSON schemas, config files) are product code but do not benefit from runtime-focused reviewers. The adversarial reviewer's techniques (race conditions, cascade failures, abuse cases) target executable code behavior. For diffs that only change instruction-prose files, skip adversarial unless the prose describes auth, payment, or data-mutation behavior, or the change is itself a silent-pass verification mechanism (next paragraph — a CI/CD workflow is a config file but still gets the adversarial lens). Count only executable code lines toward line-count thresholds.

Treat changed persistence writes, event publication, retry/partial-failure behavior, and concurrency or ordering semantics as concrete data-mutation/external-boundary triggers for `adversarial`; do not require a framework-specific database or HTTP keyword.

**Silent-pass verification mechanisms — adversarial fires on the guard itself.** When the change *is* a verification mechanism — CI/CD gating logic, merge-blocking checks, build/deploy steps, coverage/lint gates, or test infrastructure/mocks that could mask production — its risk isn't blast radius, it's fidelity: it can go green while the real thing is red, so the exact "can this false-pass?" lens must run. Select `adversarial` (and therefore the Stage-4 cross-model pass) for such a change regardless of changed-line count and independent of the auth/data heuristics. The selection question: "If this mechanism is wrong, does it fail loudly or silently pass? A silent-pass guard gets the adversarial + cross-model lens regardless of size." Scope guard: this fires on the *mechanism* (gating/CI/build/deploy/harness changes), not on ordinary per-feature test assertions — a unit test asserting business logic is the `testing` reviewer's job, not adversarial's.

**`previous-comments` is PR-only AND comment-gated.** Only select this persona when both conditions hold:

1. Stage 1 gathered PR metadata (PR number or URL was provided as an argument, or `gh pr view` returned metadata for the current branch).
2. `hasPriorComments` from Stage 1 is true (the PR has at least one review submission or issue comment).

Skip it for standalone branch reviews with no associated PR, and skip it for PRs with no prior feedback yet -- there is nothing for the persona to verify, and a spawned subagent that returns empty findings still costs the full subagent startup overhead (persona spec, diff, schema, plus its own gh calls).

Stack-specific personas are additive when runtime behavior warrants them. A Hotwire UI change may warrant `julik-frontend-races`; a TypeScript boundary change may warrant `api-contract` only when the diff changes an externally consumed contract, not merely because it exports a symbol.

**`data-migration` spawn gate.** Select `data-migration-reviewer` only when the diff includes at least one migration or schema artifact: `db/migrate/*`, `db/schema.rb`, `db/structure.sql`, Alembic/Flyway/Liquibase migration paths, or explicit backfill/data-transform scripts (rake tasks, one-off data migration classes). **Do not spawn** for model-only changes, query-only refactors, serializers/controllers that reference columns without a migration or schema dump in the diff, or migration tests alone.

For `deployment-verification-agent`, use the same migration-artifact gate when the change is risky (destructive DDL, backfills, NOT NULL without default, column renames/drops).

### Stage 3b: Discover project standards paths

Before spawning sub-agents, find the file paths (not contents) of all relevant standards files for the `project-standards` persona. Use the native file-search/glob tool to locate:

1. Use the native file-search tool (e.g., Glob in Claude Code) to find all `**/CLAUDE.md` and `**/AGENTS.md` in the repo.
2. Filter to those whose directory is an ancestor of at least one changed file. A standards file governs all files below it (e.g., `AGENTS.md` at the repo root applies to the whole checkout, while `skills/AGENTS.md` would apply to everything under `skills/`).

Distinguish an empty successful search from a failed or unavailable search:

- One or more applicable paths: select `project-standards` and pass the path list inside a `<standards-paths>` block in its Stage 4 context. The persona reads the files itself, targeting only relevant sections.
- Empty successful search: do not dispatch `project-standards`; record `project standards: not run (no applicable standards files)` in Coverage.
- Search failure or uncertain scope: fail closed by dispatching `project-standards` with the uncertainty stated; never treat an error as an empty result.

### Stage 3c: Small-diff fast path (reduce the roster for trivial, low-risk diffs)

**`depth:full` hard-disables this gate** — when that token was passed, skip Stage 3c entirely and run the full roster (the caller explicitly asked for a deep review; size no longer matters).

**This gate fails closed: it only ever fires for a positive count of low-risk application code, and every uncertainty resolves to the full roster.** Collapse to a lite roster only when **all** of these hold:

- Stage 1b returned `lite_eligible: true` (1-39 executable changed lines, zero uncounted files, and no path signals), AND
- No content-based risk read from the diff in Stage 3 (auth, payments, data mutation, external API, secrets/permissions, deserialization, crypto, concurrency/background jobs, filesystem/process execution), AND
- Stage 3b standards discovery completed successfully (with applicable paths or a confirmed empty result), AND
- No conditional persona other than `project-standards` was selected in Stage 3.

`exec_lines: null`, `uncounted_files > 0`, a non-empty `signals` array, or helper failure are hard disqualifiers. A pure code diff that also touches one `.md` runs the full roster; that conservatism is the point.

**Lite roster:** the inline fast pass (Stage 4) plus `correctness-reviewer`, and `project-standards-reviewer` only when Stage 3b found applicable paths. Announce the actual roster plainly and note it in Coverage.

**Do not collapse** when any gate condition fails — the gate keys on risk, not size alone (a 12-line auth change still needs the full roster). When in doubt, run the full roster.

### Stage 3d: Bind the adversarial route and final roster

Complete this stage **before reading persona prompt assets or entering Stage 4**. It owns the exclusive choice between a cross-model adversarial peer and the in-process `adversarial-reviewer`; later stages consume that choice and must not decide it again.

Generate the review run ID now so both routes share one artifact directory:

```bash
SCRATCH_ROOT="/tmp/compound-engineering-$(id -u)";
if [ -L "$SCRATCH_ROOT" ]; then echo "unsafe scratch root symlink: $SCRATCH_ROOT" >&2; exit 1; fi;
install -d -m 700 "$SCRATCH_ROOT" || exit 1;
if [ -L "$SCRATCH_ROOT" ] || [ ! -O "$SCRATCH_ROOT" ]; then echo "scratch root is not owned by the current user: $SCRATCH_ROOT" >&2; exit 1; fi;
chmod 700 "$SCRATCH_ROOT" || exit 1;
RUN_ID=$(date +%Y%m%d-%H%M%S)-$(head -c4 /dev/urandom | od -An -tx1 | tr -d ' ');
RUN_DIR="$SCRATCH_ROOT/ce-code-review/$RUN_ID";
(umask 077; mkdir -p "$RUN_DIR") || exit 1; chmod 700 "$RUN_DIR" || exit 1;
echo "$RUN_DIR";
```

When adversarial was selected and scope is `local-aligned` or standalone, read `references/cross-model-review.md` from this skill's directory in full, attest the host, resolve and sanction one fixed route, and make its required egress announcement. Before start, write the reference's compact orchestrator-owned adversarial review brief to the run directory: intent plus the material risk divisions inferred from the current file inventory and diff, without embedding the diff or mechanically copying every path. Then start the detached peer job using the reference's exact invocation and persist its job ID, target, requested model/reasoning, and start epoch in working state.

- If the runner returns a job ID, the peer owns the adversarial lens for this run. Remove `adversarial-reviewer` from the local roster immediately. Do not read its local persona asset or dispatch it later, even if the peer eventually fails.
- If no job starts because of a dispatch-infrastructure failure (a non-zero exit before any job id, an unresolved `$SKILL_DIR`/script path), first attempt the bounded same-route hand recovery from `references/cross-model-review.md` before accepting the fallback: re-run the identical resolved route, holding target/model and read scope fixed, while each failure is a new plausibly recoverable one and the shared 610s deadline holds. If recovery returns a job id, treat it as the branch above (the peer owns the lens; remove `adversarial-reviewer`). Only when recovery is exhausted — a failure repeats or the deadline is spent — or the peer was never eligible to start (gate not met, host un-attestable, no different provider, CLI missing/unauthed), keep `adversarial-reviewer` in the local roster as the fallback and record the peer skip reason for Coverage.
- In `pr-remote` / `branch-remote`, do not start the peer; keep the selected in-process adversarial reviewer because it can inspect the reviewed refs.

When a job ID is returned and task tracking is active, add a distinct task that names the independent cross-model adversarial review. Keep it in progress while the detached job runs, then record its terminal outcome when the artifact is collected. Never create this task before a peer starts or leave it behind when the local adversarial fallback runs.

Do not proceed until the final local roster is materialized. This is a routing boundary, not a preference: a started peer and the in-process adversarial reviewer must never both receive the same review brief.

Announce that final team before spawning, as a user-facing summary: name the always-on reviewers plainly, and for each conditional reviewer give the one-line reason it was added (the real concern, not the keyword that matched). Do **not** put local reviewer model-tier labels (`[session model]`/`[mid-tier]`) or scope-mode codenames in this announce — those are internal. Still decide each local reviewer's tier here and keep it in working state for Stage 4. The cross-model line is separate and follows the receipt-aware model/reasoning and route wording in its reference. This is progress reporting, not a blocking confirmation.

### Stage 4: Dispatch and collect reviewers

Only after Stage 3d has materialized the final local roster, read `references/dispatch-reviewers.md` from this skill's directory in full. It owns the inline fast pass, local model tiers, shared-context staging, persona dispatch contract, bounded concurrency, and the single peer reap/fold-in. Do not load that reference earlier: its persona-file instructions are valid only after the exclusive peer-or-fallback route is bound.

### Stage 5: Finish the review

After all local reviewer returns and any available cross-model artifact are ready, read `references/finish-review.md` from this skill's directory in full. Follow it to merge and mechanically validate findings, run the bounded validation pass, apply only when explicitly authorized, and render the final report. This load is mandatory; do not improvise a shorter synthesis path.

## Language-Aware Conditionals

Stack-specific reviewers fire only when the diff touches runtime behavior they specialize in (async UI races, iOS/Swift lifecycle) — never mechanically from file extensions alone; the trigger is meaningful changed behavior in that stack's runtime domain. Structural quality (complexity deletion, 1k-line regressions, type-boundary leaks) lives in the conditional `maintainability-reviewer`; do not spawn extra reviewers for language conventions, philosophy, or "strict bar" passes.

## After Review

After Stage 6, stop. Never push, open PRs, or file tickets from this skill. Bare and `mode:agent` reviews mutate nothing. When local apply was explicitly authorized, Stage 5c may already have applied and, on a clean pre-review tree, committed verified fixes. Otherwise the caller or user decides what to apply from the report and artifacts.

### Emit actionable findings summary (default mode only)

After Stage 6 **in default mode**, emit a compact **Actionable Findings** summary for callers:

- List each actionable finding (`gated_auto` or `manual` with `downstream-resolver`) with stable `#`, severity, file:line, title, `autofix_class`, whether `suggested_fix` is present, and `confidence`.
- Include the resolved run-artifact path when one was written.
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

Always write run artifacts under the resolved `<run-dir>`:

- synthesized findings
- actionable findings list
- advisory outputs
- per-agent `{reviewer_name}.json` from Stage 4
- `adversarial-review-brief.md` when the cross-model route starts — the orchestrator's compact semantic divisions, never a copied diff
- `report.md` — the rendered markdown report exactly as presented to the user (default mode only), so format and numbering stay auditable after the run

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

## References

Every reference lives in this skill's directory and loads **on demand at the stage that needs it** — none is `@`-inlined, because all of them are late-sequence and inlining would carry their full weight through the orchestrator's many early-stage turns and subagent dispatches. Each stage below already names the file to read; this is the maintainer index. Do not reintroduce `@` includes here.

| Reference | Load at | Purpose |
|-----------|---------|---------|
| `references/persona-catalog.md` | Stage 3 | Full per-persona selection criteria and spawn gates |
| `references/cross-model-review.md` | Stage 3d (only when the cross-model adversarial pass runs) | Host attestation + provider candidate resolution + peer-CLI shell-out |
| `references/dispatch-reviewers.md` | Stage 4 | Inline fast pass, model tiers, persona dispatch contract, and peer collection |
| `references/subagent-template.md` | Stage 4 via dispatch protocol | Dispatch shape for every persona subagent |
| `references/diff-scope.md` | Stage 4 via dispatch protocol | Shared diff-scope rules passed to each subagent |
| `references/findings-schema.json` | Stage 4 via dispatch protocol | JSON output contract passed to each subagent |
| `references/finish-review.md` | Stage 5 | Merge, validation, action routing, and final report |
| `references/action-class-rubric.md` | Action Routing (as needed) | Persona guidance for `autofix_class` |
| `references/review-output-template.md` | Stage 6 | Canonical section skeleton for the report |

Selected reviewer prompt assets live under `references/personas/`. Read only the prompt files selected for the current review.
