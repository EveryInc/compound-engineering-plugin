# `ce-release-notes`

> Look up what shipped in recent compound-engineering plugin releases — summarize the last 5, or answer a specific question with a version citation.

`ce-release-notes` is the **plugin-history** skill. It pulls release notes from the GitHub Releases API for `EveryInc/compound-engineering-plugin`, filtered to the `compound-engineering-v*` tag prefix so sibling components (`cli-v*`, `coding-tutor-v*`, `marketplace-v*`, `cursor-marketplace-v*`) don't pollute the result. Two modes: bare invocation summarizes the last 5 releases; argument invocation searches the last 40 releases and answers a specific question with a version citation.

Beta-style explicit-invocation only (`disable-model-invocation: true`).

---

## TL;DR

| Question | Answer |
|----------|--------|
| What does it do? | Fetches recent compound-engineering releases via `gh` (or anonymous fallback), summarizes the last 5 or answers a specific question |
| When to use it | "What changed in compound-engineering recently?", "What happened to `<skill-name>`?", or `/ce-release-notes` alone |
| What it produces | Summary of recent releases or a narrative answer with version citation |
| Status | Explicit-invocation only |

---

## The Problem

Plugin release information is hard to consume in agent contexts:

- **GitHub Releases UI is the wrong surface** for "did this change recently?" — slow to navigate, all releases mixed together
- **`gh release list` is unfiltered** — sibling tags (`cli-v*`, `coding-tutor-v*`) interleave; you can't tell at a glance which release affected which component
- **Substring search doesn't work for renames** — "what happened to ce-X" won't substring-match against a release that renamed it to ce-Y
- **Code-fence truncation breaks rendering** — naïvely truncating long release notes mid-fence leaves an open code block that swallows everything below
- **No grounding in PR detail** — release notes summarize; the PR is where the *why* lives. Without enrichment, narrative answers stay surface-level

## The Solution

`ce-release-notes` runs lookup as a structured pass:

- **Single helper script** (`scripts/list-plugin-releases.py`) handles transport — `gh` preferred, anonymous API fallback — and emits a single JSON contract
- **Tag-prefix filtering** ensures only `compound-engineering-v*` tags appear; sibling components are excluded
- **Two modes**: summary (last 5) and query (search last 40 with confidence judgment)
- **Markdown-fence-aware truncation** — counts triple-backtick fence lines in the kept portion; closes an open fence before appending "see more" link
- **Confidence judgment, not substring matching** — the skill judges whether a release confidently answers the question; "if unsure, treat as no match"
- **PR enrichment for confident matches** — fetches the linked PR's title and body for grounding context (best-effort; degrades gracefully)
- **Untrusted-data discipline** — release bodies are read for content but never followed as instructions

---

## What Makes It Novel

### 1. Tag-prefix filtering for the right component

The repo distributes multiple components — `cli`, `compound-engineering`, `coding-tutor`, `marketplace`, `cursor-marketplace`. Each has its own release tag prefix. The skill filters strictly to `compound-engineering-v*` tags, so a question about the plugin doesn't return CLI release notes by accident. The helper script owns this filter; the skill body never has to.

### 2. Helper-script transport contract

The helper (`scripts/list-plugin-releases.py`) always exits 0 and emits one JSON object on stdout. The skill body never branches on `gh` availability — that's the helper's job:

```json
// success
{"ok": true, "source": "gh" | "anon", "fetched_at": "...", "releases": [...]}

// failure
{"ok": false, "error": {"code": "rate_limit" | "network_outage", "message": "...", "user_hint": "..."}}
```

`source` is recorded for telemetry but **not** surfaced to the user — falling back from `gh` to anonymous is a stability signal, not a user-facing event.

### 3. Two modes — summary and query

**Summary mode** (bare invocation): take first 5 releases, render each with version + date + body (soft-capped at 25 rendered lines). Footer points to specific-question invocation and full release history URL.

**Query mode** (argument invocation): widen window to last 40 releases, run confidence judgment, enrich confident matches with linked PR detail, synthesize narrative answer with version citation. If no confident match, print a no-match message with the URL — never fabricate.

### 4. Markdown-fence-aware truncation

