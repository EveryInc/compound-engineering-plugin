# Submitting Compound Engineering to the official xAI plugin marketplace

Maintainer runbook for listing Compound Engineering in the official [xAI plugin
marketplace](https://github.com/xai-org/plugin-marketplace). This is a **periodic
"promote a stable version" action**, not a per-release step — the direct-install
and self-hosted-catalog paths (below) already track the repository automatically.

## How the three Grok distribution paths differ

| Path | Command | Version tracking | Ongoing cost |
|---|---|---|---|
| Direct install | `grok plugin install EveryInc/compound-engineering-plugin` | tracks repo HEAD; `grok plugin update` pulls latest | none |
| Self-hosted catalog | `grok plugin marketplace add EveryInc/compound-engineering-plugin` | our `.grok-plugin/marketplace.json` uses a bare Git URL source (no SHA) → tracks HEAD | none |
| Official xAI catalog | browse/install from `xAI Official` marketplace | a **SHA-pinned** remote source entry in xAI's repo | one PR per promoted version |

Only the official catalog carries per-version cost: xAI requires remote sources
to pin a full 40-character commit SHA (a moving ref would let a force-push ship
new code silently), so updating the official listing means opening a PR that
bumps the SHA. Point contributors who want the latest at direct install instead.

## Submission steps (remote source — recommended for third-party)

1. Fork [`xai-org/plugin-marketplace`](https://github.com/xai-org/plugin-marketplace) and branch from `main`.
2. Add one entry to their `.grok-plugin/marketplace.json` `plugins` array:

   ```json
   {
     "name": "compound-engineering",
     "description": "Brainstorm, plan, debug, review, and compound learnings with AI agents",
     "category": "development",
     "source": {
       "source": "url",
       "url": "https://github.com/EveryInc/compound-engineering-plugin.git",
       "sha": "<full-40-char-commit-sha>"
     },
     "homepage": "https://github.com/EveryInc/compound-engineering-plugin",
     "keywords": ["compound-engineering", "compound engineering", "ce-plan", "ce-work"]
   }
   ```

3. Pin the SHA to the commit you want to ship (a real commit, not a branch or tag):

   ```bash
   git ls-remote https://github.com/EveryInc/compound-engineering-plugin.git HEAD
   ```

4. Regenerate their component index and validate locally (this is what their CI runs):

   ```bash
   python3 scripts/generate-plugin-index.py
   python3 scripts/validate-catalog.py
   python3 scripts/generate-plugin-index.py --check
   ```

5. Open the PR against `xai-org/plugin-marketplace` and fill in their template. Code-owner review is required.

## Notes

- **Source from the official org.** The `source.url` must be `EveryInc/compound-engineering-plugin` (our org), not a personal fork — xAI flags personal-account sources for branded plugins as possible impersonation.
- **To roll out an update**, bump the pinned `sha` in the same entry and regenerate the index — do not open a parallel duplicate entry.
- **Keep `keywords` brand-scoped.** They power Grok's plugin CTA; generic terms (`ai`, `cli`, `workflow`) get pushed back because they mis-fire on unrelated requests.
- A local source (vendoring our files under xAI's `external_plugins/compound-engineering/`) is also accepted, but requires re-vendoring on every update — the remote source above is lighter to maintain.
