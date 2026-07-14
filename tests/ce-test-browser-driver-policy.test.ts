import { readFile } from "fs/promises"
import path from "path"
import { describe, expect, test } from "bun:test"

async function readRepoFile(relativePath: string): Promise<string> {
  return readFile(path.join(process.cwd(), relativePath), "utf8")
}

describe("ce-test-browser browser-driver policy", () => {
  test("prefers a capable host-native browser and falls back to agent-browser", async () => {
    const content = await readRepoFile("skills/ce-test-browser/SKILL.md")

    expect(content).toMatch(/prefer.+host-native.+integrated browser/is)
    expect(content).toMatch(/embedded in or directly owned by the active harness/i)
    expect(content).toMatch(/fall back to `agent-browser`/i)
    expect(content).toMatch(/one driver.+entire run/is)
    expect(content).toContain("references/agent-browser-driver.md")

    expect(content).not.toContain("## Use `agent-browser` Only")
    expect(content).not.toContain("always choose `agent-browser`")
    expect(content).not.toContain("this skill cannot function without it")
  })

  test("distinguishes host-native APIs from prohibited standalone substitutes", async () => {
    const content = await readRepoFile("skills/ce-test-browser/SKILL.md")

    expect(content).toMatch(/Playwright API.+host-native/is)
    expect(content).toMatch(/standalone Playwright.+Puppeteer/is)
    expect(content).toMatch(/separately configured browser extension/i)
    expect(content).toMatch(/ad hoc browser automation/i)
  })

  test("keeps the agent-browser fallback operational and version-matched", async () => {
    const fallback = await readRepoFile(
      "skills/ce-test-browser/references/agent-browser-driver.md",
    )

    expect(fallback).toContain("command -v agent-browser")
    expect(fallback).toContain("agent-browser skills get core")
    expect(fallback).toMatch(/CLI exists but cannot launch its browser/i)
    expect(fallback).toContain("agent-browser open <url>")
    expect(fallback).toMatch(/use the `ce-setup` skill/i)
    expect(fallback).not.toContain("/ce-setup")
  })

  test("pipeline mode changes orchestration without forcing a driver or hiding it", async () => {
    const content = await readRepoFile(
      "skills/ce-test-browser/references/pipeline-orchestration.md",
    )

    expect(content).toMatch(/does not change browser-driver selection/i)
    expect(content).toMatch(/unattended.+does not mean hidden/is)
    expect(content).toMatch(/visible.+non-blocking/is)
    expect(content).not.toContain("subsequent `agent-browser` command")
    expect(content).not.toContain("never pass `--headed`")
  })

  test("user documentation describes the same hierarchy", async () => {
    const docs = await readRepoFile("docs/skills/ce-test-browser.md")
    const catalog = await readRepoFile("docs/skills/README.md")

    expect(docs).toMatch(/host-native.+integrated browser/is)
    expect(docs).toMatch(/embedded in or directly owned by the active harness/i)
    expect(docs).toMatch(/fall back to `agent-browser`/i)
    expect(docs).toMatch(/standalone Playwright.+Puppeteer/is)
    expect(docs).toMatch(/separately configured browser extensions or MCPs/i)
    expect(docs).toMatch(/visible.+non-blocking/is)
    expect(catalog).toMatch(/host-native browser.+`agent-browser` fallback/i)
  })
})
