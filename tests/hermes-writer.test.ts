import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { promises as fs } from "fs"
import path from "path"
import os from "os"
import { dump, load } from "js-yaml"
import {
  cleanupHermesAtRoot,
  mergeHermesConfig,
  resolveHermesPaths,
  writeHermesBundle,
} from "../src/targets/hermes"
import type { HermesBundle } from "../src/types/hermes"

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await fs.readFile(filePath, "utf8")) as T
}

async function readYaml<T>(filePath: string): Promise<T> {
  return load(await fs.readFile(filePath, "utf8")) as T
}

function emptyBundle(overrides: Partial<HermesBundle> = {}): HermesBundle {
  return {
    pluginName: "compound-engineering",
    passthroughSkills: [],
    generatedSkills: [],
    droppedCommands: [],
    skippedMcpServers: [],
    ...overrides,
  }
}

// Capture warn/log output. Tests assert on these for cross-plugin collision,
// malformed config, and stdout summary scenarios.
let warnings: string[]
let logs: string[]
let originalWarn: typeof console.warn
let originalLog: typeof console.log

beforeEach(() => {
  warnings = []
  logs = []
  originalWarn = console.warn
  originalLog = console.log
  console.warn = (...args: unknown[]) => {
    warnings.push(args.map((arg) => String(arg)).join(" "))
  }
  console.log = (...args: unknown[]) => {
    logs.push(args.map((arg) => String(arg)).join(" "))
  }
})

afterEach(() => {
  console.warn = originalWarn
  console.log = originalLog
})

describe("resolveHermesPaths", () => {
  test("nests under .hermes/ when basename is not .hermes", () => {
    const paths = resolveHermesPaths("/tmp/some-output", "compound-engineering")
    expect(paths.hermesDir).toBe(path.join("/tmp/some-output", ".hermes"))
    expect(paths.skillsDir).toBe(path.join("/tmp/some-output", ".hermes", "skills"))
    expect(paths.configPath).toBe(path.join("/tmp/some-output", ".hermes", "config.yaml"))
    expect(paths.managedDir).toBe(
      path.join("/tmp/some-output", ".hermes", "compound-engineering"),
    )
  })

  test("treats outputRoot as already-rooted when basename is .hermes", () => {
    const paths = resolveHermesPaths("/home/me/.hermes", "compound-engineering")
    expect(paths.hermesDir).toBe("/home/me/.hermes")
    expect(paths.skillsDir).toBe(path.join("/home/me/.hermes", "skills"))
    expect(paths.configPath).toBe(path.join("/home/me/.hermes", "config.yaml"))
    expect(paths.managedDir).toBe(path.join("/home/me/.hermes", "compound-engineering"))
  })

  test("falls back to legacy compound-engineering segment when no plugin name", () => {
    const paths = resolveHermesPaths("/tmp/x")
    expect(paths.managedDir).toBe(path.join("/tmp/x", ".hermes", "compound-engineering"))
  })

  test("does NOT have an `agent` basename branch — Pi-specific only", () => {
    // outputRoot ending in "agent" should still nest under .hermes/, not be
    // treated as already-rooted (unlike Pi which has an `agent` branch).
    const paths = resolveHermesPaths("/home/me/.pi/agent", "compound-engineering")
    expect(paths.hermesDir).toBe(path.join("/home/me/.pi/agent", ".hermes"))
  })
})

describe("mergeHermesConfig", () => {
  test("preserves all existing top-level keys", () => {
    const existing = {
      model: "claude-sonnet-4-5",
      gateway: { enabled: true, port: 8787 },
      tts: { enabled: false },
    }
    const merged = mergeHermesConfig(existing, { mcp_servers: { newServer: { command: "x" } } })
    expect(merged.model).toBe("claude-sonnet-4-5")
    expect((merged.gateway as { port: number }).port).toBe(8787)
    expect((merged.tts as { enabled: boolean }).enabled).toBe(false)
  })

  test("existing mcp_servers entries win on collision", () => {
    const existing = {
      mcp_servers: {
        shared: { command: "user-tuned-cmd", args: ["--opt", "x"] },
      },
    }
    const merged = mergeHermesConfig(existing, {
      mcp_servers: {
        shared: { command: "incoming-cmd" },
        added: { url: "https://example.com" },
      },
    })
    const mcp = merged.mcp_servers as Record<string, { command?: string; url?: string }>
    expect(mcp.shared.command).toBe("user-tuned-cmd")
    expect(mcp.added.url).toBe("https://example.com")
  })

  test("handles missing existing mcp_servers", () => {
    const merged = mergeHermesConfig({ model: "x" }, { mcp_servers: { a: { command: "b" } } })
    expect((merged.mcp_servers as Record<string, { command: string }>).a.command).toBe("b")
  })
})

