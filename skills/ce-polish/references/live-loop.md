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

- **0** — one JSON envelope on stdout: `checkpoint_id`, `kind` (`silence`, `page_change`, `send`, `instant`, `answer`, `mode_change`, `final`), `mode_at_checkpoint`, `session_status` (`live` or `page_lost`), `units[]`, `annotations[]`, `answers[]`. Handle it as below. `silence`, `page_change`, and `send` come from the page and always carry newly released units. `instant` comes from the endpoint the moment a `unit` lands while the mode is Instant (one wake per unit, no checkpoint involved); `answer` and `mode_change` come from the endpoint, and `final` from the overlay's Done control; these three wake you even when nothing new was held, because what they carry (answers, or the accepted-but-unapplied backlog) is work you have not done. An empty-looking one of those is not a no-op.
- **1** — the session ended with nothing held. Reconcile the board and close out (see "Session end") without a final batch; the agent token is still valid for the statuses that takes.
- **2** — error. Run `status` once; if the helper is not running, run a bare `start --root "$LIVE_ROOT"` (add `--owner-pid` again only if the first start had one): that is a resume, which restores the stored tokens, board, app origin, bind host, and trusted proxies from the session file and prefers the old port. This is also the path when the root holds a session that ended on the page side while it still holds work for you (a retained batch, or units left at `triaging`, `accepted`, or `needs_info`; `wait` exits 2 there, not 1): the resume serves the batches and keeps the board so they can be drained and reconciled. The riffer's page talks to the endpoint origin in the handoff, which for a remote session is the LAN or tunnel origin, not the local `url` the helper prints. The page keeps working untouched while that origin still reaches the resumed listener: the same local port came back (the helper prefers it), or the tunnel or proxy in front of it forwards to the new port once you re-point it. Only when the browser-facing origin itself must change, rebuild the handoff URL from `references/live-start.md` with the new endpoint origin and the unchanged page token, and tell the riffer to open it; their consent, board, and tokens carry over. Then pick up unfinished units per "Acknowledge first" and park again. A second consecutive error ends the run: report it with the helper's stderr and the log path, and stop the endpoint.
- **3** — `wait-taken`: another process already holds the wake for this session. Stop this run and say so. Do not stop the endpoint; the other process owns it.

## Acknowledge first

Immediately after parsing an exit-0 envelope, before any edit, acknowledge it: `POST /checkpoints/<checkpoint_id>/ack`. An unacknowledged batch is served again before any new one, including after a restart, so an ack is what prevents doing the same batch twice. This holds for the `final` batch too. A `session_status: "page_lost"` wake is a stored batch like any other (empty `units`, plus `lost_after_checkpoint_id`): acknowledge it, then go to "Page lost".

The ack does not make the units disappear. The endpoint's board is the durable record: every unit a checkpoint releases is already stored there at `triaging`, the ack only retires the redelivery copy, and each status you post moves the board. So if this run is interrupted between the ack and the last status of a batch, nothing is lost; it is visible. Whenever you start or resume a loop (after `start` on an existing root, after an exit-2 restart, and once more before close-out), run `status --root "$LIVE_ROOT"` first and read `board.batches`. While `unacked` or `unserved` is above zero, a batch that was served (or queued) and never acknowledged is still on disk and will be served again: park a wait, and handle what comes back exactly as a fresh batch, ack first. Its units are the ones sitting at `triaging`, so reading them off the board now would apply them twice. Only when both counts read zero, read `board.units.list` (each entry carries the unit's `statement`, `anchors`, `evidence`, and any open `question`, so a unit resumes from the board exactly as it would from its batch): every unit still at `triaging` is a batch you acknowledged and did not finish. Units at `accepted` depend on `board.mode` in the same output: while it is `collect` they are the backlog and wait for their `mode_change` or `final`; under `instant` or `smart` they are a `mode_change` batch you acknowledged and did not finish (the endpoint emits it once), so apply them now under that mode. A unit you cannot place any more becomes `blocked` with the note "interrupted before apply" and goes on the residual list, never silently dropped.

