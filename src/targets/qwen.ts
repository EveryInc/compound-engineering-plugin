import path from "path"
import { backupFile, copyDir, ensureDir, writeJson, writeText } from "../utils/files"
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
    await writeText(path.join(agentsDir, `${agent.name}.${ext}`), agent.content + "\n")
  }

  // Write commands
  const commandsDir = qwenPaths.commandsDir
  await ensureDir(commandsDir)
  for (const commandFile of bundle.commandFiles) {
    // Support nested commands with colon separator
    const parts = commandFile.name.split(":")
    if (parts.length > 1) {
      const nestedDir = path.join(commandsDir, ...parts.slice(0, -1))
      await ensureDir(nestedDir)
      await writeText(path.join(nestedDir, `${parts[parts.length - 1]}.md`), commandFile.content + "\n")
    } else {
      await writeText(path.join(commandsDir, `${commandFile.name}.md`), commandFile.content + "\n")
    }
  }

  // Copy skills
  if (bundle.skillDirs.length > 0) {
    const skillsRoot = qwenPaths.skillsDir
    await ensureDir(skillsRoot)
    for (const skill of bundle.skillDirs) {
      await copyDir(skill.sourceDir, path.join(skillsRoot, skill.name))
    }
  }
}

function resolveQwenPaths(outputRoot: string) {
  const base = path.basename(outputRoot)
  // Global install: ~/.qwen/extensions/<extension-name>
  // Project install: .qwen/extensions/<extension-name> or <extension-name> at root
  // If the output root already ends with "extensions" or contains ".qwen/extensions", write directly
  if (base === "extensions" || outputRoot.includes(".qwen/extensions")) {
    return {
      root: outputRoot,
      configPath: path.join(outputRoot, "qwen-extension.json"),
      contextPath: path.join(outputRoot, "QWEN.md"),
      agentsDir: path.join(outputRoot, "agents"),
      commandsDir: path.join(outputRoot, "commands"),
      skillsDir: path.join(outputRoot, "skills"),
    }
  }

  // Custom output directory - write directly to the output root (not nested)
  // This is for project-level installs like ./my-extension
  return {
    root: outputRoot,
    configPath: path.join(outputRoot, "qwen-extension.json"),
    contextPath: path.join(outputRoot, "QWEN.md"),
    agentsDir: path.join(outputRoot, "agents"),
    commandsDir: path.join(outputRoot, "commands"),
    skillsDir: path.join(outputRoot, "skills"),
  }
}
