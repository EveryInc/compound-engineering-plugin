---
date: 2026-05-13
topic: compound-engineering-nightly-plugin
---

# Compound Engineering Nightly Plugin

## Summary

A new sibling plugin `compound-engineering-nightly` is added to the Claude Code marketplace as a one-time hard-fork copy of `compound-engineering`, becomes Kieran's daily-driver install, and gains its own merge-and-go release flow (auto-bump on merge, no release-please, no Cursor/Codex parity).

---

## Problem Frame

Kieran edits this plugin daily and uses it daily. Today those two activities run on different versions: the local checkout has the latest edits, but his Claude Code session loads the marketplace-installed stable plugin, which only updates on release. That gap forces him either to wait for a release to dogfood a change or to maintain ad-hoc workarounds — neither is sustainable.

Separately, the existing plugin has a high shipping bar appropriate for a public release: experimental skills, personal-only agents, and half-baked ideas don't belong there but currently have nowhere else to live. Kieran wants a permanent home for that work — used daily, never shipped — and a tight loop where merging a PR is the same gesture as updating the version he's running.

The repo today is structured around shipping discipline (release-please, three-marketplace parity for Claude/Cursor/Codex, manual-bump rejection) that's correct for stable but wrong for the dogfood track. The nightly plugin is the carve-out where shipping discipline is relaxed in exchange for iteration speed and a personal playground.

---

## Requirements

**Plugin existence and packaging**
- R1. A new plugin `compound-engineering-nightly` exists at `plugins/compound-engineering-nightly/` as a real directory with its own `.claude-plugin/plugin.json`, populated initially via a one-time `cp -r` of `plugins/compound-engineering/` content.
- R2. The plugin appears in `.claude-plugin/marketplace.json` as a sibling marketplace entry. It does NOT appear in `.cursor-plugin/marketplace.json` or `.agents/plugins/marketplace.json`.
- R3. The plugin's marketplace metadata signals its experimental nature — at minimum an `experimental` or `nightly` tag and a description that names it as a dogfood track that may break.
- R4. Skill, agent, and command names inside nightly retain the `ce-*` prefix (no rename to `cen-*` or any other prefix).

**Release flow**
- R5. Nightly is excluded from `release-please-config.json` and `.release-please-manifest.json`. Its version is not managed by release-please.
- R6. A CI workflow auto-bumps `plugins/compound-engineering-nightly/.claude-plugin/plugin.json`'s patch version on every merge to `main` and commits the bump back to `main`. No release PR, no changelog, no GitHub Release.
- R7. The plugin AGENTS.md ("no manual version bump in feature PRs") rule is relaxed for nightly's `plugin.json` only — the CI bot owns the bump; contributors still do not hand-edit it.

**Validation and parity opt-out**
- R8. `bun run release:validate` accepts that nightly exists only in the Claude marketplace and does not flag its absence from Cursor/Codex marketplaces or from `release-please-config.json`. The mechanism is a per-plugin opt-out signal (e.g., a `claude-only: true` flag or equivalent) — detailed shape decided at planning time.
- R9. The plugin's "Adding a New Plugin to This Repo" checklist in `plugins/compound-engineering/AGENTS.md` gains a Claude-only branch that documents skipping Cursor/Codex marketplace entries, release-please registration, and cross-marketplace parity.

**Divergence and maintenance model**
- R10. After the initial fork, nightly's content evolves independently of stable. Every skill, agent, and command in nightly is a real file owned by nightly — no symlinks, no mirror script, no shared source.
- R11. Stable bug fixes are not auto-propagated to nightly. Manual back-port is the deliberate accepted cost; the dogfood loop surfaces missing fixes quickly.
- R12. New experimental components added to nightly do not require a corresponding addition to stable. Components removed from nightly do not affect stable.

---

## Success Criteria

