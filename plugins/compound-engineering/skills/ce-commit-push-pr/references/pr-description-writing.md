# PR Description Writing

## Step Pre-A: Resolve the commit range and diff

Two modes:

- **Current-branch mode** (default) — describe HEAD vs the repo's default base.
- **PR mode** — describe a specific PR's range. Triggered when the caller passes a PR ref (number, `#NN`, `pr:NN`, or URL).

### Identify the base

For PR mode, get metadata first:

```bash
gh pr view <ref> --json baseRefName,headRefOid,url,body,state,isCrossRepository,headRepositoryOwner
```

If `state` is not `OPEN`, report and stop — do not invent a description. Use `baseRefName` as `<base>`.

For current-branch mode, resolve `<base>` in priority order:

1. **Caller-supplied** (`base:<ref>`) — verbatim.
2. `git rev-parse --abbrev-ref origin/HEAD` (strip `origin/`).
3. `gh repo view --json defaultBranchRef --jq '.defaultBranchRef.name'`.
4. Try `main`, `master`, `develop` via `git rev-parse --verify origin/<candidate>`.

If none resolve, ask the user.

For the **base remote**: `origin` for current-branch mode and same-repo PRs. For fork (cross-repo) PRs, match the PR's base owner/repo against `git remote -v` URLs. If no local remote matches, skip directly to the `gh` fallback below — do not diff against `origin` (wrong base).

### Get the range and diff

```bash
git fetch --no-tags <base-remote> <base>   # skip if already current
echo '=== COMMITS ===' && git log --oneline "<base-remote>/<base>..<head>"
echo '=== DIFF ===' && git diff "<base-remote>/<base>...<head>"
```

`<head>` is `HEAD` for current-branch mode, or `<headRefOid>` for PR mode (fetch it first if not local: `git fetch --no-tags <base-remote> <headRefOid>`).

If the resulting commit list is empty, report `"No commits to describe"` and stop.

### If that fails

Use `gh` directly when local git can't reach the refs — fork PR with no matching remote, shallow clone, GHES blocking SHA fetch, offline/expired auth, or `git merge-base` failing on unrelated histories:

```bash
gh pr diff <ref>
gh pr view <ref> --json commits --jq '.commits[] | [.oid[0:7], .messageHeadline] | @tsv'
```

For GHES configurations that reject SHA fetch but allow `refs/pull/`:

```bash
git fetch --no-tags <base-remote> "refs/pull/<number>/head"
PR_HEAD_SHA=$(awk '/refs\/pull\/[0-9]+\/head/ {print $1; exit}' "$(git rev-parse --git-dir)/FETCH_HEAD")
```

Note in the user-facing summary when the API fallback was used.

---

## Step A: Evidence handling

The caller (SKILL.md) decides whether to capture new evidence. This step covers what to do with evidence already on the PR:

- If the existing PR body has a `## Demo` or `## Screenshots` block with image/video embeds, **preserve it verbatim** unless the user's focus asks to refresh or remove it.
- If the caller passed in a freshly captured URL or path, splice it in as a `## Demo` section.
- Otherwise, omit the evidence section.

Place any evidence block before the Compound Engineering badge. Do not label test output as "Demo" or "Screenshots."

---

## Step B: Frame the narrative

State the frame in 1-3 sentences:

1. **Before** — what was broken, limited, or impossible.
2. **After** — what's now possible or fixed.
3. **Scope rationale** (only if multiple separable concerns ship together) — why these go together.

The "after" sentence is the lead. **Verify it leads with value, not mechanism** before continuing:

- Bad: "Replace the hardcoded capture block with a tiered skill."
- Good: "Evidence capture now works for CLI tools and libraries, not just web apps."

If the first sentence describes what was moved, renamed, or added rather than what's now possible or fixed, rewrite before composing the rest.

For small + simple PRs, the "after" sentence alone is the entire description.

---

## Step C: Size the change

Match description weight to change weight. When in doubt, shorter wins. Subtract fix-up commits (review fixes, lint, rebase resolutions) when sizing — they're invisible to the reader.

| Change profile | Description approach |
|---|---|
| Small + simple (typo, config, dep bump) | 1-2 sentences, no headers. Under ~300 characters. |
| Small + non-trivial (bugfix, behavioral change) | 3-5 sentences. No headers unless two distinct concerns. |
| Medium feature or refactor | Narrative frame, then what changed and why. Call out design decisions. |
| Large or architecturally significant | Narrative frame + 3-5 design-decision callouts + brief test summary. Target ~100 lines, cap ~150. For PRs with many mechanisms, use a Summary table; do not create an H3 per mechanism. |
| Performance improvement | Include before/after measurements as a markdown table. |

Large PRs need more selectivity, not more content.

---

## Step D: Apply writing principles

### The default failure to avoid: granular enumeration

**Do not enumerate the diff.** Do not list changed files, modified functions, line counts, or "added X, modified Y, removed Z." GitHub's Files Changed tab shows that. The PR description exists to explain what's now possible, what was broken and is now fixed, or what shape changed — things the diff does not show.

