---
title: A predictable-path cache in shared /tmp is a prompt-injection vector — ownership-check reads
date: 2026-06-29
category: docs/solutions/best-practices/
module: scratch-space
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

## Threat

A scratch file at a knowable path under world-traversable `/tmp` (keyed by commit SHA, repo name, username, or a digest of committed blobs) can be **pre-created** by a local co-tenant. A planted file can satisfy every content gate the reader applies (schema version, digest, freshness), because those gates check facts about the victim's tree, not who wrote the file. If the reader then feeds the content into an agent's context, the attacker has attacker-controlled text in the LLM prompt: indirect prompt injection.

The usual framing ("it's just cache metadata, low impact") misses this. **Anything read into an LLM context is an injection sink**, so "non-sensitive" data does not bound the risk when the data is instructions-adjacent. Impact is calibrated (local co-tenant plus predictable path; payload is text, not code execution), which is why the fix is a cheap check rather than abandoning shared temp.

## Guidance

When a shared-`/tmp` file will be read back into an agent's context, path plus content gates do not prove authenticity. Verify it is **yours**:

- After opening, `os.fstat(fd).st_uid != os.geteuid()` -> treat as a miss and re-derive. Check via the *opened fd*, not a pre-open `stat`, so a planted symlink pointing at an attacker-owned file is also rejected. Skip where `geteuid` is unavailable (non-POSIX); the shared-`/tmp` threat does not apply there.
- A rejected entry degrades to "derive fresh"; the cache must never be a correctness dependency.
- The write side is already safe with `tempfile.mkstemp` (`O_EXCL`, mode `0600`) plus `os.replace`. The exposure is purely on the read path.

```python
with open(path) as f:
    geteuid = getattr(os, "geteuid", None)
    if geteuid is not None and os.fstat(f.fileno()).st_uid != geteuid():
        return miss()
    doc = json.load(f)
```

Current practice layers **both** defenses: the per-effective-uid root from AGENTS.md "Scratch Space" (`/tmp/compound-engineering-<effective-uid>/…`, mode `0700`, reject symlink or foreign ownership) **and** fstat-on-fd before content enters agent context. An earlier write-up rejected uid namespacing to keep a single shared `/tmp/compound-engineering/` root; that was reversed. Do not revive the un-namespaced shared root.

Not needed for per-run `mktemp -d` scratch with an unguessable path consumed only within the same process, or for files never surfaced to the model.

## Related

- AGENTS.md "Scratch Space" (per-effective-uid `/tmp/compound-engineering-<effective-uid>/` plus the `$TMPDIR` fallback)
