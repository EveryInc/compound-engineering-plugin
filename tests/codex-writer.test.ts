import { describe, expect, test } from "bun:test"
import { promises as fs } from "fs"
import path from "path"
import os from "os"
import { mergeCodexConfig, renderCodexConfig, writeCodexBundle } from "../src/targets/codex"
import type { CodexBundle } from "../src/types/codex"
import { loadClaudePlugin } from "../src/parsers/claude"
import { convertClaudeToCodex } from "../src/converters/claude-to-codex"

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

async function entryExists(filePath: string): Promise<boolean> {
  try {
    await fs.lstat(filePath)
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
      agents: [
        {
          name: "research-ce-repo-research-analyst",
          description: "Repo research",
          instructions: "Research the repository.",
        },
      ],
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
    const agentPath = path.join(tempRoot, ".codex", "agents", "research-ce-repo-research-analyst.toml")
    expect(await exists(agentPath)).toBe(true)
    const agentToml = await fs.readFile(agentPath, "utf8")
    expect(agentToml).toContain('name = "research-ce-repo-research-analyst"')
    expect(agentToml).toContain('developer_instructions = "Research the repository."')
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

  test("throws when two agents sanitize to the same Codex filename", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codex-agent-collision-"))
    const bundle: CodexBundle = {
      prompts: [],
      skillDirs: [],
      generatedSkills: [],
      agents: [
        {
          name: "research:ce-learnings-researcher",
          description: "First",
          instructions: "First agent body.",
        },
        {
          name: "research-ce-learnings-researcher",
          description: "Second",
          instructions: "Second agent body.",
        },
      ],
    }

    await expect(writeCodexBundle(tempRoot, bundle)).rejects.toThrow(
      /Codex agent filename collision/,
    )

    // Verify neither agent was silently dropped: the first agent should not have
    // been written before the collision was detected (guard runs before writes).
    const agentsRoot = path.join(tempRoot, ".codex", "agents")
    expect(
      await exists(path.join(agentsRoot, "research-ce-learnings-researcher.toml")),
    ).toBe(false)
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

  test("preserves same-named user prompts during stale prompt cleanup", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codex-prompts-preserve-"))
    const codexRoot = path.join(tempRoot, ".codex")
    const promptsDir = path.join(codexRoot, "prompts")
    await fs.mkdir(promptsDir, { recursive: true })
    await fs.writeFile(
      path.join(promptsDir, "ce-plan.md"),
      "---\ndescription: \"Project-local ce-plan helper\"\n---\n\nCustom prompt body\n",
    )

    await writeCodexBundle(codexRoot, { prompts: [], skillDirs: [], generatedSkills: [] })

    expect(await exists(path.join(promptsDir, "ce-plan.md"))).toBe(true)
  })

  test("preserves same-named user prompts when pluginName triggers legacy allow-list cleanup", async () => {
    // Regression: `cleanupKnownLegacyCodexArtifacts` used to move any
    // allow-listed filename under `~/.codex/prompts/` into
    // `compound-engineering/legacy-backup/` whenever `pluginName` was set,
    // without checking that CE authored the file. A user-authored
    // `ce-plan.md` prompt was therefore destroyed on `install --to codex`
    // even though the content was not a CE-emitted wrapper. The install path
    // now requires the same body + frontmatter ownership fingerprint that
    // the standalone `cleanupStalePrompts` helper uses before touching a
    // prompt file at a colliding legacy name.
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codex-prompts-legacy-preserve-"))
    const codexRoot = path.join(tempRoot, ".codex")
    const promptsDir = path.join(codexRoot, "prompts")
    await fs.mkdir(promptsDir, { recursive: true })
    const userPromptBody =
      "---\ndescription: \"Project-local ce-plan helper\"\n---\n\nCustom prompt body\n"
    await fs.writeFile(path.join(promptsDir, "ce-plan.md"), userPromptBody)

    await writeCodexBundle(codexRoot, {
      pluginName: "compound-engineering",
      prompts: [],
      skillDirs: [],
      generatedSkills: [],
    })

    expect(await exists(path.join(promptsDir, "ce-plan.md"))).toBe(true)
    expect(await fs.readFile(path.join(promptsDir, "ce-plan.md"), "utf8")).toBe(userPromptBody)
    const backupRoot = path.join(codexRoot, "compound-engineering", "legacy-backup")
    // The legacy-backup directory should not contain the user-authored prompt.
    if (await exists(backupRoot)) {
      const timestamps = await fs.readdir(backupRoot)
      for (const timestamp of timestamps) {
        const promptsBackup = path.join(backupRoot, timestamp, "prompts")
        if (await exists(promptsBackup)) {
          const backedUp = await fs.readdir(promptsBackup)
          expect(backedUp).not.toContain("ce-plan.md")
        }
      }
    }
  })

  test("writes plugin skills under a namespaced Codex skills root without .agents symlinks", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codex-managed-plugin-"))
    const codexRoot = path.join(tempRoot, ".codex")
    const bundle: CodexBundle = {
      pluginName: "compound-engineering",
      prompts: [{ name: "old-prompt", content: "Prompt content" }],
      skillDirs: [
        {
          name: "skill-one",
          sourceDir: path.join(import.meta.dir, "fixtures", "sample-plugin", "skills", "skill-one"),
        },
      ],
      generatedSkills: [{ name: "old-command", content: "Old command" }],
      agents: [{ name: "old-agent", description: "Old agent", instructions: "Old agent body" }],
    }

    await writeCodexBundle(codexRoot, bundle)

    const managedSkillsRoot = path.join(codexRoot, "skills", "compound-engineering")
    const managedAgentsRoot = path.join(codexRoot, "agents", "compound-engineering")
    expect(await exists(path.join(managedSkillsRoot, "skill-one", "SKILL.md"))).toBe(true)
    expect(await exists(path.join(managedSkillsRoot, "old-command", "SKILL.md"))).toBe(true)
    expect(await exists(path.join(managedAgentsRoot, "old-agent.toml"))).toBe(true)
    expect(await exists(path.join(tempRoot, ".agents", "skills", "skill-one"))).toBe(false)
    expect(await exists(path.join(tempRoot, ".agents", "skills", "old-agent"))).toBe(false)
    expect(await exists(path.join(codexRoot, "compound-engineering", "install-manifest.json"))).toBe(true)

    await writeCodexBundle(codexRoot, {
      pluginName: "compound-engineering",
      prompts: [{ name: "new-prompt", content: "Prompt content" }],
      skillDirs: [],
      generatedSkills: [{ name: "new-command", content: "New command" }],
      agents: [{ name: "new-agent", description: "New agent", instructions: "New agent body" }],
    })

    expect(await exists(path.join(managedSkillsRoot, "skill-one", "SKILL.md"))).toBe(false)
    expect(await exists(path.join(managedSkillsRoot, "old-command", "SKILL.md"))).toBe(false)
    expect(await exists(path.join(managedSkillsRoot, "new-command", "SKILL.md"))).toBe(true)
    expect(await exists(path.join(managedAgentsRoot, "old-agent.toml"))).toBe(false)
    expect(await exists(path.join(managedAgentsRoot, "new-agent.toml"))).toBe(true)
    expect(await exists(path.join(tempRoot, ".agents", "skills", "new-agent"))).toBe(false)
    expect(await exists(path.join(codexRoot, "prompts", "old-prompt.md"))).toBe(false)
    expect(await exists(path.join(codexRoot, "prompts", "new-prompt.md"))).toBe(true)
  })

  test("removes legacy .agents symlinks that point to managed Codex skills", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codex-flat-symlink-"))
    const codexRoot = path.join(tempRoot, ".codex")
    const previousManagedSkillsRoot = path.join(codexRoot, "compound-engineering", "skills")
    const agentsSkillsDir = path.join(tempRoot, ".agents", "skills")

    await fs.mkdir(path.join(previousManagedSkillsRoot, "old-agent"), { recursive: true })
    await fs.mkdir(path.join(previousManagedSkillsRoot, "reproduce-bug"), { recursive: true })
    await fs.writeFile(
      path.join(codexRoot, "compound-engineering", "install-manifest.json"),
      JSON.stringify({ version: 1, pluginName: "compound-engineering", skills: ["old-agent"], prompts: [] }),
    )
    await fs.mkdir(agentsSkillsDir, { recursive: true })
    await fs.symlink(previousManagedSkillsRoot, path.join(agentsSkillsDir, "compound-engineering"))
    await fs.symlink(
      path.join(previousManagedSkillsRoot, "old-agent"),
      path.join(agentsSkillsDir, "old-agent"),
    )
    await fs.symlink(
      path.join(previousManagedSkillsRoot, "reproduce-bug"),
      path.join(agentsSkillsDir, "reproduce-bug"),
    )

    const unrelatedRoot = path.join(tempRoot, "other-skills", "skill-one")
    await fs.mkdir(unrelatedRoot, { recursive: true })
    await fs.symlink(unrelatedRoot, path.join(agentsSkillsDir, "skill-one"))

    await writeCodexBundle(codexRoot, {
      pluginName: "compound-engineering",
      prompts: [],
      skillDirs: [
        {
          name: "skill-one",
          sourceDir: path.join(import.meta.dir, "fixtures", "sample-plugin", "skills", "skill-one"),
        },
      ],
      generatedSkills: [],
    })

    expect(await entryExists(path.join(agentsSkillsDir, "compound-engineering"))).toBe(false)
    expect(await entryExists(path.join(agentsSkillsDir, "old-agent"))).toBe(false)
    expect(await entryExists(path.join(agentsSkillsDir, "reproduce-bug"))).toBe(false)
    expect(await fs.realpath(path.join(agentsSkillsDir, "skill-one"))).toBe(await fs.realpath(unrelatedRoot))
    expect(await exists(previousManagedSkillsRoot)).toBe(false)
  })

  test("moves legacy flat Codex CE artifacts to a namespaced backup", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codex-legacy-skill-"))
    const codexRoot = path.join(tempRoot, ".codex")
    await fs.mkdir(path.join(codexRoot, "skills", "ce-plan"), { recursive: true })
    await fs.writeFile(path.join(codexRoot, "skills", "ce-plan", "SKILL.md"), "legacy current workflow skill")
    await fs.mkdir(path.join(codexRoot, "skills", "ce:plan"), { recursive: true })
    await fs.writeFile(path.join(codexRoot, "skills", "ce:plan", "SKILL.md"), "legacy raw colon workflow skill")
    await fs.mkdir(path.join(codexRoot, "skills", "ce:plan-beta"), { recursive: true })
    await fs.writeFile(path.join(codexRoot, "skills", "ce:plan-beta", "SKILL.md"), "legacy raw colon beta workflow skill")
    await fs.mkdir(path.join(codexRoot, "skills", "repo-research-analyst"), { recursive: true })
    await fs.writeFile(path.join(codexRoot, "skills", "repo-research-analyst", "SKILL.md"), "legacy current agent skill")
    await fs.mkdir(path.join(codexRoot, "skills", "reproduce-bug"), { recursive: true })
    await fs.writeFile(path.join(codexRoot, "skills", "reproduce-bug", "SKILL.md"), "legacy removed skill")
    await fs.mkdir(path.join(codexRoot, "skills", "bug-reproduction-validator"), { recursive: true })
    await fs.writeFile(path.join(codexRoot, "skills", "bug-reproduction-validator", "SKILL.md"), "legacy removed agent skill")
    await fs.mkdir(path.join(codexRoot, "prompts"), { recursive: true })
    await fs.writeFile(path.join(codexRoot, "prompts", "reproduce-bug.md"), "legacy removed prompt")
    await fs.writeFile(path.join(codexRoot, "prompts", "report-bug.md"), "legacy deleted command prompt")

    const plugin = await loadClaudePlugin(path.join(import.meta.dir, "..", "plugins", "compound-engineering"))
    const bundle = convertClaudeToCodex(plugin, {
      agentMode: "subagent",
      inferTemperature: true,
      permissions: "none",
    })
    await writeCodexBundle(codexRoot, bundle)

    expect(await exists(path.join(codexRoot, "skills", "ce-plan"))).toBe(false)
    expect(await exists(path.join(codexRoot, "skills", "ce:plan"))).toBe(false)
    expect(await exists(path.join(codexRoot, "skills", "ce:plan-beta"))).toBe(false)
    expect(await exists(path.join(codexRoot, "skills", "repo-research-analyst"))).toBe(false)
    expect(await exists(path.join(codexRoot, "skills", "reproduce-bug"))).toBe(false)
    expect(await exists(path.join(codexRoot, "skills", "bug-reproduction-validator"))).toBe(false)
    expect(await exists(path.join(codexRoot, "prompts", "reproduce-bug.md"))).toBe(false)
    expect(await exists(path.join(codexRoot, "prompts", "report-bug.md"))).toBe(false)
    expect(await exists(path.join(codexRoot, "compound-engineering", "legacy-backup"))).toBe(true)
  })

  test("preserves unrelated user skills at flat ~/.codex/skills/<name>/ that share a name with a current CE skill", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codex-user-skill-collide-"))
    const codexRoot = path.join(tempRoot, ".codex")

    // ce-demo-reel is the name of a current CE skill, but it has never been
    // shipped as a flat ~/.codex/skills/ce-demo-reel/ install (the historical
    // flat name was "demo-reel"). A user could plausibly have authored their
    // own ce-demo-reel skill at the flat path. The first install of CE must
    // not move it to backup.
    const userSkillDir = path.join(codexRoot, "skills", "ce-demo-reel")
    await fs.mkdir(userSkillDir, { recursive: true })
    const userSkillContent = "# user-authored skill, not from CE"
    await fs.writeFile(path.join(userSkillDir, "SKILL.md"), userSkillContent)

    // Same for ce-debug — current CE skill name, never in the historical
    // flat-path allow-list, so a same-named user skill must be preserved.
    const userDebugDir = path.join(codexRoot, "skills", "ce-debug")
    await fs.mkdir(userDebugDir, { recursive: true })
    await fs.writeFile(path.join(userDebugDir, "SKILL.md"), "# user debug skill")

    const plugin = await loadClaudePlugin(path.join(import.meta.dir, "..", "plugins", "compound-engineering"))
    const bundle = convertClaudeToCodex(plugin, {
      agentMode: "subagent",
      inferTemperature: true,
      permissions: "none",
    })
    await writeCodexBundle(codexRoot, bundle)

    // The user skills survive the install — same path, same content.
    expect(await exists(path.join(userSkillDir, "SKILL.md"))).toBe(true)
    expect(await fs.readFile(path.join(userSkillDir, "SKILL.md"), "utf8")).toBe(userSkillContent)
    expect(await exists(path.join(userDebugDir, "SKILL.md"))).toBe(true)

    // And they are not silently relocated to the legacy backup.
    const backupRoot = path.join(codexRoot, "compound-engineering", "legacy-backup")
    if (await exists(backupRoot)) {
      const timestamps = await fs.readdir(backupRoot)
      for (const ts of timestamps) {
        const skillsBackup = path.join(backupRoot, ts, "skills")
        if (!(await exists(skillsBackup))) continue
        const backed = await fs.readdir(skillsBackup)
        expect(backed).not.toContain("ce-demo-reel")
        expect(backed).not.toContain("ce-debug")
      }
    }
  })

  test("sweeps flat-alias skill dir left by a prior layout when the new bundle's agent name has embedded -ce-", async () => {
    // Third-party plugins with nested agent directories (e.g. agents/review/ce-foo.md)
    // produce Codex agent names like `review-ce-foo`. If the same logical agent
    // was previously installed under a flat layout (raw codex name `ce-foo`),
    // the now-orphaned skill dir at `.codex/skills/<plugin>/ce-foo/` should be
    // moved into legacy-backup on the next install. This is the only cleanup
    // path available for third-party plugins, which have no entry in the
    // historical allow-list used by getLegacyCodexArtifacts.
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codex-nested-xmigrate-"))
    const codexRoot = path.join(tempRoot, ".codex")
    const pluginName = "third-party-nested"
    const managedSkillsRoot = path.join(codexRoot, "skills", pluginName)

    // Simulate orphan flat-alias skill dir from the earlier layout.
    await fs.mkdir(path.join(managedSkillsRoot, "ce-foo"), { recursive: true })
    await fs.writeFile(
      path.join(managedSkillsRoot, "ce-foo", "SKILL.md"),
      "stale flat-alias skill from prior install",
    )

    await writeCodexBundle(codexRoot, {
      pluginName,
      prompts: [],
      skillDirs: [],
      generatedSkills: [],
      agents: [
        {
          name: "review-ce-foo",
          description: "Nested-layout agent",
          instructions: "Do review work on foo.",
        },
      ],
    })

    // The current install writes the nested-layout agent, not a same-named skill dir.
    expect(await exists(path.join(codexRoot, "agents", pluginName, "review-ce-foo.toml"))).toBe(true)

    // The orphan flat-alias skill dir should have been relocated.
    expect(await exists(path.join(managedSkillsRoot, "ce-foo"))).toBe(false)

    // And should be reachable under legacy-backup.
    const backupRoot = path.join(codexRoot, pluginName, "legacy-backup")
    expect(await exists(backupRoot)).toBe(true)
    const timestamps = await fs.readdir(backupRoot)
    let foundBackup = false
    for (const ts of timestamps) {
      const skillsBackup = path.join(backupRoot, ts, "skills")
      if (!(await exists(skillsBackup))) continue
      const backed = await fs.readdir(skillsBackup)
      if (backed.includes("ce-foo")) foundBackup = true
    }
    expect(foundBackup).toBe(true)
  })

  test("agents-only install preserves namespaced skills previously installed via Codex native plugin flow", async () => {
    // Regression for the bug where re-running `install --to codex` after a
    // native `/plugins` install moved currently-active namespaced skills
    // (e.g., `.codex/skills/compound-engineering/ce-plan/`) into
    // legacy-backup. The agents-only default produces an empty `skillDirs` /
    // `generatedSkills`, but the converter now populates
    // `externallyManagedSkillNames` with the allow-listed current skills so
    // `cleanupLegacyAgentSkillDirs` treats them as current rather than legacy.
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codex-agents-only-preserve-"))
    const codexRoot = path.join(tempRoot, ".codex")

    // Simulate the tree produced by a native Codex plugin install: active
    // namespaced skills under `.codex/skills/<plugin>/<skill>/SKILL.md`.
    const namespacedSkillsRoot = path.join(codexRoot, "skills", "compound-engineering")
    for (const skillName of ["ce-plan", "ce-debug", "ce-brainstorm"]) {
      await fs.mkdir(path.join(namespacedSkillsRoot, skillName), { recursive: true })
      await fs.writeFile(
        path.join(namespacedSkillsRoot, skillName, "SKILL.md"),
        `# ${skillName} skill installed via native Codex plugin flow`,
      )
    }

    const plugin = await loadClaudePlugin(path.join(import.meta.dir, "..", "plugins", "compound-engineering"))
    const bundle = convertClaudeToCodex(plugin, {
      agentMode: "subagent",
      inferTemperature: true,
      permissions: "none",
      // codexIncludeSkills omitted -> agents-only default
    })

    // Sanity: agents-only bundle does not request any skill writes, but it
    // does advertise the current skill names so cleanup preserves them.
    expect(bundle.skillDirs).toEqual([])
    expect(bundle.generatedSkills).toEqual([])
    expect(bundle.externallyManagedSkillNames).toContain("ce-plan")
    expect(bundle.externallyManagedSkillNames).toContain("ce-debug")

    await writeCodexBundle(codexRoot, bundle)

    // Currently-active skills survive an agents-only re-install.
    expect(await exists(path.join(namespacedSkillsRoot, "ce-plan", "SKILL.md"))).toBe(true)
    expect(await exists(path.join(namespacedSkillsRoot, "ce-debug", "SKILL.md"))).toBe(true)
    expect(await exists(path.join(namespacedSkillsRoot, "ce-brainstorm", "SKILL.md"))).toBe(true)

    // And none of them were silently relocated into legacy-backup.
    const backupRoot = path.join(codexRoot, "compound-engineering", "legacy-backup")
    if (await exists(backupRoot)) {
      const timestamps = await fs.readdir(backupRoot)
      for (const ts of timestamps) {
        const skillsBackup = path.join(backupRoot, ts, "skills")
        if (!(await exists(skillsBackup))) continue
        const backed = await fs.readdir(skillsBackup)
        expect(backed).not.toContain("ce-plan")
        expect(backed).not.toContain("ce-debug")
        expect(backed).not.toContain("ce-brainstorm")
      }
    }
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
name: ce-brainstorm
description: Brainstorm workflow
---

Continue with /ce-plan when ready.
Or use /workflows:plan if you're following an older doc.
Use /todo-resolve for deeper research.
`,
    )
    await fs.writeFile(
      path.join(sourceSkillDir, "notes.md"),
      "Reference docs still mention /ce-plan here.\n",
    )

    const bundle: CodexBundle = {
      prompts: [],
      skillDirs: [{ name: "ce-brainstorm", sourceDir: sourceSkillDir }],
      generatedSkills: [],
      invocationTargets: {
        promptTargets: {
          "todo-resolve": "todo-resolve",
        },
        skillTargets: {
          "ce-plan": "ce-plan",
          "workflows-plan": "ce-plan",
        },
      },
    }

    await writeCodexBundle(tempRoot, bundle)

    const installedSkill = await fs.readFile(
      path.join(tempRoot, ".codex", "skills", "ce-brainstorm", "SKILL.md"),
      "utf8",
    )
    expect(installedSkill).toContain("the ce-plan skill")
    expect(installedSkill).not.toContain("/workflows:plan")
    expect(installedSkill).toContain("/prompts:todo-resolve")

    const notes = await fs.readFile(
      path.join(tempRoot, ".codex", "skills", "ce-brainstorm", "notes.md"),
      "utf8",
    )
    expect(notes).toContain("/ce-plan")
  })

  test("transforms namespaced Task calls in copied SKILL.md files", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codex-ns-task-"))
    const sourceSkillDir = path.join(tempRoot, "source-skill")
    await fs.mkdir(sourceSkillDir, { recursive: true })
    await fs.writeFile(
      path.join(sourceSkillDir, "SKILL.md"),
      `---
name: ce-plan
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
      skillDirs: [{ name: "ce-plan", sourceDir: sourceSkillDir }],
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
- /ce-plan
`,
    )

    const bundle: CodexBundle = {
      prompts: [],
      skillDirs: [{ name: "proof", sourceDir: sourceSkillDir }],
      generatedSkills: [],
      invocationTargets: {
        promptTargets: {},
        skillTargets: {
          "ce-plan": "ce-plan",
        },
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
    expect(installedSkill).toContain("the ce-plan skill")
    expect(installedSkill).not.toContain("/prompts:users")
    expect(installedSkill).not.toContain("/prompts:settings")
    expect(installedSkill).not.toContain("https://prompts:www.proofeditor.ai")
  })

  test("removes orphan sidecar dir when retained agent declares no sidecars", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codex-test-"))
    const agentsRoot = path.join(tempRoot, ".codex", "agents")
    const orphanDir = path.join(agentsRoot, "ce-foo", "stale-content")
    await fs.mkdir(orphanDir, { recursive: true })
    await fs.writeFile(path.join(orphanDir, "leftover.txt"), "stale", "utf8")
    await fs.writeFile(path.join(agentsRoot, "ce-foo.toml"), "old-toml", "utf8")

    const bundle: CodexBundle = {
      prompts: [],
      skillDirs: [],
      generatedSkills: [],
      agents: [
        {
          name: "ce-foo",
          description: "Foo agent",
          instructions: "Do foo.",
        },
      ],
      mcpServers: {},
    }

    await writeCodexBundle(tempRoot, bundle)

    expect(await entryExists(path.join(agentsRoot, "ce-foo"))).toBe(false)
    expect(await exists(path.join(agentsRoot, "ce-foo.toml"))).toBe(true)
  })

  test("keeps sidecar dir when retained agent declares sidecars", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codex-test-"))
    const sidecarSource = await fs.mkdtemp(path.join(os.tmpdir(), "codex-sidecar-src-"))
    await fs.writeFile(path.join(sidecarSource, "script.sh"), "#!/bin/sh\necho hi\n", "utf8")

    const bundle: CodexBundle = {
      prompts: [],
      skillDirs: [],
      generatedSkills: [],
      agents: [
        {
          name: "ce-foo",
          description: "Foo agent",
          instructions: "Do foo.",
          sidecarDirs: [{ sourceDir: sidecarSource, targetName: "scripts" }],
        },
      ],
      mcpServers: {},
    }

    await writeCodexBundle(tempRoot, bundle)

    const agentsRoot = path.join(tempRoot, ".codex", "agents")
    expect(await exists(path.join(agentsRoot, "ce-foo.toml"))).toBe(true)
    expect(await exists(path.join(agentsRoot, "ce-foo", "scripts", "script.sh"))).toBe(true)
  })

  test("leaves unrelated directories under agentsRoot alone", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codex-test-"))
    const agentsRoot = path.join(tempRoot, ".codex", "agents")
    const unrelatedDir = path.join(agentsRoot, "ce-bar-extra")
    await fs.mkdir(unrelatedDir, { recursive: true })
    await fs.writeFile(path.join(unrelatedDir, "keep-me.txt"), "keep", "utf8")

    const bundle: CodexBundle = {
      prompts: [],
      skillDirs: [],
      generatedSkills: [],
      agents: [
        {
          name: "ce-foo",
          description: "Foo agent",
          instructions: "Do foo.",
        },
      ],
      mcpServers: {},
    }

    await writeCodexBundle(tempRoot, bundle)

    expect(await exists(path.join(unrelatedDir, "keep-me.txt"))).toBe(true)
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

  test("preserves unmarked legacy content when no MCP servers are incoming", () => {
    const existing = [
      'model = "gpt-5.4"',
      "",
      "# Generated by compound-plugin",
      "",
      "[projects.example]",
      'trust_level = "trusted"',
    ].join("\n")

    const result = mergeCodexConfig(existing, null)!
    expect(result).toContain("# Generated by compound-plugin")
    expect(result).toContain("[projects.example]")
    expect(result).toContain('trust_level = "trusted"')
  })

  test("strips bounded legacy MCP block when no MCP servers are incoming", () => {
    const existing = [
      "[user]",
      'model = "gpt-5.4"',
      "",
      "# MCP servers synced from Claude Code",
      "",
      "[mcp_servers.old]",
      'command = "old"',
    ].join("\n")

    const result = mergeCodexConfig(existing, null)!
    expect(result).toContain("[user]")
    expect(result).not.toContain("# MCP servers synced from Claude Code")
    expect(result).not.toContain("[mcp_servers.old]")
  })

  test("returns existing content byte-for-byte when no MCP servers or managed blocks exist", () => {
    const existing = [
      'model = "gpt-5.4"',
      "",
      "# Generated by compound-plugin",
      "",
      "[projects.example]",
      'trust_level = "trusted"',
      "",
    ].join("\n")

    expect(mergeCodexConfig(existing, null)).toBe(existing)
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
