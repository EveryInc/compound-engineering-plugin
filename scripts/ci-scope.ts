import { spawnSync } from "node:child_process"
import { appendFileSync } from "node:fs"

// acpx releases are immutable, so a full-range contract run can only change verdict when one of these changes.
const ACPX_CONTRACT_INPUTS = new Set([
  "scripts/test-acpx-contract.ts", "tests/acpx-contract.test.ts", "tests/fixtures/acp-stub-agent.mjs",
  "tests/helpers/acpx-pin.ts", ".github/workflows/ci.yml", "package.json",
])

export type Scope = { windows: boolean; transport: boolean; acpxRange: boolean }
const FULL: Scope = { windows: true, transport: true, acpxRange: true }

export function selectScope(files: readonly string[]): Scope {
  if (files.length === 0) return { ...FULL }
  let windows = false
  let transport = false
  for (const file of files) {
    if (file.split("/").some((part) => part === ".." || part === "." || part === "")) return { ...FULL }
    if (/^skills\/.*\.md$/.test(file)) {
      // Markdown contains shell preambles executed by the native Windows suite.
      windows = true
    } else if (!/^(?:src\/|docs\/)/.test(file) && !["README.md", "CHANGELOG.md", "CONCEPTS.md"].includes(file)) {
      windows = transport = true
    }
  }
  return { windows, transport, acpxRange: files.some((file) => ACPX_CONTRACT_INPUTS.has(file)) }
}

export function changedFilesForBase(base: string | undefined, cwd = process.cwd()): string[] | null {
  if (!base || !/^[0-9a-f]{40}$/.test(base)) return null
  const status = spawnSync("git", ["status", "--porcelain=v1", "-z", "--untracked-files=normal"], {
    cwd, encoding: "utf8", timeout: 10_000,
  })
  if (status.status !== 0 || status.stdout !== "") return null
  // Compare the tested merge tree with its base; --no-renames includes both sides of moves.
  const diff = spawnSync("git", ["diff", "--name-only", "--no-renames", "-z", base, "HEAD", "--"], {
    cwd, encoding: "utf8", timeout: 10_000,
  })
  if (diff.status !== 0 || !diff.stdout.endsWith("\0")) return null
  return diff.stdout.slice(0, -1).split("\0")
}

export function scopeForBase(base: string | undefined, cwd = process.cwd()): Scope {
  return selectScope(changedFilesForBase(base, cwd) ?? [])
}

if (import.meta.main) {
  const scope = scopeForBase(process.env.CI_PR_BASE)
  const output = Object.entries(scope).map(([key, value]) => `${key}=${value}`).join("\n") + "\n"
  console.log(output.trim())
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, output)
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY,
      `### Specialized CI jobs\n\nWindows: **${scope.windows ? "run" : "skip"}**; acpx and macOS bash: **${scope.transport ? "run" : "skip"}**; acpx versions: **${scope.acpxRange ? "full range" : "boundaries"}**.\n\nLinux tests, typecheck, metadata, schema, and docs audit always run.\n`)
  }
}
