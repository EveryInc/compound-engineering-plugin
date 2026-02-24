import path from "path"
import { backupFile, copyDir, ensureDir, pathExists, readJson, writeJson, writeText } from "../utils/files"
import type { OpenCodeBundle, OpenCodeConfig } from "../types/opencode"

// Merges plugin config into existing opencode.json. User keys win on conflict. See ADR-002.
async function mergeOpenCodeConfig(
  configPath: string,
  incoming: OpenCodeConfig,
): Promise<OpenCodeConfig> {
  // If no existing config, write plugin config as-is
  if (!(await pathExists(configPath))) return incoming

  let existing: OpenCodeConfig
  try {
    existing = await readJson<OpenCodeConfig>(configPath)
  } catch {
    // Safety first per AGENTS.md -- do not destroy user data even if their config is malformed.
    // Warn and fall back to plugin-only config rather than crashing.
    console.warn(
      `Warning: existing ${configPath} is not valid JSON. Writing plugin config without merging.`
    )
    return incoming
  }

  // User config wins on conflict -- see ADR-002
  // MCP servers: add plugin entry, skip keys already in user config.
  const mergedMcp = {
    ...(incoming.mcp ?? {}),
    ...(existing.mcp ?? {}), // existing takes precedence (overwrites same-named plugin entry)
  }

  // Permission: add plugin entry, skip keys already in user config.
  const mergedPermission = incoming.permission
    ? {
        ...(incoming.permission),
        ...(existing.permission ?? {}), // existing takes precedence
      }
    : existing.permission

  // Tools: same pattern
  const mergedTools = incoming.tools
    ? {
        ...(incoming.tools),
        ...(existing.tools ?? {}),
      }
    : existing.tools

  return {
    ...existing,                    // all user keys preserved
    $schema: incoming.$schema ?? existing.$schema,
    mcp: Object.keys(mergedMcp).length > 0 ? mergedMcp : undefined,
    permission: mergedPermission,
    tools: mergedTools,
  }
}

export async function writeOpenCodeBundle(outputRoot: string, bundle: OpenCodeBundle): Promise<void> {
  const openCodePaths = resolveOpenCodePaths(outputRoot)
  await ensureDir(openCodePaths.root)

  const backupPath = await backupFile(openCodePaths.configPath)
  if (backupPath) {
    console.log(`Backed up existing config to ${backupPath}`)
  }
  const merged = await mergeOpenCodeConfig(openCodePaths.configPath, bundle.config)
  await writeJson(openCodePaths.configPath, merged)

  const agentsDir = openCodePaths.agentsDir
  for (const agent of bundle.agents) {
    await writeText(path.join(agentsDir, `${agent.name}.md`), agent.content + "\n")
  }

  for (const commandFile of bundle.commandFiles) {
    const dest = path.join(openCodePaths.commandDir, `${commandFile.name}.md`)
    const cmdBackupPath = await backupFile(dest)
    if (cmdBackupPath) {
      console.log(`Backed up existing command file to ${cmdBackupPath}`)
    }
    await writeText(dest, commandFile.content + "\n")
  }

  if (bundle.plugins.length > 0) {
    const pluginsDir = openCodePaths.pluginsDir
    for (const plugin of bundle.plugins) {
      await writeText(path.join(pluginsDir, plugin.name), plugin.content + "\n")
    }
  }

  if (bundle.skillDirs.length > 0) {
    const skillsRoot = openCodePaths.skillsDir
    for (const skill of bundle.skillDirs) {
      await copyDir(skill.sourceDir, path.join(skillsRoot, skill.name))
    }
  }
}

function resolveOpenCodePaths(outputRoot: string) {
  const base = path.basename(outputRoot)
  // Global install: ~/.config/opencode (basename is "opencode")
  // Project install: .opencode (basename is ".opencode")
  if (base === "opencode" || base === ".opencode") {
    return {
      root: outputRoot,
      configPath: path.join(outputRoot, "opencode.json"),
      agentsDir: path.join(outputRoot, "agents"),
      pluginsDir: path.join(outputRoot, "plugins"),
      skillsDir: path.join(outputRoot, "skills"),
      // .md command files; alternative to the command key in opencode.json
      commandDir: path.join(outputRoot, "commands"),
    }
  }

  // Custom output directory - nest under .opencode subdirectory
  return {
    root: outputRoot,
    configPath: path.join(outputRoot, "opencode.json"),
    agentsDir: path.join(outputRoot, ".opencode", "agents"),
    pluginsDir: path.join(outputRoot, ".opencode", "plugins"),
    skillsDir: path.join(outputRoot, ".opencode", "skills"),
    // .md command files; alternative to the command key in opencode.json
    commandDir: path.join(outputRoot, ".opencode", "commands"),
  }
}
