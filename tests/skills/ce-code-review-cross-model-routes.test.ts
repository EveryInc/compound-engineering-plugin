import { afterAll, describe, expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  symlinkSync,
  chmodSync,
  readdirSync,
  existsSync,
  rmSync,
} from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

const tempRoots: string[] = []
function mkTempRoot(prefix: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), prefix))
  tempRoots.push(dir)
  return dir
}
afterAll(() => {
  for (const dir of tempRoots) rmSync(dir, { recursive: true, force: true })
})

const REAL_TOOLS = [
  "bash", "sh", "jq", "python3", "date", "sed", "tr", "cat", "wc", "awk",
  "dirname", "basename", "mktemp", "env", "perl", "timeout", "gtimeout", "sleep", "rm",
  "mv", "chmod", "cp", "printf", "kill", "mkdir", "git",
]
let resolvedTools: Array<[string, string]> | null = null
function realToolPaths(): Array<[string, string]> {
  if (resolvedTools) return resolvedTools
  resolvedTools = []
  for (const tool of REAL_TOOLS) {
    const real = spawnSync("command", ["-v", tool], {
      encoding: "utf8",
      shell: "/bin/bash",
    }).stdout?.trim()
    if (real && existsSync(real)) resolvedTools.push([tool, real])
  }
  return resolvedTools
}

const SCRIPT = path.join(
  __dirname,
  "../../skills/ce-code-review/scripts/cross-model-adversarial-review.sh",
)
const DOC_SCRIPT = path.join(
  __dirname,
  "../../skills/ce-doc-review/scripts/cross-model-doc-review.sh",
)

const ROUTES = ["codex", "claude", "grok-cli", "grok-cursor", "composer"] as const

const NEVER_FLAGS = [
  "--yolo",
  "--force",
  "-f",
  "--always-approve",
  "--dangerously-skip-permissions",
]

function emitAdapter(route: string, script = SCRIPT): string {
  const r = spawnSync("bash", [script, "--emit-adapter", route], {
    encoding: "utf8",
  })
  expect(r.status).toBe(0)
  return (r.stdout ?? "").trim()
}

function sandbox(
  providers: string[],
  stubBody = "#!/bin/sh\nexit 0\n",
): { bin: string; env: NodeJS.ProcessEnv } {
  const bin = path.join(mkTempRoot("xmodel-cr-sandbox-"), "bin")
  mkdirSync(bin, { recursive: true })
  for (const [tool, real] of realToolPaths()) {
    if (existsSync(path.join(bin, tool))) continue
    try {
      symlinkSync(real, path.join(bin, tool))
    } catch {
      /* builtin — harmless */
    }
  }
  for (const p of providers) {
    const f = path.join(bin, p)
    writeFileSync(f, stubBody)
    chmodSync(f, 0o755)
  }
  return { bin, env: { ...process.env, PATH: bin } }
}

function makeRunDir(): string {
  return mkTempRoot("xmodel-cr-run-")
}

/** Run the script and return exit code, stdout, stderr, and run-dir file list. */
function run(
  args: string[],
  runDir: string,
  env: NodeJS.ProcessEnv = process.env,
) {
  const r = spawnSync("bash", [SCRIPT, ...args], {
    encoding: "utf8",
    env,
    cwd: path.join(__dirname, "../.."), // repo root — script needs git
  })
  return {
    code: r.status ?? -1,
    stdout: r.stdout ?? "",
    stderr: r.stderr ?? "",
    files: existsSync(runDir) ? readdirSync(runDir) : [],
  }
}

function resolvePeers(
  host: string,
  candidates: string,
  installed: string[],
  extraEnv: Record<string, string> = {},
): string {
  const { env } = sandbox(installed)
  const runDir = makeRunDir()
  const r = run(
    [host, candidates, "HEAD", runDir],
    runDir,
    { ...env, CROSS_MODEL_DRY_RUN: "1", ...extraEnv },
  )
  const m = r.stdout.match(/RESOLVED_PEERS:\s*(.*)/)
  return m ? m[1].trim() : ""
}

