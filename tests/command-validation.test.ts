import { describe, expect, test } from "bun:test"
import { parseFrontmatter } from "../src/utils/frontmatter"
import { promises as fs } from "fs"
import path from "path"

const COMMANDS_DIR = path.join(import.meta.dir, "..", "plugins", "compound-engineering", "commands")
const WORKFLOWS_DIR = path.join(COMMANDS_DIR, "workflows")

const REMOVED_TOOL_PATTERNS = [
  /mcp__plugin_compound-engineering_pw__/,
]

async function discoverCommands(): Promise<string[]> {
  const topLevel = (await fs.readdir(COMMANDS_DIR))
    .filter((f) => f.endsWith(".md"))
    .map((f) => path.join(COMMANDS_DIR, f))

  const workflows = (await fs.readdir(WORKFLOWS_DIR))
    .filter((f) => f.endsWith(".md"))
    .map((f) => path.join(WORKFLOWS_DIR, f))

  return [...topLevel, ...workflows].sort()
}

describe("command frontmatter validation", () => {
  let commandFiles: string[] = []

  test("discovers all 24 commands", async () => {
    commandFiles = await discoverCommands()
    expect(commandFiles.length).toBe(24)
  })

  test("all commands pass frontmatter validation", async () => {
    if (commandFiles.length === 0) {
      commandFiles = await discoverCommands()
    }

    const failures: string[] = []

    for (const filePath of commandFiles) {
      const relativePath = path.relative(path.join(import.meta.dir, ".."), filePath)
      const raw = await fs.readFile(filePath, "utf-8")
      const commandName = path.basename(filePath, ".md")

      // 1. YAML parses without error
      let result: ReturnType<typeof parseFrontmatter>
      try {
        result = parseFrontmatter(raw)
      } catch (err) {
        const msg = `${commandName}: YAML parse error - ${err}`
        failures.push(msg)
        console.error(`::error file=${relativePath}::${msg}`)
        continue
      }

      const { data, body } = result

      // 2. name is non-empty string
      if (typeof data.name !== "string" || data.name.trim().length === 0) {
        const msg = `${commandName}: 'name' must be a non-empty string, got ${JSON.stringify(data.name)}`
        failures.push(msg)
        console.error(`::error file=${relativePath}::${msg}`)
      }

      // 3. description is non-empty string
      if (typeof data.description !== "string" || data.description.trim().length === 0) {
        const msg = `${commandName}: 'description' must be a non-empty string, got ${JSON.stringify(data.description)}`
        failures.push(msg)
        console.error(`::error file=${relativePath}::${msg}`)
      }

      // 4. argument-hint is string (YAML [bracket] syntax parses as array, accept both)
      const hint = data["argument-hint"]
      const hintIsValid = typeof hint === "string" || (Array.isArray(hint) && hint.length > 0)
      if (!hintIsValid) {
        const msg = `${commandName}: 'argument-hint' must be a string or array, got ${JSON.stringify(hint)}`
        failures.push(msg)
        console.error(`::error file=${relativePath}::${msg}`)
      }

      // 5. disable-model-invocation is boolean true (unless escape hatch)
      const hasEscapeHatch = body.includes("# ci-allow: model-invocation")
      if (!hasEscapeHatch) {
        if (data["disable-model-invocation"] !== true) {
          const msg = `${commandName}: 'disable-model-invocation' must be boolean true, got ${JSON.stringify(data["disable-model-invocation"])}`
          failures.push(msg)
          console.error(`::error file=${relativePath}::${msg}`)
        }
      }

      // 6. body doesn't match REMOVED_TOOL_PATTERNS
      for (const pattern of REMOVED_TOOL_PATTERNS) {
        if (pattern.test(body)) {
          const msg = `${commandName}: body contains removed tool pattern ${pattern}`
          failures.push(msg)
          console.error(`::error file=${relativePath}::${msg}`)
        }
      }
    }

    if (failures.length > 0) {
      throw new Error(`Command validation failed:\n${failures.join("\n")}`)
    }
  })
})
