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

function completedRecord() {
  return { ...record(), status: "completed", actions: record().actions.map(action => ({ ...action, progress: { reply_id: 100, resolved: true } })), body_ticks: record().body_ticks.map(tick => ({ ...tick, progress: { applied: true } })) }
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

function publicationFixture(batch: Omit<ReturnType<typeof record>, "fix_commit"> & { fix_commit: string | null } = record()) {
  const { dir, handoff } = fixture()
  const remote = path.join(dir, "remote.json")
  const calls = path.join(dir, "calls.jsonl")
  writeFileSync(handoff, JSON.stringify(batch, null, 2) + "\n")
  const metadata = {
    number: batch.pr.number, html_url: batch.pr.url,
    base: { repo: { full_name: batch.pr.base_repo } },
    head: { repo: { full_name: batch.pr.head_repo }, ref: batch.pr.head_ref, sha: "d".repeat(40) },
  }
  const comparison = { status: "ahead", merge_base_commit: { sha: batch.fix_commit } }
  writeFileSync(path.join(dir, "gh"), `#!/usr/bin/env python3
import json, os, sys
with open(os.environ['FAKE_GH_CALLS'], 'a') as out:
    out.write(json.dumps(sys.argv[1:]) + '\\n')
with open(os.environ['FAKE_GH_REMOTE']) as source:
    data = json.load(source)
key = 'comparison' if '/compare/' in sys.argv[-1] else 'metadata'
value = data[key]
if isinstance(value, str):
    print(value, file=sys.stderr)
    sys.exit(1)
print(json.dumps(value))
`)
  chmodSync(path.join(dir, "gh"), 0o755)
  const bytes = readFileSync(handoff, "utf8")
  const inspect = (freshMetadata = metadata, freshComparison: unknown = comparison) => {
    writeFileSync(remote, JSON.stringify({ metadata: freshMetadata, comparison: freshComparison }))
    return spawnSync("python3", [SCRIPT, "inspect-publication", "--path", handoff], {
      encoding: "utf8",
      env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, FAKE_GH_CALLS: calls, FAKE_GH_REMOTE: remote },
    })
  }
  return { handoff, metadata, comparison, bytes, inspect, calls }
}

