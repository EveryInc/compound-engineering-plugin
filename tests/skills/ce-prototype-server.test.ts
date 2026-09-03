import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test"

setDefaultTimeout(20_000)
import { promises as fs } from "fs"
import http from "http"
import net from "net"
import os from "os"
import path from "path"

const serverScript = path.join(
  import.meta.dir,
  "..",
  "..",
  "skills",
  "ce-prototype",
  "scripts",
  "light-webserver.js",
)

type RunResult = {
  exitCode: number
  stdout: string
  stderr: string
}

const rootsToStop: string[] = []

async function readJsonLine(stream: ReadableStream<Uint8Array> | null): Promise<Record<string, string | number | null>> {
  expect(stream).not.toBeNull()
  const reader = stream!.getReader()
  const decoder = new TextDecoder()
  let text = ""
  const deadline = Date.now() + 3000
  while (Date.now() < deadline) {
    const { done, value } = await reader.read()
    if (done) break
    text += decoder.decode(value, { stream: true })
    const newline = text.indexOf("\n")
    if (newline !== -1) {
      return JSON.parse(text.slice(0, newline))
    }
  }
  throw new Error(`Timed out waiting for server JSON. Received: ${text}`)
}

async function runServerCommand(args: string[]): Promise<RunResult> {
  const proc = Bun.spawn(["node", serverScript, ...args], {
    stdout: "pipe",
    stderr: "pipe",
  })
  const [exitCode, stdout, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])
  return { exitCode, stdout, stderr }
}

async function startServer(
  root: string,
  extraArgs: string[] = [],
  env: Record<string, string> = {},
): Promise<Record<string, string | number | null>> {
  const proc = Bun.spawn(["node", serverScript, "start", "--root", root, "--port", "0", ...extraArgs], {
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, ...env },
  })
  const [exitCode, stdout, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])
  const result = { exitCode, stdout, stderr }
  expect(result.exitCode, result.stderr).toBe(0)
  rootsToStop.push(root)
  return JSON.parse(result.stdout.trim())
}

function overlayDocumentId(html: string): string {
  const match = html.match(/data-ce-document="([0-9a-f-]{36})"/)
  expect(match, html.slice(0, 400)).toBeTruthy()
  return match![1]
}
function annotateBoot(origin: string, page = "/", documentId?: string): string {
  const documentAttr = documentId ? ` data-ce-document="${documentId}"` : ""
  return `<script defer src="${origin}/__ce-annotate/annotate.js"${documentAttr} data-ce-page="${page}"></script>`
}
function annotateBootFrom(html: string, origin: string, page = "/"): string {
  return annotateBoot(origin, page, overlayDocumentId(html))
}
function eventsUrl(origin: string, token: unknown, documentId?: string): string {
  const url = new URL("/events", origin)
  url.searchParams.set("token", String(token))
  if (documentId) url.searchParams.set("document", documentId)
  return url.href
}
// What a browser sends when it navigates to a page, as opposed to a script's fetch.
const NAVIGATE = { "Sec-Fetch-Dest": "document", "Sec-Fetch-Mode": "navigate", Accept: "text/html,*/*;q=0.8" }

