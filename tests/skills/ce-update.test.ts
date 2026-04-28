import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs"
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
  // We tried allow-listing the scripts via `allowed-tools` (broad and narrow
  // patterns); narrow patterns (`Bash(bash *<script>.sh)`) failed when
  // bypass was off, demonstrating that internal-position globs and/or
  // `allowed-tools` coverage of pre-resolution are not reliable. The fix
  // moves all probes to the runtime Bash tool inside the skill body, which
  // honors normal permission rules. Reintroducing any `!`bash <abs-path>``
  // pre-resolution would re-break the skill — this test catches that.
  test("does not use `!` pre-resolution to invoke bundled scripts", () => {
    const preResolutions = SKILL_BODY.match(/!`[^`\n]*bash\s+[^`\n]*\.sh[^`\n]*`/g)
    expect(
      preResolutions,
      `ce-update/SKILL.md must not use '!\`bash <path>.sh\`' pre-resolution — it hits Claude Code's load-time permission check, which does not honor 'defaultMode: bypassPermissions'. Move probes into the skill body via runtime Bash tool calls instead. Found: ${JSON.stringify(preResolutions)}`,
    ).toBeNull()
  })

  test("instructs the agent to invoke the three probe scripts via the Bash tool", () => {
    // The skill must reference each script in a runtime instruction so the
    // agent collects the values before applying decision logic. Uses bare
    // `bash scripts/<name>.sh` form (the convention in this plugin for
    // co-located scripts; Claude Code resolves relative paths to the skill
    // directory at runtime).
    for (const script of ["upstream-version.sh", "currently-loaded-version.sh", "marketplace-name.sh"]) {
      expect(
        SKILL_BODY.includes(`bash scripts/${script}`),
        `ce-update/SKILL.md must instruct the agent to run 'bash scripts/${script}' via the Bash tool. Without this, the skill cannot probe versions at runtime.`,
      ).toBe(true)
    }
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
