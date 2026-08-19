# Intent discovery and plan requirements

Read this at Stage 2. It owns the intent summary, plan discovery, reviewer grounding, and the plan-readiness rules Stage 6 verifies against.

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
