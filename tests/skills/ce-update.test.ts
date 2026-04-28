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

  // Regression guard: the previous safety-check fix extracted pre-resolution
  // logic into `bash "${CLAUDE_SKILL_DIR}/scripts/<name>.sh"` invocations.
  // That cleared the safety check but introduced a new failure: `!`
  // pre-resolution commands have a *permission* check that does NOT honor
  // `defaultMode: bypassPermissions`, and `bash <abs-path>` does not match
  // common user allow rules (most users have `Bash(bash -c:*)` at most, not
  // `Bash(bash:*)`). Without `allowed-tools` granting permission for the
  // specific scripts, the skill fails at load time with "Shell command
  // permission check failed". The pattern is intentionally narrow — pinned to
  // each script filename — so a regression to broad `Bash(bash *)` is caught.
  test("declares narrow allowed-tools patterns for each pre-resolution script", () => {
    const frontmatter = SKILL_BODY.match(/^---\n([\s\S]*?)\n---/)
    expect(frontmatter, "ce-update/SKILL.md must have YAML frontmatter").not.toBeNull()
    const allowedTools = frontmatter![1].match(/^allowed-tools:\s*(.+)$/m)
    expect(
      allowedTools,
      "ce-update/SKILL.md must declare `allowed-tools:` to grant Bash permission for pre-resolution scripts — `defaultMode: bypassPermissions` does not apply to `!` pre-resolution.",
    ).not.toBeNull()
    const tools = allowedTools![1]
    for (const script of ["upstream-version.sh", "currently-loaded-version.sh", "marketplace-name.sh"]) {
      expect(
        tools.includes(`Bash(bash *${script})`),
        `ce-update/SKILL.md allowed-tools must include 'Bash(bash *${script})' so the pre-resolution '!\`bash "\${CLAUDE_SKILL_DIR}/scripts/${script}"\`' passes the permission check without granting blanket Bash access (got: ${tools})`,
      ).toBe(true)
    }
    expect(
      /Bash\(bash \*\)/.test(tools),
      `ce-update/SKILL.md allowed-tools must NOT use the broad 'Bash(bash *)' pattern — pin to each script filename instead (got: ${tools})`,
    ).toBe(false)
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
// Rather than grep-testing the literal shell string, this suite extracts the
// "Latest upstream version" pre-resolution command and executes it against a
// mocked `gh` that returns distinguishable values for `gh api` vs
// `gh release list`. The command must report the version from `plugin.json`,
// not from release tags.
describe("ce-update 'Latest upstream version' pre-resolution command", () => {
  test("declares a 'Latest upstream version' pre-resolution section", () => {
    // Fails loudly if the SKILL structure regresses (renamed section, removed
    // pre-resolution block) so behavioral tests below can rely on it.
    expect(SKILL_BODY).toMatch(/\*\*Latest upstream version:\*\*\s*\n!`[^`\n]+`/)
  })

  test("returns the version from main's plugin.json, not any release tag", () => {
    // Chosen so a tag-based fallback would produce a clearly different value
    // than the plugin.json-based read. Either 1.0.0 or an empty/sentinel
    // output indicates the command is reading the wrong source.
    const pluginJsonVersion = "99.0.0"
    const releaseTagVersion = "1.0.0"

    const stdout = runUpstreamCommand(extractUpstreamVersionCommand(SKILL_BODY), {
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
    const stdout = runUpstreamCommand(extractUpstreamVersionCommand(SKILL_BODY), {
      ghExitCode: 1,
    })
    expect(stdout).toContain("__CE_UPDATE_VERSION_FAILED__")
  })
})

/**
 * Extract the shell command between `**Latest upstream version:**` and the
 * next blank line in SKILL.md. The command sits on the next line wrapped in
 * backticks with a leading `!` (Claude Code's pre-resolution syntax).
 */
function extractUpstreamVersionCommand(body: string): string {
  const match = body.match(/\*\*Latest upstream version:\*\*\s*\n!`([^`\n]+)`/)
  if (!match) {
    throw new Error(
      `Could not extract 'Latest upstream version' pre-resolution command from ${SKILL_PATH}`,
    )
  }
  return match[1]
}

type MockOptions = {
  pluginJsonVersion?: string
  releaseTagVersion?: string
  ghExitCode?: number
}

/**
 * Run the skill's upstream-version command with a mocked `gh` on PATH.
 * The mock emits distinct payloads for `gh api` vs `gh release list` so the
 * test can prove which source the command actually reads from.
 */
function runUpstreamCommand(command: string, options: MockOptions): string {
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
    // gojq embedded in the binary, so neither the skill nor this mock needs
    // an external jq on PATH. When the skill asks a `--jq` filter that
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
    # If the skill ever falls back to release-tag lookup, this is what it gets.
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

    // The pre-resolution command invokes a script under
    // ${CLAUDE_SKILL_DIR}/scripts/. Point CLAUDE_SKILL_DIR at the real skill
    // directory so the script resolves; this exercises the full script path
    // (substitution, script lookup, and gh invocation) end-to-end.
    return execFileSync("bash", ["-c", command], {
      env: {
        ...process.env,
        PATH: `${mockDir}:${process.env.PATH ?? ""}`,
        CLAUDE_SKILL_DIR: path.dirname(SKILL_PATH),
      },
      encoding: "utf8",
    }).trim()
  } finally {
    rmSync(mockDir, { recursive: true, force: true })
  }
}
