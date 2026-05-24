---
date: 2026-04-17
topic: ce-release-notes-skill
---

# `ce-release-notes` Skill

## Problem Frame

The `compound-engineering` plugin ships frequently — often multiple releases per week. Users who install the plugin via the marketplace can't easily keep up with what's changed: skill renames, new behaviors, retired commands, or relevant fixes. The release history exists publicly on GitHub (release-please-generated GitHub Releases at `EveryInc/compound-engineering-plugin`), but scrolling through release pages to answer "what happened to the deepen-plan skill?" is friction users won't bother with.

This skill provides a conversational interface over the plugin's GitHub Releases so a user can ask either "what's new?" or a specific question and get a grounded, version-cited answer without leaving Claude Code.

**Premise note:** The user-pain claim above is grounded in the rapid release cadence rather than in cited support asks or telemetry. We accept the residual risk that the skill may see low adoption if the conversational-lookup framing turns out to be a weaker need than discoverability or release-page bookmarking.

## Requirements

**Invocation and Modes**
- R1. Skill is invoked via slash command `/ce:release-notes` (matching the `ce:` namespace convention used by sibling skills like `/ce:plan`, `/ce:brainstorm`). The skill directory is `plugins/compound-engineering/skills/ce-release-notes/`; the SKILL.md `name:` frontmatter field is `ce:release-notes` (colon form, not dash) — that is what produces the `/ce:release-notes` slash command. (Several existing `ce-` skills use `name: ce-x` and are not slash-invoked; this one needs the colon form to match R1.)
- R2. Bare invocation (`/ce:release-notes`) returns a summary of recent releases.
- R3. Argument invocation (`/ce:release-notes <question or topic>`) returns a direct answer to the user's question, grounded in the relevant release(s).
- R4. **v1 is slash-only invocation.** The SKILL.md frontmatter sets `disable-model-invocation: true` so the skill only fires when the user explicitly types `/ce:release-notes`. Auto-invocation is deferred to a possible v2 once dogfooding shows users clearly want conversational triggering and a tested gating description has been validated against a prompt corpus.

**Data Source**
- R5. Source of truth is the GitHub Releases API for `EveryInc/compound-engineering-plugin`. **Layered access strategy:** prefer the `gh` CLI when available (authenticated, consistent JSON output, better error messages, higher rate limits). Fall back to anonymous HTTPS against `https://api.github.com/repos/EveryInc/compound-engineering-plugin/releases` (or the equivalent paginated endpoint) when `gh` is missing or unauthenticated. The repo is public, so anonymous reads work and the 60 req/hr-per-IP unauth'd limit is more than enough for this skill's invocation frequency.
- R6. Only releases tagged with the `compound-engineering-v*` prefix are considered. Sibling tags (`cli-v*`, `coding-tutor-v*`, `marketplace-v*`, `cursor-marketplace-v*`) are filtered out, even though `cli` and `compound-engineering` share version numbers via release-please's `linked-versions` plugin.
- R7. No local caching, no fallback to `CHANGELOG.md` files. Always fetch live.
- R8. Skill must fail gracefully with an actionable message when **both** access paths fail (e.g., no network, GitHub API outage, rate-limit exhaustion on the anonymous fallback). Missing `gh` alone is not a failure — the skill silently uses the anonymous fallback.

**Output — Summary Mode**
- R9. Default window is the last 10 plugin releases.
- R10. Per-release section format: version + publish date + the release-please-generated changelog body (already grouped by `Features`, `Bug Fixes`, etc.), trimmed minimally — release sizes vary, so do not impose a uniform highlight count.
- R11. Each release section links to its GitHub release URL so users can read the full notes.

