# Ledger

The ledger is how later runs grade what landed and avoid re-proposing what the user turned down. The bundled `scripts/retro-state.py` is its only writer. Run its subcommands with the same `SKILL_DIR` and interpreter lines `references/sessions-and-window.md` uses, and see `--help` for flags and input shape.

## Decision records

Record one decision per item with `record`, after its outcome is known. It reads one JSON object on stdin with `target`, `kind`, `state`, `session_ids`, `harness`, and either `signal` or `reason`:

| Outcome | `state` | Detail field |
|---|---|---|
| Applied and verified | `accepted` | `signal`: what a later run should see if it worked |
| Owner finished it | `accepted` | `signal`, naming the owner too |
| Sent to an owner that has not finished it | `routed` | `signal`: the owner and what it returned so far, such as a plan or draft path |
| Owner declined it | `routed-skipped` | `reason`: the owner and its reason |
| Approved, but the edit failed or was refused | `approved-not-applied` | `reason` |
| User rejected it | `rejected` | `reason`: the user's reason |

The key is the target path plus the kind of friction. When the item matched an earlier record in a different wording, use that earlier record's target and kind so the two stay one item.

Every record holds session ids, the harness, and paraphrase only. The helper refuses fields outside its schema, but it cannot tell paraphrase from quoted text, so write `signal` and `reason` in your own words.

## Run record

After an attended run over a wide scope with no topic focus finishes, write one run record with `record-run`, passing `{"cutoffs": {"<harness>": "<ISO time>"}}` on stdin. For each harness, the cutoff is the newest session time such that every in-scope session at or before it was read. A wide run reads only some of the sessions it found, so this can be older than the newest session read; a session left out stays eligible for the next run, which takes new candidates only from sessions after the cutoff. Leave out a harness this run could not read.

A run over a single session, or one focused on a topic, writes no run record, because it skipped the sessions around it. A run where no user could answer writes no records at all.
