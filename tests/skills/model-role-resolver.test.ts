import { spawnSync } from "child_process"
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import path from "path"
import { afterAll, describe, expect, setDefaultTimeout, test } from "bun:test"
import { isolatedGitEnv } from "./helpers/packs-fixtures"

// Deterministic proof for the model role map resolver: every case runs the
// script against a throwaway repo built in this file's own temp directory.
setDefaultTimeout(30000)

// One line here plus the duplicated file adds a consumer (skills cannot import siblings).
const COPIES = [
  "skills/ce-setup/scripts/model-role-resolve.py",
  "skills/ce-brainstorm/scripts/model-role-resolve.py",
  "skills/ce-plan/scripts/model-role-resolve.py",
  "skills/ce-doc-review/scripts/model-role-resolve.py",
  "skills/ce-code-review/scripts/model-role-resolve.py",
  "skills/ce-work/scripts/model-role-resolve.py",
  "skills/ce-debug/scripts/model-role-resolve.py",
  "skills/ce-simplify-code/scripts/model-role-resolve.py",
  "skills/ce-compound/scripts/model-role-resolve.py",
]
const RESOLVER = path.join(process.cwd(), COPIES[0])
const ROLES = ["brainstorm", "plan", "doc-review", "debug", "work", "simplify", "code-review", "compound"]

const scratch = mkdtempSync(path.join(tmpdir(), "model-role-resolver-"))
afterAll(() => rmSync(scratch, { recursive: true, force: true }))

