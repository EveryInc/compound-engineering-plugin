import { mkdtemp, mkdir, writeFile } from "fs/promises"
import os from "os"
import path from "path"
import { afterEach, describe, expect, test } from "bun:test"
import {
  buildCompoundEngineeringDescription,
  getCompoundEngineeringCounts,
  syncReleaseMetadata,
} from "../src/release/metadata"

const tempRoots: string[] = []

afterEach(async () => {
  for (const root of tempRoots.splice(0, tempRoots.length)) {
    await Bun.$`rm -rf ${root}`.quiet()
  }
})

async function makeFixtureRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "release-metadata-"))
  tempRoots.push(root)

  await mkdir(path.join(root, "plugins", "compound-engineering", "agents", "review"), {
    recursive: true,
  })
  await mkdir(path.join(root, "plugins", "compound-engineering", "skills", "ce-plan"), {
    recursive: true,
  })
  await mkdir(path.join(root, "plugins", "compound-engineering", ".claude-plugin"), {
    recursive: true,
  })
  await mkdir(path.join(root, "plugins", "compound-engineering", ".cursor-plugin"), {
    recursive: true,
  })
  await mkdir(path.join(root, "plugins", "coding-tutor", ".claude-plugin"), {
    recursive: true,
  })
  await mkdir(path.join(root, "plugins", "coding-tutor", ".cursor-plugin"), {
    recursive: true,
  })
  await mkdir(path.join(root, ".claude-plugin"), { recursive: true })
  await mkdir(path.join(root, ".cursor-plugin"), { recursive: true })

  await writeFile(
    path.join(root, "plugins", "compound-engineering", "agents", "review", "agent.md"),
    "# Review Agent\n",
  )
  await writeFile(
    path.join(root, "plugins", "compound-engineering", "skills", "ce-plan", "SKILL.md"),
    "# ce-plan\n",
  )
  await writeFile(
    path.join(root, "plugins", "compound-engineering", ".mcp.json"),
    JSON.stringify({ mcpServers: { context7: { command: "ctx7" } } }, null, 2),
  )
  await writeFile(
    path.join(root, "plugins", "compound-engineering", ".claude-plugin", "plugin.json"),
    JSON.stringify({ version: "2.42.0", description: "old" }, null, 2),
  )
  await writeFile(
    path.join(root, "plugins", "compound-engineering", ".cursor-plugin", "plugin.json"),
    JSON.stringify({ version: "2.33.0", description: "old" }, null, 2),
  )
  await writeFile(
    path.join(root, "plugins", "coding-tutor", ".claude-plugin", "plugin.json"),
    JSON.stringify({ version: "1.2.1" }, null, 2),
  )
  await writeFile(
    path.join(root, "plugins", "coding-tutor", ".cursor-plugin", "plugin.json"),
    JSON.stringify({ version: "1.2.1" }, null, 2),
  )
  await writeFile(
    path.join(root, ".claude-plugin", "marketplace.json"),
    JSON.stringify(
      {
        metadata: { version: "1.0.0", description: "marketplace" },
        plugins: [
          { name: "compound-engineering", version: "2.41.0", description: "old" },
          { name: "coding-tutor", version: "1.2.0", description: "old" },
        ],
      },
      null,
      2,
    ),
  )
  await writeFile(
    path.join(root, ".cursor-plugin", "marketplace.json"),
    JSON.stringify(
      {
        metadata: { version: "1.0.0", description: "marketplace" },
        plugins: [
          { name: "compound-engineering", version: "2.41.0", description: "old" },
          { name: "coding-tutor", version: "1.2.0", description: "old" },
        ],
      },
      null,
      2,
    ),
  )

  return root
}

describe("release metadata", () => {
  test("reports current compound-engineering counts from the repo", async () => {
    const counts = await getCompoundEngineeringCounts(process.cwd())

    expect(counts).toEqual({
      agents: expect.any(Number),
      skills: expect.any(Number),
      mcpServers: expect.any(Number),
    })
    expect(counts.agents).toBeGreaterThan(0)
    expect(counts.skills).toBeGreaterThan(0)
    expect(counts.mcpServers).toBeGreaterThanOrEqual(0)
  })

  test("builds a stable compound-engineering manifest description", async () => {
    const description = await buildCompoundEngineeringDescription(process.cwd())

    expect(description).toBe(
      "AI-powered development tools for code review, research, design, and workflow automation.",
    )
  })

  test("detects cross-surface version drift even without explicit override versions", async () => {
    const root = await makeFixtureRoot()
    const result = await syncReleaseMetadata({ root, write: false })
    const changedPaths = result.updates.filter((update) => update.changed).map((update) => update.path)

    expect(changedPaths).toContain(path.join(root, "plugins", "compound-engineering", ".cursor-plugin", "plugin.json"))
    expect(changedPaths).toContain(path.join(root, ".claude-plugin", "marketplace.json"))
    expect(changedPaths).toContain(path.join(root, ".cursor-plugin", "marketplace.json"))
  })
})
