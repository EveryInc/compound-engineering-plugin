# Autofix output parse contract

Audience: downstream parsers (orchestrators, post-merge hooks, CI steps) that invoke `/ce-compound mode:autofix ...` and parse the output programmatically.

This file is not loaded by the skill at runtime. It documents the stable anchors callers can rely on.

## Output shapes

The skill emits one of three first-line strings:

- `✓ Documentation complete (mode:autofix)` — a new doc was written
- `✓ Documentation updated (mode:autofix)` — an existing doc was updated (`depth:full|thorough`, overlap high)
- `✓ No documentation written (mode:autofix)` — preconditions unmet; nothing written

## Depth anchor

Every autofix output includes:

```
Depth: [lightweight|full|thorough]
```

This carries the execution path the skill took. `lightweight` is the default when `depth:` is absent from arguments.

## Parser-anchor fields

Callers key off these labels. All are present when meaningful for the shape; none appear when not applicable.

| Field | Shape(s) | Meaning |
|-------|----------|---------|
| `File created:` | complete | Path to the new doc written |
| `File updated:` | updated | Path to the existing doc that was refreshed |
| `Overlap detected:` | updated | Path to the existing doc that matched; matched dimensions on the next line |
| `Track:` | complete, updated | `bug` or `knowledge` |
| `Category:` | complete, updated | Category directory under `docs/solutions/` |
| `Refresh candidate:` | complete, updated | Path to an older doc that may be stale given this new learning |
| `Discoverability recommendation:` | complete, updated | Present when the project's AGENTS.md/CLAUDE.md does not surface `docs/solutions/` |
| `Reason:` | no-op; also on `Refresh candidate:` blocks | Which precondition failed (no-op), or one-line rationale for the refresh candidate |
| `Context considered:` | no-op | Bulleted summary of what was available when the skill decided not to write |

## Invalid-argument error

If the caller passes an unknown `depth:` value, the skill halts before dispatching any subagents and emits:

```
ce-compound failed. Reason: unknown depth:<value>. Valid values: lightweight, full, thorough.
```
