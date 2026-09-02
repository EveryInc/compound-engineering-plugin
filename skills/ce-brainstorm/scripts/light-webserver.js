#!/usr/bin/env node
import { createHash, randomUUID, timingSafeEqual } from "node:crypto"
import { execFileSync, spawn } from "node:child_process"
import fs from "node:fs"
import http from "node:http"
import path from "node:path"
import { fileURLToPath } from "node:url"

const scriptPath = fileURLToPath(import.meta.url)
const assetsDir = path.join(path.dirname(scriptPath), "..", "assets")
const DEFAULT_HOST = "127.0.0.1"
const DEFAULT_URL_HOST = "localhost"
const IDLE_TIMEOUT_MS = Number(process.env.CE_LIGHT_WEB_IDLE_TIMEOUT_MS) || 30 * 60 * 1000
const LIFECYCLE_CHECK_MS = Number(process.env.CE_LIGHT_WEB_LIFECYCLE_CHECK_MS) || 60 * 1000
const WAIT_TIMEOUT_MS = Number(process.env.CE_LIGHT_WEB_WAIT_TIMEOUT_MS) || 30 * 1000
const SSE_GRACE_MS = Number(process.env.CE_LIGHT_WEB_SSE_GRACE_MS) || 5000
const BODY_LIMIT = 64 * 1024
// Reserved URL namespace for the overlay, so a screen's own /annotate.js or
// /annotate.css under screens/ is never shadowed.
const OVERLAY_PREFIX = "/__ce-annotate"
const OVERLAY_FILES = {
  [`${OVERLAY_PREFIX}/annotate.js`]: "annotate.js",
  [`${OVERLAY_PREFIX}/annotate.css`]: "annotate.css",
}
// Shared with assets/annotate.js: where the overlay keeps the session token
// for the bootstrap page to re-enter with.
const TOKEN_STORAGE_KEY = "ce-annotate-token"
// A Host header is reflected into the served document only in this shape.
const HOST_HEADER = /^[A-Za-z0-9.\-]+(:\d{1,5})?$|^\[[0-9A-Fa-f:.]+\](:\d{1,5})?$/

function usage() {
  return [
    "Usage:",
    "  node light-webserver.js start --root <dir> [--host 127.0.0.1] [--port 0] [--foreground] [--owner-pid <pid>] [--annotate]",
    "  node light-webserver.js stop --root <dir>",
    "  node light-webserver.js status --root <dir>",
    "  node light-webserver.js wait --root <dir>",
  ].join("\n")
}

function parseArgs(argv) {
  const command = argv[2]
  const options = {
    command,
    host: DEFAULT_HOST,
    port: 0,
    foreground: false,
    annotate: false,
  }

  for (let i = 3; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === "--root") {
      options.root = argv[++i]
    } else if (arg === "--host") {
      options.host = argv[++i]
    } else if (arg === "--port") {
      options.port = Number(argv[++i])
    } else if (arg === "--foreground") {
      options.foreground = true
    } else if (arg === "--owner-pid") {
      options.ownerPid = Number(argv[++i])
    } else if (arg === "--annotate") {
      options.annotate = true
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }

  if (!["start", "serve", "stop", "status", "wait"].includes(command)) {
    throw new Error(usage())
  }
  if (!options.root) {
    throw new Error("--root is required")
  }
  if (!Number.isInteger(options.port) || options.port < 0 || options.port > 65535) {
    throw new Error("--port must be an integer from 0 to 65535")
  }
  if (options.ownerPid !== undefined && (!Number.isInteger(options.ownerPid) || options.ownerPid <= 1)) {
    throw new Error("--owner-pid must be an integer greater than 1")
  }

  options.root = path.resolve(options.root)
  options.screensDir = path.join(options.root, "screens")
  options.stateDir = path.join(options.root, "state")
  options.pidFile = path.join(options.stateDir, "server.pid")
  options.infoFile = path.join(options.stateDir, "display-info.json")
  options.logFile = path.join(options.stateDir, "server.log")
  return options
}

function ensureDirs(options) {
  fs.mkdirSync(options.screensDir, { recursive: true })
  fs.mkdirSync(options.stateDir, { recursive: true })
}

