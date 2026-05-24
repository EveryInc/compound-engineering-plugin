import { readFileSync } from "fs"
import path from "path"
import { describe, expect, test } from "bun:test"

const SKILL_PATH = path.join(
  process.cwd(),
  "plugins/compound-engineering/skills/ce-worktree/SKILL.md",
)
const SKILL_BODY = readFileSync(SKILL_PATH, "utf8")

describe("ce-worktree SKILL.md", () => {
  // Regression guard for https://github.com/EveryInc/compound-engineering-plugin/issues/764.
  //
  // The runtime Bash tool runs from the user's project CWD, not the skill
  // directory — so `bash scripts/worktree-manager.sh` resolves against the
  // user's project root, where the script does not exist, and fails with
  // "No such file or directory". The fix is to invoke via
  // `${CLAUDE_SKILL_DIR}` so the path resolves to the skill's own scripts
  // directory across both marketplace-cached installs and `claude --plugin-dir`
  // local development.
  test("does not invoke worktree-manager.sh via a bare relative path", () => {
    const codeFenceMatches = SKILL_BODY.match(/^bash scripts\/worktree-manager\.sh/gm)
    expect(
      codeFenceMatches,
      "ce-worktree/SKILL.md re-introduced the bare 'bash scripts/worktree-manager.sh' antipattern — use 'bash \"${CLAUDE_SKILL_DIR}/scripts/worktree-manager.sh\"' instead. Bare relative paths fail at runtime because the Bash tool's CWD is the user's project, not the skill directory.",
    ).toBeNull()
  })

  test("instructs the agent to invoke worktree-manager.sh via a CLAUDE_SKILL_DIR-prefixed path", () => {
    // Allow either `${CLAUDE_SKILL_DIR}` or `${CLAUDE_SKILL_DIR:-.}` (the
    // cross-platform fallback form); both resolve correctly on Claude Code.
    const skillDirPrefixed = /bash "\$\{CLAUDE_SKILL_DIR(?::-[^}]*)?\}\/scripts\/worktree-manager\.sh"/
    expect(
      skillDirPrefixed.test(SKILL_BODY),
      "ce-worktree/SKILL.md must instruct the agent to run 'bash \"${CLAUDE_SKILL_DIR}/scripts/worktree-manager.sh\"' (or with a :- fallback) — relative paths fail at runtime because the Bash tool's CWD is the user's project, not the skill directory.",
    ).toBe(true)
  })

  // Regression guard for the cross-platform portability concern raised on
  // PR #772. ce-worktree has no `ce_platforms` restriction, so it is exported
  // to Codex/Gemini/Pi/etc. via filterSkillsByPlatform; none of those
  // converters substitute `${CLAUDE_SKILL_DIR}`. Without a `:-` fallback,
  // the variable expands to empty on those targets and `bash
  // "/scripts/worktree-manager.sh"` fails. The `:-.` fallback yields the
  // original bare-relative path (preserving prior behavior on those
  // platforms) while Claude Code still gets the resolved skill directory.
  test("uses a :- fallback so non-Claude targets get the bare relative path", () => {
    expect(
      SKILL_BODY.includes(`\${CLAUDE_SKILL_DIR:-.}/scripts/worktree-manager.sh`),
      "ce-worktree/SKILL.md must use the `${CLAUDE_SKILL_DIR:-.}` fallback form so non-Claude targets (Codex, Gemini, Pi, etc.) — where the env var is unset — fall back to the bare relative path rather than expanding to '/scripts/worktree-manager.sh'.",
    ).toBe(true)
  })

  // Regression guard: each script invocation is `bash <abs-path>` at runtime,
  // which does not match the user's typical allow rules (most have
  // `Bash(bash -c:*)` at most, not `Bash(bash:*)`). Without `allowed-tools`
  // granting permission for the specific script, users without
  // `defaultMode: bypassPermissions` get an approval prompt every time they
  // run the skill. The pattern is pinned to the script filename —
  // `Bash(bash *)` would be too broad.
  test("declares a narrow allowed-tools pattern for worktree-manager.sh", () => {
    const frontmatter = SKILL_BODY.match(/^---\n([\s\S]*?)\n---/)
    expect(frontmatter, "ce-worktree/SKILL.md must have YAML frontmatter").not.toBeNull()
    const allowedTools = frontmatter![1].match(/^allowed-tools:\s*(.+)$/m)
    expect(
      allowedTools,
      "ce-worktree/SKILL.md must declare `allowed-tools:` so users without bypassPermissions don't get a prompt every run.",
    ).not.toBeNull()
    const tools = allowedTools![1]
    expect(
      tools.includes(`Bash(bash *worktree-manager.sh)`),
      `ce-worktree/SKILL.md allowed-tools must include 'Bash(bash *worktree-manager.sh)' so the runtime Bash call passes the permission check without granting blanket Bash access (got: ${tools})`,
    ).toBe(true)
    expect(
      /Bash\(bash \*\)/.test(tools),
      `ce-worktree/SKILL.md allowed-tools must NOT use the broad 'Bash(bash *)' pattern — pin to the script filename instead (got: ${tools})`,
    ).toBe(false)
  })
})
