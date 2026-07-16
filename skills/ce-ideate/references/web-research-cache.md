# Web Research Cache (V15)

Read this when checking the V15 cache before dispatching `web-researcher`, or when appending fresh research to the cache after dispatch. The behavior here is conditional — most invocations either hit the cache or write to it once and move on.

## Cache file shape

```json
[
  {
    "key": {
      "mode": "repo|elsewhere-software|elsewhere-non-software",
      "focus_hint_normalized": "<lowercase, whitespace-collapsed focus hint or empty string>",
      "topic_surface_hash": "<short hash of the user-supplied topic surface>"
    },
    "result": "<web-researcher output as plain text>",
    "ts": "<iso8601>"
  }
]
```

The cache lives at `<cache-dir>/web-research-cache.json`, where `<cache-dir>` is the exact reusable directory returned by the shared resolver. It is deliberately separate from per-run checkpoints and dossiers.

## Reuse check

Before dispatching `web-researcher`, set `SKILL_DIR` to the ce-ideate skill directory and resolve the reusable V15 cache namespace:

```bash
SKILL_DIR="<absolute path of the ce-ideate skill directory>";
CACHE_DIR="$(python3 "$SKILL_DIR/scripts/scratch-root.py" cache-subdir "ce-ideate-web-v15")";
CACHE_FILE="$CACHE_DIR/web-research-cache.json";
test ! -f "$CACHE_FILE" || printf '%s\n' "$CACHE_FILE"
```

The `test` expression exits successfully when the cache is absent, so first use does not abort the reuse check.

Read the matching file when present. If an entry's `key` matches the current dispatch (same full mode variant — `repo`, `elsewhere-software`, or `elsewhere-non-software` — plus same case-insensitive normalized focus hint plus same topic surface hash), skip the dispatch and pass the cached `result` to the consolidated grounding summary. Mode variants must match exactly: `elsewhere-software` and `elsewhere-non-software` are distinct domains and must not cross-reuse. Note in the summary: "Reusing prior web research from this session — say 're-research' to refresh."

On `re-research` override, delete the matching entry and dispatch fresh.

## Append after fresh dispatch

After a fresh dispatch, append the new result to the exact `<cache-dir>/web-research-cache.json` path returned above. Publish updates atomically (write a sibling temporary file, then rename) so concurrent or interrupted invocations never expose a partial JSON document.

## Topic surface hash

The topic surface is the user-supplied content the web research is grounded on:
- **Elsewhere modes (`elsewhere-software`, `elsewhere-non-software`):** the user's topic prompt plus any Phase 0.4 intake answers (the actual subject the agent is researching). The two sub-modes are keyed separately — a reclassification between software and non-software for the same topic hash must force a fresh dispatch, since the research domain differs.
- **Repo mode:** the focus hint plus a stable repo discriminator. This keeps the cache key meaningful when focus is empty — two bare-prompt invocations in the same repo legitimately share research, but the key still differentiates repos in the shared reusable cache. Resolve the discriminator with this fallback chain and hash the result (first 8 hex chars of sha256 is sufficient):
    1. `git remote get-url origin` — stable across machines, correct for collaborators on the same remote.
    2. `git rev-parse --show-toplevel` — absolute repo path; machine-local but always available in a git checkout.
    3. The current working directory's absolute path — last resort when not in a git repo.

Normalize before hashing: lowercase, collapse whitespace. (The repo discriminator hash is computed from the raw command output; only the focus hint and topic text are normalized.)

## Degradation

If the cache file is unreachable across invocations on the current platform (filesystem isolation, sandboxing, ephemeral working directory), degrade to "no reuse, dispatch every time." Surface the limitation in the consolidated grounding summary and proceed without reuse rather than inventing a capability the platform may not have.
