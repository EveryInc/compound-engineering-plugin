# Live session loop

Load this once the riffer has accepted the consent screen. The loop is: park a wait, receive a checkpoint batch, acknowledge it, act on it per the mode it carries, post what happened, park again. It ends at the `final` checkpoint the overlay's Done control emits, or when the session ends without one, and closes with commits, a residual list, and the session log path.

## Wait

One helper invocation per wait; never poll the endpoint yourself.

```bash
SKILL_DIR="<absolute path of the directory containing the SKILL.md you just read>";
LIVE_ROOT="<absolute run directory from live-start>";
node "$SKILL_DIR/scripts/live-endpoint.js" wait --root "$LIVE_ROOT"
```

A wait is outstanding until the helper exits. A call the host backgrounds or yields is not a completed wait: re-enter or await it, and do not end the turn while a wait is parked and the session has not ended. Say nothing while a wait is parked; the riffer is in the browser, and the interviewer speaks for you there. Chat is valid only between waits.

Exit codes:

- **0** — one JSON envelope on stdout: `checkpoint_id`, `kind` (`silence`, `page_change`, `send`, `answer`, `mode_change`, `final`), `mode_at_checkpoint`, `session_status` (`live` or `page_lost`), `units[]`, `annotations[]`, `answers[]`. Handle it as below. `silence`, `page_change`, and `send` come from the page and always carry newly released units. `answer` and `mode_change` come from the endpoint, and `final` from the overlay's Done control; these three wake you even when nothing new was held, because what they carry (answers, or the accepted-but-unapplied backlog) is work you have not done. An empty-looking one of those is not a no-op.
- **1** — the session ended with nothing held. Close out (see "Session end") without a final batch.
- **2** — error. Run `status` once; if the helper is not running, run a bare `start --root "$LIVE_ROOT"` (add `--owner-pid` again only if the first start had one): that is a resume, which restores the stored tokens, board, app origin, bind host, and trusted proxies from the session file and prefers the old port. This is also the path when the root holds an ended session whose `final` batch was never acknowledged (`wait` exits 2 instead of 1 while such a batch is retained): the resume serves that batch so it can be drained. Compare the `url` it prints with the endpoint origin in the handoff. Identical: the riffer's page keeps working untouched. Different (something else took the old port): rebuild the handoff URL from `references/live-start.md` with the new endpoint origin and the unchanged page token, and tell the riffer to open it; their consent, board, and tokens carry over. Then pick up unfinished units per "Acknowledge first" and park again. A second consecutive error ends the run: report it with the helper's stderr and the log path, and stop the endpoint.
- **3** — `wait-taken`: another process already holds the wake for this session. Stop this run and say so. Do not stop the endpoint; the other process owns it.

## Acknowledge first

Immediately after parsing an exit-0 envelope, before any edit, acknowledge it: `POST /checkpoints/<checkpoint_id>/ack`. An unacknowledged batch is served again before any new one, including after a restart, so an ack is what prevents doing the same batch twice. One exception: the `final` batch is acknowledged last, not first (see "Session end"). A `session_status: "page_lost"` wake is a stored batch like any other (empty `units`, plus `lost_after_checkpoint_id`): acknowledge it, then go to "Page lost".

The ack does not make the units disappear. The endpoint's board is the durable record: every unit a checkpoint releases is already stored there at `triaging`, the ack only retires the redelivery copy, and each status you post moves the board. So if this run is interrupted between the ack and the last status of a batch, nothing is lost; it is visible. Whenever you start or resume a loop (after `start` on an existing root, after an exit-2 restart, and once more before close-out), run `status --root "$LIVE_ROOT"` and read `board.units.list`: every unit still at `triaging` is a batch you acknowledged and did not finish. Units at `accepted` depend on `board.mode` in the same output: while it is `collect` they are the backlog and wait for their `mode_change` or `final`; under `instant` or `smart` they are a `mode_change` batch you acknowledged and did not finish (the endpoint emits it once), so apply them now under that mode. Treat those units as the first batch of the resumed loop, under the current `mode`, before parking a wait. A unit you cannot place any more becomes `blocked` with the note "interrupted before apply" and goes on the residual list, never silently dropped.

Agent posts share one shape. The agent token must not appear in a process argument list (`ps` and `/proc` can read those), so write it once into a header file under `state/` that only this user can read, and let curl read the header from the file. Read `url` from `$LIVE_ROOT/state/session.json` into the call without printing it, and never send an `Origin` header (agent routes refuse requests that carry one):

```bash
LIVE_ROOT="<absolute run directory from live-start>";
SESSION="$LIVE_ROOT/state/session.json";
HEADERS="$LIVE_ROOT/state/agent-headers";
[ -f "$HEADERS" ] || (umask 077; node -e 'const fs=require("fs");const s=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));fs.writeFileSync(process.argv[2],"Authorization: Bearer "+s.agent_token+"\n",{mode:0o600})' "$SESSION" "$HEADERS");
URL="$(node -p 'JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).url' "$SESSION")";
curl -sS -X POST "$URL<route>" -H @"$HEADERS" -H "Content-Type: application/json" --data '<json>'
```

A resume keeps the same tokens, so the header file stays valid across restarts; `stop` retires the token it holds.

