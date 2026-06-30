import { describe, expect, test } from "bun:test"
import {
  applyOverride,
  bumpVersion,
  detectComponentsFromFiles,
  inferBumpFromIntent,
  parseReleaseIntent,
  resolveComponentWarnings,
} from "../src/release/components"

describe("release component detection", () => {
  test("maps plugin-only changes to the matching plugin component", () => {
    const components = detectComponentsFromFiles([
      "skills/ce-plan/SKILL.md",
    ])

    expect(components.get("compound-engineering")).toEqual([
      "skills/ce-plan/SKILL.md",
    ])
    expect(components.get("marketplace")).toEqual([])
  })

  test("maps code and plugin manifest changes to the root plugin component", () => {
    const components = detectComponentsFromFiles([
      "src/commands/install.ts",
      ".claude-plugin/plugin.json",
    ])

    expect(components.get("compound-engineering")).toEqual([
      "src/commands/install.ts",
      ".claude-plugin/plugin.json",
    ])
  })

  test("maps claude marketplace metadata without bumping plugin components", () => {
    const components = detectComponentsFromFiles([".claude-plugin/marketplace.json"])
    expect(components.get("marketplace")).toEqual([".claude-plugin/marketplace.json"])
    expect(components.get("cursor-marketplace")).toEqual([])
    expect(components.get("compound-engineering")).toEqual([])
  })

  test("maps cursor marketplace metadata to cursor-marketplace component", () => {
    const components = detectComponentsFromFiles([".cursor-plugin/marketplace.json"])
    expect(components.get("cursor-marketplace")).toEqual([".cursor-plugin/marketplace.json"])
    expect(components.get("marketplace")).toEqual([])
    expect(components.get("compound-engineering")).toEqual([])
  })

  test("maps Antigravity root plugin.json to root plugin component", () => {
    const components = detectComponentsFromFiles(["plugin.json", ".agy/INSTALL.md"])

    expect(components.get("compound-engineering")).toEqual(["plugin.json", ".agy/INSTALL.md"])
    expect(components.get("marketplace")).toEqual([])
    expect(components.get("cursor-marketplace")).toEqual([])
  })

  test("maps Kimi plugin manifest to root plugin component but leaves marketplace static", () => {
    const components = detectComponentsFromFiles([
      ".kimi-plugin/plugin.json",
      ".kimi-plugin/marketplace.json",
    ])

    expect(components.get("compound-engineering")).toEqual([".kimi-plugin/plugin.json"])
    expect(components.get("marketplace")).toEqual([])
    expect(components.get("cursor-marketplace")).toEqual([])
  })
})

describe("release intent parsing", () => {
  test("parses conventional titles with optional scope and breaking marker", () => {
    const parsed = parseReleaseIntent("feat(compound-engineering)!: add review reset flow")
    expect(parsed.type).toBe("feat")
    expect(parsed.scope).toBe("compound-engineering")
    expect(parsed.breaking).toBe(true)
    expect(parsed.description).toBe("add review reset flow")
  })

  test("supports conventional titles without scope", () => {
    const parsed = parseReleaseIntent("fix: adjust ce-plan wording")
    expect(parsed.type).toBe("fix")
    expect(parsed.scope).toBeNull()
    expect(parsed.breaking).toBe(false)
  })

  test("infers bump levels from parsed intent", () => {
    expect(inferBumpFromIntent(parseReleaseIntent("feat: add release preview"))).toBe("minor")
    expect(inferBumpFromIntent(parseReleaseIntent("fix: correct preview output"))).toBe("patch")
    expect(inferBumpFromIntent(parseReleaseIntent("refactor: reshape plugin layout"))).toBeNull()
    expect(inferBumpFromIntent(parseReleaseIntent("docs: update requirements"))).toBeNull()
    expect(inferBumpFromIntent(parseReleaseIntent("refactor!: break compatibility"))).toBe("major")
  })
})

describe("override handling", () => {
  test("keeps inferred bump when override is auto", () => {
    expect(applyOverride("patch", "auto")).toBe("patch")
  })

  test("promotes inferred bump when override is explicit", () => {
    expect(applyOverride("patch", "minor")).toBe("minor")
    expect(applyOverride(null, "major")).toBe("major")
  })

  test("increments semver versions", () => {
    expect(bumpVersion("2.42.0", "patch")).toBe("2.42.1")
    expect(bumpVersion("2.42.0", "minor")).toBe("2.43.0")
    expect(bumpVersion("2.42.0", "major")).toBe("3.0.0")
  })
})

describe("scope mismatch warnings", () => {
  test("does not require scope when omitted", () => {
    const warnings = resolveComponentWarnings(
      parseReleaseIntent("fix: update ce plan copy"),
      ["compound-engineering"],
    )
    expect(warnings).toEqual([])
  })

  test("warns when explicit scope contradicts detected files", () => {
    const warnings = resolveComponentWarnings(
      parseReleaseIntent("fix(marketplace): update compound-engineering text"),
      ["compound-engineering"],
    )
    expect(warnings[0]).toContain('Optional scope "marketplace" does not match')
  })
})
