import { describe, expect, test } from "bun:test"
import { promises as fs } from "fs"
import path from "path"
import os from "os"
import { writeGrokBundle, getGrokDevVersion } from "../src/targets/grok"
import type { GrokBundle } from "../src/types/grok"
import * as fsSync from "fs"  // for sync helpers in tests

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

describe("writeGrokBundle", () => {
  test("writes clean self-contained Grok plugin layout (no managed artifacts)", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "grok-writer-test-"))

    const bundle: GrokBundle = {
      pluginName: "compound-engineering",
      generatedSkills: [],
      skillDirs: [],
      agents: [
        {
          name: "ce-correctness-reviewer",
          content: "---\nname: ce-correctness-reviewer\nprompt_mode: full\nmodel: inherit\npermission_mode: default\nagents_md: true\n---\n\nReview for logic errors.",
        },
      ],
      commands: [],
      mcpServers: undefined,
      pluginJson: {
        name: "compound-engineering",
        version: "0.0.0-dev-grok",
        description: "Test Grok plugin",
      },
    }

    await writeGrokBundle(tempRoot, bundle)

    const root = path.join(tempRoot, "compound-engineering")
    expect(await exists(path.join(root, "plugin.json"))).toBe(true)
    expect(await exists(path.join(root, "agents", "ce-correctness-reviewer.md"))).toBe(true)

    const pj = JSON.parse(await fs.readFile(path.join(root, "plugin.json"), "utf8"))
    expect(pj.name).toBe("compound-engineering")
  })

  test("writes skills with transform applied when skillDirs provided (integration with grok-content)", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "grok-writer-skill-"))
    const fixtureSkillDir = path.join(import.meta.dir, "fixtures", "sample-plugin", "skills", "skill-one")

    const bundle: GrokBundle = {
      pluginName: "test-grok",
      generatedSkills: [],
      skillDirs: [
        {
          name: "skill-one",
          sourceDir: fixtureSkillDir,
        },
      ],
      agents: [],
      commands: [],
    }

    await writeGrokBundle(tempRoot, bundle)

    const writtenSkill = path.join(tempRoot, "test-grok", "skills", "skill-one", "SKILL.md")
    expect(await exists(writtenSkill)).toBe(true)

    const content = await fs.readFile(writtenSkill, "utf8")
    // The writer uses transformContentForGrok with transformAllMarkdown=true
    // We don't assert specific transform here (covered in grok-content.test.ts), just that it wrote
    expect(content.length).toBeGreaterThan(10)
  })

  test("logs helpful grok plugin install instructions", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "grok-log-"))
    const bundle: GrokBundle = {
      pluginName: "compound-engineering",
      generatedSkills: [],
      skillDirs: [],
      agents: [],
      commands: [],
    }

    // Capture console.log
    const logs: string[] = []
    const origLog = console.log
    console.log = (...args: any[]) => logs.push(args.join(" "))

    await writeGrokBundle(tempRoot, bundle)
    console.log = origLog

    const combined = logs.join("\n")
    expect(combined).toContain("grok plugin install")
    expect(combined).toContain("--plugin-dir")
  })
})

describe("getGrokDevVersion", () => {
  test("returns sha-suffixed version when run inside a git repository", () => {
    const version = getGrokDevVersion(process.cwd())
    expect(version).toMatch(/^0\.0\.0-dev-grok-[0-9a-f]{7,}$/)
  })

  test("falls back gracefully outside a git repository", () => {
    const tempDir = fsSync.mkdtempSync(path.join(os.tmpdir(), "grok-no-git-"))
    const version = getGrokDevVersion(tempDir)
    expect(version).toBe("0.0.0-dev-grok")
    fsSync.rmSync(tempDir, { recursive: true, force: true })
  })

  test("includes cwd in fallback warning for observability (characterization of hardened behavior)", () => {
    const tempDir = fsSync.mkdtempSync(path.join(os.tmpdir(), "grok-fallback-obs-"))
    // Capture warnings
    const warns: string[] = []
    const origWarn = console.warn
    console.warn = (...args: any[]) => warns.push(args.join(" "))

    const version = getGrokDevVersion(tempDir)
    console.warn = origWarn
    fsSync.rmSync(tempDir, { recursive: true, force: true })

    expect(version).toBe("0.0.0-dev-grok")
    const combined = warns.join("\n")
    expect(combined).toContain("Could not determine git sha")
    expect(combined).toContain(tempDir) // cwd is observable in the message
  })
})

describe("writeGrokBundle version + logging + real skill roundtrips (U3 coverage)", () => {
  test("emits the computed dev version (sha when available) in plugin.json and the success log lines", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "grok-version-log-"))

    const logs: string[] = []
    const origLog = console.log
    console.log = (...args: any[]) => logs.push(args.join(" "))

    const bundle: GrokBundle = {
      pluginName: "compound-engineering",
      generatedSkills: [],
      skillDirs: [],
      agents: [],
      commands: [],
    }

    await writeGrokBundle(tempRoot, bundle)
    console.log = origLog

    const root = path.join(tempRoot, "compound-engineering")
    const pj = JSON.parse(await fs.readFile(path.join(root, "plugin.json"), "utf8"))

    // Version is either the sha form (when run inside the mirror git tree) or the placeholder
    expect(pj.version).toMatch(/^0\.0\.0-dev-grok/)

    const combined = logs.join("\n")
    expect(combined).toContain("Grok plugin written to")
    expect(combined).toContain(pj.version) // version appears in the primary success line
    expect(combined).toContain("grok plugin install")
  })

  test("full Grok write roundtrip on real ce-plan skill applies date specialization while source stays portable", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "grok-date-roundtrip-"))
    const realCePlanDir = path.join(import.meta.dir, "..", "plugins", "compound-engineering", "skills", "ce-plan")

    const bundle: GrokBundle = {
      pluginName: "compound-engineering",
      generatedSkills: [],
      skillDirs: [
        {
          name: "ce-plan",
          sourceDir: realCePlanDir,
        },
      ],
      agents: [],
      commands: [],
    }

    await writeGrokBundle(tempRoot, bundle)

    const written = path.join(tempRoot, "compound-engineering", "skills", "ce-plan", "SKILL.md")
    expect(await exists(written)).toBe(true)

    const emitted = await fs.readFile(written, "utf8")
    // Grok-specific form must be present in the converted output (from rewriteDateStampingInstructions)
    expect(emitted).toContain('run_terminal_command')
    expect(emitted).toContain('command: "date +%Y-%m-%d"')

    // Source of truth on disk (mirror) must remain the portable form (no Grok leakage)
    const source = await fs.readFile(path.join(realCePlanDir, "SKILL.md"), "utf8")
    expect(source).toContain("appropriate terminal or shell execution command for your current harness")
    expect(source).not.toContain("run_terminal_command under Grok")
    expect(source).not.toContain("Grok (this plugin under the Grok target)")
  })
})
