import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import path from "path"
import {
  convertClaudeToHermes,
  transformContentForHermes,
} from "../src/converters/claude-to-hermes"
import { loadClaudePlugin } from "../src/parsers/claude"
import { parseFrontmatter } from "../src/utils/frontmatter"
import type { ClaudePlugin } from "../src/types/claude"

const fixtureRoot = path.join(import.meta.dir, "fixtures", "sample-plugin")

const baseOptions = {
  agentMode: "subagent" as const,
  inferTemperature: false,
  permissions: "none" as const,
}

function makePlugin(partial: Partial<ClaudePlugin> = {}): ClaudePlugin {
  return {
    root: "/tmp/plugin",
    manifest: { name: "fixture-plugin", version: "1.2.3" },
    agents: [],
    commands: [],
    skills: [],
    hooks: undefined,
    mcpServers: undefined,
    ...partial,
  }
}

// `console.warn` capture so we can assert the explicit-warning behavior on
// disableModelInvocation commands and on MCP entries with neither command
// nor url. Bun's test harness routes console.warn to stderr.
let warnings: string[]
let originalWarn: typeof console.warn

beforeEach(() => {
  warnings = []
  originalWarn = console.warn
  console.warn = (...args: unknown[]) => {
    warnings.push(args.map((arg) => String(arg)).join(" "))
  }
})

afterEach(() => {
  console.warn = originalWarn
})

describe("convertClaudeToHermes — happy path", () => {
  test("passthrough skill is recorded as { name, sourceDir } with frontmatter untouched at convert time", () => {
    const plugin = makePlugin({
      skills: [
        {
          name: "skill-one",
          description: "Sample skill",
          sourceDir: "/abs/skills/skill-one",
          skillPath: "/abs/skills/skill-one/SKILL.md",
        },
      ],
    })

    const bundle = convertClaudeToHermes(plugin, baseOptions)
    expect(bundle).not.toBeNull()
    expect(bundle!.passthroughSkills).toEqual([
      { name: "skill-one", sourceDir: "/abs/skills/skill-one" },
    ])
    // No generated skills produced for plain passthrough.
    expect(bundle!.generatedSkills).toEqual([])
  })

  test("command body Task call rewrites to delegate_task prose and skill name uses cmd- prefix", () => {
    const plugin = makePlugin({
      commands: [
        {
          name: "plan",
          description: "Plan things",
          body: "- Task ce-research-analyst(planning context)",
          sourcePath: "/tmp/plugin/commands/plan.md",
        },
      ],
    })

    const bundle = convertClaudeToHermes(plugin, baseOptions)!
    expect(bundle.generatedSkills).toHaveLength(1)
    const generated = bundle.generatedSkills[0]
    expect(generated.name).toBe("cmd-plan")
    expect(generated.kind).toBe("command")
    const parsed = parseFrontmatter(generated.content)
    expect(parsed.body).toContain("Delegate to the `ce-research-analyst` agent via the `delegate_task` tool")
    expect(parsed.body).toContain("~/.hermes/fixture-plugin/agents/ce-research-analyst.md")
    expect(parsed.body).toContain("Set `goal` to: planning context.")
  })

  test("agent body Task call also rewrites — closes the doc-review-flagged gap that only commands were tested", () => {
    const plugin = makePlugin({
      agents: [
        {
          name: "orchestrator",
          description: "Orchestrate",
          body: "When ready:\n- Task ce-foo(args)",
          sourcePath: "/tmp/plugin/agents/orchestrator.md",
        },
      ],
    })

    const bundle = convertClaudeToHermes(plugin, baseOptions)!
    const agent = bundle.agentPayloads[0]
    expect(agent.name).toBe("orchestrator")
    const parsed = parseFrontmatter(agent.content)
    expect(parsed.body).toContain("Delegate to the `ce-foo` agent via the `delegate_task` tool")
    expect(parsed.body).toContain("~/.hermes/fixture-plugin/agents/ce-foo.md")
    expect(parsed.body).toContain("Set `goal` to: args.")
  })

  test("agent capabilities fold into a Capabilities section above the original body", () => {
    const plugin = makePlugin({
      agents: [
        {
          name: "research-analyst",
          description: "Researcher",
          capabilities: ["a", "b", "c"],
          body: "Analyst body.",
          sourcePath: "/tmp/plugin/agents/research-analyst.md",
        },
      ],
    })

    const bundle = convertClaudeToHermes(plugin, baseOptions)!
    const agent = bundle.agentPayloads[0]
    expect(agent.name).toBe("research-analyst")
    const parsed = parseFrontmatter(agent.content)
    // parseFrontmatter preserves the blank line between closing `---` and body,
    // so trim before structural assertion (matches `formatFrontmatter`'s shape).
    expect(parsed.body.trim()).toBe(
      "## Capabilities\n- a\n- b\n- c\n\nAnalyst body.",
    )
  })

  test("agent with no description gets fallback 'Converted from Claude agent <name>'", () => {
    const plugin = makePlugin({
      agents: [
        {
          name: "lone-agent",
          body: "Body.",
          sourcePath: "/tmp/plugin/agents/lone-agent.md",
        },
      ],
    })

    const bundle = convertClaudeToHermes(plugin, baseOptions)!
    const parsed = parseFrontmatter(bundle.agentPayloads[0].content)
    expect(parsed.data.description).toBe("Converted from Claude agent lone-agent")
  })

  test("command frontmatter description is propagated to Hermes description field", () => {
    const plugin = makePlugin({
      commands: [
        {
          name: "review",
          description: "Run a review",
          body: "Body.",
          sourcePath: "/tmp/plugin/commands/review.md",
        },
      ],
    })

    const bundle = convertClaudeToHermes(plugin, baseOptions)!
    const parsed = parseFrontmatter(bundle.generatedSkills[0].content)
    expect(parsed.data.description).toBe("Run a review")
  })

  test("generated skill frontmatter contains the literal nested YAML block — verifies inline construction, not formatFrontmatter", () => {
    const plugin = makePlugin({
      manifest: { name: "compound-engineering", version: "3.4.1" },
      commands: [
        {
          name: "ce-plan",
          description: "Plan: with colon trigger",
          body: "Body.",
          sourcePath: "/tmp/plugin/commands/ce-plan.md",
        },
      ],
    })

    const bundle = convertClaudeToHermes(plugin, baseOptions)!
    const generated = bundle.generatedSkills[0]
    // Exact literal block — proves inline string construction, not YAML
    // emitter that might reorder keys or render `metadata.hermes.tags` as
    // `[object Object]`. The description carries a colon so it must be
    // JSON-quoted.
    expect(generated.content).toContain(
      [
        "name: cmd-ce-plan",
        'description: "Plan: with colon trigger"',
        'version: "3.4.1"',
        "metadata:",
        "  hermes:",
        "    tags:",
        "      - Command",
      ].join("\n"),
    )
  })
})

