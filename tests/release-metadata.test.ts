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

  await mkdir(path.join(root, "agents", "review"), { recursive: true })
  await mkdir(path.join(root, "skills", "ce-plan"), { recursive: true })
  await mkdir(path.join(root, ".claude-plugin"), { recursive: true })
  await mkdir(path.join(root, ".cursor-plugin"), { recursive: true })
  await mkdir(path.join(root, ".codex-plugin"), { recursive: true })
  await mkdir(path.join(root, ".kimi-plugin"), { recursive: true })
  await mkdir(path.join(root, ".agents", "plugins"), { recursive: true })

  await writeFile(
    path.join(root, "agents", "review", "agent.md"),
    "# Review Agent\n",
  )
  await writeFile(
    path.join(root, "skills", "ce-plan", "SKILL.md"),
    "# ce-plan\n",
  )
  await writeFile(
    path.join(root, ".mcp.json"),
    JSON.stringify({ mcpServers: { context7: { command: "ctx7" } } }, null, 2),
  )
  await writeFile(
    path.join(root, "package.json"),
    JSON.stringify({ version: "2.42.0" }, null, 2),
  )
  await writeFile(
    path.join(root, ".claude-plugin", "plugin.json"),
    JSON.stringify({ version: "2.42.0", description: "old" }, null, 2),
  )
  await writeFile(
    path.join(root, ".cursor-plugin", "plugin.json"),
    JSON.stringify({ version: "2.33.0", description: "old" }, null, 2),
  )
  await writeFile(
    path.join(root, ".codex-plugin", "plugin.json"),
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
    path.join(root, ".kimi-plugin", "plugin.json"),
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
    path.join(root, "plugin.json"),
    JSON.stringify({ name: "compound-engineering", version: "2.42.0" }, null, 2),
  )
  await mkdir(path.join(root, ".agy"), { recursive: true })
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
  await writeFile(
    path.join(root, ".kimi-plugin", "marketplace.json"),
    JSON.stringify(
      {
        version: "2",
        plugins: [
          {
            id: "compound-engineering",
            displayName: "Compound Engineering",
            source: "https://github.com/EveryInc/compound-engineering-plugin",
          },
        ],
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
      agents: 0,
      skills: 27,
      mcpServers: 0,
    })
  })

  test("builds a stable compound-engineering manifest description", async () => {
    const description = await buildCompoundEngineeringDescription(process.cwd())

    expect(description).toBe(
      "Brainstorm, plan, debug, review, and compound learnings with AI agents",
    )
  })

  test("detects cross-surface version drift even without explicit override versions", async () => {
    const root = await makeFixtureRoot()
    const result = await syncReleaseMetadata({ root, write: false })
    const changedPaths = result.updates.filter((update) => update.changed).map((update) => update.path)

    expect(changedPaths).toContain(path.join(root, ".cursor-plugin", "plugin.json"))
    expect(changedPaths).toContain(path.join(root, ".claude-plugin", "marketplace.json"))
    expect(changedPaths).toContain(path.join(root, ".cursor-plugin", "marketplace.json"))
  })

  test("reports Codex plugin.json version drift without auto-correcting", async () => {
    const root = await makeFixtureRoot()
    // Claude is at 2.42.0; fixture Codex is also 2.42.0 — drift Codex to 2.41.0.
    await writeFile(
      path.join(root, ".codex-plugin", "plugin.json"),
      JSON.stringify(
        { name: "compound-engineering", version: "2.41.0", skills: "./skills/" },
        null,
        2,
      ),
    )
    const result = await syncReleaseMetadata({ root, write: true })
    const codexPath = path.join(root, ".codex-plugin", "plugin.json")
    const codexUpdate = result.updates.find((u) => u.path === codexPath)

    expect(codexUpdate).toBeDefined()
    expect(codexUpdate!.changed).toBe(true)

    // Crucially: write: true did NOT bump the Codex version to match Claude.
    // release-please owns version writes via extra-files; syncReleaseMetadata detects but does not correct.
    const afterContents = JSON.parse(await Bun.file(codexPath).text())
    expect(afterContents.version).toBe("2.41.0")
  })

  test("reports Kimi plugin.json version drift without auto-correcting", async () => {
    const root = await makeFixtureRoot()
    await writeFile(
      path.join(root, ".kimi-plugin", "plugin.json"),
      JSON.stringify(
        { name: "compound-engineering", version: "2.41.0", skills: "./skills/" },
        null,
        2,
      ),
    )
    const result = await syncReleaseMetadata({ root, write: true })
    const kimiPath = path.join(root, ".kimi-plugin", "plugin.json")
    const kimiUpdate = result.updates.find((u) => u.path === kimiPath)

    expect(kimiUpdate).toBeDefined()
    expect(kimiUpdate!.changed).toBe(true)

    const afterContents = JSON.parse(await Bun.file(kimiPath).text())
    expect(afterContents.version).toBe("2.41.0")
  })

  test("reports package.json version drift without auto-correcting", async () => {
    const root = await makeFixtureRoot()
    await writeFile(
      path.join(root, "package.json"),
      JSON.stringify({ version: "2.41.0" }, null, 2),
    )

    const result = await syncReleaseMetadata({ root, write: true })
    const packagePath = path.join(root, "package.json")
    const packageUpdate = result.updates.find((u) => u.path === packagePath)

    expect(packageUpdate).toBeDefined()
    expect(packageUpdate!.changed).toBe(true)

    const afterContents = JSON.parse(await Bun.file(packagePath).text())
    expect(afterContents.version).toBe("2.41.0")
  })

  test("reports Antigravity plugin.json version drift without auto-correcting", async () => {
    const root = await makeFixtureRoot()
    await writeFile(
      path.join(root, "plugin.json"),
      JSON.stringify({ name: "compound-engineering", version: "2.41.0" }, null, 2),
    )

    const result = await syncReleaseMetadata({ root, write: true })
    const antigravityPath = path.join(root, "plugin.json")
    const antigravityUpdate = result.updates.find((u) => u.path === antigravityPath)

    expect(antigravityUpdate).toBeDefined()
    expect(antigravityUpdate!.changed).toBe(true)

    const afterContents = JSON.parse(await Bun.file(antigravityPath).text())
    expect(afterContents.version).toBe("2.41.0")
  })

  test("reports missing Antigravity plugin.json as a structural error", async () => {
    const root = await makeFixtureRoot()
    await Bun.$`rm ${path.join(root, "plugin.json")}`.quiet()

    const result = await syncReleaseMetadata({ root, write: false })

    expect(result.errors.some((err) => err.includes("plugin.json is missing"))).toBe(true)
  })

  test("rewrites Codex plugin.json description on write when drifted from Claude", async () => {
    const root = await makeFixtureRoot()
    // Fixture Claude description is "old"; Codex starts at "old" too. Give Claude a canonical description and drift Codex.
    await writeFile(
      path.join(root, ".claude-plugin", "plugin.json"),
      JSON.stringify(
        {
          version: "2.42.0",
          description: "Brainstorm, plan, debug, review, and compound learnings with AI agents",
        },
        null,
        2,
      ),
    )
    await writeFile(
      path.join(root, ".codex-plugin", "plugin.json"),
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
    const codexPath = path.join(root, ".codex-plugin", "plugin.json")
    await syncReleaseMetadata({ root, write: true })

    const afterContents = JSON.parse(await Bun.file(codexPath).text())
    expect(afterContents.description).toBe(
      "Brainstorm, plan, debug, review, and compound learnings with AI agents",
    )
  })

  test("reports missing Codex manifest as a structural error", async () => {
    const root = await makeFixtureRoot()
    await Bun.$`rm ${path.join(root, ".codex-plugin", "plugin.json")}`.quiet()

    const result = await syncReleaseMetadata({ root, write: false })

    expect(result.errors.some((err) => err.includes(".codex-plugin/plugin.json is missing"))).toBe(true)
  })

  test("reports missing Kimi manifest as a structural error", async () => {
    const root = await makeFixtureRoot()
    await Bun.$`rm ${path.join(root, ".kimi-plugin", "plugin.json")}`.quiet()

    const result = await syncReleaseMetadata({ root, write: false })

    expect(result.errors.some((err) => err.includes(".kimi-plugin/plugin.json is missing"))).toBe(true)
  })

  test("reports Codex plugin.json name mismatch as structural error", async () => {
    const root = await makeFixtureRoot()
    await writeFile(
      path.join(root, ".codex-plugin", "plugin.json"),
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
    // Drop the `skills` field entirely from the compound-engineering Codex manifest.
    await writeFile(
      path.join(root, ".codex-plugin", "plugin.json"),
      JSON.stringify({ name: "compound-engineering", version: "2.42.0" }, null, 2),
    )
    const result = await syncReleaseMetadata({ root, write: false })

    expect(
      result.errors.some(
        (err) =>
          err.includes("compound-engineering") &&
          err.includes("missing required field") &&
          err.includes("skills"),
      ),
    ).toBe(true)
  })

  test("reports missing skills field on Kimi manifest as structural error", async () => {
    const root = await makeFixtureRoot()
    await writeFile(
      path.join(root, ".kimi-plugin", "plugin.json"),
      JSON.stringify({ name: "compound-engineering", version: "2.42.0" }, null, 2),
    )
    const result = await syncReleaseMetadata({ root, write: false })

    expect(
      result.errors.some(
        (err) =>
          err.includes(".kimi-plugin/plugin.json") &&
          err.includes("missing required field") &&
          err.includes("skills"),
      ),
    ).toBe(true)
  })

  test("reports missing skills directory when Codex manifest declares one", async () => {
    const root = await makeFixtureRoot()
    // Remove compound-engineering's skills dir but keep the skills declaration.
    await Bun.$`rm -rf ${path.join(root, "skills")}`.quiet()
    const result = await syncReleaseMetadata({ root, write: false })

    expect(
      result.errors.some(
        (err) =>
          err.includes(".codex-plugin/plugin.json") && err.includes("skills:") && err.includes("does not exist"),
      ),
    ).toBe(true)
  })

  test("reports Codex marketplace plugin-list mismatch as structural error", async () => {
    const root = await makeFixtureRoot()
    // Empty the Codex marketplace so Claude has a plugin Codex doesn't.
    await writeFile(
      path.join(root, ".agents", "plugins", "marketplace.json"),
      JSON.stringify(
        {
          name: "compound-engineering-plugin",
          plugins: [],
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

  test("reports Codex marketplace root-local plugin source as structural error", async () => {
    const root = await makeFixtureRoot()
    await writeFile(
      path.join(root, ".agents", "plugins", "marketplace.json"),
      JSON.stringify(
        {
          name: "compound-engineering-plugin",
          plugins: [
            {
              name: "compound-engineering",
              source: {
                source: "local",
                path: "./",
              },
            },
          ],
        },
        null,
        2,
      ),
    )
    const result = await syncReleaseMetadata({ root, write: false })

    expect(
      result.errors.some(
        (err) =>
          err.includes(".agents/plugins/marketplace.json") &&
          err.includes("compound-engineering") &&
          err.includes('source.path "./"'),
      ),
    ).toBe(true)
  })

  test("reports Kimi marketplace plugin-list mismatch as structural error", async () => {
    const root = await makeFixtureRoot()
    await writeFile(
      path.join(root, ".kimi-plugin", "marketplace.json"),
      JSON.stringify(
        {
          version: "2",
          plugins: [],
        },
        null,
        2,
      ),
    )
    const result = await syncReleaseMetadata({ root, write: false })

    expect(
      result.errors.some(
        (err) => err.includes(".kimi-plugin/marketplace.json") && err.includes("does not match"),
      ),
    ).toBe(true)
  })

  test("reports Kimi marketplace schema version mismatch as structural error", async () => {
    const root = await makeFixtureRoot()
    await writeFile(
      path.join(root, ".kimi-plugin", "marketplace.json"),
      JSON.stringify(
        {
          version: "1",
          plugins: [{ id: "compound-engineering" }],
        },
        null,
        2,
      ),
    )
    const result = await syncReleaseMetadata({ root, write: false })

    expect(
      result.errors.some(
        (err) => err.includes(".kimi-plugin/marketplace.json") && err.includes('schema version "2"'),
      ),
    ).toBe(true)
  })

  test("reports Kimi marketplace root-local plugin source as structural error", async () => {
    const root = await makeFixtureRoot()
    await writeFile(
      path.join(root, ".kimi-plugin", "marketplace.json"),
      JSON.stringify(
        {
          version: "2",
          plugins: [{ id: "compound-engineering", source: "./" }],
        },
        null,
        2,
      ),
    )
    const result = await syncReleaseMetadata({ root, write: false })

    expect(
      result.errors.some(
        (err) =>
          err.includes(".kimi-plugin/marketplace.json") &&
          err.includes("compound-engineering") &&
          err.includes('source "./"'),
      ),
    ).toBe(true)
  })

  test("reports Kimi marketplace missing plugin source as structural error", async () => {
    const root = await makeFixtureRoot()
    await writeFile(
      path.join(root, ".kimi-plugin", "marketplace.json"),
      JSON.stringify(
        {
          version: "2",
          plugins: [{ id: "compound-engineering" }],
        },
        null,
        2,
      ),
    )
    const result = await syncReleaseMetadata({ root, write: false })

    expect(
      result.errors.some(
        (err) =>
          err.includes(".kimi-plugin/marketplace.json") &&
          err.includes("compound-engineering") &&
          err.includes("missing required field") &&
          err.includes("source"),
      ),
    ).toBe(true)
  })

  test("happy path: fixture with matching native manifests produces no native plugin errors", async () => {
    const root = await makeFixtureRoot()
    // Align Claude <-> Codex versions and descriptions so there's no drift.
    await writeFile(
      path.join(root, ".claude-plugin", "plugin.json"),
      JSON.stringify({ version: "2.42.0", description: "aligned description" }, null, 2),
    )
    await writeFile(
      path.join(root, ".codex-plugin", "plugin.json"),
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
    const nativePluginErrors = result.errors.filter(
      (err) =>
        err.includes(".codex-plugin") ||
        err.includes(".agents/plugins") ||
        err.includes(".kimi-plugin"),
    )
    expect(nativePluginErrors).toEqual([])
  })
})