function jsonOut(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`)
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"))
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

function ownsServerProcess(options, pid) {
  const args = processArgs(pid)
  // Process-command inspection is best-effort; when unavailable, fall back to
  // PID-file behavior so stop still works on platforms without a compatible ps.
  if (args === null) return true
  return args.includes(scriptPath) && args.includes("serve") && args.includes(options.root)
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

function getRunningInfo(options) {
  const pid = readPid(options)
  if (!processAlive(pid)) return null
  if (!ownsServerProcess(options, pid)) return null
  if (!fs.existsSync(options.infoFile)) return null
  return readJson(options.infoFile)
}

// Containment has to survive symlinks: path.resolve is lexical, so a link
// inside the run directory would otherwise be followed straight out of it.
// Every route that reads a file goes through this — the screen route and the
// asset route drifting apart is what left one of them unguarded before.
function containedRealPath(rootDir, candidate) {
  let root
  let real
  try {
    root = fs.realpathSync(rootDir)
    real = fs.realpathSync(candidate)
  } catch {
    return null
  }
  if (real !== root && !real.startsWith(root + path.sep)) return null
  return real
}

function newestScreen(options) {
  if (!fs.existsSync(options.screensDir)) return null
  const files = fs.readdirSync(options.screensDir)
    .filter((file) => file.endsWith(".html"))
    .map((file) => containedRealPath(options.screensDir, path.join(options.screensDir, file)))
    .filter(Boolean)
    .map((filePath) => ({ filePath, mtimeMs: fs.statSync(filePath).mtimeMs }))
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
  return files[0]?.filePath ?? null
}

function isFullDocument(html) {
  const trimmed = html.trimStart().toLowerCase()
  return trimmed.startsWith("<!doctype") || trimmed.startsWith("<html")
}

function screenVersion(options) {
  const screen = newestScreen(options)
  if (!screen) return { screen: null, mtimeMs: 0 }
  return {
    screen: path.basename(screen),
    mtimeMs: fs.statSync(screen).mtimeMs,
  }
}

function versionKey(version) {
  return `${version?.screen ?? ""}:${version?.mtimeMs ?? 0}`
}

// Annotate mode reloads the explorer's page on any change under screens/,
// including a stylesheet or script the newest screen links, so the change key
// covers every regular file there, not only the newest screen.
function screensChangeKey(options) {
  const hash = createHash("sha1")
  const walk = (dir, prefix) => {
    let entries
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const rel = `${prefix}${entry.name}`
      if (entry.isDirectory()) {
        walk(path.join(dir, entry.name), `${rel}/`)
        continue
      }
      if (!entry.isFile()) continue
      try {
        const stat = fs.statSync(path.join(dir, entry.name))
        hash.update(`${rel}:${stat.mtimeMs}:${stat.size}\n`)
      } catch {
        // Removed between readdir and stat: the next tick sees the settled tree.
      }
    }
  }
  walk(options.screensDir, "")
  return hash.digest("hex")
}

const WAITING_HTML = "<h1>Waiting for a page...</h1><p>The agent will update this page when a screen is ready.</p>"
const NO_STORE = { "Cache-Control": "no-store" }

function refreshScript(options) {
  const initialVersion = JSON.stringify(screenVersion(options))
  return `<script>
(function(){
  var currentVersion = ${initialVersion};
  function key(version) {
    return String(version && version.screen) + ":" + String(version && version.mtimeMs);
  }
  async function checkForVisualProbeUpdate() {
    try {
      var response = await fetch("/version", { cache: "no-store" });
      if (!response.ok) return;
      var nextVersion = await response.json();
      if (key(nextVersion) !== key(currentVersion)) {
        window.location.reload();
      }
    } catch (error) {
      // Keep the current sketch visible if the transient version check fails.
    }
  }
  setInterval(checkForVisualProbeUpdate, 1000);
})();
</script>`
}

// Absolute URLs on the request's own origin: a screen's <base href> would
// otherwise send root-relative overlay URLs to whatever origin it names.
function annotateBoot(origin) {
  return `<div id="ce-annotate-host"></div>
<link rel="stylesheet" href="${origin}${OVERLAY_PREFIX}/annotate.css">
<script src="${origin}${OVERLAY_PREFIX}/annotate.js"></script>`
}

// Served in place of the screen when a root navigation arrives without the
// session token, as a prototype's own href="/?variant=a" does. The overlay
// keeps the token in sessionStorage, which is scoped to this origin including
// the port, so the page re-enters with the token set and nothing leaves the
// server. A stored token the server just refused belongs to an earlier
// server on this port and is dropped rather than retried.
function bootstrapPage() {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>CE local web</title>
  <style>
    body { margin: 0; padding: 24px; font-family: system-ui, -apple-system, BlinkMacSystemFont, sans-serif; background: #f7f7f8; color: #1f2328; }
  </style>
</head>
<body>
  <p id="ce-annotate-bootstrap" hidden>This preview needs its session link. Open the URL the agent gave you.</p>
  <script>
(function(){
  var key = ${JSON.stringify(TOKEN_STORAGE_KEY)};
  var stored = null;
  try { stored = sessionStorage.getItem(key); } catch (error) {}
  var url = new URL(window.location.href);
  if (stored && url.searchParams.get("token") !== stored) {
    url.searchParams.set("token", stored);
    window.location.replace(url.toString());
    return;
  }
  try { sessionStorage.removeItem(key); } catch (error) {}
  document.getElementById("ce-annotate-bootstrap").hidden = false;
})();
  </script>
</body>
</html>`
}