describe("writeHermesBundle — happy paths", () => {
  test("empty bundle on empty root creates skills dir and manifest, no config.yaml", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "hermes-empty-"))
    await writeHermesBundle(tempRoot, emptyBundle())
    expect(await exists(path.join(tempRoot, ".hermes", "skills"))).toBe(true)
    expect(
      await exists(path.join(tempRoot, ".hermes", "compound-engineering", "install-manifest.json")),
    ).toBe(true)
    expect(await exists(path.join(tempRoot, ".hermes", "config.yaml"))).toBe(false)
  })

  test("full bundle materializes passthrough + generated skills with correct frontmatter handling", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "hermes-full-"))
    const bundle: HermesBundle = emptyBundle({
      passthroughSkills: [
        {
          name: "skill-one",
          sourceDir: path.join(import.meta.dir, "fixtures", "sample-plugin", "skills", "skill-one"),
        },
      ],
      generatedSkills: [
        {
          name: "cmd-plan",
          content:
            "---\nname: cmd-plan\ndescription: Plan something\nversion: \"1.0.0\"\nmetadata:\n  hermes:\n    tags:\n      - Command\n---\n\nPlan body.\n",
          kind: "command",
        },
        {
          name: "agent-reviewer",
          content:
            "---\nname: agent-reviewer\ndescription: Review\nversion: \"1.0.0\"\nmetadata:\n  hermes:\n    tags:\n      - Agent\n---\n\nReview body.\n",
          kind: "agent",
        },
      ],
    })

    await writeHermesBundle(tempRoot, bundle)

    // Passthrough skill at <root>/.hermes/skills/skill-one/SKILL.md with
    // original frontmatter intact.
    const passthrough = await fs.readFile(
      path.join(tempRoot, ".hermes", "skills", "skill-one", "SKILL.md"),
      "utf8",
    )
    expect(passthrough).toContain("name: skill-one")
    expect(passthrough).toContain("description: Sample skill")

    // Generated skills at prefixed paths with their inline frontmatter.
    const cmdContent = await fs.readFile(
      path.join(tempRoot, ".hermes", "skills", "cmd-plan", "SKILL.md"),
      "utf8",
    )
    expect(cmdContent).toContain("name: cmd-plan")
    expect(cmdContent).toContain("metadata:")
    expect(cmdContent).toContain("- Command")

    const agentContent = await fs.readFile(
      path.join(tempRoot, ".hermes", "skills", "agent-reviewer", "SKILL.md"),
      "utf8",
    )
    expect(agentContent).toContain("name: agent-reviewer")
    expect(agentContent).toContain("- Agent")
  })

  test("transforms Task calls in passthrough SKILL.md bodies via copySkillDir", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "hermes-transform-"))
    const sourceSkillDir = path.join(tempRoot, "source-skill")
    await fs.mkdir(sourceSkillDir, { recursive: true })
    await fs.writeFile(
      path.join(sourceSkillDir, "SKILL.md"),
      `---
name: ce-plan
description: Planning
---

Run:
- Task ce-research-analyst(planning context)
`,
    )

    const bundle: HermesBundle = emptyBundle({
      passthroughSkills: [{ name: "ce-plan", sourceDir: sourceSkillDir }],
    })

    await writeHermesBundle(tempRoot, bundle)
    const written = await fs.readFile(
      path.join(tempRoot, ".hermes", "skills", "ce-plan", "SKILL.md"),
      "utf8",
    )
    expect(written).toContain("Use the ce-research-analyst skill to: planning context")
    expect(written).not.toContain("Task ce-research-analyst(")
    // Original frontmatter preserved.
    expect(written).toContain("name: ce-plan")
    expect(written).toContain("description: Planning")
  })

  test("does not double-nest when output basename is .hermes", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "hermes-rooted-"))
    const hermesRoot = path.join(tempRoot, ".hermes")
    await fs.mkdir(hermesRoot, { recursive: true })

    await writeHermesBundle(
      hermesRoot,
      emptyBundle({
        generatedSkills: [
          { name: "cmd-x", content: "---\nname: cmd-x\n---\n\nBody.\n", kind: "command" },
        ],
      }),
    )

    expect(await exists(path.join(hermesRoot, "skills", "cmd-x", "SKILL.md"))).toBe(true)
    expect(await exists(path.join(hermesRoot, ".hermes"))).toBe(false)
  })

  test("MCP config writes config.yaml with mcp_servers block; preserves existing top-level keys", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "hermes-mcp-"))
    const hermesDir = path.join(tempRoot, ".hermes")
    await fs.mkdir(hermesDir, { recursive: true })

    // Pre-existing config with model + gateway + a user MCP entry.
    await fs.writeFile(
      path.join(hermesDir, "config.yaml"),
      dump({
        model: "claude-sonnet-4-5",
        gateway: { enabled: true, port: 8787 },
        mcp_servers: {
          shared: { command: "user-tuned-cmd" },
        },
      }),
    )

    const bundle: HermesBundle = emptyBundle({
      mcpConfig: {
        mcp_servers: {
          shared: { command: "incoming-would-clobber" },
          added: { url: "https://example.com/mcp" },
        },
      },
    })

    await writeHermesBundle(tempRoot, bundle)

    const written = await readYaml<{
      model: string
      gateway: { port: number }
      mcp_servers: Record<string, { command?: string; url?: string }>
    }>(path.join(hermesDir, "config.yaml"))
    expect(written.model).toBe("claude-sonnet-4-5")
    expect(written.gateway.port).toBe(8787)
    // Existing entry wins on collision.
    expect(written.mcp_servers.shared.command).toBe("user-tuned-cmd")
    expect(written.mcp_servers.added.url).toBe("https://example.com/mcp")
  })

  test("writes manifest with ONLY skills group — no mcp group", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "hermes-manifest-shape-"))
    await writeHermesBundle(
      tempRoot,
      emptyBundle({
        generatedSkills: [
          { name: "cmd-a", content: "---\nname: cmd-a\n---\n\nA.\n", kind: "command" },
        ],
        mcpConfig: { mcp_servers: { x: { command: "y" } } },
      }),
    )
    const manifest = await readJson<{
      version: number
      pluginName: string
      groups: Record<string, string[]>
    }>(path.join(tempRoot, ".hermes", "compound-engineering", "install-manifest.json"))
    expect(manifest.version).toBe(1)
    expect(manifest.pluginName).toBe("compound-engineering")
    expect(Object.keys(manifest.groups)).toEqual(["skills"])
    expect(manifest.groups.skills).toContain("cmd-a")
  })
})

