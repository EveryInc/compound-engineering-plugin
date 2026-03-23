import path from "path"
import {
  backupFile,
  copySkillDir,
  ensureDir,
  pathExists,
  readText,
  writeJson,
  writeText,
} from "../utils/files"
import { transformContentForPi } from "../converters/claude-to-pi"
import type { PiBundle } from "../types/pi"

const PI_AGENTS_BLOCK_START = "<!-- BEGIN COMPOUND PI TOOL MAP -->"
const PI_AGENTS_BLOCK_END = "<!-- END COMPOUND PI TOOL MAP -->"

const PI_AGENTS_BLOCK_BODY = `## Compound Engineering (Pi compatibility)

This block is managed by compound-plugin.

Compatibility notes:
- Claude Task(agent, args) maps to the subagent extension tool
- For parallel agent runs, batch multiple subagent calls with multi_tool_use.parallel
- AskUserQuestion maps to the ask_user_question extension tool
- MCP access uses MCPorter via mcporter_list and mcporter_call extension tools
- MCPorter config path: .pi/compound-engineering/mcporter.json (project) or ~/.pi/agent/compound-engineering/mcporter.json (global)
`

export async function writePiBundle(outputRoot: string, bundle: PiBundle): Promise<void> {
  const paths = resolvePiPaths(outputRoot)

  await ensureDir(paths.skillsDir)
  await ensureDir(paths.promptsDir)
  await ensureDir(paths.extensionsDir)

  for (const prompt of bundle.prompts) {
    await writeText(path.join(paths.promptsDir, `${prompt.name}.md`), prompt.content + "\n")
  }

  for (const skill of bundle.skillDirs) {
    await copySkillDir(skill.sourceDir, path.join(paths.skillsDir, skill.name), transformContentForPi)
  }

  for (const skill of bundle.generatedSkills) {
    await writeText(path.join(paths.skillsDir, skill.name, "SKILL.md"), skill.content + "\n")
  }

  for (const extension of bundle.extensions) {
    await writeText(path.join(paths.extensionsDir, extension.name), extension.content + "\n")
  }

  if (bundle.mcporterConfig) {
    const backupPath = await backupFile(paths.mcporterConfigPath)
    if (backupPath) {
      console.log(`Backed up existing MCPorter config to ${backupPath}`)
    }
    await writeJson(paths.mcporterConfigPath, bundle.mcporterConfig)
  }

  await ensurePiAgentsBlock(paths.agentsPath)
}

function resolvePiPaths(outputRoot: string) {
  const base = path.basename(outputRoot)

  // Global install root: ~/.pi/agent
  if (base === "agent") {
    return {
      skillsDir: path.join(outputRoot, "skills"),
      promptsDir: path.join(outputRoot, "prompts"),
      extensionsDir: path.join(outputRoot, "extensions"),
      mcporterConfigPath: path.join(outputRoot, "compound-engineering", "mcporter.json"),
      agentsPath: path.join(outputRoot, "AGENTS.md"),
    }
  }

  // Project local .pi directory
  if (base === ".pi") {
    return {
      skillsDir: path.join(outputRoot, "skills"),
      promptsDir: path.join(outputRoot, "prompts"),
      extensionsDir: path.join(outputRoot, "extensions"),
      mcporterConfigPath: path.join(outputRoot, "compound-engineering", "mcporter.json"),
      agentsPath: path.join(outputRoot, "AGENTS.md"),
    }
  }

  // Custom output root -> nest under .pi
  return {
    skillsDir: path.join(outputRoot, ".pi", "skills"),
    promptsDir: path.join(outputRoot, ".pi", "prompts"),
    extensionsDir: path.join(outputRoot, ".pi", "extensions"),
    mcporterConfigPath: path.join(outputRoot, ".pi", "compound-engineering", "mcporter.json"),
    agentsPath: path.join(outputRoot, "AGENTS.md"),
  }
}

async function ensurePiAgentsBlock(filePath: string): Promise<void> {
  const block = buildPiAgentsBlock()

  if (!(await pathExists(filePath))) {
    await writeText(filePath, block + "\n")
    return
  }

  const existing = await readText(filePath)
  const updated = upsertBlock(existing, block)
  if (updated !== existing) {
    await writeText(filePath, updated)
  }
}

function buildPiAgentsBlock(): string {
  return [PI_AGENTS_BLOCK_START, PI_AGENTS_BLOCK_BODY.trim(), PI_AGENTS_BLOCK_END].join("\n")
}

function upsertBlock(existing: string, block: string): string {
  const startIndex = existing.indexOf(PI_AGENTS_BLOCK_START)
  const endIndex = existing.indexOf(PI_AGENTS_BLOCK_END)

  if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
    const before = existing.slice(0, startIndex).trimEnd()
    const after = existing.slice(endIndex + PI_AGENTS_BLOCK_END.length).trimStart()
    return [before, block, after].filter(Boolean).join("\n\n") + "\n"
  }

  if (existing.trim().length === 0) {
    return block + "\n"
  }

  return existing.trimEnd() + "\n\n" + block + "\n"
}
