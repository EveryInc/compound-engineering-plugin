import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs"
import { execFileSync } from "child_process"
import { tmpdir } from "os"
import path from "path"
import { describe, expect, test } from "bun:test"

const SKILL_PATH = path.join(
  process.cwd(),
  "plugins/compound-engineering/skills/ce-update/SKILL.md",
)
const SKILL_BODY = readFileSync(SKILL_PATH, "utf8")

describe("ce-update SKILL.md", () => {
  // Regression guard for https://github.com/EveryInc/compound-engineering-plugin/issues/556.
  //
  // `CLAUDE_PLUGIN_ROOT` points at the currently-loaded plugin version directory
  // (e.g. `~/.claude/plugins/cache/<marketplace>/compound-engineering/<version>`),
  // NOT the plugins cache root. Appending `/cache/<anything>/compound-engineering/`
  // produces a path that never exists, which caused the cache-probe to fail and
  // emit `__CE_UPDATE_CACHE_FAILED__` on every healthy install. Has regressed twice.
  test("does not append a /cache/<marketplace>/ suffix onto CLAUDE_PLUGIN_ROOT", () => {
    const antiPattern = /\$\{CLAUDE_PLUGIN_ROOT\}\/cache\//
    expect(
      antiPattern.test(SKILL_BODY),
      "ce-update/SKILL.md reintroduced the ${CLAUDE_PLUGIN_ROOT}/cache/... antipattern — derive the cache dir from dirname \"${CLAUDE_PLUGIN_ROOT}\" instead.",
    ).toBe(false)
  })

  // Regression guard: a previous fix extracted pre-resolution logic into
  // `!`bash "${CLAUDE_SKILL_DIR}/scripts/<name>.sh"`` commands. That cleared
  // Claude Code's safety check but tripped its *permission* check at
  // skill-load time, which does NOT honor `defaultMode: bypassPermissions`.
  // The reliable fix is to invoke scripts from the skill body via the
  // runtime Bash tool. Reintroducing any `!`bash <abs-path>`` pre-resolution
  // would re-break the skill at load time — this test catches that.
  test("does not use `!` pre-resolution to invoke bundled scripts", () => {
    const preResolutions = SKILL_BODY.match(/!`[^`\n]*bash\s+[^`\n]*\.sh[^`\n]*`/g)
    expect(
      preResolutions,
      `ce-update/SKILL.md must not use '!\`bash <path>.sh\`' pre-resolution — it hits Claude Code's load-time permission check, which does not honor 'defaultMode: bypassPermissions'. Move probes into the skill body via runtime Bash tool calls instead. Found: ${JSON.stringify(preResolutions)}`,
    ).toBeNull()
  })

  // The skill must reference each script in a runtime instruction so the
  // agent collects the values before applying decision logic. The form
  // `bash "${CLAUDE_SKILL_DIR}/scripts/<name>.sh"` (not bare relative paths)
  // is required because the runtime Bash tool runs from the user's project
  // CWD, not the skill directory — empirically, `bash scripts/<name>.sh`
  // failed with "No such file or directory" when the skill tried it. The
  // `${CLAUDE_SKILL_DIR}` env var Claude Code sets at runtime is the only
  // portable way to resolve to the skill's own scripts directory across both
  // marketplace-cached and `--plugin-dir` installs.
  test("instructs the agent to invoke each probe script with a CLAUDE_SKILL_DIR-prefixed path", () => {
    for (const script of ["upstream-version.sh", "currently-loaded-version.sh", "marketplace-name.sh"]) {
      expect(
        SKILL_BODY.includes(`bash "\${CLAUDE_SKILL_DIR}/scripts/${script}"`),
        `ce-update/SKILL.md must instruct the agent to run 'bash "\${CLAUDE_SKILL_DIR}/scripts/${script}"' — relative paths like 'bash scripts/${script}' fail at runtime because the Bash tool's CWD is the user's project, not the skill directory.`,
      ).toBe(true)
    }
  })

  // Regression guard: each probe is `bash <abs-path>` at runtime, which does
  // not match the user's typical allow rules (most have `Bash(bash -c:*)` at
  // most, not `Bash(bash:*)`). Without `allowed-tools` granting permission
  // for the specific scripts, users without `defaultMode: bypassPermissions`
  // get an approval prompt every time they run the skill. The patterns are
  // pinned to each script filename — `Bash(bash *)` would be too broad.
  test("declares narrow allowed-tools patterns for each probe script", () => {
    const frontmatter = SKILL_BODY.match(/^---\n([\s\S]*?)\n---/)
    expect(frontmatter, "ce-update/SKILL.md must have YAML frontmatter").not.toBeNull()
    const allowedTools = frontmatter![1].match(/^allowed-tools:\s*(.+)$/m)
    expect(
      allowedTools,
      "ce-update/SKILL.md must declare `allowed-tools:` for each probe script so users without bypassPermissions don't get a prompt every run.",
    ).not.toBeNull()
    const tools = allowedTools![1]
    for (const script of ["upstream-version.sh", "currently-loaded-version.sh", "marketplace-name.sh"]) {
      expect(
        tools.includes(`Bash(bash *${script})`),
        `ce-update/SKILL.md allowed-tools must include 'Bash(bash *${script})' so the runtime Bash call passes the permission check without granting blanket Bash access (got: ${tools})`,
      ).toBe(true)
    }
    expect(
      /Bash\(bash \*\)/.test(tools),
      `ce-update/SKILL.md allowed-tools must NOT use the broad 'Bash(bash *)' pattern — pin to each script filename instead (got: ${tools})`,
    ).toBe(false)
  })
})