describe("writeHermesBundle — round-trip with config-sample fixture", () => {
  test("load → merge with empty incoming → dump → reload preserves structure", async () => {
    const fixturePath = path.join(import.meta.dir, "fixtures", "hermes-config-sample.yaml")
    const original = await readYaml<Record<string, unknown>>(fixturePath)

    const merged = mergeHermesConfig(original, { mcp_servers: {} })
    const dumped = dump(merged)
    const reloaded = load(dumped) as Record<string, unknown>

    expect(reloaded.model).toBe(original.model)
    expect((reloaded.gateway as { port: number }).port).toBe(
      (original.gateway as { port: number }).port,
    )
    // Existing servers preserved.
    const reloadedMcp = reloaded.mcp_servers as Record<string, unknown>
    const originalMcp = original.mcp_servers as Record<string, unknown>
    expect(Object.keys(reloadedMcp).sort()).toEqual(Object.keys(originalMcp).sort())
  })

  test("load → merge with new server → dump → reload retains existing-wins on collision", async () => {
    const fixturePath = path.join(import.meta.dir, "fixtures", "hermes-config-sample.yaml")
    const original = await readYaml<Record<string, unknown>>(fixturePath)

    const merged = mergeHermesConfig(original, {
      mcp_servers: {
        // Collide with existing context7 — incoming should be ignored.
        context7: { url: "https://incoming-overrides.invalid/mcp" },
        // New entry — should be merged in.
        playwright: { command: "npx", args: ["-y", "@anthropic/mcp-playwright"] },
      },
    })
    const reloaded = load(dump(merged)) as { mcp_servers: Record<string, { url?: string; command?: string }> }
    expect(reloaded.mcp_servers.context7.url).toBe("https://mcp.context7.com/mcp")
    expect(reloaded.mcp_servers.playwright.command).toBe("npx")
  })
})

