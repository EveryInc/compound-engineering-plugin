import { readFileSync } from "fs"
import path from "path"
import { describe, expect, test } from "bun:test"

// Regression guard for https://github.com/EveryInc/compound-engineering-plugin/issues/556.
//
// `CLAUDE_PLUGIN_ROOT` is set by the Claude Code harness to the currently-loaded
// plugin version directory (e.g. `~/.claude/plugins/cache/<marketplace>/compound-engineering/<version>`).
// It is NOT the plugins cache root. Appending `/cache/<anything>/compound-engineering/`
// onto it produces a path that never exists, which causes the cache-probe to fail
// and emit the `__CE_UPDATE_CACHE_FAILED__` sentinel on every healthy install.
//
// This has regressed twice. Fail fast if the antipattern reappears.

describe("ce-update SKILL.md", () => {
  const skillPath = path.join(
    process.cwd(),
    "plugins/compound-engineering/skills/ce-update/SKILL.md",
  )
  const body = readFileSync(skillPath, "utf8")

  test("does not append a /cache/<marketplace>/ suffix onto CLAUDE_PLUGIN_ROOT", () => {
    // Matches any `${CLAUDE_PLUGIN_ROOT}/cache/<segment>/` or `${CLAUDE_PLUGIN_ROOT}/cache/<segment>"`
    // pattern. The harness variable is already under `cache/<marketplace>/`,
    // so concatenating another `cache/...` segment is always wrong.
    const antiPattern = /\$\{CLAUDE_PLUGIN_ROOT\}\/cache\//
    expect(
      antiPattern.test(body),
      "ce-update/SKILL.md reintroduced the ${CLAUDE_PLUGIN_ROOT}/cache/... antipattern — derive the cache dir from dirname \"${CLAUDE_PLUGIN_ROOT}\" instead.",
    ).toBe(false)
  })
})
