import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { describe, expect, setDefaultTimeout, test } from "bun:test"

// Executes the scratch-root preamble exactly as it ships in each skill, instead of only
// string-matching it (#1285).
//
// scratch-root-contract.test.ts pins the *shape* of these blocks. That is what let
// `install -d -m 700` survive: the string was present and correct-looking, and on POSIX it
// worked, so nothing was red — while on native Windows Git Bash (a supported shell per
// AGENTS.md) `install -d` fails with "cannot change permissions", tripping the block's own
// `|| exit 1` and aborting scratch setup for all 12 skills before any of them did work.
//
// The repo already learned this once: "Verify the literal documented invocation, not a
// hand-adjusted variant" (docs/solutions/conventions/resolve-python-interpreter-not-python3.md).
// A shape assertion cannot catch a primitive that is merely unavailable on one host; only
// running it can. This file runs on every platform, and CI runs it under real win32.

const SKILLS_ROOT = path.join(process.cwd(), "skills")
const ROOT_ASSIGNMENT = 'SCRATCH_ROOT="/tmp/compound-engineering-$(id -u)"'
const FALLBACK_ROOT = '${TMPDIR:-/tmp}/compound-engineering-$(id -u)'
const GUARD_END = 'chmod 700 "$SCRATCH_ROOT"'

/** A POSIX shell, which these skills require (AGENTS.md: bash on macOS/Linux, Git Bash on
 *  Windows). `sh`/`bash` are not on PATH for a non-shell process on Windows, so fall back to
 *  the Git for Windows install paths before giving up. */
function posixShell(): string {
  const candidates = process.platform === "win32"
    ? ["bash", "sh", "C:/Program Files/Git/bin/bash.exe", "C:/Program Files/Git/usr/bin/sh.exe"]
    : ["sh"]
  for (const candidate of candidates) {
    if (spawnSync(candidate, ["-c", "exit 0"]).status === 0) return candidate
  }
  throw new Error(`no POSIX shell found (tried ${candidates.join(", ")})`)
}

const SHELL = posixShell()

// One shell spawn per shipped block (16 and growing). That is ~2s alone but well past bun's
// 5s default once `bun run test --parallel` has every worker competing for process creation,
// which is slowest exactly where this test matters most (Windows).
setDefaultTimeout(120_000)

function contractFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(root, entry.name)
    if (entry.isDirectory()) return contractFiles(absolute)
    return entry.isFile() && /\.(md|py|sh)$/.test(entry.name) ? [absolute] : []
  })
}

/** Point both candidate roots at disposable paths under `$CE_ROOT`; everything else runs verbatim. */
function redirect(script: string, index: number | string): string {
  const rooted = script
    .replaceAll(FALLBACK_ROOT, `$CE_ROOT/${index}-fallback`)
    .replaceAll("/tmp/compound-engineering-$(id -u)", `$CE_ROOT/${index}`)
  expect(rooted, "root redirect did not apply").not.toContain("$(id -u)")
  return rooted
}

/** Every shipped preamble: from the root assignment through the end of its closing chmod line. */
function preambles(): { file: string; script: string }[] {
  const found: { file: string; script: string }[] = []
  for (const file of contractFiles(SKILLS_ROOT)) {
    const content = readFileSync(file, "utf8")
    let offset = content.indexOf(ROOT_ASSIGNMENT)
    while (offset >= 0) {
      const guard = content.indexOf(GUARD_END, offset)
      expect(guard, `${file}: no closing ${GUARD_END} after the root assignment`).toBeGreaterThan(-1)
      const lineEnd = content.indexOf("\n", guard)
      found.push({
        file: path.relative(process.cwd(), file),
        script: content.slice(offset, lineEnd === -1 ? undefined : lineEnd),
      })
      offset = content.indexOf(ROOT_ASSIGNMENT, offset + ROOT_ASSIGNMENT.length)
    }
  }
  return found
}

