import { beforeAll, describe, expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

const SKILL_DIRS = [
  path.join(__dirname, "../skills/ce-compound"),
  path.join(__dirname, "../skills/ce-compound-refresh"),
] as const

function scriptPath(skillDir: string): string {
  return path.join(skillDir, "scripts/validate-doc-claims.py")
}

function runValidator(
  skillDir: string,
  docPath: string,
): { code: number; stdout: string; stderr: string } {
  const result = spawnSync("python3", [scriptPath(skillDir), docPath], {
    encoding: "utf8",
  })
  return {
    code: result.status ?? -1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  }
}

function sh(cwd: string, cmd: string, args: string[]): string {
  const result = spawnSync(cmd, args, { cwd, encoding: "utf8" })
  if (result.status !== 0) {
    throw new Error(
      `${cmd} ${args.join(" ")} failed in ${cwd}: ${result.stderr}`,
    )
  }
  return (result.stdout ?? "").trim()
}

const FRONTMATTER = `---
title: "Sample doc"
date: 2026-07-07
module: ce-compound
problem_type: best_practice
component: tooling
severity: low
---
`

// Scratch git repo shared by all repo-dependent tests. Layout:
//   src/real-file.ts committed and reachable from both HEAD and the
//   simulated origin/main; sharedSha = that commit; localOnlySha = a later
//   commit reachable from HEAD only; upstreamOnlySha = a commit only the
//   simulated origin/main can reach.
let repo: string
let sharedSha: string
let localOnlySha: string
let upstreamOnlySha: string

beforeAll(() => {
  repo = mkdtempSync(path.join(tmpdir(), "doc-claims-repo-"))
  sh(repo, "git", ["init", "-b", "main"])
  sh(repo, "git", ["config", "user.email", "test@example.com"])
  sh(repo, "git", ["config", "user.name", "Test"])
  mkdirSync(path.join(repo, "src"), { recursive: true })
  mkdirSync(path.join(repo, "docs/solutions/workflow"), { recursive: true })
  mkdirSync(path.join(repo, "docs/solutions/best-practices"), {
    recursive: true,
  })
  writeFileSync(path.join(repo, "src/real-file.ts"), "export const x = 1\n")
  writeFileSync(
    path.join(repo, "docs/solutions/best-practices/linked-target.md"),
    "# linked target\n",
  )
  writeFileSync(
    path.join(repo, "docs/solutions/workflow/existing-doc.md"),
    "# existing\n",
  )
  sh(repo, "git", ["add", "-A"])
  sh(repo, "git", ["commit", "-m", "base"])
  sharedSha = sh(repo, "git", ["rev-parse", "HEAD"])

  // upstream-only commit: branch from base, commit, point origin/main at it
  sh(repo, "git", ["checkout", "-b", "upstream-work"])
  writeFileSync(path.join(repo, "src/upstream-only.ts"), "export const u = 1\n")
  sh(repo, "git", ["add", "-A"])
  sh(repo, "git", ["commit", "-m", "upstream only"])
  upstreamOnlySha = sh(repo, "git", ["rev-parse", "HEAD"])
  sh(repo, "git", ["update-ref", "refs/remotes/origin/main", upstreamOnlySha])
  sh(repo, "git", ["checkout", "main"])

  // local-only commit: on main, after origin/main was pinned
  writeFileSync(path.join(repo, "src/local-only.ts"), "export const l = 1\n")
  sh(repo, "git", ["add", "-A"])
  sh(repo, "git", ["commit", "-m", "local only"])
  localOnlySha = sh(repo, "git", ["rev-parse", "HEAD"])
})

let docCounter = 0
function writeRepoDoc(body: string): string {
  const filePath = path.join(
    repo,
    `docs/solutions/workflow/doc-${docCounter++}.md`,
  )
  writeFileSync(filePath, FRONTMATTER + "\n" + body, "utf8")
  return filePath
}

function writeBareDoc(body: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), "doc-claims-bare-"))
  const filePath = path.join(dir, "doc.md")
  writeFileSync(filePath, FRONTMATTER + "\n" + body, "utf8")
  return filePath
}

