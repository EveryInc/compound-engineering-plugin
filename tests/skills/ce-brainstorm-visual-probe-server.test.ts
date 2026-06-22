import { afterEach, describe, expect, test } from "bun:test"
import { promises as fs } from "fs"
import os from "os"
import path from "path"

const serverScript = path.join(
  import.meta.dir,
  "..",
  "..",
  "skills",
  "ce-brainstorm",
  "scripts",
  "visual-probe-server.js",
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

describe("ce-brainstorm visual-probe-server.js", () => {
  test("start serves the newest screen from a display-only local server", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "ce-visual-probe-server-"))
    const info = await startServer(root)

    expect(info.status).toBe("started")
    expect(info.url).toMatch(/^http:\/\/localhost:\d+$/)
    expect(info.screen_dir).toBe(path.join(root, "screens"))
    expect(info.state_dir).toBe(path.join(root, "state"))

    const screenDir = String(info.screen_dir)
    await fs.writeFile(path.join(screenDir, "001-first.html"), "<h1>First sketch</h1>")
    let response = await fetch(String(info.url))
    let html = await response.text()
    expect(html).toContain("First sketch")
    expect(html).toContain('fetch("/version"')
    expect(html).not.toContain("setTimeout(function(){ location.reload(); }, 1000)")
    expect(html).not.toContain("WebSocket")
    expect(html).not.toContain("data-choice")
    expect(html).not.toContain("events")

    response = await fetch(`${String(info.url)}/version`)
    let version = await response.json()
    expect(version.screen).toBe("001-first.html")

    await new Promise((resolve) => setTimeout(resolve, 20))
    await fs.writeFile(path.join(screenDir, "002-second.html"), "<h1>Second sketch</h1>")
    response = await fetch(String(info.url))
    html = await response.text()
    expect(html).toContain("Second sketch")
    expect(html).not.toContain("First sketch")

    response = await fetch(`${String(info.url)}/version`)
    version = await response.json()
    expect(version.screen).toBe("002-second.html")
  })

  test("serves full HTML documents with refresh polling injected before body close", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "ce-visual-probe-full-doc-"))
    const info = await startServer(root)

    await fs.writeFile(
      path.join(String(info.screen_dir), "001-full.html"),
      "<!doctype html><html><body><h1>Full sketch</h1></body></html>",
    )

    const response = await fetch(String(info.url))
    const html = await response.text()
    expect(html).toContain("<h1>Full sketch</h1>")
    expect(html).toContain('fetch("/version"')
    expect(html.indexOf('fetch("/version"')).toBeLessThan(html.indexOf("</body>"))
    expect(html).not.toContain("CE Brainstorm Visual Probe - directional sketch")
  })

  test("/files stays inside the screens directory", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "ce-visual-probe-files-"))
    const info = await startServer(root)

    await fs.writeFile(path.join(root, "secret.txt"), "outside")
    await fs.writeFile(path.join(String(info.screen_dir), "asset.html"), "<p>asset</p>")

    let response = await fetch(`${String(info.url)}/files/asset.html`)
    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toContain("text/html")
    expect(await response.text()).toBe("<p>asset</p>")

    response = await fetch(`${String(info.url)}/files/../secret.txt`)
    expect(response.status).toBe(404)
  })

  test("status and stop use the root state directory", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "ce-visual-probe-status-"))
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
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "ce-visual-probe-foreground-"))
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

  test("stale pid files do not make status trust an unrelated process", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "ce-visual-probe-stale-pid-"))
    await fs.mkdir(path.join(root, "state"), { recursive: true })
    await fs.writeFile(path.join(root, "state", "server.pid"), `${process.pid}\n`)
    await fs.writeFile(path.join(root, "state", "display-info.json"), "{}\n")

    const result = await runServerCommand(["status", "--root", root])
    expect(result.exitCode, result.stderr).toBe(0)
    const status = JSON.parse(result.stdout.trim())
    expect(status.status).toBe("stopped")
  })

  test("/version polling does not keep an otherwise idle server alive", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "ce-visual-probe-idle-"))
    const info = await startServer(root, [], {
      CE_VISUAL_PROBE_IDLE_TIMEOUT_MS: "250",
      CE_VISUAL_PROBE_LIFECYCLE_CHECK_MS: "50",
    })

    await fs.writeFile(path.join(String(info.screen_dir), "001-first.html"), "<h1>First sketch</h1>")
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
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "ce-visual-probe-owner-"))

    try {
      const info = await startServer(root, ["--owner-pid", String(owner.pid)], {
        CE_VISUAL_PROBE_IDLE_TIMEOUT_MS: "5000",
        CE_VISUAL_PROBE_LIFECYCLE_CHECK_MS: "50",
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
})