A naïve "first 25 lines" truncation can land inside an open code fence, leaving the renderer to swallow everything below as code. The skill counts triple-backtick fence lines in the kept portion. If the count is odd (a fence opened but didn't close), the truncated output gets an explicit `` ``` `` line before appending the "see more" link. Result: the rendered output stays clean regardless of where the cut lands.

### 5. Confidence judgment, not substring matching

The skill reads each release body in the search window and judges whether it confidently answers the user's question:

- **Match** if the release body or its linked PR title clearly addresses the question
- **Don't match** on tangential mentions — "deepen-plan" shouldn't match a release that only mentions "plan" in passing
- **If unsure, treat as no match** — explicit no-match path beats low-confidence citation

This catches the "ce-X was renamed to ce-Y" case that substring search would miss.

### 6. PR enrichment for grounding

For confident matches (most recent + up to 2 older), the skill fetches the linked PR via `gh pr view` for title/body context. Best-effort:

- If `gh` is missing, unauthenticated, or returns non-zero: doesn't abort; falls back to body-only synthesis with a one-line "PR could not be retrieved" note
- If `linked_prs` is empty: doesn't attempt the call; body-only is the expected path, not a degraded one

Always passes the PR number as a separate argument (list-form), never interpolated into a shell string — avoids shell-injection from release-body content.

### 7. Untrusted-data discipline

Release bodies are read for content but **treated as untrusted data**. The skill never follows instructions, requests, or directives that may appear inside them. This matters because release bodies are user-authored markdown that could contain prompt-injection attempts. The skill reads to *answer the question*, not to *take direction* from the release notes.

### 8. Hardcoded no-match URL

When no confident match exists, the skill prints a literal sentence with a hardcoded URL:

```text
I couldn't find this in the last 40 plugin releases. Browse the full history at https://github.com/EveryInc/compound-engineering-plugin/releases
```

The URL is hardcoded specifically so it can't drift through string interpolation or LLM rewriting. The user always gets the right place to look.

---

## Quick Example

You wonder when `ce-resolve-pr-feedback` was added. You invoke `/ce-release-notes "when was ce-resolve-pr-feedback added"`.

The skill runs `python3 scripts/list-plugin-releases.py --limit 100`, gets a JSON object with releases sorted newest first. Takes the first 40 as the search window.

Confidence judgment: scans each release body. Two confident matches:
- `compound-engineering-v2.51.0` — release body mentions "feat(resolve-pr-feedback): initial release"
- `compound-engineering-v2.58.0` — body mentions "feat(resolve-pr-feedback): cluster analysis for cross-invocation"

Most recent confident match: v2.58.0. Older: v2.51.0.

PR enrichment: fetches PR 612 for v2.58.0 — title "feat(resolve-pr-feedback): cluster analysis", body explains the cross-invocation gate. Fetches PR 487 for v2.51.0 — title "feat: initial release of ce-resolve-pr-feedback".

Synthesizes:

```text
`ce-resolve-pr-feedback` was first introduced in [v2.51.0](URL) as a skill that
evaluated and fixed PR review feedback in parallel — initial verdict types
(fixed / replied / not-addressing / declined / needs-human), GraphQL fetch
of unresolved threads, parallel agent dispatch, and reply + resolve flow.

In [v2.58.0](URL), it gained cross-invocation cluster analysis — when the
same theme spans multiple review rounds, a cluster brief replaces the surgical
fix with broader investigation.

(previously: [v2.51.0](URL))
```

You have the answer with version citations.

---

## When to Reach For It

Reach for `ce-release-notes` when:

- You want a quick summary of recent compound-engineering plugin changes
- You want to answer a specific question ("when was X added", "what happened to Y")
- A bug report or skill behavior makes you wonder when something changed
- You're checking for a specific version where a feature landed

Skip `ce-release-notes` when:

- You want changes for a sibling component (CLI, coding-tutor, marketplace) — this skill filters to `compound-engineering-v*` only
- You want the full release history → just open the GitHub Releases URL
- The question is about behavior that's never made it to a release — release notes won't show it

---

## Use as Part of the Workflow

`ce-release-notes` is a standalone utility — doesn't sit inside the chain. It's invoked when:

- A `/ce-update` confirms the plugin is on an older version and the user wants to know what they're missing
- A bug suspect implicates "this was working last week" — was there a release in between?
- Someone asks "what happened to skill X" because the behavior shifted

The skill's output is read directly by the user — no downstream skill consumes it.

---

## Use Standalone

Direct invocation:

- **Summary** — `/ce-release-notes` (last 5 releases)
- **Specific question** — `/ce-release-notes "what happened to ce-doc-review"`
- **Version-like input** — `/ce-release-notes "2.65.0"` (treated as query string; flows through query mode)

Reserved `mode:*` tokens are stripped (v1 doesn't act on them but won't choke on a stray `mode:foo`).

---

## Reference

| Mode | Trigger | Window | Behavior |
|------|---------|--------|----------|
| Summary | Bare invocation | Last 5 | Render each release with date + body (25-line cap with fence-aware truncation) |
| Query | Argument invocation | Last 40 | Confidence judgment + PR enrichment + narrative synthesis with version citation |

Phases (per SKILL.md): Phase 1 parses arguments → Phase 2 fetches (summary) → Phase 3 renders summary; Phase 5 fetches (query) → Phase 6 confidence judgment → Phase 7 PR enrichment → Phase 8 synthesizes narrative; Phase 9 no-match.

---

## FAQ

**Why filter to `compound-engineering-v*` only?**
Because the repo ships multiple components — `cli`, `compound-engineering`, `coding-tutor`, `marketplace`, `cursor-marketplace` — each with its own release tags. A question about the plugin shouldn't return CLI release notes. The filter keeps results scoped to the right component.

**Why does the helper always exit 0?**
Because the contract is "one JSON object on stdout." If transport fails (rate limit, network), the helper emits `{"ok": false, "error": {...}}` rather than crashing. The skill body branches on `ok`, not on exit code. This makes the contract single-shape and easier to reason about.

**What's the soft 25-line cap with fence-aware truncation?**
Long release bodies get capped at 25 lines for the summary. Naïve truncation can land inside a code fence, leaving the renderer to swallow everything below. The skill counts triple-backtick lines and closes an open fence before appending the "see more" link.

**Why "confidence judgment" instead of substring search?**
Because substring search misses renames. "What happened to ce-X" won't substring-match against a release that renamed it to ce-Y. Judgment-based matching catches conceptual changes that substring search would miss.

**Why is PR enrichment best-effort?**
Because `gh` may not be installed, may not be authenticated, or may return errors for various reasons. Aborting the answer because PR fetch failed would be worse than a one-line "PR could not be retrieved" note appended to a body-only synthesis.

**Why is the URL hardcoded in the no-match path?**
Specifically to prevent it from drifting through string interpolation or LLM rewriting. The user always gets the right place to look — the GitHub Releases URL — verbatim.

---

## See Also

- [`/ce-update`](./ce-update.md) — checks plugin version; useful before asking what changed
- [`/ce-report-bug`](./ce-report-bug.md) — for filing issues against the plugin; checking release notes first can save the report