function wrapFragment(options, content) {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>CE local web</title>
  <style>
    body { margin: 0; font-family: system-ui, -apple-system, BlinkMacSystemFont, sans-serif; background: #f7f7f8; color: #1f2328; }
    header { padding: 10px 18px; border-bottom: 1px solid #d8dee4; background: #fff; color: #57606a; font-size: 13px; }
    main { padding: 24px; }
  </style>
</head>
<body>
  <header>CE local web - newest screen, reloads on change</header>
  <main>${content}</main>
  ${refreshScript(options)}
</body>
</html>`
}

function wrapAnnotateFragment(content) {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>CE local web</title>
  <style>
    body { margin: 0; font-family: system-ui, -apple-system, BlinkMacSystemFont, sans-serif; background: #f7f7f8; color: #1f2328; }
    header { padding: 10px 18px; border-bottom: 1px solid #d8dee4; background: #fff; color: #57606a; font-size: 13px; }
    main { padding: 24px; }
  </style>
</head>
<body>
  <header>CE local web - newest screen</header>
  <main>${content}</main>
</body>
</html>`
}

function injectRefresh(options, html) {
  if (html.includes("</body>")) {
    return html.replace("</body>", `${refreshScript(options)}\n</body>`)
  }
  return `${html}\n${refreshScript(options)}`
}

function injectAnnotate(html, origin) {
  const boot = annotateBoot(origin)
  // The real closing tag is the last one; an earlier match may sit inside a
  // script string or comment.
  const close = html.lastIndexOf("</body>")
  if (close !== -1) {
    return `${html.slice(0, close)}${boot}\n${html.slice(close)}`
  }
  return `${html}\n${boot}`
}

// The document the annotate client sees, before the overlay is injected.
function annotateDocument(options) {
  const screen = newestScreen(options)
  if (!screen) return wrapAnnotateFragment(WAITING_HTML)
  const html = fs.readFileSync(screen, "utf8")
  return isFullDocument(html) ? html : wrapAnnotateFragment(html)
}

function renderPage(options, origin) {
  if (options.annotate) return injectAnnotate(annotateDocument(options), origin)
  const screen = newestScreen(options)
  if (!screen) return wrapFragment(options, WAITING_HTML)
  const html = fs.readFileSync(screen, "utf8")
  return isFullDocument(html) ? injectRefresh(options, html) : wrapFragment(options, html)
}

// Every credential the request presents; the gate accepts the request when any
// of them matches, so no single source shadows another.
function requestCredentials(req) {
  const url = new URL(req.url, "http://127.0.0.1")
  const auth = req.headers.authorization
  return [
    url.searchParams.get("token"),
    req.headers["x-session-token"],
    typeof auth === "string" && auth.startsWith("Bearer ") ? auth.slice(7) : null,
  ].filter((value) => typeof value === "string" && value)
}

function tokenMatches(candidate, expected) {
  if (typeof candidate !== "string" || typeof expected !== "string") return false
  const a = Buffer.from(candidate)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

function sendJson(res, status, value) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" })
  res.end(`${JSON.stringify(value)}\n`)
}

function readBody(req, limit = BODY_LIMIT) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on("data", (chunk) => {
      size += chunk.length
      if (size > limit) {
        req.destroy()
        reject(new Error("payload too large"))
        return
      }
      chunks.push(chunk)
    })
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")))
    req.on("error", reject)
  })
}

