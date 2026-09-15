# Live stream contract (`live/1`)

The wire contract between a riffrec live page, the `scripts/live-endpoint.js` helper, and the coding agent. This is the skill's own copy of the contract; the page's copy ships with the riffrec package and the two are kept identical by that package's fixtures. When they disagree, the endpoint rejects the page's `schema_version` and the page shows its incompatible-endpoint state instead of parsing best-effort.

## Envelope

Every page -> endpoint message is one envelope:

```json
{ "schema_version": "live/1", "session_id": "<page-minted id>", "seq": 12, "t": 1726000000000, "type": "unit", "payload": { } }
```

- `seq` is a per-session monotonic integer starting at 1. The endpoint deduplicates on `(session_id, seq)`, applies envelopes strictly in `seq` order (one that arrives ahead of a gap waits, unacknowledged, until the gap closes), and acknowledges the highest contiguous `seq`; after an outage the page replays from the last acknowledged `seq`.
- `type` is one of the four riffrec capture events (`click`, `navigation`, `network_request`, `console_error`) or `transcript`, `unit`, `unit_update`, `unit_withdraw`, `annotation`, `checkpoint`, `answer`, `frame`, `mic`, `mode`, `stream_state`.
- `frame` envelopes are posted alone, never in a batch with other events.
- An unsupported `schema_version` is answered `409 { "expected_schema_version": "live/1" }`; any other invalid envelope is `400 { "reason": <not_object | missing_session_id | session_mismatch | missing_seq | invalid_seq | invalid_t | unknown_type | invalid_payload>, "seq" }`. Payloads are checked against the shapes above (the same rules as riffrec's `validateEnvelope`) before anything in the body is acknowledged; a rejected body acknowledges nothing.

## Payload shapes

| type | payload |
|---|---|
| `unit` | `{ id, statement, transcript_excerpt, anchors[], evidence { frame_ids[], annotation_ids[], transcript_span, telemetry_window?, audio_clip_id? }, status, confirmed? }` |
| `anchor` (inside units and annotations) | `{ route, selector, component?, rect, t }` |
| `annotation` | `{ id, kind: "stroke" \| "pin", points[], bbox, anchor, text?, unit_id?, composite_frame_id? }` |
| `transcript` | `{ id, role: "riffer" \| "interviewer", text, t_start, t_end, final }` |
| `unit_update` | `{ unit_id, statement?, anchors_add?, confirmed? }` |
| `unit_withdraw` | `{ unit_id, reason? }` |
| `checkpoint` | `{ id, trigger: "silence" \| "page_change" \| "send" \| "final", mode }` (`final` comes from the overlay's Done control) |
| `answer` | `{ unit_id, text }` |
| `frame` | `{ id, t, route, kind: "gesture" \| "periodic" \| "composite", jpeg_base64 }` |
| `mic` | `{ state: "granted" \| "denied" \| "muted" \| "unmuted" }` |
| `mode` | `{ mode: "instant" \| "smart" \| "collect" }` |
| `stream_state` | `{ state: "streaming" \| "buffering" \| "unloading" }` |

## Credentials

`start` mints two tokens and writes both to `state/session.json` (mode 0600, inside a 0700 `state/`). Only the page token is printed. Every route reads its credential from `Authorization: Bearer <token>` and nothing else: no query string, no cookie, no header alias.

| Class | Token | Extra requirement | Wrong class |
|---|---|---|---|
| Page routes | page token | `X-Riffrec-Session: <session_id>`; an `Origin` header, when present, must equal `--app-origin` | agent token -> 403 |
| Agent routes | agent token | no `Origin` header at all (any `Origin` -> 403); no CORS headers are emitted | page token -> 403 |

A missing or unknown token is 401. The endpoint binds the page token to the first `session_id` it sees; any other id is answered `409 { "active_session_id" }`. After the session ends, requests carrying a retired token receive `410 { "status": "session-ended" }`.

Page routes answer `OPTIONS` with `Access-Control-Allow-Origin: <exact --app-origin>`, `Access-Control-Allow-Headers: Authorization, Content-Type, X-Riffrec-Session`, `Access-Control-Allow-Methods: GET, POST`, `Vary: Origin`, and no credentials flag.

## HTTP surface

### Page routes

| Route | Body | Response |
|---|---|---|
| `POST /events` | one envelope or an array of envelopes | `200 { "acked_seq" }`. Body cap 64 KB, or 2 MB for a lone `frame`; oversize is `413 { "max_bytes" }` and does not count toward the page's buffering threshold. Beyond the 500 MB per-session disk cap, frames are refused with `507 { "reason": "disk_cap", "stream_state": "buffering", "max_bytes", "acked_seq" }`. |
| `GET /stream` | none | SSE. Event names: `ack { acked_seq }`, `unit_status { unit_id, status, note?, guess? }`, `applied { checkpoint_id, unit_ids[] }`, `ask { unit_id, question }`, `session_ended { reason, session_id, log_dir }`. On connect the stream replays `ack` and a `unit_status` for every released or withdrawn unit so a reloaded page reconciles its board. |
| `POST /mint` | `{ "session_id" }` | `200 { "client_secret", "expires_at", "model" }`; `403 { "reason": "tls_required" }` when the peer is not loopback, unless the peer is an address named with `--trust-proxy` and the request carries `X-Forwarded-Proto: https` (the header alone is never trusted); `429 { "retry_after" }` past one mint in flight or five per minute; `502 { "reason": "openai_error", "upstream_status" }` with the upstream body discarded; `503 { "reason": "no_key" \| "brief_contains_secret" }`. |
| `POST /session/end` | the page's full-evidence archive (`application/zip` or `application/json`; may be empty) | `200 { "status": "session-ended", "log_dir", "archive_bytes" }`. Stores the archive under `state/log/`, emits a `final` checkpoint only if the page never sent one and something is still held or accepted, retires the page token, and closes every stream with `session_ended`. |

### Agent routes

| Route | Body | Response |
|---|---|---|
| `GET /wait` | none | Long-poll. `200 <wake envelope>`; `204` after the poll window (the CLI loops); `409 { "status": "wait-taken" }` when another wait is parked; `410 { "status": "session-ended" }` when the session ended and nothing is held. |
| `POST /checkpoints/:id/ack` | `{}` | `200 { "ok", "checkpoint_id" }`; `404` for an unknown or already-acknowledged checkpoint. |
| `POST /units/:id/status` | `{ "status", "note"?, "guess"? }` with status in `triaging`, `accepted`, `needs_info`, `applied`, `blocked`, `withdrawn` | `200`; relays `unit_status` (and `applied`) on the stream. `accepted` puts the unit in the backlog below; `applied` or `blocked` takes it out. `409` once the page has withdrawn the unit: a withdrawal is terminal. |
| `POST /units/:id/ask` | `{ "question" }` | `200`; moves the unit to `needs_info` and relays `ask` on the stream. `409` for a withdrawn unit. |
| `GET /status` | none | The board summary, the same document the `status` CLI prints. |

Nothing else is served: there is no file route, and every unknown path is 404.

## Checkpoints and the wake envelope

A checkpoint releases every held unit and annotation plus any withdrawal that arrived after an earlier release. On release the endpoint marks each unit `triaging` and broadcasts `unit_status: "triaging"`; the page treats that event as the release marker. A withdrawal before release removes the unit from the batch; one after release is forwarded in the next batch with `status: "withdrawn"`.

- Page-emitted checkpoints: `silence`, `page_change`, `send`, and `final` (the overlay's Done control), each carrying the mode at emission. `silence`, `page_change`, and `send` wake the agent only when they release something; `final` always wakes.
- Endpoint-emitted checkpoints: `answer`, created whenever an `answer` event arrives (carries `answers[]` only and releases no units), and `mode_change`, created the moment a `mode` event leaves Collect. Both always wake.
- **Accepted backlog.** Units the endpoint released, the agent posted `accepted` for, and no `applied` or `blocked` has followed. `mode_change` carries the whole backlog in `units[]` (status `accepted`) so a Collect session's work is applied under the new mode; `final` carries the backlog too, after anything newly released. A `mode_change` or `final` envelope may therefore carry units that were already served once, or nothing at all; treat it as work to apply, not a no-op.
- A page checkpoint id that was already used gets a `-2`, `-3`, … suffix in `checkpoint_id`, so every batch has its own file and ack route.
- `mode_at_checkpoint` is the mode carried by the releasing checkpoint, or the mode in force for endpoint-emitted checkpoints.

`wait` prints one envelope and exits 0:

```json
{
  "schema_version": "live/1",
  "checkpoint_id": "ck-…",
  "kind": "silence" | "page_change" | "send" | "answer" | "mode_change" | "final",
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
| `start --root <dir> [--app-origin <origin>] [--host 127.0.0.1] [--port 0] [--owner-pid <pid>] [--trust-proxy <ip>[,<ip>]] [--foreground]` | Prints `{ url, port, page_token, status }` once; writes `state/session.json`. When `state/session.json` has `ended: false`, this is a resume: the same `page_token` and `agent_token` are reused, the `session_id` binding, board, acknowledged `seq`, and un-acknowledged batches are reloaded, the previous port is preferred, and only `pid`, `owner_pid`, and `url` are rewritten (`status: "resumed"`); the previous `--app-origin`, bind host, and `--trust-proxy` list are kept unless given again, so the documented recovery is a bare `start --root <dir>`. `--app-origin` is required for a fresh session. Fresh tokens are minted only when there is no state file or the session ended. | 0 |
| `status --root <dir>` | Prints `{ status, url?, port?, session_ended, board }` from `state/` without contacting the server. | 0 |
| `stop --root <dir>` | Stops the server, invalidates both tokens, deletes `state/batches/`, keeps `state/log/`. | 0 |
| `wait --root <dir>` | Reads the agent token from `state/session.json`, long-polls `/wait` with it as a bearer header, prints one envelope. | 0 batch; 1 session ended with nothing held (`{ "status": "session-ended" }`); 2 error; 3 another process holds the wake (`{ "status": "wait-taken" }`, do not stop the endpoint) |
| `replay --root <dir> --profile <name> --to <endpoint> --token <page token>` | Re-emits `state/log/` to another endpoint under an evidence profile, as a fresh session over the page routes. Batches are sized in encoded bytes against the 64 KB cap; a lone envelope is posted bare so anything the source accepted fits the target. | 0 |

`--trust-proxy` names the TLS-terminating proxy or tunnel addresses whose `X-Forwarded-Proto` the mint route may believe; a tunnel client on the same host connects over loopback and needs no entry.

Owner death (`--owner-pid`) and the idle timeout (default 30 min, `CE_LIVE_IDLE_TIMEOUT_MS`) stop the process without ending the session; `state/` stays intact and `start --root` resumes. Only `/session/end` or `stop` ends a session. After `/session/end` the page token is retired immediately; the agent token stays valid until the final batch is acknowledged and nothing is held, then it is retired too, so `wait` exit 1 always means "ended with nothing held".

### Run directory

```
state/                  0700
  session.json          0600  { page_token, agent_token, url, app_origin, host, port, pid, owner_pid, ended, root, log_dir }
  board.json            0600  units, annotations, answers, checkpoints, acked_seq, page state
  brief.md                    session brief the skill writes before start (read at mint, max 3000 chars)
  server.pid, server.log
  batches/<checkpoint>.json   un-acknowledged wake envelopes
  log/events.ndjson           every accepted envelope, in seq order (frames reference log/frames/<id>.jpg)
  log/frames/<id>.jpg
  log/agent.ndjson            acknowledgments, statuses, asks, mints (never secrets)
  log/archive.{zip,json,bin}  the page's archive from /session/end
```

### Evidence profiles (`replay --profile`)

| Profile | Frames | Annotations | Audio clips, telemetry |
|---|---|---|---|
| `anchors_transcript_only` | none | dropped | dropped |
| `strokes_composite` | `composite` only | kept | dropped |
| `everything` | all | kept | kept |

## Mint

`POST /mint` is proxied through, and owned by, the endpoint. The page never holds an OpenAI key. The endpoint reads `OPENAI_API_KEY` from its own environment (`OPENAI_BASE_URL` overrides the upstream, `OPENAI_REALTIME_MODEL` and `OPENAI_REALTIME_VOICE` the session), appends `state/brief.md` to the persona after scanning it for secret shapes (known key prefixes, `KEY=`/`TOKEN=`/`SECRET=`-style assignments, URLs with credential parameters or userinfo), and calls `POST /v1/realtime/client_secrets` with:

```json
{
  "expires_after": { "anchor": "created_at", "seconds": 600 },
  "session": {
    "type": "realtime",
    "model": "gpt-realtime",
    "instructions": "<persona>\n\nSession brief:\n<brief>",
    "tools": [ "<the four tools below>" ],
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

Four flat function tools. No tool emits checkpoints or reports state: the page owns all timing and tells the interviewer about page-side facts as text conversation items.

| Tool | Parameters | Purpose |
|---|---|---|
| `record_unit` | `statement`, `anchors: string[]` (the riffer's words for the element or an anchor id the page announced), `transcript_excerpt` | Record one requested change; once per change; never for questions, thinking aloud, or short utterances without a change verb. |
| `update_unit` | `unit_id`, `statement?`, `anchors_add?: string[]` | Refine a unit the interviewer recorded; rejected once it has left `initial`, in which case the refinement is recorded as a new unit. |
| `withdraw_unit` | `unit_id`, `reason?` | Retract a unit the riffer took back; never because the interviewer is unsure. |
| `relay_answer` | `unit_id`, `answer_text` | Relay the riffer's answer to a question that arrived from the endpoint; not for the interviewer's own clarifying questions. |

Every parameter schema carries `additionalProperties: false`. The definitions in `scripts/live-endpoint.js` are a verbatim copy of riffrec's `LIVE_TOOLS` (`src/live/tools.ts`), which is the source of truth for wording.

## Default persona

> You are the interviewer in a live polish session. A person (the riffer) is using their own web app, talking about what they want changed, and pointing, clicking, or drawing on the page. A coding agent applies the changes; you never edit anything yourself. Listen more than you speak. When the riffer describes a change, call `record_unit` once with a single normalized statement and the anchors you were told about. Refine a unit with `update_unit` while it is still initial; withdraw it with `withdraw_unit` if the riffer changes their mind. When you are handed a question from the coding agent, ask it in one short sentence after the riffer has finished speaking, and relay the answer with `relay_answer`. Do not confirm every unit aloud, do not summarize, and do not propose changes of your own. Facts about the page (a drawing, a mute, buffering) arrive as text items; refer to them naturally without claiming to see the screen.

The executable copies of the tools and persona live in `scripts/live-endpoint.js`; change both together.
