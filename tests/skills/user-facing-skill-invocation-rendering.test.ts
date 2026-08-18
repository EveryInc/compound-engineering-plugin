import { readFileSync } from "fs"
import path from "path"
import { describe, expect, test } from "bun:test"

function readRepoFile(relativePath: string): string {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8")
}

const modelVisibleRendererCases = [
  {
    file: "skills/lfg/SKILL.md",
    defaults: ["/ce-explain <name>", "/ce-babysit-pr <pr-url>"],
    codex: ["$ce-explain <name>", "$ce-babysit-pr <pr-url>"],
    unnecessaryOmp: ["/skill:ce-explain <name>", "/skill:ce-babysit-pr <pr-url>"],
  },
  {
    file: "skills/ce-babysit-pr/SKILL.md",
    defaults: ["/ce-babysit-pr <url>"],
    codex: ["$ce-babysit-pr <url>"],
    unnecessaryOmp: ["/skill:ce-babysit-pr <url>"],
  },
  {
    file: "skills/ce-babysit-pr/references/watch-loop.md",
    defaults: ["/ce-babysit-pr <url>"],
    codex: ["$ce-babysit-pr <url>"],
    unnecessaryOmp: ["/skill:ce-babysit-pr <url>"],
  },
  {
    // The concept trailer that prints the invocation moved into the apply reference.
    file: "skills/ce-commit-push-pr/references/apply-and-handoff.md",
    defaults: ["/ce-explain <name>"],
    codex: ["$ce-explain <name>"],
    unnecessaryOmp: ["/skill:ce-explain <name>"],
  },
  {
    file: "skills/ce-sweep/SKILL.md",
    defaults: ["/lfg <root>/plans/feedback-sweep-plan.md"],
    codex: ["$lfg <root>/plans/feedback-sweep-plan.md"],
    unnecessaryOmp: ["/skill:lfg <root>/plans/feedback-sweep-plan.md"],
  },
  {
    file: "skills/ce-handoff/SKILL.md",
    defaults: ["/ce-handoff resume <source>"],
    codex: ["$ce-handoff resume <source>"],
    unnecessaryOmp: ["/skill:ce-handoff resume <source>"],
  },
  {
    file: "skills/ce-compound/SKILL.md",
    defaults: ["/ce-compound-refresh <scope>", "/ce-compound"],
    codex: ["$ce-compound-refresh <scope>", "$ce-compound"],
    unnecessaryOmp: ["/skill:ce-compound-refresh <scope>", "/skill:ce-compound"],
  },
  {
    file: "skills/ce-plan/references/universal-planning.md",
    defaults: ["/ce-plan"],
    codex: ["$ce-plan"],
    unnecessaryOmp: ["/skill:ce-plan"],
  },
  {
    file: "skills/ce-prototype/SKILL.md",
    defaults: ["/ce-prototype", "/ce-brainstorm", "/ce-plan"],
    codex: ["$ce-prototype", "$ce-brainstorm", "$ce-plan"],
    unnecessaryOmp: ["/skill:ce-prototype", "/skill:ce-brainstorm", "/skill:ce-plan"],
  },
] as const

const explicitOnlyRendererCases = [
  {
    // The rendering rule travels with the seam that prints the invocation: the
    // ce-polish handoff now lives in the Phase 6 required-read reference.
    file: "skills/ce-explain/references/destinations.md",
    defaults: ["/ce-polish"],
    codex: ["$ce-polish"],
    omp: ["/skill:ce-polish"],
    targets: ["ce-polish"],
  },
  {
    file: "skills/ce-setup/SKILL.md",
    defaults: ["/ce-setup"],
    codex: ["$ce-setup"],
    omp: ["/skill:ce-setup"],
    targets: ["ce-setup"],
  },
  {
    file: "skills/ce-dogfood/SKILL.md",
    defaults: ["/ce-setup", "/ce-dogfood <original arguments>"],
    codex: ["$ce-setup", "$ce-dogfood <original arguments>"],
    omp: ["/skill:ce-setup", "/skill:ce-dogfood <original arguments>"],
    targets: ["ce-setup", "ce-dogfood"],
  },
  {
    file: "skills/ce-sweep/references/interview.md",
    defaults: ["/ce-sweep"],
    codex: ["$ce-sweep"],
    omp: ["/skill:ce-sweep"],
    targets: ["ce-sweep"],
  },
] as const

describe("user-facing skill invocation rendering", () => {
  test.each(modelVisibleRendererCases)(
    "$file keeps model-visible handoffs host-neutral",
    ({ file, defaults, codex, unnecessaryOmp }) => {
      const body = readRepoFile(file)

      expect(body).toMatch(/default(?:s| to)[^\n]*\/[a-z]/i)
      expect(body).toMatch(/\$[a-z][^\n]*(?:Codex|dollar-prefixed)|(?:Codex|dollar-prefixed)[^\n]*\$[a-z]/i)
      expect(body).toMatch(/Render (?:only (?:each|the) invocation as inline code|it as the fenced command below)/i)
      expect(body).toMatch(/Output one form only/i)
      for (const invocation of defaults) expect(body).toContain(invocation)
      for (const invocation of codex) expect(body).toContain(invocation)
      for (const invocation of unnecessaryOmp) expect(body).not.toContain(invocation)
    },
  )

  test.each(explicitOnlyRendererCases)(
    "$file uses deterministic OMP syntax for explicit-only skill targets",
    ({ file, defaults, codex, omp, targets }) => {
      const body = readRepoFile(file)

      expect(body).toMatch(/default(?:s| to)[^\n]*\/[a-z]/i)
      expect(body).toMatch(/\$[a-z][^\n]*(?:Codex|dollar-prefixed)|(?:Codex|dollar-prefixed)[^\n]*\$[a-z]/i)
      expect(body).toMatch(/Render (?:only (?:each|the) invocation as inline code|it as the fenced command below)/i)
      expect(body).toMatch(/Output one form only/i)
      expect(body).toMatch(/\/skill:[a-z][^\n]*oh-my-pi|oh-my-pi[^\n]*\/skill:[a-z]/i)
      for (const target of targets) {
        expect(readRepoFile(`skills/${target}/SKILL.md`)).toMatch(/^disable-model-invocation:\s*true$/m)
      }
      for (const invocation of defaults) expect(body).toContain(invocation)
      for (const invocation of codex) expect(body).toContain(invocation)
      for (const invocation of omp) expect(body).toContain(invocation)
    },
  )

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

    const optimizeWrapUp = readRepoFile("skills/ce-optimize/references/wrap-up.md")
    expect(optimizeWrapUp).toContain("**Run `ce-code-review`**")
    expect(optimizeWrapUp).toContain("**Run `ce-compound`**")
  })

  test("static ce-optimize examples use host-neutral capability wording", () => {
    const usageGuide = readRepoFile("skills/ce-optimize/references/usage-guide.md")

    expect(usageGuide).toContain("Run the `ce-optimize` skill to find")
    expect(usageGuide).toContain("Run the `ce-optimize` skill to improve")
    expect(usageGuide).toContain("Run the `ce-optimize` skill to create")
    expect(usageGuide).not.toContain("Use /ce-optimize")
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
