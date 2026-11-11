import { spawnSync } from "child_process"
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import path from "path"
import { afterAll, describe, expect, setDefaultTimeout, test } from "bun:test"

setDefaultTimeout(30000)

const repoRoot = path.join(import.meta.dir, "..", "..")
const skillDir = path.join(repoRoot, "skills", "ce-setup")
const script = path.join(skillDir, "scripts", "config-refresh.py")
const template = readFileSync(path.join(skillDir, "references", "config-template.yaml"), "utf8")
const fixtures = path.join(repoRoot, "tests", "fixtures", "ce-config-refresh")
const august = readFileSync(path.join(fixtures, "config-template-2026-08-12.yaml"), "utf8")
const legacyLocal = readFileSync(path.join(fixtures, "config-local-template-2026-08-11.yaml"), "utf8")

// The 2026-08-12 template's cross_model_peer line, with its five-option list.
const OLD_PEER = "# cross_model_peer: codex          # codex | claude | grok | cursor | composer"
const CURRENT_PEER = "cross_model_peer: codex          # codex | claude | grok | antigravity | cursor | composer | opencode | pi"
const TEAM_NOTE = "# Team: Codex reviews everything we ship."

const scratch = mkdtempSync(path.join(tmpdir(), "ce-config-refresh-test-"))
afterAll(() => rmSync(scratch, { recursive: true, force: true }))

let counter = 0
function makeRepo(files: { tracked?: string; local?: string }): string {
  const root = path.join(scratch, `repo-${counter++}`)
  mkdirSync(path.join(root, ".compound-engineering"), { recursive: true })
  if (files.tracked !== undefined) writeFileSync(path.join(root, ".compound-engineering", "config.yaml"), files.tracked)
  if (files.local !== undefined) writeFileSync(path.join(root, ".compound-engineering", "config.local.yaml"), files.local)
  return root
}

type Result = { status: number; json: any }

function run(root: string, args: string[], scriptPath = script): Result {
  // Drafts land under the test's own scratch dir, and no harness variables reach the child.
  const env = { PATH: process.env.PATH ?? "/usr/bin:/bin", HOME: scratch, TMPDIR: scratch, LANG: "C.UTF-8" }
  const res = spawnSync("python3", [scriptPath, ...args, "--repo", root], { encoding: "utf8", env })
  if (!res.stdout) throw new Error(`no output: ${res.stderr}`)
  return { status: res.status ?? -1, json: JSON.parse(res.stdout) }
}

function readLayer(root: string, layer: "tracked" | "local"): string {
  const name = layer === "tracked" ? "config.yaml" : "config.local.yaml"
  return readFileSync(path.join(root, ".compound-engineering", name), "utf8")
}

function draft(root: string, layer: "tracked" | "local", changes?: object[]): Result {
  const args = ["draft", "--layer", layer]
  if (changes) {
    const file = path.join(root, `changes-${counter++}.json`)
    writeFileSync(file, JSON.stringify({ changes }))
    args.push("--changes", file)
  }
  return run(root, args)
}

function verifyWith(root: string, layer: "tracked" | "local", draftText: string, changes: object[]): Result {
  const draftFile = path.join(root, `draft-${counter++}.yaml`)
  const changesFile = path.join(root, `changes-${counter++}.json`)
  writeFileSync(draftFile, draftText)
  writeFileSync(changesFile, JSON.stringify({ changes }))
  return run(root, ["verify", "--layer", layer, "--draft", draftFile, "--changes", changesFile])
}

function applyDraft(root: string, layer: "tracked" | "local", result: Result): Result {
  return run(root, ["apply", "--layer", layer, "--draft", result.json.draft, "--changes", result.json.changes])
}

function withPeer(base: string, oldLine = OLD_PEER): string {
  expect(base).toContain(oldLine)
  return base.replace(oldLine, `${TEAM_NOTE}\n${oldLine.slice(2)}`)
}

function draftText(result: Result): string {
  return readFileSync(result.json.draft, "utf8")
}

