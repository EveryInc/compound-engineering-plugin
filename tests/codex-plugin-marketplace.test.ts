import { access, readFile } from "fs/promises"
import path from "path"
import { describe, expect, test } from "bun:test"

type PluginManifest = {
  name: string
  version: string
  description: string
  author?: {
    name?: string
    email?: string
    url?: string
  }
  homepage?: string
  repository?: string
  license?: string
  keywords?: string[]
  skills?: string
  mcpServers?: string
  interface?: {
    displayName?: string
    shortDescription?: string
    longDescription?: string
    developerName?: string
    category?: string
    capabilities?: string[]
    websiteURL?: string
  }
}

type Marketplace = {
  name: string
  interface?: {
    displayName?: string
  }
  plugins: Array<{
    name: string
    source: {
      source: string
      path: string
    }
    policy: {
      installation: string
      authentication: string
    }
    category: string
  }>
}

const REPO_ROOT = process.cwd()
const CODEX_MARKETPLACE_PATH = path.join(REPO_ROOT, ".agents", "plugins", "marketplace.json")

async function readJsonFile<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T
}

async function expectPathExists(filePath: string): Promise<void> {
  await access(filePath)
}

describe("native Codex plugin metadata", () => {
  test("repo marketplace lists local plugin entries with valid relative paths", async () => {
    const marketplace = await readJsonFile<Marketplace>(CODEX_MARKETPLACE_PATH)

    expect(marketplace.name).toBe("compound-engineering")
    expect(marketplace.interface?.displayName).toBe("Compound Engineering")
    expect(marketplace.plugins.map((plugin) => plugin.name).sort()).toEqual([
      "coding-tutor",
      "compound-engineering",
    ])

    for (const plugin of marketplace.plugins) {
      expect(plugin.source.source).toBe("local")
      expect(plugin.source.path.startsWith("./")).toBe(true)
      expect(plugin.policy.installation).toBe("AVAILABLE")
      expect(plugin.policy.authentication).toBe("ON_INSTALL")
      expect(plugin.category.length).toBeGreaterThan(0)

      const pluginRoot = path.join(REPO_ROOT, plugin.source.path.slice(2))
      await expectPathExists(pluginRoot)
      await expectPathExists(path.join(pluginRoot, ".codex-plugin", "plugin.json"))
    }
  })

  test("compound-engineering codex manifest stays aligned with the existing plugin metadata", async () => {
    const codexManifestPath = path.join(
      REPO_ROOT,
      "plugins",
      "compound-engineering",
      ".codex-plugin",
      "plugin.json",
    )
    const claudeManifestPath = path.join(
      REPO_ROOT,
      "plugins",
      "compound-engineering",
      ".claude-plugin",
      "plugin.json",
    )

    const codexManifest = await readJsonFile<PluginManifest>(codexManifestPath)
    const claudeManifest = await readJsonFile<PluginManifest>(claudeManifestPath)

    expect(codexManifest.name).toBe(claudeManifest.name)
    expect(codexManifest.version).toBe(claudeManifest.version)
    expect(codexManifest.description).toBe(claudeManifest.description)
    expect(codexManifest.skills).toBe("./skills/")
    expect(codexManifest.mcpServers).toBe("./.mcp.json")
    expect(codexManifest.interface?.displayName).toBe("Compound Engineering")
    expect(codexManifest.interface?.developerName).toBe("Kieran Klaassen")
    expect(codexManifest.interface?.category).toBe("Developer Tools")
  })

  test("coding-tutor codex manifest packages its skills without requiring extra surfaces", async () => {
    const codexManifestPath = path.join(
      REPO_ROOT,
      "plugins",
      "coding-tutor",
      ".codex-plugin",
      "plugin.json",
    )
    const claudeManifestPath = path.join(
      REPO_ROOT,
      "plugins",
      "coding-tutor",
      ".claude-plugin",
      "plugin.json",
    )

    const codexManifest = await readJsonFile<PluginManifest>(codexManifestPath)
    const claudeManifest = await readJsonFile<PluginManifest>(claudeManifestPath)

    expect(codexManifest.name).toBe(claudeManifest.name)
    expect(codexManifest.version).toBe(claudeManifest.version)
    expect(codexManifest.description).toBe(claudeManifest.description)
    expect(codexManifest.skills).toBe("./skills/")
    expect(codexManifest.mcpServers).toBeUndefined()
    expect(codexManifest.interface?.displayName).toBe("Coding Tutor")
    expect(codexManifest.interface?.category).toBe("Education")
  })
})
