import { readFileSync } from "fs"
import path from "path"
import { expect, test } from "bun:test"

const PHASE_ZERO_SCOPE_CONTRACT =
  "Run Phase 0 only when `technology` is requested or when the invocation has no `Scope:` prefix."

test("repo research runs Phase 0 only when in scope", () => {
  for (const skill of ["ce-plan", "ce-optimize"]) {
    const prompt = readFileSync(
      path.join(
        process.cwd(),
        "skills",
        skill,
        "references/agents/repo-research-analyst.md",
      ),
      "utf8",
    )
    expect(prompt).toContain(PHASE_ZERO_SCOPE_CONTRACT)
  }
})

test("ce-plan collects versions only when materially relevant", () => {
  const skill = readFileSync(
    path.join(process.cwd(), "skills", "ce-plan", "SKILL.md"),
    "utf8",
  )
  expect(skill).not.toContain("- Technology stack and versions")
  expect(skill).toContain(
    "- Exact dependency or runtime versions only when they materially affect the plan or an external research decision",
  )
})
