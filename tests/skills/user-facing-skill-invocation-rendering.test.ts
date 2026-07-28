import { readFileSync } from "fs"
import path from "path"
import { describe, expect, test } from "bun:test"

function readRepoFile(relativePath: string): string {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8")
}

const rendererCases = [
  {
    file: "skills/lfg/SKILL.md",
    defaults: ["/ce-explain <name>", "/ce-babysit-pr <pr-url>"],
    codex: ["$ce-explain <name>", "$ce-babysit-pr <pr-url>"],
  },
  {
    file: "skills/ce-babysit-pr/SKILL.md",
    defaults: ["/ce-babysit-pr <url>"],
    codex: ["$ce-babysit-pr <url>"],
  },
  {
    file: "skills/ce-babysit-pr/references/watch-loop.md",
    defaults: ["/ce-babysit-pr <url>"],
    codex: ["$ce-babysit-pr <url>"],
  },
  {
    file: "skills/ce-commit-push-pr/SKILL.md",
    defaults: ["/ce-explain <name>"],
    codex: ["$ce-explain <name>"],
  },
  {
    file: "skills/ce-explain/SKILL.md",
    defaults: ["/ce-polish"],
    codex: ["$ce-polish"],
  },
  {
    file: "skills/ce-setup/SKILL.md",
    defaults: ["/ce-setup"],
    codex: ["$ce-setup"],
  },
  {
    file: "skills/ce-dogfood/SKILL.md",
    defaults: ["/ce-setup", "/ce-dogfood <original arguments>"],
    codex: ["$ce-setup", "$ce-dogfood <original arguments>"],
  },
  {
    file: "skills/ce-sweep/SKILL.md",
    defaults: ["/lfg <root>/plans/feedback-sweep-plan.md"],
    codex: ["$lfg <root>/plans/feedback-sweep-plan.md"],
  },
  {
    file: "skills/ce-sweep/references/interview.md",
    defaults: ["/ce-sweep"],
    codex: ["$ce-sweep"],
  },
  {
    file: "skills/ce-handoff/SKILL.md",
    defaults: ["/ce-handoff resume <source>"],
    codex: ["$ce-handoff resume <source>"],
  },
  {
    file: "skills/ce-compound/SKILL.md",
    defaults: ["/ce-compound-refresh <scope>", "/ce-compound"],
    codex: ["$ce-compound-refresh <scope>", "$ce-compound"],
  },
  {
    file: "skills/ce-plan/references/plan-handoff.md",
    defaults: ["/ce-plan output:md"],
    codex: ["$ce-plan output:md"],
  },
  {
    file: "skills/ce-plan/references/universal-planning.md",
    defaults: ["/ce-plan"],
    codex: ["$ce-plan"],
  },
] as const

describe("user-facing skill invocation rendering", () => {
  test.each(rendererCases)("$file defaults to slash and reserves dollar syntax for Codex", ({ file, defaults, codex }) => {
    const body = readRepoFile(file)

    expect(body).toMatch(/default(?:s| to)[^\n]*\/[a-z]/i)
    expect(body).toMatch(/\$[a-z][^\n]*(?:Codex|dollar-prefixed)|(?:Codex|dollar-prefixed)[^\n]*\$[a-z]/i)
    expect(body).toMatch(/Render (?:only (?:each|the) invocation as inline code|it as the fenced command below)/i)
    expect(body).toMatch(/Output one form only/i)
    for (const invocation of defaults) expect(body).toContain(invocation)
    for (const invocation of codex) expect(body).toContain(invocation)
  })

  test("rendering rules sit at the output sections that consume them", () => {
    const setup = readRepoFile("skills/ce-setup/SKILL.md")
    expect(setup.indexOf("User-runnable invocation rendering")).toBeLessThan(
      setup.indexOf("Run `<rendered invocation>`"),
    )

    const sweep = readRepoFile("skills/ce-sweep/SKILL.md")
    expect(sweep.indexOf("User-runnable invocation rendering", sweep.indexOf("#### 2i. Wrap-up"))).toBeGreaterThan(-1)
    expect(sweep).toContain("<rendered lfg invocation for <root>/plans/feedback-sweep-plan.md>")

    const handoff = readRepoFile("skills/ce-handoff/SKILL.md")
    expect(handoff.indexOf("User-runnable invocation rendering")).toBeLessThan(
      handoff.indexOf("<rendered resume invocation>"),
    )
  })

  test("agent-to-agent routes use semantic skill names instead of user command syntax", () => {
    const plan = readRepoFile("skills/ce-plan/SKILL.md")
    const planHandoff = readRepoFile("skills/ce-plan/references/plan-handoff.md")
    expect(plan).toContain("**Start `ce-work`**")
    expect(planHandoff).toContain("**Start `ce-work`**")
    expect(plan).not.toContain("**Start `/ce-work`**")
    expect(planHandoff).not.toContain("**Start `/ce-work`**")

    const verdictRouting = readRepoFile("skills/ce-brainstorm/references/verdict-routing.md")
    expect(verdictRouting).toContain("invoke the `ce-pov` skill")
    expect(verdictRouting).toContain("want a `ce-pov` verdict")
    expect(verdictRouting).not.toContain("tell the user to type `/ce-pov`")

    const work = readRepoFile("skills/ce-work/SKILL.md")
    expect(work).toContain("benefit from `ce-brainstorm` or `ce-plan`")

    const debug = readRepoFile("skills/ce-debug/SKILL.md")
    expect(debug).toContain("control has transferred to `ce-brainstorm`")

    const optimize = readRepoFile("skills/ce-optimize/SKILL.md")
    expect(optimize).toContain("**Run `ce-code-review`**")
    expect(optimize).toContain("**Run `ce-compound`**")
  })

  test("Codex goal remains a built-in exception, not a converted skill invocation", () => {
    const plan = readRepoFile("skills/ce-plan/SKILL.md")
    const planHandoff = readRepoFile("skills/ce-plan/references/plan-handoff.md")
    expect(plan).toContain("Run it as a `/goal`")
    expect(planHandoff).toContain("Run it as a `/goal`")
    expect(plan).not.toContain("$goal")
    expect(planHandoff).not.toContain("$goal")
  })
})
