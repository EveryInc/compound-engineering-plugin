import { describe, expect, test } from "bun:test"
import { promises as fs } from "fs"
import path from "path"
import os from "os"
import { mergeCodexConfig, renderCodexConfig, writeCodexBundle } from "../src/targets/codex"
import type { CodexBundle } from "../src/types/codex"

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

describe("writeCodexBundle", () => {
  test("writes prompts, skills, and config", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codex-test-"))
    const bundle: CodexBundle = {
      prompts: [{ name: "command-one", content: "Prompt content" }],
      skillDirs: [
        {
          name: "skill-one",
          sourceDir: path.join(import.meta.dir, "fixtures", "sample-plugin", "skills", "skill-one"),
        },
      ],
      generatedSkills: [{ name: "agent-skill", content: "Skill content" }],
      mcpServers: {
        local: { command: "echo", args: ["hello"], env: { KEY: "VALUE" } },
        remote: {
          url: "https://example.com/mcp",
          headers: { Authorization: "Bearer token" },
        },
      },
    }

    await writeCodexBundle(tempRoot, bundle)

    expect(await exists(path.join(tempRoot, ".codex", "prompts", "command-one.md"))).toBe(true)
    expect(await exists(path.join(tempRoot, ".codex", "skills", "skill-one", "SKILL.md"))).toBe(true)
    expect(await exists(path.join(tempRoot, ".codex", "skills", "agent-skill", "SKILL.md"))).toBe(true)
    const configPath = path.join(tempRoot, ".codex", "config.toml")
    expect(await exists(configPath)).toBe(true)

    const config = await fs.readFile(configPath, "utf8")
    expect(config).toContain("# BEGIN Compound Engineering plugin MCP -- do not edit this block")
    expect(config).toContain("# END Compound Engineering plugin MCP")
    expect(config).toContain("[mcp_servers.local]")
    expect(config).toContain("command = \"echo\"")
    expect(config).toContain("args = [\"hello\"]")
    expect(config).toContain("[mcp_servers.local.env]")
    expect(config).toContain("KEY = \"VALUE\"")
    expect(config).toContain("[mcp_servers.remote]")
    expect(config).toContain("url = \"https://example.com/mcp\"")
    expect(config).toContain("http_headers")
  })

  test("writes directly into a .codex output root", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codex-home-"))
    const codexRoot = path.join(tempRoot, ".codex")
    const bundle: CodexBundle = {
      prompts: [{ name: "command-one", content: "Prompt content" }],
      skillDirs: [
        {
          name: "skill-one",
          sourceDir: path.join(import.meta.dir, "fixtures", "sample-plugin", "skills", "skill-one"),
        },
      ],
      generatedSkills: [],
    }

    await writeCodexBundle(codexRoot, bundle)

    expect(await exists(path.join(codexRoot, "prompts", "command-one.md"))).toBe(true)
    expect(await exists(path.join(codexRoot, "skills", "skill-one", "SKILL.md"))).toBe(true)
  })

  test("copies generated skill sidecar directories", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codex-sidecar-"))
    const sidecarDir = path.join(tempRoot, "source", "session-history-scripts")
    await fs.mkdir(sidecarDir, { recursive: true })
    await fs.writeFile(path.join(sidecarDir, "discover-sessions.sh"), "#!/usr/bin/env bash\n")

    const bundle: CodexBundle = {
      prompts: [],
      skillDirs: [],
      generatedSkills: [
        {
          name: "session-historian",
          content: "Skill content",
          sidecarDirs: [{ sourceDir: sidecarDir, targetName: "session-history-scripts" }],
        },
      ],
    }

    await writeCodexBundle(tempRoot, bundle)

    expect(await exists(
      path.join(
        tempRoot,
        ".codex",
        "skills",
        "session-historian",
        "session-history-scripts",
        "discover-sessions.sh",
      ),
    )).toBe(true)
  })

  test("preserves existing user config when writing MCP servers", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codex-backup-"))
    const codexRoot = path.join(tempRoot, ".codex")
    const configPath = path.join(codexRoot, "config.toml")

    // Create existing config with user settings
    await fs.mkdir(codexRoot, { recursive: true })
    const originalContent = "# My original config\n[custom]\nkey = \"value\"\n"
    await fs.writeFile(configPath, originalContent)

    const bundle: CodexBundle = {
      prompts: [],
      skillDirs: [],
      generatedSkills: [],
      mcpServers: { test: { command: "echo" } },
    }

    await writeCodexBundle(codexRoot, bundle)

    const newConfig = await fs.readFile(configPath, "utf8")
    // Plugin MCP servers should be present in a managed block
    expect(newConfig).toContain("[mcp_servers.test]")
    expect(newConfig).toContain("# BEGIN Compound Engineering plugin MCP -- do not edit this block")
    expect(newConfig).toContain("# END Compound Engineering plugin MCP")
    // User's original config should be preserved
    expect(newConfig).toContain("# My original config")
    expect(newConfig).toContain("[custom]")
    expect(newConfig).toContain('key = "value"')

    // Backup should still exist with original content
    const files = await fs.readdir(codexRoot)
    const backupFileName = files.find((f) => f.startsWith("config.toml.bak."))
    expect(backupFileName).toBeDefined()

    const backupContent = await fs.readFile(path.join(codexRoot, backupFileName!), "utf8")
    expect(backupContent).toBe(originalContent)
  })

  test("is idempotent — running twice does not duplicate managed block", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codex-idempotent-"))
    const codexRoot = path.join(tempRoot, ".codex")
    const configPath = path.join(codexRoot, "config.toml")

    await fs.mkdir(codexRoot, { recursive: true })
    await fs.writeFile(configPath, "[user]\nmodel = \"gpt-4.1\"\n")

    const bundle: CodexBundle = {
      prompts: [],
      skillDirs: [],
      generatedSkills: [],
      mcpServers: { test: { command: "echo" } },
    }

    await writeCodexBundle(codexRoot, bundle)
    await writeCodexBundle(codexRoot, bundle)

    const config = await fs.readFile(configPath, "utf8")
    expect(config.match(/# BEGIN Compound Engineering plugin MCP/g)?.length).toBe(1)
    expect(config.match(/# END Compound Engineering plugin MCP/g)?.length).toBe(1)
    expect(config).toContain("[user]")
  })

  test("migrates old managed block markers to new ones", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codex-migrate-"))
    const codexRoot = path.join(tempRoot, ".codex")
    const configPath = path.join(codexRoot, "config.toml")

    await fs.mkdir(codexRoot, { recursive: true })
    await fs.writeFile(configPath, [
      "[user]",
      'model = "gpt-4.1"',
      "",
      "# BEGIN compound-plugin Claude Code MCP",
      "[mcp_servers.old]",
      'command = "old"',
      "# END compound-plugin Claude Code MCP",
    ].join("\n"))

    const bundle: CodexBundle = {
      prompts: [],
      skillDirs: [],
      generatedSkills: [],
      mcpServers: { fresh: { command: "new" } },
    }

    await writeCodexBundle(codexRoot, bundle)

    const config = await fs.readFile(configPath, "utf8")
    expect(config).not.toContain("# BEGIN compound-plugin Claude Code MCP")
    expect(config).toContain("# BEGIN Compound Engineering plugin MCP")
    expect(config).not.toContain("[mcp_servers.old]")
    expect(config).toContain("[mcp_servers.fresh]")
    expect(config).toContain("[user]")
  })

  test("migrates unmarked legacy format (# Generated by compound-plugin)", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codex-unmarked-"))
    const codexRoot = path.join(tempRoot, ".codex")
    const configPath = path.join(codexRoot, "config.toml")

    // Simulate old writer output: entire file was just the generated config
    await fs.mkdir(codexRoot, { recursive: true })
    await fs.writeFile(configPath, [
      "# Generated by compound-plugin",
      "",
      "[mcp_servers.old]",
      'command = "old"',
      "",
    ].join("\n"))

    const bundle: CodexBundle = {
      prompts: [],
      skillDirs: [],
      generatedSkills: [],
      mcpServers: { fresh: { command: "new" } },
    }

    await writeCodexBundle(codexRoot, bundle)

    const config = await fs.readFile(configPath, "utf8")
    expect(config).not.toContain("# Generated by compound-plugin")
    expect(config).not.toContain("[mcp_servers.old]")
    expect(config).toContain("# BEGIN Compound Engineering plugin MCP")
    expect(config).toContain("[mcp_servers.fresh]")
    // Should have exactly one BEGIN marker (no duplication)
    expect(config.match(/# BEGIN Compound Engineering plugin MCP/g)?.length).toBe(1)
  })

  test("strips stale managed block when plugin has no MCP servers", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codex-stale-"))
    const codexRoot = path.join(tempRoot, ".codex")
    const configPath = path.join(codexRoot, "config.toml")

    await fs.mkdir(codexRoot, { recursive: true })
    await fs.writeFile(configPath, [
      "[user]",
      'model = "gpt-4.1"',
      "",
      "# BEGIN Compound Engineering plugin MCP -- do not edit this block",
      "[mcp_servers.stale]",
      'command = "should-be-removed"',
      "# END Compound Engineering plugin MCP",
    ].join("\n"))

    await writeCodexBundle(codexRoot, { prompts: [], skillDirs: [], generatedSkills: [] })

    const config = await fs.readFile(configPath, "utf8")
    expect(config).not.toContain("mcp_servers.stale")
    expect(config).not.toContain("# BEGIN Compound Engineering")
    expect(config).toContain("[user]")
  })

  test("transforms copied SKILL.md files using Codex invocation targets", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codex-skill-transform-"))
    const sourceSkillDir = path.join(tempRoot, "source-skill")
    await fs.mkdir(sourceSkillDir, { recursive: true })
    await fs.writeFile(
      path.join(sourceSkillDir, "SKILL.md"),
      `---
name: ce:brainstorm
description: Brainstorm workflow
---

Continue with /ce:plan when ready.
Or use /workflows:plan if you're following an older doc.
Use /todo-resolve for deeper research.
`,
    )
    await fs.writeFile(
      path.join(sourceSkillDir, "notes.md"),
      "Reference docs still mention /ce:plan here.\n",
    )

    const bundle: CodexBundle = {
      prompts: [],
      skillDirs: [{ name: "ce:brainstorm", sourceDir: sourceSkillDir }],
      generatedSkills: [],
      invocationTargets: {
        promptTargets: {
          "ce-plan": "ce-plan",
          "workflows-plan": "ce-plan",
          "todo-resolve": "todo-resolve",
        },
        skillTargets: {},
      },
    }

    await writeCodexBundle(tempRoot, bundle)

    const installedSkill = await fs.readFile(
      path.join(tempRoot, ".codex", "skills", "ce-brainstorm", "SKILL.md"),
      "utf8",
    )
    expect(installedSkill).toContain("/prompts:ce-plan")
    expect(installedSkill).not.toContain("/workflows:plan")
    expect(installedSkill).toContain("/prompts:todo-resolve")

    const notes = await fs.readFile(
      path.join(tempRoot, ".codex", "skills", "ce-brainstorm", "notes.md"),
      "utf8",
    )
    expect(notes).toContain("/ce:plan")
  })

  test("transforms namespaced Task calls in copied SKILL.md files", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codex-ns-task-"))
    const sourceSkillDir = path.join(tempRoot, "source-skill")
    await fs.mkdir(sourceSkillDir, { recursive: true })
    await fs.writeFile(
      path.join(sourceSkillDir, "SKILL.md"),
      `---
name: ce:plan
description: Planning workflow
---

Run these research agents:

- Task compound-engineering:research:repo-research-analyst(feature_description)
- Task compound-engineering:research:learnings-researcher(feature_description)

Also run bare agents:

- Task best-practices-researcher(topic)
- Task compound-engineering:review:code-simplicity-reviewer()
`,
    )

    const bundle: CodexBundle = {
      prompts: [],
      skillDirs: [{ name: "ce:plan", sourceDir: sourceSkillDir }],
      generatedSkills: [],
      invocationTargets: {
        promptTargets: {},
        skillTargets: {},
      },
    }

    await writeCodexBundle(tempRoot, bundle)

    const installedSkill = await fs.readFile(
      path.join(tempRoot, ".codex", "skills", "ce-plan", "SKILL.md"),
      "utf8",
    )

    // Namespaced Task calls should be rewritten using the final segment
    expect(installedSkill).toContain("Use the $repo-research-analyst skill to: feature_description")
    expect(installedSkill).toContain("Use the $learnings-researcher skill to: feature_description")
    expect(installedSkill).not.toContain("Task compound-engineering:")

    // Bare Task calls should still be rewritten
    expect(installedSkill).toContain("Use the $best-practices-researcher skill to: topic")
    expect(installedSkill).not.toContain("Task best-practices-researcher")

    // Zero-arg Task calls should be rewritten without trailing "to:"
    expect(installedSkill).toContain("Use the $code-simplicity-reviewer skill")
    expect(installedSkill).not.toContain("code-simplicity-reviewer skill to:")
  })

  test("preserves unknown slash text in copied SKILL.md files", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codex-skill-preserve-"))
    const sourceSkillDir = path.join(tempRoot, "source-skill")
    await fs.mkdir(sourceSkillDir, { recursive: true })
    await fs.writeFile(
      path.join(sourceSkillDir, "SKILL.md"),
      `---
name: proof
description: Proof skill
---

Route examples:
- /users
- /settings

API examples:
- https://www.proofeditor.ai/api/agent/{slug}/state
- https://www.proofeditor.ai/share/markdown

Workflow handoff:
- /ce:plan
`,
    )

    const bundle: CodexBundle = {
      prompts: [],
      skillDirs: [{ name: "proof", sourceDir: sourceSkillDir }],
      generatedSkills: [],
      invocationTargets: {
        promptTargets: {
          "ce-plan": "ce-plan",
        },
        skillTargets: {},
      },
    }

    await writeCodexBundle(tempRoot, bundle)

    const installedSkill = await fs.readFile(
      path.join(tempRoot, ".codex", "skills", "proof", "SKILL.md"),
      "utf8",
    )

    expect(installedSkill).toContain("/users")
    expect(installedSkill).toContain("/settings")
    expect(installedSkill).toContain("https://www.proofeditor.ai/api/agent/{slug}/state")
    expect(installedSkill).toContain("https://www.proofeditor.ai/share/markdown")
    expect(installedSkill).toContain("/prompts:ce-plan")
    expect(installedSkill).not.toContain("/prompts:users")
    expect(installedSkill).not.toContain("/prompts:settings")
    expect(installedSkill).not.toContain("https://prompts:www.proofeditor.ai")
  })
})