**Output — Query Mode**
- R12. Search window is the last 20 plugin releases — fixed cap, no expansion. 20 releases is already a substantial corpus (multiple weeks of cadence). If no matching content is found within that window, report "not found" and surface the GitHub releases page link (per R14) so the user can search further manually.
- R13. **When a confident match is found**, the answer is a direct narrative response that cites the specific release version(s) the answer is drawn from (e.g., "The `deepen-plan` skill was renamed to `ce-debug` in `v2.45.0`"). Include a link to the cited release. The release body itself is a terse one-line conventional-commit bullet per change with a linked PR number; for query-mode synthesis the skill should follow the linked PR(s) (e.g., `gh pr view <N>`) to ground the narrative in the rich PR description rather than only the commit subject. (Verified against `v2.65.0`–`v2.67.0` release bodies and PR #568.)
- R14. **When no confident match is found** (after expanding the search window per R12) **or the answer is uncertain**, say so plainly rather than guessing — and surface a link to the GitHub releases page so the user can investigate further.

## Success Criteria
- A user who installed the plugin via the marketplace can run `/ce:release-notes` and immediately see what's shipped recently in the compound-engineering plugin (not CLI noise, not other plugins).
- A user can ask `/ce:release-notes what happened to deepen-plan?` and get a direct narrative answer with a version citation, without having to open any browser tab.
- The skill works for users without `gh` installed (silent anonymous-API fallback) and produces a clear error only when both access paths fail.

## Scope Boundaries
- **Out of scope:** Coverage of `cli`, `coding-tutor`, `marketplace`, or `cursor-marketplace` releases. Only `compound-engineering` plugin releases are surfaced.
- **Out of scope:** "What's coming next" / unreleased changes. The skill does not peek at the open release-please PR. Only shipped releases are summarized.
- **Out of scope:** Local caching, CHANGELOG.md parsing, or any source other than the GitHub Releases API.
- **Out of scope:** Per-PR or per-commit drill-down *as a primary user-facing surface*. Query mode may follow PR links for context (per R13), but the skill does not browse arbitrary commits or expose PR-level navigation as a separate mode.
- **Out of scope:** Customization flags for window size or output format in v1. Defaults are fixed; users can ask follow-up questions in chat to drill deeper.

## Key Decisions
- **Plugin-only filter (excludes `cli-v*`):** Linked versions mean a `2.67.0` bump can contain CLI-only or plugin-only changes; surfacing both would dilute the user-facing signal. Users who care about plugin behavior should not have to mentally filter CLI noise.
- **GitHub Releases over CHANGELOG.md:** GitHub Releases are authoritative for what shipped, are accessible without a repo checkout (most plugin users won't have one), and the release-please-generated body is already markdown-grouped and ready to display.
- **Slash-only invocation in v1 (no auto-invoke):** No sibling `ce:*` skill currently auto-invokes. Making this the first one introduces a hard-to-validate gating problem (the skill description is the only lever, and the failure modes are silent — either firing on unrelated projects' "what's new?" prompts, or never firing for actual CE-shaped questions). Slash-only satisfies both stated user journeys (`/ce:release-notes` bare summary and `/ce:release-notes <question>`) without the gating risk. Auto-invoke is deferred to a possible v2 once dogfooding shows the conversational triggering is genuinely wanted and a tested gating description exists.
- **Layered data access (`gh` preferred, anonymous public API fallback):** The repo is public, so anonymous reads work and the 60 req/hr unauth'd limit is far above this skill's invocation frequency. Layering means users without `gh` installed still get value rather than bouncing on an "install gh and retry" message. Prefer `gh` when present for cleaner error handling, consistent JSON output, and authenticated rate limits.
- **No local caching:** `gh release list` is fast (~1s for metadata; bodies add some cost) and release queries are infrequent; caching adds carrying cost (invalidation, location in `.context/`) without meaningful payoff. Reversal cost is low — caching can be added later if real latency or frequency problems show up.
- **Two-mode design instead of always-query:** A bare-invocation summary serves the casual "what have I missed?" use case, which is materially different from "what specifically happened to X?". One skill covers both with a clean argument convention.
- **Distinct from the existing `changelog` skill:** The plugin already ships a `changelog` skill that produces witty daily/weekly changelog summaries of recent activity. That serves a different use case (narrative recap of work) than this skill's version-aware release-notes lookup against shipped GitHub Releases. The two are complementary, not redundant.

## Dependencies / Assumptions
- Users have **either** the `gh` CLI (preferred path) **or** outbound HTTPS access to `api.github.com` (anonymous fallback path). Per R5, missing `gh` alone is not a failure.
- The 60 req/hr anonymous limit is per source IP, not per user. Users on shared NAT egress (corporate networks, VPN exit nodes) could in principle exhaust the budget collectively even at low individual usage. We accept this as low-likelihood given the skill's invocation pattern; if it surfaces in practice, encourage `gh auth login` rather than adding caching.
- The repo `EveryInc/compound-engineering-plugin` remains the canonical source. (If the plugin moves repos, the hardcoded repo reference in the skill must be updated.)
- Release-please continues to use the `compound-engineering-v*` tag prefix and the conventional-commit-grouped release body format. A change to release-please configuration could break R6 or R10.

## Outstanding Questions

### Deferred to Planning
- [Affects R10][Technical] Should the summary impose a maximum-length cap on individual release bodies (separate from R10's no-uniform-highlight-count rule), to prevent a single 30-bullet release from dominating the summary view? Decide based on real release sizes during implementation.
- [Affects R8][Technical] Exact failure messages when both access paths fail (network down, GitHub outage, anonymous rate-limit hit). Ensure they're actionable (point the user to the GitHub releases URL as a manual fallback).
- [Affects R5][Technical] Implementation choice for the anonymous fallback: shell out to `curl` + `jq`, or use a different HTTP client. Decide based on cross-platform portability requirements (note: AGENTS.md "Platform-Specific Variables in Skills" rules apply since this skill will be converted for Codex/Gemini/OpenCode).
- [Affects R13, R14][Technical] Define the "confident match" criterion that gates R13 (direct narrative answer) vs. R14 (say-so-plainly). Options include keyword/substring match against release bodies, semantic match via embedding, or LLM judgment with an explicit confidence prompt. Decide during planning based on cost and accuracy tradeoffs.
- [Affects R4][Needs research] If/when v2 auto-invoke is reconsidered, define the actual gate. Since v1 has no auto-invoke surface to observe, "dogfooding shows users want it" is unfalsifiable as written — the v2 trigger needs a concrete source of evidence (explicit user requests, opt-in beta flag with telemetry, or a stated time-box for revisiting).
- [Affects R5][Technical] Should the repo reference (`EveryInc/compound-engineering-plugin`) be hardcoded in the skill, or derived from `.claude-plugin/plugin.json` (`homepage`/`repository` field) for portability? Hardcoding is simpler; derivation survives a future repo move without skill edits. Decide based on portability vs. complexity tradeoff during planning.
- [Affects R10][Technical] Release-please body format drift handling: R10 assumes the `Features`/`Bug Fixes` markdown grouping. Decide whether to (a) accept silent degradation if release-please config changes, (b) parse defensively and fall back to raw rendering, or (c) detect drift and surface a warning. Low priority — release-please config has been stable.

## Next Steps
- `/ce:plan docs/brainstorms/2026-04-17-ce-release-notes-skill-requirements.md` for structured implementation planning.
