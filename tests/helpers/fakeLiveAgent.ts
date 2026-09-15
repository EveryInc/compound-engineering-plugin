// A fake coding agent for skills/ce-polish/scripts/live-endpoint.js: it owns
// the helper's run directory (start/status/stop, and killing the process
// without ending the session), parks on `wait` through the CLI or the HTTP
// route, acknowledges batches, and posts unit statuses and questions. A
// stub OpenAI client-secret server is included so /mint can be exercised
// offline through the helper's OPENAI_BASE_URL override.
import { promises as fs } from "fs"
import os from "os"
import path from "path"

export const LIVE_ENDPOINT_SCRIPT = path.join(import.meta.dir, "..", "..", "skills", "ce-polish", "scripts", "live-endpoint.js")
export const APP_ORIGIN = "http://localhost:3000"

export type CliRun = { exitCode: number; stdout: string; stderr: string }

export type WakeEnvelope = {
  schema_version: string
  checkpoint_id: string
  kind: string
  mode_at_checkpoint: string
  session_status: string
  units: Array<Record<string, unknown> & { id: string; status: string }>
  annotations: Array<Record<string, unknown> & { id: string }>
  answers: Array<{ unit_id: string; text: string }>
  [key: string]: unknown
}

export type SessionFile = {
  page_token: string | null
  agent_token: string | null
  url: string
  app_origin: string
  port: number
  pid: number | null
  owner_pid: number | null
  ended: boolean
  [key: string]: unknown
}

export type StartOptions = {
  host?: string
  env?: Record<string, string | undefined>
  /** Start against an existing root (a resume) instead of a fresh mktemp. */
  root?: string
}

/** Short timers so scenarios that wait on the helper's grace windows stay fast. */
export const FAST_ENV: Record<string, string> = {
  CE_LIVE_WAIT_TIMEOUT_MS: "1500",
  CE_LIVE_PAGE_LOST_GRACE_MS: "400",
  CE_LIVE_LIFECYCLE_CHECK_MS: "600000",
  CE_LIVE_MINT_TIMEOUT_MS: "3000",
}

function spawnEnv(overrides: Record<string, string | undefined>): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries({ ...process.env, ...FAST_ENV, ...overrides })) {
    if (value !== undefined) env[key] = value
  }
  return env
}

export async function runHelper(args: string[], env: Record<string, string | undefined> = {}): Promise<CliRun> {
  const proc = Bun.spawn(["node", LIVE_ENDPOINT_SCRIPT, ...args], {
    stdout: "pipe",
    stderr: "pipe",
    env: spawnEnv(env),
  })
  const [exitCode, stdout, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])
  return { exitCode, stdout, stderr }
}

export function parseJsonLine(text: string): Record<string, unknown> {
  const line = text.trim().split("\n").pop() ?? ""
  return JSON.parse(line)
}

export async function waitUntil(predicate: () => Promise<boolean> | boolean, timeoutMs = 5000, stepMs = 25): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await predicate()) return
    await Bun.sleep(stepMs)
  }
  throw new Error(`condition not met within ${timeoutMs}ms`)
}

function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM"
  }
}

/** A stand-in for OpenAI's client-secret endpoint; answers come from a queue, default 401. */
export class FakeOpenAI {
  private server: ReturnType<typeof Bun.serve>
  readonly requests: Array<{ url: string; authorization: string | null; body: Record<string, unknown> }> = []
  private queue: Array<{ status: number; body: unknown }> = []

  constructor() {
    this.server = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      fetch: async (request) => {
        const body = await request.json().catch(() => ({}))
        this.requests.push({ url: new URL(request.url).pathname, authorization: request.headers.get("authorization"), body })
        const next = this.queue.shift() ?? { status: 401, body: { error: { message: "Incorrect API key provided" } } }
        return new Response(JSON.stringify(next.body), { status: next.status, headers: { "Content-Type": "application/json" } })
      },
    })
  }

  get baseUrl(): string {
    return `http://127.0.0.1:${this.server.port}`
  }

  respondWith(status: number, body: unknown): void {
    this.queue.push({ status, body })
  }

  stop(): void {
    this.server.stop(true)
  }
}

export class FakeLiveAgent {
  readonly root: string
  url = ""
  pageToken = ""
  agentToken = ""
  port = 0
  startEnvelope: Record<string, unknown> = {}
  private env: Record<string, string | undefined>
  private host: string | undefined

  private constructor(root: string, options: StartOptions) {
    this.root = root
    this.env = options.env ?? {}
    this.host = options.host
  }

  /** Runs `start` and reads the agent token from state/session.json the way the skill prose does. */
  static async start(options: StartOptions = {}): Promise<FakeLiveAgent> {
    const root = options.root ?? (await fs.mkdtemp(path.join(os.tmpdir(), "ce-polish-live-")))
    const agent = new FakeLiveAgent(root, options)
    await agent.startHelper()
    return agent
  }