Agent posts share one shape. The agent token must not appear in a process argument list (`ps` and `/proc` can read those), so write it once into a header file under `state/` that only this user can read, and let curl read the header from the file. Read `url` from `$LIVE_ROOT/state/session.json` into the call without printing it, and never send an `Origin` header (agent routes refuse requests that carry one):

```bash
LIVE_ROOT="<absolute run directory from live-start>";
SESSION="$LIVE_ROOT/state/session.json";
HEADERS="$LIVE_ROOT/state/agent-headers";
[ -f "$HEADERS" ] || (umask 077; node -e 'const fs=require("fs");const s=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));fs.writeFileSync(process.argv[2],"Authorization: Bearer "+s.agent_token+"\n",{mode:0o600})' "$SESSION" "$HEADERS");
URL="$(node -p 'JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).url' "$SESSION")";
curl -sS -X POST "$URL<route>" -H @"$HEADERS" -H "Content-Type: application/json" --data '<json>'
```

A resume keeps the same tokens, so the header file stays valid across restarts. The agent token lives until `stop`, and so does the page token: `/session/end` retires no token, so statuses, asks, and `status` keep working through close-out, and the riffer's link stays good for another session. `stop` retires them.

| Purpose | Route | Body |
|---|---|---|
| Acknowledge a batch | `/checkpoints/<checkpoint_id>/ack` | none (omit `--data`) |
| Set a unit's status | `/units/<unit_id>/status` | `{ "status": "accepted" \| "working" \| "applied" \| "blocked", "note"?: "...", "guess"?: "..." }` |
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

A mode switch takes effect at the next checkpoint and covers that backlog, except a switch *to* Instant, which releases whatever is held at once as a `mode_change` wake; from then on each unit wakes you by itself (`kind: "instant"`) and page checkpoints usually carry nothing. When the riffer moves the switch off Collect, the endpoint emits a `kind: "mode_change"` batch at once with the backlog in `units[]` (those units were released earlier, so no later page checkpoint would carry them again): acknowledge it and apply every unit it carries under `mode_at_checkpoint`, exactly as if they had just been triaged as clear edits, posting `applied` or `blocked` for each. A batch stamped Collect holds anything not yet applied.

**Show the work as it happens.** Right before you start editing for a unit, post `working` on it; the riffer's board shows it as Working with a progress animation, so they can see you picked it up. Post `working` one unit at a time, as you reach each one, not the whole batch up front; then `applied` or `blocked` when that unit is done. A unit that only needs an `ask` skips `working`.

