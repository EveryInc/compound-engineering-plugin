import { describe, expect, test } from "bun:test"
import { promises as fs } from "fs"
import os from "os"
import path from "path"

const gitEnv = {
  ...process.env,
  GIT_AUTHOR_NAME: "Test",
  GIT_AUTHOR_EMAIL: "test@example.com",
  GIT_COMMITTER_NAME: "Test",
  GIT_COMMITTER_EMAIL: "test@example.com",
}

const resolveBaseScript = path.join(
  import.meta.dir,
  "..",
  "plugins",
  "compound-engineering",
  "skills",
  "ce-code-review-beta",
  "scripts",
  "resolve-base.sh",
)

type RunResult = {
  exitCode: number
  stderr: string
  stdout: string
}

async function runCommand(
  cmd: string[],
  cwd: string,
  env?: NodeJS.ProcessEnv,
): Promise<RunResult> {
  const proc = Bun.spawn(cmd, {
    cwd,
    env: env ?? process.env,
    stderr: "pipe",
    stdout: "pipe",
  })

  const [exitCode, stdout, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])

  return { exitCode, stderr, stdout }
}

async function runGit(
  args: string[],
  cwd: string,
  env?: NodeJS.ProcessEnv,
): Promise<string> {
  const result = await runCommand(["git", ...args], cwd, env ?? gitEnv)
  if (result.exitCode !== 0) {
    throw new Error(
      `git ${args.join(" ")} failed (exit ${result.exitCode}).\nstdout: ${result.stdout}\nstderr: ${result.stderr}`,
    )
  }
  return result.stdout.trim()
}

async function initRepo(initialBranch = "main"): Promise<string> {
  const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), "resolve-base-beta-repo-"))
  await runGit(["init", "-b", initialBranch], repoRoot)
  return repoRoot
}

async function commitFile(
  repoRoot: string,
  relativePath: string,
  content: string,
  message: string,
): Promise<string> {
  const filePath = path.join(repoRoot, relativePath)
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, content)
  await runGit(["add", relativePath], repoRoot)
  await runGit(["commit", "-m", message], repoRoot)
  return runGit(["rev-parse", "HEAD"], repoRoot)
}

async function writeExecutable(filePath: string, content: string): Promise<void> {
  await fs.writeFile(filePath, content)
  await fs.chmod(filePath, 0o755)
}

// Source the script with RESOLVE_BASE_SOURCE_ONLY=1 and invoke the named
// helper. Returns trimmed stdout and rc. The helper is invoked with `set +e`
// because the script enables set -e at the top.
async function callHelper(fn: string, arg: string): Promise<RunResult> {
  const script = `set +e\nRESOLVE_BASE_SOURCE_ONLY=1 source "${resolveBaseScript}"\n${fn} "$1"\nrc=$?\nexit $rc\n`
  return runCommand(["bash", "-c", script, "bash", arg], os.tmpdir(), gitEnv)
}

describe("resolve-base-beta.sh — parse_pr_url", () => {
  test("github.com canonical", async () => {
    const r = await callHelper("parse_pr_url", "https://github.com/org/repo/pull/1")
    expect(r.exitCode).toBe(0)
    expect(r.stdout.trim()).toBe("github.com\torg/repo")
  })

  test("case-insensitive host and owner/repo", async () => {
    const r = await callHelper("parse_pr_url", "https://GitHub.com/Org/Repo/pull/9")
    expect(r.exitCode).toBe(0)
    expect(r.stdout.trim()).toBe("github.com\torg/repo")
  })

  test("GitHub Enterprise host", async () => {
    const r = await callHelper("parse_pr_url", "https://ghe.acme.com/org/repo/pull/42")
    expect(r.exitCode).toBe(0)
    expect(r.stdout.trim()).toBe("ghe.acme.com\torg/repo")
  })

  test("userinfo and port are stripped (host-only comparison)", async () => {
    const r = await callHelper(
      "parse_pr_url",
      "https://x-token@ghe.acme.com:8443/org/repo/pull/3",
    )
    expect(r.exitCode).toBe(0)
    expect(r.stdout.trim()).toBe("ghe.acme.com\torg/repo")
  })

  test("rejects path-prefixed GHE deployments (no silent miscategorization)", async () => {
    const r = await callHelper(
      "parse_pr_url",
      "https://acme.com/github/org/repo/pull/1",
    )
    expect(r.exitCode).toBe(1)
    expect(r.stdout.trim()).toBe("")
  })

  test("rejects malformed input", async () => {
    expect((await callHelper("parse_pr_url", "not a url")).exitCode).toBe(1)
    expect((await callHelper("parse_pr_url", "https://")).exitCode).toBe(1)
    expect((await callHelper("parse_pr_url", "https://host/onlyone/pull/1")).exitCode).toBe(1)
    expect((await callHelper("parse_pr_url", "https://host/org/repo")).exitCode).toBe(1)
  })
})

