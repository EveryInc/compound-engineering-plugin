import { describe, expect, test } from "bun:test"
import { promises as fs } from "fs"
import os from "os"
import path from "path"

// Behavioral tests for the smoke-probe timeout strategy in trust-check-codex.sh.
//
// The script targets environments where the GNU `timeout` binary is not
// guaranteed to exist (notably default macOS). It must fall back through a
// portable chain (timeout -> gtimeout -> perl) and emit a clear ERROR with
// guidance when none of the three are available, rather than silently
// rejecting an otherwise-valid Codex binary.

const trustScript = path.join(
  import.meta.dir,
  "..",
  "plugins",
  "compound-engineering",
  "skills",
  "ce-code-review-beta",
  "scripts",
  "trust-check-codex.sh",
)

// Minimal POSIX tools the script needs to function at all. These are
// symlinked into a stub PATH so we can selectively expose or hide the
// timeout-chain tools (timeout, gtimeout, perl) for fallback testing.
const MINIMAL_TOOLS = [
  "bash",
  "sh",
  "mktemp",
  "chmod",
  "stat",
  "dirname",
  "basename",
  "env",
  "rm",
  "cat",
  "tr",
  "sleep",
  "kill",
  "test",
  "[",
]

async function firstExistingPath(candidates: string[]): Promise<string | null> {
  for (const c of candidates) {
    try {
      await fs.access(c, fs.constants.X_OK)
      return c
    } catch {
      // try next
    }
  }
  return null
}

async function createPathStub(extras: string[]): Promise<string> {
  const stub = await fs.mkdtemp(path.join(os.tmpdir(), "trust-check-stub-"))
  for (const tool of [...MINIMAL_TOOLS, ...extras]) {
    const candidates = [
      `/usr/bin/${tool}`,
      `/bin/${tool}`,
      `/opt/homebrew/bin/${tool}`,
      `/usr/local/bin/${tool}`,
      `/usr/sbin/${tool}`,
      `/sbin/${tool}`,
    ]
    const found = await firstExistingPath(candidates)
    if (found) {
      // Use symlink to the actual binary so it executes normally.
      await fs.symlink(found, path.join(stub, tool)).catch(() => {})
    }
  }
  return stub
}

async function writeExecutable(filePath: string, content: string): Promise<void> {
  await fs.writeFile(filePath, content)
  await fs.chmod(filePath, 0o755)
}

type RunResult = {
  exitCode: number
  stdout: string
  stderr: string
  elapsedMs: number
}

async function runTrustCheck(
  codexBin: string,
  repoRoot: string,
  scratchDir: string,
  env: NodeJS.ProcessEnv,
): Promise<RunResult> {
  const start = performance.now()
  const proc = Bun.spawn(["bash", trustScript, codexBin, repoRoot, scratchDir], {
    env,
    stderr: "pipe",
    stdout: "pipe",
  })
  const [exitCode, stdout, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])
  const elapsedMs = performance.now() - start
  return { exitCode, stdout, stderr, elapsedMs }
}

async function setupSandbox(): Promise<{
  codexBin: string
  repoRoot: string
  scratchDir: string
}> {
  const sandbox = await fs.mkdtemp(path.join(os.tmpdir(), "trust-check-sandbox-"))
  const repoRoot = path.join(sandbox, "repo")
  const scratchDir = path.join(sandbox, "scratch")
  const codexDir = path.join(sandbox, "codex-install")
  await fs.mkdir(repoRoot)
  await fs.mkdir(scratchDir)
  await fs.mkdir(codexDir)
  return {
    codexBin: path.join(codexDir, "codex"),
    repoRoot,
    scratchDir,
  }
}

// Fake codex that returns --version output immediately.
const FAST_CODEX = `#!/usr/bin/env bash
if [ "\${1:-}" = "--version" ]; then
  echo "codex 0.0.0-fake"
  exit 0
fi
exit 0
`

// Fake codex that sleeps long enough to trigger the probe timeout.
const SLOW_CODEX = `#!/usr/bin/env bash
sleep 30
exit 0
`