describe("convertClaudeToHermes — edge cases", () => {
  test("skill with ce_platforms: [claude] is dropped from Hermes output", () => {
    const plugin = makePlugin({
      skills: [
        {
          name: "claude-only",
          description: "Claude only",
          ce_platforms: ["claude"],
          sourceDir: "/abs/skills/claude-only",
          skillPath: "/abs/skills/claude-only/SKILL.md",
        },
      ],
    })

    const bundle = convertClaudeToHermes(plugin, baseOptions)!
    expect(bundle.passthroughSkills).toEqual([])
  })

  test("skill with ce_platforms: [hermes, claude] is included", () => {
    const plugin = makePlugin({
      skills: [
        {
          name: "shared",
          description: "Shared",
          ce_platforms: ["hermes", "claude"],
          sourceDir: "/abs/skills/shared",
          skillPath: "/abs/skills/shared/SKILL.md",
        },
      ],
    })

    const bundle = convertClaudeToHermes(plugin, baseOptions)!
    expect(bundle.passthroughSkills).toEqual([
      { name: "shared", sourceDir: "/abs/skills/shared" },
    ])
  })

  test("disableModelInvocation: true command — dropped AND warning emitted naming the command", () => {
    const plugin = makePlugin({
      commands: [
        {
          name: "deploy-docs",
          description: "Deploy docs",
          disableModelInvocation: true,
          body: "Body.",
          sourcePath: "/tmp/plugin/commands/deploy-docs.md",
        },
      ],
    })

    const bundle = convertClaudeToHermes(plugin, baseOptions)!
    expect(bundle.generatedSkills).toEqual([])
    expect(bundle.droppedCommands).toEqual(["deploy-docs"])
    expect(warnings.some((w) => w.includes("deploy-docs"))).toBe(true)
    expect(warnings.some((w) => w.includes("disableModelInvocation"))).toBe(true)
  })

  test("agent.model is dropped — Hermes routes models elsewhere", () => {
    const plugin = makePlugin({
      agents: [
        {
          name: "tuned-agent",
          description: "Has model",
          model: "sonnet",
          body: "Body.",
          sourcePath: "/tmp/plugin/agents/tuned-agent.md",
        },
      ],
    })

    const bundle = convertClaudeToHermes(plugin, baseOptions)!
    const payload = bundle.agentPayloads[0]
    const parsed = parseFrontmatter(payload.content)
    expect(parsed.data.model).toBeUndefined()
    // And no stray `model:` line in raw content either.
    expect(payload.content).not.toContain("\nmodel:")
  })

  test("collision: two agents both normalize to 'code-reviewer' get -2 suffix", () => {
    const plugin = makePlugin({
      agents: [
        {
          name: "code-reviewer",
          description: "first",
          body: "Body.",
          sourcePath: "/tmp/plugin/agents/code-reviewer-a.md",
        },
        {
          name: "code-reviewer",
          description: "second",
          body: "Body.",
          sourcePath: "/tmp/plugin/agents/code-reviewer-b.md",
        },
      ],
    })

    const bundle = convertClaudeToHermes(plugin, baseOptions)!
    const names = bundle.agentPayloads.map((p) => p.name)
    expect(names).toEqual(["code-reviewer", "code-reviewer-2"])
  })

  test("non-ASCII skill name 'ce:plán' (combining mark) sanitizes to 'ce-plan' via NFKD wrapper", () => {
    const plugin = makePlugin({
      commands: [
        {
          name: "ce:plán",
          description: "Planner",
          body: "Body.",
          sourcePath: "/tmp/plugin/commands/ce-plan.md",
        },
      ],
    })

    const bundle = convertClaudeToHermes(plugin, baseOptions)!
    expect(bundle.generatedSkills[0].name).toBe("cmd-ce-plan")
  })

  test("CJK skill name '中文-skill' sanitizes to ASCII fallback via NFKD + non-ASCII strip", () => {
    const plugin = makePlugin({
      commands: [
        {
          name: "中文-skill",
          description: "CJK command",
          body: "Body.",
          sourcePath: "/tmp/plugin/commands/cjk.md",
        },
      ],
    })

    const bundle = convertClaudeToHermes(plugin, baseOptions)!
    // Non-ASCII characters (CJK ideographs) collapse to '-'; subsequent
    // sanitizePathName + uniqueName preserve the prefix and ASCII tail.
    const name = bundle.generatedSkills[0].name
    expect(name).toMatch(/^cmd-[-a-z0-9]+$/)
    expect(name).toContain("skill")
    expect(name.normalize("NFC")).toBe(name)
    expect(/[^\x00-\x7f]/.test(name)).toBe(false)
  })

  test("passthrough skill name colliding with generated 'cmd-' prefix gets disambiguated", () => {
    const plugin = makePlugin({
      skills: [
        {
          name: "cmd-plan",
          sourceDir: "/tmp/plugin/skills/cmd-plan",
          skillPath: "/tmp/plugin/skills/cmd-plan/SKILL.md",
        },
      ],
      commands: [
        {
          name: "plan",
          description: "Plan",
          body: "Body.",
          sourcePath: "/tmp/plugin/commands/plan.md",
        },
      ],
    })

    const bundle = convertClaudeToHermes(plugin, baseOptions)!
    // Passthrough preserves its source name `cmd-plan`. Generated command
    // would normalize to `cmd-plan` too, so dedup escalates it to
    // `cmd-plan-2` rather than silently overwriting the passthrough.
    expect(bundle.passthroughSkills[0].name).toBe("cmd-plan")
    expect(bundle.generatedSkills[0].name).toBe("cmd-plan-2")
  })
})

