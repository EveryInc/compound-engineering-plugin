---
title: A predictable-path cache in shared /tmp is a prompt-injection vector — ownership-check reads
date: 2026-06-29
category: docs/solutions/best-practices/
module: repo-grounding-cache
problem_type: best_practice
component: tooling
severity: medium
applies_when:
  - Writing a cache or scratch file to a world-shared location (/tmp) at a predictable path
  - The cached content is later fed into an LLM/agent context
  - Running on a multi-user host where a local co-tenant could pre-create files
tags: [security, prompt-injection, cache, tmp, file-ownership, shared-host]
---

# A predictable-path cache in shared /tmp is a prompt-injection vector — ownership-check reads

## Context

The repo-grounding cache stored profiles at `/tmp/compound-engineering/repo-profile/<root-sha>/<inputs-digest>.json` (earlier: `<head-sha>.json`). The path components are knowable for any public or shared repo (root commit + a digest of committed profile-input blobs), and `/tmp/compound-engineering/` is world-traversable. Security review found: on a multi-user host, a local co-tenant can **pre-create** that exact path and plant a JSON file that satisfies every validity gate (it sets `inputs_digest` to the victim's current digest, the current schema version, and a `profile` object — cleanliness is checked against the victim's working tree, not the file's authenticity). The victim's skill then prints `HIT` and feeds the attacker's JSON into the agent as the "project profile" — attacker-controlled text into the LLM context, i.e. **indirect prompt injection**.

Impact is calibrated (needs a local co-tenant + predictable SHAs; payload is text, not code-exec or secret disclosure), but the injection elevation is why it is worth fixing rather than dismissing as "just repo metadata."

## Guidance

When a cache/scratch file in shared `/tmp` will be **read back into an agent's context**, do not trust it by path + content gates alone — verify it is **yours**:

- **Reject any cache file not owned by the current user.** After opening, `os.fstat(fd).st_uid != os.geteuid()` -> treat as a miss and re-derive. Check via the *opened fd* (`fstat`), not a pre-open `stat`, so it also defeats a symlink an attacker planted pointing at a file they own. Guard the check where `geteuid` is unavailable (non-POSIX) — the shared-`/tmp` threat doesn't apply there.
- This composes with the cache's existing principle that it is **never a correctness dependency**: a rejected entry simply degrades to "derive fresh," never blocks.
- Write side is already safe if you use `tempfile.mkstemp` (`O_EXCL`, mode `0600`) + `os.replace` (atomic). The exposure is purely on the *read* path.

This read-side check remains defense in depth, but it is no longer the primary boundary. A later cross-UID incident proved that a fixed shared root also creates availability failures before a file is opened: the first user can own the parent and prevent every sibling UID from creating its subtree. The normative design is now the validated owner-scoped resolver in `owner-scoped-scratch-space.md`; retain `fstat` because it still protects predictable cache entries inside that private namespace from accidental ownership drift.

## Why This Matters

Predictable paths in shared `/tmp` are a classic local attack surface, and the usual framing ("it's just a cache, low impact") misses the new twist: **anything fed into an LLM context is an injection sink.** A cache of benign-looking metadata becomes an attacker-controlled-text channel into the model. The data being "non-sensitive" does not bound the risk when the data is *instructions-adjacent*.

## When to Apply

- Any agent/skill that reads a `/tmp` (or other shared-dir) file at a guessable path into model context.
- Caches keyed by values an attacker can compute (commit SHAs, repo names, usernames).

Not needed for per-run `mktemp -d` scratch with an unguessable path consumed only within the same process, or for files never surfaced to the model.

## Examples

```python
# Vulnerable: gates check authenticity-irrelevant facts (inputs_digest/schema/cleanliness),
# never WHO wrote the file.
with open(path) as f:
    doc = json.load(f)
# ... print("HIT"); print(doc["profile"])   # attacker text -> agent context

# Fixed: reject a file we don't own (defeats planted file AND planted symlink via fstat-on-fd).
with open(path) as f:
    geteuid = getattr(os, "geteuid", None)
    if geteuid is not None and os.fstat(f.fileno()).st_uid != geteuid():
        return miss()
    doc = json.load(f)
```

## Related

- `docs/solutions/skill-design/cross-skill-shared-cache-primitive.md` — the cache this hardened
- `docs/solutions/best-practices/cache-invalidation-input-set-completeness.md` — the cache's correctness (separate) property
- `docs/solutions/best-practices/owner-scoped-scratch-space.md` — the superseding root, lifecycle, and release-propagation contract
- AGENTS.md "Scratch Space" (the normative executable resolver contract)