describe("renderCodexConfig", () => {
  test("skips servers with neither command nor url", () => {
    const result = renderCodexConfig({ broken: {} })
    expect(result).toBeNull()
  })

  test("skips malformed servers but keeps valid ones", () => {
    const result = renderCodexConfig({
      valid: { command: "echo" },
      broken: {},
      alsoValid: { url: "https://example.com/mcp" },
    })
    expect(result).not.toBeNull()
    expect(result).toContain("[mcp_servers.valid]")
    expect(result).toContain("[mcp_servers.alsoValid]")
    expect(result).not.toContain("[mcp_servers.broken]")
  })

  test("returns null for empty or undefined input", () => {
    expect(renderCodexConfig(undefined)).toBeNull()
    expect(renderCodexConfig({})).toBeNull()
  })
})

describe("mergeCodexConfig", () => {
  test("returns managed block when no existing content", () => {
    const result = mergeCodexConfig("", "[mcp_servers.test]\ncommand = \"echo\"")
    expect(result).toContain("# BEGIN Compound Engineering plugin MCP")
    expect(result).toContain("[mcp_servers.test]")
    expect(result).toContain("# END Compound Engineering plugin MCP")
  })

  test("preserves user content and replaces managed block", () => {
    const existing = [
      "[user]",
      'model = "gpt-4.1"',
      "",
      "# BEGIN Compound Engineering plugin MCP -- do not edit this block",
      "[mcp_servers.old]",
      'command = "old"',
      "# END Compound Engineering plugin MCP",
      "",
      "[after]",
      'key = "value"',
    ].join("\n")

    const result = mergeCodexConfig(existing, "[mcp_servers.new]\ncommand = \"new\"")!
    expect(result).toContain("[user]")
    expect(result).toContain("[after]")
    expect(result).not.toContain("[mcp_servers.old]")
    expect(result).toContain("[mcp_servers.new]")
  })

  test("strips previous-generation markers", () => {
    const existing = [
      "[user]",
      'model = "gpt-4.1"',
      "",
      "# BEGIN compound-plugin Claude Code MCP",
      "[mcp_servers.old]",
      'command = "old"',
      "# END compound-plugin Claude Code MCP",
    ].join("\n")

    const result = mergeCodexConfig(existing, "[mcp_servers.new]\ncommand = \"new\"")!
    expect(result).not.toContain("# BEGIN compound-plugin Claude Code MCP")
    expect(result).not.toContain("[mcp_servers.old]")
    expect(result).toContain("# BEGIN Compound Engineering plugin MCP")
    expect(result).toContain("[mcp_servers.new]")
  })

  test("returns cleaned content (no block) when mcpToml is null", () => {
    const existing = [
      "[user]",
      'model = "gpt-4.1"',
      "",
      "# BEGIN Compound Engineering plugin MCP -- do not edit this block",
      "[mcp_servers.stale]",
      'command = "stale"',
      "# END Compound Engineering plugin MCP",
    ].join("\n")

    const result = mergeCodexConfig(existing, null)!
    expect(result).toContain("[user]")
    expect(result).not.toContain("mcp_servers.stale")
    expect(result).not.toContain("# BEGIN")
  })

  test("strips unmarked legacy format (# Generated by compound-plugin)", () => {
    const existing = [
      "# Generated by compound-plugin",
      "",
      "[mcp_servers.old]",
      'command = "old"',
      "",
    ].join("\n")

    const result = mergeCodexConfig(existing, "[mcp_servers.new]\ncommand = \"new\"")!
    expect(result).not.toContain("# Generated by compound-plugin")
    expect(result).not.toContain("[mcp_servers.old]")
    expect(result).toContain("# BEGIN Compound Engineering plugin MCP")
    expect(result).toContain("[mcp_servers.new]")
  })

  test("preserves user config before unmarked legacy format", () => {
    const existing = [
      "[user]",
      'model = "gpt-4.1"',
      "",
      "# Generated by compound-plugin",
      "",
      "[mcp_servers.old]",
      'command = "old"',
    ].join("\n")

    const result = mergeCodexConfig(existing, "[mcp_servers.new]\ncommand = \"new\"")!
    expect(result).toContain("[user]")
    expect(result).not.toContain("# Generated by compound-plugin")
    expect(result).not.toContain("[mcp_servers.old]")
    expect(result).toContain("[mcp_servers.new]")
  })

  test("returns null when no existing content and no mcpToml", () => {
    expect(mergeCodexConfig("", null)).toBeNull()
  })

  test("returns empty string when file was only a managed block and mcpToml is null", () => {
    const existing = [
      "# BEGIN Compound Engineering plugin MCP -- do not edit this block",
      "[mcp_servers.stale]",
      'command = "stale"',
      "# END Compound Engineering plugin MCP",
    ].join("\n")

    const result = mergeCodexConfig(existing, null)
    expect(result).toBe("")
  })
})
