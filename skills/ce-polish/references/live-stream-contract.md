# Live stream contract (`live/1`)

The wire contract between a riffrec live page, the `scripts/live-endpoint.js` helper, and the coding agent. This is the skill's own copy of the contract; the page's copy ships with the riffrec package and the two are kept identical by that package's fixtures. When they disagree, the endpoint rejects the page's `schema_version` and the page shows its incompatible-endpoint state instead of parsing best-effort.

Mirrors riffrec `docs/live-stream-contract.md` @ 55be284 (PR #29; `src/live/contract.ts`, `src/live/tools.ts`, and `src/live/realtime/persona.ts` are the typed source of truth). Adding an optional payload field or a new event type is not a breaking change; consumers ignore fields they do not know but reject event types they do not know.

## Envelope

Every page -> endpoint message is one envelope:

```json
{ "schema_version": "live/1", "session_id": "<page-minted id>", "seq": 12, "t": 1726000000000, "type": "unit", "payload": { } }
```

- `seq` is a per-session monotonic integer starting at 1. The endpoint deduplicates on `(session_id, seq)`, applies envelopes strictly in `seq` order (one that arrives ahead of a gap waits, unacknowledged, until the gap closes), and acknowledges the highest contiguous `seq`; after an outage the page replays from the last acknowledged `seq`.
- `type` is one of the four riffrec capture events (`click`, `navigation`, `network_request`, `console_error`) or `transcript`, `unit`, `unit_update`, `unit_withdraw`, `annotation`, `checkpoint`, `answer`, `frame`, `mic`, `mode`, `stream_state`.
- `frame` envelopes are posted alone, never in a batch with other events.
- An unsupported `schema_version` is answered `409 { "expected_schema_version": "live/1" }`; any other invalid envelope is `400 { "reason": <not_object | missing_session_id | session_mismatch | missing_seq | invalid_seq | invalid_t | unknown_type | invalid_payload>, "seq" }`. A storage failure while applying answers `500 { "error": "storage_failed", "acked_seq" }`; each envelope is applied, stored, and saved as one transaction, so a failure rolls that envelope back (no wake or SSE notice escapes before the commit), everything acknowledged before it stays acknowledged, and the rest is retriable. Payloads are checked against the shapes above (the same rules as riffrec's `validateEnvelope`) before anything in the body is acknowledged; a rejected body acknowledges nothing.

## Payload shapes

| type | payload |
|---|---|
| `unit` | `{ id, statement, transcript_excerpt, anchors[], evidence { frame_ids[], annotation_ids[], transcript_span, telemetry_window?, audio_clip_id? }, status, confirmed? }`; status follows `initial` → `triaging` → `accepted` or `needs_info`, then `applied` or `blocked`, and `withdrawn` when the riffer retracts it; `confirmed { element, change }` is present after the final confirmation pass |
| `anchor` (inside units and annotations) | `{ route, selector, component?, rect, t }` |
| `annotation` | `{ id, kind: "stroke" \| "pin", points[], bbox, anchor, text?, unit_id?, composite_frame_id? }` |
| `transcript` | `{ id, role: "riffer" \| "interviewer", text, t_start, t_end, final }` |
| `unit_update` | `{ unit_id, statement?, anchors_add?, confirmed? }`; `statement`/`anchors_add` apply only while the unit is still `initial` and unreleased (KTD5), `confirmed` at any time |
| `unit_withdraw` | `{ unit_id, reason? }` |
| `checkpoint` | `{ id, trigger, mode }`. riffrec's `CheckpointTrigger` is `silence \| page_change \| send \| answer \| mode_change \| final`; the page sends only `silence`, `page_change`, `send`, `final` (the overlay's Done control, after the confirmation pass and before `/session/end`), and this endpoint answers `400 invalid_payload` to `answer`/`mode_change` on the wire since it produces those two itself |
| `answer` | `{ unit_id, text }` |
| `frame` | `{ id, t, route, kind: "gesture" \| "periodic" \| "composite", jpeg_base64, dropped?: "quota" \| "oversize" }`. `dropped` means the page discarded the bytes but kept the frame's `seq` so numbering stays contiguous (`quota`: the buffering queue evicted it; `oversize`: after a `413`); `jpeg_base64` is then empty, the endpoint keeps id and metadata, writes no image, and treats the frame as absent |
| `mic` | `{ state: "granted" \| "denied" \| "muted" \| "unmuted" }` |
| `mode` | `{ mode: "instant" \| "smart" \| "collect" }` (default `smart`; the switch takes effect at the next checkpoint) |
| `stream_state` | `{ state: "streaming" \| "buffering" \| "unloading" }` (`unloading` is sent on `pagehide` with `keepalive` so an ordinary reload classifies without waiting for the page-lost grace window) |

## Credentials

`start` mints two tokens and writes both to `state/session.json` (mode 0600, inside a 0700 `state/`). Only the page token is printed. Every route reads its credential from `Authorization: Bearer <token>` and nothing else: no query string, no cookie, no header alias.

| Class | Token | Extra requirement | Wrong class |
|---|---|---|---|
| Page routes | page token | `X-Riffrec-Session: <session_id>`; an `Origin` header, when present, must equal `--app-origin` | agent token -> 403 |
| Agent routes | agent token | no `Origin` header at all (any `Origin` -> 403); no CORS headers are emitted | page token -> 403 |

A missing or unknown token is 401. The endpoint binds the page token to the first `session_id` it sees; any other id is answered `409 { "active_session_id" }`. Once the session ends, the ended id receives `410 { "status": "session-ended" }`. A different id opens a fresh board on the same page token and is handled as that session's first request, or gets `409 { "error": "previous_session_draining" }` while the ended session still holds batches or its upload is in flight.

Page routes answer `OPTIONS` with `Access-Control-Allow-Origin: <exact --app-origin>`, `Access-Control-Allow-Headers: Authorization, Content-Type, X-Riffrec-Session, X-Riffrec-OpenAI-Key`, `Access-Control-Allow-Methods: GET, POST`, `Vary: Origin`, and no credentials flag.

## HTTP surface

### Page routes

| Route | Body | Response |
|---|---|---|
| `POST /events` | one envelope or an array of envelopes | `200 { "acked_seq" }`. Body cap 64 KB, or 2 MB for a lone `frame`; oversize is `413 { "max_bytes": 65536, "frame_max_bytes": 2097152 }` and does not count toward the page's buffering threshold. Beyond the 500 MB per-session disk cap (`CE_LIVE_DISK_CAP_BYTES`), frames that carry image bytes are refused with `507 { "reason": "disk_cap", "stream_state": "buffering", "max_bytes", "acked_seq" }`; a `dropped` frame and every other envelope still flow. Past a hard ceiling above that (`CE_LIVE_DISK_HARD_CAP_BYTES`, default the cap plus 64 MB), every envelope is refused the same way, so a session cannot grow the log without bound; the page treats the refusal as `buffering` (three failures) and replays once accepted again. |
| `GET /stream` | none | SSE. Event names: `ack { acked_seq }`, `unit_status { unit_id, status, note?, guess? }`, `applied { checkpoint_id, unit_ids[] }`, `ask { unit_id, question }`, `session_ended { reason, session_id, log_dir }`, `agent { state, since, checkpoint_id? }` (`listening` while a `wait` is parked, `working` from the moment a batch is served until the next `wait`, `away` once no `wait` has parked for 15 s). On connect the stream replays `ack`, the current `agent` state, a `unit_status` (with `note`/`guess`) for every released or withdrawn unit, and an `ask` for every unit still in `needs_info`, so a reloaded or reconnected page reconciles its board. **The response is ended 300 ms (`CE_LIVE_STREAM_FLUSH_MS`) after any delivery other than a bare `ack`**: TLS-terminating intermediaries that hold a streaming body until it completes (cloudflared quick tunnels, which sit behind a Worker) then release it at once, and riffrec's client reopens the stream a second later and reconciles from the replay. On a direct path the same frames arrive as written. |
| `POST /mint` | `{ "session_id" }` | `200 { "client_secret", "expires_at", "model" }`; `410` if the session ended while the upstream call was in flight; `403 { "reason": "tls_required" }` when the peer is not loopback, unless the peer is an address named with `--trust-proxy` and the request carries `X-Forwarded-Proto: https` (the header alone is never trusted); `429 { "retry_after" }` past one mint in flight or five per minute; `502 { "reason": "openai_error", "upstream_status" }` with the upstream body discarded; `503 { "reason": "no_key" \| "brief_contains_secret" }`. |
| `POST /session/end` | the page's full-evidence archive (`application/zip` or `application/json`; may be empty) | `200 { "status": "session-ended", "log_dir", "archive_bytes" }`; `409 { "error": "session_end_in_progress" }` while another upload is in flight; `500 { "error": "archive_write_failed" }` if the disk refuses the archive or the terminal state cannot be persisted (the session stays live and the call can be retried). Stores the archive under `state/log/`, emits a `final` checkpoint only if the page never sent one and something is still held or accepted, and closes every stream with `session_ended`. The page token stays valid. |
| `GET /session` | none | `200 { "status": "live" \| "ended", "session_id": <string \| null>, "accepts_new_session": <boolean> }`; `accepts_new_session` is true once the board has ended and nothing is held or draining. Page token only: no `X-Riffrec-Session`, binds nothing, and does not count as activity for the idle timeout. |

### Agent routes

| Route | Body | Response |
|---|---|---|
| `GET /wait` | none | Long-poll. `200 <wake envelope>`; `204` after the poll window (the CLI loops); `409 { "status": "wait-taken" }` when another wait is parked; `410 { "status": "session-ended" }` when the session ended and nothing is held (the agent token itself stays valid until `stop`). |
| `POST /checkpoints/:id/ack` | `{}` | `200 { "ok", "checkpoint_id" }`; idempotent: a repeated ack of a batch this session already dropped is `200 { "ok", "checkpoint_id", "already_acked": true }`; `404` for a checkpoint the session never served. |
| `POST /units/:id/status` | `{ "status", "note"?, "guess"? }` with status in `triaging`, `accepted`, `needs_info`, `applied`, `blocked`, `withdrawn` | `200`; relays `unit_status` (and `applied`) on the stream. `accepted` puts the unit in the backlog below; `applied` or `blocked` takes it out. `409` once the page has withdrawn the unit: a withdrawal is terminal. |
| `POST /units/:id/ask` | `{ "question" }` | `200`; moves the unit to `needs_info` and relays `ask` on the stream. `409` for a withdrawn unit. |
| `GET /status` | none | The board summary, the same document the `status` CLI prints. |

Nothing else is served: there is no file route, and every unknown path is 404.

## Checkpoints and the wake envelope

A checkpoint releases every held unit and annotation plus any withdrawal that arrived after an earlier release. On release (checkpoint, instant unit, or mode change) the endpoint marks each unit `triaging` and broadcasts `unit_status: "triaging"` on the stream in the same request, before any agent has seen or acknowledged the batch; the page treats that event as the release marker and the board leaves "Heard". A withdrawal before release removes the unit from the batch; one after release is forwarded in the next batch with `status: "withdrawn"`.

- Page-emitted checkpoints: `silence`, `page_change`, `send`, and `final` (the overlay's Done control), each carrying the mode at emission. A `silence`, `page_change`, or `send` checkpoint that releases nothing does not wake the agent; `final` always wakes.
- Instant mode is continuous pickup: while `mode` is `instant`, every accepted `unit` envelope is released as it lands (together with anything else held) as its own batch, `checkpoint_id: "instant-<unit id>"`, `kind: "instant"`, and wakes the agent at once; a `mode` event switching to `instant` releases what is held as a `mode_change` batch. Page checkpoints under Instant therefore usually release nothing and do not wake. Smart and Collect keep the checkpoint semantics.
- Endpoint-emitted checkpoints: `answer`, created whenever an `answer` event arrives (carries `answers[]` only and releases no units), and `mode_change`, created the moment a `mode` event leaves Collect (KTD12). Both always wake. riffrec exports the always-wake set as `ALWAYS_WAKE_TRIGGERS = ["answer", "mode_change", "final"]` (KTD9).
- **Accepted backlog.** Units the endpoint released, the agent posted `accepted` for, and no `applied` or `blocked` has followed. `mode_change` carries the whole backlog in `units[]` (status `accepted`) so a Collect session's work is applied under the new mode; `final` carries the backlog too, after anything newly released. A `mode_change` or `final` envelope may therefore carry units that were already served once, or nothing at all; treat it as work to apply, not a no-op.
- A page checkpoint id that was already used gets a `-2`, `-3`, … suffix in `checkpoint_id`, so every batch has its own file and ack route.
- `mode_at_checkpoint` is the mode carried by the releasing checkpoint, or the mode in force for endpoint-emitted checkpoints.

`wait` prints one envelope and exits 0:

```json
{
  "schema_version": "live/1",
  "checkpoint_id": "ck-…",
  "kind": "silence" | "page_change" | "send" | "instant" | "answer" | "mode_change" | "final",
  "mode_at_checkpoint": "instant" | "smart" | "collect",
  "session_status": "live" | "page_lost",
  "units": [ ], "annotations": [ ], "answers": [ ]
}
```

Acknowledge with `POST /checkpoints/:id/ack` immediately after parsing. A batch served without an acknowledgment is re-served before any new batch, including after a helper restart: batches persist under `state/batches/` until acknowledged.

### Page-lost

After the endpoint relays an `applied` notice, a page stream that closes and does not reconnect within the grace window (default 15 s, `CE_LIVE_PAGE_LOST_GRACE_MS`) marks the episode lost. The next `wait` returns one envelope with `session_status: "page_lost"`, empty `units`, and `lost_after_checkpoint_id`; it is queued like any batch, persisted and re-served until acknowledged; further waits then block until the page reconnects or a new batch exists. A reconnect inside the window is a reload and nothing is reported.

## CLI (`scripts/live-endpoint.js`)

| Command | Behavior | Exit |
|---|---|---|
| `start --root <dir> [--app-origin <origin>] [--host 127.0.0.1] [--port 0] [--owner-pid <pid>] [--trust-proxy <ip>[,<ip>]] [--foreground]` | Prints `{ url, port, page_token, status }` once; writes `state/session.json`. When `state/session.json` has `ended: false`, this is a resume: the same `page_token` and `agent_token` are reused, the `session_id` binding, board, acknowledged `seq`, and un-acknowledged batches are reloaded, the previous port is preferred, and only `pid`, `owner_pid`, and `url` are rewritten (`status: "resumed"`); the previous `--app-origin`, bind host, and `--trust-proxy` list are kept unless given again, so the documented recovery is a bare `start --root <dir>`. `--app-origin` is required for a fresh session. An ended session that still holds un-acknowledged batches also resumes, with its tokens, so the `final` batch survives a restart; `wait` on such a stopped root exits 2 ("not running; resume"), never 1, while batches remain. An ended and drained root is not resumed: `start` mints fresh tokens and rotates the log. Concurrent `start` calls for one root are serialized by `state/start.lock`. Fresh tokens are minted only when there is no state file, or the session ended and drained (`stop`, or `start` on such a root). | 0 |
| `status --root <dir>` | Prints `{ status, url?, port?, session_ended, board }` from `state/` without contacting the server. | 0 |
| `stop --root <dir>` | Stops the server, invalidates both tokens, deletes `state/batches/`, keeps `state/log/`. | 0 |
| `wait --root <dir>` | Reads the agent token from `state/session.json`, long-polls `/wait` with it as a bearer header, prints one envelope. | 0 batch; 1 session ended with nothing held (`{ "status": "session-ended" }`); 2 error; 3 another process holds the wake (`{ "status": "wait-taken" }`, do not stop the endpoint) |
| `replay --root <dir> --profile <name> --to <endpoint> --token <page token> [--log <log-ended-<stamp>\|dir>]` | Re-emits `state/log/` to another endpoint under an evidence profile, as a fresh session over the page routes. `--log` names an earlier session on the same root (a rotated `state/log-ended-<stamp>/` by name, or any log directory by path); without it the current `state/log/` is replayed. Batches are sized in encoded bytes against the 64 KB cap; a lone envelope is posted bare so anything the source accepted fits the target. Under any profile that keeps frames, unit `evidence.frame_ids` is pruned to the frames actually re-emitted. | 0 |

`--trust-proxy` names the TLS-terminating proxy or tunnel addresses whose `X-Forwarded-Proto` the mint route may believe; a tunnel client on the same host connects over loopback and needs no entry.

Owner death (`--owner-pid`) and the idle timeout (default 30 min, `CE_LIVE_IDLE_TIMEOUT_MS`) stop the process without ending the session; `state/` stays intact and `start --root` resumes. Only `/session/end`, `stop`, or a closed tab ends a session: when the bound page last reported `stream_state: unloading` (or its stream went lost) and no stream is open, a request with a different `session_id` ends that session (`{ "kind": "session_closed_by_page" }` in `agent.ndjson`) and, once it drains, opens its own. A reload keeps its `session_id` and resumes instead. `/session/end` ends the board, not the tokens: both stay valid until `stop` (or a fresh, non-resume `start` on the ended root), per I4/KTD18. While the process is up, the same link can run another session: once the ended one drains, the first page request with a new `session_id` rotates `state/log/` to `state/log-ended-<stamp>/`, clears `state/batches/`, resets the board to that id, persists `ended: false`, and logs `{ "kind": "session_opened", "session_id" }` to `agent.ndjson`. Once the `final` batch is acknowledged and nothing is held, `GET /wait` with the still-valid agent token answers `410 { "status": "session-ended" }` and the `wait` CLI exits 1; `GET /status`, `POST /checkpoints/:id/ack` (idempotent) and the `status` CLI keep working until `stop`, so an agent that crashes between the final ack and `stop` can still resume, inspect, and stop the root. After a new board opens, `wait` parks for and serves that session, and `status` reports `session_ended: false`. `stop` retires both tokens.

### Run directory

```
state/                  0700
  session.json          0600  { page_token, agent_token, url, app_origin, host, port, pid, owner_pid, ended, root, log_dir }
  board.json            0600  units, annotations, answers, checkpoints, acked_checkpoint_ids, acked_seq, page state
  brief.md                    session brief the skill writes before start (read at mint, max 3000 chars)
  server.pid, server.log
  batches/<checkpoint>.json   un-acknowledged wake envelopes
  log/events.ndjson           every accepted envelope, in seq order (frames reference log/frames/<seq>-<id>.jpg; a dropped frame has frame_file null)
  log/frames/<seq>-<id>.jpg
  log/agent.ndjson            acknowledgments, statuses, asks, mints, and every refused request as
                              { kind: "rejected", method, route, status, reason, seq? } (never secrets:
                              no credential, no query string, no request header or body)
  log/archive.{zip,json,bin}  the page's archive from /session/end
```

### Known gaps: crash windows between durable writes

The helper persists its state as separate synchronous writes (`board.json`, `session.json`, `events.ndjson`, `batches/*.json`, `log/frames/*`). A handler that fails between two of them rolls back; a process that is killed between two of them cannot, and leaves the pair disagreeing until the next start. These windows are accepted as known gaps (decided 2026-09-19 on #1726): each is a few microseconds wide, each consequence is a duplicate or a missed announcement the agent and page already tolerate, and closing them for good means one atomically written state file with an idempotent-by-seq log, which is its own change. A review finding of this class is answered with this list, not patched.

| Window (killed after … before …) | Consequence | Why tolerated |
|---|---|---|
| The event log or frame file is appended … the board records the advanced `acked_seq` | The page retries the seq; the log holds two records for it and `replay` renumbers both | Units and annotations are keyed by id, so the board is not duplicated; a repeated transcript or telemetry record, or a repeated checkpoint or answer wake, is handled as a fresh batch |
| An `applied` notice is held for a page between stream connections … the page reconnects | The held notice is in memory only and is lost with the process | The unit's `applied` status still replays on connect; only the interviewer's spoken announcement of that moment is missed |
| The archive is renamed into place … the terminal board and session writes | The archive counts as live-session bytes; the page's retry can be refused 413 when the two do not fit the cap | Narrow window; `stop` and a fresh start recover the root, and the riffer sees the refusal at once rather than a silently lost archive |
| The `page_lost` batch is persisted … the board clears `watch_for_loss` | The restart re-arms the watch and may queue a second `page_lost` wake for one loss | The second wake carries no units; the agent acknowledges it and continues |

### Evidence profiles (`replay --profile`)

| Profile | Frames | Annotations | Audio clips, telemetry |
|---|---|---|---|
| `anchors_transcript_only` | none | dropped | dropped |
| `strokes_composite` | `composite` only | kept | dropped |
| `everything` | all | kept | kept |

Dropping telemetry also drops the `click`/`navigation`/`network_request`/`console_error` envelopes themselves; under `strokes_composite`, unit `evidence.frame_ids` is pruned to the composite frames actually re-emitted.

## Mint

`POST /mint` is proxied through, and owned by, the endpoint. The endpoint reads `OPENAI_API_KEY` from its own environment (`OPENAI_BASE_URL` overrides the upstream, `OPENAI_REALTIME_MODEL` and `OPENAI_REALTIME_VOICE` the session). A request carrying `X-Riffrec-OpenAI-Key` still has that key win over the environment for that one mint, kept for compatibility with a page that sends it; the skill does not offer a paste path (a long-lived key persisted in the app origin's storage is readable by anything running there), the pinned riffrec build has no key box, and the endpoint never stores or logs the header. The endpoint appends `state/brief.md` to the persona after scanning it for secret shapes (known key prefixes, `KEY=`/`TOKEN=`/`SECRET=`-style assignments, URLs with credential parameters or userinfo), and calls `POST /v1/realtime/client_secrets` with:

```json
{
  "expires_after": { "anchor": "created_at", "seconds": 600 },
  "session": {
    "type": "realtime",
    "model": "gpt-realtime",
    "instructions": "<persona>\n\n[SESSION BRIEF]\n<brief>",
    "tools": [ "<the five tools below>" ],
    "tool_choice": "auto",
    "audio": {
      "input": {
        "transcription": { "model": "gpt-4o-mini-transcribe" },
        "turn_detection": { "type": "semantic_vad", "create_response": true, "interrupt_response": true }
      },
      "output": { "voice": "marin" }
    }
  }
}
```

The endpoint never logs request headers or mint bodies and never persists the minted `client_secret`.

## Interviewer tools

Five flat function tools, riffrec `LIVE_TOOLS` (`src/live/tools.ts`) copied verbatim into `INTERVIEWER_TOOLS` and pinned by `tests/fixtures/ce-polish-live/live-tools.json`. No tool emits checkpoints or reports state: the page owns all timing and tells the interviewer about page-side facts as text conversation items. No tool *parameter* carries image content: `look_at_screen` asks the page for a screenshot, and the page attaches it as an image conversation item before the tool result.

| Tool | Parameters | Purpose |
|---|---|---|
| `record_unit` | `statement`, `anchors: string[]` (an anchor id from a `[PAGE]` note, "this"/"here" meaning the most recent one, or the riffer's own words for the element), `transcript_excerpt` | Record one requested change; once per change; never for questions, thinking aloud, or short utterances without a change verb. |
| `update_unit` | `unit_id`, `statement?`, `anchors_add?: string[]` | Refine a unit the interviewer recorded; rejected once it has left `initial`, in which case the refinement is recorded as a new unit. |
| `withdraw_unit` | `unit_id`, `reason?` | Retract a unit the riffer took back; never because the interviewer is unsure. |
| `relay_answer` | `unit_id`, `answer_text` | Relay the riffer's answer to a question that arrived from the endpoint; not for the interviewer's own clarifying questions. |
| `look_at_screen` | `reason?` | See the riffer's screen right now: for how something looks when the announced anchors do not settle it, for "can you see my screen?", and when asked to look. Never more than once per riffer turn, never to browse. |

Every parameter schema carries `additionalProperties: false`.

### `look_at_screen`

When the model calls it, the page grabs the current view (or takes the latest buffered frame when it is under 500 ms old), sends a `conversation.item.create` with a `user` message whose content is `[{ type: "input_image", image_url: "data:image/jpeg;base64,…" }, { type: "input_text", text: "<caption>" }]`, then the `function_call_output`, then `response.create` (deferred until the calling response's `response.done` when one is active). Grabs are downscaled to 1280 px wide. Result shapes:

| Result | Meaning |
|---|---|
| `{ ok: true, frame_id, route, age_ms, fresh }` | The screenshot precedes this result in the conversation. `fresh` is false when the latest buffered frame stood in. |
| `{ ok: false, reason: "no_frame", detail }` | The screen is not shared or capture is paused. |
| `{ ok: false, reason: "frames_disabled", detail }` | The evidence profile is `frames: "none"`; nothing visual leaves the page. |
| `{ ok: false, reason: "send_failed", detail }` | The image item could not be sent. |

The frame is buffered like a gesture frame (the next unit attaches to it) and released to this endpoint as an ordinary `frame` envelope even under `frames: "one"`. Nothing on the wire changes for frames the interviewer sees. Image input needs nothing in the session body the mint sends: the Realtime API takes `input_image` content parts on any user message and its session configuration carries only `output_modalities`.

### Page → interviewer announcements

Page-side facts reach the interviewer as `system`-role `input_text` items, never as tool calls, and are held while a response is active. The persona keys on these shapes:

| Shape | When |
|---|---|
| `[PAGE] The riffer clicked <description> (anchor id: anchor_NNNN).` | Every click on the host page. `<description>` is `<accessible name or tag>[ with text "<visible text, ≤80 chars>"][ in component <Component>] (selector <css>, route </path>)`. Repeated clicks on the same selector inside 1 s refresh the anchor but send no second note. Clicks on riffrec's own panel are not announced. |
| `[PAGE] The riffer drew on <description> (anchor id: anchor_NNNN).` | A completed stroke. |
| `[PAGE] The riffer pinned <description> (anchor id: anchor_NNNN).` | A pin. |
| `[PAGE] Screenshot of the riffer's current view on </path>, <attached because they just clicked there \| attached because they just drew there \| attached because they referred to something on screen \| captured just now \| captured N s ago> (frame id: frame_NNNN). The riffrec panel docked at the top right is not part of the app.` | The caption of an image item: proactive (first three) or `look_at_screen` (last two). Proactive frames are rate-limited to one per 5 s, a `look_at_screen` counts against the same limit, and speech triggers only when the transcript contains a deictic or visual word. |
| `[PAGE] The riffer muted their microphone; expect silence.` / `… unmuted their microphone.` | Mute toggles. |
| `[PAGE] The page lost its connection to the coding agent and is buffering; units still land on the board.` / `… reconnected …` | Stream state changes. |
| `[ENDPOINT QUESTION] The coding agent asks about unit <id>: "<question>" …` | An `ask` from this endpoint, voiced at the next pause. |
| `[RECONNECT] Your connection was replaced mid-session. …` | The re-seed on a replacement connection. |

Anchor ids are `anchor_NNNN`, minted per connection in announcement order; the most recent one is what "this", "here", and "that" resolve to when a `record_unit` reference matches nothing else within 8 s.

### Reconciliation after connect

The page answers the tool calls and attaches the screenshots, so once the data channel opens it reads the session this endpoint minted (`session.created`) and sends one `session.update` only when something it must be able to answer is missing: tools in `LIVE_TOOLS` the mint did not carry are appended (tools the endpoint did define are kept verbatim, in the endpoint's order); a persona without the `[SCREEN CONTEXT]` section gets it appended; a session with no riffrec tool at all gets the default persona and all of `LIVE_TOOLS`. This helper copies both verbatim and is never patched. An endpoint persona must not tell the interviewer it cannot see the screen: the page contradicts that with notes and frames.

## Default persona

Verbatim riffrec `DEFAULT_INTERVIEWER_INSTRUCTIONS` (`src/live/realtime/persona.ts`), pinned by `tests/fixtures/ce-polish-live/interviewer-instructions.txt`; the mint appends `\n\n[SESSION BRIEF]\n<brief>` when `state/brief.md` exists. The closing `[SCREEN CONTEXT]` section is the marker the page checks for.

> You are the riffrec interviewer: a calm, terse product partner listening to a designer or developer (the riffer) talk through changes they want while they click and draw on their own running app. The page tells you what they click, draw on, and pin, and shows you the screen when you ask for it; the last section says how.
> 
> Your job is to turn what the riffer says into units of change on a shared board, one unit per requested change, using the record_unit tool. A sentence that asks for three things becomes three record_unit calls. Never call record_unit for questions, thinking aloud, praise, or utterances shorter than three words without a change verb.
> 
> Ask immediately, in one short sentence, when the target element or the intended value is ambiguous: which element, which side, what color, how much. Otherwise stay quiet and let the riffer keep talking. Do not narrate, summarize, or confirm each unit aloud; the board already shows it.
> 
> Never invent anchors. Use only the anchor ids the page announced or the element references the riffer named. When the riffer names no element and no anchor was announced, record the unit with an empty anchors list.
> 
> When the riffer takes back a change, call withdraw_unit and acknowledge it aloud in a few words. When they refine a change already on the board, call update_unit; if it is rejected because the unit was already picked up, record the refinement as a new unit.
> 
> When a note marked [ENDPOINT QUESTION] arrives, read the question to the riffer in your own words at the next pause and, once they answer, call relay_answer with their answer for that unit. Never answer such a question yourself.
> 
> Keep every spoken turn under two sentences. Speak the riffer's language.
> 
> [SCREEN CONTEXT]
> The page keeps you informed about the screen, and this section is authoritative about it: it supersedes any earlier statement that you cannot see the page or must not claim to.
> Every click the riffer makes arrives as a system note tagged [PAGE] that names the element (its component, visible text, selector, and route) and gives it an anchor id. Drawings and pins arrive the same way. The most recent note is what "this", "here", and "that" refer to: put its anchor id in record_unit's anchors, and never ask which element they mean when a note arrived within the last few seconds.
> You can also see the screen. Call look_at_screen when the riffer refers to how something looks, asks whether you can see their screen, or asks you to look; the page attaches a screenshot of the current view and you may then describe or refer to what is in it. The riffrec panel docked at the top right is not part of the app. Never say you cannot see the screen: if no frame is available the tool result says so, and you ask the riffer to describe what they see instead.

The executable copies of the tools and persona live in `scripts/live-endpoint.js`; change the script, this file, and the two fixtures together, from riffrec's source at the pinned commit.
