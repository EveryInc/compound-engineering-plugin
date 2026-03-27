import path from "path"
import { backupFile, copyDir, ensureDir, resolveCommandPath, sanitizePathName, writeJson, writeText } from "../utils/files"
import type { QwenBundle, QwenExtensionConfig } from "../types/qwen"

export async function writeQwenBundle(outputRoot: string, bundle: QwenBundle): Promise<void> {
  const qwenPaths = resolveQwenPaths(outputRoot)
  await ensureDir(qwenPaths.root)

  // Write qwen-extension.json config
  const configPath = qwenPaths.configPath
  const backupPath = await backupFile(configPath)
  if (backupPath) {
    console.log(`Backed up existing config to ${backupPath}`)
  }
  await writeJson(configPath, bundle.config)

  // Write context file (QWEN.md)
  if (bundle.contextFile) {
    await writeText(qwenPaths.contextPath, bundle.contextFile + "\n")
  }

  // Write agents
  const agentsDir = qwenPaths.agentsDir
  await ensureDir(agentsDir)
  for (const agent of bundle.agents) {
    const ext = agent.format === "yaml" ? "yaml" : "md"
    await writeText(path.join(agentsDir, `${sanitizePathName(agent.name)}.${ext}`), agent.content + "\n")
  }

  // Write commands
  const commandsDir = qwenPaths.commandsDir
  await ensureDir(commandsDir)
  for (const commandFile of bundle.commandFiles) {
    const dest = await resolveCommandPath(commandsDir, commandFile.name, ".md")
    await writeText(dest, commandFile.content + "\n")
  }

  // Copy skills
  if (bundle.skillDirs.length > 0) {
    const skillsRoot = qwenPaths.skillsDir
    await ensureDir(skillsRoot)
    for (const skill of bundle.skillDirs) {
      await copyDir(skill.sourceDir, path.join(skillsRoot, sanitizePathName(skill.name)))
    }
  }
}

function resolveQwenPaths(outputRoot: string) {
  return {
    root: outputRoot,
    configPath: path.join(outputRoot, "qwen-extension.json"),
    contextPath: path.join(outputRoot, "QWEN.md"),
    agentsDir: path.join(outputRoot, "agents"),
    commandsDir: path.join(outputRoot, "commands"),
    skillsDir: path.join(outputRoot, "skills"),
  }
}
