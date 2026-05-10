import { readFileSync } from "fs"
import path from "path"
import { describe, expect, test } from "bun:test"

const SKILL_PATH = path.join(
  process.cwd(),
  "plugins/compound-engineering/skills/ce-code-review/SKILL.md",
)
const SKILL_BODY = readFileSync(SKILL_PATH, "utf8")

describe("ce-code-review SKILL.md", () => {
  test("does not invoke resolve-base.sh via a bare relative path", () => {
    const codeFenceMatches = SKILL_BODY.match(/^RESOLVE_OUT=\$\(bash scripts\/resolve-base\.sh\)/gm)
    expect(
      codeFenceMatches,
      "ce-code-review/SKILL.md re-introduced the bare 'bash scripts/resolve-base.sh' antipattern -- use 'bash \"${CLAUDE_SKILL_DIR}/scripts/resolve-base.sh\"' instead. Bare relative paths fail at runtime because the Bash tool's CWD is the user's project, not the skill directory.",
    ).toBeNull()
  })

  test("instructs the agent to invoke resolve-base.sh via a CLAUDE_SKILL_DIR-prefixed path", () => {
    const skillDirPrefixed = /bash "\$\{CLAUDE_SKILL_DIR(?::-[^}]*)?\}\/scripts\/resolve-base\.sh"/
    expect(
      skillDirPrefixed.test(SKILL_BODY),
      "ce-code-review/SKILL.md must instruct the agent to run 'bash \"${CLAUDE_SKILL_DIR}/scripts/resolve-base.sh\"' (or with a :- fallback) -- relative paths fail at runtime because the Bash tool's CWD is the user's project, not the skill directory.",
    ).toBe(true)
  })

  test("uses a :- fallback so non-Claude targets get the bare relative path", () => {
    expect(
      SKILL_BODY.includes(`\${CLAUDE_SKILL_DIR:-.}/scripts/resolve-base.sh`),
      "ce-code-review/SKILL.md must use the `${CLAUDE_SKILL_DIR:-.}` fallback form so non-Claude targets (Codex, Gemini, Pi, etc.) -- where the env var is unset -- fall back to the bare relative path rather than expanding to '/scripts/resolve-base.sh'.",
    ).toBe(true)
  })

  test("declares a narrow allowed-tools pattern for resolve-base.sh", () => {
    const frontmatter = SKILL_BODY.match(/^---\n([\s\S]*?)\n---/)
    expect(frontmatter, "ce-code-review/SKILL.md must have YAML frontmatter").not.toBeNull()
    const allowedTools = frontmatter![1].match(/^allowed-tools:\s*(.+)$/m)
    expect(
      allowedTools,
      "ce-code-review/SKILL.md must declare `allowed-tools:` so users without bypassPermissions don't get a prompt every run.",
    ).not.toBeNull()
    const tools = allowedTools![1]
    expect(
      tools.includes(`Bash(bash *resolve-base.sh)`),
      `ce-code-review/SKILL.md allowed-tools must include 'Bash(bash *resolve-base.sh)' so the runtime Bash call passes the permission check without granting blanket Bash access (got: ${tools})`,
    ).toBe(true)
    expect(
      /Bash\(bash \*\)/.test(tools),
      `ce-code-review/SKILL.md allowed-tools must NOT use the broad 'Bash(bash *)' pattern -- pin to the script filename instead (got: ${tools})`,
    ).toBe(false)
  })
})
