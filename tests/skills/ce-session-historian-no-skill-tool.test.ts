import { readFileSync } from "fs"
import path from "path"
import { describe, expect, test } from "bun:test"

const AGENT_PATH = path.join(
  process.cwd(),
  "plugins/compound-engineering/agents/ce-session-historian.agent.md",
)
const AGENT_BODY = readFileSync(AGENT_PATH, "utf8")

// Regression guard for https://github.com/EveryInc/compound-engineering-plugin/issues/794.
//
// `ce-session-historian` runs in subagent context (dispatched by `ce-sessions`
// and historically by `ce-compound` Phase 1). Claude Code does not permit
// subagents to invoke the `Skill` tool — the call hangs at "Initializing…"
// indefinitely, eventually surfacing to the orchestrator as a spurious
// "user doesn't want to proceed with this tool use" rejection
// (anthropics/claude-code#38719).
//
// The fix moved all script orchestration into the `ce-sessions` skill
// (main context), reshaping this agent into synthesis-only that reads
// pre-extracted scratch files via the platform's native file-read tool.
//
// This test locks the no-Skill-from-subagent invariant: the agent's body
// must not instruct any `Skill(...)` invocation. Silent regression here
// reintroduces the deadlock.
describe("ce-session-historian no-Skill-tool regression guard", () => {
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
})
