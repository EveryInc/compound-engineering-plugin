import { afterAll, describe, expect, setDefaultTimeout, test } from "bun:test"
import { mkdtempSync, mkdirSync, rmSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { load } from "js-yaml"
import { changedFilesForBase, scopeForBase, selectScope } from "../scripts/ci-scope"

setDefaultTimeout(15_000)
const roots: string[] = []
afterAll(() => roots.forEach((dir) => rmSync(dir, { recursive: true, force: true })))
const full = { windows: true, transport: true, acpxRange: true }

describe("specialized CI selection", () => {
  test.each([
    { files: ["docs/guides/ce-work.md"] }, { files: ["src/converters/codex.ts"] },
    { files: ["README.md", "docs/solutions/example.md"] },
  ])("independent surface %j keeps only baseline checks", ({ files }) => {
    expect(selectScope(files)).toEqual({ windows: false, transport: false, acpxRange: false })
  })

  test("skill Markdown retains native execution of embedded shell", () => {
    expect(selectScope(["skills/ce-work/SKILL.md", "docs/guides/ce-work.md"]))
      .toEqual({ windows: true, transport: false, acpxRange: false })
  })

  test.each([
    "tests/helpers/acpx-pin.ts", "tests/fixtures/acp-stub-agent.mjs", "tests/acpx-contract.test.ts",
    "scripts/test-acpx-contract.ts", ".github/workflows/ci.yml", "package.json", "docs/../scripts/worker.sh",
  ])("acpx contract input %s runs everything across the full acpx range", (file) => {
    expect(selectScope(["README.md", file])).toEqual(full)
  })

  test.each([
    "skills/ce-pov/scripts/cross-model-pov.sh", "skills/ce-babysit-pr/scripts/pr-snapshot",
    "scripts/ci-scope.ts", "bun.lock", "new-module/file.ts",
  ])("other executable or unknown input %s runs every job at the acpx range boundaries", (file) => {
    expect(selectScope(["README.md", file])).toEqual({ windows: true, transport: true, acpxRange: false })
  })

  test("missing evidence runs everything", () => {
    expect(selectScope([])).toEqual(full)
    expect(scopeForBase(undefined)).toEqual(full)
    expect(scopeForBase("--help")).toEqual(full)
    expect(scopeForBase("a".repeat(40), tmpdir())).toEqual(full)
  })

  test("git comparison includes deleted and moved executable paths", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "ci-scope-"))
    roots.push(dir)
    const git = (...args: string[]) => {
      const result = spawnSync("git", args, { cwd: dir, encoding: "utf8", env: {
        PATH: process.env.PATH, HOME: dir, GIT_CONFIG_NOSYSTEM: "1",
        GIT_AUTHOR_NAME: "Test", GIT_AUTHOR_EMAIL: "test@example.com",
        GIT_COMMITTER_NAME: "Test", GIT_COMMITTER_EMAIL: "test@example.com",
      } })
      expect(result.status, result.stderr).toBe(0)
      return result.stdout.trim()
    }
    git("init", "-b", "main")
    mkdirSync(path.join(dir, "docs"))
    writeFileSync(path.join(dir, "worker.sh"), "echo hello\n")
    git("add", ".")
    git("-c", "commit.gpgsign=false", "commit", "-m", "seed")
    const base = git("rev-parse", "HEAD")
    expect(scopeForBase(base, dir)).toEqual(full)
    git("mv", "worker.sh", "docs/worker.md")
    git("-c", "commit.gpgsign=false", "commit", "-m", "move")
    expect(scopeForBase(base, dir)).toEqual({ ...full, acpxRange: false })
    const moved = git("rev-parse", "HEAD")
    writeFileSync(path.join(dir, "docs/worker.md"), "documentation only\n")
    git("add", ".")
    git("-c", "commit.gpgsign=false", "commit", "-m", "docs")
    expect(scopeForBase(moved, dir)).toEqual({ windows: false, transport: false, acpxRange: false })
    expect(changedFilesForBase(moved, dir)).toEqual(["docs/worker.md"])
    writeFileSync(path.join(dir, "docs/worker.md"), "uncommitted change\n")
    expect(changedFilesForBase(moved, dir)).toBeNull()
    git("add", "docs/worker.md")
    expect(changedFilesForBase(moved, dir)).toBeNull()
    git("-c", "commit.gpgsign=false", "commit", "-m", "updated docs")
    expect(changedFilesForBase(moved, dir)).toEqual(["docs/worker.md"])
    writeFileSync(path.join(dir, "new-worker.sh"), "echo new\n")
    expect(changedFilesForBase(moved, dir)).toBeNull()
    expect(scopeForBase(moved, dir)).toEqual(full)
  })

  test("workflow fails open to full coverage and keeps baseline checks unconditional", () => {
    const workflow = load(readFileSync(".github/workflows/ci.yml", "utf8")) as any
    for (const [job, output] of [["windows-native", "windows"], ["acpx-contract", "transport"], ["macos-bash32", "transport"]]) {
      expect(workflow.jobs[job].needs).toBe("scope")
      expect(workflow.jobs[job].if).toBe("${{ !cancelled() && (needs.scope.result != 'success' || needs.scope.outputs." + output + " != 'false') }}")
    }
    for (const job of ["test", "docs-audit"]) {
      expect(workflow.jobs[job].if).toBeUndefined()
      expect(workflow.jobs[job].needs).toBeUndefined()
    }
    expect(workflow.jobs.scope.outputs.acpxRange).toBe("${{ steps.scope.outputs.acpxRange }}")
    expect(workflow.jobs["acpx-contract"].steps.find((step: any) => step.run === "bun run test:acpx-contract").env.ACPX_CONTRACT_RANGE)
      .toBe("${{ (needs.scope.result != 'success' || needs.scope.outputs.acpxRange != 'false') && 'full' || 'boundaries' }}")
    expect(workflow.jobs.scope.steps.find((step: any) => step.id === "scope").env.CI_PR_BASE)
      .toBe("${{ github.event.pull_request.base.sha }}")
    const linux = workflow.jobs.test.steps
    const tests = linux.find((step: any) => step.name === "Run tests")
    expect(tests.if).toBeUndefined()
    expect(tests.env.CI_PR_BASE).toBe("${{ github.event.pull_request.base.sha }}")
    expect(tests.run).toContain('if [[ "$CI_EVENT" == "pull_request" ]]')
    expect(tests.run).toContain('--changed-since="$CI_PR_BASE"')
    expect(tests.run).toContain('else\n  bun run test --timings=')
    expect(linux.find((step: any) => step.name === "Typecheck").run).toBe("bun run typecheck")
    expect(workflow.concurrency.group).toContain("github.event.pull_request.number || github.run_id")
  })
})
