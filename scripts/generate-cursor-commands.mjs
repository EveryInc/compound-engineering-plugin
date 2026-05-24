#!/usr/bin/env node
/**
 * Generates Cursor slash-command stubs for every plugin skill:
 * - plugins/<plugin>/commands/<slug>.md — bundled with the Cursor plugin directory
 * - .cursor/commands/<slug>.md — when this monorepo is opened as the workspace
 * - ~/.cursor/commands/<slug>.md — user-global; Cursor merges these into `/` in every project
 *
 * Run from repo root: node scripts/generate-cursor-commands.mjs
 *
 * Set NO_GLOBAL_CURSOR_COMMANDS=1 to skip writing ~/.cursor/commands/
 */
import { promises as fs } from "fs"
import os from "os"
import path from "path"
import { fileURLToPath } from "url"

const MARKER = "<!-- compound-plugin:cursor-command generated -->"

function slugFromSkillName(skillName) {
  const s = skillName
    .toLowerCase()
    .replace(/:/g, "-")
    .replace(/[^a-z0-9.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
  return s.length > 0 ? s : "skill"
}

function parseSkillName(raw, sourcePath) {
  if (!raw.startsWith("---\n")) {
    console.warn(`Skip (no frontmatter): ${sourcePath}`)
    return null
  }
  const end = raw.indexOf("\n---\n", 4)
  if (end < 0) {
    console.warn(`Skip (unclosed frontmatter): ${sourcePath}`)
    return null
  }
  const fm = raw.slice(4, end)
  for (const line of fm.split("\n")) {
    const trimmed = line.trim()
    if (!trimmed.startsWith("name:")) continue
    let v = trimmed.slice(5).trim()
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1)
    }
    if (v.length === 0) continue
    return v
  }
  console.warn(`Skip (missing name): ${sourcePath}`)
  return null
}

function assignUniqueSlugs(entries) {
  const slugToEntries = new Map()
  for (const e of entries) {
    const base = slugFromSkillName(e.skillName)
    const list = slugToEntries.get(base) ?? []
    list.push(e)
    slugToEntries.set(base, list)
  }
  const out = new Map()
  for (const [, group] of slugToEntries) {
    if (group.length === 1) {
      out.set(group[0], slugFromSkillName(group[0].skillName))
    } else {
      for (const e of group) {
        out.set(e, `${slugFromSkillName(e.skillName)}-${e.skillFolder}`)
      }
    }
  }
  return out
}

function pluginCommandBody(e, cmdSlug) {
  const relSkill = path.posix.join("skills", e.skillFolder, "SKILL.md")
  return `${MARKER}

# ${e.skillName}

Invokes **\`${e.skillName}\`** (${e.pluginFolder}). Slash command: \`/${cmdSlug}\`.

1. Read **\`${relSkill}\`** relative to this plugin root (the directory that contains both \`skills/\` and \`commands/\`). Use the Read tool and resolve against the plugin install root if the workspace cwd differs.
2. Execute that skill end-to-end. User input: **$1**. If \`$1\` is empty, follow the skill's instructions for missing input.

Skill directory: \`${e.skillFolder}\`
`
}

function workspaceCommandBody(e, cmdSlug) {
  const relFromRepo = path.posix.join(
    "plugins",
    e.pluginFolder,
    "skills",
    e.skillFolder,
    "SKILL.md",
  )
  return `${MARKER}

# ${e.skillName}

Invokes **\`${e.skillName}\`** from \`${e.pluginFolder}\`. Slash command: \`/${cmdSlug}\`.

1. From the repository root, read **\`${relFromRepo}\`** and execute that skill end-to-end.
2. User input: **$1**. If \`$1\` is empty, follow the skill's instructions for missing input.

Skill directory: \`${e.skillFolder}\`
`
}

/** Slash palette in other repos only picks up ~/.cursor/commands — use absolute skill path. */
function globalUserCommandBody(e, cmdSlug, absoluteSkillPath) {
  const posixAbs = absoluteSkillPath.split(path.sep).join("/")
  return `${MARKER}

# ${e.skillName}

Invokes **\`${e.skillName}\`** from \`${e.pluginFolder}\`. Slash command: \`/${cmdSlug}\`.

1. Read **\`${posixAbs}\`** with the Read tool (absolute path to this checkout), then execute that skill end-to-end.
2. User input: **$1**. If \`$1\` is empty, follow the skill's instructions for missing input.

Skill directory: \`${e.skillFolder}\`
`
}

