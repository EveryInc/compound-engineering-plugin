import path from "path"
import { promises as fs } from "fs"
import { backupFile, copyDir, ensureDir, pathExists, readJson, walkFiles, writeJson, writeText } from "../utils/files"
import type { OpenClawBundle } from "../types/openclaw"

export async function writeOpenClawBundle(outputRoot: string, bundle: OpenClawBundle): Promise<void> {
  const paths = resolveOpenClawPaths(outputRoot)
  await ensureDir(paths.root)

  // Write openclaw.plugin.json
  await writeJson(paths.manifestPath, bundle.manifest)

  // Write package.json
  await writeJson(paths.packageJsonPath, bundle.packageJson)

  // Write index.ts entry point
  await writeText(paths.entryPointPath, bundle.entryPoint)

  // Write generated skills (agents + commands converted to SKILL.md)
  for (const skill of bundle.skills) {
    const skillDir = path.join(paths.skillsDir, skill.dir)
    await ensureDir(skillDir)
    await writeText(path.join(skillDir, "SKILL.md"), skill.content + "\n")
  }

  // Copy original skill directories (preserving references/, assets/, scripts/)
  // and rewrite .claude/ paths to .openclaw/ in markdown files
  for (const skill of bundle.skillDirCopies) {
    const destDir = path.join(paths.skillsDir, skill.name)
    await copyDir(skill.sourceDir, destDir)
    await rewritePathsInDir(destDir)
  }

  // Write openclaw.json config fragment if MCP servers exist
  if (bundle.openclawConfig) {
    const configPath = path.join(paths.root, "openclaw.json")
    const backupPath = await backupFile(configPath)
    if (backupPath) {
      console.log(`Backed up existing config to ${backupPath}`)
    }
    const merged = await mergeOpenClawConfig(configPath, bundle.openclawConfig)
    await writeJson(configPath, merged)
  }
}

function resolveOpenClawPaths(outputRoot: string) {
  return {
    root: outputRoot,
    manifestPath: path.join(outputRoot, "openclaw.plugin.json"),
    packageJsonPath: path.join(outputRoot, "package.json"),
    entryPointPath: path.join(outputRoot, "index.ts"),
    skillsDir: path.join(outputRoot, "skills"),
  }
}

async function rewritePathsInDir(dir: string): Promise<void> {
  const files = await walkFiles(dir)
  for (const file of files) {
    if (!file.endsWith(".md")) continue
    const content = await fs.readFile(file, "utf8")
    const rewritten = content
      .replace(/~\/\.claude\//g, "~/.openclaw/")
      .replace(/\.claude\//g, ".openclaw/")
      .replace(/\.claude-plugin\//g, "openclaw-plugin/")
    if (rewritten !== content) {
      await fs.writeFile(file, rewritten, "utf8")
    }
  }
}

async function mergeOpenClawConfig(
  configPath: string,
  incoming: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  if (!(await pathExists(configPath))) return incoming

  let existing: Record<string, unknown>
  try {
    existing = await readJson<Record<string, unknown>>(configPath)
  } catch {
    console.warn(
      `Warning: existing ${configPath} is not valid JSON. Writing plugin config without merging.`,
    )
    return incoming
  }

  // Merge MCP servers: existing takes precedence on conflict
  const incomingMcp = (incoming.mcpServers ?? {}) as Record<string, unknown>
  const existingMcp = (existing.mcpServers ?? {}) as Record<string, unknown>
  const mergedMcp = { ...incomingMcp, ...existingMcp }

  return {
    ...existing,
    mcpServers: Object.keys(mergedMcp).length > 0 ? mergedMcp : undefined,
  }
}
