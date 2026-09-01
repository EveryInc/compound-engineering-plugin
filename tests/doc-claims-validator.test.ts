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

function mixedShaPrefix(sha: string): string {
  for (let length = 7; length <= sha.length; length++) {
    const prefix = sha.slice(0, length)
    if (/\d/.test(prefix) && /[a-f]/.test(prefix)) return prefix
  }
  throw new Error(`commit SHA has no mixed digit/letter prefix: ${sha}`)
}

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
            `${mixedShaPrefix(sharedSha)}.\n` +
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

      test("checks an absolute citation that points inside the repo", () => {
        const docPath = writeRepoDoc(
          "The fix lives in `" + path.join(repo, "src/real-file.ts") + "`.\n",
        )
        const result = runValidator(skillDir, docPath)
        expect(result.code).toBe(0)
        expect(result.stdout).not.toContain("checked 0 paths")
      })

      test("flags a BROKEN absolute citation instead of silently passing", () => {
        const docPath = writeRepoDoc(
          "The handler is `" +
            path.join(repo, "src/does-not-exist.ts") +
            "`.\n",
        )
        const result = runValidator(skillDir, docPath)
        expect(result.code).toBe(1)
        expect(result.stdout).toContain("FLAG path")
      })

      test("still ignores a URL route that starts with a slash", () => {
        const docPath = writeRepoDoc(
          "The probe calls `/api/v1/users/me` with a bearer token.\n",
        )
        const result = runValidator(skillDir, docPath)
        expect(result.code).toBe(0)
        expect(result.stdout).not.toContain("FLAG")
      })

      test("checks an in-repo absolute citation whose relative form starts with ..", () => {
        const hiddenDir = path.join(repo, "..hidden")
        mkdirSync(hiddenDir, { recursive: true })
        writeFileSync(path.join(hiddenDir, "file.ts"), "export const y = 2\n")
        const docPath = writeRepoDoc(
          "The odd path is `" + path.join(hiddenDir, "file.ts") + "`.\n",
        )
        const result = runValidator(skillDir, docPath)
        expect(result.code).toBe(0)
        expect(result.stdout).not.toContain("checked 0 paths")
      })

      test("flags a missing in-repo absolute citation whose relative form starts with ..", () => {
        const docPath = writeRepoDoc(
          "The odd path is `" +
            path.join(repo, "..hidden", "missing.ts") +
            "`.\n",
        )
        const result = runValidator(skillDir, docPath)
        expect(result.code).toBe(1)
        expect(result.stdout).toContain("FLAG path")
      })

      test("checks an absolute citation of a root-level file", () => {
        writeFileSync(path.join(repo, "root-cited.ts"), "export const r = 1\n")
        const docPath = writeRepoDoc(
          "The root helper is `" + path.join(repo, "root-cited.ts") + "`.\n",
        )
        const result = runValidator(skillDir, docPath)
        expect(result.code).toBe(0)
        expect(result.stdout).not.toContain("checked 0 paths")
      })

      test("flags a missing root-level absolute citation", () => {
        const docPath = writeRepoDoc(
          "The root helper is `" + path.join(repo, "missing-root.ts") + "`.\n",
        )
        const result = runValidator(skillDir, docPath)
        expect(result.code).toBe(1)
        expect(result.stdout).toContain("FLAG path")
        expect(result.stdout).not.toContain("checked 0 paths")
      })

      test("slash-normalizes a rewritten Windows relative path", () => {
        const driver = String.raw`
import importlib.util, os, sys
spec = importlib.util.spec_from_file_location("v", sys.argv[1])
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
real_relpath = os.path.relpath
os.path.relpath = lambda *a, **k: "src\\real-file.ts"
try:
    got = mod.strip_repo_prefix("/repo/src/real-file.ts", "/repo")
finally:
    os.path.relpath = real_relpath
print(got)
raise SystemExit(0 if got == "src/real-file.ts" else 1)
`
        const result = spawnSync(
          "python3",
          ["-c", driver, scriptPath(skillDir)],
          { encoding: "utf8" },
        )
        expect(result.status, result.stderr).toBe(0)
        expect(result.stdout.trim()).toBe("src/real-file.ts")
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
        const sha = mixedShaPrefix(localOnlySha)
        const docPath = writeRepoDoc(
          `Landed in ${sha} on this branch.\n`,
        )
        const result = runValidator(skillDir, docPath)
        expect(result.code).toBe(1)
        expect(result.stdout).toContain(`FLAG sha ${sha}`)
        expect(result.stdout).toContain("local-only commit")
      })

      test("flags an upstream-only SHA as predating-the-merge (the stale-branch bug)", () => {
        const sha = mixedShaPrefix(upstreamOnlySha)
        const docPath = writeRepoDoc(
          `Fixed by ${sha} which merged upstream.\n`,
        )
        const result = runValidator(skillDir, docPath)
        expect(result.code).toBe(1)
        expect(result.stdout).toContain(
          `FLAG sha ${sha}`,
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

      test("does not treat hex identifiers cited as something else as SHAs", () => {
        const docPath = writeRepoDoc(
          "The transcript names its sessions:\n\n" +
            "```\n" +
            "session 7e6861b4:  Write -> /tmp/attribute.sh\n" +
            "session dc828513:  Write -> docs/x.md\n" +
            "```\n\n" +
            "The content hash was b3d4f5a6c7 and the blob is 9f2c1a8e40.\n",
        )
        const result = runValidator(skillDir, docPath)
        expect(result.code).toBe(0)
        expect(result.stdout).toContain("0 SHAs")
      })

      test("flags a fabricated SHA cited by a git command in a code fence", () => {
        const docPath = writeRepoDoc(
          "Reproduce it with:\n\n" +
            "```bash\n" +
            "git show 0123456789abcdef0123\n" +
            "```\n",
        )
        const result = runValidator(skillDir, docPath)
        expect(result.code).toBe(1)
        expect(result.stdout).toContain("FLAG sha 0123456789abcdef0123")
      })

      test("flags a fabricated SHA cited by a landed-in phrase", () => {
        const docPath = writeRepoDoc(
          "The rename landed in 0123456789abcdef0123 last week.\n",
        )
        const result = runValidator(skillDir, docPath)
        expect(result.code).toBe(1)
        expect(result.stdout).toContain("FLAG sha 0123456789abcdef0123")
      })

      test("classifies a resolvable SHA even with no commit-citation context", () => {
        const sha = mixedShaPrefix(localOnlySha)
        const docPath = writeRepoDoc(`The tree at ${sha} shows it.\n`)
        const result = runValidator(skillDir, docPath)
        expect(result.code).toBe(1)
        expect(result.stdout).toContain("local-only commit")
      })

      test("flags a fabricated SHA cited as committed", () => {
        const docPath = writeRepoDoc(
          "The fix was committed as 0123456789abcdef0123.\n",
        )
        const result = runValidator(skillDir, docPath)
        expect(result.code).toBe(1)
        expect(result.stdout).toContain("FLAG sha 0123456789abcdef0123")
      })

      test("flags a fabricated SHA cited in the repo@sha pin form", () => {
        const docPath = writeRepoDoc(
          "Ported from acme/widgets@0123456789abcdef0123 upstream.\n",
        )
        const result = runValidator(skillDir, docPath)
        expect(result.code).toBe(1)
        expect(result.stdout).toContain("FLAG sha 0123456789abcdef0123")
      })

      test("flags a fabricated SHA an attribution phrase points at", () => {
        const docPath = writeRepoDoc(
          "The regression was resolved by 0123456789abcdef0123.\n",
        )
        const result = runValidator(skillDir, docPath)
        expect(result.code).toBe(1)
        expect(result.stdout).toContain("FLAG sha 0123456789abcdef0123")
      })

      test("flags a fabricated SHA in a git command carrying options", () => {
        const docPath = writeRepoDoc(
          "Inspect it:\n\n" +
            "```bash\n" +
            "git show --format=%H --stat 0123456789abcdef0123\n" +
            "```\n",
        )
        const result = runValidator(skillDir, docPath)
        expect(result.code).toBe(1)
        expect(result.stdout).toContain("FLAG sha 0123456789abcdef0123")
      })

      test("does not treat a hash named as some other git object as a commit", () => {
        const docPath = writeRepoDoc(
          "The blob's sha is 9f2c1a8e40 and the tree sha is b3d4f5a6c7.\n",
        )
        const result = runValidator(skillDir, docPath)
        expect(result.code).toBe(0)
      })

      test("does not treat every at-sign token as a commit pin", () => {
        const docPath = writeRepoDoc(
          "The account is user@abcdef12 in the directory.\n" +
            "The image tag is release@b3d4f5a6c7 upstream.\n",
        )
        const result = runValidator(skillDir, docPath)
        expect(result.code).toBe(0)
      })

      test("does not treat a non-commit attribution as a citation", () => {
        const docPath = writeRepoDoc(
          "The content digest is recorded at b3d4f5a6c7 in the manifest.\n" +
            "The session identifier was issued with dc828513 by the harness.\n",
        )
        const result = runValidator(skillDir, docPath)
        expect(result.code).toBe(0)
      })

      test("does not read a commit cue out of a hash named for its algorithm", () => {
        const docPath = writeRepoDoc(
          "The content hash SHA256 is b3d4f5a6c7 in the manifest.\n" +
            "The blob's sha1 is 9f2c1a8e40 per the index.\n",
        )
        const result = runValidator(skillDir, docPath)
        expect(result.code).toBe(0)
      })

      test("ignores a commit cue further back than the citation window", () => {
        const docPath = writeRepoDoc(
          "The git history shows session 7e6861b4 in the transcript.\n",
        )
        const result = runValidator(skillDir, docPath)
        expect(result.code).toBe(0)
      })

      test("reports the line of the occurrence that carries the citation", () => {
        const docPath = writeRepoDoc(
          "A transcript naming sessions:\n\n" +
            "```\n" +
            "session 0123456789abcdef0123: Write -> /tmp/a.sh\n" +
            "```\n\n" +
            "It landed in 0123456789abcdef0123 last week.\n",
        )
        const result = runValidator(skillDir, docPath)
        expect(result.code).toBe(1)
        const flag = result.stdout
          .split("\n")
          .find((line) => line.startsWith("FLAG sha"))
        // line 13 is the transcript occurrence, 16 the cited one
        expect(flag).toContain("(line 16)")
        expect(flag).not.toContain("(line 13)")
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

      test("does not flag {{...}} inside an inline code span", () => {
        const docPath = writeRepoDoc(
          "The ruleset names `{{IP_RELEASER_APP_ID}}` as a bypass actor.\n",
        )
        const result = runValidator(skillDir, docPath)
        expect(result.code).toBe(0)
        expect(result.stdout).not.toContain("FLAG scaffold")
      })

      test("does not flag {{...}} inside a fenced code block", () => {
        const docPath = writeRepoDoc(
          "Example ruleset actor:\n\n" +
            "```json\n" +
            '{ "bypass_actors": [{ "actor_id": "{{IP_RELEASER_APP_ID}}" }] }\n' +
            "```\n",
        )
        const result = runValidator(skillDir, docPath)
        expect(result.code).toBe(0)
        expect(result.stdout).not.toContain("FLAG scaffold")
      })

      test("still flags a bare {{...}} scaffold leaked into prose", () => {
        const docPath = writeRepoDoc(
          "Save the output under {{run_dir}} before continuing.\n",
        )
        const result = runValidator(skillDir, docPath)
        expect(result.code).toBe(1)
        expect(result.stdout).toContain("FLAG scaffold")
        expect(result.stdout).toContain("{{run_dir}}")
      })

      test("keeps a nested shorter fence inside a longer one masked", () => {
        // A 4-backtick fence that demonstrates an inner 3-backtick block: the
        // inner ``` must not close the outer fence (CommonMark length rule),
        // so the {{...}} it wraps stays masked.
        const docPath = writeRepoDoc(
          "````markdown\n" +
            "```\n" +
            "{{NESTED_PLACEHOLDER}}\n" +
            "```\n" +
            "````\n",
        )
        const result = runValidator(skillDir, docPath)
        expect(result.code).toBe(0)
        expect(result.stdout).not.toContain("FLAG scaffold")
      })

      test("keeps a same-length info-string fence line as block content", () => {
        // A bare ``` block whose content demonstrates a ```json opener: the
        // inner ```json has trailing text, so CommonMark does not treat it as
        // a closing fence — the {{...}} after it stays masked.
        const docPath = writeRepoDoc(
          "```\n" +
            "```json\n" +
            '{ "actor_id": "{{PLACEHOLDER_APP_ID}}" }\n' +
            "```\n",
        )
        const result = runValidator(skillDir, docPath)
        expect(result.code).toBe(0)
        expect(result.stdout).not.toContain("FLAG scaffold")
      })

      test("flags prose {{...}} after a closing fence, not the fenced content", () => {
        // Pins the fence toggle-off transition: content resumes prose masking
        // once the block closes.
        const docPath = writeRepoDoc(
          "```json\n" +
            '{ "actor_id": "{{IP_RELEASER_APP_ID}}" }\n' +
            "```\n\n" +
            "Then save under {{run_dir}} before continuing.\n",
        )
        const result = runValidator(skillDir, docPath)
        expect(result.code).toBe(1)
        expect(result.stdout).toContain("{{run_dir}}")
        expect(result.stdout).not.toContain("{{IP_RELEASER_APP_ID}}")
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
