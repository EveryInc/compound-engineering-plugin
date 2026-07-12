import { describe, expect, test } from "bun:test"
import { readFileSync } from "fs"
import path from "path"
import { getVersionInfo } from "../integrations/orca/version.mjs"
import { validateReleasePleaseConfig } from "../src/release/config"

describe("release-please config validation", () => {
  test("rejects upward-relative changelog paths", () => {
    const errors = validateReleasePleaseConfig({
      packages: {
        ".": {
          "changelog-path": "CHANGELOG.md",
        },
        "packages/example": {
          "changelog-path": "../../CHANGELOG.md",
        },
      },
    })

    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('Package "packages/example"')
    expect(errors[0]).toContain("../../CHANGELOG.md")
  })

  test("allows package-local changelog paths and skipped changelogs", () => {
    const errors = validateReleasePleaseConfig({
      packages: {
        ".": {
          "changelog-path": "CHANGELOG.md",
        },
        "packages/example": {
          "skip-changelog": true,
        },
        ".claude-plugin": {
          "changelog-path": "CHANGELOG.md",
        },
      },
    })

    expect(errors).toEqual([])
  })

  // The `manifest` argument is the released (base-branch) version, so an
  // at-or-below pin means the release already shipped -- the pin is stale.
  test("rejects a stale release-as pin that is not ahead of the released version", () => {
    const errors = validateReleasePleaseConfig(
      {
        packages: {
          ".claude-plugin": { "release-as": "1.0.2" },
          ".cursor-plugin": { "release-as": "1.0.0" },
        },
      },
      {
        ".claude-plugin": "1.0.2",
        ".cursor-plugin": "1.0.1",
      },
    )

    expect(errors).toHaveLength(2)
    expect(errors[0]).toContain('Package ".claude-plugin"')
    expect(errors[0]).toContain("stale")
    expect(errors[0]).toContain("1.0.2")
    expect(errors[1]).toContain('Package ".cursor-plugin"')
    expect(errors[1]).toContain("1.0.0")
  })

  // A forward pin is ahead of the released version. This is also the state of an
  // in-flight release-please PR when compared against the base manifest (the
  // release has not shipped yet), so it must pass.
  test("allows a forward release-as pin that is ahead of the released version", () => {
    const errors = validateReleasePleaseConfig(
      {
        packages: {
          ".claude-plugin": { "release-as": "1.0.3" },
          ".cursor-plugin": { "release-as": "1.0.2" },
        },
      },
      {
        ".claude-plugin": "1.0.2",
        ".cursor-plugin": "1.0.1",
      },
    )

    expect(errors).toEqual([])
  })

  test("orders Orca fork revisions after their stable upstream baseline", () => {
    expect(validateReleasePleaseConfig(
      { packages: { ".": { "release-as": "3.19.0-orca.1" } } },
      { ".": "3.19.0" },
    )).toEqual([])

    expect(validateReleasePleaseConfig(
      { packages: { ".": { "release-as": "3.19.0-orca.2" } } },
      { ".": "3.19.0-orca.1" },
    )).toEqual([])

    expect(validateReleasePleaseConfig(
      { packages: { ".": { "release-as": "3.19.0-orca.1" } } },
      { ".": "3.19.0-orca.1" },
    )[0]).toContain("stale")
  })

  // No released baseline (e.g. the base manifest could not be read) means
  // staleness is unprovable, so the pin is allowed rather than risk blocking a
  // legitimate release.
  test("allows a release-as pin when the released version is unknown", () => {
    const errors = validateReleasePleaseConfig({
      packages: {
        ".": {
          "release-as": "3.0.2",
        },
      },
    })

    expect(errors).toEqual([])
  })

  test("current root package skips changelog generation", () => {
    const configPath = path.join(import.meta.dir, "..", ".github", "release-please-config.json")
    const config = JSON.parse(readFileSync(configPath, "utf8")) as {
      packages: Record<string, { "skip-changelog"?: boolean }>
    }

    expect(config.packages["."]?.["skip-changelog"]).toBe(true)
  })

  test("current root package includes refactors in generated release notes", () => {
    const configPath = path.join(import.meta.dir, "..", ".github", "release-please-config.json")
    const config = JSON.parse(readFileSync(configPath, "utf8")) as {
      packages: Record<string, { "changelog-sections"?: Array<{ type: string; section: string; hidden?: boolean }> }>
    }

    expect(config.packages["."]?.["changelog-sections"]).toContainEqual({
      type: "refactor",
      section: "Refactoring",
      hidden: false,
    })
  })

  test("current root package pins the exact fork identity until that release ships", async () => {
    const configPath = path.join(import.meta.dir, "..", ".github", "release-please-config.json")
    const manifestPath = path.join(import.meta.dir, "..", ".github", ".release-please-manifest.json")
    const config = JSON.parse(readFileSync(configPath, "utf8")) as {
      packages: Record<string, { "release-as"?: string }>
    }
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<string, string>
    const expected = (await getVersionInfo()).version
    const releaseAs = config.packages["."]?.["release-as"]

    if (manifest["."] === expected) {
      expect([undefined, expected]).toContain(releaseAs)
    } else {
      expect(releaseAs).toBe(expected)
    }
  })
})
