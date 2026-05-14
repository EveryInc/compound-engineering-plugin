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

const RESOLVE_BASE_MINIMAL_TOOLS = [
  "bash",
  "env",
  "git",
  "mktemp",
  "rm",
  "sed",
  "tail",
  "tr",
]

async function firstExistingPath(candidates: string[]): Promise<string | null> {
  for (const candidate of candidates) {
    try {
      await fs.access(candidate, fs.constants.X_OK)
      return candidate
    } catch {
      // try next
    }
  }
  return null
}

async function createResolveBasePathStub(): Promise<string> {
  const stub = await fs.mkdtemp(path.join(os.tmpdir(), "resolve-base-beta-path-"))
  for (const tool of RESOLVE_BASE_MINIMAL_TOOLS) {
    const found = await firstExistingPath([
      `/usr/bin/${tool}`,
      `/bin/${tool}`,
      `/opt/homebrew/bin/${tool}`,
      `/usr/local/bin/${tool}`,
      `/usr/sbin/${tool}`,
      `/sbin/${tool}`,
    ])
    if (found) {
      await fs.symlink(found, path.join(stub, tool)).catch(() => {})
    }
  }
  return stub
}

// Source the script with RESOLVE_BASE_SOURCE_ONLY=1 and invoke the named
// helper. Returns trimmed stdout and rc. The helper is invoked with `set +e`
// because the script enables set -e at the top.
async function callHelper(fn: string, arg: string): Promise<RunResult> {
  const script = `set +e\nRESOLVE_BASE_SOURCE_ONLY=1 source "${resolveBaseScript}"\n${fn} "$1"\nrc=$?\nexit $rc\n`
  return runCommand(["bash", "-c", script, "bash", arg], os.tmpdir(), gitEnv)
}

type ParserCase = {
  name: string
  fn: "parse_pr_url" | "parse_remote_url"
  input: string
  expected: { ok: false } | { ok: true; host: string; ownerRepo: string; form?: string }
  rationale: string
}

