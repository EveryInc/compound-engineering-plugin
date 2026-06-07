---
name: ce-code-review
description: "Structured code review using tiered persona agents, confidence-gated findings, and a merge/dedup pipeline. In interactive mode it applies safe, verified fixes and commits them when the working tree is clean (it never pushes); in mode:agent it reports only and the caller applies. Use when reviewing code changes before creating a PR."
argument-hint: "[mode:agent] [blank to review current branch, or provide PR link]"
---

# Code Review

## Argument Parsing

Parse `$ARGUMENTS` for optional tokens. Strip each recognized token before interpreting the remainder as a PR number, GitHub URL, or branch name.

| Token | Example | Effect |
|-------|---------|--------|
| `mode:agent` | `mode:agent` | **Report-only**: return **JSON** instead of markdown tables and skip the Stage 5c apply (the caller applies). Does not change reviewer selection, merge logic, or scope rules (see Output format) |
| `base:<sha-or-ref>` | `base:abc1234` or `base:origin/main` | Diff base on the **current checkout** (explicit; skips auto base detection) |
| `plan:<path>` | `plan:docs/plans/2026-03-25-001-feat-foo-plan.md` | Plan file for requirements verification (explicit) |

`mode:agent` is the only supported `mode:` token.

**Conflicting arguments:** Stop without dispatching reviewers when:
- Multiple incompatible scope selectors appear together (e.g. `base:` **and** a PR number/branch target; `base:` means "review the current checkout against this base").
- Any `mode:` token other than `mode:agent` appears, alone or combined with `mode:agent`.

Emit a one-line failure reason. In `mode:agent`, return JSON: `{"status":"failed","reason":"..."}`.

## Operating principles

- **Apply locally; never push.** In **default (interactive)** mode the review applies safe, verified fixes and commits them when the pre-review tree was clean (Stage 5c owns the full rule). In **`mode:agent`** it never mutates the tree: it reports and the caller applies.
- **No blocking prompts.** Never use `AskUserQuestion`, `request_user_input`, `ask_user`, or other blocking question tools. Infer intent, plan, and scope from explicit tokens, git state, PR metadata, and conversation. Note uncertainty in Coverage or the verdict; do not stop to ask.
- **Explicit mutations only.** Never run `gh pr checkout`, `git checkout`, `git switch`, or similar branch-switch commands. Passing a PR number, URL, or branch name selects **review scope**, not permission to mutate the working tree.
- **Smart defaults.** Untracked files: review tracked changes only and list excluded paths in Coverage. Plan: use `plan:` when passed; otherwise discover conservatively from PR body or branch keywords. Weak advisory P2/P3 from testing alone: demote to `testing_gaps` per Stage 5.

## Output format