describe("convertClaudeToHermes — slash-command namespace handling", () => {
  test("namespaced refs that aren't `prompts:`/`workflows:`/`skill:` pass through unchanged", () => {
    const plugin = makePlugin({
      commands: [
        {
          name: "linkable",
          description: "Refs",
          body: "See /pr:123 and /api:v1 and /issue:42 — none should be rewritten.",
          sourcePath: "/tmp/plugin/commands/linkable.md",
        },
      ],
    })

    const bundle = convertClaudeToHermes(plugin, baseOptions)!
    const body = bundle.generatedSkills[0].content
    expect(body).toContain("/pr:123")
    expect(body).toContain("/api:v1")
    expect(body).toContain("/issue:42")
    expect(body).not.toContain("/pr-123")
    expect(body).not.toContain("/api-v1")
  })

  test("anchored `.claude/` rewrite leaves `mydomain.claude/path` alone", () => {
    const plugin = makePlugin({
      commands: [
        {
          name: "url",
          description: "URL",
          body: "Visit https://mydomain.claude/path and ~/.claude/skills as separate cases.",
          sourcePath: "/tmp/plugin/commands/url.md",
        },
      ],
    })

    const bundle = convertClaudeToHermes(plugin, baseOptions)!
    const body = bundle.generatedSkills[0].content
    expect(body).toContain("mydomain.claude/path")
    expect(body).toContain("~/.hermes/skills")
  })
})

