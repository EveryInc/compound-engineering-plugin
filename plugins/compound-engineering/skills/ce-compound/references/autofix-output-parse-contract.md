# Autofix output parse contract

Audience: downstream parsers (orchestrators, post-merge hooks, CI steps) that invoke `/ce-compound mode:autofix ...` and parse the output programmatically.

This file is not loaded by the skill at runtime. It documents what callers can rely on.

## Reliable anchors

Search anywhere in stdout — first-line discipline does not hold; the agent prepends narration before any template block.

**Shape detector substrings.** Presence of either substring identifies which output shape was emitted:

- `✓ Documentation complete` — success-complete shape (substring; the `(mode:autofix)` suffix is unreliable on this line, see best-effort)
- `✓ No documentation written (mode:autofix)` — no-op shape

When the no-op substring is present, the no-op block follows it in the same response with these anchors on their own lines:

- `Depth: [lightweight|standard|deep]`
- `Reason: <one-line rationale; may continue on indented lines>`
- `Context considered:` followed by bulleted summary lines

## Best-effort fields

Callers MUST NOT hard-fail when these are absent. They are emitted opportunistically and frequently drop in headless runs:

- `✓ Documentation updated` substring — success-updated path is unreachable in `claude -p` (overlap-update requires the Solution Extractor to read conversation history); demoted by construction
- `(mode:autofix)` suffix on success-shape lines (lightweight mode emits its own suffix variants)
- `File created:` / `File updated:` paths
- `Track:` / `Category:` / `Overlap detected:` fields
- `Refresh candidate:` and `Discoverability recommendation:` blocks
- `Phase 1 subagents:` / `Phase 3 specialized reviewers:` blocks (template-only; never observed in headless runs)

## Invalid-argument error

If the caller passes an unknown `depth:` value with `mode:autofix`, the skill halts before subagent dispatch and emits:

```
ce-compound failed. Reason: unknown depth:<value>. Valid values: lightweight, standard, deep.
```