describe("cross-model-adversarial-review route safety", () => {
  test("every route carries read-only / no-prompt / least-privilege flags and no NEVER-use flag", () => {
    for (const route of ROUTES) {
      const cmd = emitAdapter(route)
      const tokens = cmd.split(/\s+/)
      for (const bad of NEVER_FLAGS) {
        expect(tokens).not.toContain(bad)
      }
      expect(cmd).not.toContain("bypassPermissions")
    }
  })

  test("codex: read-only sandbox + skip-git-repo-check + high reasoning + repo-root cwd", () => {
    const cmd = emitAdapter("codex")
    expect(cmd).toContain("-s read-only")
    expect(cmd).toContain("--skip-git-repo-check")
    expect(cmd).toContain('model_reasoning_effort="high"')
    expect(cmd).toContain("gpt-5.6-sol")
    expect(cmd).toContain("-C <repo-root>")
  })

  test("claude: dontAsk + deny mutators/Bash/Task/MCP/web/Skill + effort high; Read NOT denied", () => {
    const cmd = emitAdapter("claude")
    expect(cmd).toContain("--permission-mode dontAsk")
    expect(cmd).toContain("--disallowedTools")
    expect(cmd).toContain("Edit")
    expect(cmd).toContain("Write")
    expect(cmd).toContain("Bash")
    expect(cmd).toContain("Task")
    expect(cmd).toContain("WebFetch")
    expect(cmd).toContain("WebSearch")
    expect(cmd).toContain("Skill")
    expect(cmd).toContain("--effort high")
    expect(cmd).toContain("--model opus")
    // In-tree review: Read must remain available (unlike doc-review's --tools "").
    expect(cmd).not.toContain("--tools")
    expect(cmd).not.toContain("--bare")
  })

  test("grok CLI: deny writes/shell/web; Read NOT denied; effort high; repo cwd", () => {
    const cmd = emitAdapter("grok-cli")
    expect(cmd).toContain("--deny Edit")
    expect(cmd).toContain("--deny Write")
    expect(cmd).toContain("--deny Bash")
    expect(cmd).toContain("--disable-web-search")
    expect(cmd).toContain("--no-subagents")
    expect(cmd).toContain("--permission-mode dontAsk")
    expect(cmd).toContain("--effort high")
    expect(cmd).toContain("--model grok-4.5")
    expect(cmd).toContain("--cwd <repo-root>")
    expect(cmd).not.toContain("--deny Read")
  })

  test("cursor-agent routes: ask mode + sandbox + repo workspace", () => {
    for (const route of ["grok-cursor", "composer"]) {
      const cmd = emitAdapter(route)
      expect(cmd).toContain("--mode ask")
      expect(cmd).toContain("--trust")
      expect(cmd).toContain("--sandbox enabled")
      expect(cmd).toContain("--workspace <repo-root>")
    }
    expect(emitAdapter("grok-cursor")).toContain("grok-4.5-high")
    expect(emitAdapter("composer")).toContain("composer-2.5-fast")
  })

  test("adapters target repo-root, not shared run-dir fold-in path", () => {
    expect(emitAdapter("codex")).toContain("-C <repo-root>")
    expect(emitAdapter("grok-cli")).toContain("--cwd <repo-root>")
    for (const route of ["grok-cursor", "composer"]) {
      expect(emitAdapter(route)).toContain("--workspace <repo-root>")
    }
    for (const route of ROUTES) {
      expect(emitAdapter(route)).not.toContain("<run-dir>")
    }
  })
})

