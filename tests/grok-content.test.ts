import { describe, expect, test } from "bun:test"
import {
  transformContentForGrok,
  CLAUDE_TO_GROK_TOOLS,
  shouldInjectGrokAgentNote,
  GROK_AGENT_INJECTION_NOTE,
  type TransformOptions,
} from "../src/utils/grok-content"

describe("grok-content transforms (U3 hardened)", () => {
  describe("CLAUDE_TO_GROK_TOOLS table", () => {
    test("has expected high-frequency mappings used by CE skills", () => {
      expect(CLAUDE_TO_GROK_TOOLS.Bash).toBe("run_terminal_command")
      expect(CLAUDE_TO_GROK_TOOLS.Read).toBe("read_file")
      expect(CLAUDE_TO_GROK_TOOLS.Edit).toBe("search_replace")
      expect(CLAUDE_TO_GROK_TOOLS.Task).toBe("spawn_subagent")
      expect(CLAUDE_TO_GROK_TOOLS.AskUserQuestion).toBe("ask_user_question")
      expect(CLAUDE_TO_GROK_TOOLS.TodoWrite).toBe("todo_write")
    })
  })

  describe("transformContentForGrok - defensive variable rewriting", () => {
    test("rewrites CLAUDE_SKILL_DIR and CLAUDE_PLUGIN_ROOT to GROK_PLUGIN_ROOT while preserving defensive fallback", () => {
      const input = 'source "${CLAUDE_SKILL_DIR:-.}/scripts/common.sh" && bash "${CLAUDE_PLUGIN_ROOT:-.}/scripts/worktree-manager.sh" create'
      const output = transformContentForGrok(input, { kind: "skill" })
      expect(output).toContain('${GROK_PLUGIN_ROOT:-.}/scripts/common.sh')
      expect(output).toContain('${GROK_PLUGIN_ROOT:-.}/scripts/worktree-manager.sh')
      expect(output).not.toContain("CLAUDE_SKILL_DIR")
      expect(output).not.toContain("CLAUDE_PLUGIN_ROOT")
    })
  })

  describe("transformContentForGrok - dispatch rewriting (core of U3 readiness)", () => {
    test("rewrites literal Task ce-foo(...) with recommended Grok injection pattern", () => {
      const input = "Task ce-code-review (the current diff for review)"
      const output = transformContentForGrok(input, { kind: "skill" })
      expect(output).toContain("read_file")
      expect(output).toContain("ce-code-review.md")
      expect(output).toContain("spawn_subagent")
    })

    test("rewrites spawn ... ce-foo subagent patterns (real CE style from ce-code-review)", () => {
      const input = "spawn the ce-plan subagent using the plan template with the intent summary"
      const output = transformContentForGrok(input, { kind: "skill" })
      expect(output).toContain('read_file with path "${GROK_PLUGIN_ROOT}/agents/ce-plan.md"')
      expect(output).toContain("spawn_subagent")
    })

    test("rewrites Agent tool dispatch of ce-*-reviewer (common in review skill tables)", () => {
      const input = "Use the Agent tool to dispatch ce-correctness-reviewer and ce-testing-reviewer in parallel"
      const output = transformContentForGrok(input, { kind: "skill" })
      expect(output).toContain("spawn_subagent after loading the ce-correctness-reviewer")
      expect(output).toContain("read_file")
    })
  })

  describe("transformContentForGrok - tool normalization", () => {
    test("rewrites Bash/Read/Edit/Write/Task in prose and allowed-tools lists", () => {
      const input = "Use Bash to run commands, Read files, Edit, Write. allowed-tools: Bash, Read, Edit, Write, Task"
      const output = transformContentForGrok(input, { kind: "skill" })
      expect(output).toContain("run_terminal_command to run commands")
      expect(output).toContain("read_file files")
      expect(output).toContain("search_replace")
      expect(output).toContain("allowed-tools: run_terminal_command, read_file, search_replace, write, spawn_subagent")
    })
  })

  describe("shouldInjectGrokAgentNote + injection (U3 policy)", () => {
    test("injects minimal note for content with heavy ce-* delegation (ce-code-review style)", () => {
      const input = "Always spawn ce-maintainability-reviewer, ce-agent-native-reviewer, and ce-learnings-researcher for every review."
      const output = transformContentForGrok(input, { kind: "skill" })
      expect(output).toContain("Grok + Compound Engineering agents")
      expect(output).toContain("spawn_subagent")
    })

    test("does not duplicate the note if already present", () => {
      const inputWithNote = `${GROK_AGENT_INJECTION_NOTE}\n\nSome content with ce-plan mention`
      const output = transformContentForGrok(inputWithNote, { kind: "skill" })
      const count = (output.match(/Grok \+ Compound Engineering agents/g) || []).length
      expect(count).toBe(1)
    })

    test("shouldInjectGrokAgentNote detects real CE dispatch patterns", () => {
      expect(shouldInjectGrokAgentNote("Task ce-code-review (...)")).toBe(true)
      expect(shouldInjectGrokAgentNote("spawn ce-maintainability-reviewer")).toBe(true)
      expect(shouldInjectGrokAgentNote("Use the Agent tool to dispatch ce-testing-reviewer")).toBe(true)
      expect(shouldInjectGrokAgentNote("Regular skill content without delegation")).toBe(false)
    })
  })

  describe("path and cross-reference normalization", () => {
    test("rewrites .claude/ paths and normalizes ce- skill references", () => {
      const input = "See ~/.claude/ and load the ce-plan skill and @ce-worktree"
      const output = transformContentForGrok(input, { kind: "skill" })
      expect(output).toContain("~/.grok/")
      expect(output).toContain("`ce-plan` skill")
      expect(output).toContain("@ce-worktree")
    })
  })
})

describe("transformContentForGrok with real CE excerpts (from U3 readiness)", () => {
  // Excerpts inspired by the actual ce-code-review/SKILL.md and references we exercised in U3
  const realDispatchExcerpt = `
Review team:
- correctness (always)
- ce-correctness-reviewer (load agent definition and inject into spawn_subagent prompt)
- ce-testing-reviewer
  `.trim()

  test("handles dense ce-*-reviewer table lines without exploding", () => {
    const output = transformContentForGrok(realDispatchExcerpt, { kind: "skill" })
    expect(output).toContain("spawn_subagent")
    // The hardened rewriter produces Grok dispatch guidance for ce-*-reviewer lines
    expect(output).toContain("read_file")
  })

  const scriptExcerpt = 'bash "${CLAUDE_SKILL_DIR:-.}/scripts/worktree-manager.sh" --help'

  test("preserves script intent while rewriting vars (from ce-worktree)", () => {
    const output = transformContentForGrok(scriptExcerpt, { kind: "skill" })
    expect(output).toContain('GROK_PLUGIN_ROOT')
    expect(output).toContain("worktree-manager.sh")
  })
})
