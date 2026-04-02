import { describe, expect, test } from "bun:test"
import path from "path"
import { loadClaudePlugin } from "../src/parsers/claude"
import { convertClaudeToPi } from "../src/converters/claude-to-pi"
import { parseFrontmatter } from "../src/utils/frontmatter"
import { appendCompatibilityNoteIfNeeded, transformPiBodyContent } from "../src/utils/pi-skills"
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
    expect(bundle.prompts.some((prompt) => prompt.name === "plan-review")).toBe(true)

    // Commands with disable-model-invocation are excluded
    expect(bundle.prompts.some((prompt) => prompt.name === "deploy-docs")).toBe(false)

    const workflowsReview = bundle.prompts.find((prompt) => prompt.name === "workflows-review")
    expect(workflowsReview).toBeDefined()
    const parsedPrompt = parseFrontmatter(workflowsReview!.content)
    expect(parsedPrompt.data.description).toBe("Run a multi-agent review workflow")

    // Existing skills are copied and agents are converted into generated Pi skills
    expect(bundle.skillDirs.some((skill) => skill.name === "skill-one")).toBe(true)
    expect(bundle.generatedSkills.some((skill) => skill.name === "repo-research-analyst")).toBe(true)

    // Pi compatibility extension is included (with ce_subagent + MCPorter tools)
    const compatExtension = bundle.extensions.find((extension) => extension.name === "compound-engineering-compat.ts")
    expect(compatExtension).toBeDefined()
    expect(compatExtension!.content).toContain('name: "ce_subagent"')
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
            "- Task compound-engineering:research:repo-research-analyst(feature_description)",
            "- Task compound-engineering:research:learnings-researcher(feature_description)",
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

    expect(parsedPrompt.body).toContain("Run ce_subagent with agent=\"repo-research-analyst\" and task=\"feature_description\".")
    expect(parsedPrompt.body).toContain("Run ce_subagent with agent=\"learnings-researcher\" and task=\"feature_description\".")
    expect(parsedPrompt.body).toContain("ask_user_question")
    expect(parsedPrompt.body).toContain("/workflows-work")
    expect(parsedPrompt.body).toContain("/todo-resolve")
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
    expect(parsedPrompt.body).toContain('Run ce_subagent with agent="repo-research-analyst" and task="feature_description".')
    expect(parsedPrompt.body).toContain('Run ce_subagent with agent="security-reviewer" and task="code_diff".')
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
    expect(parsedPrompt.body).toContain('Run ce_subagent with agent="code-simplicity-reviewer".')
    expect(parsedPrompt.body).not.toContain('task=""')
    expect(parsedPrompt.body).not.toContain("compound-engineering:")
    expect(parsedPrompt.body).not.toContain("()")
  })

  test("normalizes copied skill names to Pi-safe names and avoids collisions", () => {
    const plugin: ClaudePlugin = {
      root: "/tmp/plugin",
      manifest: { name: "fixture", version: "1.0.0" },
      agents: [
        {
          name: "ce:plan",
          description: "Plan helper",
          body: "Agent body",
          sourcePath: "/tmp/plugin/agents/ce:plan.md",
        },
      ],
      commands: [],
      skills: [
        {
          name: "ce:plan",
          sourceDir: "/tmp/plugin/skills/ce:plan",
          skillPath: "/tmp/plugin/skills/ce:plan/SKILL.md",
        },
        {
          name: "generate_command",
          sourceDir: "/tmp/plugin/skills/generate_command",
          skillPath: "/tmp/plugin/skills/generate_command/SKILL.md",
        },
      ],
      hooks: undefined,
      mcpServers: undefined,
    }

    const bundle = convertClaudeToPi(plugin, {
      agentMode: "subagent",
      inferTemperature: false,
      permissions: "none",
    })

    expect(bundle.skillDirs.map((skill) => skill.name)).toEqual(["ce-plan", "generate-command"])
    expect(bundle.generatedSkills[0]?.name).toBe("ce-plan-2")
  })

  test("resolves Task calls to deduped agent names when names collide", () => {
    const plugin: ClaudePlugin = {
      root: "/tmp/plugin",
      manifest: { name: "fixture", version: "1.0.0" },
      agents: [
        {
          name: "code-review",
          description: "Review 1",
          body: "Agent body 1",
          sourcePath: "/tmp/plugin/agents/code-review.md",
        },
        {
          name: "code_review",
          description: "Review 2",
          body: "Agent body 2",
          sourcePath: "/tmp/plugin/agents/code_review.md",
        },
      ],
      commands: [
        {
          name: "review",
          description: "Run review",
          body: "- Task code-review(feature)\n- Task code_review(feature)",
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

    expect(bundle.generatedSkills.map((s) => s.name)).toEqual(["code-review", "code-review-2"])

    const parsedPrompt = parseFrontmatter(bundle.prompts[0].content)
    expect(parsedPrompt.body).toContain('agent="code-review" and task="feature"')
    expect(parsedPrompt.body).toContain('agent="code-review-2" and task="feature"')
  })

  test("resolves slash refs to deduped prompt names when command names collide", () => {
    const plugin: ClaudePlugin = {
      root: "/tmp/plugin",
      manifest: { name: "fixture", version: "1.0.0" },
      agents: [],
      commands: [
        {
          name: "plan-review",
          description: "First review",
          body: "Run /plan_review after this.",
          sourcePath: "/tmp/plugin/commands/plan-review.md",
        },
        {
          name: "plan_review",
          description: "Second review",
          body: "Then run /plan-review to continue.",
          sourcePath: "/tmp/plugin/commands/plan_review.md",
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

    expect(bundle.prompts.map((p) => p.name)).toEqual(["plan-review", "plan-review-2"])

    const firstPrompt = parseFrontmatter(bundle.prompts[0].content)
    expect(firstPrompt.body).toContain("/plan-review-2")

    const secondPrompt = parseFrontmatter(bundle.prompts[1].content)
    expect(secondPrompt.body).toContain("/plan-review")
    expect(secondPrompt.body).not.toContain("/plan-review-2")
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

  test("strips outer quotes from Task args to avoid doubled quoting", () => {
    const body = `- Task agent("feature description")\n- Task agent('single quoted')\n- Task agent(unquoted args)`
    const transformed = transformPiBodyContent(body)
    expect(transformed).toContain('task="feature description"')
    expect(transformed).toContain('task="single quoted"')
    expect(transformed).toContain('task="unquoted args"')
    expect(transformed).not.toContain('""')
    expect(transformed).not.toContain("''")
  })

  test("does not rewrite 'Run subagent with' in prose context", () => {
    const body = "Run subagent with caution when handling large inputs."
    const transformed = transformPiBodyContent(body)
    expect(transformed).toContain("Run subagent with caution")
    expect(transformed).not.toContain("ce_subagent")
  })

  test("rewrites 'Run subagent with agent=' in structured context", () => {
    const body = 'Run subagent with agent="repo-research-analyst" and task="research".'
    const transformed = transformPiBodyContent(body)
    expect(transformed).toContain('Run ce_subagent with agent="repo-research-analyst"')
  })

  test("remaps agent names in existing structured subagent invocations", () => {
    const body = 'Run subagent with agent="code_review" and task="feature".'
    const transformed = transformPiBodyContent(body, {
      agents: {
        "code-review": "code-review",
        code_review: "code-review-2",
      },
    })

    expect(transformed).toContain('Run ce_subagent with agent="code-review-2" and task="feature".')
    expect(transformed).not.toContain('agent="code_review"')
  })

  test("uses sentinel comment for MCPorter note idempotency", () => {
    const body = "Use MCP servers for docs lookup."
    const transformed = appendCompatibilityNoteIfNeeded(transformPiBodyContent(body))
    expect(transformed).toContain("<!-- PI_MCPORTER_NOTE -->")
    expect(transformed).toContain("## Pi + MCPorter note")

    const doubleTransformed = appendCompatibilityNoteIfNeeded(transformPiBodyContent(transformed))
    expect(doubleTransformed.match(/<!-- PI_MCPORTER_NOTE -->/g)?.length).toBe(1)
    expect(doubleTransformed.match(/## Pi \+ MCPorter note/g)?.length).toBe(1)
  })

  test("does not duplicate the MCPorter compatibility note on repeated transforms", () => {
    const body = [
      "Use MCP servers for docs lookup.",
      "",
      "<!-- PI_MCPORTER_NOTE -->",
      "## Pi + MCPorter note",
      "For MCP access in Pi, use MCPorter via the generated tools:",
      "- `mcporter_list` to inspect available MCP tools",
      "- `mcporter_call` to invoke a tool",
      "",
    ].join("\n")

    const transformed = appendCompatibilityNoteIfNeeded(transformPiBodyContent(body))
    expect(transformed.match(/## Pi \+ MCPorter note/g)?.length ?? 0).toBe(1)
  })

  test("does not rewrite URL hosts while still rewriting actual slash commands", () => {
    const body = "See https://figma.com/file/123 and then run /figma."
    const transformed = transformPiBodyContent(body, {
      prompts: {
        figma: "figma-2",
      },
    })

    expect(transformed).toContain("https://figma.com/file/123")
    expect(transformed).toContain("/figma-2")
    expect(transformed).not.toContain("https://figma-2.com")
  })
})
