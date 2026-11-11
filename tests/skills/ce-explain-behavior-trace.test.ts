import { readFileSync } from "fs"
import path from "path"
import { describe, expect, test } from "bun:test"

const ROOT = path.join(process.cwd(), "skills/ce-explain")
const read = (file: string) => readFileSync(path.join(ROOT, file), "utf8")

describe("ce-explain behavior trace", () => {
  const orchestration = read("references/orchestration.md")
  const body = read("SKILL.md")
  const scout = read("references/agents/behavior-trace-scout.md")

  test("a how question stays one pass until ownership boundaries would be hand-waved", () => {
    expect(orchestration).toContain("trace the relevant trigger through its state changes, ownership boundaries, and effect")
    expect(orchestration).toContain("One pass is enough when that trace can name those boundaries without hand-waving")
    expect(orchestration).toContain("Two slices is the smallest split")
    expect(orchestration).toContain("More than four means the question is still unscoped")
    expect(orchestration).toContain("references/agents/behavior-trace-scout.md")
    expect(orchestration).toContain("A gist is not the trace")
    expect(orchestration).toContain("without selecting an approach")
  })

  test("scouts quote one slice and return a path", () => {
    expect(scout).toContain("{dossier-path}")
    expect(scout).toContain("Do not modify the repository")
    expect(scout).toContain("Do not return the dossier's contents")
    expect(scout).not.toMatch(/^---$/m)
  })

  test("a calling workflow receives evidence, constraints, and unanswered questions", () => {
    expect(body).toContain("the evidence, the constraints that still apply, and the unanswered questions")
    expect(body).toContain("A behavior trace that splits across ownership boundaries writes scout dossiers")
  })
})
