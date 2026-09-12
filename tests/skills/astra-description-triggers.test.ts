import { readFileSync } from "fs"
import path from "path"
import { describe, expect, test } from "bun:test"
import { parseFrontmatter } from "../../src/utils/frontmatter"

const ROOT = process.cwd()
const skill = (name: string) =>
  readFileSync(path.join(ROOT, "skills", name, "SKILL.md"), "utf8")

function descriptionOf(name: string): string {
  const { data } = parseFrontmatter(skill(name), `skills/${name}/SKILL.md`)
  expect(typeof data.description, `${name} must have a description`).toBe("string")
  return String(data.description).replace(/\s+/g, " ").trim()
}

describe("Astra-shaped model-invoked descriptions", () => {
  test("ce-explain triggers on an asked explanation, not any further work", () => {
    const d = descriptionOf("ce-explain")
    expect(d.toLowerCase()).toMatch(/^explain /)
    expect(d).toMatch(/Use when the user asks for an explanation/)
    expect(d).toMatch(/window of work/)
    expect(d).not.toMatch(/further work/i)
    expect(d).not.toMatch(/understanding a system, change, idea/i)
  })

  test("ce-code-review does not claim every PR as a trigger", () => {
    const d = descriptionOf("ce-code-review")
    expect(d.toLowerCase()).toMatch(/^review /)
    expect(d).toMatch(/Use when asked to review code/)
    expect(d).not.toMatch(/Use before PRs/i)
  })

  test("ce-noslop does not catalog synonyms of one job", () => {
    const d = descriptionOf("ce-noslop")
    expect(d.toLowerCase()).toMatch(/^rewrite/)
    expect(d).toMatch(/AI writing tells/)
    expect(d).not.toMatch(/destylize/i)
    expect(d).not.toMatch(/humanize/i)
    expect(d).not.toMatch(/AI-sounding/i)
    expect(d).not.toMatch(/machine-written/i)
  })

  test("ce-brainstorm drops the unfamiliar-territory synonym branch", () => {
    const d = descriptionOf("ce-brainstorm")
    expect(d.toLowerCase()).toMatch(/^explore /)
    expect(d).not.toMatch(/blindspot pass/i)
    expect(d).not.toMatch(/territory they do not know/i)
    expect(d).toMatch(/Use ce-pov/)
  })

  test("ce-pov keeps distinct subject shapes and leaves sibling catalogs in the body", () => {
    const d = descriptionOf("ce-pov")
    expect(d.toLowerCase()).toMatch(/^judge /)
    expect(d).toMatch(/oracle panel/)
    expect(d).not.toMatch(/ce-bakeoff/)
    expect(d).not.toMatch(/ce-ideate/)
    expect(skill("ce-pov")).toContain("ce-bakeoff")
  })

  test("ce-strategy does not pull planning siblings into its trigger", () => {
    const d = descriptionOf("ce-strategy")
    expect(d.toLowerCase()).toMatch(/^create or update/)
    expect(d).not.toMatch(/ce-ideate/)
    expect(d).not.toMatch(/ce-brainstorm/)
    expect(d).not.toMatch(/ce-plan/)
  })
})

describe("ask-first follows the authority envelope", () => {
  test("ce-debug asks for a fix path only when the request has not authorized it", () => {
    const body = skill("ce-debug")
    expect(body).toMatch(/When the request has not already authorized the next action, ask \(per \*\*Blocking questions\*\*\)/)
    expect(body).not.toMatch(/Do not assume the user wants action now/)
  })

  test("ce-plan treats an already-authorized next action as the handoff answer", () => {
    const body = skill("ce-plan")
    expect(body).toMatch(/A request that already authorizes the next action is that answer/)
    expect(body).toMatch(/Every normal interactive branch[\s\S]{0,160}incomplete until the user has been asked what to do next/)
  })

  test("ce-prototype builds when the request already authorizes the prototype", () => {
    const body = skill("ce-prototype")
    const scoping = readFileSync(
      path.join(ROOT, "skills/ce-prototype/references/scoping.md"),
      "utf8",
    )
    expect(body).toMatch(/already is to prototype a named thing is that authorization/)
    expect(scoping).toMatch(/go-ahead message is owed when/)
    expect(scoping).not.toMatch(/Do not build until they proceed/)
  })
})

describe("always-on AGENTS.md load", () => {
  test("points task-loaded essays at the solutions note and authorizes the local suite", () => {
    const agents = readFileSync(path.join(ROOT, "AGENTS.md"), "utf8")
    expect(agents).toContain("docs/solutions/developer-experience/always-on-agents-md.md")
    expect(agents).toContain("scripts/run-tests.ts")
    expect(agents).toContain("TimeoutError")
    expect(agents).toMatch(
      /The suite uses disposable fixtures and has no production access[\s\S]*without asking for approval at each step/,
    )
  })
})