describe("resolver saved feedback", () => {
  test("publication accepts dot-prefixed base and fork repository names", () => {
    const batch = record()
    batch.pr.base_repo = "upstream/.github"
    batch.pr.head_repo = "contributor/.github"
    batch.pr.url = "https://github.com/upstream/.github/pull/42"
    batch.actions[0]!.source.url = `${batch.pr.url}#discussion_r11`
    const { inspect, calls } = publicationFixture(batch)
    const result = inspect()
    expect(result.status, result.stderr).toBe(0)
    expect(JSON.parse(result.stdout).publication.verified).toBe(true)
    expect(readFileSync(calls, "utf8")).toContain("repos/contributor/.github/compare/")
  })

  test("publication inspection proves a descendant using the actual fork head and preserves original bytes", () => {
    const { handoff, bytes, inspect, calls } = publicationFixture()
    const result = inspect()
    expect(result.status, result.stderr).toBe(0)
    expect(JSON.parse(result.stdout).publication).toMatchObject({ verified: true, head_sha: "d".repeat(40), comparison_status: "ahead" })
    expect(readFileSync(handoff, "utf8")).toBe(bytes)
    const invoked = readFileSync(calls, "utf8").trim().split("\n").map(line => JSON.parse(line))
    expect(invoked).toEqual([
      ["api", "--hostname", "github.com", "--method", "GET", "repos/upstream/project/pulls/42"],
      ["api", "--hostname", "github.com", "--method", "GET", `repos/contributor/project/compare/${"a".repeat(40)}...${"d".repeat(40)}`],
    ])
  })

  test("identical Enterprise heads require positive compare proof too", () => {
    const batch = record()
    batch.pr.host = "git.example.com"
    batch.pr.url = "https://git.example.com/upstream/project/pull/42"
    batch.actions[0]!.source.url = `${batch.pr.url}#discussion_r11`
    const { metadata, inspect, calls } = publicationFixture(batch)
    metadata.head.sha = batch.fix_commit
    const result = inspect(metadata, { status: "identical", merge_base_commit: { sha: batch.fix_commit } })
    expect(result.status, result.stderr).toBe(0)
    expect(JSON.parse(result.stdout).publication.verified).toBe(true)
    expect(readFileSync(calls, "utf8")).toContain('"--hostname", "git.example.com"')
  })

  test.each([
    { status: "behind", merge_base_commit: { sha: "a".repeat(40) } },
    { status: "diverged", merge_base_commit: { sha: "e".repeat(40) } },
    { status: "ahead", merge_base_commit: { sha: "e".repeat(40) } },
    { status: "unknown", merge_base_commit: { sha: "a".repeat(40) } },
    {}, "HTTP 404: commit not found", "HTTP 503: unavailable",
  ])("publication rejects comparison %j without authorizing writes", comparison => {
    const { handoff, bytes, inspect, calls } = publicationFixture()
    const result = inspect(undefined, comparison)
    expect(result.status, result.stderr).toBe(0)
    const publication = JSON.parse(result.stdout).publication
    expect(publication.verified).toBe(false)
    expect(publication.reason.length).toBeGreaterThan(0)
    expect(readFileSync(handoff, "utf8")).toBe(bytes)
    expect(readFileSync(calls, "utf8")).not.toMatch(/POST|PATCH|mutation/)
  })

  test.each(["url", "number", "base", "repo", "ref", "sha"] as const)("PR or head %s identity changes stop before comparing", change => {
    const { metadata, inspect, calls } = publicationFixture()
    if (change === "url") metadata.html_url = "https://other.example/upstream/project/pull/42"
    if (change === "number") metadata.number = 99
    if (change === "base") metadata.base.repo.full_name = "other/project"
    if (change === "repo") metadata.head.repo.full_name = "other/project"
    if (change === "ref") metadata.head.ref = "other"
    if (change === "sha") metadata.head.sha = "unknown"
    const result = inspect(metadata)
    expect(result.status, result.stderr).toBe(0)
    expect(JSON.parse(result.stdout).publication.verified).toBe(false)
    expect(readFileSync(calls, "utf8").trim().split("\n")).toHaveLength(1)
  })

  test("a failed fresh PR read leaves even a completed saved record unproved", () => {
    const batch = completedRecord()
    const { dir, handoff } = fixture()
    writeFileSync(handoff, JSON.stringify(batch))
    writeFileSync(path.join(dir, "gh"), "#!/usr/bin/env bash\nexit 1\n")
    chmodSync(path.join(dir, "gh"), 0o755)
    const result = spawnSync("python3", [SCRIPT, "inspect-publication", "--path", handoff], {
      encoding: "utf8", env: { ...process.env, PATH: `${dir}:${process.env.PATH}` },
    })
    expect(result.status, result.stderr).toBe(0)
    expect(JSON.parse(result.stdout).publication).toMatchObject({ verified: false, head_sha: null })
    expect(JSON.parse(readFileSync(handoff, "utf8"))).toEqual(batch)
  })

  test("a no-change batch verifies fresh identity without comparing a fabricated commit", () => {
    const batch = { ...record(), fix_commit: null }
    const { inspect, calls } = publicationFixture(batch)
    const result = inspect()
    expect(result.status, result.stderr).toBe(0)
    expect(JSON.parse(result.stdout).publication).toMatchObject({ verified: true, comparison_status: null })
    expect(readFileSync(calls, "utf8").trim().split("\n")).toHaveLength(1)
  })

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
    const updated = completedRecord()
    writeFileSync(input, JSON.stringify(updated))
    expect(run("checkpoint", "--input", input, "--path", handoff).status).toBe(0)
    expect(JSON.parse(run("validate", "--path", handoff).stdout).record).toEqual(updated)
  })

  const completed = completedRecord()
  const unfinished = [
    ["missing action progress", { ...completed, actions: completed.actions.map(action => ({ ...action, progress: undefined })) }],
    ["missing reply", { ...completed, actions: completed.actions.map(action => ({ ...action, progress: { resolved: true } })) }],
    ["unresolved thread", { ...completed, actions: completed.actions.map(action => ({ ...action, progress: { reply_id: 100, resolved: false } })) }],
    ["missing tick progress", { ...completed, body_ticks: completed.body_ticks.map(tick => ({ ...tick, progress: undefined })) }],
    ["unapplied tick", { ...completed, body_ticks: completed.body_ticks.map(tick => ({ ...tick, progress: { applied: false } })) }],
  ] as const

  for (const command of ["create", "validate", "checkpoint"] as const) {
    test.each(unfinished)(`${command} rejects completed records with %s`, (_name, batch) => {
      const { input, handoff } = fixture()
      const original = JSON.stringify(command === "validate" ? batch : record())
      if (command !== "create") writeFileSync(handoff, original)
      writeFileSync(input, JSON.stringify(batch))
      const result = command === "validate" ? run(command, "--path", handoff) : run(command, "--input", input, "--path", handoff)
      expect(result.status, result.stderr).toBe(1)
      if (command === "create") expect(() => readFileSync(handoff)).toThrow()
      else expect(readFileSync(handoff, "utf8")).toBe(original)
    })
  }

  const decision_context = {
    quoted_feedback: "Change the API?", investigation: "Read callers in client.ts.", decision_reason: "Requires API owner authority.",
    options: [{ option: "Keep contract", tradeoff: "Preserves callers; leaves requested change pending." }], recommendation: null,
  }
  const humanBatch = {
    ...record(),
    actions: record().actions.map(action => ({ ...action, verdict: "needs-human", resolve: false, decision_context })),
    residuals: [{ type: "needs-human", sources: [{ kind: "thread", id: "PRRT_1" }], decision_context, thread_urls: [record().actions[0]!.source.url] }],
  }

  test("completed human acknowledgments preserve open threads and typed decisions", () => {
    const { input, handoff } = fixture()
    const updated = {
      ...humanBatch, status: "completed",
      actions: humanBatch.actions.map(action => ({ ...action, progress: { reply_id: 100, resolved: false } })),
      body_ticks: completedRecord().body_ticks,
    }
    writeFileSync(handoff, JSON.stringify(humanBatch))
    writeFileSync(input, JSON.stringify(updated))
    const result = run("checkpoint", "--input", input, "--path", handoff)
    expect(result.status, result.stderr).toBe(0)
    expect(JSON.parse(result.stdout).record).toEqual(updated)
  })

  test.each(["comment", "review"])("completed %s actions need a reply but no resolution", kind => {
    const { input, handoff } = fixture()
    const batch = {
      ...completedRecord(),
      actions: record().actions.map(action => ({ ...action, source: { ...action.source, kind }, root_comment_id: null, thread_id: null, resolve: false, progress: { reply_id: 100 } })),
    }
    writeFileSync(input, JSON.stringify(batch))
    expect(run("create", "--input", input, "--path", handoff).status).toBe(0)
    writeFileSync(handoff, JSON.stringify({ ...batch, actions: batch.actions.map(action => ({ ...action, progress: {} })) }))
    expect(run("validate", "--path", handoff).status).toBe(1)
  })

  test.each(["drop", "rewrite"])("checkpoint cannot %s saved human decisions", change => {
    const { input, handoff } = fixture()
    const original = JSON.stringify(humanBatch)
    writeFileSync(handoff, original)
    const residuals = change === "drop" ? [] : humanBatch.residuals.map(residual => ({ ...residual, decision_context: { ...decision_context, recommendation: "Change the contract" } }))
    writeFileSync(input, JSON.stringify({ ...humanBatch, residuals }))
    const result = run("checkpoint", "--input", input, "--path", handoff)
    expect(result.status, result.stderr).toBe(1)
    expect(readFileSync(handoff, "utf8")).toBe(original)
  })

  test.each(["commit", "ref", "source", "reply"])("checkpoint rejects changes to prepared %s", field => {
    const { input, handoff } = fixture()
    const updated = completedRecord()
    writeFileSync(handoff, JSON.stringify(updated))
    const replacements = {
      commit: { ...updated, fix_commit: "d".repeat(40) },
      ref: { ...updated, pr: { ...updated.pr, head_ref: "other" } },
      source: { ...updated, actions: updated.actions.map(action => ({ ...action, source: { ...action.source, body_sha256: "e".repeat(64) } })) },
      reply: { ...updated, actions: updated.actions.map(action => ({ ...action, reply_body: "different reply" })) },
    }
    writeFileSync(input, JSON.stringify(replacements[field as keyof typeof replacements]))
    expect(run("checkpoint", "--input", input, "--path", handoff).status).toBe(1)
    expect(JSON.parse(readFileSync(handoff, "utf8"))).toEqual(updated)
  })

  test.each(["fixed", "fixed-differently", "replied", "not-addressing", "declined"])("ordinary %s thread actions require resolution", verdict => {
    const { input, handoff } = fixture()
    const batch = record()
    batch.actions[0]!.verdict = verdict
    batch.actions[0]!.resolve = false
    writeFileSync(input, JSON.stringify(batch))
    const result = run("create", "--input", input, "--path", handoff)
    expect(result.status, result.stderr).toBe(1)
    expect(() => readFileSync(handoff)).toThrow()
  })

  test.each([
    "{",
    JSON.stringify({ ...record(), schema_version: 2 }),
    JSON.stringify({ ...record(), fix_commit: "--help" }),
    JSON.stringify({ ...record(), pr: { ...record().pr, host: "github.com\nGH_TOKEN=secret" } }),
    JSON.stringify({ ...record(), pr: { ...record().pr, head_ref: "bad..ref" } }),
    ...["upstream/.", "upstream/..", "upstream/../other"].flatMap(repo => [
      JSON.stringify({ ...record(), pr: { ...record().pr, base_repo: repo } }),
      JSON.stringify({ ...record(), pr: { ...record().pr, head_repo: repo } }),
    ]),
    JSON.stringify({ ...record(), pr: { ...record().pr, url: "https://github.com/other/project/pull/42" } }),
    JSON.stringify({ ...record(), actions: record().actions.map(action => ({ ...action, source: { ...action.source, body_sha256: "bad" } })) }),
    JSON.stringify(record()).replace('"schema_version":1', '"schema_version":1,"schema_version":2'),
  ].map((bytes, index) => [index, bytes] as const))("invalid original bytes case %i fails before creation", (_index, bytes) => {
    const { input, handoff } = fixture()
    writeFileSync(input, bytes)
    const result = run("create", "--input", input, "--path", handoff)
    expect(result.status).toBe(1)
    expect(() => readFileSync(handoff)).toThrow()
  })
})
