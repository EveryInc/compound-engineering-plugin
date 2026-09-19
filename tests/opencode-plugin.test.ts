import fs from "fs"
import path from "path"
import { describe, expect, test } from "bun:test"
// Import via the package root so the test exercises the same entrypoint
// OpenCode resolves for both package and local-directory installs.
import CompoundEngineeringPlugin from "../index.js"

type SkillRecord = { id: string; name: string; description?: string; path: string; content: string }
type CommandRecord = { name: string; description?: string; execute: (input: { sessionID: string; prompt: { text: string }; delivery: string }) => Promise<void> }

// Expected registrations derived from the skills directory, so a newly added
// skill cannot fail this suite with a stale hard-coded count (see `wtf`).
const skillsDir = path.resolve(import.meta.dir, "../skills")
const expectedSkillIds = fs
  .readdirSync(skillsDir)
  .filter((entry) => fs.existsSync(path.join(skillsDir, entry, "SKILL.md")))

function mockContext() {
  const skills: SkillRecord[] = []
  const commands: CommandRecord[] = []
  const prompts: Array<Record<string, unknown>> = []
  const ctx = {
    location: { directory: "/test" },
    skill: { transform: async (fn: (editor: { add: (s: never) => void }) => void) => fn({ add: (s: never) => skills.push(s) }) },
    command: { transform: async (fn: (editor: { add: (c: never) => void }) => void) => fn({ add: (c: never) => commands.push(c) }) },
    session: {
      prompt: async (input: Record<string, unknown>) => {
        prompts.push(input)
      },
    },
  }
  return { ctx, skills, commands, prompts }
}

describe("opencode plugin", () => {
  test("default export is a dual-shape V1+V2 entrypoint", () => {
    expect(CompoundEngineeringPlugin.id).toBe("compound-engineering")
    expect(typeof CompoundEngineeringPlugin.setup).toBe("function")
    expect(typeof CompoundEngineeringPlugin.server).toBe("function")
  })

  test("V2 setup registers every bundled skill as a skill and a /command", async () => {
    const { ctx, skills, commands } = mockContext()
    await CompoundEngineeringPlugin.setup(ctx as never)

    expect(skills.length).toBe(expectedSkillIds.length)
    expect(commands.length).toBe(expectedSkillIds.length)

    expect(new Set(skills.map((s) => s.id))).toEqual(new Set(expectedSkillIds))

    for (const skill of skills) {
      expect(skill.name).toBe(skill.id)
      expect(skill.description).toBeTruthy()
      expect(skill.path.endsWith("SKILL.md")).toBe(true)
      // Body only: the frontmatter block must not leak into the content.
      expect(skill.content.startsWith("---")).toBe(false)
    }

    const ids = new Set(skills.map((s) => s.id))
    for (const command of commands) {
      expect(ids.has(command.name), `command ${command.name} has a matching skill`).toBe(true)
      expect(typeof command.execute).toBe("function")
    }
  })

  test("V2 command execute submits the skill-loading prompt", async () => {
    const { ctx, commands, prompts } = mockContext()
    await CompoundEngineeringPlugin.setup(ctx as never)

    const ideate = commands.find((c) => c.name === "ce-ideate")
    expect(ideate).toBeTruthy()
    await ideate!.execute({ sessionID: "ses_test", prompt: { text: "my arguments" }, delivery: "steer" })

    expect(prompts.length).toBe(1)
    expect(prompts[0].sessionID).toBe("ses_test")
    expect(prompts[0].delivery).toBe("steer")
    expect(prompts[0].text).toBe("Load and execute the `ce-ideate` skill.\n\nmy arguments")
  })

  test("V1 server() returns a config hook registering the same commands", async () => {
    const hooks = await CompoundEngineeringPlugin.server()
    expect(typeof hooks.config).toBe("function")

    const config: { skills?: { paths: string[] }; command?: Record<string, { template: string; description?: string }> } = {}
    await hooks.config(config)

    expect(config.skills?.paths?.length).toBe(1)
    expect(Object.keys(config.command ?? {}).length).toBe(expectedSkillIds.length)
    expect(config.command?.["ce-brainstorm"]?.template).toBe("Load and execute the `ce-brainstorm` skill.\n\n$ARGUMENTS")
  })

  test("V1 config hook does not clobber explicit commands", async () => {
    const hooks = await CompoundEngineeringPlugin.server()
    const config = { command: { "ce-brainstorm": { template: "explicit wins" } } }
    await hooks.config(config)
    expect(config.command?.["ce-brainstorm"]?.template).toBe("explicit wins")
    expect(config.command?.["ce-plan"]?.template).toContain("ce-plan")
  })
})