describe("config-refresh status", () => {
  test("a current file needs nothing", () => {
    const root = makeRepo({ tracked: template })
    expect(run(root, ["status"]).json.tracked.state).toBe("current")
    const result = draft(root, "tracked")
    expect(result.json.action).toBe("none")
    expect(result.json.draft).toBeUndefined()
  })

  test("a newer file is reported and never drafted", () => {
    const root = makeRepo({ tracked: template.replace(/template-version: (\d+)/, (_, v) => `template-version: ${Number(v) + 1}`) })
    expect(run(root, ["status"]).json.tracked.state).toBe("newer")
    const result = draft(root, "tracked")
    expect(result.status).toBe(1)
    expect(result.json.refused).toContain("newer")
  })

  test("a malformed version line is reported and never drafted", () => {
    const root = makeRepo({ tracked: template.replace(/template-version: \d+/, "template-version: one") })
    expect(run(root, ["status"]).json.tracked.state).toBe("malformed-version")
    expect(draft(root, "tracked").status).toBe(1)
  })

  test.each([
    ["a duplicate key", "packs:\n  - source: a\npacks:\n  - source: b\n", "duplicate setting `packs`"],
    ["a block scalar", "plan_model: |\n  fable\n", "block scalars"],
    ["tab indentation", "packs:\n\t- source: a\n", "tabs"],
    ["an alias", "plan_model: *model\n", "anchors and aliases"],
    ["a multi-line flow collection", "work_engine_effort: {codex: xhigh,\n  claude: max}\n", "flow collections"],
  ])("%s is refused with its line and the file is untouched", (_label, body, message) => {
    const root = makeRepo({ tracked: body })
    const status = run(root, ["status"]).json.tracked
    expect(status.state).toBe("unrefreshable")
    expect(status.reason).toContain(message)
    expect(status.reason).toMatch(/config\.yaml:\d+:/)
    expect(draft(root, "tracked").status).toBe(1)
    expect(readLayer(root, "tracked")).toBe(body)
  })

  test("unrecognized keys come with ranked typo candidates", () => {
    const root = makeRepo({ local: "work_engine_prefs:\n  - harness: codex\ncustom_team_key: 1\n" })
    const keys = run(root, ["status"]).json.local.keys.unrecognized
    expect(keys).toEqual([
      { key: "work_engine_prefs", candidates: expect.arrayContaining(["work_engine_preferences"]) },
      { key: "custom_team_key", candidates: [] },
    ])
    expect(keys[0].candidates[0]).toBe("work_engine_preferences")
  })
})

