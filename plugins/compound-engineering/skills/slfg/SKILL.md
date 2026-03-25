---
name: slfg
description: "[DEPRECATED] Compatibility wrapper that routes to lfg with swarm mode enabled."
argument-hint: "[feature description]"
disable-model-invocation: true
---

`slfg` is deprecated.

Do not maintain a separate orchestration contract here.

Behavior:

1. Announce briefly that `slfg` is deprecated and that `lfg` now owns the autopilot contract.
2. Preserve the user's feature description content unchanged.
3. Immediately route to `lfg` with an explicit swarm request in the forwarded input so `lfg` will still choose swarm even when `compound-engineering.local.md` is missing or set to `standard`. Preserve the original feature description after that swarm request.
4. Do not duplicate routing logic, manifest logic, or downstream skill-calling rules here. `lfg` is the source of truth.

When users ask for swarm explicitly, prefer `/lfg ...` with swarm mode going forward.