async function collectSkills(repoRoot) {
  const pluginsDir = path.join(repoRoot, "plugins")
  const out = []
  const pluginNames = await fs.readdir(pluginsDir, { withFileTypes: true })
  for (const ent of pluginNames) {
    if (!ent.isDirectory()) continue
    const skillsRoot = path.join(pluginsDir, ent.name, "skills")
    let skillDirs = []
    try {
      const subs = await fs.readdir(skillsRoot, { withFileTypes: true })
      skillDirs = subs.filter((d) => d.isDirectory()).map((d) => d.name)
    } catch {
      continue
    }
    for (const skillFolder of skillDirs) {
      const skillPath = path.join(skillsRoot, skillFolder, "SKILL.md")
      let raw
      try {
        raw = await fs.readFile(skillPath, "utf8")
      } catch {
        continue
      }
      const skillName = parseSkillName(raw, skillPath)
      if (!skillName) continue
      out.push({
        pluginFolder: ent.name,
        skillFolder,
        skillName,
      })
    }
  }
  return out
}

/** Remove only our generated .md files (never wipe a whole user directory). */
async function removeGeneratedMarkdownFiles(dir) {
  let names = []
  try {
    names = await fs.readdir(dir)
  } catch {
    return
  }
  for (const name of names) {
    if (!name.endsWith(".md")) continue
    const p = path.join(dir, name)
    const text = await fs.readFile(p, "utf8").catch(() => "")
    if (
      text.startsWith(MARKER) ||
      text.includes("compound-plugin:cursor-command generated")
    ) {
      await fs.rm(p, { force: true })
    }
  }
}

async function main() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url))
  const repoRoot = path.resolve(path.join(scriptDir, ".."))
  const entries = await collectSkills(repoRoot)
  entries.sort((a, b) => {
    const pa = `${a.pluginFolder}/${a.skillFolder}`
    const pb = `${b.pluginFolder}/${b.skillFolder}`
    return pa.localeCompare(pb)
  })

  const slugByEntry = assignUniqueSlugs(entries)

  for (const pluginFolder of new Set(entries.map((e) => e.pluginFolder))) {
    const cmdDir = path.join(repoRoot, "plugins", pluginFolder, "commands")
    await fs.mkdir(cmdDir, { recursive: true })
    await removeGeneratedMarkdownFiles(cmdDir)
  }

  const workspaceCmdDir = path.join(repoRoot, ".cursor", "commands")
  await fs.mkdir(workspaceCmdDir, { recursive: true })
  await removeGeneratedMarkdownFiles(workspaceCmdDir)

  const writeGlobal = process.env.NO_GLOBAL_CURSOR_COMMANDS !== "1"
  const globalCmdDir = path.join(os.homedir(), ".cursor", "commands")
  if (writeGlobal) {
    await fs.mkdir(globalCmdDir, { recursive: true })
    await removeGeneratedMarkdownFiles(globalCmdDir)
  }

  const writtenWorkspace = new Set()

  for (const e of entries) {
    const cmdSlug = slugByEntry.get(e)
    const pluginCmdDir = path.join(repoRoot, "plugins", e.pluginFolder, "commands")
    const pluginPath = path.join(pluginCmdDir, `${cmdSlug}.md`)
    await fs.writeFile(pluginPath, pluginCommandBody(e, cmdSlug), "utf8")

    const wsPath = path.join(workspaceCmdDir, `${cmdSlug}.md`)
    if (writtenWorkspace.has(cmdSlug)) {
      throw new Error(`Duplicate workspace command slug: ${cmdSlug}`)
    }
    writtenWorkspace.add(cmdSlug)
    await fs.writeFile(wsPath, workspaceCommandBody(e, cmdSlug), "utf8")

    if (writeGlobal) {
      const absSkill = path.join(
        repoRoot,
        "plugins",
        e.pluginFolder,
        "skills",
        e.skillFolder,
        "SKILL.md",
      )
      const globalPath = path.join(globalCmdDir, `${cmdSlug}.md`)
      await fs.writeFile(globalPath, globalUserCommandBody(e, cmdSlug, absSkill), "utf8")
    }
  }

  const globalNote = writeGlobal ? ` + ~/.cursor/commands (${writtenWorkspace.size} global)` : ""
  console.log(
    `Wrote ${entries.length} Cursor commands per plugin + workspace (${writtenWorkspace.size} workspace files)${globalNote}.`,
  )
}

await main()
