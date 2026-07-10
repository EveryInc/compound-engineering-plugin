import { describe, expect, test } from "bun:test"
import { promises as fs } from "fs"
import path from "path"
import os from "os"
import { writePiBundle } from "../src/targets/pi"
import type { PiBundle } from "../src/types/pi"
import { loadClaudePlugin } from "../src/parsers/claude"
import { convertClaudeToPi } from "../src/converters/claude-to-pi"

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

const SESSION_HISTORIAN_DESCRIPTION =
  "Synthesizes findings from prior coding-agent sessions about the same problem or topic. Receives pre-extracted skeleton/error file paths from a `ce-sessions` orchestrator and returns prose findings — investigation journey, what didn't work, key decisions, related context. Not intended for direct dispatch — use `/ce-sessions` (or another caller that runs the full discovery + extract pipeline first)."

const REPRODUCE_BUG_DESCRIPTION =
  "Systematically reproduce and investigate a bug from a GitHub issue. Use when the user provides a GitHub issue number or URL for a bug they want reproduced or investigated."
const BUG_REPRODUCTION_VALIDATOR_DESCRIPTION =
  "Systematically reproduces and validates bug reports to confirm whether reported behavior is an actual bug. Use when you receive a bug report or issue that needs verification."

function skillContent(name: string, description: string): string {
  return `---\nname: ${name}\ndescription: ${JSON.stringify(description)}\n---\n\n# ${name}\n`
}