describe("writeHermesBundle — atomic write + backup", () => {
  test("backs up existing config.yaml before overwriting", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "hermes-backup-"))
    const hermesDir = path.join(tempRoot, ".hermes")
    await fs.mkdir(hermesDir, { recursive: true })
    const configPath = path.join(hermesDir, "config.yaml")
    await fs.writeFile(configPath, dump({ model: "old", mcp_servers: {} }))

    await writeHermesBundle(
      tempRoot,
      emptyBundle({ mcpConfig: { mcp_servers: { x: { command: "y" } } } }),
    )

    const dirEntries = await fs.readdir(hermesDir)
    const backups = dirEntries.filter((e) => e.startsWith("config.yaml.bak."))
    expect(backups.length).toBeGreaterThanOrEqual(1)
  })

  test("writes config.yaml with mode 0o600 (best-effort, owner-readable only)", async () => {
    if (process.platform === "win32") return // mode bits do not apply.
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "hermes-mode-"))
    await writeHermesBundle(
      tempRoot,
      emptyBundle({ mcpConfig: { mcp_servers: { x: { command: "y" } } } }),
    )
    const stat = await fs.stat(path.join(tempRoot, ".hermes", "config.yaml"))
    // File permissions on the lower 9 bits.
    const perms = stat.mode & 0o777
    expect(perms).toBe(0o600)
  })

  test("rename failure cleans up the .tmp file", async () => {
    // Force rename failure by making the destination a non-empty directory
    // (rename of file → existing directory with the same name fails).
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "hermes-rename-fail-"))
    const hermesDir = path.join(tempRoot, ".hermes")
    await fs.mkdir(hermesDir, { recursive: true })
    const configPath = path.join(hermesDir, "config.yaml")
    // Make config.yaml a directory containing a file so rename(file → dir) fails.
    await fs.mkdir(configPath, { recursive: true })
    await fs.writeFile(path.join(configPath, "blocker"), "blocker")

    let threw = false
    try {
      await writeHermesBundle(
        tempRoot,
        emptyBundle({ mcpConfig: { mcp_servers: { x: { command: "y" } } } }),
      )
    } catch {
      threw = true
    }
    expect(threw).toBe(true)
    // The .tmp file must have been cleaned up.
    expect(await exists(`${configPath}.tmp`)).toBe(false)
  })
})

describe("writeHermesBundle — malformed config recovery", () => {
  test("malformed YAML triggers WARN + backup + write fresh", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "hermes-malformed-"))
    const hermesDir = path.join(tempRoot, ".hermes")
    await fs.mkdir(hermesDir, { recursive: true })
    const configPath = path.join(hermesDir, "config.yaml")
    // Intentionally malformed YAML (unbalanced bracket + tab indentation).
    await fs.writeFile(configPath, "model: [unbalanced\n\tnope: yes\n")

    await writeHermesBundle(
      tempRoot,
      emptyBundle({ mcpConfig: { mcp_servers: { x: { command: "y" } } } }),
    )

    // WARN was emitted naming the recovery path.
    expect(warnings.some((w) => w.includes("Failed to parse existing") && w.includes("backed up to"))).toBe(true)
    // Backup file was created.
    const dirEntries = await fs.readdir(hermesDir)
    expect(dirEntries.some((e) => e.startsWith("config.yaml.bak."))).toBe(true)
    // Config was written fresh (only mcp_servers, no malformed remnants).
    const reloaded = await readYaml<{ mcp_servers: Record<string, { command: string }> }>(configPath)
    expect(reloaded.mcp_servers.x.command).toBe("y")
    expect((reloaded as Record<string, unknown>).model).toBeUndefined()
  })
})

