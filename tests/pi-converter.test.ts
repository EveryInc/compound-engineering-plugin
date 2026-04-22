import { describe, expect, test } from "bun:test"
import path from "path"
import { loadClaudePlugin } from "../src/parsers/claude"
import { convertClaudeToPi } from "../src/converters/claude-to-pi"
import { parseFrontmatter } from "../src/utils/frontmatter"
import type { ClaudePlugin } from "../src/types/claude"

const fixtureRoot = path.join(import.meta.dir, "fixtures", "sample-plugin")

describe("convertClaudeToPi", () => {
  test("converts commands, skills, agents, and MCP servers without shipping a Pi extension", async () => {
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

    // Existing skills are copied as skill dirs; Claude agents are converted to
    // Pi agent files (under bundle.agents, written to .pi/agents/<name>.md) so
    // that nicobailon/pi-subagents' `subagent` tool can resolve them by name.
    expect(bundle.skillDirs.some((skill) => skill.name === "skill-one")).toBe(true)
    expect(bundle.agents.some((agent) => agent.name === "repo-research-analyst")).toBe(true)
    // Agents no longer leak into generatedSkills — that field is reserved for
    // commands-as-skills on other targets; Pi keeps it empty.
    expect(bundle.generatedSkills).toEqual([])

    // Pi installs now depend on the community pi-subagents and pi-ask-user extensions,
    // so the converter emits no bundled extension. Legacy cleanup in the Pi writer
    // removes any prior compound-engineering-compat.ts on upgrade.
    expect(bundle.extensions).toEqual([])

    // MCP servers declared in plugin.json are translated to Pi's mcporter.json
    // shape so plugins with MCP wiring keep their backends after conversion.
    // The fixture declares both an HTTP url server (context7) and a stdio
    // command server (local-tooling).
    expect(bundle.mcporterConfig).toEqual({
      mcpServers: {
        context7: {
          baseUrl: "https://mcp.context7.com/mcp",
          headers: undefined,
        },
        "local-tooling": {
          command: "echo",
          args: ["fixture"],
          env: undefined,
          headers: undefined,
        },
      },
    })
  })

  test("omits mcporterConfig when the plugin declares no MCP servers", () => {
    const plugin: ClaudePlugin = {
      root: "/tmp/plugin",
      manifest: { name: "fixture", version: "1.0.0" },
      agents: [],
      commands: [],
      skills: [],
      hooks: undefined,
      mcpServers: undefined,
    }

    const bundle = convertClaudeToPi(plugin, {
      agentMode: "subagent",
      inferTemperature: false,
      permissions: "none",
    })

    expect(bundle.mcporterConfig).toBeUndefined()
  })

  test("transforms Task calls, slash commands, and todo tool references; preserves AskUserQuestion", () => {
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
            "Then use /workflows:work and /prompts:todo-resolve.",
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
    // AskUserQuestion is preserved; skill source-side enumerations name each platform's
    // blocking-question tool (including `ask_user` for Pi via pi-ask-user), so the
    // converter no longer rewrites the token.
    expect(parsedPrompt.body).toContain("AskUserQuestion")
    expect(parsedPrompt.body).toContain("/workflows-work")
    expect(parsedPrompt.body).toContain("/todo-resolve")
    expect(parsedPrompt.body).toContain("the platform's task-tracking primitive")
  })

  test("transforms current Claude Code Task* task-tracking primitives to platform-generic text", () => {
    const plugin: ClaudePlugin = {
      root: "/tmp/plugin",
      manifest: { name: "fixture", version: "1.0.0" },
      agents: [],
      commands: [
        {
          name: "workflows:work",
          description: "Work with task tracking",
          body: [
            "Plan tasks with TaskCreate and update their state with TaskUpdate.",
            "Inspect the list with TaskList. Fetch details with TaskGet.",
            "Stop long-running tasks with TaskStop and read output with TaskOutput.",
          ].join("\n"),
          sourcePath: "/tmp/plugin/commands/work.md",
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
    for (const token of ["TaskCreate", "TaskUpdate", "TaskList", "TaskGet", "TaskStop", "TaskOutput"]) {
      expect(parsedPrompt.body).not.toContain(token)
    }
    expect(parsedPrompt.body).toContain("the platform's task-tracking primitive")
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

})