describe("writePiBundle", () => {
  test("moves CE-owned legacy Pi agent files without touching user agents", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pi-legacy-agent-cleanup-"))
    const outputRoot = path.join(tempRoot, ".pi")
    const agentsRoot = path.join(outputRoot, "agents")
    await fs.mkdir(agentsRoot, { recursive: true })
    await fs.writeFile(
      path.join(agentsRoot, "repo-research-analyst.md"),
      [
        "---",
        "name: repo-research-analyst",
        "description: Conducts thorough research on repository structure, documentation, conventions, and implementation patterns. Use when onboarding to a new codebase or understanding project conventions.",
        "---",
        "",
        "Legacy CE agent body",
        "",
      ].join("\n"),
    )
    const userAgentBody = [
      "---",
      "name: ce-repo-research-analyst",
      "description: Personal Pi agent for local research",
      "---",
      "",
      "User-authored agent body",
      "",
    ].join("\n")
    await fs.writeFile(path.join(agentsRoot, "ce-repo-research-analyst.md"), userAgentBody)

    const bundle: PiBundle = {
      pluginName: "compound-engineering",
      prompts: [],
      skillDirs: [],
      generatedSkills: [],
      agents: [],
      extensions: [],
    }

    await writePiBundle(outputRoot, bundle)

    expect(await exists(path.join(agentsRoot, "repo-research-analyst.md"))).toBe(false)
    expect(await exists(path.join(agentsRoot, "ce-repo-research-analyst.md"))).toBe(true)
    expect(await fs.readFile(path.join(agentsRoot, "ce-repo-research-analyst.md"), "utf8")).toBe(userAgentBody)

    const backupRoot = path.join(outputRoot, "compound-engineering", "legacy-backup")
    expect(await exists(backupRoot)).toBe(true)
    const timestamps = await fs.readdir(backupRoot)
    let foundAgentBackup = false
    for (const timestamp of timestamps) {
      const agentsBackup = path.join(backupRoot, timestamp, "agents")
      if (!(await exists(agentsBackup))) continue
      const backedUp = await fs.readdir(agentsBackup)
      if (backedUp.includes("repo-research-analyst.md")) foundAgentBackup = true
      expect(backedUp).not.toContain("ce-repo-research-analyst.md")
    }
    expect(foundAgentBackup).toBe(true)
  })

  test("removes stale generated agent skills without touching prompt files", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pi-cleanup-targets-"))
    const outputRoot = path.join(tempRoot, ".pi")

    await fs.mkdir(path.join(outputRoot, "skills", "session-historian"), { recursive: true })
    await fs.writeFile(
      path.join(outputRoot, "skills", "session-historian", "SKILL.md"),
      `---\nname: session-historian\ndescription: ${JSON.stringify(SESSION_HISTORIAN_DESCRIPTION)}\n---\n\nLegacy agent\n`,
    )
    await fs.mkdir(path.join(outputRoot, "prompts"), { recursive: true })
    await fs.writeFile(path.join(outputRoot, "prompts", "session-historian.md"), "user-owned prompt")

    const bundle: PiBundle = {
      prompts: [],
      skillDirs: [],
      generatedSkills: [],
      agents: [],
      extensions: [],
    }

    await writePiBundle(outputRoot, bundle)

    expect(await exists(path.join(outputRoot, "skills", "session-historian"))).toBe(false)
    expect(await exists(path.join(outputRoot, "prompts", "session-historian.md"))).toBe(true)
  })

  test("writes prompts, skills, extensions, mcporter config, and AGENTS.md block", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pi-writer-"))
    const outputRoot = path.join(tempRoot, ".pi")

    const bundle: PiBundle = {
      pluginName: "compound-engineering",
      prompts: [{ name: "workflows-plan", content: "Prompt content" }],
      skillDirs: [
        {
          name: "skill-one",
          sourceDir: path.join(import.meta.dir, "fixtures", "sample-plugin", "skills", "skill-one"),
        },
      ],
      generatedSkills: [],
      agents: [{ name: "repo-research-analyst", content: "---\nname: repo-research-analyst\n---\n\nBody" }],
      extensions: [{ name: "compound-engineering-compat.ts", content: "export default function () {}" }],
      mcporterConfig: {
        mcpServers: {
          context7: { baseUrl: "https://mcp.context7.com/mcp" },
        },
      },
    }

    await writePiBundle(outputRoot, bundle)

    expect(await exists(path.join(outputRoot, "prompts", "workflows-plan.md"))).toBe(true)
    expect(await exists(path.join(outputRoot, "skills", "skill-one", "SKILL.md"))).toBe(true)
    // Claude agents are written as Pi agent files (.pi/agents/<name>.md), not
    // skill directories, for runtimes and tools that read Pi agent files.
    expect(await exists(path.join(outputRoot, "agents", "repo-research-analyst.md"))).toBe(true)
    expect(await exists(path.join(outputRoot, "extensions", "compound-engineering-compat.ts"))).toBe(true)
    expect(await exists(path.join(outputRoot, "compound-engineering", "mcporter.json"))).toBe(true)
    expect(await exists(path.join(outputRoot, "compound-engineering", "install-manifest.json"))).toBe(true)

    const agentsPath = path.join(outputRoot, "AGENTS.md")
    const agentsContent = await fs.readFile(agentsPath, "utf8")
    expect(agentsContent).toContain("BEGIN COMPOUND PI TOOL MAP")
    expect(agentsContent).toContain("pi-subagents")
    expect(agentsContent).toContain("pi-ask-user")
  })

  test("transforms Task calls in copied SKILL.md files", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pi-skill-transform-"))
    const outputRoot = path.join(tempRoot, ".pi")
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
- Task compound-engineering:review:code-simplicity-reviewer()
`,
    )

    const bundle: PiBundle = {
      prompts: [],
      skillDirs: [{ name: "ce-plan", sourceDir: sourceSkillDir }],
      generatedSkills: [],
      agents: [],
      extensions: [],
    }

    await writePiBundle(outputRoot, bundle)

    const installedSkill = await fs.readFile(
      path.join(outputRoot, "skills", "ce-plan", "SKILL.md"),
      "utf8",
    )

    expect(installedSkill).toContain('Run subagent with agent="repo-research-analyst" and task="feature_description".')
    expect(installedSkill).toContain('Run subagent with agent="learnings-researcher" and task="feature_description".')
    expect(installedSkill).toContain('Run subagent with agent="code-simplicity-reviewer".')
    expect(installedSkill).not.toContain("Task compound-engineering:")
  })

  test("writes to ~/.pi/agent style roots without nesting under .pi", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pi-agent-root-"))
    const outputRoot = path.join(tempRoot, "agent")

    const bundle: PiBundle = {
      prompts: [{ name: "workflows-work", content: "Prompt content" }],
      skillDirs: [],
      generatedSkills: [],
      agents: [],
      extensions: [],
    }

    await writePiBundle(outputRoot, bundle)

    expect(await exists(path.join(outputRoot, "prompts", "workflows-work.md"))).toBe(true)
    expect(await exists(path.join(outputRoot, ".pi"))).toBe(false)
  })

  test("backs up existing mcporter config before overwriting", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pi-backup-"))
    const outputRoot = path.join(tempRoot, ".pi")
    const configPath = path.join(outputRoot, "compound-engineering", "mcporter.json")

    await fs.mkdir(path.dirname(configPath), { recursive: true })
    await fs.writeFile(configPath, JSON.stringify({ previous: true }, null, 2))

    const bundle: PiBundle = {
      prompts: [],
      skillDirs: [],
      generatedSkills: [],
      agents: [],
      extensions: [],
      mcporterConfig: {
        mcpServers: {
          linear: { baseUrl: "https://mcp.linear.app/mcp" },
        },
      },
    }

    await writePiBundle(outputRoot, bundle)

    const files = await fs.readdir(path.dirname(configPath))
    const backupFileName = files.find((file) => file.startsWith("mcporter.json.bak."))
    expect(backupFileName).toBeDefined()

    const currentConfig = JSON.parse(await fs.readFile(configPath, "utf8")) as { mcpServers: Record<string, unknown> }
    expect(currentConfig.mcpServers.linear).toBeDefined()
  })

  test("removes previously managed Pi artifacts that disappear on reinstall", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pi-managed-cleanup-"))
    const outputRoot = path.join(tempRoot, ".pi")

    await writePiBundle(outputRoot, {
      pluginName: "compound-engineering",
      prompts: [{ name: "old-prompt", content: "Prompt content" }],
      skillDirs: [
        {
          name: "skill-one",
          sourceDir: path.join(import.meta.dir, "fixtures", "sample-plugin", "skills", "skill-one"),
        },
      ],
      generatedSkills: [],
      agents: [{ name: "old-agent", content: "---\nname: old-agent\n---\n\nBody" }],
      extensions: [{ name: "compound-engineering-compat.ts", content: "export default function first() {}" }],
    })

    await writePiBundle(outputRoot, {
      pluginName: "compound-engineering",
      prompts: [{ name: "new-prompt", content: "Prompt content" }],
      skillDirs: [],
      generatedSkills: [],
      agents: [{ name: "new-agent", content: "---\nname: new-agent\n---\n\nBody" }],
      extensions: [],
    })

    expect(await exists(path.join(outputRoot, "prompts", "old-prompt.md"))).toBe(false)
    expect(await exists(path.join(outputRoot, "prompts", "new-prompt.md"))).toBe(true)
    expect(await exists(path.join(outputRoot, "skills", "skill-one", "SKILL.md"))).toBe(false)
    expect(await exists(path.join(outputRoot, "agents", "old-agent.md"))).toBe(false)
    expect(await exists(path.join(outputRoot, "agents", "new-agent.md"))).toBe(true)
    expect(await exists(path.join(outputRoot, "extensions", "compound-engineering-compat.ts"))).toBe(false)
  })

  test("namespaces managed install manifests per plugin so installs do not collide", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pi-multi-plugin-"))
    const outputRoot = path.join(tempRoot, ".pi")

    // Install plugin A first, with a prompt, skill, generated skill, and extension
    await writePiBundle(outputRoot, {
      pluginName: "compound-engineering",
      prompts: [{ name: "ce-prompt", content: "CE prompt" }],
      skillDirs: [
        {
          name: "ce-skill",
          sourceDir: path.join(import.meta.dir, "fixtures", "sample-plugin", "skills", "skill-one"),
        },
      ],
      generatedSkills: [{ name: "ce-gen-skill", content: "---\nname: ce-gen-skill\n---\n\nBody" }],
      agents: [],
      extensions: [{ name: "ce-ext.ts", content: "export default function () {}" }],
    })

    // Install plugin B into the same Pi root
    await writePiBundle(outputRoot, {
      pluginName: "coding-tutor",
      prompts: [{ name: "tutor-prompt", content: "Tutor prompt" }],
      skillDirs: [
        {
          name: "tutor-skill",
          sourceDir: path.join(import.meta.dir, "fixtures", "sample-plugin", "skills", "skill-one"),
        },
      ],
      generatedSkills: [{ name: "tutor-gen-skill", content: "---\nname: tutor-gen-skill\n---\n\nBody" }],
      agents: [],
      extensions: [{ name: "tutor-ext.ts", content: "export default function () {}" }],
    })

    // Both plugins must keep their own namespaced manifest
    expect(await exists(path.join(outputRoot, "compound-engineering", "install-manifest.json"))).toBe(true)
    expect(await exists(path.join(outputRoot, "coding-tutor", "install-manifest.json"))).toBe(true)

    // Reinstall plugin A with no artifacts — it must clean up only its own
    // managed artifacts, leaving plugin B's intact (the bug the namespacing fix
    // addresses: a shared manifest path would have lost B's manifest after A
    // was installed, and a later A reinstall would skip B's stale-file cleanup).
    await writePiBundle(outputRoot, {
      pluginName: "compound-engineering",
      prompts: [],
      skillDirs: [],
      generatedSkills: [],
      agents: [],
      extensions: [],
    })

    expect(await exists(path.join(outputRoot, "prompts", "ce-prompt.md"))).toBe(false)
    expect(await exists(path.join(outputRoot, "skills", "ce-skill"))).toBe(false)
    expect(await exists(path.join(outputRoot, "skills", "ce-gen-skill"))).toBe(false)
    expect(await exists(path.join(outputRoot, "extensions", "ce-ext.ts"))).toBe(false)
    expect(await exists(path.join(outputRoot, "prompts", "tutor-prompt.md"))).toBe(true)
    expect(await exists(path.join(outputRoot, "skills", "tutor-skill"))).toBe(true)
    expect(await exists(path.join(outputRoot, "skills", "tutor-gen-skill"))).toBe(true)
    expect(await exists(path.join(outputRoot, "extensions", "tutor-ext.ts"))).toBe(true)
    expect(await exists(path.join(outputRoot, "coding-tutor", "install-manifest.json"))).toBe(true)
  })

  test("moves stale compound-engineering mcporter.json to legacy backup when bundle has no mcporterConfig", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pi-legacy-mcporter-"))
    const outputRoot = path.join(tempRoot, ".pi")
    const staleConfigPath = path.join(outputRoot, "compound-engineering", "mcporter.json")

    await fs.mkdir(path.dirname(staleConfigPath), { recursive: true })
    await fs.writeFile(
      staleConfigPath,
      JSON.stringify({ mcpServers: { stale: { baseUrl: "https://example.invalid/mcp" } } }, null, 2),
    )

    const bundle: PiBundle = {
      pluginName: "compound-engineering",
      prompts: [],
      skillDirs: [],
      generatedSkills: [],
      agents: [],
      extensions: [],
      // No mcporterConfig — the compound-engineering plugin ships no MCP
      // servers, so the file written by the removed compat extension should
      // be swept into legacy-backup rather than lingering on disk.
    }

    await writePiBundle(outputRoot, bundle)

    expect(await exists(staleConfigPath)).toBe(false)

    const legacyBackupRoot = path.join(outputRoot, "compound-engineering", "legacy-backup")
    expect(await exists(legacyBackupRoot)).toBe(true)

    const timestamps = await fs.readdir(legacyBackupRoot)
    const mcporterBackup = (
      await Promise.all(
        timestamps.map(async (timestamp) => {
          const candidate = path.join(legacyBackupRoot, timestamp, "mcporter", "mcporter.json")
          return (await exists(candidate)) ? candidate : null
        }),
      )
    ).find((candidate): candidate is string => candidate !== null)

    expect(mcporterBackup).toBeDefined()
    const backedUp = JSON.parse(await fs.readFile(mcporterBackup!, "utf8")) as {
      mcpServers: Record<string, { baseUrl?: string }>
    }
    expect(backedUp.mcpServers.stale?.baseUrl).toBe("https://example.invalid/mcp")
  })

  test("moves legacy flat Pi CE artifacts to a namespaced backup", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pi-legacy-artifacts-"))
    const outputRoot = path.join(tempRoot, ".pi")

    await fs.mkdir(path.join(outputRoot, "skills", "reproduce-bug"), { recursive: true })
    await fs.writeFile(path.join(outputRoot, "skills", "reproduce-bug", "SKILL.md"), skillContent("reproduce-bug", REPRODUCE_BUG_DESCRIPTION))
    await fs.mkdir(path.join(outputRoot, "skills", "bug-reproduction-validator"), { recursive: true })
    await fs.writeFile(path.join(outputRoot, "skills", "bug-reproduction-validator", "SKILL.md"), skillContent("bug-reproduction-validator", BUG_REPRODUCTION_VALIDATOR_DESCRIPTION))
    await fs.mkdir(path.join(outputRoot, "prompts"), { recursive: true })
    await fs.writeFile(path.join(outputRoot, "prompts", "reproduce-bug.md"), "legacy removed prompt")
    await fs.writeFile(path.join(outputRoot, "prompts", "report-bug.md"), "legacy deleted command prompt")

    const plugin = await loadClaudePlugin(path.join(import.meta.dir, ".."))
    const bundle = convertClaudeToPi(plugin, {
      agentMode: "subagent",
      inferTemperature: true,
      permissions: "none",
    })
    await writePiBundle(outputRoot, bundle)

    expect(await exists(path.join(outputRoot, "skills", "reproduce-bug"))).toBe(false)
    expect(await exists(path.join(outputRoot, "skills", "bug-reproduction-validator"))).toBe(false)
    expect(await exists(path.join(outputRoot, "prompts", "reproduce-bug.md"))).toBe(false)
    expect(await exists(path.join(outputRoot, "prompts", "report-bug.md"))).toBe(false)
    expect(await exists(path.join(outputRoot, "skills", "ce-plan", "SKILL.md"))).toBe(true)
    // Compound Engineering no longer ships standalone agents; specialist
    // prompts live inside the consuming skill directories.
    expect(await exists(path.join(outputRoot, "agents", "ce-repo-research-analyst.md"))).toBe(false)
    expect(await exists(path.join(outputRoot, "compound-engineering", "legacy-backup"))).toBe(true)
  })
})

// Probed at module load (not beforeAll) because test.skipIf evaluates its
// condition at registration time. Directory and file symlinks are probed
// separately: on Windows without Developer Mode, junctions succeed while
// file symlinks throw EPERM.
async function probeSymlinkSupport(): Promise<{ canDirSymlink: boolean; canFileSymlink: boolean }> {
  const probeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pi-symlink-probe-"))
  const probeTarget = path.join(probeRoot, "target")
  await fs.mkdir(probeTarget, { recursive: true })
  let canDirSymlink = true
  try {
    await fs.symlink(probeTarget, path.join(probeRoot, "link"), "junction")
  } catch {
    canDirSymlink = false
  }
  const probeFile = path.join(probeRoot, "target.md")
  await fs.writeFile(probeFile, "probe")
  let canFileSymlink = true
  try {
    await fs.symlink(probeFile, path.join(probeRoot, "link.md"))
  } catch {
    canFileSymlink = false
  }
  return { canDirSymlink, canFileSymlink }
}

const { canDirSymlink, canFileSymlink } = await probeSymlinkSupport()

describe("writePiBundle preserves user-managed skill paths", () => {
  async function readInstallManifest(outputRoot: string): Promise<{ skills: string[]; agents: string[] }> {
    const raw = await fs.readFile(
      path.join(outputRoot, "compound-engineering", "install-manifest.json"),
      "utf8",
    )
    return JSON.parse(raw) as { skills: string[]; agents: string[] }
  }

  test.skipIf(!canDirSymlink)(
    "preserves a symlinked skill directory and leaves its target content untouched",
    async () => {
      const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pi-preserve-skill-symlink-"))
      const outputRoot = path.join(tempRoot, ".pi")
      const forkDir = path.join(tempRoot, "user-fork", "skill-one")
      await fs.mkdir(forkDir, { recursive: true })
      await fs.writeFile(path.join(forkDir, "SKILL.md"), "# user fork content\n")

      await fs.mkdir(path.join(outputRoot, "skills"), { recursive: true })
      await fs.symlink(forkDir, path.join(outputRoot, "skills", "skill-one"), "junction")

      const bundle: PiBundle = {
        pluginName: "compound-engineering",
        prompts: [],
        skillDirs: [
          {
            name: "skill-one",
            sourceDir: path.join(import.meta.dir, "fixtures", "sample-plugin", "skills", "skill-one"),
          },
        ],
        generatedSkills: [],
        agents: [],
        extensions: [],
      }

      await writePiBundle(outputRoot, bundle)

      const linkStat = await fs.lstat(path.join(outputRoot, "skills", "skill-one"))
      expect(linkStat.isSymbolicLink()).toBe(true)
      expect(await fs.readFile(path.join(forkDir, "SKILL.md"), "utf8")).toBe("# user fork content\n")

      const manifest = await readInstallManifest(outputRoot)
      expect(manifest.skills).not.toContain("skill-one")
    },
  )

  test("preserves an unmanaged real skill directory (not previously owned by this tool)", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pi-preserve-skill-unmanaged-"))
    const outputRoot = path.join(tempRoot, ".pi")

    await fs.mkdir(path.join(outputRoot, "skills", "skill-one"), { recursive: true })
    await fs.writeFile(
      path.join(outputRoot, "skills", "skill-one", "SKILL.md"),
      "# hand-authored, never installed by this tool\n",
    )

    const bundle: PiBundle = {
      pluginName: "compound-engineering",
      prompts: [],
      skillDirs: [
        {
          name: "skill-one",
          sourceDir: path.join(import.meta.dir, "fixtures", "sample-plugin", "skills", "skill-one"),
        },
      ],
      generatedSkills: [],
      agents: [],
      extensions: [],
    }

    await writePiBundle(outputRoot, bundle)

    expect(await fs.readFile(path.join(outputRoot, "skills", "skill-one", "SKILL.md"), "utf8")).toBe(
      "# hand-authored, never installed by this tool\n",
    )

    const manifest = await readInstallManifest(outputRoot)
    expect(manifest.skills).not.toContain("skill-one")
  })

  test("still replaces a real skill directory previously installed by this tool", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pi-replace-managed-skill-"))
    const outputRoot = path.join(tempRoot, ".pi")

    const bundle: PiBundle = {
      pluginName: "compound-engineering",
      prompts: [],
      skillDirs: [
        {
          name: "skill-one",
          sourceDir: path.join(import.meta.dir, "fixtures", "sample-plugin", "skills", "skill-one"),
        },
      ],
      generatedSkills: [],
      agents: [],
      extensions: [],
    }

    await writePiBundle(outputRoot, bundle)
    // Simulate drift between two installs: same managed dir, different upstream content.
    await fs.writeFile(path.join(outputRoot, "skills", "skill-one", "SKILL.md"), "stale managed content")

    await writePiBundle(outputRoot, bundle)

    const content = await fs.readFile(path.join(outputRoot, "skills", "skill-one", "SKILL.md"), "utf8")
    expect(content).not.toBe("stale managed content")
    expect(content).toContain("Skill body")

    const manifest = await readInstallManifest(outputRoot)
    expect(manifest.skills).toContain("skill-one")
  })

  test.skipIf(!canDirSymlink)(
    "a preserved skill symlink survives a later install run where the skill is dropped from the bundle",
    async () => {
      const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pi-preserve-skill-symlink-second-run-"))
      const outputRoot = path.join(tempRoot, ".pi")

      const bundleWithSkill: PiBundle = {
        pluginName: "compound-engineering",
        prompts: [],
        skillDirs: [
          {
            name: "skill-one",
            sourceDir: path.join(import.meta.dir, "fixtures", "sample-plugin", "skills", "skill-one"),
          },
        ],
        generatedSkills: [],
        agents: [],
        extensions: [],
      }

      // First run: normal managed install, tracked in the manifest.
      await writePiBundle(outputRoot, bundleWithSkill)
      const manifestAfterFirstRun = await readInstallManifest(outputRoot)
      expect(manifestAfterFirstRun.skills).toContain("skill-one")

      // User swaps the managed directory for a symlink into a personal fork,
      // while the on-disk manifest from the first run still claims ownership.
      const forkDir = path.join(tempRoot, "user-fork", "skill-one")
      await fs.mkdir(forkDir, { recursive: true })
      await fs.writeFile(path.join(forkDir, "SKILL.md"), "# user fork content\n")
      await fs.rm(path.join(outputRoot, "skills", "skill-one"), { recursive: true, force: true })
      await fs.symlink(forkDir, path.join(outputRoot, "skills", "skill-one"), "junction")

      // Second run: the plugin drops the skill from the bundle entirely, which
      // exercises cleanupRemovedSkills against the stale manifest entry.
      const bundleWithoutSkill: PiBundle = {
        pluginName: "compound-engineering",
        prompts: [],
        skillDirs: [],
        generatedSkills: [],
        agents: [],
        extensions: [],
      }
      await writePiBundle(outputRoot, bundleWithoutSkill)

      const linkStat = await fs.lstat(path.join(outputRoot, "skills", "skill-one"))
      expect(linkStat.isSymbolicLink()).toBe(true)
      expect(await fs.readFile(path.join(forkDir, "SKILL.md"), "utf8")).toBe("# user fork content\n")

      const manifestAfterSecondRun = await readInstallManifest(outputRoot)
      expect(manifestAfterSecondRun.skills).not.toContain("skill-one")
    },
  )

  test.skipIf(!canFileSymlink)("preserves a symlinked agent file and leaves its target content untouched", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pi-preserve-agent-symlink-"))
    const outputRoot = path.join(tempRoot, ".pi")
    const forkAgentPath = path.join(tempRoot, "user-fork-agent.md")
    await fs.writeFile(forkAgentPath, "# user fork agent content\n")

    await fs.mkdir(path.join(outputRoot, "agents"), { recursive: true })
    await fs.symlink(forkAgentPath, path.join(outputRoot, "agents", "repo-research-analyst.md"))

    const bundle: PiBundle = {
      pluginName: "compound-engineering",
      prompts: [],
      skillDirs: [],
      generatedSkills: [],
      agents: [{ name: "repo-research-analyst", content: "---\nname: repo-research-analyst\n---\n\nBody" }],
      extensions: [],
    }

    await writePiBundle(outputRoot, bundle)

    const linkStat = await fs.lstat(path.join(outputRoot, "agents", "repo-research-analyst.md"))
    expect(linkStat.isSymbolicLink()).toBe(true)
    expect(await fs.readFile(forkAgentPath, "utf8")).toBe("# user fork agent content\n")

    const manifest = await readInstallManifest(outputRoot)
    expect(manifest.agents).not.toContain("repo-research-analyst.md")
  })

  test("preserves an unmanaged real agent file (not previously owned by this tool)", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pi-preserve-agent-unmanaged-"))
    const outputRoot = path.join(tempRoot, ".pi")

    await fs.mkdir(path.join(outputRoot, "agents"), { recursive: true })
    await fs.writeFile(
      path.join(outputRoot, "agents", "repo-research-analyst.md"),
      "# hand-authored, never installed by this tool\n",
    )

    const bundle: PiBundle = {
      pluginName: "compound-engineering",
      prompts: [],
      skillDirs: [],
      generatedSkills: [],
      agents: [{ name: "repo-research-analyst", content: "---\nname: repo-research-analyst\n---\n\nBody" }],
      extensions: [],
    }

    await writePiBundle(outputRoot, bundle)

    expect(await fs.readFile(path.join(outputRoot, "agents", "repo-research-analyst.md"), "utf8")).toBe(
      "# hand-authored, never installed by this tool\n",
    )

    const manifest = await readInstallManifest(outputRoot)
    expect(manifest.agents).not.toContain("repo-research-analyst.md")
  })

  test("still replaces a real agent file previously installed by this tool", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pi-replace-managed-agent-"))
    const outputRoot = path.join(tempRoot, ".pi")

    const bundle: PiBundle = {
      pluginName: "compound-engineering",
      prompts: [],
      skillDirs: [],
      generatedSkills: [],
      agents: [{ name: "repo-research-analyst", content: "---\nname: repo-research-analyst\n---\n\nBody" }],
      extensions: [],
    }

    await writePiBundle(outputRoot, bundle)
    // Simulate drift between two installs: same managed file, different upstream content.
    await fs.writeFile(path.join(outputRoot, "agents", "repo-research-analyst.md"), "stale managed content")

    await writePiBundle(outputRoot, bundle)

    const content = await fs.readFile(path.join(outputRoot, "agents", "repo-research-analyst.md"), "utf8")
    expect(content).not.toBe("stale managed content")
    expect(content).toContain("Body")

    const manifest = await readInstallManifest(outputRoot)
    expect(manifest.agents).toContain("repo-research-analyst.md")
  })

  test.skipIf(!canFileSymlink)(
    "a preserved agent symlink survives a later install run where the agent is dropped from the bundle",
    async () => {
      const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pi-preserve-agent-symlink-second-run-"))
      const outputRoot = path.join(tempRoot, ".pi")

      const bundleWithAgent: PiBundle = {
        pluginName: "compound-engineering",
        prompts: [],
        skillDirs: [],
        generatedSkills: [],
        agents: [{ name: "repo-research-analyst", content: "---\nname: repo-research-analyst\n---\n\nBody" }],
        extensions: [],
      }

      // First run: normal managed install, tracked in the manifest.
      await writePiBundle(outputRoot, bundleWithAgent)
      const manifestAfterFirstRun = await readInstallManifest(outputRoot)
      expect(manifestAfterFirstRun.agents).toContain("repo-research-analyst.md")

      // User swaps the managed file for a symlink into a personal fork, while
      // the on-disk manifest from the first run still claims ownership.
      const forkAgentPath = path.join(tempRoot, "user-fork-agent.md")
      await fs.writeFile(forkAgentPath, "# user fork agent content\n")
      await fs.rm(path.join(outputRoot, "agents", "repo-research-analyst.md"), { force: true })
      await fs.symlink(forkAgentPath, path.join(outputRoot, "agents", "repo-research-analyst.md"))

      // Second run: the plugin drops the agent from the bundle entirely, which
      // exercises cleanupRemovedAgents against the stale manifest entry.
      const bundleWithoutAgent: PiBundle = {
        pluginName: "compound-engineering",
        prompts: [],
        skillDirs: [],
        generatedSkills: [],
        agents: [],
        extensions: [],
      }
      await writePiBundle(outputRoot, bundleWithoutAgent)

      const linkStat = await fs.lstat(path.join(outputRoot, "agents", "repo-research-analyst.md"))
      expect(linkStat.isSymbolicLink()).toBe(true)
      expect(await fs.readFile(forkAgentPath, "utf8")).toBe("# user fork agent content\n")

      const manifestAfterSecondRun = await readInstallManifest(outputRoot)
      expect(manifestAfterSecondRun.agents).not.toContain("repo-research-analyst.md")
    },
  )

  test.skipIf(!canDirSymlink)(
    "a legacy-named skill symlinked to a user fork is not swept into legacy-backup",
    async () => {
      const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pi-preserve-legacy-skill-symlink-"))
      const outputRoot = path.join(tempRoot, ".pi")

      // Worst case: the fork keeps the CE fingerprint (name + description), so
      // the readFile-based ownership check follows the symlink and matches.
      const forkDir = path.join(tempRoot, "user-fork", "reproduce-bug")
      await fs.mkdir(forkDir, { recursive: true })
      const forkContent = skillContent("reproduce-bug", REPRODUCE_BUG_DESCRIPTION)
      await fs.writeFile(path.join(forkDir, "SKILL.md"), forkContent)

      await fs.mkdir(path.join(outputRoot, "skills"), { recursive: true })
      await fs.symlink(forkDir, path.join(outputRoot, "skills", "reproduce-bug"), "junction")

      const bundle: PiBundle = {
        pluginName: "compound-engineering",
        prompts: [],
        skillDirs: [],
        generatedSkills: [],
        agents: [],
        extensions: [],
      }

      await writePiBundle(outputRoot, bundle)

      const linkStat = await fs.lstat(path.join(outputRoot, "skills", "reproduce-bug"))
      expect(linkStat.isSymbolicLink()).toBe(true)
      expect(await fs.readFile(path.join(forkDir, "SKILL.md"), "utf8")).toBe(forkContent)

      const legacyBackupRoot = path.join(outputRoot, "compound-engineering", "legacy-backup")
      if (await exists(legacyBackupRoot)) {
        for (const timestamp of await fs.readdir(legacyBackupRoot)) {
          const skillsBackup = path.join(legacyBackupRoot, timestamp, "skills")
          if (!(await exists(skillsBackup))) continue
          expect(await fs.readdir(skillsBackup)).not.toContain("reproduce-bug")
        }
      }
    },
  )

  test.skipIf(!canDirSymlink)(
    "preserves a dangling skill symlink whose target no longer exists",
    async () => {
      const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pi-preserve-skill-symlink-dangling-"))
      const outputRoot = path.join(tempRoot, ".pi")

      // Create the symlink against a real target, then remove the target so
      // the link dangles. lstat must still see the link node (stat/access
      // would follow it and report ENOENT, treating the path as absent).
      const forkDir = path.join(tempRoot, "user-fork", "skill-one")
      await fs.mkdir(forkDir, { recursive: true })
      await fs.mkdir(path.join(outputRoot, "skills"), { recursive: true })
      await fs.symlink(forkDir, path.join(outputRoot, "skills", "skill-one"), "junction")
      await fs.rm(forkDir, { recursive: true, force: true })

      const bundle: PiBundle = {
        pluginName: "compound-engineering",
        prompts: [],
        skillDirs: [
          {
            name: "skill-one",
            sourceDir: path.join(import.meta.dir, "fixtures", "sample-plugin", "skills", "skill-one"),
          },
        ],
        generatedSkills: [],
        agents: [],
        extensions: [],
      }

      await writePiBundle(outputRoot, bundle)

      const linkStat = await fs.lstat(path.join(outputRoot, "skills", "skill-one"))
      expect(linkStat.isSymbolicLink()).toBe(true)

      const manifest = await readInstallManifest(outputRoot)
      expect(manifest.skills).not.toContain("skill-one")
    },
  )
})
