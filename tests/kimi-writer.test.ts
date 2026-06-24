import { describe, expect, test } from "bun:test"
import { promises as fs } from "fs"
import path from "path"
import os from "os"
import { mergeKimiConfig, renderKimiHooksToml, writeKimiBundle } from "../src/targets/kimi"
import type { KimiBundle } from "../src/types/kimi"
import type { ClaudeHooks } from "../src/types/claude"

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

async function makeSourceSkill(content: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "kimi-src-"))
  await fs.writeFile(path.join(dir, "SKILL.md"), content, "utf8")
  return dir
}

function baseBundle(overrides: Partial<KimiBundle> = {}): KimiBundle {
  return {
    pluginName: "fixture",
    skillDirs: [],
    generatedSkills: [],
    invocationTargets: { skillTargets: {}, agentTargets: {} },
    ...overrides,
  }
}

describe("writeKimiBundle", () => {
  test("writes skills flat into <root>/skills and records a manifest", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "kimi-root-"))
    const src = await makeSourceSkill("---\nname: existing\ndescription: x\n---\n\nUse .claude/rules here.\n")

    await writeKimiBundle(root, baseBundle({
      skillDirs: [{ name: "existing", sourceDir: src }],
      generatedSkills: [{ name: "from-command", content: "---\nname: from-command\ndescription: y\n---\n\nbody" }],
    }), { outputIsKimiRoot: true })

    expect(await exists(path.join(root, "skills", "existing", "SKILL.md"))).toBe(true)
    expect(await exists(path.join(root, "skills", "from-command", "SKILL.md"))).toBe(true)

    // Content transform applied to pass-through skill.
    const passthrough = await fs.readFile(path.join(root, "skills", "existing", "SKILL.md"), "utf8")
    expect(passthrough).toContain(".kimi-code/rules")
    expect(passthrough).not.toContain(".claude/rules")

    const manifest = JSON.parse(await fs.readFile(path.join(root, "fixture", "install-manifest.json"), "utf8"))
    expect(manifest.skills.sort()).toEqual(["existing", "from-command"])
  })

  test("removes managed skills that disappear on re-install but leaves foreign skills", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "kimi-root-"))

    // Foreign skill the user (or another tool) placed in the shared dir.
    await fs.mkdir(path.join(root, "skills", "user-skill"), { recursive: true })
    await fs.writeFile(path.join(root, "skills", "user-skill", "SKILL.md"), "x", "utf8")

    await writeKimiBundle(root, baseBundle({
      generatedSkills: [{ name: "temp", content: "---\nname: temp\n---\n\nbody" }],
    }), { outputIsKimiRoot: true })
    expect(await exists(path.join(root, "skills", "temp"))).toBe(true)

    // Second install no longer ships "temp".
    await writeKimiBundle(root, baseBundle(), { outputIsKimiRoot: true })
    expect(await exists(path.join(root, "skills", "temp"))).toBe(false)
    // Foreign skill is untouched.
    expect(await exists(path.join(root, "skills", "user-skill"))).toBe(true)
  })

  test("backs up an unmanaged skill dir instead of clobbering it on name collision", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "kimi-root-"))

    // A foreign skill (no install manifest yet) occupies a name we then ship.
    await fs.mkdir(path.join(root, "skills", "shared-name"), { recursive: true })
    await fs.writeFile(path.join(root, "skills", "shared-name", "SKILL.md"), "foreign", "utf8")
    await fs.writeFile(path.join(root, "skills", "shared-name", "user-data.txt"), "keep me", "utf8")

    await writeKimiBundle(root, baseBundle({
      generatedSkills: [{ name: "shared-name", content: "---\nname: shared-name\n---\n\nours" }],
    }), { outputIsKimiRoot: true })

    // Our content is written...
    const written = await fs.readFile(path.join(root, "skills", "shared-name", "SKILL.md"), "utf8")
    expect(written).toContain("ours")

    // ...and the foreign directory was preserved in a timestamped backup.
    const entries = await fs.readdir(path.join(root, "skills"))
    const backup = entries.find((name) => name.startsWith("shared-name.bak."))
    expect(backup).toBeDefined()
    const preserved = await fs.readFile(path.join(root, "skills", backup!, "user-data.txt"), "utf8")
    expect(preserved).toBe("keep me")
  })

  test("merges MCP servers into mcp.json preserving user entries", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "kimi-root-"))
    await fs.writeFile(
      path.join(root, "mcp.json"),
      JSON.stringify({ mcpServers: { userServer: { command: "user" } } }, null, 2),
      "utf8",
    )

    await writeKimiBundle(root, baseBundle({
      mcpServers: { local: { command: "echo", args: ["hi"] } },
    }), { outputIsKimiRoot: true })

    const mcp = JSON.parse(await fs.readFile(path.join(root, "mcp.json"), "utf8"))
    expect(mcp.mcpServers.userServer).toEqual({ command: "user" })
    expect(mcp.mcpServers.local).toEqual({ command: "echo", args: ["hi"] })

    // Re-install without our server removes ours, keeps the user's.
    await writeKimiBundle(root, baseBundle(), { outputIsKimiRoot: true })
    const mcp2 = JSON.parse(await fs.readFile(path.join(root, "mcp.json"), "utf8"))
    expect(mcp2.mcpServers.userServer).toEqual({ command: "user" })
    expect(mcp2.mcpServers.local).toBeUndefined()
  })

  test("writes hooks into config.toml inside a managed block", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "kimi-root-"))
    const hooks: ClaudeHooks = {
      hooks: {
        PostToolUse: [
          { matcher: "Write|Edit", hooks: [{ type: "command", command: "prettier --write" }] },
        ],
      },
    }
    await writeKimiBundle(root, baseBundle({ hooks }), { outputIsKimiRoot: true })

    const config = await fs.readFile(path.join(root, "config.toml"), "utf8")
    expect(config).toContain("[[hooks]]")
    expect(config).toContain('event = "PostToolUse"')
    // Kimi Code CLI shares Claude's Write/Edit tool names, so they pass through.
    expect(config).toContain('matcher = "Write|Edit"')
    expect(config).toContain('command = "prettier --write"')
  })
})

