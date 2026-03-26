import { describe, expect, test } from "bun:test"
import path from "path"
import { loadClaudePlugin } from "../src/parsers/claude"
import { convertClaudeToPi } from "../src/converters/claude-to-pi"
import { parseFrontmatter } from "../src/utils/frontmatter"
import type { ClaudePlugin } from "../src/types/claude"

const fixtureRoot = path.join(import.meta.dir, "fixtures", "sample-plugin")

describe("convertClaudeToPi", () => {
  test("converts commands, skills, extensions, and MCPorter config", async () => {
    const plugin = await loadClaudePlugin(fixtureRoot)
    const bundle = convertClaudeToPi(plugin, {
      agentMode: "subagent",
      inferTemperature: false,
      permissions: "none",
    })

    // Prompts are normalized command names
    expect(bundle.prompts.some((prompt) => prompt.name === "workflows-review")).toBe(true)
    expect(bundle.prompts.some((prompt) => prompt.name === "plan_review")).toBe(true)

    // Commands with disable-model-invocation are excluded
    expect(bundle.prompts.some((prompt) => prompt.name === "deploy-docs")).toBe(false)

    const workflowsReview = bundle.prompts.find((prompt) => prompt.name === "workflows-review")
    expect(workflowsReview).toBeDefined()
    const parsedPrompt = parseFrontmatter(workflowsReview!.content)
    expect(parsedPrompt.data.description).toBe("Run a multi-agent review workflow")

    // Existing skills are copied and agents are converted into generated Pi skills
    expect(bundle.skillDirs.some((skill) => skill.name === "skill-one")).toBe(true)
    expect(bundle.generatedSkills.some((skill) => skill.name === "repo-research-analyst")).toBe(true)

    // Pi compatibility extension is included (with subagent + MCPorter tools)
    const compatExtension = bundle.extensions.find((extension) => extension.name === "compound-engineering-compat.ts")
    expect(compatExtension).toBeDefined()
    expect(compatExtension!.content).toContain('name: "subagent"')
    expect(compatExtension!.content).toContain('name: "mcporter_call"')

    // Claude MCP config is translated to MCPorter config
    expect(bundle.mcporterConfig?.mcpServers.context7?.baseUrl).toBe("https://mcp.context7.com/mcp")
    expect(bundle.mcporterConfig?.mcpServers["local-tooling"]?.command).toBe("echo")
  })

  test("transforms Task calls, AskUserQuestion, slash commands, and todo tool references", () => {
    const plugin: ClaudePlugin = {
      root: "/tmp/plugin",
      manifest: { name: "fixture", version: "1.0.0" },
      agents: [],
      commands: [
        {
          name: "workflows:plan",
          description: "Plan workflow",
          body: [
            "Run these in order:",
            "- Task repo-research-analyst(feature_description)",
            "- Task learnings-researcher(feature_description)",
            "Use AskUserQuestion tool for follow-up.",
            "Then use /workflows:work and /prompts:deepen-plan.",
            "Track progress with TodoWrite and TodoRead.",
          ].join("\n"),
          sourcePath: "/tmp/plugin/commands/plan.md",
        },
      ],
      skills: [],
      hooks: undefined,
      mcpServers: undefined,
    }

    const bundle = convertClaudeToPi(plugin, {
      agentMode: "subagent",
      inferTemperature: false,
      permissions: "none",
    })

    expect(bundle.prompts).toHaveLength(1)
    const parsedPrompt = parseFrontmatter(bundle.prompts[0].content)

    expect(parsedPrompt.body).toContain("Run subagent with agent=\"repo-research-analyst\" and task=\"feature_description\".")
    expect(parsedPrompt.body).toContain("Run subagent with agent=\"learnings-researcher\" and task=\"feature_description\".")
    expect(parsedPrompt.body).toContain("ask_user_question")
    expect(parsedPrompt.body).toContain("/workflows-work")
    expect(parsedPrompt.body).toContain("/deepen-plan")
    expect(parsedPrompt.body).toContain("file-based todos (todos/ + /skill:todo-create)")
  })

  test("transforms namespaced Task agent calls using final segment", () => {
    const plugin: ClaudePlugin = {
      root: "/tmp/plugin",
      manifest: { name: "fixture", version: "1.0.0" },
      agents: [],
      commands: [
        {
          name: "plan",
          description: "Planning with namespaced agents",
          body: [
            "Run agents:",
            "- Task compound-engineering:research:repo-research-analyst(feature_description)",
            "- Task compound-engineering:review:security-reviewer(code_diff)",
          ].join("\n"),
          sourcePath: "/tmp/plugin/commands/plan.md",
        },
      ],
      skills: [],
      hooks: undefined,
      mcpServers: undefined,
    }

    const bundle = convertClaudeToPi(plugin, {
      agentMode: "subagent",
      inferTemperature: false,
      permissions: "none",
    })

    const parsedPrompt = parseFrontmatter(bundle.prompts[0].content)
    expect(parsedPrompt.body).toContain('Run subagent with agent="repo-research-analyst" and task="feature_description".')
    expect(parsedPrompt.body).toContain('Run subagent with agent="security-reviewer" and task="code_diff".')
    expect(parsedPrompt.body).not.toContain("compound-engineering:")
  })

  test("transforms zero-argument Task calls", () => {
    const plugin: ClaudePlugin = {
      root: "/tmp/plugin",
      manifest: { name: "fixture", version: "1.0.0" },
      agents: [],
      commands: [
        {
          name: "review",
          description: "Review code",
          body: "- Task compound-engineering:review:code-simplicity-reviewer()",
          sourcePath: "/tmp/plugin/commands/review.md",
        },
      ],
      skills: [],
      hooks: undefined,
      mcpServers: undefined,
    }

    const bundle = convertClaudeToPi(plugin, {
      agentMode: "subagent",
      inferTemperature: false,
      permissions: "none",
    })

    const parsedPrompt = parseFrontmatter(bundle.prompts[0].content)
    expect(parsedPrompt.body).toContain('Run subagent with agent="code-simplicity-reviewer".')
    expect(parsedPrompt.body).not.toContain("compound-engineering:")
    expect(parsedPrompt.body).not.toContain("()")
  })

  test("appends MCPorter compatibility note when command references MCP", () => {
    const plugin: ClaudePlugin = {
      root: "/tmp/plugin",
      manifest: { name: "fixture", version: "1.0.0" },
      agents: [],
      commands: [
        {
          name: "docs",
          description: "Read MCP docs",
          body: "Use MCP servers for docs lookup.",
          sourcePath: "/tmp/plugin/commands/docs.md",
        },
      ],
      skills: [],
      hooks: undefined,
      mcpServers: undefined,
    }

    const bundle = convertClaudeToPi(plugin, {
      agentMode: "subagent",
      inferTemperature: false,
      permissions: "none",
    })

    const parsedPrompt = parseFrontmatter(bundle.prompts[0].content)
    expect(parsedPrompt.body).toContain("Pi + MCPorter note")
    expect(parsedPrompt.body).toContain("mcporter_call")
  })
})
