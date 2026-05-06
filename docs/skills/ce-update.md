# `ce-update`

> Check whether the installed compound-engineering plugin is up to date and recommend the update command if not. Claude Code only.

`ce-update` is the **plugin version check** skill. It compares the version your Claude Code session has loaded against `plugin.json` on `main` (where the marketplace installs from) and tells you whether you're up to date — and if not, gives you the exact `claude plugin update` command to run.

It's Claude Code only because it relies on the plugin harness cache layout (`~/.claude/plugins/cache/<marketplace>/compound-engineering/<version>/...`) for version detection. On other platforms or under `claude --plugin-dir` local development, the skill recognizes the case and tells you no action is needed.

---

## TL;DR

| Question | Answer |
|----------|--------|
| What does it do? | Compares loaded plugin version against `plugin.json` on `main`; recommends the update command if out of date |
| When to use it | "Update compound engineering", "is ce up to date", or when bug behavior suggests a stale plugin |
| What it produces | "Up to date" or an `out of date` message with the exact `claude plugin update` command |
| Status | Claude Code only (`disable-model-invocation: true`) |

---

## The Problem

Plugin version drift causes confusing failure modes:

- **Bug reports against fixed bugs** — the user reports an issue that was fixed two versions ago, but their plugin is stale
- **Skills behaving like an old version** — the user runs a skill and gets behavior that doesn't match the current docs
- **No obvious way to check** — "what version am I on" isn't surfaced anywhere obvious in Claude Code
- **Wrong update command suggestion** — manual cache-sweep / marketplace-refresh advice from before `claude plugin update` shipped
- **Marketplace name confusion** — the plugin distributes under multiple marketplace names (public vs internal/team installs); a hardcoded name in the update command would be wrong for half the audience

## The Solution

`ce-update` runs a focused version probe:

- **Three parallel scripts** probe upstream version (from `main` HEAD via `gh api`), currently-loaded version (from the plugin cache path), and marketplace name (also from the cache path)
- **Compare against `main` HEAD `plugin.json`**, not the latest GitHub release tag — the marketplace installs from `main`, so release tags false-positive whenever `main` is ahead
- **Sentinel-driven failure handling** — `__CE_UPDATE_VERSION_FAILED__` (gh unavailable / rate-limited) and `__CE_UPDATE_NOT_MARKETPLACE__` (loaded outside the standard cache, e.g., `claude --plugin-dir` local dev) are explicit cases the skill recognizes
- **Recommended update command uses the detected marketplace name**, not a hardcoded one — works for public, internal, and team marketplaces
- **Beta-style explicit-invocation only** — won't auto-fire from prose mentions of "update"

---

## What Makes It Novel

### 1. Compares against `main` HEAD, not release tags

The marketplace installs plugin contents from `main` HEAD, not from the latest release tag. Comparing against tags would false-positive whenever `main` is ahead of the last tag — which is the normal state between releases. The skill reads `plugins/compound-engineering/.claude-plugin/plugin.json` on `main` directly via `gh api`.

### 2. Marketplace name detected from skill path, not hardcoded

The plugin distributes under multiple marketplace names — `compound-engineering-plugin` for public installs (per the README), and other names for internal or team marketplaces. Hardcoding a name into the update command would be wrong for half the audience. Instead, the skill parses `${CLAUDE_SKILL_DIR}` against the marketplace-cache layout (`~/.claude/plugins/cache/<marketplace>/compound-engineering/<version>/skills/ce-update`) and extracts the marketplace name from the path. The recommended `claude plugin update compound-engineering@<marketplace>` command uses the detected name.

### 3. Three parallel probes with explicit sentinels

Three scripts run in parallel via the Bash tool:

- `scripts/upstream-version.sh` — reads `plugin.json` on `main` via `gh api`; prints version or `__CE_UPDATE_VERSION_FAILED__`
- `scripts/currently-loaded-version.sh` — parses `${CLAUDE_SKILL_DIR}` for the version segment; prints version or `__CE_UPDATE_NOT_MARKETPLACE__`
- `scripts/marketplace-name.sh` — parses `${CLAUDE_SKILL_DIR}` for the marketplace segment; prints name or `__CE_UPDATE_NOT_MARKETPLACE__`

Sentinels make failure modes structural — the skill knows whether the upstream fetch failed (different recovery) vs whether the skill is loaded outside the standard cache (different message).

### 4. `--plugin-dir` local-dev mode recognized

When `scripts/currently-loaded-version.sh` returns `__CE_UPDATE_NOT_MARKETPLACE__`, two cases collapse to the same handling:

- A `claude --plugin-dir` local-development session (skill loaded from the local checkout, not the marketplace cache)
- A non-Claude-Code platform (this skill is Claude Code-only)

The skill tells the user: "Loaded from outside the marketplace cache. Normal when using `claude --plugin-dir` for local development. No action for this session. Your marketplace install (if any) is unaffected — run `/ce-update` in a regular Claude Code session (no `--plugin-dir`) to check that cache."

### 5. Pinned narrow `allowed-tools`

