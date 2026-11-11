import { readFileSync } from "fs"
import path from "path"
import { describe, expect, test } from "bun:test"

const PLAN = path.join(process.cwd(), "skills/ce-plan")
const read = (file: string) => readFileSync(path.join(PLAN, file), "utf8")

const PHASE_1_PERSONAS = [
  "references/agents/repo-research-analyst.md",
  "references/agents/learnings-researcher.md",
  "references/agents/agent-native-planning-strategist.md",
  "references/agents/slack-researcher.md",
  "references/agents/best-practices-researcher.md",
  "references/agents/framework-docs-researcher.md",
  "references/agents/web-researcher.md",
  "references/agents/spec-flow-analyzer.md",
]

describe("ce-plan traces behavior before a dependent choice", () => {
  const research = read("references/research.md")

  test("Standard and Deep choices that depend on existing behavior invoke ce-explain", () => {
    const trace = research.slice(research.indexOf("#### 1.4c"), research.indexOf("#### 1.5"))
    expect(trace).toContain("The pattern pass does not establish behavior")
    expect(trace).toContain("Invoke `ce-explain`")
    expect(trace).toContain("no teaching artifact")
    expect(trace).toContain("Requirements and the choice of approach stay here")
    expect(trace).toContain("It does not complete the run")
    expect(trace).toContain("label the result a single-pass trace")
    expect(trace).toContain("A Lightweight plan does not dispatch it")
    expect(research.indexOf("#### 1.4c")).toBeLessThan(research.indexOf("#### 1.6"))
  })

  test("the old optional trigger is not a second copy in research", () => {
    expect(research).not.toContain("When an unanswered question about system behavior or design rationale would materially change this work")
  })
})

describe("ce-plan research dossiers stay out of the planning context", () => {
  const research = read("references/research.md")

  test("phase 1 creates one scratch directory and names each researcher's file", () => {
    expect(research).toContain('SCRATCH_ROOT="/tmp/compound-engineering-$(id -u)"')
    expect(research).toContain('SCRATCH_DIR="$SCRATCH_ROOT/ce-plan-research/')
    expect(research).not.toContain("mktemp")
    expect(research).toContain("Do not load every dossier into context")
    for (const file of [
      "$SCRATCH_DIR/repo-research.md",
      "$SCRATCH_DIR/learnings.md",
      "$SCRATCH_DIR/agent-native.md",
      "$SCRATCH_DIR/slack.md",
      "$SCRATCH_DIR/best-practices.md",
      "$SCRATCH_DIR/framework-docs.md",
      "$SCRATCH_DIR/web.md",
      "$SCRATCH_DIR/spec-flow.md",
    ]) {
      expect(research).toContain(file)
    }
  })

  test("each phase 1 persona writes to a caller path and returns a gist", () => {
    for (const persona of PHASE_1_PERSONAS) {
      const body = read(persona)
      expect(body).toContain("When the caller supplies a path")
      expect(body).toContain("Do not include the document in the return")
      expect(body).toContain("When the caller supplies no path, return this output directly")
    }
  })
})