describe("config-refresh rebuild of config.yaml", () => {
  test("the 2026-08-12 template with an active setting and a team comment comes out current", () => {
    const root = makeRepo({ tracked: withPeer(august) })
    const result = draft(root, "tracked")
    expect(result.status).toBe(0)
    expect(result.json.action).toBe("rebuild")
    const text = draftText(result)
    expect(text.replace(`${TEAM_NOTE}\n${CURRENT_PEER}\n`, "")).toBe(
      template.replace(`# ${CURRENT_PEER}\n`, ""),
    )
    expect(text).toContain(`${TEAM_NOTE}\n${CURRENT_PEER}\n`)

    expect(applyDraft(root, "tracked", result).json.applied).toBe(true)
    expect(readLayer(root, "tracked")).toBe(text)
    expect(run(root, ["status"]).json.tracked.state).toBe("current")
    expect(draft(root, "tracked").json.action).toBe("none")
  })

  test("a file with no version line keeps a team-written inline comment in the slot", () => {
    const root = makeRepo({ tracked: "cross_model_peer: codex  # team pick\n" })
    expect(run(root, ["status"]).json.tracked.state).toBe("outdated")
    const text = draftText(draft(root, "tracked"))
    expect(text).toContain("# cross_model_review_mode: off   # auto | off (default: auto)\ncross_model_peer: codex  # team pick\n")
    expect(text).not.toContain("# cross_model_peer: codex")
  })

  test("nested, inline-map, and flow-list blocks land intact in their slots", () => {
    const prefs = "work_engine_preferences:\n  - harness: cursor\n    # composer first\n    model: composer\n  - harness: codex\n"
    const effort = "work_engine_effort: {codex: xhigh}\n"
    const sources = 'feedback_sources:\n  - { type: slack, id: s, target: C1, ack_action: eyes, closeout_action: done, sensitive: false, approved: true }\n'
    const root = makeRepo({ tracked: sources + effort + prefs })
    const text = draftText(draft(root, "tracked"))
    expect(text).toContain(`# work_engine_mode: prefer        # off | prefer | require (default: off)\n${prefs}`)
    expect(text).toContain(`\n${effort}`)
    expect(text).toContain(`\n${sources}`)
    expect(text.indexOf("work_engine_preferences:")).toBeLessThan(text.indexOf("work_engine_effort:"))
    expect(text.indexOf("work_engine_effort:")).toBeLessThan(text.indexOf("feedback_sources:"))
  })

  test("an indented note under a setting's last item stays with that setting", () => {
    const packs = "packs:\n  - source: compound-packs/a\n  # keep this source through Q4\n"
    const root = makeRepo({ tracked: `${packs}${TEAM_NOTE}\ncross_model_peer: codex\n` })
    const result = draft(root, "tracked")
    expect(result.json.unplaced_comments).toEqual([])
    const text = draftText(result)
    expect(text).toContain(`\n${packs}`)
    expect(text).toContain(`\n${TEAM_NOTE}\ncross_model_peer: codex\n`)
    expect(result.json.verify).toBe("ok")
  })

  test("a removed setting's own indented note survives, and dropping it fails verify", () => {
    const note = "# Team: keep reviews on Codex too."
    const root = makeRepo({ tracked: `cross_model_peer: codex\nwork_delegate: codex\n  ${note}\n` })
    const result = draft(root, "tracked")
    expect(result.json.verify).toBe("ok")
    const text = draftText(result)
    expect(text).not.toContain("work_delegate")
    expect(text).toContain(`\n${note}\n`)
    const dropped = verifyWith(root, "tracked", text.replace(`${note}\n`, ""), result.json.changes_recorded)
    expect(dropped.json.verify).toContain(`team comment \`${note}\` is missing`)
    const removed = draft(root, "tracked", [{ type: "comment-remove", line: note, reason: "about the retired setting" }])
    expect(removed.json.verify).toBe("ok")
    expect(draftText(removed)).not.toContain(note)
  })

  test.each([
    ["config.yaml rebuild", "tracked" as const],
    ["config.local.yaml in place", "local" as const],
  ])("a removed setting's inline note survives in a %s, and dropping it fails verify", (_label, layer) => {
    const note = "# Team: keep reviews on Codex too."
    const body = `cross_model_peer: codex\nwork_delegate: codex  ${note}\n`
    const root = makeRepo(layer === "tracked" ? { tracked: body } : { local: body })
    const result = draft(root, layer)
    expect(result.json.verify).toBe("ok")
    const text = draftText(result)
    expect(text).not.toContain("work_delegate")
    expect(text).toContain(`\n${note}\n`)
    const dropped = verifyWith(root, layer, text.replace(`${note}\n`, ""), result.json.changes_recorded)
    expect(dropped.json.verify).toContain(`team comment \`${note}\` is missing`)
  })

  test("a packs list with column-0 items moves whole, and dropping an item fails verify", () => {
    const packs = "packs:\n- source: compound-packs/a\n- source: https://example.com/p\n  ref: v1\n"
    const root = makeRepo({ tracked: packs })
    const result = draft(root, "tracked")
    const text = draftText(result)
    expect(text).toContain(`# Rules are top-level .md files with title + applies_when; subfolders are storage.\n\n${packs}`)
    const broken = verifyWith(root, "tracked", text.replace("- source: compound-packs/a\n", ""), [])
    expect(broken.status).toBe(1)
    expect(broken.json.verify).toBe("the value of `packs` changed")
  })

  test("old template text is dropped, a comment above a setting moves with it, and a loose note is kept", () => {
    const body = [
      "# Compound Engineering -- repo config",
      "docs_root: specs",
      "# Relocate every CE-written artifact folder (solutions, plans, ideation,",
      "# Team: we keep specs out of docs/.",
      "",
      TEAM_NOTE,
      "cross_model_peer: codex          # codex | claude | grok | cursor | composer",
      "",
    ].join("\n")
    const root = makeRepo({ tracked: body })
    const result = draft(root, "tracked")
    expect(result.json.unplaced_comments).toEqual([{ line: "# Team: we keep specs out of docs/.", lineno: 4 }])
    const text = draftText(result)
    expect(text).toContain(`\n${TEAM_NOTE}\n${CURRENT_PEER}\n`)
    expect(text).toContain("\n\ndocs_root: specs\n")
    expect(text).not.toContain("# Relocate every CE-written artifact folder (solutions, plans, ideation,\n# Team")
    expect(text.endsWith("does not recognize, and notes ---\n\n# Team: we keep specs out of docs/.\n")).toBe(true)
    expect(verifyWith(root, "tracked", text, []).json.verify).toBe("ok")
    expect(applyDraft(root, "tracked", result).json.applied).toBe(true)
    expect(draft(root, "tracked").json.action).toBe("none")
  })

  test("CRLF and a BOM are read, and the draft keeps the line endings", () => {
    const root = makeRepo({ tracked: "﻿cross_model_peer: codex\r\nplan_model: fable\r\n" })
    const text = draftText(draft(root, "tracked"))
    expect(text.startsWith("﻿# Compound Engineering -- repo config\r\n")).toBe(true)
    expect(text).toContain("\r\ncross_model_peer: codex\r\n")
    expect(text.replace(/\r\n/g, "")).not.toContain("\n")
  })

  test("a test registry migration reports a target that already wins", () => {
    const copy = path.join(scratch, `skill-${counter++}`)
    cpSync(skillDir, copy, { recursive: true })
    writeFileSync(
      path.join(copy, "references", "retired-config-keys.yaml"),
      'old_peer:\n  kind: migrate\n  target: cross_model_peer\n  reason: "Renamed to cross_model_peer."\n',
    )
    const copyScript = path.join(copy, "scripts", "config-refresh.py")
    const winning = makeRepo({ tracked: "old_peer: grok\n", local: "cross_model_peer: codex\n" })
    const retired = run(winning, ["status"], copyScript).json.tracked.keys.retired
    expect(retired).toEqual([expect.objectContaining({ key: "old_peer", target: "cross_model_peer", target_winning: "config.local.yaml" })])

    const open = makeRepo({ tracked: "old_peer: grok\n" })
    expect(run(open, ["status"], copyScript).json.tracked.keys.retired[0].target_winning).toBeNull()
    const changes = path.join(open, "changes.json")
    writeFileSync(changes, JSON.stringify({ changes: [{ type: "migrate", key: "old_peer", value: "grok", reason: "renamed" }] }))
    const migrated = run(open, ["draft", "--layer", "tracked", "--changes", changes], copyScript)
    expect(migrated.json.verify).toBe("ok")
    expect(draftText(migrated)).toContain("\ncross_model_peer: grok\n")
    writeFileSync(changes, JSON.stringify({ changes: [{ type: "remove", key: "old_peer", reason: "superseded" }] }))
    expect(run(open, ["draft", "--layer", "tracked", "--changes", changes], copyScript).json.refused).toContain(
      "must be migrated",
    )

    // A quoted value keeps its quotes, so `"123"` stays a string instead of becoming a number.
    const quoted = makeRepo({ tracked: 'old_peer: "123"\n' })
    const quotedChanges = path.join(quoted, "changes.json")
    writeFileSync(quotedChanges, JSON.stringify({ changes: [{ type: "migrate", key: "old_peer", value: "123", reason: "renamed" }] }))
    const kept = run(quoted, ["draft", "--layer", "tracked", "--changes", quotedChanges], copyScript)
    expect(kept.json.verify).toBe("ok")
    expect(draftText(kept)).toContain('\ncross_model_peer: "123"\n')
  })
})

