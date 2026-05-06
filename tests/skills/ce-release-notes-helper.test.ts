import { afterAll, describe, expect, test } from "bun:test"
import type { Server } from "bun"
import { promises as fs } from "fs"
import os from "os"
import path from "path"

const helperPath = path.join(
  import.meta.dir,
  "..",
  "..",
  "plugins",
  "compound-engineering",
  "skills",
  "ce-release-notes",
  "scripts",
  "list-plugin-releases.py",
)

type RunResult = { exitCode: number; stdout: string; stderr: string }

async function runHelper(
  args: string[] = [],
  opts: { ghBin?: string; apiBase?: string } = {},
): Promise<RunResult> {
  const env: Record<string, string> = {}
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined) env[k] = v
  }
  if (opts.ghBin !== undefined) env.CE_RELEASE_NOTES_GH_BIN = opts.ghBin
  const fullArgs = ["python3", helperPath, ...args]
  if (opts.apiBase) fullArgs.push("--api-base", opts.apiBase)

  const proc = Bun.spawn(fullArgs, { env, stderr: "pipe", stdout: "pipe" })
  const [exitCode, stdout, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])
  return { exitCode, stdout, stderr }
}

async function makeGhShim(stdout: string, exitCode = 0): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ce-rn-gh-"))
  const ghPath = path.join(dir, "gh")
  // Use printf to avoid heredoc quoting issues with arbitrary JSON content.
  const script = `#!/usr/bin/env bash\nprintf '%s' ${shellQuote(stdout)}\nexit ${exitCode}\n`
  await fs.writeFile(ghPath, script, { mode: 0o755 })
  return ghPath
}

function shellQuote(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`
}

let server: Server | null = null
let serverHandler: (req: Request) => Response | Promise<Response> = () =>
  new Response("not configured", { status: 500 })

function startServer(): string {
  if (!server) {
    server = Bun.serve({
      port: 0,
      fetch: (req) => serverHandler(req),
    })
  }
  return `http://localhost:${server.port}`
}

function setHandler(h: typeof serverHandler) {
  serverHandler = h
}

afterAll(() => {
  if (server) {
    server.stop(true)
    server = null
  }
})

// ---- Fixtures ----

const PLUGIN_267 = {
  tagName: "compound-engineering-v2.67.0",
  name: "compound-engineering: v2.67.0",
  publishedAt: "2026-04-17T05:59:30Z",
  url: "https://github.com/EveryInc/compound-engineering-plugin/releases/tag/compound-engineering-v2.67.0",
  body:
    "## Features\n* **ce-polish-beta:** thing ([#568](https://github.com/EveryInc/compound-engineering-plugin/issues/568))\n* fixes ([#575](https://github.com/EveryInc/compound-engineering-plugin/issues/575))\n",
}

const PLUGIN_266 = {
  tagName: "compound-engineering-v2.66.1",
  name: "compound-engineering: v2.66.1",
  publishedAt: "2026-04-15T10:00:00Z",
  url: "https://github.com/EveryInc/compound-engineering-plugin/releases/tag/compound-engineering-v2.66.1",
  body:
    "## Bug Fixes\n* something ([#560](https://github.com/EveryInc/compound-engineering-plugin/issues/560))\n",
}

const CLI_267 = {
  tagName: "cli-v2.67.0",
  name: "cli: v2.67.0",
  publishedAt: "2026-04-17T06:00:00Z",
  url: "https://github.com/EveryInc/compound-engineering-plugin/releases/tag/cli-v2.67.0",
  body:
    "## Features\n* cli stuff ([#600](https://github.com/EveryInc/compound-engineering-plugin/issues/600))\n",
}

type GhRelease = typeof PLUGIN_267
function toApiShape(r: GhRelease) {
  return {
    tag_name: r.tagName,
    name: r.name,
    published_at: r.publishedAt,
    html_url: r.url,
    body: r.body,
  }
}

// ---- Tests ----

