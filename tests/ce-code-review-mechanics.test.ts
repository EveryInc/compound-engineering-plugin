import { mkdtempSync, mkdirSync, writeFileSync, chmodSync } from "fs"
import { tmpdir } from "os"
import path from "path"
import { spawnSync } from "node:child_process"
import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { writeKnowledgeFile } from "./skills/helpers/packs-fixtures"

setDefaultTimeout(20_000)

const SKILL_DIR = path.join(process.cwd(), "skills", "ce-code-review")
const SCOPE_SCRIPT = path.join(SKILL_DIR, "scripts", "review-scope.py")
const FINDINGS_SCRIPT = path.join(SKILL_DIR, "scripts", "findings-mechanics.py")

function run(command: string, args: string[], cwd?: string, input?: string) {
  return spawnSync(command, args, { cwd, input, encoding: "utf8" })
}

function git(cwd: string, ...args: string[]) {
  const result = run("git", args, cwd)
  expect(result.status).toBe(0)
  return result.stdout.trim()
}

function fixtureRepo() {
  const dir = mkdtempSync(path.join(tmpdir(), "ce-review-scope-"))
  git(dir, "init", "-q")
  git(dir, "config", "user.email", "eval@example.com")
  git(dir, "config", "user.name", "Eval")
  writeFileSync(path.join(dir, "service.ts"), "export const value = 1\n")
  git(dir, "add", ".")
  git(dir, "commit", "-qm", "base")
  const base = git(dir, "rev-parse", "HEAD")
  return { dir, base }
}