- Kieran has nightly installed instead of stable on his daily machine, and merging a PR is the only action required for his next Claude Code session to pick up the change.
- A contributor (or Kieran himself in three months) can open the repo and tell from `AGENTS.md` + `.claude-plugin/marketplace.json` that nightly exists, is Claude-only, and skips the release pipeline — without having to reverse-engineer the CI workflow.
- `bun run release:validate` passes on a PR that touches only nightly content, without manual flag-flipping or validator suppressions.
- The downstream planning skill (`ce-plan`) can produce an implementation plan without having to invent the validator opt-out shape, the CI workflow trigger, or the back-port policy — those are stated here.

---

## Scope Boundaries

- No Cursor or Codex marketplace entry for nightly.
- No release-please integration for nightly. No formal release flow, changelog entry, or GitHub Release.
- No symlinks, build-script mirrors, override/overlay layering, or shared-source marketplace trickery — explicitly rejected during brainstorm in favor of the hard-fork copy.
- No side-by-side install model with stable. Nightly replaces stable on Kieran's machine; collision resolution is not a concern.
- No graduation/promotion workflow from nightly back to stable. Back-porting a nightly change to stable remains a manual PR like any other.
- No automated stable→nightly cherry-pick or mirror tooling. Manual port on observation is the accepted trade-off.
- No new testing or frontmatter-validation rules specific to nightly — it inherits whatever the existing skill/agent test suite already enforces against the fork's content. New components added only to nightly are subject to the same rules; deciding which tests run against which plugin tree is a planning task.

---

## Key Decisions

- **One-time hard-fork copy over symlinks**: chosen because Kieran is the sole user, the dominant change-flow is nightly→stable (not the reverse), and a hard fork eliminates install-time symlink-dereferencing assumptions and makes the entire nightly tree visible to plain `git ls-files`. Repo size doubles for the affected directories; the cost is accepted.
- **Claude Code only, not three-marketplace parity**: nightly's purpose is Kieran's local dogfood loop. Cursor and Codex users get the stable plugin only. Cross-marketplace parity is a shipping-discipline cost worth skipping for the dogfood track.
- **Auto-bump on merge instead of release-please**: release-please's PR-based flow adds latency and ceremony that defeat the merge-and-go intent. A simple CI workflow that bumps the patch version on merge is sufficient because no human reads nightly's changelog.
- **Component names stay `ce-*`**: nightly replaces stable on Kieran's machine, so namespace collision is not a concern and muscle memory is preserved. A rename to `cen-*` would have value only in a side-by-side world that was deliberately rejected.

---

## Dependencies / Assumptions

- Claude Code marketplace clients pick up new plugin versions from the configured ref (branch HEAD commit SHA) without requiring a GitHub release tag — confirmed during brainstorm research against the marketplace schema docs.
- `bun run release:validate`'s current cross-marketplace parity check is adjustable to accept per-plugin opt-out without breaking the existing parity guarantees between stable, Cursor, and Codex.
- The CI workflow runner has write permissions to push the auto-bump commit back to `main` (or `main` branch protection allows a specific bot account through). If branch protection blocks this, the workflow design needs adjustment at planning time.
- The one-time fork operation produces a working `compound-engineering-nightly` plugin without needing post-copy fix-up beyond changing the `name` field in `plugin.json` and adding the experimental tag.

---

## Outstanding Questions

### Resolve Before Planning

- None. All product-shape decisions resolved in brainstorm.

### Deferred to Planning

- [Affects R8][Technical] Exact shape of the `claude-only` opt-out signal in `release:validate` — frontmatter field on the plugin, separate config file, marketplace-entry tag, or per-plugin metadata in `src/release/metadata.ts`. Decided during planning based on the existing validator's structure.
- [Affects R6][Technical] CI workflow author identity and push mechanism — GitHub App, PAT, or `github-actions[bot]` — and whether branch protection on `main` needs an exception for the auto-bump commit. Planning task.
- [Affects R1][Technical] Whether the initial fork PR commits the full copy as-is (large diff, one commit) or via a script that's re-runnable (`bun run fork:nightly`) so the operation is reproducible. Planning task.
- [Affects R3][Needs research] Whether marketplace tags like `experimental` or `nightly` have any client-side rendering or filtering behavior in Claude Code's `/plugin` UI, or are purely metadata. Planning task; informs the tag choice but not whether to tag.