- Bad: "This PR adds a new `evidence-decider.ts` module, modifies `ce-commit-push-pr/SKILL.md` to call it, and updates two test files."
- Good: "Evidence capture now decides automatically whether a change has observable behavior. CLI tools and libraries are now eligible alongside web UIs."

### Writing voice

If the repo documents style preferences in context, follow those. Otherwise:

- Active voice. No em dashes or `--` substitutes; use periods, commas, colons, or parentheses.
- Plain English. Technical jargon fine; business jargon never.
- No filler: "it's worth noting", "importantly", "essentially", "leverage", "utilize."
- Digits for numbers (`3 files`), not words (`three files`).

### Output rules

- **Describe end state, not journey.** No iteration history, debugging steps, or bugs found and fixed during development. When commits conflict with the final diff, trust the diff.
- **No empty sections.** Omit; do not write `N/A` or `None`.
- **Test plan only when non-obvious.** Include for tricky edge cases, hard-to-verify behavior, or specific setup. Omit when "run the tests" is the only useful guidance.
- **No `## Commits` section.** GitHub shows commits in their own tab.
- **No `## Review` or process section.** Checklists telling reviewers how to review don't help them evaluate code. Inline non-obvious review hints next to the change that warrants them.
- **No orphaned opening paragraphs.** If the body uses any `##` headings, the opening is also under one (typically `## Summary`). Bare paragraphs only for short, all-prose descriptions.

### GitHub gotchas

- Never prefix list items with `#` — GitHub auto-links `#1`, `#2` as issue references.
- Use `org/repo#123` or full URL for actual issue/PR references; never bare `#123` unless verified.

### Visual aids

| PR shape | Visual |
|---|---|
| Architecture: 3+ components with directed relationships (calls, flows, ownership) | Mermaid component or interaction diagram |
| Multi-step workflow with non-obvious sequencing | Mermaid flow diagram |
| State machine, 3+ states | Mermaid state diagram |
| Data model, 3+ related entities | Mermaid ERD |
| Before/after measurements (same metric, different values) | Markdown table |
| Option or flag trade-offs (same attributes across variants) | Markdown table |

Topology has edges (`A → B`); use Mermaid. Parallel data has rows (attribute × variant); use a table. Skip both for simple changes, prose-clear changes, and renames/dep bumps. Place inline at the point of relevance. Prose is authoritative when it conflicts with a visual.

### User focus

If the caller passed a focus hint ("emphasize the benchmarks", "frame this as a migration"), apply it as steering — not override. Do not invent content the diff does not support, and do not suppress important content the diff demands. When focus and diff materially disagree, surface the conflict to the user rather than fabricating.

---

## Step E: Compose the title

`type: description` or `type(scope): description`.

- **Type by intent, not file extension.** Where `fix` and `feat` both seem to fit, default to `fix` — adding code to remedy missing behavior is still `fix`. Reserve `feat` for capabilities the user could not previously accomplish. Use `refactor` / `docs` / `chore` / `perf` / `test` when they describe more precisely.
- **Scope** (optional): narrowest useful label — skill or agent name, CLI area, shared area. Omit when no single label adds clarity.
- **Description**: imperative, lowercase, under 72 characters total, no trailing period.
- **Match repo conventions** if visible in recent commits.
- **Never use `!` or `BREAKING CHANGE:` without explicit user confirmation** — they trigger automated major-version bumps.

---

## Step F: Assemble the body

In order:

1. **Opening** — the narrative frame from Step B, sized per Step C. Under `## Summary` if the body uses any `##` headings; bare paragraph otherwise.
2. **Body sections** — only those that earn their keep: what changed and why, design decisions, tables, visual aids. Skip empty sections entirely.
3. **Test plan** — only when non-obvious.
4. **Evidence block** — preserved or freshly captured, only if one exists.
5. **Compound Engineering badge** — append after a `---` rule. Skip if regenerating a body that already contains the badge.

### Badge

```markdown
---

[![Compound Engineering](https://img.shields.io/badge/Built_with-Compound_Engineering-6366f1)](https://github.com/EveryInc/compound-engineering-plugin)
![HARNESS](https://img.shields.io/badge/MODEL_SLUG-COLOR?logo=LOGO&logoColor=white)
```

| Harness | `LOGO` | `COLOR` |
|---|---|---|
| Claude Code | `claude` | `D97757` |
| Codex | (omit `?logo=` param) | `000000` |
| Gemini CLI | `googlegemini` | `4285F4` |

**Model slug:** spaces become underscores; append context window and thinking level in parens if known. URL-encode literal parens as `%28` / `%29` — unencoded parens inside markdown image URLs break release-please's commit parser, which silently drops the commit from the changelog. Examples: `Opus_4.6_%281M,_Extended_Thinking%29`, `Sonnet_4.6_%28200K%29`, `Gemini_3.1_Pro`.

---

## Step G: Compression pass

Re-read the composed body and apply:

- Cut any section that restates the Summary.
- If "Test plan" exceeds 2 paragraphs, compress to bullets.
- If 5+ H3 subsections each describe one mechanism, consolidate to a single table.
- If the body exceeds the Step C target by more than 30%, halve the longest non-Summary section.

If the first sentence of the Summary still describes what was moved, renamed, or added, rewrite (Step B should have caught this; this is the second pass).
