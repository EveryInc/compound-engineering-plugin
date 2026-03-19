import { describe, expect, test } from "bun:test"
import { validateReleasePleaseConfig } from "../src/release/config"

describe("release-please config validation", () => {
  test("rejects upward-relative changelog paths", () => {
    const errors = validateReleasePleaseConfig({
      packages: {
        ".": {
          "changelog-path": "CHANGELOG.md",
        },
        "plugins/compound-engineering": {
          "changelog-path": "../../CHANGELOG.md",
        },
      },
    })

    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('Package "plugins/compound-engineering"')
    expect(errors[0]).toContain("../../CHANGELOG.md")
  })

  test("allows package-local changelog paths and skipped changelogs", () => {
    const errors = validateReleasePleaseConfig({
      packages: {
        ".": {
          "changelog-path": "CHANGELOG.md",
        },
        "plugins/compound-engineering": {
          "skip-changelog": true,
        },
        ".claude-plugin": {
          "changelog-path": "CHANGELOG.md",
        },
      },
    })

    expect(errors).toEqual([])
  })
})