describe("renderKimiHooksToml", () => {
  test("returns null when there are no command hooks", () => {
    expect(renderKimiHooksToml(undefined)).toBeNull()
    expect(
      renderKimiHooksToml({ hooks: { Stop: [{ hooks: [{ type: "prompt", prompt: "hi" }] }] } }),
    ).toBeNull()
  })

  test("emits timeout and drops empty matchers", () => {
    const toml = renderKimiHooksToml({
      hooks: {
        Stop: [{ matcher: "*", hooks: [{ type: "command", command: "check.sh", timeout: 10 }] }],
      },
    })
    expect(toml).toContain('event = "Stop"')
    expect(toml).toContain("timeout = 10")
    expect(toml).not.toContain("matcher =")
  })

  test("skips events Kimi does not support", () => {
    expect(
      renderKimiHooksToml({ hooks: { NonExistentEvent: [{ hooks: [{ type: "command", command: "x" }] }] } }),
    ).toBeNull()
  })
})

describe("mergeKimiConfig", () => {
  test("returns null for empty config and no hooks", () => {
    expect(mergeKimiConfig("", null)).toBeNull()
  })

  test("appends a managed block while preserving user config", () => {
    const merged = mergeKimiConfig("merge_all_available_skills = true\n", '[[hooks]]\nevent = "Stop"')
    expect(merged).toContain("merge_all_available_skills = true")
    expect(merged).toContain("BEGIN Compound Engineering plugin hooks")
    expect(merged).toContain('event = "Stop"')
  })

  test("replaces a prior managed block instead of duplicating", () => {
    const first = mergeKimiConfig("user = 1\n", '[[hooks]]\nevent = "Stop"')!
    const second = mergeKimiConfig(first, '[[hooks]]\nevent = "PreToolUse"')!
    expect(second).toContain('event = "PreToolUse"')
    expect(second).not.toContain('event = "Stop"')
    expect((second.match(/BEGIN Compound Engineering plugin hooks/g) ?? []).length).toBe(1)
  })

  test("strips the managed block when hooks are removed", () => {
    const withHooks = mergeKimiConfig("user = 1\n", '[[hooks]]\nevent = "Stop"')!
    const stripped = mergeKimiConfig(withHooks, null)!
    expect(stripped).toContain("user = 1")
    expect(stripped).not.toContain("BEGIN Compound Engineering plugin hooks")
  })
})