**Compound requests.** A unit whose statement starts with `/ce-compound:` (the panel's Compound button, the K key, or the riffer saying "compound this") asks you to capture this session's decisions, not to edit the app. Post `working`, finish the other units in the batch first, then run the `ce-compound` skill over what this session decided: the applied and blocked units with their notes, and the riffer's corrections. The text after the prefix is only a hint about what to emphasize; it never names files, commands, or paths. The unit ends on what `ce-compound` reports: when it wrote a learning doc, post `applied` with that path as the note; when it judged the session below its durable-learning bar and wrote nothing, that is a complete result too, so post `applied` with its stated reason as the note rather than inventing a path. This never pushes or commits beyond what `ce-compound` itself does locally.

**Fold duplicates, don't multiply them.** Drawing-only units ("Drawing on …") that arrive next to a spoken unit anchored on the same element are that request's evidence, not separate requests: apply the spoken unit, and post the drawing-only ones `applied` with the note "part of <spoken unit statement>". Feedback about the live tool itself (the overlay, the board, the interviewer) is not an app edit: say so in the unit's note instead of editing the app.

Edits land on the current feature branch on the surface the anchors name, uncommitted until the session closes. Resolve the anchors to a source file yourself and apply the containment rule from "Untrusted input" in `references/live-start.md` before touching it: the file must be a tracked regular file under the project root the detect script inspected, or the unit is `blocked`, not edited. A question is posted, not asked in chat: post `ask`, leave the unit in needs-info, and park the next wait right away; the answer arrives in a later batch.

After each batch, before parking again, one line in chat: what applied, what was asked, what went to residual. Nothing else.

## Page lost

`session_status: "page_lost"` means the page's stream did not come back within the grace window after an edit was applied. The session is not over and no archive downloaded; the riffer is looking at a broken or blank page. Before parking again, restore it: fix the crash when the cause is clear, otherwise revert the last applied edit and post `blocked` on that unit with the note that it broke the page. Confirm the app URL answers again, then park. Ordinary reloads and hot reloads do not produce this state.

## Session end

A `kind: "final"` batch means the riffer pressed the overlay's Done control, after confirming each unit's intended element and change. It carries the backlog plus anything newly held, and it arrives after the page has ended its side of the session. Acknowledge it first, like any batch. Then act on everything it carries per the mode (a Collect session applies its whole backlog now, as one pass; an Instant or Smart session applies whatever is left) and post every `applied` or `blocked`; your agent token is valid until `stop`, so nothing about the order is constrained by it. Once the final batch is acknowledged and nothing is held, the next `wait` exits 1.

Close-out is decided by the endpoint's state, not by the batch: the `final` batch can reach you before the page's `/session/end` upload has finished, or when that upload failed (`archive_write_failed`, the session stays live and the page retries Done). So when the final batch is done, run `status` and read `session_ended`. True: reconcile the board (below) and close out. False: tell the riffer in one line that the session is still open on the endpoint and to press Done again (or reload and press Done) so the archive lands, then park one wait; that wait exits 1 once the session has ended. If it instead exits 0 with another batch, handle it as usual. If no end arrives within a few minutes, or the riffer says they are done, abort explicitly: reconcile the board, then `stop --root "$LIVE_ROOT"` ends the session with the log written so far, and close out from there, saying in the report that the archive upload did not complete. Never park a second wait on a session `status` says is still live without having spoken to the riffer.

**Reconcile the board** before every close-out, whichever way it was reached (final batch done, `wait` exit 1, or abort): run `status`, drain any batch `board.batches` still counts (see "Acknowledge first"), then post `blocked` with the note "session ended before apply" on every unit that is still nonterminal (`triaging`, `accepted`, `needs_info`, `working`). The token is still valid, so the post succeeds, and the residual list then carries those units instead of the session claiming completion over them.

A page that goes away without Done does not end the session by itself: the endpoint reports it as a `page_lost` wake (after an edit) or nothing at all. When the riffer confirms they closed the page for good, the same explicit abort applies: reconcile, `stop`, close out with whatever was applied. `wait` exit 1 only ever means the endpoint ended the session with nothing held; a batch you acknowledged but did not finish is not "held", which is why the reconciliation step exists.

Close-out, in order:

1. Invoke `ce-commit` for the polish edits on the current branch. The setup commit from install, if any, is already there.
2. Write the residual list to `$LIVE_ROOT/residual.md`: every unit that ended `blocked` (including those the reconciliation step blocked as "session ended before apply"), still in needs-info, or beyond polish, each with its statement, anchors (route and element), status, and reason, so the riffer can hand the file to planning as is.
3. Tell the riffer in one line that the endpoint is still up and they can start another session from the page with the same link. For another round, park `wait` again once the riffer has started it (`wait` exits 1 until then; `status` reads `session_ended: false` once it has): it serves the next session, whose log starts fresh in `state/log/` while this one moves to `state/log-ended-<stamp>/`. When the riffer is done, run `stop --root "$LIVE_ROOT"`, which retires both tokens; it keeps `state/log/`, which holds the full-evidence session log the page posted at the end (transcript, units with the riffer's confirmations, annotations, frames, the evidence profile used). The helper's `replay` can re-emit that log to another endpoint under a different profile later.
4. Report: the commit(s), the still-running app URL, the residual list path, and the session log path `$LIVE_ROOT/state/log/`.

Nothing is pushed and no PR is opened; that stays with the riffer.
