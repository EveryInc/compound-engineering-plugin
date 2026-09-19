import path from "path"
import fs from "fs"
import { fileURLToPath } from "url"

const pluginDir = path.dirname(fileURLToPath(import.meta.url))
const skillsDir = path.resolve(pluginDir, "../../skills")

function unquote(value) {
  if (value.length < 2) return value
  const quote = value[0]
  if ((quote !== '"' && quote !== "'") || value[value.length - 1] !== quote) return value
  const inner = value.slice(1, -1)
  return quote === '"' ? inner.replace(/\\(["\\])/g, "$1") : inner.replace(/''/g, "'")
}

// Scoped to the leading `---` block so a `name:`/`description:` line inside a
// fenced YAML example in the skill body cannot register a bogus command.
function parseFrontmatter(content) {
  const block = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!block) return null
  const fields = {}
  for (const line of block[1].split(/\r?\n/)) {
    const pair = line.match(/^([A-Za-z][\w-]*):\s*(.*)$/)
    if (pair) fields[pair[1]] = unquote(pair[2].trim())
  }
  return fields
}

// Load every bundled skill once; both the V1 config hook and the V2 setup
// derive their registrations from this single source of truth.
function loadSkills() {
  const skills = []
  let entries
  try {
    entries = fs.readdirSync(skillsDir)
  } catch {
    return skills
  }
  for (const entry of entries) {
    let content
    try {
      content = fs.readFileSync(path.join(skillsDir, entry, "SKILL.md"), "utf8")
    } catch {
      continue
    }
    const block = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
    const fields = parseFrontmatter(content)
    if (!block || !fields || !fields.name) continue
    const body = content.slice(block[0].length).replace(/^\r?\n/, "")
    skills.push({
      id: entry,
      name: fields.name,
      description: fields.description,
      path: path.join(skillsDir, entry, "SKILL.md"),
      content: body,
      // V2 honors `slash: false`; V1 honored `user-invocable: false`.
      commandable: fields["user-invocable"] !== "false" && fields.slash !== "false",
    })
  }
  return skills
}

function commandName(skill) {
  return skill.name
}

// ---------------------------------------------------------------------------
// V2 (OpenCode 2.x): register through the plugin context transforms.
// ---------------------------------------------------------------------------

async function setup(ctx) {
  const skills = loadSkills()

  await ctx.skill.transform((editor) => {
    for (const skill of skills) {
      const record = {
        id: skill.id,
        name: skill.name,
        path: skill.path,
        content: skill.content,
      }
      if (skill.description) record.description = skill.description
      editor.add(record)
    }
  })

  await ctx.command.transform((editor) => {
    for (const skill of skills) {
      if (!skill.commandable) continue
      editor.add({
        name: commandName(skill),
        description: skill.description,
        execute: async ({ sessionID, prompt, delivery }) => {
          await ctx.session.prompt({
            ...prompt,
            sessionID,
            text: `Load and execute the \`${skill.name}\` skill.\n\n${prompt.text}`,
            delivery,
          })
        },
      })
    }
  })
}

// ---------------------------------------------------------------------------
// V1 (OpenCode 1.x): mutate the resolved config before it is applied.
// ---------------------------------------------------------------------------

async function server() {
  const skillCommands = {}
  for (const skill of loadSkills()) {
    if (!skill.commandable) continue
    const command = {
      template: `Load and execute the \`${skill.name}\` skill.\n\n$ARGUMENTS`,
    }
    if (skill.description) command.description = skill.description
    skillCommands[commandName(skill)] = command
  }

  return {
    config: async (config) => {
      config.skills = config.skills || {}
      config.skills.paths = config.skills.paths || []
      if (!config.skills.paths.includes(skillsDir)) {
        config.skills.paths.push(skillsDir)
      }
      config.command = config.command || {}
      for (const [name, cmd] of Object.entries(skillCommands)) {
        if (!(name in config.command)) {
          config.command[name] = cmd
        }
      }
    },
  }
}

// Dual-shape entrypoint per the OpenCode V1→V2 migration guide: V2 calls
// `setup()`, V1 (1.18.29+) calls `server()`.
export const CompoundEngineeringPlugin = {
  id: "compound-engineering",
  setup,
  server,
}

export default CompoundEngineeringPlugin
