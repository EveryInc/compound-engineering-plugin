import path from "path"
import fs from "fs"
import { fileURLToPath } from "url"
import { createV1Plugin } from "./compound-engineering/opencode-v1.js"
import { createV2Setup } from "./compound-engineering/opencode-v2.js"

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
  return {
    fields,
    body: content.slice(block[0].length).replace(/^\r?\n/, ""),
  }
}

function loadSkills() {
  const skills = []
  let entries
  try {
    entries = fs.readdirSync(skillsDir)
  } catch {
    return skills
  }
  for (const entry of entries) {
    const skillPath = path.join(skillsDir, entry, "SKILL.md")
    let content
    try {
      content = fs.readFileSync(skillPath, "utf8")
    } catch {
      continue
    }
    const parsed = parseFrontmatter(content)
    if (!parsed || !parsed.fields.name) continue
    skills.push({
      name: parsed.fields.name,
      description: parsed.fields.description,
      body: parsed.body,
      skillPath,
      suppressed: parsed.fields["user-invocable"] === "false",
    })
  }
  return skills
}

const skills = loadSkills()

const CompoundEngineeringPlugin = createV1Plugin({ skills, skillsDir })
const setupV2 = createV2Setup(skills)

export { CompoundEngineeringPlugin }

export default {
  id: "compound-engineering",
  server: CompoundEngineeringPlugin,
  setup: setupV2,
}
