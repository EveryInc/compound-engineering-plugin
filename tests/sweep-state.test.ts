import { describe, expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

const SCRIPT = path.join(
  __dirname,
  "../skills/ce-sweep/scripts/sweep-state.py",
)

function run(
  cwd: string,
  ...args: string[]
): { code: number; stdout: string; stderr: string } {
  const r = spawnSync("python3", [SCRIPT, ...args], { cwd, encoding: "utf8" })
  return {
    code: r.status ?? -1,
    stdout: r.stdout ?? "",
    stderr: r.stderr ?? "",
  }
}

function tmp(): string {
  return mkdtempSync(path.join(tmpdir(), "sweep-state-"))
}
function statePath(dir: string): string {
  return path.join(dir, "state.yml")
}
function status(stdout: string): string {
  return stdout.split("\n")[0].trim()
}
function payload(stdout: string): any {
  const nl = stdout.indexOf("\n")
  if (nl === -1) return undefined
  const rest = stdout.slice(nl + 1).trim()
  return rest ? JSON.parse(rest) : undefined
}

const NOW = "2026-07-02T12:00:00+00:00"

function acquire(dir: string, s: string, writer = "w1", now = NOW) {
  return run(dir, "lease-acquire", "--state", s, "--writer", writer, "--now", now)
}
function upsert(
  dir: string,
  s: string,
  id: string,
  source: string,
  item: object,
  writer = "w1",
  now = NOW,
) {
  return run(
    dir,
    "upsert-item",
    "--state",
    s,
    "--id",
    id,
    "--source",
    source,
    "--writer",
    writer,
    "--now",
    now,
    "--json",
    JSON.stringify(item),
  )
}
function read(dir: string, s: string) {
  return payload(run(dir, "read", "--state", s).stdout)
}
function cursorAdvance(
  dir: string,
  s: string,
  source: string,
  to: string,
  pastItem: string,
  writer = "w1",
  now = NOW,
) {
  return run(
    dir,
    "cursor-advance",
    "--state",
    s,
    "--source",
    source,
    "--to",
    to,
    "--past-item",
    pastItem,
    "--writer",
    writer,
    "--now",
    now,
  )
}

describe("sweep-state engine — core round-trip and lifecycle", () => {
  test("upsert then read round-trips the item", () => {
    const dir = tmp()
    const s = statePath(dir)
    expect(status(acquire(dir, s).stdout)).toBe("OK")
    expect(
      status(
        upsert(dir, s, "100.5", "slack:C1", {
          status: "ingested",
          body: "hello world",
        }).stdout,
      ),
    ).toBe("OK")
    const rd = run(dir, "read", "--state", s)
    expect(status(rd.stdout)).toBe("OK")
    const state = payload(rd.stdout)
    // Items are stored under a source-scoped composite key so ids never collide
    // across sources; the item stays self-describing via source + id.
    expect(state.items["slack:C1:100.5"].status).toBe("ingested")
    expect(state.items["slack:C1:100.5"].body).toBe("hello world")
    expect(state.items["slack:C1:100.5"].source).toBe("slack:C1")
    expect(state.items["slack:C1:100.5"].id).toBe("100.5")
  })

  test("the same id under two sources does not collide", () => {
    const dir = tmp()
    const s = statePath(dir)
    acquire(dir, s)
    upsert(dir, s, "123", "slack-alpha", { status: "ingested", body: "from slack" })
    upsert(dir, s, "123", "gh-issues", { status: "ingested", body: "from github" })
    const items = read(dir, s).items
    expect(items["slack-alpha:123"].body).toBe("from slack")
    expect(items["gh-issues:123"].body).toBe("from github")
  })

  test("read on an absent file is NO-STATE", () => {
    const dir = tmp()
    const s = statePath(dir)
    const r = run(dir, "read", "--state", s)
    expect(r.code).toBe(0)
    expect(status(r.stdout)).toBe("NO-STATE")
  })

  test("id-keyed merge preserves unknown fields (incl. nested dict + list)", () => {
    const dir = tmp()
    const s = statePath(dir)
    acquire(dir, s)
    upsert(dir, s, "i1", "src1", {
      status: "ingested",
      keep: "me",
      weird: { nested: { deep: [1, 2, 3] } },
    })
    // A later upsert replaces only `status`; every other field must survive.
    upsert(dir, s, "i1", "src1", { status: "analyzed" })
    const item = read(dir, s).items["src1:i1"]
    expect(item.status).toBe("analyzed")
    expect(item.keep).toBe("me")
    expect(item.weird).toEqual({ nested: { deep: [1, 2, 3] } })
  })

  test("an unknown status value is preserved, never dropped", () => {
    const dir = tmp()
    const s = statePath(dir)
    acquire(dir, s)
    upsert(dir, s, "i1", "src1", { status: "some_future_status" })
    expect(read(dir, s).items["src1:i1"].status).toBe("some_future_status")
  })
})

describe("sweep-state engine — cursors", () => {
  test("cursor-advance advances, then refuses regression and unknown item", () => {
    const dir = tmp()
    const s = statePath(dir)
    acquire(dir, s)
    upsert(dir, s, "i1", "src1", {})
    expect(status(cursorAdvance(dir, s, "src1", "200", "i1").stdout)).toBe("OK")
    expect(payload(run(dir, "cursor-get", "--state", s, "--source", "src1").stdout).cursor).toBe("200")
    // regression
    expect(status(cursorAdvance(dir, s, "src1", "100", "i1").stdout)).toBe("REFUSED")
    // unknown item id
    expect(status(cursorAdvance(dir, s, "src1", "300", "nope").stdout)).toBe("REFUSED")
    // cursor unchanged after both refusals
    expect(payload(run(dir, "cursor-get", "--state", s, "--source", "src1").stdout).cursor).toBe("200")
  })

  test("cursor-advance compares pure-digit cursors numerically, not lexically", () => {
    const dir = tmp()
    const s = statePath(dir)
    acquire(dir, s)
    upsert(dir, s, "i1", "src1", {})
    // '9' -> '10' must advance: lexical compare would wrongly REFUSE it.
    cursorAdvance(dir, s, "src1", "9", "i1")
    expect(status(cursorAdvance(dir, s, "src1", "10", "i1").stdout)).toBe("OK")
    expect(payload(run(dir, "cursor-get", "--state", s, "--source", "src1").stdout).cursor).toBe("10")
  })

  test("two sequential runs against the same state never double-advance a cursor", () => {
    const dir = tmp()
    const s = statePath(dir)
    // Run 1: acquire, ingest, advance, release.
    acquire(dir, s, "w1")
    upsert(dir, s, "i1", "src1", { status: "acknowledged" }, "w1")
    cursorAdvance(dir, s, "src1", "200", "i1", "w1")
    run(dir, "lease-release", "--state", s, "--writer", "w1")
    // Run 2: fresh writer, re-reads state, advances forward only.
    acquire(dir, s, "w2", "2026-07-02T13:00:00+00:00")
    upsert(dir, s, "i2", "src1", { status: "acknowledged" }, "w2", "2026-07-02T13:00:00+00:00")
    cursorAdvance(dir, s, "src1", "300", "i2", "w2", "2026-07-02T13:00:00+00:00")
    // A stale re-advance from run 2 to run 1's value is refused, not doubled.
    expect(status(cursorAdvance(dir, s, "src1", "200", "i2", "w2", "2026-07-02T13:00:00+00:00").stdout)).toBe("REFUSED")
    expect(payload(run(dir, "cursor-get", "--state", s, "--source", "src1").stdout).cursor).toBe("300")
  })

  test("cursor-advance to the SAME cursor is idempotently allowed", () => {
    const dir = tmp()
    const s = statePath(dir)
    acquire(dir, s)
    upsert(dir, s, "i1", "src1", {})
    cursorAdvance(dir, s, "src1", "200", "i1")
    expect(status(cursorAdvance(dir, s, "src1", "200", "i1").stdout)).toBe("OK")
  })

  test("cursor-get returns null for an unknown source", () => {
    const dir = tmp()
    const s = statePath(dir)
    acquire(dir, s)
    expect(payload(run(dir, "cursor-get", "--state", s, "--source", "nope").stdout).cursor).toBeNull()
  })
})

describe("sweep-state engine — lease", () => {
  test("lease-acquire returns LOCKED against a live lease held by another writer", () => {
    const dir = tmp()
    const s = statePath(dir)
    expect(status(acquire(dir, s, "w1").stdout)).toBe("OK")
    const r = acquire(dir, s, "w2", "2026-07-02T12:30:00+00:00")
    expect(status(r.stdout)).toBe("LOCKED")
  })

  test("lease-acquire reclaims a stale lease and reports the previous writer", () => {
    const dir = tmp()
    const s = statePath(dir)
    acquire(dir, s, "w1", NOW) // stamped 12:00, ttl 60
    const r = acquire(dir, s, "w2", "2026-07-02T14:00:00+00:00") // +2h → stale
    expect(status(r.stdout)).toBe("STALE-RECLAIMED")
    const pay = payload(r.stdout)
    expect(pay.previous_writer).toBe("w1")
    expect(pay.previous_timestamp).toBe(NOW)
    expect(read(dir, s).lease.writer).toBe("w2")
  })

  test("re-entrant acquire by the same writer succeeds and re-stamps", () => {
    const dir = tmp()
    const s = statePath(dir)
    acquire(dir, s, "w1", NOW)
    const LATER = "2026-07-02T12:20:00+00:00"
    expect(status(acquire(dir, s, "w1", LATER).stdout)).toBe("OK")
    expect(read(dir, s).lease.timestamp).toBe(LATER)
  })

  test("upsert re-stamps the owning writer's lease timestamp", () => {
    const dir = tmp()
    const s = statePath(dir)
    acquire(dir, s, "w1", NOW)
    const LATER = "2026-07-02T12:40:00+00:00"
    upsert(dir, s, "i1", "src1", { status: "ingested" }, "w1", LATER)
    const lease = read(dir, s).lease
    expect(lease.writer).toBe("w1")
    expect(lease.timestamp).toBe(LATER)
  })

  test("a mutating call by a non-owner is LEASE-LOST and leaves the file unchanged", () => {
    const dir = tmp()
    const s = statePath(dir)
    acquire(dir, s, "w1")
    upsert(dir, s, "i1", "src1", { status: "ingested" })
    const before = readFileSync(s, "utf8")
    const r = upsert(dir, s, "i1", "src1", { status: "HACKED" }, "intruder")
    expect(status(r.stdout)).toBe("LEASE-LOST")
    expect(readFileSync(s, "utf8")).toBe(before)
  })

  test("lease-release clears own lease (OK), refuses another's (LEASE-LOST, no write)", () => {
    const dir = tmp()
    const s = statePath(dir)
    acquire(dir, s, "w1")
    const before = readFileSync(s, "utf8")
    expect(status(run(dir, "lease-release", "--state", s, "--writer", "w2").stdout)).toBe("LEASE-LOST")
    expect(readFileSync(s, "utf8")).toBe(before)
    expect(status(run(dir, "lease-release", "--state", s, "--writer", "w1").stdout)).toBe("OK")
    expect(read(dir, s).lease).toBeUndefined()
    // freed → another writer can now take it
    expect(status(acquire(dir, s, "w2").stdout)).toBe("OK")
  })

  test("lease-release on an absent file is OK (nothing to release)", () => {
    const dir = tmp()
    const s = statePath(dir)
    expect(status(run(dir, "lease-release", "--state", s, "--writer", "w1").stdout)).toBe("OK")
  })
})

describe("sweep-state engine — sensitivity redaction", () => {
  test("upsert on a sensitive item drops body and quote, keeps other fields", () => {
    const dir = tmp()
    const s = statePath(dir)
    acquire(dir, s)
    upsert(dir, s, "i1", "src1", {
      sensitive: true,
      body: "secret",
      quote: "hush",
      status: "ingested",
      title: "ok to keep",
    })
    const item = read(dir, s).items["src1:i1"]
    expect(item.body).toBeUndefined()
    expect(item.quote).toBeUndefined()
    expect(item.sensitive).toBe(true)
    expect(item.title).toBe("ok to keep")
  })

  test("a source flagged sensitive redacts body/quote for its items", () => {
    const dir = tmp()
    const s = statePath(dir)
    // Seed a valid state whose source carries a config-derived sensitive flag.
    writeFileSync(
      s,
      [
        "schema_version: 1",
        "lease:",
        '  writer: "w1"',
        `  timestamp: "${NOW}"`,
        "  ttl_minutes: 60",
        "sources:",
        '  "src1":',
        "    sensitive: true",
        "",
      ].join("\n"),
    )
    upsert(dir, s, "i1", "src1", {
      status: "ingested",
      body: "secret",
      quote: "hush",
      title: "keep",
    })
    const item = read(dir, s).items["src1:i1"]
    expect(item.body).toBeUndefined()
    expect(item.quote).toBeUndefined()
    expect(item.title).toBe("keep")
  })
})

describe("sweep-state engine — validate (closed-item evidence rule)", () => {
  test("validate downgrades a closed item lacking evidence to fix_pending", () => {
    const dir = tmp()
    const s = statePath(dir)
    acquire(dir, s)
    upsert(dir, s, "i1", "src1", { status: "closed" })
    const v = run(dir, "validate", "--state", s)
    expect(status(v.stdout)).toBe("OK")
    expect(payload(v.stdout).downgraded).toContain("src1:i1")
    expect(read(dir, s).items["src1:i1"].status).toBe("fix_pending")
  })

  test("validate leaves a closed item WITH full evidence intact", () => {
    const dir = tmp()
    const s = statePath(dir)
    acquire(dir, s)
    upsert(dir, s, "i1", "src1", {
      status: "closed",
      fix_ref: "PR#42",
      verified_merge_sha: "abc123",
      verified_at: NOW,
    })
    const v = run(dir, "validate", "--state", s)
    expect(payload(v.stdout).downgraded).toEqual([])
    expect(read(dir, s).items["src1:i1"].status).toBe("closed")
  })
})

describe("sweep-state engine — run-record", () => {
  test("run-record records completed then failed outcomes", () => {
    const dir = tmp()
    const s = statePath(dir)
    acquire(dir, s, "w1")
    expect(
      status(
        run(dir, "run-record", "--state", s, "--writer", "w1", "--outcome", "completed", "--counts", '{"ingested":3}', "--timestamp", NOW).stdout,
      ),
    ).toBe("OK")
    let lr = read(dir, s).last_run
    expect(lr.outcome).toBe("completed")
    expect(lr.counts).toEqual({ ingested: 3 })
    expect(lr.timestamp).toBe(NOW)

    const T2 = "2026-07-02T13:00:00+00:00"
    expect(
      status(
        run(dir, "run-record", "--state", s, "--writer", "w1", "--outcome", "failed", "--counts", "{}", "--timestamp", T2).stdout,
      ),
    ).toBe("OK")
    lr = read(dir, s).last_run
    expect(lr.outcome).toBe("failed")
    expect(lr.timestamp).toBe(T2)
  })

  test("run-record is lease-agnostic (aborted-locked can still be recorded)", () => {
    const dir = tmp()
    const s = statePath(dir)
    acquire(dir, s, "w1") // w1 holds the lease
    const r = run(dir, "run-record", "--state", s, "--writer", "w2", "--outcome", "aborted-locked", "--counts", "{}", "--timestamp", NOW)
    expect(status(r.stdout)).toBe("OK")
    // w1's lease is untouched
    expect(read(dir, s).lease.writer).toBe("w1")
    expect(read(dir, s).last_run.outcome).toBe("aborted-locked")
  })
})

describe("sweep-state engine — import-legacy", () => {
  test("maps Cora-style channel cursors and best-effort items", () => {
    const dir = tmp()
    const s = statePath(dir)
    const legacy = path.join(dir, "legacy.json")
    writeFileSync(
      legacy,
      JSON.stringify({
        channels: {
          C111: { last_processed_ts: "1699999999.000100" },
          C222: { last_processed_ts: "1700000000.000200" },
          C333: { note: "no ts here" }, // skipped: no cursor
        },
        items: {
          "C111:1699999999.000100": { status: "acknowledged", channel: "C111" },
        },
      }),
    )
    const r = run(dir, "import-legacy", "--state", s, "--file", legacy)
    expect(status(r.stdout)).toBe("OK")
    const pay = payload(r.stdout)
    expect(pay.cursors_imported).toBe(2)
    expect(pay.items_imported).toBe(1)
    const state = read(dir, s)
    expect(state.sources.C111.cursor).toBe("1699999999.000100")
    expect(state.sources.C222.cursor).toBe("1700000000.000200")
    expect(state.sources.C333).toBeUndefined()
    expect(state.items["C111:1699999999.000100"].source).toBe("C111")
    expect(state.items["C111:1699999999.000100"].status).toBe("acknowledged")
  })

  test("import-legacy never fails on a garbage file", () => {
    const dir = tmp()
    const s = statePath(dir)
    const legacy = path.join(dir, "legacy.json")
    writeFileSync(legacy, "\x00\x01 not a legacy file at all")
    const r = run(dir, "import-legacy", "--state", s, "--file", legacy)
    expect(r.code).toBe(0)
    expect(status(r.stdout)).toBe("OK")
    expect(payload(r.stdout)).toEqual({ cursors_imported: 0, items_imported: 0 })
  })

  test("import-legacy --source-map lands cursors under the configured source id", () => {
    const dir = tmp()
    const s = statePath(dir)
    const legacy = path.join(dir, "legacy.json")
    writeFileSync(
      legacy,
      JSON.stringify({ channels: { C0AQ: { last_processed_ts: "1700000000.000100" } } }),
    )
    run(dir, "import-legacy", "--state", s, "--file", legacy, "--source-map", '{"C0AQ":"slack-alpha"}')
    const state = read(dir, s)
    // The connector reads cursor-get --source slack-alpha; the cursor must be there,
    // not orphaned under the bare legacy channel id.
    expect(state.sources["slack-alpha"].cursor).toBe("1700000000.000100")
    expect(state.sources.C0AQ).toBeUndefined()
  })

  test("import-legacy never regresses an already-advanced cursor", () => {
    const dir = tmp()
    const s = statePath(dir)
    acquire(dir, s)
    upsert(dir, s, "i1", "C111", {})
    // C111 has already swept forward past the legacy value.
    cursorAdvance(dir, s, "C111", "1700000005.000000", "i1")
    const legacy = path.join(dir, "legacy.json")
    writeFileSync(
      legacy,
      JSON.stringify({ channels: { C111: { last_processed_ts: "1699999999.000100" } } }),
    )
    run(dir, "import-legacy", "--state", s, "--file", legacy)
    // A re-import must not rewind the cursor and re-ingest everything since.
    expect(read(dir, s).sources.C111.cursor).toBe("1700000005.000000")
  })
})

describe("sweep-state engine — robustness", () => {
  test("corrupt state file yields CORRUPT and exit 0 (never a traceback)", () => {
    const dir = tmp()
    const s = statePath(dir)
    writeFileSync(s, "not yaml at all\n")
    const r = run(dir, "read", "--state", s)
    expect(r.code).toBe(0)
    expect(status(r.stdout)).toBe("CORRUPT")
  })

  test("a mutating command on a corrupt file is CORRUPT and does not write", () => {
    const dir = tmp()
    const s = statePath(dir)
    writeFileSync(s, "garbage-with-no-colon\n")
    const before = readFileSync(s, "utf8")
    const r = upsert(dir, s, "i1", "src1", { status: "ingested" })
    expect(r.code).toBe(0)
    expect(status(r.stdout)).toBe("CORRUPT")
    expect(readFileSync(s, "utf8")).toBe(before)
  })

  test("upsert on an absent state (no lease) is LEASE-LOST", () => {
    const dir = tmp()
    const s = statePath(dir)
    const r = upsert(dir, s, "i1", "src1", { status: "ingested" })
    expect(status(r.stdout)).toBe("LEASE-LOST")
  })

  test("a bad subcommand exits non-zero (CLI misuse, not an operational path)", () => {
    const dir = tmp()
    expect(run(dir, "frobnicate").code).not.toBe(0)
    expect(run(dir).code).not.toBe(0)
  })
})
