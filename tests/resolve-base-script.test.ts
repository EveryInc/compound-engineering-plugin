import { describe, expect, test } from "bun:test"
import { promises as fs } from "fs"
import os from "os"
import path from "path"
import { pathToFileURL } from "url"

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
  "ce-code-review",
  "references",
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

async function runGit(args: string[], cwd: string, env?: NodeJS.ProcessEnv): Promise<string> {
  const result = await runCommand(["git", ...args], cwd, env ?? gitEnv)
  if (result.exitCode !== 0) {
    throw new Error(
      `git ${args.join(" ")} failed (exit ${result.exitCode}).\nstdout: ${result.stdout}\nstderr: ${result.stderr}`,
    )
  }

  return result.stdout.trim()
}

async function initRepo(initialBranch = "main"): Promise<string> {
  const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), "resolve-base-repo-"))
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

async function createStubBin(mode: "gh-fails" | "pr-metadata"): Promise<string> {
  const binDir = await fs.mkdtemp(path.join(os.tmpdir(), "resolve-base-bin-"))

  if (mode === "gh-fails") {
    await writeExecutable(path.join(binDir, "gh"), "#!/usr/bin/env bash\nexit 1\n")
    return binDir
  }

  await writeExecutable(
    path.join(binDir, "gh"),
    `#!/usr/bin/env bash
set -euo pipefail
if [ "$#" -ge 2 ] && [ "$1" = "pr" ] && [ "$2" = "view" ]; then
  printf '%s' '{"baseRefName":"main","url":"https://github.com/EveryInc/compound-engineering-plugin/pull/123"}'
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

async function runResolveBase(
  repoRoot: string,
  stubBin: string,
  extraEnv?: NodeJS.ProcessEnv,
): Promise<RunResult> {
  return runCommand(["bash", resolveBaseScript], repoRoot, {
    ...gitEnv,
    PATH: `${stubBin}:${process.env.PATH ?? ""}`,
    ...extraEnv,
  })
}

describe("resolve-base.sh", () => {
  test("prefers the PR base remote from gh metadata over origin", async () => {
    const repoRoot = await initRepo()
    const initialSha = await commitFile(repoRoot, "history.txt", "a\n", "initial")
    const upstreamMainSha = await commitFile(repoRoot, "history.txt", "b\n", "main advance")

    await runGit(["checkout", "-b", "feature"], repoRoot)
    await commitFile(repoRoot, "feature.txt", "feature\n", "feature change")

    await runGit(["checkout", "-b", "fork-main", initialSha], repoRoot)
    const forkMainSha = await commitFile(repoRoot, "fork.txt", "fork\n", "fork main diverges")
    await runGit(["checkout", "feature"], repoRoot)

    await runGit(["remote", "add", "origin", "git@github.com:someone/fork.git"], repoRoot)
    await runGit(
      ["remote", "add", "upstream", "git@github.com:EveryInc/compound-engineering-plugin.git"],
      repoRoot,
    )
    await runGit(["update-ref", "refs/remotes/origin/main", forkMainSha], repoRoot)
    await runGit(["update-ref", "refs/remotes/upstream/main", upstreamMainSha], repoRoot)

    const stubBin = await createStubBin("pr-metadata")
    const result = await runResolveBase(repoRoot, stubBin)

    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe(`BASE:${upstreamMainSha}`)
  })

  test("falls back to a local base branch when origin is absent", async () => {
    const repoRoot = await initRepo()
    await commitFile(repoRoot, "history.txt", "a\n", "initial")
    const mainSha = await commitFile(repoRoot, "history.txt", "b\n", "main advance")

    await runGit(["checkout", "-b", "feature"], repoRoot)
    await commitFile(repoRoot, "feature.txt", "feature\n", "feature change")

    const stubBin = await createStubBin("gh-fails")
    const result = await runResolveBase(repoRoot, stubBin)

    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe(`BASE:${mainSha}`)
  })

  test("resolves against origin/HEAD in a detached shallow checkout", async () => {
    const seedRepo = await initRepo()
    await commitFile(seedRepo, "history.txt", "a\n", "initial")
    const mainSha = await commitFile(seedRepo, "history.txt", "b\n", "main advance")

    await runGit(["checkout", "-b", "feature"], seedRepo)
    const featureSha = await commitFile(seedRepo, "feature.txt", "feature\n", "feature change")
    await runGit(["checkout", "main"], seedRepo)

    const bareRepo = await fs.mkdtemp(path.join(os.tmpdir(), "resolve-base-remote-"))
    await runGit(["init", "--bare", bareRepo], seedRepo)
    const bareUrl = pathToFileURL(bareRepo).toString()
    await runGit(["remote", "add", "origin", bareUrl], seedRepo)
    await runGit(["push", "origin", "main", "feature"], seedRepo)

    const checkoutRoot = await fs.mkdtemp(path.join(os.tmpdir(), "resolve-base-checkout-"))
    await runCommand(["git", "clone", "--depth", "1", bareUrl, checkoutRoot], os.tmpdir(), gitEnv)
    await runGit(["config", "remote.origin.fetch", "+refs/heads/*:refs/remotes/origin/*"], checkoutRoot)
    await runGit(
      ["fetch", "--depth", "1", "origin", "main:refs/remotes/origin/main", "feature:refs/remotes/origin/feature"],
      checkoutRoot,
    )
    await runGit(["symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/main"], checkoutRoot)
    await runGit(["checkout", "--detach", "origin/feature"], checkoutRoot)

    const originMain = await runGit(["rev-parse", "--verify", "origin/main"], checkoutRoot)
    expect(originMain).toBe(mainSha)

    const originFeature = await runGit(["rev-parse", "--verify", "origin/feature"], checkoutRoot)
    expect(originFeature).toBe(featureSha)

    const originHead = await runGit(
      ["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"],
      checkoutRoot,
    )
    expect(originHead).toBe("origin/main")

    const stubBin = await createStubBin("gh-fails")
    const result = await runResolveBase(checkoutRoot, stubBin)

    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe(`BASE:${mainSha}`)
  })

  test("unshallows the PR base remote in a detached shallow checkout", async () => {
    const upstreamSeed = await initRepo()
    const initialSha = await commitFile(upstreamSeed, "history.txt", "a\n", "initial")
    const upstreamMainSha = await commitFile(upstreamSeed, "history.txt", "b\n", "upstream main")

    await runGit(["checkout", "-b", "feature"], upstreamSeed)
    const featureSha = await commitFile(upstreamSeed, "feature.txt", "feature\n", "feature change")

    const forkSeed = await initRepo()
    await commitFile(forkSeed, "history.txt", "a\n", "initial")
    const forkMainSha = await commitFile(forkSeed, "fork.txt", "fork\n", "fork main diverges")

    const remotesRoot = await fs.mkdtemp(path.join(os.tmpdir(), "resolve-base-remotes-"))
    const upstreamBare = path.join(
      remotesRoot,
      "github.com",
      "EveryInc",
      "compound-engineering-plugin.git",
    )
    await fs.mkdir(path.dirname(upstreamBare), { recursive: true })
    await runGit(["init", "--bare", upstreamBare], upstreamSeed)
    const upstreamUrl = pathToFileURL(upstreamBare).toString()
    await runGit(["remote", "add", "origin", upstreamUrl], upstreamSeed)
    await runGit(["push", "origin", "main", "feature"], upstreamSeed)

    const forkBare = path.join(remotesRoot, "github.com", "someone", "fork.git")
    await fs.mkdir(path.dirname(forkBare), { recursive: true })
    await runGit(["init", "--bare", forkBare], forkSeed)
    const forkUrl = pathToFileURL(forkBare).toString()
    await runGit(["remote", "add", "origin", forkUrl], forkSeed)
    await runGit(["push", "origin", "main"], forkSeed)

    const checkoutParent = await fs.mkdtemp(path.join(os.tmpdir(), "resolve-base-pr-shallow-"))
    const checkoutRoot = path.join(checkoutParent, "checkout")
    await runCommand(
      ["git", "clone", "--depth", "1", "--branch", "feature", upstreamUrl, checkoutRoot],
      os.tmpdir(),
      gitEnv,
    )
    await runGit(["checkout", "--detach", featureSha], checkoutRoot)
    await runGit(["remote", "rename", "origin", "upstream"], checkoutRoot)
    await runGit(["remote", "add", "origin", forkUrl], checkoutRoot)
    await runGit(["fetch", "--depth", "1", "origin", "main"], checkoutRoot)
    await runGit(["update-ref", "refs/remotes/origin/main", forkMainSha], checkoutRoot)
    await runGit(["branch", "-D", "feature"], checkoutRoot)

    const stubBin = await createStubBin("pr-metadata")
    const result = await runResolveBase(checkoutRoot, stubBin)

    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe(`BASE:${upstreamMainSha}`)
  })

  test("emits ERROR output when no base branch can be resolved", async () => {
    const repoRoot = await initRepo("scratch")
    await commitFile(repoRoot, "history.txt", "a\n", "initial")

    const stubBin = await createStubBin("gh-fails")
    const result = await runResolveBase(repoRoot, stubBin)

    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe(
      "ERROR:Unable to resolve review base branch locally. Fetch the base branch and rerun, or provide a PR number so the review scope can be determined from PR metadata.",
    )
  })
})
