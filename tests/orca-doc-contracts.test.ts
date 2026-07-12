import { describe, expect, test } from "bun:test"
import { promises as fs } from "node:fs"
import path from "node:path"

const ROOT = path.resolve(import.meta.dir, "..")

async function read(relativePath: string) {
  return fs.readFile(path.join(ROOT, relativePath), "utf8")
}

function bashBlocks(markdown: string) {
  return [...markdown.matchAll(/```bash\n([\s\S]*?)```/g)].map((match) => match[1])
}

function expectFlattenSafeSetup(block: string) {
  const setupLines = block
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^(?:SKILL_DIR|ROUTE_DIR|LFG_DIR)=|^chmod\s/.test(line))
  for (const line of setupLines) expect(line).toEndWith(";")

  for (const variable of ["SKILL_DIR", "ROUTE_DIR", "LFG_DIR"]) {
    if (block.includes(`$${variable}`)) {
      expect(block, `${variable} must be initialized in the same shell block`).toMatch(
        new RegExp(`(?:^|\\n)\\s*${variable}=`),
      )
    }
  }
}

describe("CE-Orca documentation contracts", () => {
  test("keeps canonical routing commands flatten-safe and Node fallback native-only", async () => {
    const routing = await read("integrations/orca/references/execution-routing.md")
    const blocks = bashBlocks(routing)
    expect(blocks.length).toBeGreaterThan(0)
    for (const block of blocks) expectFlattenSafeSetup(block)

    const prose = routing.replace(/\s+/g, " ")
    expect(prose).toContain("Node.js 24 or newer is a prerequisite of this Orca overlay only")
    expect(prose).toContain("continue the upstream workflow unchanged")
    expect(prose).toContain("Do not create an overlay artifact and do not probe `orca-orch`")
    expect(prose).toContain("install Node.js 24 or newer and retry, or")
    expect(prose).toContain("Leave the endpoint state unobserved")
  })

  test("keeps the LFG child-patch command flatten-safe", async () => {
    const lfg = await read("skills/lfg/references/orca-lfg.md")
    const blocks = bashBlocks(lfg)
    expect(blocks).toHaveLength(1)
    expectFlattenSafeSetup(blocks[0])
  })

  test("documents a source migration to the fork for every native install surface", async () => {
    const readme = await read("README.md")
    const section = readme.slice(
      readme.indexOf("### Existing Installs"),
      readme.indexOf("\n---", readme.indexOf("### Existing Installs")),
    )

    expect(section).toContain("EveryInc/compound-engineering-plugin")
    expect(section).toContain("/plugin marketplace remove compound-engineering-plugin")
    expect(section).toContain("/plugin marketplace add ethras/compound-engineering-orca")
    expect(section).toContain("codex plugin marketplace remove compound-engineering-plugin")
    expect(section).toContain("codex plugin marketplace add ethras/compound-engineering-orca")
    expect(section).toContain("source `ethras/compound-engineering-orca`")
    expect(section).toContain("https://github.com/ethras/compound-engineering-orca.git /tmp/compound-engineering-orca-cleanup")
    expect(section).not.toContain("https://github.com/EveryInc/compound-engineering-plugin.git /tmp/")
  })

  test("keeps the ce-work engine overlay inside one bounded hook", async () => {
    const engines = await read("skills/ce-work/references/execution-engines.md")
    const start = "<!-- ce-orca-hook:start ce-work-execution-engine -->"
    const end = "<!-- ce-orca-hook:end ce-work-execution-engine -->"

    expect(engines.split(start)).toHaveLength(2)
    expect(engines.split(end)).toHaveLength(2)
    expect(engines.indexOf(start)).toBeLessThan(engines.indexOf(end))
    expect(engines.slice(engines.indexOf(start), engines.indexOf(end))).toContain(
      "The Orca fork adds one conditional path",
    )

    const baseline = JSON.parse(await read("integrations/orca/upstream.json")) as {
      hookAnchors: Array<{ id: string; file: string; contains: string }>
    }
    expect(baseline.hookAnchors).toContainEqual({
      id: "ce-work.execution-engine-selection",
      file: "skills/ce-work/references/execution-engines.md",
      contains: "Engine selection applies only to code execution. Knowledge-work and legacy plans keep the inline/subagent flow in `SKILL.md`.",
    })
  })

  test("documents native ownership for tool-dependent planning and compounding roles", async () => {
    const [planning, compounding] = await Promise.all([
      read("skills/ce-plan/references/orca-read-analysis.md"),
      read("skills/ce-compound/references/orca-read-analysis.md"),
    ])
    const planningProse = planning.replace(/\s+/g, " ")
    const compoundingProse = compounding.replace(/\s+/g, " ")

    expect(planningProse).toContain("Keep `organizational-research/slack-researcher`")
    expect(planningProse).toContain(
      "every `external-research` role, every `deepening` role",
    )
    expect(planningProse).toContain("Never encode Slack, external-research, or deepening work")
    expect(compoundingProse).toContain("Keep all `specialized-review` roles native")
    expect(compoundingProse).toContain("Never send Phase 3 specialized reviewers through Orca")
  })

  test("does not promise strict Orca reads for Cursor", async () => {
    const [readme, integrationGuide] = await Promise.all([
      read("README.md"),
      read("integrations/orca/README.md"),
    ])

    for (const document of [readme, integrationGuide]) {
      const prose = document.replace(/\s+/g, " ")
      expect(prose).toContain("Cursor remains catalogued for native CE routing")
      expect(prose).toContain("cannot attest `orca.read-policy/v1`")
      expect(prose).not.toContain("Cursor remains available for read-only stages")
      expect(prose).not.toContain("Cursor is currently limited to read-only Orca stages")
    }
  })
})