| Purpose | Route | Body |
|---|---|---|
| Acknowledge a batch | `/checkpoints/<checkpoint_id>/ack` | none (omit `--data`) |
| Set a unit's status | `/units/<unit_id>/status` | `{ "status": "accepted" \| "applied" \| "blocked", "note"?: "...", "guess"?: "..." }` |
| Ask the riffer about a unit | `/units/<unit_id>/ask` | `{ "question": "..." }` |

Every status you post shows on the riffer's board at once and the interviewer voices `applied` notices and questions at the riffer's next pause.

## Act on the batch

Only units in a batch are acted on; nothing is touched before its checkpoint, however visible it is on the board (`status` is read-only). Drop units that arrive with `status: "withdrawn"`; when one was applied from an earlier batch, revert that edit. `answers[]` carry the riffer's replies to earlier questions: resume each named unit with its answer as the clarification, then treat it like any other unit in this batch. A `kind: "answer"` batch carries answers only.

Triage each remaining unit by its statement, anchors, and evidence into one of three: a **clear bounded edit** (one surface, one intended change, the anchors name the element), **ambiguous** (more than one plausible reading of the element or the change), or **beyond polish** (a redesign, new behavior, or a change that spans more than the anchored surface). Then `mode_at_checkpoint` decides what each class gets:

| Class | Instant | Smart | Collect |
|---|---|---|---|
| Clear bounded edit | apply now, post `applied` | apply now, post `applied` | post `accepted`; hold |
| Ambiguous | apply the best reading now, post `applied` with `guess` stating the reading | post `ask` with one question; the unit waits in needs-info | post `ask`; hold the answer for the final pass |
| Beyond polish | post `blocked` with the reason; residual | post `blocked` with the reason; residual | post `blocked` with the reason; residual |

Under Instant, apply independent units in parallel when the harness can run work concurrently; serialize only units that touch the same file. Post `accepted` before starting an edit and `applied` once it has landed and hot reload has picked it up; a unit that cannot be applied after acceptance becomes `blocked` with a note. The endpoint tracks every unit you left at `accepted` without a later `applied` or `blocked` as the **backlog**; Collect is what fills it.

A mode switch takes effect at the next checkpoint and covers that backlog. When the riffer moves the switch off Collect, the endpoint emits a `kind: "mode_change"` batch at once with the backlog in `units[]` (those units were released earlier, so no later page checkpoint would carry them again): acknowledge it and apply every unit it carries under `mode_at_checkpoint`, exactly as if they had just been triaged as clear edits, posting `applied` or `blocked` for each. A batch stamped Collect holds anything not yet applied.

Edits land on the current feature branch on the surface the anchors name, uncommitted until the session closes. Resolve the anchors to a source file yourself and apply the containment rule from "Untrusted input" in `references/live-start.md` before touching it: the file must be a tracked regular file under the project root the detect script inspected, or the unit is `blocked`, not edited. A question is posted, not asked in chat: post `ask`, leave the unit in needs-info, and park the next wait right away; the answer arrives in a later batch.

After each batch, before parking again, one line in chat: what applied, what was asked, what went to residual. Nothing else.

## Page lost

`session_status: "page_lost"` means the page's stream did not come back within the grace window after an edit was applied. The session is not over and no archive downloaded; the riffer is looking at a broken or blank page. Before parking again, restore it: fix the crash when the cause is clear, otherwise revert the last applied edit and post `blocked` on that unit with the note that it broke the page. Confirm the app URL answers again, then park. Ordinary reloads and hot reloads do not produce this state.

## Session end

A `kind: "final"` batch means the riffer pressed the overlay's Done control, after confirming each unit's intended element and change. It carries the backlog plus anything newly held, and it arrives after the page has ended its side of the session. Your agent token stays valid only while this batch is unacknowledged: the endpoint retires it the moment the final batch is acked with nothing else held. So this batch reverses the usual order: do not ack it yet. Act on everything it carries per the mode (a Collect session applies its whole backlog now, as one pass; an Instant or Smart session applies whatever is left), post every `applied` or `blocked`, run `status` once to confirm nothing is left at `triaging` or `accepted`, and acknowledge it last. A wait after that exits 1. Only then close out. If the riffer reports that Done failed to store the archive (`archive_write_failed`), the session is still live and no `final` has reached you: free the disk under `$LIVE_ROOT` or fix the path, then ask them to press Done again. Exit 1 from a wait with no `final` batch (the riffer closed the page without Done) closes out the same way, with whatever was applied so far.

Close-out, in order:

1. Invoke `ce-commit` for the polish edits on the current branch. The setup commit from install, if any, is already there.
2. Write the residual list to `$LIVE_ROOT/residual.md`: every unit that ended `blocked`, still in needs-info, or beyond polish, each with its statement, anchors (route and element), status, and reason, so the riffer can hand the file to planning as is.
3. Stop the endpoint: `stop --root "$LIVE_ROOT"`. It invalidates the agent token (the page token ended with the session) and keeps `state/log/`, which holds the full-evidence session log the page posted at the end (transcript, units with the riffer's confirmations, annotations, frames, the evidence profile used). The helper's `replay` can re-emit that log to another endpoint under a different profile later.
4. Report: the commit(s), the still-running app URL, the residual list path, and the session log path `$LIVE_ROOT/state/log/`.

Nothing is pushed and no PR is opened; that stays with the riffer.
