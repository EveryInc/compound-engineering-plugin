---
status: accepted
---

# When a blocked transaction's precious custody is reclaimed

## Context

When plan-wide verification or unit integration fails (nonzero exit or an artifact-blocked outcome), the artifact transaction reaches `complete` but raises before the success-path `sweep_artifact_custody`, so its byte-for-byte precious `.custody` backups stay on disk (up to 64 MiB per transaction). A reviewer flagged this as a leak and asked for a sweep on the blocked path.

Whether those backups are still needed depends on the transaction **phase**, and this is the crux. Custody is consumed at the `captured → restored` transition — `resume` only restores from a transaction still in `captured`; for `restored`/`receipted`/`complete` it returns early and restores nothing. So the recovery net is live only while the journal is `captured`.

The blocked exits split on exactly this line:

- The exit the reviewer flagged — `verification_exit != 0` and the `artifact_blocked` outcome — raises **after** the transaction has already advanced to `complete` (restore has happened). Its custody is **spent**; a `resume` would restore nothing from it. Sweeping it at the blocked return is safe and correct.
- Other blocked exits — canonical branch/HEAD changed, integration pre-receipt failures — raise while the journal is still `captured`/`restored`. There the custody is **still the recovery net** and must be retained.

Separately, an open (pre-`complete`) blocked transaction refuses **both** `cmd_cleanup` and `remove_finalized_artifacts` ("artifact custody remains open; resume the owning transaction before cleanup"), and only `resume`-to-completion sweeps. So a transaction blocked pre-`complete` and then **neither resumed nor abandoned** leaks its custody indefinitely — there is no terminal for it.

## Decision

**Sweep at the blocked return only when the transaction phase is `complete`.** At `complete` the custody is already consumed (restore happened before the blocked raise) and `resume` restores nothing from it, so sweeping reclaims disk without harming recovery. This satisfies the reviewer's finding for the path they flagged.

**Retain custody on any blocked exit that is still pre-`complete`** (`captured`/`restored`). There the `.custody` backup is the live recovery net and `resume` restores precious state from it; never sweep it at block time.

**Reclaim the retained (pre-`complete`) blocked custody at the abandon terminal.** `cmd_cleanup --abandon` — the operator explicitly discarding the unit's uncommitted work — resolves a retained blocked open transaction instead of refusing on it: it marks the transaction abandoned/terminal in its journal and calls `sweep_artifact_custody`, then proceeds with cleanup. Abandon already means "discard this unit's uncommitted work" (`retained_blocked_abandonment_receipt` covers the blocked-attempt case), so discarding its now-unneeded custody with it is the natural terminal.

**Non-abandon cleanup still refuses on an open transaction.** When the operator is *not* discarding the work, resume-first stays mandatory — a retained blocked transaction's custody is reclaimed only by `resume`-to-completion (which restores, then sweeps) or by an explicit `--abandon`.

## Considered options

- **Sweep on every blocked return** (the reviewer's literal ask). Rejected as stated: correct for the `complete`-phase exit, but for a pre-`complete` blocked exit (canonical HEAD changed, integration pre-receipt) it destroys the backup `resume` still needs. The phase gate keeps the safe half.
- **Never sweep at block; reclaim only via abandon/resume.** Rejected: leaves the reviewer's `complete`-phase custody (already spent, safe to remove) sitting on disk until some later sweep runs — doesn't fully address the finding.
- **Sweep byte-backups at block but keep journal records for re-inventory.** Rejected: re-inventory is not exact byte restore — a precious file the failed verification mutated could not be recovered, quietly weakening `resume`'s guarantee for the pre-`complete` case.
- **Require resume-then-abandon.** Rejected: forces restoring precious state only to immediately throw the unit away.

## Consequences

- The custody-safety decision is keyed on transaction **phase**, not on "blocked vs not": `complete` ⇒ spent ⇒ sweepable; pre-`complete` ⇒ live ⇒ retain. A future change to *when* the transaction advances to `complete` relative to a blocked raise would move custody across this line, so that ordering is load-bearing.
- A pre-`complete` blocked transaction that is never resumed and never abandoned still retains custody — by design (recoverable until the operator decides). The leak is closed only when the operator resolves it (resume or `--abandon`).
- `--abandon` is the terminal that reclaims a *retained* (pre-`complete`) blocked transaction's custody without recovering it; it records the abandonment (existing `abandonment_receipt`) and sweeps.
- This is a custody-lifecycle contract deciding when precious backups may be destroyed — hard to reverse, and a future reader would otherwise re-litigate the "just sweep on block" ask (the reviewer already did). Recorded alongside [adr-verification-child-custody.md](adr-verification-child-custody.md).
