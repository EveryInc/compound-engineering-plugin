#!/usr/bin/env node
// Live endpoint for ce-polish live mode: page -> endpoint event intake over
// HTTP POST, endpoint -> page SSE, endpoint -> agent blocking wake.
// Adapted from the ce-prototype helper (light-webserver.js): the run-directory
// lifecycle (pidfile, state/, idle timeout, --owner-pid, start/status/stop/wait)
// is kept; file serving, the overlay, /version, SSE grace shutdown, and the
// pending-document handshake are gone. Owner death and idle timeout stop the
// process but never end the session: a later `start --root` resumes it.
// Only /session/end or an explicit `stop` ends a session.
import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto"
import { execFileSync, spawn } from "node:child_process"
import fs from "node:fs"
import http from "node:http"
import net from "node:net"
import path from "node:path"
import readline from "node:readline"
import { fileURLToPath } from "node:url"

const scriptPath = fileURLToPath(import.meta.url)
const DEFAULT_HOST = "127.0.0.1"
const DEFAULT_URL_HOST = "localhost"
const SCHEMA_VERSION = "live/1"
const IDLE_TIMEOUT_MS = Number(process.env.CE_LIVE_IDLE_TIMEOUT_MS) || 30 * 60 * 1000
const LIFECYCLE_CHECK_MS = Number(process.env.CE_LIVE_LIFECYCLE_CHECK_MS) || 60 * 1000
const WAIT_TIMEOUT_MS = Number(process.env.CE_LIVE_WAIT_TIMEOUT_MS) || 30 * 1000
const PAGE_LOST_GRACE_MS = Number(process.env.CE_LIVE_PAGE_LOST_GRACE_MS) || 15 * 1000
const MINT_TIMEOUT_MS = Number(process.env.CE_LIVE_MINT_TIMEOUT_MS) || 10 * 1000
const BODY_LIMIT = 64 * 1024
// How long after a stream delivery the response is ended so buffering
// intermediaries release it; a burst inside this window shares one response.
const STREAM_FLUSH_MS = Number(process.env.CE_LIVE_STREAM_FLUSH_MS) || 300
const FRAME_BODY_LIMIT = 2 * 1024 * 1024
const ARCHIVE_BODY_LIMIT = Number(process.env.CE_LIVE_ARCHIVE_LIMIT_BYTES) || 400 * 1024 * 1024
const DISK_CAP_BYTES = Number(process.env.CE_LIVE_DISK_CAP_BYTES) || 500 * 1024 * 1024
// Above the image cap, a ceiling on the whole session log: past it every
// envelope is refused, not only frames, so a session that keeps sending
// small events (or a page that keeps posting) cannot grow the log without
// bound. Normal sessions never reach it; the page treats the refusal as
// buffering and replays once accepted again.
const DISK_HARD_CAP_BYTES = Math.max(DISK_CAP_BYTES, Number(process.env.CE_LIVE_DISK_HARD_CAP_BYTES) || DISK_CAP_BYTES + 64 * 1024 * 1024)
// An archive upload streams into `archive.<ext>.<uuid>.part` and is renamed
// once complete; a `.part` found at startup is an upload the previous process
// did not finish.
const ARCHIVE_PART_SUFFIX = ".part"
const BRIEF_MAX_CHARS = 3000
// Envelopes held ahead of a sequence gap before early arrivals are dropped for replay.
const OUT_OF_ORDER_CAP = 512
const MINTS_PER_MINUTE = 5
// Refused requests logged to agent.ndjson per window; the last slot in a
// window is the one line saying the rest of that window is suppressed.
const REJECTION_LOG_PER_WINDOW = Number(process.env.CE_LIVE_REJECTION_LOG_PER_MINUTE) || 60
const REJECTION_LOG_WINDOW_MS = 60 * 1000
const OPENAI_BASE_URL = (process.env.OPENAI_BASE_URL || "https://api.openai.com").replace(/\/+$/, "")
const REALTIME_MODEL = process.env.OPENAI_REALTIME_MODEL || "gpt-realtime"
const REALTIME_VOICE = process.env.OPENAI_REALTIME_VOICE || "marin"
const CLIENT_SECRET_TTL_S = 600

const PAGE_EVENT_TYPES = new Set([
  "click", "navigation", "network_request", "console_error",
  "transcript", "unit", "unit_update", "unit_withdraw", "annotation",
  "checkpoint", "answer", "frame", "mic", "mode", "stream_state",
])
// Page-emitted checkpoint triggers (KTD9). `silence`/`page_change`/`send`
// wake the agent only when they release something; `final` always wakes.
const PAGE_CHECKPOINT_KINDS = new Set(["silence", "page_change", "send", "final"])
const ALWAYS_WAKE_KINDS = new Set(["answer", "mode_change", "final"])
const EXECUTION_MODES = new Set(["instant", "smart", "collect"])
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/
// Agent-postable unit statuses: riffrec's UnitStatus set minus `initial`.
const AGENT_UNIT_STATUSES = new Set(["triaging", "accepted", "needs_info", "working", "applied", "blocked", "withdrawn"])
const UNIT_STATUSES = new Set(["initial", ...AGENT_UNIT_STATUSES])
const AGENT_AWAY_GRACE_MS = 15_000

// Payload shapes, ported from riffrec's `isPayloadFor` (src/live/contract.ts)
// so a malformed event is refused before it is acknowledged.
const isRecord = (v) => typeof v === "object" && v !== null && !Array.isArray(v)
const isString = (v) => typeof v === "string"
const isFiniteNumber = (v) => typeof v === "number" && Number.isFinite(v)
const isBoolean = (v) => typeof v === "boolean"
const optionalString = (v) => v === undefined || isString(v)
const isStringArray = (v) => Array.isArray(v) && v.every(isString)
const isRect = (v) => isRecord(v) && isFiniteNumber(v.x) && isFiniteNumber(v.y) && isFiniteNumber(v.width) && isFiniteNumber(v.height)
const isAnchor = (v) => isRecord(v) && isString(v.route) && isString(v.selector) && (v.component === undefined || v.component === null || isString(v.component)) && isRect(v.rect) && isFiniteNumber(v.t)
const isAnchorArray = (v) => Array.isArray(v) && v.every(isAnchor)
const isConfirmation = (v) => isRecord(v) && isBoolean(v.element) && isBoolean(v.change)
const isSpan = (v) => isRecord(v) && isFiniteNumber(v.t_start) && isFiniteNumber(v.t_end)
const isEvidence = (v) => isRecord(v) && isStringArray(v.frame_ids) && isStringArray(v.annotation_ids) && isSpan(v.transcript_span)
  && optionalString(v.audio_clip_id) && (v.telemetry_window === undefined || (isSpan(v.telemetry_window) && Array.isArray(v.telemetry_window.events)))
const isPointArray = (v) => Array.isArray(v) && v.every((p) => isRecord(p) && isFiniteNumber(p.x) && isFiniteNumber(p.y) && (p.pressure === undefined || isFiniteNumber(p.pressure)))

function validPayload(type, payload) {
  if (!isRecord(payload)) return false
  switch (type) {
    case "click":
      return payload.type === type && isFiniteNumber(payload.t) && isRecord(payload.element) && isString(payload.element.selector)
    case "network_request":
      return payload.type === type && isFiniteNumber(payload.t) && isString(payload.url) && isString(payload.method) && isFiniteNumber(payload.status)
    case "console_error":
      return payload.type === type && isFiniteNumber(payload.t) && isString(payload.message)
    case "navigation":
      return payload.type === type && isFiniteNumber(payload.t) && isString(payload.from) && isString(payload.to)
    case "transcript":
      return isString(payload.id) && (payload.role === "riffer" || payload.role === "interviewer") && isString(payload.text)
        && isFiniteNumber(payload.t_start) && isFiniteNumber(payload.t_end) && isBoolean(payload.final)
    case "unit":
      return isString(payload.id) && isString(payload.statement) && isString(payload.transcript_excerpt) && isAnchorArray(payload.anchors)
        && isEvidence(payload.evidence) && UNIT_STATUSES.has(payload.status) && (payload.confirmed === undefined || isConfirmation(payload.confirmed))
    case "unit_update":
      return isString(payload.unit_id) && optionalString(payload.statement) && (payload.anchors_add === undefined || isAnchorArray(payload.anchors_add))
        && (payload.confirmed === undefined || isConfirmation(payload.confirmed))
    case "unit_withdraw":
      return isString(payload.unit_id) && optionalString(payload.reason)
    case "annotation":
      return isString(payload.id) && (payload.kind === "stroke" || payload.kind === "pin") && isPointArray(payload.points) && isRect(payload.bbox)
        && isAnchor(payload.anchor) && optionalString(payload.text) && optionalString(payload.unit_id) && optionalString(payload.composite_frame_id)
    case "checkpoint":
      return isString(payload.id) && PAGE_CHECKPOINT_KINDS.has(payload.trigger) && EXECUTION_MODES.has(payload.mode)
    case "answer":
      return isString(payload.unit_id) && isString(payload.text)
    case "frame":
      return isString(payload.id) && isFiniteNumber(payload.t) && isString(payload.route)
        && ["gesture", "periodic", "composite"].includes(payload.kind) && isString(payload.jpeg_base64)
        && (payload.dropped === undefined || ["quota", "oversize"].includes(payload.dropped))
    case "mic":
      return ["granted", "denied", "muted", "unmuted"].includes(payload.state)
    case "mode":
      return EXECUTION_MODES.has(payload.mode)
    case "stream_state":
      return ["streaming", "buffering", "unloading"].includes(payload.state)
    default:
      return false
  }
}
const EVIDENCE_PROFILES = {
  anchors_transcript_only: { frames: "none", annotations: false, clips: false, telemetry: false },
  strokes_composite: { frames: "composite", annotations: true, clips: false, telemetry: false },
  everything: { frames: "all", annotations: true, clips: true, telemetry: true },
}

// The executable copy of the interviewer's tools the mint sends to OpenAI:
// verbatim riffrec `LIVE_TOOLS` (src/live/tools.ts). The human-readable copy
// is references/live-stream-contract.md and the pinned dump is
// tests/fixtures/ce-polish-live/live-tools.json; change all three together.
// After connecting, the page appends any tool it can answer that the mint
// lacked (the endpoint's copies win), so a stale copy degrades rather than
// breaks; a verbatim copy is never patched.
const INTERVIEWER_TOOLS = [
  {
    "type": "function",
    "name": "record_unit",
    "description": "Record one requested change as a unit on the board. Call when the riffer has asked for exactly one concrete change to the app and you can state it in one sentence; call once per change, so a sentence that asks for three things becomes three calls. Never call for questions, thinking aloud, praise, or utterances shorter than three words without a change verb; ask a clarifying question instead when the target element or the intended change is ambiguous.",
    "parameters": {
      "type": "object",
      "properties": {
        "statement": {
          "type": "string",
          "description": "Normalized imperative statement of the change, in the riffer's vocabulary, one sentence, no speculation."
        },
        "anchors": {
          "type": "array",
          "description": "Anchor references for the element(s) the change is about: an anchor id from a [PAGE] note announcing what the riffer clicked, drew on, or pinned (\"this\"/\"here\" means the most recent one), or the riffer's own words for the element (\"the sidebar toggle\", \"that red button\"). Empty only when the riffer named no element and no anchor was announced.",
          "items": {
            "type": "string"
          }
        },
        "transcript_excerpt": {
          "type": "string",
          "description": "The riffer's own words that carry this change, verbatim, trimmed to the relevant span."
        }
      },
      "required": [
        "statement",
        "anchors",
        "transcript_excerpt"
      ],
      "additionalProperties": false
    }
  },
  {
    "type": "function",
    "name": "update_unit",
    "description": "Refine a unit you recorded earlier. Call when the riffer adds detail, corrects wording, or names another element for a change already on the board, or when they answer a clarifying question you asked about it. Never call to change a unit into a different change; withdraw it and record a new one. The call is rejected once the unit has left the initial status; the result tells you so, and you must then record the refinement as a new unit.",
    "parameters": {
      "type": "object",
      "properties": {
        "unit_id": {
          "type": "string",
          "description": "Id returned by record_unit."
        },
        "statement": {
          "type": "string",
          "description": "Replacement statement, when the wording changes."
        },
        "anchors_add": {
          "type": "array",
          "description": "Additional anchor references to attach; existing anchors are kept.",
          "items": {
            "type": "string"
          }
        }
      },
      "required": [
        "unit_id"
      ],
      "additionalProperties": false
    }
  },
  {
    "type": "function",
    "name": "withdraw_unit",
    "description": "Retract a unit the riffer no longer wants. Call when the riffer says never mind, undo, scrap that, or otherwise takes back a change you recorded. Never call because you are unsure the unit was right; ask instead. Never call for units you did not record in this session.",
    "parameters": {
      "type": "object",
      "properties": {
        "unit_id": {
          "type": "string",
          "description": "Id returned by record_unit."
        },
        "reason": {
          "type": "string",
          "description": "The riffer's reason, in their words, when they gave one."
        }
      },
      "required": [
        "unit_id"
      ],
      "additionalProperties": false
    }
  },
  {
    "type": "function",
    "name": "relay_answer",
    "description": "Relay the riffer's answer to a question the coding agent asked about a unit. Call when you voiced a question that arrived from the endpoint for a specific unit and the riffer has answered it. Never call for answers to your own clarifying questions; use update_unit for those. Never invent or summarize an answer the riffer did not give.",
    "parameters": {
      "type": "object",
      "properties": {
        "unit_id": {
          "type": "string",
          "description": "Id of the unit the question was attached to."
        },
        "answer_text": {
          "type": "string",
          "description": "The riffer's answer, verbatim or lightly cleaned of filler."
        }
      },
      "required": [
        "unit_id",
        "answer_text"
      ],
      "additionalProperties": false
    }
  },
  {
    "type": "function",
    "name": "look_at_screen",
    "description": "See the riffer's screen right now. The page attaches a screenshot of the current view as an image in the conversation, then returns this call's result with the route and how old the frame is. Call when the riffer refers to how something looks (\"this\", \"here\", \"that color\", \"it looks off\") and the clicked or drawn anchors the page announced do not settle what they mean, when they ask whether you can see their screen, or when they ask you to look. Never call more than once per riffer turn, and never call to browse: only to answer what the riffer just said. If the result says no frame is available, ask the riffer to describe what they see.",
    "parameters": {
      "type": "object",
      "properties": {
        "reason": {
          "type": "string",
          "description": "Why you need to see the screen, in a few words."
        }
      },
      "required": [],
      "additionalProperties": false
    }
  }
]