| Invocation | Deliverable |
|------------|-------------|
| **Default** | Markdown report (pipe-delimited finding tables) + Actionable Findings summary |
| **`mode:agent`** | One JSON object (see ### JSON output format below) + the same `/tmp/.../ce-code-review/<run-id>/` artifacts |

`mode:agent` is **report-only**: skips Stage 5c (the caller applies) and serializes findings as JSON. The default markdown is the human view; keep it ASCII-safe (pipe tables, `->` not middot `·`, no box-drawing) so it degrades across terminals.

## Quick Review Short-Circuit

If `$ARGUMENTS` indicates the user wants a quick, fast, or light code review, and **`mode:agent` is not active**, do not dispatch the multi-agent flow.

**Announce the chosen path** before any other work (Quick review vs Multi-agent review). Skip this announcement when `mode:agent` is active.

1. **Run the harness's built-in code review.** Forward any review target after stripping tokens, then stop. Do not dispatch the multi-agent pipeline.
2. **Exemption:** If no built-in review exists, continue into the full multi-agent review.
3. **`mode:agent` bypasses this short-circuit:** always run the full multi-agent review and return JSON.

## Severity Scale

All reviewers use P0-P3:

| Level | Meaning | Action |
|-------|---------|--------|
| **P0** | Critical breakage, exploitable vulnerability, data loss/corruption | Must fix before merge |
| **P1** | High-impact defect likely hit in normal usage, breaking contract | Should fix |
| **P2** | Moderate issue with meaningful downside (edge case, perf regression, maintainability trap) | Fix if straightforward |
| **P3** | Low-impact, narrow scope, minor improvement | User's discretion |

## Action Routing

Severity answers **urgency**. `autofix_class` and `owner` are **signal** describing follow-up shape for callers, **not apply permission or an apply gate.** The apply decision is judgment (Stage 5c), not a function of `autofix_class`. There is no apply *mode*: in default (interactive) mode the review applies; in `mode:agent` this skill does not mutate the checkout, so the caller applies. See `references/action-class-rubric.md` for persona guidance.

| `autofix_class` | Default owner | Meaning |
|-----------------|---------------|---------|
| `gated_auto` | `downstream-resolver` or `human` | Concrete `suggested_fix` proposed; caller applies after judgment |
| `manual` | `downstream-resolver` or `human` | Actionable work needing design input or handoff |
| `advisory` | `human` or `release` | Report-only: learnings, rollout notes, residual risk |

Routing rules:

- **Synthesis owns the final route.** Persona-provided routing metadata is input, not the last word.
- **Choose the more conservative route on disagreement.** A merged finding may move from `gated_auto` to `manual`, but never widen without stronger evidence.
- **Reject `safe_auto` and `review-fixer` if present:** drop the finding or remap to `gated_auto` / `downstream-resolver` during synthesis.
- **`requires_verification: true` means any caller-applied fix needs targeted tests or follow-up validation.**

## Reviewers

**Always-on (every review):** `ce-correctness-reviewer`, `ce-testing-reviewer`, plus the CE agent `ce-learnings-researcher`.

**Cross-cutting conditional (per diff):**

- `ce-security-reviewer`: auth, public endpoints, user input, permissions
- `ce-performance-reviewer`: DB queries, data transforms, caching, async
- `ce-adversarial-reviewer`: >=50 changed code lines, or auth / payments / data mutations / external APIs
- `ce-previous-comments-reviewer`: PR with existing review comments (PR-only, comment-gated)

Every review spawns both always-on personas plus the CE always-on agent, then adds whichever conditionals fit the diff.

## Protected Artifacts

These compound-engineering pipeline artifacts must never be flagged for deletion, removal, or gitignore by any reviewer:

- `docs/brainstorms/*` -- requirements documents created by ce-brainstorm
- `docs/plans/*.md` -- plan files created by ce-plan (decision artifacts; execution progress is derived from git, not stored in plan bodies)
- `docs/solutions/*.md` -- solution documents created during the pipeline

If a reviewer flags any file in these directories for cleanup or removal, discard that finding during synthesis.

## How to Run

### Stage 1: Determine scope

Compute the diff range, file list, and diff. Minimize permission prompts by combining into as few commands as possible.

**If `base:` argument is provided (fast path):**

The caller already knows the diff base. Skip base-branch detection, remote resolution, and merge-base computation. Use the provided value directly:

```
BASE_ARG="{base_arg}"
BASE=$(git merge-base HEAD "$BASE_ARG" 2>/dev/null) || BASE="$BASE_ARG"
```

Then produce the same output as the other paths:

```
echo "BASE:$BASE" && echo "FILES:" && git diff --name-only $BASE && echo "DIFF:" && git diff -U10 $BASE && echo "UNTRACKED:" && git ls-files --others --exclude-standard
```

This path works with any ref: a SHA, `origin/main`, a branch name. **Do not combine `base:` with a PR number or branch target**; stop with an error.

**If a PR number or GitHub URL is provided as an argument:**

Do **not** check out the PR branch. Scope comes from GitHub read APIs plus optional local alignment when HEAD already matches the PR head branch.

**Skip-condition pre-check.** Before scope detection, run a PR-state probe:

```
gh pr view <number-or-url> --json state,title,body,files
```

Apply skip rules in order:

- `state` is `CLOSED` or `MERGED` -> stop with reason `PR is closed/merged; not reviewing.`
- **Trivial-PR judgment**: spawn a lightweight sub-agent (use `model: haiku` in Claude Code; gpt-5.4-nano or equivalent in Codex) with the PR title, body, and changed file paths. The agent's task: "Is this an automated or trivial PR that does not warrant a code review? Consider dependency lock-file or manifest-only bumps, automated release commits, chore version increments with no substantive code changes. When in doubt, answer no: a skipped review that should have run costs more than an unnecessary one." If the judgment returns yes: stop with reason `PR appears to be a trivial automated PR; not reviewing. Run without a PR argument to review the current branch, or pass base:<ref> if review is intended.`

When any skip rule fires, stop without dispatching reviewers. **Default mode:** emit the reason as plain text. **`mode:agent`:** emit JSON only, `{"status":"skipped","reason":"<same message>"}`, so programmatic callers can parse the outcome. **Standalone**, **`base:`**, and **branch-remote** paths are unaffected. **Draft PRs are reviewed normally.**

If no skip rule fires, fetch PR metadata **without checkout**:

```
gh pr view <number-or-url> --json title,body,baseRefName,headRefName,headRefOid,isCrossRepository,url,files,reviews,comments --jq '{title, body, baseRefName, headRefName, headRefOid, isCrossRepository, url, files: [.files[].path], hasPriorComments: ((.reviews | map(select(.state != "APPROVED" or .body != "")) | length) > 0 or (.comments | length) > 0)}'
```

Set `BASE:` to `pr:<number-or-url>` (logical marker, not a git SHA). Set `UNTRACKED:` from `git ls-files --others --exclude-standard` on the **current** checkout (usually empty during PR-remote review).

**PR scope mode.** Classify as **`local-aligned`** only when **all** of these hold; otherwise use **`pr-remote`**:

1. `git rev-parse --abbrev-ref HEAD` equals `headRefName`.
2. The PR is **not** cross-repository (`isCrossRepository` is false).
3. The PR head commit is contained in the local checkout: `git merge-base --is-ancestor <headRefOid> HEAD` exits 0. This confirms the working tree carries the PR head (allowing unpushed local fixes layered on top) rather than an unrelated same-named branch.

- **`local-aligned`**: all three checks pass. Local workspace inspection is valid.
- **`pr-remote`**: any check fails. Do not Read/Grep workspace paths for changed files.

**Diff by scope mode** (do not mix remote and local diffs; contradictory hunks cause false positives):

- **`local-aligned`:** Resolve `<resolved-base-ref>` from `baseRefName` (fetch if needed). Compute `BASE=$(git merge-base HEAD <resolved-base-ref>)`, then set `FILES:` from `git diff --name-only $BASE` and `DIFF:` from `git diff -U10 $BASE` (includes committed, staged, and unstaged changes on the PR branch). Do **not** call `gh pr diff` or append remote hunks; when unpushed fixes exist, the local tree is canonical. Note in Coverage: `scope: local-aligned (PR; local tree diff)`.
- **`pr-remote`:** Set `FILES:` from the PR `files` array. Set `DIFF:` from `gh pr diff <number-or-url> --color=never`. If `gh pr diff` fails, stop with an actionable error; do not fall back to checkout.

When **`pr-remote`**, before Stage 4:

1. Best-effort fetch PR head without checkout: `git fetch --no-tags origin <headRefName>:refs/review/pr-<number>-head` (substitute PR number from metadata).
2. When fetch succeeds, set `PR_HEAD_REF=refs/review/pr-<number>-head` for reviewers and validators. When fetch fails, omit `PR_HEAD_REF` and note in Coverage; reviewers must rely on diff hunks only.
3. Best-effort fetch the PR base without checkout: `git fetch --no-tags origin <baseRefName>`. When it succeeds, resolve a concrete ref with `git rev-parse FETCH_HEAD` and set `PR_BASE_REF` to that SHA, a **real git base ref** reviewers and validators use for file-level git diffs. The `pr:<number-or-url>` logical marker in `BASE:` stays the scope marker; `PR_BASE_REF` is the diffable base. When the fetch fails, omit `PR_BASE_REF` and note in Coverage; git-diff checks fall back to diff hunks only and must **not** assume `main`.
4. Include `<pr-scope-mode>pr-remote</pr-scope-mode>` and, when set, `<pr-head-ref>...</pr-head-ref>` and `<pr-base-ref>...</pr-base-ref>` in the Stage 4 review context bundle.

Reviewers and Stage 5b validators in **`pr-remote`** mode must **not** Read/Grep workspace paths for files in `FILES:`. Inspect via `git show <PR_HEAD_REF>:<path>` when `PR_HEAD_REF` is set, otherwise use only the provided diff hunks. **`local-aligned`** uses normal workspace inspection.

**If a branch name is provided as an argument:**

Substitute the provided branch name as `<branch>`. Do **not** check out `<branch>`.

If `git rev-parse --abbrev-ref HEAD` equals `<branch>`, use the **standalone (current branch)** path below: same tree, explicit branch name, no remote-only diff.

Otherwise diff the remote/local ref **without checkout**:

1. Try `gh pr view <branch> --json baseRefName,url,headRefName`. If a PR exists, prefer the **PR number/URL path** above (same remote diff rules).
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

If no base can be resolved, **stop**. Do not fall back to `git diff HEAD`: a standalone review without the base shows only uncommitted changes and silently misses all committed work on the branch.

On success, produce the diff:

```
echo "BASE:$BASE" && echo "FILES:" && git diff --name-only $BASE && echo "DIFF:" && git diff -U10 $BASE && echo "UNTRACKED:" && git ls-files --others --exclude-standard
```


**Untracked file handling:** Always inspect `UNTRACKED:`. Untracked paths are out of scope unless staged. When non-empty, list excluded files in Coverage and continue on tracked changes only; never stop or prompt.

### Stage 2: Intent discovery

Understand what the change is trying to accomplish. The source of intent depends on which Stage 1 path was taken:

**PR/URL mode:** Use the PR title, body, and linked issues from `gh pr view` metadata. Supplement with commit messages from the PR if the body is sparse.

**Branch mode:** Run `git log --oneline ${BASE}..<branch-ref>` using the resolved merge-base and resolved branch ref from Stage 1.

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

**When intent is ambiguous:** Infer from branch name, commits, PR title/body, diff, `plan:`, and conversation. Write the best-effort intent summary and note uncertainty in Coverage; never block on a clarifying question.

### Stage 2b: Plan discovery (requirements verification)

Locate the plan document so Stage 6 can verify requirements completeness. Check these sources in priority order, stopping at the first hit:

1. **`plan:` argument.** If the caller passed a plan path, use it directly. Read the file to confirm it exists.
2. **PR body.** If PR metadata was fetched in Stage 1, scan the body for paths matching `docs/plans/*.md`. If exactly one match is found and the file exists, use it as `plan_source: explicit`. If multiple plan paths appear, treat as ambiguous: demote to `plan_source: inferred` for the most recent match that exists on disk, or skip if none exist or none clearly relate to the PR title/intent. Always verify the selected file exists before using it; stale or copied plan links in PR descriptions are common.
3. **Auto-discover.** Extract 2-3 keywords from the branch name (e.g., `feat/onboarding-skill` -> `onboarding`, `skill`). Glob `docs/plans/*` and filter filenames containing those keywords. If exactly one match, use it. If multiple matches or the match looks ambiguous (e.g., generic keywords like `review`, `fix`, `update` that could hit many plans), **skip auto-discovery**: a wrong plan is worse than no plan. If zero matches, skip.

**Confidence tagging:** Record how the plan was found:
- `plan:` argument -> `plan_source: explicit` (high confidence)
- Single unambiguous PR body match -> `plan_source: explicit` (high confidence)
- Multiple/ambiguous PR body matches -> `plan_source: inferred` (lower confidence)
- Auto-discover with single unambiguous match -> `plan_source: inferred` (lower confidence)

If a plan is found, read its **Requirements** section (`## Requirements` in current plans, `## Requirements Trace` in legacy ones) and the R-IDs (R1, R2, etc.) listed there, plus **Implementation Units** (current numeric subsections such as `### U1.`, `### U2.`, or `### Unit 1:` under `## Implementation Units`; legacy bullet or checkbox unit entries under that section also count). Store the extracted requirements list and `plan_source` for Stage 6. Do not block the review if no plan is found; requirements verification is additive, not required.

### Stage 3: Select reviewers

Read the diff and file list from Stage 1. The 2 always-on personas and the CE always-on agent are automatic. For each cross-cutting conditional persona in the persona catalog included below, decide whether the diff warrants it. This is agent judgment, not keyword matching.

**File-type awareness for conditional selection:** Instruction-prose files (Markdown skill definitions, JSON schemas, config files) are product code but do not benefit from runtime-focused reviewers. The adversarial reviewer's techniques (race conditions, cascade failures, abuse cases) target executable code behavior. For diffs that only change instruction-prose files, skip adversarial unless the prose describes auth, payment, or data-mutation behavior. Count only executable code lines toward line-count thresholds.

**`previous-comments` is PR-only AND comment-gated.** Only select this persona when both conditions hold:

1. Stage 1 gathered PR metadata (PR number or URL was provided as an argument, or `gh pr view` returned metadata for the current branch).
2. `hasPriorComments` from Stage 1 is true (the PR has at least one review submission or issue comment).

Skip it for standalone branch reviews with no associated PR, and for PRs with no prior feedback.

Cross-cutting conditionals are additive when the diff warrants them: a change to auth or public endpoints warrants `security`; a >=50-line or high-risk diff warrants `adversarial`.

Announce the team before spawning:

```
Review team:
- correctness (always)
- testing (always)
- ce-learnings-researcher (always)
- security -- new endpoint in routes.rb accepts user-provided redirect URL
- adversarial -- 80-line change to the payment capture path
```

This is progress reporting, not a blocking confirmation.

### Stage 3b: Discover project standards paths

Use the native file-search/glob tool to find all `**/CLAUDE.md` and `**/AGENTS.md` in the repo. Filter to those whose directory is an ancestor of at least one changed file (e.g., `plugins/compound-engineering/AGENTS.md` applies to everything under `plugins/compound-engineering/`).

Pass the resulting path list to the `testing` persona inside a `<standards-paths>` block in its review context (see Stage 4). The testing persona runs the project-standards audit against those files.

### Stage 4: Spawn sub-agents

#### Model tiering

Three reviewers inherit the session model with no override: `ce-correctness-reviewer`, `ce-security-reviewer`, and `ce-adversarial-reviewer`. All other persona sub-agents and CE agents use the platform's mid-tier model.

#### Run ID

Generate a unique run identifier before dispatching any agents. This ID scopes all agent artifact files and the post-review run artifact to the same directory.

```bash
RUN_ID=$(date +%Y%m%d-%H%M%S)-$(head -c4 /dev/urandom | od -An -tx1 | tr -d ' ')
mkdir -p "/tmp/compound-engineering/ce-code-review/$RUN_ID"
```

Pass `{run_id}` to every persona sub-agent so they can write their full analysis to `/tmp/compound-engineering/ce-code-review/{run_id}/{reviewer_name}.json`.

**Large shared context: pass paths, not contents.** Write the diff and file list once into the run dir and pass paths instead of inlining large diffs.

#### Spawning

Omit the `mode` parameter when dispatching sub-agents so the user's configured permission settings apply. Do not pass `mode: "auto"`.

**Model override at dispatch time.** Pass the platform's mid-tier model on every dispatch except `ce-correctness-reviewer`, `ce-security-reviewer`, and `ce-adversarial-reviewer`, which inherit the session model (per the Model tiering subsection above). In Claude Code, add `model: "sonnet"` to the `Agent` tool call. In Codex, pass the equivalent mid-tier on `spawn_agent` (e.g., `gpt-5.4-mini` as of April 2026). In Pi, pass the equivalent on `subagent` via the `pi-subagents` extension. On platforms where the dispatch primitive has no model-override parameter or the model names are unknown, omit the override: a working review on the parent model beats a broken dispatch on an unrecognized name. Check this on every Agent / `spawn_agent` / `subagent` call in the parallel dispatch; omitting it on Opus sessions silently 3-4x's the cost of a review.

**Bounded parallel dispatch.** Respect the active-subagent limit; queue reviewers and fill freed slots as they complete. Treat spawn errors as backpressure, not reviewer failure: leave queued and retry. Record a reviewer as failed only after a successful dispatch times out or fails, or when dispatch fails for a non-capacity reason.

Spawn each selected persona reviewer using the subagent template included below. Each persona sub-agent receives:

1. Their persona file content (identity, failure modes, calibration, suppress conditions)
2. Shared diff-scope rules from the diff-scope reference included below
3. The JSON output contract from the findings schema included below
4. PR metadata: title, body, and URL when reviewing a PR (empty string otherwise). Passed in a `<pr-context>` block so reviewers can verify code against stated intent
5. Review context: intent summary, file list, diff, scope mode (`local-aligned` | `pr-remote` | `branch-remote`), and remote head ref (`PR_HEAD_REF` or `<branch-head-ref>`) when set
6. Run ID and reviewer name for the artifact file path
7. **For `testing` only:** the standards file path list from Stage 3b, wrapped in a `<standards-paths>` block appended to the review context (the testing persona runs the project-standards audit)

Persona reviewer sub-agents are **read-only** with respect to the project: they review and return structured JSON, never editing files, proposing refactors, changing branches, committing, pushing, or creating PRs. The one permitted write is their full analysis to the run-artifact path in the output contract (under `/tmp/compound-engineering/ce-code-review/<run-id>/`). They may use non-mutating inspection (`git diff`, `git show`, `git blame`, `git log`, `gh pr view`); in **`pr-remote`** or **`branch-remote`** scope, inspect via `git show <remote-head-ref>:<path>` or diff hunks, not Read/Grep on workspace paths.

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

The artifact file **must** carry the detail-tier fields (`why_it_matters`, `evidence`); the compact *return* omits them. `suggested_fix` is optional in both tiers; include in compact returns when present. If the file write fails, the compact return still provides everything the merge needs.

**CE always-on agent** (ce-learnings-researcher) is dispatched as a standard Agent call through the same bounded parallel scheduler. Give it the same review context bundle the personas receive: entry mode, PR metadata, intent summary, review base, `BASE:` marker, file list, diff, and `UNTRACKED:` scope notes. Its output is unstructured and synthesized separately in Stage 6.

### Stage 5: Merge findings

Convert multiple reviewer compact JSON returns into one deduplicated, confidence-gated finding set. The compact returns contain merge-tier fields (title, severity, file, line, confidence, autofix_class, owner, requires_verification, pre_existing) plus the optional suggested_fix. Detail-tier fields (why_it_matters, evidence) are on disk in the per-agent artifact files, not loaded at this stage.

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
2. **Deduplicate.** Compute fingerprint: `normalize(file) + line_bucket(line, +/-3) + normalize(title)`. When fingerprints match, merge: keep highest severity, keep highest anchor, note which reviewers flagged it. Dedup runs over the full validated set (including anchor 50) so cross-reviewer promotion in step 3 can lift matching anchor-50 findings into the actionable tier.
3. **Cross-reviewer agreement.** When 2+ independent reviewers flag the same issue (same fingerprint), promote the merged finding by one anchor step: `50 -> 75`, `75 -> 100`, `100 -> 100`. Note the agreement in the Reviewer column (e.g., "security, correctness").
4. **Separate pre-existing.** Pull out findings with `pre_existing: true` into a separate list.
5. **Resolve disagreements.** When reviewers flag the same code region but disagree on severity, autofix_class, or owner, annotate the Reviewer column with the disagreement (e.g., "security (P0), correctness (P1) -- kept P0").
6. **Normalize routing.** For each merged finding, set the final `autofix_class`, `owner`, and `requires_verification`. If reviewers disagree, keep the more conservative route. Remap any legacy `safe_auto` or `review-fixer` to `gated_auto` / `downstream-resolver`.
6b. **Mode-aware demotion of weak general-quality findings.** Some persona output is real signal but does not warrant primary-findings attention. Reroute it to the soft buckets so the primary findings table stays focused on actionable issues.

A finding qualifies for demotion when **all** of these hold:
   - Severity is P2 or P3 (P0 and P1 always stay in primary findings)
   - `autofix_class` is `advisory` (concrete-fix findings stay in primary)
   - **The only** contributing reviewer is `testing`. If any other persona also flagged this finding, cross-reviewer corroboration is present and the finding stays in primary findings regardless of severity or advisory status. Structural findings (dead code, coupling, naming) arrive tagged `correctness` rather than a separate `maintainability` tag, so they stay in primary findings and are not demotable as a testing-only signal.

When a finding qualifies:
   - Move it out of the primary set and append `<file:line> -- <title>` to `testing_gaps`. Use title-only lines (compact return omits `why_it_matters`). Record the demotion count for Coverage.

7. **Confidence gate.** After dedup, promotion, and demotion have shaped the primary set, suppress remaining findings below anchor 75. Exception: P0 findings at anchor 50+ survive the gate -- critical-but-uncertain issues must not be silently dropped. Record the suppressed count by anchor (so Coverage can report "N findings suppressed at anchor 50, M at anchor 25"). The gate runs late deliberately: anchor-50 findings need a chance to be promoted by step 3 (cross-reviewer corroboration) or rerouted by step 6b (demotion to soft buckets) before any drop decision.
8. **Partition the work.** Build two sets:
   - actionable queue: `gated_auto` or `manual` findings whose owner is `downstream-resolver` (hand off to caller)
   - report-only queue: `advisory` findings plus anything owned by `human` or `release`
9. **Sort and number.** Order by severity (P0 first) -> anchor (descending) -> file path -> line number, then assign monotonically increasing `#` values across the full primary finding set in that sorted order. Do not restart numbering inside each severity table or autofix/routing bucket. If later sections repeat a finding (for example Actionable Findings), reuse the same stable `#` so users and downstream workflows can reference findings by `#` across the report and caller handoff.
10. **Collect coverage data.** Union residual_risks and testing_gaps across reviewers.
11. **Preserve CE agent artifacts.** Keep the learnings output alongside the merged finding set. Do not drop unstructured agent output just because it does not match the persona JSON schema.

### Stage 5b: Validation pass (optional quality gate)

Independent verification gate. Spawn one validator sub-agent per surviving finding using `references/validator-template.md`. Findings the validator rejects are dropped; confirmed findings flow through unchanged.

**When this stage runs:** After Stage 5 whenever at least one finding survives; skip only when zero survive. Same rule for default and `mode:agent`. Do **not** skip the stage when more than 15 survive; validate per the budget cap in step 2.

**Steps:**

1. **Select findings to validate.** All survivors of Stage 5.
2. **Apply dispatch budget cap.** If the selected set exceeds 15 findings, validate the highest-severity 15 (P0 first, then P1, then P2, then P3, breaking ties by anchor descending), dropping only from the P2/P3 tail. **Never drop a P0 or P1 from validation**: if P0/P1 findings alone exceed 15, raise the cap to include all of them. Record the over-budget count (the dropped P2/P3 tail) for the Coverage section.
3. **Spawn validators with bounded parallelism.** One sub-agent per finding, dispatched independently using the validator template and the same bounded scheduler from Stage 4. Each validator receives:
   - The finding's title, severity, file, line, suggested_fix, reviewer name, and confidence anchor
   - `why_it_matters` when available (loaded from the artifact file; omit if absent)
   - The full diff
   - The scope mode and remote head ref (`<pr-scope-mode>`, `<pr-head-ref>` or `<branch-head-ref>`), injected so validators inspect the correct tree
   - Inspection access scoped by mode: in `local-aligned` use Read/Grep/git blame; in `pr-remote`/`branch-remote` use `git show <remote-head-ref>:<path>` or diff hunks only
4. **Collect verdicts.** Each validator returns `{ "validated": true | false, "reason": "<one sentence>" }`.
   - `validated: true` -> finding survives unchanged into Stage 6
   - `validated: false` -> finding is dropped; record the validator's reason in Coverage
   - Validator **infrastructure** failure (timeout, dispatch error, malformed JSON, not a `validated:false` verdict): for **P2/P3**, drop the finding with reason "validator failed" (conservative bias). For **P0/P1**, do **not** drop on infra failure: keep the finding and mark its validation **degraded** (note in Coverage). A transient validator failure must never silently remove a critical/high finding; a genuine `validated:false` rejection above still drops at any severity.
5. **Use mid-tier model for validators.** Same model class (sonnet) the persona reviewers use. Validators are read-only, same constraints as persona reviewers. They may use non-mutating inspection commands (Read, Grep, Glob, git blame, gh).
6. **Record metrics for Coverage.** Total dispatched, validated true count, validated false count (with reasons), infra failures (and any P0/P1 kept-on-failure as degraded), and over-budget drops.

**Orchestrator direct verification.** For facts the orchestrator can check cheaply and authoritatively, verify directly with single-purpose native tools (Read/Grep/Glob, one git command at a time). Whether it can *replace* the independent validator:

- **P0/P1, any anchor:** the per-finding validator wave is **required**; direct verification only *complements* it, never replaces it.
- **P2/P3 at anchor 100** (verifiable from code alone: compile/type error, definitive logic bug, quotable standards violation, no interpretation): direct verification **may stand in for** the wave; note the method in Coverage.
- **P2/P3 at anchor 75** (judgment call, "will affect users," not airtight): the independent wave is **required**. This is exactly where a fresh second opinion filters false positives, and the orchestrator cannot supply that for its own findings.

**Why per-finding bounded dispatch (not batched):** Independence is the point.

### Stage 5c: Act on findings (default mode only)

**Skip entirely in `mode:agent`**: that mode is a machine handoff and the caller owns apply. In default (interactive) mode the review is the top-level agent, so it applies the fixes it is confident in before presenting the report.

**Act policy (bias to act).** Default to applying every finding that is a clear improvement and a reversible edit, regardless of severity. The work is a tracked, visible diff that can be reverted, so leaving a clean fix unapplied "to be safe" is the failure mode, not the safe choice. Decide by judgment, not a safety checklist:

- **Apply** clear improvements, the common case (test hardening, dead-code removal, a localized fix with a concrete `suggested_fix`).
- **Push back** (do not apply) when the reviewer is wrong; keep the finding and state the disagreement with reasoning.
- **Skip with judgment** taste calls and conflicting suggestions, but surface what was skipped and why. Never silently drop.

Severity, confidence, and cross-reviewer agreement tell you what to do first; they do not gate the decision. There is no deny-list.

**Scope invariant.** Apply only when the working tree *is* what was reviewed: `local-aligned` or standalone. In `pr-remote` / `branch-remote` the working tree is not the reviewed head; do not apply, report instead.

**Verify, then keep.** After applying, run the affected tests and lint (targeted by default; broaden when fixes span files). If they fail, revert that fix and report it as a finding instead: an unverified fix is not finished. Never leave the tree red.

**Commit when the pre-review tree was clean.** Before applying, check `git status --porcelain`. A local commit is private and reversible (`git reset --soft HEAD~1`).

- **Clean before the review:** commit fixes as one isolated `fix(review): <summary>` commit (or the repo's nearest convention).
- **Dirty before the review:** apply but do **not** commit; fixes ride along with the user's in-flight work.
- **Never push, open a PR, or file tickets**: that's the outward-facing step the user owns.

**Surface green-but-unverifiable edits.** When an applied fix touches auth/authz, a public or cross-service contract/schema, or concurrency/ordering, a passing test does not prove safety: flag it prominently in the Applied section so the diff reviewer's attention goes there.

### Stage 6: Synthesize and present

Assemble the final report. **Default:** pipe-delimited markdown tables for findings (mandatory; see review output template). **`mode:agent`:** skip markdown and emit JSON (see ### JSON output format). Other sections (Actionable Findings, Learnings, Coverage, etc.) use bullets and `---` before the verdict in markdown mode only.

**Before writing the report, load `references/review-output-template.md` and mirror it.** That file is the canonical skeleton (full per-section structure). The block below is the always-loaded fallback so the shape survives a long session even if the template was not reloaded.

**Findings table shape (default mode, load-bearing, do not improvise).** Every finding is a row in a pipe-delimited table grouped by severity, with a **terse** `Issue` cell; depth goes in a keyed detail line under the table. Copy this shape; do not invent a layout:

| # | File | Issue | Reviewer | Confidence |
|---|------|-------|----------|------------|
| 1 | `path/to/file.go:42` | One terse line, the scannable index | correctness | 100 |

- **#1**: full explanation here (why it matters + concrete fix direction), as a keyed detail line under the table.

Per-severity tables are **5 columns**; `Route` is not shown here (it appears only in the Actionable Findings table and the JSON). Keep the `Issue` cell to **one short clause** (roughly 12 words or fewer, no second sentence, no because/so/which explanation): it is the scannable index, not the explanation. The moment a cell wants a comma-plus-clause or a reason, move that depth into the **keyed detail line** (`- **#N**: …`) instead of packing it in. This is usually for P0/P1; P2/P3 are typically terse-only.

**Never produce these shapes (instant fail, applies to *every* tabular section, the Applied table included, not just the severity findings; if you catch one mid-draft, re-render before delivering):**
- Any row, a finding **or** an Applied entry, rendered as `Field:`-prefixed blocks (`#:` / `Sev:` / `File:` / `Issue:` / `Fix:` / `Route:` lines). Depth goes in the keyed detail line, never a field block.
- Per-row separators made of horizontal rules, box-drawing characters (`────`), or runs of dashes between entries
- A table replaced by a plain bulleted/numbered list (the keyed `- **#N**:` detail line under a table is a supplement, not a replacement; that is expected)
- Unicode separators or arrows in cells (middot `·`); use ASCII `->`
- **Inconsistent treatment across severities or sections** (e.g. P1 as blocks while P2/P3 are tables, or the Applied table as field-blocks while findings are tables); every table uses the same pipe-delimited shape

1. **Header.** Scope, intent, mode, reviewer team with per-conditional justifications.
2. **Applied (default mode only).** When Stage 5c applied fixes, list them first, before the findings tables, in an Applied section (see review output template) as a pipe table `| # | File | Fix | Reviewer |` (**never** `Field:`-blocks or `────` separators, same rules as the findings tables), then a one-line validation outcome (e.g. "pin tests 4 -> 6; suite 94 pass, lint clean") and commit status (committed on a clean tree as `fix(review): …` or the repo's nearest convention, or left uncommitted for the user on a dirty one). Flag green-but-unverifiable edits (auth/contract/concurrency) prominently. Omit this section in `mode:agent` and when nothing was applied. Applied findings appear here, not in the severity tables.
3. **Findings.** Pipe-delimited tables grouped by severity (`### P0 -- Critical`, `### P1 -- High`, `### P2 -- Moderate`, `### P3 -- Low`), using the **same** shape above for every severity. Omit empty severity levels. Finding numbers come from the stable assignment in Stage 5 -- never re-derive them per severity table.
4. **Requirements Completeness.** Include only when a plan was found in Stage 2b. For each requirement (R1, R2, etc.) and implementation unit in the plan, report whether corresponding work appears in the diff. Use a simple checklist: met / not addressed / partially addressed. Routing depends on `plan_source`:
   - **`explicit`** (caller-provided or PR body): Flag unaddressed requirements or implementation units as P1 findings with `autofix_class: manual`, `owner: downstream-resolver`. These enter the actionable queue.
   - **`inferred`** (auto-discovered): Flag unaddressed requirements or implementation units as P3 findings with `autofix_class: advisory`, `owner: human`. These stay in the report only, no autonomous follow-up. An inferred plan match is a hint, not a contract.
   Omit this section entirely when no plan was found; do not mention the absence of a plan.
5. **Actionable Findings.** Include when the actionable queue is non-empty: findings the caller should address (`gated_auto` / `manual` with `downstream-resolver`), plus anything Stage 5c chose not to apply. In default mode, findings already applied appear in the Applied section, not here.
6. **Pre-existing.** Separate section, does not count toward verdict.
7. **Learnings & Past Solutions.** Surface ce-learnings-researcher results: if past solutions are relevant, flag them as "Known Pattern" with links to docs/solutions/ files.
8. **Coverage.** Applied count (when Stage 5c ran), suppressed count by anchor (e.g., "N findings suppressed at anchor 50, M at anchor 25"), mode-aware demotion count, validator drop count and reasons (when Stage 5b ran), any P0/P1 with degraded validation (kept on validator infra failure), validator over-budget drops (when the 15-cap fired), residual risks, testing gaps, failed/timed-out reviewers, and inferred-intent uncertainty when applicable.
9. **Verdict.** Ready to merge / Ready with fixes / Not ready. Fix order if applicable. When an `explicit` plan has unaddressed requirements or implementation units, the verdict must reflect it: a PR that's code-clean but missing planned requirements is "Not ready" unless the omission is intentional. When an `inferred` plan has unaddressed requirements or implementation units, note it in the verdict reasoning but do not block on it alone.

Do not include time estimates.

**Format verification (default only, last gate before delivering).** Scan **every table, including the Applied table** (its most common offender) for the forbidden shapes above; if any hit one, STOP and re-render it as the same pipe-delimited shape before delivering. The keyed `- **#N**:` detail line under a table is expected, not a failure. Skip only when `mode:agent` is active.

### JSON output format (`mode:agent` only)

Emit **one raw JSON object** as the primary response: a single bare JSON value, **no markdown code fence**. A leading ```` ```json ```` fence makes the response start with backticks and breaks naive `JSON.parse` consumers, so never wrap it. Also write `review.json` under `/tmp/compound-engineering/ce-code-review/<run-id>/` with the same payload.

`mode:agent` does not apply fixes: no `applied_fixes` field; the handoff is `actionable_findings`.

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
  "residual_risks": [],
  "testing_gaps": [],
  "coverage": {},
  "artifact_path": "/tmp/compound-engineering/ce-code-review/<run-id>/",
  "run_id": "<run-id>"
}
```

Each object in `findings` uses the merged finding fields: `#`, `title`, `severity`, `file`, `line`, `confidence`, `autofix_class`, `owner`, `requires_verification`, `pre_existing`, `suggested_fix`, `why_it_matters`, `evidence`, `reviewers`.

`actionable_findings` lists the `gated_auto` / `manual` + `downstream-resolver` subset with the same fields plus stable `#`.

On failure before review completes, set `"status": "failed"` and `"reason": "<one sentence>"`. When all reviewers fail, use `"status": "degraded"` with a reason. When a PR skip rule fires (closed/merged/trivial), use `"status": "skipped"` with the skip reason. Never emit markdown tables when `mode:agent` is active.

## Quality Gates

Before delivering the review, verify:

1. **Every finding is actionable.** If it says "consider" or "might want to" without a concrete fix, rewrite it with a specific action.
2. **No false positives from skimming.** Verify the cited code was actually read; check the "bug" isn't handled elsewhere.
3. **Severity is calibrated.** A style nit is never P0. A SQL injection is never P3.
4. **Line numbers are accurate.** Verify each cited line against the file content.
5. **Protected artifacts are respected.** Discard any findings that recommend deleting or gitignoring files in `docs/brainstorms/`, `docs/plans/`, or `docs/solutions/`.
6. **Findings don't duplicate linter output.** Focus on semantic issues.

## After Review

After Stage 6, stop. Never push, open PRs, or file tickets from this skill.

### Emit actionable findings summary (default mode only)

In default mode, emit a compact **Actionable Findings** summary:

- List each actionable finding (`gated_auto` or `manual` with `downstream-resolver`) with stable `#`, severity, file:line, title, `autofix_class`, whether `suggested_fix` is present, and `confidence`.
- Include the run-artifact path when one was written: `/tmp/compound-engineering/ce-code-review/<run-id>/`
- When the actionable queue is empty, state `Actionable findings: none.` explicitly.

In `mode:agent` do **not** emit this markdown summary; the actionable findings are carried solely by the `actionable_findings` field of the JSON object. Emit nothing after the JSON object, so the response stays a single parseable JSON value.

Do not run post-review triage (no per-finding walk-through, bulk ticket filing, or routing questions). The report and summary are the complete handoff. Do not offer push/PR/create-branch next steps from this skill.

#### Run artifacts

Always write run artifacts under `/tmp/compound-engineering/ce-code-review/<run-id>/`:

- synthesized findings
- actionable findings list
- advisory outputs
- per-agent `{reviewer_name}.json` from Stage 4
- `report.md`: the rendered markdown report exactly as presented to the user (default mode only), so format and numbering stay auditable after the run

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

## Fallback

If the platform doesn't support parallel sub-agents, run reviewers sequentially. If the platform supports sub-agents but caps active concurrency, use the bounded queueing rules in Stage 4 rather than treating cap-related spawn failures as reviewer failures. Everything else (stages, output format, merge pipeline) stays the same.

---

## Included References

The files below are inlined at load time. The review output template is **not** inlined; Stage 6 loads it on demand (`references/review-output-template.md`).

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