describe("config-refresh verify", () => {
  const original = ["docs_root: specs", TEAM_NOTE, "cross_model_peer: cdex", "plan_use_fable: true", "work_delegate: codex", ""].join("\n")
  const removals = [
    { type: "remove", key: "plan_use_fable", reason: "use plan_model" },
    { type: "remove", key: "work_delegate", reason: "use work_engine_preferences" },
  ]

  function good(): { root: string; text: string } {
    const root = makeRepo({ tracked: original })
    const result = draft(root, "tracked")
    expect(result.json.changes_recorded.map((c: { key: string }) => c.key)).toEqual(["plan_use_fable", "work_delegate"])
    return { root, text: draftText(result) }
  }

  test("accepts unchanged values plus the recorded registry removals", () => {
    const { root, text } = good()
    expect(text).not.toContain("plan_use_fable")
    expect(text).not.toContain("work_delegate")
    expect(text).not.toContain("\nplan_model:")
    expect(verifyWith(root, "tracked", text, removals).json.verify).toBe("ok")
  })

  test.each([
    ["the draft drops docs_root", (t: string) => t.replace("docs_root: specs\n", ""), removals, "`docs_root` is missing from the draft"],
    ["the draft edits docs_root", (t: string) => t.replace("docs_root: specs", "docs_root: docs"), removals, "the value of `docs_root` changed"],
    ["the draft fixes an invalid value", (t: string) => t.replace("cross_model_peer: cdex", "cross_model_peer: codex"), removals, "the value of `cross_model_peer` changed"],
    [
      "a rename to a key that is not a typo candidate",
      (t: string) => t,
      [...removals, { type: "rename", from: "cross_model_peer", to: "plan_model", reason: "typo" }],
      "`cross_model_peer` is not an unrecognized setting",
    ],
    ["the draft drops the team comment", (t: string) => t.replace(`${TEAM_NOTE}\n`, ""), removals, `team comment \`${TEAM_NOTE}\` is missing`],
    [
      "a recorded removal the draft did not make",
      (t: string) => t.replace("docs_root: specs\n", "docs_root: specs\nplan_use_fable: true\n"),
      removals,
      "`plan_use_fable` is recorded as removed but is still in the draft",
    ],
    ["a removal nobody recorded", (t: string) => t, removals.slice(0, 1), "retired setting `work_delegate` is still in the draft"],
    ["the draft adds a setting", (t: string) => `${t}plan_model: fable\n`, removals, "the draft adds `plan_model`"],
    [
      "the draft deletes template guidance",
      (t: string) => t.replace("# --- Product pulse ---\n", ""),
      removals,
      "differs from the current template at `# Settings written by /ce-product-pulse",
    ],
    [
      "the draft keeps an old template's guidance",
      (t: string) => t.replace("# --- Product pulse ---\n", "# --- Product pulse ---\n# --- Cross-model review preference ---\n"),
      removals,
      "differs from the current template at `# --- Cross-model review preference ---`",
    ],
    ["the draft adds a comment", (t: string) => `${t}# injected\n`, removals, "the draft adds comment `# injected`"],
    [
      "the draft carries an old template version",
      (t: string) => t.replace(/template-version: \d+/, "template-version: 0"),
      removals,
      "draft template version is 0",
    ],
    [
      "a comment recorded as removed is still in the draft",
      (t: string) => t,
      [...removals, { type: "comment-remove", line: TEAM_NOTE, reason: "stale note" }],
      "is recorded as removed but is still in the draft",
    ],
    [
      "a value change recorded as a removal of a current setting",
      (t: string) => t.replace("docs_root: specs\n", ""),
      [...removals, { type: "remove", key: "docs_root", reason: "cleanup" }],
      "`docs_root` is not a retired setting",
    ],
  ])("fails when %s", (_label, mutate, changes, message) => {
    const { root, text } = good()
    const result = verifyWith(root, "tracked", mutate(text), changes)
    expect(result.status).toBe(1)
    expect(result.json.verify).toContain(message)
  })

  test("comment-move places a loose note above its setting and comment-remove drops a note", () => {
    const loose = "# Team: we keep specs out of docs/."
    const body = ["docs_root: specs", loose, "", TEAM_NOTE, "cross_model_peer: codex", ""].join("\n")
    const root = makeRepo({ tracked: body })
    const result = draft(root, "tracked", [
      { type: "comment-move", line: loose, key: "docs_root", reason: "describes docs_root" },
      { type: "comment-remove", line: TEAM_NOTE, reason: "no longer true" },
    ])
    expect(result.json.verify).toBe("ok")
    const text = draftText(result)
    expect(text).toContain(`\n${loose}\ndocs_root: specs\n`)
    expect(text).not.toContain(TEAM_NOTE)
    expect(text).not.toContain("does not recognize, and notes ---")
    expect(verifyWith(root, "tracked", text.replace(`${loose}\n`, ""), result.json.changes_recorded).json.verify).toContain(
      `team comment \`${loose}\` is missing`,
    )
  })

  test("a line number picks which of two identical team comments a change moves", () => {
    const todo = "# TODO: confirm with the team"
    const local = `${todo}\nplan_model: fable\n\n${todo}\ncustom_team_key: 1\ncross_model_peer: codex\n`
    const root = makeRepo({ local })
    const result = draft(root, "local", [
      { type: "comment-move", line: todo, lineno: 4, key: "cross_model_peer", reason: "about the peer" },
    ])
    expect(result.json.verify).toBe("ok")
    expect(draftText(result)).toBe(`${todo}\nplan_model: fable\n\ncustom_team_key: 1\n${todo}\ncross_model_peer: codex\n`)
    const wrongLine = draft(root, "local", [
      { type: "comment-move", line: todo, lineno: 2, key: "cross_model_peer", reason: "about the peer" },
    ])
    expect(wrongLine.json.refused).toContain("line 2 of config.local.yaml is not the team comment")
  })

  test("comment-move keeps a hand-written local file's layout and lands above its setting", () => {
    const local = "plan_model: fable\n# about the peer\ncustom_team_key: 1\ncross_model_peer: codex\n"
    const root = makeRepo({ local })
    const result = draft(root, "local", [
      { type: "comment-move", line: "# about the peer", key: "cross_model_peer", reason: "describes the peer" },
    ])
    expect(result.json.verify).toBe("ok")
    expect(draftText(result)).toBe("plan_model: fable\ncustom_team_key: 1\n# about the peer\ncross_model_peer: codex\n")
  })

  test("apply removes only the files draft wrote", () => {
    const root = makeRepo({ tracked: "cross_model_peer: codex\n" })
    const result = draft(root, "tracked")
    const workdir = path.dirname(result.json.draft)
    expect(applyDraft(root, "tracked", result).json.applied).toBe(true)
    expect(() => readFileSync(result.json.draft)).toThrow()
    expect(() => readFileSync(workdir)).toThrow()

    const kept = path.join(scratch, `ce-config-refresh-kept-${counter++}`)
    mkdirSync(kept)
    const keep = path.join(kept, "notes.txt")
    writeFileSync(keep, "mine")
    const fresh = makeRepo({ tracked: "cross_model_peer: codex\n" })
    const freshDraft = draft(fresh, "tracked")
    const moved = path.join(kept, "config.yaml")
    writeFileSync(moved, draftText(freshDraft))
    expect(run(fresh, ["apply", "--layer", "tracked", "--draft", moved, "--changes", freshDraft.json.changes]).json.applied).toBe(true)
    expect(readFileSync(keep, "utf8")).toBe("mine")
  })

  test("a typo rename to a candidate moves the value into the slot unchanged", () => {
    const root = makeRepo({ tracked: "work_engine_prefs:\n  - harness: codex\n" })
    const result = draft(root, "tracked", [
      { type: "rename", from: "work_engine_prefs", to: "work_engine_preferences", reason: "typo of work_engine_preferences" },
    ])
    expect(result.json.verify).toBe("ok")
    expect(draftText(result)).toContain("# work_engine_mode: prefer        # off | prefer | require (default: off)\nwork_engine_preferences:\n  - harness: codex\n")
  })

  test("apply refuses a draft edited after verification and leaves the file untouched", () => {
    const { root } = good()
    const result = draft(root, "tracked")
    writeFileSync(result.json.draft, draftText(result).replace("docs_root: specs", "docs_root: elsewhere"))
    const applied = applyDraft(root, "tracked", result)
    expect(applied.status).toBe(1)
    expect(applied.json.applied).toBe(false)
    expect(readLayer(root, "tracked")).toBe(original)
  })
})

