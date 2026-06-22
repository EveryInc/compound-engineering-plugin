#!/usr/bin/env node
import { execFileSync, spawn } from "node:child_process"
import fs from "node:fs"
import http from "node:http"
import path from "node:path"
import { fileURLToPath } from "node:url"

const scriptPath = fileURLToPath(import.meta.url)
const DEFAULT_HOST = "127.0.0.1"
const DEFAULT_URL_HOST = "localhost"
const IDLE_TIMEOUT_MS = Number(process.env.CE_VISUAL_PROBE_IDLE_TIMEOUT_MS) || 30 * 60 * 1000
const LIFECYCLE_CHECK_MS = Number(process.env.CE_VISUAL_PROBE_LIFECYCLE_CHECK_MS) || 60 * 1000

function usage() {
  return [
    "Usage:",
    "  node visual-probe-server.js start --root <dir> [--host 127.0.0.1] [--port 0] [--foreground] [--owner-pid <pid>]",
    "  node visual-probe-server.js stop --root <dir>",
    "  node visual-probe-server.js status --root <dir>",
  ].join("\n")
}

function parseArgs(argv) {
  const command = argv[2]
  const options = {
    command,
    host: DEFAULT_HOST,
    port: 0,
    foreground: false,
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
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }

  if (!["start", "serve", "stop", "status"].includes(command)) {
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

function newestScreen(options) {
  if (!fs.existsSync(options.screensDir)) return null
  const files = fs.readdirSync(options.screensDir)
    .filter((file) => file.endsWith(".html"))
    .map((file) => {
      const filePath = path.join(options.screensDir, file)
      return { filePath, mtimeMs: fs.statSync(filePath).mtimeMs }
    })
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

function wrapFragment(options, content) {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>CE Brainstorm Visual Probe</title>
  <style>
    body { margin: 0; font-family: system-ui, -apple-system, BlinkMacSystemFont, sans-serif; background: #f7f7f8; color: #1f2328; }
    header { padding: 10px 18px; border-bottom: 1px solid #d8dee4; background: #fff; color: #57606a; font-size: 13px; }
    main { padding: 24px; }
  </style>
</head>
<body>
  <header>CE Brainstorm Visual Probe - directional sketch, reply in chat</header>
  <main>${content}</main>
  ${refreshScript(options)}
</body>
</html>`
}

function injectRefresh(options, html) {
  if (html.includes("</body>")) {
    return html.replace("</body>", `${refreshScript(options)}\n</body>`)
  }
  return `${html}\n${refreshScript(options)}`
}

function renderPage(options) {
  const screen = newestScreen(options)
  if (!screen) {
    return wrapFragment(options, "<h1>Waiting for a visual probe...</h1><p>The agent will update this page when a sketch is ready.</p>")
  }
  const html = fs.readFileSync(screen, "utf8")
  return isFullDocument(html) ? injectRefresh(options, html) : wrapFragment(options, html)
}

function safeFileResponse(options, req, res) {
  const name = decodeURIComponent(req.url.slice("/files/".length))
  const filePath = path.join(options.screensDir, path.basename(name))
  if (!fs.existsSync(filePath)) {
    res.writeHead(404)
    res.end("Not found")
    return
  }
  res.writeHead(200, { "Content-Type": contentType(filePath) })
  res.end(fs.readFileSync(filePath))
}

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase()
  if (ext === ".svg") return "image/svg+xml"
  if (ext === ".png") return "image/png"
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg"
  if (ext === ".gif") return "image/gif"
  if (ext === ".html") return "text/html; charset=utf-8"
  if (ext === ".css") return "text/css; charset=utf-8"
  if (ext === ".js") return "text/javascript; charset=utf-8"
  return "application/octet-stream"
}

async function start(options) {
  ensureDirs(options)
  options.ownerPid = options.ownerPid ?? resolveOwnerPid()
  const running = getRunningInfo(options)
  if (running) {
    jsonOut({ ...running, status: "running" })
    return
  }

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

async function serve(options) {
  ensureDirs(options)

  let lastActivity = Date.now()
  const touch = () => {
    lastActivity = Date.now()
  }

  const server = http.createServer((req, res) => {
    if (req.method === "GET" && req.url === "/") {
      touch()
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" })
      res.end(renderPage(options))
      return
    }
    if (req.method === "GET" && req.url === "/version") {
      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      })
      res.end(`${JSON.stringify(screenVersion(options))}\n`)
      return
    }
    if (req.method === "GET" && req.url.startsWith("/files/")) {
      touch()
      safeFileResponse(options, req, res)
      return
    }
    res.writeHead(404)
    res.end("Not found")
  })

  server.listen(options.port, options.host, () => {
    const address = server.address()
    const port = typeof address === "object" && address ? address.port : options.port
    const info = {
      status: "running",
      root: options.root,
      host: options.host,
      port,
      url: `http://${DEFAULT_URL_HOST}:${port}`,
      screen_dir: options.screensDir,
      state_dir: options.stateDir,
      pid: process.pid,
      owner_pid: options.ownerPid ?? null,
    }
    fs.writeFileSync(options.pidFile, `${process.pid}\n`)
    fs.writeFileSync(options.infoFile, `${JSON.stringify(info, null, 2)}\n`)
    console.log(JSON.stringify(info))
  })

  const idleTimer = setInterval(() => {
    if (options.ownerPid && !processAlive(options.ownerPid)) {
      server.close(() => process.exit(0))
    } else if (Date.now() - lastActivity > IDLE_TIMEOUT_MS) {
      server.close(() => process.exit(0))
    }
  }, LIFECYCLE_CHECK_MS)
  idleTimer.unref()
}

async function stop(options) {
  const pid = readPid(options)
  if (!processAlive(pid)) {
    fs.rmSync(options.pidFile, { force: true })
    jsonOut({ status: "stopped", root: options.root })
    return
  }
  if (!ownsServerProcess(options, pid)) {
    fs.rmSync(options.pidFile, { force: true })
    jsonOut({ status: "stopped", root: options.root })
    return
  }

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

  fs.rmSync(options.pidFile, { force: true })
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
  } catch (error) {
    console.error(error.message)
    process.exit(1)
  }
}

await main()
