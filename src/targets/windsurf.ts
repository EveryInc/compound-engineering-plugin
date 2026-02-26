import path from "path"
import { backupFile, copyDir, ensureDir, pathExists, readJson, writeJsonSecure, writeText } from "../utils/files"
import { formatFrontmatter } from "../utils/frontmatter"
import type { WindsurfBundle } from "../types/windsurf"

/**
 * Write a WindsurfBundle directly into outputRoot.
 *
 * Unlike other target writers, this writer expects outputRoot to be the final
 * resolved directory — the CLI handles scope-based nesting (global vs workspace).
 */
export async function writeWindsurfBundle(outputRoot: string, bundle: WindsurfBundle): Promise<void> {
  await ensureDir(outputRoot)

  // Write agent skills (before pass-through copies so pass-through takes precedence on collision)
  if (bundle.agentSkills.length > 0) {
    const skillsDir = path.join(outputRoot, "skills")
    await ensureDir(skillsDir)
    for (const skill of bundle.agentSkills) {
      validatePathSafe(skill.name, "agent skill")
      const destDir = path.join(skillsDir, skill.name)

      const resolvedDest = path.resolve(destDir)
      if (!resolvedDest.startsWith(path.resolve(skillsDir))) {
        console.warn(`Warning: Agent skill name "${skill.name}" escapes skills/. Skipping.`)
        continue
      }

      await ensureDir(destDir)
      await writeText(path.join(destDir, "SKILL.md"), skill.content)
    }
  }

  // Write command workflows (flat in workflows/, per spec)
  if (bundle.commandWorkflows.length > 0) {
    const workflowsDir = path.join(outputRoot, "workflows")
    await ensureDir(workflowsDir)
    for (const workflow of bundle.commandWorkflows) {
      validatePathSafe(workflow.name, "command workflow")
      const content = formatWorkflowContent(workflow.name, workflow.description, workflow.body)
      await writeText(path.join(workflowsDir, `${workflow.name}.md`), content)
    }
  }

  // Copy pass-through skill directories (after generated skills so copies overwrite on collision)
  if (bundle.skillDirs.length > 0) {
    const skillsDir = path.join(outputRoot, "skills")
    await ensureDir(skillsDir)
    for (const skill of bundle.skillDirs) {
      validatePathSafe(skill.name, "skill directory")
      const destDir = path.join(skillsDir, skill.name)

      const resolvedDest = path.resolve(destDir)
      if (!resolvedDest.startsWith(path.resolve(skillsDir))) {
        console.warn(`Warning: Skill name "${skill.name}" escapes skills/. Skipping.`)
        continue
      }

      await copyDir(skill.sourceDir, destDir)
    }
  }

  // Merge MCP config
  if (bundle.mcpConfig) {
    const mcpPath = path.join(outputRoot, "mcp_config.json")
    const backupPath = await backupFile(mcpPath)
    if (backupPath) {
      console.log(`Backed up existing mcp_config.json to ${backupPath}`)
    }

    let existingConfig: Record<string, unknown> = {}
    if (await pathExists(mcpPath)) {
      try {
        const parsed = await readJson<unknown>(mcpPath)
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          existingConfig = parsed as Record<string, unknown>
        }
      } catch {
        console.warn("Warning: existing mcp_config.json could not be parsed and will be replaced.")
      }
    }

    const existingServers =
      existingConfig.mcpServers &&
      typeof existingConfig.mcpServers === "object" &&
      !Array.isArray(existingConfig.mcpServers)
        ? (existingConfig.mcpServers as Record<string, unknown>)
        : {}
    const merged = { ...existingConfig, mcpServers: { ...existingServers, ...bundle.mcpConfig.mcpServers } }
    await writeJsonSecure(mcpPath, merged)
  }
}

function validatePathSafe(name: string, label: string): void {
  if (name.includes("..") || name.includes("/") || name.includes("\\")) {
    throw new Error(`${label} name contains unsafe path characters: ${name}`)
  }
}

function formatWorkflowContent(name: string, description: string, body: string): string {
  return formatFrontmatter({ description }, `# ${name}\n\n${body}`) + "\n"
}
