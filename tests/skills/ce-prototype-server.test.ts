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
    expect(html).toContain("/annotate.js")
    expect(html).not.toContain(token)
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

  test("closing the last morph stream ends the session after a reconnect grace", async () => {
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

  test("annotate morphs the current screen body without writing overlay into screens", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "ce-prototype-morph-"))
    const info = await startServer(root, ["--annotate"])
    const screenPath = path.join(String(info.screen_dir), "001-screen.html")
    await fs.writeFile(screenPath, "<!DOCTYPE html><html><head><style>#heading{color:red}</style></head><body class=\"calm\"><h1 id=\"heading\">Original</h1></body></html>")
    const origin = `http://localhost:${info.port}`
    expect((await fetch(String(info.url))).status).toBe(200)
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

    // A stream opened right after the page was served must not replay the
    // screen it already shows; that re-ran the prototype's scripts on load.
    await readUntil(() => text.includes("event: morph"), 700)
    expect(text).toContain(":ok")
    expect(text).not.toContain("event: morph")

    await fs.writeFile(screenPath, "<!DOCTYPE html><html><head><style>#heading{color:blue}</style></head><body class=\"dense\"><h1 id=\"heading\">Revised</h1></body></html>")
    await readUntil(() => text.includes("Revised"), 2000)
    expect(text).toContain("event: morph")
    expect(text).toContain("Revised")
    expect(text).toContain("\"document\"")
    expect(text).toContain("color:blue")
    expect(text).toContain("<body class=\\\"dense\\\">")
    expect(text).not.toContain("ce-annotate-host")
    expect(await fs.readFile(screenPath, "utf8")).not.toContain("ce-annotate-host")

    // A fragment screen morphs as the same shell the page first rendered.
    await new Promise((resolve) => setTimeout(resolve, 20))
    await fs.writeFile(path.join(String(info.screen_dir), "002-fragment.html"), "<h2 id=\"fragment\">Just a fragment</h2>")
    await readUntil(() => text.includes("Just a fragment"), 2000)
    const fragmentMorph = text.slice(text.lastIndexOf("event: morph"))
    expect(fragmentMorph).toContain("CE local web - newest screen")
    expect(fragmentMorph).toContain("<main><h2")
    expect(fragmentMorph).not.toContain("annotate.js")
    await reader.cancel()
  })

  test("a token-authenticated page sets a cookie that keeps query navigation authenticated", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "ce-prototype-cookie-"))
    const info = await startServer(root, ["--annotate"])
    const origin = `http://localhost:${info.port}`
    await fs.writeFile(path.join(String(info.screen_dir), "001-screen.html"), "<h1>Variant home</h1>")

    const page = await fetch(String(info.url))
    expect(page.status).toBe(200)
    const cookie = page.headers.get("set-cookie") ?? ""
    expect(cookie).toMatch(new RegExp(`^ce-light-web-${info.port}=${info.token}; HttpOnly; SameSite=Strict; Path=/$`))
    const pair = cookie.split(";")[0]

    const navigated = await fetch(`${origin}/?variant=a`, { headers: { cookie: pair } })
    expect(navigated.status).toBe(200)
    expect(await navigated.text()).toContain("Variant home")
    expect((await fetch(`${origin}/events`, { headers: { cookie: pair } })).status).toBe(200)

    expect((await fetch(`${origin}/?variant=a`)).status).toBe(401)
    expect((await fetch(`${origin}/`, { headers: { cookie: `ce-light-web-1=${info.token}` } })).status).toBe(401)
    const bare = await fetch(`${origin}/`)
    expect(bare.status).toBe(401)
    expect(bare.headers.get("set-cookie")).toBeNull()
    expect(await bare.text()).not.toContain(String(info.token))
  })

  test("idle shutdown ends the session instead of hanging on an open morph stream", async () => {
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
    expect(overlay).toContain("advancePinsAfterMorph")
    expect(overlay).toContain("Stop failed")
    expect(overlay).toContain('if (pin.status === "working")')
    expect(overlay).toContain('pin.status === "pending" || pin.status === "working"')
    expect(overlay).toContain('addEventListener("scroll", reattachPins')
    expect(overlay).toContain("EventSource.CLOSED")
    // Scripts never re-run in the live realm: a screen that carries any script
    // or <base> reloads as a document with the pins carried across.
    expect(overlay).toContain('querySelectorAll("script, base")')
    expect(overlay).toContain("sessionStorage.setItem(STATE_KEY")
    expect(overlay).toContain("window.location.reload()")
    expect(overlay).toContain("new DOMParser()")
    expect(overlay).toContain("syncAttributes(document.body, doc.body)")
    expect(overlay).not.toContain("activateScripts")
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
})