let counter = 0
function tempDir(name: string): string {
  const dir = path.join(scratch, `${name}-${counter++}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

/** A git repo with the team config and, optionally, the personal one. */
function makeProject(team?: string, local?: string): string {
  const dir = tempDir("project")
  const res = spawnSync("git", ["init", "-q"], { cwd: dir, encoding: "utf8", env: isolatedGitEnv })
  if (res.status !== 0) throw new Error(`git init failed: ${res.stderr}`)
  const ce = path.join(dir, ".compound-engineering")
  if (team !== undefined || local !== undefined) mkdirSync(ce)
  if (team !== undefined) writeFileSync(path.join(ce, "config.yaml"), team)
  if (local !== undefined) writeFileSync(path.join(ce, "config.local.yaml"), local)
  return dir
}

function run(cwd: string, args: string[], extraEnv: Record<string, string> = {}) {
  const res = spawnSync("python3", [RESOLVER, ...args], {
    cwd,
    encoding: "utf8",
    // The contributor's own allowlist must not leak into a case.
    env: { ...isolatedGitEnv, CROSS_MODEL_PEERS: "", ...extraEnv },
  })
  expect(res.status).toBe(0)
  return JSON.parse(res.stdout)
}

const role = (cwd: string, name: string, args: string[] = [], env: Record<string, string> = {}) =>
  run(cwd, ["--role", name, ...args], env)

const map = (body: string) => `model_roles:\n${body}`
const byRole = (out: { roles: { role: string }[] }, name: string): any => out.roles.find((r) => r.role === name)
const blocked = (out: { entries: { blocked_by: string | null }[] }) => out.entries.map((e) => e.blocked_by)

describe("model-role-resolve.py copies", () => {
  test("all nine skill copies are byte-identical", () => {
    const contents = COPIES.map((p) => readFileSync(path.join(process.cwd(), p), "utf8"))
    expect(contents.length).toBe(9)
    for (let i = 1; i < contents.length; i++) expect(contents[i]).toBe(contents[0])
  })
})

describe("entries and layering", () => {
  test("AE2: each role resolves from the personal file, then the team file", () => {
    const dir = makeProject(map("  plan: sonnet high\n  work: opus medium   # team default\n"), map("  plan: opus\n"))

    expect(role(dir, "work")).toEqual({
      role: "work",
      state: "entries",
      source: "team",
      entries: [{ seat: 1, model: "opus", effort: "medium", family: "claude", harness: "claude", blocked_by: null }],
      engine_opt_out: false,
      effort_scale: ["low", "medium", "high", "xhigh", "max"],
      warnings: [],
      errors: [],
    })

    const plan = role(dir, "plan")
    expect(plan.source).toBe("local")
    expect(plan.entries).toEqual([
      { seat: 1, model: "opus", effort: null, family: "claude", harness: null, blocked_by: null },
    ])
  })

  test("personal `inherit` over a team entry is state inherit", () => {
    const dir = makeProject(map("  debug: opus high\n"), map('  debug: "inherit"\n'))
    const out = role(dir, "debug")
    expect([out.state, out.source, out.entries]).toEqual(["inherit", "local", []])
  })

  test("block and flow lists on review roles return numbered seats in order, duplicates kept", () => {
    const dir = makeProject(
      map("  doc-review:\n    - opus high\n    - opus high\n    - grok-4.7\n  code-review: [gpt-5.5, 'gpt-5.5 xhigh']\n"),
    )
    const doc = role(dir, "doc-review")
    expect(doc.state).toBe("entries")
    expect(doc.entries.map((e: any) => [e.seat, e.model, e.effort])).toEqual([
      [1, "opus", "high"],
      [2, "opus", "high"],
      [3, "grok-4.7", null],
    ])
    expect(role(dir, "code-review").entries.map((e: any) => [e.seat, e.model, e.effort])).toEqual([
      [1, "gpt-5.5", null],
      [2, "gpt-5.5", "xhigh"],
    ])
  })

  test("a scalar on a review role is one seat; `[]` and scalar `inherit` are state inherit", () => {
    const dir = makeProject(map("  doc-review: opus high\n  code-review: []\n"))
    const doc = role(dir, "doc-review")
    expect(doc.state).toBe("entries")
    expect(doc.entries.map((e: any) => [e.seat, e.model, e.effort])).toEqual([[1, "opus", "high"]])
    expect(role(dir, "code-review").state).toBe("inherit")

    const scalarInherit = role(makeProject(map("  doc-review: [opus]\n"), map("  doc-review: inherit\n")), "doc-review")
    expect([scalarInherit.state, scalarInherit.source, scalarInherit.entries]).toEqual(["inherit", "local", []])
  })

  test("a list on a single-model role is skipped with a warning and the other layer is used", () => {
    const dir = makeProject(map("  work: gpt-5.5 high\n"), map("  work: [opus, sonnet]\n"))
    const out = role(dir, "work")
    expect(out.source).toBe("team")
    expect(out.entries).toEqual([
      { seat: 1, model: "gpt-5.5", effort: "high", family: "codex", harness: "codex", blocked_by: null },
    ])
    expect(out.warnings.length).toBe(1)
    expect(out.warnings[0]).toContain("config.local.yaml:2")
  })

  test("an unknown effort word invalidates a single-role entry; with no other layer the role is unset", () => {
    const out = role(makeProject(map("  plan: opus banana\n")), "plan")
    expect([out.state, out.source, out.entries]).toEqual(["unset", null, []])
    expect(out.warnings.length).toBe(1)
    expect(out.warnings[0]).toContain("banana")
  })

  test("a bad seat is returned marked invalid and the list never falls through to the other layer", () => {
    const dir = makeProject(map("  doc-review: [haiku]\n"), map("  doc-review: [opus high, grok-4.7 banana, sonnet]\n"))
    const out = role(dir, "doc-review")
    expect([out.state, out.source]).toEqual(["entries", "local"])
    expect(out.entries.map((e: any) => [e.seat, e.model, e.invalid === true])).toEqual([
      [1, "opus", false],
      [2, null, true],
      [3, "sonnet", false],
    ])
    expect(out.entries[1].reason).toContain("banana")
  })

  test("a malformed model_roles block is state invalid with an error for every role", () => {
    const dir = makeProject(map("  plan:\n    model: opus\n    effort: high\n  doc-review: [opus]\n"))
    for (const name of ["plan", "doc-review"]) {
      const out = role(dir, name)
      expect([out.state, out.source, out.entries]).toEqual(["invalid", null, []])
      expect(out.errors.length).toBeGreaterThan(0)
      expect(out.errors[0]).toContain("config.yaml:3")
    }
  })

  test("an unknown role key is ignored by --role and warned about by --all", () => {
    const dir = makeProject(map("  code_review: [opus]\n"))
    const one = role(dir, "code-review")
    expect([one.state, one.warnings, one.errors]).toEqual(["unset", [], []])
    const all = run(dir, ["--all"])
    expect(byRole(all, "code-review").state).toBe("unset")
    expect(all.warnings.length).toBe(1)
    expect(all.warnings[0]).toContain("code_review")
  })
})

describe("family and harness", () => {
  test("each model id lands in the expected family", () => {
    const models = ["fable", "claude-opus-5-5", "gpt-5.5", "o3-pro", "grok-4.7", "composer-2.5-fast", "openrouter/some-model"]
    const out = role(makeProject(map(`  doc-review: [${models.join(", ")}]\n`)), "doc-review")
    expect(out.entries.map((e: any) => [e.model, e.family])).toEqual([
      ["fable", "claude"],
      ["claude-opus-5-5", "claude"],
      ["gpt-5.5", "codex"],
      ["o3-pro", "codex"],
      ["grok-4.7", "grok"],
      ["composer-2.5-fast", "composer"],
      ["openrouter/some-model", "unknown"],
    ])
  })

  test("a work entry maps Composer to the cursor harness and an unknown family to none", () => {
    const composer = role(makeProject(map("  work: composer-2.5-fast\n")), "work")
    expect([composer.entries[0].family, composer.entries[0].harness]).toEqual(["composer", "cursor"])
    const unknown = role(makeProject(map("  work: openrouter/some-model high\n")), "work")
    expect([unknown.entries[0].family, unknown.entries[0].harness]).toEqual(["unknown", null])
  })
})

describe("review egress policy", () => {
  const seats = "  code-review: [opus high, grok-4.7, gpt-5.5 high, openrouter/some-model, inherit]\n"

  test("AE5, AE9: mode off keeps only same-family seats of an attested host; inherit is never blocked", () => {
    const dir = makeProject(`cross_model_review_mode: off\n${map(`${seats}  work: grok-4.7\n`)}`)
    const off = "review_mode_off"
    expect(blocked(role(dir, "code-review", ["--host-family", "claude"]))).toEqual([null, off, off, off, null])
    expect(blocked(role(dir, "code-review", ["--host-family", "unknown"]))).toEqual([off, off, off, off, null])
    expect(blocked(role(dir, "code-review"))).toEqual([off, off, off, off, null])
    // Policy is review-only: the same mode leaves a work entry alone.
    expect(blocked(role(dir, "work", ["--host-family", "claude"]))).toEqual([null])
  })

  test("CROSS_MODEL_PEERS keeps listed peers and the attested host family", () => {
    const dir = makeProject(map(seats))
    const list = "peers_allowlist"
    expect(blocked(role(dir, "code-review", ["--host-family", "claude"]))).toEqual([null, null, null, null, null])
    expect(blocked(role(dir, "code-review", ["--host-family", "claude"], { CROSS_MODEL_PEERS: "codex" }))).toEqual([
      null,
      list,
      null,
      list,
      null,
    ])
    expect(blocked(role(dir, "code-review", [], { CROSS_MODEL_PEERS: "codex" }))).toEqual([list, list, list, list, null])
  })

  test("`cursor` in CROSS_MODEL_PEERS also sanctions a Composer seat", () => {
    const dir = makeProject(map("  doc-review: [composer-2.5-fast, grok-4.7]\n"))
    const out = role(dir, "doc-review", ["--host-family", "claude"], { CROSS_MODEL_PEERS: " cursor " })
    expect(blocked(out)).toEqual([null, "peers_allowlist"])
  })

  test("a personal `cross_model_review_mode: off` beats a team `auto`", () => {
    const dir = makeProject(
      `cross_model_review_mode: auto\n${map("  doc-review: [opus, grok-4.7]\n")}`,
      "cross_model_review_mode: off\n",
    )
    expect(blocked(role(dir, "doc-review", ["--host-family", "claude"]))).toEqual([null, "review_mode_off"])
  })
})

describe("work engine opt-out", () => {
  test("a personal `work_engine_mode: off` opts a team work entry out, never a personal one", () => {
    const team = map("  work: gpt-5.5 high\n")
    const optedOut = role(makeProject(team, "work_engine_mode: off\n"), "work")
    expect([optedOut.source, optedOut.engine_opt_out]).toEqual(["team", true])
    // The reason travels with the answer, so a host need not re-read the personal file to state it.
    expect(optedOut.warnings).toEqual([
      "config.local.yaml sets `work_engine_mode: off`: the team `work` entry is not handed to another model",
    ])
    const personal = role(makeProject(team, `work_engine_mode: off\n${map("  work: opus\n")}`), "work")
    expect([personal.source, personal.engine_opt_out]).toEqual(["local", false])
    expect(personal.warnings).toEqual([])
  })
})

describe("--all", () => {
  const team = [
    "plan_model: fable",
    "cross_model_peer: codex",
    "work_engine_mode: prefer",
    "work_engine_preferences:",
    "  - harness: codex",
    "",
  ].join("\n")

  test("AE3: with no entry the existing key is the source; other roles fall to the session model", () => {
    const all = run(makeProject(team, "cross_model_effort: xhigh\n"), ["--all"])
    expect(all.roles.map((r: any) => r.role)).toEqual(ROLES)
    expect(all.effort_scale).toEqual(["low", "medium", "high", "xhigh", "max"])

    const plan = byRole(all, "plan")
    expect([plan.state, plan.source, plan.shadowed]).toEqual(["unset", null, []])
    expect(plan.effective).toEqual({ from: "existing_key", value: "plan_model: fable" })
    expect(plan.existing_keys).toEqual([{ key: "plan_model", file: "team", value: "fable" }])

    expect(byRole(all, "doc-review").existing_keys).toEqual([
      { key: "cross_model_peer", file: "team", value: "codex" },
      { key: "cross_model_effort", file: "local", value: "xhigh" },
    ])
    expect(byRole(all, "work").existing_keys).toEqual([
      { key: "work_engine_mode", file: "team", value: "prefer" },
      { key: "work_engine_preferences", file: "team", value: null },
    ])
    expect(byRole(all, "debug").effective).toEqual({ from: "session", value: null })
  })

  test("AE3: with an entry the map is the source and the existing key is listed as shadowed", () => {
    const all = run(makeProject(team, map("  plan: opus high\n  doc-review: [opus high, inherit]\n")), ["--all"])
    const plan = byRole(all, "plan")
    expect([plan.state, plan.source]).toEqual(["entries", "local"])
    expect(plan.effective).toEqual({ from: "map", value: "opus high" })
    expect(plan.shadowed).toEqual(["plan_model"])

    const doc = byRole(all, "doc-review")
    expect(doc.effective).toEqual({ from: "map", value: "opus high, inherit" })
    expect(doc.shadowed).toEqual(["cross_model_peer"])
    expect(byRole(all, "code-review").effective.from).toBe("existing_key")
  })
})

describe("no config to read", () => {
  const allUnset = (out: any) => out.roles.map((r: any) => [r.role, r.state, r.effective.from])
  const expected = ROLES.map((name) => [name, "unset", "session"])

  test("a repository with no config files leaves every role unset", () => {
    const out = run(makeProject(), ["--all"])
    expect(allUnset(out)).toEqual(expected)
    expect([out.warnings, out.errors]).toEqual([[], []])
  })

  test("outside a git repository every role is unset and the exit code is still 0", () => {
    const dir = tempDir("no-repo")
    const out = run(dir, ["--all"], { GIT_CEILING_DIRECTORIES: scratch })
    expect(allUnset(out)).toEqual(expected)
    expect(out.errors).toEqual([])
  })
})
