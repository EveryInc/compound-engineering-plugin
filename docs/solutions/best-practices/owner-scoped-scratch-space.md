---
title: Owner-scoped scratch needs one executable resolver and release parity
date: 2026-07-16
category: docs/solutions/best-practices/
module: compound-engineering-skills
problem_type: best_practice
component: tooling
severity: high
applies_when:
  - Multiple Unix users or agents run Compound Engineering on one host
  - Skills persist run artifacts, reusable caches, or workflow state
  - Source, packaged, and installed skill copies can drift
tags: [scratch, tmp, multi-user, ownership, release, skills, cache, state]
---

# Owner-scoped scratch needs one executable resolver and release parity

## Incident

Two independent reproductions showed the same failure. A CE run under one Unix account created `/tmp/compound-engineering` and skill subdirectories. A sibling account could traverse the 0775 parent but could not create its own run directory because the shared parent and child were owned by the first UID. The same fixed-root pattern caused an actions.json payload-spill permission failure.

The initial source fix replaced the fixed root with `/tmp/compound-engineering-<uid>` and added a static scan. That fixed current source, but a stale installed plugin mirror still contained the old path and a later upstream change reintroduced a fixed path in another skill. The regression test caught the new source occurrence. The incident therefore had three layers:

1. **Trigger:** a sibling UID encountered a parent already owned by another user.
2. **Technical cause:** skills hand-constructed one predictable shared path without a common ownership/lifecycle contract.
3. **Systemic cause:** duplicated skill assets had no complete source -> package -> install parity gate, so a correct source patch did not guarantee corrected runtime instructions.

## Normative contract

Every predictable, reusable, detached, or independently cleaned filesystem lifecycle carries the same `scripts/scratch-root.py`; parity tests require byte identity. A supervising process may use unpredictable `mktemp` with `umask 077` only for temporary data shared with its same-UID child process tree and cleaned before that tree ends. The resolver exposes separate surfaces instead of pretending every artifact has the same lifetime:

- **Runtime:** `COMPOUND_ENGINEERING_SCRATCH_ROOT` -> valid `$XDG_RUNTIME_DIR/compound-engineering` -> `$HOME/.cache/compound-engineering/tmp` -> `/tmp/compound-engineering-<numeric-uid>`.
- **Reusable cache:** `COMPOUND_ENGINEERING_CACHE_ROOT` -> `$XDG_CACHE_HOME/compound-engineering` -> `$HOME/.cache/compound-engineering` -> a private cache namespace under the runtime root as the last degradation path.
- **Durable state:** `COMPOUND_ENGINEERING_STATE_ROOT` -> `$XDG_STATE_HOME/compound-engineering` -> `$HOME/.local/state/compound-engineering`.
- **Durable data:** `COMPOUND_ENGINEERING_DATA_ROOT` -> `$XDG_DATA_HOME/compound-engineering` -> `$HOME/.local/share/compound-engineering`.

Invalid candidates fall through; they never cause a skill to reuse an unsafe root. Never fall back to `/tmp/compound-engineering`. OS UID is the security boundary. Agent names may be recorded as metadata but cannot replace UID isolation.

The resolver sets `umask 077`, creates lifecycle roots/directories at 0700, validates every existing ancestor with descriptor-based no-follow checks, canonicalizes a root-owned macOS `/tmp` symlink before that walk, rejects other symlinks and group/other-writable ancestors except root-owned sticky system temp, rejects traversal, and creates run directories atomically with `mkdtemp`. Callers retain the exact returned path; randomized paths are never reconstructed later.

## Lifecycle namespaces

Do not force every artifact into a run UUID:

- **Ephemeral runs:** `<runtime-root>/<skill>/runs/<run-id>-<random>/`. The run ID scopes diagnostics; the random suffix prevents same-UID collisions. Detached peer jobs live under that exact run's `jobs/` directory, and cleanup goes through a resolver/runner operation on that exact path. PID numbers alone are not leases: identity combines process birth identity with an unguessable per-job token before status or signaling treats a process as belonging to the job.
- **Reusable cache:** `<cache-root>/<schema>/<semantic-content-key>/`. Cache identity is content/schema, not invocation. Use exclusive temporary creation plus atomic rename; owner-check opened files as defense in depth.
- **Durable workflow state:** `<state-root>/<skill>/<host>/<repo-or-object-key>/`. Use locks/leases and expire it through the workflow lifecycle, never a blanket run TTL.
- **Durable non-repo output:** `<data-root>/<workflow>/...` when no repo-tracked or user-selected path exists.

Final deliverables never live only in runtime scratch.

## Cross-agent review handoff

Private owner roots should stay private. Copy or attach review artifacts instead of changing home/scratch permissions. Generate the bundle from a complete staged/indexed change set, include untracked additions, checksum it, and inspect the diff header for every expected `new file`/`A` entry. This incident's first review bundle omitted newly added resolver files because it was made from a worktree-only diff; a checksum proved byte integrity of the wrong artifact. Completeness and integrity are separate gates.

## Executable gates

The contract is incomplete unless CI proves all of these:

- No skill asset contains the legacy fixed root.
- Every scratch consumer includes the byte-identical resolver.
- Relative, permissive, symlinked, wrong-owner, and hostile-ancestor candidates are rejected or safely skipped.
- Valid XDG then HOME candidates are selected in order.
- Same-UID concurrent runs get unique 0700 directories.
- Semantic caches use the cache root rather than run UUIDs; durable state remains stable across runtime-directory changes.
- Detached jobs colocate under their owning run, reject stale/reused PID identities, and cannot signal unrelated same-UID processes.
- Release/install tests compare generated installed skill content with source so stale mirrors cannot silently survive an update.

The final gate is operational: after release, test from two distinct UIDs or equivalent permission fixtures. A source-only test cannot prove that the runtime actually loaded the new asset.

## Related

- `docs/investigations/2026-07-15-shared-scratch-ownership.md` — preserved evidence and remediation history
- `docs/solutions/best-practices/predictable-tmp-cache-ownership-check.md` — read-side cache ownership defense
- `tests/scratch-root-contract.test.ts` — executable root and concurrency contract
- `tests/repo-profile-cache-parity.test.ts` — shared-asset parity contract
