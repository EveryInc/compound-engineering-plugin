---
name: ce-code-review
description: "Structured code review for bugs, regressions, tests, and standards. Use before PRs or when asked for review; interactive mode can fix locally, while mode:agent reports only for pipeline callers."
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
| `plan:<path>` | `plan:docs/plans/2026-03-25-001-feat-foo-plan.md` | Plan file for requirements verification (explicit). Supports markdown and HTML unified plans. |
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
- Multiple distinct `grouping:` tokens (e.g. `grouping:off` **and** `grouping:always`)

Deprecated `mode:autofix` is **not** a conflict — ignore the token and proceed with the normal flow (see below).

Emit a one-line failure reason. In `mode:agent`, return JSON: `{"status":"failed","reason":"..."}`.

## Operating principles

Same pipeline for default and `mode:agent`:

- **Apply locally; never push.** Never push, open PRs, or file tickets in any mode — push is the outward step the user owns. In **default (interactive)** mode the review applies safe, verified fixes and commits them when the pre-review tree was clean (Stage 5c owns the full rule). In **`mode:agent`** it never mutates the tree — it reports and the caller applies.
- **No blocking prompts.** Never use `AskUserQuestion`, `request_user_input`, `ask_user`, or other blocking question tools. Infer intent, plan, and scope from explicit tokens, git state, PR metadata, and conversation. Note uncertainty in Coverage or the verdict — do not stop to ask.
- **Explicit mutations only.** Never run `gh pr checkout`, `git checkout`, `git switch`, or similar branch-switch commands. Passing a PR number, URL, or branch name selects **review scope**, not permission to mutate the working tree. To review local uncommitted work on a feature branch, check out that branch yourself (or stay on it) and pass `base:` or no target.
- **Smart defaults.** Untracked files: review tracked changes only and list excluded paths in Coverage. Plan: use `plan:` when passed; otherwise discover conservatively from PR body or branch keywords. Weak advisory P2/P3 from testing/maintainability alone: demote to `testing_gaps` / `residual_risks` per Stage 5.
- **Report outcomes, not machinery.** What you show the user is about the review: what's being examined (the PR/branch), which coverage is included and the one-line reason for each conditional lens, the independent cross-model pass and which model runs it, and the findings. Keep the skill's internals out of user-facing text — model-tier assignments, raw scope-mode codenames (`local-aligned`/`pr-remote`), staging the diff to disk, loading persona files, parallel-dispatch bookkeeping, and step-by-step narration of your own setup. Name what the user would recognize (a PR number, a reviewer's concern, a peer model), not the plumbing. This governs *what* you surface and suppress; it does not script the wording — use your own voice.

## Output format

| Invocation | Deliverable |
|------------|-------------|
| **Default** | Markdown report (pipe-delimited finding tables) + Actionable Findings summary |
| **`mode:agent`** | One JSON object (see ### JSON output format below) + the same `/tmp/.../ce-code-review/<run-id>/` artifacts |

`mode:agent` is **report-only**: it skips the Stage 5c apply (the caller applies) and serializes findings as JSON instead of markdown. It does not change reviewer selection, merge logic, or scope rules — the JSON is the deterministic contract for programmatic and cross-harness callers (Codex, Gemini, etc.). The default markdown is the human view; keep it ASCII-safe (pipe tables, `->` not middot `·`, no box-drawing) so it degrades gracefully across terminals.

## Quick Review Short-Circuit

If `$ARGUMENTS` indicates the user wants a quick, fast, or light code review — and **`mode:agent` is not active** — do not dispatch the multi-agent flow.

**Announce the chosen path** before any other work (Quick review vs Multi-agent review). Skip this announcement when `mode:agent` is active.

Sequence:

1. **Run the harness's built-in code review.** Forward any review target after stripping tokens. Then stop — do not dispatch the multi-agent pipeline.
2. **Exemption:** If no built-in review exists, continue into the full multi-agent review.
3. **`mode:agent` bypasses this short-circuit** — always run the full multi-agent review and return JSON.

**Deprecated:** `mode:autofix` is no longer supported — there is no apply *mode*. If passed, ignore the token and proceed with the normal flow (default applies safe fixes via Stage 5c; `mode:agent` reports and the caller applies).

## Severity Scale

All reviewers use P0-P3:

| Level | Meaning | Action |
|-------|---------|--------|
| **P0** | Critical breakage, exploitable vulnerability, data loss/corruption | Must fix before merge |
| **P1** | High-impact defect likely hit in normal usage, breaking contract | Should fix |
| **P2** | Moderate issue with meaningful downside (edge case, perf regression, maintainability trap) | Fix if straightforward |
| **P3** | Low-impact, narrow scope, minor improvement | User's discretion |

## Action Routing

Severity answers **urgency**. `autofix_class` and `owner` are **signal** describing follow-up shape for callers — **not apply permission or an apply gate.** The apply decision is judgment (Stage 5c), not a function of `autofix_class`: default mode applies; in `mode:agent` this skill does not mutate the checkout — the caller applies. See `references/action-class-rubric.md` for persona guidance.

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

13 reviewer personas in layered conditionals, plus CE local prompt assets. Quick roster with one-line triggers below; the persona catalog in `references/persona-catalog.md` (read it at Stage 3) has the full per-persona selection criteria and spawn gates. Each selected reviewer is a generic subagent seeded with a local prompt file from `references/personas/`; do not dispatch standalone agents by type/name.

**Always-on (full review):** local prompt assets `correctness-reviewer`, `testing-reviewer`, `maintainability-reviewer`, `project-standards-reviewer`, plus CE local prompt assets `agent-native-reviewer` and `learnings-researcher`. (Stage 3c may reduce this set to a lite roster for trivial, low-risk diffs.)

**Cross-cutting conditional (per diff):**

- `security-reviewer` — auth, public endpoints, user input, permissions
- `performance-reviewer` — DB queries, data transforms, caching, async
- `api-contract-reviewer` — routes, serializers, type signatures, versioning
- `data-migration-reviewer` — migration files / schema dumps / backfills (see spawn gate in Stage 3)
- `reliability-reviewer` — error handling, retries, timeouts, background jobs
- `adversarial-reviewer` — >=50 changed code lines, or auth / payments / data mutations / external APIs, or a **silent-pass verification mechanism** (CI/CD gating logic, merge-blocking checks, build/deploy steps, coverage/lint gates, or test infrastructure/mocks that could mask production) regardless of size. When selected, a **cross-model adversarial pass** (Stage 4) additionally runs the same brief through a different model family via a peer CLI — additive, non-blocking
- `previous-comments-reviewer` — PR with existing review comments (PR-only, comment-gated)

**Stack-specific conditional (per diff):** `julik-frontend-races-reviewer` (Stimulus/Turbo, DOM events, async UI) and `swift-ios-reviewer` (Swift/SwiftUI/UIKit, entitlements, Core Data, `.pbxproj`).

**CE conditional (migration-specific):** local prompt asset `deployment-verification-agent` — deployment checklist + rollback when the migration gate applies and the change is risky.

## Review Scope

A full review spawns generic subagents for all 4 always-on personas plus the 2 CE always-on local prompt assets, then adds whichever cross-cutting and stack-specific conditionals fit the diff (Stage 3c can collapse this to a lite roster for trivial, low-risk diffs). The model naturally right-sizes: a small config change triggers 0 conditionals = 6 reviewers. A Rails auth feature might trigger security + reliability + adversarial = 9 reviewers.

## Protected Artifacts

The following paths are compound-engineering pipeline artifacts and must never be flagged for deletion, removal, or gitignore by any reviewer:

- `docs/brainstorms/*` -- legacy requirements documents created by older ce-brainstorm versions
- `docs/plans/*.{md,html}` -- unified plan artifacts created by ce-brainstorm or ce-plan (decision artifacts; execution progress is derived from git, not stored in plan bodies)
- `docs/solutions/*.md` -- solution documents created during the pipeline

If a reviewer flags any file in these directories for cleanup or removal, discard that finding during synthesis.

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

Derive deterministic signals from the resolved diff once, so reviewer selection (Stage 3) and the small-diff fast path (Stage 3c) do not each re-reason over the whole diff. **These signals only ever shrink the roster via Stage 3c, and that gate fails closed (Stage 3c) — so any failure here (unresolved base, count failure, an uncounted file type) must surface as `UNKNOWN`/non-zero `UNCOUNTED_FILES`, never as a silent `0` that reads as "trivial."**

**Set `DIFF_A`/`DIFF_B` to the two endpoints to diff, by Stage 1 scope mode:**
- **`local-aligned` / standalone / `base:`** — `DIFF_A="$BASE"` (a real SHA/ref), `DIFF_B` empty (diffs base vs working tree).
- **`pr-remote` / `branch-remote`** — `DIFF_A=<PR_BASE_REF>`, `DIFF_B=<PR_HEAD_REF>` (or `<branch-head-ref>`) — the **fetched** refs from Stage 1. Do **not** model-count from hunks (it drifts per host/model). If either ref was not fetched, skip the block and emit `EXEC_LINES:UNKNOWN` + `UNCOUNTED_FILES:1` so Stage 3c forces the full roster.

```
# Fail closed: an unresolved/invalid endpoint must NOT become a silent EXEC_LINES:0.
# Validate BOTH endpoints — a set-but-unfetched DIFF_B (pr-remote/branch-remote head ref)
# would otherwise make `git diff` fail, awk print 0, and the lite gate clear on the wrong tree.
if [ -z "${DIFF_A:-}" ] || ! git rev-parse --verify --quiet "${DIFF_A}^{commit}" >/dev/null 2>&1 \
   || { [ -n "${DIFF_B:-}" ] && ! git rev-parse --verify --quiet "${DIFF_B}^{commit}" >/dev/null 2>&1; }; then
  echo "EXEC_LINES:UNKNOWN"; echo "UNCOUNTED_FILES:1"; echo "SIGNALS:"
else
  # EXEC_LINES via --numstat (per-file added/deleted counts) summed in awk — robust across
  # shells, immune to diff-content edge cases. Do NOT grep raw +/- lines: a content line that
  # itself starts with + or - (markdown bullets, unary minus, `++i`) is miscounted. Keep the
  # globs single-quoted and inline so the shell passes them to git literally (an unquoted or
  # variable-held glob would be expanded against the CWD before git ever sees it).
  EXEC_LINES=$(git diff --numstat "$DIFF_A" $DIFF_B -- '*.rb' '*.py' '*.js' '*.jsx' '*.ts' '*.tsx' '*.go' '*.rs' '*.java' '*.swift' '*.kt' '*.c' '*.cc' '*.cpp' '*.cs' '*.php' '*.ex' '*.exs' '*.scala' 2>/dev/null | awk '{s+=$1+$2} END{print s+0}')
  echo "EXEC_LINES:$EXEC_LINES"
  FILES=$(git diff --name-only "$DIFF_A" $DIFF_B 2>/dev/null)
  # UNCOUNTED_FILES = changed files NOT in the counted code set (skill prose, schemas, configs,
  # scripts, lockfiles, unknown extensions). Any >0 disqualifies the lite path (fail closed).
  UNCOUNTED=$(printf '%s\n' "$FILES" | awk 'NF && $0 !~ /\.(rb|py|js|jsx|ts|tsx|go|rs|java|swift|kt|c|cc|cpp|cs|php|ex|exs|scala)$/ {n++} END{print n+0}')
  echo "UNCOUNTED_FILES:$UNCOUNTED"
  echo "SIGNALS:"
  # here-strings (no pipe) — a piped `grep -q` can drop a true match under `set -o pipefail` via SIGPIPE.
  grep -qiE 'db/migrate/|schema\.(rb|sql)|/migrations?/|alembic|flyway|liquibase' <<< "$FILES" && echo "  migrations" || true
  grep -qiE '\.(tsx|jsx|vue|svelte|css|scss|html|erb|haml)$|/components?/|stimulus|turbo' <<< "$FILES" && echo "  frontend" || true
  grep -qiE '/(routes?|controllers?|api|serializers?|graphql)/|\.proto$|openapi|swagger' <<< "$FILES" && echo "  api" || true
  grep -qiE '\.(swift|kt|pbxproj|xcconfig|entitlements)$' <<< "$FILES" && echo "  swift-ios" || true
fi
```

`EXEC_LINES` counts changed executable lines (added + removed, counted code extensions only — so a modified line counts as 2; the Stage 3c `<40` threshold is in add+delete units). `EXEC_LINES:UNKNOWN` means the base was unresolved — treat as non-trivial. `UNCOUNTED_FILES` is the count of changed files outside the code set (skill `.md`, JSON schemas, `.sh`, config, CI, lockfiles, unknown extensions) — **this plugin's own product surface is mostly uncounted, which is exactly why Stage 3c must fail closed on it.** The `SIGNALS` list is **path heuristics, not selection decisions**: Stage 3 still applies judgment and adds the matching conditional persona only when the runtime concern is real. Content-based risk (auth, payments, data mutation) is **not** path-derivable — read it from the diff in Stage 3 as before; it also disqualifies the Stage 3c fast path regardless of line count.

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
2. **PR body.** If PR metadata was fetched in Stage 1, scan the body for paths matching `docs/plans/*.{md,html}` (unified plans may be markdown or HTML). If exactly one match is found and the file exists, use it as `plan_source: explicit`. If multiple plan paths appear, treat as ambiguous — demote to `plan_source: inferred` for the most recent match that exists on disk, or skip if none exist or none clearly relate to the PR title/intent. Always verify the selected file exists before using it — stale or copied plan links in PR descriptions are common.
3. **Auto-discover.** Extract 2-3 keywords from the branch name (e.g., `feat/onboarding-skill` -> `onboarding`, `skill`). Glob `docs/plans/*` and filter filenames containing those keywords. If exactly one match, use it. If multiple matches or the match looks ambiguous (e.g., generic keywords like `review`, `fix`, `update` that could hit many plans), **skip auto-discovery** — a wrong plan is worse than no plan. If zero matches, skip.

**Confidence tagging:** Record how the plan was found:
- `plan:` argument -> `plan_source: explicit` (high confidence)
- Single unambiguous PR body match -> `plan_source: explicit` (high confidence)
- Multiple/ambiguous PR body matches -> `plan_source: inferred` (lower confidence)
- Auto-discover with single unambiguous match -> `plan_source: inferred` (lower confidence)

If a plan is found, classify readiness before extraction (see "Plan Requirements Completeness" above): for a unified plan read the metadata/header first, and treat a requirements-only artifact as product intent only — it must not drive implementation-unit completeness findings. Then read its **Requirements** in this order — unified `Product Contract` -> `### Requirements`, then legacy top-level `## Requirements`, then legacy `## Requirements Trace` — and the R-IDs (R1, R2, etc.) listed there, plus **Implementation Units** (current numeric subsections such as `### U1.`, `### U2.`, or `### Unit 1:` under `## Implementation Units`; legacy bullet or checkbox unit entries under that section also count). For HTML unified plans the same section names and R-/U-IDs appear as visible headings/anchors — match on the section name, ignoring HTML wrapper tags. Store the extracted requirements list and `plan_source` for Stage 6. Do not block the review if no plan is found — requirements verification is additive, not required.

### Stage 2c: Resolve the shared project profile (cache)

Resolve the question-agnostic project profile (stack, dependency surface + licenses, conventions, structure) from the shared cache once, so the orchestrator's reviewer selection and the non-standards reviewers (`correctness`, `testing`, `maintainability`) share one cheap stack/conventions orientation instead of each re-deriving it from the diff. Set `SKILL_DIR` to this skill's directory and run the helper (full protocol in `references/repo-profile-cache.md`):

```bash
SKILL_DIR="<absolute path of the directory containing the SKILL.md you just read>"
python3 "$SKILL_DIR/scripts/repo-profile-cache.py" get
```

**Only resolve the cache when the working tree is the reviewed tree** — `local-aligned`, standalone, or `base:` scope (Stage 1). In `pr-remote` or `branch-remote` scope, **skip Stage 2c entirely**: the helper keys and derives from the local `HEAD`, which is *not* the reviewed ref, so its profile would describe the wrong tree (e.g. `main`'s stack while reviewing a PR that changes manifests); reviewers work from the fetched refs/diff as those modes already require.

On `HIT`, load the profile JSON as the agnostic project orientation. On `MISS`, dispatch a generic subagent with `references/agents/repo-profiler.md` to derive the profile, write its JSON to a file, then persist with `python3 "$SKILL_DIR/scripts/repo-profile-cache.py" put <file>` (re-set `SKILL_DIR` in that call — shell vars don't persist between Bash invocations). On `NO-CACHE` (no git repo or no writable cache), skip the cache entirely — do not derive a profile and do not run `put`; reviewers fall back to deriving stack/conventions from the diff exactly as before. The cache is an optimization, never a correctness dependency; if anything about it fails, degrade to the no-profile path.

When a profile is in hand, include a short stack/conventions orientation slice from it in the Stage 4 review context bundle passed to every reviewer **except** `project-standards` and `learnings-researcher`. This is orientation only — it never replaces a fresh read. The `project-standards-reviewer` still reads the actual root and subdirectory `AGENTS.md`/`CLAUDE.md` standards files fresh via the Stage 3b path list (the auditing exception — it audits compliance against real file contents, never against a cached digest), and `docs/solutions/` learnings stay fresh because `learnings-researcher` re-globs and reads them per run.

### Stage 3: Select reviewers

Read the diff and file list from Stage 1, and the `SIGNALS` / `EXEC_LINES` from Stage 1b. The 4 always-on personas and 2 CE always-on agents are automatic. Read `references/persona-catalog.md` from this skill's directory now — it carries the full per-persona selection criteria and spawn gates the one-line roster above only summarizes. For each cross-cutting and stack-specific conditional persona in that catalog, decide whether the diff warrants it. This is agent judgment, not keyword matching — a `SIGNALS` hit (`migrations`, `frontend`, `api`, `swift-ios`) is a *prompt* to consider the matching persona, not an instruction to spawn it; confirm the runtime concern is real in the diff before adding it, and add content-gated personas (`security`, `reliability`, `adversarial`) from the diff as before since those are not path-derivable.

**File-type awareness for conditional selection:** Instruction-prose files (Markdown skill definitions, JSON schemas, config files) are product code but do not benefit from runtime-focused reviewers. The adversarial reviewer's techniques (race conditions, cascade failures, abuse cases) target executable code behavior. For diffs that only change instruction-prose files, skip adversarial unless the prose describes auth, payment, or data-mutation behavior, or the change is itself a silent-pass verification mechanism (next paragraph — a CI/CD workflow is a config file but still gets the adversarial lens). Count only executable code lines toward line-count thresholds.

**Silent-pass verification mechanisms — adversarial fires on the guard itself.** When the change *is* a verification mechanism — CI/CD gating logic, merge-blocking checks, build/deploy steps, coverage/lint gates, or test infrastructure/mocks that could mask production — its risk isn't blast radius, it's fidelity: it can go green while the real thing is red, so the exact "can this false-pass?" lens must run. Select `adversarial` (and therefore the Stage-4 cross-model pass) for such a change regardless of changed-line count and independent of the auth/data heuristics. The selection question: "If this mechanism is wrong, does it fail loudly or silently pass? A silent-pass guard gets the adversarial + cross-model lens regardless of size." Scope guard: this fires on the *mechanism* (gating/CI/build/deploy/harness changes), not on ordinary per-feature test assertions — a unit test asserting business logic is the `testing` reviewer's job, not adversarial's.

**`previous-comments` is PR-only AND comment-gated.** Only select this persona when both conditions hold:

1. Stage 1 gathered PR metadata (PR number or URL was provided as an argument, or `gh pr view` returned metadata for the current branch).
2. `hasPriorComments` from Stage 1 is true (the PR has at least one review submission or issue comment).

Skip it for standalone branch reviews with no associated PR, and skip it for PRs with no prior feedback yet -- there is nothing for the persona to verify, and a spawned subagent that returns empty findings still costs the full subagent startup overhead (persona spec, diff, schema, plus its own gh calls).

Stack-specific personas are additive when runtime behavior warrants them. A Hotwire UI change may warrant `julik-frontend-races`; a TypeScript API diff may warrant `api-contract` and `reliability`.

**`data-migration` spawn gate.** Select `data-migration-reviewer` only when the diff includes at least one migration or schema artifact: `db/migrate/*`, `db/schema.rb`, `db/structure.sql`, Alembic/Flyway/Liquibase migration paths, or explicit backfill/data-transform scripts (rake tasks, one-off data migration classes). **Do not spawn** for model-only changes, query-only refactors, serializers/controllers that reference columns without a migration or schema dump in the diff, or migration tests alone.

For `deployment-verification-agent`, use the same migration-artifact gate when the change is risky (destructive DDL, backfills, NOT NULL without default, column renames/drops).

Announce the team before spawning, as a user-facing summary: name the always-on reviewers plainly, and for each conditional reviewer give the one-line reason it was added (the real concern, not the keyword that matched). Do **not** put model-tier labels (`[session model]`/`[mid-tier]`) or scope-mode codenames in this announce — those are internal. Still *decide* each reviewer's tier here and keep it in your own working notes (Stage 4 applies it at dispatch as a correctness guarantee); just keep it out of this user-facing summary.

If the cross-model adversarial pass will run (adversarial selected + `local-aligned`/standalone scope), resolve its peer now via the cross-model reference's host/preflight steps and surface it **as its own prominent line that names the peer** (the peer CLI, plus its model if cheaply known) — the headline is that a second, genuinely independent model is also reviewing. Keep it with the team, not buried after it, and honor that reference's host gating (interactive hosts only). If it won't run, omit it.

Illustrative shape only — match your own voice, do not copy verbatim:

```
Reviewing PR #1234 (against main)

Also running an independent adversarial pass via a different model: Codex.

Reviewers:
- correctness, testing, maintainability, project-standards, agent-native, learnings (always)
- security — new endpoint accepts a user-provided redirect URL
- data-migration — adds migration 20260303_add_index_to_orders
```

This is progress reporting, not a blocking confirmation.

### Stage 3b: Discover project standards paths

Before spawning sub-agents, find the file paths (not contents) of all relevant standards files for the `project-standards` persona. Use the native file-search/glob tool to locate:

1. Use the native file-search tool (e.g., Glob in Claude Code) to find all `**/CLAUDE.md` and `**/AGENTS.md` in the repo.
2. Filter to those whose directory is an ancestor of at least one changed file. A standards file governs all files below it (e.g., `AGENTS.md` at the repo root applies to the whole checkout, while `skills/AGENTS.md` would apply to everything under `skills/`).

Pass the resulting path list to the `project-standards` persona inside a `<standards-paths>` block in its review context (see Stage 4). The persona reads the files itself, targeting only the sections relevant to the changed file types. This keeps the orchestrator's work cheap (path discovery only) and avoids bloating the subagent prompt with content the reviewer may not fully need.

### Stage 3c: Small-diff fast path (reduce the roster for trivial, low-risk diffs)

**`depth:full` hard-disables this gate** — when that token was passed, skip Stage 3c entirely and run the full roster (the caller explicitly asked for a deep review; size no longer matters).

**This gate fails closed: it only ever fires for a positive count of low-risk application code, and every uncertainty resolves to the full roster.** Collapse to a lite roster only when **all** of these hold:

- `EXEC_LINES` from Stage 1b is a **number** (not `UNKNOWN`) and **between 1 and 39**, AND
- `UNCOUNTED_FILES` from Stage 1b is **0** — i.e. *every* changed file is counted application code. Any uncounted file (skill `.md`, JSON schema, `.sh`/CI/config, lockfile, unknown extension) disqualifies the lite path. This guard is load-bearing on **mixed** diffs the line count alone would pass: 15 exec lines of application code plus two `.md` skill files reads `EXEC_LINES:15` with `UNCOUNTED_FILES:2`, and the uncounted files force the **full** roster. (This plugin's own product surface — `skills/**`, `SKILL.md`, `references/**`, schemas — is uncounted.) AND
- Stage 1b `SIGNALS` is **empty** (no `migrations`, `frontend`, `api`, or `swift-ios`), AND
- No content-based risk read from the diff in Stage 3 (auth, payments, data mutation, external API, secrets/permissions, deserialization, crypto, concurrency/background jobs, filesystem/process execution), AND
- No conditional persona was selected in Stage 3.

`EXEC_LINES:UNKNOWN` (unresolved base) or `UNCOUNTED_FILES > 0` are **hard disqualifiers** — never lite. A pure code diff that also touches one `.md` runs the full roster; that conservatism is the point.

**Lite roster:** the inline fast pass (Stage 4) plus `correctness-reviewer` and `project-standards-reviewer` only — skip `testing`, `maintainability`, `agent-native`, and `learnings`. Announce the reduction plainly (e.g. "Small diff (28 exec lines, code-only, no risk signals) — running a lite review: fast pass + correctness + standards.") and note it in Coverage.

**Do not collapse** when any gate condition fails — the gate keys on risk, not size alone (a 12-line auth change still needs the full roster). When in doubt (signals ambiguous, risk unclear, count `UNKNOWN`), run the full roster.

### Stage 4: Spawn sub-agents

#### Inline fast pass (emit before dispatch)

To surface findings in seconds, **in the same turn that fires the parallel dispatch** the orchestrator does a quick first-principles scan of the diff it already holds — emit the fast-pass block as text, then make the Agent calls, so it adds no wall-clock to the fan-out.

Scan only for **high-signal, obvious** issues a careful first read catches: data/SQL safety, injection (shell/SQL/LLM-output trust boundary), broken control flow, a missing `await`/unhandled promise, a swapped argument or off-by-one, an enum/status added without updating its sibling switch, a null deref on a value the diff makes reachable. Do **not** do deep analysis, read beyond the diff (except a quick Grep for enum completeness), or chase subtle concerns. Quote the verbatim motivating line for each, same bar as a persona finding.

Present these under a clearly preliminary header (e.g. `### Fast pass (preliminary — deep review in progress)`) as a short list of `severity — file:line — what`, with one line stating they are unverified and will be deduplicated into the final report. Do **not** assign stable `#` numbers here.

The fast pass enters Stage 5 as a pseudo-reviewer named `fast-pass`, with two hard constraints because it is the orchestrator's own read, **not** an independent reviewer (it shares the session model and its blind spots with the orchestrator and the session-model personas):

- **Cap every `fast-pass` finding at anchor 50.** At anchor 50 it surfaces on its own only when P0 (P0+50 survives the gate); otherwise it reaches the actionable tier only by deduping onto an independent persona finding that carries its own ≥75 anchor.
- **`fast-pass` never counts toward cross-reviewer promotion** (Stage 5 step 3). A `fast-pass`+persona fingerprint match is noted in the Reviewer column but does **not** bump the anchor — only independent reviewers corroborate.

Do not feed `fast-pass` candidates into the persona or validator prompts — those agents review the raw diff independently, and seeding them would manufacture the false agreement this cap exists to prevent. If the fast pass finds nothing obvious, emit one line saying so and proceed; never block dispatch on it.

When Stage 3c selected the lite roster, the fast pass still runs.

**Reconcile the preliminary block in the final report.** A preliminary fast-pass item that did not survive (deduped away, demoted at the gate, or dropped by validation) must be accounted for, not left dangling — add a one-line "Preliminary fast-pass items withdrawn: <n> (<reason>)" note so a user who saw a scary preliminary finding learns it was cleared. Mark any final finding that survived from `fast-pass` alone (no persona corroboration) so its weaker provenance is visible.

**`mode:agent`:** do **not** emit the preliminary block — that mode's response must be a single raw JSON object with nothing before it. Still run the scan internally and seed its findings into Stage 5 dedup as `fast-pass`.

#### Model tiering

Three reviewers inherit the session model with no override: `correctness-reviewer`, `security-reviewer`, and `adversarial-reviewer`. These perform the highest-stakes analysis — logic bugs, security vulnerabilities, adversarial failure scenarios — and should run at whatever capability level the user has configured. If the user is on Opus, these get Opus.

All other persona subagents and CE local prompt assets use the platform's mid-tier model to reduce cost and latency. See the Spawning subsection below for the exact dispatch-time override.

The orchestrator (this skill) also inherits the session model; it handles intent discovery, reviewer selection, finding merge/dedup, and synthesis.

#### Run ID

Generate a unique run identifier before dispatching any agents. This ID scopes all agent artifact files and the post-review run artifact to the same directory.

```bash
RUN_ID=$(date +%Y%m%d-%H%M%S)-$(head -c4 /dev/urandom | od -An -tx1 | tr -d ' ')
mkdir -p "/tmp/compound-engineering/ce-code-review/$RUN_ID"
```

Pass `{run_id}` to every persona sub-agent so they can write their full analysis to `/tmp/compound-engineering/ce-code-review/{run_id}/{reviewer_name}.json`.

**Large shared context — pass paths, not contents.** The diff and file list go to every reviewer and validator. When inlining them into each subagent prompt would be wasteful (many files / a big diff), write them once into the run dir (e.g. `full.diff`, `files.txt`) and pass those **paths** in the diff / changed-files slots instead of inline content — the subagent and validator templates instruct the child to Read a staged path. Inline a small diff directly.

#### Spawning

Omit the `mode` parameter when dispatching sub-agents so the user's configured permission settings apply. Do not pass `mode: "auto"`.

**Model override at dispatch time — this is a correctness guarantee, not cosmetics.** Omitting the override on a top-tier parent session (e.g. Opus) silently runs that reviewer at the expensive tier — the regression this prevents. The tier is a deterministic function of the persona, so as you select reviewers in Stage 3, **record each reviewer's tier in an internal working list** — that list is your external memory (the role the old printed `[session model]`/`[mid-tier]` labels served) and it must exist and be honored even though it is no longer rendered in the user-facing announce:

- **Session model** (no override; inherits the session model) — `correctness-reviewer`, `security-reviewer`, and `adversarial-reviewer` only.
- **Mid-tier** — every other persona and CE agent: pass the platform's balanced mid-tier model. In Claude Code, that is the Sonnet class. In Codex, apply this tier only when the active dispatch primitive exposes an explicit model or custom-agent selector; task wording alone does not select a different model. Otherwise omit the override and inherit the parent model — a working review on the parent model beats a broken dispatch on an unrecognized name.

Apply this on **every** Agent / `spawn_agent` / subagent call in the parallel dispatch. A missed override is a silent cost-and-quality regression, so treat the internal tier list as load-bearing — moving it out of the user-facing output removed the *display*, not the discipline.

**Bounded parallel dispatch.** Respect the current harness's active-subagent limit without hard-coding a number. Keep the selected reviewers in a deterministic queue, dispatch up to the known/accepted capacity, and fill freed slots as reviewers complete. If the harness exposes no limit, start optimistically and learn it from the first capacity response. Treat active-agent/thread/concurrency-limit spawn errors as backpressure, not reviewer failure: leave that reviewer queued, wait for any active reviewer to finish, then retry. If no reviewer from this run has been accepted yet, do not wait on an empty active set: retry after a short bounded delay, and after repeated zero-capacity responses proceed with a user-visible degraded/no-subagent review path instead of waiting forever. Do not shrink the roster, ask the user, or record a reviewer as failed for capacity backpressure. Record a reviewer as failed only after a successful dispatch times out/fails, or when dispatch fails for a non-capacity reason.

Before assembling any spawn prompt, read these three files from this skill's directory now — they define the dispatch shape and the JSON contract every subagent needs, and you cannot construct a valid spawn without them: `references/subagent-template.md`, `references/diff-scope.md`, and `references/findings-schema.json`.

For each selected reviewer, read the corresponding local prompt asset from `references/personas/<reviewer-name>.md` and spawn a generic subagent using the subagent template. Do not use `subagent_type`, typed `Agent` names, or platform-level CE agent registration. Each persona subagent receives:

1. Their persona file content (identity, failure modes, calibration, suppress conditions)
2. Shared diff-scope rules from `references/diff-scope.md`
3. The JSON output contract from `references/findings-schema.json`
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
      "suggested_fix": "Add current_user.owns?(account) guard before lookup",
      "first_evidence": "orders_controller.rb:42 -- account = Account.find(params[:account_id])"
    }
  ],
  "residual_risks": [...],
  "testing_gaps": [...]
}
```

`first_evidence` is the **one** detail-tier field promoted into the compact return: the verbatim motivating line with `file:line` that the quote-the-line gate requires. It is **mandatory for every finding at anchor 75 or 100** (the gate is unenforceable without it in-band, since the rest of `evidence` lives only in the artifact). Omit it only for anchor-50 findings. Stage 5 drops/demotes any 75/100 finding missing it; Stage 5b uses it for the validator-skip check. Keep it to the single triggering line, not the full `evidence` array — the array stays in the artifact.

The artifact file **must** carry the full detail-tier fields (`why_it_matters`, `evidence`); the compact *return* omits all detail-tier fields **except `first_evidence`**, but writing the compact shape to the artifact (a common reviewer slip) silently strips the detail Coverage and the keyed detail lines depend on. However review context is delivered — inlined, or staged to disk for a large diff — each reviewer still receives the full subagent-template output contract; staging context never licenses a thinner one. `suggested_fix` is optional in both tiers -- included in compact returns when present so callers can apply fixes after review. If the file write fails, the compact return still provides everything the merge needs.

**CE always-on local prompt assets** (`agent-native-reviewer`, `learnings-researcher`) are dispatched as generic subagents through the same bounded parallel scheduler as the structured personas. Read their prompt files from `references/personas/`, then give them the same review context bundle the personas receive: entry mode, any PR metadata gathered in Stage 1, intent summary, review base branch name when known, `BASE:` marker, file list, diff, and `UNTRACKED:` scope notes. Do not invoke them with a generic "review this" prompt. Their output is unstructured and synthesized separately in Stage 6.

**CE conditional local prompt assets** (`deployment-verification-agent` only) are dispatched as generic subagents through the same bounded parallel scheduler when the migration-artifact gate applies. Read the prompt file from `references/personas/`, then pass the same review context bundle plus the applicability reason (for example, which migration files triggered the prompt asset). Its output is unstructured and must be preserved for Stage 6 synthesis just like the CE always-on prompt assets. Schema drift is handled by the `data-migration` persona as structured findings — not here.

#### Cross-model adversarial pass

When `adversarial-reviewer` was selected (Stage 3) **and** scope is `local-aligned` or standalone, also run the same adversarial brief through a different model family in a separate process — genuine independence the in-process subagent cannot provide. **Launch it in parallel with the persona reviewers, not after them:** the peer call is a CLI shell-out (a background Bash process, not a subagent), so it does not consume the subagent concurrency budget and its ~2-5 min runtime overlaps the in-process reviews instead of adding to them. Kick it off as a background shell process in the same dispatch wave as the Stage 4 reviewers, then collect its result before Stage 5. (If the harness cannot background a shell command, run it inline before awaiting the reviewers — correctness is unaffected, only wall-clock.) Load `references/cross-model-review.md` and follow it: it self-identifies the host at runtime (Claude, Codex, or Cursor), shells out to the peer CLI (Codex when host is Claude or Cursor; Claude when host is Codex) read-only, and writes a `findings-schema.json`-shaped return to `/tmp/compound-engineering/ce-code-review/{run_id}/adversarial-<peer>.json`.

That return enters Stage 5 as reviewer `adversarial-<peer>`, like any persona artifact. The pass is **non-blocking** — skip silently when no peer is identified, the peer CLI is missing/unauthed, or it errors/times out. Skip it entirely in `pr-remote` / `branch-remote` scope (the peer would review the local tree, not the reviewed head). Announce per that reference's announce rules — interactive hosts (Claude or Cursor) in default mode only; silent under Codex and in `mode:agent`.

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
   - **Quote-the-line gate (enforced here).** Any finding at anchor **75 or 100** must carry a non-empty `first_evidence` (the verbatim motivating line with `file:line`). A 75/100 finding missing `first_evidence` is **demoted to anchor 50** (record the demotion count for Coverage) — it then faces the normal anchor-50 fate in the confidence gate (dropped unless P0 or routed to a soft bucket).
   - Do not validate against the full schema here -- the full schema (including why_it_matters and evidence) applies to the artifact files on disk, not the compact returns.
2. **Deduplicate.** Compute fingerprint: `normalize(file) + line_bucket(line, +/-3) + normalize(title)`. When fingerprints match, merge: keep highest severity, keep highest anchor, note which reviewers flagged it. Dedup runs over the full validated set (including anchor 50) so cross-reviewer promotion in step 3 can lift matching anchor-50 findings into the actionable tier.
3. **Cross-reviewer agreement.** When 2+ independent reviewers flag the same issue (same fingerprint), promote the merged finding by one anchor step: `50 -> 75`, `75 -> 100`, `100 -> 100`. Note the agreement in the Reviewer column of the output (e.g., "security, correctness"). **Promotion never bypasses the quote-the-line gate (step 1).** A finding may sit at anchor 75 or 100 — whether originally or via this promotion — only if the merged finding carries `first_evidence`. If no contributing reviewer supplied it (e.g. two reviewers reported the same finding without the quote and step 1 demoted both to 50), cap the promotion at 50: agreement corroborates that the issue is *real*, but the quoted line is what licenses *high confidence*, and two un-quoted findings must not combine into a quote-free 75. When at least one contributor supplied `first_evidence`, the merged finding inherits it (step 2 keeps it) and promotes normally. The cross-model `adversarial-<peer>` return counts as an independent reviewer here; agreement between it and the in-process `adversarial` persona is the strongest signal in the set (different model families, separate processes) — render it as `adversarial, adversarial-<peer>`. The Stage 4 `fast-pass` pseudo-reviewer is the orchestrator's own read, **not** independent, so it **never counts toward this promotion** (and is capped at anchor 50): a `fast-pass`+persona fingerprint match is noted in the Reviewer column (e.g. "correctness, fast-pass") but does **not** bump the anchor — the persona's own independent anchor carries the finding. A `fast-pass`-only finding stays at anchor 50 (surfacing solo only when P0).
4. **Separate pre-existing.** Pull out findings with `pre_existing: true` into a separate list. **Exception — the change depends on it:** a pre-existing or adjacent-file gap that the change under review *relies on for its own correctness* stays in the primary findings, not the pre-existing list. The bar is a direct dependency — the new code is wrong, unsafe, or unverified *because of* this gap. Merely sitting nearby, or the repo being better without it, does not qualify: if the change would be correct regardless of the gap, it stays pre-existing. Do not widen this into general repo cleanup ("fix the whole repo").
5. **Resolve disagreements.** When reviewers flag the same code region but disagree on severity, autofix_class, or owner, annotate the Reviewer column with the disagreement (e.g., "security (P0), correctness (P1) -- kept P0").
6. **Normalize routing.** For each merged finding, set the final `autofix_class`, `owner`, and `requires_verification`. If reviewers disagree, keep the more conservative route. Remap any legacy `safe_auto` or `review-fixer` to `gated_auto` / `downstream-resolver`.
6b. **Mode-aware demotion of weak general-quality findings.** Some persona output is real signal but does not warrant primary-findings attention. Reroute it to the existing soft buckets so the primary findings table stays focused on actionable issues.

A finding qualifies for demotion when **all** of these hold:
   - Severity is P2 or P3 (P0 and P1 always stay in primary findings)
   - `autofix_class` is `advisory` (concrete-fix findings stay in primary)
   - **All** contributing reviewers are `testing` or `maintainability` — if any other persona also flagged this finding, cross-reviewer corroboration is present and the finding stays in primary findings regardless of its severity or advisory status (expand the weak-signal list later only with evidence)

When a finding qualifies:
   - Move demoted findings out of the primary set. If the contributing reviewer is `testing`, append `<file:line> -- <title>` to `testing_gaps`. If `maintainability`, append to `residual_risks`. Use title-only lines (compact return omits `why_it_matters`). Record the demotion count for Coverage.

7. **Confidence gate.** After dedup, promotion, and demotion have shaped the primary set, suppress remaining findings below anchor 75. Exception: P0 findings at anchor 50+ survive the gate -- critical-but-uncertain issues must not be silently dropped. Record the suppressed count by anchor (so Coverage can report "N findings suppressed at anchor 50, M at anchor 25"). The gate runs late deliberately: anchor-50 findings need a chance to be promoted by step 3 (cross-reviewer corroboration) or rerouted by step 6b (mode-aware demotion to soft buckets) before any drop decision.
8. **Partition the work.** Build two sets:
   - actionable queue: `gated_auto` or `manual` findings whose owner is `downstream-resolver` (hand off to caller)
   - report-only queue: `advisory` findings plus anything owned by `human` or `release`
9. **Sort and number.** Order by severity (P0 first) -> anchor (descending) -> file path -> line number, then assign monotonically increasing `#` values across the full primary finding set in that sorted order. Do not restart numbering inside each severity table, triage group, or autofix/routing bucket. If later sections repeat a finding (for example Actionable Findings), reuse the same stable `#` so users and downstream workflows can reference findings by `#` across the report and caller handoff.
9b. **Build thematic triage groups.** After stable `#` values exist, group related findings so the reader can triage themes instead of items. This is distinct from deduplication: dedupe answers "are these the same finding?", grouping answers "are these distinct findings that should be understood or resolved together?". Groups never merge findings into a synthetic finding and never change a finding's severity, confidence, route, owner, or stable `#`. Groups span the **full primary finding set** — both actionable and report-only findings — so they organize the whole report, not just the apply queue.
   - **`grouping:off`:** skip this step.
   - **`grouping:auto` (default):** build groups when findings span distinct concerns — the trigger is distinct concerns, not item count (mirroring how plan Requirements group by capability). Skip only when all findings are genuinely about the same thing; prefer no groups over decorative single-item groups.
   - **`grouping:always`:** always build groups; use single-finding groups only when no meaningful multi-finding grouping exists.
   - **Grouping signals:** shared root cause, affected subsystem, user-facing failure mode, overlapping fix path, dependency ordering, or repeated symptoms of one design choice.
   - **Group shape:** short title, the included stable finding `#`s, one-line context, preferred resolution, and why — when one fix path resolves several findings, name it and say which finding to handle first.
   - **Ordering:** order groups by the highest-severity finding they contain, then by lowest stable `#`. A finding appears in at most one group; leave genuinely unrelated findings ungrouped.
10. **Collect coverage data.** Union residual_risks and testing_gaps across reviewers.
11. **Preserve CE local-prompt artifacts.** Keep the learnings, agent-native, and deployment-verification outputs alongside the merged finding set. Do not drop unstructured output just because it does not match the persona JSON schema. Schema drift from `data-migration` is already in the merged finding set.

### Stage 5b: Validation pass (optional quality gate)

Independent verification gate. Spawn one validator sub-agent per surviving finding using `references/validator-template.md`. Findings the validator rejects are dropped; confirmed findings flow through unchanged.

**When this stage runs:** After Stage 5 whenever at least one finding survives — skip only when zero survive. When more than 15 survive, do **not** skip the stage; validate per the budget cap in step 2. The default method is the per-finding validator wave (steps below); a surviving **P2/P3 finding at anchor 100** may instead be validated by direct first-party verification (see below). Same rule for default and `mode:agent`.

**Steps:**

1. **Select findings to validate.** All survivors of Stage 5.
2. **Apply dispatch budget cap.** If the selected set exceeds 15 findings, validate the highest-severity 15 (P0 first, then P1, then P2, then P3, breaking ties by anchor descending), dropping only from the P2/P3 tail. **Never drop a P0 or P1 from validation** — if P0/P1 findings alone exceed 15, raise the cap to include all of them. Record the over-budget count (the dropped P2/P3 tail) for the Coverage section.
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
5. **Use mid-tier model for validators.** Same platform model class the mid-tier persona reviewers use; omit the override if the model name is unknown. Validators are read-only — same constraints as persona reviewers. They may use non-mutating inspection commands (Read, Grep, Glob, git blame, gh).
6. **Record metrics for Coverage.** Total dispatched, validated true count, validated false count (with reasons), infra failures (and any P0/P1 kept-on-failure as degraded), and over-budget drops.
7. **Prune triage groups after drops.** When validation dropped any finding, rebuild or prune `triage_groups` from the validated set: a group must never reference a `#` that was rejected or dropped. Remove groups left with fewer than two findings under `grouping:auto`; under `grouping:always`, keep them as single-finding groups only when still meaningful.

**Orchestrator direct verification.** When a finding hinges on a fact the orchestrator can check cheaply and authoritatively — a pinned dependency's source, a wiring/config fact in this repo, a build tag — verify it directly with single-purpose native tools (Read/Grep/Glob, one git command at a time), never chained or error-suppressed shell. Fold confirmed facts into synthesis. Whether it can *replace* the independent validator turns on a single distinction: the orchestrator is **not** an independent second opinion (it synthesized these findings), so direct verification catches a wrong **fact** but not the orchestrator's own **bias**. Independence adds nothing to a mechanically-checkable fact and everything to a judgment call:

- **P0/P1, any anchor:** the per-finding validator wave is **required**; direct verification only *complements* it, never replaces it.
- **P2/P3 at anchor 100, MECHANICAL only** — the finding is true by inspection of the code itself: a compile/type error, a definitive logic bug, or a standards violation with a quotable rule, where the quoted line *entails* the conclusion with no interpretation. Direct verification **may stand in for** the wave. **Shortcut:** confirm the finding's `first_evidence` line (1) actually exists at the cited `file:line` in the diff/cited file, AND (2) on its own substantiates the claim (the quote *is* the bug, not merely adjacent to it). When both hold, no validator subagent is needed. **A quote proves the line exists, not that the conclusion follows** — so this shortcut is barred for any finding whose truth depends on runtime behavior or cross-file reasoning even at anchor 100: security (SSRF/IDOR/authz), concurrency/races, perf, or anything touching auth/contracts. Those keep the independent validator regardless of anchor.
- **P2/P3 at anchor 75** (judgment call — "will affect users," not airtight): the independent wave is **required** — this is exactly where a fresh second opinion filters false positives, and the orchestrator cannot supply that for its own findings.

**Why per-finding bounded dispatch (not batched):** Independence is the point. A single batched validator looking at all findings together pattern-matches across them and recreates the persona-bias problem. Per-finding dispatch preserves fresh context while the scheduler respects harness limits.

### Stage 5c: Act on findings (default mode only)

**Skip entirely in `mode:agent`** — that mode is a machine handoff and the caller owns apply. In default (interactive) mode the review is the top-level agent, so it applies the fixes it is confident in before presenting the report.

**Act policy (bias to act).** Default to applying every finding that is a clear improvement and a reversible edit, regardless of severity. The work is a tracked, visible diff that can be reverted — so leaving a clean fix unapplied "to be safe" is the failure mode, not the safe choice. Decide by judgment, not a safety checklist:

- **Apply** clear improvements — the common case (test hardening, dead-code removal, a localized fix with a concrete `suggested_fix`).
- **Push back** — do not apply — when the reviewer is wrong; keep the finding and state the disagreement with reasoning.
- **Skip with judgment** taste calls and conflicting suggestions, but surface what was skipped and why. Never silently drop.

Severity, confidence, and cross-reviewer agreement tell you what to do first and what to flag loudly — they do not gate the decision. There is no deny-list: downside is controlled after the fact (revert + visible diff + the commit checkpoint), not by a precondition.

**Scope invariant.** Apply only when the working tree *is* what was reviewed — `local-aligned` or standalone. In `pr-remote` / `branch-remote` the working tree is not the reviewed head; do not apply — report instead.

**Verify, then keep.** After applying, run the affected tests and lint (targeted by default; broaden when fixes span files). If they fail, revert that fix and report it as a finding instead — an unverified fix is not finished. Never leave the tree red.

**Review the autofix diff before finishing.** Before committing or reporting applied fixes, diff only the changes introduced during Stage 5c against the pre-apply checkpoint. Run one self-review pass over that diff:
- If the same helper, policy, or guard was added to multiple parallel surfaces, extract it or explain in the Applied section why duplication is intentional.
- If an exported/shared function now accepts a broader input shape, update the nearby docs, types, or tests that define the contract so future callers understand it.
- If a reviewer item is pure information (no defect, no code contract change, no test gap), classify it as advisory/non-actionable in Coverage or residual risks; do not patch it or describe it as a missed defect.
If this self-review changes files, rerun the affected tests or lint for those follow-up edits before committing or reporting; the earlier validation only covers the original autofix diff.

**Commit when the pre-review tree was clean.** Before applying, note whether the working tree already had uncommitted changes (`git status --porcelain`). The permanence gate is the **push**, not the commit — a local commit is private and reversible (`git reset --soft HEAD~1`).

- **Clean before the review:** after applying and verifying, commit the fixes as one isolated, review-labeled fix commit — `fix(review): <summary>`, or the repo's nearest convention if `review` isn't an allowed scope. Labeled and reversible, returning the tree to a known state.
- **Dirty before the review:** apply but do **not** commit — the fixes interleave with the user's in-flight work and ride along with the commit they were already going to make. The Applied section lists what changed.
- **Never push, open a PR, or file tickets** — that's the outward-facing step the user owns.

**Surface green-but-unverifiable edits.** When an applied fix touches auth/authz, a public or cross-service contract/schema, or concurrency/ordering, a passing test does not prove safety — flag it prominently in the Applied section so the diff reviewer's attention goes there.

**Re-partition triage groups after apply.** Triage groups describe the *remaining* work. After Stage 5c, prune applied findings out of `triage_groups` before Stage 6 rendering — a group must never tell the user to handle a finding that was already applied. When an applied fix resolved part of a theme, note that in the group's context line instead of keeping the applied `#` in the group. Re-apply the same minimum-size rule as Stage 5b step 7 (drop sub-two-finding groups under `grouping:auto`).

### Stage 6: Synthesize and present

Assemble the final report. **Default:** human-readable markdown. **`mode:agent`:** skip markdown and emit JSON (see ### JSON output format) — the structured fields are how a downstream agent consumes the review. Put `---` before the verdict in markdown mode.

**Before writing, load `references/review-output-template.md` and mirror its section skeleton** — that file is the canonical skeleton for *which sections appear and in what order*; its example shows one good rendering, not the only permitted layout. The direction below is the always-loaded fallback so it survives a long session even if the template was not reloaded.

**Presentation direction — optimize for the reader's next action (goal + considerations, not a fixed layout).** The report is *acted on*: by a human deciding what to fix and whether to merge, or by a downstream agent applying fixes. Shape it so that action is fast and well-founded.

- **Per finding, make four things unambiguous** (in whatever layout reads clearest): *what & where* — one scannable line, the symptom + `file:line`, not the mechanism; *why it matters* — what breaks or who's hit, never a restatement of the code; *what response it needs* — this varies by finding type: a bug states its fix, a **design call** presents the options and the tradeoff without forcing one answer, a coverage gap names the test and precedent to mirror, a residual risk is marked informational, an already-applied item gives what changed and how it was verified; *how sure* — confidence, and whether it was corroborated (cross-reviewer / cross-model agreement is the strongest signal — say so).
- **Let the shape serve the finding type; stay consistent within a section.** A terse table, a short keyed block, or a compact list are all fine — pick what reads clearest for that content. Consistency *within* a section matters; a single global shape does not.
- **Group by the unit of work or decision, not just severity.** Severity orders urgency; it does not tell the actor what *kind* of action a finding needs. Surface the split: **decisions a human must make** (design calls, ambiguous semantics) vs **mechanical work that can just be done** (tests, dedup, concrete fixes) vs **informational** (residual risks) — an agent clears the mechanical work and must stop at decisions. Group findings sharing a root cause or one fix (the Triage Groups) and name the order/dependency ("decide X once -> resolves #1 and #7; do #1 first"); the unit of work is often a group, not a finding.
- **Detail is earned by enabling the next action, not by demonstrating thoroughness.** Cover *every* finding — completeness is non-negotiable — but say each in the least that lets the consumer act. **Do not paste file contents or re-print the diff**; it is already in the repo/PR — cite `file:line` and spend words only on what the diff can't show (why it breaks, the fix, the repro). This governs *expression, never coverage*: never drop a finding or its why/fix to be shorter, and match weight to weight (a nit is one line; a P1 design call earns room).
- **The bottom is the most-read screen — make the closing self-sufficient.** In long output the reader's viewport lands at the end, so the **Verdict and Actionable list must stand alone without scrolling**: the verdict plus the single most important thing to do, then the prioritized actionable list where each item already carries severity, `file:line`, the terse what, and its response-type. The itemized findings above are drill-down evidence, referenced by stable `#`.

**Hard constraints (non-negotiable; everything above is judgment):**
- **ASCII-safe only — no box-drawing or per-item horizontal-rule separators (`────`, `———`), no Unicode arrows or middot (`·`); use `->`.** These break across terminals and violate repo convention. (The single report-level `---` before the verdict is fine.)
- **Stable `#` numbering from Stage 5** — never re-derive per section; reuse the same `#` everywhere a finding appears. A multi-file applied fix is one row with one `#`, never duplicated.
- **If you use a markdown table, escape literal `|` in cells as `\|`** so a pipe inside a title/regex/cache-key example doesn't split the row.
- **The Verdict and Actionable list are present, last, and self-sufficient.** This is satisfied by the closing, not the section skeleton: the Verdict is the final report section, immediately followed by the post-report prioritized Actionable recap (default mode — see *Emit actionable findings summary* below). The in-report `Actionable Findings` section keeps its skeleton position (5) as the detailed table; the recap is the self-sufficient last word the reader sees without scrolling. (If for some layout you cannot emit the recap, move the Actionable list itself to just after the Verdict.)

1. **Header.** Scope, intent, mode, reviewer team with per-conditional justifications.
2. **Applied (default mode only).** When Stage 5c applied fixes, list them first — before the findings — in an Applied section (see review output template); each entry carries `#`, file, the fix, and reviewer (a multi-file fix is one row with one `#`), then a one-line validation outcome (e.g. "pin tests 4 -> 6; suite 94 pass, lint clean") and commit status (committed on a clean tree as `fix(review): …` or the repo's nearest convention, or left uncommitted for the user on a dirty one). Flag green-but-unverifiable edits (auth/contract/concurrency) prominently. Omit this section in `mode:agent` and when nothing was applied. Applied findings appear here, not in the severity tables.
2b. **Triage Groups.** When finalized `triage_groups` exist (post-validation, post-apply — Stage 5b step 7 / Stage 5c), render a `### Triage Groups` section before the findings as a compact table (`| Group | Findings | Context | Preferred Resolution | Why |`) — a table fits this content well. The `Findings` cell lists the stable `#`s it covers; the resolution names the order/dependency. **Mark whether each group is an apply-queue or a decision-gate** (so an automated fixer applies the mechanical groups and stops at the design calls). Every referenced `#` must appear in the findings below; groups supplement the findings, never replace them. Omit the section when `grouping:off` is active or no groups survived. In `mode:agent` this section is carried by the `triage_groups` JSON field instead.
3. **Findings.** Grouped by severity (`### P0 -- Critical`, `### P1 -- High`, `### P2 -- Moderate`, `### P3 -- Low`), rendered per the per-finding direction above and consistent within the section. Surface the decision-vs-mechanical split where it helps the actor (flag the design calls). Omit empty severity levels. Finding numbers come from the stable assignment in Stage 5 -- never re-derive them per severity section or triage group.
4. **Requirements Completeness.** Include only when a plan was found in Stage 2b. For each requirement (R1, R2, etc.) and implementation unit in the plan, report whether corresponding work appears in the diff. Use a simple checklist: met / not addressed / partially addressed. Routing depends on `plan_source`:
   - **`explicit`** (caller-provided or PR body): Flag unaddressed requirements or implementation units as P1 findings with `autofix_class: manual`, `owner: downstream-resolver`. These enter the actionable queue.
   - **`inferred`** (auto-discovered): Flag unaddressed requirements or implementation units as P3 findings with `autofix_class: advisory`, `owner: human`. These stay in the report only — no autonomous follow-up. An inferred plan match is a hint, not a contract.
   Omit this section entirely when no plan was found — do not mention the absence of a plan.
5. **Actionable Findings.** Include when the actionable queue is non-empty — findings the caller should address (`gated_auto` / `manual` with `downstream-resolver`), plus anything Stage 5c chose not to apply. In default mode, findings already applied appear in the Applied section, not here.
6. **Pre-existing.** Separate section, does not count toward verdict.
7. **Learnings & Past Solutions.** Surface `learnings-researcher` local-prompt results: if past solutions are relevant, flag them as "Known Pattern" with links to docs/solutions/ files.
8. **Agent-Native Gaps.** Surface `agent-native-reviewer` local-prompt results. Omit section if no gaps found.
9. **Deployment Notes.** If the `deployment-verification-agent` local prompt ran, surface the key Go/No-Go items: blocking pre-deploy checks, the most important verification queries, rollback caveats, and monitoring focus areas. Keep the checklist actionable rather than dropping it into Coverage. Schema drift appears in the findings tables as `data-migration` P1 rows — do not add a separate Schema Drift section.
10. **Coverage.** Applied count (when Stage 5c ran), suppressed count by anchor (e.g., "N findings suppressed at anchor 50, M at anchor 25"), mode-aware demotion count, validator drop count and reasons (when Stage 5b ran), any P0/P1 with degraded validation (kept on validator infra failure), validator over-budget drops (when the 15-cap fired), residual risks, testing gaps, failed/timed-out reviewers, and inferred-intent uncertainty when applicable. When the Stage 3c lite roster ran, state it and the reduced reviewer set (so the narrower coverage is visible). When the Stage 5b direct-verification shortcut skipped validators for anchor-100 findings, note how many were verified by quote rather than by an independent validator subagent. When the Stage 5 quote-the-line gate demoted any 75/100 finding for missing `first_evidence`, record that count. **Removable surface (only when deletion-oriented maintainability findings exist):** one line giving the approximate net lines/files those findings would remove if applied (e.g., "Removable surface: ~120 lines / 2 files across findings #4, #7"). This is a dead-weight signal, **not** a reduction target — never lower the bar for a finding or invent deletions to grow the number, and omit the line entirely when no finding proposes a deletion.
11. **Verdict.** Ready to merge / Ready with fixes / Not ready. Fix order if applicable. When an `explicit` plan has unaddressed requirements or implementation units, the verdict must reflect it — a PR that's code-clean but missing planned requirements is "Not ready" unless the omission is intentional. When an `inferred` plan has unaddressed requirements or implementation units, note it in the verdict reasoning but do not block on it alone.

Do not include time estimates.

**Final check before delivering (default only).** Verify the hard constraints, not a layout: no box-drawing / per-item horizontal-rule separators (`────`), no Unicode arrows or middot (`·`) anywhere; stable `#`s consistent across sections; literal `|` escaped (`\|`) in any table cell; and **the closing stands alone** — a reader seeing only the last screen gets the verdict and the prioritized actionable list, each item carrying its severity, `file:line`, terse what, and response-type. Re-render anything that fails. Skip when `mode:agent` is active.

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
  "triage_groups": [],
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

Each object in `findings` uses the merged finding fields: `#`, `title`, `severity`, `file`, `line`, `confidence`, `autofix_class`, `owner`, `requires_verification`, `pre_existing`, `suggested_fix`, `first_evidence`, `why_it_matters`, `evidence`, `reviewers`.

`actionable_findings` lists the `gated_auto` / `manual` + `downstream-resolver` subset with the same fields plus stable `#`.

Each object in `triage_groups` carries `{ "title", "findings": [<stable #s>], "context", "preferred_resolution", "why" }` — the finalized groups from Stage 5 step 9b after Stage 5b pruning. Every referenced `#` must exist in `findings` (the full set) — **not** necessarily in `actionable_findings`. Groups are a triage **lens over all findings, not an apply queue**: a group (and its `preferred_resolution` ordering) can reference advisory or `human`/`release`-owned findings that the caller must not apply. So a caller batching related fixes by theme must first intersect each group's `findings` with `actionable_findings` and act only on that subset — the apply handoff stays `actionable_findings`, never `triage_groups`. Empty array when `grouping:off` is active or no groups were built.

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

Stack-specific reviewers fire only when the diff touches runtime behavior they specialize in (async UI races, iOS/Swift lifecycle) — never mechanically from file extensions alone; the trigger is meaningful changed behavior in that stack's runtime domain. Structural quality (complexity deletion, 1k-line regressions, type-boundary leaks) lives in the always-on `maintainability-reviewer`; do not spawn extra reviewers for language conventions, philosophy, or "strict bar" passes.

## After Review

After Stage 6, stop. Never push, open PRs, or file tickets from this skill. In default (interactive) mode, Stage 5c has already applied and (on a clean pre-review tree) committed the safe fixes; in `mode:agent` the review mutates nothing — the caller (for example `ce-work`) and the user apply fixes, file tickets, or accept residual risk using the report and artifact.

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
| `references/repo-profile-cache.md` | Stage 2c | Shared repo-profile cache protocol |
| `references/persona-catalog.md` | Stage 3 | Full per-persona selection criteria and spawn gates |
| `references/subagent-template.md` | Stage 4 | Dispatch shape for every persona subagent |
| `references/diff-scope.md` | Stage 4 | Shared diff-scope rules passed to each subagent |
| `references/findings-schema.json` | Stage 4 | JSON output contract passed to each subagent |
| `references/cross-model-review.md` | Stage 4 (only when the cross-model adversarial pass runs) | Host self-identification + peer-CLI shell-out |
| `references/action-class-rubric.md` | Action Routing (as needed) | Persona guidance for `autofix_class` |
| `references/review-output-template.md` | Stage 6 | Canonical section skeleton for the report |

Selected reviewer prompt assets live under `references/personas/`. Read only the prompt files selected for the current review.