describe("config-refresh of config.local.yaml", () => {
  test("a legacy full-template copy is cut down to its settings and team comments", () => {
    const peer = "# cross_model_peer: codex          # codex | claude | grok | cursor | composer"
    const local = `${withPeer(legacyLocal, peer)}\nplan_use_fable: true\nwork_delegate: codex\n`
    const root = makeRepo({ local })
    expect(run(root, ["status"]).json.local.state).toBe("legacy")
    const result = draft(root, "local")
    expect(result.json.action).toBe("cut-down")
    expect(result.json.changes_recorded).toEqual([
      expect.objectContaining({ type: "remove", key: "plan_use_fable", reason: expect.stringContaining("plan_model") }),
      expect.objectContaining({ type: "remove", key: "work_delegate", reason: expect.stringContaining("work_engine_preferences") }),
    ])
    const text = draftText(result)
    expect(text).toMatch(new RegExp(`^(# [^\\n]*\\n){3}\\n${TEAM_NOTE}\\n${CURRENT_PEER.replace(/[|]/g, "\\|")}\\n$`))
    expect(text).toContain("config.example.yaml")
    expect(applyDraft(root, "local", result).json.applied).toBe(true)
    expect(run(root, ["status"]).json.local.state).toBe("current")
    expect(draft(root, "local").json.action).toBe("none")
  })

  test("a hand-written local file keeps its layout and loses only retired settings", () => {
    const local = "# my overrides\nplan_model: fable\n\n# old\nfable_nudge: false\ncustom_team_key: 1\n"
    const root = makeRepo({ local })
    expect(run(root, ["status"]).json.local.state).toBe("retired-keys")
    const text = draftText(draft(root, "local"))
    expect(text).toBe("# my overrides\nplan_model: fable\n\n# old\ncustom_team_key: 1\n")
  })
})