describe("ce-code-review deterministic mechanics", () => {
  test("scope helper counts structured text toward changed_lines and does not hard-block on markdown", () => {
    const { dir, base } = fixtureRepo()
    mkdirSync(path.join(dir, "docs"))
    writeFileSync(path.join(dir, "service.ts"), "export const value = 2\n")
    writeFileSync(path.join(dir, "docs", "note.md"), "context\n")
    git(dir, "add", ".")

    const result = run("python3", [SCOPE_SCRIPT, "--base", base], dir)
    expect(result.status).toBe(0)
    const scope = JSON.parse(result.stdout)

    expect(scope.exec_lines).toBe(2)
    expect(scope.changed_lines).toBeGreaterThanOrEqual(3)
    expect(scope.uncounted_files).toBe(0)
    expect(scope.changed_files).toEqual(["docs/note.md", "service.ts"])
    expect(scope.size_band).toBe("small")
    expect(scope.hard_block_full).toBe(false)
    expect(scope.lite_eligible).toBeUndefined()
  })

  test("scope helper counts .mjs and .cjs files as executable code", () => {
    const { dir, base } = fixtureRepo()
    writeFileSync(path.join(dir, "esm.mjs"), "export const value = 1\n")
    writeFileSync(path.join(dir, "common.cjs"), "module.exports = 1\n")
    git(dir, "add", ".")

    const result = run("python3", [SCOPE_SCRIPT, "--base", base], dir)
    expect(result.status).toBe(0)
    const scope = JSON.parse(result.stdout)

    expect(scope.exec_lines).toBe(2)
    expect(scope.changed_lines).toBe(2)
    expect(scope.uncounted_files).toBe(0)
    expect(scope.size_band).toBe("small")
    expect(scope.hard_block_full).toBe(false)
  })

  test("scope helper counts a small YAML-only edit without awarding lite", () => {
    const { dir, base } = fixtureRepo()
    mkdirSync(path.join(dir, ".compound-engineering"))
    writeFileSync(path.join(dir, ".compound-engineering", "config.yaml"), "docs_root: docs\ntimeout: 30\n")
    git(dir, "add", ".")
    git(dir, "commit", "-qm", "add config")
    const configured = git(dir, "rev-parse", "HEAD")
    writeFileSync(path.join(dir, ".compound-engineering", "config.yaml"), "docs_root: docs\n")
    git(dir, "add", ".")

    const result = run("python3", [SCOPE_SCRIPT, "--base", configured], dir)
    expect(result.status).toBe(0)
    const scope = JSON.parse(result.stdout)

    expect(scope.status).toBe("complete")
    expect(scope.changed_files).toEqual([".compound-engineering/config.yaml"])
    expect(scope.changed_lines).toBe(1)
    expect(scope.exec_lines).toBe(0)
    expect(scope.size_band).toBe("small")
    expect(scope.hard_block_full).toBe(false)
    expect(scope.hard_block_classes).toEqual([])
    expect(scope.lite_eligible).toBeUndefined()
  })

  test("scope helper hard-blocks a diff it cannot fully count", () => {
    const { dir, base } = fixtureRepo()
    writeFileSync(path.join(dir, "service.ts"), "export const value = 2\n")
    writeFileSync(path.join(dir, "blob.bin"), Buffer.from([0, 1, 2, 3, 255, 0, 7]))
    git(dir, "add", ".")

    const result = run("python3", [SCOPE_SCRIPT, "--base", base], dir)
    expect(result.status).toBe(0)
    const scope = JSON.parse(result.stdout)

    // A binary or otherwise uncountable file means the helper cannot measure the
    // whole change, so the floor is set even though the counted part is small.
    expect(scope.uncounted_files).toBeGreaterThan(0)
    expect(scope.size_band).toBe("small")
    expect(scope.hard_block_classes).toContain("uncounted")
    expect(scope.hard_block_full).toBe(true)
  })

  test("scope helper names a CI workflow path as a silent-pass class, not a full floor", () => {
    const { dir, base } = fixtureRepo()
    mkdirSync(path.join(dir, ".github", "workflows"), { recursive: true })
    writeFileSync(path.join(dir, ".github", "workflows", "ci.yml"), "on: push\njobs:\n  t:\n    runs-on: ubuntu-latest\n")
    git(dir, "add", ".")

    const result = run("python3", [SCOPE_SCRIPT, "--base", base], dir)
    expect(result.status).toBe(0)
    const scope = JSON.parse(result.stdout)

    expect(scope.silent_pass_classes).toContain("ci")
    expect(scope.hard_block_classes).toEqual([])
    expect(scope.hard_block_full).toBe(false)
    expect(scope.size_band).toBe("small")
  })

  test("scope helper still hard-blocks a migration path", () => {
    const { dir, base } = fixtureRepo()
    mkdirSync(path.join(dir, "db", "migrate"), { recursive: true })
    writeFileSync(path.join(dir, "db", "migrate", "001_add_users.rb"), "class AddUsers < ActiveRecord::Migration; end\n")
    git(dir, "add", ".")

    const result = run("python3", [SCOPE_SCRIPT, "--base", base], dir)
    expect(result.status).toBe(0)
    const scope = JSON.parse(result.stdout)

    expect(scope.hard_block_classes).toContain("migrations")
    expect(scope.hard_block_full).toBe(true)
    expect(scope.silent_pass_classes).toEqual([])
  })

  test("scope helper treats a frontend signal as a prompt, not a hard block", () => {
    const { dir, base } = fixtureRepo()
    writeFileSync(path.join(dir, "App.tsx"), "export const App = () => null\n")
    git(dir, "add", ".")

    const result = run("python3", [SCOPE_SCRIPT, "--base", base], dir)
    expect(result.status).toBe(0)
    const scope = JSON.parse(result.stdout)

    expect(scope.signals).toContain("frontend")
    expect(scope.size_band).toBe("small")
    expect(scope.hard_block_full).toBe(false)
  })

  test("scope helper leaves a 40-line executable change below the full floor", () => {
    // The floor counts executable non-test lines against FULL_EXEC_LINE_MIN, not
    // total changed lines: a 40-line change is the gate's consequence question.
    const { dir, base } = fixtureRepo()
    const lines = Array.from({ length: 40 }, (_, i) => `export const n${i} = ${i}`).join("\n") + "\n"
    writeFileSync(path.join(dir, "service.ts"), lines)
    git(dir, "add", ".")

    const result = run("python3", [SCOPE_SCRIPT, "--base", base], dir)
    expect(result.status).toBe(0)
    const scope = JSON.parse(result.stdout)

    expect(scope.changed_lines).toBeGreaterThanOrEqual(40)
    expect(scope.exec_nontest_lines).toBeGreaterThanOrEqual(40)
    expect(scope.size_band).toBe("small")
    expect(scope.hard_block_full).toBe(false)
    expect(scope.hard_block_classes).toEqual([])
  })

  test("scope helper hard-blocks executable non-test changes at the full floor", () => {
    const { dir, base } = fixtureRepo()
    const lines = Array.from({ length: 200 }, (_, i) => `export const n${i} = ${i}`).join("\n") + "\n"
    writeFileSync(path.join(dir, "service.ts"), lines)
    git(dir, "add", ".")

    const result = run("python3", [SCOPE_SCRIPT, "--base", base], dir)
    expect(result.status).toBe(0)
    const scope = JSON.parse(result.stdout)

    expect(scope.exec_nontest_lines).toBeGreaterThanOrEqual(200)
    expect(scope.size_band).toBe("large")
    expect(scope.hard_block_full).toBe(true)
    expect(scope.hard_block_classes).toEqual([])
  })

  test("scope helper hard-blocks a large shell script at the full floor", () => {
    const { dir, base } = fixtureRepo()
    const lines = Array.from({ length: 250 }, (_, i) => `echo "line ${i}"`).join("\n") + "\n"
    writeFileSync(path.join(dir, "run.sh"), lines)
    git(dir, "add", ".")

    const result = run("python3", [SCOPE_SCRIPT, "--base", base], dir)
    expect(result.status).toBe(0)
    const scope = JSON.parse(result.stdout)

    expect(scope.exec_nontest_lines).toBeGreaterThanOrEqual(250)
    expect(scope.size_band).toBe("large")
    expect(scope.hard_block_full).toBe(true)
  })

  test("scope helper hard-blocks a large extensionless executable at the full floor", () => {
    const { dir, base } = fixtureRepo()
    const lines = Array.from({ length: 250 }, (_, i) => `echo "line ${i}"`).join("\n") + "\n"
    mkdirSync(path.join(dir, "bin"))
    const scriptPath = path.join(dir, "bin", "deploy")
    writeFileSync(scriptPath, lines)
    chmodSync(scriptPath, 0o755)
    git(dir, "add", ".")

    const result = run("python3", [SCOPE_SCRIPT, "--base", base], dir)
    expect(result.status).toBe(0)
    const scope = JSON.parse(result.stdout)

    expect(scope.exec_nontest_lines).toBeGreaterThanOrEqual(250)
    expect(scope.size_band).toBe("large")
    expect(scope.hard_block_full).toBe(true)
  })

  test("scope helper hard-blocks a renamed large extensionless executable at the full floor", () => {
    const { dir, base } = fixtureRepo()
    mkdirSync(path.join(dir, "bin"))
    const oldPath = path.join(dir, "bin", "old")
    const baseLines = Array.from({ length: 500 }, (_, i) => `echo "line ${i}"`)
    writeFileSync(oldPath, baseLines.join("\n") + "\n")
    chmodSync(oldPath, 0o755)
    git(dir, "add", ".")
    git(dir, "commit", "-qm", "add executable")
    const renameBase = git(dir, "rev-parse", "HEAD")

    git(dir, "mv", "bin/old", "bin/new")
    const newPath = path.join(dir, "bin", "new")
    const changedLines = baseLines.slice()
    for (let i = 0; i < 210; i++) {
      changedLines[i] = `echo "changed ${i}"`
    }
    writeFileSync(newPath, changedLines.join("\n") + "\n")
    git(dir, "add", "-A", "bin")

    const rawResult = run("git", ["diff", "--raw", renameBase], dir)
    expect(rawResult.stdout).toMatch(/R\d+\tbin\/old\tbin\/new/)

    const result = run("python3", [SCOPE_SCRIPT, "--base", renameBase], dir)
    expect(result.status).toBe(0)
    const scope = JSON.parse(result.stdout)

    expect(scope.exec_nontest_lines).toBeGreaterThanOrEqual(210)
    expect(scope.size_band).toBe("large")
    expect(scope.hard_block_full).toBe(true)
  })

  test("scope helper keeps the migration floor and executable count through a directory-collapsing rename", () => {
    const { dir } = fixtureRepo()
    mkdirSync(path.join(dir, "db", "legacy", "migrate"), { recursive: true })
    mkdirSync(path.join(dir, "bin", "sub"), { recursive: true })
    writeFileSync(path.join(dir, "db", "legacy", "migrate", "001_init.rb"), "class Init < ActiveRecord::Migration[7.0]\nend\n")
    const toolPath = path.join(dir, "bin", "sub", "tool")
    writeFileSync(toolPath, Array.from({ length: 30 }, (_, i) => `echo "line ${i}"`).join("\n") + "\n")
    chmodSync(toolPath, 0o755)
    git(dir, "add", ".")
    git(dir, "commit", "-qm", "add nested files")
    const renameBase = git(dir, "rev-parse", "HEAD")

    mkdirSync(path.join(dir, "db", "migrate"))
    git(dir, "mv", "db/legacy/migrate/001_init.rb", "db/migrate/001_init.rb")
    git(dir, "mv", "bin/sub/tool", "bin/tool")
    writeFileSync(path.join(dir, "db", "migrate", "001_init.rb"), "class Init < ActiveRecord::Migration[7.0]\n  def change; end\nend\n")
    const toolLines = Array.from({ length: 30 }, (_, i) => `echo "line ${i}"`)
    toolLines[0] = 'echo "changed 0"'
    writeFileSync(path.join(dir, "bin", "tool"), toolLines.join("\n") + "\n")
    git(dir, "add", "-A")

    const numstat = run("git", ["diff", "--numstat", renameBase], dir)
    expect(numstat.stdout).toMatch(/bin\/\{sub => \}\/tool/)
    expect(numstat.stdout).toMatch(/db\/\{legacy => \}\/migrate/)

    const result = run("python3", [SCOPE_SCRIPT, "--base", renameBase], dir)
    expect(result.status).toBe(0)
    const scope = JSON.parse(result.stdout)
    expect(scope.changed_files).toEqual(["bin/tool", "db/migrate/001_init.rb"])
    expect(scope.hard_block_classes).toContain("migrations")
    expect(scope.exec_nontest_lines).toBeGreaterThanOrEqual(2)
    expect(scope.unclassified_lines).toEqual({})
  })

  test("scope helper does not count test files toward the full floor", () => {
    const { dir, base } = fixtureRepo()
    mkdirSync(path.join(dir, "tests"))
    const lines = Array.from({ length: 250 }, (_, i) => `test("n${i}", () => {})`).join("\n") + "\n"
    writeFileSync(path.join(dir, "tests", "service.test.ts"), lines)
    git(dir, "add", ".")

    const result = run("python3", [SCOPE_SCRIPT, "--base", base], dir)
    expect(result.status).toBe(0)
    const scope = JSON.parse(result.stdout)

    expect(scope.exec_lines).toBeGreaterThanOrEqual(250)
    expect(scope.exec_nontest_lines).toBe(0)
    expect(scope.test_files_changed).toBe(true)
    expect(scope.size_band).toBe("small")
    expect(scope.hard_block_full).toBe(false)
  })

  test("scope helper recognizes a test_*.py module outside a tests/ directory", () => {
    const { dir, base } = fixtureRepo()
    mkdirSync(path.join(dir, "pkg"))
    const lines = Array.from({ length: 250 }, (_, i) => `def test_n${i}(): pass`).join("\n") + "\n"
    writeFileSync(path.join(dir, "pkg", "test_service.py"), lines)
    git(dir, "add", ".")

    const result = run("python3", [SCOPE_SCRIPT, "--base", base], dir)
    expect(result.status).toBe(0)
    const scope = JSON.parse(result.stdout)

    expect(scope.test_files_changed).toBe(true)
    expect(scope.exec_nontest_lines).toBe(0)
    expect(scope.size_band).toBe("small")
    expect(scope.hard_block_full).toBe(false)
  })

  test("scope helper does not treat a production file whose name ends in test as a test file", () => {
    const { dir, base } = fixtureRepo()
    const lines = Array.from({ length: 250 }, (_, i) => `export const n${i} = ${i}`).join("\n") + "\n"
    writeFileSync(path.join(dir, "latest.ts"), lines)
    git(dir, "add", ".")

    const result = run("python3", [SCOPE_SCRIPT, "--base", base], dir)
    expect(result.status).toBe(0)
    const scope = JSON.parse(result.stdout)

    expect(scope.test_files_changed).toBe(false)
    expect(scope.exec_nontest_lines).toBeGreaterThanOrEqual(250)
    expect(scope.size_band).toBe("large")
  })

  test("scope helper keeps a case-sensitive class-suffix test match so Contest.java is code", () => {
    const { dir, base } = fixtureRepo()
    const lines = Array.from({ length: 250 }, (_, i) => `class Contest${i} {}`).join("\n") + "\n"
    writeFileSync(path.join(dir, "Contest.java"), lines)
    git(dir, "add", ".")

    const result = run("python3", [SCOPE_SCRIPT, "--base", base], dir)
    expect(result.status).toBe(0)
    const scope = JSON.parse(result.stdout)

    expect(scope.test_files_changed).toBe(false)
    expect(scope.exec_nontest_lines).toBeGreaterThanOrEqual(250)
    expect(scope.size_band).toBe("large")
  })

  test("scope helper reports an unlisted executable language as unclassified lines, never a floor", () => {
    const { dir, base } = fixtureRepo()
    const big = Array.from({ length: 400 }, (_, i) => `x${i} <- ${i}`).join("\n") + "\n"
    writeFileSync(path.join(dir, "model.R"), big)
    git(dir, "add", ".")

    const result = run("python3", [SCOPE_SCRIPT, "--base", base], dir)
    expect(result.status).toBe(0)
    const scope = JSON.parse(result.stdout)

    expect(scope.exec_nontest_lines).toBe(0)
    expect(scope.changed_lines).toBeGreaterThanOrEqual(400)
    expect(scope.unclassified_lines).toEqual({ ".r": 400 })
    expect(scope.size_band).toBe("small")
    expect(scope.hard_block_full).toBe(false)
  })

  test("scope helper lists prose and test files separately from unclassified lines", () => {
    const { dir, base } = fixtureRepo()
    mkdirSync(path.join(dir, "docs"))
    mkdirSync(path.join(dir, "tests"))
    writeFileSync(path.join(dir, "docs", "guide.md"), Array.from({ length: 30 }, (_, i) => `line ${i}`).join("\n") + "\n")
    writeFileSync(path.join(dir, "tests", "fixture.txt"), "a\nb\n")
    git(dir, "add", ".")

    const result = run("python3", [SCOPE_SCRIPT, "--base", base], dir)
    expect(result.status).toBe(0)
    const scope = JSON.parse(result.stdout)

    expect(scope.exec_nontest_lines).toBe(0)
    expect(scope.unclassified_lines).toEqual({ ".md": 30 })
    expect(scope.test_files_changed).toBe(true)
  })

  test("scope helper emits UNKNOWN-equivalent state for an invalid endpoint", () => {
    const { dir } = fixtureRepo()
    const result = run("python3", [SCOPE_SCRIPT, "--base", "missing-ref"], dir)
    expect(result.status).toBe(0)
    const scope = JSON.parse(result.stdout)

    expect(scope.exec_lines).toBeNull()
    expect(scope.changed_lines).toBeNull()
    expect(scope.uncounted_files).toBeGreaterThan(0)
    expect(scope.size_band).toBe("unknown")
    expect(scope.hard_block_full).toBe(true)
    expect(scope.hard_block_classes).toContain("unknown-scope")
    expect(scope.silent_pass_classes).toEqual([])
  })

  test("scope helper resolves the learnings corpus under a configured docs_root", () => {
    const { dir, base } = fixtureRepo()
    // Corpus lives under a relocated root, not the default docs/.
    mkdirSync(path.join(dir, ".ce-artifacts", "solutions"), { recursive: true })
    mkdirSync(path.join(dir, "docs", "solutions"), { recursive: true })

    // Default root sees the legacy docs/solutions corpus.
    const dflt = JSON.parse(run("python3", [SCOPE_SCRIPT, "--base", base], dir).stdout)
    expect(dflt.has_learnings_corpus).toBe(true)

    // Configured root targets its own solutions dir.
    const configured = JSON.parse(
      run("python3", [SCOPE_SCRIPT, "--base", base, "--docs-root", ".ce-artifacts"], dir).stdout,
    )
    expect(configured.has_learnings_corpus).toBe(true)

    // A configured root with no corpus reports absent, without reading docs/.
    const empty = JSON.parse(
      run("python3", [SCOPE_SCRIPT, "--base", base, "--docs-root", ".ce-empty"], dir).stdout,
    )
    expect(empty.has_learnings_corpus).toBe(false)
  })

  test("scope helper treats an absolute or escaping docs_root as no corpus, not a crash", () => {
    const { dir, base } = fixtureRepo()
    mkdirSync(path.join(dir, "docs", "solutions"), { recursive: true })
    for (const badRoot of ["/etc", "../outside", ".git/hooks"]) {
      const result = run("python3", [SCOPE_SCRIPT, "--base", base, "--docs-root", badRoot], dir)
      expect(result.status).toBe(0) // read-only signal generator: degrade, never fail the scope calc
      expect(JSON.parse(result.stdout).has_learnings_corpus).toBe(false)
    }
  })

  test("scope helper resolves docs_root against the git toplevel, not the cwd subdirectory", () => {
    const { dir, base } = fixtureRepo()
    mkdirSync(path.join(dir, ".ce-artifacts", "solutions"), { recursive: true })
    const subdir = path.join(dir, "packages", "inner")
    mkdirSync(subdir, { recursive: true })
    // Run from a subdirectory: docs_root is repo-relative, so the corpus must
    // still resolve under the repo root, not <subdir>/.ce-artifacts/solutions.
    const result = run("python3", [SCOPE_SCRIPT, "--base", base, "--docs-root", ".ce-artifacts"], subdir)
    expect(result.status).toBe(0)
    expect(JSON.parse(result.stdout).has_learnings_corpus).toBe(true)
  })

  test("scope helper falls back to the default root for an unsubstituted or empty docs_root", () => {
    const { dir, base } = fixtureRepo()
    mkdirSync(path.join(dir, "docs", "solutions"), { recursive: true })
    // A caller that forgets to substitute the <root> placeholder, or passes an
    // empty value, must still find the default docs/solutions corpus.
    for (const value of ["<root>", ""]) {
      const result = run("python3", [SCOPE_SCRIPT, "--base", base, "--docs-root", value], dir)
      expect(result.status).toBe(0)
      expect(JSON.parse(result.stdout).has_learnings_corpus).toBe(true)
    }
  })

  // Review enforcement of Compound Packs rides on the learnings persona, whose
  // gate used to require an existing solutions corpus. A repo that adopts packs
  // before it has any learnings must still report a reason to select it. The
  // helper answers from the config alone (the resolver's --declared-only mode:
  // no clone, no cache), so `pack_roots` is always 0 and the signal is cheap in
  // every scope.
  function packsFixture() {
    const fixture = fixtureRepo()
    mkdirSync(path.join(fixture.dir, ".compound-engineering"), { recursive: true })
    writeKnowledgeFile(
      path.join(fixture.dir, "compound-packs", "house-rules"),
      "validate-input.md",
      "Validate input at the boundary",
      "adding an HTTP handler",
    )
    return fixture
  }

  test("scope helper reports no declared packs without a config or without a packs key", () => {
    const { dir, base } = packsFixture()

    const none = JSON.parse(run("python3", [SCOPE_SCRIPT, "--base", base], dir).stdout)
    expect(none.declared_packs).toBe(false)
    expect(none.pack_roots).toBe(0)
    expect(none.has_learnings_corpus).toBe(false)

    writeFileSync(path.join(dir, ".compound-engineering", "config.yaml"), "docs_root: docs\n")
    const noKey = JSON.parse(run("python3", [SCOPE_SCRIPT, "--base", base], dir).stdout)
    expect(noKey.declared_packs).toBe(false)
  })

  test("scope helper reports a declared pack independently of the learnings corpus", () => {
    const { dir, base } = packsFixture()
    writeFileSync(
      path.join(dir, ".compound-engineering", "config.yaml"),
      "packs:\n  - source: compound-packs/house-rules\n",
    )
    const declared = JSON.parse(run("python3", [SCOPE_SCRIPT, "--base", base], dir).stdout)
    expect(declared.declared_packs).toBe(true)
    expect(declared.pack_roots).toBe(0)
    expect(declared.has_learnings_corpus).toBe(false)
  })

  test("scope helper does not evaluate declared_packs in remote scope", () => {
    const { dir, base } = packsFixture()
    writeFileSync(
      path.join(dir, ".compound-engineering", "config.yaml"),
      "packs:\n  - source: compound-packs/house-rules\n",
    )
    // Remote scope passes --head; the local config is not the reviewed tree's
    // config, so the helper reports null without running the resolver at all.
    const remote = JSON.parse(run("python3", [SCOPE_SCRIPT, "--base", base, "--head", base], dir).stdout)
    expect(remote.status).toBe("complete")
    expect(remote.declared_packs).toBeNull()
    expect(remote.pack_roots).toBe(0)
  })

  test("scope helper treats a broken pack entry as declared, and keeps the signal when failing closed", () => {
    const { dir, base } = packsFixture()
    // The learnings pass surfaces the resolver error in Coverage, so it must still be selected.
    writeFileSync(
      path.join(dir, ".compound-engineering", "config.yaml"),
      "packs:\n  - source: compound-packs/does-not-exist\n",
    )
    const broken = JSON.parse(run("python3", [SCOPE_SCRIPT, "--base", base], dir).stdout)
    expect(broken.declared_packs).toBe(true)
    expect(broken.pack_roots).toBe(0)

    const failed = JSON.parse(run("python3", [SCOPE_SCRIPT, "--base", "missing-ref"], dir).stdout)
    expect(failed.status).toBe("unknown")
    expect(failed.declared_packs).toBe(true)
  })

  test("scope helper fails closed when a remote head endpoint is empty", () => {
    const { dir, base } = fixtureRepo()
    writeFileSync(path.join(dir, "service.ts"), "export const value = 2\n")

    const result = run("python3", [SCOPE_SCRIPT, "--base", base, "--head", ""], dir)
    expect(result.status).toBe(0)
    const scope = JSON.parse(result.stdout)

    expect(scope.reason).toBe("invalid head endpoint")
    expect(scope.exec_lines).toBeNull()
    expect(scope.changed_files).toEqual([])
    expect(scope.hard_block_full).toBe(true)
    expect(scope.size_band).toBe("unknown")
  })

  test("scope helper excludes base-only changes after the base advances", () => {
    const { dir, base } = fixtureRepo()
    git(dir, "checkout", "-qb", "review-head")
    writeFileSync(path.join(dir, "worker.ts"), "export const worker = true\n")
    git(dir, "add", ".")
    git(dir, "commit", "-qm", "head change")
    const head = git(dir, "rev-parse", "HEAD")

    git(dir, "checkout", "-q", base)
    mkdirSync(path.join(dir, "api"))
    writeFileSync(path.join(dir, "api", "routes.test.ts"), "export const route = true\n")
    git(dir, "add", ".")
    git(dir, "commit", "-qm", "advance base")
    const advancedBase = git(dir, "rev-parse", "HEAD")

    const result = run(
      "python3",
      [SCOPE_SCRIPT, "--base", advancedBase, "--head", head],
      dir,
    )
    expect(result.status).toBe(0)
    const scope = JSON.parse(result.stdout)

    expect(scope.changed_files).toEqual(["worker.ts"])
    expect(scope.signals).toEqual([])
    expect(scope.test_files_changed).toBe(false)
    expect(scope.exec_lines).toBe(1)
  })

  test("findings helper validates, exact-deduplicates, gates, sorts, and numbers", () => {
    const returns = [
      {
        reviewer: "correctness",
        findings: [
          {
            title: "Primary defect",
            severity: "P1",
            file: "src/worker.ts",
            line: 12,
            confidence: 75,
            autofix_class: "gated_auto",
            owner: "downstream-resolver",
            requires_verification: true,
            pre_existing: false,
            first_evidence: "src/worker.ts:12 -- result = staleValue",
          },
        ],
        residual_risks: [],
        testing_gaps: [],
      },
      {
        reviewer: "reliability",
        findings: [
          {
            title: "Primary defect",
            severity: "P1",
            file: "src/worker.ts",
            line: 12,
            confidence: 75,
            autofix_class: "manual",
            owner: "human",
            requires_verification: true,
            pre_existing: false,
            first_evidence: "src/worker.ts:12 -- result = staleValue",
          },
          {
            title: "Speculative cleanup",
            severity: "P3",
            file: "src/worker.ts",
            line: 2,
            confidence: 50,
            autofix_class: "advisory",
            owner: "human",
            requires_verification: false,
            pre_existing: false,
          },
        ],
        residual_risks: [],
        testing_gaps: [],
      },
    ]

    const result = run("python3", [FINDINGS_SCRIPT], undefined, JSON.stringify(returns))
    expect(result.status).toBe(0)
    const merged = JSON.parse(result.stdout)

    expect(merged.findings).toHaveLength(1)
    expect(merged.findings[0]["#"]).toBe(1)
    expect(merged.findings[0].confidence).toBe(75)
    expect(merged.findings[0].autofix_class).toBe("manual")
    expect(merged.findings[0].owner).toBe("human")
    expect(merged.findings[0].reviewers).toEqual(["correctness", "reliability"])
    expect(merged.findings[0].independent_reviewers).toEqual(["correctness", "reliability"])
    expect(merged.suppressed_by_confidence).toEqual({ "50": 1 })
  })

  test("agreement promotes only with a verified cross-model peer", () => {
    const finding = {
      title: "Stale result", severity: "P1", file: "src/worker.ts", line: 12,
      confidence: 75, autofix_class: "manual", owner: "downstream-resolver",
      requires_verification: true, pre_existing: false,
      first_evidence: "src/worker.ts:12 -- result = staleValue",
    }
    const merge = (peer: Record<string, unknown>) => {
      const returns = [
        { reviewer: "correctness", findings: [finding], residual_risks: [], testing_gaps: [] },
        { reviewer: "reliability", findings: [finding], residual_risks: [], testing_gaps: [] },
        { reviewer: "adversarial-codex", findings: [finding], residual_risks: [], testing_gaps: [], ...peer },
      ]
      const result = run("python3", [FINDINGS_SCRIPT], undefined, JSON.stringify(returns))
      expect(result.status).toBe(0)
      return JSON.parse(result.stdout).findings[0]
    }

    const verified = merge({ independence_verified: true })
    expect(verified.confidence).toBe(100)
    expect(verified.independent_reviewers).toEqual(["correctness", "reliability", "adversarial-codex"])

    const unverified = merge({ independence_verified: false })
    expect(unverified.confidence).toBe(75)
    expect(unverified.independent_reviewers).toEqual(["correctness", "reliability"])
  })

  test("synthetic reruns preserve independent corroboration from semantic duplicates", () => {
    const reconciled = {
      title: "Reconciled stale-state defect",
      severity: "P1",
      file: "src/worker.ts",
      line: 12,
      confidence: 50,
      autofix_class: "manual",
      owner: "human",
      requires_verification: true,
      pre_existing: false,
      first_evidence: "src/worker.ts:12 -- result = staleValue",
      reviewers: ["correctness", "adversarial-codex"],
      independent_reviewers: ["correctness", "adversarial-codex"],
    }

    const result = run(
      "python3",
      [FINDINGS_SCRIPT],
      undefined,
      JSON.stringify([
        {
          reviewer: "synthesis",
          findings: [reconciled],
          residual_risks: [],
          testing_gaps: [],
        },
      ]),
    )
    expect(result.status).toBe(0)
    const merged = JSON.parse(result.stdout)

    expect(merged.suppressed_findings).toEqual([])
    expect(merged.findings).toEqual([
      expect.objectContaining({
        title: reconciled.title,
        confidence: 75,
        reviewers: ["correctness", "adversarial-codex"],
        independent_reviewers: ["correctness", "adversarial-codex"],
      }),
    ])
  })

  test("synthetic reruns do not infer independence from reviewer attribution", () => {
    const result = run(
      "python3",
      [FINDINGS_SCRIPT],
      undefined,
      JSON.stringify([
        {
          reviewer: "synthesis",
          findings: [
            {
              title: "Unverified peer agreement",
              severity: "P1",
              file: "src/worker.ts",
              line: 12,
              confidence: 50,
              autofix_class: "manual",
              owner: "human",
              requires_verification: true,
              pre_existing: false,
              first_evidence: "src/worker.ts:12 -- result = staleValue",
              reviewers: ["correctness", "adversarial-cursor"],
              independent_reviewers: ["correctness"],
            },
          ],
          residual_risks: [],
          testing_gaps: [],
        },
      ]),
    )
    expect(result.status).toBe(0)
    const merged = JSON.parse(result.stdout)

    expect(merged.findings).toEqual([])
    expect(merged.suppressed_findings).toEqual([
      expect.objectContaining({
        confidence: 50,
        reviewers: ["correctness", "adversarial-cursor"],
        independent_reviewers: ["correctness"],
      }),
    ])
  })

  test("confidence-gated testing advisories remain available for soft-bucket routing", () => {
    const returns = [
      {
        reviewer: "testing",
        findings: [
          {
            title: "Missing retry coverage",
            severity: "P2",
            file: "tests/worker.test.ts",
            line: 24,
            confidence: 50,
            autofix_class: "advisory",
            owner: "human",
            requires_verification: false,
            pre_existing: false,
          },
        ],
        residual_risks: [],
        testing_gaps: [],
      },
    ]

    const result = run("python3", [FINDINGS_SCRIPT], undefined, JSON.stringify(returns))
    expect(result.status).toBe(0)
    const merged = JSON.parse(result.stdout)

    expect(merged.findings).toEqual([])
    expect(merged.suppressed_findings).toEqual([
      expect.objectContaining({
        title: "Missing retry coverage",
        confidence: 50,
        reviewers: ["testing"],
      }),
    ])
    expect(merged.suppressed_by_confidence).toEqual({ "50": 1 })
  })

  test("findings helper rejects boolean line values", () => {
    const returns = [
      {
        reviewer: "correctness",
        findings: [
          {
            title: "Invalid boolean line",
            severity: "P1",
            file: "src/worker.ts",
            line: true,
            confidence: 75,
            autofix_class: "manual",
            owner: "human",
            requires_verification: true,
            pre_existing: false,
          },
        ],
        residual_risks: [],
        testing_gaps: [],
      },
    ]

    const result = run("python3", [FINDINGS_SCRIPT], undefined, JSON.stringify(returns))
    expect(result.status).toBe(0)
    const merged = JSON.parse(result.stdout)

    expect(merged.findings).toEqual([])
    expect(merged.malformed_findings).toBe(1)
  })

  test("findings helper rejects boolean confidence values", () => {
    const returns = [
      {
        reviewer: "correctness",
        findings: [
          {
            title: "Invalid boolean confidence",
            severity: "P0",
            file: "src/worker.ts",
            line: 12,
            confidence: false,
            autofix_class: "manual",
            owner: "human",
            requires_verification: true,
            pre_existing: false,
          },
        ],
        residual_risks: [],
        testing_gaps: [],
      },
    ]

    const result = run("python3", [FINDINGS_SCRIPT], undefined, JSON.stringify(returns))
    expect(result.status).toBe(0)
    const merged = JSON.parse(result.stdout)

    expect(merged.findings).toEqual([])
    expect(merged.malformed_findings).toBe(1)
  })

  test("findings helper rejects notes stand-in when pre_existing is omitted", () => {
    const returns = [
      {
        reviewer: "correctness",
        findings: [
          {
            title: "Notes is not a compact-return field",
            severity: "P1",
            file: "src/worker.ts",
            line: 12,
            confidence: 75,
            autofix_class: "manual",
            owner: "human",
            requires_verification: true,
            notes: "Any user can read another user's orders",
            first_evidence: "src/worker.ts:12 -- result = staleValue",
          },
        ],
        residual_risks: [],
        testing_gaps: [],
      },
    ]

    const result = run("python3", [FINDINGS_SCRIPT], undefined, JSON.stringify(returns))
    expect(result.status).toBe(0)
    const merged = JSON.parse(result.stdout)

    expect(merged.findings).toEqual([])
    expect(merged.malformed_findings).toBe(1)
  })

  test("findings helper rejects malformed optional evidence without rejecting absence", () => {
    const finding = {
      severity: "P1",
      file: "src/worker.ts",
      confidence: 75,
      autofix_class: "manual",
      owner: "human",
      requires_verification: true,
      pre_existing: false,
    }
    const returns = [
      {
        reviewer: "correctness",
        findings: [
          { ...finding, title: "Boolean evidence", line: 10, first_evidence: true },
          { ...finding, title: "Numeric evidence", line: 11, first_evidence: 42 },
          { ...finding, title: "Whitespace evidence", line: 12, first_evidence: " \n\t" },
          { ...finding, title: "Optional evidence omitted", line: 13 },
        ],
        residual_risks: [],
        testing_gaps: [],
      },
    ]

    const result = run("python3", [FINDINGS_SCRIPT], undefined, JSON.stringify(returns))
    expect(result.status).toBe(0)
    const merged = JSON.parse(result.stdout)

    expect(merged.findings).toEqual([])
    expect(merged.malformed_findings).toBe(3)
    expect(merged.suppressed_findings).toEqual([
      expect.objectContaining({
        title: "Optional evidence omitted",
        confidence: 50,
      }),
    ])
  })

  test("findings helper recovers artifact quotes before validation without weakening the evidence gate", () => {
    const quote = "src/state.ts:8 -- return priorState"
    const base = {
      title: "Stale state returned", severity: "P1", file: "src/state.ts", line: 8,
      confidence: 75, autofix_class: "manual", owner: "downstream-resolver",
      requires_verification: true, pre_existing: false,
    }
    const cases = [
      { fields: { evidence: [quote] }, retained: 1, backfilled: 1, malformed: 0 },
      { fields: { first_evidence: " ", evidence: [quote] }, retained: 1, backfilled: 1, malformed: 0 },
      { fields: { first_evidence: quote, evidence: ["other quote"] }, retained: 1, backfilled: 0, malformed: 0 },
      { fields: { first_evidence: false, evidence: [quote] }, retained: 0, backfilled: 0, malformed: 1 },
      { fields: { first_evidence: 42, evidence: [quote] }, retained: 0, backfilled: 0, malformed: 1 },
      { fields: {}, retained: 0, backfilled: 0, malformed: 0 },
      { fields: { evidence: [] }, retained: 0, backfilled: 0, malformed: 0 },
      { fields: { evidence: "not an array" }, retained: 0, backfilled: 0, malformed: 0 },
      { fields: { evidence: [42, quote] }, retained: 0, backfilled: 0, malformed: 0 },
      { fields: { evidence: [" ", quote] }, retained: 0, backfilled: 0, malformed: 0 },
      { fields: { first_evidence: false, evidence: [] }, retained: 0, backfilled: 0, malformed: 1 },
    ]
    const returns = [{
      reviewer: "correctness",
      findings: cases.map((entry, index) => ({
        ...base,
        ...entry.fields,
        title: `${base.title} ${index}`,
        line: base.line + index,
      })),
      residual_risks: [],
      testing_gaps: [],
    }]
    const result = run("python3", [FINDINGS_SCRIPT], undefined, JSON.stringify(returns))
    expect(result.status).toBe(0)
    const merged = JSON.parse(result.stdout)

    expect(merged.findings).toHaveLength(cases.filter((entry) => entry.retained).length)
    expect(merged.first_evidence_backfilled).toBe(cases.reduce((sum, entry) => sum + entry.backfilled, 0))
    expect(merged.malformed_findings).toBe(cases.reduce((sum, entry) => sum + entry.malformed, 0))
    expect(merged.suppressed_by_confidence).toEqual({
      "50": cases.filter((entry) => !entry.retained && !entry.malformed).length,
    })
    expect(merged.findings.map((finding: { title: string }) => finding.title).sort()).toEqual(
      cases.flatMap((entry, index) => entry.retained ? [`${base.title} ${index}`] : []).sort(),
    )
    expect(merged.suppressed_findings.map((finding: { title: string }) => finding.title).sort()).toEqual(
      cases.flatMap((entry, index) => !entry.retained && !entry.malformed ? [`${base.title} ${index}`] : []).sort(),
    )
    for (const finding of merged.findings) {
      expect(finding.first_evidence).toBe(quote)
      expect(finding.confidence).toBe(75)
    }
  })

  test("artifact quotes do not promote two independent anchor-50 findings", () => {
    const finding = {
      title: "Possible stale state", severity: "P2", file: "src/state.ts", line: 8,
      confidence: 50, autofix_class: "advisory", owner: "downstream-resolver",
      requires_verification: true, pre_existing: false,
      evidence: ["src/state.ts:8 -- return priorState"],
    }
    const returns = ["correctness", "reliability"].map((reviewer) => ({
      reviewer, findings: [finding], residual_risks: [], testing_gaps: [],
    }))
    const result = run("python3", [FINDINGS_SCRIPT], undefined, JSON.stringify(returns))
    expect(result.status).toBe(0)
    const merged = JSON.parse(result.stdout)
    expect(merged.findings).toEqual([])
    expect(merged.first_evidence_backfilled).toBe(0)
    expect(merged.suppressed_by_confidence).toEqual({ "50": 1 })
  })

  test("findings helper keeps settled decisions, caps fast-pass, and sorts by confidence", () => {
    const returns = [
      {
        reviewer: "synthesis",
        findings: [
          {
            title: "Settled implementation preference",
            severity: "P3",
            file: "src/z.ts",
            line: 9,
            confidence: 50,
            autofix_class: "advisory",
            owner: "human",
            requires_verification: false,
            pre_existing: false,
            settled_conflict: "KTD-2",
          },
          {
            title: "Lower confidence",
            severity: "P1",
            file: "src/a.ts",
            line: 2,
            confidence: 75,
            autofix_class: "manual",
            owner: "downstream-resolver",
            requires_verification: true,
            pre_existing: false,
            first_evidence: "src/a.ts:2 -- lower",
          },
          {
            title: "Higher confidence",
            severity: "P1",
            file: "src/z.ts",
            line: 3,
            confidence: 100,
            autofix_class: "manual",
            owner: "downstream-resolver",
            requires_verification: true,
            pre_existing: false,
            first_evidence: "src/z.ts:3 -- higher",
          },
        ],
        residual_risks: [],
        testing_gaps: [],
      },
      {
        reviewer: "fast-pass",
        findings: [
          {
            title: "Uncorroborated preliminary issue",
            severity: "P1",
            file: "src/fast.ts",
            line: 4,
            confidence: 100,
            autofix_class: "manual",
            owner: "downstream-resolver",
            requires_verification: true,
            pre_existing: false,
            first_evidence: "src/fast.ts:4 -- preliminary",
          },
        ],
        residual_risks: [],
        testing_gaps: [],
      },
    ]

    const result = run("python3", [FINDINGS_SCRIPT], undefined, JSON.stringify(returns))
    expect(result.status).toBe(0)
    const merged = JSON.parse(result.stdout)

    expect(merged.findings.map((finding: { title: string }) => finding.title)).toEqual([
      "Higher confidence",
      "Lower confidence",
      "Settled implementation preference",
    ])
    expect(merged.findings[2].settled_conflict).toBe("KTD-2")
    expect(merged.suppressed_by_confidence).toEqual({ "50": 1 })
  })

  test("synthetic rerun preserves an orchestrator-stamped suppressed settled preference", () => {
    const preference = {
      title: "Prefer the rejected cache layout",
      severity: "P3",
      file: "src/cache.ts",
      line: 18,
      confidence: 50,
      autofix_class: "advisory",
      owner: "human",
      requires_verification: false,
      pre_existing: false,
    }
    const firstPass = run(
      "python3",
      [FINDINGS_SCRIPT],
      undefined,
      JSON.stringify([
        {
          reviewer: "maintainability",
          findings: [preference],
          residual_risks: [],
          testing_gaps: [],
        },
      ]),
    )
    expect(firstPass.status).toBe(0)
    const initiallyMerged = JSON.parse(firstPass.stdout)
    expect(initiallyMerged.findings).toEqual([])
    expect(initiallyMerged.suppressed_findings).toHaveLength(1)
    expect(initiallyMerged.suppressed_findings[0].settled_conflict).toBeUndefined()

    const stamped = {
      ...initiallyMerged.suppressed_findings[0],
      settled_conflict: "KTD-cache-layout",
      autofix_class: "advisory",
      owner: "human",
    }
    const rerun = run(
      "python3",
      [FINDINGS_SCRIPT],
      undefined,
      JSON.stringify([
        {
          reviewer: "synthesis",
          findings: [stamped],
          residual_risks: [],
          testing_gaps: [],
        },
      ]),
    )
    expect(rerun.status).toBe(0)
    const reconciled = JSON.parse(rerun.stdout)
    expect(reconciled.suppressed_findings).toEqual([])
    expect(reconciled.findings).toEqual([
      expect.objectContaining({
        title: preference.title,
        confidence: 50,
        settled_conflict: "KTD-cache-layout",
        autofix_class: "advisory",
        owner: "human",
      }),
    ])
  })

  test("exact duplicates stay current and preserve settlement metadata when reviewers disagree", () => {
    const finding = {
      title: "Conflicting classification",
      severity: "P2",
      file: "src/state.ts",
      line: 8,
      confidence: 50,
      autofix_class: "advisory",
      owner: "human",
      requires_verification: false,
      first_evidence: "src/state.ts:8 -- return priorState",
    }
    const returns = [
      {
        reviewer: "correctness",
        findings: [{ ...finding, pre_existing: true }],
        residual_risks: [],
        testing_gaps: [],
      },
      {
        reviewer: "project-standards",
        findings: [{ ...finding, pre_existing: false, settled_conflict: "KTD-4" }],
        residual_risks: [],
        testing_gaps: [],
      },
    ]

    const result = run("python3", [FINDINGS_SCRIPT], undefined, JSON.stringify(returns))
    expect(result.status).toBe(0)
    const merged = JSON.parse(result.stdout)

    expect(merged.pre_existing_findings).toEqual([])
    expect(merged.findings).toHaveLength(1)
    expect(merged.findings[0].pre_existing).toBe(false)
    expect(merged.findings[0].settled_conflict).toBe("KTD-4")
  })
})
