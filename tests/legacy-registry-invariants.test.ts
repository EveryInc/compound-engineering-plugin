import { describe, expect, test } from "bun:test"
import fs from "fs/promises"
import path from "path"
import { getLegacyPluginArtifacts } from "../src/data/plugin-legacy-artifacts"
import { STALE_SKILL_DIRS } from "../src/utils/legacy-cleanup"

// If a previously-retired skill is re-added to the plugin, its entry must be
// removed from both legacy registries in the same PR. Leaving the entry in
// place causes `cleanupStaleSkillDirs()` to fingerprint-match the
// just-installed skill and delete it on every `bun install --to <target>`
// (the writer recreates it, but the churn is wrong and fragile). The registry
// entry is also meaningless: the name now lives in the plugin, so no user has
// a "stale" version of it.

const PLUGIN_ROOT = path.join(import.meta.dir, "..", "plugins", "compound-engineering")

async function listCurrentSkillDirs(): Promise<Set<string>> {
  const entries = await fs.readdir(path.join(PLUGIN_ROOT, "skills"), { withFileTypes: true })
  return new Set(entries.filter((e) => e.isDirectory()).map((e) => e.name))
}

describe("legacy registry invariants", () => {
  test("STALE_SKILL_DIRS contains no name matching a current plugin skill", async () => {
    const current = await listCurrentSkillDirs()
    const collisions = STALE_SKILL_DIRS.filter((name) => current.has(name))
    expect(collisions).toEqual([])
  })

  test("EXTRA_LEGACY_ARTIFACTS skills list contains no name matching a current plugin skill", async () => {
    const current = await listCurrentSkillDirs()
    const { skills = [] } = getLegacyPluginArtifacts("compound-engineering")
    const collisions = skills.filter((name) => current.has(name))
    expect(collisions).toEqual([])
  })
})
