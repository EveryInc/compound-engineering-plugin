import { describe, expect, test } from "bun:test"
import { buildCompoundEngineeringDescription, renderChangelogEntry } from "../src/release/metadata"

describe("release metadata", () => {
  test("builds the current compound-engineering manifest description from repo counts", async () => {
    const description = await buildCompoundEngineeringDescription(process.cwd())
    expect(description).toBe(
      "AI-powered development tools. 29 agents, 44 skills, 1 MCP server for code review, research, design, and workflow automation.",
    )
  })

  test("renders root changelog entries with component-version headings", () => {
    const entry = renderChangelogEntry("compound-engineering", "2.43.0", "2026-04-10", {
      Features: ["Add release preview"],
      Fixes: ["Correct changelog rendering"],
    })

    expect(entry).toContain("## compound-engineering v2.43.0 - 2026-04-10")
    expect(entry).toContain("### Features")
    expect(entry).toContain("- Add release preview")
    expect(entry).toContain("### Fixes")
  })
})
