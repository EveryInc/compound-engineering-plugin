import { describe, expect, test } from "bun:test"
import { promises as fs } from "fs"
import path from "path"
import os from "os"
import { writeCodexBundle } from "../src/targets/codex"
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

  test("backs up existing config.toml before overwriting", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codex-backup-"))
    const codexRoot = path.join(tempRoot, ".codex")
    const configPath = path.join(codexRoot, "config.toml")

    // Create existing config
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

    // New config should be written
    const newConfig = await fs.readFile(configPath, "utf8")
    expect(newConfig).toContain("[mcp_servers.test]")

    // Backup should exist with original content
    const files = await fs.readdir(codexRoot)
    const backupFileName = files.find((f) => f.startsWith("config.toml.bak."))
    expect(backupFileName).toBeDefined()

    const backupContent = await fs.readFile(path.join(codexRoot, backupFileName!), "utf8")
    expect(backupContent).toBe(originalContent)
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
Use /deepen-plan for deeper research.
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
          "deepen-plan": "deepen-plan",
        },
        skillTargets: {},
      },
    }

    await writeCodexBundle(tempRoot, bundle)

    const installedSkill = await fs.readFile(
      path.join(tempRoot, ".codex", "skills", "ce:brainstorm", "SKILL.md"),
      "utf8",
    )
    expect(installedSkill).toContain("/prompts:ce-plan")
    expect(installedSkill).not.toContain("/workflows:plan")
    expect(installedSkill).toContain("/prompts:deepen-plan")

    const notes = await fs.readFile(
      path.join(tempRoot, ".codex", "skills", "ce:brainstorm", "notes.md"),
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
      path.join(tempRoot, ".codex", "skills", "ce:plan", "SKILL.md"),
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