function parseAnnotation(raw) {
  if (!raw || !raw.trim()) return null
  let body
  try {
    body = JSON.parse(raw)
  } catch {
    return null
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return null
  const comment = typeof body.comment === "string" ? body.comment.trim() : ""
  const selector = typeof body.selector === "string" ? body.selector.trim() : ""
  if (!comment || !selector) return null
  const textSnippet = typeof body.textSnippet === "string" ? body.textSnippet : null
  const rect = body.rect && typeof body.rect === "object" && !Array.isArray(body.rect) ? body.rect : null
  return {
    id: randomUUID(),
    comment,
    selector,
    textSnippet,
    rect,
  }
}

function safeFileResponse(rootDir, req, res, headers = {}) {
  let name
  try {
    // A malformed percent-escape throws URIError; without this the throw is
    // uncaught in the request handler and takes the whole server down.
    name = decodeURIComponent(req.url.split("?")[0].split("#")[0])
  } catch {
    res.writeHead(400)
    res.end("Bad request")
    return
  }
  name = name.replace(/^\/+/, "")
  // Serve nested paths so a screen can keep the asset layout it was copied
  // from, but never resolve outside the run's screens directory.
  const filePath = containedRealPath(rootDir, path.resolve(rootDir, name))
  if (!filePath) {
    res.writeHead(404)
    res.end("Not found")
    return
  }
  let stat
  try {
    stat = fs.statSync(filePath)
  } catch {
    res.writeHead(404)
    res.end("Not found")
    return
  }
  // `/files/%2e` resolves to the screens directory itself, which passes an
  // existence check and then throws EISDIR on read — uncaught, killing the server.
  if (!stat.isFile()) {
    res.writeHead(404)
    res.end("Not found")
    return
  }
  res.writeHead(200, { "Content-Type": contentType(filePath), ...headers })
  res.end(fs.readFileSync(filePath))
}

// A prototype recreated from a real product brings whatever that product uses,
// so this covers the ordinary web asset set rather than an allowlist that has
// to grow every time a screen references a new kind of file.
const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
  ".wasm": "application/wasm",
}

function contentType(filePath) {
  return CONTENT_TYPES[path.extname(filePath).toLowerCase()] ?? "application/octet-stream"
}

async function start(options) {
  ensureDirs(options)
  options.ownerPid = options.ownerPid ?? resolveOwnerPid()
  const running = getRunningInfo(options)
  if (running && Boolean(running.annotate) === options.annotate) {
    jsonOut({ ...running, status: "running" })
    return
  }
  // A server in the other mode cannot serve this start: a default server has
  // no token for wait, and an annotate server would gate a default preview.
  if (running) await stopServer(options)

  fs.rmSync(options.pidFile, { force: true })
  fs.rmSync(options.infoFile, { force: true })

  if (options.foreground) {
    await serve(options)
    return
  }

  const logFd = fs.openSync(options.logFile, "a")
  const child = spawn(process.execPath, [
    scriptPath,
    "serve",
    "--root",
    options.root,
    "--host",
    options.host,
    "--port",
    String(options.port),
    ...(options.ownerPid ? ["--owner-pid", String(options.ownerPid)] : []),
    ...(options.annotate ? ["--annotate"] : []),
  ], {
    detached: true,
    stdio: ["ignore", logFd, logFd],
  })
  child.unref()
  fs.closeSync(logFd)

  const started = await waitForInfo(options, child.pid)
  if (!started) {
    throw new Error(`Server failed to start. See ${options.logFile}`)
  }
  jsonOut({ ...started, status: "started" })
}

