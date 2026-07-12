import { describe, expect, test } from "bun:test"
import { execFileSync } from "node:child_process"
import { promises as fs } from "node:fs"
import path from "node:path"

const REPO_ROOT = path.resolve(import.meta.dir, "..")

async function readJson<T>(relativePath: string): Promise<T> {
  return JSON.parse(await fs.readFile(path.join(REPO_ROOT, relativePath), "utf8")) as T
}

async function listFiles(directory: string, prefix = ""): Promise<string[]> {
  const entries = await fs.readdir(directory, { withFileTypes: true })
  const files = await Promise.all(entries.map(async (entry) => {
    const relative = path.posix.join(prefix, entry.name)
    if (entry.isDirectory()) return listFiles(path.join(directory, entry.name), relative)
    return [relative]
  }))
  return files.flat().sort()
}

describe("CE-Orca packaging", () => {
  test("pins the released Orca protocol contract", async () => {
    const protocol = await readJson<{
      schema: string
      orca: {
        protocol: string
        envelopes: { probe: string; capabilities: string }
        requestVersions: string[]
        requiredCapabilities: {
          lifecycleWait: boolean
          confidentialPacketDelivery: string
          confidentialPacketSourceConsumption: string
          artifactRead: boolean
        }
      }
      integration: {
        workflowCoverage: Record<string, { mode: string; controller: string }>
      }
    }>("integrations/orca/protocol.json")

    expect(protocol.schema).toBe("ce-orca.protocol-compatibility/v1")
    expect(protocol.orca).toEqual({
      protocol: "orca.local-protocol/v1",
      envelopes: {
        probe: "orca.probe/v1",
        capabilities: "orca.capabilities/v1",
      },
      requestVersions: ["orca.execution-config/v1"],
      requiredCapabilities: {
        lifecycleWait: true,
        confidentialPacketDelivery: "in-memory-consume-v1",
        confidentialPacketSourceConsumption: "explicit-one-shot-v1",
        artifactRead: true,
      },
    })
    expect(protocol.integration.workflowCoverage).toEqual(Object.fromEntries(
      [
        "ce-code-review",
        "ce-compound",
        "ce-debug",
        "ce-doc-review",
        "ce-plan",
        "ce-simplify-code",
        "ce-work",
        "lfg",
      ].map((workflow) => [workflow, {
        mode: "mixed",
        controller: workflow === "lfg" ? "lfg-controller" : "ce-controller",
      }]),
    ))
  })

  test("keeps confidential packets memory-only for every registered first-wave workflow", async () => {
    for (const workflow of [
      "code-review.mjs",
      "compound.mjs",
      "debug.mjs",
      "doc-review.mjs",
      "lfg.mjs",
      "plan.mjs",
      "simplify-review.mjs",
      "work.mjs",
    ]) {
      const source = await fs.readFile(
        path.join(REPO_ROOT, "integrations", "orca", "workflows", workflow),
        "utf8",
      )
      expect(source, workflow).toContain("consumeConfidentialPacketJson()")
      expect(source, workflow).not.toContain("ORCH_PACKET_FILE")
    }
  })

  test("ships every declared integration asset from both native package roots", async () => {
    const protocol = await readJson<{
      distribution: { packageRoot: string; requiredAssets: string[] }
    }>("integrations/orca/protocol.json")
    const claudeMarketplace = await readJson<{
      plugins: Array<{ name: string; source: string }>
    }>(".claude-plugin/marketplace.json")
    const codexMarketplace = await readJson<{
      plugins: Array<{
        name: string
        source: { source: string; url: string }
      }>
    }>(".agents/plugins/marketplace.json")

    expect(protocol.distribution.packageRoot).toBe(".")
    expect(claudeMarketplace.plugins.find((plugin) => plugin.name === "compound-engineering")?.source).toBe("./")
    expect(codexMarketplace.plugins.find((plugin) => plugin.name === "compound-engineering")?.source).toEqual({
      source: "url",
      url: "https://github.com/ethras/compound-engineering-orca.git",
    })

    for (const asset of protocol.distribution.requiredAssets) {
      expect((await fs.stat(path.join(REPO_ROOT, asset))).isFile(), asset).toBe(true)
    }
    const declared = protocol.distribution.requiredAssets
      .map((asset) => path.posix.relative("integrations/orca", asset))
      .sort()
    expect(declared).toEqual(await listFiles(path.join(REPO_ROOT, "integrations", "orca")))
  })

  test("keeps Claude and Codex native skill identity aligned with upstream", async () => {
    const upstream = await readJson<{ version: string }>("integrations/orca/upstream.json")
    const packageJson = await readJson<{ version: string; repository: string }>("package.json")
    const claude = await readJson<{ name: string; version: string; repository: string }>(".claude-plugin/plugin.json")
    const codex = await readJson<{
      name: string
      version: string
      skills: string
      repository: string
      interface: { websiteURL: string }
    }>(".codex-plugin/plugin.json")

    const claudeVersion = claude.version
    const codexVersion = codex.version
    expect(new Set([packageJson.version, claudeVersion, codexVersion]).size).toBe(1)
    expect([upstream.version, `${upstream.version}-orca.1`]).toContain(packageJson.version)
    expect(packageJson.repository).toBe("https://github.com/ethras/compound-engineering-orca")
    expect(claude).toMatchObject({
      name: "compound-engineering",
      version: packageJson.version,
      repository: "https://github.com/ethras/compound-engineering-orca",
    })
    expect(codex).toMatchObject({
      name: "compound-engineering",
      version: packageJson.version,
      skills: "./skills/",
      repository: "https://github.com/ethras/compound-engineering-orca",
      interface: {
        websiteURL: "https://github.com/ethras/compound-engineering-orca",
      },
    })
  })

  test("keeps required integration assets tracked in clean CI checkouts", async () => {
    if (!process.env.CI) return
    const protocol = await readJson<{ distribution: { requiredAssets: string[] } }>(
      "integrations/orca/protocol.json",
    )
    const tracked = new Set(execFileSync("git", ["ls-files"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
    }).trim().split("\n"))

    for (const asset of protocol.distribution.requiredAssets) {
      expect(tracked.has(asset), `${asset} must be committed for native plugin packages`).toBe(true)
    }
  })

  test("reports a fork release identity with upstream provenance", async () => {
    const packageJson = await readJson<{ scripts: Record<string, string> }>("package.json")
    const upstreamBaseline = await readJson<{
      repository: string
      version: string
      commit: string
    }>("integrations/orca/upstream.json")
    const upstream = {
      repository: upstreamBaseline.repository,
      version: upstreamBaseline.version,
      commit: upstreamBaseline.commit,
    }
    expect(packageJson.scripts["orca:version"]).toBe("bun integrations/orca/version.mjs")

    const stdout = execFileSync("bun", ["integrations/orca/version.mjs"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
    })
    expect(JSON.parse(stdout)).toEqual({
      name: "compound-engineering-orca",
      version: "3.19.0-orca.1",
      upstream,
      integrationRevision: 1,
      orca: {
        protocol: "orca.local-protocol/v1",
        requestVersions: ["orca.execution-config/v1"],
      },
    })
  })
})