function postAnnotation(origin: string, token: unknown, body: object) {
  return fetch(`${origin}/annotation?token=${token}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

// Connection: close after a completed body, then destroy the socket. The
// overlay still has to open /events on a new connection.
function fetchDocumentClosingConnection(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { agent: false, headers: { ...NAVIGATE, Connection: "close" } }, (res) => {
      const chunks: Buffer[] = []
      res.on("data", (chunk) => {
        chunks.push(chunk)
      })
      res.on("end", () => {
        const sock = req.socket || res.socket
        req.destroy()
        sock?.destroy()
        resolve(Buffer.concat(chunks).toString("utf8"))
      })
    })
    req.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "ECONNRESET") return
      reject(err)
    })
  })
}

afterEach(async () => {
  while (rootsToStop.length > 0) {
    const root = rootsToStop.pop()!
    await runServerCommand(["stop", "--root", root])
  }
})

describe("ce-prototype light-webserver.js", () => {
  test("start writes display-info and serves the newest screen", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "ce-prototype-server-"))
    const info = await startServer(root)

    expect(info.status).toBe("started")
    expect(info.url).toMatch(/^http:\/\/localhost:\d+$/)
    expect(info.screen_dir).toBe(path.join(root, "screens"))
    expect(info.state_dir).toBe(path.join(root, "state"))

    const screenDir = String(info.screen_dir)
    await fs.writeFile(path.join(screenDir, "001-first.html"), "<h1>First slice</h1>")
    let response = await fetch(String(info.url))
    let html = await response.text()
    expect(html).toContain("First slice")
    expect(html).toContain("CE local web")
    expect(html).toContain('fetch("/version"')
    expect(html).not.toContain("WebSocket")
    expect(html).not.toContain("events")
    expect(html).not.toContain("EventSource")
    expect(html).not.toContain("annotate.js")
    expect(html).not.toContain("ce-annotate-host")

    response = await fetch(`${String(info.url)}/version`)
    let version = await response.json()
    expect(version.screen).toBe("001-first.html")

    await new Promise((resolve) => setTimeout(resolve, 20))
    await fs.writeFile(path.join(screenDir, "002-second.html"), "<h1>Second slice</h1>")
    response = await fetch(String(info.url))
    html = await response.text()
    expect(html).toContain("Second slice")
    expect(html).not.toContain("First slice")

    response = await fetch(`${String(info.url)}/version`)
    version = await response.json()
    expect(version.screen).toBe("002-second.html")
  })

  test("serves interactive fixture HTML that can show relevant state after an action", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "ce-prototype-state-"))
    const info = await startServer(root)

    await fs.writeFile(
      path.join(String(info.screen_dir), "001-state.html"),
      [
        "<!doctype html><html><body>",
        '<button id="act">Do it</button>',
        '<p id="state">idle</p>',
        "<script>",
        'document.getElementById("act").onclick = function () {',
        '  document.getElementById("state").textContent = "done";',
        "};",
        "</script>",
        "</body></html>",
      ].join(""),
    )

    const html = await (await fetch(String(info.url))).text()
    expect(html).toContain('id="state">idle')
    expect(html).toContain('textContent = "done"')
    expect(html).toContain('fetch("/version"')
    expect(html.indexOf('fetch("/version"')).toBeLessThan(html.indexOf("</body>"))
  })

  test("missing --root fails closed", async () => {
    const result = await runServerCommand(["start"])
    expect(result.exitCode).not.toBe(0)
    expect(result.stderr).toContain("--root is required")
  })

  test("status and stop use the root state directory", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "ce-prototype-status-"))
    await startServer(root)

    let result = await runServerCommand(["status", "--root", root])
    expect(result.exitCode, result.stderr).toBe(0)
    let status = JSON.parse(result.stdout.trim())
    expect(status.status).toBe("running")
    expect(status.root).toBe(root)

    result = await runServerCommand(["stop", "--root", root])
    expect(result.exitCode, result.stderr).toBe(0)
    status = JSON.parse(result.stdout.trim())
    expect(status.status).toBe("stopped")

    result = await runServerCommand(["status", "--root", root])
    expect(result.exitCode, result.stderr).toBe(0)
    status = JSON.parse(result.stdout.trim())
    expect(status.status).toBe("stopped")
  })

  test("foreground start serves until stopped", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "ce-prototype-foreground-"))
    const proc = Bun.spawn(["node", serverScript, "start", "--root", root, "--port", "0", "--foreground"], {
      stdout: "pipe",
      stderr: "pipe",
    })
    rootsToStop.push(root)

    const info = await readJsonLine(proc.stdout)
    expect(info.status).toBe("running")
    expect(info.url).toMatch(/^http:\/\/localhost:\d+$/)

    await fs.writeFile(path.join(String(info.screen_dir), "001-foreground.html"), "<h1>Foreground</h1>")
    const response = await fetch(String(info.url))
    expect(await response.text()).toContain("Foreground")

    const result = await runServerCommand(["stop", "--root", root])
    expect(result.exitCode, result.stderr).toBe(0)
    await proc.exited
  })

  test("/version polling does not keep an otherwise idle server alive", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "ce-prototype-idle-"))
    const info = await startServer(root, [], {
      // listen() starts idle before startServer() returns; 250ms lost the
      // page GET to ConnectionRefused under parallel CI (never reached /version).
      CE_LIGHT_WEB_IDLE_TIMEOUT_MS: "2000",
      CE_LIGHT_WEB_LIFECYCLE_CHECK_MS: "50",
    })

    await fs.writeFile(path.join(String(info.screen_dir), "001-first.html"), "<h1>First slice</h1>")
    await fetch(String(info.url))

    const deadline = Date.now() + 4500
    while (Date.now() < deadline) {
      try {
        await fetch(`${String(info.url)}/version`)
      } catch {
        break
      }
      await new Promise((resolve) => setTimeout(resolve, 50))
    }

    const result = await runServerCommand(["status", "--root", root])
    expect(result.exitCode, result.stderr).toBe(0)
    const status = JSON.parse(result.stdout.trim())
    expect(status.status).toBe("stopped")
  })

  test("server exits when its owner process exits", async () => {
    const owner = Bun.spawn(["node", "-e", "setInterval(() => {}, 1000)"], {
      stdout: "ignore",
      stderr: "ignore",
    })
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "ce-prototype-owner-"))

    try {
      const info = await startServer(root, ["--owner-pid", String(owner.pid)], {
        CE_LIGHT_WEB_IDLE_TIMEOUT_MS: "5000",
        CE_LIGHT_WEB_LIFECYCLE_CHECK_MS: "50",
      })
      expect(info.owner_pid).toBe(owner.pid)

      owner.kill()
      await owner.exited

      let status = { status: "running" }
      for (let i = 0; i < 20; i++) {
        const result = await runServerCommand(["status", "--root", root])
        expect(result.exitCode, result.stderr).toBe(0)
        status = JSON.parse(result.stdout.trim())
        if (status.status === "stopped") break
        await new Promise((resolve) => setTimeout(resolve, 50))
      }
      expect(status.status).toBe("stopped")
    } finally {
      owner.kill()
    }
  })

  test("annotate start writes an origin URL and injects overlay only at serve time", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "ce-prototype-annotate-"))
    const info = await startServer(root, ["--annotate"])
    const token = String(info.token)
    expect(token).toMatch(/^[0-9a-f-]{36}$/)
    expect(info.url).toBe(`http://localhost:${info.port}`)
    const displayInfo = JSON.parse(await fs.readFile(path.join(root, "state", "display-info.json"), "utf8"))
    expect(displayInfo.token).toBe(token)
    expect(displayInfo.url).toBe(info.url)

    await fs.writeFile(path.join(String(info.screen_dir), "001-screen.html"), "<h1 id=\"heading\">Pin me</h1>")
    const origin = `http://localhost:${info.port}`

    const page = await fetch(`${origin}/`)
    expect(page.status).toBe(200)
    expect(page.headers.get("referrer-policy")).toBe("no-referrer")
    expect(page.headers.get("set-cookie")).toMatch(
      new RegExp(`^ce-light-web-${info.port}=${token}; HttpOnly; SameSite=Strict; Path=/$`),
    )
    const html = await page.text()
    expect(html).toContain("Pin me")
    // Deferred overlay creates its own host and stylesheet at runtime, so the
    // served document names neither.
    const boot = annotateBootFrom(html, origin, "/001-screen.html")
    expect(html.split(boot).length).toBe(2)
    expect(html).toMatch(new RegExp(`<head>[\\s\\S]*${boot.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}[\\s\\S]*</head>`))
    expect(boot).not.toContain(token)
    expect(html).not.toContain("ce-annotate-host")
    expect(html).not.toContain("annotate.css")
    expect(html).not.toContain(token)

    // The overlay lives in a reserved namespace, ungated and never cached; a
    // screen's own /annotate.js is served from screens/ untouched.
    const overlayJs = await fetch(`${origin}/__ce-annotate/annotate.js`)
    expect(overlayJs.status).toBe(200)
    expect(overlayJs.headers.get("cache-control")).toBe("no-store")
    expect(await overlayJs.text()).toContain("ce-annotate-host")
    expect((await fetch(`${origin}/__ce-annotate/annotate.css`)).status).toBe(200)
    await fs.writeFile(path.join(String(info.screen_dir), "annotate.js"), "window.prototypeOwned = true")
    const screenJs = await fetch(`${origin}/annotate.js`)
    expect(screenJs.status).toBe(200)
    expect(await screenJs.text()).toBe("window.prototypeOwned = true")
    expect(html).not.toContain("WebSocket")
    expect(html).not.toContain('fetch("/version"')
    expect(await fs.readFile(path.join(String(info.screen_dir), "001-screen.html"), "utf8")).not.toContain("ce-annotate-host")

    await fs.writeFile(
      path.join(String(info.screen_dir), "001-screen.html"),
      "<!DOCTYPE html><html><head></head><body><main><h1 id=\"heading\">Pin me</h1></main></body></html>",
    )
    const full = await (await fetch(String(info.url))).text()
    expect(full).toMatch(/<body[^>]*>\s*<main>/)
    expect(full).not.toContain("ce-prototype-root")
    expect(full).not.toContain("CE local web")
  })

  test("annotate routes require the token and reject a bad annotation body", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "ce-prototype-annotate-auth-"))
    const info = await startServer(root, ["--annotate"])
    const origin = `http://localhost:${info.port}`
    const headers = { "Content-Type": "application/json" }

    expect((await fetch(`${origin}/wait`)).status).toBe(401)
    expect((await fetch(`${origin}/events`)).status).toBe(401)
    expect((await fetch(`${origin}/annotation`, { method: "POST", headers, body: "{}" })).status).toBe(401)
    const sameLength = `${String(info.token).slice(0, -1)}${String(info.token).endsWith("0") ? "1" : "0"}`
    expect((await fetch(`${origin}/wait?token=${sameLength}`)).status).toBe(401)
    expect((await fetch(`${origin}/wait?token=${String(info.token).slice(0, 8)}`)).status).toBe(401)
    expect(/timingSafeEqual\(/.test(await fs.readFile(serverScript, "utf8"))).toBe(false)

    const authed = `${origin}/annotation?token=${info.token}`
    expect((await fetch(authed, { method: "POST", headers, body: "" })).status).toBe(400)
    expect((await fetch(authed, { method: "POST", headers, body: "not-json" })).status).toBe(400)
    expect((await fetch(authed, { method: "POST", headers, body: "{}" })).status).toBe(400)
    expect((await fetch(authed, { method: "POST", headers, body: JSON.stringify({ comment: "x" }) })).status).toBe(400)
    expect((await fetch(authed, { method: "POST", headers, body: JSON.stringify({ selector: "h1" }) })).status).toBe(400)
  })

  test("wait reaches a server bound to a specific interface, and 127.0.0.1 when bound to every interface", async () => {
    // The POST goes through Node's own fetch in a subprocess, which ignores
    // HTTP_PROXY; the test runner's fetch may not, and a proxy cannot reach
    // a loopback alias.
    const postFromNode = async (url: string, comment: string) => {
      const proc = Bun.spawn(["node", "-e", `fetch(process.argv[1], { method: "POST", headers: { "Content-Type": "application/json" }, body: process.argv[2] }).then((r) => { console.log(r.status) }, (e) => { console.error(e); process.exit(1) })`, url, JSON.stringify({ comment, selector: "h1" })], { stdout: "pipe", stderr: "pipe" })
      const [exitCode, stdout, stderr] = await Promise.all([proc.exited, new Response(proc.stdout).text(), new Response(proc.stderr).text()])
      expect(exitCode, stderr).toBe(0)
      return Number(stdout.trim())
    }
    const roundTrip = async (host: string, postHost: string, comment: string) => {
      const root = await fs.mkdtemp(path.join(os.tmpdir(), "ce-prototype-wait-host-"))
      const info = await startServer(root, ["--annotate", "--host", host], { CE_LIGHT_WEB_WAIT_TIMEOUT_MS: "80" })
      expect(info.host).toBe(host)
      await fs.writeFile(path.join(String(info.screen_dir), "001-screen.html"), "<h1>Pin me</h1>")
      const waiting = runServerCommand(["wait", "--root", root])
      await new Promise((resolve) => setTimeout(resolve, 80))
      expect(await postFromNode(`http://${postHost}:${info.port}/annotation?token=${info.token}`, comment)).toBe(200)
      const result = await waiting
      expect(result.exitCode, result.stderr).toBe(0)
      expect(JSON.parse(result.stdout.trim()).comment).toBe(comment)
    }

    // Wildcard bind: wait talks to 127.0.0.1, which the server answers on.
    await roundTrip("0.0.0.0", "127.0.0.1", "reach me on loopback")

    // A loopback alias is bindable on Linux but not on default macOS; probe before relying on it.
    const aliasBindable = await new Promise<boolean>((resolve) => {
      const probe = net.createServer()
      probe.once("error", () => resolve(false))
      probe.listen(0, "127.0.0.2", () => probe.close(() => resolve(true)))
    })
    if (!aliasBindable) {
      console.log("skip: 127.0.0.2 is not bindable on this host; the specific-interface branch was not exercised")
      return
    }
    await roundTrip("127.0.0.2", "127.0.0.2", "reach me on the alias")
  })

  test("wait prints one annotation and session end unblocks the next wait", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "ce-prototype-wait-"))
    const info = await startServer(root, ["--annotate"])
    const origin = `http://localhost:${info.port}`
    await fs.writeFile(path.join(String(info.screen_dir), "001-screen.html"), "<h1>Pin me</h1>")
    const record = {
      comment: "more padding above this heading",
      selector: "h1",
      textSnippet: "Pin me",
      rect: { x: 12, y: 8, width: 40, height: 20 },
    }

    const waiting = runServerCommand(["wait", "--root", root])
    await new Promise((resolve) => setTimeout(resolve, 80))
    const posted = await postAnnotation(origin, info.token, record)
    expect(posted.status).toBe(200)

    const result = await waiting
    expect(result.exitCode, result.stderr).toBe(0)
    const payload = JSON.parse(result.stdout.trim())
    expect(Object.keys(payload)).toEqual(["id", "screen", "comment", "selector", "textSnippet", "rect"])
    // No page names the root, and the root is the newest screen.
    expect(payload.screen).toBe("001-screen.html")
    expect(payload.comment).toBe(record.comment)
    expect(payload.selector).toBe(record.selector)
    expect(payload.textSnippet).toBe(record.textSnippet)
    expect(payload.rect).toEqual(record.rect)

    const ending = runServerCommand(["wait", "--root", root])
    await new Promise((resolve) => setTimeout(resolve, 80))
    expect((await fetch(`${origin}/session/end?token=${info.token}`, { method: "POST" })).status).toBe(200)
    const ended = await ending
    expect(ended.exitCode, ended.stderr).toBe(1)
    expect(JSON.parse(ended.stdout.trim()).status).toBe("session-ended")
  })

  test("the record names the screen file the annotated page resolves to; a page that does not is refused", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "ce-prototype-screen-"))
    const info = await startServer(root, ["--annotate"])
    const origin = `http://localhost:${info.port}`
    const screens = String(info.screen_dir)
    await fs.mkdir(path.join(screens, "pages"))
    await fs.writeFile(path.join(screens, "details.html"), "<h1>Details</h1>")
    await fs.writeFile(path.join(screens, "pages", "part.html"), "<h2>Part</h2>")
    await fs.writeFile(path.join(screens, "styles.css"), "h1 {}")
    await fs.mkdir(path.join(root, "outside"))
    await fs.writeFile(path.join(root, "outside", "leak.html"), "<h1>Leak</h1>")
    await fs.symlink(path.join(root, "outside"), path.join(screens, "escape"))
    await new Promise((resolve) => setTimeout(resolve, 20))
    await fs.writeFile(path.join(screens, "002-home.html"), "<h1>Home</h1>")

    const post = (body: Record<string, unknown>) =>
      postAnnotation(origin, info.token, { comment: "c", selector: "h1", ...body })
    const nextRecord = async () => {
      const waited = await fetch(`${origin}/wait?token=${info.token}`)
      expect(waited.status).toBe(200)
      return waited.json()
    }

    expect((await post({ page: "/details.html" })).status).toBe(200)
    const details = await nextRecord()
    expect(Object.keys(details)).toEqual(["id", "screen", "comment", "selector", "textSnippet", "rect"])
    expect(details.screen).toBe("details.html")
    expect(details).not.toHaveProperty("page")

    expect((await post({ page: "/pages/part.html" })).status).toBe(200)
    expect((await nextRecord()).screen).toBe("pages/part.html")

    // "/" and a missing page (an older overlay) are the newest screen at that moment.
    expect((await post({ page: "/" })).status).toBe(200)
    expect((await nextRecord()).screen).toBe("002-home.html")
    expect((await post({})).status).toBe(200)
    expect((await nextRecord()).screen).toBe("002-home.html")
    const rootHtml = await (await fetch(String(info.url))).text()
    expect(rootHtml).toContain('data-ce-page="/002-home.html"')
    await new Promise((resolve) => setTimeout(resolve, 20))
    await fs.writeFile(path.join(screens, "003-next.html"), "<h1>Next</h1>")
    expect((await post({ page: "/002-home.html" })).status).toBe(200)
    expect((await nextRecord()).screen).toBe("002-home.html")
    expect((await post({ page: "/" })).status).toBe(200)
    expect((await nextRecord()).screen).toBe("003-next.html")

    // Anything that is not an HTML file under screens/ is refused, not guessed.
    for (const page of ["/nope.html", "../x", "/../outside/leak.html", "/styles.css", "/pages", "/escape/leak.html", "details.html", "/details.html?token=x", "/%ZZ", 5, null, ["/details.html"]]) {
      expect((await post({ page })).status, JSON.stringify(page)).toBe(400)
    }
  })

  test("annotate mode serves every HTML page the browser navigates to under screens/ with the overlay; fetches and assets stay raw; default mode is untouched", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "ce-prototype-linked-"))
    const info = await startServer(root, ["--annotate"])
    const origin = `http://localhost:${info.port}`
    // A linked page is ungated; the overlay is the same whether or not the request carried the session token.
    const details = '<!DOCTYPE html><html><head><link rel="stylesheet" href="/styles.css"></head><body><h1 id="detail">Details</h1></body></html>'
    await fs.mkdir(path.join(String(info.screen_dir), "pages"))
    await fs.writeFile(path.join(String(info.screen_dir), "details.html"), details)
    await fs.writeFile(path.join(String(info.screen_dir), "pages", "part.html"), "<h2>Part</h2>")
    const generated = "<!-- generated --><!DOCTYPE html><html><body><h1>Generated</h1></body></html>"
    await fs.writeFile(path.join(String(info.screen_dir), "generated.html"), generated)
    // Newest top-level .html is what / serves, unchanged: the home screen is written last.
    await new Promise((resolve) => setTimeout(resolve, 20))
    await fs.writeFile(path.join(String(info.screen_dir), "001-home.html"), '<a href="/details.html">details</a>')
    await fs.writeFile(path.join(String(info.screen_dir), "styles.css"), "h1 { color: red }")

    const page = await fetch(`${origin}/details.html`, { headers: NAVIGATE })
    expect(page.status).toBe(200)
    expect(page.headers.get("content-type")).toBe("text/html; charset=utf-8")
    expect(page.headers.get("cache-control")).toBe("no-store")
    expect(page.headers.get("referrer-policy")).toBe("no-referrer")
    const pageHtml = await page.text()
    expect(pageHtml).toBe(`<!doctype html>\n${annotateBootFrom(pageHtml, origin, "/details.html")}\n${details}`)
    // A browser that sends no fetch metadata still navigates: it accepts HTML and states no mode.
    const noMeta = await (await fetch(`${origin}/details.html`, { headers: { Accept: "text/html,application/xhtml+xml" } })).text()
    expect(noMeta).toBe(`<!doctype html>\n${annotateBootFrom(noMeta, origin, "/details.html")}\n${details}`)
    const demoToken = await (await fetch(`${origin}/details.html?token=demo`, { headers: NAVIGATE })).text()
    expect(demoToken).toBe(`<!doctype html>\n${annotateBootFrom(demoToken, origin, "/details.html")}\n${details}`)
    const sessionDetails = await (await fetch(`${origin}/details.html?token=${info.token}`, { headers: NAVIGATE })).text()
    expect(sessionDetails).toBe(`<!doctype html>\n${annotateBootFrom(sessionDetails, origin, "/details.html")}\n${details}`)
    // A comment before the doctype is still a complete document, not a fragment.
    const generatedPage = await (await fetch(`${origin}/generated.html`, { headers: NAVIGATE })).text()
    expect(generatedPage).toBe(`<!doctype html>\n${annotateBootFrom(generatedPage, origin, "/generated.html")}\n${generated}`)
    expect(generatedPage).not.toContain("CE local web")
    const homeHtml = await (await fetch(String(info.url), { headers: NAVIGATE })).text()
    expect(homeHtml).toContain(annotateBootFrom(homeHtml, origin, "/001-home.html"))

    // A fragment page gets the same shell as a fragment root screen.
    const part = await (await fetch(`${origin}/pages/part.html`, { headers: NAVIGATE })).text()
    expect(part).toContain("<h2>Part</h2>")
    expect(part).toContain("CE local web")
    expect(part).toMatch(/<head>[\s\S]*<script defer src="[^"]+\/__ce-annotate\/annotate\.js" data-ce-document="[0-9a-f-]{36}" data-ce-page="\/pages\/part\.html"><\/script>[\s\S]*<\/head>/)
    await fs.writeFile(path.join(String(info.screen_dir), "pages", "note.html"), "<!-- note --><h2>Note</h2>")
    const note = await (await fetch(`${origin}/pages/note.html`, { headers: NAVIGATE })).text()
    expect(note).toContain("<h2>Note</h2>")
    expect(note).toContain("CE local web")

    // A script fetching the same files gets them raw: a partial is not a screen.
    for (const headers of [
      { "Sec-Fetch-Dest": "empty", "Sec-Fetch-Mode": "cors", Accept: "*/*" },
      { "Sec-Fetch-Dest": "iframe", "Sec-Fetch-Mode": "navigate", Accept: "text/html" },
      { Accept: "*/*" },
      {},
    ]) {
      const raw = await fetch(`${origin}/pages/part.html`, { headers })
      expect(raw.headers.get("cache-control"), JSON.stringify(headers)).toBe("no-store")
      expect(await raw.text(), JSON.stringify(headers)).toBe("<h2>Part</h2>")
    }
    expect(await (await fetch(`${origin}/details.html`)).text()).toBe(details)
    // The root is always a document.
    const rootAsFetch = await (await fetch(String(info.url), { headers: { Accept: "*/*", "Sec-Fetch-Dest": "empty" } })).text()
    expect(rootAsFetch).toContain(annotateBootFrom(rootAsFetch, origin, "/001-home.html"))

    const css = await fetch(`${origin}/styles.css`)
    expect(css.headers.get("content-type")).toBe("text/css; charset=utf-8")
    expect(css.headers.get("cache-control")).toBe("no-store")
    expect(await css.text()).toBe("h1 { color: red }")

    // The root still serves the newest screen, not the linked page.
    const home = await (await fetch(String(info.url))).text()
    expect(home).toContain('<a href="/details.html">details</a>')
    expect(home).not.toContain("Details</h1>")

    const plainRoot = await fs.mkdtemp(path.join(os.tmpdir(), "ce-prototype-linked-plain-"))
    const plain = await startServer(plainRoot)
    await fs.writeFile(path.join(String(plain.screen_dir), "details.html"), details)
    const raw = await fetch(`http://localhost:${plain.port}/details.html`)
    expect(raw.headers.get("cache-control")).toBeNull()
    expect(await raw.text()).toBe(details)
  })

  test("an annotation whose body is still arriving when the session ends is refused, not queued", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "ce-prototype-late-body-"))
    const info = await startServer(root, ["--annotate"])
    const body = JSON.stringify({ comment: "late", selector: "h1" })
    const half = Math.floor(body.length / 2)

    const socket = net.connect(Number(info.port), "127.0.0.1")
    await new Promise<void>((resolve, reject) => {
      socket.once("connect", () => resolve())
      socket.once("error", reject)
    })
    let response = ""
    socket.on("data", (chunk) => {
      response += chunk.toString("utf8")
    })
    socket.write(
      `POST /annotation?token=${info.token} HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/json\r\nContent-Length: ${body.length}\r\nConnection: close\r\n\r\n${body.slice(0, half)}`,
    )
    await new Promise((resolve) => setTimeout(resolve, 80))
    expect(response).toBe("")

    expect((await fetch(`http://localhost:${info.port}/session/end?token=${info.token}`, { method: "POST" })).status).toBe(200)

    socket.write(body.slice(half))
    await new Promise<void>((resolve) => socket.once("close", () => resolve()))
    expect(response).toMatch(/^HTTP\/1\.1 410 /)
    expect(response).toContain('"status":"session-ended"')

    const waited = await runServerCommand(["wait", "--root", root])
    expect(waited.exitCode, waited.stderr).toBe(1)
    expect(JSON.parse(waited.stdout.trim())).toEqual({ status: "session-ended" })
  })

  test("closing the last change stream ends the session after a reconnect grace", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "ce-prototype-sse-end-"))
    const info = await startServer(root, ["--annotate"], { CE_LIGHT_WEB_SSE_GRACE_MS: "80" })
    const origin = `http://localhost:${info.port}`
    const controller = new AbortController()
    const stream = await fetch(`${origin}/events?token=${info.token}`, { signal: controller.signal })
    expect(stream.status).toBe(200)
    controller.abort()
    await new Promise((resolve) => setTimeout(resolve, 200))

    const result = await runServerCommand(["wait", "--root", root])
    expect(result.exitCode, result.stderr).toBe(1)
    expect(JSON.parse(result.stdout.trim()).status).toBe("session-ended")
  })

  test("a page load during the reconnect grace keeps the session live until the overlay reconnects", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "ce-prototype-sse-reload-"))
    const info = await startServer(root, ["--annotate"], {
      CE_LIGHT_WEB_SSE_GRACE_MS: "400",
      CE_LIGHT_WEB_WAIT_TIMEOUT_MS: "40",
    })
    const origin = `http://localhost:${info.port}`
    const controller = new AbortController()
    expect((await fetch(eventsUrl(origin, info.token), { signal: controller.signal })).status).toBe(200)
    controller.abort()
    await new Promise((resolve) => setTimeout(resolve, 200))
    const page = await fetch(String(info.url))
    expect(page.status).toBe(200)
    const documentId = overlayDocumentId(await page.text())

    // Past the original grace and past a restarted elapsed grace: the
    // replacement document stays live until /events connects again.
    await new Promise((resolve) => setTimeout(resolve, 700))
    expect((await fetch(`${origin}/wait?token=${info.token}`)).status).toBe(204)

    const reconnect = new AbortController()
    expect((await fetch(eventsUrl(origin, info.token, documentId), { signal: reconnect.signal })).status).toBe(200)
    reconnect.abort()
    await new Promise((resolve) => setTimeout(resolve, 550))
    expect((await fetch(`${origin}/wait?token=${info.token}`)).status).toBe(410)
  })

  test("a replacement document arriving before the old stream closes keeps the session live", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "ce-prototype-sse-doc-first-"))
    const info = await startServer(root, ["--annotate"], {
      CE_LIGHT_WEB_SSE_GRACE_MS: "400",
      CE_LIGHT_WEB_WAIT_TIMEOUT_MS: "40",
    })
    const origin = `http://localhost:${info.port}`
    const controller = new AbortController()
    expect((await fetch(eventsUrl(origin, info.token), { signal: controller.signal })).status).toBe(200)
    const page = await fetch(String(info.url))
    expect(page.status).toBe(200)
    const documentId = overlayDocumentId(await page.text())
    controller.abort()

    // Past a grace that the old-stream close would have started if the
    // replacement document had not suppressed it.
    await new Promise((resolve) => setTimeout(resolve, 700))
    expect((await fetch(`${origin}/wait?token=${info.token}`)).status).toBe(204)

    const reconnect = new AbortController()
    expect((await fetch(eventsUrl(origin, info.token, documentId), { signal: reconnect.signal })).status).toBe(200)
    reconnect.abort()
    await new Promise((resolve) => setTimeout(resolve, 550))
    expect((await fetch(`${origin}/wait?token=${info.token}`)).status).toBe(410)
  })

  test("a second overlay reconnect does not end the session while another document is still pending", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "ce-prototype-sse-two-docs-"))
    const info = await startServer(root, ["--annotate"], {
      CE_LIGHT_WEB_SSE_GRACE_MS: "400",
      CE_LIGHT_WEB_WAIT_TIMEOUT_MS: "40",
    })
    const origin = `http://localhost:${info.port}`
    const first = new AbortController()
    expect((await fetch(eventsUrl(origin, info.token), { signal: first.signal })).status).toBe(200)

    // Two replacement documents outstanding; only one overlay reconnects.
    const firstPage = await fetch(String(info.url))
    const secondPage = await fetch(String(info.url))
    expect(firstPage.status).toBe(200)
    expect(secondPage.status).toBe(200)
    const firstDocument = overlayDocumentId(await firstPage.text())
    const secondDocument = overlayDocumentId(await secondPage.text())
    const second = new AbortController()
    expect((await fetch(eventsUrl(origin, info.token, firstDocument), { signal: second.signal })).status).toBe(200)
    first.abort()
    second.abort()

    await new Promise((resolve) => setTimeout(resolve, 700))
    expect((await fetch(`${origin}/wait?token=${info.token}`)).status).toBe(204)

    const reconnect = new AbortController()
    expect((await fetch(eventsUrl(origin, info.token, secondDocument), { signal: reconnect.signal })).status).toBe(200)
    reconnect.abort()
    await new Promise((resolve) => setTimeout(resolve, 550))
    expect((await fetch(`${origin}/wait?token=${info.token}`)).status).toBe(410)
  })

  test("an overlay reconnect does not release a different document's pending load", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "ce-prototype-sse-bind-doc-"))
    const info = await startServer(root, ["--annotate"], {
      CE_LIGHT_WEB_SSE_GRACE_MS: "400",
      CE_LIGHT_WEB_WAIT_TIMEOUT_MS: "40",
    })
    const origin = `http://localhost:${info.port}`
    const loadedPage = await fetch(String(info.url))
    expect(loadedPage.status).toBe(200)
    const loadedDocument = overlayDocumentId(await loadedPage.text())
    const loaded = new AbortController()
    expect((await fetch(eventsUrl(origin, info.token, loadedDocument), { signal: loaded.signal })).status).toBe(200)

    const pendingPage = await fetch(String(info.url))
    expect(pendingPage.status).toBe(200)
    const pendingDocument = overlayDocumentId(await pendingPage.text())
    expect(pendingDocument).not.toBe(loadedDocument)

    const unrelated = new AbortController()
    expect((await fetch(eventsUrl(origin, info.token, loadedDocument), { signal: unrelated.signal })).status).toBe(200)
    loaded.abort()
    unrelated.abort()

    await new Promise((resolve) => setTimeout(resolve, 700))
    expect((await fetch(`${origin}/wait?token=${info.token}`)).status).toBe(204)

    const complete = new AbortController()
    expect((await fetch(eventsUrl(origin, info.token, pendingDocument), { signal: complete.signal })).status).toBe(200)
    complete.abort()
    await new Promise((resolve) => setTimeout(resolve, 550))
    expect((await fetch(`${origin}/wait?token=${info.token}`)).status).toBe(410)
  })

  test("a close-delimited replacement document stays live until the overlay connects", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "ce-prototype-sse-close-delimited-doc-"))
    const info = await startServer(root, ["--annotate"], {
      CE_LIGHT_WEB_SSE_GRACE_MS: "100",
      CE_LIGHT_WEB_WAIT_TIMEOUT_MS: "40",
    })
    const origin = `http://localhost:${info.port}`
    const controller = new AbortController()
    expect((await fetch(eventsUrl(origin, info.token), { signal: controller.signal })).status).toBe(200)

    const html = await fetchDocumentClosingConnection(String(info.url))
    const documentId = overlayDocumentId(html)
    controller.abort()

    await new Promise((resolve) => setTimeout(resolve, 250))
    const reconnect = new AbortController()
    expect((await fetch(eventsUrl(origin, info.token, documentId), { signal: reconnect.signal })).status).toBe(200)
    reconnect.abort()
    await new Promise((resolve) => setTimeout(resolve, 200))
    expect((await fetch(`${origin}/wait?token=${info.token}`)).status).toBe(410)
  })

  test("annotate pushes a screen-changed event for screen and asset edits without writing overlay into screens", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "ce-prototype-change-"))
    const info = await startServer(root, ["--annotate"])
    const screenPath = path.join(String(info.screen_dir), "001-screen.html")
    const cssPath = path.join(String(info.screen_dir), "styles.css")
    await fs.writeFile(cssPath, "#heading{color:red}")
    await fs.writeFile(screenPath, "<!DOCTYPE html><html><head><link rel=\"stylesheet\" href=\"/styles.css\"></head><body><h1 id=\"heading\">Original</h1></body></html>")
    const origin = `http://localhost:${info.port}`
    const page = await fetch(String(info.url))
    expect(page.status).toBe(200)
    // A reload must fetch the revised screen and assets, never a cached copy.
    expect(page.headers.get("cache-control")).toBe("no-store")
    const asset = await fetch(`${origin}/styles.css`)
    expect(asset.status).toBe(200)
    expect(asset.headers.get("cache-control")).toBe("no-store")
    const stream = await fetch(`${origin}/events?token=${info.token}`)
    expect(stream.status).toBe(200)
    const reader = stream.body!.getReader()
    const decoder = new TextDecoder()
    let text = ""
    const timedOut = Symbol("timed out")
    let pendingRead: Promise<ReadableStreamReadResult<Uint8Array>> | null = null
    const readUntil = async (predicate: () => boolean, ms: number) => {
      const deadline = Date.now() + ms
      while (Date.now() < deadline && !predicate()) {
        pendingRead ??= reader.read()
        const chunk = await Promise.race([
          pendingRead,
          new Promise<typeof timedOut>((resolve) => setTimeout(() => resolve(timedOut), Math.max(1, deadline - Date.now()))),
        ])
        if (chunk === timedOut) break
        pendingRead = null
        if (chunk.done) break
        text += decoder.decode(chunk.value, { stream: true })
      }
    }

    const events = () => text.split("event: screen-changed").length - 1

    // A stream opened right after the page was served must not announce the
    // screen it already shows; that reloaded (earlier: re-ran) the page on load.
    await readUntil(() => events() > 0, 700)
    expect(text).toContain(":ok")
    expect(events()).toBe(0)

    await fs.writeFile(screenPath, "<!DOCTYPE html><html><head><link rel=\"stylesheet\" href=\"/styles.css\"></head><body><h1 id=\"heading\">Revised</h1></body></html>")
    await readUntil(() => events() >= 1, 2000)
    expect(events()).toBe(1)
    // The client reloads on the event; the payload names the version only.
    expect(text).toMatch(/event: screen-changed\ndata: \{"version":"[0-9a-f]{40}"\}\n\n/)
    expect(text).not.toContain("Revised")
    expect(text).not.toContain("<h1")
    expect(await fs.readFile(screenPath, "utf8")).not.toContain("ce-annotate-host")

    // An asset the screen links changed while the screen file did not.
    await new Promise((resolve) => setTimeout(resolve, 20))
    await fs.writeFile(cssPath, "#heading{color:blue}")
    await readUntil(() => events() >= 2, 2000)
    expect(events()).toBe(2)
    const versions = [...text.matchAll(/"version":"([0-9a-f]{40})"/g)].map((match) => match[1])
    expect(new Set(versions).size).toBe(2)
    await reader.cancel()
  })

  test("visiting a document sets a cookie that authenticates gated overlay routes", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "ce-prototype-cookie-"))
    const info = await startServer(root, ["--annotate"])
    const origin = `http://localhost:${info.port}`
    await fs.writeFile(path.join(String(info.screen_dir), "001-screen.html"), "<h1>Variant home</h1>")

    const page = await fetch(`${origin}/`)
    expect(page.status).toBe(200)
    expect(await page.text()).toContain("Variant home")
    const cookie = page.headers.get("set-cookie") ?? ""
    expect(cookie).toMatch(
      new RegExp(`^ce-light-web-${info.port}=${info.token}; HttpOnly; SameSite=Strict; Path=/$`),
    )
    const pair = cookie.split(";")[0]

    const navigated = await fetch(`${origin}/?variant=a`)
    expect(navigated.status).toBe(200)
    expect(await navigated.text()).toContain("Variant home")
    expect((await fetch(`${origin}/events`, { headers: { cookie: pair } })).status).toBe(200)
    expect((await fetch(`${origin}/events`)).status).toBe(401)
    expect((await fetch(`${origin}/wait`)).status).toBe(401)

    const demo = await fetch(`${origin}/?token=demo`)
    expect(demo.status).toBe(200)
    const demoHtml = await demo.text()
    expect(demoHtml).toContain("Variant home")
    expect(demoHtml).not.toContain(String(info.token))
  })

  test("start in the other mode replaces the running server instead of reusing it", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "ce-prototype-mode-"))
    const plain = await startServer(root)
    expect(plain.status).toBe("started")
    expect(plain.token).toBeUndefined()

    const annotated = await startServer(root, ["--annotate"], { CE_LIGHT_WEB_WAIT_TIMEOUT_MS: "200" })
    expect(annotated.status).toBe("started")
    expect(annotated.pid).not.toBe(plain.pid)
    expect(String(annotated.token)).toMatch(/^[0-9a-f-]{36}$/)
    expect(String(annotated.url)).toBe(`http://localhost:${annotated.port}`)
    const waited = await fetch(`http://localhost:${annotated.port}/wait?token=${annotated.token}`)
    expect(waited.status).toBe(204)
    await expect(fetch(`http://localhost:${plain.port}/version`)).rejects.toThrow()

    const reused = await startServer(root, ["--annotate"])
    expect(reused.status).toBe("running")
    expect(reused.pid).toBe(annotated.pid)

    expect((await fetch(`http://localhost:${annotated.port}/session/end?token=${annotated.token}`, { method: "POST" })).status).toBe(200)
    const restarted = await startServer(root, ["--annotate"], { CE_LIGHT_WEB_WAIT_TIMEOUT_MS: "200" })
    expect(restarted.status).toBe("started")
    expect(restarted.pid).not.toBe(annotated.pid)
    expect(String(restarted.token)).toMatch(/^[0-9a-f-]{36}$/)
    expect((await fetch(`http://localhost:${restarted.port}/wait?token=${restarted.token}`)).status).toBe(204)

    const back = await startServer(root)
    expect(back.status).toBe("started")
    expect(back.pid).not.toBe(annotated.pid)
    expect(back.token).toBeUndefined()
    expect(String(back.url)).toMatch(/^http:\/\/localhost:\d+$/)
    expect((await fetch(String(back.url))).status).toBe(200)
    await expect(fetch(`http://localhost:${annotated.port}/version`)).rejects.toThrow()
  })

  test("overlay asset URLs are absolute on the request origin so a screen's <base> cannot redirect them", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "ce-prototype-base-"))
    const info = await startServer(root, ["--annotate"])
    const origin = `http://localhost:${info.port}`
    const authored = '<!DOCTYPE html><html><head><base href="https://example.invalid/"></head><body><h1>Based</h1></body></html>'
    await fs.writeFile(path.join(String(info.screen_dir), "001-screen.html"), authored)
    const html = await (await fetch(String(info.url))).text()
    // A full document is served verbatim behind our doctype and the deferred
    // boot; nothing in the authored text is located or rewritten.
    expect(html).toBe(`<!doctype html>\n${annotateBootFrom(html, origin, "/001-screen.html")}\n${authored}`)
    expect(html).not.toContain('src="/__ce-annotate')

    // So a "</body>" literal in a script string or a trailing comment, or a
    // leading BOM, cannot mislead the boot.
    const literalDoc = '<!DOCTYPE html><html><body><script>const closing = "</body>"</script><h1>Literal</h1></body></html><!-- marker: </body> -->'
    // The root serves the newest mtime; a write in the same filesystem tick as the previous screen ties.
    await new Promise((resolve) => setTimeout(resolve, 20))
    await fs.writeFile(path.join(String(info.screen_dir), "002-screen.html"), `\uFEFF${literalDoc}`)
    const literal = await (await fetch(String(info.url))).text()
    expect(literal).toBe(`<!doctype html>\n${annotateBootFrom(literal, origin, "/002-screen.html")}\n${literalDoc}`)

    await new Promise((resolve) => setTimeout(resolve, 20))
    const prologued = "<!-- generated -->\n<!DOCTYPE html><html><body><h1>Prologued</h1></body></html>"
    await fs.writeFile(path.join(String(info.screen_dir), "003-screen.html"), prologued)
    const prologuedHtml = await (await fetch(String(info.url))).text()
    expect(prologuedHtml).toBe(`<!doctype html>\n${annotateBootFrom(prologuedHtml, origin, "/003-screen.html")}\n${prologued}`)
    expect(prologuedHtml).not.toContain("CE local web")

    // A Host header that cannot be reflected safely falls back to the listen address.
    const odd = await fetch(String(info.url), { headers: { host: 'evil"><script>' } })
    expect(odd.status).toBe(200)
    const oddHtml = await odd.text()
    expect(oddHtml).toContain(annotateBootFrom(oddHtml, `http://localhost:${info.port}`, "/003-screen.html"))
    expect(oddHtml).not.toContain('evil"')

    const overlay = await fs.readFile(path.join(import.meta.dir, "..", "..", "skills", "ce-prototype", "assets", "annotate.js"), "utf8")
    expect(overlay).toContain('new URL("/__ce-annotate/annotate.css", document.currentScript?.src || window.location.origin)')
    expect(overlay).toContain('document.createElement("ce-annotate-host")')
    expect(overlay).not.toContain("getRandomValues")
  })

  test("idle shutdown ends the session instead of hanging on an open change stream", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "ce-prototype-sse-idle-"))
    const info = await startServer(root, ["--annotate"], {
      CE_LIGHT_WEB_IDLE_TIMEOUT_MS: "250",
      CE_LIGHT_WEB_LIFECYCLE_CHECK_MS: "50",
    })
    const origin = `http://localhost:${info.port}`
    const stream = await fetch(`${origin}/events?token=${info.token}`)
    expect(stream.status).toBe(200)
    const text = await stream.text()
    expect(text).toContain("event: session-ended")

    let status = { status: "running" }
    for (let i = 0; i < 20; i++) {
      status = JSON.parse((await runServerCommand(["status", "--root", root])).stdout.trim())
      if (status.status === "stopped") break
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    expect(status.status).toBe("stopped")
  })

  test("idle shutdown flushes a parked wait as session-ended", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "ce-prototype-wait-idle-"))
    const info = await startServer(root, ["--annotate"], {
      CE_LIGHT_WEB_IDLE_TIMEOUT_MS: "400",
      CE_LIGHT_WEB_LIFECYCLE_CHECK_MS: "30",
      CE_LIGHT_WEB_WAIT_TIMEOUT_MS: "5000",
    })
    const origin = `http://localhost:${info.port}`
    // Root GET is activity, so idle is measured from a parked waiter rather
    // than from listen() racing a separate Node `wait` process.
    await fetch(String(info.url))
    const parked = fetch(`${origin}/wait?token=${info.token}`)
    const ended = await parked
    expect(ended.status).toBe(410)
    expect(await ended.json()).toEqual({ status: "session-ended" })
  })

  test("stop flushes a parked wait as session-ended", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "ce-prototype-wait-stop-"))
    const info = await startServer(root, ["--annotate"], {
      CE_LIGHT_WEB_WAIT_TIMEOUT_MS: "8000",
    })
    const waiting = runServerCommand(["wait", "--root", root])
    await fetch(String(info.url))
    const stopped = await runServerCommand(["stop", "--root", root])
    expect(stopped.exitCode, stopped.stderr).toBe(0)
    const ended = await waiting
    expect(ended.exitCode, ended.stderr).toBe(1)
    expect(JSON.parse(ended.stdout.trim()).status).toBe("session-ended")
  })

  test("wait reports session-ended after idle already stopped the process", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "ce-prototype-wait-after-idle-"))
    await startServer(root, ["--annotate"], {
      CE_LIGHT_WEB_IDLE_TIMEOUT_MS: "80",
      CE_LIGHT_WEB_LIFECYCLE_CHECK_MS: "20",
    })
    let status = { status: "running" }
    for (let i = 0; i < 40; i++) {
      status = JSON.parse((await runServerCommand(["status", "--root", root])).stdout.trim())
      if (status.status === "stopped") break
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    expect(status.status).toBe("stopped")
    const ended = await runServerCommand(["wait", "--root", root])
    expect(ended.exitCode, ended.stderr).toBe(1)
    expect(JSON.parse(ended.stdout.trim()).status).toBe("session-ended")
  })

  test("annotation POST resets idle timeout while wait and /version do not", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "ce-prototype-annotate-idle-"))
    const info = await startServer(root, ["--annotate"], {
      CE_LIGHT_WEB_IDLE_TIMEOUT_MS: "600",
      CE_LIGHT_WEB_LIFECYCLE_CHECK_MS: "50",
      CE_LIGHT_WEB_WAIT_TIMEOUT_MS: "80",
    })
    const origin = `http://localhost:${info.port}`
    await fs.writeFile(path.join(String(info.screen_dir), "001-screen.html"), "<h1>Idle</h1>")
    await fetch(String(info.url))

    await new Promise((resolve) => setTimeout(resolve, 400))
    await postAnnotation(origin, info.token, { comment: "keep alive", selector: "h1" })

    // Past the original idle budget, so only the POST can explain a live server.
    // /version is not activity, so probing with it cannot extend the budget.
    await new Promise((resolve) => setTimeout(resolve, 300))
    expect((await fetch(`${origin}/version`)).status).toBe(200)

    const deadline = Date.now() + 1500
    while (Date.now() < deadline) {
      try {
        await fetch(`${origin}/version`)
        await fetch(`${origin}/wait?token=${info.token}`)
      } catch {
        break
      }
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    const status = JSON.parse((await runServerCommand(["status", "--root", root])).stdout.trim())
    expect(status.status).toBe("stopped")
  })

  test("overlay arms comments only when the tool is on and End preview ends the session", async () => {
    const overlay = await fs.readFile(path.join(import.meta.dir, "..", "..", "skills", "ce-prototype", "assets", "annotate.js"), "utf8")
    expect(overlay).toContain("let commentToolOn = false")
    expect(overlay).toMatch(/if \(!commentToolOn \|\| sessionEnded\) return/)
    expect(overlay).toContain('tokenUrl("/session/end")')
    expect(overlay).toContain("target-gone")
    expect(overlay).toContain("EventSource")
    expect(overlay).toContain("ce-prototype-root")
    expect(overlay).toContain('if (el === document.body) return "body"')
    expect(overlay).toContain(">Annotate</button>")
    expect(overlay).toContain('aria-label="End preview and return to chat"')
    expect(overlay).toContain("<svg")
    expect(overlay).not.toContain(">End preview</button>")
    expect(overlay).not.toContain(">Comment</button>")
    expect(overlay).not.toContain(">Done</button>")
    expect(overlay).not.toContain(">Stop</button>")
    expect(overlay).toContain("Could not end preview — retry")
    expect(overlay).toContain('pin.status === "pending" || pin.status === "working"')
    expect(overlay).toContain('addEventListener("scroll", reattachPins')
    expect(overlay).toContain("new ResizeObserver(reattachPins)")
    expect(overlay).toContain("new MutationObserver(reattachPins)")
    expect(overlay).toContain("EventSource.CLOSED")
    // Every screen change reloads the document with the pins carried across;
    // the overlay never reconciles DOM, head, or scripts itself.
    expect(overlay).toContain('addEventListener("screen-changed"')
    expect(overlay).toContain("sessionStorage.setItem(STATE_KEY")
    expect(overlay).toContain("window.location.replace(servedPage)")
    expect(overlay).not.toContain("window.location.reload()")
    // Pin status follows the helper's annotation lifecycle, never a reload;
    // an open draft survives a reload; a reload waits for an in-flight POST.
    expect(overlay).toContain('addEventListener("annotations"')
    expect(overlay).toContain('{ queued: "pending", working: "working", done: "attached" }')
    expect(overlay).not.toContain("advancePinsAfterRevision")
    expect(overlay).toMatch(/draft: draft \? \{ \.\.\.draft, text: commentField\.value/)
    expect(overlay).toMatch(/if \(inFlight\) \{\n\s+reloadPending = true/)
    expect(overlay).toContain("if (reloadPending && !sessionEnded) requestReload()")
    // Cancel or toggling the tool off during an in-flight POST must not break
    // the pending submission: it is snapshotted before the await, Cancel is
    // disabled, and closing the composer does not reset inFlight.
    expect(overlay).toContain("cancel.disabled = inFlight")
    const submitHandler = overlay.slice(overlay.indexOf('composer.addEventListener("submit"'), overlay.indexOf('stop.addEventListener("click"'))
    expect(submitHandler).toContain("await fetch(")
    expect(submitHandler.slice(submitHandler.indexOf("await "))).not.toMatch(/\bdraft\b/)
    expect(submitHandler).toMatch(/catch \{\n\s+if \(!sessionEnded\) \{/)
    expect(submitHandler).toContain('error.textContent = "Could not send — retry"')
    const closeComposer = overlay.slice(overlay.indexOf("function closeComposer("), overlay.indexOf("function renderPins()"))
    expect(closeComposer).not.toContain("inFlight = false")
    expect(overlay).toContain("closeComposer(inFlight)")
    expect(overlay).toContain('addEventListener("click", () => closeComposer())')
    expect(overlay).toContain("composer.hidden = false")
    expect(overlay).toContain('document.createElement("ce-annotate-host")')
    expect(overlay).not.toContain("getRandomValues")
    expect(overlay).not.toContain("randomUUID")
    expect(overlay).not.toMatch(/host\.(id|className) =/)
    expect(overlay).toContain("Math.max(0, Math.min(x + 12, window.innerWidth - width))")
    // Parented on <html>, fixed and click-through, so it is outside every
    // body-scoped selector, document.body.children, and the authored layout.
    expect(overlay).toContain("document.documentElement.appendChild(host)")
    expect(overlay).not.toContain("document.body.appendChild(")
    expect(overlay).toMatch(/host\.style\.cssText =\s*"display: block; position: fixed; inset: 0; pointer-events: none; z-index: \d+;/)
    // z-index cannot beat dialog.showModal(); a manual popover is the top layer.
    expect(overlay).toContain('setAttribute("popover", "manual")')
    expect(overlay).toContain("showPopover")
    expect(overlay).toContain("hidePopover")
    expect(overlay).toContain('nodeName === "DIALOG"')
    // The pin and the reload name the screen the helper served, not a History API pathname.
    expect(overlay).toContain('document.currentScript?.getAttribute("data-ce-page") || "/"')
    expect(overlay).toContain('document.currentScript?.getAttribute("data-ce-document") || ""')
    expect(overlay).toContain('tokenUrl("/events", { document: servedDocument })')
    expect(overlay).toContain("page: servedPage,")
    expect(overlay).toContain("window.location.replace(servedPage)")
    expect(overlay).not.toContain("window.location.pathname")
    const css = await fs.readFile(path.join(import.meta.dir, "..", "..", "skills", "ce-prototype", "assets", "annotate.css"), "utf8")
    expect(css).toMatch(/:host \{\n  position: fixed;\n  inset: 0;\n  pointer-events: none;/)
    expect(css).toMatch(/\.ce-annotate-chrome \{[^}]*pointer-events: auto;/)
    expect(css).toMatch(/\.ce-annotate-chrome \{[^}]*background: #fff;/)
    expect(css).toMatch(/\.ce-annotate-chrome \{[^}]*box-shadow:/)
    expect(css).toMatch(/\.ce-annotate-composer \{[^}]*pointer-events: auto;/)
    expect(css).toMatch(/\.ce-annotate-composer \{[^}]*box-sizing: border-box;/)
    expect(css).toMatch(/\.ce-annotate-composer \{[^}]*max-width: 100vw;/)
    expect(overlay).not.toContain("getElementById(\"ce-annotate-host\")")
    expect(overlay).not.toContain("#ce-annotate-host")
    expect(overlay).toContain("if (host.contains(target)) return")
    expect(overlay).toContain("event.composedPath().includes(host)")
    expect(overlay).not.toContain("DOMParser")
    expect(overlay).not.toContain("adoptNode")
    expect(overlay).not.toMatch(/\bmorph\b/i)
    expect(overlay).not.toMatch(/WebSocket/)
  })

  test("queued annotations stay in the helper until the next wait", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "ce-prototype-queue-"))
    const info = await startServer(root, ["--annotate"])
    const origin = `http://localhost:${info.port}`
    await fs.writeFile(path.join(String(info.screen_dir), "001-screen.html"), "<h1>Queue</h1>")
    expect((await postAnnotation(origin, info.token, { comment: "first", selector: "h1" })).status).toBe(200)
    expect((await postAnnotation(origin, info.token, { comment: "second", selector: "h2" })).status).toBe(200)

    const first = await runServerCommand(["wait", "--root", root])
    expect(first.exitCode, first.stderr).toBe(0)
    expect(JSON.parse(first.stdout.trim()).comment).toBe("first")

    const second = await runServerCommand(["wait", "--root", root])
    expect(second.exitCode, second.stderr).toBe(0)
    expect(JSON.parse(second.stdout.trim()).comment).toBe("second")
  })

  test("ending a session does not mark undelivered queued annotations done", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "ce-prototype-end-queue-"))
    const info = await startServer(root, ["--annotate"])
    const origin = `http://localhost:${info.port}`
    await fs.writeFile(path.join(String(info.screen_dir), "001-screen.html"), "<h1>Queue</h1>")
    const first = await (await postAnnotation(origin, info.token, { comment: "first", selector: "h1" })).json()
    const second = await (await postAnnotation(origin, info.token, { comment: "second", selector: "h2" })).json()
    const stream = await fetch(`${origin}/events?token=${info.token}`)
    expect((await fetch(`${origin}/session/end?token=${info.token}`, { method: "POST" })).status).toBe(200)
    const text = await stream.text()
    const frames = [...text.matchAll(/event: annotations\ndata: (\{[^\n]*\})\n/g)].map((match) => JSON.parse(match[1]))
    const last = frames.at(-1)
    expect(last[first.id]).toBe("queued")
    expect(last[second.id]).toBe("queued")
    expect(last[first.id]).not.toBe("done")
    const ended = await runServerCommand(["wait", "--root", root])
    expect(ended.exitCode, ended.stderr).toBe(1)
    expect(JSON.parse(ended.stdout.trim()).status).toBe("session-ended")
  })

  test("annotation lifecycle follows POST, wait, and re-entering wait, and is streamed to the overlay", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "ce-prototype-lifecycle-"))
    const info = await startServer(root, ["--annotate"], { CE_LIGHT_WEB_WAIT_TIMEOUT_MS: "40" })
    const origin = `http://localhost:${info.port}`
    await fs.writeFile(path.join(String(info.screen_dir), "001-screen.html"), "<h1>Lifecycle</h1>")
    const post = async (comment: string) => {
      const response = await postAnnotation(origin, info.token, { comment, selector: "h1" })
      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body.id).toMatch(/^[0-9a-f-]{36}$/)
      return body.id as string
    }
    const wait = async () => {
      const response = await fetch(`${origin}/wait?token=${info.token}`)
      return response.status === 200 ? await response.json() : null
    }
    const lifecycle = async () => {
      const controller = new AbortController()
      const stream = await fetch(`${origin}/events?token=${info.token}`, { signal: controller.signal })
      const reader = stream.body!.getReader()
      let text = ""
      while (!/event: annotations\ndata: .*\n\n/.test(text)) {
        const chunk = await reader.read()
        if (chunk.done) break
        text += new TextDecoder().decode(chunk.value)
      }
      controller.abort()
      return JSON.parse(text.match(/event: annotations\ndata: (.*)\n\n/)![1])
    }

    const first = await post("first")
    const second = await post("second")
    expect(await lifecycle()).toEqual({ [first]: "queued", [second]: "queued" })

    const served = await wait()
    expect(served.id).toBe(first)
    expect(served.comment).toBe("first")
    expect(await lifecycle()).toEqual({ [first]: "working", [second]: "queued" })

    // Re-entering wait completes the served annotation and serves the next.
    expect((await wait()).id).toBe(second)
    expect(await lifecycle()).toEqual({ [first]: "done", [second]: "working" })

    // A 204 wait while idle completes the last one; nothing else is served.
    expect(await wait()).toBeNull()
    expect(await lifecycle()).toEqual({ [first]: "done", [second]: "done" })

    const third = await post("third")
    expect(await lifecycle()).toEqual({ [first]: "done", [second]: "done", [third]: "queued" })
    await fetch(`${origin}/session/end?token=${info.token}`, { method: "POST" })
    expect((await fetch(`${origin}/wait?token=${info.token}`)).status).toBe(410)
  })
})