async function waitForInfo(options, pid) {
  for (let i = 0; i < 100; i++) {
    if (fs.existsSync(options.infoFile)) return readJson(options.infoFile)
    if (pid && !processAlive(pid)) return null
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  return null
}

async function wait(options) {
  const info = getRunningInfo(options)
  if (!info?.port) {
    console.error("Server is not running")
    process.exit(2)
  }
  if (!info.token) {
    console.error("Annotation is not enabled for this server")
    process.exit(2)
  }

  const url = `http://127.0.0.1:${info.port}/wait?token=${encodeURIComponent(info.token)}`
  while (true) {
    let response
    try {
      response = await fetch(url)
    } catch {
      process.exit(2)
    }
    if (response.status === 200) {
      const text = await response.text()
      process.stdout.write(text.endsWith("\n") ? text : `${text}\n`)
      process.exit(0)
    }
    if (response.status === 410) {
      const text = await response.text()
      process.stdout.write(text.endsWith("\n") ? text : `${text}\n`)
      process.exit(1)
    }
    if (response.status === 204) continue
    process.exit(2)
  }
}

async function serve(options) {
  ensureDirs(options)

  const sessionToken = options.annotate ? randomUUID() : null
  const annotationQueue = []
  // id -> queued | working | done, in POST order. The overlay's pin status
  // follows this, never the screen changes an annotation happens to cause.
  const annotationStates = new Map()
  const waiters = []
  const sseClients = new Set()
  let sessionEnded = false
  let sawSseClient = false
  let sseGraceTimer = null
  let lastBroadcastKey = options.annotate ? screensChangeKey(options) : null
  let lastActivity = Date.now()
  const touch = () => {
    lastActivity = Date.now()
  }

  function endSession() {
    if (sessionEnded) return
    sessionEnded = true
    if (sseGraceTimer) {
      clearTimeout(sseGraceTimer)
      sseGraceTimer = null
    }
    for (const id of annotationStates.keys()) annotationStates.set(id, "done")
    broadcastAnnotations()
    const body = `${JSON.stringify({ status: "session-ended" })}\n`
    while (waiters.length > 0) {
      const parked = waiters.shift()
      clearTimeout(parked.timer)
      if (!parked.res.writableEnded) {
        parked.res.writeHead(410, { "Content-Type": "application/json; charset=utf-8" })
        parked.res.end(body)
      }
    }
    for (const client of sseClients) {
      if (!client.writableEnded) {
        client.write("event: session-ended\ndata: {}\n\n")
        client.end()
      }
    }
    sseClients.clear()
  }

  function annotationsPayload() {
    return JSON.stringify(Object.fromEntries(annotationStates))
  }

  function broadcastAnnotations() {
    const frame = `event: annotations\ndata: ${annotationsPayload()}\n\n`
    for (const client of sseClients) {
      if (!client.writableEnded) client.write(frame)
    }
  }

  // The agent asking for the next annotation is the completion signal for the
  // one it was serving; the wait CLI only re-enters after a 204 while idle.
  function completeWorking() {
    let changed = false
    for (const [id, state] of annotationStates) {
      if (state === "working") {
        annotationStates.set(id, "done")
        changed = true
      }
    }
    if (changed) broadcastAnnotations()
  }

  function serveAnnotation(res, item) {
    annotationStates.set(item.id, "working")
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" })
    res.end(`${JSON.stringify(item)}\n`)
    broadcastAnnotations()
  }

  function fulfillWaiters() {
    while (waiters.length > 0 && annotationQueue.length > 0) {
      const parked = waiters.shift()
      clearTimeout(parked.timer)
      if (parked.res.writableEnded) continue
      serveAnnotation(parked.res, annotationQueue.shift())
    }
  }

  // The client reloads on this event; the browser then owns every
  // reconciliation (head, html/body attributes, linked assets, scripts).
  function broadcastScreenChange(key) {
    lastBroadcastKey = key
    const payload = JSON.stringify({ version: key })
    for (const client of sseClients) {
      if (!client.writableEnded) {
        client.write(`event: screen-changed\ndata: ${payload}\n\n`)
      }
    }
  }

  function broadcastIfChanged() {
    const key = screensChangeKey(options)
    if (key !== lastBroadcastKey) broadcastScreenChange(key)
  }

  function authorized(req) {
    return requestCredentials(req).some((candidate) => tokenMatches(candidate, sessionToken))
  }

  function requireAnnotateToken(req, res) {
    if (authorized(req)) return true
    sendJson(res, 401, { error: "unauthorized" })
    return false
  }

  function requestOrigin(req) {
    const host = req.headers.host
    if (typeof host === "string" && HOST_HEADER.test(host)) return `http://${host}`
    return `http://${DEFAULT_URL_HOST}:${server.address().port}`
  }

  function armSseGrace() {
    if (sseGraceTimer) clearTimeout(sseGraceTimer)
    sseGraceTimer = setTimeout(() => {
      if (sseClients.size === 0) endSession()
    }, SSE_GRACE_MS)
    sseGraceTimer.unref()
  }

  async function handleRequest(req, res) {
    const urlPath = req.url.split("?")[0].split("#")[0]

    if (req.method === "GET" && urlPath === "/version") {
      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      })
      res.end(`${JSON.stringify(screenVersion(options))}\n`)
      return
    }

    if (options.annotate) {
      if (req.method === "GET" && urlPath === "/wait") {
        if (!requireAnnotateToken(req, res)) return
        if (sessionEnded) {
          sendJson(res, 410, { status: "session-ended" })
          return
        }
        broadcastIfChanged()
        completeWorking()
        if (annotationQueue.length > 0) {
          serveAnnotation(res, annotationQueue.shift())
          return
        }
        const parked = { res, timer: null }
        parked.timer = setTimeout(() => {
          const index = waiters.indexOf(parked)
          if (index !== -1) waiters.splice(index, 1)
          if (!res.writableEnded) {
            res.writeHead(204)
            res.end()
          }
        }, WAIT_TIMEOUT_MS)
        waiters.push(parked)
        req.on("close", () => {
          clearTimeout(parked.timer)
          const index = waiters.indexOf(parked)
          if (index !== -1) waiters.splice(index, 1)
        })
        return
      }

      if (req.method === "POST" && urlPath === "/annotation") {
        if (!requireAnnotateToken(req, res)) return
        if (sessionEnded) {
          sendJson(res, 410, { status: "session-ended" })
          return
        }
        let raw
        try {
          raw = await readBody(req)
        } catch {
          sendJson(res, 400, { error: "invalid annotation" })
          return
        }
        const record = parseAnnotation(raw)
        if (!record) {
          sendJson(res, 400, { error: "invalid annotation" })
          return
        }
        annotationQueue.push(record)
        annotationStates.set(record.id, "queued")
        touch()
        broadcastAnnotations()
        fulfillWaiters()
        sendJson(res, 200, { ok: true, id: record.id })
        return
      }

      if (req.method === "POST" && urlPath === "/session/end") {
        if (!requireAnnotateToken(req, res)) return
        endSession()
        sendJson(res, 200, { status: "session-ended" })
        return
      }

      if (req.method === "GET" && urlPath === "/events") {
        if (!requireAnnotateToken(req, res)) return
        if (sessionEnded) {
          sendJson(res, 410, { status: "session-ended" })
          return
        }
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        })
        res.write(":ok\n\n")
        // A client that just reloaded reconciles its pins from this frame.
        res.write(`event: annotations\ndata: ${annotationsPayload()}\n\n`)
        sawSseClient = true
        if (sseGraceTimer) {
          clearTimeout(sseGraceTimer)
          sseGraceTimer = null
        }
        sseClients.add(res)
        req.on("close", () => {
          sseClients.delete(res)
          if (sseClients.size === 0 && sawSseClient && !sessionEnded) armSseGrace()
        })
        return
      }

      if (req.method === "GET" && OVERLAY_FILES[urlPath]) {
        safeFileResponse(assetsDir, { url: `/${OVERLAY_FILES[urlPath]}` }, res, NO_STORE)
        return
      }

      if (req.method === "GET" && urlPath === "/") {
        if (!authorized(req)) {
          res.writeHead(401, {
            "Content-Type": "text/html; charset=utf-8",
            ...NO_STORE,
            "Referrer-Policy": "no-referrer",
          })
          res.end(bootstrapPage())
          return
        }
        touch()
        // A page being served is a tab loading, not the last tab closing: a
        // reload's stream reconnects only once this document's scripts run.
        if (sseGraceTimer) armSseGrace()
        // Sync the change key to what this page will render, so a stream that
        // connects right after load does not reload the same screen. Any
        // already-open stream still receives the change.
        broadcastIfChanged()
        res.writeHead(200, {
          "Content-Type": "text/html; charset=utf-8",
          ...NO_STORE,
          // The token rides in this document's URL; never let a prototype's
          // outbound link or asset carry it in a Referer.
          "Referrer-Policy": "no-referrer",
        })
        res.end(renderPage(options, requestOrigin(req)))
        return
      }
    }

    if (req.method === "GET" && urlPath === "/") {
      touch()
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" })
      res.end(renderPage(options))
      return
    }
    if (req.method === "GET") {
      touch()
      // Annotate mode reloads to pick up a revised stylesheet or script whose
      // URL did not change; a cached copy would show the old screen.
      safeFileResponse(options.screensDir, req, res, options.annotate ? NO_STORE : {})
      return
    }
    res.writeHead(404)
    res.end("Not found")
  }

  const server = http.createServer((req, res) => {
    Promise.resolve(handleRequest(req, res)).catch(() => {
      if (!res.headersSent) {
        res.writeHead(500)
        res.end("Internal error")
      }
    })
  })

  server.listen(options.port, options.host, () => {
    const address = server.address()
    const port = typeof address === "object" && address ? address.port : options.port
    const baseUrl = `http://${DEFAULT_URL_HOST}:${port}`
    const info = {
      status: "running",
      root: options.root,
      host: options.host,
      port,
      url: sessionToken ? `${baseUrl}?token=${sessionToken}` : baseUrl,
      screen_dir: options.screensDir,
      state_dir: options.stateDir,
      pid: process.pid,
      owner_pid: options.ownerPid ?? null,
      ...(sessionToken ? { token: sessionToken, annotate: true } : {}),
    }
    fs.writeFileSync(options.pidFile, `${process.pid}\n`)
    fs.writeFileSync(options.infoFile, `${JSON.stringify(info, null, 2)}\n`)
    console.log(JSON.stringify(info))
  })

  // An open change stream or parked wait is an active connection, and
  // server.close waits for those forever; end the session so they drain.
  function shutdown() {
    endSession()
    server.close(() => process.exit(0))
    server.closeAllConnections()
  }

  const idleTimer = setInterval(() => {
    if (options.ownerPid && !processAlive(options.ownerPid)) {
      shutdown()
    } else if (Date.now() - lastActivity > IDLE_TIMEOUT_MS) {
      shutdown()
    }
  }, LIFECYCLE_CHECK_MS)
  idleTimer.unref()

  if (options.annotate) {
    const changeTimer = setInterval(() => {
      if (sseClients.size > 0) broadcastIfChanged()
    }, 250)
    changeTimer.unref()
  }
}

async function stopServer(options) {
  const pid = readPid(options)
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

async function stop(options) {
  await stopServer(options)
  jsonOut({ status: "stopped", root: options.root })
}

function status(options) {
  const info = getRunningInfo(options)
  if (!info) {
    jsonOut({ status: "stopped", root: options.root })
    return
  }
  jsonOut({ ...info, status: "running" })
}

async function main() {
  try {
    const options = parseArgs(process.argv)
    if (options.command === "start") await start(options)
    else if (options.command === "serve") await serve(options)
    else if (options.command === "stop") await stop(options)
    else if (options.command === "status") status(options)
    else if (options.command === "wait") await wait(options)
  } catch (error) {
    console.error(error.message)
    process.exit(1)
  }
}

await main()