describe("validate-doc-claims script", () => {
  // Run every test against both skill copies — they must behave
  // identically since AGENTS.md requires duplication, not sharing.
  for (const skillDir of SKILL_DIRS) {
    const skillName = path.basename(skillDir)

    describe(`in ${skillName}`, () => {
      test("passes a clean doc citing an existing path and a shared SHA", () => {
        const docPath = writeRepoDoc(
          "The fix lives in `src/real-file.ts` and landed in commit " +
            `${sharedSha.slice(0, 12)}.\n` +
            "See [the existing doc](existing-doc.md) for background.\n",
        )
        const result = runValidator(skillDir, docPath)
        expect(result.code).toBe(0)
        expect(result.stdout).toContain("OK:")
        expect(result.stdout).not.toContain("FLAG")
      })

      test("flags a cited path that exists nowhere", () => {
        const docPath = writeRepoDoc(
          "The handler is `src/does-not-exist.ts` in the tree.\n",
        )
        const result = runValidator(skillDir, docPath)
        expect(result.code).toBe(1)
        expect(result.stdout).toContain("FLAG path `src/does-not-exist.ts`")
        expect(result.stdout).toContain("not found")
      })

      test("classifies a path that only exists upstream as stale-checkout", () => {
        const docPath = writeRepoDoc(
          "See `src/upstream-only.ts` for the new helper.\n",
        )
        const result = runValidator(skillDir, docPath)
        expect(result.code).toBe(1)
        expect(result.stdout).toContain("FLAG path `src/upstream-only.ts`")
        expect(result.stdout).toContain("exists at origin/main")
      })

      test("skips slash-delimited identifiers that are not path-shaped", () => {
        const docPath = writeRepoDoc(
          "Branched as `feat/foo` off `origin/main`, drafted by " +
            "`anthropic/claude-sonnet-4-6`.\n",
        )
        const result = runValidator(skillDir, docPath)
        expect(result.code).toBe(0)
        expect(result.stdout).not.toContain("FLAG")
      })

      test("flags a missing extension-less token under a real repo directory", () => {
        const docPath = writeRepoDoc(
          "The helper is `src/nonexistent-helper` in the tree.\n",
        )
        const result = runValidator(skillDir, docPath)
        expect(result.code).toBe(1)
        expect(result.stdout).toContain("FLAG path `src/nonexistent-helper`")
        expect(result.stdout).toContain("not found")
      })

      test("ignores placeholder and URL-like tokens", () => {
        const docPath = writeRepoDoc(
          "Use `path/to/your-file.ts`, `docs/<category>/file.md`, and " +
            "`https://example.com/a/b` as needed.\n",
        )
        const result = runValidator(skillDir, docPath)
        expect(result.code).toBe(0)
      })

      test("flags a fabricated SHA", () => {
        const docPath = writeRepoDoc(
          "Fixed in commit 0123456789abcdef0123.\n",
        )
        const result = runValidator(skillDir, docPath)
        expect(result.code).toBe(1)
        expect(result.stdout).toContain("FLAG sha 0123456789abcdef0123")
        expect(result.stdout).toContain("does not resolve")
      })

      test("flags a HEAD-only SHA as rewritable on merge", () => {
        const docPath = writeRepoDoc(
          `Landed in ${localOnlySha.slice(0, 12)} on this branch.\n`,
        )
        const result = runValidator(skillDir, docPath)
        expect(result.code).toBe(1)
        expect(result.stdout).toContain(`FLAG sha ${localOnlySha.slice(0, 12)}`)
        expect(result.stdout).toContain("local-only commit")
      })

      test("flags an upstream-only SHA as predating-the-merge (the stale-branch bug)", () => {
        const docPath = writeRepoDoc(
          `Fixed by ${upstreamOnlySha.slice(0, 12)} which merged upstream.\n`,
        )
        const result = runValidator(skillDir, docPath)
        expect(result.code).toBe(1)
        expect(result.stdout).toContain(
          `FLAG sha ${upstreamOnlySha.slice(0, 12)}`,
        )
        expect(result.stdout).toContain("predates the merge")
      })

      test("does not treat dates or decimal ids as SHAs", () => {
        const docPath = writeRepoDoc(
          "On 20260707 we bumped build 123456789 without incident.\n",
        )
        const result = runValidator(skillDir, docPath)
        expect(result.code).toBe(0)
      })

      test("flags dangling learning-number scaffold", () => {
        const docPath = writeRepoDoc(
          "This complements Learnings 3, 4, 5 from the same batch.\n",
        )
        const result = runValidator(skillDir, docPath)
        expect(result.code).toBe(1)
        expect(result.stdout).toContain("FLAG scaffold")
        expect(result.stdout).toContain("Learnings 3")
      })

      test("flags unresolved placeholder tokens", () => {
        const docPath = writeRepoDoc("Cross-reference: {{DOC:3}}.\n")
        const result = runValidator(skillDir, docPath)
        expect(result.code).toBe(1)
        expect(result.stdout).toContain("FLAG scaffold")
        expect(result.stdout).toContain("{{DOC:3}}")
      })

      test("resolves a `../` code-formatted link label from the doc's location", () => {
        const docPath = writeRepoDoc(
          "See [`../best-practices/linked-target.md`]" +
            "(../best-practices/linked-target.md) for the pattern.\n",
        )
        const result = runValidator(skillDir, docPath)
        expect(result.code).toBe(0)
        expect(result.stdout).not.toContain("FLAG")
      })

      test("flags a `../` cited path whose doc-relative target is missing", () => {
        const docPath = writeRepoDoc(
          "See `../best-practices/does-not-exist.md` for background.\n",
        )
        const result = runValidator(skillDir, docPath)
        expect(result.code).toBe(1)
        expect(result.stdout).toContain(
          "FLAG path `../best-practices/does-not-exist.md`",
        )
        expect(result.stdout).toContain("not found")
      })

      test("skips a `../` token that escapes the repository", () => {
        // Four levels up from docs/solutions/workflow lands outside the repo.
        const docPath = writeRepoDoc(
          "The temp copy was `../../../../outside-repo.md` during the run.\n",
        )
        const result = runValidator(skillDir, docPath)
        expect(result.code).toBe(0)
        expect(result.stdout).not.toContain("FLAG")
      })

      test("flags a relative markdown link that does not resolve", () => {
        const docPath = writeRepoDoc(
          "See [the missing doc](../missing/nope.md) for details.\n",
        )
        const result = runValidator(skillDir, docPath)
        expect(result.code).toBe(1)
        expect(result.stdout).toContain("FLAG link (../missing/nope.md)")
      })

      test("reports staleness INFO when HEAD is behind the upstream ref", () => {
        // HEAD (main) does not contain upstream-only work, so rev-list
        // HEAD..origin/main is non-zero in the scratch repo.
        const docPath = writeRepoDoc("Nothing cited here.\n")
        const result = runValidator(skillDir, docPath)
        expect(result.stdout).toContain("INFO: worktree is")
        expect(result.stdout).toContain("behind origin/main")
      })

      test("still checks scaffold and links outside a git repository", () => {
        const docPath = writeBareDoc(
          "This continues Learning 2 — see [gone](./gone.md).\n",
        )
        const result = runValidator(skillDir, docPath)
        expect(result.code).toBe(1)
        expect(result.stdout).toContain("not a git repository")
        expect(result.stdout).toContain("FLAG scaffold")
        expect(result.stdout).toContain("FLAG link (./gone.md)")
      })

      test("exits 2 (usage error) on missing file", () => {
        const result = runValidator(
          skillDir,
          "/tmp/this-file-does-not-exist-claims.md",
        )
        expect(result.code).toBe(2)
        expect(result.stderr).toContain("file not found")
      })

      test("exits 2 (usage error) on missing argument", () => {
        const result = spawnSync("python3", [scriptPath(skillDir)], {
          encoding: "utf8",
        })
        expect(result.status).toBe(2)
        expect(result.stderr).toContain("usage")
      })
    })
  }

  test("script content is identical across skill copies (per AGENTS.md duplication rule)", () => {
    const [a, b] = SKILL_DIRS
    const aContent = readFileSync(scriptPath(a), "utf8")
    const bContent = readFileSync(scriptPath(b), "utf8")
    expect(aContent).toBe(bContent)
  })
})