// The interviewer's instructions: verbatim riffrec
// `DEFAULT_INTERVIEWER_INSTRUCTIONS` (src/live/realtime/persona.ts), pinned by
// tests/fixtures/ce-polish-live/interviewer-instructions.txt. The page checks
// the minted persona for the [SCREEN CONTEXT] marker after connect and appends
// the section when it is missing; keep it here, and keep it last.
const SCREEN_CONTEXT_SECTION = [
  "[SCREEN CONTEXT]",
  "The page keeps you informed about the screen, and this section is authoritative about it: it supersedes any earlier statement that you cannot see the page or must not claim to.",
  "Every click the riffer makes arrives as a system note tagged [PAGE] that names the element (its component, visible text, selector, and route) and gives it an anchor id. Drawings and pins arrive the same way. The most recent note is what \"this\", \"here\", and \"that\" refer to: put its anchor id in record_unit's anchors, and never ask which element they mean when a note arrived within the last few seconds.",
  "You can also see the screen. Call look_at_screen when the riffer refers to how something looks, asks whether you can see their screen, or asks you to look; the page attaches a screenshot of the current view and you may then describe or refer to what is in it. The riffrec panel docked at the top right is not part of the app. Never say you cannot see the screen: if no frame is available the tool result says so, and you ask the riffer to describe what they see instead.",
].join("\n")

const INTERVIEWER_PERSONA = [
  "You are the riffrec interviewer: a calm, terse product partner listening to a designer or developer (the riffer) talk through changes they want while they click and draw on their own running app. The page tells you what they click, draw on, and pin, and shows you the screen when you ask for it; the last section says how.",
  "Your job is to turn what the riffer says into units of change on a shared board, one unit per requested change, using the record_unit tool. A sentence that asks for three things becomes three record_unit calls. Never call record_unit for questions, thinking aloud, praise, or utterances shorter than three words without a change verb.",
  "Ask immediately, in one short sentence, when the target element or the intended value is ambiguous: which element, which side, what color, how much. Otherwise stay quiet and let the riffer keep talking. Do not narrate, summarize, or confirm each unit aloud; the board already shows it.",
  "Never invent anchors. Use only the anchor ids the page announced or the element references the riffer named. When the riffer names no element and no anchor was announced, record the unit with an empty anchors list.",
  "When the riffer takes back a change, call withdraw_unit and acknowledge it aloud in a few words. When they refine a change already on the board, call update_unit; if it is rejected because the unit was already picked up, record the refinement as a new unit.",
  "When a note marked [ENDPOINT QUESTION] arrives, read the question to the riffer in your own words at the next pause and, once they answer, call relay_answer with their answer for that unit. Never answer such a question yourself.",
  "When the riffer asks to compound, to capture what was learned, or to remember a decision for next time, record one unit whose statement starts with \"/ce-compound:\" followed by what to capture, with an empty anchors list, and say in a few words that it will be compounded.",
  "Keep every spoken turn under two sentences. Speak the riffer's language.",
  SCREEN_CONTEXT_SECTION,
].join("\n\n")

function usage() {
  return [
    "Usage:",
    "  node live-endpoint.js start --root <dir> --app-origin <origin> [--host 127.0.0.1] [--port 0] [--owner-pid <pid>] [--trust-proxy <ip>[,<ip>]] [--foreground]",
    "  node live-endpoint.js status --root <dir>",
    "  node live-endpoint.js stop --root <dir>",
    "  node live-endpoint.js wait --root <dir>",
    "  node live-endpoint.js replay --root <dir> --profile <anchors_transcript_only|strokes_composite|everything> --to <endpoint> --token <page token> [--log <log-ended-<stamp>|dir>]",
  ].join("\n")
}

function parseArgs(argv) {
  const command = argv[2]
  const options = { command, host: DEFAULT_HOST, port: undefined, foreground: false }

  for (let i = 3; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === "--root") options.root = argv[++i]
    else if (arg === "--host") { options.host = argv[++i]; options.hostExplicit = true }
    else if (arg === "--port") options.port = Number(argv[++i])
    else if (arg === "--foreground") options.foreground = true
    else if (arg === "--owner-pid") options.ownerPid = Number(argv[++i])
    else if (arg === "--app-origin") options.appOrigin = argv[++i]
    else if (arg === "--profile") options.profile = argv[++i]
    else if (arg === "--to") options.to = argv[++i]
    else if (arg === "--token") options.token = argv[++i]
    else if (arg === "--log") options.log = argv[++i]
    else if (arg === "--trust-proxy") options.trustProxy = [...(options.trustProxy ?? []), ...String(argv[++i] ?? "").split(",").map((ip) => ip.trim()).filter(Boolean)]
    else throw new Error(`Unknown argument: ${arg}`)
  }

  if (!["start", "serve", "stop", "status", "wait", "replay"].includes(command)) {
    throw new Error(usage())
  }
  if (!options.root) throw new Error("--root is required")
  if (options.port !== undefined && (!Number.isInteger(options.port) || options.port < 0 || options.port > 65535)) {
    throw new Error("--port must be an integer from 0 to 65535")
  }
  if (options.ownerPid !== undefined && (!Number.isInteger(options.ownerPid) || options.ownerPid <= 1)) {
    throw new Error("--owner-pid must be an integer greater than 1")
  }
  options.trustProxy = options.trustProxy ?? []
  if (command === "start" || command === "serve") {
    if (options.trustProxy.some((ip) => !net.isIP(ip))) throw new Error("--trust-proxy takes IP addresses (comma-separated or repeated)")
    if (!options.appOrigin) {
      // The documented recovery is a bare `start --root <dir>`: a session
      // whose agent token is still retained lends its origin.
      const resumable = readJsonOrNull(path.join(path.resolve(options.root), "state", "session.json"))
      // Also lent by an ended session still draining its final batch.
      if (resumable && resumable.agent_token && typeof resumable.app_origin === "string") options.appOrigin = resumable.app_origin
    }
    if (!options.appOrigin) throw new Error("--app-origin is required (the browser-facing origin of the app under polish)")
    options.appOrigin = normalizeOrigin(options.appOrigin)
    if (!options.appOrigin) throw new Error("--app-origin must be an origin such as http://localhost:3000")
  }
  if (command === "replay") {
    if (!options.profile || !EVIDENCE_PROFILES[options.profile]) {
      throw new Error(`--profile must be one of: ${Object.keys(EVIDENCE_PROFILES).join(", ")}`)
    }
    if (!options.to || !normalizeOrigin(options.to)) throw new Error("--to must be the endpoint origin to replay into")
    options.to = normalizeOrigin(options.to)
    if (!options.token) throw new Error("--token is required (the target endpoint's page token)")
  }

  options.root = path.resolve(options.root)
  options.stateDir = path.join(options.root, "state")
  options.pidFile = path.join(options.stateDir, "server.pid")
  options.sessionFile = path.join(options.stateDir, "session.json")
  options.boardFile = path.join(options.stateDir, "board.json")
  options.briefFile = path.join(options.stateDir, "brief.md")
  options.logFile = path.join(options.stateDir, "server.log")
  options.batchesDir = path.join(options.stateDir, "batches")
  options.logDir = path.join(options.stateDir, "log")
  // `replay --log` addresses an earlier session on this root: a rotated
  // `state/log-ended-<stamp>` by name, or any log directory by path.
  if (options.log !== undefined) {
    if (command !== "replay") throw new Error("--log applies to replay only")
    const named = path.join(options.stateDir, path.basename(options.log))
    const candidate = fs.existsSync(path.join(named, "events.ndjson")) ? named : path.resolve(options.log)
    if (!fs.existsSync(path.join(candidate, "events.ndjson"))) throw new Error(`No session log at ${path.join(candidate, "events.ndjson")}`)
    options.logDir = candidate
  }
  return options
}

function normalizeOrigin(value) {
  try {
    const url = new URL(value)
    if (!/^https?:$/.test(url.protocol) || url.pathname !== "/" || url.search || url.hash) return null
    return url.origin
  } catch {
    return null
  }
}

function ensureDirs(options) {
  fs.mkdirSync(options.stateDir, { recursive: true, mode: 0o700 })
  fs.chmodSync(options.stateDir, 0o700)
  fs.mkdirSync(options.batchesDir, { recursive: true, mode: 0o700 })
  fs.mkdirSync(options.logDir, { recursive: true, mode: 0o700 })
  fs.mkdirSync(path.join(options.logDir, "frames"), { recursive: true, mode: 0o700 })
}

function writePrivate(filePath, contents) {
  const tmp = `${filePath}.${process.pid}.tmp`
  fs.writeFileSync(tmp, contents, { mode: 0o600 })
  fs.chmodSync(tmp, 0o600)
  fs.renameSync(tmp, filePath)
}

function writePrivateJson(filePath, value) {
  writePrivate(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

function appendPrivate(filePath, line) {
  fs.appendFileSync(filePath, line, { mode: 0o600 })
}

function jsonOut(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`)
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"))
}

function readJsonOrNull(filePath) {
  try {
    return readJson(filePath)
  } catch {
    return null
  }
}

function readableFile(filePath) {
  try {
    fs.accessSync(filePath, fs.constants.R_OK)
    return fs.statSync(filePath).isFile()
  } catch {
    return false
  }
}

// A frame file named by a session log, admitted only as a regular file that
// really sits under that log's frames/ directory: the log may be a copy from
// elsewhere, so a `frame_file` of `../x` or a symlink out of the directory
// must not make replay read and transmit an arbitrary local file.
function frameFileWithin(logDir, frameFile) {
  if (typeof frameFile !== "string" || !frameFile) return null
  let framesDir
  try {
    framesDir = fs.realpathSync(path.join(logDir, "frames"))
  } catch {
    return null
  }
  const candidate = path.resolve(logDir, frameFile)
  try {
    if (fs.lstatSync(candidate).isSymbolicLink()) return null
    const real = fs.realpathSync(candidate)
    if (path.dirname(real) !== framesDir || !fs.statSync(real).isFile()) return null
    fs.accessSync(real, fs.constants.R_OK)
    return real
  } catch {
    return null
  }
}

function processAlive(pid) {
  if (!pid || !Number.isInteger(pid)) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error?.code === "EPERM"
  }
}

function processArgs(pid) {
  try {
    return execFileSync("ps", ["-p", String(pid), "-o", "args="], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim()
  } catch {
    return null
  }
}

// Whether the process behind state/server.pid is this root's endpoint:
// `owned`, `foreign` (the PID was reused by something else), or `unknown`
// (the command line could not be inspected). The helper is matched by its
// file name, not the path it was launched from: a session resumed from a
// newer plugin checkout, or a foreground helper started as
// `node live-endpoint.js`, is still the same endpoint for this root.
function inspectServerProcess(options, pid) {
  // Exact argv when the platform exposes it (Linux /proc): the `--root`
  // argument is compared whole, so a root containing spaces or one that is
  // a prefix of another cannot be confused with it.
  const argv = processArgv(pid)
  if (argv) {
    const isHelper = argv.some((token) => path.basename(token) === path.basename(scriptPath))
    const rootIndex = argv.indexOf("--root")
    const forThisRoot = rootIndex !== -1 && argv[rootIndex + 1] === options.root
    const serving = argv.includes("serve") || argv.includes("start")
    return isHelper && forThisRoot && serving ? "owned" : "foreign"
  }
  const args = processArgs(pid)
  if (args === null) return "unknown"
  const tokens = args.split(/\s+/)
  const isHelper = tokens.some((token) => path.basename(token) === path.basename(scriptPath))
  // Flattened command line (`ps`): argv boundaries are gone, so the root must
  // be followed by the next flag or the end of the line. A root that is this
  // one plus more words (`--root /tmp/root other`) is ambiguous and reads as
  // foreign rather than owned.
  const rootArgument = new RegExp(`(^|\\s)--root\\s+${escapeRegExp(options.root)}(\\s+--|\\s*$)`)
  const forThisRoot = rootArgument.test(args)
  const serving = tokens.includes("serve") || tokens.includes("start")
  return isHelper && forThisRoot && serving ? "owned" : "foreign"
}

// The process's argv with its boundaries intact, or null where the platform
// does not expose it (no /proc, or a PID this user may not read).
function processArgv(pid) {
  try {
    const raw = fs.readFileSync(`/proc/${pid}/cmdline`)
    if (raw.length === 0) return null
    const parts = raw.toString("utf8").split("\0")
    if (parts[parts.length - 1] === "") parts.pop()
    return parts
  } catch {
    return null
  }
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function ownsServerProcess(options, pid) {
  return inspectServerProcess(options, pid) === "owned"
}

// A live PID whose ownership cannot be verified is never signalled and never
// displaced: the caller stops with the PID named rather than risk killing an
// unrelated process or launching a second writer beside the real endpoint.
function requireInspectableProcess(options, pid) {
  if (processAlive(pid) && inspectServerProcess(options, pid) === "unknown") {
    throw new Error(`Cannot verify that process ${pid} (state/server.pid) is this root's endpoint: process inspection (ps) is unavailable. Stop it yourself if it is, then remove ${options.pidFile}`)
  }
}

function resolveOwnerPid() {
  const parentPid = process.ppid
  if (!parentPid || parentPid <= 1) return null
  try {
    const grandparent = Number(execFileSync("ps", ["-o", "ppid=", "-p", String(parentPid)], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim())
    if (Number.isInteger(grandparent) && grandparent > 1) return grandparent
  } catch {
    // Fall back to the direct parent when grandparent lookup is unavailable.
  }
  return parentPid
}

function readPid(options) {
  if (!fs.existsSync(options.pidFile)) return null
  const pid = Number(fs.readFileSync(options.pidFile, "utf8").trim())
  return Number.isInteger(pid) ? pid : null
}

function readSession(options) {
  return readJsonOrNull(options.sessionFile)
}

function serverRunning(options) {
  const pid = readPid(options)
  return processAlive(pid) && ownsServerProcess(options, pid)
}

function getRunningInfo(options) {
  if (!serverRunning(options)) return null
  const session = readSession(options)
  if (!session || session.pid !== readPid(options)) return null
  return session
}

function publicStartEnvelope(session) {
  return { url: session.url, port: session.port, page_token: session.page_token }
}

// The address a local client uses to reach the bound interface: a wildcard
// bind is reached through its loopback, anything else through itself.
function localAddressFor(host) {
  if (!host || host === "0.0.0.0") return DEFAULT_HOST
  if (host === "::" || host === "[::]") return "[::1]"
  return host.includes(":") && !host.startsWith("[") ? `[${host}]` : host
}

function newToken() {
  return randomBytes(32).toString("base64url")
}

function bestEffort(action) {
  try {
    action()
  } catch {
    // Cleanup on a failing disk is advisory.
  }
}

function tokenMatches(candidate, expected) {
  if (typeof candidate !== "string" || typeof expected !== "string") return false
  const a = Buffer.from(candidate)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

// Credentials are accepted from `Authorization: Bearer` only.
function bearerToken(req) {
  const auth = req.headers.authorization
  if (typeof auth !== "string" || !auth.startsWith("Bearer ")) return null
  const token = auth.slice(7).trim()
  return token || null
}

function sendJson(res, status, value, headers = {}) {
  // Kept for the server's finish hook, which logs refusals to agent.ndjson.
  if (status >= 400) res.rejection = value
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers })
  res.end(`${JSON.stringify(value)}\n`)
}

// The path of a request for the rejection log: no query string (a caller may
// put a token there), no fragment, bounded length. Never decoded, so a
// malformed escape cannot throw here.
function loggedRoute(req) {
  const raw = typeof req.url === "string" ? req.url : ""
  return raw.split("?")[0].split("#")[0].slice(0, 200) || null
}

// What a refusal says about itself, from the body this server wrote: the
// contract's `reason`, else its `error`, else its `status` word.
function rejectionReason(value) {
  if (!isRecord(value)) return null
  for (const key of ["reason", "error", "status"]) {
    if (typeof value[key] === "string") return value[key]
  }
  return null
}

// Reads a body up to `limit` bytes. Past the limit the request is drained
// (so the 413 the caller writes is delivered) and the promise resolves with
// `{ tooLarge: true }`; a hard ceiling destroys the socket so an attacker
// cannot make the server read forever.
// Reads a request body up to `limit`. Past the limit the body is discarded
// but read to its end, so the caller's 413 travels on an orderly connection.
// Past the hard ceiling the caller gets its answer at once (the page needs
// the 413 to replace the frame with a `dropped` envelope, and a reset would
// read as an outage) while the rest is discarded as it arrives; only an
// upload that keeps going far beyond that is cut off.
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    let tooLarge = false
    let settled = false
    const settle = (value) => {
      if (settled) return
      settled = true
      resolve(value)
    }
    const hardCeiling = Math.max(limit * 2, limit + 1024 * 1024)
    const abuseCeiling = hardCeiling * 16
    req.on("data", (chunk) => {
      size += chunk.length
      if (tooLarge) {
        if (size > hardCeiling) settle({ tooLarge: true, size })
        if (size > abuseCeiling) req.destroy()
        return
      }
      if (size > limit) {
        tooLarge = true
        chunks.length = 0
        return
      }
      chunks.push(chunk)
    })
    req.on("end", () => settle(tooLarge ? { tooLarge: true, size } : { text: Buffer.concat(chunks).toString("utf8"), size }))
    req.on("error", (error) => {
      if (settled) return
      settled = true
      reject(error)
    })
  })
}

