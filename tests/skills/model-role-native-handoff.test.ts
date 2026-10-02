import { describe, expect, test } from "bun:test"
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"

// The `simplify` and `compound` model roles are served by a native subagent only:
// neither skill has a peer CLI route. These pins cover what a role entry must not
// break in each skill: the hook sits at the step that produces the deliverable, the
// session keeps the work the entry does not govern, a failed hand-off lands back on
// the session, and ce-compound's write boundary and caller-parsed terminal lines
// are untouched. Whether a model actually dispatches is a behavioral eval, not this
// file. Pins are tokens and paths; the sentences around them are free to change.
const repoRoot = path.join(import.meta.dir, "..", "..")
const skillPath = (...parts: string[]) => path.join(repoRoot, "skills", ...parts)
const read = (...parts: string[]) => readFileSync(skillPath(...parts), "utf8")

function section(source: string, start: string, end?: string): string {
  const from = source.indexOf(start)
  expect(from, `missing section start: ${start}`).toBeGreaterThan(-1)
  const to = end === undefined ? source.length : source.indexOf(end, from + start.length)
  expect(to, `missing section end: ${end}`).toBeGreaterThan(from)
  return source.slice(from, to)
}

/** The shared hook: active-key condition, the shared reference, and the role, in one paragraph. */
const hookFor = (role: string) =>
  new RegExp(
    `\\*\\*Model role\\.\\*\\*[^\\n]*\`model_roles:\`[^\\n]*\`references/model-roles\\.md\`[^\\n]*\`${role}\` role`,
  )

/** Bodies of the fenced blocks in a Markdown file, without the fence lines. */
function fencedBlocks(source: string): string[] {
  return [...source.matchAll(/^```[^\n]*\n([\s\S]*?)\n```$/gm)].map((match) => match[1])
}

describe("ce-simplify-code `simplify` role hand-off", () => {
  const body = read("ce-simplify-code", "SKILL.md")
  const applyStep = section(body, "## Step 3: Fix issues", "## Step 4: Verify behavior is preserved")
  const HANDOFF = "references/model-role-handoff.md"

  test("resolves the role at the apply step, from the shared reference", () => {
    expect(applyStep).toMatch(hookFor("simplify"))
    expect(applyStep).toContain("print nothing about model roles")
  })

  test("names its hand-off reference at the apply step, and the file exists", () => {
    expect(applyStep).toContain(`\`${HANDOFF}\``)
    expect(existsSync(skillPath("ce-simplify-code", HANDOFF))).toBe(true)
  })

  test("prints the `Model role` line in the Step 5 summary", () => {
    expect(section(body, "## Step 5: Summarize")).toContain("`Model role` line")
  })

  test("the reviewers keep their tier, and a failed hand-off lands on the session", () => {
    const handoff = read("ce-simplify-code", HANDOFF)
    expect(handoff).toContain("`references/model-roles.md`")
    // R9: the entry moves the apply and verify work, never the three reviewers.
    expect(handoff).toMatch(/reviewers[^\n]*keep their Model tier/)
    const fallback = section(handoff, "**Inline fallback.**", "**Mid-edit failure.**")
    expect(fallback).toMatch(/session[^\n]*Steps 3 and 4/)
    // KTD11: a hand-off that dies after editing is finished from the working tree and re-verified.
    const midEdit = section(handoff, "**Mid-edit failure.**")
    expect(midEdit).toContain("working tree")
    expect(midEdit).toMatch(/Step 4[^\n]*again/)
  })

  test("the editing subagent's prompt points at what the shared reference gives every native subagent", () => {
    const prompt = section(read("ce-simplify-code", HANDOFF), "The subagent's prompt carries:", "The session writes the Step 5 summary")
    expect(prompt).toMatch(/^- what `references\/model-roles\.md` says every native subagent is given$/m)
  })

  test("the shared reference gives a native subagent the project instructions and this skill's files", () => {
    // A fresh subagent has none of the session's loaded instructions and resolves `references/...` against
    // the project. The eight copies are byte-identical (model-roles-reference-parity), so one copy is read.
    const given = section(read("ce-simplify-code", "references/model-roles.md"), "## What every native subagent is given", "## Fallback")
    expect(given).toContain("project instructions")
    expect(given).toContain("absolute path of this skill's directory")
  })
})

describe("ce-compound `compound` role hand-off", () => {
  const research = read("ce-compound", "references", "research.md")
  const assembly = read("ce-compound", "references", "assembly.md")
  const report = read("ce-compound", "references", "report.md")
  const lightweight = read("ce-compound", "references", "lightweight.md")

  test("resolves the role where the body is drafted, from the shared reference", () => {
    const draftStep = section(
      research,
      "#### 2. **Draft the body** (this context)",
      "#### 3. **Related Docs Finder** (subagent)",
    )
    expect(draftStep).toMatch(hookFor("compound"))
    expect(draftStep).toContain("print nothing about model roles")
    // Files, not re-narrated prose: the facts go in, and the draft comes back, as run-scratch files.
    expect(draftStep).toContain("{run_dir}/draft-handoff.md")
    expect(draftStep).toContain("{run_dir}/draft.md")
    expect(draftStep).toMatch(/you draft the body in this context/)
  })

  test("the orchestrator stays the only writer under the artifact root", () => {
    const phase2 = section(assembly, "### Phase 2: Assembly & Write", "### Phase 2.4: Vocabulary Capture")
    expect(phase2).toContain("The orchestrating agent (main conversation) performs these steps")
    expect(phase2).toContain("{run_dir}/draft.md")
    expect(phase2).toMatch(/only writer under `<root>\/`/)
  })

  test("the report keeps each terminal line last, and its templates carry no role line", () => {
    const terminal = /^Documentation (?:complete|skipped)$/m
    const parsed = fencedBlocks(report).filter((block) => terminal.test(block))
    expect(parsed).toHaveLength(3)
    for (const block of parsed) {
      expect(block).toMatch(/\n\nDocumentation (?:complete|skipped)$/)
    }
    // The line is placed by one rule in prose. A template line would print on runs with no map.
    expect(report).toContain("`Model role` line")
    for (const block of [...fencedBlocks(report), ...fencedBlocks(lightweight)]) {
      expect(block).not.toContain("Model role")
    }
  })

  test("Lightweight resolves the role but never hands off", () => {
    expect(lightweight).toMatch(hookFor("compound"))
    expect(lightweight).toMatch(/Lightweight never hands[^\n]*off/)
    expect(lightweight).toContain("No subagents are launched.")
  })

  test("the always-loaded body gains no role prose", () => {
    // ce-compound's SKILL.md has 20 bytes of room under the prompt bound, so the role
    // lives in the references its steps already load.
    expect(read("ce-compound", "SKILL.md")).not.toMatch(/model[-_ ]roles?/i)
  })
})