const parserCases: ParserCase[] = [
  {
    name: "PR github.com baseline",
    fn: "parse_pr_url",
    input: "https://github.com/org/repo/pull/1",
    expected: { ok: true, host: "github.com", ownerRepo: "org/repo" },
    rationale: "canonical GitHub PR URL",
  },
  {
    name: "PR GitHub Enterprise host",
    fn: "parse_pr_url",
    input: "https://ghe.acme.com/org/repo/pull/42",
    expected: { ok: true, host: "ghe.acme.com", ownerRepo: "org/repo" },
    rationale: "host-agnostic GitHub Enterprise parsing",
  },
  {
    name: "PR GitHub Enterprise web port",
    fn: "parse_pr_url",
    input: "https://ghe.acme.com:8443/org/repo/pull/42",
    expected: { ok: true, host: "ghe.acme.com:8443", ownerRepo: "org/repo" },
    rationale: "non-default web UI ports are identity-bearing",
  },
  {
    name: "PR GitHub Enterprise files tab",
    fn: "parse_pr_url",
    input: "https://ghe.acme.com:8443/org/repo/pull/42/files",
    expected: { ok: true, host: "ghe.acme.com:8443", ownerRepo: "org/repo" },
    rationale: "sub-tabs still identify the same PR",
  },
  {
    name: "PR GitHub Enterprise commits tab",
    fn: "parse_pr_url",
    input: "https://ghe.acme.com:8443/org/repo/pull/42/commits",
    expected: { ok: true, host: "ghe.acme.com:8443", ownerRepo: "org/repo" },
    rationale: "commits sub-tab should parse like the PR root",
  },
  {
    name: "PR userinfo token",
    fn: "parse_pr_url",
    input: "https://x-token@ghe.acme.com/org/repo/pull/3",
    expected: { ok: true, host: "ghe.acme.com", ownerRepo: "org/repo" },
    rationale: "userinfo is not part of repository identity",
  },
  {
    name: "PR userinfo user password",
    fn: "parse_pr_url",
    input: "https://user:pass@ghe.acme.com/org/repo/pull/3",
    expected: { ok: true, host: "ghe.acme.com", ownerRepo: "org/repo" },
    rationale: "credential-shaped userinfo is stripped",
  },
  {
    name: "PR mixed case",
    fn: "parse_pr_url",
    input: "https://GitHub.com/Org/Repo/pull/9",
    expected: { ok: true, host: "github.com", ownerRepo: "org/repo" },
    rationale: "GitHub identifiers compare case-insensitively",
  },
  {
    name: "PR query string after number",
    fn: "parse_pr_url",
    input: "https://github.com/org/repo/pull/1?notification_referrer_id=abc",
    expected: { ok: true, host: "github.com", ownerRepo: "org/repo" },
    rationale: "notification query parameters should not break parsing",
  },
  {
    name: "PR fragment after number",
    fn: "parse_pr_url",
    input: "https://github.com/org/repo/pull/1#discussion_r1",
    expected: { ok: true, host: "github.com", ownerRepo: "org/repo" },
    rationale: "discussion fragments should not break parsing",
  },
  {
    name: "PR repo name ending dot git",
    fn: "parse_pr_url",
    input: "https://github.com/org/repo.git/pull/1",
    expected: { ok: true, host: "github.com", ownerRepo: "org/repo.git" },
    rationale: ".git can be part of a web repository name",
  },
  {
    name: "PR default https port normalized",
    fn: "parse_pr_url",
    input: "https://github.com:443/org/repo/pull/1",
    expected: { ok: true, host: "github.com", ownerRepo: "org/repo" },
    rationale: "default HTTPS port should not affect identity",
  },
  {
    name: "PR default http port normalized",
    fn: "parse_pr_url",
    input: "http://github.com:80/org/repo/pull/1",
    expected: { ok: true, host: "github.com", ownerRepo: "org/repo" },
    rationale: "default HTTP port should not affect identity",
  },
  {
    name: "PR path-prefixed GHE rejected",
    fn: "parse_pr_url",
    input: "https://acme.com/github/org/repo/pull/1",
    expected: { ok: false },
    rationale: "path prefixes are ambiguous and must fail closed",
  },
  {
    name: "PR deep owner path rejected",
    fn: "parse_pr_url",
    input: "https://github.com/group/subgroup/repo/pull/1",
    expected: { ok: false },
    rationale: "nested namespaces are not GitHub owner/repo shape",
  },
  {
    name: "PR empty owner rejected",
    fn: "parse_pr_url",
    input: "https://github.com//repo/pull/1",
    expected: { ok: false },
    rationale: "owner must be non-empty",
  },
  {
    name: "PR empty repo rejected",
    fn: "parse_pr_url",
    input: "https://github.com/org//pull/1",
    expected: { ok: false },
    rationale: "repo must be non-empty",
  },
  {
    name: "PR non-numeric id rejected",
    fn: "parse_pr_url",
    input: "https://github.com/org/repo/pull/abc",
    expected: { ok: false },
    rationale: "PR number anchor must be numeric",
  },
  {
    name: "PR issues URL rejected",
    fn: "parse_pr_url",
    input: "https://github.com/org/repo/issues/1",
    expected: { ok: false },
    rationale: "issues are not pull requests",
  },
  {
    name: "PR missing scheme rejected",
    fn: "parse_pr_url",
    input: "github.com/org/repo/pull/1",
    expected: { ok: false },
    rationale: "web URL scheme is required",
  },
  {
    name: "PR ssh scheme rejected",
    fn: "parse_pr_url",
    input: "ssh://github.com/org/repo/pull/1",
    expected: { ok: false },
    rationale: "PR URLs must be http(s) web URLs",
  },
  {
    name: "remote HTTPS with dot git",
    fn: "parse_remote_url",
    input: "https://github.com/org/repo.git",
    expected: { ok: true, host: "github.com", ownerRepo: "org/repo", form: "https" },
    rationale: "canonical HTTPS remote",
  },
  {
    name: "remote HTTPS without dot git",
    fn: "parse_remote_url",
    input: "https://github.com/org/repo",
    expected: { ok: true, host: "github.com", ownerRepo: "org/repo", form: "https" },
    rationale: "HTTPS remotes do not require .git",
  },
  {
    name: "remote HTTP",
    fn: "parse_remote_url",
    input: "http://github.com/org/repo.git",
    expected: { ok: true, host: "github.com", ownerRepo: "org/repo", form: "http" },
    rationale: "HTTP remotes remain parseable",
  },
  {
    name: "remote ssh with user",
    fn: "parse_remote_url",
    input: "ssh://git@github.com/org/repo.git",
    expected: { ok: true, host: "github.com", ownerRepo: "org/repo", form: "ssh" },
    rationale: "ssh URL-form with user is supported",
  },
  {
    name: "remote ssh without user",
    fn: "parse_remote_url",
    input: "ssh://github.com/org/repo.git",
    expected: { ok: true, host: "github.com", ownerRepo: "org/repo", form: "ssh" },
    rationale: "ssh URL-form user is optional",
  },
  {
    name: "remote git protocol",
    fn: "parse_remote_url",
    input: "git://github.com/org/repo.git",
    expected: { ok: true, host: "github.com", ownerRepo: "org/repo", form: "git" },
    rationale: "git protocol remotes can identify host and repo",
  },
  {
    name: "remote ssh transport port",
    fn: "parse_remote_url",
    input: "ssh://git@ghe.acme.com:2222/org/repo.git",
    expected: { ok: true, host: "ghe.acme.com:2222", ownerRepo: "org/repo", form: "ssh" },
    rationale: "ssh transport port is preserved in parsed output",
  },
  {
    name: "remote https non-default port",
    fn: "parse_remote_url",
    input: "https://ghe.acme.com:8443/org/repo.git",
    expected: { ok: true, host: "ghe.acme.com:8443", ownerRepo: "org/repo", form: "https" },
    rationale: "HTTPS web port is part of identity when non-default",
  },
  {
    name: "remote default https port normalized",
    fn: "parse_remote_url",
    input: "https://github.com:443/org/repo.git",
    expected: { ok: true, host: "github.com", ownerRepo: "org/repo", form: "https" },
    rationale: "default HTTPS port should not affect remote identity",
  },
  {
    name: "remote default http port normalized",
    fn: "parse_remote_url",
    input: "http://github.com:80/org/repo.git",
    expected: { ok: true, host: "github.com", ownerRepo: "org/repo", form: "http" },
    rationale: "default HTTP port should not affect remote identity",
  },
  {
    name: "remote scp with user dot git",
    fn: "parse_remote_url",
    input: "git@github.com:org/repo.git",
    expected: { ok: true, host: "github.com", ownerRepo: "org/repo", form: "scp" },
    rationale: "classic scp-form remote remains supported",
  },
  {
    name: "remote scp with user without dot git",
    fn: "parse_remote_url",
    input: "git@github.com:org/repo",
    expected: { ok: true, host: "github.com", ownerRepo: "org/repo", form: "scp" },
    rationale: "scp-form does not require .git",
  },
  {
    name: "remote scp without user dot git",
    fn: "parse_remote_url",
    input: "github.com:org/repo.git",
    expected: { ok: true, host: "github.com", ownerRepo: "org/repo", form: "scp" },
    rationale: "git-clone scp form allows no user segment",
  },
  {
    name: "remote scp without user without dot git",
    fn: "parse_remote_url",
    input: "github.com:org/repo",
    expected: { ok: true, host: "github.com", ownerRepo: "org/repo", form: "scp" },
    rationale: "no-user scp form works without .git",
  },
  {
    name: "remote scp trailing slash",
    fn: "parse_remote_url",
    input: "git@github.com:org/repo.git/",
    expected: { ok: true, host: "github.com", ownerRepo: "org/repo", form: "scp" },
    rationale: "trailing slash is not part of repo identity",
  },
  {
    name: "remote scp alternate user",
    fn: "parse_remote_url",
    input: "deploy@github.com:org/repo.git",
    expected: { ok: true, host: "github.com", ownerRepo: "org/repo", form: "scp" },
    rationale: "scp username is not repository identity",
  },
  {
    name: "remote scp tilde path",
    fn: "parse_remote_url",
    input: "git@host.xz:~user/repo.git",
    expected: { ok: true, host: "host.xz", ownerRepo: "~user/repo", form: "scp" },
    rationale: "git docs allow tilde owner paths in scp form",
  },
  {
    name: "remote IPv6 URL form",
    fn: "parse_remote_url",
    input: "ssh://git@[2001:db8::1]/org/repo.git",
    expected: { ok: true, host: "[2001:db8::1]", ownerRepo: "org/repo", form: "ssh" },
    rationale: "bracketed IPv6 is valid in URL-form remotes",
  },
  {
    name: "remote bracketed IPv6 URL form with port",
    fn: "parse_remote_url",
    input: "ssh://git@[2001:db8::1]:2222/org/repo.git",
    expected: { ok: true, host: "[2001:db8::1]:2222", ownerRepo: "org/repo", form: "ssh" },
    rationale: "URL-form IPv6 can include a transport port",
  },
  {
    name: "remote IPv6 scp form rejected",
    fn: "parse_remote_url",
    input: "git@[2001:db8::1]:org/repo.git",
    expected: { ok: false },
    rationale: "existing limitation rejects bracketed IPv6 scp-form",
  },
  {
    name: "remote mixed case",
    fn: "parse_remote_url",
    input: "https://GitHub.com/Org/Repo.git",
    expected: { ok: true, host: "github.com", ownerRepo: "org/repo", form: "https" },
    rationale: "remote host and repo are normalized for GitHub matching",
  },
  {
    name: "remote double dot git suffix",
    fn: "parse_remote_url",
    input: "https://github.com/org/repo.git.git",
    expected: { ok: true, host: "github.com", ownerRepo: "org/repo.git", form: "https" },
    rationale: "only one literal .git suffix is stripped",
  },
  {
    name: "remote percent encoded owner preserved",
    fn: "parse_remote_url",
    input: "https://github.com/org%2fname/repo.git",
    expected: { ok: true, host: "github.com", ownerRepo: "org%2fname/repo", form: "https" },
    rationale: "percent-encoded path segments are compared literally",
  },
  {
    name: "remote percent encoded repo preserved",
    fn: "parse_remote_url",
    input: "https://github.com/org/repo%2ename.git",
    expected: { ok: true, host: "github.com", ownerRepo: "org/repo%2ename", form: "https" },
    rationale: "valid percent escapes remain encoded",
  },
  {
    name: "remote deep namespace rejected",
    fn: "parse_remote_url",
    input: "https://gitlab.com/group/subgroup/repo.git",
    expected: { ok: false },
    rationale: "nested namespaces fail closed",
  },
  {
    name: "remote invalid percent escape rejected",
    fn: "parse_remote_url",
    input: "https://github.com/org/repo%zz.git",
    expected: { ok: false },
    rationale: "malformed percent escapes are not stable identity strings",
  },
  {
    name: "remote empty input rejected",
    fn: "parse_remote_url",
    input: "",
    expected: { ok: false },
    rationale: "empty input cannot identify a remote",
  },
  {
    name: "remote missing host URL rejected",
    fn: "parse_remote_url",
    input: "https:///org/repo.git",
    expected: { ok: false },
    rationale: "URL-form remote must include a host",
  },
  {
    name: "remote scp empty path rejected",
    fn: "parse_remote_url",
    input: "github.com:",
    expected: { ok: false },
    rationale: "scp-form remote must include owner/repo path",
  },
  {
    name: "remote local relative path with colon rejected",
    fn: "parse_remote_url",
    input: "./local:path",
    expected: { ok: false },
    rationale: "slash before first colon means local path, not scp-form",
  },
  {
    name: "remote local absolute path with colon rejected",
    fn: "parse_remote_url",
    input: "/abs/path:thing",
    expected: { ok: false },
    rationale: "absolute local paths are not scp-form remotes",
  },
  {
    name: "remote path-prefixed HTTPS rejected",
    fn: "parse_remote_url",
    input: "https://acme.com/github/org/repo.git",
    expected: { ok: false },
    rationale: "path prefixes are ambiguous and fail closed",
  },
  {
    name: "remote path-prefixed scp rejected",
    fn: "parse_remote_url",
    input: "git@acme.com:github/org/repo.git",
    expected: { ok: false },
    rationale: "scp path prefixes are ambiguous and fail closed",
  },
  {
    name: "remote unsupported scheme rejected",
    fn: "parse_remote_url",
    input: "file:///tmp/org/repo.git",
    expected: { ok: false },
    rationale: "non-http(s)/ssh/git/scp schemes are outside identity matching",
  },
  {
    name: "remote missing scheme rejected",
    fn: "parse_remote_url",
    input: "github.com/org/repo.git",
    expected: { ok: false },
    rationale: "slash before any colon is a local path-like shape",
  },
  {
    name: "remote bare scheme without // rejected as not scp",
    fn: "parse_remote_url",
    input: "http:owner/repo",
    expected: { ok: false },
    rationale: "missing-// scheme typo must not misclassify as scp host=http",
  },
  {
    name: "remote bare https scheme without // rejected as not scp",
    fn: "parse_remote_url",
    input: "https:owner/repo.git",
    expected: { ok: false },
    rationale: "missing-// scheme typo must not misclassify as scp host=https",
  },
  {
    name: "remote bare ssh scheme without // rejected as not scp",
    fn: "parse_remote_url",
    input: "ssh:owner/repo.git",
    expected: { ok: false },
    rationale: "missing-// scheme typo must not misclassify as scp host=ssh",
  },
]

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

  test("userinfo is stripped and port is preserved", async () => {
    const r = await callHelper(
      "parse_pr_url",
      "https://x-token@ghe.acme.com:8443/org/repo/pull/3",
    )
    expect(r.exitCode).toBe(0)
    expect(r.stdout.trim()).toBe("ghe.acme.com:8443\torg/repo")
  })

  test("default HTTPS port is normalized", async () => {
    const r = await callHelper(
      "parse_pr_url",
      "https://github.com:443/org/repo/pull/1",
    )
    expect(r.exitCode).toBe(0)
    expect(r.stdout.trim()).toBe("github.com\torg/repo")
  })

  test("query string and fragment are stripped", async () => {
    const query = await callHelper(
      "parse_pr_url",
      "https://github.com/org/repo/pull/1?notification_referrer_id=abc",
    )
    const fragment = await callHelper(
      "parse_pr_url",
      "https://github.com/org/repo/pull/1#discussion_r1",
    )

    expect(query.exitCode).toBe(0)
    expect(query.stdout.trim()).toBe("github.com\torg/repo")
    expect(fragment.exitCode).toBe(0)
    expect(fragment.stdout.trim()).toBe("github.com\torg/repo")
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
    expect(r.stdout.trim()).toBe("github.com\torg/repo\thttps")
  })

  test("HTTPS without .git", async () => {
    const r = await callHelper("parse_remote_url", "https://github.com/org/repo")
    expect(r.exitCode).toBe(0)
    expect(r.stdout.trim()).toBe("github.com\torg/repo\thttps")
  })

  test("scp-form without user segment", async () => {
    const withGit = await callHelper("parse_remote_url", "github.com:org/repo.git")
    const withoutGit = await callHelper("parse_remote_url", "github.com:org/repo")

    expect(withGit.exitCode).toBe(0)
    expect(withGit.stdout.trim()).toBe("github.com\torg/repo\tscp")
    expect(withoutGit.exitCode).toBe(0)
    expect(withoutGit.stdout.trim()).toBe("github.com\torg/repo\tscp")
  })

  test("scp-form (git@host:owner/repo.git)", async () => {
    const r = await callHelper("parse_remote_url", "git@github.com:org/repo.git")
    expect(r.exitCode).toBe(0)
    expect(r.stdout.trim()).toBe("github.com\torg/repo\tscp")
  })

  test("rejects HTTPS path-prefixed remotes", async () => {
    const r = await callHelper("parse_remote_url", "https://acme.com/github/org/repo.git")
    expect(r.exitCode).toBe(1)
    expect(r.stdout.trim()).toBe("")
  })

  test("rejects scp-form path-prefixed remotes", async () => {
    const r = await callHelper("parse_remote_url", "git@acme.com:github/org/repo.git")
    expect(r.exitCode).toBe(1)
    expect(r.stdout.trim()).toBe("")
  })

  test("rejects nested namespace remotes", async () => {
    const r = await callHelper("parse_remote_url", "git@gitlab.com:group/subgroup/repo.git")
    expect(r.exitCode).toBe(1)
    expect(r.stdout.trim()).toBe("")
  })

  test("rejects bracketed-IPv6 scp-form remotes", async () => {
    const r = await callHelper("parse_remote_url", "git@[::1]:org/repo.git")
    expect(r.exitCode).toBe(1)
    expect(r.stdout.trim()).toBe("")
  })

  test("ssh:// preserves port", async () => {
    const r = await callHelper("parse_remote_url", "ssh://git@ghe.acme.com:22/org/repo.git")
    expect(r.exitCode).toBe(0)
    expect(r.stdout.trim()).toBe("ghe.acme.com:22\torg/repo\tssh")
  })

  test("default HTTPS port is normalized", async () => {
    const r = await callHelper("parse_remote_url", "https://github.com:443/org/repo.git")
    expect(r.exitCode).toBe(0)
    expect(r.stdout.trim()).toBe("github.com\torg/repo\thttps")
  })

  test("HTTPS with userinfo and mixed case", async () => {
    const r = await callHelper("parse_remote_url", "https://x-token@ghe.acme.com/Org/Repo.git")
    expect(r.exitCode).toBe(0)
    expect(r.stdout.trim()).toBe("ghe.acme.com\torg/repo\thttps")
  })

  test("rejects local paths with colons before treating them as scp-form", async () => {
    const relative = await callHelper("parse_remote_url", "./local:path")
    const absolute = await callHelper("parse_remote_url", "/abs/path:thing")

    expect(relative.exitCode).toBe(1)
    expect(relative.stdout.trim()).toBe("")
    expect(absolute.exitCode).toBe(1)
    expect(absolute.stdout.trim()).toBe("")
  })

  test("boundary: org/repo-extra is NOT equal to org/repo", async () => {
    const r = await callHelper("parse_remote_url", "git@github.com:org/repo-extra.git")
    expect(r.exitCode).toBe(0)
    expect(r.stdout.trim()).toBe("github.com\torg/repo-extra\tscp")
    expect(r.stdout.trim()).not.toBe("github.com\torg/repo")
  })
})