function parseJsonObject(text) {
  try {
    const value = JSON.parse(text)
    return value && typeof value === "object" ? value : null
  } catch {
    return null
  }
}

function isLoopback(address) {
  if (!address) return false
  const plain = address.replace(/^::ffff:/, "")
  return plain === "127.0.0.1" || plain === "::1" || plain.startsWith("127.")
}

const SECRET_SHAPES = [
  /\bsk-[A-Za-z0-9_-]{8,}/,
  /\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{16,}/,
  /\bgithub_pat_[A-Za-z0-9_]{20,}/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/,
  /\bAIza[0-9A-Za-z_-]{30,}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\b[A-Za-z0-9_.-]*(KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIALS?)\s*[=:]\s*["']?[^\s"']{6,}/i,
  /[?&](token|key|api_key|apikey|secret|password|access_token|auth|sig|signature)=[^&\s]+/i,
  // Any URL scheme with userinfo credentials: postgres://u:p@h, https://u:p@h.
  /\b[a-z][a-z0-9+.-]*:\/\/[^\s/:@]+:[^\s/@]+@/i,
]

function briefContainsSecret(text) {
  return SECRET_SHAPES.some((shape) => shape.test(text))
}

function readBrief(options) {
  try {
    return fs.readFileSync(options.briefFile, "utf8").slice(0, BRIEF_MAX_CHARS)
  } catch {
    return ""
  }
}

function directorySize(dir) {
  let total = 0
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return 0
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) total += directorySize(full)
    else if (entry.isFile()) {
      try {
        total += fs.statSync(full).size
      } catch {
        // Removed between readdir and stat.
      }
    }
  }
  return total
}

// Statuses at which the agent is finished with a unit. A released unit at
// any other status (triaging, accepted, needs_info, working, or one a later
// build adds) is close-out work the agent still owes: only its own
// `applied`/`blocked` post retires it. Units never released to the agent
// (`initial`) are not its work.
const TERMINAL_UNIT_STATUSES = new Set(["applied", "blocked", "withdrawn"])

function unitsPendingCloseOut(board) {
  if (!isRecord(board) || !Array.isArray(board.unit_order) || !isRecord(board.units)) return false
  return board.unit_order.some((id) => {
    const unit = Object.hasOwn(board.units, id) ? board.units[id] : undefined
    return isRecord(unit) && unit.released === true && !TERMINAL_UNIT_STATUSES.has(unit.status)
  })
}

