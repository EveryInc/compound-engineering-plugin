import { describe, expect, test } from "bun:test"
import { spawnSync } from "child_process"
import { chmodSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import path from "path"

const SCRIPT = path.join(import.meta.dir, "..", "..", "skills", "ce-resolve-pr-feedback", "scripts", "pending-feedback.py")

function record() {
  return {
    schema_version: 1,
    status: "pending",
    pr: { host: "github.com", base_repo: "upstream/project", number: 42, url: "https://github.com/upstream/project/pull/42", head_repo: "contributor/project", head_ref: "fix/review" },
    fix_commit: "a".repeat(40),
    verification: { command: "bun test", outcome: "passed", details: "3 pass" },
    actions: [{
      source: { kind: "thread", id: "PRRT_1", url: "https://github.com/upstream/project/pull/42#discussion_r11", body_sha256: "b".repeat(64) },
      root_comment_id: 11, thread_id: "PRRT_1", verdict: "fixed", reply_body: "> null check\n\nFixed in aaaaaaa. `value` is checked.", resolve: true, decision_context: null, invariant_key: "null-value",
    }],
    body_ticks: [{ original: "- [ ] P1 — null check", checked: "- [x] P1 — null check" }],
    residuals: [],
  }
}

function fixture() {
  const dir = mkdtempSync(path.join(tmpdir(), "ce-pending-test-"))
  const input = path.join(dir, "input.json")
  const handoff = path.join(dir, "pending.json")
  return { dir, input, handoff }
}

function run(...args: string[]) {
  return spawnSync("python3", [SCRIPT, ...args], { encoding: "utf8" })
}

describe("resolver saved feedback", () => {
  test("creates and validates a private exact-byte record for a fork PR", () => {
    const { input, handoff } = fixture()
    const bytes = JSON.stringify(record(), null, 2) + "\n"
    writeFileSync(input, bytes)
    const result = run("create", "--input", input, "--path", handoff)
    expect(result.status, result.stderr).toBe(0)
    expect(readFileSync(handoff, "utf8")).toBe(bytes)
    expect(statSync(handoff).mode & 0o777).toBe(0o600)
    const validated = run("validate", "--path", handoff)
    expect(validated.status, validated.stderr).toBe(0)
    expect(JSON.parse(validated.stdout).record).toEqual(record())
  })

  test("preflight refuses an existing supplied destination and allocates private scratch by default", () => {
    const { handoff } = fixture()
    writeFileSync(handoff, "keep this record")
    const rejected = run("preflight", "--path", handoff)
    expect(rejected.status).toBe(1)
    expect(rejected.stderr).toContain("already exists")
    expect(readFileSync(handoff, "utf8")).toBe("keep this record")
    const allocated = run("preflight")
    expect(allocated.status, allocated.stderr).toBe(0)
    const savedPath = JSON.parse(allocated.stdout).handoff
    expect(path.isAbsolute(savedPath)).toBe(true)
    expect(statSync(path.dirname(savedPath)).mode & 0o777).toBe(0o700)
  })

  test("create never overwrites an existing destination", () => {
    const { input, handoff } = fixture()
    writeFileSync(input, JSON.stringify(record()))
    writeFileSync(handoff, "original")
    expect(run("create", "--input", input, "--path", handoff).status).toBe(1)
    expect(readFileSync(handoff, "utf8")).toBe("original")
  })

  test.skipIf(process.platform === "win32" || process.getuid?.() === 0)("preflight detects an unwritable parent before preparation", () => {
    const { dir, handoff } = fixture()
    chmodSync(dir, 0o500)
    try {
      expect(run("preflight", "--path", handoff).status).toBe(1)
    } finally {
      chmodSync(dir, 0o700)
    }
  })

  test("class fixes retain all sources and exact replies alongside typed human decisions", () => {
    const { input, handoff } = fixture()
    const decision_context = {
      quoted_feedback: "Change the API?", investigation: "Read callers in client.ts.", decision_reason: "Requires API owner authority.",
      options: [{ option: "Keep contract", tradeoff: "Preserves callers; leaves requested change pending." }], recommendation: null,
    }
    const human = { source: { kind: "review", id: "33", url: "https://github.com/upstream/project/pull/42#pullrequestreview-33", body_sha256: "c".repeat(64) }, root_comment_id: null, thread_id: null, verdict: "needs-human", reply_body: "> Change the API?\n\nNeed to align on this tradeoff.", resolve: false, decision_context, invariant_key: null }
    const batch = {
      ...record(),
      actions: [record().actions[0], { ...record().actions[0], source: { ...record().actions[0]!.source, kind: "comment", id: "22", url: "https://github.com/upstream/project/pull/42#issuecomment-22" }, root_comment_id: null, thread_id: null, resolve: false }, human],
      residuals: [{ type: "needs-human", sources: [{ kind: "review", id: "33" }], decision_context, thread_urls: [] }],
    }
    writeFileSync(input, JSON.stringify(batch))
    expect(run("create", "--input", input, "--path", handoff).status).toBe(0)
    expect(JSON.parse(run("validate", "--path", handoff).stdout).record).toEqual(batch)
  })

  test("a no-code incomplete tail has a null commit and truthful progress", () => {
    const { input, handoff } = fixture()
    const batch = { ...record(), fix_commit: null, verification: { command: "", outcome: "not-run", details: "No code changes" }, body_ticks: [], actions: record().actions.map(action => ({ ...action, verdict: "replied", progress: { reply_id: 100, reply_url: "https://github.com/upstream/project/pull/42#discussion_r100", resolved: false } })) }
    writeFileSync(input, JSON.stringify(batch))
    const result = run("create", "--input", input, "--path", handoff)
    expect(result.status, result.stderr).toBe(0)
    expect(JSON.parse(result.stdout).record.status).toBe("pending")
    expect(JSON.parse(result.stdout).record.fix_commit).toBeNull()
  })

  test("checkpoint updates progress and completion without replacing prepared actions", () => {
    const { input, handoff } = fixture()
    writeFileSync(input, JSON.stringify(record()))
    expect(run("create", "--input", input, "--path", handoff).status).toBe(0)
    const updated = { ...record(), status: "completed", actions: record().actions.map(action => ({ ...action, progress: { reply_id: 100, resolved: true } })), body_ticks: record().body_ticks.map(tick => ({ ...tick, progress: { applied: true } })) }
    writeFileSync(input, JSON.stringify(updated))
    expect(run("checkpoint", "--input", input, "--path", handoff).status).toBe(0)
    expect(JSON.parse(run("validate", "--path", handoff).stdout).record).toEqual(updated)
    for (const replaced of [
      { ...updated, fix_commit: "d".repeat(40) },
      { ...updated, pr: { ...updated.pr, head_ref: "other" } },
      { ...updated, actions: updated.actions.map(action => ({ ...action, source: { ...action.source, body_sha256: "e".repeat(64) } })) },
      { ...updated, actions: updated.actions.map(action => ({ ...action, reply_body: "different reply" })) },
    ]) {
      writeFileSync(input, JSON.stringify(replaced))
      expect(run("checkpoint", "--input", input, "--path", handoff).status).toBe(1)
      expect(JSON.parse(readFileSync(handoff, "utf8"))).toEqual(updated)
    }
  })

  test("invalid original bytes or control fields fail before creation", () => {
    const invalid = [
      "{",
      JSON.stringify({ ...record(), schema_version: 2 }),
      JSON.stringify({ ...record(), fix_commit: "--help" }),
      JSON.stringify({ ...record(), pr: { ...record().pr, host: "github.com\nGH_TOKEN=secret" } }),
      JSON.stringify({ ...record(), pr: { ...record().pr, head_ref: "bad..ref" } }),
      JSON.stringify({ ...record(), pr: { ...record().pr, url: "https://github.com/other/project/pull/42" } }),
      JSON.stringify({ ...record(), actions: record().actions.map(action => ({ ...action, source: { ...action.source, body_sha256: "bad" } })) }),
      JSON.stringify(record()).replace('"schema_version":1', '"schema_version":1,"schema_version":2'),
    ]
    for (const bytes of invalid) {
      const { input, handoff } = fixture()
      writeFileSync(input, bytes)
      const result = run("create", "--input", input, "--path", handoff)
      expect(result.status).toBe(1)
      expect(() => readFileSync(handoff)).toThrow()
    }
  })
})
