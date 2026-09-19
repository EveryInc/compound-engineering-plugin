// A fake riffrec live page for driving skills/ce-polish/scripts/live-endpoint.js:
// posts stream-contract envelopes with per-session sequencing and the session
// header, consumes /stream as SSE, and can go silent (buffer locally) to
// simulate an outage and replay from the last acknowledged seq afterwards.
import { promises as fs } from "fs"
import path from "path"

export const SCHEMA_VERSION = "live/1"
// Under the helper's 64 KB non-frame body cap, with room for the JSON array framing.
export const REPLAY_BATCH_BYTES = 60 * 1024
export const FIXTURES_DIR = path.join(import.meta.dir, "..", "fixtures", "ce-polish-live")

export type Envelope = {
  schema_version: string
  session_id: string
  seq: number
  t: number
  type: string
  payload: Record<string, unknown>
}

export type StreamEvent = { event: string; data: Record<string, unknown> }

export type PostResult = { status: number; body: Record<string, unknown> }

export async function readFixture(name: string): Promise<Envelope> {
  return JSON.parse(await fs.readFile(path.join(FIXTURES_DIR, `${name}.json`), "utf8"))
}

export function unitPayload(id: string, statement: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    statement,
    transcript_excerpt: statement,
    anchors: [{ route: "/", selector: `[data-unit="${id}"]`, rect: { x: 0, y: 0, width: 10, height: 10 }, t: 1 }],
    evidence: { frame_ids: [], annotation_ids: [], transcript_span: { t_start: 0, t_end: 1 } },
    status: "initial",
    ...extra,
  }
}

export class FakeLivePage {
  readonly url: string
  readonly sessionId: string
  private token: string
  private nextSeq = 1
  private silent = false
  private buffered: Envelope[] = []
  ackedSeq = 0
  events: StreamEvent[] = []
  private streamAbort: AbortController | null = null
  private streamDone: Promise<void> | null = null
  private waiters: Array<{ predicate: (event: StreamEvent) => boolean; resolve: (event: StreamEvent) => void }> = []

  constructor(url: string, pageToken: string, sessionId = "sess_01J9X6R4C2") {
    this.url = url
    this.token = pageToken
    this.sessionId = sessionId
  }

  headers(extra: Record<string, string> = {}): Record<string, string> {
    return {
      Authorization: `Bearer ${this.token}`,
      "X-Riffrec-Session": this.sessionId,
      "Content-Type": "application/json",
      ...extra,
    }
  }

  /** Builds the next envelope in sequence without sending it. */
  envelope(type: string, payload: Record<string, unknown>, seq = this.nextSeq++): Envelope {
    if (seq >= this.nextSeq) this.nextSeq = seq + 1
    return { schema_version: SCHEMA_VERSION, session_id: this.sessionId, seq, t: Date.now(), type, payload }
  }

  /** Re-stamps a riffrec fixture with this page's session id and next seq. */
  fromFixture(fixture: Envelope, seq?: number): Envelope {
    return this.envelope(fixture.type, fixture.payload, seq)
  }

  async postRaw(body: string | Uint8Array, headers = this.headers()): Promise<PostResult> {
    const response = await fetch(`${this.url}/events`, { method: "POST", headers, body })
    const text = await response.text()
    let parsed: Record<string, unknown> = {}
    try {
      parsed = JSON.parse(text)
    } catch {
      parsed = { raw: text }
    }
    return { status: response.status, body: parsed }
  }

  /**
   * Posts envelopes. While silent (or when the endpoint is unreachable) the
   * envelopes are buffered and `{ status: 0 }` is returned; `replay()` sends
   * everything buffered from the last acknowledged seq.
   */
  async post(envelopes: Envelope | Envelope[]): Promise<PostResult> {
    const list = Array.isArray(envelopes) ? envelopes : [envelopes]
    if (this.silent) {
      this.buffered.push(...list)
      return { status: 0, body: { buffered: this.buffered.length } }
    }
    let result: PostResult
    try {
      result = await this.postRaw(JSON.stringify(list))
    } catch {
      this.buffered.push(...list)
      return { status: 0, body: { buffered: this.buffered.length } }
    }
    if (result.status === 200 && typeof result.body.acked_seq === "number") this.ackedSeq = result.body.acked_seq
    return result
  }

  async send(type: string, payload: Record<string, unknown>): Promise<PostResult> {
    return this.post(this.envelope(type, payload))
  }

  async sendUnit(id: string, statement: string, extra: Record<string, unknown> = {}): Promise<PostResult> {
    return this.send("unit", unitPayload(id, statement, extra))
  }

  async sendCheckpoint(id: string, trigger: string, mode: string): Promise<PostResult> {
    return this.send("checkpoint", { id, trigger, mode })
  }

  /** Stops posting; everything goes to the local buffer (the page's buffering indicator state). */
  goSilent(): void {
    this.silent = true
  }

  get bufferedCount(): number {
    return this.buffered.length
  }