  private async startHelper(): Promise<CliRun> {
    // No --port: a fresh start binds a free port and a resume reuses the stored one (I4).
    const args = ["start", "--root", this.root, "--app-origin", APP_ORIGIN]
    if (this.host) args.push("--host", this.host)
    const result = await runHelper(args, this.env)
    if (result.exitCode !== 0) throw new Error(`start failed (${result.exitCode}): ${result.stderr}`)
    this.startEnvelope = parseJsonLine(result.stdout)
    const session = await this.session()
    this.url = String(this.startEnvelope.url)
    this.pageToken = String(this.startEnvelope.page_token)
    this.port = Number(this.startEnvelope.port)
    this.agentToken = String(session.agent_token)
    return result
  }

  /** `start --root` again against the same root: the resume path. */
  async restart(): Promise<Record<string, unknown>> {
    await this.startHelper()
    return this.startEnvelope
  }

  get stateDir(): string {
    return path.join(this.root, "state")
  }

  async session(): Promise<SessionFile> {
    return JSON.parse(await fs.readFile(path.join(this.stateDir, "session.json"), "utf8"))
  }

  async board(): Promise<Record<string, unknown>> {
    return JSON.parse(await fs.readFile(path.join(this.stateDir, "board.json"), "utf8"))
  }

  async serverPid(): Promise<number | null> {
    try {
      const pid = Number((await fs.readFile(path.join(this.stateDir, "server.pid"), "utf8")).trim())
      return Number.isInteger(pid) ? pid : null
    } catch {
      return null
    }
  }

  /** Owner death / idle timeout stand-in: the process goes away, the session does not end. */
  async killServer(): Promise<void> {
    const pid = await this.serverPid()
    if (!pid) return
    try {
      process.kill(pid, "SIGTERM")
    } catch {
      return
    }
    await waitUntil(() => !processAlive(pid), 5000)
  }

  headers(extra: Record<string, string> = {}): Record<string, string> {
    return { Authorization: `Bearer ${this.agentToken}`, "Content-Type": "application/json", ...extra }
  }

  private async agentPost(route: string, body?: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
    const response = await fetch(`${this.url}${route}`, {
      method: "POST",
      headers: this.headers(),
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    return { status: response.status, body: await response.json().catch(() => ({})) }
  }

  /** One `wait` through the CLI, exactly as live-loop.md runs it. */
  async waitCli(): Promise<{ exitCode: number; envelope: WakeEnvelope | Record<string, unknown> | null; stderr: string }> {
    const result = await runHelper(["wait", "--root", this.root], this.env)
    let envelope: WakeEnvelope | Record<string, unknown> | null = null
    try {
      envelope = parseJsonLine(result.stdout) as WakeEnvelope
    } catch {
      envelope = null
    }
    return { exitCode: result.exitCode, envelope, stderr: result.stderr }
  }

  /** One `GET /wait` with the agent bearer; 204 means the wake timed out empty. */
  async waitHttp(token = this.agentToken): Promise<{ status: number; envelope: WakeEnvelope | null; body: Record<string, unknown> }> {
    const response = await fetch(`${this.url}/wait`, { headers: { Authorization: `Bearer ${token}` } })
    const text = await response.text()
    let body: Record<string, unknown> = {}
    try {
      body = text ? JSON.parse(text) : {}
    } catch {
      body = { raw: text }
    }
    return { status: response.status, envelope: response.status === 200 ? (body as WakeEnvelope) : null, body }
  }

  async ack(checkpointId: string): Promise<{ status: number; body: Record<string, unknown> }> {
    return this.agentPost(`/checkpoints/${encodeURIComponent(checkpointId)}/ack`)
  }

  async postStatus(unitId: string, status: string, extra: Record<string, unknown> = {}): Promise<{ status: number; body: Record<string, unknown> }> {
    return this.agentPost(`/units/${encodeURIComponent(unitId)}/status`, { status, ...extra })
  }

  async ask(unitId: string, question: string): Promise<{ status: number; body: Record<string, unknown> }> {
    return this.agentPost(`/units/${encodeURIComponent(unitId)}/ask`, { question })
  }

  async statusHttp(): Promise<{ status: number; body: Record<string, unknown> }> {
    const response = await fetch(`${this.url}/status`, { headers: this.headers() })
    return { status: response.status, body: await response.json().catch(() => ({})) }
  }

  async statusCli(): Promise<Record<string, unknown>> {
    const result = await runHelper(["status", "--root", this.root], this.env)
    if (result.exitCode !== 0) throw new Error(`status failed: ${result.stderr}`)
    return parseJsonLine(result.stdout)
  }

  async stopCli(): Promise<CliRun> {
    return runHelper(["stop", "--root", this.root], this.env)
  }

  async replayCli(profile: string, to: string, token: string): Promise<CliRun> {
    return runHelper(["replay", "--root", this.root, "--profile", profile, "--to", to, "--token", token], this.env)
  }

  /** Stops the helper (ending the session) and removes the run directory. */
  async dispose(): Promise<void> {
    await this.stopCli().catch(() => undefined)
    await fs.rm(this.root, { recursive: true, force: true }).catch(() => undefined)
  }
}
