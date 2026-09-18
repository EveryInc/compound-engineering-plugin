import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { setTimeout as delay } from "node:timers/promises"
import { test } from "node:test"
import { fileURLToPath } from "node:url"

const repo = fileURLToPath(new URL("../../", import.meta.url))
const node = process.versions.bun ? "node" : process.execPath
const env = Object.fromEntries(
  ["PATH", "SystemRoot", "WINDIR", "TEMP", "TMP", "TMPDIR"].filter((key) => process.env[key] !== undefined)
    .map((key) => [key, process.env[key]]),
)

function launch(script, args) {
  const child = spawn(node, [script, ...args], { env, stdio: ["ignore", "pipe", "pipe"] })
  const stderr = []
  child.stderr.on("data", (chunk) => stderr.push(chunk))
  // 'close', unlike 'exit', also waits for the child's stdio to finish.
  const closed = new Promise((resolve, reject) => {
    child.once("error", reject)
    child.once("close", (code, signal) => resolve({ code, signal, stderr: Buffer.concat(stderr).toString() }))
  })
  // Attach a handler immediately, even while the fixture is awaiting metadata.
  closed.catch(() => {})
  return { child, closed }
}

async function stop(running) {
  if (running.child.exitCode === null && running.child.signalCode === null) running.child.kill("SIGTERM")
  const kill = setTimeout(() => running.child.kill("SIGKILL"), 2000)
  try { await running.closed } finally { clearTimeout(kill) }
}

async function withServer(skill, run) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ce-wait-output-"))
  const script = path.join(repo, "skills", skill, "scripts/light-webserver.js")
  let server
  try {
    await fs.mkdir(path.join(root, "screens"))
    await fs.writeFile(path.join(root, "screens/index.html"), "<!doctype html><h1>Test screen</h1>")
    server = launch(script, ["start", "--foreground", "--annotate", "--root", root, "--owner-pid", String(process.pid)])
    server.child.stdout.resume()
    let info
    const deadline = Date.now() + 5000
    while (!info && Date.now() < deadline) {
      try { info = JSON.parse(await fs.readFile(path.join(root, "state/display-info.json"), "utf8")) } catch {}
      if (!info) {
        assert.equal(server.child.exitCode, null, "server exited before publishing metadata")
        await delay(20)
      }
    }
    assert.ok(info?.port, "server did not publish metadata")
    const base = `http://127.0.0.1:${info.port}`
    async function post(route, body) {
      const response = await fetch(`${base}${route}`, {
        method: "POST", headers: { "x-session-token": info.token, "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}), signal: AbortSignal.timeout(3000),
      })
      assert.equal(response.status, 200)
      return response.json()
    }
    await run({ root, script, post, server })
  } finally {
    try { if (server) await stop(server) } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  }
}

async function queueBatch(post) {
  const records = []
  for (let i = 0; i < 40; i++) {
    const comment = `${i}: ${"한글🙂feedback".repeat(2048)}`
    const { id } = await post("/annotation", { comment, selector: "h1", page: "/index.html" })
    records.push({ id, screen: "index.html", comment, selector: "h1", textSnippet: null, rect: null, point: null })
  }
  await post("/session/flush")
  return Buffer.from(`${JSON.stringify(records)}\n`)
}

async function waitOutput(script, root, broken = false) {
  const running = launch(script, ["wait", "--root", root])
  const chunks = []
  let resume
  let timedOut = false
  const timeout = setTimeout(() => { timedOut = true; running.child.kill("SIGKILL") }, 7000)
  if (broken) running.child.stdout.destroy()
  else running.child.stdout.on("data", (chunk) => {
    chunks.push(chunk)
    running.child.stdout.pause()
    resume = setTimeout(() => running.child.stdout.resume(), 2)
  })
  try {
    const result = await running.closed
    assert.equal(timedOut, false, "wait did not exit within its subprocess budget")
    assert.equal(result.signal, null, result.stderr)
    return { ...result, output: Buffer.concat(chunks) }
  } finally {
    clearTimeout(timeout)
    clearTimeout(resume)
    await stop(running)
  }
}

for (const skill of ["ce-prototype", "ce-brainstorm"]) {
  test(`${skill}: wait drains a large UTF-8 batch into a slow pipe`, { timeout: 20000 }, async () => {
    await withServer(skill, async ({ root, script, post }) => {
      const expected = await queueBatch(post)
      const result = await waitOutput(script, root)
      assert.equal(result.code, 0, result.stderr)
      assert.equal(result.output.length, expected.length, "wait truncated the output despite reporting success")
      assert.ok(result.output.equals(expected), "wait changed the batch bytes or record order")
      assert.equal(result.stderr, "")
    })
  })

  test(`${skill}: a broken output pipe is an error, not success or session end`, { timeout: 20000 }, async () => {
    await withServer(skill, async ({ root, script, post }) => {
      await queueBatch(post)
      const result = await waitOutput(script, root, true)
      assert.equal(result.code, 2, result.stderr)
      assert.match(result.stderr, /EPIPE|ECONNRESET|broken pipe/i)
    })
  })

  test(`${skill}: live and stopped sessions retain terminal JSON and exit 1`, { timeout: 20000 }, async () => {
    await withServer(skill, async ({ root, script, post, server }) => {
      await post("/session/end")
      for (const stopped of [false, true]) {
        if (stopped) await stop(server)
        const result = await waitOutput(script, root)
        assert.equal(result.code, 1, result.stderr)
        assert.equal(result.output.toString(), '{"status":"session-ended","reason":"user-ended"}\n')
        assert.equal(result.stderr, "")
      }
    })
  })
}