  /**
   * Comes back online and replays every buffered envelope past the last ack,
   * oldest first and in sequence: frames go alone, everything else in batches
   * under the endpoint's 64 KB body cap. The first rejected post stops the
   * replay; it and everything after it stay buffered, and its result is returned.
   */
  async replay(): Promise<PostResult> {
    this.silent = false
    const pending = this.buffered.filter((envelope) => envelope.seq > this.ackedSeq).sort((a, b) => a.seq - b.seq)
    this.buffered = []
    if (pending.length === 0) return { status: 200, body: { acked_seq: this.ackedSeq } }
    const batches: Envelope[][] = []
    let batch: Envelope[] = []
    let batchBytes = 2
    for (const envelope of pending) {
      const bytes = Buffer.byteLength(JSON.stringify(envelope), "utf8") + 1
      if (envelope.type === "frame") {
        if (batch.length > 0) batches.push(batch)
        batches.push([envelope])
        batch = []
        batchBytes = 2
        continue
      }
      if (batch.length > 0 && batchBytes + bytes > REPLAY_BATCH_BYTES) {
        batches.push(batch)
        batch = []
        batchBytes = 2
      }
      batch.push(envelope)
      batchBytes += bytes
    }
    if (batch.length > 0) batches.push(batch)
    let last: PostResult = { status: 200, body: { acked_seq: this.ackedSeq } }
    for (let index = 0; index < batches.length; index++) {
      last = await this.post(batches[index])
      if (last.status !== 200) {
        // An unreachable endpoint (status 0) has already re-buffered this batch inside post().
        this.buffered.push(...batches.slice(last.status === 0 ? index + 1 : index).flat())
        return last
      }
    }
    return last
  }

  async mint(body: Record<string, unknown> = { session_id: this.sessionId }, headers = this.headers()): Promise<PostResult> {
    const response = await fetch(`${this.url}/mint`, { method: "POST", headers, body: JSON.stringify(body) })
    return { status: response.status, body: await response.json().catch(() => ({})) }
  }

  async endSession(archive: Uint8Array | string, contentType = "application/zip"): Promise<PostResult> {
    const response = await fetch(`${this.url}/session/end`, {
      method: "POST",
      headers: this.headers({ "Content-Type": contentType }),
      body: archive,
    })
    return { status: response.status, body: await response.json().catch(() => ({})) }
  }

  /** Opens /stream with a fetch-based reader (the token travels in the header, never a URL). */
  async openStream(): Promise<void> {
    if (this.streamAbort) return
    const abort = new AbortController()
    this.streamAbort = abort
    let response: Response
    try {
      response = await fetch(`${this.url}/stream`, { headers: this.headers(), signal: abort.signal })
    } catch (error) {
      if (this.streamAbort === abort) this.streamAbort = null
      throw error
    }
    if (response.status !== 200 || !response.body) {
      this.streamAbort = null
      throw new Error(`stream refused: HTTP ${response.status}`)
    }
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    this.streamDone = (async () => {
      let buffer = ""
      try {
        while (true) {
          const { value, done } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          let boundary = buffer.indexOf("\n\n")
          while (boundary !== -1) {
            this.consumeFrame(buffer.slice(0, boundary))
            buffer = buffer.slice(boundary + 2)
            boundary = buffer.indexOf("\n\n")
          }
        }
      } catch {
        // Aborted by closeStream() or the server went away.
      } finally {
        if (this.streamAbort === abort) this.streamAbort = null
      }
      // riffrec's client reopens the stream after a clean end (the helper
      // ends a response after each delivery so buffering proxies flush it);
      // only closeStream() stops that. Faster than the page's 1 s for tests.
      if (!abort.signal.aborted) {
        this.streamEnds += 1
        await new Promise((resolve) => setTimeout(resolve, 50))
        if (!abort.signal.aborted && this.streamAbort === null) await this.openStream().catch(() => undefined)
      }
    })()
  }

  /** How many stream responses the helper has ended so far (each is one flushed delivery). */
  streamEnds = 0

  private consumeFrame(frame: string): void {
    let event = "message"
    const dataLines: string[] = []
    for (const line of frame.split("\n")) {
      if (line.startsWith(":")) continue
      if (line.startsWith("event:")) event = line.slice(6).trim()
      else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim())
    }
    if (dataLines.length === 0) return
    let data: Record<string, unknown>
    try {
      data = JSON.parse(dataLines.join("\n"))
    } catch {
      return
    }
    const parsed = { event, data }
    this.events.push(parsed)
    this.waiters = this.waiters.filter((waiter) => {
      if (!waiter.predicate(parsed)) return true
      waiter.resolve(parsed)
      return false
    })
  }

  /** Resolves with the first stream event (already received or upcoming) matching the predicate. */
  waitForEvent(predicate: (event: StreamEvent) => boolean, timeoutMs = 5000): Promise<StreamEvent> {
    const existing = this.events.find(predicate)
    if (existing) return Promise.resolve(existing)
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiters = this.waiters.filter((waiter) => waiter.resolve !== wrapped)
        reject(new Error(`no stream event within ${timeoutMs}ms; saw ${JSON.stringify(this.events.map((event) => event.event))}`))
      }, timeoutMs)
      const wrapped = (event: StreamEvent) => {
        clearTimeout(timer)
        resolve(event)
      }
      this.waiters.push({ predicate, resolve: wrapped })
    })
  }

  eventsNamed(name: string): StreamEvent[] {
    return this.events.filter((event) => event.event === name)
  }

  /** Drops the stream connection the way a crashed or navigated-away page does. */
  async closeStream(): Promise<void> {
    const abort = this.streamAbort
    if (!abort) return
    abort.abort()
    this.streamAbort = null
    await this.streamDone?.catch(() => undefined)
    this.streamDone = null
  }

  get streamOpen(): boolean {
    return this.streamAbort !== null
  }
}