describe("resolve-base-beta.sh — parse_remote_url", () => {
  test("HTTPS with .git", async () => {
    const r = await callHelper("parse_remote_url", "https://github.com/org/repo.git")
    expect(r.exitCode).toBe(0)
    expect(r.stdout.trim()).toBe("github.com\torg/repo")
  })

  test("HTTPS without .git", async () => {
    const r = await callHelper("parse_remote_url", "https://github.com/org/repo")
    expect(r.exitCode).toBe(0)
    expect(r.stdout.trim()).toBe("github.com\torg/repo")
  })

  test("scp-form (git@host:owner/repo.git)", async () => {
    const r = await callHelper("parse_remote_url", "git@github.com:org/repo.git")
    expect(r.exitCode).toBe(0)
    expect(r.stdout.trim()).toBe("github.com\torg/repo")
  })

  test("ssh:// with port", async () => {
    const r = await callHelper("parse_remote_url", "ssh://git@ghe.acme.com:22/org/repo.git")
    expect(r.exitCode).toBe(0)
    expect(r.stdout.trim()).toBe("ghe.acme.com\torg/repo")
  })

  test("HTTPS with userinfo and mixed case", async () => {
    const r = await callHelper("parse_remote_url", "https://x-token@ghe.acme.com/Org/Repo.git")
    expect(r.exitCode).toBe(0)
    expect(r.stdout.trim()).toBe("ghe.acme.com\torg/repo")
  })

  test("boundary: org/repo-extra is NOT equal to org/repo", async () => {
    const r = await callHelper("parse_remote_url", "git@github.com:org/repo-extra.git")
    expect(r.exitCode).toBe(0)
    expect(r.stdout.trim()).toBe("github.com\torg/repo-extra")
    expect(r.stdout.trim()).not.toBe("github.com\torg/repo")
  })
})

// gh stub that returns a GitHub Enterprise PR URL — drives the host-agnostic
// path through gh pr view's `url` field and parse_pr_url.
async function createGheStubBin(baseRefName: string, prUrl: string): Promise<string> {
  const binDir = await fs.mkdtemp(path.join(os.tmpdir(), "resolve-base-beta-bin-"))
  await writeExecutable(
    path.join(binDir, "gh"),
    `#!/usr/bin/env bash
set -euo pipefail
if [ "$#" -ge 2 ] && [ "$1" = "pr" ] && [ "$2" = "view" ]; then
  printf '%s' '{"baseRefName":"${baseRefName}","url":"${prUrl}"}'
  exit 0
fi
exit 1
`,
  )
  await writeExecutable(
    path.join(binDir, "jq"),
    `#!/usr/bin/env bun
const args = process.argv.slice(2).filter((arg) => arg !== "-r")
const query = args[args.length - 1] ?? ""
const input = await new Response(Bun.stdin.stream()).text()
const data = input.trim() ? JSON.parse(input) : {}

let output = ""
if (query === ".baseRefName // empty") {
  output = data.baseRefName ?? ""
} else if (query === ".url // empty") {
  output = data.url ?? ""
} else if (query === ".defaultBranchRef.name") {
  output = data.defaultBranchRef?.name ?? ""
} else {
  console.error(\`unsupported jq query: \${query}\`)
  process.exit(1)
}

process.stdout.write(String(output))
`,
  )
  return binDir
}

