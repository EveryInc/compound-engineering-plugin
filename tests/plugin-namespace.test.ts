import { describe, expect, test } from "bun:test"
import {
  DEFAULT_PLUGIN_NAMESPACE,
  KNOWN_PLUGIN_NAMESPACES,
  namespacedSkillsDir,
  PLUGIN_NAMESPACE,
} from "../src/utils/plugin-namespace"

describe("KNOWN_PLUGIN_NAMESPACES", () => {
  test("includes both shipped plugins", () => {
    expect(KNOWN_PLUGIN_NAMESPACES).toContain("compound-engineering")
    expect(KNOWN_PLUGIN_NAMESPACES).toContain("coding-tutor")
  })

  test("includes the default namespace", () => {
    expect(KNOWN_PLUGIN_NAMESPACES).toContain(DEFAULT_PLUGIN_NAMESPACE)
  })
})

describe("namespacedSkillsDir", () => {
  test("joins the default plugin namespace onto the skills root", () => {
    expect(PLUGIN_NAMESPACE).toBe(DEFAULT_PLUGIN_NAMESPACE)
    expect(namespacedSkillsDir("/tmp/.codex/skills")).toBe(
      `/tmp/.codex/skills/${PLUGIN_NAMESPACE}`,
    )
  })

  test("uses the current plugin name instead of the default namespace", () => {
    expect(namespacedSkillsDir("/tmp/.codex/skills", "coding-tutor")).toBe(
      "/tmp/.codex/skills/coding-tutor",
    )
  })

  test("sanitizes the plugin name for filesystem use", () => {
    expect(namespacedSkillsDir("/tmp/.codex/skills", "team plugin:v2")).toBe(
      "/tmp/.codex/skills/team-plugin-v2",
    )
  })
})
