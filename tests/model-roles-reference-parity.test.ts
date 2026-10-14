import { access, readFile } from "fs/promises"
import path from "path"
import { describe, expect, test } from "bun:test"

const PLUGIN_ROOT = path.join(process.cwd(), "skills")

// The model role contract is byte-duplicated into every role skill (the plugin
// has no cross-skill import mechanism — see AGENTS.md "File References in
// Skills"). All copies must stay identical; editing one without the others fails
// this test. Add a skill to CONSUMER_SKILLS when it gains a copy.
const REFERENCE = "references/model-roles.md"
const RESOLVER = "scripts/model-role-resolve.py"

const CONSUMER_SKILLS = [
  "ce-brainstorm",
  "ce-plan",
  "ce-doc-review",
  "ce-code-review",
  "ce-work",
  "ce-debug",
  "ce-simplify-code",
  "ce-compound",
]

const readCopy = (skill: string) => readFile(path.join(PLUGIN_ROOT, skill, REFERENCE), "utf8")

describe("model role contract reference parity", () => {
  test(`${REFERENCE} exists in every consumer and is byte-identical`, async () => {
    const contents = await Promise.all(CONSUMER_SKILLS.map(readCopy))
    for (let i = 1; i < contents.length; i++) {
      expect(contents[i]).toBe(contents[0])
    }
  })

  test("every consumer bundles the resolver the reference runs", async () => {
    for (const skill of CONSUMER_SKILLS) {
      expect(await readCopy(skill)).toContain(`"$SKILL_DIR/${RESOLVER}"`)
      await access(path.join(PLUGIN_ROOT, skill, RESOLVER)) // fails the test if the script is missing
    }
  })

  test("keeps the tokens role skills and the resolver share", async () => {
    const src = await readCopy(CONSUMER_SKILLS[0])
    for (const token of ["Model role", "`inherit`", "model-role-resolve.py"]) {
      expect(src).toContain(token)
    }
    // The effort scale the resolver emits as `effort_scale`.
    for (const effort of ["low", "medium", "high", "xhigh", "max"]) {
      expect(src).toContain(`\`${effort}\``)
    }
  })

  // The same bytes ship in eight skills, so the reference stays role-neutral:
  // the calling skill's hook names the role, the deliverable, and the peer route.
  test("names no skill", async () => {
    const src = await readCopy(CONSUMER_SKILLS[0])
    expect(src.match(/\b(?:ce-[a-z][a-z-]*|lfg)\b/g)).toBeNull()
  })
})