describe("convertClaudeToHermes — error paths", () => {
  test("MCP entry with neither command nor url — skipped, warning emitted, name tracked", () => {
    const plugin = makePlugin({
      mcpServers: {
        "context7": { url: "https://mcp.context7.com/mcp" },
        "broken": { type: "stdio" },
      },
    })

    const bundle = convertClaudeToHermes(plugin, baseOptions)!
    expect(bundle.mcpConfig?.mcp_servers).toEqual({
      context7: { url: "https://mcp.context7.com/mcp" },
    })
    expect(bundle.skippedMcpServers).toEqual(["broken"])
    expect(warnings.some((w) => w.includes("broken"))).toBe(true)
    expect(warnings.some((w) => w.includes("neither"))).toBe(true)
  })
})

describe("convertClaudeToHermes — integration", () => {
  test("sample-plugin fixture conversion produces expected counts and shapes", async () => {
    const plugin = await loadClaudePlugin(fixtureRoot)
    const bundle = convertClaudeToHermes(plugin, baseOptions)
    expect(bundle).not.toBeNull()

    // Skill with ce_platforms: [claude] is excluded.
    expect(bundle!.passthroughSkills.map((s) => s.name)).not.toContain("claude-only-skill")
    // Other skills present.
    expect(bundle!.passthroughSkills.map((s) => s.name)).toContain("skill-one")

    // Commands with disableModelInvocation: true (deploy-docs) excluded.
    const generatedCmdNames = bundle!.generatedSkills
      .filter((s) => s.kind === "command")
      .map((s) => s.name)
    expect(generatedCmdNames).not.toContain("cmd-deploy-docs")
    // disableModelInvocation tracked on the bundle.
    expect(bundle!.droppedCommands).toContain("deploy-docs")

    // Agents present as payloads (no prefix).
    const agentNames = bundle!.agentPayloads.map((p) => p.name)
    expect(agentNames).toContain("repo-research-analyst")
    expect(agentNames).toContain("security-sentinel")

    // MCP config carries both fixture entries.
    expect(bundle!.mcpConfig?.mcp_servers).toEqual({
      context7: { url: "https://mcp.context7.com/mcp" },
      "local-tooling": { command: "echo", args: ["fixture"] },
    })
    expect(bundle!.skippedMcpServers).toEqual([])

    // Bundle-level pluginName carries through from the manifest.
    expect(bundle!.pluginName).toBe("compound-engineering")
  })
})

