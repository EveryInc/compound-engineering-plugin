import path from "path"
import { backupFile, copyDir, ensureDir, writeJson, writeText } from "../utils/files"
import type { CopilotBundle } from "../types/copilot"

export async function writeCopilotBundle(outputRoot: string, bundle: CopilotBundle): Promise<void> {
  const paths = resolveCopilotPaths(outputRoot)
  await ensureDir(paths.githubDir)

  if (bundle.agents.length > 0) {
    const agentsDir = path.join(paths.githubDir, "agents")
    for (const agent of bundle.agents) {
      await writeText(path.join(agentsDir, `${agent.name}.agent.md`), agent.content + "\n")
    }
  }

  if (bundle.generatedSkills.length > 0) {
    const skillsDir = path.join(paths.githubDir, "skills")
    for (const skill of bundle.generatedSkills) {
      await writeText(path.join(skillsDir, skill.name, "SKILL.md"), skill.content + "\n")
    }
  }

  if (bundle.skillDirs.length > 0) {
    const skillsDir = path.join(paths.githubDir, "skills")
    for (const skill of bundle.skillDirs) {
      await copyDir(skill.sourceDir, path.join(skillsDir, skill.name))
    }
  }

  if (bundle.mcpConfig && Object.keys(bundle.mcpConfig).length > 0) {
    const mcpPath = path.join(paths.githubDir, "copilot-mcp-config.json")
    const backupPath = await backupFile(mcpPath)
    if (backupPath) {
      console.log(`Backed up existing copilot-mcp-config.json to ${backupPath}`)
    }
    await writeJson(mcpPath, { mcpServers: bundle.mcpConfig })
  }
}

function resolveCopilotPaths(outputRoot: string) {
  const base = path.basename(outputRoot)
  // If already pointing at .github, write directly into it
  if (base === ".github") {
    return { githubDir: outputRoot }
  }
  // Otherwise nest under .github
  return { githubDir: path.join(outputRoot, ".github") }
}