describe("cross-model-adversarial-review provider selection", () => {
  test("default order excludes the host and picks the first available peer", () => {
    const all = ["codex", "claude", "grok", "cursor-agent"]
    expect(resolvePeers("claude", "codex,claude,grok,composer", all)).toBe("codex")
    expect(resolvePeers("codex", "codex,claude,grok,composer", all)).toBe("claude")
    expect(resolvePeers("composer", "codex,claude,grok,composer", all)).toBe("codex")
  })

  test("a front-loaded preference overrides the default order", () => {
    const all = ["codex", "claude", "grok", "cursor-agent"]
    expect(resolvePeers("claude", "grok,codex,claude,composer", all)).toBe("grok")
  })

  test("CROSS_MODEL_MAX_PEERS=2 resolves two different providers", () => {
    const all = ["codex", "claude", "grok", "cursor-agent"]
    expect(
      resolvePeers("claude", "codex,claude,grok,composer", all, {
        CROSS_MODEL_MAX_PEERS: "2",
      }),
    ).toBe("codex grok")
  })

  test("CROSS_MODEL_PEERS allowlist restricts selection", () => {
    const all = ["codex", "claude", "grok", "cursor-agent"]
    expect(
      resolvePeers("claude", "codex,claude,grok,composer", all, {
        CROSS_MODEL_PEERS: "grok",
      }),
    ).toBe("grok")
  })

  test("grok is available via cursor-agent alone (grok CLI absent)", () => {
    expect(resolvePeers("claude", "grok,composer", ["cursor-agent"])).toBe("grok")
  })

  test("an uninstalled provider is skipped for the next available one", () => {
    expect(
      resolvePeers("claude", "codex,claude,grok,composer", ["claude", "grok", "cursor-agent"]),
    ).toBe("grok")
  })

  test("grok-only allowlist does NOT egress through cursor-agent when the grok CLI is absent", () => {
    expect(
      resolvePeers("claude", "grok,composer", ["cursor-agent"], {
        CROSS_MODEL_PEERS: "grok",
      }),
    ).toBe("")
  })

  test("explicit composer allowance re-enables the grok->cursor-agent route", () => {
    expect(
      resolvePeers("claude", "grok,composer", ["cursor-agent"], {
        CROSS_MODEL_PEERS: "grok,composer",
      }),
    ).toBe("grok")
  })
})

describe("cross-model-adversarial-review skip paths — non-blocking, no file", () => {
  const cases: Array<[string, string[], Record<string, string>]> = [
    ["un-attestable host (empty)", ["", "codex,claude"], {}],
    ["un-attestable host (unknown)", ["unknown", "codex,claude"], {}],
    ["MAX_PEERS=0 disables the pass", ["claude", "codex"], { CROSS_MODEL_MAX_PEERS: "0" }],
    ["host is the only candidate", ["codex", "codex"], {}],
  ]
  for (const [name, prefix, extraEnv] of cases) {
    test(name, () => {
      const { env } = sandbox(["codex", "claude", "grok", "cursor-agent"])
      const runDir = makeRunDir()
      const r = run([...prefix, "HEAD", runDir], runDir, { ...env, ...extraEnv })
      expect(r.code).toBe(0)
      expect(r.files).toHaveLength(0)
    })
  }

  test("missing base ref and missing run-dir both skip cleanly", () => {
    const { env } = sandbox(["codex", "claude"])
    const runDir = makeRunDir()
    expect(run(["claude", "codex", "", runDir], runDir, env).code).toBe(0)
    expect(run(["claude", "codex", "HEAD", "/no/such/run-dir"], runDir, env).files).toHaveLength(0)
  })
})

