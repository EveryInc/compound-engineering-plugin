# Live session loop

Load this once the riffer has accepted the consent screen. The loop is: park a wait, receive a checkpoint batch, acknowledge it, act on it per the mode it carries, post what happened, park again. It ends at the `final` checkpoint or when the session ends, and closes with commits, a residual list, and the session log path.

## Wait

One helper invocation per wait; never poll the endpoint yourself.

```bash
LIVE_HELPER="<absolute path of live-endpoint.js in this skill's scripts directory>";
LIVE_ROOT="<absolute run directory from live-start>";
node "$LIVE_HELPER" wait --root "$LIVE_ROOT"
```

A wait is outstanding until the helper exits. A call the host backgrounds or yields is not a completed wait: re-enter or await it, and do not end the turn while a wait is parked and the session has not ended. Say nothing while a wait is parked; the riffer is in the browser, and the interviewer speaks for you there. Chat is valid only between waits.

Exit codes:

- **0** — one JSON envelope on stdout: `checkpoint_id`, `kind` (`silence`, `page_change`, `send`, `answer`, `final`), `mode_at_checkpoint`, `session_status` (`live` or `page_lost`), `units[]`, `annotations[]`, `answers[]`. Handle it as below.
- **1** — the session ended with nothing held. Close out (see "Session end") without a final batch.
- **2** — error. Run `status` once; if the helper is not running, `start` it again with the same `--root` (state resumes) and park again. A second consecutive error ends the run: report it with the helper's stderr and the log path, and stop the endpoint.
- **3** — `wait-taken`: another process already holds the wake for this session. Stop this run and say so. Do not stop the endpoint; the other process owns it.

## Acknowledge first

Immediately after parsing an exit-0 envelope, before any edit, acknowledge it: `POST /checkpoints/<checkpoint_id>/ack`. An unacknowledged batch is served again before any new one, including after a restart, so an ack is what prevents doing the same batch twice.

Agent posts share one shape. Read `agent_token` and `url` from `$LIVE_ROOT/state/session.json` into the call without printing them, and never send an `Origin` header (agent routes refuse requests that carry one):

```bash
LIVE_ROOT="<absolute run directory from live-start>";
SESSION="$LIVE_ROOT/state/session.json";
TOKEN="$(node -p 'JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).agent_token' "$SESSION")";
URL="$(node -p 'JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).url' "$SESSION")";
curl -sS -X POST "$URL<route>" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" --data '<json>'
```

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

Under Instant, apply independent units in parallel when the harness can run work concurrently; serialize only units that touch the same file. Post `accepted` before starting an edit and `applied` once it has landed and hot reload has picked it up; a unit that cannot be applied after acceptance becomes `blocked` with a note. A mode switch takes effect at the next checkpoint and covers every accepted-but-unapplied unit: a batch stamped Instant or Smart releases what Collect was holding, and a batch stamped Collect holds anything not yet applied.

Edits land on the current feature branch on the surface the anchors name, uncommitted until the session closes. A question is posted, not asked in chat: post `ask`, leave the unit in needs-info, and park the next wait right away; the answer arrives in a later batch.

After each batch, before parking again, one line in chat: what applied, what was asked, what went to residual. Nothing else.

## Page lost

`session_status: "page_lost"` means the page's stream did not come back within the grace window after an edit was applied. The session is not over and no archive downloaded; the riffer is looking at a broken or blank page. Before parking again, restore it: fix the crash when the cause is clear, otherwise revert the last applied edit and post `blocked` on that unit with the note that it broke the page. Confirm the app URL answers again, then park. Ordinary reloads and hot reloads do not produce this state.

## Session end

A `kind: "final"` batch means the riffer said done. Acknowledge it, act on it per the mode (a Collect session applies its whole accepted batch now, as one pass), and then close out. Exit 1 from a wait with no final batch (the riffer stopped from the page, or closed it) closes out the same way, with whatever was applied so far.

Close-out, in order:

1. Invoke `ce-commit` for the polish edits on the current branch. The setup commit from install, if any, is already there.
2. Write the residual list to `$LIVE_ROOT/residual.md`: every unit that ended `blocked`, still in needs-info, or beyond polish, each with its statement, anchors (route and element), status, and reason, so the riffer can hand the file to planning as is.
3. Stop the endpoint: `stop --root "$LIVE_ROOT"`. It invalidates both tokens and keeps `state/log/`, which holds the full-evidence session log the page posted at the end (transcript, units with the riffer's confirmations, annotations, frames, the evidence profile used). The helper's `replay` can re-emit that log to another endpoint under a different profile later.
4. Report: the commit(s), the still-running app URL, the residual list path, and the session log path `$LIVE_ROOT/state/log/`.

Nothing is pushed and no PR is opened; that stays with the riffer.