describe("trust-check-codex.sh — portable timeout strategy", () => {
  test("timeout binary available -> TRUSTED (baseline path)", async () => {
    const timeoutBin = await firstExistingPath([
      "/usr/bin/timeout",
      "/opt/homebrew/bin/timeout",
      "/usr/local/bin/timeout",
    ])
    if (!timeoutBin) {
      // No timeout binary on this host; nothing to test for this branch.
      return
    }
    const stub = await createPathStub([])
    await fs.symlink(timeoutBin, path.join(stub, "timeout"))

    const { codexBin, repoRoot, scratchDir } = await setupSandbox()
    await writeExecutable(codexBin, FAST_CODEX)

    const result = await runTrustCheck(codexBin, repoRoot, scratchDir, {
      PATH: stub,
    })
    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toMatch(/^TRUSTED:/)
  })

  test("gtimeout-only available -> TRUSTED (macOS homebrew fallback)", async () => {
    const gtimeoutBin = await firstExistingPath([
      "/opt/homebrew/bin/gtimeout",
      "/usr/local/bin/gtimeout",
      "/usr/bin/gtimeout",
    ])
    if (!gtimeoutBin) {
      // No gtimeout on this host; skip — Linux CI without coreutils package.
      return
    }
    const stub = await createPathStub([])
    await fs.symlink(gtimeoutBin, path.join(stub, "gtimeout"))

    const { codexBin, repoRoot, scratchDir } = await setupSandbox()
    await writeExecutable(codexBin, FAST_CODEX)

    const result = await runTrustCheck(codexBin, repoRoot, scratchDir, {
      PATH: stub,
    })
    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toMatch(/^TRUSTED:/)
  })

  test("perl-only available, fast codex -> TRUSTED (default-macOS scenario Codex flagged)", async () => {
    const perlBin = await firstExistingPath([
      "/usr/bin/perl",
      "/opt/homebrew/bin/perl",
      "/usr/local/bin/perl",
    ])
    if (!perlBin) {
      // Bare Alpine without perl; not the failure mode Codex flagged.
      return
    }
    const stub = await createPathStub([])
    await fs.symlink(perlBin, path.join(stub, "perl"))

    const { codexBin, repoRoot, scratchDir } = await setupSandbox()
    await writeExecutable(codexBin, FAST_CODEX)

    const result = await runTrustCheck(codexBin, repoRoot, scratchDir, {
      PATH: stub,
    })
    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toMatch(/^TRUSTED:/)
  })

  test(
    "perl-only, slow codex -> ERROR within bounded time (timeout enforced via perl alarm)",
    async () => {
      const perlBin = await firstExistingPath([
        "/usr/bin/perl",
        "/opt/homebrew/bin/perl",
        "/usr/local/bin/perl",
      ])
      if (!perlBin) {
        return
      }
      const stub = await createPathStub([])
      await fs.symlink(perlBin, path.join(stub, "perl"))

      const { codexBin, repoRoot, scratchDir } = await setupSandbox()
      await writeExecutable(codexBin, SLOW_CODEX)

      const result = await runTrustCheck(codexBin, repoRoot, scratchDir, {
        PATH: stub,
        CE_PROBE_TIMEOUT_SECS: "1",
      })
      expect(result.stdout).toMatch(/^ERROR:/)
      // CE_PROBE_TIMEOUT_SECS=1 should bound the probe to ~1s plus fork/exec
      // overhead. Assert clearly below the current code's hard-coded 10s,
      // and below SLOW_CODEX's 30s sleep, so a regression to the old
      // behavior or to no-timeout-at-all is caught.
      expect(result.elapsedMs).toBeLessThan(5_000)
    },
    20_000,
  )

  test("no timeout/gtimeout/perl available -> ERROR mentions all three and exits", async () => {
    const stub = await createPathStub([])
    // Sanity-check: stub PATH must not expose any of the three.
    for (const tool of ["timeout", "gtimeout", "perl"]) {
      const exists = await fs
        .stat(path.join(stub, tool))
        .then(() => true)
        .catch(() => false)
      expect(exists).toBe(false)
    }

    const { codexBin, repoRoot, scratchDir } = await setupSandbox()
    await writeExecutable(codexBin, FAST_CODEX)

    const result = await runTrustCheck(codexBin, repoRoot, scratchDir, {
      PATH: stub,
    })
    expect(result.stdout).toMatch(/^ERROR:/)
    expect(result.stdout).toContain("timeout")
    expect(result.stdout).toContain("gtimeout")
    expect(result.stdout).toContain("perl")
    expect(result.stdout).not.toMatch(/^TRUSTED:/)
  })
})
