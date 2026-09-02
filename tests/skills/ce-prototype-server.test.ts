import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test"

setDefaultTimeout(20_000)
import { promises as fs } from "fs"
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
      CE_LIGHT_WEB_IDLE_TIMEOUT_MS: "250",
      CE_LIGHT_WEB_LIFECYCLE_CHECK_MS: "50",
    })

    await fs.writeFile(path.join(String(info.screen_dir), "001-first.html"), "<h1>First slice</h1>")
    await fetch(String(info.url))

    const deadline = Date.now() + 700
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

  test("annotate start writes a token URL and injects overlay only at serve time", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "ce-prototype-annotate-"))
    const info = await startServer(root, ["--annotate"])
    const token = String(info.token)
    expect(token).toMatch(/^[0-9a-f-]{36}$/)
    expect(info.url).toBe(`http://localhost:${info.port}?token=${token}`)
    expect(JSON.parse(await fs.readFile(path.join(root, "state", "display-info.json"), "utf8")).token).toBe(token)

    await fs.writeFile(path.join(String(info.screen_dir), "001-screen.html"), "<h1 id=\"heading\">Pin me</h1>")
    const origin = `http://localhost:${info.port}`

    const denied = await fetch(`${origin}/`)
    expect(denied.status).toBe(401)
    expect(await denied.text()).not.toContain(token)

    const page = await fetch(String(info.url))
    expect(page.headers.get("referrer-policy")).toBe("no-referrer")
    const html = await page.text()
    expect(html).toContain("Pin me")
    expect(html).toContain("ce-annotate-host")
    expect(html).toContain(`src="${origin}/__ce-annotate/annotate.js"`)
    expect(html).toContain(`href="${origin}/__ce-annotate/annotate.css"`)
    expect(html).not.toContain(token)
    expect(page.headers.get("set-cookie")).toBeNull()

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
    expect(/timingSafeEqual\(/.test(await fs.readFile(serverScript, "utf8"))).toBe(true)

    const authed = `${origin}/annotation?token=${info.token}`
    expect((await fetch(authed, { method: "POST", headers, body: "" })).status).toBe(400)
    expect((await fetch(authed, { method: "POST", headers, body: "not-json" })).status).toBe(400)
    expect((await fetch(authed, { method: "POST", headers, body: "{}" })).status).toBe(400)
    expect((await fetch(authed, { method: "POST", headers, body: JSON.stringify({ comment: "x" }) })).status).toBe(400)
    expect((await fetch(authed, { method: "POST", headers, body: JSON.stringify({ selector: "h1" }) })).status).toBe(400)
  })

  test("wait prints one annotation and session end unblocks the next wait", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "ce-prototype-wait-"))
    const info = await startServer(root, ["--annotate"])
    const origin = `http://localhost:${info.port}`
    const record = {
      comment: "more padding above this heading",
      selector: "h1",
      textSnippet: "Pin me",
      rect: { x: 12, y: 8, width: 40, height: 20 },
    }

    const waiting = runServerCommand(["wait", "--root", root])
    await new Promise((resolve) => setTimeout(resolve, 80))
    const posted = await fetch(`${origin}/annotation?token=${info.token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(record),
    })
    expect(posted.status).toBe(200)

    const result = await waiting
    expect(result.exitCode, result.stderr).toBe(0)
    const payload = JSON.parse(result.stdout.trim())
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

  test("a page load during the reconnect grace restarts it, so a reload does not end the session", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "ce-prototype-sse-reload-"))
    const info = await startServer(root, ["--annotate"], {
      CE_LIGHT_WEB_SSE_GRACE_MS: "400",
      CE_LIGHT_WEB_WAIT_TIMEOUT_MS: "40",
    })
    const origin = `http://localhost:${info.port}`
    const controller = new AbortController()
    expect((await fetch(`${origin}/events?token=${info.token}`, { signal: controller.signal })).status).toBe(200)
    controller.abort()
    await new Promise((resolve) => setTimeout(resolve, 200))
    expect((await fetch(String(info.url))).status).toBe(200)

    // Past the original expiry, inside the restarted one.
    await new Promise((resolve) => setTimeout(resolve, 350))
    expect((await fetch(`${origin}/wait?token=${info.token}`)).status).toBe(204)

    await new Promise((resolve) => setTimeout(resolve, 350))
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

  test("an unauthenticated root navigation gets a tokenless bootstrap page that re-enters from sessionStorage", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "ce-prototype-bootstrap-"))
    const info = await startServer(root, ["--annotate"])
    const origin = `http://localhost:${info.port}`
    await fs.writeFile(path.join(String(info.screen_dir), "001-screen.html"), "<h1>Variant home</h1>")

    for (const url of [`${origin}/`, `${origin}/?variant=a`, `${origin}/?token=demo`]) {
      const denied = await fetch(url)
      expect(denied.status).toBe(401)
      expect(denied.headers.get("content-type")).toBe("text/html; charset=utf-8")
      expect(denied.headers.get("cache-control")).toBe("no-store")
      expect(denied.headers.get("referrer-policy")).toBe("no-referrer")
      expect(denied.headers.get("set-cookie")).toBeNull()
      const html = await denied.text()
      expect(html).toContain('sessionStorage.getItem(key)')
      expect(html).toContain('url.searchParams.set("token", stored)')
      expect(html).toContain("window.location.replace(")
      expect(html).toContain("needs its session link")
      expect(html).not.toContain(String(info.token))
      expect(html).not.toContain("Variant home")
    }
    // The API routes stay JSON 401s; only a navigation gets the bootstrap.
    const events = await fetch(`${origin}/events`)
    expect(events.status).toBe(401)
    expect(events.headers.get("content-type")).toBe("application/json; charset=utf-8")

    const page = await fetch(`${origin}/?variant=a&token=${info.token}`)
    expect(page.status).toBe(200)
    expect(page.headers.get("set-cookie")).toBeNull()
    expect(await page.text()).toContain("Variant home")

    // The overlay and bootstrap agree on the storage key.
    const overlay = await fs.readFile(path.join(import.meta.dir, "..", "..", "skills", "ce-prototype", "assets", "annotate.js"), "utf8")
    const server = await fs.readFile(serverScript, "utf8")
    expect(overlay).toContain('const TOKEN_KEY = "ce-annotate-token"')
    expect(server).toContain('const TOKEN_STORAGE_KEY = "ce-annotate-token"')
    expect(overlay).toContain("sessionStorage.setItem(TOKEN_KEY, fromUrl)")
    expect(overlay).toContain("sessionStorage.getItem(TOKEN_KEY)")
    expect(server).not.toContain("Set-Cookie")
    expect(server).not.toMatch(/cookie/i)
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
    expect(String(annotated.url)).toContain(`?token=${annotated.token}`)
    const waited = await fetch(`http://localhost:${annotated.port}/wait?token=${annotated.token}`)
    expect(waited.status).toBe(204)
    await expect(fetch(`http://localhost:${plain.port}/version`)).rejects.toThrow()

    const reused = await startServer(root, ["--annotate"])
    expect(reused.status).toBe("running")
    expect(reused.pid).toBe(annotated.pid)

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
    await fs.writeFile(
      path.join(String(info.screen_dir), "001-screen.html"),
      '<!DOCTYPE html><html><head><base href="https://example.invalid/"></head><body><h1>Based</h1></body></html>',
    )
    const html = await (await fetch(String(info.url))).text()
    expect(html).toContain('<base href="https://example.invalid/">')
    expect(html).toContain(`<link rel="stylesheet" href="${origin}/__ce-annotate/annotate.css">`)
    expect(html).toContain(`<script src="${origin}/__ce-annotate/annotate.js"></script>`)
    expect(html).not.toContain('src="/__ce-annotate')

    // A Host header that cannot be reflected safely falls back to the listen address.
    const odd = await fetch(String(info.url), { headers: { host: 'evil"><script>' } })
    expect(odd.status).toBe(200)
    const oddHtml = await odd.text()
    expect(oddHtml).toContain(`<script src="http://localhost:${info.port}/__ce-annotate/annotate.js"></script>`)
    expect(oddHtml).not.toContain('evil"')

    const overlay = await fs.readFile(path.join(import.meta.dir, "..", "..", "skills", "ce-prototype", "assets", "annotate.js"), "utf8")
    expect(overlay).toContain('new URL("/__ce-annotate/annotate.css", document.currentScript?.src || window.location.origin)')
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

  test("annotation POST resets idle timeout while wait and /version do not", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "ce-prototype-annotate-idle-"))
    const info = await startServer(root, ["--annotate"], {
      CE_LIGHT_WEB_IDLE_TIMEOUT_MS: "600",
      CE_LIGHT_WEB_LIFECYCLE_CHECK_MS: "50",
      CE_LIGHT_WEB_WAIT_TIMEOUT_MS: "80",
    })
    const origin = `http://localhost:${info.port}`
    await fetch(String(info.url))

    await new Promise((resolve) => setTimeout(resolve, 400))
    await fetch(`${origin}/annotation?token=${info.token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ comment: "keep alive", selector: "h1" }),
    })

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

  test("overlay arms comments only when the tool is on and Stop ends the session", async () => {
    const overlay = await fs.readFile(path.join(import.meta.dir, "..", "..", "skills", "ce-prototype", "assets", "annotate.js"), "utf8")
    expect(overlay).toContain("let commentToolOn = false")
    expect(overlay).toMatch(/if \(!commentToolOn \|\| sessionEnded\) return/)
    expect(overlay).toContain('tokenUrl("/session/end")')
    expect(overlay).toContain("target-gone")
    expect(overlay).toContain("EventSource")
    expect(overlay).toContain("ce-prototype-root")
    expect(overlay).toContain("Stop failed")
    expect(overlay).toContain('pin.status === "pending" || pin.status === "working"')
    expect(overlay).toContain('addEventListener("scroll", reattachPins')
    expect(overlay).toContain("EventSource.CLOSED")
    // Every screen change reloads the document with the pins carried across;
    // the overlay never reconciles DOM, head, or scripts itself.
    expect(overlay).toContain('addEventListener("screen-changed"')
    expect(overlay).toContain("sessionStorage.setItem(STATE_KEY")
    expect(overlay).toContain("window.location.reload()")
    // Pin status follows the helper's annotation lifecycle, never a reload;
    // an open draft survives a reload; a reload waits for an in-flight POST.
    expect(overlay).toContain('addEventListener("annotations"')
    expect(overlay).toContain('{ queued: "pending", working: "working", done: "attached" }')
    expect(overlay).not.toContain("advancePinsAfterRevision")
    expect(overlay).toMatch(/draft: draft \? \{ \.\.\.draft, text: commentField\.value/)
    expect(overlay).toMatch(/if \(inFlight\) \{\n\s+reloadPending = true/)
    expect(overlay).toContain("if (reloadPending) requestReload()")
    // Cancel or toggling the tool off during an in-flight POST must not break
    // the pending submission: it is snapshotted before the await, Cancel is
    // disabled, and closing the composer does not reset inFlight.
    expect(overlay).toContain("cancel.disabled = inFlight")
    const submitHandler = overlay.slice(overlay.indexOf('composer.addEventListener("submit"'), overlay.indexOf('stop.addEventListener("click"'))
    expect(submitHandler).toContain("await fetch(")
    expect(submitHandler.slice(submitHandler.indexOf("await "))).not.toMatch(/\bdraft\b/)
    const closeComposer = overlay.slice(overlay.indexOf("function closeComposer()"), overlay.indexOf("function renderPins()"))
    expect(closeComposer).not.toContain("inFlight = false")
    expect(overlay).not.toContain("DOMParser")
    expect(overlay).not.toContain("adoptNode")
    expect(overlay).not.toMatch(/\bmorph\b/i)
    expect(overlay).not.toMatch(/WebSocket/)
  })

  test("queued annotations stay in the helper until the next wait", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "ce-prototype-queue-"))
    const info = await startServer(root, ["--annotate"])
    const origin = `http://localhost:${info.port}`
    const headers = { "Content-Type": "application/json" }
    expect((await fetch(`${origin}/annotation?token=${info.token}`, {
      method: "POST",
      headers,
      body: JSON.stringify({ comment: "first", selector: "h1" }),
    })).status).toBe(200)
    expect((await fetch(`${origin}/annotation?token=${info.token}`, {
      method: "POST",
      headers,
      body: JSON.stringify({ comment: "second", selector: "h2" }),
    })).status).toBe(200)

    const first = await runServerCommand(["wait", "--root", root])
    expect(first.exitCode, first.stderr).toBe(0)
    expect(JSON.parse(first.stdout.trim()).comment).toBe("first")

    const second = await runServerCommand(["wait", "--root", root])
    expect(second.exitCode, second.stderr).toBe(0)
    expect(JSON.parse(second.stdout.trim()).comment).toBe("second")
  })

  test("annotation lifecycle follows POST, wait, and re-entering wait, and is streamed to the overlay", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "ce-prototype-lifecycle-"))
    const info = await startServer(root, ["--annotate"], { CE_LIGHT_WEB_WAIT_TIMEOUT_MS: "40" })
    const origin = `http://localhost:${info.port}`
    const headers = { "Content-Type": "application/json" }
    const post = async (comment: string) => {
      const response = await fetch(`${origin}/annotation?token=${info.token}`, {
        method: "POST",
        headers,
        body: JSON.stringify({ comment, selector: "h1" }),
      })
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
