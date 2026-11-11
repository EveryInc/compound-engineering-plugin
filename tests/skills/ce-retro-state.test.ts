import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { spawn, spawnSync } from "node:child_process"
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

setDefaultTimeout(30_000)

const SCRIPT = path.join(__dirname, "../../skills/ce-retro/scripts/retro-state.py")

const EXIT_NOT_GIT = 3
const EXIT_UNWRITABLE = 4
const EXIT_UNSAFE = 5
const EXIT_INVALID = 6

function sandbox(): { root: string; env: NodeJS.ProcessEnv } {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), "ce-retro-state-")))
  const home = path.join(root, "home")
  mkdirSync(home)
  const env = {
    ...process.env,
    HOME: home,
    XDG_CONFIG_HOME: path.join(home, ".config"),
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_AUTHOR_NAME: "t",
    GIT_AUTHOR_EMAIL: "t@example.invalid",
    GIT_COMMITTER_NAME: "t",
    GIT_COMMITTER_EMAIL: "t@example.invalid",
  }
  return { root, env }
}

function git(env: NodeJS.ProcessEnv, cwd: string, ...args: string[]): string {
  const r = spawnSync("git", args, { cwd, env, encoding: "utf8" })
  if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`)
  return r.stdout.trim()
}

function repo(env: NodeJS.ProcessEnv, root: string, name = "repo"): string {
  const dir = path.join(root, name)
  mkdirSync(dir)
  git(env, dir, "init", "-q", "-b", "main")
  writeFileSync(path.join(dir, "README.md"), "x\n")
  git(env, dir, "add", ".")
  git(env, dir, "commit", "-q", "-m", "init")
  return dir
}

function run(env: NodeJS.ProcessEnv, cwd: string, args: string[], input?: string) {
  const r = spawnSync("python3", [SCRIPT, ...args], { cwd, env, input, encoding: "utf8" })
  let json: any
  try {
    json = JSON.parse(r.stdout)
  } catch {
    json = undefined
  }
  return { code: r.status ?? -1, stdout: r.stdout, stderr: r.stderr, json }
}

function record(env: NodeJS.ProcessEnv, cwd: string, rec: object) {
  return run(env, cwd, ["record"], JSON.stringify(rec))
}

const rejected = {
  target: "AGENTS.md",
  kind: "missing-test-command",
  state: "rejected",
  reason: "user prefers the README pointer",
  session_ids: ["s1"],
  harness: "claude",
}

describe("retro-state roots", () => {
  test("a non-git directory exits with the not-a-repo status", () => {
    const { root, env } = sandbox()
    const plain = path.join(root, "plain")
    mkdirSync(plain)
    const r = run(env, plain, ["roots"])
    expect(r.code).toBe(EXIT_NOT_GIT)
    expect(r.json.error).toBe("not-a-git-repo")
  })

  test("lists the common dir, main checkout, and every worktree", () => {
    const { root, env } = sandbox()
    const main = repo(env, root)
    const wt = path.join(root, "wt")
    git(env, main, "worktree", "add", "-q", "-b", "side", wt)
    const r = run(env, wt, ["roots"])
    expect(r.code).toBe(0)
    expect(r.json.common_dir).toBe(path.join(main, ".git"))
    expect(r.json.main_checkout).toBe(main)
    expect(r.json.bare).toBe(false)
    expect(r.json.worktrees).toEqual([main, wt])
  })
})

describe("retro-state store", () => {
  test("a linked worktree and the main checkout resolve the same store at the main checkout", () => {
    const { root, env } = sandbox()
    const main = repo(env, root)
    writeFileSync(path.join(main, ".gitignore"), ".context/\n")
    const wt = path.join(root, "wt")
    git(env, main, "worktree", "add", "-q", "-b", "side", wt)

    const fromWt = run(env, wt, ["store"])
    const fromMain = run(env, main, ["store"])
    const expected = path.join(main, ".context/compound-engineering/ce-retro")
    expect(fromWt.code).toBe(0)
    expect(fromWt.json.store).toBe(expected)
    expect(fromMain.json.store).toBe(expected)
    expect(fromWt.json.gitignored).toBe(true)
    expect(existsSync(expected)).toBe(true)
    expect(existsSync(path.join(wt, ".context"))).toBe(false)
  })

  test("a bare common repository keeps the store under its git common dir, even with a worktree attached", () => {
    const { root, env } = sandbox()
    const src = repo(env, root, "src")
    const bare = path.join(root, "b.git")
    git(env, root, "clone", "-q", "--bare", src, bare)
    const wt = path.join(root, "wt")
    git(env, bare, "worktree", "add", "-q", wt, "main")

    const r = run(env, wt, ["store"])
    expect(r.code).toBe(0)
    expect(r.json.store).toBe(path.join(bare, "compound-engineering/ce-retro"))
    expect(existsSync(path.join(wt, ".context"))).toBe(false)
  })

  test("Windows backup paths stay under the backup directory", () => {
    const probe = [
      "import importlib.util, ntpath, sys, json",
      `spec = importlib.util.spec_from_file_location("rs", ${JSON.stringify(SCRIPT)})`,
      "m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)",
      "base = 'D:\\\\repo\\\\.context\\\\compound-engineering\\\\ce-retro\\\\backups\\\\r1'",
      "print(json.dumps([m.backup_dest(base, s, ntpath) for s in sys.argv[1:]]))",
    ].join("\n")
    const r = spawnSync("python3", ["-c", probe, "C:\\Users\\Test\\.claude\\settings.json", "\\\\server\\share\\cfg.json"], { encoding: "utf8" })
    expect(r.status).toBe(0)
    const [local, unc] = JSON.parse(r.stdout)
    const base = "D:\\repo\\.context\\compound-engineering\\ce-retro\\backups\\r1\\"
    expect(local).toBe(base + "C\\Users\\Test\\.claude\\settings.json")
    expect(unc).toBe(base + "server_share\\cfg.json")
  })

  test("a symlinked ledger file is refused and its target is left untouched", () => {
    const { root, env } = sandbox()
    const main = repo(env, root)
    expect(run(env, main, ["store"]).code).toBe(0)
    const outside = path.join(root, "home", "settings.json")
    writeFileSync(outside, "original\n")
    symlinkSync(outside, path.join(main, ".context/compound-engineering/ce-retro/decisions.jsonl"))

    const r = run(env, main, ["record"], JSON.stringify({ target: "AGENTS.md", kind: "stale-path", state: "rejected", reason: "not worth it", session_ids: ["s1"], harness: "claude" }))
    expect(r.code).toBe(5)
    expect(readFileSync(outside, "utf8")).toBe("original\n")
  })

  test("a symlinked .context is refused with a reason", () => {
    const { root, env } = sandbox()
    const main = repo(env, root)
    const elsewhere = path.join(root, "elsewhere")
    mkdirSync(elsewhere)
    symlinkSync(elsewhere, path.join(main, ".context"))

    const r = run(env, main, ["store"])
    expect(r.code).toBe(EXIT_UNSAFE)
    expect(r.json.reason).toContain("symlink")
    expect(readdirSync(elsewhere)).toEqual([])
  })

  test("an existing shared .context/compound-engineering keeps its mode; the store is owner-only", () => {
    const { root, env } = sandbox()
    const main = repo(env, root)
    const shared = path.join(main, ".context/compound-engineering")
    mkdirSync(shared, { recursive: true })
    chmodSync(path.join(main, ".context"), 0o755)
    chmodSync(shared, 0o755)

    const r = run(env, main, ["store"])
    expect(r.code).toBe(0)
    expect(statSync(path.join(main, ".context")).mode & 0o777).toBe(0o755)
    expect(statSync(shared).mode & 0o777).toBe(0o755)
    expect(statSync(r.json.store).mode & 0o777).toBe(0o700)
  })

  test.skipIf(process.getuid?.() === 0)(
    "a read-only store exits with the unwritable status and writes nothing",
    () => {
      const { root, env } = sandbox()
      const main = repo(env, root)
      const store = path.join(main, ".context/compound-engineering/ce-retro")
      mkdirSync(store, { recursive: true })
      chmodSync(store, 0o500)
      try {
        const r = run(env, main, ["store"])
        expect(r.code).toBe(EXIT_UNWRITABLE)
        expect(readdirSync(store)).toEqual([])
      } finally {
        chmodSync(store, 0o700)
      }
    },
  )
})

describe("retro-state ledger", () => {
  test("the newest record for a key wins; the target and kind history returns both", () => {
    const { root, env } = sandbox()
    const main = repo(env, root)
    expect(record(env, main, rejected).code).toBe(0)
    const again = { ...rejected, state: "accepted", reason: undefined, signal: "no more lookups" }
    expect(record(env, main, again).code).toBe(0)

    const latest = run(env, main, ["read"])
    expect(latest.code).toBe(0)
    expect(latest.json.decisions).toHaveLength(1)
    expect(latest.json.decisions[0].state).toBe("accepted")
    expect(latest.json.decisions[0].key).toBe("AGENTS.md::missing-test-command")

    const history = run(env, main, ["read", "--target", "AGENTS.md", "--kind", "missing-test-command"])
    expect(history.json.history.map((r: any) => r.state)).toEqual(["rejected", "accepted"])
  })

  test("a harness absent from every run record has no cutoff", () => {
    const { root, env } = sandbox()
    const main = repo(env, root)
    const runs = [
      { cutoffs: { claude: "2026-11-01T00:00:00Z", codex: "2026-11-02T00:00:00Z" } },
      { cutoffs: { claude: "2026-11-05T00:00:00Z" } },
    ]
    for (const r of runs) expect(run(env, main, ["record-run"], JSON.stringify(r)).code).toBe(0)

    const r = run(env, main, ["read"])
    expect(r.json.cutoffs).toEqual({ claude: "2026-11-05T00:00:00Z", codex: "2026-11-02T00:00:00Z" })
    expect("pi" in r.json.cutoffs).toBe(false)
  })

  test("a record appended after an unfinished line is still read", () => {
    const { root, env } = sandbox()
    const main = repo(env, root)
    const store = run(env, main, ["store"]).json.store
    writeFileSync(path.join(store, "decisions.jsonl"), '{"key": "trunc')
    expect(record(env, main, rejected).code).toBe(0)
    const read = run(env, main, ["read"])
    expect(read.json.decisions.map((d: any) => d.target)).toEqual([rejected.target])
    expect(read.json.unreadable_lines).toBe(1)
  })

  test("a record with a field outside the schema is refused and nothing is written", () => {
    const { root, env } = sandbox()
    const main = repo(env, root)
    const r = record(env, main, { ...rejected, excerpt: "verbatim transcript text" })
    expect(r.code).toBe(EXIT_INVALID)
    expect(r.json.reason).toContain("excerpt")
    expect(run(env, main, ["read"]).json.decisions).toEqual([])
  })

  test.each([
    ["an unknown state", { ...rejected, state: "maybe" }],
    ["an accepted record without a signal", { ...rejected, state: "accepted", reason: undefined }],
    ["a rejected record without a reason", { ...rejected, reason: undefined }],
  ])("%s is refused and nothing is written", (_, rec) => {
    const { root, env } = sandbox()
    const main = repo(env, root)
    const r = record(env, main, rec)
    expect(r.code).toBe(EXIT_INVALID)
    expect(existsSync(path.join(main, ".context/compound-engineering/ce-retro/decisions.jsonl"))).toBe(false)
  })

  test("concurrent writers lose no records", async () => {
    const { root, env } = sandbox()
    const main = repo(env, root)
    const writers = Array.from({ length: 8 }, (_, i) =>
      new Promise<number>((resolve) => {
        const child = spawn("python3", [SCRIPT, "record"], { cwd: main, env })
        child.stdin.end(JSON.stringify({ ...rejected, kind: `kind-${i}` }))
        child.on("close", (code) => resolve(code ?? -1))
      }),
    )
    expect(await Promise.all(writers)).toEqual(Array(8).fill(0))
    expect(run(env, main, ["read"]).json.decisions).toHaveLength(8)
  })

  test("backup copies an outside file byte-identical into the run's subdirectory", () => {
    const { root, env } = sandbox()
    const main = repo(env, root)
    const outside = path.join(root, "home", "CLAUDE.md")
    const bytes = Buffer.from([0x23, 0x20, 0xff, 0x00, 0x0a, 0xe2, 0x9c, 0x93])
    writeFileSync(outside, bytes)

    const r = run(env, main, ["backup", "--run", "2026-11-10-a", "--file", outside])
    expect(r.code).toBe(0)
    const store = path.join(main, ".context/compound-engineering/ce-retro")
    expect(r.json.backup.startsWith(path.join(store, "backups/2026-11-10-a") + path.sep)).toBe(true)
    expect(readFileSync(r.json.backup).equals(bytes)).toBe(true)
  })

  test("a second backup in the same run keeps the first copy", () => {
    const { root, env } = sandbox()
    const main = repo(env, root)
    const outside = path.join(root, "home", "settings.json")
    writeFileSync(outside, "original\n")
    const first = run(env, main, ["backup", "--run", "r1", "--file", outside])
    expect(first.code).toBe(0)
    writeFileSync(outside, "changed\n")

    const second = run(env, main, ["backup", "--run", "r1", "--file", outside])
    expect(second.code).toBe(0)
    expect(second.json.existing).toBe(true)
    expect(second.json.backup).toBe(first.json.backup)
    expect(readFileSync(first.json.backup, "utf8")).toBe("original\n")
  })

  test.skipIf(process.getuid?.() === 0)("a failed backup leaves nothing a retry would accept as finished", () => {
    const { root, env } = sandbox()
    const main = repo(env, root)
    const outside = path.join(root, "home", "settings.json")
    writeFileSync(outside, "original\n")
    chmodSync(outside, 0o000)

    const failed = run(env, main, ["backup", "--run", "r1", "--file", outside])
    expect(failed.code).not.toBe(0)

    chmodSync(outside, 0o600)
    const retry = run(env, main, ["backup", "--run", "r1", "--file", outside])
    expect(retry.code).toBe(0)
    expect(retry.json.existing).toBe(false)
    expect(readFileSync(retry.json.backup, "utf8")).toBe("original\n")
    expect(readdirSync(path.dirname(retry.json.backup)).filter((n) => n.startsWith("."))).toEqual([])
  })

  test("--dest-root places the backup there and writes nothing into the repo", () => {
    const { root, env } = sandbox()
    const main = repo(env, root)
    const outside = path.join(root, "home", "CLAUDE.md")
    writeFileSync(outside, "x\n")
    const scratch = path.join(root, "scratch")
    mkdirSync(scratch)

    const r = run(env, main, ["backup", "--run", "r1", "--file", outside, "--dest-root", scratch])
    expect(r.code).toBe(0)
    expect(r.json.backup).toBe(path.join(scratch, "backups/r1", outside))
    expect(readFileSync(r.json.backup, "utf8")).toBe("x\n")
    expect(existsSync(path.join(main, ".context"))).toBe(false)
  })

  test("sessions and extract fold subagents under their parent and extract them together", () => {
    const { root, env } = sandbox()
    const main = repo(env, root)
    const home = env.HOME as string
    const sealed = {
      ...env,
      CLAUDE_CONFIG_DIR: path.join(home, ".claude"),
      CODEX_HOME: path.join(home, ".codex"),
      PI_CODING_AGENT_DIR: path.join(home, ".pi"),
      XDG_DATA_HOME: path.join(home, ".local/share"),
    }
    const parentId = "11111111-2222-3333-4444-555555555555"
    const project = path.join(home, ".claude/projects/-tmp-repo")
    const fixture = (name: string) =>
      readFileSync(path.join(__dirname, "../fixtures/session-history", name), "utf8").replaceAll(
        "/Users/test/Code/my-repo",
        main,
      )
    mkdirSync(path.join(project, parentId, "subagents"), { recursive: true })
    writeFileSync(path.join(project, `${parentId}.jsonl`), fixture("claude-session.jsonl").replaceAll("test-claude-session-1", parentId))
    for (const agent of ["agent-a1.jsonl", "agent-b2.jsonl"]) {
      writeFileSync(path.join(project, parentId, "subagents", agent), fixture("claude-subagent-session.jsonl"))
    }
    const out = mkdtempSync(path.join(root, "run-"))

    const found = run(sealed, main, ["sessions", "--days", "7", "--out", out])
    expect(found.code).toBe(0)
    expect(found.json.by_harness).toEqual({ claude: { sessions: 1, subagents: 2 } })
    const rows = readFileSync(path.join(out, "sessions.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l))
    expect(rows[0]).toMatchObject({ session: parentId, subagents: 2 })
    expect(rows.slice(1).every((r) => r.parent_session === parentId)).toBe(true)

    const ex = run(sealed, main, ["extract", "--out", out, "11111111"])
    expect(ex.code).toBe(0)
    expect(ex.json.sessions[parentId].files).toBe(3)
    expect(ex.json.failed).toEqual([])
    expect(readdirSync(path.join(out, "extracts", parentId)).sort()).toEqual([
      `${parentId}.jsonl.errors.txt`,
      `${parentId}.jsonl.skeleton.txt`,
      "agent-a1.jsonl.errors.txt",
      "agent-a1.jsonl.skeleton.txt",
      "agent-b2.jsonl.errors.txt",
      "agent-b2.jsonl.skeleton.txt",
    ])

    expect(run(sealed, main, ["extract", "--out", out, "99999999"]).code).toBe(EXIT_INVALID)
  })

  test("extract includes a subagent's own subagents under the top-level session", () => {
    const { root, env } = sandbox()
    const main = repo(env, root)
    const out = mkdtempSync(path.join(root, "run-"))
    const source = path.join(__dirname, "../fixtures/session-history/codex-session.jsonl")
    const file = (name: string) => {
      const p = path.join(root, `${name}.jsonl`)
      writeFileSync(p, readFileSync(source))
      return p
    }
    const rows = [
      { platform: "codex", session: "root-1", file: file("root") },
      { platform: "codex", session: "child-1", parent_session: "root-1", file: file("child") },
      { platform: "codex", session: "grandchild-1", parent_session: "child-1", file: file("grandchild") },
    ]
    writeFileSync(path.join(out, "sessions.jsonl"), rows.map((r) => JSON.stringify(r)).join("\n") + "\n")

    const ex = run(env, main, ["extract", "--out", out, "root-1"])
    expect(ex.code).toBe(0)
    expect(ex.json.sessions["root-1"].files).toBe(3)
    expect(readdirSync(path.join(out, "extracts", "root-1"))).toContain("grandchild.jsonl.skeleton.txt")
  })

  test.each(["..", ".", "a/b"])("--run %p is refused", (name) => {
    const { root, env } = sandbox()
    const main = repo(env, root)
    const outside = path.join(root, "home", "CLAUDE.md")
    writeFileSync(outside, "x\n")
    const r = run(env, main, ["backup", "--run", name, "--file", outside])
    expect(r.code).toBe(EXIT_INVALID)
    expect(existsSync(path.join(main, ".context"))).toBe(false)
  })
})