// Regression guard for the runtime probe scripts that derive their own
// location from BASH_SOURCE rather than reading `${CLAUDE_SKILL_DIR}` from
// the environment. CLAUDE_SKILL_DIR is documented as a SKILL.md content
// substitution, not a guaranteed environment variable for Bash tool
// subprocesses; if the scripts read the env var directly and Claude Code
// doesn't export it, they always emit `__CE_UPDATE_NOT_MARKETPLACE__` and
// the skill never performs version comparison even on real marketplace
// installs.
//
// These tests run each script copied into a fake marketplace-shaped path,
// with CLAUDE_SKILL_DIR explicitly cleared from the environment, and assert
// that the script extracts the correct version/marketplace segment from its
// own location.
describe("ce-update probe scripts are self-locating", () => {
  function runFromFakeMarketplace(scriptName: string, marketplaceName: string, version: string): string {
    const root = mkdtempSync(path.join(tmpdir(), "ce-update-fake-marketplace-"))
    try {
      const skillDir = path.join(root, ".claude/plugins/cache", marketplaceName, "compound-engineering", version, "skills/ce-update")
      mkdirSync(path.join(skillDir, "scripts"), { recursive: true })
      const sourceScript = path.join(path.dirname(SKILL_PATH), "scripts", scriptName)
      const targetScript = path.join(skillDir, "scripts", scriptName)
      copyFileSync(sourceScript, targetScript)
      chmodSync(targetScript, 0o755)
      const env = { ...process.env }
      delete env.CLAUDE_SKILL_DIR
      return execFileSync("bash", [targetScript], { env, encoding: "utf8" }).trim()
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }

  test("currently-loaded-version.sh extracts version from BASH_SOURCE path without CLAUDE_SKILL_DIR", () => {
    expect(runFromFakeMarketplace("currently-loaded-version.sh", "some-marketplace", "9.9.9")).toBe("9.9.9")
  })

  test("marketplace-name.sh extracts marketplace from BASH_SOURCE path without CLAUDE_SKILL_DIR", () => {
    expect(runFromFakeMarketplace("marketplace-name.sh", "some-marketplace", "9.9.9")).toBe("some-marketplace")
  })
})

// Regression guard for https://github.com/EveryInc/compound-engineering-plugin/issues/659.
//
// The marketplace installs plugin contents from `main` HEAD, so the cache
// folder basename reflects `plugin.json` at install time — not any release tag.
// Comparing the installed folder against the latest GitHub release tag caused
// a persistent false-positive "Out of date" whenever `main` was ahead of the
// last tag (the normal state between releases), and the prescribed fix
// (`claude plugin update ...`) reinstalled the same version, looping forever.
//
// Rather than grep-testing the script body, this suite executes
// `scripts/upstream-version.sh` against a mocked `gh` that returns
// distinguishable values for `gh api` vs `gh release list`. The script must
// report the version from `plugin.json`, not from release tags.
describe("ce-update upstream-version.sh script", () => {
  const UPSTREAM_SCRIPT = path.join(path.dirname(SKILL_PATH), "scripts/upstream-version.sh")

  test("returns the version from main's plugin.json, not any release tag", () => {
    // Chosen so a tag-based fallback would produce a clearly different value
    // than the plugin.json-based read. Either 1.0.0 or an empty/sentinel
    // output indicates the script is reading the wrong source.
    const pluginJsonVersion = "99.0.0"
    const releaseTagVersion = "1.0.0"

    const stdout = runUpstreamScript(UPSTREAM_SCRIPT, {
      pluginJsonVersion,
      releaseTagVersion,
    })

    expect(stdout).toBe(pluginJsonVersion)
  })

  test("emits __CE_UPDATE_VERSION_FAILED__ when upstream plugin.json cannot be read", () => {
    // Simulates gh failing entirely (missing auth, offline, rate-limited).
    // The fallback must produce the sentinel so the skill's decision logic
    // can stop rather than silently compare against an empty string — a
    // pipeline-style `|| echo` only catches last-stage failures, and jq on
    // empty input exits 0 with no output.
    const stdout = runUpstreamScript(UPSTREAM_SCRIPT, {
      ghExitCode: 1,
    })
    expect(stdout).toContain("__CE_UPDATE_VERSION_FAILED__")
  })
})

type MockOptions = {
  pluginJsonVersion?: string
  releaseTagVersion?: string
  ghExitCode?: number
}

/**
 * Run the upstream-version.sh script with a mocked `gh` on PATH. The mock
 * emits distinct payloads for `gh api` vs `gh release list` so the test can
 * prove which source the script actually reads from.
 */
function runUpstreamScript(scriptPath: string, options: MockOptions): string {
  const { pluginJsonVersion, releaseTagVersion, ghExitCode } = options
  const mockDir = mkdtempSync(path.join(tmpdir(), "ce-update-gh-"))
  try {
    const pluginJsonB64 = pluginJsonVersion
      ? Buffer.from(
          JSON.stringify({ name: "compound-engineering", version: pluginJsonVersion }),
        ).toString("base64")
      : ""
    const releaseJson = releaseTagVersion
      ? JSON.stringify([{ tagName: `compound-engineering-v${releaseTagVersion}` }])
      : "[]"

    // Emulate gh's behaviour without requiring host `jq`: real `gh --jq` uses
    // gojq embedded in the binary, so neither the script nor this mock needs
    // an external jq on PATH. When the script asks a `--jq` filter that
    // extracts `.version`, we emit the pre-computed plugin.json version; when
    // it asks for `.tagName`, we emit the pre-computed release tag. Any other
    // filter is unexpected and the mock fails loudly so the test doesn't pass
    // by accident.
    const ghScript = `#!/bin/bash
${ghExitCode !== undefined ? `exit ${ghExitCode}` : `
subcommand="$1"; shift
jq_filter=""
while [ $# -gt 0 ]; do
  case "$1" in
    --jq) jq_filter="$2"; shift 2 ;;
    *) shift ;;
  esac
done
case "$subcommand" in
  api)
    case "$jq_filter" in
      *'.version'*) printf '%s\\n' '${pluginJsonVersion ?? ""}' ;;
      '') printf '%s\\n' '{"content":"${pluginJsonB64}"}' ;;
      *) echo "unexpected --jq filter for gh api: $jq_filter" >&2; exit 2 ;;
    esac
    ;;
  release)
    # If the script ever falls back to release-tag lookup, this is what it gets.
    case "$jq_filter" in
      *'tagName'*) printf '%s\\n' '${releaseTagVersion ?? ""}' ;;
      '') printf '%s\\n' '${releaseJson}' ;;
      *) echo "unexpected --jq filter for gh release: $jq_filter" >&2; exit 2 ;;
    esac
    ;;
  *) exit 1 ;;
esac
`}`
    const ghPath = path.join(mockDir, "gh")
    writeFileSync(ghPath, ghScript)
    chmodSync(ghPath, 0o755)

    return execFileSync("bash", [scriptPath], {
      env: {
        ...process.env,
        PATH: `${mockDir}:${process.env.PATH ?? ""}`,
      },
      encoding: "utf8",
    }).trim()
  } finally {
    rmSync(mockDir, { recursive: true, force: true })
  }
}
