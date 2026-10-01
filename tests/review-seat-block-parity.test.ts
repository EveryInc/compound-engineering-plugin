import { readFile } from "fs/promises"
import path from "path"
import { describe, expect, test } from "bun:test"

const PLUGIN_ROOT = path.join(process.cwd(), "skills")

// A `model_roles` list on `doc-review` or `code-review` runs one reviewer per
// seat. The rules for a seat are the same in both review skills, and skills
// cannot import each other's files (AGENTS.md "File References in Skills"), so
// one delimited block is byte-duplicated into each skill's cross-model
// reference. Editing one copy without the other fails this test.
const REFERENCES = {
  "ce-doc-review": "ce-doc-review/references/cross-model-review.md",
  "ce-code-review": "ce-code-review/references/cross-model-review.md",
} as const

// The reference every dispatching review reads, which carries the seat trigger.
const TRIGGERS = [
  { file: "ce-doc-review/references/dispatch.md", role: "doc-review" },
  { file: "ce-code-review/references/select-and-route.md", role: "code-review" },
] as const

const START = "<!-- ce-review-seats:start -->"
const END = "<!-- ce-review-seats:end -->"

const read = (rel: string) => readFile(path.join(PLUGIN_ROOT, rel), "utf8")

function seatBlock(content: string, file: string): string {
  expect(content.split(START).length, `${file} must hold one seat block start`).toBe(2)
  expect(content.split(END).length, `${file} must hold one seat block end`).toBe(2)
  const start = content.indexOf(START)
  const end = content.indexOf(END)
  expect(end).toBeGreaterThan(start)
  return content.slice(start, end + END.length)
}

describe("review seat block parity", () => {
  test("the seat block is byte-identical in both review skills", async () => {
    const doc = seatBlock(await read(REFERENCES["ce-doc-review"]), REFERENCES["ce-doc-review"])
    const code = seatBlock(await read(REFERENCES["ce-code-review"]), REFERENCES["ce-code-review"])
    expect(code).toBe(doc)
  })

  test("the seat block keeps its load-bearing rules", async () => {
    const content = await read(REFERENCES["ce-doc-review"])
    const block = seatBlock(content, REFERENCES["ce-doc-review"])
    // The persona review survives every seat outcome.
    expect(block).toContain("**The persona review always runs.** It runs when every seat is dropped")
    // One disclosure for the whole list, before anything is sent.
    expect(block).toContain("**One notice names every recipient.** Before anything is sent")
    // A seat is never filled by another model or an intermediary route.
    expect(block).toContain("A dropped seat is never run on another model")
    expect(block).toContain("`grok` uses `grok-cli` only")
    // Fail closed: a malformed or unreadable map runs neither seats nor the single-peer pass.
    expect(block).toMatch(/`state` is `invalid`, or no JSON came back \| Nothing: no seats and no single-peer pass/)
    // The variable the workers read for a seat.
    expect(block).toContain('CROSS_MODEL_SEAT="<n>"')
    // The block is shared, so it names neither skill nor role.
    expect(block.match(/\b(?:doc-review|code-review)\b/g)).toBeNull()
  })

  test("each skill states its own seat brief outside the block", async () => {
    const doc = await read(REFERENCES["ce-doc-review"])
    const code = await read(REFERENCES["ce-code-review"])
    const outside = (content: string, file: string) => content.replace(seatBlock(content, file), "")
    expect(outside(doc, REFERENCES["ce-doc-review"])).toContain("`<brief>` is `whole-doc`")
    expect(outside(code, REFERENCES["ce-code-review"])).toContain("`<brief>` is `adversarial`")
    // The worker reviews the local tree, so a remote-scope review drops worker seats.
    expect(outside(code, REFERENCES["ce-code-review"])).toContain(
      "In `pr-remote` / `branch-remote` scope, a seat that would be served through the worker is dropped",
    )
  })

  test("the seat trigger sits in the reference every dispatching review reads", async () => {
    for (const { file, role } of TRIGGERS) {
      const content = await read(file)
      expect(content, `${file} resolves its role`).toContain(
        `read \`references/model-roles.md\` now and resolve the \`${role}\` role`,
      )
      expect(content, `${file} loads the seat rules`).toContain(
        "**Review seats.** When that key is active, read `references/cross-model-review.md`",
      )
      // Seats run on every dispatching review, not only when a judgment lens or
      // the adversarial reviewer was selected.
      expect(content, `${file} must not gate seats on persona selection`).toContain(
        "A seat does not depend on which personas were selected",
      )
    }
  })
})
