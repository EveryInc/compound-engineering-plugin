import { spawnSync } from "child_process"
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "fs"
import os from "os"
import path from "path"
import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { extractBashBlocks } from "./fenced-blocks"

// This block decides where a prototype is written inside the user's own checkout, and it is
// prose an agent transcribes rather than a program anything imports. A regex that greps
// preview.md proves the command is spelled right, never that it runs -- the failure this
// repo already documented in docs/solutions/conventions/shell-primitives-must-be-executed-not-shape-checked.md.
// So execute it, on the same POSIX-shell resolution the other contract tests use.

const PREVIEW = path.join(process.cwd(), "skills", "ce-prototype", "references", "preview.md")

function posixShell(): string {
  const candidates =
    process.platform === "win32"
      ? ["bash", "sh", "C:/Program Files/Git/bin/bash.exe", "C:/Program Files/Git/usr/bin/sh.exe"]
      : ["sh"]
  for (const candidate of candidates) {
    if (spawnSync(candidate, ["-c", "exit 0"]).status === 0) return candidate
  }
  throw new Error(`no POSIX shell found (tried ${candidates.join(", ")})`)
}

const SHELL = posixShell()

setDefaultTimeout(120_000)

/** The run-root resolution block, with its placeholders and its temp root made testable. */
function resolutionScript(tempRoot: string): string {
  const blocks = extractBashBlocks(readFileSync(PREVIEW, "utf8")).filter(
    (block) => block.body.includes("TEMP_ROOT=") && block.body.includes("check-ignore"),
  )
  expect(
    blocks.length,
    "preview.md must contain exactly one run-root resolution block. Two would be two chances to disagree about where a run writes.",
  ).toBe(1)
  return blocks[0].body
    .replace(/RUN_SLUG="[^"]*"/, 'RUN_SLUG="2026-08-14-run"')
    .replace(/\/tmp\/compound-engineering-\$\(id -u\)/g, tempRoot)
}

function run(script: string, cwd: string): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(SHELL, ["-c", script], { cwd, encoding: "utf8" })
  return { status: result.status, stdout: (result.stdout ?? "").trim(), stderr: (result.stderr ?? "").trim() }
}

function initRepo(root: string, gitignore: string): void {
  mkdirSync(root, { recursive: true })
  writeFileSync(path.join(root, ".gitignore"), gitignore)
  for (const args of [["init", "-q"], ["add", "-A"]]) spawnSync("git", args, { cwd: root })
  spawnSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "init"], { cwd: root })
}

describe("ce-prototype run-root resolution executes", () => {
  const IGNORED = "node_modules\n.context/compound-engineering/\n"
  const UNIGNORED = "node_modules\n"

  function fixture() {
    const dir = realpathSync(mkdtempSync(path.join(os.tmpdir(), "ce-proto-root-")))
    return { dir, tempRoot: path.join(dir, "temp-root") }
  }

  test("a repo whose scratch namespace is ignored resolves inside the repo", () => {
    const { dir, tempRoot } = fixture()
    try {
      const repo = path.join(dir, "repo")
      initRepo(repo, IGNORED)
      const result = run(resolutionScript(tempRoot), repo)
      expect(result.status, result.stderr).toBe(0)
      expect(result.stdout).toBe(path.join(repo, ".context/compound-engineering/ce-prototype/2026-08-14-run"))
      expect(existsSync(result.stdout)).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test("an unignored repo and a non-repo both fall back to OS temp", () => {
    for (const gitignore of [UNIGNORED, null]) {
      const { dir, tempRoot } = fixture()
      try {
        const work = path.join(dir, "work")
        if (gitignore === null) mkdirSync(work, { recursive: true })
        else initRepo(work, gitignore)
        const result = run(resolutionScript(tempRoot), work)
        expect(result.status, result.stderr).toBe(0)
        expect(result.stdout).toBe(path.join(tempRoot, "ce-prototype/2026-08-14-run"))
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    }
  })

  test("a symlinked scratch path is refused and the run falls back to OS temp", () => {
    // The durable path must never be reached through a link someone else controls.
    for (const linked of [".context", ".context/compound-engineering"]) {
      const { dir, tempRoot } = fixture()
      try {
        const repo = path.join(dir, "repo")
        initRepo(repo, IGNORED)
        const elsewhere = path.join(dir, "elsewhere")
        mkdirSync(elsewhere, { recursive: true })
        const link = path.join(repo, linked)
        mkdirSync(path.dirname(link), { recursive: true })
        symlinkSync(elsewhere, link)

        const result = run(resolutionScript(tempRoot), repo)
        expect(result.status, result.stderr).toBe(0)
        expect(result.stdout, `a symlinked ${linked} must not be written through`).toBe(
          path.join(tempRoot, "ce-prototype/2026-08-14-run"),
        )
        expect(existsSync(path.join(elsewhere, "ce-prototype"))).toBe(false)
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    }
  })

  test("the root is created private and the leaf sits beneath it", () => {
    const { dir, tempRoot } = fixture()
    try {
      const work = path.join(dir, "work")
      mkdirSync(work, { recursive: true })
      const result = run(resolutionScript(tempRoot), work)
      expect(result.status, result.stderr).toBe(0)
      // The guarded directory is the root, not the leaf mkdir -p just created.
      expect(lstatSync(tempRoot).mode & 0o777).toBe(0o700)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test("a name collision takes the next suffix instead of writing into another run", () => {
    const { dir, tempRoot } = fixture()
    try {
      const work = path.join(dir, "work")
      mkdirSync(work, { recursive: true })
      const script = resolutionScript(tempRoot)

      const first = run(script, work)
      const second = run(script, work)
      expect(first.status, first.stderr).toBe(0)
      expect(second.status, second.stderr).toBe(0)
      expect(second.stdout, "a second run must never resolve into the first run's directory").not.toBe(first.stdout)
      expect(second.stdout).toBe(`${first.stdout}-2`)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test("a root that cannot be created fails closed and names the path", () => {
    const { dir, tempRoot } = fixture()
    try {
      const work = path.join(dir, "work")
      mkdirSync(work, { recursive: true })
      // A regular file where the root belongs: mkdir -p cannot succeed, and the temp root is
      // already the fallback, so the run must stop rather than write somewhere unverified.
      writeFileSync(tempRoot, "not a directory\n")

      const result = run(resolutionScript(tempRoot), work)
      expect(result.status).not.toBe(0)
      expect(result.stderr).toContain("could not create")
      expect(result.stderr).toContain("no usable run root")
      expect(result.stderr).not.toContain("could not claim")
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