describe("resolve-base-beta.sh — parser corpus", () => {
  for (const c of parserCases) {
    test(`${c.fn}: ${c.name}`, async () => {
      const r = await callHelper(c.fn, c.input)

      if (!c.expected.ok) {
        expect(r.exitCode, c.rationale).toBe(1)
        expect(r.stdout.trim(), c.rationale).toBe("")
        return
      }

      expect(r.exitCode, c.rationale).toBe(0)
      const expected = [c.expected.host, c.expected.ownerRepo]
      if (c.expected.form) expected.push(c.expected.form)
      expect(r.stdout.trim(), c.rationale).toBe(expected.join("\t"))
    })
  }
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
  for ((i = 1; i <= $#; i++)); do
    if [ "\${!i}" = "--jq" ]; then
      printf '%s\\t%s' '${baseRefName}' '${prUrl}'
      exit 0
    fi
  done
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

  test("auto-detect PR metadata does not require standalone jq on PATH", async () => {
    const repoRoot = await initRepo()
    await commitFile(repoRoot, "history.txt", "a\n", "initial")
    const upstreamMainSha = await commitFile(repoRoot, "history.txt", "b\n", "main advance")

    await runGit(["checkout", "-b", "feature"], repoRoot)
    await commitFile(repoRoot, "feature.txt", "feature\n", "feature change")

    await runGit(
      ["remote", "add", "upstream", "https://github.com/EveryInc/compound-engineering-plugin.git"],
      repoRoot,
    )
    await runGit(["update-ref", "refs/remotes/upstream/main", upstreamMainSha], repoRoot)

    const stubBin = await createResolveBasePathStub()
    await writeExecutable(
      path.join(stubBin, "gh"),
      `#!/usr/bin/env bash
set -euo pipefail
if [ "$#" -ge 2 ] && [ "$1" = "pr" ] && [ "$2" = "view" ]; then
  for ((i = 1; i <= $#; i++)); do
    if [ "\${!i}" = "--jq" ]; then
      printf '%s\\t%s' 'main' 'https://github.com/EveryInc/compound-engineering-plugin/pull/123'
      exit 0
    fi
  done
  printf '%s' '{"baseRefName":"main","url":"https://github.com/EveryInc/compound-engineering-plugin/pull/123"}'
  exit 0
fi
exit 1
`,
    )
    await expect(fs.stat(path.join(stubBin, "jq"))).rejects.toThrow()

    const result = await runCommand(["bash", resolveBaseScript], repoRoot, {
      ...gitEnv,
      PATH: stubBin,
    })

    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe(`BASE:${upstreamMainSha}`)
    expect(result.stdout).not.toContain("jq")
    expect(result.stdout).not.toMatch(/^ERROR:/)
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

  test("--pr-base-branch alone fails closed instead of falling back to origin", async () => {
    const repoRoot = await initRepo()
    const initialSha = await commitFile(repoRoot, "history.txt", "a\n", "initial")
    const forkMainSha = await commitFile(repoRoot, "history.txt", "fork\n", "fork main advance")

    await runGit(["checkout", "-b", "feature", initialSha], repoRoot)
    await commitFile(repoRoot, "feature.txt", "feature\n", "feature change")

    await runGit(["remote", "add", "origin", "https://github.com/someone/fork.git"], repoRoot)
    await runGit(["update-ref", "refs/remotes/origin/main", forkMainSha], repoRoot)

    const stubBin = await fs.mkdtemp(path.join(os.tmpdir(), "resolve-base-beta-bin-"))
    await writeExecutable(path.join(stubBin, "gh"), "#!/usr/bin/env bash\nexit 1\n")

    const result = await runCommand(
      ["bash", resolveBaseScript, "--pr-base-branch", "main"],
      repoRoot,
      {
        ...gitEnv,
        PATH: `${stubBin}:${process.env.PATH ?? ""}`,
      },
    )

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toMatch(/^ERROR:/)
    expect(result.stdout).toContain(
      "--pr-base-branch requires --pr-url or --pr-base-repo/--pr-base-host",
    )
    expect(result.stdout).not.toMatch(/^BASE:/)
  })

  test("auto-detect without PR metadata uses legacy origin branch fallback", async () => {
    const repoRoot = await initRepo()
    await commitFile(repoRoot, "history.txt", "a\n", "initial")
    const releaseSha = await commitFile(repoRoot, "history.txt", "b\n", "release advance")

    await runGit(["checkout", "-b", "feature"], repoRoot)
    await commitFile(repoRoot, "feature.txt", "feature\n", "feature change")

    await runGit(["remote", "add", "origin", "https://github.com/org/repo.git"], repoRoot)
    await runGit(["update-ref", "refs/remotes/origin/release", releaseSha], repoRoot)
    await runGit(["symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/release"], repoRoot)

    const stubBin = await fs.mkdtemp(path.join(os.tmpdir(), "resolve-base-beta-bin-"))
    await writeExecutable(path.join(stubBin, "gh"), "#!/usr/bin/env bash\nexit 1\n")

    const result = await runCommand(["bash", resolveBaseScript], repoRoot, {
      ...gitEnv,
      PATH: `${stubBin}:${process.env.PATH ?? ""}`,
    })

    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe(`BASE:${releaseSha}`)
  })

  test("explicit PR base flags fail closed for path-prefixed base remotes", async () => {
    const repoRoot = await initRepo()
    const initialSha = await commitFile(repoRoot, "history.txt", "a\n", "initial")
    const upstreamMainSha = await commitFile(repoRoot, "history.txt", "b\n", "main advance")

    await runGit(["checkout", "-b", "feature"], repoRoot)
    await commitFile(repoRoot, "feature.txt", "feature\n", "feature change")

    await runGit(["checkout", "-b", "fork-main", initialSha], repoRoot)
    const forkMainSha = await commitFile(repoRoot, "fork.txt", "fork\n", "fork diverges")
    await runGit(["checkout", "feature"], repoRoot)

    await runGit(["remote", "add", "origin", "https://acme.com/github/someone/fork.git"], repoRoot)
    await runGit(
      ["remote", "add", "upstream", "https://acme.com/github/EveryInc/compound-engineering-plugin.git"],
      repoRoot,
    )
    await runGit(["update-ref", "refs/remotes/origin/main", forkMainSha], repoRoot)
    await runGit(["update-ref", "refs/remotes/upstream/main", upstreamMainSha], repoRoot)

    const stubBin = await fs.mkdtemp(path.join(os.tmpdir(), "resolve-base-beta-bin-"))
    await writeExecutable(path.join(stubBin, "gh"), "#!/usr/bin/env bash\nexit 1\n")

    const result = await runCommand(
      [
        "bash",
        resolveBaseScript,
        "--pr-base-repo",
        "EveryInc/compound-engineering-plugin",
        "--pr-base-host",
        "acme.com",
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
    expect(result.stdout).toMatch(/^ERROR:/)
    expect(result.stdout).toContain("does not match any configured git remote")
    expect(result.stdout).not.toContain(`BASE:${upstreamMainSha}`)
    expect(result.stdout).not.toContain(`BASE:${forkMainSha}`)
    expect(result.stdout).not.toMatch(/^BASE:/)
  })

  test("url.insteadOf rewrites to path-prefixed remotes that fail closed", async () => {
    const repoRoot = await initRepo()
    const initialSha = await commitFile(repoRoot, "history.txt", "a\n", "initial")
    const upstreamMainSha = await commitFile(repoRoot, "history.txt", "b\n", "main advance")

    await runGit(["checkout", "-b", "feature"], repoRoot)
    await commitFile(repoRoot, "feature.txt", "feature\n", "feature change")

    await runGit(["checkout", "-b", "fork-main", initialSha], repoRoot)
    const forkMainSha = await commitFile(repoRoot, "fork.txt", "fork\n", "fork diverges")
    await runGit(["checkout", "feature"], repoRoot)

    await runGit(["config", "url.https://acme.com/.insteadOf", "ghe:"], repoRoot)
    await runGit(["remote", "add", "origin", "https://acme.com/github/someone/fork.git"], repoRoot)
    await runGit(
      ["remote", "add", "upstream", "ghe:github/EveryInc/compound-engineering-plugin.git"],
      repoRoot,
    )
    await runGit(["update-ref", "refs/remotes/origin/main", forkMainSha], repoRoot)
    await runGit(["update-ref", "refs/remotes/upstream/main", upstreamMainSha], repoRoot)

    const stubBin = await fs.mkdtemp(path.join(os.tmpdir(), "resolve-base-beta-bin-"))
    await writeExecutable(path.join(stubBin, "gh"), "#!/usr/bin/env bash\nexit 1\n")

    const result = await runCommand(
      [
        "bash",
        resolveBaseScript,
        "--pr-base-repo",
        "EveryInc/compound-engineering-plugin",
        "--pr-base-host",
        "acme.com",
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
    expect(result.stdout).toMatch(/^ERROR:/)
    expect(result.stdout).toContain("does not match any configured git remote")
    expect(result.stdout).not.toContain(`BASE:${upstreamMainSha}`)
    expect(result.stdout).not.toContain(`BASE:${forkMainSha}`)
    expect(result.stdout).not.toMatch(/^BASE:/)
  })

  test("ported GitHub Enterprise PR resolves via matching URL-form remote port", async () => {
    const repoRoot = await initRepo()
    const initialSha = await commitFile(repoRoot, "history.txt", "a\n", "initial")
    const upstreamMainSha = await commitFile(repoRoot, "history.txt", "b\n", "main advance")

    await runGit(["checkout", "-b", "feature"], repoRoot)
    await commitFile(repoRoot, "feature.txt", "feature\n", "feature change")

    await runGit(
      ["remote", "add", "wrongport", "https://ghe.acme.com:9443/EveryInc/compound-engineering-plugin.git"],
      repoRoot,
    )
    await runGit(
      ["remote", "add", "upstream", "https://ghe.acme.com:8443/EveryInc/compound-engineering-plugin.git"],
      repoRoot,
    )
    await runGit(["update-ref", "refs/remotes/wrongport/main", initialSha], repoRoot)
    await runGit(["update-ref", "refs/remotes/upstream/main", upstreamMainSha], repoRoot)

    const stubBin = await fs.mkdtemp(path.join(os.tmpdir(), "resolve-base-beta-bin-"))
    await writeExecutable(path.join(stubBin, "gh"), "#!/usr/bin/env bash\nexit 1\n")

    const result = await runCommand(
      [
        "bash",
        resolveBaseScript,
        "--pr-url",
        "https://ghe.acme.com:8443/EveryInc/compound-engineering-plugin/pull/7",
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

  test("ported GitHub Enterprise PR can resolve via scp-form remote without web UI port", async () => {
    const repoRoot = await initRepo()
    await commitFile(repoRoot, "history.txt", "a\n", "initial")
    const upstreamMainSha = await commitFile(repoRoot, "history.txt", "b\n", "main advance")

    await runGit(["checkout", "-b", "feature"], repoRoot)
    await commitFile(repoRoot, "feature.txt", "feature\n", "feature change")

    await runGit(
      ["remote", "add", "upstream", "git@ghe.acme.com:EveryInc/compound-engineering-plugin.git"],
      repoRoot,
    )
    await runGit(["update-ref", "refs/remotes/upstream/main", upstreamMainSha], repoRoot)

    const stubBin = await fs.mkdtemp(path.join(os.tmpdir(), "resolve-base-beta-bin-"))
    await writeExecutable(path.join(stubBin, "gh"), "#!/usr/bin/env bash\nexit 1\n")

    const result = await runCommand(
      [
        "bash",
        resolveBaseScript,
        "--pr-url",
        "https://ghe.acme.com:8443/EveryInc/compound-engineering-plugin/pull/7",
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

  test("ported GitHub Enterprise PR can resolve via ssh URL-form transport port", async () => {
    const repoRoot = await initRepo()
    await commitFile(repoRoot, "history.txt", "a\n", "initial")
    const upstreamMainSha = await commitFile(repoRoot, "history.txt", "b\n", "main advance")

    await runGit(["checkout", "-b", "feature"], repoRoot)
    await commitFile(repoRoot, "feature.txt", "feature\n", "feature change")

    await runGit(
      [
        "remote",
        "add",
        "upstream",
        "ssh://git@ghe.acme.com:2222/EveryInc/compound-engineering-plugin.git",
      ],
      repoRoot,
    )
    await runGit(["update-ref", "refs/remotes/upstream/main", upstreamMainSha], repoRoot)

    const stubBin = await fs.mkdtemp(path.join(os.tmpdir(), "resolve-base-beta-bin-"))
    await writeExecutable(path.join(stubBin, "gh"), "#!/usr/bin/env bash\nexit 1\n")

    const result = await runCommand(
      [
        "bash",
        resolveBaseScript,
        "--pr-url",
        "https://ghe.acme.com:8443/EveryInc/compound-engineering-plugin/pull/7",
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

  test("ported GitHub Enterprise PR does not match different HTTPS web port", async () => {
    const repoRoot = await initRepo()
    await commitFile(repoRoot, "history.txt", "a\n", "initial")
    const wrongPortSha = await commitFile(repoRoot, "history.txt", "b\n", "wrong port main")

    await runGit(["checkout", "-b", "feature"], repoRoot)
    await commitFile(repoRoot, "feature.txt", "feature\n", "feature change")

    await runGit(
      [
        "remote",
        "add",
        "wrongport",
        "https://ghe.acme.com:9443/EveryInc/compound-engineering-plugin.git",
      ],
      repoRoot,
    )
    await runGit(["update-ref", "refs/remotes/wrongport/main", wrongPortSha], repoRoot)

    const stubBin = await fs.mkdtemp(path.join(os.tmpdir(), "resolve-base-beta-bin-"))
    await writeExecutable(path.join(stubBin, "gh"), "#!/usr/bin/env bash\nexit 1\n")

    const result = await runCommand(
      [
        "bash",
        resolveBaseScript,
        "--pr-url",
        "https://ghe.acme.com:8443/EveryInc/compound-engineering-plugin/pull/7",
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
    expect(result.stdout).toMatch(/^ERROR:/)
    expect(result.stdout).toContain("does not match any configured git remote")
    expect(result.stdout).not.toMatch(/^BASE:/)
  })

  test("ported GitHub Enterprise PR can resolve via git protocol remote", async () => {
    const repoRoot = await initRepo()
    await commitFile(repoRoot, "history.txt", "a\n", "initial")
    const upstreamMainSha = await commitFile(repoRoot, "history.txt", "b\n", "main advance")

    await runGit(["checkout", "-b", "feature"], repoRoot)
    await commitFile(repoRoot, "feature.txt", "feature\n", "feature change")

    await runGit(
      [
        "remote",
        "add",
        "upstream",
        "git://ghe.acme.com/EveryInc/compound-engineering-plugin.git",
      ],
      repoRoot,
    )
    await runGit(["update-ref", "refs/remotes/upstream/main", upstreamMainSha], repoRoot)

    const stubBin = await fs.mkdtemp(path.join(os.tmpdir(), "resolve-base-beta-bin-"))
    await writeExecutable(path.join(stubBin, "gh"), "#!/usr/bin/env bash\nexit 1\n")

    const result = await runCommand(
      [
        "bash",
        resolveBaseScript,
        "--pr-url",
        "https://ghe.acme.com:8443/EveryInc/compound-engineering-plugin/pull/7",
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

  test("tries later matching remotes when the first matching remote cannot fetch", async () => {
    const repoRoot = await initRepo()
    await commitFile(repoRoot, "history.txt", "a\n", "initial")
    const upstreamMainSha = await commitFile(repoRoot, "history.txt", "b\n", "main advance")

    await runGit(["checkout", "-b", "feature"], repoRoot)
    await commitFile(repoRoot, "feature.txt", "feature\n", "feature change")

    await runGit(
      [
        "remote",
        "add",
        "aaa-old",
        "https://github.com/EveryInc/compound-engineering-plugin.git",
      ],
      repoRoot,
    )
    await runGit(
      [
        "remote",
        "add",
        "zzz-new",
        "https://github.com/EveryInc/compound-engineering-plugin.git",
      ],
      repoRoot,
    )
    await runGit(["update-ref", "refs/remotes/zzz-new/main", upstreamMainSha], repoRoot)

    const stubBin = await fs.mkdtemp(path.join(os.tmpdir(), "resolve-base-beta-bin-"))
    await writeExecutable(path.join(stubBin, "gh"), "#!/usr/bin/env bash\nexit 1\n")

    const result = await runCommand(
      [
        "bash",
        resolveBaseScript,
        "--pr-url",
        "https://github.com/EveryInc/compound-engineering-plugin/pull/7",
        "--pr-base-branch",
        "main",
      ],
      repoRoot,
      {
        ...gitEnv,
        GIT_ALLOW_PROTOCOL: "file",
        PATH: `${stubBin}:${process.env.PATH ?? ""}`,
      },
    )

    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe(`BASE:${upstreamMainSha}`)
  })

  test("auto-detect ported GitHub Enterprise PR can resolve via scp-form remote without web UI port", async () => {
    const repoRoot = await initRepo()
    await commitFile(repoRoot, "history.txt", "a\n", "initial")
    const upstreamMainSha = await commitFile(repoRoot, "history.txt", "b\n", "main advance")

    await runGit(["checkout", "-b", "feature"], repoRoot)
    await commitFile(repoRoot, "feature.txt", "feature\n", "feature change")

    await runGit(
      ["remote", "add", "upstream", "git@ghe.acme.com:EveryInc/compound-engineering-plugin.git"],
      repoRoot,
    )
    await runGit(["update-ref", "refs/remotes/upstream/main", upstreamMainSha], repoRoot)

    const stubBin = await createGheStubBin(
      "main",
      "https://ghe.acme.com:8443/EveryInc/compound-engineering-plugin/pull/7",
    )

    const result = await runCommand(["bash", resolveBaseScript], repoRoot, {
      ...gitEnv,
      PATH: `${stubBin}:${process.env.PATH ?? ""}`,
    })

    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe(`BASE:${upstreamMainSha}`)
  })

  test("PR metadata with no matching remote fails closed (does not silently fall back to origin)", async () => {
    const repoRoot = await initRepo()
    await commitFile(repoRoot, "history.txt", "a\n", "initial")
    const mainSha = await commitFile(repoRoot, "history.txt", "b\n", "main advance")

    await runGit(["checkout", "-b", "feature"], repoRoot)
    await commitFile(repoRoot, "feature.txt", "feature\n", "feature change")

    // The only remote points at "org/repo-extra"; PR says "org/repo".
    // Two invariants are exercised together:
    //   (1) host-agnostic matcher must NOT fuzzy-match org/repo-extra for org/repo.
    //   (2) when PR metadata was provided and no remote matches it, the
    //       resolver must fail closed rather than silently falling back to
    //       origin's content (which would reflect a different repo's history
    //       and silently miscategorize the diff for reviewers).
    // If invariant (1) regressed (fuzzy match), `BASE:` would be emitted and
    // this assertion would catch it; if invariant (2) regressed (silent
    // fallback), `BASE:` would also be emitted. Either failure → ERROR test
    // fails, surfacing the regression.
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

    expect(result.stdout).toMatch(/^ERROR:/)
    expect(result.stdout).not.toContain("BASE:")
  })

  test("partial explicit PR base metadata fails closed when host is provided without repo", async () => {
    const repoRoot = await initRepo()
    await commitFile(repoRoot, "history.txt", "a\n", "initial")
    const forkMainSha = await commitFile(repoRoot, "history.txt", "b\n", "fork main advance")

    await runGit(["checkout", "-b", "feature"], repoRoot)
    await commitFile(repoRoot, "feature.txt", "feature\n", "feature change")

    await runGit(["remote", "add", "origin", "https://github.com/someone/fork.git"], repoRoot)
    await runGit(["update-ref", "refs/remotes/origin/main", forkMainSha], repoRoot)

    const stubBin = await fs.mkdtemp(path.join(os.tmpdir(), "resolve-base-beta-bin-"))
    await writeExecutable(path.join(stubBin, "gh"), "#!/usr/bin/env bash\nexit 1\n")

    const result = await runCommand(
      [
        "bash",
        resolveBaseScript,
        "--pr-base-host",
        "github.com",
        "--pr-base-branch",
        "main",
      ],
      repoRoot,
      {
        ...gitEnv,
        PATH: `${stubBin}:${process.env.PATH ?? ""}`,
      },
    )

    expect(result.stdout).toMatch(/^ERROR:/)
    expect(result.stdout).toContain("--pr-base-host requires --pr-base-repo")
    expect(result.stdout).not.toContain(`BASE:${forkMainSha}`)
    expect(result.stdout).not.toMatch(/^BASE:/)
  })

  test("PR metadata with bracketed-IPv6 scp-form remote fails closed without origin fallback", async () => {
    const repoRoot = await initRepo()
    await commitFile(repoRoot, "history.txt", "a\n", "initial")
    const forkMainSha = await commitFile(repoRoot, "history.txt", "b\n", "fork main advance")

    await runGit(["checkout", "-b", "feature"], repoRoot)
    await commitFile(repoRoot, "feature.txt", "feature\n", "feature change")

    await runGit(["remote", "add", "origin", "git@[::1]:org/repo.git"], repoRoot)
    await runGit(["update-ref", "refs/remotes/origin/main", forkMainSha], repoRoot)

    const stubBin = await fs.mkdtemp(path.join(os.tmpdir(), "resolve-base-beta-bin-"))
    await writeExecutable(path.join(stubBin, "gh"), "#!/usr/bin/env bash\nexit 1\n")

    const result = await runCommand(
      [
        "bash",
        resolveBaseScript,
        "--pr-base-repo",
        "org/repo",
        "--pr-base-host",
        "[::1]",
        "--pr-base-branch",
        "main",
      ],
      repoRoot,
      {
        ...gitEnv,
        PATH: `${stubBin}:${process.env.PATH ?? ""}`,
      },
    )

    expect(result.stdout).toMatch(/^ERROR:/)
    expect(result.stdout).toContain("does not match any configured git remote")
    expect(result.stdout).not.toContain(`BASE:${forkMainSha}`)
    expect(result.stdout).not.toMatch(/^BASE:/)
  })

  test("PR metadata identifies a matched remote but fetch fails -> ERROR, no origin fallback", async () => {
    const repoRoot = await initRepo()
    await commitFile(repoRoot, "history.txt", "a\n", "initial")
    const forkMainSha = await commitFile(repoRoot, "history.txt", "b\n", "fork main advance")

    await runGit(["checkout", "-b", "feature"], repoRoot)
    await commitFile(repoRoot, "feature.txt", "feature\n", "feature change")

    // origin = fork (matches matcher's negative path), upstream = PR base
    // (matches positive path) but its URL points at a nonexistent local file
    // path so fetch attempts fail. Pre-seed no upstream/main ref so the
    // script must fetch to resolve it — the fetch will fail.
    await runGit(["remote", "add", "origin", "https://github.com/someone/fork.git"], repoRoot)
    await runGit(["update-ref", "refs/remotes/origin/main", forkMainSha], repoRoot)
    const unreachableRepoPath = path.join(
      os.tmpdir(),
      `nonexistent-upstream-${Date.now()}-${Math.random().toString(36).slice(2)}.git`,
    )
    await runGit(
      ["remote", "add", "upstream", `https://github.com/EveryInc/compound-engineering-plugin.git`],
      repoRoot,
    )
    // Override the remote's URL to an unreachable file:// path so fetch fails
    // fast without network. Use file:// (not raw path) so git refuses cleanly.
    await runGit(["remote", "set-url", "upstream", `file://${unreachableRepoPath}`], repoRoot)

    const stubBin = await fs.mkdtemp(path.join(os.tmpdir(), "resolve-base-beta-bin-"))
    await writeExecutable(path.join(stubBin, "gh"), "#!/usr/bin/env bash\nexit 1\n")

    const result = await runCommand(
      [
        "bash",
        resolveBaseScript,
        "--pr-url",
        "https://github.com/EveryInc/compound-engineering-plugin/pull/1",
        "--pr-base-branch",
        "main",
      ],
      repoRoot,
      {
        ...gitEnv,
        PATH: `${stubBin}:${process.env.PATH ?? ""}`,
      },
    )

    // The matched-remote-fetch-fails case is exactly the Codex P1 finding.
    // Must not fall through to origin (which is the fork) and silently use
    // forkMainSha as the base.
    expect(result.stdout).toMatch(/^ERROR:/)
    expect(result.stdout).not.toContain(`BASE:${forkMainSha}`)
    expect(result.stdout).not.toMatch(/^BASE:/)
  })

  test("auto-detect: gh pr view returns unparseable PR URL -> ERROR, no origin fallback", async () => {
    const repoRoot = await initRepo()
    await commitFile(repoRoot, "history.txt", "a\n", "initial")
    const forkMainSha = await commitFile(repoRoot, "history.txt", "b\n", "fork main advance")

    await runGit(["checkout", "-b", "feature"], repoRoot)
    await commitFile(repoRoot, "feature.txt", "feature\n", "feature change")

    // origin is the fork on a GHE deployment mounted under a path prefix.
    // If the fail-closed gate regressed, `gh pr view`'s unparseable URL would
    // silently leave PR_BASE_HOST/REPO unset, and the resolver would fall
    // through to origin/main (forkMainSha) — silently miscategorizing the
    // reviewed diff against fork history.
    await runGit(
      ["remote", "add", "origin", "https://acme.com/github/someone/fork.git"],
      repoRoot,
    )
    await runGit(["update-ref", "refs/remotes/origin/main", forkMainSha], repoRoot)

    // parse_pr_url rejects path-prefixed GHE shapes (see parse_pr_url tests).
    const stubBin = await createGheStubBin(
      "main",
      "https://acme.com/github/EveryInc/compound-engineering-plugin/pull/1",
    )

    const result = await runCommand(["bash", resolveBaseScript], repoRoot, {
      ...gitEnv,
      PATH: `${stubBin}:${process.env.PATH ?? ""}`,
    })

    expect(result.stdout).toMatch(/^ERROR:/)
    expect(result.stdout).toContain("unparseable PR URL")
    expect(result.stdout).not.toContain(`BASE:${forkMainSha}`)
    expect(result.stdout).not.toMatch(/^BASE:/)
  })

  test("auto-detect: gh pr view returns base branch but empty URL -> ERROR, no origin fallback", async () => {
    const repoRoot = await initRepo()
    await commitFile(repoRoot, "history.txt", "a\n", "initial")
    const forkMainSha = await commitFile(repoRoot, "history.txt", "b\n", "fork main advance")

    await runGit(["checkout", "-b", "feature"], repoRoot)
    await commitFile(repoRoot, "feature.txt", "feature\n", "feature change")

    // Same fork-history regression bait as the unparseable-URL test: if the
    // fail-closed gate skips this sub-case, the resolver falls through to
    // origin and silently uses forkMainSha.
    await runGit(["remote", "add", "origin", "https://github.com/someone/fork.git"], repoRoot)
    await runGit(["update-ref", "refs/remotes/origin/main", forkMainSha], repoRoot)

    // Stub `gh pr view` to return a base branch but no URL — exercises the
    // empty-URL guard added alongside the unparseable-URL guard.
    const stubBin = await createGheStubBin("main", "")

    const result = await runCommand(["bash", resolveBaseScript], repoRoot, {
      ...gitEnv,
      PATH: `${stubBin}:${process.env.PATH ?? ""}`,
    })

    expect(result.stdout).toMatch(/^ERROR:/)
    expect(result.stdout).toContain("no URL")
    expect(result.stdout).not.toContain(`BASE:${forkMainSha}`)
    expect(result.stdout).not.toMatch(/^BASE:/)
  })

  test("auto-detect: gh pr view returns PR URL but empty base branch -> ERROR, no origin fallback", async () => {
    const repoRoot = await initRepo()
    await commitFile(repoRoot, "history.txt", "a\n", "initial")
    const forkMainSha = await commitFile(repoRoot, "history.txt", "b\n", "fork main advance")

    await runGit(["checkout", "-b", "feature"], repoRoot)
    await commitFile(repoRoot, "feature.txt", "feature\n", "feature change")

    await runGit(["remote", "add", "origin", "https://github.com/someone/fork.git"], repoRoot)
    await runGit(["update-ref", "refs/remotes/origin/main", forkMainSha], repoRoot)

    const stubBin = await createGheStubBin(
      "",
      "https://github.com/EveryInc/compound-engineering-plugin/pull/1",
    )

    const result = await runCommand(["bash", resolveBaseScript], repoRoot, {
      ...gitEnv,
      PATH: `${stubBin}:${process.env.PATH ?? ""}`,
    })

    expect(result.stdout).toMatch(/^ERROR:/)
    expect(result.stdout).toContain("no base branch")
    expect(result.stdout).not.toContain(`BASE:${forkMainSha}`)
    expect(result.stdout).not.toMatch(/^BASE:/)
  })

  test("auto-detect: gh pr view returns malformed metadata -> ERROR, no origin fallback", async () => {
    const repoRoot = await initRepo()
    await commitFile(repoRoot, "history.txt", "a\n", "initial")
    const forkMainSha = await commitFile(repoRoot, "history.txt", "b\n", "fork main advance")

    await runGit(["checkout", "-b", "feature"], repoRoot)
    await commitFile(repoRoot, "feature.txt", "feature\n", "feature change")

    await runGit(["remote", "add", "origin", "https://github.com/someone/fork.git"], repoRoot)
    await runGit(["update-ref", "refs/remotes/origin/main", forkMainSha], repoRoot)

    const stubBin = await fs.mkdtemp(path.join(os.tmpdir(), "resolve-base-beta-bin-"))
    await writeExecutable(
      path.join(stubBin, "gh"),
      `#!/usr/bin/env bash
set -euo pipefail
if [ "$#" -ge 2 ] && [ "$1" = "pr" ] && [ "$2" = "view" ]; then
  for ((i = 1; i <= $#; i++)); do
    if [ "\${!i}" = "--jq" ]; then
      printf '%s\\t%s' 'main' 'not-a-url'
      exit 0
    fi
  done
  printf '%s' '{"baseRefName":"main","url":"not-a-url"}'
  exit 0
fi
exit 1
`,
    )

    const result = await runCommand(["bash", resolveBaseScript], repoRoot, {
      ...gitEnv,
      PATH: `${stubBin}:${process.env.PATH ?? ""}`,
    })

    expect(result.stdout).toMatch(/^ERROR:/)
    expect(result.stdout).toContain("unparseable PR URL")
    expect(result.stdout).not.toContain(`BASE:${forkMainSha}`)
    expect(result.stdout).not.toMatch(/^BASE:/)
  })

  test("distinct bracketed-IPv6 hosts must not collide via host-without-port fallback", async () => {
    const repoRoot = await initRepo()
    await commitFile(repoRoot, "history.txt", "a\n", "initial")
    const wrongHostSha = await commitFile(repoRoot, "history.txt", "b\n", "wrong host main")

    await runGit(["checkout", "-b", "feature"], repoRoot)
    await commitFile(repoRoot, "feature.txt", "feature\n", "feature change")

    // Configure an ssh:// remote at a DIFFERENT bracketed-IPv6 host than the
    // PR URL. With Fix 2's new ssh/git host-without-port fallback, a naive
    // ${host%:*} derivation would collapse both [2001:db8::1] and
    // [2001:db8::2] to "[2001:db8:" and silently match the wrong remote.
    // Bracket-aware derive_host_without_port must preserve [...] intact when
    // there is no trailing :port outside the brackets, so the matcher rejects
    // this remote and the resolver fails closed.
    await runGit(
      ["remote", "add", "wronghost", "ssh://git@[2001:db8::2]/org/repo.git"],
      repoRoot,
    )
    await runGit(["update-ref", "refs/remotes/wronghost/main", wrongHostSha], repoRoot)

    const stubBin = await fs.mkdtemp(path.join(os.tmpdir(), "resolve-base-beta-bin-"))
    await writeExecutable(path.join(stubBin, "gh"), "#!/usr/bin/env bash\nexit 1\n")

    const result = await runCommand(
      [
        "bash",
        resolveBaseScript,
        "--pr-url",
        "https://[2001:db8::1]/org/repo/pull/1",
        "--pr-base-branch",
        "main",
      ],
      repoRoot,
      {
        ...gitEnv,
        PATH: `${stubBin}:${process.env.PATH ?? ""}`,
      },
    )

    expect(result.stdout).toMatch(/^ERROR:/)
    expect(result.stdout).toContain("does not match any configured git remote")
    expect(result.stdout).not.toContain(`BASE:${wrongHostSha}`)
    expect(result.stdout).not.toMatch(/^BASE:/)
  })

  test("ssh:// transport port differs from web UI port -> host-without-port fallback matches", async () => {
    const repoRoot = await initRepo()
    await commitFile(repoRoot, "history.txt", "a\n", "initial")
    const upstreamMainSha = await commitFile(repoRoot, "history.txt", "b\n", "main advance")

    await runGit(["checkout", "-b", "feature"], repoRoot)
    await commitFile(repoRoot, "feature.txt", "feature\n", "feature change")

    // Fix 2 invariant: ssh:// remote with transport port 2222 must match a
    // PR URL on web UI port 8443 via the host-without-port fallback (both
    // address the same host identity; the ports describe different services).
    await runGit(
      [
        "remote",
        "add",
        "upstream",
        "ssh://git@ghe.acme.com:2222/EveryInc/compound-engineering-plugin.git",
      ],
      repoRoot,
    )
    await runGit(["update-ref", "refs/remotes/upstream/main", upstreamMainSha], repoRoot)

    const stubBin = await fs.mkdtemp(path.join(os.tmpdir(), "resolve-base-beta-bin-"))
    await writeExecutable(path.join(stubBin, "gh"), "#!/usr/bin/env bash\nexit 1\n")

    const result = await runCommand(
      [
        "bash",
        resolveBaseScript,
        "--pr-url",
        "https://ghe.acme.com:8443/EveryInc/compound-engineering-plugin/pull/7",
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

  test("https remote with mismatched port must NOT use host-without-port fallback", async () => {
    const repoRoot = await initRepo()
    await commitFile(repoRoot, "history.txt", "a\n", "initial")
    const wrongPortSha = await commitFile(repoRoot, "history.txt", "b\n", "wrong port main")

    await runGit(["checkout", "-b", "feature"], repoRoot)
    await commitFile(repoRoot, "feature.txt", "feature\n", "feature change")

    // Fix 2 negative invariant: HTTPS-to-HTTPS port mismatch is a real
    // identity mismatch (different GHE instances on the same host), not a
    // transport-vs-web difference. The fallback must stay strict for
    // {https, http} so this remote is NOT matched against the :8443 PR URL.
    await runGit(
      ["remote", "add", "wrongport", "https://ghe.acme.com:9443/org/repo.git"],
      repoRoot,
    )
    await runGit(["update-ref", "refs/remotes/wrongport/main", wrongPortSha], repoRoot)

    const stubBin = await fs.mkdtemp(path.join(os.tmpdir(), "resolve-base-beta-bin-"))
    await writeExecutable(path.join(stubBin, "gh"), "#!/usr/bin/env bash\nexit 1\n")

    const result = await runCommand(
      [
        "bash",
        resolveBaseScript,
        "--pr-url",
        "https://ghe.acme.com:8443/org/repo/pull/1",
        "--pr-base-branch",
        "main",
      ],
      repoRoot,
      {
        ...gitEnv,
        PATH: `${stubBin}:${process.env.PATH ?? ""}`,
      },
    )

    expect(result.stdout).toMatch(/^ERROR:/)
    expect(result.stdout).toContain("does not match any configured git remote")
    expect(result.stdout).not.toContain(`BASE:${wrongPortSha}`)
    expect(result.stdout).not.toMatch(/^BASE:/)
  })

  test("two matching remotes: stderr in final error message must come from the named remote", async () => {
    const repoRoot = await initRepo()
    await commitFile(repoRoot, "history.txt", "a\n", "initial")
    const forkMainSha = await commitFile(repoRoot, "history.txt", "b\n", "fork main advance")

    await runGit(["checkout", "-b", "feature"], repoRoot)
    await commitFile(repoRoot, "feature.txt", "feature\n", "feature change")

    // Two remotes both parse to the same (host, owner/repo). First fetches
    // produce stderr from a file:// URL that doesn't exist; second points at
    // a different file:// URL with a recognizably different error message.
    // The script reports the LAST matched remote's name; its stderr field
    // must come from that same remote, not bleed from the first attempt.
    const firstBogusPath = path.join(
      os.tmpdir(),
      `nonexistent-FIRST-${Date.now()}-${Math.random().toString(36).slice(2)}.git`,
    )
    const secondBogusPath = path.join(
      os.tmpdir(),
      `nonexistent-SECOND-${Date.now()}-${Math.random().toString(36).slice(2)}.git`,
    )
    await runGit(
      ["remote", "add", "mirror-a", "https://github.com/EveryInc/compound-engineering-plugin.git"],
      repoRoot,
    )
    await runGit(["remote", "set-url", "mirror-a", `file://${firstBogusPath}`], repoRoot)
    await runGit(
      ["remote", "add", "mirror-b", "https://github.com/EveryInc/compound-engineering-plugin.git"],
      repoRoot,
    )
    await runGit(["remote", "set-url", "mirror-b", `file://${secondBogusPath}`], repoRoot)
    await runGit(["update-ref", "refs/remotes/mirror-a/main", forkMainSha], repoRoot)

    const stubBin = await fs.mkdtemp(path.join(os.tmpdir(), "resolve-base-beta-bin-"))
    await writeExecutable(path.join(stubBin, "gh"), "#!/usr/bin/env bash\nexit 1\n")

    const result = await runCommand(
      [
        "bash",
        resolveBaseScript,
        "--pr-url",
        "https://github.com/EveryInc/compound-engineering-plugin/pull/1",
        "--pr-base-branch",
        "main",
      ],
      repoRoot,
      {
        ...gitEnv,
        PATH: `${stubBin}:${process.env.PATH ?? ""}`,
      },
    )

    // Must fail closed
    expect(result.stdout).toMatch(/^ERROR:/)
    expect(result.stdout).not.toMatch(/^BASE:/)

    // Must NOT bleed an earlier remote's stderr into a different remote's
    // error message. If the stderr line mentions a path, it must be the
    // path of the remote that's named in the error.
    const errMatch = result.stdout.match(/Identified PR base remote '([^']+)'/)
    if (errMatch && result.stdout.includes("Last fetch stderr:")) {
      const namedRemote = errMatch[1]
      const expectedToken = namedRemote === "mirror-a" ? "FIRST" : "SECOND"
      const forbiddenToken = namedRemote === "mirror-a" ? "SECOND" : "FIRST"
      // The stderr should reference the remote actually named, not the other one.
      // Note: bogus paths are timestamped so they appear in git's stderr message.
      const stderrIndex = result.stdout.indexOf("Last fetch stderr:")
      const stderrTail = result.stdout.slice(stderrIndex)
      expect(stderrTail).not.toContain(forbiddenToken)
      expect(stderrTail).toContain(expectedToken)
    }
  })

  test("--pr-base-branch alone (without --pr-url or repo/host) fails closed", async () => {
    const repoRoot = await initRepo()
    await commitFile(repoRoot, "history.txt", "a\n", "initial")
    const forkMainSha = await commitFile(repoRoot, "history.txt", "b\n", "fork main advance")

    await runGit(["checkout", "-b", "feature"], repoRoot)
    await commitFile(repoRoot, "feature.txt", "feature\n", "feature change")

    // Fix 1: --pr-base-branch alone previously left PR_METADATA_PROVIDED=0
    // and fell through to legacy origin/main fallback, silently using fork
    // history if origin pointed at a fork.
    await runGit(["remote", "add", "origin", "https://github.com/someone/fork.git"], repoRoot)
    await runGit(["update-ref", "refs/remotes/origin/main", forkMainSha], repoRoot)

    const stubBin = await fs.mkdtemp(path.join(os.tmpdir(), "resolve-base-beta-bin-"))
    await writeExecutable(path.join(stubBin, "gh"), "#!/usr/bin/env bash\nexit 1\n")

    const result = await runCommand(
      ["bash", resolveBaseScript, "--pr-base-branch", "main"],
      repoRoot,
      {
        ...gitEnv,
        PATH: `${stubBin}:${process.env.PATH ?? ""}`,
      },
    )

    expect(result.stdout).toMatch(/^ERROR:/)
    expect(result.stdout).toContain("--pr-base-branch requires --pr-url")
    expect(result.stdout).not.toContain(`BASE:${forkMainSha}`)
    expect(result.stdout).not.toMatch(/^BASE:/)
  })

  test("try-all-matching-remotes: first matched remote fails, second resolves", async () => {
    const repoRoot = await initRepo()
    await commitFile(repoRoot, "history.txt", "a\n", "initial")
    const upstreamMainSha = await commitFile(repoRoot, "history.txt", "b\n", "main advance")

    await runGit(["checkout", "-b", "feature"], repoRoot)
    await commitFile(repoRoot, "feature.txt", "feature\n", "feature change")

    // Fix 4: two remotes match by (host, owner/repo). First has unreachable
    // URL so its fetch fails; second is locally pre-seeded with the branch.
    // The script must try the second after the first fails, not break early.
    const bogusPath = path.join(
      os.tmpdir(),
      `nonexistent-${Date.now()}-${Math.random().toString(36).slice(2)}.git`,
    )
    await runGit(
      ["remote", "add", "upstream-stale", "https://github.com/EveryInc/compound-engineering-plugin.git"],
      repoRoot,
    )
    await runGit(["remote", "set-url", "upstream-stale", `file://${bogusPath}`], repoRoot)
    await runGit(
      ["remote", "add", "upstream-good", "https://github.com/EveryInc/compound-engineering-plugin.git"],
      repoRoot,
    )
    await runGit(["update-ref", "refs/remotes/upstream-good/main", upstreamMainSha], repoRoot)

    const stubBin = await fs.mkdtemp(path.join(os.tmpdir(), "resolve-base-beta-bin-"))
    await writeExecutable(path.join(stubBin, "gh"), "#!/usr/bin/env bash\nexit 1\n")

    const result = await runCommand(
      [
        "bash",
        resolveBaseScript,
        "--pr-url",
        "https://github.com/EveryInc/compound-engineering-plugin/pull/1",
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
})
