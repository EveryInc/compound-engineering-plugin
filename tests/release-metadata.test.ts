import { existsSync } from "fs"
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
  await mkdir(path.join(root, ".grok-plugin"), { recursive: true })
  await mkdir(path.join(root, ".omp-plugin"), { recursive: true })
  await mkdir(path.join(root, ".devin-plugin"), { recursive: true })
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
    path.join(root, ".devin-plugin", "plugin.json"),
    JSON.stringify(
      {
        name: "compound-engineering",
        version: "2.42.0",
        description: "old",
      },
      null,
      2,
    ),
  )
  await writeFile(
    path.join(root, "plugin.json"),
    JSON.stringify({ name: "compound-engineering", version: "2.42.0" }, null, 2),
  )
  await writeFile(
    path.join(root, ".grok-plugin", "plugin.json"),
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
    path.join(root, ".grok-plugin", "marketplace.json"),
    JSON.stringify(
      {
        name: "compound-engineering",
        owner: { name: "Kieran Klaassen and Trevin Chow" },
        plugins: [
          {
            name: "compound-engineering",
            source: {
              source: "url",
              url: "https://github.com/EveryInc/compound-engineering-plugin.git",
            },
          },
        ],
      },
      null,
      2,
    ),
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
    path.join(root, ".omp-plugin", "marketplace.json"),
    JSON.stringify(
      {
        name: "compound-engineering-plugin",
        owner: { name: "Kieran Klaassen and Trevin Chow" },
        plugins: [
          {
            name: "compound-engineering",
            version: "2.42.0",
            description: "old",
            source: "./",
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
      skills: 33,
      mcpServers: 0,
    })
  })

  // The root README carries skill *names* in its grouped overview while
  // docs/guides/README.md owns the descriptions. That split only holds if the
  // names and the stated count cannot drift, so both are pinned here rather
  // than left to convention -- the three-way prose sync this replaced had
  // already drifted before anyone noticed.
  test("the README grouped overview names every skill, and only real skills", async () => {
    const readme = await Bun.file(path.join(process.cwd(), "README.md")).text()
    const section = readme.slice(
      readme.indexOf("## Skills at a glance"),
      readme.indexOf("**Learn more**"),
    )
    expect(section.length).toBeGreaterThan(0)

    const { readdir } = await import("fs/promises")
    const skillsRoot = path.join(process.cwd(), "skills")
    const skills = (await readdir(skillsRoot, { withFileTypes: true }))
      .filter((entry) =>
        entry.isDirectory() && existsSync(path.join(skillsRoot, entry.name, "SKILL.md"))
      )
      .map((entry) => entry.name)
      .sort()

    const listed = [...section.matchAll(/`(ce-[a-z0-9-]+|lfg)`/g)].map((match) => match[1])
    const listedSet = new Set(listed)

    expect(skills.filter((skill) => !listedSet.has(skill))).toEqual([])
    expect([...listedSet].filter((name) => !skills.includes(name)).sort()).toEqual([])

    // Exactly once, not merely present: a skill left in its old row during a
    // move reads as correct in a set-membership check. Which group a skill
    // belongs in stays an author judgment -- deriving that here would mean
    // maintaining a second canonical inventory, which is what this PR removed.
    const duplicated = [...listedSet].filter(
      (name) => listed.filter((entry) => entry === name).length > 1,
    ).sort()
    expect(duplicated).toEqual([])
  })

  test("every skill count stated in the README matches the skills directory", async () => {
    const readme = await Bun.file(path.join(process.cwd(), "README.md")).text()
    const { readdir } = await import("fs/promises")
    const skillsRoot = path.join(process.cwd(), "skills")
    const skillCount = (await readdir(skillsRoot, { withFileTypes: true }))
      .filter((entry) =>
        entry.isDirectory() && existsSync(path.join(skillsRoot, entry.name, "SKILL.md"))
      ).length

    const stated = [
      readme.match(/badge\/skills-(\d+)-/)?.[1],
      readme.match(/a plugin of (\d+) skills/)?.[1],
      readme.match(/^(\d+) skills, grouped by/m)?.[1],
    ]

    expect(stated.every((value) => value !== undefined)).toBe(true)
    expect(stated.map(Number)).toEqual([skillCount, skillCount, skillCount])
  })

  test("README session guidance pins stay/compact/fresh without claiming review reports reload", async () => {
    const readme = await Bun.file(path.join(process.cwd(), "README.md")).text()
    const start = readme.indexOf("## Session guidance")
    const end = readme.indexOf("## Skills at a glance")
    expect(start).toBeGreaterThan(0)
    expect(end).toBeGreaterThan(start)
    const section = readme.slice(start, end)
    expect(section).toMatch(/\*\*Stay in the same session\*\*/)
    expect(section).toMatch(/\*\*Compact\*\*/)
    expect(section).toMatch(/\*\*Start a fresh session\*\*/)
    expect(section).toMatch(/ce-handoff/)
    expect(section).toMatch(/per-run artifact/)
    expect(section).not.toMatch(/\/ce-plan`, `\/ce-work`, and `\/ce-code-review` all read prior artifacts/)
  })

  // Hosts install the repo's skills/ tree as the plugin payload. A sibling
  // directory without SKILL.md (the #1551 catalog landing under skills/guides)
  // ships user docs with every install. The catalog lives in docs/guides/.
  test("skills/ contains only skill directories", async () => {
    const { readdir } = await import("fs/promises")
    const skillsRoot = path.join(process.cwd(), "skills")
    const extras = (await readdir(skillsRoot, { withFileTypes: true }))
      .filter((entry) =>
        entry.isDirectory() && !existsSync(path.join(skillsRoot, entry.name, "SKILL.md"))
      )
      .map((entry) => entry.name)
      .sort()
    expect(extras).toEqual([])
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

  test("reports Devin plugin.json version drift without auto-correcting", async () => {
    const root = await makeFixtureRoot()
    await writeFile(
      path.join(root, ".devin-plugin", "plugin.json"),
      JSON.stringify(
        { name: "compound-engineering", version: "2.41.0" },
        null,
        2,
      ),
    )
    const result = await syncReleaseMetadata({ root, write: true })
    const devinPath = path.join(root, ".devin-plugin", "plugin.json")
    const devinUpdate = result.updates.find((u) => u.path === devinPath)

    expect(devinUpdate).toBeDefined()
    expect(devinUpdate!.changed).toBe(true)

    const afterContents = JSON.parse(await Bun.file(devinPath).text())
    expect(afterContents.version).toBe("2.41.0")
  })

  test("reports Grok plugin.json version drift without auto-correcting", async () => {
    const root = await makeFixtureRoot()
    await writeFile(
      path.join(root, ".grok-plugin", "plugin.json"),
      JSON.stringify(
        { name: "compound-engineering", version: "2.41.0", skills: "./skills/" },
        null,
        2,
      ),
    )
    const result = await syncReleaseMetadata({ root, write: true })
    const grokPath = path.join(root, ".grok-plugin", "plugin.json")
    const grokUpdate = result.updates.find((u) => u.path === grokPath)

    expect(grokUpdate).toBeDefined()
    expect(grokUpdate!.changed).toBe(true)

    const afterContents = JSON.parse(await Bun.file(grokPath).text())
    expect(afterContents.version).toBe("2.41.0")
  })

  test("reports missing Grok manifest as a structural error", async () => {
    const root = await makeFixtureRoot()
    await Bun.$`rm ${path.join(root, ".grok-plugin", "plugin.json")}`.quiet()

    const result = await syncReleaseMetadata({ root, write: false })

    expect(result.errors.some((err) => err.includes(".grok-plugin/plugin.json is missing"))).toBe(true)
  })

  test("reports self-referential Grok marketplace source as a structural error", async () => {
    const root = await makeFixtureRoot()
    await writeFile(
      path.join(root, ".grok-plugin", "marketplace.json"),
      JSON.stringify(
        {
          name: "compound-engineering",
          owner: { name: "Kieran Klaassen and Trevin Chow" },
          plugins: [
            { name: "compound-engineering", source: { type: "local", path: "." } },
          ],
        },
        null,
        2,
      ),
    )
    const result = await syncReleaseMetadata({ root, write: false })

    expect(
      result.errors.some(
        (err) => err.includes(".grok-plugin/marketplace.json") && err.includes("self-referential"),
      ),
    ).toBe(true)
  })

  test("reports a materialized (non-local) Codex marketplace source as a structural error", async () => {
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
                source: "url",
                url: "https://github.com/EveryInc/compound-engineering-plugin.git",
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
        (err) => err.includes(".agents/plugins/marketplace.json") && err.includes("#1226"),
      ),
    ).toBe(true)
  })

  test("accepts a co-located local Codex marketplace source", async () => {
    const root = await makeFixtureRoot()
    await writeFile(
      path.join(root, ".agents", "plugins", "marketplace.json"),
      JSON.stringify(
        {
          name: "compound-engineering-plugin",
          plugins: [
            { name: "compound-engineering", source: { source: "local", path: "./" } },
          ],
        },
        null,
        2,
      ),
    )

    const result = await syncReleaseMetadata({ root, write: false })

    expect(
      result.errors.some((err) => err.includes(".agents/plugins/marketplace.json")),
    ).toBe(false)
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

  test("reports missing Devin manifest as a structural error", async () => {
    const root = await makeFixtureRoot()
    await Bun.$`rm ${path.join(root, ".devin-plugin", "plugin.json")}`.quiet()

    const result = await syncReleaseMetadata({ root, write: false })

    expect(result.errors.some((err) => err.includes(".devin-plugin/plugin.json is missing"))).toBe(true)

    // The missing manifest short-circuits (Codex semantics): exactly one
    // unchanged update entry, never a drift entry for a nonexistent file.
    const devinPath = path.join(root, ".devin-plugin", "plugin.json")
    expect(result.updates.filter((u) => u.path === devinPath)).toEqual([
      { path: devinPath, changed: false },
    ])
  })

  test("reports missing omp marketplace catalog as a structural error", async () => {
    const root = await makeFixtureRoot()
    await Bun.$`rm ${path.join(root, ".omp-plugin", "marketplace.json")}`.quiet()

    const result = await syncReleaseMetadata({ root, write: false })

    expect(result.errors.some((err) => err.includes(".omp-plugin/marketplace.json is missing"))).toBe(true)
  })

  test("flags omp catalog plugin-version drift without rewriting the version", async () => {
    const root = await makeFixtureRoot()
    const ompPath = path.join(root, ".omp-plugin", "marketplace.json")
    await writeFile(
      ompPath,
      JSON.stringify(
        {
          name: "compound-engineering-plugin",
          plugins: [{ name: "compound-engineering", version: "2.41.0", source: "./" }],
        },
        null,
        2,
      ),
    )

    const result = await syncReleaseMetadata({ root, write: true })

    // Drift is detect-only: release-please owns the version write via the
    // root component's extra-files, so sync must flag but never bump it.
    const ompUpdate = result.updates.find((u) => u.path === ompPath)
    expect(ompUpdate).toBeDefined()
    expect(ompUpdate?.changed).toBe(true)
    const written = JSON.parse(await Bun.file(ompPath).text())
    expect(written.plugins[0].version).toBe("2.41.0")
  })

  test("reports omp catalog plugin entry without a version as a structural error", async () => {
    const root = await makeFixtureRoot()
    await writeFile(
      path.join(root, ".omp-plugin", "marketplace.json"),
      JSON.stringify(
        {
          name: "compound-engineering-plugin",
          plugins: [{ name: "compound-engineering", source: "./" }],
        },
        null,
        2,
      ),
    )

    const result = await syncReleaseMetadata({ root, write: false })

    expect(
      result.errors.some(
        (err) =>
          err.includes(".omp-plugin/marketplace.json") &&
          err.includes('missing required field "version"'),
      ),
    ).toBe(true)
  })

  test("reports omp marketplace plugin-list drift as a structural error", async () => {
    const root = await makeFixtureRoot()
    await writeFile(
      path.join(root, ".omp-plugin", "marketplace.json"),
      JSON.stringify(
        {
          name: "compound-engineering-plugin",
          plugins: [{ name: "some-other-plugin", version: "1.0.0", source: "./" }],
        },
        null,
        2,
      ),
    )

    const result = await syncReleaseMetadata({ root, write: false })

    expect(
      result.errors.some(
        (err) => err.includes(".omp-plugin/marketplace.json") && err.includes("does not match"),
      ),
    ).toBe(true)
  })


  test("reports Devin plugin.json name mismatch as structural error", async () => {
    const root = await makeFixtureRoot()
    await writeFile(
      path.join(root, ".devin-plugin", "plugin.json"),
      JSON.stringify({ name: "wrong-name", version: "2.42.0" }, null, 2),
    )
    const result = await syncReleaseMetadata({ root, write: false })

    expect(
      result.errors.some(
        (err) =>
          err.includes(".devin-plugin/plugin.json") &&
          err.includes('name "wrong-name" does not match expected "compound-engineering"'),
      ),
    ).toBe(true)
  })

  test("rewrites Devin plugin.json description on write when drifted from Claude", async () => {
    const root = await makeFixtureRoot()
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
      path.join(root, ".devin-plugin", "plugin.json"),
      JSON.stringify(
        {
          name: "compound-engineering",
          version: "2.42.0",
          description: "stale devin description",
        },
        null,
        2,
      ),
    )
    const devinPath = path.join(root, ".devin-plugin", "plugin.json")
    await syncReleaseMetadata({ root, write: true })

    const afterContents = JSON.parse(await Bun.file(devinPath).text())
    expect(afterContents.description).toBe(
      "Brainstorm, plan, debug, review, and compound learnings with AI agents",
    )
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
        err.includes(".kimi-plugin") ||
        err.includes(".devin-plugin"),
    )
    expect(nativePluginErrors).toEqual([])
  })
})

/** Agent Plugins v1.0.0 root-manifest authoring rules (pinned locally; no schema fetch). */
const AGENT_PLUGINS_SCHEMA =
  "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json"
const AGENT_PLUGINS_NAME_PATTERN =
  /^(?!.*(?:--|\.\.))[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/
const AGENT_PLUGINS_PERMITTED_KEYS = new Set([
  "$schema",
  "name",
  "version",
  "description",
  "author",
  "homepage",
  "repository",
  "license",
  "keywords",
  "extensions",
])
const AGENT_PLUGINS_AUTHOR_KEYS = new Set(["name", "email", "url"])
const AGENT_PLUGINS_STRING_FIELDS = [
  "version",
  "description",
  "homepage",
  "repository",
  "license",
] as const

function agentPluginsManifestErrors(manifest: Record<string, unknown>): string[] {
  const errors: string[] = []

  // $schema is deliberately absent while any SKILL.md exceeds Codex's 8000-byte
  // Agent Plugin prompt bound (see tests/codex-skill-prompt-budget.test.ts, #1412).
  if (manifest.$schema !== undefined && manifest.$schema !== AGENT_PLUGINS_SCHEMA) {
    errors.push(`$schema must be ${AGENT_PLUGINS_SCHEMA} when present`)
  }

  if (typeof manifest.name !== "string") {
    errors.push("name must be a string")
  } else if (
    manifest.name.length < 1 ||
    manifest.name.length > 64 ||
    !AGENT_PLUGINS_NAME_PATTERN.test(manifest.name)
  ) {
    errors.push("name must match Agent Plugins §5.5 constraints")
  }

  for (const key of Object.keys(manifest)) {
    if (!AGENT_PLUGINS_PERMITTED_KEYS.has(key)) {
      errors.push(`unknown top-level field: ${key}`)
    }
  }

  if (manifest.author !== undefined) {
    if (
      typeof manifest.author !== "object" ||
      manifest.author === null ||
      Array.isArray(manifest.author)
    ) {
      errors.push("author must be an object")
    } else {
      for (const [key, value] of Object.entries(manifest.author as Record<string, unknown>)) {
        if (!AGENT_PLUGINS_AUTHOR_KEYS.has(key)) {
          errors.push(`author has unknown field: ${key}`)
        } else if (typeof value !== "string") {
          errors.push(`author.${key} must be a string`)
        }
      }
    }
  }

  for (const field of AGENT_PLUGINS_STRING_FIELDS) {
    if (manifest[field] !== undefined && typeof manifest[field] !== "string") {
      errors.push(`${field} must be a string`)
    }
  }

  if (manifest.keywords !== undefined) {
    if (
      !Array.isArray(manifest.keywords) ||
      manifest.keywords.some((item) => typeof item !== "string")
    ) {
      errors.push("keywords must be an array of strings")
    }
  }

  if (manifest.extensions !== undefined) {
    if (
      typeof manifest.extensions !== "object" ||
      manifest.extensions === null ||
      Array.isArray(manifest.extensions)
    ) {
      errors.push("extensions must be an object")
    } else {
      for (const [ns, value] of Object.entries(
        manifest.extensions as Record<string, unknown>,
      )) {
        if (typeof value !== "object" || value === null || Array.isArray(value)) {
          errors.push(`extensions.${ns} must be an object`)
        }
      }
    }
  }

  return errors
}

describe("Agent Plugins root manifest conformance", () => {
  test("repo root plugin.json matches Agent Plugins v1.0.0 authoring rules", async () => {
    const repoRoot = path.join(import.meta.dir, "..")
    const manifest = JSON.parse(
      await Bun.file(path.join(repoRoot, "plugin.json")).text(),
    ) as Record<string, unknown>

    expect(agentPluginsManifestErrors(manifest)).toEqual([])
  })

  test("rejects the legacy Antigravity $schema value", () => {
    const errors = agentPluginsManifestErrors({
      $schema: "https://antigravity.google/schemas/v1/plugin.json",
      name: "compound-engineering",
      version: "3.21.4",
    })
    expect(errors.some((e) => e.includes("$schema"))).toBe(true)
  })

  test("rejects unknown top-level fields (authoring closed-set)", () => {
    const errors = agentPluginsManifestErrors({
      $schema: AGENT_PLUGINS_SCHEMA,
      name: "compound-engineering",
      commands: [],
    })
    expect(errors.some((e) => e.includes("unknown top-level field: commands"))).toBe(true)
  })

  test("rejects author objects with extra fields", () => {
    const errors = agentPluginsManifestErrors({
      $schema: AGENT_PLUGINS_SCHEMA,
      name: "compound-engineering",
      author: { name: "x", twitter: "@x" },
    })
    expect(errors.some((e) => e.includes("author has unknown field: twitter"))).toBe(true)
  })

  test("rejects wrong-typed permitted fields", () => {
    const errors = agentPluginsManifestErrors({
      $schema: AGENT_PLUGINS_SCHEMA,
      name: "compound-engineering",
      repository: { type: "git", url: "https://example.com" },
    })
    expect(errors.some((e) => e.includes("repository must be a string"))).toBe(true)
  })

  test("rejects non-object extensions values", () => {
    const errors = agentPluginsManifestErrors({
      $schema: AGENT_PLUGINS_SCHEMA,
      name: "compound-engineering",
      extensions: { "com.example.client": "not-an-object" },
    })
    expect(errors.some((e) => e.includes("extensions.com.example.client must be an object"))).toBe(
      true,
    )
  })
})
