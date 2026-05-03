import { describe, expect, test } from "bun:test"
import fs from "fs/promises"
import path from "path"
import { STALE_SKILL_DIRS } from "../src/utils/legacy-cleanup"

// If a previously-retired skill is re-added to the plugin, its entry must be
// removed from STALE_SKILL_DIRS in the same PR. Leaving the entry in place
// causes `cleanupStaleSkillDirs()` to fingerprint-match the just-installed
// skill (the live plugin description becomes the fingerprint) and delete it
// on every `bun install --to <target>` before the writer re-creates it.
//
// The sibling registry `EXTRA_LEGACY_ARTIFACTS_BY_PLUGIN["compound-engineering"].skills`
// is NOT covered by this invariant: it can legitimately contain names of
// current skills whose FLAT install path is stale (e.g. `ce-update`, which
// now installs at `~/.codex/skills/compound-engineering/ce-update` but had a
// pre-namespaced flat install at `~/.codex/skills/ce-update`). Sweeping the
// flat path is correct even while the skill is current.

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
})