describe("scratch-root preamble executes on this host", () => {
  test("every shipped preamble creates its root and exits 0", () => {
    const blocks = preambles()
    // Guard the guard: an extractor that quietly matches nothing is the failure mode here, and
    // it would look identical to a clean pass. Pin the count of *blocks* (16 across 12 files),
    // not files — a floor of 12 would let four blocks disappear before this went red. `>=` so
    // adding a skill does not break the suite; a drop means the extractor or the prose moved.
    expect(blocks.length).toBeGreaterThanOrEqual(16)

    const parent = mkdtempSync(path.join(tmpdir(), "ce-preamble-"))
    try {
      const failures: string[] = []
      blocks.forEach(({ file, script }, index) => {
        // Redirect the real root into a disposable one; everything else runs verbatim.
        const rooted = redirect(script, index)
        const r = spawnSync(SHELL, ["-c", `CE_ROOT="$1"\n${rooted}\nprintf %s "$SCRATCH_ROOT"`,
          "sh", parent], { encoding: "utf8" })
        if (r.status !== 0 || !r.stdout || !existsSync(r.stdout)) {
          failures.push(`${file} [${index}] status=${r.status} stderr=${(r.stderr || "").trim()}`)
        }
      })
      expect(failures).toEqual([])
    } finally {
      spawnSync("chmod", ["-R", "u+rwx", parent])
      rmSync(parent, { recursive: true, force: true })
    }
  })

  test("the preamble is re-entrant over an existing root", () => {
    // Skills run back to back as the same user; the second invocation must not abort on a
    // root the first one already created.
    const blocks = preambles()
    const parent = mkdtempSync(path.join(tmpdir(), "ce-preamble-reentrant-"))
    try {
      const rooted = redirect(blocks[0].script, "r")
      const run = () => spawnSync(SHELL, ["-c", `CE_ROOT="$1"\n${rooted}`, "sh", parent],
        { encoding: "utf8" })
      expect(run().status, "first run").toBe(0)
      expect(run().status, "second run over an existing root").toBe(0)
    } finally {
      spawnSync("chmod", ["-R", "u+rwx", parent])
      rmSync(parent, { recursive: true, force: true })
    }
  })

  // Claude Code's macOS sandbox allowlists writes under $TMPDIR (/tmp/claude-<uid>) but not
  // /tmp itself, so `/tmp/compound-engineering-<uid>` cannot be created — or, when it already
  // exists from an unsandboxed session, cannot be written into (#1294). The preamble must
  // land on `${TMPDIR:-/tmp}/compound-engineering-<uid>` in both states instead of aborting.
  test("every shipped preamble falls back to the TMPDIR root when /tmp cannot host it", () => {
    const blocks = preambles()
    const parent = mkdtempSync(path.join(tmpdir(), "ce-preamble-fallback-"))
    try {
      const failures: string[] = []
      blocks.forEach(({ file, script }, index) => {
        // Occupy the primary path with a regular file: mkdir cannot create it, on every host.
        writeFileSync(path.join(parent, String(index)), "")
        const r = spawnSync(SHELL, ["-c", `CE_ROOT="$1"\n${redirect(script, index)}\nprintf %s "$SCRATCH_ROOT"`,
          "sh", parent], { encoding: "utf8" })
        const expected = path.join(parent, `${index}-fallback`)
        // Git Bash prints the redirected `$CE_ROOT/<n>-fallback` with a forward slash on Windows;
        // compare resolved paths so a separator difference does not read as a wrong root.
        if (r.status !== 0 || !r.stdout || path.resolve(r.stdout) !== path.resolve(expected) || !existsSync(expected)) {
          failures.push(`${file} [${index}] status=${r.status} root=${r.stdout} stderr=${(r.stderr || "").trim()}`)
        }
      })
      expect(failures).toEqual([])
    } finally {
      spawnSync("chmod", ["-R", "u+rwx", parent])
      rmSync(parent, { recursive: true, force: true })
    }
  })

  test.skipIf(process.platform === "win32" || process.getuid?.() === 0)(
    "an existing but unwritable /tmp root also falls back",
    () => {
      // The sandboxed-after-unsandboxed state: the root exists and is ours, but writes into it
      // are denied. `mkdir -p` succeeds as a no-op there, so only a writability probe catches it.
      const blocks = preambles()
      const parent = mkdtempSync(path.join(tmpdir(), "ce-preamble-unwritable-"))
      try {
        const primary = path.join(parent, "u")
        mkdirSync(primary, { mode: 0o500 })
        const r = spawnSync(SHELL, ["-c", `CE_ROOT="$1"\n${redirect(blocks[0].script, "u")}\nprintf %s "$SCRATCH_ROOT"`,
          "sh", parent], { encoding: "utf8" })
        expect(r.status, r.stderr).toBe(0)
        expect(r.stdout).toBe(path.join(parent, "u-fallback"))
      } finally {
        spawnSync("chmod", ["-R", "u+rwx", parent])
        rmSync(parent, { recursive: true, force: true })
      }
    },
  )
})