The skill declares the three specific scripts in `allowed-tools` — `Bash(bash *upstream-version.sh)`, `Bash(bash *currently-loaded-version.sh)`, `Bash(bash *marketplace-name.sh)` — so users without `bypassPermissions` skip the approval prompts when the skill runs them. Pinned per filename rather than broad `Bash(bash *)`.

### 6. Beta-style explicit-invocation only

`disable-model-invocation: true` prevents the skill from auto-firing on prose mentions of "update" or version-related discussion. Plugin updates are a deliberate user choice — invoke `/ce-update` directly.

---

## Quick Example

You suspect a skill behavior doesn't match what the docs say. You wonder if your plugin is stale. You invoke `/ce-update`.

The skill runs three scripts in parallel:

- `upstream-version.sh` returns `2.42.0` (current `plugin.json` on `main`)
- `currently-loaded-version.sh` returns `2.40.0` (parsed from your loaded skill path)
- `marketplace-name.sh` returns `compound-engineering-plugin` (parsed from the same path)

Currently-loaded ≠ upstream → out of date. The skill responds:

```text
compound-engineering is on v2.40.0 but v2.42.0 is available.

Update with:
  claude plugin update compound-engineering@compound-engineering-plugin

Then restart Claude Code to apply.
```

You run the command, restart, and the next session has the new version.

---

## When to Reach For It

Reach for `ce-update` when:

- You said "update compound engineering", "ce update", "is ce up to date"
- A skill is behaving differently than the docs describe
- You're filing a bug and want to confirm you're on a current version first
- You're about to use a feature that was added recently and want to verify it's available

Skip `ce-update` when:

- You're on a non-Claude-Code platform — the skill stops with a "no action" message; updating happens through that platform's mechanism
- You're in a `claude --plugin-dir` local-dev session — the skill recognizes the case and stops
- You want to check a specific component version, not the whole plugin → read `plugin.json` directly

---

## Use as Part of the Workflow

`ce-update` is a standalone utility — it doesn't sit inside the chain. It's invoked when version drift is suspected:

- **From `/ce-report-bug`** — checking version is the first thing a bug report should establish
- **From the user directly** when the agent's behavior smells stale

The output is read directly by the user — no downstream skill consumes it.

---

## Use Standalone

Direct invocation:

- `/ce-update` — runs the version check

There are no arguments. The skill probes, compares, and reports. If the upstream fetch fails (gh unavailable or rate-limited), it says so and stops without recommending a partial answer.

---

## Reference

| Sentinel | Meaning |
|----------|---------|
| `__CE_UPDATE_VERSION_FAILED__` | `gh api` couldn't fetch upstream `plugin.json` (gh unavailable, rate-limited) — skill stops with that message |
| `__CE_UPDATE_NOT_MARKETPLACE__` | Skill is loaded outside `~/.claude/plugins/cache/` — usually `claude --plugin-dir` local dev. Skill stops with "no action" message |

Scripts (in `scripts/`):

- `upstream-version.sh` — `gh api` against `plugins/compound-engineering/.claude-plugin/plugin.json` on `main`
- `currently-loaded-version.sh` — parses `${CLAUDE_SKILL_DIR}` for version segment
- `marketplace-name.sh` — parses `${CLAUDE_SKILL_DIR}` for marketplace segment

All three use Python 3 stdlib and `gh` only — no PyYAML or other deps.

---

## FAQ

**Why compare against `main` HEAD instead of the latest release tag?**
Because the marketplace installs plugin contents from `main` HEAD, not from release tags. Comparing against tags would false-positive whenever `main` is ahead of the last tag — which is the normal state between releases.

**Why does the marketplace name get detected from the path?**
Because the plugin distributes under multiple marketplace names — public installs use `compound-engineering-plugin`, internal/team marketplaces use other names. Hardcoding the name into the update command would be wrong for half the audience. Detecting it from the cache path keeps the recommendation correct for whichever marketplace you're on.

**Why is it Claude Code only?**
Because version detection relies on the Claude Code plugin harness cache layout (`~/.claude/plugins/cache/<marketplace>/compound-engineering/<version>/...`). Other platforms have their own update mechanisms; this skill defers to those. When the skill detects it's not in the standard cache, it says so cleanly and stops.

**What if `gh api` is rate-limited?**
The skill tells you the upstream version couldn't be fetched and stops. It doesn't guess or recommend a partial answer. Wait for the rate limit, or check the version manually via the GitHub UI.

**What about `--plugin-dir` local development?**
The skill recognizes the case (`__CE_UPDATE_NOT_MARKETPLACE__` from the path-parsing scripts) and tells you: this is normal when using `--plugin-dir`, no action for this session, your marketplace install (if any) is unaffected.

**Why no auto-invocation?**
`disable-model-invocation: true` prevents the skill from firing on prose like "update the plan" or "is this up to date" that has nothing to do with plugin versions. Update is a deliberate user choice.

---

## See Also

- [`ce-setup`](./ce-setup.md) — installs missing dependencies; complementary to version checks
- [`ce-report-bug`](./ce-report-bug.md) — reporting a bug; should establish version first
- [`ce-release-notes`](./ce-release-notes.md) — summarize recent compound-engineering plugin releases
