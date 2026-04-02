import { afterEach, describe, expect, spyOn, test } from "bun:test"
import { createHash } from "crypto"
import { promises as fs } from "fs"
import path from "path"
import os from "os"
import { pathToFileURL } from "url"
import { classifyUnsupportedPiSyncStatus } from "../src/sync/pi-artifact-status"
import { setPiSyncPassHookForTests, setPiSyncRerunModeForTests, syncToPi } from "../src/sync/pi"
import { setPiSyncCommandConversionHookForTests } from "../src/sync/commands"
import { loadClaudeHome } from "../src/parsers/claude-home"
import type { ClaudeHomeConfig } from "../src/parsers/claude-home"
import { PI_COMPAT_EXTENSION_SOURCE } from "../src/templates/pi/compat-extension"
import { writePiBundle } from "../src/targets/pi"
import { setAtomicWriteFailureHookForTests, setManagedPathSnapshotHookForTests } from "../src/utils/files"
import { resolvePiLayout } from "../src/utils/pi-layout"
import { createManagedArtifact, createPiManagedSection, createPiManagedSectionHashPayload, loadPiManagedStateWithTrust, replacePiManagedSection, writePiManagedState } from "../src/utils/pi-managed"
import { isSafePiManagedName } from "../src/utils/pi-managed"
import { getPiPolicyFingerprint, setPiPolicyFingerprintForTests } from "../src/utils/pi-policy"
import { normalizePiSkillName, setPiSkillFullCompareHookForTests, setPiSkillSourceAnalysisHookForTests, setPiSkillSourceFingerprintHookForTests, uniquePiSkillName } from "../src/utils/pi-skills"
import { derivePiSharedResourceContract } from "../src/utils/pi-trust-contract"

async function seedVerifiedInstallNameMaps(
  outputRoot: string,
  nameMaps: {
    agents?: Record<string, string>
    skills?: Record<string, string>
    prompts?: Record<string, string>
  },
): Promise<void> {
  const layout = resolvePiLayout(outputRoot, "sync")
  const state = replacePiManagedSection(null, "install", createPiManagedSection({ nameMaps }), "compound-engineering")
  await writePiManagedState(layout, state, { install: true, sync: false })
}

async function rewriteManifestWithMatchingVerification(
  layout: ReturnType<typeof resolvePiLayout>,
  sectionName: "install" | "sync",
  manifestMutator: (manifest: any) => any,
  effectiveSection: ReturnType<typeof createPiManagedSection>,
) {
  const manifest = manifestMutator(JSON.parse(await fs.readFile(layout.managedManifestPath, "utf8")))
  await fs.writeFile(layout.managedManifestPath, JSON.stringify(manifest, null, 2))

  const machineKey = (await fs.readFile(path.join(process.env.COMPOUND_ENGINEERING_HOME!, ".compound-engineering", "pi-managed-key"), "utf8")).trim()
  const hash = createHash("sha256").update(JSON.stringify(createPiManagedSectionHashPayload(layout.root, effectiveSection))).digest("hex")
  const verification = JSON.parse(await fs.readFile(layout.verificationPath, "utf8")) as any
  verification[sectionName] = { hash: `${machineKey}:${hash}` }
  await fs.writeFile(layout.verificationPath, JSON.stringify(verification, null, 2))
}

async function seedVerifiedProjectInstallNameMaps(
  outputRoot: string,
  nameMaps: {
    agents?: Record<string, string>
    skills?: Record<string, string>
    prompts?: Record<string, string>
  },
): Promise<void> {
  const layout = resolvePiLayout(outputRoot, "install")
  const state = replacePiManagedSection(null, "install", createPiManagedSection({ nameMaps }), "compound-engineering")
  await writePiManagedState(layout, state, { install: true, sync: false })
}

async function seedVerifiedSyncNameMaps(
  outputRoot: string,
  nameMaps: {
    agents?: Record<string, string>
    skills?: Record<string, string>
    prompts?: Record<string, string>
  },
  options?: {
    sharedResources?: {
      compatExtension?: boolean
      mcporterConfig?: boolean
    }
  },
): Promise<void> {
  const layout = resolvePiLayout(outputRoot, "sync")
  const state = replacePiManagedSection(null, "sync", createPiManagedSection({
    nameMaps,
    sharedResources: options?.sharedResources,
  }), "compound-engineering")
  await writePiManagedState(layout, state, { install: false, sync: true })
}

async function seedVerifiedGlobalSyncNameMaps(
  homeRoot: string,
  nameMaps: {
    agents?: Record<string, string>
    skills?: Record<string, string>
    prompts?: Record<string, string>
  },
): Promise<void> {
  const globalRoot = path.join(homeRoot, ".pi", "agent")
  const layout = resolvePiLayout(globalRoot, "sync")
  const state = replacePiManagedSection(null, "sync", createPiManagedSection({ nameMaps }), "compound-engineering")
  await writePiManagedState(layout, state, { install: false, sync: true })
}

async function loadCompatHelpers(moduleRoot: string): Promise<{
  resolveAgentName: (cwd: string, value: string) => string
  resolvePromptName: (cwd: string, value: string) => string
  resolveMcporterConfigPath: (cwd: string, explicit?: string) => string | undefined
  resolveTaskCwd: (cwd: string, taskCwd?: string) => string
  setAliasManifestSignatureHookForTests: (hook: ((filePath: string) => void) | null) => void
  default: (pi: {
    registerTool: (tool: { name: string; execute: (...args: any[]) => any }) => void
    exec: (...args: any[]) => any
  }) => void
}> {
  const compatPath = path.join(moduleRoot, "extensions", "compound-engineering-compat.ts")
  await fs.mkdir(path.dirname(compatPath), { recursive: true })

  const source = PI_COMPAT_EXTENSION_SOURCE.replace(
    'import { Type } from "@sinclair/typebox"\n',
    'const Type = { Object: (value: unknown) => value, String: (value: unknown) => value, Optional: (value: unknown) => value, Array: (value: unknown) => value, Number: (value: unknown) => value, Boolean: (value: unknown) => value, Record: (_key: unknown, value: unknown) => value, Any: () => ({}) }\n',
  ) + "\nexport { resolveAgentName, resolvePromptName, resolveMcporterConfigPath, resolveTaskCwd }\n"

  await fs.writeFile(compatPath, source)
  return import(pathToFileURL(compatPath).href + `?t=${Date.now()}`)
}

async function readTreeSnapshot(root: string): Promise<Record<string, string>> {
  const snapshot: Record<string, string> = {}

  async function walk(dir: string, relativeDir = ""): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => [])
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      const fullPath = path.join(dir, entry.name)
      const relativePath = relativeDir ? path.join(relativeDir, entry.name) : entry.name
      if (entry.isDirectory()) {
        await walk(fullPath, relativePath)
        continue
      }
      if (entry.isFile()) {
        snapshot[relativePath] = await fs.readFile(fullPath, "utf8")
      }
    }
  }

  await walk(root)
  return snapshot
}

function normalizeRootPaths<T>(value: T, root: string): T {
  return JSON.parse(JSON.stringify(value).replaceAll(root, "<ROOT>")) as T
}

afterEach(() => {
  setAtomicWriteFailureHookForTests(null)
  setManagedPathSnapshotHookForTests(null)
  setPiSyncPassHookForTests(null)
  setPiSyncRerunModeForTests(null)
  setPiSyncCommandConversionHookForTests(null)
  setPiSkillFullCompareHookForTests(null)
  setPiSkillSourceAnalysisHookForTests(null)
  setPiSkillSourceFingerprintHookForTests(null)
  setPiPolicyFingerprintForTests(null)
  delete process.env.COMPOUND_ENGINEERING_PI_POLICY_FINGERPRINT
})