describe("writeHermesBundle — cross-plugin collision detection", () => {
  test("plugin2 install warns and skips on skill name owned by plugin1", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "hermes-collision-"))

    // Install plugin1 with skill "code-reviewer".
    await writeHermesBundle(
      tempRoot,
      emptyBundle({
        pluginName: "plugin1",
        generatedSkills: [
          {
            name: "code-reviewer",
            content: "---\nname: code-reviewer\n---\n\nPlugin1's reviewer.\n",
            kind: "command",
          },
        ],
      }),
    )

    expect(
      await exists(path.join(tempRoot, ".hermes", "skills", "code-reviewer", "SKILL.md")),
    ).toBe(true)

    // Now install plugin2, which also has "code-reviewer".
    warnings.length = 0
    logs.length = 0
    await writeHermesBundle(
      tempRoot,
      emptyBundle({
        pluginName: "plugin2",
        generatedSkills: [
          {
            name: "code-reviewer",
            content: "---\nname: code-reviewer\n---\n\nPlugin2's reviewer.\n",
            kind: "command",
          },
        ],
      }),
    )

    // Plugin1's content was NOT overwritten.
    const content = await fs.readFile(
      path.join(tempRoot, ".hermes", "skills", "code-reviewer", "SKILL.md"),
      "utf8",
    )
    expect(content).toContain("Plugin1's reviewer.")
    // Stderr warning was emitted.
    const collisionWarn = warnings.find(
      (w) => w.includes("code-reviewer") && w.includes("plugin1"),
    )
    expect(collisionWarn).toBeDefined()

    // Plugin2's manifest must NOT claim ownership of `code-reviewer` —
    // otherwise its next reinstall (without the skill) would trigger
    // manifest-diff cleanup and DELETE plugin1's content.
    const plugin2Manifest = JSON.parse(
      await fs.readFile(
        path.join(tempRoot, ".hermes", "plugin2", "install-manifest.json"),
        "utf8",
      ),
    ) as { groups: { skills: string[] } }
    expect(plugin2Manifest.groups.skills).not.toContain("code-reviewer")

    // Cascade-fix verification: reinstall plugin2 without `code-reviewer`.
    // Plugin1's content must survive.
    await writeHermesBundle(
      tempRoot,
      emptyBundle({ pluginName: "plugin2", generatedSkills: [] }),
    )
    expect(
      await exists(path.join(tempRoot, ".hermes", "skills", "code-reviewer", "SKILL.md")),
    ).toBe(true)
    const stillThere = await fs.readFile(
      path.join(tempRoot, ".hermes", "skills", "code-reviewer", "SKILL.md"),
      "utf8",
    )
    expect(stillThere).toContain("Plugin1's reviewer.")
  })

  test("backup directory with valid manifest does NOT spoof ownership", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "hermes-spoof-"))
    const hermesDir = path.join(tempRoot, ".hermes")
    await fs.mkdir(hermesDir, { recursive: true })

    // Simulate a user backup of plugin1: directory name differs from the
    // pluginName field inside the manifest.
    const backupDir = path.join(hermesDir, "plugin1.bak.20260501")
    await fs.mkdir(backupDir, { recursive: true })
    await fs.writeFile(
      path.join(backupDir, "install-manifest.json"),
      JSON.stringify({
        version: 1,
        pluginName: "plugin1",
        groups: { skills: ["code-reviewer"] },
      }),
    )

    // Now install plugin2 with `code-reviewer`. The mismatch between the
    // backup dir name (`plugin1.bak.20260501`) and the manifest's
    // pluginName (`plugin1`) must cause the collision check to skip the
    // manifest, so plugin2's skill writes successfully.
    await writeHermesBundle(
      tempRoot,
      emptyBundle({
        pluginName: "plugin2",
        generatedSkills: [
          {
            name: "code-reviewer",
            content: "---\nname: code-reviewer\n---\n\nPlugin2's reviewer.\n",
            kind: "command",
          },
        ],
      }),
    )

    expect(
      await exists(path.join(tempRoot, ".hermes", "skills", "code-reviewer", "SKILL.md")),
    ).toBe(true)
  })
})

