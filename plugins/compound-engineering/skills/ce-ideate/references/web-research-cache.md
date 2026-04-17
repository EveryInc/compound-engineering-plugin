# Web Research Cache (V15)

Read this when checking the V15 cache before dispatching `web-researcher`, or when appending fresh research to the cache after dispatch. The behavior here is conditional — most invocations either hit the cache or write to it once and move on.

## Cache file shape

```json
[
  {
    "key": {
      "mode": "repo|elsewhere",
      "focus_hint_normalized": "<lowercase, whitespace-collapsed focus hint or empty string>",
      "topic_surface_hash": "<short hash of the user-supplied topic surface>"
    },
    "result": "<web-researcher output as plain text>",
    "ts": "<iso8601>"
  }
]
```

Files live under `.context/compound-engineering/ce-ideate/<run-id>/web-research-cache.json`. If `.context/` namespacing is unavailable, fall back to OS temp (`mktemp -d -t ce-ideate-XXXXXX`) per the repo Scratch Space convention; reuse becomes within-process only in that case.

## Reuse check

Before dispatching `web-researcher`, glob `.context/compound-engineering/ce-ideate/*/web-research-cache.json` across run-ids — refinement loops within a session may legitimately reuse another run's cache by topic, not run-id. If any entry's `key` matches the current dispatch (same mode + same case-insensitive normalized focus hint + same topic surface hash), skip the dispatch and pass the cached `result` to the consolidated grounding summary. Note in the summary: "Reusing prior web research from this session — say 're-research' to refresh."

On `re-research` override, delete the matching entry and dispatch fresh.

## Append after fresh dispatch

After a fresh dispatch, append the new result to the current run's cache file at `.context/compound-engineering/ce-ideate/<run-id>/web-research-cache.json` (create directory and file if needed). The next invocation in the session can reuse it via the glob above.

## Topic surface hash

The topic surface is the user-supplied content the web research is grounded on:
- **Elsewhere mode:** the user's topic prompt plus any Phase 0.4 intake answers (the actual subject the agent is researching).
- **Repo mode:** the focus hint plus a short repo identifier (e.g., the repo root name). This keeps the cache key meaningful when focus is empty — two bare-prompt invocations in the same repo legitimately share research, but the key still differentiates repos.

Normalize before hashing: lowercase, collapse whitespace.

## Degradation

If the cache file is unreachable across invocations on the current platform (filesystem isolation, sandboxing, ephemeral working directory), degrade to "no reuse, dispatch every time." Surface the limitation in the consolidated grounding summary and proceed without reuse rather than inventing a capability the platform may not have.
