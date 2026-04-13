import { describe, expect, test } from "bun:test"
import { promises as fs } from "fs"
import os from "os"
import path from "path"
import {
  findStaleFlatSkills,
  removeStaleFlatSkills,
} from "../src/cleanup/legacy-skills"
import {
  getSyncTarget,
  resolveSyncSkillsRoot,
  syncTargetNames,
} from "../src/sync/registry"
import { DEFAULT_PLUGIN_NAMESPACE, KNOWN_PLUGIN_NAMESPACES } from "../src/utils/plugin-namespace"

async function exists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath)
    return true
  } catch {
    return false
  }
}

describe("legacy skill cleanup", () => {
  test("dry-run reports stale flat directories and symlinks without deleting", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cleanup-dry-run-"))
    const skillsRoot = path.join(tempRoot, "skills")
    const namespacedRoot = path.join(skillsRoot, DEFAULT_PLUGIN_NAMESPACE)
    await fs.mkdir(namespacedRoot, { recursive: true })

    await fs.mkdir(path.join(skillsRoot, "skill-directory"), { recursive: true })
    await fs.mkdir(path.join(namespacedRoot, "skill-directory"), { recursive: true })

    const symlinkSource = path.join(tempRoot, "symlink-source")
    await fs.mkdir(symlinkSource, { recursive: true })
    await fs.symlink(symlinkSource, path.join(skillsRoot, "skill-link"))
    await fs.symlink(symlinkSource, path.join(namespacedRoot, "skill-link"))

    const result = await removeStaleFlatSkills(skillsRoot, { dryRun: true })
    const entries = result.staleEntries.map((entry) => ({
      name: path.basename(entry.path),
      type: entry.type,
    }))

    expect(entries).toContainEqual({ name: "skill-directory", type: "directory" })
    expect(entries).toContainEqual({ name: "skill-link", type: "symlink" })
    expect(result.removed).toHaveLength(0)
    expect(result.skipped).toHaveLength(0)
    expect(await exists(path.join(skillsRoot, "skill-directory"))).toBe(true)
    expect(await exists(path.join(skillsRoot, "skill-link"))).toBe(true)
  })

  test("execute removes stale flat entries when namespaced copies exist", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cleanup-execute-"))
    const skillsRoot = path.join(tempRoot, "skills")
    const namespacedRoot = path.join(skillsRoot, DEFAULT_PLUGIN_NAMESPACE)
    await fs.mkdir(namespacedRoot, { recursive: true })

    await fs.mkdir(path.join(skillsRoot, "copy-skill"), { recursive: true })
    await fs.mkdir(path.join(namespacedRoot, "copy-skill"), { recursive: true })

    const symlinkSource = path.join(tempRoot, "shared-source")
    await fs.mkdir(symlinkSource, { recursive: true })
    await fs.symlink(symlinkSource, path.join(skillsRoot, "linked-skill"))
    await fs.symlink(symlinkSource, path.join(namespacedRoot, "linked-skill"))

    const result = await removeStaleFlatSkills(skillsRoot, { dryRun: false })

    expect(result.removed).toContain(path.join(skillsRoot, "copy-skill"))
    expect(result.removed).toContain(path.join(skillsRoot, "linked-skill"))
    expect(await exists(path.join(skillsRoot, "copy-skill"))).toBe(false)
    expect(await exists(path.join(skillsRoot, "linked-skill"))).toBe(false)
    expect(await exists(path.join(namespacedRoot, "copy-skill"))).toBe(true)
    expect(await exists(path.join(namespacedRoot, "linked-skill"))).toBe(true)
  })

  test("does not remove symlinks that point to a different source than the namespaced entry", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cleanup-mismatch-"))
    const skillsRoot = path.join(tempRoot, "skills")
    const namespacedRoot = path.join(skillsRoot, DEFAULT_PLUGIN_NAMESPACE)
    await fs.mkdir(namespacedRoot, { recursive: true })

    const namespacedSource = path.join(tempRoot, "namespaced-source")
    const flatSource = path.join(tempRoot, "flat-source")
    await fs.mkdir(namespacedSource, { recursive: true })
    await fs.mkdir(flatSource, { recursive: true })

    await fs.symlink(namespacedSource, path.join(namespacedRoot, "skill-link"))
    await fs.symlink(flatSource, path.join(skillsRoot, "skill-link"))

    const stale = await findStaleFlatSkills(skillsRoot)
    expect(stale).toHaveLength(0)

    const result = await removeStaleFlatSkills(skillsRoot, { dryRun: false })
    expect(result.staleEntries).toHaveLength(0)
    expect(result.removed).toHaveLength(0)
    expect(await exists(path.join(skillsRoot, "skill-link"))).toBe(true)
  })

  test("skips cleanup when no namespaced directory is present", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cleanup-no-namespace-"))
    const skillsRoot = path.join(tempRoot, "skills")
    await fs.mkdir(path.join(skillsRoot, "legacy-skill"), { recursive: true })

    const result = await removeStaleFlatSkills(skillsRoot, { dryRun: false })
    expect(result.staleEntries).toHaveLength(0)
    expect(result.removed).toHaveLength(0)
    expect(await exists(path.join(skillsRoot, "legacy-skill"))).toBe(true)
  })

  test("skip list preserves named entries and reports them as protected", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cleanup-skip-"))
    const skillsRoot = path.join(tempRoot, "skills")
    const namespacedRoot = path.join(skillsRoot, DEFAULT_PLUGIN_NAMESPACE)
    await fs.mkdir(namespacedRoot, { recursive: true })

    // Flat + namespaced for both names
    await fs.mkdir(path.join(skillsRoot, "protect-me"), { recursive: true })
    await fs.mkdir(path.join(namespacedRoot, "protect-me"), { recursive: true })
    await fs.mkdir(path.join(skillsRoot, "remove-me"), { recursive: true })
    await fs.mkdir(path.join(namespacedRoot, "remove-me"), { recursive: true })

    const result = await removeStaleFlatSkills(skillsRoot, {
      dryRun: false,
      skip: ["protect-me"],
    })

    // protect-me should be reported as protected, not stale, and still exist
    expect(result.protectedEntries.map((e) => path.basename(e.path))).toContain("protect-me")
    expect(result.staleEntries.map((e) => path.basename(e.path))).not.toContain("protect-me")
    expect(await exists(path.join(skillsRoot, "protect-me"))).toBe(true)

    // remove-me should be removed
    expect(result.removed).toContain(path.join(skillsRoot, "remove-me"))
    expect(await exists(path.join(skillsRoot, "remove-me"))).toBe(false)

    // Namespaced copies untouched
    expect(await exists(path.join(namespacedRoot, "protect-me"))).toBe(true)
    expect(await exists(path.join(namespacedRoot, "remove-me"))).toBe(true)
  })

  test("skip list with all stale names reports nothing to remove", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cleanup-skip-all-"))
    const skillsRoot = path.join(tempRoot, "skills")
    const namespacedRoot = path.join(skillsRoot, DEFAULT_PLUGIN_NAMESPACE)
    await fs.mkdir(namespacedRoot, { recursive: true })

    await fs.mkdir(path.join(skillsRoot, "only-skill"), { recursive: true })
    await fs.mkdir(path.join(namespacedRoot, "only-skill"), { recursive: true })

    const result = await removeStaleFlatSkills(skillsRoot, {
      dryRun: false,
      skip: new Set(["only-skill"]),
    })

    expect(result.staleEntries).toHaveLength(0)
    expect(result.protectedEntries).toHaveLength(1)
    expect(result.removed).toHaveLength(0)
    expect(await exists(path.join(skillsRoot, "only-skill"))).toBe(true)
  })

  test("empty skip list behaves identically to no skip option", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cleanup-skip-empty-"))
    const skillsRoot = path.join(tempRoot, "skills")
    const namespacedRoot = path.join(skillsRoot, DEFAULT_PLUGIN_NAMESPACE)
    await fs.mkdir(namespacedRoot, { recursive: true })

    await fs.mkdir(path.join(skillsRoot, "skill"), { recursive: true })
    await fs.mkdir(path.join(namespacedRoot, "skill"), { recursive: true })

    const result = await removeStaleFlatSkills(skillsRoot, {
      dryRun: false,
      skip: [],
    })

    expect(result.protectedEntries).toHaveLength(0)
    expect(result.removed).toContain(path.join(skillsRoot, "skill"))
  })

  test("resolveSyncSkillsRoot returns a path for every namespaced install target and null for openclaw", () => {
    const home = "/fake/home"
    const cwd = "/fake/cwd"

    // Openclaw's install path writes into an isolated extensions/<plugin>/
    // package that cleanup never scans. Sync writes user-owned content and is
    // not namespaced. So there is no legacy cleanup scope for openclaw.
    const excluded = new Set(["openclaw"])

    for (const name of syncTargetNames) {
      const target = getSyncTarget(name)
      const resolved = resolveSyncSkillsRoot(target, home, cwd)

      if (excluded.has(name)) {
        expect(resolved).toBeNull()
      } else {
        expect(resolved).not.toBeNull()
        expect(resolved).toContain("skills")
      }
    }
  })

  test("finds stale flat skills across multiple plugin namespaces", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cleanup-multi-ns-"))
    const skillsRoot = path.join(tempRoot, "skills")

    for (const ns of KNOWN_PLUGIN_NAMESPACES) {
      const namespacedRoot = path.join(skillsRoot, ns)
      await fs.mkdir(path.join(namespacedRoot, `${ns}-skill`), { recursive: true })
      await fs.mkdir(path.join(skillsRoot, `${ns}-skill`), { recursive: true })
    }

    const allStale: string[] = []
    for (const ns of KNOWN_PLUGIN_NAMESPACES) {
      const result = await removeStaleFlatSkills(skillsRoot, {
        dryRun: false,
        pluginNamespace: ns,
      })
      allStale.push(...result.removed)
    }

    expect(allStale).toHaveLength(KNOWN_PLUGIN_NAMESPACES.length)
    for (const ns of KNOWN_PLUGIN_NAMESPACES) {
      expect(allStale).toContain(path.join(skillsRoot, `${ns}-skill`))
      expect(await exists(path.join(skillsRoot, `${ns}-skill`))).toBe(false)
      expect(await exists(path.join(skillsRoot, ns, `${ns}-skill`))).toBe(true)
    }
  })
})
