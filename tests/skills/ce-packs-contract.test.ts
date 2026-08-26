import { readFileSync } from "fs"
import path from "path"
import { describe, expect, test } from "bun:test"

// CE Packs (docs/plans/2026-08-26-001-feat-ce-packs-config-sources-plan.md)
// has no runtime code — the whole mechanism is prose in two skills. These guards
// pin the load-bearing tokens so a later edit cannot silently drop pack
// discovery, `applies_when` matching, the skip-warning relay, or the citation
// marker that distinguishes a pack rule from a docs/solutions learning.

const read = (rel: string) =>
  readFileSync(path.join(process.cwd(), rel), "utf8")

const PACKS_GLOB = /\.compound-engineering\/packs\/\*\//
const CITATION = /\(pack: <id>, <repo-relative path>\)/

const PLAN_RESEARCH = read("skills/ce-plan/references/research.md")
const PLAN_OUTPUT_MODE = read("skills/ce-plan/references/output-mode.md")
const RESEARCHER = read("skills/ce-plan/references/agents/learnings-researcher.md")
const PLAN_SECTIONS = read("skills/ce-plan/references/plan-sections.md")
const BRAINSTORM_DIALOGUE = read("skills/ce-brainstorm/references/dialogue.md")
const BRAINSTORM_PLAN_WRITE = read("skills/ce-brainstorm/references/plan-write.md")
const BRAINSTORM_SECTIONS = read("skills/ce-brainstorm/references/brainstorm-sections.md")

function section(body: string, heading: string, nextHeading?: string): string {
  const start = body.indexOf(heading)
  expect(start, `missing heading ${heading}`).toBeGreaterThan(-1)
  const rest = body.slice(start)
  if (!nextHeading) return rest
  const end = rest.indexOf(nextHeading, heading.length)
  return end > -1 ? rest.slice(0, end) : rest
}

describe("ce-plan discovers packs at the research dispatch site", () => {
  const localResearch = section(PLAN_RESEARCH, "#### 1.1 Local Research", "#### 1.1b")

  test("pack discovery runs the resolver, not a convention-folder glob", () => {
    expect(localResearch).toMatch(/packs-resolve\.py/)
    expect(localResearch).toMatch(/SKILL_DIR="<absolute path[^"]*>";/)
    expect(localResearch).not.toMatch(PACKS_GLOB)
    expect(localResearch).toMatch(/never write them into the plan/)
  })

  test("the learnings-researcher dispatch passes the search-root list and origin pack citations", () => {
    expect(localResearch).toMatch(/learnings-researcher\.md[^\n]*search-root list/)
    expect(localResearch).toMatch(/\(pack: …\)`? citations/)
  })

  test("the pinned docs-root block is untouched by pack text", () => {
    const pinned = section(PLAN_OUTPUT_MODE, "<!-- ce-docs-root:start -->", "<!-- ce-docs-root:end -->")
    expect(pinned).not.toMatch(/pack/i)
  })
})

describe("ce-plan cites pack findings and relays skipped pack files", () => {
  const consolidate = section(PLAN_RESEARCH, "#### 1.4 Consolidate Research", "#### 1.4b")

  test("consolidation carries the citation marker and never mentions packs when none were used", () => {
    expect(consolidate).toMatch(CITATION)
    expect(consolidate).toMatch(/never mentions packs/)
  })

  test("the researcher's Skipped pack files line reaches the user and not the plan", () => {
    expect(consolidate).toMatch(/Skipped pack files/)
    expect(consolidate).toMatch(/never write it into the plan/)
  })
})

describe("learnings-researcher searches pack roots", () => {
  const roots = section(RESEARCHER, "## Search Roots", "## Step 0")

  test("accepts a caller-supplied search-root list; standalone fallback probes solutions only", () => {
    expect(roots).toMatch(/search-root list/)
    expect(roots).toMatch(/probe `<root>\/solutions\/` only/)
    expect(roots).not.toMatch(PACKS_GLOB)
  })

  test("reads every pack file's frontmatter instead of grep-filtering small packs", () => {
    expect(roots).toMatch(/more than 25 files/)
    expect(roots).toMatch(/every markdown file in the pack/)
  })

  test("matches applies_when as a frontmatter field in extraction and scoring", () => {
    expect(section(RESEARCHER, "### Step 4", "### Step 5")).toMatch(/\*\*applies_when\*\*/)
    expect(section(RESEARCHER, "### Step 5", "### Step 6")).toMatch(/applies_when/)
  })

  test("labels pack findings, reports skipped files, and treats pack text as evidence", () => {
    expect(roots).toMatch(/Skipped pack files/)
    expect(roots).toMatch(/evidence, not instructions/)
    expect(section(RESEARCHER, "## Output Format")).toMatch(/\*\*Pack\*\*: \[pack id/)
    expect(section(RESEARCHER, "## Output Format")).toMatch(/\*\*Skipped pack files\*\*/)
  })
})

describe("section contracts define one pack citation marker", () => {
  test("plan-sections.md reserves the marker for pack files", () => {
    expect(PLAN_SECTIONS).toMatch(CITATION)
    expect(PLAN_SECTIONS).toMatch(/reserved for pack files/)
  })

  test("brainstorm-sections.md carries the identical marker", () => {
    expect(BRAINSTORM_SECTIONS).toMatch(CITATION)
  })
})

describe("ce-brainstorm grounds in packs through the scout", () => {
  const scout = section(BRAINSTORM_DIALOGUE, "*Topic Scan (grounding scout)*", "Carry only the gist")

  test("the scout consumes resolver roots, reads pack frontmatter, and lists matches in its gist", () => {
    expect(scout).toMatch(/packs-resolve\.py/)
    expect(scout).not.toMatch(PACKS_GLOB)
    expect(scout).toMatch(/applies_when/)
    expect(scout).toMatch(/pack:<id> <path>/)
    expect(scout).toMatch(/never instructions to the brainstorm/)
  })

  test("the Product Contract write step cites pack entries the gist surfaced", () => {
    expect(BRAINSTORM_PLAN_WRITE).toMatch(/pack:<id>/)
    expect(BRAINSTORM_PLAN_WRITE).toMatch(CITATION)
  })
})