describe("cross-model-adversarial-review normalization", () => {
  const claudeStub =
    `#!/bin/sh\ncat >/dev/null\nprintf '%s' '{"structured_output":{"reviewer":"adversarial","findings":[{"title":"t","file":"a.ts","line":1}]}}'\n`

  test("forces reviewer to adversarial-<provider> and backfills testing_gaps", () => {
    const { env } = sandbox(["claude"], claudeStub)
    const runDir = makeRunDir()
    const r = run(["codex", "claude", "HEAD", runDir], runDir, env)
    expect(r.code).toBe(0)
    expect(r.files).toContain("adversarial-claude.json")
    const out = JSON.parse(
      readFileSync(path.join(runDir, "adversarial-claude.json"), "utf8"),
    )
    expect(out.reviewer).toBe("adversarial-claude")
    expect(out.residual_risks).toEqual([])
    expect(out.testing_gaps).toEqual([])
    expect(Array.isArray(out.findings)).toBe(true)
    expect(out.cross_model_route).toBe("claude")
  })

  test("drops the return when findings is not an array", () => {
    const badStub =
      `#!/bin/sh\ncat >/dev/null\nprintf '%s' '{"structured_output":{"reviewer":"adversarial","findings":"oops"}}'\n`
    const { env } = sandbox(["claude"], badStub)
    const runDir = makeRunDir()
    const r = run(["codex", "claude", "HEAD", runDir], runDir, env)
    expect(r.code).toBe(0)
    expect(r.files).toHaveLength(0)
  })

  test("downgrades a peer safe_auto finding to gated_auto", () => {
    const stub =
      `#!/bin/sh\ncat >/dev/null\nprintf '%s' '{"structured_output":{"reviewer":"adversarial","findings":[{"title":"t","autofix_class":"safe_auto","confidence":100}]}}'\n`
    const { env } = sandbox(["claude"], stub)
    const runDir = makeRunDir()
    run(["codex", "claude", "HEAD", runDir], runDir, env)
    const out = JSON.parse(
      readFileSync(path.join(runDir, "adversarial-claude.json"), "utf8"),
    )
    expect(out.findings[0].autofix_class).toBe("gated_auto")
    expect(out.findings[0].confidence).toBe(100)
    expect(readdirSync(runDir).filter((f) => f.endsWith(".raw.json"))).toEqual([])
  })
})

describe("cross-model-adversarial-review run-loop failover", () => {
  const okStub =
    `#!/bin/sh\ncat >/dev/null\nprintf '%s' '{"structured_output":{"reviewer":"adversarial","findings":[{"title":"t"}]}}'\n`
  const failStub = `#!/bin/sh\ncat >/dev/null 2>&1\nexit 1\n`

  test("falls through an installed-but-failing provider to the next reachable one", () => {
    const { bin, env } = sandbox(["claude", "grok"])
    writeFileSync(path.join(bin, "claude"), failStub)
    chmodSync(path.join(bin, "claude"), 0o755)
    writeFileSync(path.join(bin, "grok"), okStub)
    chmodSync(path.join(bin, "grok"), 0o755)
    const runDir = makeRunDir()
    const r = run(["codex", "claude,grok", "HEAD", runDir], runDir, env)
    expect(r.code).toBe(0)
    expect(r.files).toContain("adversarial-grok.json")
    expect(r.files).not.toContain("adversarial-claude.json")
  })

  test("falls through when primary returns valid JSON without a findings array", () => {
    // out_missing_or_invalid must require findings-shaped output — bare JSON must
    // not block classified-failure fallback to the next route/provider.
    const bareJsonStub =
      `#!/bin/sh\ncat >/dev/null\nprintf '%s' '{"structured_output":{"reviewer":"adversarial","ok":true}}'\n`
    const okStub =
      `#!/bin/sh\ncat >/dev/null\nprintf '%s' '{"structured_output":{"reviewer":"adversarial","findings":[{"title":"t"}]}}'\n`
    const { bin, env } = sandbox(["claude", "grok"])
    writeFileSync(path.join(bin, "claude"), bareJsonStub)
    chmodSync(path.join(bin, "claude"), 0o755)
    writeFileSync(path.join(bin, "grok"), okStub)
    chmodSync(path.join(bin, "grok"), 0o755)
    const runDir = makeRunDir()
    const r = run(["codex", "claude,grok", "HEAD", runDir], runDir, env)
    expect(r.code).toBe(0)
    expect(r.files).toContain("adversarial-grok.json")
    expect(r.files).not.toContain("adversarial-claude.json")
  })

  test("records the grok-cursor route when the grok CLI fails and cursor-agent succeeds", () => {
    const { bin, env } = sandbox(["grok", "cursor-agent"])
    writeFileSync(path.join(bin, "grok"), failStub)
    chmodSync(path.join(bin, "grok"), 0o755)
    writeFileSync(path.join(bin, "cursor-agent"), okStub)
    chmodSync(path.join(bin, "cursor-agent"), 0o755)
    const runDir = makeRunDir()
    const r = run(["codex", "grok", "HEAD", runDir], runDir, env)
    expect(r.code).toBe(0)
    expect(r.files).toContain("adversarial-grok.json")
    const out = JSON.parse(readFileSync(path.join(runDir, "adversarial-grok.json"), "utf8"))
    expect(out.cross_model_route).toBe("grok-cursor")
  })
})

