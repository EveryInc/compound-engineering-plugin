import { readFileSync } from "fs"
import path from "path"
import { describe, expect, test } from "bun:test"

const AGENT_PATH = path.join(
  process.cwd(),
  "skills/ce-compound/references/agents/session-historian.md",
)
const COMPOUND_SKILL_PATH = path.join(
  process.cwd(),
  "skills/ce-compound/SKILL.md",
)
const AGENT_BODY = readFileSync(AGENT_PATH, "utf8")
const COMPOUND_SKILL_BODY = readFileSync(COMPOUND_SKILL_PATH, "utf8")

// Regression guard for https://github.com/EveryInc/compound-engineering-plugin/issues/794.
//
// `session-historian.md` runs in subagent context (dispatched by `ce-compound`
// Phase 1). Claude Code does not permit
// subagents to invoke the `Skill` tool — the call hangs at "Initializing…"
// indefinitely, eventually surfacing to the orchestrator as a spurious
// "user doesn't want to proceed with this tool use" rejection
// (anthropics/claude-code#38719).
//
// The fix keeps all script orchestration in ce-compound's main context,
// keeping this prompt synthesis-only so it reads
// pre-extracted scratch files via the platform's native file-read tool.
//
// This test locks the no-Skill-from-subagent invariant: the agent's body
// must not instruct any `Skill(...)` invocation. Silent regression here
// reintroduces the deadlock.
describe("session-historian prompt no-Skill-tool regression guard", () => {
  test("agent body does not instruct Skill(ce-session-inventory) calls", () => {
    expect(AGENT_BODY).not.toMatch(/Skill\(\s*["'`]?ce-session-inventory/)
  })

  test("agent body does not instruct Skill(ce-session-extract) calls", () => {
    expect(AGENT_BODY).not.toMatch(/Skill\(\s*["'`]?ce-session-extract/)
  })

  test("agent body does not contain the broken-pattern prose fingerprint", () => {
    expect(AGENT_BODY).not.toMatch(/Invoke them through the Skill tool/i)
  })

  test("agent body does not instruct any Skill(...) tool-call expression", () => {
    // Belt-and-suspenders: any literal `Skill(...)` tool-call form in the
    // agent body would deadlock under the same constraint. The agent's
    // contract is "read paths via native file-read; never invoke Skill."
    // Backtick-quoted prose mentions like `Skill` are fine — only literal
    // call expressions are flagged. Match `Skill(` followed by a non-space
    // character (excluding the closing backtick that would mark a code span).
    const skillCallPattern = /(?<!`)Skill\([^)`]/
    const match = AGENT_BODY.match(skillCallPattern)
    expect(
      match,
      `Agent body contains a literal Skill(...) tool-call expression: ${match?.[0]}. ` +
        `Subagents cannot invoke the Skill tool in Claude Code (issue #794). ` +
        `Use the platform's native file-read tool on pre-extracted paths instead.`,
    ).toBeNull()
  })

  test("ce-compound still dispatches the skill-local session historian prompt", () => {
    expect(COMPOUND_SKILL_BODY).toContain("references/agents/session-historian.md")
    expect(COMPOUND_SKILL_BODY).toContain("Do not dispatch a standalone agent by type/name")
  })

  test("ce-compound resolves repo filter before running session discovery", () => {
    expect(COMPOUND_SKILL_BODY).toContain("REPO_ROOT=$(git rev-parse --show-toplevel")
    expect(COMPOUND_SKILL_BODY).toContain('REPO_NAME=$(basename "$REPO_ROOT")')
    expect(COMPOUND_SKILL_BODY).toContain('discover-sessions.sh" "$REPO_NAME" "$SCAN_DAYS"')
    expect(COMPOUND_SKILL_BODY).toContain('--cwd-filter "$REPO_ROOT"')
    expect(COMPOUND_SKILL_BODY).not.toContain('discover-sessions.sh" <repo> <days>')
    expect(COMPOUND_SKILL_BODY).not.toContain("--cwd-filter <repo>")
    expect(COMPOUND_SKILL_BODY).not.toContain("<resolved repo root")
  })
})