describe("list-plugin-releases.py", () => {
  describe("gh path", () => {
    test("mixed tags → only compound-engineering-v* surfaced, sorted newest first", async () => {
      const ghBin = await makeGhShim(
        JSON.stringify([CLI_267, PLUGIN_266, PLUGIN_267].map(toApiShape)),
      )
      const result = await runHelper(["--limit", "10"], { ghBin })
      expect(result.exitCode).toBe(0)
      const data = JSON.parse(result.stdout)
      expect(data.ok).toBe(true)
      expect(data.source).toBe("gh")
      expect(data.releases).toHaveLength(2)
      expect(data.releases[0].tag).toBe("compound-engineering-v2.67.0")
      expect(data.releases[0].version).toBe("2.67.0")
      expect(data.releases[0].linked_prs).toEqual([568, 575])
      expect(data.releases[1].tag).toBe("compound-engineering-v2.66.1")
    })

    test("multiple PR refs in body → linked_prs deduplicated and ordered", async () => {
      const release = {
        ...PLUGIN_267,
        body:
          "Stuff ([#100](https://x/100)) and ([#200](https://x/200)) again ([#100](https://x/dup))",
      }
      const ghBin = await makeGhShim(JSON.stringify([release].map(toApiShape)))
      const result = await runHelper(["--limit", "10"], { ghBin })
      const data = JSON.parse(result.stdout)
      expect(data.releases[0].linked_prs).toEqual([100, 200])
    })

    test("body with bare #N references → NOT in linked_prs", async () => {
      const release = { ...PLUGIN_267, body: "fixes #123 and refs #456" }
      const ghBin = await makeGhShim(JSON.stringify([release].map(toApiShape)))
      const result = await runHelper(["--limit", "10"], { ghBin })
      const data = JSON.parse(result.stdout)
      expect(data.releases[0].linked_prs).toEqual([])
    })

    test("body with commit-SHA parens → NOT in linked_prs", async () => {
      const release = {
        ...PLUGIN_267,
        body: "([070092d](https://github.com/x/commit/070092d))",
      }
      const ghBin = await makeGhShim(JSON.stringify([release].map(toApiShape)))
      const result = await runHelper(["--limit", "10"], { ghBin })
      const data = JSON.parse(result.stdout)
      expect(data.releases[0].linked_prs).toEqual([])
    })

    test("empty body → linked_prs is []", async () => {
      const release = { ...PLUGIN_267, body: "" }
      const ghBin = await makeGhShim(JSON.stringify([release].map(toApiShape)))
      const result = await runHelper(["--limit", "10"], { ghBin })
      const data = JSON.parse(result.stdout)
      expect(data.releases[0].body).toBe("")
      expect(data.releases[0].linked_prs).toEqual([])
    })

    test("url prefers html_url over api url when both present", async () => {
      const apiShaped = {
        tag_name: PLUGIN_267.tagName,
        name: PLUGIN_267.name,
        published_at: PLUGIN_267.publishedAt,
        html_url:
          "https://github.com/EveryInc/compound-engineering-plugin/releases/tag/compound-engineering-v2.67.0",
        url:
          "https://api.github.com/repos/EveryInc/compound-engineering-plugin/releases/310187170",
        body: PLUGIN_267.body,
      }
      const ghBin = await makeGhShim(JSON.stringify([apiShaped]))
      const result = await runHelper(["--limit", "10"], { ghBin })
      const data = JSON.parse(result.stdout)
      expect(data.releases[0].url).toBe(
        "https://github.com/EveryInc/compound-engineering-plugin/releases/tag/compound-engineering-v2.67.0",
      )
    })
  })

  describe("gh fallback to anon", () => {
    test("gh binary missing → falls back to anon", async () => {
      const apiBase = startServer()
      setHandler(() => Response.json([toApiShape(PLUGIN_267)]))
      const result = await runHelper(["--limit", "10"], {
        ghBin: "/nonexistent/gh-binary",
        apiBase,
      })
      const data = JSON.parse(result.stdout)
      expect(data.ok).toBe(true)
      expect(data.source).toBe("anon")
      expect(data.releases).toHaveLength(1)
    })

    test("gh exits non-zero → falls back to anon", async () => {
      const apiBase = startServer()
      setHandler(() => Response.json([toApiShape(PLUGIN_267)]))
      const ghBin = await makeGhShim("simulated error", 1)
      const result = await runHelper(["--limit", "10"], { ghBin, apiBase })
      const data = JSON.parse(result.stdout)
      expect(data.ok).toBe(true)
      expect(data.source).toBe("anon")
    })

    test("gh succeeds but yields zero plugin tags (GHE-pointing case) → falls back to anon", async () => {
      const apiBase = startServer()
      setHandler(() => Response.json([toApiShape(PLUGIN_267)]))
      const ghBin = await makeGhShim(JSON.stringify([toApiShape(CLI_267)]))
      const result = await runHelper(["--limit", "10"], { ghBin, apiBase })
      const data = JSON.parse(result.stdout)
      expect(data.ok).toBe(true)
      expect(data.source).toBe("anon")
      expect(data.releases[0].tag).toBe("compound-engineering-v2.67.0")
    })

    test("gh returns malformed JSON → falls back to anon", async () => {
      const apiBase = startServer()
      setHandler(() => Response.json([toApiShape(PLUGIN_267)]))
      const ghBin = await makeGhShim("not json {{{")
      const result = await runHelper(["--limit", "10"], { ghBin, apiBase })
      const data = JSON.parse(result.stdout)
      expect(data.ok).toBe(true)
      expect(data.source).toBe("anon")
    })
  })

  describe("anon path", () => {
    test("anon HTTP 200 → ok:true, source=anon, releases parsed and filtered", async () => {
      const apiBase = startServer()
      setHandler(() =>
        Response.json([toApiShape(PLUGIN_267), toApiShape(CLI_267), toApiShape(PLUGIN_266)]),
      )
      const result = await runHelper(["--limit", "10"], {
        ghBin: "/nonexistent/gh",
        apiBase,
      })
      const data = JSON.parse(result.stdout)
      expect(data.ok).toBe(true)
      expect(data.source).toBe("anon")
      expect(data.releases).toHaveLength(2)
      expect(data.releases[0].tag).toBe("compound-engineering-v2.67.0")
    })
  })

  describe("anon error paths", () => {
    test("HTTP 403 + X-RateLimit-Remaining:0 → ok:false code=rate_limit", async () => {
      const apiBase = startServer()
      const reset = Math.floor(Date.now() / 1000) + 1080
      setHandler(
        () =>
          new Response("rate limited", {
            status: 403,
            headers: {
              "X-RateLimit-Remaining": "0",
              "X-RateLimit-Reset": String(reset),
            },
          }),
      )
      const result = await runHelper(["--limit", "10"], {
        ghBin: "/nonexistent/gh",
        apiBase,
      })
      const data = JSON.parse(result.stdout)
      expect(data.ok).toBe(false)
      expect(data.error.code).toBe("rate_limit")
      expect(data.error.user_hint).toContain(
        "github.com/EveryInc/compound-engineering-plugin/releases",
      )
      expect(data.error.message).toMatch(/resets in \d+ minutes/)
    })

    test("HTTP 500 → ok:false code=network_outage", async () => {
      const apiBase = startServer()
      setHandler(() => new Response("internal error", { status: 500 }))
      const result = await runHelper(["--limit", "10"], {
        ghBin: "/nonexistent/gh",
        apiBase,
      })
      const data = JSON.parse(result.stdout)
      expect(data.ok).toBe(false)
      expect(data.error.code).toBe("network_outage")
      expect(data.error.user_hint).toContain(
        "github.com/EveryInc/compound-engineering-plugin/releases",
      )
    })

    test("malformed JSON from API → ok:false code=network_outage", async () => {
      const apiBase = startServer()
      setHandler(() => new Response("not json {{{", { status: 200 }))
      const result = await runHelper(["--limit", "10"], {
        ghBin: "/nonexistent/gh",
        apiBase,
      })
      const data = JSON.parse(result.stdout)
      expect(data.ok).toBe(false)
      expect(data.error.code).toBe("network_outage")
    })
  })

  describe("integration", () => {
    test("invoked from an unrelated working directory still works", async () => {
      const ghBin = await makeGhShim(JSON.stringify([toApiShape(PLUGIN_267)]))
      const tmpdir = await fs.mkdtemp(path.join(os.tmpdir(), "ce-rn-cwd-"))
      const env: Record<string, string> = {}
      for (const [k, v] of Object.entries(process.env)) {
        if (v !== undefined) env[k] = v
      }
      env.CE_RELEASE_NOTES_GH_BIN = ghBin
      const proc = Bun.spawn(["python3", helperPath, "--limit", "10"], {
        cwd: tmpdir,
        env,
        stderr: "pipe",
        stdout: "pipe",
      })
      const [exitCode, stdout] = await Promise.all([
        proc.exited,
        new Response(proc.stdout).text(),
      ])
      expect(exitCode).toBe(0)
      const data = JSON.parse(stdout)
      expect(data.ok).toBe(true)
      expect(data.releases[0].tag).toBe("compound-engineering-v2.67.0")
    })

    test("contract always exits 0 even on rate-limit failure", async () => {
      const apiBase = startServer()
      setHandler(
        () =>
          new Response("nope", {
            status: 403,
            headers: { "X-RateLimit-Remaining": "0", "X-RateLimit-Reset": "0" },
          }),
      )
      const result = await runHelper(["--limit", "10"], {
        ghBin: "/nonexistent/gh",
        apiBase,
      })
      expect(result.exitCode).toBe(0)
    })
  })
})
