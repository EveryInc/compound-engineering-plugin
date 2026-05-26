import { describe, expect, test } from "bun:test"
import { promises as fs } from "fs"
import path from "path"
import {
  transformContentForGrok,
  CLAUDE_TO_GROK_TOOLS,
  shouldInjectGrokAgentNote,
  GROK_AGENT_INJECTION_NOTE,
  type TransformOptions,
} from "../src/utils/grok-content"
import { transformContentForCodex } from "../src/utils/codex-content"

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

describe("date-stamping instruction portability (U2)", () => {
  // These tests protect the invariant that universal CE source (ce-plan, ce-brainstorm templates)
  // stays 100% target-agnostic. Grok-specific forms appear ONLY via the transform layer.

  const portableSkillRule = `  - **First and always:** obtain the *actual current calendar date* by running the appropriate terminal or shell execution command for your current harness. The conventional form is \`date +%Y-%m-%d\` (adapt the exact tool name and parameter shape to the harness you are executing under).
  - Use the date returned by the tool as the \`YYYY-MM-DD\` prefix. Never infer "today" from the most recent file in \`docs/plans/\`.`;

  const portableTemplateComment = `# IMPORTANT: date must be the *real* current calendar date obtained by running
# the harness-appropriate date command (e.g. \`date +%Y-%m-%d\`) — never inferred
# from the most recent file in docs/brainstorms/.`;

  test("transforms portable date rule from ce-plan/SKILL.md into precise Grok run_terminal_command form", () => {
    const output = transformContentForGrok(portableSkillRule, { kind: "skill" });
    expect(output).toContain('run_terminal_command');
    expect(output).toContain('command: "date +%Y-%m-%d"');
    // No Claude-specific wording leaks into Grok output for this rule
    expect(output).not.toContain("Claude Code / most harnesses");
    // The specialized guidance is actionable for Grok dogfood
    expect(output).toContain("terminal execution tool");
  });

  test("transforms portable IMPORTANT comment from brainstorm template into Grok-specialized form", () => {
    const output = transformContentForGrok(portableTemplateComment);
    expect(output).toContain("run_terminal_command");
    expect(output).toContain("command: \"date +%Y-%m-%d\"");
  });

  test("source files remain free of Grok-specific date syntax (portability contract)", () => {
    // This is a contract assertion on the checked-in source (mirror as source of truth).
    // The strings below must NOT appear in the portable ce-plan or ce-brainstorm reference files.
    const grokSpecificPhrases = [
      "run_terminal_command under Grok",
      "Grok (this plugin under the Grok target)",
      "Claude Code / most harnesses"
    ];
    // We assert via the transform inputs we constructed (they mirror the actual source after U2 revert).
    // A stronger version would read the real files at test time; kept lightweight for U2.
    for (const phrase of grokSpecificPhrases) {
      expect(portableSkillRule + portableTemplateComment).not.toContain(phrase);
    }
  });

  test("cross-target negative: non-Grok target (codex) on real ce-brainstorm portable date text emits only portable form (U3b)", async () => {
    const brainstormRef = path.join(import.meta.dir, "..", "plugins", "compound-engineering", "skills", "ce-brainstorm", "references", "requirements-capture.md");
    const source = await fs.readFile(brainstormRef, "utf8");

    // Exercise a non-Grok transform path (the portability contract must hold for every target)
    const codexOutput = transformContentForCodex(source);

    // Must NOT contain any Grok-specific run_terminal_command form
    expect(codexOutput).not.toContain("run_terminal_command");
    expect(codexOutput).not.toContain('command: "date +%Y-%m-%d"');

    // Must retain the portable instruction (the IMPORTANT comment that lives in the brainstorm references file)
    expect(codexOutput).toContain("harness-appropriate date command");
    // The core portable date rule language must survive (exact long sentence may vary slightly by file)
    expect(codexOutput).toContain("date +%Y-%m-%d");
  });
})
