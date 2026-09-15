# `ce-dream`

> Recurring consolidation of a knowledge folder: triage the inbox, merge duplicate sources, promote notes to learnings, flag stale learnings, surface conflicts, and propose pack-rule candidates -- as proposals unless the layout says otherwise.

`ce-dream` is what runs while nobody is looking. A harness scheduler (Claude Code scheduled tasks, Codex or Cursor automations, a Hermes cron, plain cron) invokes it with `mode:non-interactive`; it reads the `knowledge:` layout, decides what the folder needs from frontmatter and content, writes a dated report under the `memory` role, and moves a file only where the layout's `git` field allow-lists it. You invoke it yourself; it is not model-invoked.

```text
inbox/ sources/ notes/ learnings/
        |
        v
/ce-dream (lease, fingerprint, cap)
        |
        +-- <memory>/dreams/<date>.md   applied / proposals / conflicts / stale / candidates
        +-- <memory>/state.yml          lease + last run + fingerprint
        +-- git.allow paths only        moves applied and committed
```

---

## TL;DR

| Question | Answer |
|----------|--------|
| What does it do? | One consolidation pass over the folder, reported; allow-listed moves applied |
| When to use it | Weekly (or whatever `recurring.dream` documents) on any folder with a `knowledge:` layout; also by hand before a write-up |
| What it produces | The dream report, the advanced state file, allow-listed moves and their commit |
| Safe failure | Proposals only. `LOCKED` lease, invalid layout, or the per-run cap -> report what it can, move nothing more |

---

## Example invocations

```text
# Scheduled: asks nothing, ends on one parseable line
/ce-dream mode:non-interactive

# By hand: may ask once whether to apply a proposal the layout does not allow-list
/ce-dream
```

---

## Novel mechanics

- **Idempotent by fingerprint.** The state file records a content fingerprint of the `inbox`, `sources`, `notes`, and `learnings` roles after each completed run. An unchanged folder yields `Dream skipped: no change since <date>` -- no new report, nothing moved. Two schedulers overlapping is safe: the second sees `LOCKED` and records `aborted-locked`. The lease, cap, and state file follow [`ce-sweep`](./ce-sweep.md)'s pattern.
- **Conflicts are listed, never resolved.** Two learnings that cannot both be followed, or a learning contradicted by a later decision, appear with both sides quoted and both paths; neither is promoted, moved, or narrowed.
- **Promotion only along the layout's edges.** `promotion.inbox` and `promotion.notes` decide what may move where; an edge the layout omits is not taken. A promoted learning carries the layout's frontmatter contract and links back to its evidence.
- **Pack-rule candidates pass a held-out reuse check.** A learning is proposed as a candidate only when it cites evidence, states a standing rule, and the report names a case the learning was not derived from and says whether the rule would have helped there. Candidates keep the narrowest `applies_when` the evidence supports; the run never widens a scope or writes into a pack.
- **Write authority is data.** `git.mode: none` (every template but `kieran`) means every move is a proposal; a non-`none` mode with a matching `git.allow` entry lets the run apply and commit those files, and only those.

## Chain position

`ce-dream` sits around the loop with `ce-sweep` and `ce-compound-refresh`: it consumes what [`ce-capture`](./ce-capture.md) filed, hands stale learnings to [`ce-compound-refresh`](./ce-compound-refresh.md), and its report is evidence for [`ce-experiment`](./ce-experiment.md)'s write-up. Configuration: [`ce-setup`](./ce-setup.md) (`knowledge` argument), [configuration](./configuration.md#knowledge-layout).

## See also

- [`ce-capture`](./ce-capture.md) -- intake
- [`ce-sweep`](./ce-sweep.md) -- the lease/state-file pattern this borrows
- [`ce-compound`](./ce-compound.md) -- records a transferable finding as a `learning`
