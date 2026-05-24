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
  await mkdir(path.join(root, "plugins", "compound-engineering", ".codex-plugin"), {
    recursive: true,
  })
  await mkdir(path.join(root, "plugins", "coding-tutor", "skills", "coding-tutor"), {
    recursive: true,
  })
  await mkdir(path.join(root, "plugins", "coding-tutor", ".claude-plugin"), {
    recursive: true,
  })
  await mkdir(path.join(root, "plugins", "coding-tutor", ".cursor-plugin"), {
    recursive: true,
  })
  await mkdir(path.join(root, "plugins", "coding-tutor", ".codex-plugin"), {
    recursive: true,
  })
  await mkdir(path.join(root, ".claude-plugin"), { recursive: true })
  await mkdir(path.join(root, ".cursor-plugin"), { recursive: true })
  await mkdir(path.join(root, ".agents", "plugins"), { recursive: true })

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
    path.join(root, "plugins", "compound-engineering", ".codex-plugin", "plugin.json"),
    JSON.stringify(
      {
        name: "compound-engineering",
        version: "2.42.0",
        description: "old",
        skills: "./skills/",
      },
      null,
      2,
    ),
  )
  await writeFile(
    path.join(root, "plugins", "coding-tutor", ".codex-plugin", "plugin.json"),
    JSON.stringify(
      { name: "coding-tutor", version: "1.2.1", skills: "./skills/" },
      null,
      2,
    ),
  )
  await writeFile(
    path.join(root, ".agents", "plugins", "marketplace.json"),
    JSON.stringify(
      {
        name: "compound-engineering-plugin",
        plugins: [{ name: "compound-engineering" }, { name: "coding-tutor" }],
      },
      null,
      2,
    ),
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

  test("reports Codex plugin.json version drift without auto-correcting", async () => {
    const root = await makeFixtureRoot()
    // Claude is at 2.42.0; fixture Codex is also 2.42.0 — drift Codex to 2.41.0.
    await writeFile(
      path.join(root, "plugins", "compound-engineering", ".codex-plugin", "plugin.json"),
      JSON.stringify(
        { name: "compound-engineering", version: "2.41.0", skills: "./skills/" },
        null,
        2,
      ),
    )
    const result = await syncReleaseMetadata({ root, write: true })
    const codexPath = path.join(root, "plugins", "compound-engineering", ".codex-plugin", "plugin.json")
    const codexUpdate = result.updates.find((u) => u.path === codexPath)

    expect(codexUpdate).toBeDefined()
    expect(codexUpdate!.changed).toBe(true)

    // Crucially: write: true did NOT bump the Codex version to match Claude.
    // release-please owns version writes via extra-files; syncReleaseMetadata detects but does not correct.
    const afterContents = JSON.parse(await Bun.file(codexPath).text())
    expect(afterContents.version).toBe("2.41.0")
  })

  test("rewrites Codex plugin.json description on write when drifted from Claude", async () => {
    const root = await makeFixtureRoot()
    // Fixture Claude description is "old"; Codex starts at "old" too. Give Claude a canonical description and drift Codex.
    await writeFile(
      path.join(root, "plugins", "compound-engineering", ".claude-plugin", "plugin.json"),
      JSON.stringify(
        {
          version: "2.42.0",
          description: "AI-powered development tools for code review, research, design, and workflow automation.",
        },
        null,
        2,
      ),
    )
    await writeFile(
      path.join(root, "plugins", "compound-engineering", ".codex-plugin", "plugin.json"),
      JSON.stringify(
        {
          name: "compound-engineering",
          version: "2.42.0",
          description: "stale codex description",
          skills: "./skills/",
        },
        null,
        2,
      ),
    )
    const codexPath = path.join(root, "plugins", "compound-engineering", ".codex-plugin", "plugin.json")
    await syncReleaseMetadata({ root, write: true })

    const afterContents = JSON.parse(await Bun.file(codexPath).text())
    expect(afterContents.description).toBe(
      "AI-powered development tools for code review, research, design, and workflow automation.",
    )
  })

  test("reports missing Codex manifest as a structural error", async () => {
    const root = await makeFixtureRoot()
    await Bun.$`rm ${path.join(root, "plugins", "compound-engineering", ".codex-plugin", "plugin.json")}`.quiet()

    const result = await syncReleaseMetadata({ root, write: false })

    expect(result.errors.some((err) => err.includes(".codex-plugin/plugin.json is missing"))).toBe(true)
  })

  test("reports Codex plugin.json name mismatch as structural error", async () => {
    const root = await makeFixtureRoot()
    await writeFile(
      path.join(root, "plugins", "compound-engineering", ".codex-plugin", "plugin.json"),
      JSON.stringify(
        { name: "wrong-name", version: "2.42.0", skills: "./skills/" },
        null,
        2,
      ),
    )
    const result = await syncReleaseMetadata({ root, write: false })

    expect(
      result.errors.some((err) =>
        err.includes('name "wrong-name" does not match expected "compound-engineering"'),
      ),
    ).toBe(true)
  })

  test("reports missing skills field on Codex manifest as structural error", async () => {
    const root = await makeFixtureRoot()
    // Drop the `skills` field entirely from the coding-tutor Codex manifest.
    await writeFile(
      path.join(root, "plugins", "coding-tutor", ".codex-plugin", "plugin.json"),
      JSON.stringify({ name: "coding-tutor", version: "1.2.1" }, null, 2),
    )
    const result = await syncReleaseMetadata({ root, write: false })

    expect(
      result.errors.some(
        (err) =>
          err.includes("coding-tutor") &&
          err.includes("missing required field") &&
          err.includes("skills"),
      ),
    ).toBe(true)
  })

  test("reports missing skills directory when Codex manifest declares one", async () => {
    const root = await makeFixtureRoot()
    // Remove coding-tutor's skills dir but keep the skills declaration.
    await Bun.$`rm -rf ${path.join(root, "plugins", "coding-tutor", "skills")}`.quiet()
    const result = await syncReleaseMetadata({ root, write: false })

    expect(
      result.errors.some(
        (err) =>
          err.includes("coding-tutor") && err.includes("skills:") && err.includes("does not exist"),
      ),
    ).toBe(true)
  })

  test("reports Codex marketplace plugin-list mismatch as structural error", async () => {
    const root = await makeFixtureRoot()
    // Remove one plugin from Codex marketplace so Claude has a plugin Codex doesn't.
    await writeFile(
      path.join(root, ".agents", "plugins", "marketplace.json"),
      JSON.stringify(
        {
          name: "compound-engineering-plugin",
          plugins: [{ name: "compound-engineering" }],
        },
        null,
        2,
      ),
    )
    const result = await syncReleaseMetadata({ root, write: false })

    expect(
      result.errors.some(
        (err) => err.includes(".agents/plugins/marketplace.json") && err.includes("does not match"),
      ),
    ).toBe(true)
  })

  test("reports Codex marketplace asymmetric extra plugin as structural error", async () => {
    const root = await makeFixtureRoot()
    await writeFile(
      path.join(root, ".agents", "plugins", "marketplace.json"),
      JSON.stringify(
        {
          name: "compound-engineering-plugin",
          plugins: [
            { name: "compound-engineering" },
            { name: "coding-tutor" },
            { name: "rogue-plugin" },
          ],
        },
        null,
        2,
      ),
    )
    const result = await syncReleaseMetadata({ root, write: false })

    expect(
      result.errors.some(
        (err) => err.includes(".agents/plugins/marketplace.json") && err.includes("does not match"),
      ),
    ).toBe(true)
  })

  test("happy path: fixture with matching Codex manifests produces no Codex errors", async () => {
    const root = await makeFixtureRoot()
    // Align Claude <-> Codex versions and descriptions so there's no drift.
    await writeFile(
      path.join(root, "plugins", "compound-engineering", ".claude-plugin", "plugin.json"),
      JSON.stringify({ version: "2.42.0", description: "aligned description" }, null, 2),
    )
    await writeFile(
      path.join(root, "plugins", "compound-engineering", ".codex-plugin", "plugin.json"),
      JSON.stringify(
        {
          name: "compound-engineering",
          version: "2.42.0",
          description: "aligned description",
          skills: "./skills/",
        },
        null,
        2,
      ),
    )

    const result = await syncReleaseMetadata({ root, write: false })
    const codexErrors = result.errors.filter(
      (err) => err.includes(".codex-plugin") || err.includes(".agents/plugins"),
    )
    expect(codexErrors).toEqual([])
  })
})
