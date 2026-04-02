import { afterEach, describe, expect, spyOn, test } from "bun:test"
import { promises as fs } from "fs"
import path from "path"
import os from "os"
import { writePiBundle } from "../src/targets/pi"
import type { PiBundle } from "../src/types/pi"
import { resolvePiLayout } from "../src/utils/pi-layout"
import { setAtomicWriteFailureHookForTests, setManagedPathSnapshotHookForTests } from "../src/utils/files"
import { getPiPolicyFingerprint, setPiPolicyFingerprintForTests } from "../src/utils/pi-policy"
import {
  createManagedArtifact,
  createPiManagedSection,
  getPiManagedTrustInfo,
  loadPiManagedStateWithTrust,
  replacePiManagedSection,
  writePiManagedState,
} from "../src/utils/pi-managed"

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

afterEach(() => {
  setAtomicWriteFailureHookForTests(null)
  setManagedPathSnapshotHookForTests(null)
  setPiPolicyFingerprintForTests(null)
})

describe("writePiBundle", () => {
  test("classifies freshly written install manifests as verified for their canonical root", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pi-writer-verified-"))
    const stateHome = path.join(tempRoot, "state-home")
    process.env.COMPOUND_ENGINEERING_HOME = stateHome

    const outputRoot = path.join(tempRoot, ".pi")
    const bundle: PiBundle = {
      pluginName: "compound-engineering",
      prompts: [{ name: "workflows-plan", content: "Prompt content" }],
      skillDirs: [],
      generatedSkills: [],
      extensions: [],
    }

    await writePiBundle(outputRoot, bundle)

    const layout = resolvePiLayout(outputRoot, "install")
    const trust = await loadPiManagedStateWithTrust(layout)
    expect(trust.status).toBe("verified")
    expect(trust.state?.install.artifacts).toHaveLength(1)

    delete process.env.COMPOUND_ENGINEERING_HOME
  })

  test("persists the current Pi policy fingerprint in install managed state", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pi-writer-policy-fingerprint-"))
    const stateHome = path.join(tempRoot, "state-home")
    process.env.COMPOUND_ENGINEERING_HOME = stateHome

    await writePiBundle(path.join(tempRoot, ".pi"), {
      pluginName: "compound-engineering",
      prompts: [{ name: "plan-review", content: "Body" }],
      skillDirs: [],
      generatedSkills: [],
      extensions: [],
    })

    const trust = await loadPiManagedStateWithTrust(resolvePiLayout(path.join(tempRoot, ".pi"), "install"))
    expect(trust.state?.policyFingerprint).toBe(getPiPolicyFingerprint())

    delete process.env.COMPOUND_ENGINEERING_HOME
  })

  test("treats install managed state as stale when the policy fingerprint changes", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pi-writer-policy-fingerprint-stale-"))
    const stateHome = path.join(tempRoot, "state-home")
    const outputRoot = path.join(tempRoot, ".pi")
    process.env.COMPOUND_ENGINEERING_HOME = stateHome

    setPiPolicyFingerprintForTests("policy-v1")
    await writePiBundle(outputRoot, {
      pluginName: "compound-engineering",
      prompts: [{ name: "plan-review", content: "Body" }],
      skillDirs: [],
      generatedSkills: [],
      extensions: [],
    })

    setPiPolicyFingerprintForTests("policy-v2")
    const trust = await loadPiManagedStateWithTrust(resolvePiLayout(outputRoot, "install"))
    expect(trust.status).toBe("stale")
    expect(trust.verifiedSections.install).toBe(false)

    delete process.env.COMPOUND_ENGINEERING_HOME
  })

  test("treats only explicit Pi roots as direct install roots", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pi-writer-layout-roots-"))
    const previousHome = process.env.HOME
    try {
      process.env.HOME = tempRoot
      const projectPiRoot = path.join(tempRoot, ".pi")
      const globalPiRoot = path.join(tempRoot, ".pi", "agent")
      const customAgentRoot = path.join(tempRoot, "agent")

      expect(resolvePiLayout(projectPiRoot, "install").root).toBe(projectPiRoot)
      expect(resolvePiLayout(globalPiRoot, "install").root).toBe(globalPiRoot)
      expect(resolvePiLayout(customAgentRoot, "install").root).toBe(path.join(customAgentRoot, ".pi"))
    } finally {
      process.env.HOME = previousHome
    }
  })

  test("writes custom install roots named agent under the nested .pi layout", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pi-writer-agent-root-"))
    const outputRoot = path.join(tempRoot, "agent")

    await writePiBundle(outputRoot, {
      pluginName: "compound-engineering",
      prompts: [{ name: "workflows-plan", content: "Prompt content" }],
      skillDirs: [],
      generatedSkills: [],
      extensions: [],
    })

    expect(await exists(path.join(outputRoot, ".pi", "prompts", "workflows-plan.md"))).toBe(true)
    expect(await exists(path.join(outputRoot, "prompts", "workflows-plan.md"))).toBe(false)
  })

  test("treats malformed machine-key state as unverified", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pi-writer-machine-key-invalid-"))
    const stateHome = path.join(tempRoot, "state-home")
    process.env.COMPOUND_ENGINEERING_HOME = stateHome

    const outputRoot = path.join(tempRoot, ".pi")
    await writePiBundle(outputRoot, {
      pluginName: "compound-engineering",
      prompts: [{ name: "workflows-plan", content: "Prompt content" }],
      skillDirs: [],
      generatedSkills: [],
      extensions: [],
    })

    const machineKeyPath = path.join(stateHome, ".compound-engineering", "pi-managed-key")
    await fs.writeFile(machineKeyPath, "\n")

    const trust = await loadPiManagedStateWithTrust(resolvePiLayout(outputRoot, "install"))
    expect(trust.status).toBe("legacy")

    delete process.env.COMPOUND_ENGINEERING_HOME
  })

  test("concurrent machine-key initialization keeps both newly written manifests verified", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pi-writer-machine-key-race-"))
    const stateHome = path.join(tempRoot, "state-home")
    process.env.COMPOUND_ENGINEERING_HOME = stateHome

    const layoutA = resolvePiLayout(path.join(tempRoot, "workspace-a", ".pi"), "install")
    const layoutB = resolvePiLayout(path.join(tempRoot, "workspace-b", ".pi"), "install")
    const stateA = replacePiManagedSection(null, "install", createPiManagedSection({
      artifacts: [createManagedArtifact(layoutA, "prompt", "workflow-a", "workflow-a")],
    }), "compound-engineering")
    const stateB = replacePiManagedSection(null, "install", createPiManagedSection({
      artifacts: [createManagedArtifact(layoutB, "prompt", "workflow-b", "workflow-b")],
    }), "compound-engineering")

    await Promise.all([
      writePiManagedState(layoutA, stateA, { install: true, sync: false }),
      writePiManagedState(layoutB, stateB, { install: true, sync: false }),
    ])

    const trustA = await loadPiManagedStateWithTrust(layoutA)
    const trustB = await loadPiManagedStateWithTrust(layoutB)
    expect(trustA.status).toBe("verified")
    expect(trustB.status).toBe("verified")

    delete process.env.COMPOUND_ENGINEERING_HOME
  })

  test("treats copied managed manifests as stale when the canonical root changes", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pi-writer-stale-copy-"))
    const stateHome = path.join(tempRoot, "state-home")
    process.env.COMPOUND_ENGINEERING_HOME = stateHome

    const sourceRoot = path.join(tempRoot, "source", ".pi")
    const copiedRoot = path.join(tempRoot, "copied", ".pi")
    const bundle: PiBundle = {
      pluginName: "compound-engineering",
      prompts: [{ name: "workflows-plan", content: "Prompt content" }],
      skillDirs: [],
      generatedSkills: [],
      extensions: [],
    }

    await writePiBundle(sourceRoot, bundle)

    const sourceLayout = resolvePiLayout(sourceRoot, "install")
    const copiedLayout = resolvePiLayout(copiedRoot, "install")
    await fs.mkdir(path.dirname(copiedLayout.managedManifestPath), { recursive: true })
    await fs.copyFile(sourceLayout.managedManifestPath, copiedLayout.managedManifestPath)

    const copiedTrust = await loadPiManagedStateWithTrust(copiedLayout)
    expect(copiedTrust.status).toBe("legacy")

    delete process.env.COMPOUND_ENGINEERING_HOME
  })

  test("writes prompts, skills, extensions, mcporter config, and AGENTS.md block", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pi-writer-"))
    const outputRoot = path.join(tempRoot, ".pi")

    const bundle: PiBundle = {
      prompts: [{ name: "workflows-plan", content: "Prompt content" }],
      skillDirs: [
        {
          name: "skill-one",
          sourceDir: path.join(import.meta.dir, "fixtures", "sample-plugin", "skills", "skill-one"),
        },
      ],
      generatedSkills: [{ name: "repo-research-analyst", content: "---\nname: repo-research-analyst\n---\n\nBody" }],
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
    expect(await exists(path.join(outputRoot, "skills", "repo-research-analyst", "SKILL.md"))).toBe(true)
    expect(await exists(path.join(outputRoot, "extensions", "compound-engineering-compat.ts"))).toBe(true)
    expect(await exists(path.join(outputRoot, "compound-engineering", "mcporter.json"))).toBe(true)

    const agentsPath = path.join(outputRoot, "AGENTS.md")
    const agentsContent = await fs.readFile(agentsPath, "utf8")
    expect(agentsContent).toContain("BEGIN COMPOUND PI TOOL MAP")
    expect(agentsContent).toContain("MCPorter")
    expect(agentsContent).toContain("compound-engineering/mcporter.json (project sync)")
    expect(agentsContent).toContain(".pi/compound-engineering/mcporter.json (project install)")
  })

  test("rejects unsafe bundle names before mutating Pi roots", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pi-writer-unsafe-name-"))
    const outputRoot = path.join(tempRoot, ".pi")

    await expect(writePiBundle(outputRoot, {
      pluginName: "compound-engineering",
      prompts: [{ name: "../escape", content: "Prompt content" }],
      skillDirs: [],
      generatedSkills: [],
      extensions: [],
    })).rejects.toThrow("Unsafe prompt name")

    await expect(fs.access(path.join(outputRoot, "prompts", "..", "escape.md"))).rejects.toBeDefined()
    await expect(fs.access(path.join(outputRoot, "prompts"))).rejects.toBeDefined()
  })

  test("transforms Task calls in copied SKILL.md files", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pi-skill-transform-"))
    const outputRoot = path.join(tempRoot, ".pi")
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
- Task compound-engineering:review:code-simplicity-reviewer()
`,
    )

    const bundle: PiBundle = {
      prompts: [],
      skillDirs: [{ name: "ce-plan", sourceDir: sourceSkillDir }],
      generatedSkills: [],
      extensions: [],
    }

    await writePiBundle(outputRoot, bundle)

    const installedSkill = await fs.readFile(
      path.join(outputRoot, "skills", "ce-plan", "SKILL.md"),
      "utf8",
    )

    expect(installedSkill).toContain("name: ce-plan")
    expect(installedSkill).toContain('Run ce_subagent with agent="repo-research-analyst" and task="feature_description".')
    expect(installedSkill).toContain('Run ce_subagent with agent="learnings-researcher" and task="feature_description".')
    expect(installedSkill).toContain('Run ce_subagent with agent="code-simplicity-reviewer".')
    expect(installedSkill).not.toContain("Task compound-engineering:")
  })

  test("writes to explicit ~/.pi/agent roots without nesting under .pi", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pi-agent-root-"))
    const previousHome = process.env.HOME
    try {
      process.env.HOME = tempRoot
      const outputRoot = path.join(tempRoot, ".pi", "agent")

      const bundle: PiBundle = {
        prompts: [{ name: "workflows-work", content: "Prompt content" }],
        skillDirs: [],
        generatedSkills: [],
        extensions: [],
      }

      await writePiBundle(outputRoot, bundle)

      expect(await exists(path.join(outputRoot, "prompts", "workflows-work.md"))).toBe(true)
      expect(await exists(path.join(outputRoot, ".pi"))).toBe(false)
    } finally {
      process.env.HOME = previousHome
    }
  })

  test("writes custom install roots under nested .pi layout", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pi-custom-root-"))
    const outputRoot = path.join(tempRoot, "custom-root")

    await writePiBundle(outputRoot, {
      prompts: [{ name: "workflows-work", content: "Prompt content" }],
      skillDirs: [],
      generatedSkills: [],
      extensions: [],
    })

    expect(await exists(path.join(outputRoot, ".pi", "prompts", "workflows-work.md"))).toBe(true)
    expect(await exists(path.join(outputRoot, "prompts", "workflows-work.md"))).toBe(false)
  })

  test("canonicalizes trailing separators on explicit direct Pi roots", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pi-direct-root-trailing-slash-"))
    const outputRoot = path.join(tempRoot, ".pi") + path.sep

    expect(resolvePiLayout(outputRoot, "install").root).toBe(path.join(tempRoot, ".pi"))

    await writePiBundle(outputRoot, {
      pluginName: "compound-engineering",
      prompts: [{ name: "workflows-plan", content: "Prompt content" }],
      skillDirs: [],
      generatedSkills: [],
      extensions: [],
    })

    expect(await exists(path.join(tempRoot, ".pi", "prompts", "workflows-plan.md"))).toBe(true)
    expect(await exists(path.join(tempRoot, ".pi", ".pi"))).toBe(false)
  })

  test("cleans legacy flat custom-root prompts after writing the canonical nested layout", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pi-custom-root-legacy-prompt-"))
    const stateHome = path.join(tempRoot, "state-home")
    process.env.COMPOUND_ENGINEERING_HOME = stateHome
    const outputRoot = path.join(tempRoot, "custom-root")
    const legacyPromptPath = path.join(outputRoot, "prompts", "workflows-work.md")
    const directLayout = resolvePiLayout(outputRoot, "sync")

    await fs.mkdir(path.dirname(legacyPromptPath), { recursive: true })
    await fs.writeFile(legacyPromptPath, "legacy prompt\n")
    let directState = replacePiManagedSection(null, "install", createPiManagedSection({
      artifacts: [createManagedArtifact(directLayout, "prompt", "workflows-work", "workflows-work")],
    }), "compound-engineering")
    directState = replacePiManagedSection(directState, "sync", createPiManagedSection({
      mcpServers: ["sync-owned"],
    }))
    await writePiManagedState(directLayout, directState, { install: true, sync: true })

    await writePiBundle(outputRoot, {
      prompts: [{ name: "workflows-work", content: "Prompt content" }],
      skillDirs: [],
      generatedSkills: [],
      extensions: [],
    })

    expect(await exists(path.join(outputRoot, ".pi", "prompts", "workflows-work.md"))).toBe(true)
    expect(await exists(legacyPromptPath)).toBe(false)

    delete process.env.COMPOUND_ENGINEERING_HOME
  })

  test("preserves direct-root sync prompts by avoiding legacy install cleanup for sync-owned paths", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pi-custom-root-sync-prompt-"))
    const stateHome = path.join(tempRoot, "state-home")
    process.env.COMPOUND_ENGINEERING_HOME = stateHome
    const outputRoot = path.join(tempRoot, "custom-root")
    const legacyPromptPath = path.join(outputRoot, "prompts", "workflows-work.md")
    const directLayout = resolvePiLayout(outputRoot, "sync")

    await fs.mkdir(path.dirname(legacyPromptPath), { recursive: true })
    await fs.writeFile(legacyPromptPath, "sync-owned prompt\n")

    let directState = replacePiManagedSection(null, "install", createPiManagedSection({
      artifacts: [createManagedArtifact(directLayout, "prompt", "workflows-work", "workflows-work")],
    }), "compound-engineering")
    directState = replacePiManagedSection(directState, "sync", createPiManagedSection({
      artifacts: [createManagedArtifact(directLayout, "prompt", "workflows-work", "workflows-work")],
    }))
    await writePiManagedState(directLayout, directState, { install: true, sync: true })

    await writePiBundle(outputRoot, {
      prompts: [{ name: "workflows-work", content: "Prompt content" }],
      skillDirs: [],
      generatedSkills: [],
      extensions: [],
    })

    expect(await exists(path.join(outputRoot, ".pi", "prompts", "workflows-work.md"))).toBe(true)
    expect(await exists(legacyPromptPath)).toBe(true)

    const directTrust = await loadPiManagedStateWithTrust(directLayout)
    expect(directTrust.state?.sync.artifacts).toEqual([
      expect.objectContaining({
        emittedName: "workflows-work",
        kind: "prompt",
      }),
    ])

    delete process.env.COMPOUND_ENGINEERING_HOME
  })

  test("preserves legacy direct-root prompts when install ownership cannot be proven", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pi-custom-root-unverified-install-prompt-"))
    const stateHome = path.join(tempRoot, "state-home")
    process.env.COMPOUND_ENGINEERING_HOME = stateHome
    const outputRoot = path.join(tempRoot, "custom-root")
    const legacyPromptPath = path.join(outputRoot, "prompts", "workflows-work.md")
    const directLayout = resolvePiLayout(outputRoot, "sync")

    await fs.mkdir(path.dirname(legacyPromptPath), { recursive: true })
    await fs.writeFile(legacyPromptPath, "legacy prompt\n")

    const directState = replacePiManagedSection(null, "sync", createPiManagedSection({
      mcpServers: ["sync-owned"],
    }), "compound-engineering")
    await writePiManagedState(directLayout, directState, { install: false, sync: true })

    await writePiBundle(outputRoot, {
      prompts: [{ name: "workflows-work", content: "Prompt content" }],
      skillDirs: [],
      generatedSkills: [],
      extensions: [],
    })

    expect(await exists(path.join(outputRoot, ".pi", "prompts", "workflows-work.md"))).toBe(true)
    expect(await exists(legacyPromptPath)).toBe(true)

    delete process.env.COMPOUND_ENGINEERING_HOME
  })

  test("removes verified legacy direct-root compat extension for custom-root installs when sync has no claim", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pi-custom-root-legacy-compat-"))
    const stateHome = path.join(tempRoot, "state-home")
    process.env.COMPOUND_ENGINEERING_HOME = stateHome
    const outputRoot = path.join(tempRoot, "custom-root")
    const directLayout = resolvePiLayout(outputRoot, "sync")
    const legacyCompatPath = path.join(outputRoot, "extensions", "compound-engineering-compat.ts")

    await fs.mkdir(path.dirname(legacyCompatPath), { recursive: true })
    await fs.writeFile(legacyCompatPath, "legacy compat\n")
    let directState = replacePiManagedSection(null, "install", createPiManagedSection({
      sharedResources: { compatExtension: true },
    }), "compound-engineering")
    directState = replacePiManagedSection(directState, "sync", createPiManagedSection({
      mcpServers: ["sync-owned"],
    }))
    await writePiManagedState(directLayout, directState, { install: true, sync: true })

    await writePiBundle(outputRoot, {
      prompts: [],
      skillDirs: [],
      generatedSkills: [],
      extensions: [{ name: "compound-engineering-compat.ts", content: "export const compat = true" }],
    })

    expect(await exists(path.join(outputRoot, ".pi", "extensions", "compound-engineering-compat.ts"))).toBe(true)
    expect(await exists(legacyCompatPath)).toBe(false)

    delete process.env.COMPOUND_ENGINEERING_HOME
  })

  test("prunes only verified legacy install-owned direct-root mcporter keys for custom-root installs", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pi-custom-root-legacy-mcporter-"))
    const stateHome = path.join(tempRoot, "state-home")
    process.env.COMPOUND_ENGINEERING_HOME = stateHome
    const outputRoot = path.join(tempRoot, "custom-root")
    const directLayout = resolvePiLayout(outputRoot, "sync")

    let directState = replacePiManagedSection(null, "install", createPiManagedSection({
      mcpServers: ["install-owned"],
      sharedResources: { mcporterConfig: true },
    }), "compound-engineering")
    directState = replacePiManagedSection(directState, "sync", createPiManagedSection({
      mcpServers: ["sync-owned"],
      sharedResources: { mcporterConfig: true },
    }))
    await writePiManagedState(directLayout, directState, { install: true, sync: true })
    await fs.mkdir(path.dirname(directLayout.mcporterConfigPath), { recursive: true })
    await fs.writeFile(
      directLayout.mcporterConfigPath,
      JSON.stringify({
        mcpServers: {
          "install-owned": { command: "install-cmd" },
          "sync-owned": { command: "sync-cmd" },
          unrelated: { command: "user-cmd" },
        },
      }, null, 2) + "\n",
    )

    await writePiBundle(outputRoot, {
      prompts: [],
      skillDirs: [],
      generatedSkills: [],
      extensions: [],
      mcporterConfig: {
        mcpServers: {
          nested: { command: "nested-cmd" },
        },
      },
    })

    expect(await exists(path.join(outputRoot, ".pi", "compound-engineering", "mcporter.json"))).toBe(true)
    const currentConfig = JSON.parse(await fs.readFile(directLayout.mcporterConfigPath, "utf8")) as {
      mcpServers: Record<string, unknown>
    }
    expect(currentConfig.mcpServers["install-owned"]).toBeUndefined()
    expect(currentConfig.mcpServers["sync-owned"]).toBeDefined()
    expect(currentConfig.mcpServers.unrelated).toBeDefined()

    delete process.env.COMPOUND_ENGINEERING_HOME
  })

  test("warns and preserves legacy direct-root compat state when sync trust is unavailable", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pi-custom-root-legacy-compat-ambiguous-"))
    const stateHome = path.join(tempRoot, "state-home")
    process.env.COMPOUND_ENGINEERING_HOME = stateHome
    const outputRoot = path.join(tempRoot, "custom-root")
    const directLayout = resolvePiLayout(outputRoot, "sync")
    const legacyCompatPath = path.join(outputRoot, "extensions", "compound-engineering-compat.ts")
    const warnSpy = spyOn(console, "warn").mockImplementation(() => {})

    let directState = replacePiManagedSection(null, "install", createPiManagedSection({
      sharedResources: { compatExtension: true },
    }), "compound-engineering")
    directState = replacePiManagedSection(directState, "sync", createPiManagedSection({
      sharedResources: { compatExtension: true },
    }))
    await writePiManagedState(directLayout, directState, { install: true, sync: true })

    const manifest = JSON.parse(await fs.readFile(directLayout.managedManifestPath, "utf8")) as {
      sync?: { sharedResources?: { compatExtension?: boolean } }
    }
    manifest.sync = {
      ...(manifest.sync ?? {}),
      sharedResources: { compatExtension: false },
    }
    await fs.writeFile(directLayout.managedManifestPath, JSON.stringify(manifest, null, 2) + "\n")

    await fs.mkdir(path.dirname(legacyCompatPath), { recursive: true })
    await fs.writeFile(legacyCompatPath, "legacy compat\n")

    await writePiBundle(outputRoot, {
      prompts: [],
      skillDirs: [],
      generatedSkills: [],
      extensions: [{ name: "compound-engineering-compat.ts", content: "export const compat = true" }],
    })

    expect(await fs.readFile(legacyCompatPath, "utf8")).toBe("legacy compat\n")
    expect(await exists(path.join(outputRoot, ".pi", "extensions", "compound-engineering-compat.ts"))).toBe(true)
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("compound-engineering-compat.ts"))

    warnSpy.mockRestore()
    delete process.env.COMPOUND_ENGINEERING_HOME
  })

  test("rewrites copied skill frontmatter names to match Pi-safe directory names", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pi-skill-frontmatter-"))
    const outputRoot = path.join(tempRoot, ".pi")
    const sourceSkillDir = path.join(tempRoot, "source-skill")

    await fs.mkdir(sourceSkillDir, { recursive: true })
    await fs.writeFile(
      path.join(sourceSkillDir, "SKILL.md"),
      [
        "---",
        "name: generate_command",
        "description: Generate a command",
        "---",
        "",
        "# Generate command",
        "",
        "1. Task compound-engineering:workflow:pr-comment-resolver(comment1)",
      ].join("\n"),
    )

    const bundle: PiBundle = {
      prompts: [],
      skillDirs: [
        {
          name: "generate-command",
          sourceDir: sourceSkillDir,
        },
      ],
      generatedSkills: [],
      extensions: [],
    }

    await writePiBundle(outputRoot, bundle)

    const copiedSkill = await fs.readFile(path.join(outputRoot, "skills", "generate-command", "SKILL.md"), "utf8")
    expect(copiedSkill).toContain("name: generate-command")
    expect(copiedSkill).not.toContain("name: generate_command")
    expect(copiedSkill).toContain("Run ce_subagent with agent=\"pr-comment-resolver\" and task=\"comment1\".")
  })

  test("uses provided name maps when rewriting copied skills under collisions", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pi-writer-namemaps-"))
    const outputRoot = path.join(tempRoot, ".pi")
    const sourceSkillDir = path.join(tempRoot, "source-skill")

    await fs.mkdir(sourceSkillDir, { recursive: true })
    await fs.writeFile(
      path.join(sourceSkillDir, "SKILL.md"),
      [
        "---",
        "name: docs-skill",
        "description: Uses colliding refs",
        "---",
        "",
        "Task code_review(feature)",
        "Run /prompts:plan_review after this.",
      ].join("\n"),
    )

    const bundle: PiBundle = {
      prompts: [],
      skillDirs: [{ name: "docs-skill", sourceDir: sourceSkillDir }],
      generatedSkills: [],
      extensions: [],
      nameMaps: {
        agents: { code_review: "code-review-2" },
        prompts: { plan_review: "plan-review-2" },
      },
    }

    await writePiBundle(outputRoot, bundle)

    const copiedSkill = await fs.readFile(path.join(outputRoot, "skills", "docs-skill", "SKILL.md"), "utf8")
    expect(copiedSkill).toContain('Run ce_subagent with agent="code-review-2" and task="feature".')
    expect(copiedSkill).toContain("/plan-review-2")
  })

  test("rewrites frontmatterless copied skills during Pi bundle writes", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pi-skill-frontmatterless-"))
    const outputRoot = path.join(tempRoot, ".pi")
    const sourceSkillDir = path.join(tempRoot, "source-skill")

    await fs.mkdir(sourceSkillDir, { recursive: true })
    await fs.writeFile(
      path.join(sourceSkillDir, "SKILL.md"),
      [
        "# Frontmatterless skill",
        "",
        "- Task compound-engineering:research:repo-research-analyst(feature_description)",
      ].join("\n"),
    )

    const bundle: PiBundle = {
      prompts: [],
      skillDirs: [{ name: "frontmatterless-skill", sourceDir: sourceSkillDir }],
      generatedSkills: [],
      extensions: [],
    }

    await writePiBundle(outputRoot, bundle)

    const installedSkill = await fs.readFile(path.join(outputRoot, "skills", "frontmatterless-skill", "SKILL.md"), "utf8")
    expect(installedSkill).toContain('Run ce_subagent with agent="repo-research-analyst" and task="feature_description".')
    expect(installedSkill).not.toContain("name:")
  })

  test("does not rematerialize an already-converged frontmatterless skill during Pi bundle writes", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pi-frontmatterless-stable-"))
    const outputRoot = path.join(tempRoot, ".pi")
    const sourceSkillDir = path.join(tempRoot, "source-skill")

    await fs.mkdir(sourceSkillDir, { recursive: true })
    await fs.writeFile(
      path.join(sourceSkillDir, "SKILL.md"),
      [
        "# Frontmatterless skill",
        "",
        "- Task compound-engineering:research:repo-research-analyst(feature_description)",
      ].join("\n"),
    )

    const bundle: PiBundle = {
      prompts: [],
      skillDirs: [{ name: "frontmatterless-skill", sourceDir: sourceSkillDir }],
      generatedSkills: [],
      extensions: [],
    }

    await writePiBundle(outputRoot, bundle)
    const skillsDir = path.join(outputRoot, "skills")
    const before = await fs.readdir(skillsDir)

    await writePiBundle(outputRoot, bundle)
    const after = await fs.readdir(skillsDir)

    expect(before.filter((entry) => entry.startsWith("frontmatterless-skill.bak."))).toHaveLength(0)
    expect(after.filter((entry) => entry.startsWith("frontmatterless-skill.bak."))).toHaveLength(0)
  })

  test("regenerates valid frontmatter for malformed copied skills during Pi bundle writes", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pi-skill-malformed-"))
    const outputRoot = path.join(tempRoot, ".pi")
    const sourceSkillDir = path.join(tempRoot, "source-skill")

    await fs.mkdir(sourceSkillDir, { recursive: true })
    await fs.writeFile(
      path.join(sourceSkillDir, "SKILL.md"),
      [
        "---",
        "name: [broken",
        "description: broken frontmatter",
        "---",
        "",
        "# Broken skill",
        "",
        "- Task compound-engineering:research:repo-research-analyst(feature_description)",
      ].join("\n"),
    )

    const bundle: PiBundle = {
      prompts: [],
      skillDirs: [{ name: "broken-skill", sourceDir: sourceSkillDir }],
      generatedSkills: [],
      extensions: [],
    }

    await writePiBundle(outputRoot, bundle)

    const installedSkill = await fs.readFile(path.join(outputRoot, "skills", "broken-skill", "SKILL.md"), "utf8")
    expect(installedSkill).toContain('Run ce_subagent with agent="repo-research-analyst" and task="feature_description".')
    expect(installedSkill).toContain("name: broken-skill")
    expect(installedSkill).not.toContain("name: [broken")
  })

  test("does not rematerialize an already-converged malformed skill during Pi bundle writes", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pi-malformed-stable-"))
    const outputRoot = path.join(tempRoot, ".pi")
    const sourceSkillDir = path.join(tempRoot, "source-skill")

    await fs.mkdir(sourceSkillDir, { recursive: true })
    await fs.writeFile(
      path.join(sourceSkillDir, "SKILL.md"),
      [
        "---",
        "name: [broken",
        "description: broken frontmatter",
        "---",
        "",
        "# Broken skill",
        "",
        "- Task compound-engineering:research:repo-research-analyst(feature_description)",
      ].join("\n"),
    )

    const bundle: PiBundle = {
      prompts: [],
      skillDirs: [{ name: "broken-skill", sourceDir: sourceSkillDir }],
      generatedSkills: [],
      extensions: [],
    }

    await writePiBundle(outputRoot, bundle)
    const skillsDir = path.join(outputRoot, "skills")
    const before = await fs.readdir(skillsDir)

    await writePiBundle(outputRoot, bundle)
    const after = await fs.readdir(skillsDir)

    expect(before.filter((entry) => entry.startsWith("broken-skill.bak."))).toHaveLength(0)
    expect(after.filter((entry) => entry.startsWith("broken-skill.bak."))).toHaveLength(0)
  })

  test("does not append MCPorter compatibility note to copied skills", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pi-skill-no-mcporter-note-"))
    const outputRoot = path.join(tempRoot, ".pi")
    const sourceSkillDir = path.join(tempRoot, "source-skill")

    await fs.mkdir(sourceSkillDir, { recursive: true })
    await fs.writeFile(
      path.join(sourceSkillDir, "SKILL.md"),
      [
        "---",
        "name: docs-skill",
        "description: Uses MCP and Task",
        "---",
        "",
        "Use MCP servers for docs lookup.",
        "Task compound-engineering:research:repo-research-analyst(feature_description)",
      ].join("\n"),
    )

    const bundle: PiBundle = {
      prompts: [],
      skillDirs: [{ name: "docs-skill", sourceDir: sourceSkillDir }],
      generatedSkills: [],
      extensions: [],
    }

    await writePiBundle(outputRoot, bundle)

    const copiedSkill = await fs.readFile(path.join(outputRoot, "skills", "docs-skill", "SKILL.md"), "utf8")
    expect(copiedSkill).toContain("Use MCP servers for docs lookup.")
    expect(copiedSkill).toContain('Run ce_subagent with agent="repo-research-analyst" and task="feature_description".')
    expect(copiedSkill).not.toContain("Pi + MCPorter note")
    expect(copiedSkill).not.toContain("<!-- PI_MCPORTER_NOTE -->")
  })

  test("skips dangling symlinked file assets during Pi bundle writes", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pi-skill-dangling-symlink-"))
    const outputRoot = path.join(tempRoot, ".pi")
    const sourceSkillDir = path.join(tempRoot, "source-skill")
    const missingAssetPath = path.join(tempRoot, "missing.txt")

    await fs.mkdir(sourceSkillDir, { recursive: true })
    await fs.symlink(missingAssetPath, path.join(sourceSkillDir, "asset.txt"))
    await fs.writeFile(
      path.join(sourceSkillDir, "SKILL.md"),
      [
        "---",
        "name: ce:plan",
        "description: Planning workflow",
        "---",
        "",
        "- Task compound-engineering:research:repo-research-analyst(feature_description)",
      ].join("\n"),
    )

    const bundle: PiBundle = {
      prompts: [],
      skillDirs: [{ name: "ce-plan", sourceDir: sourceSkillDir }],
      generatedSkills: [],
      extensions: [],
    }

    await writePiBundle(outputRoot, bundle)

    const installedSkill = await fs.readFile(path.join(outputRoot, "skills", "ce-plan", "SKILL.md"), "utf8")
    expect(installedSkill).toContain('Run ce_subagent with agent="repo-research-analyst" and task="feature_description".')
    expect(await exists(path.join(outputRoot, "skills", "ce-plan", "asset.txt"))).toBe(false)

    const skillsDir = path.join(outputRoot, "skills")
    const before = await fs.readdir(skillsDir)
    await writePiBundle(outputRoot, bundle)
    const after = await fs.readdir(skillsDir)

    expect(before.filter((entry) => entry.startsWith("ce-plan.bak."))).toHaveLength(0)
    expect(after.filter((entry) => entry.startsWith("ce-plan.bak."))).toHaveLength(0)
  })

  test("preserves nested frontmatter objects when rewriting copied Pi skills", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pi-skill-nested-frontmatter-"))
    const outputRoot = path.join(tempRoot, ".pi")
    const sourceSkillDir = path.join(tempRoot, "source-skill")

    await fs.mkdir(sourceSkillDir, { recursive: true })
    await fs.writeFile(
      path.join(sourceSkillDir, "SKILL.md"),
      [
        "---",
        "name: nested_skill",
        "description: Nested metadata",
        "metadata:",
        "  owner: dragos",
        "  flags:",
        "    sync: true",
        "---",
        "",
        "# Nested skill",
        "",
        "No Pi rewrite needed.",
      ].join("\n"),
    )

    const bundle: PiBundle = {
      prompts: [],
      skillDirs: [
        {
          name: "nested-skill",
          sourceDir: sourceSkillDir,
        },
      ],
      generatedSkills: [],
      extensions: [],
    }

    await writePiBundle(outputRoot, bundle)

    const copiedSkill = await fs.readFile(path.join(outputRoot, "skills", "nested-skill", "SKILL.md"), "utf8")
    expect(copiedSkill).toContain("name: nested-skill")
    expect(copiedSkill).toContain("metadata:\n  owner: dragos\n  flags:\n    sync: true")
    expect(copiedSkill).not.toContain("[object Object]")
  })

  test("copies symlinked file assets when Pi skill materialization is required", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pi-skill-symlink-asset-"))
    const outputRoot = path.join(tempRoot, ".pi")
    const sourceSkillDir = path.join(tempRoot, "source-skill")
    const sharedAssetPath = path.join(sourceSkillDir, "shared.txt")

    await fs.mkdir(sourceSkillDir, { recursive: true })
    await fs.writeFile(sharedAssetPath, "shared asset\n")
    await fs.symlink(sharedAssetPath, path.join(sourceSkillDir, "asset.txt"))
    await fs.writeFile(
      path.join(sourceSkillDir, "SKILL.md"),
      [
        "---",
        "name: ce:plan",
        "description: Planning workflow",
        "---",
        "",
        "- Task compound-engineering:research:repo-research-analyst(feature_description)",
      ].join("\n"),
    )

    const bundle: PiBundle = {
      prompts: [],
      skillDirs: [{ name: "ce-plan", sourceDir: sourceSkillDir }],
      generatedSkills: [],
      extensions: [],
    }

    await writePiBundle(outputRoot, bundle)

    const copiedAsset = await fs.readFile(path.join(outputRoot, "skills", "ce-plan", "asset.txt"), "utf8")
    expect(copiedAsset).toBe("shared asset\n")
  })

  test("skips symlinked file assets that escape the skill root during Pi bundle writes", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pi-skill-escaped-symlink-"))
    const outputRoot = path.join(tempRoot, ".pi")
    const sourceSkillDir = path.join(tempRoot, "source-skill")
    const externalAssetDir = path.join(tempRoot, "shared")
    const externalAssetPath = path.join(externalAssetDir, "shared.txt")

    await fs.mkdir(sourceSkillDir, { recursive: true })
    await fs.mkdir(externalAssetDir, { recursive: true })
    await fs.writeFile(externalAssetPath, "shared asset\n")
    await fs.symlink(externalAssetPath, path.join(sourceSkillDir, "asset.txt"))
    await fs.writeFile(
      path.join(sourceSkillDir, "SKILL.md"),
      [
        "---",
        "name: ce:plan",
        "description: Planning workflow",
        "---",
        "",
        "- Task compound-engineering:research:repo-research-analyst(feature_description)",
      ].join("\n"),
    )

    const bundle: PiBundle = {
      prompts: [],
      skillDirs: [{ name: "ce-plan", sourceDir: sourceSkillDir }],
      generatedSkills: [],
      extensions: [],
    }

    await writePiBundle(outputRoot, bundle)

    expect(await exists(path.join(outputRoot, "skills", "ce-plan", "asset.txt"))).toBe(false)
  })

  test("rejects swapped passthrough file targets during Pi bundle writes", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pi-skill-file-swap-"))
    const outputRoot = path.join(tempRoot, ".pi")
    const sourceSkillDir = path.join(tempRoot, "source-skill")
    const protectedFile = path.join(tempRoot, "protected.txt")
    const targetFile = path.join(outputRoot, "skills", "ce-plan", "asset.txt")

    await fs.mkdir(sourceSkillDir, { recursive: true })
    await fs.writeFile(protectedFile, "protected\n")
    await fs.writeFile(path.join(sourceSkillDir, "asset.txt"), "updated asset\n")
    await fs.writeFile(path.join(sourceSkillDir, "SKILL.md"), "---\nname: ce:plan\n---\n")
    await fs.mkdir(path.dirname(targetFile), { recursive: true })
    await fs.writeFile(targetFile, "original asset\n")

    setAtomicWriteFailureHookForTests(async (filePath, stage) => {
      if (filePath === targetFile && stage === "beforeRename") {
        await fs.unlink(targetFile)
        await fs.symlink(protectedFile, targetFile)
      }
    })

    await expect(writePiBundle(outputRoot, {
      prompts: [],
      skillDirs: [{ name: "ce-plan", sourceDir: sourceSkillDir }],
      generatedSkills: [],
      extensions: [],
    })).rejects.toThrow(/Refusing to write through symlink target|Refusing to restore through symlink target|ENOENT/)

    expect(await fs.readFile(protectedFile, "utf8")).toBe("protected\n")
    expect((await fs.lstat(targetFile)).isSymbolicLink()).toBe(true)
  })

  test("removes stale generated-agent directories after normalization changes", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pi-writer-stale-generated-agent-"))
    const outputRoot = path.join(tempRoot, ".pi")

    const firstBundle: PiBundle = {
      pluginName: "compound-engineering",
      prompts: [],
      skillDirs: [],
      generatedSkills: [{ name: "ce-plan", sourceName: "ce:plan", content: "---\nname: ce-plan\n---\n\nBody" }],
      extensions: [],
      nameMaps: { agents: { "ce:plan": "ce-plan" } },
    }

    await writePiBundle(outputRoot, firstBundle)
    expect(await exists(path.join(outputRoot, "skills", "ce-plan", "SKILL.md"))).toBe(true)

    const secondBundle: PiBundle = {
      pluginName: "compound-engineering",
      prompts: [],
      skillDirs: [],
      generatedSkills: [{ name: "ce-plan-2", sourceName: "ce:plan", content: "---\nname: ce-plan-2\n---\n\nBody" }],
      extensions: [],
      nameMaps: { agents: { "ce:plan": "ce-plan-2" } },
    }

    await writePiBundle(outputRoot, secondBundle)

    expect(await exists(path.join(outputRoot, "skills", "ce-plan-2", "SKILL.md"))).toBe(true)
    expect(await exists(path.join(outputRoot, "skills", "ce-plan", "SKILL.md"))).toBe(false)
  })

  test("removes deleted managed prompts and generated-agent directories", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pi-writer-delete-managed-artifacts-"))
    const outputRoot = path.join(tempRoot, ".pi")
    const managedManifestPath = path.join(outputRoot, "compound-engineering", "compound-engineering-managed.json")

    await writePiBundle(outputRoot, {
      pluginName: "compound-engineering",
      prompts: [{ name: "plan-review", sourceName: "workflows:plan-review", content: "Prompt body" }],
      skillDirs: [],
      generatedSkills: [{ name: "ce-plan", sourceName: "ce:plan", content: "---\nname: ce-plan\n---\n\nBody" }],
      extensions: [],
      nameMaps: {
        prompts: { "workflows:plan-review": "plan-review" },
        agents: { "ce:plan": "ce-plan" },
      },
    })

    expect(await exists(path.join(outputRoot, "prompts", "plan-review.md"))).toBe(true)
    expect(await exists(path.join(outputRoot, "skills", "ce-plan", "SKILL.md"))).toBe(true)

    await writePiBundle(outputRoot, {
      pluginName: "compound-engineering",
      prompts: [],
      skillDirs: [],
      generatedSkills: [],
      extensions: [],
    })

    expect(await exists(path.join(outputRoot, "prompts", "plan-review.md"))).toBe(false)
    expect(await exists(path.join(outputRoot, "skills", "ce-plan", "SKILL.md"))).toBe(false)
    expect(await exists(managedManifestPath)).toBe(false)
  })

  test("removes stale nested files when a skill changes from copied to generated at the same emitted path", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pi-writer-kind-transition-"))
    const outputRoot = path.join(tempRoot, ".pi")
    const sourceSkillDir = path.join(tempRoot, "source-skill")

    await fs.mkdir(path.join(sourceSkillDir, "nested"), { recursive: true })
    await fs.writeFile(path.join(sourceSkillDir, "SKILL.md"), "---\nname: ce-plan\n---\n")
    await fs.writeFile(path.join(sourceSkillDir, "nested", "extra.txt"), "extra\n")

    await writePiBundle(outputRoot, {
      pluginName: "compound-engineering",
      prompts: [],
      skillDirs: [{ name: "ce-plan", sourceDir: sourceSkillDir }],
      generatedSkills: [],
      extensions: [],
    })

    expect(await exists(path.join(outputRoot, "skills", "ce-plan", "nested", "extra.txt"))).toBe(true)

    await writePiBundle(outputRoot, {
      pluginName: "compound-engineering",
      prompts: [],
      skillDirs: [],
      generatedSkills: [{ name: "ce-plan", content: "---\nname: ce-plan\n---\n\nGenerated\n" }],
      extensions: [],
    })

    expect(await exists(path.join(outputRoot, "skills", "ce-plan", "nested", "extra.txt"))).toBe(false)
    expect(await fs.readFile(path.join(outputRoot, "skills", "ce-plan", "SKILL.md"), "utf8")).toContain("Generated")
  })

  test("does not pre-delete a same-path skill directory claimed only by an unverified manifest", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pi-writer-unverified-kind-transition-"))
    const stateHome = path.join(tempRoot, "state-home")
    process.env.COMPOUND_ENGINEERING_HOME = stateHome

    const outputRoot = path.join(tempRoot, ".pi")
    const layout = resolvePiLayout(outputRoot, "install")
    const targetSkillDir = path.join(layout.skillsDir, "ce-plan")

    await fs.mkdir(path.join(targetSkillDir, "nested"), { recursive: true })
    await fs.writeFile(path.join(targetSkillDir, "nested", "keep.txt"), "keep\n")

    const seededState = replacePiManagedSection(null, "install", createPiManagedSection({
      artifacts: [createManagedArtifact(layout, "copied-skill", "ce-plan", "ce-plan")],
    }), "compound-engineering")
    await writePiManagedState(layout, seededState, { install: true, sync: false })

    const manifest = JSON.parse(await fs.readFile(layout.managedManifestPath, "utf8")) as {
      install?: { sharedResources?: { compatExtension?: boolean } }
    }
    manifest.install = {
      ...(manifest.install ?? {}),
      sharedResources: { compatExtension: true },
    }
    await fs.writeFile(layout.managedManifestPath, JSON.stringify(manifest, null, 2) + "\n")

    await writePiBundle(outputRoot, {
      pluginName: "compound-engineering",
      prompts: [],
      skillDirs: [],
      generatedSkills: [{ name: "ce-plan", content: "---\nname: ce-plan\n---\n\nGenerated\n" }],
      extensions: [],
    })

    expect(await exists(path.join(targetSkillDir, "nested", "keep.txt"))).toBe(true)
    expect(await fs.readFile(path.join(targetSkillDir, "SKILL.md"), "utf8")).toContain("Generated")

    delete process.env.COMPOUND_ENGINEERING_HOME
  })

  test("restores prior managed state when stale skill cleanup fails after publication work", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pi-writer-stale-cleanup-rollback-"))
    const stateHome = path.join(tempRoot, "state-home")
    process.env.COMPOUND_ENGINEERING_HOME = stateHome

    const outputRoot = path.join(tempRoot, ".pi")
    const layout = resolvePiLayout(outputRoot, "install")
    const skillsParent = layout.skillsDir
    const externalSkillsParent = path.join(tempRoot, "external-skills")
    const externalOldSkillDir = path.join(externalSkillsParent, "old-skill")

    await fs.mkdir(path.dirname(skillsParent), { recursive: true })
    await fs.mkdir(externalOldSkillDir, { recursive: true })
    await fs.writeFile(path.join(externalOldSkillDir, "SKILL.md"), "old\n")
    await fs.symlink(externalSkillsParent, skillsParent)

    const seededState = replacePiManagedSection(null, "install", createPiManagedSection({
      artifacts: [createManagedArtifact(layout, "copied-skill", "old-skill", "old-skill")],
    }), "compound-engineering")
    await writePiManagedState(layout, seededState, { install: true, sync: false })

    await expect(writePiBundle(outputRoot, {
      pluginName: "compound-engineering",
      prompts: [{ name: "new-note", content: "new body" }],
      skillDirs: [],
      generatedSkills: [],
      extensions: [],
    })).rejects.toThrow("symlinked ancestor")

    const restored = await loadPiManagedStateWithTrust(layout)
    expect(restored.status).toBe("verified")
    expect(restored.state?.install.artifacts.map((artifact) => artifact.emittedName)).toContain("old-skill")
    expect(restored.state?.install.artifacts.map((artifact) => artifact.emittedName)).not.toContain("new-note")
    expect(await exists(path.join(layout.promptsDir, "new-note.md"))).toBe(false)

    delete process.env.COMPOUND_ENGINEERING_HOME
  })

  test("rejects cyclic directory symlinks during Pi skill materialization", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pi-skill-cycle-"))
    const outputRoot = path.join(tempRoot, ".pi")
    const sourceSkillDir = path.join(tempRoot, "source-skill")

    await fs.mkdir(sourceSkillDir, { recursive: true })
    await fs.symlink(sourceSkillDir, path.join(sourceSkillDir, "loop"))
    await fs.writeFile(
      path.join(sourceSkillDir, "SKILL.md"),
      [
        "---",
        "name: ce:plan",
        "description: Planning workflow",
        "---",
        "",
        "- Task compound-engineering:research:repo-research-analyst(feature_description)",
      ].join("\n"),
    )

    const bundle: PiBundle = {
      prompts: [],
      skillDirs: [{ name: "ce-plan", sourceDir: sourceSkillDir }],
      generatedSkills: [],
      extensions: [],
    }

    await expect(writePiBundle(outputRoot, bundle)).rejects.toThrow("cyclic directory symlink")
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

  test("records install-owned MCP server keys in managed state", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pi-writer-install-mcp-ownership-"))
    const stateHome = path.join(tempRoot, "state-home")
    process.env.COMPOUND_ENGINEERING_HOME = stateHome

    const outputRoot = path.join(tempRoot, ".pi")
    await writePiBundle(outputRoot, {
      pluginName: "compound-engineering",
      prompts: [],
      skillDirs: [],
      generatedSkills: [],
      extensions: [],
      mcporterConfig: {
        mcpServers: {
          installA: { command: "cmd-a" },
          installB: { command: "cmd-b" },
        },
      },
    })

    const trust = await loadPiManagedStateWithTrust(resolvePiLayout(outputRoot, "install"))
    expect(trust.state?.install.mcpServers).toEqual(["installA", "installB"])

    delete process.env.COMPOUND_ENGINEERING_HOME
  })

  test("preserves malformed unverified install mcporter config when install wants to write MCP servers", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pi-writer-malformed-unverified-install-mcp-"))
    const stateHome = path.join(tempRoot, "state-home")
    process.env.COMPOUND_ENGINEERING_HOME = stateHome
    const warnSpy = spyOn(console, "warn").mockImplementation(() => {})

    const outputRoot = path.join(tempRoot, ".pi")
    const layout = resolvePiLayout(outputRoot, "install")
    await fs.mkdir(path.dirname(layout.mcporterConfigPath), { recursive: true })
    await fs.writeFile(layout.mcporterConfigPath, "{ not json\n")

    await writePiBundle(outputRoot, {
      pluginName: "compound-engineering",
      prompts: [],
      skillDirs: [],
      generatedSkills: [],
      extensions: [],
      mcporterConfig: {
        mcpServers: {
          context7: { command: "context7" },
        },
      },
    })

    expect(await fs.readFile(layout.mcporterConfigPath, "utf8")).toContain("{ not json")
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("leaving it untouched because install ownership cannot be proven"))

    const trust = await loadPiManagedStateWithTrust(layout)
    expect(trust.status).toBe("missing")
    expect(trust.state).toBeNull()

    warnSpy.mockRestore()
    delete process.env.COMPOUND_ENGINEERING_HOME
  })

  test("classifies old verification hashes as stale when shared resource flags become trust-relevant", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pi-writer-stale-shared-resources-"))
    const stateHome = path.join(tempRoot, "state-home")
    process.env.COMPOUND_ENGINEERING_HOME = stateHome

    const outputRoot = path.join(tempRoot, ".pi")
    const layout = resolvePiLayout(outputRoot, "install")
    const legacyState = replacePiManagedSection(null, "install", createPiManagedSection({
      nameMaps: {
        skills: { "compound-engineering:ce-plan": "ce-plan" },
      },
      sharedResources: {
        compatExtension: false,
      },
    }), "compound-engineering")

    await writePiManagedState(layout, legacyState, { install: true, sync: false })

    const manifest = JSON.parse(await fs.readFile(layout.managedManifestPath, "utf8")) as {
      install?: { sharedResources?: { compatExtension?: boolean } }
    }
    manifest.install = {
      ...(manifest.install ?? {}),
      sharedResources: { compatExtension: true },
    }
    await fs.writeFile(layout.managedManifestPath, JSON.stringify(manifest, null, 2) + "\n")

    const trust = await loadPiManagedStateWithTrust(layout)
    expect(trust.status).toBe("stale")
    expect(trust.verifiedSections.install).toBe(false)

    delete process.env.COMPOUND_ENGINEERING_HOME
  })

  test("removes stale install-owned mcporter servers while preserving sync-owned and user-owned keys", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pi-writer-shared-mcporter-cleanup-"))
    const stateHome = path.join(tempRoot, "state-home")
    process.env.COMPOUND_ENGINEERING_HOME = stateHome

    const outputRoot = path.join(tempRoot, ".pi")
    const layout = resolvePiLayout(outputRoot, "install")
    let seededState = replacePiManagedSection(null, "install", createPiManagedSection({
      mcpServers: ["install-owned"],
      sharedResources: { mcporterConfig: true },
    }), "compound-engineering")
    seededState = replacePiManagedSection(seededState, "sync", createPiManagedSection({
      mcpServers: ["sync-owned"],
      sharedResources: { mcporterConfig: true },
    }))

    await writePiManagedState(layout, seededState, { install: true, sync: true })
    await fs.mkdir(path.dirname(layout.mcporterConfigPath), { recursive: true })
    await fs.writeFile(
      layout.mcporterConfigPath,
      JSON.stringify({
        mcpServers: {
          "install-owned": { command: "install-cmd" },
          "sync-owned": { command: "sync-cmd" },
          unrelated: { command: "user-cmd" },
        },
      }, null, 2) + "\n",
    )

    await writePiBundle(outputRoot, {
      pluginName: "compound-engineering",
      prompts: [],
      skillDirs: [],
      generatedSkills: [],
      extensions: [],
    })

    const currentConfig = JSON.parse(await fs.readFile(layout.mcporterConfigPath, "utf8")) as {
      mcpServers: Record<string, unknown>
    }
    expect(currentConfig.mcpServers["install-owned"]).toBeUndefined()
    expect(currentConfig.mcpServers["sync-owned"]).toBeDefined()
    expect(currentConfig.mcpServers.unrelated).toBeDefined()

    delete process.env.COMPOUND_ENGINEERING_HOME
  })

  test("reports missing trust info when no managed manifest exists", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pi-writer-missing-trust-"))
    const layout = resolvePiLayout(path.join(tempRoot, ".pi"), "install")

    const trust = await getPiManagedTrustInfo(layout)
    expect(trust.status).toBe("missing")
    expect(trust.isVerified).toBe(false)
  })

  test("does not rewrite unchanged managed manifest on no-op install reruns", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pi-writer-noop-manifest-"))
    const stateHome = path.join(tempRoot, "state-home")
    process.env.COMPOUND_ENGINEERING_HOME = stateHome

    const outputRoot = path.join(tempRoot, ".pi")
    const bundle: PiBundle = {
      pluginName: "compound-engineering",
      prompts: [{ name: "workflows-plan", content: "Prompt content" }],
      skillDirs: [],
      generatedSkills: [],
      extensions: [],
    }

    await writePiBundle(outputRoot, bundle)

    const layout = resolvePiLayout(outputRoot, "install")
    const firstManifest = await fs.stat(layout.managedManifestPath)
    const firstVerification = await fs.readFile(layout.verificationPath, "utf8")

    await new Promise((resolve) => setTimeout(resolve, 15))
    await writePiBundle(outputRoot, bundle)

    const secondManifest = await fs.stat(layout.managedManifestPath)
    const secondVerification = await fs.readFile(layout.verificationPath, "utf8")
    expect(secondManifest.mtimeMs).toBe(firstManifest.mtimeMs)
    expect(secondVerification).toBe(firstVerification)

    delete process.env.COMPOUND_ENGINEERING_HOME
  })

  test("does not snapshot unchanged shared install files on no-op reruns", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pi-writer-noop-shared-snapshots-"))
    const stateHome = path.join(tempRoot, "state-home")
    process.env.COMPOUND_ENGINEERING_HOME = stateHome

    const outputRoot = path.join(tempRoot, ".pi")
    await writePiBundle(outputRoot, {
      pluginName: "compound-engineering",
      prompts: [],
      skillDirs: [],
      generatedSkills: [],
      extensions: [],
    })

    const layout = resolvePiLayout(outputRoot, "install")
    const snapshottedPaths: string[] = []
    setManagedPathSnapshotHookForTests((targetPath) => {
      snapshottedPaths.push(targetPath)
    })

    await writePiBundle(outputRoot, {
      pluginName: "compound-engineering",
      prompts: [],
      skillDirs: [],
      generatedSkills: [],
      extensions: [],
    })

    expect(snapshottedPaths).not.toContain(layout.agentsPath)
    expect(snapshottedPaths).not.toContain(layout.managedManifestPath)
    expect(snapshottedPaths).not.toContain(layout.verificationPath)

    delete process.env.COMPOUND_ENGINEERING_HOME
  })

  test("does not create rollback temp dirs on no-op install reruns for unchanged copied skills", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pi-writer-noop-skill-rerun-"))
    const stateHome = path.join(tempRoot, "state-home")
    process.env.COMPOUND_ENGINEERING_HOME = stateHome

    const outputRoot = path.join(tempRoot, ".pi")
    const sourceSkillDir = path.join(tempRoot, "source-skill")
    await fs.mkdir(path.join(sourceSkillDir, "nested"), { recursive: true })
    await fs.writeFile(path.join(sourceSkillDir, "SKILL.md"), "---\nname: docs-skill\n---\n\nBody\n")
    await fs.writeFile(path.join(sourceSkillDir, "nested", "stable.txt"), "stable\n")

    await writePiBundle(outputRoot, {
      pluginName: "compound-engineering",
      prompts: [],
      skillDirs: [{ name: "docs-skill", sourceDir: sourceSkillDir }],
      generatedSkills: [],
      extensions: [],
    })

    const layout = resolvePiLayout(outputRoot, "install")
    await new Promise((resolve) => setTimeout(resolve, 15))
    await writePiBundle(outputRoot, {
      pluginName: "compound-engineering",
      prompts: [],
      skillDirs: [{ name: "docs-skill", sourceDir: sourceSkillDir }],
      generatedSkills: [],
      extensions: [],
    })

    expect((await fs.readdir(layout.root)).some((entry) => entry.startsWith(".pi-publish-rollback-"))).toBe(false)

    delete process.env.COMPOUND_ENGINEERING_HOME
  })

  test("does not snapshot unchanged copied skill directories on no-op install reruns", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pi-writer-noop-skill-snapshot-"))
    const stateHome = path.join(tempRoot, "state-home")
    process.env.COMPOUND_ENGINEERING_HOME = stateHome

    const outputRoot = path.join(tempRoot, ".pi")
    const sourceSkillDir = path.join(tempRoot, "source-skill")
    await fs.mkdir(path.join(sourceSkillDir, "nested"), { recursive: true })
    await fs.writeFile(path.join(sourceSkillDir, "SKILL.md"), "---\nname: docs-skill\n---\n\nBody\n")
    await fs.writeFile(path.join(sourceSkillDir, "nested", "stable.txt"), "stable\n")

    await writePiBundle(outputRoot, {
      pluginName: "compound-engineering",
      prompts: [],
      skillDirs: [{ name: "docs-skill", sourceDir: sourceSkillDir }],
      generatedSkills: [],
      extensions: [],
    })

    const targetSkillDir = path.join(resolvePiLayout(outputRoot, "install").skillsDir, "docs-skill")
    const snapshottedPaths: string[] = []
    setManagedPathSnapshotHookForTests((targetPath) => {
      snapshottedPaths.push(targetPath)
    })

    await writePiBundle(outputRoot, {
      pluginName: "compound-engineering",
      prompts: [],
      skillDirs: [{ name: "docs-skill", sourceDir: sourceSkillDir }],
      generatedSkills: [],
      extensions: [],
    })

    expect(snapshottedPaths).not.toContain(targetSkillDir)

    delete process.env.COMPOUND_ENGINEERING_HOME
  })

  test("rejects symlinked AGENTS.md targets during Pi bundle writes", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pi-writer-agents-symlink-"))
    const outputRoot = path.join(tempRoot, ".pi")
    const externalTarget = path.join(tempRoot, "external-agents.md")
    const agentsPath = path.join(outputRoot, "AGENTS.md")

    await fs.mkdir(outputRoot, { recursive: true })
    await fs.writeFile(externalTarget, "external agents\n")
    await fs.symlink(externalTarget, agentsPath)

    await expect(writePiBundle(outputRoot, {
      pluginName: "compound-engineering",
      prompts: [],
      skillDirs: [],
      generatedSkills: [],
      extensions: [],
    })).rejects.toThrow("Refusing to snapshot symlink target")

    expect(await fs.readFile(externalTarget, "utf8")).toBe("external agents\n")
  })

  test("restores prior AGENTS.md content when managed block publication fails", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pi-writer-agents-rollback-"))
    const outputRoot = path.join(tempRoot, ".pi")
    const agentsPath = path.join(outputRoot, "AGENTS.md")

    await fs.mkdir(outputRoot, { recursive: true })
    await fs.writeFile(agentsPath, "# Existing agents\n")
    setAtomicWriteFailureHookForTests((filePath, stage) => {
      if (filePath === agentsPath && stage === "beforeRename") {
        throw new Error("simulated AGENTS failure")
      }
    })

    await expect(writePiBundle(outputRoot, {
      pluginName: "compound-engineering",
      prompts: [],
      skillDirs: [],
      generatedSkills: [],
      extensions: [],
    })).rejects.toThrow("simulated AGENTS failure")

    expect(await fs.readFile(agentsPath, "utf8")).toBe("# Existing agents\n")
  })

  test("keeps the prior verified install state when AGENTS publication fails", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pi-writer-agents-trust-boundary-"))
    const stateHome = path.join(tempRoot, "state-home")
    process.env.COMPOUND_ENGINEERING_HOME = stateHome

    const outputRoot = path.join(tempRoot, ".pi")
    const layout = resolvePiLayout(outputRoot, "install")

    await writePiBundle(outputRoot, {
      pluginName: "compound-engineering",
      prompts: [{ name: "old-plan", content: "Old prompt" }],
      skillDirs: [],
      generatedSkills: [],
      extensions: [],
    })

    await fs.writeFile(layout.agentsPath, "# Existing agents\n")

    setAtomicWriteFailureHookForTests((filePath, stage) => {
      if (filePath === layout.agentsPath && stage === "beforeRename") {
        throw new Error("simulated AGENTS failure")
      }
    })

    await expect(writePiBundle(outputRoot, {
      pluginName: "compound-engineering",
      prompts: [{ name: "new-plan", content: "New prompt" }],
      skillDirs: [],
      generatedSkills: [],
      extensions: [],
    })).rejects.toThrow("simulated AGENTS failure")

    const trust = await loadPiManagedStateWithTrust(layout)
    expect(trust.status).toBe("verified")
    expect(trust.state?.install.artifacts.map((artifact) => artifact.emittedName)).toEqual(["old-plan"])
    expect(await exists(path.join(layout.promptsDir, "old-plan.md"))).toBe(true)
    expect(await exists(path.join(layout.promptsDir, "new-plan.md"))).toBe(false)

    delete process.env.COMPOUND_ENGINEERING_HOME
  })

  test("removes verification metadata and rollback temp dirs when an install bundle becomes empty", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pi-writer-empty-install-cleanup-"))
    const stateHome = path.join(tempRoot, "state-home")
    process.env.COMPOUND_ENGINEERING_HOME = stateHome

    const outputRoot = path.join(tempRoot, ".pi")
    const layout = resolvePiLayout(outputRoot, "install")

    await writePiBundle(outputRoot, {
      pluginName: "compound-engineering",
      prompts: [{ name: "old-plan", content: "Old prompt" }],
      skillDirs: [],
      generatedSkills: [],
      extensions: [],
    })

    expect(await exists(layout.managedManifestPath)).toBe(true)
    expect(await exists(layout.verificationPath)).toBe(true)

    await writePiBundle(outputRoot, {
      pluginName: "compound-engineering",
      prompts: [],
      skillDirs: [],
      generatedSkills: [],
      extensions: [],
    })

    expect(await exists(layout.managedManifestPath)).toBe(false)
    expect(await exists(layout.verificationPath)).toBe(false)
    expect((await fs.readdir(layout.root)).some((entry) => entry.startsWith(".pi-publish-rollback-"))).toBe(false)

    delete process.env.COMPOUND_ENGINEERING_HOME
  })

  test("removes newly written prompts when managed state commit fails", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pi-writer-commit-rollback-prompt-"))
    const stateHome = path.join(tempRoot, "state-home")
    process.env.COMPOUND_ENGINEERING_HOME = stateHome

    const outputRoot = path.join(tempRoot, ".pi")
    const layout = resolvePiLayout(outputRoot, "install")

    await writePiBundle(outputRoot, {
      pluginName: "compound-engineering",
      prompts: [{ name: "old-plan", content: "Old prompt" }],
      skillDirs: [],
      generatedSkills: [],
      extensions: [],
    })

    setAtomicWriteFailureHookForTests((filePath, stage) => {
      if (filePath === layout.managedManifestPath && stage === "beforeRename") {
        throw new Error("simulated manifest failure")
      }
    })

    await expect(writePiBundle(outputRoot, {
      pluginName: "compound-engineering",
      prompts: [{ name: "new-plan", content: "New prompt" }],
      skillDirs: [],
      generatedSkills: [],
      extensions: [],
    })).rejects.toThrow("simulated manifest failure")

    const trust = await loadPiManagedStateWithTrust(layout)
    expect(trust.status).toBe("verified")
    expect(trust.state?.install.artifacts.map((artifact) => artifact.emittedName)).toEqual(["old-plan"])
    expect(await exists(path.join(layout.promptsDir, "old-plan.md"))).toBe(true)
    expect(await exists(path.join(layout.promptsDir, "new-plan.md"))).toBe(false)

    delete process.env.COMPOUND_ENGINEERING_HOME
  })

  test("removes the canonical compat extension when install no longer owns it", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pi-writer-install-compat-removal-"))
    const stateHome = path.join(tempRoot, "state-home")
    process.env.COMPOUND_ENGINEERING_HOME = stateHome

    const outputRoot = path.join(tempRoot, ".pi")
    const compatPath = path.join(outputRoot, "extensions", "compound-engineering-compat.ts")

    await writePiBundle(outputRoot, {
      pluginName: "compound-engineering",
      prompts: [],
      skillDirs: [],
      generatedSkills: [],
      extensions: [{ name: "compound-engineering-compat.ts", content: "export const compat = true" }],
    })

    expect(await exists(compatPath)).toBe(true)

    await writePiBundle(outputRoot, {
      pluginName: "compound-engineering",
      prompts: [],
      skillDirs: [],
      generatedSkills: [],
      extensions: [],
    })

    expect(await exists(compatPath)).toBe(false)
    const agents = await fs.readFile(path.join(outputRoot, "AGENTS.md"), "utf8")
    expect(agents).not.toContain("ce_subagent")
    expect(agents).toContain("compat tools are not currently installed")
    expect((await loadPiManagedStateWithTrust(resolvePiLayout(outputRoot, "install"))).state?.install.sharedResources.compatExtension ?? false).toBe(false)

    delete process.env.COMPOUND_ENGINEERING_HOME
  })

  test("preserves the canonical compat extension when verified sync state still owns it", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pi-writer-install-compat-shared-root-"))
    const stateHome = path.join(tempRoot, "state-home")
    process.env.COMPOUND_ENGINEERING_HOME = stateHome

    const outputRoot = path.join(tempRoot, ".pi")
    const layout = resolvePiLayout(outputRoot, "install")
    const compatPath = path.join(layout.extensionsDir, "compound-engineering-compat.ts")

    let seededState = replacePiManagedSection(null, "install", createPiManagedSection({
      sharedResources: { compatExtension: true },
    }), "compound-engineering")
    seededState = replacePiManagedSection(seededState, "sync", createPiManagedSection({
      sharedResources: { compatExtension: true },
    }))

    await fs.mkdir(layout.extensionsDir, { recursive: true })
    await fs.writeFile(compatPath, "sync compat\n")
    await writePiManagedState(layout, seededState, { install: true, sync: true })

    await writePiBundle(outputRoot, {
      pluginName: "compound-engineering",
      prompts: [],
      skillDirs: [],
      generatedSkills: [],
      extensions: [],
    })

    expect(await fs.readFile(compatPath, "utf8")).toBe("sync compat\n")

    delete process.env.COMPOUND_ENGINEERING_HOME
  })

  test("removes the live compat extension when sync ownership is not verified", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pi-writer-unverified-sync-compat-"))
    const stateHome = path.join(tempRoot, "state-home")
    process.env.COMPOUND_ENGINEERING_HOME = stateHome

    const outputRoot = path.join(tempRoot, ".pi")
    const layout = resolvePiLayout(outputRoot, "install")
    const compatPath = path.join(layout.extensionsDir, "compound-engineering-compat.ts")

    let seededState = replacePiManagedSection(null, "install", createPiManagedSection({
      sharedResources: { compatExtension: true },
    }), "compound-engineering")
    seededState = replacePiManagedSection(seededState, "sync", createPiManagedSection({
      sharedResources: { compatExtension: true },
    }))

    await fs.mkdir(layout.extensionsDir, { recursive: true })
    await fs.writeFile(compatPath, "unverified sync compat\n")
    await writePiManagedState(layout, seededState, { install: true, sync: false })

    await writePiBundle(outputRoot, {
      pluginName: "compound-engineering",
      prompts: [],
      skillDirs: [],
      generatedSkills: [],
      extensions: [],
    })

    await expect(fs.access(compatPath)).rejects.toBeDefined()
    const agents = await fs.readFile(path.join(outputRoot, "AGENTS.md"), "utf8")
    expect(agents).not.toContain("ce_subagent")
    expect(agents).toContain("compat tools are not currently installed")

    delete process.env.COMPOUND_ENGINEERING_HOME
  })

  test("removes the live compat extension and disables advertising when sync ownership at the canonical root is not verified", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pi-writer-unverified-sync-compat-"))
    const stateHome = path.join(tempRoot, "state-home")
    process.env.COMPOUND_ENGINEERING_HOME = stateHome

    const outputRoot = path.join(tempRoot, ".pi")
    const layout = resolvePiLayout(outputRoot, "install")
    const compatPath = path.join(layout.extensionsDir, "compound-engineering-compat.ts")

    await writePiBundle(outputRoot, {
      pluginName: "compound-engineering",
      prompts: [],
      skillDirs: [],
      generatedSkills: [],
      extensions: [{ name: "compound-engineering-compat.ts", content: "sync compat\n" }],
    })

    const manifest = JSON.parse(await fs.readFile(layout.managedManifestPath, "utf8")) as {
      version: number
      pluginName?: string
      sync?: { sharedResources?: { compatExtension?: boolean } }
    }
    manifest.sync = { sharedResources: { compatExtension: true } }
    await fs.writeFile(layout.managedManifestPath, JSON.stringify(manifest, null, 2))

    await writePiBundle(outputRoot, {
      pluginName: "compound-engineering",
      prompts: [],
      skillDirs: [],
      generatedSkills: [],
      extensions: [],
    })

    await expect(fs.access(compatPath)).rejects.toBeDefined()
    const agents = await fs.readFile(path.join(outputRoot, "AGENTS.md"), "utf8")
    expect(agents).not.toContain("ce_subagent")
    expect(agents).toContain("compat tools are not currently installed")

    delete process.env.COMPOUND_ENGINEERING_HOME
  })

  test("documents that ce_subagent cwd must remain inside the active workspace", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pi-writer-agents-cwd-doc-"))
    const stateHome = path.join(tempRoot, "state-home")
    process.env.COMPOUND_ENGINEERING_HOME = stateHome

    await writePiBundle(path.join(tempRoot, ".pi"), {
      pluginName: "compound-engineering",
      prompts: [],
      skillDirs: [],
      generatedSkills: [],
      extensions: [{ name: "compound-engineering-compat.ts", content: "export const compat = true" }],
    })

    const agents = await fs.readFile(path.join(tempRoot, ".pi", "AGENTS.md"), "utf8")
    expect(agents).toContain("ce_subagent cwd must stay within the active workspace root")
    expect(agents).toContain("ce_run_prompt")
    expect(agents).toContain("MCPorter configPath overrides are ignored")
    expect(agents).toContain("foreign qualified Task refs remain rejected unless the compat runtime explicitly verifies a dispatchable namespace")
    expect(agents).toContain("ce_list_capabilities")

    delete process.env.COMPOUND_ENGINEERING_HOME
  })

  test("install and sync shared-resource transitions stay aligned on AGENTS and compat outcomes", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pi-writer-sync-parity-matrix-"))
    const stateHome = path.join(tempRoot, "state-home")
    process.env.COMPOUND_ENGINEERING_HOME = stateHome

    const outputRoot = path.join(tempRoot, ".pi")
    const layout = resolvePiLayout(outputRoot, "install")
    const compatPath = path.join(layout.extensionsDir, "compound-engineering-compat.ts")

    let seededState = replacePiManagedSection(null, "install", createPiManagedSection({
      sharedResources: { compatExtension: false },
    }), "compound-engineering")
    seededState = replacePiManagedSection(seededState, "sync", createPiManagedSection({
      sharedResources: { compatExtension: true },
    }))

    await fs.mkdir(layout.extensionsDir, { recursive: true })
    await fs.writeFile(compatPath, "sync compat\n")
    await writePiManagedState(layout, seededState, { install: false, sync: true })

    await writePiBundle(outputRoot, {
      pluginName: "compound-engineering",
      prompts: [],
      skillDirs: [],
      generatedSkills: [],
      extensions: [],
    })

    expect(await fs.readFile(compatPath, "utf8")).toBe("sync compat\n")
    let agents = await fs.readFile(path.join(outputRoot, "AGENTS.md"), "utf8")
    expect(agents).toContain("ce_subagent")

    seededState = replacePiManagedSection(null, "install", createPiManagedSection({
      sharedResources: { compatExtension: false },
    }), "compound-engineering")
    seededState = replacePiManagedSection(seededState, "sync", createPiManagedSection({
      sharedResources: { compatExtension: true },
    }))
    await fs.writeFile(compatPath, "stale sync compat\n")
    await writePiManagedState(layout, seededState, { install: false, sync: false })

    await writePiBundle(outputRoot, {
      pluginName: "compound-engineering",
      prompts: [],
      skillDirs: [],
      generatedSkills: [],
      extensions: [],
    })

    await expect(fs.access(compatPath)).rejects.toBeDefined()
    agents = await fs.readFile(path.join(outputRoot, "AGENTS.md"), "utf8")
    expect(agents).not.toContain("ce_subagent")
    expect(agents).toContain("compat tools are not currently installed")

    delete process.env.COMPOUND_ENGINEERING_HOME
  })

  test("preserves shared mcporter keys when sync ownership at the canonical root is not verified", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pi-writer-unverified-sync-mcp-"))
    const stateHome = path.join(tempRoot, "state-home")
    process.env.COMPOUND_ENGINEERING_HOME = stateHome

    const outputRoot = path.join(tempRoot, ".pi")
    const layout = resolvePiLayout(outputRoot, "install")

    await writePiBundle(outputRoot, {
      pluginName: "compound-engineering",
      prompts: [],
      skillDirs: [],
      generatedSkills: [],
      extensions: [],
      mcporterConfig: {
        mcpServers: {
          context7: { baseUrl: "https://mcp.context7.com/mcp" },
        },
      },
    })

    const manifest = JSON.parse(await fs.readFile(layout.managedManifestPath, "utf8")) as {
      version: number
      pluginName?: string
      sync?: { mcpServers?: string[]; sharedResources?: { mcporterConfig?: boolean } }
    }
    manifest.sync = {
      mcpServers: ["context7"],
      sharedResources: { mcporterConfig: true },
    }
    await fs.writeFile(layout.managedManifestPath, JSON.stringify(manifest, null, 2))

    await writePiBundle(outputRoot, {
      pluginName: "compound-engineering",
      prompts: [],
      skillDirs: [],
      generatedSkills: [],
      extensions: [],
    })

    const currentConfig = JSON.parse(await fs.readFile(layout.mcporterConfigPath, "utf8")) as {
      mcpServers?: Record<string, unknown>
    }
    expect(currentConfig.mcpServers?.context7).toBeDefined()

    delete process.env.COMPOUND_ENGINEERING_HOME
  })

  test("changing one file in a materialized skill updates content without rewriting unrelated files", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pi-writer-partial-skill-update-"))
    const outputRoot = path.join(tempRoot, ".pi")
    const sourceSkillDir = path.join(tempRoot, "source-skill")

    await fs.mkdir(path.join(sourceSkillDir, "nested"), { recursive: true })
    await fs.writeFile(
      path.join(sourceSkillDir, "SKILL.md"),
      [
        "---",
        "name: docs-skill",
        "description: Docs skill",
        "---",
        "",
        "Original body",
      ].join("\n"),
    )
    await fs.writeFile(path.join(sourceSkillDir, "nested", "stable.txt"), "stable\n")

    await writePiBundle(outputRoot, {
      pluginName: "compound-engineering",
      prompts: [],
      skillDirs: [{ name: "docs-skill", sourceDir: sourceSkillDir }],
      generatedSkills: [],
      extensions: [],
    })

    const targetSkillDir = path.join(outputRoot, "skills", "docs-skill")
    const stablePath = path.join(targetSkillDir, "nested", "stable.txt")
    const stableBefore = await fs.readFile(stablePath, "utf8")
    const stableStatBefore = await fs.stat(stablePath)
    await new Promise((resolve) => setTimeout(resolve, 15))
    await fs.writeFile(
      path.join(sourceSkillDir, "SKILL.md"),
      [
        "---",
        "name: docs-skill",
        "description: Docs skill",
        "---",
        "",
        "Updated body",
      ].join("\n"),
    )

    await writePiBundle(outputRoot, {
      pluginName: "compound-engineering",
      prompts: [],
      skillDirs: [{ name: "docs-skill", sourceDir: sourceSkillDir }],
      generatedSkills: [],
      extensions: [],
    })

    const stableAfter = await fs.readFile(stablePath, "utf8")
    const stableStatAfter = await fs.stat(stablePath)
    expect(await fs.readFile(path.join(targetSkillDir, "SKILL.md"), "utf8")).toContain("Updated body")
    expect(stableAfter).toBe(stableBefore)
    expect(stableStatAfter.mtimeMs).toBe(stableStatBefore.mtimeMs)

    const skillEntries = await fs.readdir(path.join(outputRoot, "skills"))
    expect(skillEntries.some((entry) => entry.startsWith("docs-skill.bak."))).toBe(false)
  })

  test("root-level file add and remove stay on the incremental skill update path", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pi-writer-root-delta-incremental-"))
    const outputRoot = path.join(tempRoot, ".pi")
    const sourceSkillDir = path.join(tempRoot, "source-skill")

    await fs.mkdir(path.join(sourceSkillDir, "nested"), { recursive: true })
    await fs.writeFile(path.join(sourceSkillDir, "SKILL.md"), "---\nname: docs-skill\n---\n\nBody\n")
    await fs.writeFile(path.join(sourceSkillDir, "nested", "stable.txt"), "stable\n")

    await writePiBundle(outputRoot, {
      pluginName: "compound-engineering",
      prompts: [],
      skillDirs: [{ name: "docs-skill", sourceDir: sourceSkillDir }],
      generatedSkills: [],
      extensions: [],
    })

    const targetSkillDir = path.join(outputRoot, "skills", "docs-skill")
    const stablePath = path.join(targetSkillDir, "nested", "stable.txt")
    const stableStatBefore = await fs.stat(stablePath)

    await new Promise((resolve) => setTimeout(resolve, 15))
    await fs.writeFile(path.join(sourceSkillDir, "README.md"), "root add\n")
    await writePiBundle(outputRoot, {
      pluginName: "compound-engineering",
      prompts: [],
      skillDirs: [{ name: "docs-skill", sourceDir: sourceSkillDir }],
      generatedSkills: [],
      extensions: [],
    })

    expect(await fs.readFile(path.join(targetSkillDir, "README.md"), "utf8")).toBe("root add\n")
    expect((await fs.readdir(path.join(outputRoot, "skills"))).some((entry) => entry.startsWith("docs-skill.bak."))).toBe(false)

    await new Promise((resolve) => setTimeout(resolve, 15))
    await fs.unlink(path.join(sourceSkillDir, "README.md"))
    await writePiBundle(outputRoot, {
      pluginName: "compound-engineering",
      prompts: [],
      skillDirs: [{ name: "docs-skill", sourceDir: sourceSkillDir }],
      generatedSkills: [],
      extensions: [],
    })

    await expect(fs.access(path.join(targetSkillDir, "README.md"))).rejects.toBeDefined()
    expect((await fs.readdir(path.join(outputRoot, "skills"))).some((entry) => entry.startsWith("docs-skill.bak."))).toBe(false)
    expect((await fs.stat(stablePath)).mtimeMs).toBe(stableStatBefore.mtimeMs)
  })

  test("removes stale nested entries from a materialized skill without creating a backup", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pi-writer-stale-skill-entry-"))
    const outputRoot = path.join(tempRoot, ".pi")
    const sourceSkillDir = path.join(tempRoot, "source-skill")

    await fs.mkdir(path.join(sourceSkillDir, "nested", "remove-me"), { recursive: true })
    await fs.writeFile(path.join(sourceSkillDir, "SKILL.md"), "---\nname: docs-skill\ndescription: Docs skill\n---\n\nBody\n")
    await fs.writeFile(path.join(sourceSkillDir, "nested", "keep.txt"), "keep\n")
    await fs.writeFile(path.join(sourceSkillDir, "nested", "remove-me", "gone.txt"), "gone\n")

    await writePiBundle(outputRoot, {
      pluginName: "compound-engineering",
      prompts: [],
      skillDirs: [{ name: "docs-skill", sourceDir: sourceSkillDir }],
      generatedSkills: [],
      extensions: [],
    })

    await fs.rm(path.join(sourceSkillDir, "nested", "remove-me"), { recursive: true, force: true })

    await writePiBundle(outputRoot, {
      pluginName: "compound-engineering",
      prompts: [],
      skillDirs: [{ name: "docs-skill", sourceDir: sourceSkillDir }],
      generatedSkills: [],
      extensions: [],
    })

    const targetSkillDir = path.join(outputRoot, "skills", "docs-skill")
    expect(await exists(path.join(targetSkillDir, "nested", "keep.txt"))).toBe(true)
    expect(await exists(path.join(targetSkillDir, "nested", "remove-me"))).toBe(false)

    const skillEntries = await fs.readdir(path.join(outputRoot, "skills"))
    expect(skillEntries.some((entry) => entry.startsWith("docs-skill.bak."))).toBe(false)
  })

  test("falls back to whole-directory replacement for nested file-to-directory transitions", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pi-writer-shape-fallback-"))
    const outputRoot = path.join(tempRoot, ".pi")
    const sourceSkillDir = path.join(tempRoot, "source-skill")

    await fs.mkdir(sourceSkillDir, { recursive: true })
    await fs.writeFile(path.join(sourceSkillDir, "SKILL.md"), "---\nname: docs-skill\ndescription: Docs skill\n---\n\nBody\n")
    await fs.writeFile(path.join(sourceSkillDir, "nested"), "file first\n")

    await writePiBundle(outputRoot, {
      pluginName: "compound-engineering",
      prompts: [],
      skillDirs: [{ name: "docs-skill", sourceDir: sourceSkillDir }],
      generatedSkills: [],
      extensions: [],
    })

    await fs.rm(path.join(sourceSkillDir, "nested"), { force: true })
    await fs.mkdir(path.join(sourceSkillDir, "nested"), { recursive: true })
    await fs.writeFile(path.join(sourceSkillDir, "nested", "child.txt"), "child\n")

    await writePiBundle(outputRoot, {
      pluginName: "compound-engineering",
      prompts: [],
      skillDirs: [{ name: "docs-skill", sourceDir: sourceSkillDir }],
      generatedSkills: [],
      extensions: [],
    })

    const targetSkillDir = path.join(outputRoot, "skills", "docs-skill")
    expect(await exists(path.join(targetSkillDir, "nested", "child.txt"))).toBe(true)

    const skillEntries = await fs.readdir(path.join(outputRoot, "skills"))
    expect(skillEntries.some((entry) => entry.startsWith("docs-skill.bak."))).toBe(true)
  })

  test("does not delete prompts claimed only by an unverified manifest", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pi-writer-forged-cleanup-"))
    const outputRoot = path.join(tempRoot, ".pi")
    const layout = resolvePiLayout(outputRoot, "install")

    await fs.mkdir(path.dirname(layout.managedManifestPath), { recursive: true })
    await fs.mkdir(layout.promptsDir, { recursive: true })
    await fs.writeFile(path.join(layout.promptsDir, "user-owned.md"), "user prompt\n")
    await fs.writeFile(
      layout.managedManifestPath,
      JSON.stringify({
        version: 1,
        install: {
          artifacts: [
            {
              kind: "prompt",
              sourceName: "forged",
              emittedName: "user-owned",
              relativePath: path.join("prompts", "user-owned.md"),
            },
          ],
        },
      }, null, 2),
    )

    await writePiBundle(outputRoot, {
      pluginName: "compound-engineering",
      prompts: [],
      skillDirs: [],
      generatedSkills: [],
      extensions: [],
    })

    expect(await exists(path.join(layout.promptsDir, "user-owned.md"))).toBe(true)
  })
})