// A `.part` in state/log/ is an archive upload the previous process did not
// finish: the page retries Done with the whole archive, so the partial holds
// no evidence and must not count against the disk cap that retry is checked
// against.
function removeOrphanedArchiveParts(logDir) {
  let entries
  try {
    entries = fs.readdirSync(logDir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    if (entry.isFile() && entry.name.startsWith("archive.") && entry.name.endsWith(ARCHIVE_PART_SUFFIX)) {
      bestEffort(() => fs.rmSync(path.join(logDir, entry.name), { force: true }))
    }
  }
}

// ---------------------------------------------------------------------------
// Board: the persisted session state `GET /status` and the `status` CLI read.
// ---------------------------------------------------------------------------

function emptyBoard() {
  return {
    schema_version: SCHEMA_VERSION,
    session_id: null,
    ended: false,
    mode: "smart",
    acked_seq: 0,
    units: {},
    unit_order: [],
    annotations: {},
    annotation_order: [],
    answers: [],
    transcript_count: 0,
    frame_count: 0,
    checkpoints: [],
    acked_checkpoint_ids: [],
    released_unit_ids: [],
    released_annotation_ids: [],
    pending_withdrawn: [],
    page: { stream: "never", last_stream_state: null, mic: null, lost_episodes: 0 },
    page_lost_pending: null,
    watch_for_loss: false,
    final_emitted: false,
  }
}

function boardSummary(board, batches, logBytes) {
  const byStatus = {}
  for (const id of board.unit_order) {
    const status = board.units[id]?.status ?? "unknown"
    byStatus[status] = (byStatus[status] ?? 0) + 1
  }
  return {
    schema_version: SCHEMA_VERSION,
    session_id: board.session_id,
    ended: board.ended,
    mode: board.mode,
    page: board.page,
    acked_seq: board.acked_seq,
    units: {
      total: board.unit_order.length,
      by_status: byStatus,
      // Enough for a run resumed after an ack to pick a unit up from the
      // board alone: what to change, where (anchors), and the evidence that
      // grounds it, not just the status it was left at.
      list: board.unit_order.map((id) => {
        const unit = board.units[id]
        return {
          id,
          statement: unit.statement,
          status: unit.status,
          confirmed: unit.confirmed ?? null,
          anchors: Array.isArray(unit.anchors) ? unit.anchors : [],
          evidence: isRecord(unit.evidence) ? unit.evidence : null,
          ...(typeof unit.question === "string" ? { question: unit.question } : {}),
          ...(typeof unit.note === "string" ? { note: unit.note } : {}),
          ...(typeof unit.guess === "string" ? { guess: unit.guess } : {}),
        }
      }),
    },
    annotations: board.annotation_order.length,
    answers: board.answers.length,
    transcript_count: board.transcript_count,
    frame_count: board.frame_count,
    checkpoints: board.checkpoints.length,
    batches: {
      unserved: batches.filter((batch) => !batch.served).length,
      unacked: batches.filter((batch) => batch.served).length,
    },
    page_lost_pending: Boolean(board.page_lost_pending),
    log_bytes: logBytes,
  }
}

function loadBatches(options) {
  let files
  try {
    files = fs.readdirSync(options.batchesDir).filter((file) => file.endsWith(".json"))
  } catch {
    return []
  }
  return files
    .map((file) => readJsonOrNull(path.join(options.batchesDir, file)))
    .filter((batch) => batch && batch.envelope?.checkpoint_id)
    .sort((a, b) => a.order - b.order)
}

// `status` CLI and `GET /status` read the board through this one function.
function readBoardSummary(options) {
  const board = readJsonOrNull(options.boardFile) ?? emptyBoard()
  return boardSummary(board, loadBatches(options), directorySize(options.logDir))
}

// ---------------------------------------------------------------------------
// CLI commands
// ---------------------------------------------------------------------------

async function start(options) {
  ensureDirs(options)
  options.ownerPid = options.ownerPid ?? resolveOwnerPid()
  // One start per root at a time, foreground or detached: the running check
  // and the launch happen under the same claim.
  const lockPath = acquireStartLock(options)
  try {
    await startLocked(options)
  } finally {
    fs.rmSync(lockPath, { force: true })
  }
}

function acquireStartLock(options) {
  const lockPath = path.join(options.stateDir, "start.lock")
  let lockFd
  try {
    lockFd = fs.openSync(lockPath, "wx", 0o600)
  } catch (error) {
    if (error.code !== "EEXIST") throw error
    const holder = Number(fs.readFileSync(lockPath, "utf8")) || null
    if (holder && processAlive(holder)) throw new Error("Another `start` for this root is in progress")
    fs.rmSync(lockPath, { force: true })
    lockFd = fs.openSync(lockPath, "wx", 0o600)
  }
  fs.writeSync(lockFd, `${process.pid}\n`)
  fs.closeSync(lockFd)
  return lockPath
}

// Releases the lock only once the session file proves the server is up.
async function startLocked(options) {
  const running = getRunningInfo(options)
  if (running && !running.ended) {
    if (running.app_origin !== options.appOrigin) {
      throw new Error(`An endpoint for this root is already running with --app-origin ${running.app_origin}; stop it first`)
    }
    jsonOut({ ...publicStartEnvelope(running), status: "running" })
    return
  }
  if (running) await stopServer(options)
  requireInspectableProcess(options, readPid(options))
  fs.rmSync(options.pidFile, { force: true })
  const previous = readSession(options)

  if (options.foreground) {
    // serve() resolves once listening; the server handle keeps the process up.
    const serving = serve(options)
    serving.catch(() => {})
    const up = await waitForSession(options, process.pid, previous)
    await serving
    if (!up) throw new Error("Endpoint failed to start")
    return null
  }

  await spawnServe(options, previous)
}

async function spawnServe(options, previous) {
  const logFd = fs.openSync(options.logFile, "a", 0o600)
  const child = spawn(process.execPath, [
    scriptPath,
    "serve",
    "--root",
    options.root,
    "--app-origin",
    options.appOrigin,
    ...(options.hostExplicit ? ["--host", options.host] : []),
    ...(options.port !== undefined ? ["--port", String(options.port)] : []),
    ...(options.ownerPid ? ["--owner-pid", String(options.ownerPid)] : []),
    ...(options.trustProxy.length > 0 ? ["--trust-proxy", options.trustProxy.join(",")] : []),
  ], {
    detached: true,
    stdio: ["ignore", logFd, logFd],
  })
  child.unref()
  fs.closeSync(logFd)

  const started = await waitForSession(options, child.pid, previous)
  if (!started) {
    throw new Error(`Endpoint failed to start. See ${options.logFile}`)
  }
  // The child decides whether it resumed; the same tokens are the proof.
  const resumed = Boolean(previous?.agent_token) && started.agent_token === previous.agent_token
  jsonOut({ ...publicStartEnvelope(started), status: resumed ? "resumed" : "started" })
}

async function waitForSession(options, pid, previous) {
  for (let i = 0; i < 100; i++) {
    const session = readSession(options)
    if (session && session.pid === pid && session.pid !== previous?.pid) return session
    if (pid && !processAlive(pid)) return null
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  return null
}

// A new session after an ended one keeps the old log by rotating it.
function rotateLog(options) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-")
  const rotated = path.join(options.stateDir, `log-ended-${stamp}`)
  try {
    fs.renameSync(options.logDir, rotated)
  } catch {
    // Nothing to rotate.
  }
  ensureDirs(options)
}

// Work the agent still owes this root: a batch on disk (served or not, never
// acknowledged), or a released unit the board holds at a status only the
// agent's `applied`/`blocked` post can retire. An ended session that holds
// work resumes on `start`, `wait` sends the agent back to `start` for it,
// and the page cannot open a new session over it.
function sessionHoldsWork(options) {
  if (loadBatches(options).length > 0) return true
  return unitsPendingCloseOut(readJsonOrNull(options.boardFile))
}

function endedAndDrained(options) {
  const stopped = readSession(options)
  if (!stopped?.ended) return false
  // `stop` retired the tokens: nothing can be posted against this session
  // any more, so whatever the board still holds is terminal as it stands.
  if (!stopped.agent_token) return true
  return !sessionHoldsWork(options)
}

function exitSessionEnded() {
  process.exitCode = 1
  jsonOut({ status: "session-ended" })
}

async function wait(options) {
  process.stdout.on("error", (error) => {
    console.error(error.message)
    process.exitCode = 2
  })
  const info = getRunningInfo(options)
  if (!info?.port) {
    // Idle/owner shutdown leaves the session file in place; an ended session
    // must still report that terminal status rather than "not running".
    // Ended and drained is terminal; ended with batches on disk still holds
    // work and needs a resume.
    if (endedAndDrained(options)) return exitSessionEnded()
    console.error("Endpoint is not running; run `start --root` to resume the session")
    process.exit(2)
  }
  if (!info.agent_token) {
    if (info.ended) return exitSessionEnded()
    console.error("No agent token in state/session.json")
    process.exit(2)
  }

  const url = `http://${localAddressFor(info.host)}:${info.port}/wait`
  const headers = { Authorization: `Bearer ${info.agent_token}` }
  while (true) {
    let response
    try {
      response = await fetch(url, { headers })
    } catch {
      // The helper may have died mid-poll; a retained final batch still needs
      // a resume, never a "session-ended" exit.
      if (endedAndDrained(options)) return exitSessionEnded()
      console.error("Endpoint is not running; run `start --root` to resume the session")
      process.exit(2)
    }
    if (response.status === 200 || response.status === 410) {
      const text = await response.text()
      // Let pending stdout writes drain instead of truncating a piped batch.
      process.exitCode = response.status === 200 ? 0 : 1
      process.stdout.write(text.endsWith("\n") ? text : `${text}\n`)
      return
    }
    if (response.status === 409) {
      process.exitCode = 3
      jsonOut({ status: "wait-taken" })
      return
    }
    if (response.status === 204) continue
    console.error(`wait: unexpected HTTP ${response.status}`)
    process.exit(2)
  }
}

async function stopServer(options) {
  const pid = readPid(options)
  requireInspectableProcess(options, pid)
  if (processAlive(pid) && ownsServerProcess(options, pid)) {
    process.kill(pid)
    for (let i = 0; i < 20; i++) {
      if (!processAlive(pid)) break
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    if (processAlive(pid)) {
      try {
        process.kill(pid, "SIGKILL")
      } catch {
        // Process may have exited between the liveness check and kill.
      }
    }
  }
  fs.rmSync(options.pidFile, { force: true })
}

// `stop` ends the session: both tokens are invalidated, un-acked batches are
// discarded, and state/log/ is kept for replay.
async function stop(options) {
  await stopServer(options)
  const session = readSession(options)
  if (session) {
    writePrivateJson(options.sessionFile, { ...session, page_token: null, agent_token: null, ended: true, pid: null })
  }
  const board = readJsonOrNull(options.boardFile)
  if (board) writePrivateJson(options.boardFile, { ...board, ended: true })
  fs.rmSync(options.batchesDir, { recursive: true, force: true })
  jsonOut({ status: "stopped", root: options.root, log_dir: options.logDir })
}

function status(options) {
  const running = getRunningInfo(options)
  const session = readSession(options)
  jsonOut({
    status: running ? "running" : "stopped",
    root: options.root,
    ...(running ? { url: running.url, port: running.port, app_origin: running.app_origin } : {}),
    session_ended: Boolean(session?.ended),
    board: readBoardSummary(options),
  })
}

// ---------------------------------------------------------------------------
// Replay: re-emit state/log/ under an evidence profile to another endpoint.
// ---------------------------------------------------------------------------

const TELEMETRY_EVENT_TYPES = new Set(["click", "navigation", "network_request", "console_error"])

// `retainedFrames` is the set of frame ids the profile keeps, so unit
// evidence never points at a frame the replay did not send.
function applyProfile(envelope, profile, retainedFrames) {
  const rules = EVIDENCE_PROFILES[profile]
  const { type, payload } = envelope
  if (type === "frame") {
    if (rules.frames === "none") return null
    if (rules.frames === "composite" && payload?.kind !== "composite") return null
    return envelope
  }
  if (TELEMETRY_EVENT_TYPES.has(type) && !rules.telemetry) return null
  if (type === "annotation" && !rules.annotations) return null
  if ((type === "unit" || type === "unit_update") && payload && typeof payload === "object") {
    const next = { ...payload }
    if (next.evidence && typeof next.evidence === "object") {
      const evidence = { ...next.evidence }
      if (rules.frames === "none") evidence.frame_ids = []
      else if (Array.isArray(evidence.frame_ids)) evidence.frame_ids = evidence.frame_ids.filter((id) => retainedFrames.has(id))
      if (!rules.annotations) evidence.annotation_ids = []
      if (!rules.clips) delete evidence.audio_clip_id
      if (!rules.telemetry) delete evidence.telemetry_window
      next.evidence = evidence
    }
    return { ...envelope, payload: next }
  }
  return envelope
}

async function replay(options) {
  const eventsFile = path.join(options.logDir, "events.ndjson")
  if (!fs.existsSync(eventsFile)) throw new Error(`No session log at ${eventsFile}`)
  // No longer than the recorded id: the rewrite must not push an envelope the
  // source accepted at the 64 KB cap over it at the target.
  const recorded = readJsonOrNull(options.boardFile)?.session_id ?? ""
  const sessionId = `r${randomBytes(16).toString("hex")}`.slice(0, Math.max(1, String(recorded).length))
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${options.token}`,
    "X-Riffrec-Session": sessionId,
  }
  let seq = 0
  let sent = 0
  let skipped = 0
  let batch = []
  let batchBytes = 0

  // First pass: which frames the profile keeps, so evidence can be pruned to
  // them on the second pass. Only ids are held, and only for frames the
  // second pass will actually emit: one whose image file is missing is
  // skipped there, so its id must not survive in a unit's evidence either.
  const retainedFrames = new Set()
  const frameRule = EVIDENCE_PROFILES[options.profile].frames
  if (frameRule !== "none") {
    const scan = readline.createInterface({ input: fs.createReadStream(eventsFile, "utf8"), crlfDelay: Infinity })
    for await (const line of scan) {
      const stored = line ? parseJsonObject(line) : null
      if (stored?.type !== "frame" || typeof stored.payload?.id !== "string") continue
      if (frameRule === "composite" && stored.payload.kind !== "composite") continue
      const emittable = !stored.frame_file || frameFileWithin(options.logDir, stored.frame_file) !== null
      if (emittable) retainedFrames.add(stored.payload.id)
    }
  }

  async function post(envelopes) {
    const body = JSON.stringify(envelopes.length === 1 ? envelopes[0] : envelopes)
    const response = await fetch(`${options.to}/events`, { method: "POST", headers, body })
    if (!response.ok) {
      const text = await response.text().catch(() => "")
      throw new Error(`replay: ${options.to}/events answered ${response.status} ${text.trim()}`)
    }
    sent += envelopes.length
  }

  async function flush() {
    if (batch.length === 0) return
    const pending = batch
    batch = []
    batchBytes = 0
    await post(pending)
  }

  // Encoded size of the request body the batch would produce: a lone
  // envelope is posted bare, so it fits whenever the target accepted it.
  function bodyBytes(count, payloadBytes) {
    return count <= 1 ? payloadBytes : payloadBytes + 2 + (count - 1)
  }

  // Line by line: a log near the 500 MB budget must not be held whole.
  const lines = readline.createInterface({ input: fs.createReadStream(eventsFile, "utf8"), crlfDelay: Infinity })
  for await (const line of lines) {
    if (!line) continue
    const stored = parseJsonObject(line)
    if (!stored || typeof stored.type !== "string") continue
    let envelope = { schema_version: SCHEMA_VERSION, session_id: sessionId, seq: 0, t: stored.t, type: stored.type, payload: stored.payload }
    if (stored.type === "frame" && !stored.frame_file) {
      envelope = { ...envelope, payload: { ...stored.payload, jpeg_base64: "" } }
    } else if (stored.type === "frame") {
      try {
        const frameFile = frameFileWithin(options.logDir, stored.frame_file)
        if (frameFile === null) throw new Error("frame file outside the selected log")
        const jpeg = fs.readFileSync(frameFile)
        envelope = { ...envelope, payload: { ...stored.payload, jpeg_base64: jpeg.toString("base64") } }
      } catch {
        skipped += 1
        continue
      }
    }
    envelope = applyProfile(envelope, options.profile, retainedFrames)
    if (!envelope) {
      skipped += 1
      continue
    }
    envelope.seq = ++seq
    if (envelope.type === "frame") {
      await flush()
      await post([envelope])
      continue
    }
    // The target's 64 KB cap is in encoded bytes; measure the same way and
    // flush before the envelope that would cross it.
    const encoded = Buffer.byteLength(JSON.stringify(envelope))
    if (envelope.type !== "frame" && encoded > BODY_LIMIT) {
      throw new Error(`replay: envelope ${stored.seq ?? "?"} (${envelope.type}) is ${encoded} bytes, over the ${BODY_LIMIT}-byte cap even posted alone`)
    }
    if (batch.length > 0 && bodyBytes(batch.length + 1, batchBytes + encoded) > BODY_LIMIT) await flush()
    batch.push(envelope)
    batchBytes += encoded
    if (envelope.type === "checkpoint") await flush()
  }
  await flush()
  jsonOut({ status: "replayed", to: options.to, profile: options.profile, session_id: sessionId, envelopes_sent: sent, envelopes_skipped: skipped })
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

async function serve(options) {
  ensureDirs(options)

  // Resume when a live session file exists for this root; otherwise mint a
  // fresh pair of credentials and start a new board.
  const previous = readSession(options)
  // The end of a session is two writes (board, then session record). A
  // process that died between them left one saying ended and the other
  // not; either one saying so is the recorded intent, and both are brought
  // to it here before anything is served, so a resume cannot answer 410 on
  // page routes while `status` still reports the session live.
  const storedBoard = readJsonOrNull(options.boardFile)
  if (previous && storedBoard?.ended === true && !previous.ended) previous.ended = true
  // An ended session whose agent token is still retained resumes while the
  // agent still owes it close-out work: a batch not yet acknowledged, or a
  // unit the board holds at triaging/accepted/needs_info that the resumed
  // run must apply or mark blocked. Only a drained, reconciled ended root
  // starts fresh.
  const draining = Boolean(previous?.ended && previous.agent_token && sessionHoldsWork(options))
  const resuming = Boolean(previous && previous.agent_token && ((!previous.ended && previous.page_token) || draining))
  // A resume keeps the previous bind host unless the caller names a new one;
  // the documented recovery is a bare `start --root <dir>` again.
  if (resuming && !options.hostExplicit && typeof previous.host === "string" && previous.host) options.host = previous.host
  if (resuming && options.trustProxy.length === 0 && Array.isArray(previous.trust_proxy)) options.trustProxy = previous.trust_proxy.filter((ip) => net.isIP(ip))
  const pageToken = resuming ? previous.page_token : newToken()
  const agentToken = resuming ? previous.agent_token : newToken()
  if (!resuming) {
    fs.rmSync(options.batchesDir, { recursive: true, force: true })
    fs.rmSync(options.boardFile, { force: true })
    fs.mkdirSync(options.batchesDir, { recursive: true, mode: 0o700 })
    if (previous?.ended) rotateLog(options)
  }
  const board = resuming ? { ...emptyBoard(), ...(storedBoard ?? {}) } : emptyBoard()
  if (resuming && previous.ended) board.ended = true
  // A batch file whose checkpoint the board already records as acknowledged
  // is the retirement half of an ack that did not finish; it is not served again.
  const batches = []
  for (const batch of resuming ? loadBatches(options) : []) {
    if (board.acked_checkpoint_ids.includes(batch.envelope.checkpoint_id)) {
      bestEffort(() => fs.rmSync(path.join(options.batchesDir, `${encodeURIComponent(batch.envelope.checkpoint_id)}.json`), { force: true }))
    } else {
      batches.push(batch)
    }
  }
  let batchOrder = batches.reduce((max, batch) => Math.max(max, batch.order), 0)
  const port = options.port ?? (resuming && Number.isInteger(previous.port) ? previous.port : 0)

  const eventsLog = path.join(options.logDir, "events.ndjson")
  const agentLog = path.join(options.logDir, "agent.ndjson")
  const framesDir = path.join(options.logDir, "frames")
  removeOrphanedArchiveParts(options.logDir)
  let logBytes = directorySize(options.logDir)
  let session = null
  let waiter = null
  // What the agent is actually doing, for the page: "listening" while a wait is
  // parked, "working" from the moment a batch is served until the next wait,
  // "away" when no wait has parked for a while.
  let agentState = { state: "away", since: Date.now() }
  let agentAwayTimer = null
  function setAgentState(state, extra = {}) {
    if (state !== "away" && agentAwayTimer) {
      clearTimeout(agentAwayTimer)
      agentAwayTimer = null
    }
    if (agentState.state === state && !extra.checkpoint_id) return
    agentState = { state, since: Date.now(), ...extra }
    broadcast("agent", agentState)
  }
  function agentMaybeAway() {
    if (agentAwayTimer || agentState.state === "working") return
    agentAwayTimer = setTimeout(() => {
      agentAwayTimer = null
      if (!waiter) setAgentState("away")
    }, AGENT_AWAY_GRACE_MS)
    agentAwayTimer.unref?.()
  }
  const streamClients = new Set()
  const outOfOrder = new Map()
  let endingInFlight = false
  // Non-null while an envelope transaction is open; SSE notices and wakes
  // queue here and are delivered only once the transaction commits.
  let heldNotices = null
  // Ids are validated but may still name inherited Object properties.
  const unitById = (id) => (Object.hasOwn(board.units, id) ? board.units[id] : undefined)
  const annotationById = (id) => (Object.hasOwn(board.annotations, id) ? board.annotations[id] : undefined)
  // Bytes of frames waiting in the gap buffer, counted against the disk cap
  // before they land so a burst of early frames cannot overshoot it.
  let reservedBytes = 0
  let pageLostTimer = null
  let mintInFlight = false
  const mintTimes = []
  let lastActivity = Date.now()
  const touch = () => {
    lastActivity = Date.now()
  }

  function saveBoard() {
    writePrivateJson(options.boardFile, board)
  }

  function saveSession(patch) {
    session = { ...session, ...patch }
    writePrivateJson(options.sessionFile, session)
  }

  function logEvent(record) {
    const line = `${JSON.stringify(record)}\n`
    appendPrivate(eventsLog, line)
    logBytes += Buffer.byteLength(line)
  }

  function logAgent(record) {
    const line = `${JSON.stringify({ t: Date.now(), ...record })}\n`
    appendPrivate(agentLog, line)
    logBytes += Buffer.byteLength(line)
  }

  // Events a reconnecting stream cannot rebuild from the board (`applied`
  // is a moment, not a state) wait here while no stream is attached: after
  // a flushed response the page is between connections for a second or
  // more, and a notice posted then would otherwise never reach it. Events
  // the connect-time replay reconstructs are not kept; the replay is newer.
  const REPLAYED_ON_CONNECT = new Set(["ack", "unit_status", "ask", "agent"])
  const PENDING_DELIVERY_CAP = 256
  const pendingDeliveries = []

  function broadcast(event, payload) {
    if (heldNotices) {
      heldNotices.push({ event, payload })
      return
    }
    const frame = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`
    if (streamClients.size === 0 && !REPLAYED_ON_CONNECT.has(event) && !board.ended) {
      pendingDeliveries.push(frame)
      if (pendingDeliveries.length > PENDING_DELIVERY_CAP) pendingDeliveries.shift()
    }
    for (const client of streamClients) {
      if (!client.writableEnded) client.write(frame)
    }
    // An ack rides every POST and the page already has it in that POST's
    // response; ending the stream for it would keep the page reconnecting.
    // The agent state changes on every wait; it rides the stream without forcing a reconnect.
    if (event !== "ack" && event !== "agent") scheduleStreamFlush()
  }

  // Delivers what a transaction held once it has committed: wakes to the
  // parked agent, notices to the stream. A no-op when nothing is held.
  function releaseHeldNotices() {
    const notices = heldNotices
    heldNotices = null
    if (!notices) return
    for (const notice of notices) {
      if (notice.wake) fulfillWaiter()
      else broadcast(notice.event, notice.payload)
    }
  }

  // A stream response is ended shortly after a delivery. Some TLS-terminating
  // intermediaries (cloudflared quick tunnels, fronted by a Worker) hold a
  // streaming body until the response completes, so an open SSE stream never
  // reaches the page; a completed one does at once. The page reconnects a
  // second later and handleStream replays every unit's current state, so on
  // such a path the stream is a sequence of short responses, and on a direct
  // path the same responses arrive as they are written. The delay lets a
  // burst (a release, an accepted then applied) ride one response.
  let streamFlushTimer = null
  function scheduleStreamFlush() {
    if (streamClients.size === 0) return
    if (streamFlushTimer) clearTimeout(streamFlushTimer)
    streamFlushTimer = setTimeout(() => {
      streamFlushTimer = null
      for (const client of streamClients) {
        if (!client.writableEnded) client.end()
      }
    }, STREAM_FLUSH_MS)
    streamFlushTimer.unref?.()
  }

  // --- batches ---------------------------------------------------------------

  function batchFile(checkpointId) {
    return path.join(options.batchesDir, `${encodeURIComponent(checkpointId)}.json`)
  }

  function persistBatch(batch) {
    writePrivateJson(batchFile(batch.envelope.checkpoint_id), batch)
  }

  function heldUnits() {
    return board.unit_order
      .map((id) => unitById(id))
      .filter((unit) => unit && !unit.released && unit.status !== "withdrawn")
  }

  function heldAnnotations() {
    return board.annotation_order
      .map((id) => annotationById(id))
      .filter((annotation) => annotation && !annotation.released)
  }

  function makeEnvelope(checkpointId, kind, mode, extra) {
    return {
      schema_version: SCHEMA_VERSION,
      checkpoint_id: checkpointId,
      kind,
      mode_at_checkpoint: mode,
      session_status: "live",
      units: [],
      annotations: [],
      answers: [],
      ...extra,
    }
  }

  function publicUnit(unit) {
    const { released, checkpoint_id, ...rest } = unit
    return rest
  }

  function publicAnnotation(annotation) {
    const { released, ...rest } = annotation
    return rest
  }

  // KTD12: units the agent accepted but has not applied or blocked since.
  // `final` and `mode_change` carry them so a Collect backlog is applied.
  function backlogUnits() {
    return board.unit_order
      .map((id) => unitById(id))
      .filter((unit) => unit && unit.released && unit.status === "accepted")
  }

  // A checkpoint releases every held unit and annotation plus the
  // withdrawals that arrived after an earlier release. `silence`,
  // `page_change`, and `send` wake the agent only when they release
  // something; `final` always wakes and also carries the accepted backlog.
  function releaseCheckpoint(checkpointId, kind, mode) {
    const units = heldUnits()
    const annotations = heldAnnotations()
    const withdrawn = board.pending_withdrawn.map((id) => unitById(id)).filter(Boolean)
    const backlog = kind === "final" ? backlogUnits() : []
    const releases = units.length + annotations.length + withdrawn.length + backlog.length > 0
    if (!releases && !ALWAYS_WAKE_KINDS.has(kind)) return null
    for (const unit of units) {
      unit.released = true
      unit.status = "triaging"
      unit.checkpoint_id = checkpointId
      board.released_unit_ids.push(unit.id)
    }
    for (const annotation of annotations) {
      annotation.released = true
      board.released_annotation_ids.push(annotation.id)
    }
    board.pending_withdrawn = []
    board.mode = mode
    board.checkpoints.push({ id: checkpointId, kind, mode, t: Date.now() })
    if (kind === "final") board.final_emitted = true
    const envelope = makeEnvelope(checkpointId, kind, mode, {
      units: [
        ...units.map(publicUnit),
        ...backlog.map(publicUnit),
        ...withdrawn.map((unit) => ({ ...publicUnit(unit), status: "withdrawn" })),
      ],
      annotations: annotations.map(publicAnnotation),
    })
    enqueueBatch(envelope)
    for (const unit of units) broadcast("unit_status", { unit_id: unit.id, status: "triaging" })
    saveBoard()
    return envelope
  }

  // KTD12: leaving Collect wakes the agent at once with the accepted backlog.
  function emitModeChange(mode) {
    const checkpointId = `ck-mode-${randomUUID()}`
    board.checkpoints.push({ id: checkpointId, kind: "mode_change", mode, t: Date.now() })
    enqueueBatch(makeEnvelope(checkpointId, "mode_change", mode, { units: backlogUnits().map(publicUnit) }))
  }

  function enqueueBatch(envelope) {
    const batch = { order: ++batchOrder, served: false, envelope }
    batches.push(batch)
    persistBatch(batch)
    fulfillWaiter()
  }

  function nextBatch() {
    return batches.find((batch) => batch.served) ?? batches.find((batch) => !batch.served) ?? null
  }

  function takeWaiter() {
    const parked = waiter
    waiter = null
    clearTimeout(parked.timer)
    return parked.res
  }

  // Serve order: a batch served without an ack first, then the oldest new
  // batch, then a pending page-lost notice; an ended session with nothing
  // held answers 410.
  function fulfillWaiter() {
    if (heldNotices) {
      heldNotices.push({ wake: true })
      return
    }
    if (!waiter || waiter.res.writableEnded) return
    const batch = nextBatch()
    if (batch) {
      batch.served = true
      persistBatch(batch)
      sendJson(takeWaiter(), 200, batch.envelope)
      setAgentState("working", { checkpoint_id: batch.envelope.checkpoint_id })
      return
    }
    if (board.page_lost_pending) {
      // Left by a helper from before page-lost wakes were queued as batches.
      const envelope = board.page_lost_pending
      board.page_lost_pending = null
      saveBoard()
      enqueueBatch(envelope)
      return
    }
    if (board.ended) {
      sendJson(takeWaiter(), 410, { status: "session-ended" })
    }
  }

  // --- page-lost detection (KTD8) ----------------------------------------------

  function armPageLost() {
    if (pageLostTimer || board.ended) return
    pageLostTimer = setTimeout(() => {
      pageLostTimer = null
      if (streamClients.size > 0 || board.ended) return
      const last = board.checkpoints[board.checkpoints.length - 1]
      // Queued like any batch: persisted and re-served until acknowledged.
      // The batch lands before the watch is cleared, so a failure at either
      // step leaves the durable board still watching: a restart re-arms it
      // and the loss is reported then, rather than lost with a crashed timer.
      // The wake is held until the whole transition has committed, so a
      // parked agent never receives a batch that a failed board save then
      // takes back from under its acknowledgment.
      const undo = snapshotState()
      heldNotices = []
      try {
        enqueueBatch(makeEnvelope(`page-lost-${randomUUID()}`, last?.kind ?? "send", board.mode, {
          session_status: "page_lost",
          lost_after_checkpoint_id: last?.id ?? null,
        }))
        board.page.lost_episodes += 1
        board.page.stream = "lost"
        board.watch_for_loss = false
        saveBoard()
      } catch (error) {
        heldNotices = null
        undo()
        bestEffort(() => logAgent({ kind: "page_lost_persist_failed", error: error.code ?? error.message }))
        armPageLost()
        return
      }
      releaseHeldNotices()
    }, PAGE_LOST_GRACE_MS)
    pageLostTimer.unref()
  }

  function disarmPageLost() {
    if (pageLostTimer) {
      clearTimeout(pageLostTimer)
      pageLostTimer = null
    }
  }

  // The watch set by an applied notice is one-shot: it ends when the page
  // reconnects, or once the grace window passes with the stream still up
  // (the edit did not take the page down). Without that expiry, a stream
  // that never dropped would carry the watch to the next ordinary disconnect.
  let watchForLossTimer = null

  function clearWatchForLoss() {
    if (watchForLossTimer) {
      clearTimeout(watchForLossTimer)
      watchForLossTimer = null
    }
    if (board.watch_for_loss) board.watch_for_loss = false
  }

  function watchForLoss() {
    board.watch_for_loss = true
    saveBoard()
    if (streamClients.size === 0) {
      armPageLost()
      return
    }
    if (watchForLossTimer) clearTimeout(watchForLossTimer)
    watchForLossTimer = setTimeout(() => {
      watchForLossTimer = null
      if (streamClients.size === 0 || board.ended) return
      clearWatchForLoss()
      bestEffort(() => saveBoard())
    }, PAGE_LOST_GRACE_MS)
    watchForLossTimer.unref()
  }

  // --- session end -----------------------------------------------------------

  // /session/end ends the board, not the tokens. The page token stays valid so
  // the same link can open another session once this one drains (see
  // openSession); both tokens live until `stop` (or a fresh start on the ended
  // root), per I4/KTD18: an agent that crashes between the final ack and
  // `stop` can still resume, `status`, and `stop`.
  function endSession() {
    if (board.ended) return
    // Terminal state is committed before anything observable happens; if the
    // writes fail the session stays live and /session/end can be retried.
    const before = { ended: board.ended, stream: board.page.stream, session }
    board.ended = true
    board.page.stream = streamClients.size > 0 ? "connected" : board.page.stream
    try {
      saveBoard()
      saveSession({ ended: true })
    } catch (error) {
      board.ended = before.ended
      board.page.stream = before.stream
      session = before.session
      bestEffort(() => saveBoard())
      bestEffort(() => writePrivateJson(options.sessionFile, session))
      throw error
    }
    disarmPageLost()
    // A transition that released a final batch before ending held its wake
    // and notices until this commit; they go out now, ahead of the end.
    releaseHeldNotices()
    broadcast("session_ended", { reason: "session_end", session_id: board.session_id, log_dir: options.logDir })
    for (const client of streamClients) {
      if (!client.writableEnded) client.end()
    }
    streamClients.clear()
    fulfillWaiter()
  }

  // Nothing of the ended session is still owed to the agent: every batch is
  // acknowledged, every released unit is terminal, and no /session/end
  // upload is in flight. Until then a new session id is refused rather than
  // erasing a board the agent still has to reconcile.
  function drained() {
    return batches.length === 0 && !endingInFlight && !unitsPendingCloseOut(board)
  }

  // A new session id on an ended, drained board: what a fresh `start` on an
  // ended root does, in-process and with the same tokens.
  function openSession(sessionId) {
    // The durable writes come first and the irreversible steps last: if the
    // new board or the live session record cannot be saved, the ended
    // session is restored in memory and on disk, and its log and batches
    // directory are untouched, so a refused opener leaves it intact.
    const before = { board: structuredClone(board), session }
    for (const key of Object.keys(board)) delete board[key]
    Object.assign(board, emptyBoard(), { session_id: sessionId })
    try {
      saveBoard()
      saveSession({ ended: false })
    } catch (error) {
      for (const key of Object.keys(board)) delete board[key]
      Object.assign(board, before.board)
      session = before.session
      bestEffort(() => saveBoard())
      bestEffort(() => writePrivateJson(options.sessionFile, session))
      throw error
    }
    fs.rmSync(options.batchesDir, { recursive: true, force: true })
    rotateLog(options)
    batches.length = 0
    batchOrder = 0
    outOfOrder.clear()
    pendingDeliveries.length = 0
    reservedBytes = 0
    logBytes = 0
    disarmPageLost()
    clearWatchForLoss()
    // Presence is per session: the wait that drained the old one is gone.
    setAgentState("away")
    bestEffort(() => logAgent({ kind: "session_opened", session_id: sessionId }))
  }

  // --- auth and CORS -----------------------------------------------------------

  function corsHeaders() {
    return {
      "Access-Control-Allow-Origin": options.appOrigin,
      Vary: "Origin",
    }
  }

  // The page credential: the page token and an Origin that is either absent
  // or exactly --app-origin.
  function authorizePageToken(req, res) {
    const origin = req.headers.origin
    if (typeof origin === "string" && origin !== options.appOrigin) {
      sendJson(res, 403, { reason: "origin" }, corsHeaders())
      return null
    }
    const token = bearerToken(req)
    if (!token) {
      sendJson(res, 401, { error: "unauthorized" }, corsHeaders())
      return null
    }
    if (tokenMatches(token, agentToken)) {
      sendJson(res, 403, { reason: "wrong_credential" }, corsHeaders())
      return null
    }
    if (!tokenMatches(token, pageToken)) {
      sendJson(res, 401, { error: "unauthorized" }, corsHeaders())
      return null
    }
    return true
  }

  // Page routes: the page credential plus the session header. On an ended
  // board the ended id stays 410; any other id opens a fresh board once the
  // ended session has drained, and is then handled as that session's first
  // request.
  function authorizePage(req, res) {
    if (!authorizePageToken(req, res)) return null
    const sessionId = req.headers["x-riffrec-session"]
    const named = typeof sessionId === "string" && sessionId.trim() !== ""
    if (board.ended) {
      if (!named || sessionId === board.session_id) {
        sendJson(res, 410, { status: "session-ended" }, corsHeaders())
        return null
      }
      if (!drained()) {
        sendJson(res, 409, { error: "previous_session_draining" }, corsHeaders())
        return null
      }
      openSession(sessionId)
    }
    if (!named) {
      sendJson(res, 400, { error: "missing X-Riffrec-Session" }, corsHeaders())
      return null
    }
    // A closed tab ends its session: when the bound page said it was unloading
    // (or went lost) and no stream is open, a new page takes over instead of
    // being refused. A reload keeps its session id, so it never lands here.
    if (board.session_id && board.session_id !== sessionId && pageClosed()) {
      bestEffort(() => logAgent({ kind: "session_closed_by_page", session_id: board.session_id }))
      endSession()
      if (!drained()) {
        sendJson(res, 409, { error: "previous_session_draining" }, corsHeaders())
        return null
      }
      openSession(sessionId)
    }
    if (board.session_id && board.session_id !== sessionId) {
      sendJson(res, 409, { active_session_id: board.session_id }, corsHeaders())
      return null
    }
    if (!board.session_id) {
      // The first request binds the board to its session id; a bind that
      // does not persist is not a bind, so a later legitimate id is not
      // refused as foreign against an in-memory value the disk never held.
      board.session_id = sessionId
      try {
        saveBoard()
      } catch (error) {
        board.session_id = null
        throw error
      }
    }
    return sessionId
  }

  function pageClosed() {
    if (board.ended || streamClients.size > 0) return false
    return board.page.last_stream_state === "unloading" || board.page.stream === "lost"
  }

  // Agent routes: the agent token, no Origin header at all, no CORS.
  function authorizeAgent(req, res) {
    if (req.headers.origin !== undefined) {
      sendJson(res, 403, { reason: "browser_origin" })
      return false
    }
    const token = bearerToken(req)
    if (!token) {
      sendJson(res, 401, { error: "unauthorized" })
      return false
    }
    if (tokenMatches(token, pageToken)) {
      sendJson(res, 403, { reason: "wrong_credential" })
      return false
    }
    if (!tokenMatches(token, agentToken)) {
      sendJson(res, 401, { error: "unauthorized" })
      return false
    }
    if (session.agent_token === null) {
      sendJson(res, 410, { status: "session-ended" })
      return false
    }
    return true
  }

  // --- page routes -------------------------------------------------------------

  // Rejection names follow riffrec's LiveEnvelopeRejection; only
  // `unsupported_schema_version` maps to 409, everything else to 400.
  function validEnvelope(value, sessionId) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return "not_object"
    if (value.schema_version !== SCHEMA_VERSION) return "unsupported_schema_version"
    if (typeof value.session_id !== "string" || !value.session_id) return "missing_session_id"
    if (value.session_id !== sessionId) return "session_mismatch"
    if (value.seq === undefined || value.seq === null) return "missing_seq"
    if (!Number.isInteger(value.seq) || value.seq < 1) return "invalid_seq"
    if (typeof value.t !== "number" || !Number.isFinite(value.t)) return "invalid_t"
    if (typeof value.type !== "string" || !PAGE_EVENT_TYPES.has(value.type)) return "unknown_type"
    if (!validPayload(value.type, value.payload)) return "invalid_payload"
    // Ids become object keys and batch file names.
    for (const field of ["id", "unit_id"]) {
      const id = value.payload[field]
      if (id !== undefined && !SAFE_ID.test(String(id))) return "invalid_payload"
    }
    return null
  }

  function applyEnvelope(envelope) {
    const { type, payload } = envelope
    if (type === "transcript") {
      board.transcript_count += 1
    } else if (type === "unit") {
      if (typeof payload.id !== "string" || !payload.id) return
      const existing = unitById(payload.id)
      board.units[payload.id] = {
        ...(existing ?? {}),
        ...payload,
        status: existing?.released ? existing.status : (payload.status ?? "initial"),
        released: Boolean(existing?.released),
      }
      if (!existing) board.unit_order.push(payload.id)
      // Instant means continuous pickup: the unit is released the moment it
      // lands, with whatever is held beside it, and the agent wakes now. The
      // page sees `triaging` on the stream at once; no checkpoint is waited for.
      if (board.mode === "instant" && !board.units[payload.id].released) {
        releaseCheckpoint(`instant-${payload.id}`, "instant", "instant")
      }
    } else if (type === "unit_update") {
      const unit = unitById(payload.unit_id)
      if (!unit) return
      // KTD5: a unit is refined only while it is still initial and unreleased;
      // the riffer's confirmation pass (KTD22) may land at any point.
      if (payload.confirmed !== undefined) unit.confirmed = payload.confirmed
      if (unit.released || unit.status !== "initial") return
      if (typeof payload.statement === "string") unit.statement = payload.statement
      if (Array.isArray(payload.anchors_add)) unit.anchors = [...(unit.anchors ?? []), ...payload.anchors_add]
    } else if (type === "unit_withdraw") {
      const unit = unitById(payload.unit_id)
      if (!unit || unit.status === "withdrawn") return
      unit.status = "withdrawn"
      unit.withdraw_reason = payload.reason ?? null
      if (unit.released && !board.pending_withdrawn.includes(unit.id)) board.pending_withdrawn.push(unit.id)
      broadcast("unit_status", { unit_id: unit.id, status: "withdrawn" })
    } else if (type === "annotation") {
      if (typeof payload.id !== "string" || !payload.id) return
      const existing = annotationById(payload.id)
      board.annotations[payload.id] = { ...(existing ?? {}), ...payload, released: Boolean(existing?.released) }
      if (!existing) board.annotation_order.push(payload.id)
    } else if (type === "checkpoint") {
      const trigger = PAGE_CHECKPOINT_KINDS.has(payload.trigger) ? payload.trigger : "send"
      const mode = EXECUTION_MODES.has(payload.mode) ? payload.mode : board.mode
      board.mode = mode
      // A checkpoint id keys its batch file and its ack route, so a reused
      // page id gets a suffix rather than overwriting the earlier batch.
      const wanted = typeof payload.id === "string" && payload.id ? payload.id : `ck-${randomUUID()}`
      let checkpointId = wanted
      for (let n = 2; board.checkpoints.some((c) => c.id === checkpointId); n += 1) checkpointId = `${wanted}-${n}`
      releaseCheckpoint(checkpointId, trigger, mode)
    } else if (type === "answer") {
      const answer = { unit_id: payload.unit_id, text: payload.text, t: envelope.t }
      board.answers.push(answer)
      const checkpointId = `ck-answer-${randomUUID()}`
      board.checkpoints.push({ id: checkpointId, kind: "answer", mode: board.mode, t: Date.now() })
      enqueueBatch(makeEnvelope(checkpointId, "answer", board.mode, { answers: [{ unit_id: answer.unit_id, text: answer.text }] }))
    } else if (type === "frame") {
      board.frame_count += 1
    } else if (type === "mic") {
      board.page.mic = payload.state ?? null
    } else if (type === "mode") {
      if (!EXECUTION_MODES.has(payload.mode)) return
      const leavingCollect = board.mode === "collect" && payload.mode !== "collect"
      board.mode = payload.mode
      if (leavingCollect) emitModeChange(payload.mode)
      // Switching to Instant flushes what is held right away, since nothing
      // will wait for a checkpoint from here on. (Leaving Collect woke the
      // agent with the accepted backlog above; this carries the unreleased.)
      if (payload.mode === "instant" && (heldUnits().length > 0 || heldAnnotations().length > 0)) {
        releaseCheckpoint(`ck-instant-${randomUUID()}`, "mode_change", "instant")
      }
    } else if (type === "stream_state") {
      board.page.last_stream_state = payload.state ?? null
    }
  }

  // Everything applyEnvelope may touch: the board and the batch queue.
  function snapshotState() {
    const savedBoard = structuredClone(board)
    const savedBatches = batches.slice()
    const savedOrder = batchOrder
    return () => {
      for (const key of Object.keys(board)) delete board[key]
      Object.assign(board, savedBoard)
      for (const batch of batches.slice(savedBatches.length)) bestEffort(() => fs.rmSync(batchFile(batch.envelope.checkpoint_id), { force: true }))
      batches.length = 0
      batches.push(...savedBatches)
      batchOrder = savedOrder
      // applyEnvelope may have saved the board mid-way (releaseCheckpoint);
      // the durable copy must match the restored state.
      bestEffort(() => saveBoard())
    }
  }

  // Where the event log stood before an envelope's transaction, so a failed
  // commit can take back exactly what that envelope stored: the appended
  // line, the frame file keyed by its seq, and the bytes counted for both.
  function markLog() {
    let eventsSize = 0
    try {
      eventsSize = fs.statSync(eventsLog).size
    } catch {
      eventsSize = 0
    }
    return { eventsSize, logBytes }
  }

  function unwindLog(mark, seq) {
    bestEffort(() => {
      if (fs.existsSync(eventsLog) && fs.statSync(eventsLog).size > mark.eventsSize) fs.truncateSync(eventsLog, mark.eventsSize)
    })
    bestEffort(() => {
      for (const name of fs.readdirSync(framesDir)) {
        if (name.startsWith(`${seq}-`)) fs.rmSync(path.join(framesDir, name), { force: true })
      }
    })
    logBytes = mark.logBytes
  }

  function storeEnvelope(envelope) {
    if (envelope.type === "frame") {
      const id = typeof envelope.payload.id === "string" && envelope.payload.id ? envelope.payload.id : randomUUID()
      // Keyed by seq too: a reused frame id must not overwrite earlier evidence.
      const fileName = `${envelope.seq}-${encodeURIComponent(id)}.jpg`
      const frameFile = path.join("frames", fileName)
      const { jpeg_base64: jpeg, ...rest } = envelope.payload
      // A `dropped` frame kept its seq but not its bytes: keep the metadata,
      // write no file, and treat the image as absent.
      if (rest.dropped) {
        logEvent({ seq: envelope.seq, t: envelope.t, type: "frame", payload: rest, frame_file: null })
        return
      }
      if (typeof jpeg === "string") {
        const bytes = Buffer.from(jpeg, "base64")
        fs.writeFileSync(path.join(framesDir, fileName), bytes, { mode: 0o600 })
        logBytes += bytes.length
      }
      logEvent({ seq: envelope.seq, t: envelope.t, type: "frame", payload: rest, frame_file: frameFile })
      return
    }
    logEvent({ seq: envelope.seq, t: envelope.t, type: envelope.type, payload: envelope.payload })
  }

  // Envelopes are applied strictly in `seq` order. One that arrives ahead
  // of a gap waits in memory until the gap closes; it is not acknowledged,
  // so a restart loses nothing the page will not replay. The buffer is
  // bounded: past the cap an early envelope is dropped unacknowledged and
  // the page replays it after the gap closes.
  function admitEnvelope(envelope, bodySize) {
    const { seq } = envelope
    if (seq <= board.acked_seq || outOfOrder.has(seq)) return
    if (seq !== board.acked_seq + 1) {
      if (outOfOrder.size < OUT_OF_ORDER_CAP) {
        // Every buffered envelope is stored once the gap closes, so its bytes
        // are reserved against the caps now: the frame's whole body (posted
        // alone), or the envelope's own encoding out of a batch.
        const reserved = envelope.type === "frame" ? bodySize : Buffer.byteLength(JSON.stringify(envelope))
        outOfOrder.set(seq, { envelope, reserved })
        reservedBytes += reserved
      }
      return
    }
    let next = { envelope, reserved: 0 }
    while (next) {
      // One transaction per envelope: apply, store, save the board with the
      // advanced seq. A failure rolls everything back and leaves the seq
      // unacknowledged, so the page retries it instead of discarding an event
      // the endpoint lost. Wakes and SSE notices are held until the commit.
      const undo = snapshotState()
      const logMark = markLog()
      heldNotices = []
      try {
        applyEnvelope(next.envelope)
        storeEnvelope(next.envelope)
        board.acked_seq = next.envelope.seq
        saveBoard()
      } catch (error) {
        heldNotices = null
        undo()
        // The log is part of the transaction: a line or frame stored for a
        // seq that was never acknowledged would be stored again on retry and
        // replayed twice.
        unwindLog(logMark, next.envelope.seq)
        // A buffered envelope that failed leaves the buffer: the page retries
        // it from the returned acked_seq, and that retry must be admitted
        // rather than skipped as a duplicate of the entry still held here.
        if (outOfOrder.get(next.envelope.seq) === next) {
          outOfOrder.delete(next.envelope.seq)
          reservedBytes -= next.reserved
        }
        throw error
      }
      outOfOrder.delete(next.envelope.seq)
      reservedBytes -= next.reserved
      releaseHeldNotices()
      next = outOfOrder.get(board.acked_seq + 1)
    }
  }

  async function handleEvents(req, res, sessionId) {
    const body = await readBody(req, FRAME_BODY_LIMIT)
    // The session may have ended while this body was in flight.
    if (board.ended || board.session_id !== sessionId) {
      sendJson(res, 410, { status: "session-ended" }, corsHeaders())
      return
    }
    if (body.tooLarge) {
      sendJson(res, 413, { max_bytes: BODY_LIMIT, frame_max_bytes: FRAME_BODY_LIMIT }, corsHeaders())
      return
    }
    const parsed = parseJsonObject(body.text)
    const envelopes = Array.isArray(parsed) ? parsed : parsed ? [parsed] : null
    if (!envelopes || envelopes.length === 0) {
      sendJson(res, 400, { error: "body must be an envelope or an array of envelopes" }, corsHeaders())
      return
    }
    const loneFrame = envelopes.length === 1 && envelopes[0]?.type === "frame"
    if (!loneFrame && body.size > BODY_LIMIT) {
      sendJson(res, 413, { max_bytes: BODY_LIMIT }, corsHeaders())
      return
    }
    for (const envelope of envelopes) {
      const problem = validEnvelope(envelope, sessionId)
      if (problem === "unsupported_schema_version") {
        sendJson(res, 409, { expected_schema_version: SCHEMA_VERSION }, corsHeaders())
        return
      }
      if (problem) {
        sendJson(res, 400, { reason: problem, seq: Number.isInteger(envelope?.seq) ? envelope.seq : null }, corsHeaders())
        return
      }
      if (envelope.type === "frame" && envelopes.length > 1) {
        sendJson(res, 400, { reason: "invalid_payload", seq: envelope.seq, detail: "frame envelopes are posted alone" }, corsHeaders())
        return
      }
    }
    // The cap guards image bytes. A frame the page already dropped (`dropped`
    // set, no image kept) stores only its metadata line, and it is how the
    // page keeps the sequence moving once the cap is reached, so refusing it
    // would hold every later event behind that seq.
    const storesImage = loneFrame && !envelopes[0].payload.dropped
    if (storesImage && logBytes + reservedBytes + body.size > DISK_CAP_BYTES) {
      sendJson(res, 507, { reason: "disk_cap", stream_state: "buffering", max_bytes: DISK_CAP_BYTES, acked_seq: board.acked_seq }, corsHeaders())
      return
    }
    // The hard ceiling applies to every envelope, dropped frames included.
    if (logBytes + reservedBytes + body.size > DISK_HARD_CAP_BYTES) {
      sendJson(res, 507, { reason: "disk_cap", stream_state: "buffering", max_bytes: DISK_HARD_CAP_BYTES, acked_seq: board.acked_seq }, corsHeaders())
      return
    }
    touch()
    let storageError = null
    try {
      for (const envelope of envelopes) admitEnvelope(envelope, body.size)
    } catch (error) {
      storageError = error
    }
    broadcast("ack", { acked_seq: board.acked_seq })
    if (storageError) {
      // Whatever was acknowledged before the failure stays acknowledged;
      // the rest is retriable from acked_seq.
      sendJson(res, 500, { error: "storage_failed", code: storageError.code ?? null, acked_seq: board.acked_seq }, corsHeaders())
      return
    }
    sendJson(res, 200, { acked_seq: board.acked_seq }, corsHeaders())
  }

  function handleStream(req, res) {
    // No `Connection` header: it is hop-by-hop, and a TLS-terminating tunnel
    // (cloudflared) forwards this response over HTTP/2, where that header is
    // invalid; the edge then held the whole stream and the page never saw a
    // status. `no-transform` and `X-Accel-Buffering` tell intermediaries not
    // to buffer, and the flush pushes the headers out with the first bytes.
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
      ...corsHeaders(),
    })
    res.flushHeaders()
    res.write(":ok\n\n")
    res.write(`event: ack\ndata: ${JSON.stringify({ acked_seq: board.acked_seq })}\n\n`)
    res.write(`event: agent\ndata: ${JSON.stringify(agentState)}\n\n`)
    // A page that just reloaded, or reconnected after a flushed response,
    // reconciles its board from these: every unit the endpoint has moved,
    // with the note or guess that moved it, and any question still open.
    let replayed = false
    for (const id of board.unit_order) {
      const unit = unitById(id)
      if (!unit.released && unit.status !== "withdrawn") continue
      const status = { unit_id: id, status: unit.status }
      if (typeof unit.note === "string") status.note = unit.note
      if (typeof unit.guess === "string") status.guess = unit.guess
      res.write(`event: unit_status\ndata: ${JSON.stringify(status)}\n\n`)
      replayed = true
      if (unit.status === "needs_info" && typeof unit.question === "string") {
        res.write(`event: ask\ndata: ${JSON.stringify({ unit_id: id, question: unit.question })}\n\n`)
      }
    }
    // Notices that fell in the gap between this connection and the last.
    for (const frame of pendingDeliveries) res.write(frame)
    if (pendingDeliveries.length > 0) replayed = true
    pendingDeliveries.length = 0
    streamClients.add(res)
    // Replayed state is a delivery like any other: behind a buffering tunnel
    // the page sees it only once this response completes.
    if (replayed) scheduleStreamFlush()
    disarmPageLost()
    // The page is back, so the edit it was watched for did not take it down;
    // a later disconnect (closing the tab, navigating away) is not a loss.
    clearWatchForLoss()
    board.page.stream = "connected"
    saveBoard()
    touch()
    req.on("close", () => {
      // endSession already dropped every client; a late close must not touch
      // a board that has since reopened for a new session.
      if (!streamClients.delete(res)) return
      if (streamClients.size === 0 && !board.ended) {
        board.page.stream = "disconnected"
        // A socket close runs outside any request's error handling; a disk
        // that refuses this bookkeeping write must not take the session down.
        bestEffort(() => saveBoard())
        if (board.watch_for_loss) armPageLost()
      }
    })
  }

  async function handleMint(req, res, sessionId) {
    const body = await readBody(req, BODY_LIMIT)
    if (body.tooLarge) {
      sendJson(res, 413, { max_bytes: BODY_LIMIT }, corsHeaders())
      return
    }
    const parsed = parseJsonObject(body.text || "{}")
    if (!parsed || (parsed.session_id !== undefined && parsed.session_id !== sessionId)) {
      sendJson(res, 400, { error: "session_id must match X-Riffrec-Session" }, corsHeaders())
      return
    }
    // A loopback peer is either the local browser or a TLS-terminating
    // tunnel on this host. Any other peer must be a proxy named with
    // --trust-proxy for its X-Forwarded-Proto to count; the header alone
    // proves nothing about the transport it arrived on.
    const peer = req.socket.remoteAddress
    const forwardedProto = String(req.headers["x-forwarded-proto"] ?? "").split(",")[0].trim().toLowerCase()
    const trustedProxy = options.trustProxy.includes(String(peer ?? "").replace(/^::ffff:/, ""))
    if (!isLoopback(peer) && !(trustedProxy && forwardedProto === "https")) {
      sendJson(res, 403, { reason: "tls_required" }, corsHeaders())
      return
    }
    // A key the riffer pasted into the page wins over the environment's, so a
    // missing or rejected OPENAI_API_KEY can be fixed from the browser.
    const pastedKey = String(req.headers["x-riffrec-openai-key"] ?? "").trim()
    const apiKey = pastedKey || process.env.OPENAI_API_KEY
    if (!apiKey) {
      sendJson(res, 503, { reason: "no_key" }, corsHeaders())
      return
    }
    const brief = readBrief(options)
    if (brief && briefContainsSecret(brief)) {
      sendJson(res, 503, { reason: "brief_contains_secret" }, corsHeaders())
      return
    }
    const now = Date.now()
    while (mintTimes.length > 0 && now - mintTimes[0] > 60 * 1000) mintTimes.shift()
    if (mintInFlight) {
      sendJson(res, 429, { retry_after: 1 }, corsHeaders())
      return
    }
    if (mintTimes.length >= MINTS_PER_MINUTE) {
      sendJson(res, 429, { retry_after: Math.ceil((60 * 1000 - (now - mintTimes[0])) / 1000) }, corsHeaders())
      return
    }
    mintTimes.push(now)
    mintInFlight = true
    touch()
    try {
      const instructions = brief ? `${INTERVIEWER_PERSONA}\n\n[SESSION BRIEF]\n${brief}` : INTERVIEWER_PERSONA
      const upstreamBody = {
        expires_after: { anchor: "created_at", seconds: CLIENT_SECRET_TTL_S },
        session: {
          type: "realtime",
          model: REALTIME_MODEL,
          instructions,
          tools: INTERVIEWER_TOOLS,
          tool_choice: "auto",
          audio: {
            input: {
              transcription: { model: "gpt-4o-mini-transcribe" },
              turn_detection: { type: "semantic_vad", create_response: true, interrupt_response: true },
            },
            output: { voice: REALTIME_VOICE },
          },
        },
      }
      let upstream
      try {
        upstream = await fetch(`${OPENAI_BASE_URL}/v1/realtime/client_secrets`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify(upstreamBody),
          signal: AbortSignal.timeout(MINT_TIMEOUT_MS),
        })
      } catch {
        sendJson(res, 502, { reason: "openai_error", upstream_status: null }, corsHeaders())
        return
      }
      if (!upstream.ok) {
        // The upstream body is discarded: it may echo the request.
        await upstream.arrayBuffer().catch(() => undefined)
        sendJson(res, 502, { reason: "openai_error", upstream_status: upstream.status }, corsHeaders())
        return
      }
      const minted = await upstream.json().catch(() => null)
      const secret = typeof minted?.value === "string" ? minted.value : minted?.client_secret?.value
      const expiresAt = minted?.expires_at ?? minted?.client_secret?.expires_at ?? null
      if (!secret) {
        sendJson(res, 502, { reason: "openai_error", upstream_status: upstream.status }, corsHeaders())
        return
      }
      // The secret is minted; the audit line must not cost the page its mint.
      bestEffort(() => logAgent({ kind: "mint", session_id: sessionId, expires_at: expiresAt }))
      // The session may have ended while the upstream call was in flight.
      if (board.ended || board.session_id !== sessionId) {
        sendJson(res, 410, { status: "session-ended" }, corsHeaders())
        return
      }
      sendJson(res, 200, { client_secret: secret, expires_at: expiresAt, model: REALTIME_MODEL }, corsHeaders())
    } finally {
      mintInFlight = false
    }
  }

  function archiveExtension(contentType) {
    const type = String(contentType ?? "").split(";")[0].trim().toLowerCase()
    if (type === "application/zip") return "zip"
    if (type === "application/json") return "json"
    return "bin"
  }

  // The page's full-evidence archive is streamed to state/log/ then the
  // session ends: a final checkpoint releases anything still held and the
  // stream announces session_ended. The page token stays valid.
  function handleSessionEnd(req, res) {
    if (endingInFlight) {
      sendJson(res, 409, { error: "session_end_in_progress" }, corsHeaders())
      return
    }
    endingInFlight = true
    // The cap counts what is on disk plus what is still landing: frames held
    // ahead of a gap, frames that land while this upload runs, and this
    // archive as it streams in. The archive's bytes are reserved chunk by
    // chunk and its budget is read again at every chunk, so the archive and
    // concurrent /events frames both see one shrinking budget rather than the
    // free space each of them is filling.
    const archivePath = path.join(options.logDir, `archive.${archiveExtension(req.headers["content-type"])}`)
    const tmpPath = `${archivePath}.${randomUUID()}${ARCHIVE_PART_SUFFIX}`
    const out = fs.createWriteStream(tmpPath, { mode: 0o600 })
    let size = 0
    let tooLarge = false
    let archiveReserved = 0
    const releaseArchiveReservation = () => {
      reservedBytes -= archiveReserved
      archiveReserved = 0
    }
    // What this archive may still grow to: the body cap, or what the disk
    // cap leaves after everything stored and everything else reserved.
    const archiveBudget = () => Math.max(0, Math.min(ARCHIVE_BODY_LIMIT, DISK_CAP_BYTES - logBytes - (reservedBytes - archiveReserved)))
    let remaining = archiveBudget()
    req.on("data", (chunk) => {
      size += chunk.length
      if (tooLarge) return
      remaining = archiveBudget()
      if (size > remaining) {
        tooLarge = true
        releaseArchiveReservation()
        out.destroy()
        return
      }
      reservedBytes += chunk.length
      archiveReserved += chunk.length
      touch()
      // Pause the upload while the disk catches up; a fast sender must not
      // park the archive in process memory.
      if (!out.write(chunk)) {
        req.pause()
        out.once("drain", () => req.resume())
      }
    })
    let failed = false
    out.on("error", (error) => {
      // ENOSPC or a permission error must not take the endpoint down; the
      // session stays live and resumable and the page may retry.
      if (failed || tooLarge) return
      failed = true
      endingInFlight = false
      releaseArchiveReservation()
      req.pause()
      // The response must not depend on another write to the disk that just failed.
      sendJson(res, 500, { error: "archive_write_failed", code: error.code ?? null }, corsHeaders())
      bestEffort(() => fs.rmSync(tmpPath, { force: true }))
      bestEffort(() => logAgent({ kind: "archive_failed", error: error.code ?? error.message }))
    })
    req.on("error", () => {
      endingInFlight = false
      releaseArchiveReservation()
      out.destroy()
      bestEffort(() => fs.rmSync(tmpPath, { force: true }))
    })
    req.on("end", () => {
      if (failed) return
      if (tooLarge) {
        endingInFlight = false
        bestEffort(() => fs.rmSync(tmpPath, { force: true }))
        sendJson(res, 413, { max_bytes: remaining }, corsHeaders())
        return
      }
      out.end(() => {
        if (failed) return
        try {
          finalize()
        } catch (error) {
          // Any filesystem failure here takes the same recoverable path.
          out.emit("error", error)
        }
      })

      function finalize() {
        if (size > 0) {
          fs.renameSync(tmpPath, archivePath)
          logBytes += size
        } else {
          bestEffort(() => fs.rmSync(tmpPath, { force: true }))
        }
        // Landed bytes are counted in logBytes now, not as a reservation.
        releaseArchiveReservation()
        touch()
        // The overlay's Done control sends the `final` checkpoint before
        // /session/end; a page that ended without one still hands the agent
        // whatever is held or accepted. The fallback release and the end are
        // one transition: if ending fails, the board, the queued batch, and
        // the archive all go back to how they were, so the page's retry
        // starts from the same state and emits one final checkpoint, not two.
        const undo = snapshotState()
        heldNotices = []
        try {
          // Nothing the page sent stays unreleased past the end: a unit that
          // landed after the page's own final checkpoint goes out as a last
          // ordinary batch, so it is the agent's to finish (and holds the
          // board from draining) rather than an `initial` the next session
          // would erase.
          const held = heldUnits().length > 0 || heldAnnotations().length > 0 || board.pending_withdrawn.length > 0
          if (!board.final_emitted && (held || backlogUnits().length > 0)) {
            releaseCheckpoint(`ck-final-${randomUUID()}`, "final", board.mode)
          } else if (held) {
            releaseCheckpoint(`ck-late-${randomUUID()}`, "send", board.mode)
          }
          endSession()
        } catch (error) {
          heldNotices = null
          undo()
          // The session did not end, so the page retries with the whole
          // archive: the copy just landed is a replacement-in-waiting, not
          // stored evidence, and must not be charged against that retry.
          if (size > 0) {
            bestEffort(() => fs.rmSync(archivePath, { force: true }))
            logBytes -= size
          }
          throw error
        }
        // endSession delivered the held wake and notices as it committed; if
        // the board was already ended it did nothing, and they go out here.
        releaseHeldNotices()
        // The end is committed; the audit line must not turn it into a 500.
        bestEffort(() => logAgent({ kind: "session_end", archive: size > 0 ? path.basename(archivePath) : null, bytes: size }))
        endingInFlight = false
        sendJson(res, 200, { status: "session-ended", log_dir: options.logDir, archive_bytes: size }, corsHeaders())
      }
    })
  }

  // --- agent routes ------------------------------------------------------------

  function handleWait(req, res) {
    touch()
    if (waiter && !waiter.res.writableEnded) {
      sendJson(res, 409, { status: "wait-taken" })
      return
    }
    const parked = { res, timer: null }
    parked.timer = setTimeout(() => {
      if (waiter === parked) waiter = null
      if (!res.writableEnded) {
        res.writeHead(204)
        res.end()
      }
      agentMaybeAway()
    }, WAIT_TIMEOUT_MS)
    waiter = parked
    req.on("close", () => {
      clearTimeout(parked.timer)
      if (waiter === parked) {
        waiter = null
        agentMaybeAway()
      }
    })
    setAgentState("listening")
    fulfillWaiter()
  }

  function handleAck(req, res, checkpointId) {
    const index = batches.findIndex((batch) => batch.envelope.checkpoint_id === checkpointId)
    if (index === -1) {
      // Idempotent: a repeated ack of a batch this session already dropped is
      // still a success, so a crashed agent can safely re-ack on resume.
      if (board.acked_checkpoint_ids.includes(checkpointId)) {
        sendJson(res, 200, { ok: true, checkpoint_id: checkpointId, already_acked: true })
        return
      }
      sendJson(res, 404, { error: "unknown checkpoint" })
      return
    }
    // The acknowledgment is durable before the batch file goes: a board save
    // that fails leaves the batch in place and answers 500, so the agent
    // retries the ack; a batch file that outlives its recorded ack is dropped
    // at the next start instead of being served again.
    board.acked_checkpoint_ids.push(checkpointId)
    try {
      saveBoard()
    } catch (error) {
      board.acked_checkpoint_ids.pop()
      sendJson(res, 500, { error: "storage_failed", code: error.code ?? null, checkpoint_id: checkpointId })
      return
    }
    batches.splice(index, 1)
    bestEffort(() => fs.rmSync(batchFile(checkpointId), { force: true }))
    bestEffort(() => logAgent({ kind: "ack", checkpoint_id: checkpointId }))
    touch()
    sendJson(res, 200, { ok: true, checkpoint_id: checkpointId })
  }

  // An agent's unit transition is visible (to /status, the stream, and a
  // later board save) only once the board commit holds it. A save that
  // fails restores the unit's prior fields and answers 500, so the agent
  // retries against a board that still reads as it did before the post.
  function commitUnit(res, unit, transition) {
    const before = { ...unit }
    transition()
    try {
      saveBoard()
    } catch (error) {
      for (const key of Object.keys(unit)) delete unit[key]
      Object.assign(unit, before)
      sendJson(res, 500, { error: "storage_failed", code: error.code ?? null, unit_id: unit.id })
      return false
    }
    return true
  }

  async function handleUnitStatus(req, res, unitId) {
    const body = await readBody(req, BODY_LIMIT)
    const parsed = body.tooLarge ? null : parseJsonObject(body.text)
    if (!parsed || typeof parsed.status !== "string" || !AGENT_UNIT_STATUSES.has(parsed.status)) {
      sendJson(res, 400, { error: `status must be one of ${[...AGENT_UNIT_STATUSES].join(", ")}` })
      return
    }
    const unit = unitById(unitId)
    if (!unit) {
      sendJson(res, 404, { error: "unknown unit" })
      return
    }
    // A page withdrawal is terminal; a late agent status must not revive it.
    if (unit.status === "withdrawn") {
      sendJson(res, 409, { error: "unit withdrawn", unit_id: unitId, status: "withdrawn" })
      return
    }
    const transition = () => {
      unit.status = parsed.status
      if (typeof parsed.note === "string") unit.note = parsed.note
      if (typeof parsed.guess === "string") unit.guess = parsed.guess
    }
    if (!commitUnit(res, unit, transition)) return
    bestEffort(() => logAgent({ kind: "unit_status", unit_id: unitId, status: parsed.status, note: parsed.note ?? null, guess: parsed.guess ?? null }))
    const notice = { unit_id: unitId, status: parsed.status, ...(parsed.note !== undefined ? { note: parsed.note } : {}), ...(parsed.guess !== undefined ? { guess: parsed.guess } : {}) }
    broadcast("unit_status", notice)
    if (parsed.status === "applied") {
      broadcast("applied", { checkpoint_id: unit.checkpoint_id ?? null, unit_ids: [unitId] })
      watchForLoss()
    }
    touch()
    sendJson(res, 200, { ok: true, unit_id: unitId, status: parsed.status })
  }

  async function handleUnitAsk(req, res, unitId) {
    const body = await readBody(req, BODY_LIMIT)
    const parsed = body.tooLarge ? null : parseJsonObject(body.text)
    if (!parsed || typeof parsed.question !== "string" || !parsed.question.trim()) {
      sendJson(res, 400, { error: "question is required" })
      return
    }
    const unit = unitById(unitId)
    if (!unit) {
      sendJson(res, 404, { error: "unknown unit" })
      return
    }
    if (unit.status === "withdrawn") {
      sendJson(res, 409, { error: "unit withdrawn", unit_id: unitId, status: "withdrawn" })
      return
    }
    const transition = () => {
      unit.status = "needs_info"
      unit.question = parsed.question
    }
    if (!commitUnit(res, unit, transition)) return
    bestEffort(() => logAgent({ kind: "ask", unit_id: unitId, question: parsed.question }))
    broadcast("unit_status", { unit_id: unitId, status: "needs_info" })
    broadcast("ask", { unit_id: unitId, question: parsed.question })
    touch()
    sendJson(res, 200, { ok: true, unit_id: unitId, status: "needs_info" })
  }

  function handleStatus(req, res) {
    sendJson(res, 200, boardSummary(board, batches, logBytes))
  }

  // GET /session: the page asks, with its token alone, whether the board is
  // live or ended and whether a new session id would open a fresh board. It
  // binds nothing and is not activity, so an abandoned endpoint still idles out.
  function handleSessionProbe(req, res) {
    if (!authorizePageToken(req, res)) return
    sendJson(res, 200, {
      status: board.ended ? "ended" : "live",
      session_id: board.session_id,
      accepts_new_session: board.ended && drained(),
    }, corsHeaders())
  }

  // --- dispatch ----------------------------------------------------------------

  const PAGE_ROUTES = new Set(["/events", "/stream", "/mint", "/session/end"])

  function preflight(res) {
    res.writeHead(204, {
      ...corsHeaders(),
      "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Riffrec-Session, X-Riffrec-OpenAI-Key",
      "Access-Control-Allow-Methods": "GET, POST",
      "Access-Control-Max-Age": "600",
    })
    res.end()
  }

  async function handleRequest(req, res) {
    let urlPath
    try {
      urlPath = decodeURIComponent(req.url.split("?")[0].split("#")[0])
    } catch {
      sendJson(res, 400, { error: "bad request" })
      return
    }

    if (urlPath === "/session") {
      if (req.method === "OPTIONS") {
        preflight(res)
        return
      }
      if (req.method !== "GET") {
        sendJson(res, 405, { error: "method not allowed" }, { ...corsHeaders(), Allow: "GET, OPTIONS" })
        return
      }
      return handleSessionProbe(req, res)
    }

    if (PAGE_ROUTES.has(urlPath)) {
      if (req.method === "OPTIONS") {
        preflight(res)
        return
      }
      const expected = urlPath === "/stream" ? "GET" : "POST"
      if (req.method !== expected) {
        sendJson(res, 405, { error: "method not allowed" }, { ...corsHeaders(), Allow: `${expected}, OPTIONS` })
        return
      }
      const sessionId = authorizePage(req, res)
      if (!sessionId) return
      if (urlPath === "/events") return handleEvents(req, res, sessionId)
      if (urlPath === "/stream") return handleStream(req, res)
      if (urlPath === "/mint") return handleMint(req, res, sessionId)
      return handleSessionEnd(req, res)
    }

    const ack = urlPath.match(/^\/checkpoints\/([^/]+)\/ack$/)
    const unitStatus = urlPath.match(/^\/units\/([^/]+)\/status$/)
    const unitAsk = urlPath.match(/^\/units\/([^/]+)\/ask$/)
    const agentRoute = urlPath === "/wait" || urlPath === "/status" || ack || unitStatus || unitAsk
    if (agentRoute) {
      if (!authorizeAgent(req, res)) return
      if (req.method === "GET" && urlPath === "/wait") return handleWait(req, res)
      if (req.method === "GET" && urlPath === "/status") return handleStatus(req, res)
      if (req.method === "POST" && ack) return handleAck(req, res, ack[1])
      if (req.method === "POST" && unitStatus) return handleUnitStatus(req, res, unitStatus[1])
      if (req.method === "POST" && unitAsk) return handleUnitAsk(req, res, unitAsk[1])
      sendJson(res, 405, { error: "method not allowed" })
      return
    }

    // Nothing is served from the run directory (R40).
    sendJson(res, 404, { error: "not found" })
  }

  // Every refusal (4xx/5xx) leaves one line in agent.ndjson: method, path,
  // status, and the reason this server gave. Never the credential, never the
  // request headers or body, so a session can be debugged from its log.
  // Refusals need no credential to produce, so on a LAN or tunnel-exposed
  // endpoint they are the one write an outsider can drive: the log takes a
  // bounded number per minute, notes once that the rest of the minute is
  // suppressed, and writes nothing once the session's disk cap is reached.
  let rejectionWindowStart = 0
  let rejectionWindowCount = 0
  function logRejection(req, res) {
    const now = Date.now()
    if (now - rejectionWindowStart >= REJECTION_LOG_WINDOW_MS) {
      rejectionWindowStart = now
      rejectionWindowCount = 0
    }
    if (logBytes >= DISK_CAP_BYTES) return
    rejectionWindowCount += 1
    if (rejectionWindowCount > REJECTION_LOG_PER_WINDOW) return
    if (rejectionWindowCount === REJECTION_LOG_PER_WINDOW) {
      bestEffort(() => logAgent({ kind: "rejected_suppressed", until: rejectionWindowStart + REJECTION_LOG_WINDOW_MS, per_window: REJECTION_LOG_PER_WINDOW }))
      return
    }
    const value = res.rejection
    const record = { kind: "rejected", method: req.method ?? null, route: loggedRoute(req), status: res.statusCode, reason: rejectionReason(value) }
    if (isRecord(value) && Number.isInteger(value.seq)) record.seq = value.seq
    bestEffort(() => logAgent(record))
  }

  const server = http.createServer((req, res) => {
    res.on("finish", () => {
      if (res.statusCode >= 400) logRejection(req, res)
    })
    Promise.resolve(handleRequest(req, res)).catch(() => {
      if (!res.headersSent) sendJson(res, 500, { error: "internal error" })
      else if (!res.writableEnded) res.end()
    })
  })
  // The session archive on /session/end can take longer than Node's default
  // 5-minute request budget on a slow link.
  server.requestTimeout = 0

  const listen = (onPort) => new Promise((resolve, reject) => {
    const onError = (error) => reject(error)
    server.once("error", onError)
    server.listen(onPort, options.host, () => {
      server.off("error", onError)
      resolve()
    })
  })
  try {
    await listen(port)
  } catch (error) {
    // A resumed session prefers its old port; when something else took it,
    // any free port still resumes the session (the page learns the new
    // origin from the URL the skill hands over).
    if (options.port !== undefined || error?.code !== "EADDRINUSE") throw error
    await listen(0)
  }

  const address = server.address()
  const boundPort = typeof address === "object" && address ? address.port : port
  const urlHost = options.host === DEFAULT_HOST || options.host === "0.0.0.0" || options.host === "::" ? DEFAULT_URL_HOST : localAddressFor(options.host)
  const url = `http://${urlHost}:${boundPort}`
  // A resume rewrites only what this process changed: pid, owner_pid, url
  // (and host/port when the old port was taken). Tokens and everything else
  // are the previous session's.
  session = resuming
    ? { ...previous, url, app_origin: options.appOrigin, host: options.host, port: boundPort, trust_proxy: options.trustProxy, pid: process.pid, owner_pid: options.ownerPid ?? null, ended: Boolean(previous.ended) }
    : {
      page_token: pageToken,
      agent_token: agentToken,
      url,
      app_origin: options.appOrigin,
      host: options.host,
      port: boundPort,
      trust_proxy: options.trustProxy,
      pid: process.pid,
      owner_pid: options.ownerPid ?? null,
      ended: false,
      root: options.root,
      log_dir: options.logDir,
      started_at: new Date().toISOString(),
    }
  if (board.page.stream === "connected") board.page.stream = "disconnected"
  // A shutdown inside the grace window dropped the timer; the promise of a
  // page_lost wake survives in the board, so pick it up again.
  if (board.watch_for_loss && !board.ended) armPageLost()
  writePrivate(options.pidFile, `${process.pid}\n`)
  saveBoard()
  writePrivateJson(options.sessionFile, session)
  // The agent token never leaves the state file. This line is the start
  // envelope for `--foreground`; detached, it lands in server.log (0600).
  jsonOut({ ...publicStartEnvelope(session), status: resuming ? "resumed" : "started" })

  // Owner death, idle timeout, SIGTERM: stop the process, keep the session.
  // The board, batches, and session file are already on disk, so a later
  // `start --root` resumes with the same tokens.
  function shutdown() {
    disarmPageLost()
    if (waiter && !waiter.res.writableEnded) {
      clearTimeout(waiter.timer)
      waiter.res.writeHead(204)
      waiter.res.end()
      waiter = null
    }
    for (const client of streamClients) {
      if (!client.writableEnded) client.end()
    }
    streamClients.clear()
    server.close(() => process.exit(0))
    server.closeAllConnections()
    setTimeout(() => process.exit(0), 2000).unref()
  }
  process.on("SIGTERM", shutdown)
  process.on("SIGINT", shutdown)

  // An archive still streaming in is work in progress even with no stream
  // client attached: the idle timeout waits for it, and its chunks count
  // as activity so a slow remote link is not cut off mid-upload.
  const idleTimer = setInterval(() => {
    if (options.ownerPid && !processAlive(options.ownerPid)) shutdown()
    else if (Date.now() - lastActivity > IDLE_TIMEOUT_MS && streamClients.size === 0 && !endingInFlight) shutdown()
  }, LIFECYCLE_CHECK_MS)
  idleTimer.unref()
}

async function main() {
  let command
  try {
    const options = parseArgs(process.argv)
    command = options.command
    if (command === "start") await start(options)
    else if (command === "serve") await serve(options)
    else if (command === "stop") await stop(options)
    else if (command === "status") status(options)
    else if (command === "wait") await wait(options)
    else if (command === "replay") await replay(options)
  } catch (error) {
    console.error(error.message)
    // Wait reserves exit 1 for session-ended and 3 for wait-taken; any other failure is exit 2.
    process.exit((command ?? process.argv[2]) === "wait" ? 2 : 1)
  }
}

await main()