describe("syncToPi", () => {
  test("deduped Pi names stay within the managed-name validity limit", () => {
    const base = normalizePiSkillName("a".repeat(80))
    const used = new Set<string>([base])
    let latest = ""

    for (let index = 2; index <= 1000; index += 1) {
      latest = uniquePiSkillName(base, used)
    }

    expect(latest.length).toBeLessThanOrEqual(64)
    expect(isSafePiManagedName(latest)).toBe(true)
  })

  test("shared-resource contract distinguishes active, preserved-untrusted, and absent states", () => {
    expect(derivePiSharedResourceContract({
      nextOwns: true,
    })).toEqual({
      state: "active",
      retain: true,
      advertise: true,
    })

    expect(derivePiSharedResourceContract({
      preserveUntrusted: true,
    })).toEqual({
      state: "preserved-untrusted",
      retain: false,
      advertise: false,
    })
  })

  test("uses one shared unsupported-status classifier for prompt and skill sync outcomes", () => {
    expect(classifyUnsupportedPiSyncStatus("Unsupported unresolved first-party qualified ref for Pi sync: compound-engineering:missing")).toBe("retryable")
    expect(classifyUnsupportedPiSyncStatus("Unsupported foreign qualified Task ref for Pi sync: unknown-plugin:review:bad")).toBe("blocked-by-policy")
    expect(classifyUnsupportedPiSyncStatus("Unsupported malformed prompt ref")).toBe("unsupported-final")
  })

  test("classifies freshly written sync manifests as verified for their canonical root", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-verified-"))
    const stateHome = path.join(tempRoot, "state-home")
    process.env.COMPOUND_ENGINEERING_HOME = stateHome

    await syncToPi({
      skills: [],
      commands: [
        {
          name: "plan-review",
          description: "Personal review",
          body: "Review body",
          sourcePath: path.join(tempRoot, "commands", "plan-review.md"),
        },
      ],
      mcpServers: {},
    }, tempRoot)

    const trust = await loadPiManagedStateWithTrust(resolvePiLayout(tempRoot, "sync"))
    expect(trust.status).toBe("verified")
    expect(trust.state?.sync.artifacts).toHaveLength(1)

    delete process.env.COMPOUND_ENGINEERING_HOME
  })

  test("materializes synced skills and writes MCPorter config", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-"))
    const fixtureSkillDir = path.join(import.meta.dir, "fixtures", "sample-plugin", "skills", "skill-one")
    const layout = resolvePiLayout(tempRoot, "sync")

    const config: ClaudeHomeConfig = {
      skills: [
        {
          name: "skill-one",
          sourceDir: fixtureSkillDir,
          skillPath: path.join(fixtureSkillDir, "SKILL.md"),
        },
      ],
      mcpServers: {
        context7: { url: "https://mcp.context7.com/mcp" },
        local: { command: "echo", args: ["hello"] },
      },
    }

    await syncToPi(config, tempRoot)

    const linkedSkillPath = path.join(layout.skillsDir, "skill-one")
    const linkedStat = await fs.lstat(linkedSkillPath)
    expect(linkedStat.isDirectory()).toBe(true)

    const mcporterPath = layout.mcporterConfigPath
    const mcporterConfig = JSON.parse(await fs.readFile(mcporterPath, "utf8")) as {
      mcpServers: Record<string, { baseUrl?: string; command?: string }>
    }

    expect(mcporterConfig.mcpServers.context7?.baseUrl).toBe("https://mcp.context7.com/mcp")
    expect(mcporterConfig.mcpServers.local?.command).toBe("echo")
  })

  test("writes custom sync roots at the direct sync layout", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-custom-root-"))
    const outputRoot = path.join(tempRoot, "custom-root")
    const layout = resolvePiLayout(outputRoot, "sync")

    await syncToPi({
      skills: [],
      commands: [
        {
          name: "plan-review",
          description: "Personal review",
          body: "Review body",
          sourcePath: path.join(tempRoot, "commands", "plan-review.md"),
        },
      ],
      mcpServers: {},
    }, outputRoot)

    expect(await fs.readFile(path.join(layout.promptsDir, "plan-review.md"), "utf8")).toContain("Review body")
    await expect(fs.access(path.join(outputRoot, "prompts", "plan-review.md"))).resolves.toBeNull()
  })

  test("accepts top-level personal skills discovered through trusted symlink entries", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-external-root-"))
    const actualSkillsRoot = path.join(tempRoot, "actual-skills")
    const linkedSkillsRoot = path.join(tempRoot, "linked-skills")
    const externalSkillDir = path.join(tempRoot, "external-skill")
    const warnSpy = spyOn(console, "warn").mockImplementation(() => {})

    await fs.mkdir(actualSkillsRoot, { recursive: true })
    await fs.mkdir(externalSkillDir, { recursive: true })
    await fs.writeFile(
      path.join(externalSkillDir, "SKILL.md"),
      [
        "---",
        "name: docs-skill",
        "description: External skill",
        "---",
        "",
        "- /skill:docs-skill",
      ].join("\n"),
    )
    await fs.symlink(actualSkillsRoot, linkedSkillsRoot)
    await fs.symlink(externalSkillDir, path.join(linkedSkillsRoot, "docs-skill"))

    await syncToPi({
      skills: [
        {
          name: "docs-skill",
          entryDir: path.join(linkedSkillsRoot, "docs-skill"),
          trustedRoot: linkedSkillsRoot,
          trustedBoundary: externalSkillDir,
          sourceDir: externalSkillDir,
          skillPath: path.join(linkedSkillsRoot, "docs-skill", "SKILL.md"),
        },
      ],
      mcpServers: {},
    }, tempRoot)

    expect(await fs.readFile(path.join(resolvePiLayout(tempRoot, "sync").skillsDir, "docs-skill", "SKILL.md"), "utf8")).toContain("name: docs-skill")
    expect(warnSpy).not.toHaveBeenCalled()

    warnSpy.mockRestore()
  })

  test("accepts top-level personal skills that resolve within the lexical trusted root", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-in-root-home-symlink-"))
    const actualSkillsRoot = path.join(tempRoot, "actual-skills")
    const linkedSkillsRoot = path.join(tempRoot, "linked-skills")
    const canonicalSkillDir = path.join(actualSkillsRoot, "reviewer-real")
    const warnSpy = spyOn(console, "warn").mockImplementation(() => {})

    await fs.mkdir(canonicalSkillDir, { recursive: true })
    await fs.writeFile(
      path.join(canonicalSkillDir, "SKILL.md"),
      [
        "---",
        "name: reviewer",
        "description: In-root symlinked personal skill",
        "---",
        "",
        "Body",
      ].join("\n"),
    )
    await fs.symlink(actualSkillsRoot, linkedSkillsRoot)
    await fs.symlink(canonicalSkillDir, path.join(actualSkillsRoot, "reviewer"))

    await syncToPi({
      skills: [
        {
          name: "reviewer",
          entryDir: path.join(linkedSkillsRoot, "reviewer"),
          trustedRoot: linkedSkillsRoot,
          trustedBoundary: canonicalSkillDir,
          sourceDir: canonicalSkillDir,
          skillPath: path.join(linkedSkillsRoot, "reviewer", "SKILL.md"),
        },
      ],
      mcpServers: {},
    }, tempRoot)

    expect(await fs.readFile(path.join(resolvePiLayout(tempRoot, "sync").skillsDir, "reviewer", "SKILL.md"), "utf8")).toContain("name: reviewer")
    expect(warnSpy).not.toHaveBeenCalled()

    warnSpy.mockRestore()
  })

  test("records symlinked top-level personal skills using a canonical trusted boundary", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-canonical-trusted-boundary-"))
    const actualSkillsRoot = path.join(tempRoot, "actual-skills")
    const linkedSkillsRoot = path.join(tempRoot, "skills")
    const externalSkillDir = path.join(tempRoot, "external-skill")

    await fs.mkdir(actualSkillsRoot, { recursive: true })
    await fs.mkdir(externalSkillDir, { recursive: true })
    await fs.writeFile(path.join(externalSkillDir, "SKILL.md"), "---\nname: reviewer\n---\nReview things.\n")
    await fs.writeFile(path.join(externalSkillDir, "shared.txt"), "hello\n")
    await fs.symlink(actualSkillsRoot, linkedSkillsRoot)
    await fs.symlink(externalSkillDir, path.join(linkedSkillsRoot, "reviewer"))

    const config = await loadClaudeHome(tempRoot)

    expect(config.skills).toHaveLength(1)
    expect(config.skills[0]?.entryDir).toBe(path.join(linkedSkillsRoot, "reviewer"))
    expect(config.skills[0]?.trustedRoot).toBe(linkedSkillsRoot)
    expect(config.skills[0]?.trustedBoundary).toBe(externalSkillDir)
    expect(config.skills[0]?.sourceDir).toBe(externalSkillDir)
  })

  test("materializes invalid skill names into Pi-safe directories", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-invalid-"))
    const sourceSkillDir = path.join(tempRoot, "claude-skill")
    await fs.mkdir(sourceSkillDir, { recursive: true })
    await fs.writeFile(
      path.join(sourceSkillDir, "SKILL.md"),
      [
        "---",
        "name: ce:plan",
        "description: Plan workflow",
        "---",
        "",
        "# Plan",
        "",
        "- Task compound-engineering:research:repo-research-analyst(feature_description)",
      ].join("\n"),
    )

    const config: ClaudeHomeConfig = {
      skills: [
        {
          name: "ce:plan",
          sourceDir: sourceSkillDir,
          skillPath: path.join(sourceSkillDir, "SKILL.md"),
        },
      ],
      mcpServers: {},
    }

    await syncToPi(config, tempRoot)

    const materializedSkillPath = path.join(tempRoot, "skills", "ce-plan")
    const skillStat = await fs.lstat(materializedSkillPath)
    expect(skillStat.isSymbolicLink()).toBe(false)

    const copiedSkill = await fs.readFile(path.join(materializedSkillPath, "SKILL.md"), "utf8")
    expect(copiedSkill).toContain("name: ce-plan")
    expect(copiedSkill).not.toContain("name: ce:plan")
    expect(copiedSkill).toContain("Run ce_subagent with agent=\"repo-research-analyst\" and task=\"feature_description\".")
  })

  test("materializes valid Pi-named skills when body needs Pi-specific rewrites", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-transform-"))
    const sourceSkillDir = path.join(tempRoot, "claude-skill-valid")
    await fs.mkdir(sourceSkillDir, { recursive: true })
    await fs.writeFile(
      path.join(sourceSkillDir, "SKILL.md"),
      [
        "---",
        "name: ce-plan",
        "description: Plan workflow",
        "---",
        "",
        "# Plan",
        "",
        "- Task compound-engineering:research:repo-research-analyst(feature_description)",
      ].join("\n"),
    )

    const config: ClaudeHomeConfig = {
      skills: [
        {
          name: "ce-plan",
          sourceDir: sourceSkillDir,
          skillPath: path.join(sourceSkillDir, "SKILL.md"),
        },
      ],
      mcpServers: {},
    }

    await syncToPi(config, tempRoot)

    const syncedSkillPath = path.join(tempRoot, "skills", "ce-plan")
    const skillStat = await fs.lstat(syncedSkillPath)
    expect(skillStat.isSymbolicLink()).toBe(false)

    const copiedSkill = await fs.readFile(path.join(syncedSkillPath, "SKILL.md"), "utf8")
    expect(copiedSkill).toContain("Run ce_subagent with agent=\"repo-research-analyst\" and task=\"feature_description\".")
  })

  test("keeps a previously materialized Pi skill directory materialized after rewrites are no longer needed", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-dir-to-symlink-"))
    const sourceSkillDir = path.join(tempRoot, "claude-skill-transition")
    const syncedSkillPath = path.join(tempRoot, "skills", "ce-plan")
    const skillPath = path.join(sourceSkillDir, "SKILL.md")

    await fs.mkdir(sourceSkillDir, { recursive: true })
    await fs.writeFile(
      skillPath,
      [
        "---",
        "name: ce-plan",
        "description: Plan workflow",
        "---",
        "",
        "# Plan",
        "",
        "- Task compound-engineering:research:repo-research-analyst(feature_description)",
      ].join("\n"),
    )

    const config: ClaudeHomeConfig = {
      skills: [
        {
          name: "ce-plan",
          sourceDir: sourceSkillDir,
          skillPath,
        },
      ],
      mcpServers: {},
    }

    await syncToPi(config, tempRoot)
    expect((await fs.lstat(syncedSkillPath)).isSymbolicLink()).toBe(false)

    await fs.writeFile(
      skillPath,
      [
        "---",
        "name: ce-plan",
        "description: Plan workflow",
        "---",
        "",
        "# Plan",
        "",
        "No Pi rewrite needed.",
        "Updated from source.",
      ].join("\n"),
    )

    await syncToPi(config, tempRoot)

    const syncedStat = await fs.lstat(syncedSkillPath)
    expect(syncedStat.isDirectory()).toBe(true)

    const liveSkill = await fs.readFile(path.join(syncedSkillPath, "SKILL.md"), "utf8")
    expect(liveSkill).toContain("Updated from source.")
    expect(liveSkill).not.toContain("Run ce_subagent")

    const files = await fs.readdir(path.join(tempRoot, "skills"))
    const backupDirName = files.find((file) => file.startsWith("ce-plan.bak."))
    expect(backupDirName).toBeUndefined()
  })

  test("removes stale nested entries from a materialized synced skill without creating a backup", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-stale-entry-"))
    const sourceSkillDir = path.join(tempRoot, "claude-skill-stale")
    const syncedSkillPath = path.join(tempRoot, "skills", "ce-plan")
    const skillPath = path.join(sourceSkillDir, "SKILL.md")

    await fs.mkdir(path.join(sourceSkillDir, "nested", "remove-me"), { recursive: true })
    await fs.writeFile(skillPath, "---\nname: ce-plan\ndescription: Plan workflow\n---\n\n# Plan\n")
    await fs.writeFile(path.join(sourceSkillDir, "nested", "keep.txt"), "keep\n")
    await fs.writeFile(path.join(sourceSkillDir, "nested", "remove-me", "gone.txt"), "gone\n")

    const config: ClaudeHomeConfig = {
      skills: [{ name: "ce-plan", sourceDir: sourceSkillDir, skillPath }],
      mcpServers: {},
    }

    await syncToPi(config, tempRoot)
    await fs.rm(path.join(sourceSkillDir, "nested", "remove-me"), { recursive: true, force: true })
    await syncToPi(config, tempRoot)

    expect(await fs.readFile(path.join(syncedSkillPath, "nested", "keep.txt"), "utf8")).toBe("keep\n")
    await expect(fs.access(path.join(syncedSkillPath, "nested", "remove-me"))).rejects.toBeDefined()

    const files = await fs.readdir(path.join(tempRoot, "skills"))
    const backupDirName = files.find((file) => file.startsWith("ce-plan.bak."))
    expect(backupDirName).toBeUndefined()
  })

  test("falls back to whole-directory replacement for nested file-to-directory transitions during sync", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-shape-fallback-"))
    const sourceSkillDir = path.join(tempRoot, "claude-skill-shape")
    const syncedSkillPath = path.join(tempRoot, "skills", "ce-plan")
    const skillPath = path.join(sourceSkillDir, "SKILL.md")

    await fs.mkdir(sourceSkillDir, { recursive: true })
    await fs.writeFile(skillPath, "---\nname: ce-plan\ndescription: Plan workflow\n---\n\n# Plan\n")
    await fs.writeFile(path.join(sourceSkillDir, "nested"), "file first\n")

    const config: ClaudeHomeConfig = {
      skills: [{ name: "ce-plan", sourceDir: sourceSkillDir, skillPath }],
      mcpServers: {},
    }

    await syncToPi(config, tempRoot)

    await fs.rm(path.join(sourceSkillDir, "nested"), { force: true })
    await fs.mkdir(path.join(sourceSkillDir, "nested"), { recursive: true })
    await fs.writeFile(path.join(sourceSkillDir, "nested", "child.txt"), "child\n")

    await syncToPi(config, tempRoot)

    expect(await fs.readFile(path.join(syncedSkillPath, "nested", "child.txt"), "utf8")).toBe("child\n")

    const files = await fs.readdir(path.join(tempRoot, "skills"))
    const backupDirName = files.find((file) => file.startsWith("ce-plan.bak."))
    expect(backupDirName).toBeDefined()
  })

  test("replaces an existing symlink when Pi-specific materialization is required", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-symlink-migration-"))
    const existingTargetDir = path.join(tempRoot, "existing-skill")
    const sourceSkillDir = path.join(tempRoot, "claude-skill-migrated")
    const syncedSkillPath = path.join(tempRoot, "skills", "ce-plan")

    await fs.mkdir(existingTargetDir, { recursive: true })
    await fs.writeFile(path.join(existingTargetDir, "SKILL.md"), "---\nname: ce-plan\ndescription: Existing\n---\n\n# Existing\n")
    await fs.mkdir(path.dirname(syncedSkillPath), { recursive: true })
    await fs.symlink(existingTargetDir, syncedSkillPath)

    await fs.mkdir(sourceSkillDir, { recursive: true })
    await fs.writeFile(
      path.join(sourceSkillDir, "SKILL.md"),
      [
        "---",
        "name: ce-plan",
        "description: Plan workflow",
        "---",
        "",
        "# Plan",
        "",
        "- Task compound-engineering:research:repo-research-analyst(feature_description)",
      ].join("\n"),
    )

    const config: ClaudeHomeConfig = {
      skills: [
        {
          name: "ce-plan",
          sourceDir: sourceSkillDir,
          skillPath: path.join(sourceSkillDir, "SKILL.md"),
        },
      ],
      mcpServers: {},
    }

    await syncToPi(config, tempRoot)

    const skillStat = await fs.lstat(syncedSkillPath)
    expect(skillStat.isSymbolicLink()).toBe(false)

    const copiedSkill = await fs.readFile(path.join(syncedSkillPath, "SKILL.md"), "utf8")
    expect(copiedSkill).toContain("Run ce_subagent with agent=\"repo-research-analyst\" and task=\"feature_description\".")
  })

  test("rejects Pi skill replacement when the skill parent directory becomes a symlinked ancestor", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-replacement-ancestor-symlink-"))
    const sourceSkillDir = path.join(tempRoot, "claude-skill-migrated")
    const skillsParent = path.join(tempRoot, "skills")
    const syncedSkillPath = path.join(skillsParent, "ce-plan")
    const externalRoot = path.join(tempRoot, "external")

    await fs.mkdir(path.join(syncedSkillPath, "nested"), { recursive: true })
    await fs.writeFile(path.join(syncedSkillPath, "SKILL.md"), "---\nname: ce-plan\n---\n\nExisting\n")
    await fs.writeFile(path.join(syncedSkillPath, "nested", "keep.txt"), "keep\n")

    await fs.mkdir(sourceSkillDir, { recursive: true })
    await fs.writeFile(path.join(sourceSkillDir, "SKILL.md"), "---\nname: ce-plan\n---\n\nReplacement\n")
    await fs.writeFile(path.join(sourceSkillDir, "nested"), "file now\n")
    await fs.mkdir(externalRoot, { recursive: true })

    await fs.rename(skillsParent, `${skillsParent}-bak`)
    await fs.symlink(externalRoot, skillsParent)

    await expect(syncToPi({
      skills: [
        {
          name: "ce-plan",
          sourceDir: sourceSkillDir,
          skillPath: path.join(sourceSkillDir, "SKILL.md"),
        },
      ],
      mcpServers: {},
    }, tempRoot)).rejects.toThrow("symlinked ancestor")

    await expect(fs.access(path.join(externalRoot, "ce-plan"))).rejects.toBeDefined()
  })

  test("updates an existing real directory in place when Pi-specific materialization can converge safely", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-backup-dir-"))
    const sourceSkillDir = path.join(tempRoot, "claude-skill-updated")
    const syncedSkillPath = path.join(tempRoot, "skills", "ce-plan")

    await fs.mkdir(syncedSkillPath, { recursive: true })
    await fs.writeFile(
      path.join(syncedSkillPath, "SKILL.md"),
      "---\nname: ce-plan\ndescription: Existing\n---\n\n# Existing\n\nLocal edits\n",
    )

    await fs.mkdir(sourceSkillDir, { recursive: true })
    await fs.writeFile(
      path.join(sourceSkillDir, "SKILL.md"),
      [
        "---",
        "name: ce-plan",
        "description: Plan workflow",
        "---",
        "",
        "# Plan",
        "",
        "- Task compound-engineering:research:repo-research-analyst(feature_description)",
      ].join("\n"),
    )

    const config: ClaudeHomeConfig = {
      skills: [
        {
          name: "ce-plan",
          sourceDir: sourceSkillDir,
          skillPath: path.join(sourceSkillDir, "SKILL.md"),
        },
      ],
      mcpServers: {},
    }

    await syncToPi(config, tempRoot)

    const copiedSkill = await fs.readFile(path.join(syncedSkillPath, "SKILL.md"), "utf8")
    expect(copiedSkill).toContain("Run ce_subagent with agent=\"repo-research-analyst\" and task=\"feature_description\".")

    const files = await fs.readdir(path.join(tempRoot, "skills"))
    const backupDirName = files.find((file) => file.startsWith("ce-plan.bak."))
    expect(backupDirName).toBeUndefined()
  })

  test("merges existing MCPorter config", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-merge-"))
    const mcporterPath = path.join(tempRoot, "compound-engineering", "mcporter.json")
    await fs.mkdir(path.dirname(mcporterPath), { recursive: true })

    await fs.writeFile(
      mcporterPath,
      JSON.stringify({ mcpServers: { existing: { baseUrl: "https://example.com/mcp" } } }, null, 2),
    )

    const config: ClaudeHomeConfig = {
      skills: [],
      mcpServers: {
        context7: { url: "https://mcp.context7.com/mcp" },
      },
    }

    await syncToPi(config, tempRoot)

    const merged = JSON.parse(await fs.readFile(mcporterPath, "utf8")) as {
      mcpServers: Record<string, { baseUrl?: string }>
    }

    expect(merged.mcpServers.existing?.baseUrl).toBe("https://example.com/mcp")
    expect(merged.mcpServers.context7?.baseUrl).toBe("https://mcp.context7.com/mcp")
  })

  test("writes compat extension for MCP-only sync", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-mcp-only-compat-"))

    const config: ClaudeHomeConfig = {
      skills: [],
      mcpServers: {
        context7: { url: "https://mcp.context7.com/mcp" },
      },
    }

    await syncToPi(config, tempRoot)

    const compatPath = path.join(tempRoot, "extensions", "compound-engineering-compat.ts")
    const compatContent = await fs.readFile(compatPath, "utf8")
    expect(compatContent).toContain('name: "mcporter_list"')
    expect(compatContent).toContain('name: "mcporter_call"')
    expect(compatContent).not.toContain('configPath: Type.Optional')
  })

  test("regenerates valid frontmatter when a skill has malformed frontmatter", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-malformed-"))
    const sourceSkillDir = path.join(tempRoot, "claude-skill")
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

    const config: ClaudeHomeConfig = {
      skills: [
        {
          name: "broken-skill",
          sourceDir: sourceSkillDir,
          skillPath: path.join(sourceSkillDir, "SKILL.md"),
        },
      ],
      mcpServers: {},
    }

    await syncToPi(config, tempRoot)

    const syncedSkillPath = path.join(tempRoot, "skills", "broken-skill")
    const skillStat = await fs.lstat(syncedSkillPath)
    expect(skillStat.isDirectory()).toBe(true)

    const copiedSkill = await fs.readFile(path.join(syncedSkillPath, "SKILL.md"), "utf8")
    expect(copiedSkill).toContain("Run ce_subagent with agent=\"repo-research-analyst\" and task=\"feature_description\".")
    expect(copiedSkill).toContain("name: broken-skill")
    expect(copiedSkill).not.toContain("name: [broken")
  })

  test("does not create another backup when malformed skill output is already converged", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-malformed-stable-"))
    const sourceSkillDir = path.join(tempRoot, "claude-skill")
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

    const config: ClaudeHomeConfig = {
      skills: [
        {
          name: "broken-skill",
          sourceDir: sourceSkillDir,
          skillPath: path.join(sourceSkillDir, "SKILL.md"),
        },
      ],
      mcpServers: {},
    }

    await syncToPi(config, tempRoot)
    const skillsDir = path.join(tempRoot, "skills")
    const before = await fs.readdir(skillsDir)

    await syncToPi(config, tempRoot)
    const after = await fs.readdir(skillsDir)

    expect(before.filter((entry) => entry.startsWith("broken-skill.bak."))).toHaveLength(0)
    expect(after.filter((entry) => entry.startsWith("broken-skill.bak."))).toHaveLength(0)
  })

  test("repairs a malformed previously materialized skill target on rerun", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-malformed-target-repair-"))
    const sourceSkillDir = path.join(tempRoot, "claude-skill")
    const targetSkillDir = path.join(tempRoot, "skills", "broken-skill")
    await fs.mkdir(sourceSkillDir, { recursive: true })
    await fs.mkdir(targetSkillDir, { recursive: true })
    await fs.writeFile(
      path.join(sourceSkillDir, "SKILL.md"),
      [
        "---",
        "name: [broken",
        "description: broken frontmatter",
        "---",
        "",
        "# Broken skill",
      ].join("\n"),
    )
    await fs.writeFile(path.join(targetSkillDir, "SKILL.md"), "---\nname: [broken\n---\n\n# stale\n")

    await syncToPi({
      skills: [
        {
          name: "broken-skill",
          sourceDir: sourceSkillDir,
          skillPath: path.join(sourceSkillDir, "SKILL.md"),
        },
      ],
      mcpServers: {},
    }, tempRoot)

    const repaired = await fs.readFile(path.join(targetSkillDir, "SKILL.md"), "utf8")
    expect(repaired).toContain("name: broken-skill")
    expect(repaired).not.toContain("name: [broken")
  })

  test("rewrites frontmatterless skills during Pi sync", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-frontmatterless-"))
    const sourceSkillDir = path.join(tempRoot, "claude-skill-frontmatterless")
    await fs.mkdir(sourceSkillDir, { recursive: true })
    await fs.writeFile(
      path.join(sourceSkillDir, "SKILL.md"),
      [
        "# Personal skill",
        "",
        "- Task compound-engineering:research:repo-research-analyst(feature_description)",
      ].join("\n"),
    )

    const config: ClaudeHomeConfig = {
      skills: [
        {
          name: "frontmatterless-skill",
          sourceDir: sourceSkillDir,
          skillPath: path.join(sourceSkillDir, "SKILL.md"),
        },
      ],
      mcpServers: {},
    }

    await syncToPi(config, tempRoot)

    const copiedSkill = await fs.readFile(path.join(tempRoot, "skills", "frontmatterless-skill", "SKILL.md"), "utf8")
    expect(copiedSkill).toContain("Run ce_subagent with agent=\"repo-research-analyst\" and task=\"feature_description\".")
    expect(copiedSkill).not.toContain("name:")
  })

  test("does not create another backup when frontmatterless skill output is already converged", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-frontmatterless-stable-"))
    const sourceSkillDir = path.join(tempRoot, "claude-skill-frontmatterless")
    await fs.mkdir(sourceSkillDir, { recursive: true })
    await fs.writeFile(
      path.join(sourceSkillDir, "SKILL.md"),
      [
        "# Personal skill",
        "",
        "- Task compound-engineering:research:repo-research-analyst(feature_description)",
      ].join("\n"),
    )

    const config: ClaudeHomeConfig = {
      skills: [
        {
          name: "frontmatterless-skill",
          sourceDir: sourceSkillDir,
          skillPath: path.join(sourceSkillDir, "SKILL.md"),
        },
      ],
      mcpServers: {},
    }

    await syncToPi(config, tempRoot)
    const skillsDir = path.join(tempRoot, "skills")
    const before = await fs.readdir(skillsDir)

    await syncToPi(config, tempRoot)
    const after = await fs.readdir(skillsDir)

    expect(before.filter((entry) => entry.startsWith("frontmatterless-skill.bak."))).toHaveLength(0)
    expect(after.filter((entry) => entry.startsWith("frontmatterless-skill.bak."))).toHaveLength(0)
  })

  test("keeps a previously invalid materialized skill materialized when it becomes Pi-compatible without forcing a backup", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-invalid-recovery-"))
    const sourceSkillDir = path.join(tempRoot, "claude-skill")
    const syncedSkillPath = path.join(tempRoot, "skills", "frontmatterless-skill")
    const skillPath = path.join(sourceSkillDir, "SKILL.md")

    await fs.mkdir(sourceSkillDir, { recursive: true })
    await fs.writeFile(
      skillPath,
      [
        "# Personal skill",
        "",
        "- Task compound-engineering:research:repo-research-analyst(feature_description)",
      ].join("\n"),
    )

    const config: ClaudeHomeConfig = {
      skills: [
        {
          name: "frontmatterless-skill",
          sourceDir: sourceSkillDir,
          skillPath,
        },
      ],
      mcpServers: {},
    }

    await syncToPi(config, tempRoot)
    expect((await fs.lstat(syncedSkillPath)).isSymbolicLink()).toBe(false)

    await fs.writeFile(
      skillPath,
      [
        "---",
        "name: frontmatterless-skill",
        "description: Recovered skill",
        "---",
        "",
        "No Pi rewrite needed.",
      ].join("\n"),
    )

    await syncToPi(config, tempRoot)

    const syncedStat = await fs.lstat(syncedSkillPath)
    expect(syncedStat.isDirectory()).toBe(true)

    const liveSkill = await fs.readFile(path.join(syncedSkillPath, "SKILL.md"), "utf8")
    expect(liveSkill).toContain("Recovered skill")
    expect(liveSkill).not.toContain("Run ce_subagent")

    const files = await fs.readdir(path.join(tempRoot, "skills"))
    const backupDirName = files.find((file) => file.startsWith("frontmatterless-skill.bak."))
    expect(backupDirName).toBeUndefined()
  })

  test("resolves /skill: refs to deduped targets when personal skill names collide", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-skill-collision-"))
    const skillDirHyphen = path.join(tempRoot, "generate-command")
    const skillDirUnderscore = path.join(tempRoot, "generate_command")

    await fs.mkdir(skillDirHyphen, { recursive: true })
    await fs.writeFile(
      path.join(skillDirHyphen, "SKILL.md"),
      [
        "---",
        "name: generate-command",
        "description: Hyphen skill",
        "---",
        "",
        "# Hyphen skill",
        "",
        "Then run /skill:generate_command for the other one.",
      ].join("\n"),
    )

    await fs.mkdir(skillDirUnderscore, { recursive: true })
    await fs.writeFile(
      path.join(skillDirUnderscore, "SKILL.md"),
      [
        "---",
        "name: generate_command",
        "description: Underscore skill",
        "---",
        "",
        "# Underscore skill",
      ].join("\n"),
    )

    const config: ClaudeHomeConfig = {
      skills: [
        {
          name: "generate_command",
          sourceDir: skillDirUnderscore,
          skillPath: path.join(skillDirUnderscore, "SKILL.md"),
        },
        {
          name: "generate-command",
          sourceDir: skillDirHyphen,
          skillPath: path.join(skillDirHyphen, "SKILL.md"),
        },
      ],
      mcpServers: {},
    }

    await syncToPi(config, tempRoot)

    // After codepoint sorting: generate-command (0x2D) < generate_command (0x5F)
    // generate-command gets base name, generate_command gets -2
    const baseSkill = await fs.readFile(path.join(tempRoot, "skills", "generate-command", "SKILL.md"), "utf8")
    expect(baseSkill).toContain("/skill:generate-command-2")

    const suffixedSkill = await fs.readFile(path.join(tempRoot, "skills", "generate-command-2", "SKILL.md"), "utf8")
    expect(suffixedSkill).toContain("name: generate-command-2")
  })

  test("resolves Task refs to deduped skill targets when personal skill names collide", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-task-skill-collision-"))
    const skillDirHyphen = path.join(tempRoot, "generate-command")
    const skillDirUnderscore = path.join(tempRoot, "generate_command")

    await fs.mkdir(skillDirHyphen, { recursive: true })
    await fs.writeFile(
      path.join(skillDirHyphen, "SKILL.md"),
      [
        "---",
        "name: generate-command",
        "description: Hyphen skill",
        "---",
        "",
        "# Hyphen skill",
        "",
        "Task generate_command(create command)",
      ].join("\n"),
    )

    await fs.mkdir(skillDirUnderscore, { recursive: true })
    await fs.writeFile(
      path.join(skillDirUnderscore, "SKILL.md"),
      [
        "---",
        "name: generate_command",
        "description: Underscore skill",
        "---",
        "",
        "# Underscore skill",
      ].join("\n"),
    )

    const config: ClaudeHomeConfig = {
      skills: [
        {
          name: "generate_command",
          sourceDir: skillDirUnderscore,
          skillPath: path.join(skillDirUnderscore, "SKILL.md"),
        },
        {
          name: "generate-command",
          sourceDir: skillDirHyphen,
          skillPath: path.join(skillDirHyphen, "SKILL.md"),
        },
      ],
      mcpServers: {},
    }

    await syncToPi(config, tempRoot)

    const baseSkill = await fs.readFile(path.join(tempRoot, "skills", "generate-command", "SKILL.md"), "utf8")
    expect(baseSkill).toContain('Run ce_subagent with agent="generate-command-2" and task="create command".')
  })

  test("rewritten synced skill prompt refs match emitted prompt filenames when command names collide", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-prompt-collision-"))
    const sourceSkillDir = path.join(tempRoot, "claude-skill")

    await fs.mkdir(sourceSkillDir, { recursive: true })
    await fs.writeFile(
      path.join(sourceSkillDir, "SKILL.md"),
      [
        "---",
        "name: docs-skill",
        "description: Docs skill",
        "---",
        "",
        "# Docs skill",
        "",
        "Run /prompts:plan_review after this.",
      ].join("\n"),
    )

    const config: ClaudeHomeConfig = {
      skills: [
        {
          name: "docs-skill",
          sourceDir: sourceSkillDir,
          skillPath: path.join(sourceSkillDir, "SKILL.md"),
        },
      ],
      commands: [
        {
          name: "plan-review",
          description: "First review",
          body: "First body",
          sourcePath: path.join(tempRoot, "commands", "plan-review.md"),
        },
        {
          name: "plan_review",
          description: "Second review",
          body: "Second body",
          sourcePath: path.join(tempRoot, "commands", "plan_review.md"),
        },
      ],
      mcpServers: {},
    }

    await syncToPi(config, tempRoot)

    const syncedSkill = await fs.readFile(path.join(tempRoot, "skills", "docs-skill", "SKILL.md"), "utf8")
    expect(syncedSkill).toContain("/plan-review-2")

    const promptNames = (await fs.readdir(path.join(tempRoot, "prompts"))).sort()
    expect(promptNames).toEqual(["plan-review-2.md", "plan-review.md"])
  })

  test("writes compat extension when skills-only config has Task calls", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-skills-only-compat-"))
    const sourceSkillDir = path.join(tempRoot, "claude-skill")
    await fs.mkdir(sourceSkillDir, { recursive: true })
    await fs.writeFile(
      path.join(sourceSkillDir, "SKILL.md"),
      [
        "---",
        "name: ce-plan",
        "description: Plan workflow",
        "---",
        "",
        "# Plan",
        "",
        "- Task compound-engineering:research:repo-research-analyst(feature_description)",
      ].join("\n"),
    )

    const config: ClaudeHomeConfig = {
      skills: [
        {
          name: "ce-plan",
          sourceDir: sourceSkillDir,
          skillPath: path.join(sourceSkillDir, "SKILL.md"),
        },
      ],
      mcpServers: {},
    }

    await syncToPi(config, tempRoot)

    const compatPath = path.join(tempRoot, "extensions", "compound-engineering-compat.ts")
    const compatContent = await fs.readFile(compatPath, "utf8")
    expect(compatContent).toContain('name: "ce_subagent"')
  })

  test("writes the managed AGENTS block during sync publication", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-agents-block-"))

    await syncToPi({
      skills: [],
      commands: [
        {
          name: "plan-review",
          description: "Personal review",
          body: "Review body",
          sourcePath: path.join(tempRoot, "commands", "plan-review.md"),
        },
      ],
      mcpServers: {},
    }, tempRoot)

    const agentsPath = path.join(tempRoot, "AGENTS.md")
    const agentsContent = await fs.readFile(agentsPath, "utf8")
    expect(agentsContent).toContain("BEGIN COMPOUND PI TOOL MAP")
    expect(agentsContent).toContain("ce_subagent")
    expect(agentsContent).toContain("compound-engineering/mcporter.json (project sync)")
  })

  test("copies symlinked file assets when Pi sync materializes a skill", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-symlink-asset-"))
    const sourceSkillDir = path.join(tempRoot, "claude-skill")
    const sharedAssetPath = path.join(sourceSkillDir, "shared.txt")

    await fs.mkdir(sourceSkillDir, { recursive: true })
    await fs.writeFile(sharedAssetPath, "shared asset\n")
    await fs.symlink(sharedAssetPath, path.join(sourceSkillDir, "asset.txt"))
    await fs.writeFile(
      path.join(sourceSkillDir, "SKILL.md"),
      [
        "---",
        "name: ce-plan",
        "description: Plan workflow",
        "---",
        "",
        "# Plan",
        "",
        "- Task compound-engineering:research:repo-research-analyst(feature_description)",
      ].join("\n"),
    )

    const config: ClaudeHomeConfig = {
      skills: [
        {
          name: "ce-plan",
          sourceDir: sourceSkillDir,
          skillPath: path.join(sourceSkillDir, "SKILL.md"),
        },
      ],
      mcpServers: {},
    }

    await syncToPi(config, tempRoot)

    const copiedAsset = await fs.readFile(path.join(tempRoot, "skills", "ce-plan", "asset.txt"), "utf8")
    expect(copiedAsset).toBe("shared asset\n")
  })

  test("materializes top-level personal skills through trusted symlink entries without dropping in-boundary assets", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-entry-symlink-internal-asset-"))
    const actualSkillsRoot = path.join(tempRoot, "actual-skills")
    const linkedSkillsRoot = path.join(tempRoot, "linked-skills")
    const externalSkillDir = path.join(tempRoot, "external-skill")
    const sharedAssetPath = path.join(externalSkillDir, "shared.txt")

    await fs.mkdir(actualSkillsRoot, { recursive: true })
    await fs.mkdir(externalSkillDir, { recursive: true })
    await fs.writeFile(sharedAssetPath, "shared asset\n")
    await fs.symlink(sharedAssetPath, path.join(externalSkillDir, "asset.txt"))
    await fs.writeFile(
      path.join(externalSkillDir, "SKILL.md"),
      [
        "---",
        "name: docs-skill",
        "description: External skill",
        "---",
        "",
        "# Docs skill",
      ].join("\n"),
    )
    await fs.symlink(actualSkillsRoot, linkedSkillsRoot)
    await fs.symlink(externalSkillDir, path.join(linkedSkillsRoot, "docs-skill"))

    await syncToPi({
      skills: [
        {
          name: "docs-skill",
          entryDir: path.join(linkedSkillsRoot, "docs-skill"),
          trustedRoot: linkedSkillsRoot,
          trustedBoundary: externalSkillDir,
          sourceDir: externalSkillDir,
          skillPath: path.join(linkedSkillsRoot, "docs-skill", "SKILL.md"),
        },
      ],
      mcpServers: {},
    }, tempRoot)

    expect(await fs.readFile(path.join(tempRoot, "skills", "docs-skill", "asset.txt"), "utf8")).toBe("shared asset\n")
  })

  test("skips symlinked file assets that escape the skill root during Pi sync materialization", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-escaped-symlink-"))
    const sourceSkillDir = path.join(tempRoot, "claude-skill")
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
        "name: ce-plan",
        "description: Plan workflow",
        "---",
        "",
        "- Task compound-engineering:research:repo-research-analyst(feature_description)",
      ].join("\n"),
    )

    const config: ClaudeHomeConfig = {
      skills: [
        {
          name: "ce-plan",
          sourceDir: sourceSkillDir,
          skillPath: path.join(sourceSkillDir, "SKILL.md"),
        },
      ],
      mcpServers: {},
    }

    await syncToPi(config, tempRoot)

    await expect(fs.access(path.join(tempRoot, "skills", "ce-plan", "asset.txt"))).rejects.toBeDefined()
  })

  test("resolves installed-plugin namespaced refs during Claude-home Pi sync", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-installed-plugin-refs-"))
    const sourceSkillDir = path.join(tempRoot, "claude-skill")

    await fs.mkdir(sourceSkillDir, { recursive: true })
    await seedVerifiedInstallNameMaps(tempRoot, {
      agents: {
        "compound-engineering:research:repo-research-analyst": "repo-research-analyst",
      },
      skills: {
        "compound-engineering:ce-plan": "ce-plan",
      },
    })
    await fs.writeFile(
      path.join(sourceSkillDir, "SKILL.md"),
      [
        "---",
        "name: docs-skill",
        "description: Uses installed plugin refs",
        "---",
        "",
        "- Task compound-engineering:research:repo-research-analyst(feature_description)",
        "- /skill:compound-engineering:ce-plan",
      ].join("\n"),
    )

    const config: ClaudeHomeConfig = {
      skills: [
        {
          name: "docs-skill",
          sourceDir: sourceSkillDir,
          skillPath: path.join(sourceSkillDir, "SKILL.md"),
        },
      ],
      mcpServers: {},
    }

    await syncToPi(config, tempRoot)

    const syncedSkill = await fs.readFile(path.join(tempRoot, "skills", "docs-skill", "SKILL.md"), "utf8")
    expect(syncedSkill).toContain('Run ce_subagent with agent="repo-research-analyst" and task="feature_description".')
    expect(syncedSkill).toContain("/skill:ce-plan")
  })

  test("dedupes personal sync names against installed managed Pi targets", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-installed-name-reservations-"))
    const sourceSkillDir = path.join(tempRoot, "claude-skill")

    await fs.mkdir(sourceSkillDir, { recursive: true })
    await seedVerifiedInstallNameMaps(tempRoot, {
      agents: {
        "compound-engineering:research:repo-research-analyst": "repo-research-analyst",
      },
      skills: {
        "compound-engineering:ce:plan": "ce-plan",
      },
      prompts: {
        "compound-engineering:plan-review": "plan-review",
      },
    })
    await fs.writeFile(
      path.join(sourceSkillDir, "SKILL.md"),
      [
        "---",
        "name: ce:plan",
        "description: Local personal plan skill",
        "---",
        "",
        "# Plan",
      ].join("\n"),
    )

    const config: ClaudeHomeConfig = {
      skills: [
        {
          name: "ce:plan",
          sourceDir: sourceSkillDir,
          skillPath: path.join(sourceSkillDir, "SKILL.md"),
        },
      ],
      commands: [
        {
          name: "plan-review",
          description: "Local personal plan review",
          body: "Local review body",
          sourcePath: path.join(tempRoot, "commands", "plan-review.md"),
        },
      ],
      mcpServers: {},
    }

    await syncToPi(config, tempRoot)

    expect(await fs.readFile(path.join(tempRoot, "skills", "ce-plan-2", "SKILL.md"), "utf8")).toContain("name: ce-plan-2")
    expect(await fs.readFile(path.join(tempRoot, "prompts", "plan-review-2.md"), "utf8")).toContain("Local review body")
    await expect(fs.access(path.join(tempRoot, "skills", "ce-plan", "SKILL.md"))).rejects.toBeDefined()
    await expect(fs.access(path.join(tempRoot, "prompts", "plan-review.md"))).rejects.toBeDefined()
  })

  test("preserves unknown qualified /skill refs during Claude-home Pi sync", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-preserve-qualified-refs-"))
    const sourceSkillDir = path.join(tempRoot, "claude-skill")

    await fs.mkdir(sourceSkillDir, { recursive: true })
    await fs.writeFile(
      path.join(sourceSkillDir, "SKILL.md"),
      [
        "---",
        "name: docs-skill",
        "description: Keeps unresolved refs literal",
        "---",
        "",
        "- /skill:unknown-plugin:ce-plan",
      ].join("\n"),
    )

    const config: ClaudeHomeConfig = {
      skills: [
        {
          name: "docs-skill",
          sourceDir: sourceSkillDir,
          skillPath: path.join(sourceSkillDir, "SKILL.md"),
        },
      ],
      mcpServers: {},
    }

    await syncToPi(config, tempRoot)

    const syncedSkill = await fs.readFile(path.join(tempRoot, "skills", "docs-skill", "SKILL.md"), "utf8")
    expect(syncedSkill).toContain("/skill:unknown-plugin:ce-plan")
  })

  test("does not let unverified install state reserve sync names", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-unverified-install-reservation-"))
    const sourceSkillDir = path.join(tempRoot, "claude-skill")
    const projectManagedDir = path.join(tempRoot, "compound-engineering")

    await fs.mkdir(sourceSkillDir, { recursive: true })
    await fs.mkdir(projectManagedDir, { recursive: true })
    await fs.writeFile(
      path.join(projectManagedDir, "compound-engineering-managed.json"),
      JSON.stringify({
        version: 1,
        install: {
          nameMaps: {
            skills: {
              "compound-engineering:ce-plan": "ce-plan",
              "claude-home:docs-skill": "docs-skill",
            },
            prompts: {
              "compound-engineering:plan-review": "plan-review",
              "claude-home:plan-review": "plan-review",
            },
          },
        },
      }, null, 2),
    )
    await fs.writeFile(
      path.join(sourceSkillDir, "SKILL.md"),
      [
        "---",
        "name: docs-skill",
        "description: Local skill should keep stable unsuffixed name",
        "---",
        "",
        "# Docs skill",
      ].join("\n"),
    )

    await syncToPi({
      skills: [
        {
          name: "docs-skill",
          sourceDir: sourceSkillDir,
          skillPath: path.join(sourceSkillDir, "SKILL.md"),
        },
      ],
      commands: [
        {
          name: "plan-review",
          description: "Local prompt should keep stable unsuffixed name",
          body: "Local review body",
          sourcePath: path.join(tempRoot, "commands", "plan-review.md"),
        },
      ],
      mcpServers: {},
    }, tempRoot)

    expect(await fs.readFile(path.join(tempRoot, "skills", "docs-skill", "SKILL.md"), "utf8")).toContain("name: docs-skill")
    expect(await fs.readFile(path.join(tempRoot, "prompts", "plan-review.md"), "utf8")).toContain("Local review body")
    await expect(fs.access(path.join(tempRoot, "skills", "docs-skill-2", "SKILL.md"))).rejects.toBeDefined()
    await expect(fs.access(path.join(tempRoot, "prompts", "plan-review-2.md"))).rejects.toBeDefined()
  })

  test("does not let unverified sync state reserve sync names", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-unverified-sync-reservation-"))
    const sourceSkillDir = path.join(tempRoot, "claude-skill")
    const projectManagedDir = path.join(tempRoot, "compound-engineering")

    await fs.mkdir(sourceSkillDir, { recursive: true })
    await fs.mkdir(projectManagedDir, { recursive: true })
    await fs.writeFile(
      path.join(projectManagedDir, "compound-engineering-managed.json"),
      JSON.stringify({
        version: 1,
        sync: {
          nameMaps: {
            skills: {
              "claude-home:docs-skill": "docs-skill",
            },
            prompts: {
              "claude-home:plan-review": "plan-review",
            },
          },
        },
      }, null, 2),
    )
    await fs.writeFile(
      path.join(sourceSkillDir, "SKILL.md"),
      [
        "---",
        "name: docs-skill",
        "description: Local skill should keep stable unsuffixed name",
        "---",
        "",
        "# Docs skill",
      ].join("\n"),
    )

    await syncToPi({
      skills: [
        {
          name: "docs-skill",
          sourceDir: sourceSkillDir,
          skillPath: path.join(sourceSkillDir, "SKILL.md"),
        },
      ],
      commands: [
        {
          name: "plan-review",
          description: "Local prompt should keep stable unsuffixed name",
          body: "Local review body",
          sourcePath: path.join(tempRoot, "commands", "plan-review.md"),
        },
      ],
      mcpServers: {},
    }, tempRoot)

    expect(await fs.readFile(path.join(tempRoot, "skills", "docs-skill", "SKILL.md"), "utf8")).toContain("name: docs-skill")
    expect(await fs.readFile(path.join(tempRoot, "prompts", "plan-review.md"), "utf8")).toContain("Local review body")
    await expect(fs.access(path.join(tempRoot, "skills", "docs-skill-2", "SKILL.md"))).rejects.toBeDefined()
    await expect(fs.access(path.join(tempRoot, "prompts", "plan-review-2.md"))).rejects.toBeDefined()
  })

  test("records trusted top-level personal skills as managed artifacts", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-managed-materialized-only-"))
    const actualSkillsRoot = path.join(tempRoot, "actual-skills")
    const linkedSkillsRoot = path.join(tempRoot, "linked-skills")
    const externalSkillDir = path.join(tempRoot, "external-skill")
    const warnSpy = spyOn(console, "warn").mockImplementation(() => {})

    await fs.mkdir(actualSkillsRoot, { recursive: true })
    await fs.mkdir(externalSkillDir, { recursive: true })
    await fs.writeFile(
      path.join(externalSkillDir, "SKILL.md"),
      [
        "---",
        "name: docs-skill",
        "description: External skill",
        "---",
        "",
        "# External skill",
      ].join("\n"),
    )
    await fs.symlink(actualSkillsRoot, linkedSkillsRoot)
    await fs.symlink(externalSkillDir, path.join(linkedSkillsRoot, "docs-skill"))

    await syncToPi({
      skills: [
        {
          name: "docs-skill",
          entryDir: path.join(linkedSkillsRoot, "docs-skill"),
          trustedRoot: linkedSkillsRoot,
          trustedBoundary: externalSkillDir,
          sourceDir: externalSkillDir,
          skillPath: path.join(linkedSkillsRoot, "docs-skill", "SKILL.md"),
        },
      ],
      mcpServers: {},
    }, tempRoot)

    const trust = await loadPiManagedStateWithTrust(resolvePiLayout(tempRoot, "sync"))
    expect(trust.status).toBe("verified")
    expect(trust.state?.sync.artifacts.some((artifact) => artifact.sourceName === "docs-skill" && artifact.kind === "synced-skill")).toBe(true)
    expect(warnSpy).not.toHaveBeenCalled()

    warnSpy.mockRestore()
  })

  test("rejects unresolved first-party qualified prompt slash refs during Pi sync", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-qualified-prompt-slash-reject-"))
    const warnSpy = spyOn(console, "warn").mockImplementation(() => {})

    await syncToPi({
      skills: [],
      commands: [
        {
          name: "plan-review",
          description: "Contains unresolved qualified prompt ref",
          body: "Run /prompts:compound-engineering:missing-prompt next.",
          sourcePath: path.join(tempRoot, "commands", "plan-review.md"),
        },
      ],
      mcpServers: {},
    }, tempRoot)

    await expect(fs.access(path.join(resolvePiLayout(tempRoot, "sync").promptsDir, "plan-review.md"))).rejects.toBeDefined()
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Unsupported unresolved first-party qualified ref for Pi sync: compound-engineering:missing-prompt"))

    warnSpy.mockRestore()
  })

  test("does not record skipped unsafe skills in sync-managed aliases or shared resources", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-skipped-skill-state-"))
    const sourceSkillDir = path.join(tempRoot, "claude-skill")
    const warnSpy = spyOn(console, "warn").mockImplementation(() => {})

    await fs.mkdir(sourceSkillDir, { recursive: true })
    await fs.writeFile(
      path.join(sourceSkillDir, "SKILL.md"),
      [
        "---",
        "name: docs/safe",
        "description: Unsafe name should be skipped",
        "---",
      ].join("\n"),
    )

    await syncToPi({
      skills: [
        {
          name: "docs/safe",
          sourceDir: sourceSkillDir,
          skillPath: path.join(sourceSkillDir, "SKILL.md"),
        },
      ],
      mcpServers: {},
    }, tempRoot)

    const trust = await loadPiManagedStateWithTrust(resolvePiLayout(tempRoot, "sync"))
    expect(trust.status).toBe("missing")
    expect(trust.state).toBeNull()
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Skipping skill with unsafe name"))
    await expect(fs.access(path.join(tempRoot, "skills", "docs-safe", "SKILL.md"))).rejects.toBeDefined()

    warnSpy.mockRestore()
  })

  test("prunes stale skipped-skill aliases from prior sync state on rerun", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-prune-stale-skipped-state-"))
    const layout = resolvePiLayout(tempRoot, "sync")
    const stateHome = path.join(tempRoot, "state-home")
    const warnSpy = spyOn(console, "warn").mockImplementation(() => {})
    process.env.COMPOUND_ENGINEERING_HOME = stateHome

    const seededState = replacePiManagedSection(null, "sync", createPiManagedSection({
      nameMaps: {
        skills: {
          "claude-home:docs/safe": "docs-safe",
        },
      },
      artifacts: [createManagedArtifact(layout, "synced-skill", "docs/safe", "docs-safe")],
      sharedResources: { compatExtension: true },
    }), "compound-engineering")
    await writePiManagedState(layout, seededState, { install: false, sync: true })

    const sourceSkillDir = path.join(tempRoot, "claude-skill")
    await fs.mkdir(sourceSkillDir, { recursive: true })
    await fs.writeFile(path.join(sourceSkillDir, "SKILL.md"), "---\nname: docs/safe\n---\n")

    await syncToPi({
      skills: [
        {
          name: "docs/safe",
          sourceDir: sourceSkillDir,
          skillPath: path.join(sourceSkillDir, "SKILL.md"),
        },
      ],
      mcpServers: {},
    }, tempRoot)

    const trust = await loadPiManagedStateWithTrust(layout)
    expect(trust.status).toBe("missing")
    expect(trust.state).toBeNull()
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Skipping skill with unsafe name"))

    warnSpy.mockRestore()
    delete process.env.COMPOUND_ENGINEERING_HOME
  })

  test("rewrites claude-home qualified refs from verified global sync aliases when the nearest project manifest lacks sync-scoped state", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-unverified-local-ce-"))
    const sourceSkillDir = path.join(tempRoot, "claude-skill")
    const stateHome = path.join(tempRoot, "state-home")
    const fakeHome = path.join(tempRoot, "home")
    const globalPiRoot = path.join(fakeHome, ".pi", "agent")
    const originalHome = process.env.HOME
    process.env.COMPOUND_ENGINEERING_HOME = stateHome
    process.env.HOME = fakeHome

    await fs.mkdir(sourceSkillDir, { recursive: true })
    await seedVerifiedSyncNameMaps(globalPiRoot, {
      skills: {
        "claude-home:ce-plan": "ce-plan-global",
      },
    })

    const projectManagedDir = path.join(tempRoot, "compound-engineering")
    await fs.mkdir(projectManagedDir, { recursive: true })
    await fs.writeFile(
      path.join(projectManagedDir, "compound-engineering-managed.json"),
      JSON.stringify({
        version: 1,
        install: {
          nameMaps: {
            skills: {
              "compound-engineering:ce-plan": "ce-plan-local",
            },
          },
        },
      }, null, 2),
    )

    await fs.writeFile(
      path.join(sourceSkillDir, "SKILL.md"),
      [
        "---",
        "name: docs-skill",
        "description: Allows verified global claude-home refs when local sync state is absent",
        "---",
        "",
        "- /skill:claude-home:ce-plan",
      ].join("\n"),
    )

    await syncToPi({
      skills: [
        {
          name: "docs-skill",
          sourceDir: sourceSkillDir,
          skillPath: path.join(sourceSkillDir, "SKILL.md"),
        },
      ],
      mcpServers: {},
    }, tempRoot)

    const syncedSkill = await fs.readFile(path.join(tempRoot, "skills", "docs-skill", "SKILL.md"), "utf8")
    expect(syncedSkill).toContain("/skill:ce-plan-global")
    expect(syncedSkill).not.toContain("/skill:claude-home-ce-plan")

    delete process.env.COMPOUND_ENGINEERING_HOME
    if (originalHome === undefined) {
      delete process.env.HOME
    } else {
      process.env.HOME = originalHome
    }
  })

  test("rewrites compound-engineering qualified refs from verified global install aliases during Pi sync", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-global-install-ref-rewrite-"))
    const sourceSkillDir = path.join(tempRoot, "claude-skill")
    const stateHome = path.join(tempRoot, "state-home")
    const fakeHome = path.join(tempRoot, "home")
    const globalPiRoot = path.join(fakeHome, ".pi", "agent")
    const originalHome = process.env.HOME
    process.env.COMPOUND_ENGINEERING_HOME = stateHome
    process.env.HOME = fakeHome

    await fs.mkdir(sourceSkillDir, { recursive: true })
    await seedVerifiedInstallNameMaps(globalPiRoot, {
      skills: {
        "compound-engineering:ce-plan": "ce-plan-global",
      },
    })
    await fs.writeFile(
      path.join(sourceSkillDir, "SKILL.md"),
      [
        "---",
        "name: docs-skill",
        "description: Keeps verified global CE refs visible",
        "---",
        "",
        "- /skill:compound-engineering:ce-plan",
        "- Task compound-engineering:ce-plan(feature_description)",
      ].join("\n"),
    )

    await syncToPi({
      skills: [
        {
          name: "docs-skill",
          sourceDir: sourceSkillDir,
          skillPath: path.join(sourceSkillDir, "SKILL.md"),
        },
      ],
      mcpServers: {},
    }, tempRoot)

    const syncedSkill = await fs.readFile(path.join(tempRoot, "skills", "docs-skill", "SKILL.md"), "utf8")
    expect(syncedSkill).toContain("/skill:ce-plan-global")
    expect(syncedSkill).toContain('Run ce_subagent with agent="ce-plan-global" and task="feature_description".')

    delete process.env.COMPOUND_ENGINEERING_HOME
    if (originalHome === undefined) {
      delete process.env.HOME
    } else {
      process.env.HOME = originalHome
    }
  })

  test("rewrites compound-engineering qualified refs from verified project-local install aliases during Pi sync", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-local-install-ref-rewrite-"))
    const sourceSkillDir = path.join(tempRoot, "claude-skill")
    const stateHome = path.join(tempRoot, "state-home")
    process.env.COMPOUND_ENGINEERING_HOME = stateHome

    await fs.mkdir(sourceSkillDir, { recursive: true })
    await seedVerifiedProjectInstallNameMaps(tempRoot, {
      skills: {
        "compound-engineering:ce-plan": "ce-plan-local-install",
      },
    })
    await fs.writeFile(
      path.join(sourceSkillDir, "SKILL.md"),
      [
        "---",
        "name: docs-skill",
        "description: Keeps verified local CE refs visible",
        "---",
        "",
        "- /skill:compound-engineering:ce-plan",
        "- Task compound-engineering:ce-plan(feature_description)",
      ].join("\n"),
    )

    await syncToPi({
      skills: [
        {
          name: "docs-skill",
          sourceDir: sourceSkillDir,
          skillPath: path.join(sourceSkillDir, "SKILL.md"),
        },
      ],
      mcpServers: {},
    }, tempRoot)

    const syncedSkill = await fs.readFile(path.join(tempRoot, "skills", "docs-skill", "SKILL.md"), "utf8")
    expect(syncedSkill).toContain("/skill:ce-plan-local-install")
    expect(syncedSkill).toContain('Run ce_subagent with agent="ce-plan-local-install" and task="feature_description".')

    delete process.env.COMPOUND_ENGINEERING_HOME
  })

  test("reserves verified global sync emitted names before allocating local Claude-home names", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-global-name-reservation-"))
    const sourceSkillDir = path.join(tempRoot, "claude-skill")
    const stateHome = path.join(tempRoot, "state-home")
    const fakeHome = path.join(tempRoot, "home")
    const globalPiRoot = path.join(fakeHome, ".pi", "agent")
    const originalHome = process.env.HOME
    process.env.COMPOUND_ENGINEERING_HOME = stateHome
    process.env.HOME = fakeHome

    await fs.mkdir(sourceSkillDir, { recursive: true })
    await seedVerifiedSyncNameMaps(globalPiRoot, {
      skills: {
        "claude-home:ce-plan": "ce-plan",
      },
    })
    await fs.writeFile(
      path.join(sourceSkillDir, "SKILL.md"),
      [
        "---",
        "name: docs-skill",
        "description: Keeps global names reserved",
        "---",
        "",
        "- /skill:claude-home:ce-plan",
      ].join("\n"),
    )

    await syncToPi({
      skills: [
        {
          name: "ce-plan",
          sourceDir: sourceSkillDir,
          skillPath: path.join(sourceSkillDir, "SKILL.md"),
        },
        {
          name: "docs-skill",
          sourceDir: sourceSkillDir,
          skillPath: path.join(sourceSkillDir, "SKILL.md"),
        },
      ],
      mcpServers: {},
    }, tempRoot)

    expect(await fs.lstat(path.join(tempRoot, "skills", "ce-plan-2"))).toBeDefined()
    const syncedSkill = await fs.readFile(path.join(tempRoot, "skills", "docs-skill", "SKILL.md"), "utf8")
    expect(syncedSkill).toContain("/skill:ce-plan")

    delete process.env.COMPOUND_ENGINEERING_HOME
    if (originalHome === undefined) {
      delete process.env.HOME
    } else {
      process.env.HOME = originalHome
    }
  })

  test("reserves verified global install emitted names before allocating local Pi names", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-global-install-name-reservation-"))
    const sourceSkillDir = path.join(tempRoot, "claude-skill")
    const stateHome = path.join(tempRoot, "state-home")
    const fakeHome = path.join(tempRoot, "home")
    const globalPiRoot = path.join(fakeHome, ".pi", "agent")
    const originalHome = process.env.HOME
    process.env.COMPOUND_ENGINEERING_HOME = stateHome
    process.env.HOME = fakeHome

    await fs.mkdir(sourceSkillDir, { recursive: true })
    await seedVerifiedInstallNameMaps(globalPiRoot, {
      skills: {
        "compound-engineering:ce-plan": "ce-plan",
      },
    })
    await fs.writeFile(
      path.join(sourceSkillDir, "SKILL.md"),
      [
        "---",
        "name: docs-skill",
        "description: Keeps global install names reserved",
        "---",
        "",
        "- /skill:compound-engineering:ce-plan",
      ].join("\n"),
    )

    await syncToPi({
      skills: [
        {
          name: "ce-plan",
          sourceDir: sourceSkillDir,
          skillPath: path.join(sourceSkillDir, "SKILL.md"),
        },
        {
          name: "docs-skill",
          sourceDir: sourceSkillDir,
          skillPath: path.join(sourceSkillDir, "SKILL.md"),
        },
      ],
      mcpServers: {},
    }, tempRoot)

    expect(await fs.lstat(path.join(tempRoot, "skills", "ce-plan-2"))).toBeDefined()
    const syncedSkill = await fs.readFile(path.join(tempRoot, "skills", "docs-skill", "SKILL.md"), "utf8")
    expect(syncedSkill).toContain("/skill:ce-plan")

    delete process.env.COMPOUND_ENGINEERING_HOME
    if (originalHome === undefined) {
      delete process.env.HOME
    } else {
      process.env.HOME = originalHome
    }
  })

  test("reserves verified project-local install emitted names before allocating local Pi names", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-local-install-name-reservation-"))
    const sourceSkillDir = path.join(tempRoot, "claude-skill")
    const stateHome = path.join(tempRoot, "state-home")
    process.env.COMPOUND_ENGINEERING_HOME = stateHome

    await fs.mkdir(sourceSkillDir, { recursive: true })
    await seedVerifiedProjectInstallNameMaps(tempRoot, {
      skills: {
        "compound-engineering:ce-plan": "ce-plan",
      },
    })
    await fs.writeFile(
      path.join(sourceSkillDir, "SKILL.md"),
      [
        "---",
        "name: docs-skill",
        "description: Keeps local install names reserved",
        "---",
        "",
        "- /skill:compound-engineering:ce-plan",
      ].join("\n"),
    )

    await syncToPi({
      skills: [
        {
          name: "ce-plan",
          sourceDir: sourceSkillDir,
          skillPath: path.join(sourceSkillDir, "SKILL.md"),
        },
        {
          name: "docs-skill",
          sourceDir: sourceSkillDir,
          skillPath: path.join(sourceSkillDir, "SKILL.md"),
        },
      ],
      mcpServers: {},
    }, tempRoot)

    expect(await fs.lstat(path.join(tempRoot, "skills", "ce-plan-2"))).toBeDefined()
    const syncedSkill = await fs.readFile(path.join(tempRoot, "skills", "docs-skill", "SKILL.md"), "utf8")
    expect(syncedSkill).toContain("/skill:ce-plan")

    delete process.env.COMPOUND_ENGINEERING_HOME
  })

  test("compat runtime prefers verified nested install aliases over verified direct-root legacy install aliases", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-runtime-nested-install-precedence-"))
    const stateHome = path.join(tempRoot, "state-home")
    const projectRoot = path.join(tempRoot, "project")
    const nestedCwd = path.join(projectRoot, "nested", "cwd")
    process.env.COMPOUND_ENGINEERING_HOME = stateHome

    await fs.mkdir(nestedCwd, { recursive: true })
    await seedVerifiedProjectInstallNameMaps(projectRoot, {
      skills: {
        "compound-engineering:ce-plan": "ce-plan-nested",
      },
    })
    await seedVerifiedInstallNameMaps(projectRoot, {
      skills: {
        "compound-engineering:ce-plan": "ce-plan-direct-root",
      },
    })

    const { resolveAgentName } = await loadCompatHelpers(projectRoot)
    expect(resolveAgentName(nestedCwd, "compound-engineering:ce-plan")).toBe("ce-plan-nested")

    delete process.env.COMPOUND_ENGINEERING_HOME
  })

  test("sync and runtime fall back to an independently verified direct-root install layer when nested install is invalid", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-direct-root-install-fallback-"))
    const stateHome = path.join(tempRoot, "state-home")
    const projectRoot = path.join(tempRoot, "project")
    const nestedCwd = path.join(projectRoot, "nested", "cwd")
    const sourceSkillDir = path.join(tempRoot, "claude-skill")
    process.env.COMPOUND_ENGINEERING_HOME = stateHome

    await fs.mkdir(nestedCwd, { recursive: true })
    await fs.mkdir(sourceSkillDir, { recursive: true })
    await seedVerifiedInstallNameMaps(projectRoot, {
      skills: {
        "compound-engineering:ce-plan": "ce-plan-direct-root",
      },
    })
    const nestedInstallLayout = resolvePiLayout(projectRoot, "install")
    await fs.mkdir(path.dirname(nestedInstallLayout.managedManifestPath), { recursive: true })
    await fs.writeFile(nestedInstallLayout.managedManifestPath, "{ invalid json\n")

    await fs.writeFile(
      path.join(sourceSkillDir, "SKILL.md"),
      [
        "---",
        "name: docs-skill",
        "description: falls back to verified direct-root install alias",
        "---",
        "",
        "- /skill:compound-engineering:ce-plan",
      ].join("\n"),
    )

    await syncToPi({
      skills: [
        {
          name: "docs-skill",
          sourceDir: sourceSkillDir,
          skillPath: path.join(sourceSkillDir, "SKILL.md"),
        },
      ],
      mcpServers: {},
    }, projectRoot)

    const syncedSkill = await fs.readFile(path.join(projectRoot, "skills", "docs-skill", "SKILL.md"), "utf8")
    expect(syncedSkill).toContain("/skill:ce-plan-direct-root")
    const { resolveAgentName } = await loadCompatHelpers(projectRoot)
    expect(resolveAgentName(nestedCwd, "compound-engineering:ce-plan")).toBe("ce-plan-direct-root")

    delete process.env.COMPOUND_ENGINEERING_HOME
  })

  test("sync rewrites unqualified skill refs against verified install precedence before global sync aliases", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-install-over-global-sync-"))
    const stateHome = path.join(tempRoot, "state-home")
    const projectRoot = path.join(tempRoot, "project")
    const sourceSkillDir = path.join(tempRoot, "claude-skill")
    process.env.COMPOUND_ENGINEERING_HOME = stateHome
    process.env.HOME = stateHome

    await fs.mkdir(sourceSkillDir, { recursive: true })
    await seedVerifiedProjectInstallNameMaps(projectRoot, {
      skills: {
        "compound-engineering:ce-plan": "ce-plan-local",
        "ce-plan": "ce-plan-local",
      },
    })
    await seedVerifiedGlobalSyncNameMaps(stateHome, {
      skills: {
        "claude-home:ce-plan": "ce-plan-global",
        "ce-plan": "ce-plan-global",
      },
    })

    await fs.writeFile(
      path.join(sourceSkillDir, "SKILL.md"),
      [
        "---",
        "name: docs-skill",
        "description: prefers local install alias for unqualified refs",
        "---",
        "",
        "- /skill:ce-plan",
      ].join("\n"),
    )

    await syncToPi({
      skills: [
        {
          name: "docs-skill",
          sourceDir: sourceSkillDir,
          skillPath: path.join(sourceSkillDir, "SKILL.md"),
        },
      ],
      mcpServers: {},
    }, projectRoot)

    const syncedSkill = await fs.readFile(path.join(projectRoot, "skills", "docs-skill", "SKILL.md"), "utf8")
    expect(syncedSkill).toContain("/skill:ce-plan-local")
    expect(syncedSkill).not.toContain("/skill:ce-plan-global")

    delete process.env.COMPOUND_ENGINEERING_HOME
    delete process.env.HOME
  })

  test("compat runtime resolves unqualified names by nearest verified precedence before raising conflicts", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-runtime-unqualified-precedence-"))
    const stateHome = path.join(tempRoot, "state-home")
    const projectRoot = path.join(tempRoot, "project")
    const nestedCwd = path.join(projectRoot, "nested", "cwd")
    process.env.COMPOUND_ENGINEERING_HOME = stateHome
    process.env.HOME = stateHome

    await fs.mkdir(nestedCwd, { recursive: true })
    await seedVerifiedProjectInstallNameMaps(projectRoot, {
      skills: {
        "compound-engineering:ce-plan": "ce-plan-local",
        "ce-plan": "ce-plan-local",
      },
    })
    await seedVerifiedInstallNameMaps(stateHome, {
      skills: {
        "compound-engineering:ce-plan": "ce-plan-global-install",
        "ce-plan": "ce-plan-global-install",
      },
    })

    const { resolveAgentName } = await loadCompatHelpers(projectRoot)
    expect(resolveAgentName(nestedCwd, "ce-plan")).toBe("ce-plan-local")

    delete process.env.COMPOUND_ENGINEERING_HOME
    delete process.env.HOME
  })

  test("compat runtime prefers project install aliases for unqualified names over same-root sync aliases", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-runtime-same-root-unqualified-precedence-"))
    const stateHome = path.join(tempRoot, "state-home")
    const projectRoot = path.join(tempRoot, "project")
    const nestedCwd = path.join(projectRoot, "nested", "cwd")
    process.env.COMPOUND_ENGINEERING_HOME = stateHome
    process.env.HOME = stateHome

    await fs.mkdir(nestedCwd, { recursive: true })
    await seedVerifiedProjectInstallNameMaps(projectRoot, {
      skills: {
        "compound-engineering:ce-plan": "ce-plan-install",
        "ce-plan": "ce-plan-install",
      },
    })
    await seedVerifiedSyncNameMaps(projectRoot, {
      skills: {
        "claude-home:ce-plan": "ce-plan-sync",
        "ce-plan": "ce-plan-sync",
      },
    })

    const { resolveAgentName } = await loadCompatHelpers(projectRoot)
    expect(resolveAgentName(nestedCwd, "ce-plan")).toBe("ce-plan-install")

    delete process.env.COMPOUND_ENGINEERING_HOME
    delete process.env.HOME
  })

  test("compat runtime ignores repo-local sibling manifests as bundled fallback candidates", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-bundled-fallback-"))
    const moduleRoot = path.join(tempRoot, "runtime-root")
    const workspaceRoot = path.join(tempRoot, "workspace")

    await fs.mkdir(path.join(moduleRoot, "pi-resources", "compound-engineering"), { recursive: true })
    await fs.mkdir(path.join(moduleRoot, "compound-engineering"), { recursive: true })
    await fs.mkdir(workspaceRoot, { recursive: true })

    await fs.writeFile(
      path.join(moduleRoot, "pi-resources", "compound-engineering", "compound-engineering-managed.json"),
      JSON.stringify({
        version: 1,
        install: {
          nameMaps: {
            skills: {
              "compound-engineering:ce-plan": "ce-plan-bundled",
            },
          },
        },
      }, null, 2),
    )
    await fs.writeFile(
      path.join(moduleRoot, "compound-engineering", "compound-engineering-managed.json"),
      JSON.stringify({
        version: 1,
        install: {
          nameMaps: {
            skills: {
              "compound-engineering:ce-plan": "ce-plan-sibling",
            },
          },
        },
      }, null, 2),
    )

    const { resolveAgentName } = await loadCompatHelpers(moduleRoot)

    expect(() => resolveAgentName(workspaceRoot, "compound-engineering:ce-plan")).toThrow("Unknown qualified subagent target")
    expect(() => resolveAgentName(moduleRoot, "compound-engineering:ce-plan")).toThrow("Unknown qualified subagent target")
  })

  test("compat runtime discovers sync layout aliases and mcporter config from nested cwd", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-runtime-sync-layout-"))
    const stateHome = path.join(tempRoot, "state-home")
    const projectRoot = path.join(tempRoot, "project")
    const nestedCwd = path.join(projectRoot, "apps", "docs")
    process.env.COMPOUND_ENGINEERING_HOME = stateHome

    await fs.mkdir(nestedCwd, { recursive: true })
    await seedVerifiedSyncNameMaps(projectRoot, {
      skills: {
        "claude-home:ce-plan": "ce-plan-sync",
      },
    }, {
      sharedResources: { mcporterConfig: true },
    })
    await fs.mkdir(path.join(projectRoot, "compound-engineering"), { recursive: true })
    await fs.writeFile(path.join(projectRoot, "compound-engineering", "mcporter.json"), JSON.stringify({ mcpServers: {} }, null, 2))

    const overridePath = path.join(tempRoot, "override-mcporter.json")
    const { resolveAgentName, resolveMcporterConfigPath } = await loadCompatHelpers(projectRoot)

    expect(resolveAgentName(nestedCwd, "claude-home:ce-plan")).toBe("ce-plan-sync")
    expect(resolveMcporterConfigPath(nestedCwd)).toBe(path.join(projectRoot, "compound-engineering", "mcporter.json"))
    expect(resolveMcporterConfigPath(nestedCwd, overridePath)).toBe(path.join(projectRoot, "compound-engineering", "mcporter.json"))

    delete process.env.COMPOUND_ENGINEERING_HOME
  })

  test("compat runtime rejects cwd escapes outside the active workspace", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-runtime-cwd-boundary-"))
    const stateHome = path.join(tempRoot, "state-home")
    const projectRoot = path.join(tempRoot, "project")
    const nestedCwd = path.join(projectRoot, "apps", "docs")
    const externalRoot = path.join(tempRoot, "external")
    process.env.COMPOUND_ENGINEERING_HOME = stateHome

    await fs.mkdir(nestedCwd, { recursive: true })
    await fs.mkdir(externalRoot, { recursive: true })

    const linkPath = path.join(projectRoot, "linked-external")
    await fs.symlink(externalRoot, linkPath)

    const { resolveTaskCwd } = await loadCompatHelpers(projectRoot)

    expect(resolveTaskCwd(projectRoot, "apps/docs")).toBe(path.join(projectRoot, "apps", "docs"))
    expect(() => resolveTaskCwd(projectRoot, "../external")).toThrow("outside the active workspace")
    expect(() => resolveTaskCwd(projectRoot, externalRoot)).toThrow("outside the active workspace")
    expect(() => resolveTaskCwd(projectRoot, "~")).toThrow("outside the active workspace")
    expect(() => resolveTaskCwd(projectRoot, "linked-external")).toThrow("outside the active workspace")

    delete process.env.COMPOUND_ENGINEERING_HOME
  })

  test("compat runtime anchors cwd checks to the authoritative workspace root, not the nested invocation dir", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-runtime-workspace-root-cwd-"))
    const stateHome = path.join(tempRoot, "state-home")
    const projectRoot = path.join(tempRoot, "project")
    const nestedCwd = path.join(projectRoot, "apps", "docs")
    const siblingDir = path.join(projectRoot, "apps", "api")
    process.env.COMPOUND_ENGINEERING_HOME = stateHome

    await fs.mkdir(nestedCwd, { recursive: true })
    await fs.mkdir(siblingDir, { recursive: true })
    await seedVerifiedSyncNameMaps(projectRoot, {}, {
      sharedResources: { compatExtension: true },
    })

    const { resolveTaskCwd } = await loadCompatHelpers(projectRoot)
    expect(resolveTaskCwd(nestedCwd, "../api")).toBe(siblingDir)
    expect(resolveTaskCwd(nestedCwd, siblingDir)).toBe(siblingDir)

    delete process.env.COMPOUND_ENGINEERING_HOME
  })

  test("compat runtime allows same-workspace sibling cwd navigation without verified project manifests", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-runtime-workspace-fallback-"))
    const nestedCwd = path.join(tempRoot, "apps", "docs")
    const siblingDir = path.join(tempRoot, "apps", "api")

    await fs.mkdir(path.join(tempRoot, ".git"), { recursive: true })
    await fs.mkdir(nestedCwd, { recursive: true })
    await fs.mkdir(siblingDir, { recursive: true })

    const { resolveTaskCwd } = await loadCompatHelpers(tempRoot)
    expect(resolveTaskCwd(nestedCwd, "../api")).toBe(siblingDir)
    expect(resolveTaskCwd(nestedCwd, siblingDir)).toBe(siblingDir)
  })

  test("compat runtime falls back to filesystem workspace detection when project trust is stale", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-runtime-stale-workspace-root-"))
    const stateHome = path.join(tempRoot, "state-home")
    const projectRoot = path.join(tempRoot, "project")
    const nestedCwd = path.join(projectRoot, "apps", "docs")
    const siblingDir = path.join(projectRoot, "apps", "api")
    process.env.COMPOUND_ENGINEERING_HOME = stateHome

    await fs.mkdir(path.join(projectRoot, ".git"), { recursive: true })
    await fs.mkdir(nestedCwd, { recursive: true })
    await fs.mkdir(siblingDir, { recursive: true })
    await seedVerifiedSyncNameMaps(projectRoot, {}, {
      sharedResources: { compatExtension: true },
    })

    const layout = resolvePiLayout(projectRoot, "sync")
    const verification = JSON.parse(await fs.readFile(layout.verificationPath, "utf8")) as any
    verification.sync.hash = "stale:hash"
    await fs.writeFile(layout.verificationPath, JSON.stringify(verification, null, 2))

    const { resolveTaskCwd } = await loadCompatHelpers(projectRoot)
    expect(resolveTaskCwd(nestedCwd, "../api")).toBe(siblingDir)

    delete process.env.COMPOUND_ENGINEERING_HOME
  })

  test("ce_subagent rejects invalid parallel cwd values before launching any tasks", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-runtime-cwd-preflight-"))
    const stateHome = path.join(tempRoot, "state-home")
    const projectRoot = path.join(tempRoot, "project")
    process.env.COMPOUND_ENGINEERING_HOME = stateHome
    await fs.mkdir(projectRoot, { recursive: true })
    await seedVerifiedProjectInstallNameMaps(projectRoot, {
      skills: {
        "compound-engineering:repo-research-analyst": "repo-research-analyst",
      },
    })

    const mod = await loadCompatHelpers(projectRoot)
    const tools = new Map<string, { execute: (...args: any[]) => any }>()
    let execCalls = 0
    mod.default({
      registerTool(tool) {
        tools.set(tool.name, tool)
      },
      async exec() {
        execCalls += 1
        return { code: 0, stdout: "ok", stderr: "" }
      },
    })

    const subagent = tools.get("ce_subagent")
    expect(subagent).toBeDefined()

    const result = await subagent!.execute(
      "tool-call-id",
        {
          tasks: [
          { agent: "compound-engineering:repo-research-analyst", task: "safe", cwd: "." },
          { agent: "compound-engineering:repo-research-analyst", task: "unsafe", cwd: "../external" },
          ],
        },
      undefined,
      undefined,
      { cwd: projectRoot },
    )

    expect(result.isError).toBe(true)
    expect(String(result.content?.[0]?.text ?? "")).toContain("outside the active workspace")
    expect(execCalls).toBe(0)

    delete process.env.COMPOUND_ENGINEERING_HOME
  })

  test("ce_list_capabilities exposes the current verified runtime capability set", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-capability-discovery-"))
    const stateHome = path.join(tempRoot, "state-home")
    const projectRoot = path.join(tempRoot, "project")
    const nestedCwd = path.join(projectRoot, "nested", "cwd")
    process.env.COMPOUND_ENGINEERING_HOME = stateHome

    await fs.mkdir(nestedCwd, { recursive: true })
    await seedVerifiedProjectInstallNameMaps(projectRoot, {
      agents: {
        "compound-engineering:ce:plan": "ce-plan",
      },
      skills: {
        "compound-engineering:repo-research-analyst": "repo-research-analyst",
      },
    })
    await seedVerifiedSyncNameMaps(projectRoot, {
      prompts: {
        "claude-home:plan-review": "plan-review",
      },
    })

    const mod = await loadCompatHelpers(projectRoot)
    const tools = new Map<string, { execute: (...args: any[]) => any }>()
    mod.default({
      registerTool(tool) {
        tools.set(tool.name, tool)
      },
      async exec() {
        return { code: 0, stdout: "ok", stderr: "" }
      },
    })

    const capabilities = tools.get("ce_list_capabilities")
    expect(capabilities).toBeDefined()

    const result = await capabilities!.execute("tool-call-id", {}, undefined, undefined, { cwd: nestedCwd })
    expect(result.isError).toBeUndefined()
    const details = result.details as {
      install: { agents: string[]; skills: string[]; prompts: string[] }
      sync: { agents: string[]; skills: string[]; prompts: string[] }
      unqualified: { agents: string[]; skills: string[]; prompts: string[] }
      shared: { mcporter: { available: boolean; source: string | null; servers: string[] } }
    }
    expect(details.install.agents).toContain("compound-engineering:ce:plan")
    expect(details.install.skills).toContain("compound-engineering:repo-research-analyst")
    expect(details.sync.prompts).toContain("claude-home:plan-review")
    expect(details.unqualified.agents).toContain("compound-engineering:ce:plan")
    expect(details.shared.mcporter).toMatchObject({ available: false, source: null, servers: [] })

    delete process.env.COMPOUND_ENGINEERING_HOME
  })

  test("ce_run_prompt executes a verified prompt alias inside the active workspace", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-run-prompt-"))
    const stateHome = path.join(tempRoot, "state-home")
    const projectRoot = path.join(tempRoot, "project")
    const nestedCwd = path.join(projectRoot, "nested", "cwd")
    process.env.COMPOUND_ENGINEERING_HOME = stateHome

    await fs.mkdir(nestedCwd, { recursive: true })
    await seedVerifiedSyncNameMaps(projectRoot, {
      prompts: {
        "claude-home:plan-review": "plan-review",
      },
    })

    const mod = await loadCompatHelpers(projectRoot)
    const tools = new Map<string, { execute: (...args: any[]) => any }>()
    const execCalls: Array<{ command: string; args: string[] }> = []
    mod.default({
      registerTool(tool) {
        tools.set(tool.name, tool)
      },
      async exec(command: string, args: string[]) {
        execCalls.push({ command, args })
        return { code: 0, stdout: "ok", stderr: "" }
      },
    })

    const runPrompt = tools.get("ce_run_prompt")
    expect(runPrompt).toBeDefined()

    const result = await runPrompt!.execute(
      "tool-call-id",
      { prompt: "claude-home:plan-review", args: "now" },
      undefined,
      undefined,
      { cwd: nestedCwd },
    )

    expect(result.isError).toBe(false)
    expect(execCalls).toHaveLength(1)
    expect(execCalls[0]?.command).toBe("bash")
    expect(execCalls[0]?.args.join(" ")).toContain("pi --no-session -p")
    expect(execCalls[0]?.args.join(" ")).toContain("/plan-review now")

    delete process.env.COMPOUND_ENGINEERING_HOME
  })

  test("ce_run_prompt resolves alias manifest signatures once per execution path when cwd is unchanged", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-run-prompt-signatures-"))
    const stateHome = path.join(tempRoot, "state-home")
    const projectRoot = path.join(tempRoot, "project")
    const nestedCwd = path.join(projectRoot, "nested", "cwd")
    process.env.COMPOUND_ENGINEERING_HOME = stateHome

    await fs.mkdir(nestedCwd, { recursive: true })
    await seedVerifiedSyncNameMaps(projectRoot, {
      prompts: {
        "claude-home:plan-review": "plan-review",
      },
    })

    const mod = await loadCompatHelpers(projectRoot)
    const tools = new Map<string, { execute: (...args: any[]) => any }>()
    const signaturePaths: string[] = []
    mod.default({
      registerTool(tool) {
        tools.set(tool.name, tool)
      },
      async exec() {
        return { code: 0, stdout: "ok", stderr: "" }
      },
    })
    mod.setAliasManifestSignatureHookForTests((filePath) => {
      signaturePaths.push(filePath)
    })

    const runPrompt = tools.get("ce_run_prompt")
    expect(runPrompt).toBeDefined()

    const result = await runPrompt!.execute(
      "tool-call-id",
      { prompt: "claude-home:plan-review" },
      undefined,
      undefined,
      { cwd: nestedCwd },
    )

    expect(result.isError).toBe(false)
    expect(signaturePaths).toHaveLength(7)

    delete process.env.COMPOUND_ENGINEERING_HOME
  })

  test("ce_run_prompt rejects unknown qualified prompt targets", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-run-prompt-reject-"))
    const stateHome = path.join(tempRoot, "state-home")
    process.env.COMPOUND_ENGINEERING_HOME = stateHome

    const mod = await loadCompatHelpers(tempRoot)
    const tools = new Map<string, { execute: (...args: any[]) => any }>()
    let execCalls = 0
    mod.default({
      registerTool(tool) {
        tools.set(tool.name, tool)
      },
      async exec() {
        execCalls += 1
        return { code: 0, stdout: "ok", stderr: "" }
      },
    })

    const runPrompt = tools.get("ce_run_prompt")
    expect(runPrompt).toBeDefined()

    const result = await runPrompt!.execute(
      "tool-call-id",
      { prompt: "unknown-plugin:plan-review" },
      undefined,
      undefined,
      { cwd: tempRoot },
    )

    expect(result.isError).toBe(true)
    expect(String(result.content?.[0]?.text ?? "")).toContain("Unknown qualified prompt target")
    expect(execCalls).toBe(0)

    delete process.env.COMPOUND_ENGINEERING_HOME
  })

  test("ce_run_prompt rejects unmanaged unqualified prompt targets", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-run-prompt-unqualified-reject-"))
    const stateHome = path.join(tempRoot, "state-home")
    process.env.COMPOUND_ENGINEERING_HOME = stateHome

    const mod = await loadCompatHelpers(tempRoot)
    const tools = new Map<string, { execute: (...args: any[]) => any }>()
    let execCalls = 0
    mod.default({
      registerTool(tool) {
        tools.set(tool.name, tool)
      },
      async exec() {
        execCalls += 1
        return { code: 0, stdout: "ok", stderr: "" }
      },
    })

    const runPrompt = tools.get("ce_run_prompt")
    expect(runPrompt).toBeDefined()

    const result = await runPrompt!.execute(
      "tool-call-id",
      { prompt: "ambient-prompt" },
      undefined,
      undefined,
      { cwd: tempRoot },
    )

    expect(result.isError).toBe(true)
    expect(String(result.content?.[0]?.text ?? "")).toContain("Unknown prompt target")
    expect(execCalls).toBe(0)

    delete process.env.COMPOUND_ENGINEERING_HOME
  })

  test("ce_subagent rejects unmanaged unqualified agent targets", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-subagent-unqualified-reject-"))
    const stateHome = path.join(tempRoot, "state-home")
    process.env.COMPOUND_ENGINEERING_HOME = stateHome

    const mod = await loadCompatHelpers(tempRoot)
    const tools = new Map<string, { execute: (...args: any[]) => any }>()
    let execCalls = 0
    mod.default({
      registerTool(tool) {
        tools.set(tool.name, tool)
      },
      async exec() {
        execCalls += 1
        return { code: 0, stdout: "ok", stderr: "" }
      },
    })

    const subagent = tools.get("ce_subagent")
    expect(subagent).toBeDefined()

    const result = await subagent!.execute(
      "tool-call-id",
      { agent: "ambient-agent", task: "do work" },
      undefined,
      undefined,
      { cwd: tempRoot },
    )

    expect(result.isError).toBe(true)
    expect(String(result.content?.[0]?.text ?? "")).toContain("Unknown subagent target")
    expect(execCalls).toBe(0)

    delete process.env.COMPOUND_ENGINEERING_HOME
  })

  test("persists the current Pi policy fingerprint in sync managed state", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-policy-fingerprint-"))
    const stateHome = path.join(tempRoot, "state-home")
    process.env.COMPOUND_ENGINEERING_HOME = stateHome

    await syncToPi({
      commands: [
        {
          name: "plan-review",
          description: "Writes sync state",
          body: "Body",
          sourcePath: path.join(tempRoot, "commands", "plan-review.md"),
        },
      ],
      skills: [],
      mcpServers: {},
    }, tempRoot)

    const trust = await loadPiManagedStateWithTrust(resolvePiLayout(tempRoot, "sync"))
    expect(trust.state?.policyFingerprint).toBe(getPiPolicyFingerprint())

    delete process.env.COMPOUND_ENGINEERING_HOME
  })

  test("treats sync managed state as stale when the policy fingerprint changes", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-policy-fingerprint-stale-"))
    const stateHome = path.join(tempRoot, "state-home")
    process.env.COMPOUND_ENGINEERING_HOME = stateHome

    setPiPolicyFingerprintForTests("policy-v1")
    await syncToPi({
      commands: [
        {
          name: "plan-review",
          description: "Writes sync state",
          body: "Body",
          sourcePath: path.join(tempRoot, "commands", "plan-review.md"),
        },
      ],
      skills: [],
      mcpServers: {},
    }, tempRoot)

    setPiPolicyFingerprintForTests("policy-v2")
    const trust = await loadPiManagedStateWithTrust(resolvePiLayout(tempRoot, "sync"))
    expect(trust.status).toBe("stale")
    expect(trust.verifiedSections.sync).toBe(false)

    delete process.env.COMPOUND_ENGINEERING_HOME
  })

  test("compat runtime stops trusting aliases after only policy trust inputs change", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-runtime-policy-stale-"))
    const stateHome = path.join(tempRoot, "state-home")
    const projectRoot = path.join(tempRoot, "project")
    const nestedCwd = path.join(projectRoot, "nested")
    process.env.COMPOUND_ENGINEERING_HOME = stateHome

    await fs.mkdir(nestedCwd, { recursive: true })
    setPiPolicyFingerprintForTests("policy-v1")
    await seedVerifiedSyncNameMaps(projectRoot, {
      skills: {
        "claude-home:ce-plan": "ce-plan-sync",
      },
    })

    process.env.COMPOUND_ENGINEERING_PI_POLICY_FINGERPRINT = "policy-v1"
    const { resolveAgentName } = await loadCompatHelpers(projectRoot)
    expect(resolveAgentName(nestedCwd, "claude-home:ce-plan")).toBe("ce-plan-sync")

    process.env.COMPOUND_ENGINEERING_PI_POLICY_FINGERPRINT = "policy-v2"
    expect(() => resolveAgentName(nestedCwd, "claude-home:ce-plan")).toThrow("Unknown qualified subagent target")

    delete process.env.COMPOUND_ENGINEERING_HOME
  })

  test("runtime alias resolution reuses one ancestor-walk path set per lookup", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-runtime-alias-walk-proof-"))
    const stateHome = path.join(tempRoot, "state-home")
    const projectRoot = path.join(tempRoot, "project")
    const nestedCwd = path.join(projectRoot, "nested", "cwd")
    process.env.COMPOUND_ENGINEERING_HOME = stateHome

    await fs.mkdir(nestedCwd, { recursive: true })
    await seedVerifiedProjectInstallNameMaps(projectRoot, {
      agents: {
        "compound-engineering:ce:plan": "ce-plan",
      },
    })

    const helpers = await loadCompatHelpers(projectRoot)
    let signatureCalls = 0
    helpers.setAliasManifestSignatureHookForTests(() => {
      signatureCalls += 1
    })

    expect(helpers.resolveAgentName(nestedCwd, "compound-engineering:ce:plan")).toBe("ce-plan")
    expect(signatureCalls).toBeLessThanOrEqual(8)

    delete process.env.COMPOUND_ENGINEERING_HOME
  })

  test("mcporter_list ignores stale direct callers that still send configPath", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-runtime-configpath-direct-caller-"))
    const stateHome = path.join(tempRoot, "state-home")
    process.env.COMPOUND_ENGINEERING_HOME = stateHome
    await fs.mkdir(tempRoot, { recursive: true })
    const warnSpy = spyOn(console, "warn").mockImplementation(() => {})

    const mod = await loadCompatHelpers(tempRoot)
    const tools = new Map<string, { execute: (...args: any[]) => any }>()
    let execCalls = 0
    mod.default({
      registerTool(tool) {
        tools.set(tool.name, tool)
      },
      async exec() {
        execCalls += 1
        return { code: 0, stdout: "ok", stderr: "" }
      },
    })

    const mcporterList = tools.get("mcporter_list")
    expect(mcporterList).toBeDefined()

    const result = await mcporterList!.execute(
      "tool-call-id",
      { server: "context7", configPath: path.join(tempRoot, "override.json") },
      undefined,
      undefined,
      { cwd: tempRoot },
    )
    expect(result.isError).toBe(false)
    expect(execCalls).toBe(1)
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("configPath is deprecated and ignored"))

    warnSpy.mockRestore()
    delete process.env.COMPOUND_ENGINEERING_HOME
  })

  test("compat runtime blocks global mcporter fallback when a nearer project config is unverified", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-runtime-unverified-mcp-fallback-"))
    const stateHome = path.join(tempRoot, "state-home")
    const fakeHome = path.join(tempRoot, "home")
    const projectRoot = path.join(tempRoot, "project")
    const nestedCwd = path.join(projectRoot, "apps", "docs")
    const originalHome = process.env.HOME
    process.env.COMPOUND_ENGINEERING_HOME = stateHome
    process.env.HOME = fakeHome

    await fs.mkdir(nestedCwd, { recursive: true })
    await fs.mkdir(path.join(projectRoot, "compound-engineering"), { recursive: true })
    await fs.writeFile(
      path.join(projectRoot, "compound-engineering", "compound-engineering-managed.json"),
      JSON.stringify({
        version: 1,
        sync: {
          sharedResources: { mcporterConfig: true },
        },
      }, null, 2),
    )
    await fs.writeFile(path.join(projectRoot, "compound-engineering", "mcporter.json"), JSON.stringify({ mcpServers: { local: {} } }, null, 2))

    const globalRoot = path.join(fakeHome, ".pi", "agent")
    const globalLayout = resolvePiLayout(globalRoot, "sync")
    await fs.mkdir(path.dirname(globalLayout.mcporterConfigPath), { recursive: true })
    await fs.writeFile(globalLayout.mcporterConfigPath, JSON.stringify({ mcpServers: { global: {} } }, null, 2))
    await writePiManagedState(
      globalLayout,
      replacePiManagedSection(null, "sync", createPiManagedSection({
        nameMaps: {},
        sharedResources: { mcporterConfig: true },
      }), "compound-engineering"),
      { install: false, sync: true },
    )

    const { resolveMcporterConfigPath } = await loadCompatHelpers(projectRoot)
    expect(resolveMcporterConfigPath(nestedCwd)).toBeUndefined()

    delete process.env.COMPOUND_ENGINEERING_HOME
    if (originalHome === undefined) {
      delete process.env.HOME
    } else {
      process.env.HOME = originalHome
    }
  })

  test("compat runtime resolves install and sync namespaces from different project layouts at the same root", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-runtime-dual-layout-"))
    const stateHome = path.join(tempRoot, "state-home")
    const projectRoot = path.join(tempRoot, "project")
    const nestedCwd = path.join(projectRoot, "nested", "cwd")
    process.env.COMPOUND_ENGINEERING_HOME = stateHome

    await fs.mkdir(nestedCwd, { recursive: true })
    await seedVerifiedProjectInstallNameMaps(projectRoot, {
      skills: {
        "compound-engineering:ce-plan": "ce-plan-install",
      },
    })
    await seedVerifiedSyncNameMaps(projectRoot, {
      skills: {
        "claude-home:ce-plan": "ce-plan-sync",
      },
    }, {
      sharedResources: { mcporterConfig: true },
    })
    await fs.mkdir(path.join(projectRoot, ".pi", "compound-engineering"), { recursive: true })
    await fs.writeFile(path.join(projectRoot, ".pi", "compound-engineering", "mcporter.json"), JSON.stringify({ mcpServers: { install: {} } }, null, 2))
    await fs.mkdir(path.join(projectRoot, "compound-engineering"), { recursive: true })
    await fs.writeFile(path.join(projectRoot, "compound-engineering", "mcporter.json"), JSON.stringify({ mcpServers: { sync: {} } }, null, 2))

    const { resolveAgentName, resolveMcporterConfigPath } = await loadCompatHelpers(projectRoot)

    expect(resolveAgentName(nestedCwd, "compound-engineering:ce-plan")).toBe("ce-plan-install")
    expect(resolveAgentName(nestedCwd, "claude-home:ce-plan")).toBe("ce-plan-sync")
    expect(resolveMcporterConfigPath(nestedCwd)).toBe(path.join(projectRoot, "compound-engineering", "mcporter.json"))

    delete process.env.COMPOUND_ENGINEERING_HOME
  })

  test("compat runtime resolves verified legacy top-level name maps for both namespaces", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-runtime-legacy-top-level-"))
    const stateHome = path.join(tempRoot, "state-home")
    const projectRoot = path.join(tempRoot, "project")
    const nestedCwd = path.join(projectRoot, "nested", "cwd")
    process.env.COMPOUND_ENGINEERING_HOME = stateHome

    await fs.mkdir(nestedCwd, { recursive: true })

    const installLayout = resolvePiLayout(projectRoot, "install")
    const syncLayout = resolvePiLayout(projectRoot, "sync")
    await seedVerifiedProjectInstallNameMaps(projectRoot, {
      skills: {
        "compound-engineering:ce-plan": "ce-plan-legacy",
      },
    })
    await seedVerifiedSyncNameMaps(projectRoot, {
      skills: {
        "claude-home:ce-plan": "ce-plan-sync-legacy",
      },
    })

    await fs.writeFile(
      installLayout.managedManifestPath,
      JSON.stringify({
        version: 1,
        pluginName: "compound-engineering",
        policyFingerprint: getPiPolicyFingerprint(),
        nameMaps: {
          skills: {
            "compound-engineering:ce-plan": "ce-plan-legacy",
          },
        },
      }, null, 2),
    )
    await fs.writeFile(
      syncLayout.managedManifestPath,
      JSON.stringify({
        version: 1,
        pluginName: "compound-engineering",
        policyFingerprint: getPiPolicyFingerprint(),
        nameMaps: {
          skills: {
            "claude-home:ce-plan": "ce-plan-sync-legacy",
          },
        },
      }, null, 2),
    )

    const { resolveAgentName } = await loadCompatHelpers(projectRoot)
    expect(resolveAgentName(nestedCwd, "compound-engineering:ce-plan")).toBe("ce-plan-legacy")
    expect(resolveAgentName(nestedCwd, "claude-home:ce-plan")).toBe("ce-plan-sync-legacy")

    delete process.env.COMPOUND_ENGINEERING_HOME
  })

  test("compat runtime trusts verified legacy install generatedSkills arrays", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-runtime-legacy-generated-skills-"))
    const stateHome = path.join(tempRoot, "state-home")
    const projectRoot = path.join(tempRoot, "project")
    const nestedCwd = path.join(projectRoot, "nested", "cwd")
    process.env.COMPOUND_ENGINEERING_HOME = stateHome

    await fs.mkdir(nestedCwd, { recursive: true })
    const installLayout = resolvePiLayout(projectRoot, "install")
    await seedVerifiedProjectInstallNameMaps(projectRoot, {
      skills: {
        "compound-engineering:ce-plan": "ce-plan-legacy",
      },
    })

    await rewriteManifestWithMatchingVerification(
      installLayout,
      "install",
      (manifest) => {
        manifest.generatedSkills = [{ sourceName: "compound-engineering:ce-plan", outputPath: path.join(installLayout.skillsDir, "ce-plan-legacy") }]
        return manifest
      },
      createPiManagedSection({
        nameMaps: {
          skills: {
            "compound-engineering:ce-plan": "ce-plan-legacy",
          },
        },
        artifacts: [createManagedArtifact(installLayout, "generated-skill", "compound-engineering:ce-plan", "ce-plan-legacy")],
      }),
    )

    const { resolveAgentName } = await loadCompatHelpers(projectRoot)
    expect(resolveAgentName(nestedCwd, "compound-engineering:ce-plan")).toBe("ce-plan-legacy")

    delete process.env.COMPOUND_ENGINEERING_HOME
  })

  test("compat runtime trusts verified legacy sync prompt arrays", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-runtime-legacy-sync-prompts-"))
    const stateHome = path.join(tempRoot, "state-home")
    const projectRoot = path.join(tempRoot, "project")
    const nestedCwd = path.join(projectRoot, "nested", "cwd")
    process.env.COMPOUND_ENGINEERING_HOME = stateHome

    await fs.mkdir(nestedCwd, { recursive: true })
    const syncLayout = resolvePiLayout(projectRoot, "sync")
    await seedVerifiedSyncNameMaps(projectRoot, {
      skills: {
        "claude-home:plan-review": "plan-review-legacy",
      },
    })

    await rewriteManifestWithMatchingVerification(
      syncLayout,
      "sync",
      (manifest) => {
        manifest.syncPrompts = [{ sourceName: "claude-home:plan-review", outputPath: path.join(syncLayout.promptsDir, "plan-review-legacy.md") }]
        return manifest
      },
      createPiManagedSection({
        nameMaps: {
          skills: {
            "claude-home:plan-review": "plan-review-legacy",
          },
        },
        artifacts: [createManagedArtifact(syncLayout, "prompt", "claude-home:plan-review", "plan-review-legacy")],
      }),
    )

    const trust = await loadCompatHelpers(projectRoot)
    expect(trust.resolveAgentName(nestedCwd, "claude-home:plan-review")).toBe("plan-review-legacy")

    delete process.env.COMPOUND_ENGINEERING_HOME
  })

  test("compat runtime keeps scoped name maps authoritative over legacy top-level maps", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-runtime-scoped-over-legacy-"))
    const stateHome = path.join(tempRoot, "state-home")
    const projectRoot = path.join(tempRoot, "project")
    const nestedCwd = path.join(projectRoot, "nested", "cwd")
    process.env.COMPOUND_ENGINEERING_HOME = stateHome

    await fs.mkdir(nestedCwd, { recursive: true })

    const layout = resolvePiLayout(projectRoot, "sync")
    await writePiManagedState(
      layout,
      {
        version: 1,
        pluginName: "compound-engineering",
        install: createPiManagedSection({
          nameMaps: {
            skills: {
              "compound-engineering:ce-plan": "ce-plan-install",
            },
          },
        }),
        sync: createPiManagedSection({
          nameMaps: {
            skills: {
              "claude-home:ce-plan": "ce-plan-sync",
            },
          },
        }),
        nameMaps: {
          skills: {
            "compound-engineering:ce-plan": "ce-plan-install",
            "claude-home:ce-plan": "ce-plan-sync",
          },
        },
      },
      { install: true, sync: true },
    )

    const manifest = JSON.parse(await fs.readFile(layout.managedManifestPath, "utf8")) as {
      version: number
      pluginName?: string
      nameMaps?: { skills?: Record<string, string> }
      install?: { nameMaps?: { skills?: Record<string, string> } }
      sync?: { nameMaps?: { skills?: Record<string, string> } }
    }
    manifest.nameMaps = {
      skills: {
        "compound-engineering:ce-plan": "ce-plan-legacy",
        "claude-home:ce-plan": "ce-plan-sync-legacy",
      },
    }
    await fs.writeFile(layout.managedManifestPath, JSON.stringify(manifest, null, 2))

    const { resolveAgentName } = await loadCompatHelpers(projectRoot)
    expect(resolveAgentName(nestedCwd, "compound-engineering:ce-plan")).toBe("ce-plan-install")
    expect(resolveAgentName(nestedCwd, "claude-home:ce-plan")).toBe("ce-plan-sync")

    delete process.env.COMPOUND_ENGINEERING_HOME
  })

  test("runtime and on-disk state agree across install, sync, and nested cwd lookup for canonical custom-root layouts", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-runtime-custom-root-contract-"))
    const stateHome = path.join(tempRoot, "state-home")
    const projectRoot = path.join(tempRoot, "project")
    const nestedCwd = path.join(projectRoot, "apps", "docs")
    const installRoot = path.join(projectRoot, "custom-install-root")
    process.env.COMPOUND_ENGINEERING_HOME = stateHome

    await fs.mkdir(nestedCwd, { recursive: true })
    await seedVerifiedProjectInstallNameMaps(projectRoot, {
      skills: {
        "compound-engineering:ce-plan": "ce-plan-install",
      },
    })
    await fs.mkdir(path.join(projectRoot, "compound-engineering"), { recursive: true })
    await fs.writeFile(
      path.join(projectRoot, "compound-engineering", "mcporter.json"),
      JSON.stringify({ mcpServers: { sync: {} } }, null, 2),
    )

    await syncToPi({
      skills: [
        {
          name: "ce-plan",
          sourceDir: path.join(import.meta.dir, "fixtures", "sample-plugin", "skills", "skill-one"),
          skillPath: path.join(import.meta.dir, "fixtures", "sample-plugin", "skills", "skill-one", "SKILL.md"),
        },
      ],
      mcpServers: {
        sync: { command: "echo" },
      },
    }, projectRoot)

    await writePiBundle(installRoot, {
      pluginName: "compound-engineering",
      prompts: [{ name: "workflows-review", content: "Review content" }],
      skillDirs: [],
      generatedSkills: [],
      extensions: [],
      nameMaps: {
        skills: {
          "compound-engineering:ce-plan": "ce-plan-install-root",
        },
      },
    })

    const installLayout = resolvePiLayout(installRoot, "install")
    expect(await fs.readFile(path.join(installLayout.promptsDir, "workflows-review.md"), "utf8")).toContain("Review content")
    expect(await fs.readFile(path.join(projectRoot, "skills", "ce-plan", "SKILL.md"), "utf8")).toContain("Sample skill")

    const { resolveAgentName, resolveMcporterConfigPath } = await loadCompatHelpers(projectRoot)
    expect(resolveAgentName(nestedCwd, "claude-home:ce-plan")).toBe("ce-plan")
    expect(resolveMcporterConfigPath(nestedCwd)).toBe(path.join(projectRoot, "compound-engineering", "mcporter.json"))

    delete process.env.COMPOUND_ENGINEERING_HOME
  })

  test("compat runtime refreshes alias routing after a same-process manifest update", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-runtime-refresh-"))
    const stateHome = path.join(tempRoot, "state-home")
    const projectRoot = path.join(tempRoot, "project")
    const nestedCwd = path.join(projectRoot, "nested", "cwd")
    process.env.COMPOUND_ENGINEERING_HOME = stateHome

    await fs.mkdir(nestedCwd, { recursive: true })
    await seedVerifiedProjectInstallNameMaps(projectRoot, {
      agents: {
        "compound-engineering:ce:plan": "ce-plan",
      },
    })

    const { resolveAgentName } = await loadCompatHelpers(projectRoot)

    expect(resolveAgentName(nestedCwd, "compound-engineering:ce:plan")).toBe("ce-plan")

    await seedVerifiedProjectInstallNameMaps(projectRoot, {
      agents: {
        "compound-engineering:ce:plan": "ce-plan-2",
      },
    })

    expect(resolveAgentName(nestedCwd, "compound-engineering:ce:plan")).toBe("ce-plan-2")

    delete process.env.COMPOUND_ENGINEERING_HOME
  })

  test("compat runtime recovers after a transient manifest parse failure in the same process", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-runtime-parse-recovery-"))
    const stateHome = path.join(tempRoot, "state-home")
    const projectRoot = path.join(tempRoot, "project")
    const nestedCwd = path.join(projectRoot, "nested", "cwd")
    process.env.COMPOUND_ENGINEERING_HOME = stateHome

    await fs.mkdir(nestedCwd, { recursive: true })
    await seedVerifiedProjectInstallNameMaps(projectRoot, {
      agents: {
        "compound-engineering:ce:plan": "ce-plan",
      },
    })

    const { resolveAgentName } = await loadCompatHelpers(projectRoot)
    const layout = resolvePiLayout(projectRoot, "install")

    expect(resolveAgentName(nestedCwd, "compound-engineering:ce:plan")).toBe("ce-plan")

    await fs.writeFile(layout.managedManifestPath, "{ invalid json\n")
    expect(() => resolveAgentName(nestedCwd, "compound-engineering:ce:plan")).toThrow("Unknown qualified subagent target")

    await seedVerifiedProjectInstallNameMaps(projectRoot, {
      agents: {
        "compound-engineering:ce:plan": "ce-plan-fixed",
      },
    })

    expect(resolveAgentName(nestedCwd, "compound-engineering:ce:plan")).toBe("ce-plan-fixed")

    delete process.env.COMPOUND_ENGINEERING_HOME
  })

  test("compat runtime fails closed for an unverified nearest project install manifest", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-runtime-unverified-install-fallback-"))
    const stateHome = path.join(tempRoot, "state-home")
    const fakeHome = path.join(tempRoot, "home")
    const projectRoot = path.join(tempRoot, "project")
    const nestedCwd = path.join(projectRoot, "nested", "cwd")
    const originalHome = process.env.HOME
    process.env.COMPOUND_ENGINEERING_HOME = stateHome
    process.env.HOME = fakeHome

    await fs.mkdir(nestedCwd, { recursive: true })
    await fs.mkdir(path.join(projectRoot, "compound-engineering"), { recursive: true })
    await fs.writeFile(
      path.join(projectRoot, "compound-engineering", "compound-engineering-managed.json"),
      JSON.stringify({
        version: 1,
        install: {
          nameMaps: {
            skills: {
              "compound-engineering:ce-plan": "ce-plan-local",
            },
          },
          sharedResources: {
            compatExtension: true,
          },
        },
      }, null, 2),
    )

    await seedVerifiedInstallNameMaps(path.join(fakeHome, ".pi", "agent"), {
      skills: {
        "compound-engineering:ce-plan": "ce-plan-global",
      },
    })

    const globalLayout = resolvePiLayout(path.join(fakeHome, ".pi", "agent"), "sync")
    await fs.mkdir(globalLayout.extensionsDir, { recursive: true })
    await fs.writeFile(path.join(globalLayout.extensionsDir, "compound-engineering-compat.ts"), PI_COMPAT_EXTENSION_SOURCE)

    const { resolveAgentName } = await loadCompatHelpers(projectRoot)
    expect(() => resolveAgentName(nestedCwd, "compound-engineering:ce-plan")).toThrow("Unknown qualified subagent target")

    delete process.env.COMPOUND_ENGINEERING_HOME
    if (originalHome === undefined) {
      delete process.env.HOME
    } else {
      process.env.HOME = originalHome
    }
  })

  test("sync does not rewrite against global install aliases when an unverified nearest project install manifest blocks fallback", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-blocked-global-install-rewrite-"))
    const stateHome = path.join(tempRoot, "state-home")
    const fakeHome = path.join(tempRoot, "home")
    const sourceSkillDir = path.join(tempRoot, "claude-skill")
    const originalHome = process.env.HOME
    process.env.COMPOUND_ENGINEERING_HOME = stateHome
    process.env.HOME = fakeHome

    await fs.mkdir(sourceSkillDir, { recursive: true })
    await fs.mkdir(path.join(tempRoot, "compound-engineering"), { recursive: true })
    await fs.writeFile(
      path.join(tempRoot, "compound-engineering", "compound-engineering-managed.json"),
      JSON.stringify({
        version: 1,
        install: {
          nameMaps: {
            skills: {
              "compound-engineering:ce-plan": "ce-plan-local",
            },
          },
        },
      }, null, 2),
    )
    await seedVerifiedInstallNameMaps(path.join(fakeHome, ".pi", "agent"), {
      skills: {
        "compound-engineering:ce-plan": "ce-plan-global",
      },
    })
    await fs.writeFile(
      path.join(sourceSkillDir, "SKILL.md"),
      [
        "---",
        "name: docs-skill",
        "description: runtime-blocked global fallback must not rewrite",
        "---",
        "",
        "- /skill:compound-engineering:ce-plan",
      ].join("\n"),
    )

    await syncToPi({
      skills: [
        {
          name: "docs-skill",
          sourceDir: sourceSkillDir,
          skillPath: path.join(sourceSkillDir, "SKILL.md"),
        },
      ],
      mcpServers: {},
    }, tempRoot)

    const syncedSkill = await fs.readFile(path.join(tempRoot, "skills", "docs-skill", "SKILL.md"), "utf8")
    expect(syncedSkill).not.toContain("/skill:ce-plan-global")

    delete process.env.COMPOUND_ENGINEERING_HOME
    if (originalHome === undefined) {
      delete process.env.HOME
    } else {
      process.env.HOME = originalHome
    }
  })

  test("compat runtime refreshes alias trust after verification removal without manifest changes", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-runtime-verification-refresh-"))
    const stateHome = path.join(tempRoot, "state-home")
    const projectRoot = path.join(tempRoot, "project")
    const nestedCwd = path.join(projectRoot, "nested", "cwd")
    process.env.COMPOUND_ENGINEERING_HOME = stateHome

    await fs.mkdir(nestedCwd, { recursive: true })
    await seedVerifiedProjectInstallNameMaps(projectRoot, {
      agents: {
        "compound-engineering:ce:plan": "ce-plan",
      },
    })

    const { resolveAgentName } = await loadCompatHelpers(projectRoot)
    const layout = resolvePiLayout(projectRoot, "install")

    expect(resolveAgentName(nestedCwd, "compound-engineering:ce:plan")).toBe("ce-plan")

    await fs.unlink(layout.verificationPath)
    expect(() => resolveAgentName(nestedCwd, "compound-engineering:ce:plan")).toThrow("Unknown qualified subagent target")

    await writePiManagedState(
      layout,
      replacePiManagedSection(null, "install", createPiManagedSection({
        nameMaps: {
          agents: {
            "compound-engineering:ce:plan": "ce-plan-restored",
          },
        },
      }), "compound-engineering"),
      { install: true, sync: false },
    )

    expect(resolveAgentName(nestedCwd, "compound-engineering:ce:plan")).toBe("ce-plan-restored")

    delete process.env.COMPOUND_ENGINEERING_HOME
  })

  test("compat runtime treats trailing-separator install roots as the same canonical trusted root", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-runtime-trailing-root-"))
    const stateHome = path.join(tempRoot, "state-home")
    const projectRoot = path.join(tempRoot, "project")
    const nestedCwd = path.join(projectRoot, "nested", "cwd")
    process.env.COMPOUND_ENGINEERING_HOME = stateHome

    await fs.mkdir(nestedCwd, { recursive: true })
    await writePiBundle(projectRoot + path.sep, {
      pluginName: "compound-engineering",
      prompts: [],
      skillDirs: [],
      generatedSkills: [
        {
          name: "ce-plan",
          sourceName: "compound-engineering:ce:plan",
          content: "---\nname: ce-plan\ndescription: Plan\n---\n",
        },
      ],
      extensions: [],
      nameMaps: {
        agents: {
          "compound-engineering:ce:plan": "ce-plan",
        },
      },
    })

    const { resolveAgentName } = await loadCompatHelpers(projectRoot)
    expect(resolveAgentName(nestedCwd, "compound-engineering:ce:plan")).toBe("ce-plan")

    delete process.env.COMPOUND_ENGINEERING_HOME
  })

  test("does not collapse unknown qualified refs to local same-leaf targets during Claude-home Pi sync", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-qualified-shadowing-"))
    const sourceSkillDir = path.join(tempRoot, "claude-skill")
    const localSkillDir = path.join(tempRoot, "local-plan")

    await fs.mkdir(sourceSkillDir, { recursive: true })
    await fs.mkdir(localSkillDir, { recursive: true })
    await fs.writeFile(path.join(localSkillDir, "SKILL.md"), "---\nname: ce-plan\n---\n")
    await fs.writeFile(
      path.join(sourceSkillDir, "SKILL.md"),
      [
        "---",
        "name: docs-skill",
        "description: Avoids local shadowing",
        "---",
        "",
        "- /skill:unknown-plugin:ce-plan",
      ].join("\n"),
    )

    const config: ClaudeHomeConfig = {
      skills: [
        {
          name: "docs-skill",
          sourceDir: sourceSkillDir,
          skillPath: path.join(sourceSkillDir, "SKILL.md"),
        },
        {
          name: "ce-plan",
          sourceDir: localSkillDir,
          skillPath: path.join(localSkillDir, "SKILL.md"),
        },
      ],
      mcpServers: {},
    }

    await syncToPi(config, tempRoot)

    const syncedSkill = await fs.readFile(path.join(tempRoot, "skills", "docs-skill", "SKILL.md"), "utf8")
    expect(syncedSkill).toContain("/skill:unknown-plugin:ce-plan")
    expect(syncedSkill).not.toContain("/skill:ce-plan")
  })

  test("skips only the offending skill when foreign qualified Task refs are unsupported during Pi sync", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-qualified-task-shadowing-"))
    const sourceSkillDir = path.join(tempRoot, "claude-skill")
    const localSkillDir = path.join(tempRoot, "local-agent")
    const validSkillDir = path.join(tempRoot, "valid-skill")
    const warnSpy = spyOn(console, "warn").mockImplementation(() => {})

    await fs.mkdir(sourceSkillDir, { recursive: true })
    await fs.mkdir(localSkillDir, { recursive: true })
    await fs.mkdir(validSkillDir, { recursive: true })
    await fs.writeFile(path.join(localSkillDir, "SKILL.md"), "---\nname: some-missing-agent\ndescription: Local shadow\n---\n")
    await fs.writeFile(path.join(validSkillDir, "SKILL.md"), "---\nname: valid-skill\ndescription: Valid\n---\n\nBody\n")
    await fs.writeFile(
      path.join(sourceSkillDir, "SKILL.md"),
      [
        "---",
        "name: docs-skill",
        "description: Avoids task shadowing",
        "---",
        "",
        "- Task unknown-plugin:review:some-missing-agent(feature_description)",
      ].join("\n"),
    )

    const config: ClaudeHomeConfig = {
      skills: [
        {
          name: "docs-skill",
          sourceDir: sourceSkillDir,
          skillPath: path.join(sourceSkillDir, "SKILL.md"),
        },
        {
          name: "some-missing-agent",
          sourceDir: localSkillDir,
          skillPath: path.join(localSkillDir, "SKILL.md"),
        },
      ],
      mcpServers: {},
    }

    await syncToPi({
      ...config,
      skills: [
        ...config.skills,
        {
          name: "valid-skill",
          sourceDir: validSkillDir,
          skillPath: path.join(validSkillDir, "SKILL.md"),
        },
      ],
    }, tempRoot)

    await expect(fs.access(path.join(tempRoot, "skills", "docs-skill", "SKILL.md"))).rejects.toBeDefined()
    expect(await fs.readFile(path.join(tempRoot, "skills", "valid-skill", "SKILL.md"), "utf8")).toContain("Body")
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Skipping unsupported Pi sync skill docs-skill"))

    warnSpy.mockRestore()
  })

  test("re-renders sibling skill refs against the final published alias set after unsupported siblings drop out", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-sibling-publication-atomicity-"))
    const docsSkillDir = path.join(tempRoot, "docs-skill")
    const badSkillDir = path.join(tempRoot, "bad-skill")
    const goodSkillDir = path.join(tempRoot, "good-skill")
    const warnSpy = spyOn(console, "warn").mockImplementation(() => {})

    await fs.mkdir(docsSkillDir, { recursive: true })
    await fs.mkdir(badSkillDir, { recursive: true })
    await fs.mkdir(goodSkillDir, { recursive: true })
    await fs.writeFile(
      path.join(docsSkillDir, "SKILL.md"),
      [
        "---",
        "name: docs-skill",
        "description: depends on bad sibling publish",
        "---",
        "",
        "- /skill:claude-home:bad-skill",
      ].join("\n"),
    )
    await fs.writeFile(
      path.join(badSkillDir, "SKILL.md"),
      [
        "---",
        "name: bad-skill",
        "description: unsupported sibling",
        "---",
        "",
        "- Task unknown-plugin:review:bad(feature_description)",
      ].join("\n"),
    )
    await fs.writeFile(path.join(goodSkillDir, "SKILL.md"), "---\nname: good-skill\n---\n\nBody\n")

    await syncToPi({
      skills: [
        {
          name: "docs-skill",
          sourceDir: docsSkillDir,
          skillPath: path.join(docsSkillDir, "SKILL.md"),
        },
        {
          name: "bad-skill",
          sourceDir: badSkillDir,
          skillPath: path.join(badSkillDir, "SKILL.md"),
        },
        {
          name: "good-skill",
          sourceDir: goodSkillDir,
          skillPath: path.join(goodSkillDir, "SKILL.md"),
        },
      ],
      mcpServers: {},
    }, tempRoot)

    await expect(fs.access(path.join(tempRoot, "skills", "bad-skill", "SKILL.md"))).rejects.toBeDefined()
    const docsSkill = await fs.readFile(path.join(tempRoot, "skills", "docs-skill", "SKILL.md"), "utf8")
    expect(await fs.readFile(path.join(tempRoot, "skills", "good-skill", "SKILL.md"), "utf8")).toContain("Body")
    expect(docsSkill).not.toContain("/skill:bad-skill")
    expect(docsSkill).toContain("/skill:claude-home:bad-skill")

    const trust = await loadPiManagedStateWithTrust(resolvePiLayout(tempRoot, "sync"))
    expect(trust.state?.sync.nameMaps.skills["good-skill"]).toBe("good-skill")
    expect(trust.state?.sync.nameMaps.skills["bad-skill"]).toBeUndefined()
    expect(trust.state?.sync.nameMaps.skills["docs-skill"]).toBe("docs-skill")
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Skipping unsupported Pi sync skill bad-skill"))

    warnSpy.mockRestore()
  })

  test("retries a first-pass blocked skill after a colliding sibling drops out", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-retry-skill-after-shrink-"))
    const retryableSkillDir = path.join(tempRoot, "retryable-skill")
    const blockingSkillDir = path.join(tempRoot, "blocking-skill")
    const validSkillDir = path.join(tempRoot, "valid-skill")
    const warnSpy = spyOn(console, "warn").mockImplementation(() => {})

    await fs.mkdir(retryableSkillDir, { recursive: true })
    await fs.mkdir(blockingSkillDir, { recursive: true })
    await fs.mkdir(validSkillDir, { recursive: true })
    await fs.writeFile(
      path.join(retryableSkillDir, "SKILL.md"),
      [
        "---",
        "name: docs-skill",
        "description: retry after sibling shrink",
        "---",
        "",
        "- Task compound-engineering:review:bad(feature_description)",
      ].join("\n"),
    )
    await fs.writeFile(
      path.join(blockingSkillDir, "SKILL.md"),
      [
        "---",
        "name: bad",
        "description: blocks first pass then drops out",
        "---",
        "",
        "- Task unknown-plugin:review:bad(feature_description)",
      ].join("\n"),
    )
    await fs.writeFile(path.join(validSkillDir, "SKILL.md"), "---\nname: valid-skill\n---\n\nBody\n")

    await syncToPi({
      skills: [
        { name: "docs-skill", sourceDir: retryableSkillDir, skillPath: path.join(retryableSkillDir, "SKILL.md") },
        { name: "bad", sourceDir: blockingSkillDir, skillPath: path.join(blockingSkillDir, "SKILL.md") },
        { name: "valid-skill", sourceDir: validSkillDir, skillPath: path.join(validSkillDir, "SKILL.md") },
      ],
      mcpServers: {},
    }, tempRoot)

    const docsSkill = await fs.readFile(path.join(tempRoot, "skills", "docs-skill", "SKILL.md"), "utf8")
    expect(docsSkill).toContain('Run ce_subagent with agent="bad" and task="feature_description".')
    await expect(fs.access(path.join(tempRoot, "skills", "bad", "SKILL.md"))).rejects.toBeDefined()
    expect(await fs.readFile(path.join(tempRoot, "skills", "valid-skill", "SKILL.md"), "utf8")).toContain("Body")
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Skipping unsupported Pi sync skill bad"))
    expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining("Skipping unsupported Pi sync skill docs-skill"))

    const trust = await loadPiManagedStateWithTrust(resolvePiLayout(tempRoot, "sync"))
    expect(trust.state?.sync.nameMaps.skills["docs-skill"]).toBe("docs-skill")
    expect(trust.state?.sync.nameMaps.skills.bad).toBeUndefined()

    warnSpy.mockRestore()
  })

  test("retries a first-pass blocked prompt after a colliding sibling skill drops out", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-retry-prompt-after-shrink-"))
    const blockingSkillDir = path.join(tempRoot, "blocking-skill")
    const warnSpy = spyOn(console, "warn").mockImplementation(() => {})

    await fs.mkdir(blockingSkillDir, { recursive: true })
    await fs.writeFile(
      path.join(blockingSkillDir, "SKILL.md"),
      [
        "---",
        "name: bad",
        "description: blocks prompt first pass then drops out",
        "---",
        "",
        "- Task unknown-plugin:review:bad(feature_description)",
      ].join("\n"),
    )

    await syncToPi({
      skills: [
        { name: "bad", sourceDir: blockingSkillDir, skillPath: path.join(blockingSkillDir, "SKILL.md") },
      ],
      commands: [
        {
          name: "plan-review",
          description: "Prompt retries after sibling shrink",
          body: "- Task compound-engineering:review:bad(feature_description)",
          sourcePath: path.join(tempRoot, "commands", "plan-review.md"),
        },
        {
          name: "safe-review",
          description: "Still publishes",
          body: "Body",
          sourcePath: path.join(tempRoot, "commands", "safe-review.md"),
        },
      ],
      mcpServers: {},
    }, tempRoot)

    expect(await fs.readFile(path.join(tempRoot, "prompts", "plan-review.md"), "utf8")).toContain('Run ce_subagent with agent="bad" and task="feature_description".')
    expect(await fs.readFile(path.join(tempRoot, "prompts", "safe-review.md"), "utf8")).toContain("Body")
    await expect(fs.access(path.join(tempRoot, "skills", "bad", "SKILL.md"))).rejects.toBeDefined()
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Skipping unsupported Pi sync skill bad"))
    expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining("Skipping unsupported Pi sync command plan-review"))

    const trust = await loadPiManagedStateWithTrust(resolvePiLayout(tempRoot, "sync"))
    expect(trust.state?.sync.nameMaps.prompts["plan-review"]).toBe("plan-review")

    warnSpy.mockRestore()
  })

  test("rewrites same-run claude-home qualified sibling refs for both synced commands and skills", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-same-run-qualified-sibling-"))
    const docsSkillDir = path.join(tempRoot, "docs-skill")
    const planSkillDir = path.join(tempRoot, "plan-skill")

    await fs.mkdir(docsSkillDir, { recursive: true })
    await fs.mkdir(planSkillDir, { recursive: true })
    await fs.writeFile(
      path.join(docsSkillDir, "SKILL.md"),
      [
        "---",
        "name: docs-skill",
        "description: rewrites same-run qualified refs",
        "---",
        "",
        "- /skill:claude-home:ce:plan",
        "- Task claude-home:ce:plan(feature_description)",
      ].join("\n"),
    )
    await fs.writeFile(path.join(planSkillDir, "SKILL.md"), "---\nname: ce:plan\n---\n\nBody\n")

    await syncToPi({
      skills: [
        {
          name: "docs-skill",
          sourceDir: docsSkillDir,
          skillPath: path.join(docsSkillDir, "SKILL.md"),
        },
        {
          name: "ce:plan",
          sourceDir: planSkillDir,
          skillPath: path.join(planSkillDir, "SKILL.md"),
        },
      ],
      commands: [
        {
          name: "plan-review",
          description: "rewrites same-run qualified task refs",
          body: "- Task claude-home:ce:plan(feature_description)",
          sourcePath: path.join(tempRoot, "commands", "plan-review.md"),
        },
      ],
      mcpServers: {},
    }, tempRoot)

    const syncedSkill = await fs.readFile(path.join(tempRoot, "skills", "docs-skill", "SKILL.md"), "utf8")
    const syncedPrompt = await fs.readFile(path.join(tempRoot, "prompts", "plan-review.md"), "utf8")

    expect(syncedSkill).toContain("/skill:ce-plan")
    expect(syncedSkill).not.toContain("/skill:claude-home-ce-plan")
    expect(syncedSkill).toContain('Run ce_subagent with agent="ce-plan" and task="feature_description".')
    expect(syncedPrompt).toContain('Run ce_subagent with agent="ce-plan" and task="feature_description".')
  })

  test("narrows second-pass sync work to retryable artifacts only", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-narrow-rerun-"))
    const blockingSkillDir = path.join(tempRoot, "blocking-skill")
    const stableSkillDir = path.join(tempRoot, "stable-skill")
    const passPayloads: Array<{ passNumber: number; activeCommandNames: string[]; activeSkillNames: string[] }> = []
    const warnSpy = spyOn(console, "warn").mockImplementation(() => {})

    await fs.mkdir(blockingSkillDir, { recursive: true })
    await fs.mkdir(stableSkillDir, { recursive: true })
    await fs.writeFile(
      path.join(blockingSkillDir, "SKILL.md"),
      [
        "---",
        "name: bad",
        "description: blocks prompt first pass then drops out",
        "---",
        "",
        "- Task unknown-plugin:review:bad(feature_description)",
      ].join("\n"),
    )
    await fs.writeFile(path.join(stableSkillDir, "SKILL.md"), "---\nname: stable-skill\n---\n\nStable\n")

    setPiSyncPassHookForTests((payload) => {
      passPayloads.push(payload)
    })

    await syncToPi({
      skills: [
        {
          name: "bad",
          sourceDir: blockingSkillDir,
          skillPath: path.join(blockingSkillDir, "SKILL.md"),
        },
        {
          name: "stable-skill",
          sourceDir: stableSkillDir,
          skillPath: path.join(stableSkillDir, "SKILL.md"),
        },
      ],
      commands: [
        {
          name: "plan-review",
          description: "Prompt retries after sibling shrink",
          body: "- Task compound-engineering:review:bad(feature_description)",
          sourcePath: path.join(tempRoot, "commands", "plan-review.md"),
        },
        {
          name: "safe-review",
          description: "Still publishes",
          body: "Body",
          sourcePath: path.join(tempRoot, "commands", "safe-review.md"),
        },
      ],
      mcpServers: {},
    }, tempRoot)

    expect(passPayloads).toHaveLength(2)
    expect(passPayloads[0]).toEqual({
      passNumber: 1,
      activeCommandNames: ["plan-review", "safe-review"],
      activeSkillNames: ["bad", "stable-skill"],
    })
    expect(passPayloads[1]).toEqual({
      passNumber: 2,
      activeCommandNames: ["plan-review"],
      activeSkillNames: [],
    })

    warnSpy.mockRestore()
  })

  test("batches Pi prompt conversion for multi-command sync when prompts are all convertible", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-command-batch-convert-"))
    let conversionCalls = 0
    setPiSyncCommandConversionHookForTests(() => {
      conversionCalls += 1
    })

    await syncToPi({
      skills: [],
      commands: [
        {
          name: "plan-review",
          description: "First prompt",
          body: "Body one",
          sourcePath: path.join(tempRoot, "commands", "plan-review.md"),
        },
        {
          name: "safe-review",
          description: "Second prompt",
          body: "Body two",
          sourcePath: path.join(tempRoot, "commands", "safe-review.md"),
        },
      ],
      mcpServers: {},
    }, tempRoot)

    expect(conversionCalls).toBe(1)
    expect(await fs.readFile(path.join(tempRoot, "prompts", "plan-review.md"), "utf8")).toContain("Body one")
    expect(await fs.readFile(path.join(tempRoot, "prompts", "safe-review.md"), "utf8")).toContain("Body two")
  })

  test("narrowed reruns preserve the same final sync outputs as the canonical full rerun", async () => {
    const narrowRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-rerun-parity-narrow-"))
    const fullRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-rerun-parity-full-"))

    for (const root of [narrowRoot, fullRoot]) {
      const blockingSkillDir = path.join(root, "blocking-skill")
      const retryableSkillDir = path.join(root, "retryable-skill")
      const stableSkillDir = path.join(root, "stable-skill")
      await fs.mkdir(blockingSkillDir, { recursive: true })
      await fs.mkdir(retryableSkillDir, { recursive: true })
      await fs.mkdir(stableSkillDir, { recursive: true })
      await fs.writeFile(
        path.join(blockingSkillDir, "SKILL.md"),
        [
          "---",
          "name: bad",
          "description: blocks first pass then drops out",
          "---",
          "",
          "- Task unknown-plugin:review:bad(feature_description)",
        ].join("\n"),
      )
      await fs.writeFile(
        path.join(retryableSkillDir, "SKILL.md"),
        [
          "---",
          "name: docs-skill",
          "description: retry after sibling shrink",
          "---",
          "",
          "- Task compound-engineering:review:bad(feature_description)",
        ].join("\n"),
      )
      await fs.writeFile(path.join(stableSkillDir, "SKILL.md"), "---\nname: stable-skill\n---\n\nStable\n")
    }

    const buildConfig = (root: string): ClaudeHomeConfig => ({
      skills: [
        {
          name: "docs-skill",
          sourceDir: path.join(root, "retryable-skill"),
          skillPath: path.join(root, "retryable-skill", "SKILL.md"),
        },
        {
          name: "bad",
          sourceDir: path.join(root, "blocking-skill"),
          skillPath: path.join(root, "blocking-skill", "SKILL.md"),
        },
        {
          name: "stable-skill",
          sourceDir: path.join(root, "stable-skill"),
          skillPath: path.join(root, "stable-skill", "SKILL.md"),
        },
      ],
      commands: [
        {
          name: "plan-review",
          description: "Prompt retries after sibling shrink",
          body: "- Task compound-engineering:review:bad(feature_description)",
          sourcePath: path.join(root, "commands", "plan-review.md"),
        },
        {
          name: "safe-review",
          description: "Still publishes",
          body: "Body",
          sourcePath: path.join(root, "commands", "safe-review.md"),
        },
      ],
      mcpServers: {},
    })

    const narrowWarnings: string[] = []
    let warnSpy = spyOn(console, "warn").mockImplementation((message: string) => {
      narrowWarnings.push(message)
    })

    await syncToPi(buildConfig(narrowRoot), narrowRoot)
    warnSpy.mockRestore()

    const fullWarnings: string[] = []
    warnSpy = spyOn(console, "warn").mockImplementation((message: string) => {
      fullWarnings.push(message)
    })
    setPiSyncRerunModeForTests("full")
    await syncToPi(buildConfig(fullRoot), fullRoot)
    warnSpy.mockRestore()

    const [narrowTree, fullTree] = await Promise.all([
      readTreeSnapshot(narrowRoot),
      readTreeSnapshot(fullRoot),
    ])
    const [narrowTrust, fullTrust] = await Promise.all([
      loadPiManagedStateWithTrust(resolvePiLayout(narrowRoot, "sync")),
      loadPiManagedStateWithTrust(resolvePiLayout(fullRoot, "sync")),
    ])

    expect(normalizeRootPaths(narrowTree, narrowRoot)).toEqual(normalizeRootPaths(fullTree, fullRoot))
    expect(normalizeRootPaths(narrowWarnings, narrowRoot)).toEqual(normalizeRootPaths(fullWarnings, fullRoot))
    expect(normalizeRootPaths(narrowTrust.state?.sync, narrowRoot)).toEqual(normalizeRootPaths(fullTrust.state?.sync, fullRoot))
  })

  test("skips unresolved first-party qualified Task refs instead of retargeting to same-leaf local aliases", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-unresolved-first-party-task-"))
    const sourceSkillDir = path.join(tempRoot, "claude-skill")
    const localSkillDir = path.join(tempRoot, "local-agent")
    const warnSpy = spyOn(console, "warn").mockImplementation(() => {})

    await fs.mkdir(sourceSkillDir, { recursive: true })
    await fs.mkdir(localSkillDir, { recursive: true })
    await fs.writeFile(path.join(localSkillDir, "SKILL.md"), "---\nname: missing-agent\ndescription: Local shadow\n---\n")
    await fs.writeFile(
      path.join(sourceSkillDir, "SKILL.md"),
      [
        "---",
        "name: docs-skill",
        "description: Avoids first-party task shadowing",
        "---",
        "",
        "- Task compound-engineering:review:missing-agent(feature_description)",
      ].join("\n"),
    )

    await syncToPi({
      skills: [
        {
          name: "docs-skill",
          sourceDir: sourceSkillDir,
          skillPath: path.join(sourceSkillDir, "SKILL.md"),
        },
        {
          name: "missing-agent",
          sourceDir: localSkillDir,
          skillPath: path.join(localSkillDir, "SKILL.md"),
        },
      ],
      mcpServers: {},
    }, tempRoot)

    await expect(fs.access(path.join(tempRoot, "skills", "docs-skill", "SKILL.md"))).rejects.toBeDefined()
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Skipping unsupported Pi sync skill docs-skill"))

    warnSpy.mockRestore()
  })

  test("does not collapse unresolved first-party qualified /skill refs to local leaf names during sync", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-unresolved-first-party-skill-ref-"))
    const sourceSkillDir = path.join(tempRoot, "claude-skill")
    const localSkillDir = path.join(tempRoot, "local-plan")

    await fs.mkdir(sourceSkillDir, { recursive: true })
    await fs.mkdir(localSkillDir, { recursive: true })
    await fs.writeFile(path.join(localSkillDir, "SKILL.md"), "---\nname: ce-plan\n---\n")
    await fs.writeFile(
      path.join(sourceSkillDir, "SKILL.md"),
      [
        "---",
        "name: docs-skill",
        "description: Avoids first-party skill shadowing",
        "---",
        "",
        "- /skill:compound-engineering:ce:plan",
      ].join("\n"),
    )

    await syncToPi({
      skills: [
        {
          name: "docs-skill",
          sourceDir: sourceSkillDir,
          skillPath: path.join(sourceSkillDir, "SKILL.md"),
        },
        {
          name: "ce-plan",
          sourceDir: localSkillDir,
          skillPath: path.join(localSkillDir, "SKILL.md"),
        },
      ],
      mcpServers: {},
    }, tempRoot)

    const syncedSkill = await fs.readFile(path.join(tempRoot, "skills", "docs-skill", "SKILL.md"), "utf8")
    expect(syncedSkill).toContain("/skill:compound-engineering-ce-plan")
    expect(syncedSkill).not.toContain("/skill:ce-plan")
  })

  test("skips only the offending prompt when foreign qualified Task refs are unsupported in synced commands", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-command-foreign-task-"))
    const warnSpy = spyOn(console, "warn").mockImplementation(() => {})

    await syncToPi({
      skills: [],
      commands: [
        {
          name: "plan-review",
          description: "Prompt should reject foreign qualified Task refs",
          body: "- Task unknown-plugin:review:some-missing-agent(feature_description)",
          sourcePath: path.join(tempRoot, "commands", "plan-review.md"),
        },
        {
          name: "safe-review",
          description: "Prompt should still sync",
          body: "Safe body",
          sourcePath: path.join(tempRoot, "commands", "safe-review.md"),
        },
      ],
      mcpServers: {},
    }, tempRoot)

    await expect(fs.access(path.join(tempRoot, "prompts", "plan-review.md"))).rejects.toBeDefined()
    expect(await fs.readFile(path.join(tempRoot, "prompts", "safe-review.md"), "utf8")).toContain("Safe body")
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Skipping unsupported Pi sync command plan-review"))

    warnSpy.mockRestore()
  })

  test("sync-managed state keeps only aliases for successfully published prompts and skills", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-published-state-aliases-"))
    const validSkillDir = path.join(tempRoot, "valid-skill")
    const invalidSkillDir = path.join(tempRoot, "invalid-skill")
    const warnSpy = spyOn(console, "warn").mockImplementation(() => {})

    await fs.mkdir(validSkillDir, { recursive: true })
    await fs.mkdir(invalidSkillDir, { recursive: true })
    await fs.writeFile(path.join(validSkillDir, "SKILL.md"), "---\nname: valid-skill\n---\n\nBody\n")
    await fs.writeFile(
      path.join(invalidSkillDir, "SKILL.md"),
      [
        "---",
        "name: invalid-skill",
        "---",
        "",
        "- Task unknown-plugin:review:bad(feature_description)",
      ].join("\n"),
    )

    await syncToPi({
      skills: [
        {
          name: "valid-skill",
          sourceDir: validSkillDir,
          skillPath: path.join(validSkillDir, "SKILL.md"),
        },
        {
          name: "invalid-skill",
          sourceDir: invalidSkillDir,
          skillPath: path.join(invalidSkillDir, "SKILL.md"),
        },
      ],
      commands: [
        {
          name: "safe-review",
          description: "safe",
          body: "Safe body",
          sourcePath: path.join(tempRoot, "commands", "safe-review.md"),
        },
        {
          name: "bad-review",
          description: "bad",
          body: "- Task unknown-plugin:review:bad(feature_description)",
          sourcePath: path.join(tempRoot, "commands", "bad-review.md"),
        },
      ],
      mcpServers: {},
    }, tempRoot)

    const trust = await loadPiManagedStateWithTrust(resolvePiLayout(tempRoot, "sync"))
    expect(trust.status).toBe("verified")
    expect(trust.state?.sync.nameMaps.skills["valid-skill"]).toBe("valid-skill")
    expect(trust.state?.sync.nameMaps.skills["claude-home:valid-skill"]).toBe("valid-skill")
    expect(trust.state?.sync.nameMaps.skills["invalid-skill"]).toBeUndefined()
    expect(trust.state?.sync.nameMaps.skills["claude-home:invalid-skill"]).toBeUndefined()
    expect(trust.state?.sync.nameMaps.prompts["safe-review"]).toBe("safe-review")
    expect(trust.state?.sync.nameMaps.prompts["claude-home:safe-review"]).toBe("safe-review")
    expect(trust.state?.sync.nameMaps.prompts["bad-review"]).toBeUndefined()
    expect(trust.state?.sync.nameMaps.prompts["claude-home:bad-review"]).toBeUndefined()
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Skipping unsupported Pi sync skill invalid-skill"))
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Skipping unsupported Pi sync command bad-review"))

    warnSpy.mockRestore()
  })

  test("sync-managed MCP ownership includes only emitted mcporter server keys", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-published-state-mcp-"))

    await syncToPi({
      skills: [],
      mcpServers: {
        valid: { url: "https://example.com/mcp" },
        invalid: { env: { TOKEN: "x" } } as any,
      },
    }, tempRoot)

    const trust = await loadPiManagedStateWithTrust(resolvePiLayout(tempRoot, "sync"))
    expect(trust.status).toBe("verified")
    expect(trust.state?.sync.mcpServers).toEqual(["valid"])
    expect(trust.state?.sync.sharedResources.mcporterConfig).toBe(true)

    const mcporter = JSON.parse(await fs.readFile(path.join(tempRoot, "compound-engineering", "mcporter.json"), "utf8")) as {
      mcpServers: Record<string, unknown>
    }
    expect(Object.keys(mcporter.mcpServers)).toEqual(["valid"])
  })

  test("removes deleted synced prompts when Claude-home commands disappear", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-command-deletion-"))
    const promptPath = path.join(tempRoot, "prompts", "plan-review.md")
    const managedManifestPath = path.join(tempRoot, "compound-engineering", "compound-engineering-managed.json")

    await syncToPi({
      skills: [],
      commands: [
        {
          name: "plan-review",
          description: "Personal review",
          body: "Review body",
          sourcePath: path.join(tempRoot, "commands", "plan-review.md"),
        },
      ],
      mcpServers: {},
    }, tempRoot)

    expect(await fs.readFile(promptPath, "utf8")).toContain("Review body")

    await syncToPi({
      skills: [],
      commands: [],
      mcpServers: {},
    }, tempRoot)

    await expect(fs.access(promptPath)).rejects.toBeDefined()

    try {
      const managedManifest = JSON.parse(await fs.readFile(managedManifestPath, "utf8")) as { syncPrompts?: unknown[] }
      expect(managedManifest.syncPrompts ?? []).toHaveLength(0)
    } catch {
      await expect(fs.access(managedManifestPath)).rejects.toBeDefined()
    }
  })

  test("removes renamed synced prompts after a later verified rerun from a legacy prompt filename", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-legacy-prompt-rename-"))
    const stateHome = path.join(tempRoot, "state-home")
    process.env.COMPOUND_ENGINEERING_HOME = stateHome

    const legacyPromptPath = path.join(tempRoot, "prompts", "plan_review.md")
    await fs.mkdir(path.dirname(legacyPromptPath), { recursive: true })
    await fs.writeFile(legacyPromptPath, "legacy prompt body\n")

    await syncToPi({
      skills: [],
      commands: [
        {
          name: "plan_review",
          description: "Personal review",
          body: "Review body",
          sourcePath: path.join(tempRoot, "commands", "plan_review.md"),
        },
      ],
      mcpServers: {},
    }, tempRoot)

    expect(await fs.readFile(path.join(tempRoot, "prompts", "plan-review.md"), "utf8")).toContain("Review body")

    await syncToPi({
      skills: [],
      commands: [
        {
          name: "plan_review",
          description: "Personal review",
          body: "Review body",
          sourcePath: path.join(tempRoot, "commands", "plan_review.md"),
        },
      ],
      mcpServers: {},
    }, tempRoot)

    await expect(fs.access(legacyPromptPath)).rejects.toBeDefined()

    delete process.env.COMPOUND_ENGINEERING_HOME
  })

  test("removes deleted synced skills on a later verified rerun", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-skill-deletion-"))
    const stateHome = path.join(tempRoot, "state-home")
    process.env.COMPOUND_ENGINEERING_HOME = stateHome
    const sourceSkillDir = path.join(tempRoot, "claude-skill")

    await fs.mkdir(sourceSkillDir, { recursive: true })
    await fs.writeFile(
      path.join(sourceSkillDir, "SKILL.md"),
      [
        "---",
        "name: docs-skill",
        "description: Sync deletion test",
        "---",
        "",
        "Body",
      ].join("\n"),
    )

    await syncToPi({
      skills: [
        {
          name: "docs-skill",
          sourceDir: sourceSkillDir,
          skillPath: path.join(sourceSkillDir, "SKILL.md"),
        },
      ],
      mcpServers: {},
    }, tempRoot)

    expect(await fs.readFile(path.join(tempRoot, "skills", "docs-skill", "SKILL.md"), "utf8")).toContain("docs-skill")

    await syncToPi({
      skills: [],
      mcpServers: {},
    }, tempRoot)

    await expect(fs.access(path.join(tempRoot, "skills", "docs-skill"))).rejects.toBeDefined()

    delete process.env.COMPOUND_ENGINEERING_HOME
  })

  test("removes stale synced MCP servers when Claude-home config deletes them", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-mcp-removal-"))
    const mcporterPath = path.join(tempRoot, "compound-engineering", "mcporter.json")

    await syncToPi({
      skills: [],
      mcpServers: {
        context7: { url: "https://mcp.context7.com/mcp" },
      },
    }, tempRoot)

    let mcporter = JSON.parse(await fs.readFile(mcporterPath, "utf8")) as { mcpServers: Record<string, unknown> }
    expect(mcporter.mcpServers.context7).toBeDefined()

    await syncToPi({
      skills: [],
      mcpServers: {},
    }, tempRoot)

    await expect(fs.access(mcporterPath)).rejects.toBeDefined()
  })

  test("does not remove unrelated MCP servers claimed only by an unverified sync manifest", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-forged-mcp-"))
    const mcporterPath = path.join(tempRoot, "compound-engineering", "mcporter.json")
    const managedManifestPath = path.join(tempRoot, "compound-engineering", "compound-engineering-managed.json")

    await fs.mkdir(path.dirname(mcporterPath), { recursive: true })
    await fs.writeFile(
      mcporterPath,
      JSON.stringify({ mcpServers: { unrelated: { baseUrl: "https://example.com/mcp" } } }, null, 2),
    )
    await fs.writeFile(
      managedManifestPath,
      JSON.stringify({
        version: 1,
        sync: {
          mcpServers: ["unrelated"],
        },
      }, null, 2),
    )

    await syncToPi({
      skills: [],
      mcpServers: {},
    }, tempRoot)

    const mcporter = JSON.parse(await fs.readFile(mcporterPath, "utf8")) as { mcpServers: Record<string, unknown> }
    expect(mcporter.mcpServers.unrelated).toBeDefined()
  })

  test("removes the live unverified legacy compat extension on empty sync reruns", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-legacy-compat-preserve-"))
    const stateHome = path.join(tempRoot, "state-home")
    process.env.COMPOUND_ENGINEERING_HOME = stateHome
    const warnSpy = spyOn(console, "warn").mockImplementation(() => {})
    const legacyCompatPath = path.join(tempRoot, "extensions", "compound-engineering-compat.ts")
    await fs.mkdir(path.dirname(legacyCompatPath), { recursive: true })
    await fs.writeFile(legacyCompatPath, "legacy compat\n")

    await syncToPi({
      skills: [],
      commands: [],
      mcpServers: {},
    }, tempRoot)

    const layout = resolvePiLayout(tempRoot, "sync")
    const trust = await loadPiManagedStateWithTrust(layout)
    expect(trust.status).toBe("missing")
    expect(trust.state).toBeNull()
    await expect(fs.access(legacyCompatPath)).rejects.toBeDefined()
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("legacy compat extension"))

    await syncToPi({
      skills: [],
      commands: [],
      mcpServers: {},
    }, tempRoot)

    await expect(fs.access(legacyCompatPath)).rejects.toBeDefined()

    warnSpy.mockRestore()
    delete process.env.COMPOUND_ENGINEERING_HOME
  })

  test("two-pass upgrade from legacy sync artifacts converges and removes only now-provable stale outputs", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-two-pass-upgrade-"))
    const stateHome = path.join(tempRoot, "state-home")
    process.env.COMPOUND_ENGINEERING_HOME = stateHome

    const legacyCompatPath = path.join(tempRoot, "extensions", "compound-engineering-compat.ts")
    const legacyPromptPath = path.join(tempRoot, "prompts", "plan_review.md")
    const ambiguousPromptPath = path.join(tempRoot, "prompts", "manual-note.md")
    await fs.mkdir(path.dirname(legacyCompatPath), { recursive: true })
    await fs.mkdir(path.dirname(legacyPromptPath), { recursive: true })
    await fs.writeFile(legacyCompatPath, "legacy compat\n")
    await fs.writeFile(legacyPromptPath, "legacy review\n")
    await fs.writeFile(ambiguousPromptPath, "manual note\n")

    await syncToPi({
      skills: [],
      commands: [
        {
          name: "plan_review",
          description: "Review",
          body: "Review body",
          sourcePath: path.join(tempRoot, "commands", "plan_review.md"),
        },
      ],
      mcpServers: {},
    }, tempRoot)

    expect(await fs.readFile(path.join(tempRoot, "prompts", "plan-review.md"), "utf8")).toContain("Review body")
    expect(await fs.readFile(ambiguousPromptPath, "utf8")).toContain("manual note")
    expect(await fs.readFile(legacyCompatPath, "utf8")).toContain('name: "ce_subagent"')

    await syncToPi({
      skills: [],
      commands: [],
      mcpServers: {},
    }, tempRoot)

    await expect(fs.access(path.join(tempRoot, "prompts", "plan-review.md"))).rejects.toBeDefined()
    await expect(fs.access(legacyCompatPath)).rejects.toBeDefined()
    expect(await fs.readFile(ambiguousPromptPath, "utf8")).toContain("manual note")

    delete process.env.COMPOUND_ENGINEERING_HOME
  })

  test("unverified sync ownership does not delete shared mcporter config still needed by user state", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-partial-trust-shared-resource-"))
    const stateHome = path.join(tempRoot, "state-home")
    process.env.COMPOUND_ENGINEERING_HOME = stateHome
    const layout = resolvePiLayout(tempRoot, "sync")

    const seededState = replacePiManagedSection(null, "sync", createPiManagedSection({
      mcpServers: ["sync-owned"],
      sharedResources: { mcporterConfig: true },
    }), "compound-engineering")

    await writePiManagedState(layout, seededState, { install: false, sync: true })
    const manifest = JSON.parse(await fs.readFile(layout.managedManifestPath, "utf8")) as {
      sync?: { sharedResources?: { mcporterConfig?: boolean } }
    }
    manifest.sync = {
      ...(manifest.sync ?? {}),
      sharedResources: { mcporterConfig: false },
    }
    await fs.writeFile(layout.managedManifestPath, JSON.stringify(manifest, null, 2) + "\n")
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

    await syncToPi({
      skills: [],
      mcpServers: {},
    }, tempRoot)

    const mcporter = JSON.parse(await fs.readFile(layout.mcporterConfigPath, "utf8")) as {
      mcpServers: Record<string, unknown>
    }
    expect(mcporter.mcpServers["sync-owned"]).toBeDefined()
    expect(mcporter.mcpServers.unrelated).toBeDefined()

    delete process.env.COMPOUND_ENGINEERING_HOME
  })

  test("preserves ambiguous legacy leftovers and warns instead of deleting heuristically", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-legacy-ambiguous-"))
    const stateHome = path.join(tempRoot, "state-home")
    process.env.COMPOUND_ENGINEERING_HOME = stateHome
    const warnSpy = spyOn(console, "warn").mockImplementation(() => {})

    const sourceSkillDir = path.join(tempRoot, "claude-skill")
    await fs.mkdir(sourceSkillDir, { recursive: true })
    await fs.writeFile(
      path.join(sourceSkillDir, "SKILL.md"),
      [
        "---",
        "name: docs_skill",
        "description: Legacy migration ambiguity test",
        "---",
      ].join("\n"),
    )

    const shadowPromptPath = path.join(tempRoot, "prompts", "docs-skill.md")
    const shadowSkillPath = path.join(tempRoot, "skills", "docs_skill")
    await fs.mkdir(path.dirname(shadowPromptPath), { recursive: true })
    await fs.mkdir(shadowSkillPath, { recursive: true })
    await fs.writeFile(shadowPromptPath, "user-owned shadow prompt\n")
    await fs.writeFile(path.join(shadowSkillPath, "SKILL.md"), "user-owned shadow skill\n")

    await syncToPi({
      skills: [
        {
          name: "docs_skill",
          sourceDir: sourceSkillDir,
          skillPath: path.join(sourceSkillDir, "SKILL.md"),
        },
      ],
      commands: [],
      mcpServers: {},
    }, tempRoot)

    expect(await fs.readFile(shadowPromptPath, "utf8")).toContain("user-owned shadow prompt")
    expect(await fs.readFile(path.join(shadowSkillPath, "SKILL.md"), "utf8")).toContain("user-owned shadow skill")
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("ambiguous legacy Pi sync artifact"))

    warnSpy.mockRestore()
    delete process.env.COMPOUND_ENGINEERING_HOME
  })

  test("removes orphaned legacy skill directories discovered from verified prior sync ownership", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-legacy-orphaned-skill-"))
    const stateHome = path.join(tempRoot, "state-home")
    process.env.COMPOUND_ENGINEERING_HOME = stateHome

    const layout = resolvePiLayout(tempRoot, "sync")
    const orphanedLegacySkillDir = path.join(layout.skillsDir, "docs_skill")
    await fs.mkdir(orphanedLegacySkillDir, { recursive: true })
    await fs.writeFile(path.join(orphanedLegacySkillDir, "SKILL.md"), "legacy\n")

    const seededState = replacePiManagedSection(null, "sync", createPiManagedSection({
      artifacts: [createManagedArtifact(layout, "synced-skill", "docs_skill", "docs-skill-2")],
    }), "compound-engineering")
    await writePiManagedState(layout, seededState, { install: false, sync: true })

    await syncToPi({
      skills: [],
      commands: [],
      mcpServers: {},
    }, tempRoot)

    await expect(fs.access(orphanedLegacySkillDir)).rejects.toBeDefined()

    delete process.env.COMPOUND_ENGINEERING_HOME
  })

  test("warns and still writes a verified snapshot when legacy mcporter config is malformed", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-legacy-bad-mcporter-"))
    const stateHome = path.join(tempRoot, "state-home")
    process.env.COMPOUND_ENGINEERING_HOME = stateHome
    const warnSpy = spyOn(console, "warn").mockImplementation(() => {})

    const badMcporterPath = path.join(tempRoot, "compound-engineering", "mcporter.json")
    await fs.mkdir(path.dirname(badMcporterPath), { recursive: true })
    await fs.writeFile(badMcporterPath, "{ not json\n")

    await syncToPi({
      skills: [],
      commands: [
        {
          name: "plan-review",
          description: "Personal review",
          body: "Review body",
          sourcePath: path.join(tempRoot, "commands", "plan-review.md"),
        },
      ],
      mcpServers: {},
    }, tempRoot)

    const layout = resolvePiLayout(tempRoot, "sync")
    const trust = await loadPiManagedStateWithTrust(layout)
    expect(trust.status).toBe("verified")
    expect(await fs.readFile(badMcporterPath, "utf8")).toContain("{ not json")
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("legacy mcporter.json"))

    warnSpy.mockRestore()
    delete process.env.COMPOUND_ENGINEERING_HOME
  })

  test("preserves malformed unverified project mcporter config when sync wants to write MCP servers", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-malformed-unverified-project-mcp-"))
    const stateHome = path.join(tempRoot, "state-home")
    process.env.COMPOUND_ENGINEERING_HOME = stateHome
    const warnSpy = spyOn(console, "warn").mockImplementation(() => {})
    const layout = resolvePiLayout(tempRoot, "sync")

    await fs.mkdir(path.dirname(layout.mcporterConfigPath), { recursive: true })
    await fs.writeFile(layout.mcporterConfigPath, "{ not json\n")
    await fs.writeFile(
      layout.managedManifestPath,
      JSON.stringify({
        version: 1,
        pluginName: "compound-engineering",
        sync: {
          sharedResources: { mcporterConfig: true },
        },
      }, null, 2) + "\n",
    )

    await syncToPi({
      skills: [],
      commands: [],
      mcpServers: {
        context7: { url: "https://mcp.context7.com/mcp" },
      },
    }, tempRoot)

    expect(await fs.readFile(layout.mcporterConfigPath, "utf8")).toContain("{ not json")
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("leaving it untouched because sync ownership cannot be proven"))

    const trust = await loadPiManagedStateWithTrust(layout)
    expect(trust.status).toBe("verified")
    expect(trust.state?.sync.mcpServers).toEqual([])
    expect(trust.state?.sync.sharedResources.mcporterConfig).toBe(false)

    warnSpy.mockRestore()
    delete process.env.COMPOUND_ENGINEERING_HOME
  })

  test("restores prior sync managed state when stale skill cleanup fails after publication work", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-stale-cleanup-rollback-"))
    const stateHome = path.join(tempRoot, "state-home")
    process.env.COMPOUND_ENGINEERING_HOME = stateHome

    const layout = resolvePiLayout(tempRoot, "sync")
    const skillsParent = layout.skillsDir
    const externalSkillsParent = path.join(tempRoot, "external-skills")
    const externalOldSkillDir = path.join(externalSkillsParent, "old-skill")

    await fs.mkdir(externalOldSkillDir, { recursive: true })
    await fs.writeFile(path.join(externalOldSkillDir, "SKILL.md"), "old\n")
    await fs.symlink(externalSkillsParent, skillsParent)

    const seededState = replacePiManagedSection(null, "sync", createPiManagedSection({
      artifacts: [createManagedArtifact(layout, "synced-skill", "old-skill", "old-skill")],
    }), "compound-engineering")
    await writePiManagedState(layout, seededState, { install: false, sync: true })

    await expect(syncToPi({
      skills: [],
      commands: [
        {
          name: "new-note",
          description: "new",
          body: "new body",
          sourcePath: path.join(tempRoot, "commands", "new-note.md"),
        },
      ],
      mcpServers: {},
    }, tempRoot)).rejects.toThrow("symlinked ancestor")

    const restored = await loadPiManagedStateWithTrust(layout)
    expect(restored.status).toBe("verified")
    expect(restored.state?.sync.artifacts.map((artifact) => artifact.emittedName)).toContain("old-skill")
    expect(restored.state?.sync.artifacts.map((artifact) => artifact.emittedName)).not.toContain("new-note")
    await expect(fs.access(path.join(layout.promptsDir, "new-note.md"))).rejects.toBeDefined()

    delete process.env.COMPOUND_ENGINEERING_HOME
  })

  test("removes stale compat extension when Claude-home Pi sync becomes empty", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-compat-removal-"))
    const compatPath = path.join(tempRoot, "extensions", "compound-engineering-compat.ts")

    await syncToPi({
      skills: [],
      commands: [
        {
          name: "plan-review",
          description: "Personal review",
          body: "Review body",
          sourcePath: path.join(tempRoot, "commands", "plan-review.md"),
        },
      ],
      mcpServers: {},
    }, tempRoot)

    expect(await fs.readFile(compatPath, "utf8")).toContain('name: "ce_subagent"')

    await syncToPi({
      skills: [],
      commands: [],
      mcpServers: {},
    }, tempRoot)

    await expect(fs.access(compatPath)).rejects.toBeDefined()
    const agents = await fs.readFile(path.join(tempRoot, "AGENTS.md"), "utf8")
    expect(agents).not.toContain("ce_subagent")
    expect(agents).toContain("compat tools are not currently installed")
  })

  test("removes the live ambiguous compat extension on empty sync while disabling advertising", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-compat-preserve-untrusted-"))
    const compatPath = path.join(tempRoot, "extensions", "compound-engineering-compat.ts")
    const warnSpy = spyOn(console, "warn").mockImplementation(() => {})

    await fs.mkdir(path.dirname(compatPath), { recursive: true })
    await fs.writeFile(compatPath, "legacy compat\n")

    await syncToPi({
      skills: [],
      commands: [],
      mcpServers: {},
    }, tempRoot)

    await expect(fs.access(compatPath)).rejects.toBeDefined()
    const agents = await fs.readFile(path.join(tempRoot, "AGENTS.md"), "utf8")
    expect(agents).not.toContain("ce_subagent")
    expect(agents).toContain("compat tools are not currently installed")
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("ambiguous legacy compat extension"))

    warnSpy.mockRestore()
  })

  test("compat runtime only uses bundled mcporter fallback when bundled manifest authorizes it", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-bundled-mcporter-fallback-"))
    const bundledDir = path.join(tempRoot, "pi-resources", "compound-engineering")
    await fs.mkdir(bundledDir, { recursive: true })
    await fs.writeFile(path.join(bundledDir, "mcporter.json"), JSON.stringify({ mcpServers: { bundled: {} } }, null, 2))

    await fs.writeFile(path.join(bundledDir, "compound-engineering-managed.json"), JSON.stringify({
      version: 1,
      pluginName: "compound-engineering",
      policyFingerprint: getPiPolicyFingerprint(),
      install: {
        sharedResources: { mcporterConfig: true },
      },
    }, null, 2))

    let helpers = await loadCompatHelpers(tempRoot)
    expect(helpers.resolveMcporterConfigPath(tempRoot)).toBe(path.join(bundledDir, "mcporter.json"))

    await fs.writeFile(path.join(bundledDir, "compound-engineering-managed.json"), JSON.stringify({
      version: 1,
      pluginName: "compound-engineering",
      policyFingerprint: "wrong-policy",
      install: {
        sharedResources: { mcporterConfig: true },
      },
    }, null, 2))

    helpers = await loadCompatHelpers(tempRoot)
    expect(helpers.resolveMcporterConfigPath(tempRoot)).toBeUndefined()
  })

  test("compat runtime does not trust bundled alias manifests by location alone", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-bundled-alias-untrusted-"))
    const bundledDir = path.join(tempRoot, "pi-resources", "compound-engineering")
    await fs.mkdir(bundledDir, { recursive: true })
    await fs.writeFile(path.join(bundledDir, "compound-engineering-managed.json"), JSON.stringify({
      version: 1,
      pluginName: "compound-engineering",
      policyFingerprint: getPiPolicyFingerprint(),
      install: {
        nameMaps: {
          skills: {
            "compound-engineering:ce-plan": "bundled-ce-plan",
          },
        },
      },
    }, null, 2))

    const { resolveAgentName } = await loadCompatHelpers(tempRoot)
    expect(() => resolveAgentName(tempRoot, "compound-engineering:ce-plan")).toThrow("Unknown qualified subagent target")
  })

  test("ce_list_capabilities reports bundled MCP availability when bundled fallback is authorized", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-capability-bundled-mcp-"))
    const bundledDir = path.join(tempRoot, "pi-resources", "compound-engineering")
    await fs.mkdir(bundledDir, { recursive: true })
    await fs.writeFile(path.join(bundledDir, "mcporter.json"), JSON.stringify({ mcpServers: { bundled: {} } }, null, 2))
    await fs.writeFile(path.join(bundledDir, "compound-engineering-managed.json"), JSON.stringify({
      version: 1,
      pluginName: "compound-engineering",
      policyFingerprint: getPiPolicyFingerprint(),
      install: {
        sharedResources: { mcporterConfig: true },
      },
    }, null, 2))

    const mod = await loadCompatHelpers(tempRoot)
    const tools = new Map<string, { execute: (...args: any[]) => any }>()
    mod.default({
      registerTool(tool) {
        tools.set(tool.name, tool)
      },
      async exec() {
        return { code: 0, stdout: "ok", stderr: "" }
      },
    })

    const capabilities = tools.get("ce_list_capabilities")
    expect(capabilities).toBeDefined()
    const result = await capabilities!.execute("tool-call-id", {}, undefined, undefined, { cwd: tempRoot })
    const details = result.details as {
      shared: {
        mcporter: {
          available: boolean
          source: string | null
          servers: string[]
          provenance?: { status: string; authority: string | null }
        }
      }
    }
    expect(details.shared.mcporter).toMatchObject({ available: true, source: "bundled", servers: ["bundled"] })
    expect(details.shared.mcporter.provenance).toEqual({ status: "available", authority: "bundled" })
  })

  test("ce_list_capabilities reports blocked project-sync provenance when unverified local MCP blocks fallback", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-capability-blocked-local-mcp-"))
    const stateHome = path.join(tempRoot, "state-home")
    const fakeHome = path.join(tempRoot, "home")
    const projectRoot = path.join(tempRoot, "project")
    const nestedCwd = path.join(projectRoot, "apps", "docs")
    const originalHome = process.env.HOME
    process.env.COMPOUND_ENGINEERING_HOME = stateHome
    process.env.HOME = fakeHome

    await fs.mkdir(nestedCwd, { recursive: true })
    await fs.mkdir(path.join(projectRoot, "compound-engineering"), { recursive: true })
    await fs.writeFile(
      path.join(projectRoot, "compound-engineering", "compound-engineering-managed.json"),
      JSON.stringify({
        version: 1,
        sync: {
          sharedResources: { mcporterConfig: true },
        },
      }, null, 2),
    )
    await fs.writeFile(path.join(projectRoot, "compound-engineering", "mcporter.json"), JSON.stringify({ mcpServers: { local: {} } }, null, 2))

    const globalRoot = path.join(fakeHome, ".pi", "agent")
    const globalLayout = resolvePiLayout(globalRoot, "sync")
    await fs.mkdir(path.dirname(globalLayout.mcporterConfigPath), { recursive: true })
    await fs.writeFile(globalLayout.mcporterConfigPath, JSON.stringify({ mcpServers: { global: {} } }, null, 2))
    await writePiManagedState(
      globalLayout,
      replacePiManagedSection(null, "sync", createPiManagedSection({
        nameMaps: {},
        sharedResources: { mcporterConfig: true },
      }), "compound-engineering"),
      { install: false, sync: true },
    )

    const mod = await loadCompatHelpers(projectRoot)
    const tools = new Map<string, { execute: (...args: any[]) => any }>()
    mod.default({
      registerTool(tool) {
        tools.set(tool.name, tool)
      },
      async exec() {
        return { code: 0, stdout: "ok", stderr: "" }
      },
    })

    const capabilities = tools.get("ce_list_capabilities")
    const result = await capabilities!.execute("tool-call-id", {}, undefined, undefined, { cwd: nestedCwd })
    const details = result.details as {
      shared: {
        mcporter: {
          available: boolean
          source: string | null
          servers: string[]
          provenance?: { status: string; authority: string | null }
        }
      }
    }

    expect(details.shared.mcporter).toMatchObject({ available: false, source: null, servers: [] })
    expect(details.shared.mcporter.provenance).toEqual({ status: "blocked-unverified-project-sync", authority: null })

    delete process.env.COMPOUND_ENGINEERING_HOME
    if (originalHome === undefined) {
      delete process.env.HOME
    } else {
      process.env.HOME = originalHome
    }
  })

  test("disabled local AGENTS state does not hide globally available runtime MCP discovery", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-global-capability-discovery-"))
    const stateHome = path.join(tempRoot, "state-home")
    const globalRoot = path.join(stateHome, ".pi", "agent")
    process.env.COMPOUND_ENGINEERING_HOME = stateHome
    process.env.HOME = stateHome

    const globalLayout = resolvePiLayout(globalRoot, "install")
    const globalState = replacePiManagedSection(null, "install", createPiManagedSection({
      nameMaps: {
        agents: {
          "compound-engineering:ce:plan": "ce-plan-global",
        },
      },
      sharedResources: { mcporterConfig: true },
    }), "compound-engineering")
    await writePiManagedState(globalLayout, globalState, { install: true, sync: false })
    await fs.mkdir(path.dirname(globalLayout.mcporterConfigPath), { recursive: true })
    await fs.writeFile(globalLayout.mcporterConfigPath, JSON.stringify({ mcpServers: { global: {} } }, null, 2))

    await syncToPi({ skills: [], commands: [], mcpServers: {} }, tempRoot)

    const agents = await fs.readFile(path.join(tempRoot, "AGENTS.md"), "utf8")
    expect(agents).toContain("Verified global or bundled Compound Engineering fallbacks may still exist")

    const mod = await loadCompatHelpers(tempRoot)
    const tools = new Map<string, { execute: (...args: any[]) => any }>()
    mod.default({
      registerTool(tool) {
        tools.set(tool.name, tool)
      },
      async exec() {
        return { code: 0, stdout: "ok", stderr: "" }
      },
    })

    const capabilities = tools.get("ce_list_capabilities")
    const result = await capabilities!.execute("tool-call-id", {}, undefined, undefined, { cwd: tempRoot })
    const details = result.details as {
      shared: { mcporter: { available: boolean; source: string | null; servers: string[] } }
    }
    expect(details.shared.mcporter).toMatchObject({ available: true, source: "global", servers: ["global"] })

    delete process.env.COMPOUND_ENGINEERING_HOME
    delete process.env.HOME
  })

  test("untrusted local mcporter config blocks lower-priority global fallback", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-untrusted-local-mcp-blocks-global-"))
    const stateHome = path.join(tempRoot, "state-home")
    const globalRoot = path.join(stateHome, ".pi", "agent")
    process.env.COMPOUND_ENGINEERING_HOME = stateHome
    process.env.HOME = stateHome

    const globalLayout = resolvePiLayout(globalRoot, "install")
    const globalState = replacePiManagedSection(null, "install", createPiManagedSection({
      sharedResources: { mcporterConfig: true },
    }), "compound-engineering")
    await writePiManagedState(globalLayout, globalState, { install: true, sync: false })
    await fs.mkdir(path.dirname(globalLayout.mcporterConfigPath), { recursive: true })
    await fs.writeFile(globalLayout.mcporterConfigPath, JSON.stringify({ mcpServers: { global: {} } }, null, 2))

    await fs.mkdir(path.join(tempRoot, "compound-engineering"), { recursive: true })
    await fs.writeFile(path.join(tempRoot, "compound-engineering", "mcporter.json"), JSON.stringify({ mcpServers: { local: {} } }, null, 2))

    const mod = await loadCompatHelpers(tempRoot)
    expect(mod.resolveMcporterConfigPath(tempRoot)).toBeUndefined()

    const tools = new Map<string, { execute: (...args: any[]) => any }>()
    mod.default({
      registerTool(tool) {
        tools.set(tool.name, tool)
      },
      async exec() {
        return { code: 0, stdout: "ok", stderr: "" }
      },
    })

    const capabilities = tools.get("ce_list_capabilities")
    const result = await capabilities!.execute("tool-call-id", {}, undefined, undefined, { cwd: tempRoot })
    const details = result.details as {
      shared: { mcporter: { available: boolean; source: string | null; servers: string[] } }
    }
    expect(details.shared.mcporter).toMatchObject({ available: false, source: null, servers: [] })

    delete process.env.COMPOUND_ENGINEERING_HOME
    delete process.env.HOME
  })

  test("does not derive legacy skill-directory cleanup candidates from prompt artifacts", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-prompt-cleanup-scope-"))
    const layout = resolvePiLayout(tempRoot, "sync")
    const unrelatedSkillDir = path.join(layout.skillsDir, "plan-review")

    await syncToPi({
      skills: [],
      commands: [
        {
          name: "plan-review",
          description: "Personal review",
          body: "Review body",
          sourcePath: path.join(tempRoot, "commands", "plan-review.md"),
        },
      ],
      mcpServers: {},
    }, tempRoot)

    await fs.mkdir(unrelatedSkillDir, { recursive: true })
    await fs.writeFile(path.join(unrelatedSkillDir, "SKILL.md"), "---\nname: unrelated\n---\n\nBody\n")

    await syncToPi({
      skills: [],
      commands: [],
      mcpServers: {},
    }, tempRoot)

    expect(await fs.readFile(path.join(unrelatedSkillDir, "SKILL.md"), "utf8")).toContain("name: unrelated")
  })

  test("keeps compat extension when verified install-owned state still exists", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-compat-shared-root-"))
    const stateHome = path.join(tempRoot, "state-home")
    process.env.COMPOUND_ENGINEERING_HOME = stateHome

    const installLayout = resolvePiLayout(tempRoot, "sync")
    await fs.mkdir(installLayout.extensionsDir, { recursive: true })
    await fs.writeFile(path.join(installLayout.extensionsDir, "compound-engineering-compat.ts"), "install compat\n")
    await writePiManagedState(
      installLayout,
      replacePiManagedSection(null, "install", createPiManagedSection({
        artifacts: [],
        sharedResources: {
          compatExtension: true,
        },
      }), "compound-engineering"),
      { install: true, sync: false },
    )

    await syncToPi({
      skills: [],
      commands: [],
      mcpServers: {},
    }, tempRoot)

    expect(await fs.readFile(path.join(installLayout.extensionsDir, "compound-engineering-compat.ts"), "utf8")).toContain('name: "ce_subagent"')

    delete process.env.COMPOUND_ENGINEERING_HOME
  })

  test("does not rewrite unchanged sync managed state or compat extension on no-op reruns", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-noop-rerun-"))
    const stateHome = path.join(tempRoot, "state-home")
    process.env.COMPOUND_ENGINEERING_HOME = stateHome

    const config: ClaudeHomeConfig = {
      skills: [],
      commands: [
        {
          name: "plan-review",
          description: "Personal review",
          body: "Review body",
          sourcePath: path.join(tempRoot, "commands", "plan-review.md"),
        },
      ],
      mcpServers: {},
    }

    await syncToPi(config, tempRoot)

    const layout = resolvePiLayout(tempRoot, "sync")
    const compatPath = path.join(layout.extensionsDir, "compound-engineering-compat.ts")
    const promptPath = path.join(layout.promptsDir, "plan-review.md")
    const firstManifest = await fs.stat(layout.managedManifestPath)
    const firstVerification = await fs.stat(layout.verificationPath)
    const firstCompat = await fs.readFile(compatPath, "utf8")
    const firstPrompt = await fs.stat(promptPath)

    await new Promise((resolve) => setTimeout(resolve, 15))
    await syncToPi(config, tempRoot)

    const secondManifest = await fs.stat(layout.managedManifestPath)
    const secondVerification = await fs.stat(layout.verificationPath)
    const secondCompat = await fs.readFile(compatPath, "utf8")
    const secondPrompt = await fs.stat(promptPath)
    expect(secondManifest.mtimeMs).toBe(firstManifest.mtimeMs)
    expect(secondVerification.mtimeMs).toBe(firstVerification.mtimeMs)
    expect(secondCompat).toBe(firstCompat)
    expect(secondPrompt.mtimeMs).toBe(firstPrompt.mtimeMs)
    expect((await fs.readdir(layout.root)).some((entry) => entry.startsWith(".pi-sync-rollback-"))).toBe(false)

    delete process.env.COMPOUND_ENGINEERING_HOME
  })

  test("does not snapshot unchanged shared sync files on no-op reruns", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-noop-shared-snapshots-"))
    const stateHome = path.join(tempRoot, "state-home")
    process.env.COMPOUND_ENGINEERING_HOME = stateHome

    const config: ClaudeHomeConfig = {
      skills: [],
      commands: [
        {
          name: "plan-review",
          description: "Personal review",
          body: "Review body",
          sourcePath: path.join(tempRoot, "commands", "plan-review.md"),
        },
      ],
      mcpServers: {},
    }

    await syncToPi(config, tempRoot)
    const layout = resolvePiLayout(tempRoot, "sync")
    const compatPath = path.join(layout.extensionsDir, "compound-engineering-compat.ts")
    const snapshottedPaths: string[] = []
    setManagedPathSnapshotHookForTests((targetPath) => {
      snapshottedPaths.push(targetPath)
    })

    await syncToPi(config, tempRoot)

    expect(snapshottedPaths).not.toContain(layout.agentsPath)
    expect(snapshottedPaths).not.toContain(layout.managedManifestPath)
    expect(snapshottedPaths).not.toContain(layout.verificationPath)
    expect(snapshottedPaths).not.toContain(compatPath)

    delete process.env.COMPOUND_ENGINEERING_HOME
  })

  test("does not create rollback temp dirs on no-op sync reruns for unchanged skills", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-noop-skill-rerun-"))
    const stateHome = path.join(tempRoot, "state-home")
    const sourceSkillDir = path.join(tempRoot, "claude-skill")
    process.env.COMPOUND_ENGINEERING_HOME = stateHome

    await fs.mkdir(path.join(sourceSkillDir, "nested"), { recursive: true })
    await fs.writeFile(path.join(sourceSkillDir, "SKILL.md"), "---\nname: docs-skill\n---\n\nBody\n")
    await fs.writeFile(path.join(sourceSkillDir, "nested", "stable.txt"), "stable\n")

    const config: ClaudeHomeConfig = {
      skills: [
        {
          name: "docs-skill",
          sourceDir: sourceSkillDir,
          skillPath: path.join(sourceSkillDir, "SKILL.md"),
        },
      ],
      mcpServers: {},
    }

    await syncToPi(config, tempRoot)

    const layout = resolvePiLayout(tempRoot, "sync")
    await new Promise((resolve) => setTimeout(resolve, 15))
    await syncToPi(config, tempRoot)

    expect((await fs.readdir(layout.root)).some((entry) => entry.startsWith(".pi-sync-rollback-"))).toBe(false)

    delete process.env.COMPOUND_ENGINEERING_HOME
  })

  test("does not snapshot unchanged synced skill directories on no-op reruns", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-noop-skill-snapshot-"))
    const stateHome = path.join(tempRoot, "state-home")
    const sourceSkillDir = path.join(tempRoot, "claude-skill")
    process.env.COMPOUND_ENGINEERING_HOME = stateHome

    await fs.mkdir(path.join(sourceSkillDir, "nested"), { recursive: true })
    await fs.writeFile(path.join(sourceSkillDir, "SKILL.md"), "---\nname: docs-skill\n---\n\nBody\n")
    await fs.writeFile(path.join(sourceSkillDir, "nested", "stable.txt"), "stable\n")

    const config: ClaudeHomeConfig = {
      skills: [
        {
          name: "docs-skill",
          sourceDir: sourceSkillDir,
          skillPath: path.join(sourceSkillDir, "SKILL.md"),
        },
      ],
      mcpServers: {},
    }

    await syncToPi(config, tempRoot)

    const targetSkillDir = path.join(resolvePiLayout(tempRoot, "sync").skillsDir, "docs-skill")
    const snapshottedPaths: string[] = []
    setManagedPathSnapshotHookForTests((targetPath) => {
      snapshottedPaths.push(targetPath)
    })

    await syncToPi(config, tempRoot)

    expect(snapshottedPaths).not.toContain(targetSkillDir)

    delete process.env.COMPOUND_ENGINEERING_HOME
  })

  test("avoids whole-directory publication snapshots for incremental synced skill updates", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-incremental-skill-snapshot-"))
    const stateHome = path.join(tempRoot, "state-home")
    const sourceSkillDir = path.join(tempRoot, "claude-skill")
    process.env.COMPOUND_ENGINEERING_HOME = stateHome

    await fs.mkdir(path.join(sourceSkillDir, "nested"), { recursive: true })
    await fs.writeFile(path.join(sourceSkillDir, "SKILL.md"), "---\nname: docs-skill\n---\n\nBody\n")
    await fs.writeFile(path.join(sourceSkillDir, "nested", "stable.txt"), "stable\n")

    const config: ClaudeHomeConfig = {
      skills: [
        {
          name: "docs-skill",
          sourceDir: sourceSkillDir,
          skillPath: path.join(sourceSkillDir, "SKILL.md"),
        },
      ],
      mcpServers: {},
    }

    await syncToPi(config, tempRoot)

    const targetSkillDir = path.join(resolvePiLayout(tempRoot, "sync").skillsDir, "docs-skill")
    await fs.writeFile(path.join(sourceSkillDir, "nested", "stable.txt"), "updated\n")

    const snapshottedPaths: string[] = []
    setManagedPathSnapshotHookForTests((targetPath) => {
      snapshottedPaths.push(targetPath)
    })

    await syncToPi(config, tempRoot)

    expect(snapshottedPaths).not.toContain(targetSkillDir)
    expect(await fs.readFile(path.join(targetSkillDir, "nested", "stable.txt"), "utf8")).toBe("updated\n")

    delete process.env.COMPOUND_ENGINEERING_HOME
  })

  test("does not perform full deep compare for unchanged synced skill directories on stable reruns", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-skill-fast-path-"))
    const stateHome = path.join(tempRoot, "state-home")
    const sourceSkillDir = path.join(tempRoot, "claude-skill")
    process.env.COMPOUND_ENGINEERING_HOME = stateHome

    await fs.mkdir(path.join(sourceSkillDir, "nested"), { recursive: true })
    await fs.writeFile(path.join(sourceSkillDir, "SKILL.md"), "---\nname: docs-skill\n---\n\nBody\n")
    await fs.writeFile(path.join(sourceSkillDir, "nested", "stable.txt"), "stable\n")

    const config: ClaudeHomeConfig = {
      skills: [
        {
          name: "docs-skill",
          sourceDir: sourceSkillDir,
          skillPath: path.join(sourceSkillDir, "SKILL.md"),
        },
      ],
      mcpServers: {},
    }

    await syncToPi(config, tempRoot)
    await syncToPi(config, tempRoot)

    let fullCompareCalls = 0
    setPiSkillFullCompareHookForTests(() => {
      fullCompareCalls += 1
    })
    let sourceFingerprintCalls = 0
    setPiSkillSourceFingerprintHookForTests(() => {
      sourceFingerprintCalls += 1
    })

    await syncToPi(config, tempRoot)

    expect(fullCompareCalls).toBe(0)
    expect(sourceFingerprintCalls).toBe(0)

    delete process.env.COMPOUND_ENGINEERING_HOME
  })

  test("falls back to full deep compare when a synced skill tree changes", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-skill-fast-path-fallback-"))
    const stateHome = path.join(tempRoot, "state-home")
    const sourceSkillDir = path.join(tempRoot, "claude-skill")
    process.env.COMPOUND_ENGINEERING_HOME = stateHome

    await fs.mkdir(path.join(sourceSkillDir, "nested"), { recursive: true })
    await fs.writeFile(path.join(sourceSkillDir, "SKILL.md"), "---\nname: docs-skill\n---\n\nBody\n")
    await fs.writeFile(path.join(sourceSkillDir, "nested", "stable.txt"), "stable\n")

    const config: ClaudeHomeConfig = {
      skills: [
        {
          name: "docs-skill",
          sourceDir: sourceSkillDir,
          skillPath: path.join(sourceSkillDir, "SKILL.md"),
        },
      ],
      mcpServers: {},
    }

    await syncToPi(config, tempRoot)
    await syncToPi(config, tempRoot)

    await fs.writeFile(path.join(sourceSkillDir, "nested", "stable.txt"), "changed\n")

    let fullCompareCalls = 0
    setPiSkillFullCompareHookForTests(() => {
      fullCompareCalls += 1
    })
    let sourceFingerprintCalls = 0
    setPiSkillSourceFingerprintHookForTests(() => {
      sourceFingerprintCalls += 1
    })

    await syncToPi(config, tempRoot)

    expect(fullCompareCalls).toBeGreaterThan(0)
    expect(sourceFingerprintCalls).toBeGreaterThan(0)

    delete process.env.COMPOUND_ENGINEERING_HOME
  })

  test("invalidates synced skill fast paths when the Pi policy fingerprint changes", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-policy-fast-path-"))
    const stateHome = path.join(tempRoot, "state-home")
    const sourceSkillDir = path.join(tempRoot, "claude-skill")
    process.env.COMPOUND_ENGINEERING_HOME = stateHome

    await fs.mkdir(path.join(sourceSkillDir, "nested"), { recursive: true })
    await fs.writeFile(path.join(sourceSkillDir, "SKILL.md"), "---\nname: docs-skill\n---\n\nBody\n")
    await fs.writeFile(path.join(sourceSkillDir, "nested", "stable.txt"), "stable\n")

    const config: ClaudeHomeConfig = {
      skills: [
        {
          name: "docs-skill",
          sourceDir: sourceSkillDir,
          skillPath: path.join(sourceSkillDir, "SKILL.md"),
        },
      ],
      mcpServers: {},
    }

    setPiPolicyFingerprintForTests("policy-v1")
    await syncToPi(config, tempRoot)
    await syncToPi(config, tempRoot)

    let fullCompareCalls = 0
    let sourceFingerprintCalls = 0
    setPiSkillFullCompareHookForTests(() => {
      fullCompareCalls += 1
    })
    setPiSkillSourceFingerprintHookForTests(() => {
      sourceFingerprintCalls += 1
    })

    setPiPolicyFingerprintForTests("policy-v2")
    await syncToPi(config, tempRoot)

    expect(fullCompareCalls).toBeGreaterThan(0)
    expect(sourceFingerprintCalls).toBeGreaterThan(0)

    delete process.env.COMPOUND_ENGINEERING_HOME
  })

  test("invalidates synced skill fast paths when install name maps change rendered output", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-render-fast-path-"))
    const stateHome = path.join(tempRoot, "state-home")
    const sourceSkillDir = path.join(tempRoot, "claude-skill")
    process.env.COMPOUND_ENGINEERING_HOME = stateHome

    await fs.mkdir(sourceSkillDir, { recursive: true })
    await fs.writeFile(
      path.join(sourceSkillDir, "SKILL.md"),
      "---\nname: docs-skill\n---\n\n- /skill:compound-engineering:ce-plan\n- Task compound-engineering:ce-plan(feature_description)\n",
    )

    await seedVerifiedProjectInstallNameMaps(tempRoot, {
      skills: {
        "compound-engineering:ce-plan": "ce-plan-v1",
      },
    })

    const config: ClaudeHomeConfig = {
      skills: [
        {
          name: "docs-skill",
          sourceDir: sourceSkillDir,
          skillPath: path.join(sourceSkillDir, "SKILL.md"),
        },
      ],
      mcpServers: {},
    }

    await syncToPi(config, tempRoot)
    await syncToPi(config, tempRoot)

    let fullCompareCalls = 0
    setPiSkillFullCompareHookForTests(() => {
      fullCompareCalls += 1
    })

    await seedVerifiedProjectInstallNameMaps(tempRoot, {
      skills: {
        "compound-engineering:ce-plan": "ce-plan-v2",
      },
    })

    await syncToPi(config, tempRoot)

    const syncedSkill = await fs.readFile(path.join(tempRoot, "skills", "docs-skill", "SKILL.md"), "utf8")
    expect(syncedSkill).toContain("/skill:ce-plan-v2")
    expect(syncedSkill).toContain('Run ce_subagent with agent="ce-plan-v2" and task="feature_description".')
    expect(fullCompareCalls).toBeGreaterThan(0)

    delete process.env.COMPOUND_ENGINEERING_HOME
  })

  test("reuses one deep source analysis pass when a synced skill rerun misses the fast path", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-source-analysis-collapse-"))
    const stateHome = path.join(tempRoot, "state-home")
    const sourceSkillDir = path.join(tempRoot, "claude-skill")
    process.env.COMPOUND_ENGINEERING_HOME = stateHome

    await fs.mkdir(path.join(sourceSkillDir, "nested"), { recursive: true })
    await fs.writeFile(path.join(sourceSkillDir, "SKILL.md"), "---\nname: docs-skill\n---\n\nBody\n")
    await fs.writeFile(path.join(sourceSkillDir, "nested", "stable.txt"), "stable\n")

    const config: ClaudeHomeConfig = {
      skills: [
        {
          name: "docs-skill",
          sourceDir: sourceSkillDir,
          skillPath: path.join(sourceSkillDir, "SKILL.md"),
        },
      ],
      mcpServers: {},
    }

    setPiPolicyFingerprintForTests("policy-v1")
    await syncToPi(config, tempRoot)
    await syncToPi(config, tempRoot)

    let sourceAnalysisCalls = 0
    setPiSkillSourceAnalysisHookForTests(() => {
      sourceAnalysisCalls += 1
    })

    setPiPolicyFingerprintForTests("policy-v2")
    await syncToPi(config, tempRoot)

    expect(sourceAnalysisCalls).toBe(1)

    delete process.env.COMPOUND_ENGINEERING_HOME
  })

  test("falls back to one planning pass when the synced skill fast-path record is malformed", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-malformed-fast-path-record-"))
    const stateHome = path.join(tempRoot, "state-home")
    const sourceSkillDir = path.join(tempRoot, "claude-skill")
    process.env.COMPOUND_ENGINEERING_HOME = stateHome

    await fs.mkdir(path.join(sourceSkillDir, "nested"), { recursive: true })
    await fs.writeFile(path.join(sourceSkillDir, "SKILL.md"), "---\nname: docs-skill\n---\n\nBody\n")
    await fs.writeFile(path.join(sourceSkillDir, "nested", "stable.txt"), "stable\n")

    const config: ClaudeHomeConfig = {
      skills: [
        {
          name: "docs-skill",
          sourceDir: sourceSkillDir,
          skillPath: path.join(sourceSkillDir, "SKILL.md"),
        },
      ],
      mcpServers: {},
    }

    await syncToPi(config, tempRoot)
    await syncToPi(config, tempRoot)

    const targetDir = path.join(tempRoot, "skills", "docs-skill")
    const recordPath = path.join(stateHome, ".compound-engineering", "pi-skill-fingerprints", createHash("sha256").update(path.resolve(targetDir)).digest("hex") + ".json")
    await fs.writeFile(recordPath, "{ invalid json\n")

    let fullCompareCalls = 0
    let sourceAnalysisCalls = 0
    setPiSkillFullCompareHookForTests(() => {
      fullCompareCalls += 1
    })
    setPiSkillSourceAnalysisHookForTests(() => {
      sourceAnalysisCalls += 1
    })

    await syncToPi(config, tempRoot)

    expect(fullCompareCalls).toBe(1)
    expect(sourceAnalysisCalls).toBe(1)

    delete process.env.COMPOUND_ENGINEERING_HOME
  })

  test("repairs drifted target content even when the source skill tree is unchanged", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-target-drift-repair-"))
    const stateHome = path.join(tempRoot, "state-home")
    const sourceSkillDir = path.join(tempRoot, "claude-skill")
    process.env.COMPOUND_ENGINEERING_HOME = stateHome

    await fs.mkdir(sourceSkillDir, { recursive: true })
    await fs.writeFile(path.join(sourceSkillDir, "SKILL.md"), "---\nname: docs-skill\n---\n\nBody\n")

    const config: ClaudeHomeConfig = {
      skills: [
        {
          name: "docs-skill",
          sourceDir: sourceSkillDir,
          skillPath: path.join(sourceSkillDir, "SKILL.md"),
        },
      ],
      mcpServers: {},
    }

    await syncToPi(config, tempRoot)
    const targetSkillPath = path.join(tempRoot, "skills", "docs-skill", "SKILL.md")
    await fs.writeFile(targetSkillPath, "drifted\n")

    let fullCompareCalls = 0
    setPiSkillFullCompareHookForTests(() => {
      fullCompareCalls += 1
    })

    await syncToPi(config, tempRoot)

    expect(await fs.readFile(targetSkillPath, "utf8")).toContain("name: docs-skill")
    expect(fullCompareCalls).toBeGreaterThan(0)

    delete process.env.COMPOUND_ENGINEERING_HOME
  })

  test("replace-path synced skill writes do not immediately rebuild fast-path analysis state", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-replace-no-postcopy-analysis-"))
    const stateHome = path.join(tempRoot, "state-home")
    const sourceSkillDir = path.join(tempRoot, "claude-skill")
    process.env.COMPOUND_ENGINEERING_HOME = stateHome

    await fs.mkdir(sourceSkillDir, { recursive: true })
    await fs.writeFile(path.join(sourceSkillDir, "SKILL.md"), "---\nname: docs-skill\n---\n\nBody\n")

    let sourceAnalysisCalls = 0
    setPiSkillSourceAnalysisHookForTests(() => {
      sourceAnalysisCalls += 1
    })

    await syncToPi({
      skills: [
        {
          name: "docs-skill",
          sourceDir: sourceSkillDir,
          skillPath: path.join(sourceSkillDir, "SKILL.md"),
        },
      ],
      mcpServers: {},
    }, tempRoot)

    expect(sourceAnalysisCalls).toBe(0)

    delete process.env.COMPOUND_ENGINEERING_HOME
  })

  test("rejects symlinked compat extension targets during sync writes", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-compat-symlink-"))
    const externalCompat = path.join(tempRoot, "external-compat.ts")
    const compatPath = path.join(tempRoot, "extensions", "compound-engineering-compat.ts")

    await fs.mkdir(path.dirname(compatPath), { recursive: true })
    await fs.writeFile(externalCompat, "external compat\n")
    await fs.symlink(externalCompat, compatPath)

    await expect(syncToPi({
      skills: [],
      commands: [
        {
          name: "plan-review",
          description: "Personal review",
          body: "Review body",
          sourcePath: path.join(tempRoot, "commands", "plan-review.md"),
        },
      ],
      mcpServers: {},
    }, tempRoot)).rejects.toThrow("Refusing to write through symlink target")

    expect(await fs.readFile(externalCompat, "utf8")).toBe("external compat\n")
  })

  test("restores prior mcporter config when publication fails after merge begins", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-mcporter-rollback-"))
    const configPath = path.join(tempRoot, "compound-engineering", "mcporter.json")

    await fs.mkdir(path.dirname(configPath), { recursive: true })
    await fs.writeFile(configPath, JSON.stringify({ mcpServers: { existing: { command: "keep" } } }, null, 2) + "\n")
    setAtomicWriteFailureHookForTests((filePath, stage) => {
      if (filePath === configPath && stage === "beforeRename") {
        throw new Error("simulated mcporter failure")
      }
    })

    await expect(syncToPi({
      skills: [],
      mcpServers: {
        context7: { url: "https://mcp.context7.com/mcp" },
      },
    }, tempRoot)).rejects.toThrow("simulated mcporter failure")

    const restored = JSON.parse(await fs.readFile(configPath, "utf8")) as { mcpServers: Record<string, { command?: string }> }
    expect(restored.mcpServers.existing?.command).toBe("keep")
    expect(restored.mcpServers.context7).toBeUndefined()
  })

  test("keeps the prior verified sync state when mcporter publication fails", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-mcporter-trust-boundary-"))
    const stateHome = path.join(tempRoot, "state-home")
    const configPath = path.join(tempRoot, "compound-engineering", "mcporter.json")
    process.env.COMPOUND_ENGINEERING_HOME = stateHome

    await syncToPi({
      skills: [],
      commands: [
        {
          name: "old-review",
          description: "Old review",
          body: "Old review body",
          sourcePath: path.join(tempRoot, "commands", "old-review.md"),
        },
      ],
      mcpServers: {},
    }, tempRoot)

    setAtomicWriteFailureHookForTests((filePath, stage) => {
      if (filePath === configPath && stage === "beforeRename") {
        throw new Error("simulated mcporter failure")
      }
    })

    await expect(syncToPi({
      skills: [],
      commands: [
        {
          name: "new-review",
          description: "New review",
          body: "New review body",
          sourcePath: path.join(tempRoot, "commands", "new-review.md"),
        },
      ],
      mcpServers: {
        context7: { url: "https://mcp.context7.com/mcp" },
      },
    }, tempRoot)).rejects.toThrow("simulated mcporter failure")

    const trust = await loadPiManagedStateWithTrust(resolvePiLayout(tempRoot, "sync"))
    expect(trust.status).toBe("verified")
    expect(trust.state?.sync.artifacts.map((artifact) => artifact.emittedName)).toEqual(["old-review"])
    expect(trust.state?.sync.mcpServers).toEqual([])
    expect(await fs.readFile(path.join(tempRoot, "prompts", "old-review.md"), "utf8")).toContain("Old review body")
    await expect(fs.access(path.join(tempRoot, "prompts", "new-review.md"))).rejects.toBeDefined()

    delete process.env.COMPOUND_ENGINEERING_HOME
  })

  test("removes newly written sync prompts when managed state commit fails", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-manifest-rollback-prompt-"))
    const stateHome = path.join(tempRoot, "state-home")
    process.env.COMPOUND_ENGINEERING_HOME = stateHome

    await syncToPi({
      skills: [],
      commands: [
        {
          name: "old-review",
          description: "Old review",
          body: "Old review body",
          sourcePath: path.join(tempRoot, "commands", "old-review.md"),
        },
      ],
      mcpServers: {},
    }, tempRoot)

    const layout = resolvePiLayout(tempRoot, "sync")
    setAtomicWriteFailureHookForTests((filePath, stage) => {
      if (filePath === layout.managedManifestPath && stage === "beforeRename") {
        throw new Error("simulated sync manifest failure")
      }
    })

    await expect(syncToPi({
      skills: [],
      commands: [
        {
          name: "new-review",
          description: "New review",
          body: "New review body",
          sourcePath: path.join(tempRoot, "commands", "new-review.md"),
        },
      ],
      mcpServers: {},
    }, tempRoot)).rejects.toThrow("simulated sync manifest failure")

    const trust = await loadPiManagedStateWithTrust(layout)
    expect(trust.status).toBe("verified")
    expect(trust.state?.sync.artifacts.map((artifact) => artifact.emittedName)).toEqual(["old-review"])
    expect(await fs.readFile(path.join(tempRoot, "prompts", "old-review.md"), "utf8")).toContain("Old review body")
    await expect(fs.access(path.join(tempRoot, "prompts", "new-review.md"))).rejects.toBeDefined()

    delete process.env.COMPOUND_ENGINEERING_HOME
  })

  test("skips dangling symlinked file assets during Pi sync materialization", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-dangling-symlink-"))
    const sourceSkillDir = path.join(tempRoot, "claude-skill")
    const missingAssetPath = path.join(tempRoot, "missing.txt")

    await fs.mkdir(sourceSkillDir, { recursive: true })
    await fs.symlink(missingAssetPath, path.join(sourceSkillDir, "asset.txt"))
    await fs.writeFile(
      path.join(sourceSkillDir, "SKILL.md"),
      [
        "---",
        "name: ce-plan",
        "description: Plan workflow",
        "---",
        "",
        "- Task compound-engineering:research:repo-research-analyst(feature_description)",
      ].join("\n"),
    )

    const config: ClaudeHomeConfig = {
      skills: [
        {
          name: "ce-plan",
          sourceDir: sourceSkillDir,
          skillPath: path.join(sourceSkillDir, "SKILL.md"),
        },
      ],
      mcpServers: {},
    }

    await syncToPi(config, tempRoot)

    const copiedSkill = await fs.readFile(path.join(tempRoot, "skills", "ce-plan", "SKILL.md"), "utf8")
    expect(copiedSkill).toContain('Run ce_subagent with agent="repo-research-analyst" and task="feature_description".')
    await expect(fs.access(path.join(tempRoot, "skills", "ce-plan", "asset.txt"))).rejects.toBeDefined()

    const skillsDir = path.join(tempRoot, "skills")
    const before = await fs.readdir(skillsDir)
    await syncToPi(config, tempRoot)
    const after = await fs.readdir(skillsDir)

    expect(before.filter((entry) => entry.startsWith("ce-plan.bak."))).toHaveLength(0)
    expect(after.filter((entry) => entry.startsWith("ce-plan.bak."))).toHaveLength(0)
  })

  test("rejects cyclic directory symlinks during Pi sync materialization", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-cycle-"))
    const sourceSkillDir = path.join(tempRoot, "claude-skill")

    await fs.mkdir(sourceSkillDir, { recursive: true })
    await fs.symlink(sourceSkillDir, path.join(sourceSkillDir, "loop"))
    await fs.writeFile(
      path.join(sourceSkillDir, "SKILL.md"),
      [
        "---",
        "name: ce-plan",
        "description: Plan workflow",
        "---",
        "",
        "# Plan",
        "",
        "- Task compound-engineering:research:repo-research-analyst(feature_description)",
      ].join("\n"),
    )

    const config: ClaudeHomeConfig = {
      skills: [
        {
          name: "ce-plan",
          sourceDir: sourceSkillDir,
          skillPath: path.join(sourceSkillDir, "SKILL.md"),
        },
      ],
      mcpServers: {},
    }

    await expect(syncToPi(config, tempRoot)).rejects.toThrow("cyclic directory symlink")
  })
})
