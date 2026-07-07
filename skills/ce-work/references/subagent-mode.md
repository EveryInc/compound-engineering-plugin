# Subagent Mode: Shared Notes Document

Loaded on demand from the `## Subagent Mode` section of `SKILL.md`. It specifies the notes document that carries claims and learnings between subagents. The mode contract (all implementation dispatched, main loop owns user interaction, degrade-with-warning) lives in `SKILL.md`; this file is the coordination mechanism.

## The notes document

One markdown file per run, at a stable, inspectable path:

```
/tmp/compound-engineering/ce-work/<run-id>/notes.md
```

Use `/tmp` directly (not `$TMPDIR`) so the user can grep and inspect it, and a stable path (not `mktemp`) so the end-of-run `ce-compound` handoff can find it. `<run-id>` is any per-run identifier (a short slug or timestamp) so concurrent `ce-work` runs do not collide. Create it at the start of execution, before the first dispatch.

Two sections:

```markdown
## Claims
| Unit | Owner | Expected files / area |
|------|-------|-----------------------|
| U2   | worker-a | skills/ce-work/SKILL.md (Subagent Mode section) |

## Ledger
- [setup] Tests run via `bun test` from repo root; no per-file runner.
- [gotcha] `release:validate` fails unless the skill count in tests/release-metadata.test.ts matches.
- [decision] Mode token parsed in Phase 0 as a peer of mode:return-to-caller.
```

- **Claims** — intended ownership, recorded at dispatch *before* a worker starts (see below). One row per in-flight or upcoming unit: its U-ID, the worker, and the files or area it expects to touch (drawn from the same file/unit mapping the Parallel Safety Check already produces).
- **Ledger** — durable, reusable learnings, each one line prefixed with a category: `[setup]` (test setup, conventions, how to run things), `[gotcha]` (a bug or failure already diagnosed, so no one re-troubleshoots it), `[decision]` (a choice made that later units must stay consistent with).

## Dispatch: record the claim, seed the doc

At dispatch, for each worker:

1. **Write its claim** to the Claims table before the worker begins — so peers in the same parallel layer and workers in later layers see intended ownership up front.
2. **Seed the current notes document** (both sections) into the worker's bounded unit packet, alongside the plan-unit content it already receives. The worker reads the ledger to avoid re-deriving what earlier workers learned, and reads claims to know what neighboring units own.

Workers do not edit the notes document — they report learnings through the evidence return they already send back (Phase 1 Step 4). The orchestrator is the sole writer.

## Integration: distill into the ledger

After each serial unit, and after each parallel batch, when the orchestrator processes a worker's returned evidence:

1. **Distill new learnings into terse one-line ledger entries.** Pull them from the evidence return — no new worker output channel. Write what a *later* worker would need: a setup fact, a diagnosed gotcha, a consistency-forcing decision. Not a transcript of the work.
2. **Prune the integrated unit's claim** from the Claims table — a claim is live-coordination state, not a durable learning.
3. **Hold the ledger under a soft cap of ~15 lines.** When it would exceed that, consolidate related entries or drop the lowest-value ones. The cap is the forcing function: the notes document is seeded into every subsequent worker, so if it grows unbounded it recreates the exact context bloat subagents exist to avoid. Curate ruthlessly — only entries that change a future worker's behavior earn a line.

## Run end: persist and offer the ce-compound handoff

When the run's implementation completes:

1. The notes document already persists at its path — leave it for the user to inspect.
2. **Surface the distilled ledger** to the user (the durable learnings from the run).
3. **Offer** — never automatically perform — a `ce-compound` handoff to graduate the durable, reusable learnings into `docs/solutions/`. The `[setup]`, `[gotcha]`, and `[decision]` entries that generalize beyond this run are exactly `ce-compound`'s input. If the user accepts, invoke `ce-compound` with those learnings; if they decline, the notes document remains as the only record.