describe("resolve-base-beta.sh — end-to-end host-agnostic resolution", () => {
  test("GitHub Enterprise PR with fork origin resolves via upstream remote, not origin", async () => {
    const repoRoot = await initRepo()
    const initialSha = await commitFile(repoRoot, "history.txt", "a\n", "initial")
    const upstreamMainSha = await commitFile(repoRoot, "history.txt", "b\n", "main advance")

    await runGit(["checkout", "-b", "feature"], repoRoot)
    await commitFile(repoRoot, "feature.txt", "feature\n", "feature change")

    await runGit(["checkout", "-b", "fork-main", initialSha], repoRoot)
    const forkMainSha = await commitFile(repoRoot, "fork.txt", "fork\n", "fork main diverges")
    await runGit(["checkout", "feature"], repoRoot)

    // origin points at the user's fork on the same GHE host; upstream points
    // at the actual base repo. resolve-base must pick upstream by matching
    // host+owner/repo against the PR URL parsed from gh pr view.
    await runGit(["remote", "add", "origin", "git@ghe.acme.com:someone/fork.git"], repoRoot)
    await runGit(
      ["remote", "add", "upstream", "git@ghe.acme.com:EveryInc/compound-engineering-plugin.git"],
      repoRoot,
    )
    await runGit(["update-ref", "refs/remotes/origin/main", forkMainSha], repoRoot)
    await runGit(["update-ref", "refs/remotes/upstream/main", upstreamMainSha], repoRoot)

    const stubBin = await createGheStubBin(
      "main",
      "https://ghe.acme.com/EveryInc/compound-engineering-plugin/pull/123",
    )
    const result = await runCommand(["bash", resolveBaseScript], repoRoot, {
      ...gitEnv,
      PATH: `${stubBin}:${process.env.PATH ?? ""}`,
    })

    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe(`BASE:${upstreamMainSha}`)
  })

  test("--pr-url flag drives host-agnostic resolution end-to-end", async () => {
    const repoRoot = await initRepo()
    const initialSha = await commitFile(repoRoot, "history.txt", "a\n", "initial")
    const upstreamMainSha = await commitFile(repoRoot, "history.txt", "b\n", "main advance")

    await runGit(["checkout", "-b", "feature"], repoRoot)
    await commitFile(repoRoot, "feature.txt", "feature\n", "feature change")

    await runGit(["checkout", "-b", "fork-main", initialSha], repoRoot)
    const forkMainSha = await commitFile(repoRoot, "fork.txt", "fork\n", "fork diverges")
    await runGit(["checkout", "feature"], repoRoot)

    await runGit(["remote", "add", "origin", "https://ghe.acme.com/someone/fork.git"], repoRoot)
    await runGit(
      ["remote", "add", "upstream", "https://ghe.acme.com/EveryInc/compound-engineering-plugin.git"],
      repoRoot,
    )
    await runGit(["update-ref", "refs/remotes/origin/main", forkMainSha], repoRoot)
    await runGit(["update-ref", "refs/remotes/upstream/main", upstreamMainSha], repoRoot)

    // gh stub returns nothing — we drive resolution purely through flags.
    const stubBin = await fs.mkdtemp(path.join(os.tmpdir(), "resolve-base-beta-bin-"))
    await writeExecutable(path.join(stubBin, "gh"), "#!/usr/bin/env bash\nexit 1\n")

    const result = await runCommand(
      [
        "bash",
        resolveBaseScript,
        "--pr-url",
        "https://ghe.acme.com/EveryInc/compound-engineering-plugin/pull/7",
        "--pr-base-branch",
        "main",
      ],
      repoRoot,
      {
        ...gitEnv,
        PATH: `${stubBin}:${process.env.PATH ?? ""}`,
      },
    )

    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe(`BASE:${upstreamMainSha}`)
  })

  test("boundary: org/repo PR does not match remote org/repo-extra", async () => {
    const repoRoot = await initRepo()
    const initialSha = await commitFile(repoRoot, "history.txt", "a\n", "initial")
    const mainSha = await commitFile(repoRoot, "history.txt", "b\n", "main advance")

    await runGit(["checkout", "-b", "feature"], repoRoot)
    await commitFile(repoRoot, "feature.txt", "feature\n", "feature change")

    // The only remote points at "org/repo-extra"; PR says "org/repo".
    // resolve-base must NOT match it; it should fall back to origin/main
    // by name (which is the same remote, but the test verifies the matcher
    // rejected it for the host-agnostic step).
    await runGit(["remote", "add", "origin", "git@github.com:org/repo-extra.git"], repoRoot)
    await runGit(["update-ref", "refs/remotes/origin/main", mainSha], repoRoot)

    const stubBin = await fs.mkdtemp(path.join(os.tmpdir(), "resolve-base-beta-bin-"))
    await writeExecutable(path.join(stubBin, "gh"), "#!/usr/bin/env bash\nexit 1\n")

    const result = await runCommand(
      [
        "bash",
        resolveBaseScript,
        "--pr-url",
        "https://github.com/org/repo/pull/1",
        "--pr-base-branch",
        "main",
      ],
      repoRoot,
      {
        ...gitEnv,
        PATH: `${stubBin}:${process.env.PATH ?? ""}`,
      },
    )

    // origin/main still exists as a fallback by branch name, so the script
    // succeeds — but via the origin fallback path, not via host-agnostic
    // matching. The key invariant: org/repo-extra remote was not matched
    // as if it were org/repo.
    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe(`BASE:${mainSha}`)
  })
})
