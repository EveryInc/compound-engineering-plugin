import { readFileSync } from "fs"
import path from "path"
import { describe, expect, test } from "bun:test"

const SKILL_ROOT = path.join(process.cwd(), "skills", "ce-compound")
const SKILL = readFileSync(path.join(SKILL_ROOT, "SKILL.md"), "utf8")
const GROUNDING = readFileSync(
  path.join(SKILL_ROOT, "references", "grounding-validation.md"),
  "utf8",
)

const PHASE_24_START = SKILL.indexOf("### Phase 2.4: Vocabulary Capture")
const PHASE_24_END = SKILL.indexOf("### Phase 2.45")
const PHASE_24 = SKILL.slice(
  PHASE_24_START,
  PHASE_24_END > PHASE_24_START ? PHASE_24_END : PHASE_24_START + 4000,
)

describe("ce-compound Phase 2.4 write routing", () => {
  test("Phase 2.4 is present and bounded", () => {
    expect(PHASE_24_START).toBeGreaterThan(-1)
    expect(PHASE_24.length).toBeGreaterThan(500)
  })

  test("loads the routing contract alongside the format rules", () => {
    expect(PHASE_24).toContain("references/domain-vocabulary.md")
    expect(PHASE_24).toContain("references/concepts-vocabulary.md")
  })

  test("resolves the target before writing", () => {
    expect(PHASE_24).toContain("Resolve the write target")
    expect(PHASE_24).toContain("owning context's glossary")
  })

  test("stops capture on a blocked state", () => {
    expect(PHASE_24).toContain("A blocked state stops capture")
  })

  test("keeps a boundary-crossing capture atomic", () => {
    expect(PHASE_24).toContain("all-or-nothing")
  })

  test("owns creation of a missing context glossary", () => {
    // ce-compound and ce-compound-refresh create; brainstorm asks and plan
    // defers. Losing this line would strand a declared-but-empty context.
    expect(PHASE_24).toContain("`ce-compound` owns that creation")
  })

  test("no longer instructs an unconditional root write", () => {
    // The superseded wording targeted the repo-root file with no resolution
    // step at all.
    expect(PHASE_24).not.toContain("If `CONCEPTS.md` exists at repo root, add missing qualifying terms")
  })
})

describe("ce-compound vocabulary reading and validation", () => {
  test("passes context-glossary terms to the Context Analyzer", () => {
    expect(SKILL).toContain("read the glossaries of the contexts this learning touches")
  })

  test("the semantic validator covers context glossaries and relations", () => {
    expect(GROUNDING).toContain("in a context glossary, or in the root index's relation entries")
    expect(GROUNDING).toContain("A relation entry asserts how two contexts interact")
  })

  test("the discoverability check stays scoped to the root entry point", () => {
    expect(SKILL).toContain("The root is the only entry point to check")
  })

  test("lightweight mode still defers creation to a Full run", () => {
    expect(SKILL).toContain("or the resolved context glossary does not exist, defer creation to a Full run")
  })
})

describe("ce-compound Orca hook anchors survive the rewording", () => {
  // These exact strings are recorded in integrations/orca/upstream.json and
  // pinned by tests/orca-native-parity.test.ts. The vocabulary sweep edits
  // prose all around them, so a local guard makes an accidental break obvious
  // here rather than only in the Orca suite.
  const ANCHORS = [
    "Launch research subagents.",
    "**Run ID and run dir (before dispatching any subagent):**",
    "2. **Semantic grounding validator (Full mode, including non-interactive Full; lightweight skips it).**",
    "### Phase 2.5: Selective Refresh Check",
    "Skip Phase 3 entirely in non-interactive mode",
  ]

  for (const anchor of ANCHORS) {
    test(`preserves the anchor: ${anchor.slice(0, 48)}`, () => {
      expect(SKILL).toContain(anchor)
    })
  }
})
