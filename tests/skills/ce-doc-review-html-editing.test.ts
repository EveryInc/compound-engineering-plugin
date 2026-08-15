import { readFileSync } from "fs"
import path from "path"
import { describe, expect, test } from "bun:test"

const read = (relativePath: string) =>
  readFileSync(path.join(process.cwd(), relativePath), "utf8")

const DOC_REVIEW = read("skills/ce-doc-review/SKILL.md")
const SYNTHESIS = read("skills/ce-doc-review/references/synthesis-and-presentation.md")
const WALKTHROUGH = read("skills/ce-doc-review/references/walkthrough.md")
const OPEN_QUESTIONS = read("skills/ce-doc-review/references/open-questions-defer.md")
const REVIEWER_TEMPLATE = read("skills/ce-doc-review/references/subagent-template.md")
const PLAN_HANDOFF = read("skills/ce-plan/references/plan-handoff.md")
const BRAINSTORM_HANDOFF = read("skills/ce-brainstorm/references/handoff.md")
const PLAN_HTML = read("skills/ce-plan/references/html-rendering.md")
const BRAINSTORM_HTML = read("skills/ce-brainstorm/references/html-rendering.md")
const BRAINSTORM_DOCS = read("docs/skills/ce-brainstorm.md")
const DOC_REVIEW_DOCS = read("docs/skills/ce-doc-review.md")
const PHASES_3_5 = DOC_REVIEW.match(
  /## Phases 3-5: Synthesis, Presentation, and Next Action[\s\S]*?(?=\n---)/,
)?.[0]

describe("ce-doc-review HTML editing", () => {
  test("applies review fixes in the document's native format", () => {
    expect(DOC_REVIEW).toMatch(/HTML[\s\S]{0,240}native format/i)
    expect(DOC_REVIEW).not.toMatch(/HTML unified artifacts[^\n]*report-only/i)
    expect(SYNTHESIS).toMatch(/native format/i)
    expect(WALKTHROUGH).not.toContain("single-file markdown changes")
    expect(OPEN_QUESTIONS).toMatch(/native format/i)
    expect(OPEN_QUESTIONS).toMatch(/never insert markdown syntax into HTML/i)
    expect(OPEN_QUESTIONS).toMatch(
      /If no sibling entry exists, use a semantic HTML list with one deferred finding per list item/i,
    )
    expect(REVIEWER_TEMPLATE).toMatch(
      /Deferred \/ Open Questions[\s\S]{0,240}Markdown or HTML/i,
    )
    expect(DOC_REVIEW).toMatch(
      /ID-bearing[\s\S]{0,240}nearest sibling[\s\S]{0,240}anchor[\s\S]{0,120}visible ID/i,
    )
    expect(PHASES_3_5).toContain(
      "HTML-escape inserted text and attribute values; construct markup only deliberately.",
    )
    expect(DOC_REVIEW.match(/HTML-escape inserted text and attribute values/g)).toHaveLength(1)
    expect(SYNTHESIS).not.toMatch(
      /escape inserted text and attribute values|construct markup only deliberately/i,
    )
    expect(OPEN_QUESTIONS).not.toMatch(
      /escape inserted text and attribute values|construct markup only deliberately/i,
    )
  })

  test("keeps HTML deferrals format-neutral and separate from plan questions", () => {
    expect(OPEN_QUESTIONS).not.toContain("same `### From YYYY-MM-DD review`")
    expect(OPEN_QUESTIONS).toMatch(
      /same visible `From YYYY-MM-DD review` subsection[\s\S]{0,180}heading syntax/i,
    )
    expect(DOC_REVIEW_DOCS).not.toContain("`## Open Questions`")
  })

  test("callers review HTML instead of withholding the capability", () => {
    expect(PLAN_HANDOFF).not.toContain('skipped_reason = "output_format_html"')
    expect(PLAN_HANDOFF).not.toMatch(/HTML plans skip[^\n]*doc-review/i)

    const pressureTest = BRAINSTORM_HANDOFF.match(
      /\*\*Pressure-test the requirements\*\*[\s\S]*?(?=\n\d+\. \*\*)/,
    )?.[0]
    expect(pressureTest).toBeDefined()
    expect(pressureTest).not.toMatch(/OUTPUT_FORMAT=md|markdown unified plan/i)
    expect(BRAINSTORM_DOCS).not.toMatch(/markdown doc review/i)
  })

  test("shared HTML rendering contract names ce-doc-review as a consumer", () => {
    for (const rendering of [PLAN_HTML, BRAINSTORM_HTML]) {
      expect(rendering).toContain("consumers that read HTML today (`ce-doc-review`")
      expect(rendering).not.toMatch(/ce-doc-review is \*not\* currently an HTML consumer/i)
    }
  })
})
