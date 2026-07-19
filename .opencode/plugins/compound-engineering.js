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

function loadSkills() {
  const commands = {}
  let entries
  try {
    entries = fs.readdirSync(skillsDir)
  } catch {
    return commands
  }
  for (const entry of entries) {
    let content
    try {
      content = fs.readFileSync(path.join(skillsDir, entry, "SKILL.md"), "utf8")
    } catch {
      continue
    }
    const fields = parseFrontmatter(content)
    if (!fields || !fields.name) continue
    if (fields["user-invocable"] === "false") continue
    const command = {
      template: `Load and execute the \`${fields.name}\` skill.\n\n$ARGUMENTS`,
    }
    if (fields.description) command.description = fields.description
    commands[fields.name] = command
  }
  return commands
}

const skillCommands = loadSkills()

export const CompoundEngineeringPlugin = async () => ({
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
})

export default CompoundEngineeringPlugin