describe("writeHermesBundle — manifest-diff cleanup", () => {
  test("v1 install with skill A → v2 reinstall without skill A removes A", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "hermes-diff-"))

    await writeHermesBundle(
      tempRoot,
      emptyBundle({
        generatedSkills: [
          { name: "cmd-a", content: "---\nname: cmd-a\n---\n\nA.\n", kind: "command" },
          { name: "cmd-b", content: "---\nname: cmd-b\n---\n\nB.\n", kind: "command" },
        ],
      }),
    )
    expect(await exists(path.join(tempRoot, ".hermes", "skills", "cmd-a"))).toBe(true)
    expect(await exists(path.join(tempRoot, ".hermes", "skills", "cmd-b"))).toBe(true)

    await writeHermesBundle(
      tempRoot,
      emptyBundle({
        generatedSkills: [
          { name: "cmd-b", content: "---\nname: cmd-b\n---\n\nB v2.\n", kind: "command" },
        ],
      }),
    )

    expect(await exists(path.join(tempRoot, ".hermes", "skills", "cmd-a"))).toBe(false)
    expect(await exists(path.join(tempRoot, ".hermes", "skills", "cmd-b"))).toBe(true)
  })

  test("user-authored skill in <root>/.hermes/skills/ NOT in manifest survives reinstall", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "hermes-userskill-"))
    await writeHermesBundle(
      tempRoot,
      emptyBundle({
        generatedSkills: [
          { name: "cmd-a", content: "---\nname: cmd-a\n---\n\nA.\n", kind: "command" },
        ],
      }),
    )

    // User adds a personal skill that is NOT in the manifest.
    const userSkillPath = path.join(tempRoot, ".hermes", "skills", "my-personal-skill", "SKILL.md")
    await fs.mkdir(path.dirname(userSkillPath), { recursive: true })
    await fs.writeFile(userSkillPath, "---\nname: my-personal-skill\n---\n\nPersonal.\n")

    // Reinstall.
    await writeHermesBundle(
      tempRoot,
      emptyBundle({
        generatedSkills: [
          { name: "cmd-a", content: "---\nname: cmd-a\n---\n\nA v2.\n", kind: "command" },
        ],
      }),
    )

    expect(await exists(userSkillPath)).toBe(true)
  })
})

describe("writeHermesBundle — symlink containment", () => {
  test("realpath check rejects rm of manifest-tracked dir that points outside the managed tree", async () => {
    if (process.platform === "win32") return // symlink semantics differ.

    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "hermes-symlink-"))
    const outsideDir = await fs.mkdtemp(path.join(os.tmpdir(), "hermes-outside-"))
    await fs.writeFile(path.join(outsideDir, "important.txt"), "do not delete")

    // First install creates the manifest with skill cmd-evil.
    await writeHermesBundle(
      tempRoot,
      emptyBundle({
        generatedSkills: [
          { name: "cmd-evil", content: "---\nname: cmd-evil\n---\n\nE.\n", kind: "command" },
        ],
      }),
    )

    // Replace the skill directory with a symlink to the outside dir, mimicking
    // a user-created link that a tampered manifest could try to follow.
    const skillDir = path.join(tempRoot, ".hermes", "skills", "cmd-evil")
    await fs.rm(skillDir, { recursive: true, force: true })
    await fs.symlink(outsideDir, skillDir, "dir")

    // Reinstall WITHOUT cmd-evil — manifest-diff cleanup will try to rm.
    await writeHermesBundle(tempRoot, emptyBundle({ generatedSkills: [] }))

    // The outside file MUST survive — the realpath check refuses to follow.
    expect(await exists(path.join(outsideDir, "important.txt"))).toBe(true)
    expect(
      warnings.some((w) => w.includes("realpath escapes managed tree")),
    ).toBe(true)
  })
})

describe("writeHermesBundle — multi-plugin namespacing", () => {
  test("two plugins coexist with isolated manifests", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "hermes-multi-"))

    await writeHermesBundle(
      tempRoot,
      emptyBundle({
        pluginName: "compound-engineering",
        generatedSkills: [
          { name: "ce-skill", content: "---\nname: ce-skill\n---\n\nCE.\n", kind: "command" },
        ],
      }),
    )
    await writeHermesBundle(
      tempRoot,
      emptyBundle({
        pluginName: "coding-tutor",
        generatedSkills: [
          {
            name: "tutor-skill",
            content: "---\nname: tutor-skill\n---\n\nTutor.\n",
            kind: "command",
          },
        ],
      }),
    )

    expect(
      await exists(path.join(tempRoot, ".hermes", "compound-engineering", "install-manifest.json")),
    ).toBe(true)
    expect(
      await exists(path.join(tempRoot, ".hermes", "coding-tutor", "install-manifest.json")),
    ).toBe(true)
    expect(await exists(path.join(tempRoot, ".hermes", "skills", "ce-skill"))).toBe(true)
    expect(await exists(path.join(tempRoot, ".hermes", "skills", "tutor-skill"))).toBe(true)

    // Reinstall plugin A empty — only its own skill goes; B's stays.
    await writeHermesBundle(
      tempRoot,
      emptyBundle({ pluginName: "compound-engineering", generatedSkills: [] }),
    )
    expect(await exists(path.join(tempRoot, ".hermes", "skills", "ce-skill"))).toBe(false)
    expect(await exists(path.join(tempRoot, ".hermes", "skills", "tutor-skill"))).toBe(true)
  })
})