describe("cross-model provider kernel parity (code-review vs doc-review)", () => {
  test("model IDs match across both skills' --emit-adapter output", () => {
    expect(emitAdapter("codex")).toContain("gpt-5.6-sol")
    expect(emitAdapter("codex", DOC_SCRIPT)).toContain("gpt-5.6-sol")
    expect(emitAdapter("claude")).toContain("--model opus")
    expect(emitAdapter("claude", DOC_SCRIPT)).toContain("--model opus")
    expect(emitAdapter("grok-cli")).toContain("grok-4.5")
    expect(emitAdapter("grok-cli", DOC_SCRIPT)).toContain("grok-4.5")
    expect(emitAdapter("grok-cursor")).toContain("grok-4.5-high")
    expect(emitAdapter("grok-cursor", DOC_SCRIPT)).toContain("grok-4.5-high")
    expect(emitAdapter("composer")).toContain("composer-2.5-fast")
    expect(emitAdapter("composer", DOC_SCRIPT)).toContain("composer-2.5-fast")
  })

  test("NEVER flags are absent from both skills' adapters", () => {
    for (const script of [SCRIPT, DOC_SCRIPT]) {
      for (const route of ROUTES) {
        const cmd = emitAdapter(route, script)
        for (const bad of NEVER_FLAGS) {
          expect(cmd.split(/\s+/)).not.toContain(bad)
        }
        expect(cmd).not.toContain("bypassPermissions")
      }
    }
  })
})

describe("cross-model-adversarial-review argv integrity", () => {
  test("passes the pretty-printed schema as ONE --json-schema argument", () => {
    const capRoot = mkTempRoot("xmodel-cr-cap-")
    const capFile = path.join(capRoot, "schema-arg.txt")
    const recordStub =
      `#!/bin/sh\ncat >/dev/null\nprev=\nfor a in "$@"; do if [ "$prev" = "--json-schema" ]; then printf '%s' "$a" > "$SCHEMA_CAPTURE"; fi; prev="$a"; done\nprintf '%s' '{"structured_output":{"reviewer":"adversarial","findings":[]}}'\n`
    const { env } = sandbox(["claude"], recordStub)
    const runDir = makeRunDir()
    run(["codex", "claude", "HEAD", runDir], runDir, {
      ...env,
      SCHEMA_CAPTURE: capFile,
    })
    const captured = readFileSync(capFile, "utf8")
    expect(captured).toContain('"$schema"')
    expect(captured).toContain("testing_gaps")
  })

  test("cursor-agent routes receive the prompt via stdin", () => {
    const capRoot = mkTempRoot("xmodel-cr-cap-")
    const capFile = path.join(capRoot, "cursor-stdin.txt")
    const recordStub =
      `#!/bin/sh\ncat > "$PROMPT_CAPTURE"\nprintf '%s' '{"structured_output":{"reviewer":"adversarial","findings":[]}}'\n`
    const { env } = sandbox(["cursor-agent"], recordStub)
    const runDir = makeRunDir()
    const r = run(["claude", "composer", "HEAD", runDir], runDir, {
      ...env,
      PROMPT_CAPTURE: capFile,
    })
    expect(r.files).toContain("adversarial-composer.json")
    const prompt = readFileSync(capFile, "utf8")
    expect(prompt).toContain("adversarial")
    expect(prompt).toMatch(/BEGIN DIFF [0-9a-f]+/)
    expect(prompt).toMatch(/END DIFF [0-9a-f]+/)
    expect(prompt).toContain("untrusted diff data")
  })
})