describe("transformContentForHermes — regressions", () => {
  test("slash-command namespace stripping preserves URLs and shell paths in the extended allowlist", () => {
    // Each input is an exact-passthrough expectation — verifies the
    // doc-review-flagged false-match risks are now neutralized.
    const cases = [
      "https://example.com/path",
      "POST /users",
      "GET /sys/info",
      "/etc/passwd",
      "/usr/bin",
      "/opt/foo",
      "/Applications/X.app",
      "/Users/me/file.txt",
      "/sys/class",
      "/proc/cpuinfo",
      "/dev/null",
      "/var/log",
      "/tmp/scratch",
      "/home/user",
      "/bin/bash",
    ]
    for (const input of cases) {
      const out = transformContentForHermes(input)
      expect(out).toBe(input)
    }
  })

  test("markdown reference-style link [text](/path/to/page) passes through unchanged", () => {
    // Even though `path` is not on the allowlist, normalizeName("path") ===
    // "path", so a passthrough is the observable expectation.
    const input = "see [link text](/path/to/page) for details"
    expect(transformContentForHermes(input)).toBe(input)
  })

  test("/workflows:plan -> /plan; /prompts:foo -> /foo; /skill:bar preserved", () => {
    const input = "Run /workflows:plan, then /prompts:foo, but keep /skill:bar."
    const out = transformContentForHermes(input)
    expect(out).toContain("/plan")
    expect(out).toContain("/foo")
    expect(out).toContain("/skill:bar")
    expect(out).not.toContain("/workflows:")
    expect(out).not.toContain("/prompts:")
  })

  test("Task call with quoted/comma args rewrites to delegate_task prose", () => {
    const input = "- Task ce-research-analyst(planning context summary)"
    const out = transformContentForHermes(input)
    expect(out).toBe("- Delegate to the `ce-research-analyst` agent via the `delegate_task` tool. Read the agent's prompt at `~/.hermes/compound-engineering/agents/ce-research-analyst.md` and use it as the `context` argument. Set `goal` to: planning context summary. Use the toolsets declared in the payload's frontmatter.")
  })

  test("zero-argument Task call becomes delegate_task prose with goal summary hint", () => {
    const input = "- Task ce-research-analyst()"
    const out = transformContentForHermes(input)
    expect(out).toBe("- Delegate to the `ce-research-analyst` agent via the `delegate_task` tool. Read the agent's prompt at `~/.hermes/compound-engineering/agents/ce-research-analyst.md` and use it as the `context` argument. Set `goal` to a one-line summary of the requested work. Use the toolsets declared in the payload's frontmatter.")
  })

  test("namespaced Task agent uses the final segment", () => {
    const input = "- Task compound-engineering:research:repo-research-analyst(args)"
    const out = transformContentForHermes(input)
    expect(out).toBe("- Delegate to the `repo-research-analyst` agent via the `delegate_task` tool. Read the agent's prompt at `~/.hermes/compound-engineering/agents/repo-research-analyst.md` and use it as the `context` argument. Set `goal` to: args. Use the toolsets declared in the payload's frontmatter.")
  })

  test("${CLAUDE_PLUGIN_ROOT}/scripts/foo.py -> ${HERMES_SKILL_DIR}/scripts/foo.py", () => {
    const input = "Run ${CLAUDE_PLUGIN_ROOT}/scripts/foo.py with args"
    const out = transformContentForHermes(input)
    expect(out).toBe("Run ${HERMES_SKILL_DIR}/scripts/foo.py with args")
  })

  test("${CLAUDE_SKILL_DIR} also rewrites to ${HERMES_SKILL_DIR}", () => {
    const input = "Reference ${CLAUDE_SKILL_DIR}/file.md"
    const out = transformContentForHermes(input)
    expect(out).toBe("Reference ${HERMES_SKILL_DIR}/file.md")
  })

  test("~/.claude/ paths rewrite to ~/.hermes/", () => {
    const input = "Edit ~/.claude/settings.json or ~/.claude/skills/foo"
    const out = transformContentForHermes(input)
    expect(out).toBe("Edit ~/.hermes/settings.json or ~/.hermes/skills/foo")
  })

  test(".claude/ paths rewrite to .hermes/", () => {
    const input = "Look under .claude/agents and .claude/commands."
    const out = transformContentForHermes(input)
    expect(out).toBe("Look under .hermes/agents and .hermes/commands.")
  })

  test("TaskCreate/TaskUpdate/TaskList/TaskGet/TaskStop/TaskOutput/TodoWrite/TodoRead all map to platform-generic phrase", () => {
    const tokens = [
      "TaskCreate",
      "TaskUpdate",
      "TaskList",
      "TaskGet",
      "TaskStop",
      "TaskOutput",
      "TodoWrite",
      "TodoRead",
    ]
    for (const token of tokens) {
      const out = transformContentForHermes(`Use ${token} for state.`)
      expect(out).not.toContain(token)
      expect(out).toContain("the platform's task-tracking primitive")
    }
  })

  test("agent description containing literal ':' is JSON-quoted in inline frontmatter", () => {
    const plugin = makePlugin({
      agents: [
        {
          name: "explainer",
          description: "Use this for: deep dives into systems",
          body: "Body.",
          sourcePath: "/tmp/plugin/agents/explainer.md",
        },
      ],
    })

    const bundle = convertClaudeToHermes(plugin, baseOptions)!
    const payload = bundle.agentPayloads[0]
    // The colon-bearing description must be JSON-quoted; otherwise YAML
    // parsing would treat the leading word as a key.
    expect(payload.content).toContain(
      'description: "Use this for: deep dives into systems"',
    )
    // And the parsed-back data round-trips to the original string.
    const parsed = parseFrontmatter(payload.content)
    expect(parsed.data.description).toBe("Use this for: deep dives into systems")
  })
})