describe("writeHermesBundle — stdout summary", () => {
  test("logs Installed line; appends dropped commands and skipped MCP servers when non-empty", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "hermes-summary-"))
    await writeHermesBundle(
      tempRoot,
      emptyBundle({
        generatedSkills: [
          { name: "cmd-a", content: "---\nname: cmd-a\n---\n\nA.\n", kind: "command" },
        ],
        droppedCommands: ["disabled-cmd-1", "disabled-cmd-2"],
        skippedMcpServers: ["odd-mcp-entry"],
      }),
    )

    const installedLine = logs.find((l) => l.startsWith("Installed compound-engineering to hermes"))
    expect(installedLine).toBeDefined()
    // Advisory follow-up lines route to stderr (warns) so agents can separate
    // success from advisory output by stream.
    expect(warnings.some((l) => l.includes("Dropped commands:") && l.includes("disabled-cmd-1"))).toBe(
      true,
    )
    expect(warnings.some((l) => l.includes("Skipped MCP servers:") && l.includes("odd-mcp-entry"))).toBe(
      true,
    )
  })

  test("no follow-up lines when dropped/skipped lists are empty", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "hermes-summary-clean-"))
    await writeHermesBundle(tempRoot, emptyBundle())
    const installedLine = logs.find((l) => l.startsWith("Installed compound-engineering to hermes"))
    expect(installedLine).toBeDefined()
    expect(warnings.some((l) => l.includes("Dropped commands:"))).toBe(false)
    expect(warnings.some((l) => l.includes("Skipped MCP servers:"))).toBe(false)
  })
})

describe("cleanupHermesAtRoot", () => {
  test("removes manifest-tracked skills only; leaves user-authored ones; warns about config.yaml", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "hermes-cleanup-"))
    await writeHermesBundle(
      tempRoot,
      emptyBundle({
        generatedSkills: [
          { name: "cmd-a", content: "---\nname: cmd-a\n---\n\nA.\n", kind: "command" },
        ],
        mcpConfig: { mcp_servers: { x: { command: "y" } } },
      }),
    )

    // User-authored skill — NOT in manifest.
    const userSkill = path.join(tempRoot, ".hermes", "skills", "my-skill", "SKILL.md")
    await fs.mkdir(path.dirname(userSkill), { recursive: true })
    await fs.writeFile(userSkill, "user content")

    warnings.length = 0
    await cleanupHermesAtRoot(tempRoot)

    expect(await exists(path.join(tempRoot, ".hermes", "skills", "cmd-a"))).toBe(false)
    expect(await exists(userSkill)).toBe(true)
    // config.yaml is NOT touched.
    expect(await exists(path.join(tempRoot, ".hermes", "config.yaml"))).toBe(true)
    expect(warnings.some((w) => w.includes("config.yaml") && w.includes("manually"))).toBe(true)
  })
})

describe("writeHermesBundle — manifest path safety regression", () => {
  test("manifest entries with traversal segments do not delete outside the managed tree", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "hermes-pathsafe-"))
    // First install — empty bundle to create the managed dir.
    await writeHermesBundle(tempRoot, emptyBundle())
    const managedDir = path.join(tempRoot, ".hermes", "compound-engineering")
    const manifestPath = path.join(managedDir, "install-manifest.json")

    // Tamper: write a manifest with a traversal entry. The shared helper must
    // drop unsafe entries at read time.
    const tampered = {
      version: 1,
      pluginName: "compound-engineering",
      groups: {
        skills: ["safe-skill", "../../../etc/passwd"],
      },
    }
    await fs.writeFile(manifestPath, JSON.stringify(tampered))

    // Create a sentinel outside the managed tree to verify it is NOT deleted.
    const sentinelDir = await fs.mkdtemp(path.join(os.tmpdir(), "hermes-sentinel-"))
    const sentinelPath = path.join(sentinelDir, "sentinel.txt")
    await fs.writeFile(sentinelPath, "do not delete")

    // Re-run install with no skills — would otherwise sweep manifest-listed skills.
    await writeHermesBundle(tempRoot, emptyBundle())

    expect(await exists(sentinelPath)).toBe(true)
  })
})
