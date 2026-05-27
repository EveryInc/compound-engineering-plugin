import path from "path"
import fs from "node:fs/promises"
import { execSync } from "child_process"

import { copySkillDir, ensureDir, pathExists, sanitizeGrokPluginName, sanitizePathName, writeJson, writeText } from "../utils/files"
import { transformContentForGrok } from "../utils/grok-content"
import type { GrokBundle } from "../types/grok"

/**
 * Write a self-contained Grok plugin bundle to disk.
 *
 * Layout (clean provider root, no managed-artifacts or legacy manifests):
 *   <outputRoot>/<sanitized-plugin-name>/
 *     plugin.json
 *     agents/
 *       ce-*.md
 *     skills/
 *       <skill-name>/
 *         SKILL.md
 *         references/
 *         scripts/...
 *     commands/ (optional .md files)
 *     .mcp.json (if MCP servers present)
 *
 * This is the simplest writer among targets. Skills are copied with
 * transformContentForGrok (including references via transformAllMarkdown=true).
 * Agents are already transformed by the converter (Grok frontmatter + body).
 *
 * After writing, a one-line instruction for `grok plugin install` is logged.
 */
export async function writeGrokBundle(outputRoot: string, bundle: GrokBundle): Promise<void> {
  const rawName = bundle.pluginName || "compound-engineering"
  const pluginName = sanitizeGrokPluginName(rawName)

  // Produce a dedicated, self-contained directory under the provided output root.
  // This makes the result directly usable with:
  //   grok plugin install <output>/<name>
  // or for development:
  //   --plugin-dir <output>/<name>
  const targetRoot = path.join(outputRoot, pluginName)

  // Hard containment check before any destructive operation (P1 review feedback).
  // We require the resolved target to be a strict subdirectory of the output root.
  // This prevents cases where a sanitized name resolves to "" / "." / "..",
  // which would make targetRoot == outputRoot and cause us to recursively delete
  // the user's chosen output directory.
  const resolvedOutput = path.resolve(outputRoot)
  const resolvedTarget = path.resolve(targetRoot)
  if (!resolvedTarget.startsWith(resolvedOutput + path.sep)) {
    throw new Error(
      `Refusing to write Grok bundle: sanitized plugin name "${pluginName}" would escape or collapse to the output root`
    )
  }

  // Clean any previous conversion output at this location so removed/renamed
  // skills, agents, commands, or .mcp.json do not linger (P2 review feedback).
  // Grok bundles are self-contained clean roots; users pass the dir directly to
  // `grok plugin install` or `--plugin-dir`, so it must exactly match the current bundle.
  if (await pathExists(targetRoot)) {
    await fs.rm(targetRoot, { recursive: true, force: true })
  }
  await ensureDir(targetRoot)

  // plugin.json (minimal but valid — matches observed Grok expectation)
  // For dev builds we embed a git sha so regeneration after source changes
  // (e.g. skill fixes) produces a recognizably different version.
  const base = bundle.pluginJson ?? {
    name: bundle.pluginName || pluginName,
    description: "Compound Engineering skills and agents (converted for Grok)",
  }

  // Best-effort source root for git discovery (helps when the CLI is invoked from outside the source tree)
  const sourceHint = bundle.skillDirs?.[0]?.sourceDir
    ? path.dirname(bundle.skillDirs[0].sourceDir)
    : undefined

  const version = base.version ?? getGrokDevVersion(sourceHint)
  const pluginJson = { ...base, version }
  await writeJson(path.join(targetRoot, "plugin.json"), pluginJson)

  // Agents (already converted to Grok frontmatter + body by claude-to-grok)
  if (bundle.agents && bundle.agents.length > 0) {
    const agentsDir = path.join(targetRoot, "agents")
    await ensureDir(agentsDir)

    const seen = new Set<string>()
    for (const agent of bundle.agents) {
      const safeName = sanitizePathName(agent.name)
      if (seen.has(safeName)) {
        console.warn(`Skipping duplicate agent after sanitization: ${agent.name} -> ${safeName}`)
        continue
      }
      seen.add(safeName)
      await writeText(path.join(agentsDir, `${safeName}.md`), agent.content + "\n")
    }
  }

  // Skills (pass-through + any generated)
  const skillsDir = path.join(targetRoot, "skills")
  await ensureDir(skillsDir)

  // Generated skills (rare for Grok target; usually empty)
  for (const skill of bundle.generatedSkills ?? []) {
    const name = sanitizePathName(skill.name)
    const dir = path.join(skillsDir, name)
    await ensureDir(dir)
    await writeText(path.join(dir, "SKILL.md"), skill.content + "\n")
  }

  // Pass-through skills with full content transform (including references/*.md)
  for (const skill of bundle.skillDirs ?? []) {
    const name = sanitizePathName(skill.name)
    const targetDir = path.join(skillsDir, name)
    // Wrap so the transform receives { kind: "skill" } — copySkillDir only passes the content string.
    await copySkillDir(
      skill.sourceDir,
      targetDir,
      (content) => transformContentForGrok(content, { kind: "skill" }),
      true
    )
  }

  // Commands (written as .md for documentation / future Grok command surface)
  if (bundle.commands && bundle.commands.length > 0) {
    const commandsDir = path.join(targetRoot, "commands")
    await ensureDir(commandsDir)

    const seen = new Set<string>()
    for (const command of bundle.commands) {
      const safeName = sanitizePathName(command.name)
      if (seen.has(safeName)) {
        console.warn(`Skipping duplicate command after sanitization: ${command.name}`)
        continue
      }
      seen.add(safeName)
      await writeText(path.join(commandsDir, `${safeName}.md`), command.content + "\n")
    }
  }

  // MCP servers -> .mcp.json at plugin root (per Grok plugin contract)
  if (bundle.mcpServers && Object.keys(bundle.mcpServers).length > 0) {
    await writeJson(path.join(targetRoot, ".mcp.json"), {
      mcpServers: bundle.mcpServers,
    })
  }

  // Helpful next-step logging (consistent with other clean-root targets)
  console.log(`\n✅ Grok plugin written to: ${targetRoot} (version: ${version})`)
  console.log(`   Install locally:   grok plugin install ${targetRoot} --trust`)
  console.log(`   Development use:   grok --plugin-dir ${targetRoot} ...`)
  console.log(`   Marketplace flow:  publish the directory or zip it for your marketplace source.`)
  console.log(`   (See https://docs.x.ai/build/features/skills-plugins-marketplaces for current local plugin loading options)`)
}

/**
 * Produce a dev-oriented version string for the generated Grok plugin.
 * Includes a short git sha when possible so regenerating after source
 * changes (skills, agents, etc.) produces an obviously different version.
 *
 * @param cwdHint - Optional directory to run git from (e.g. the source plugin root).
 *                  Falls back to process.cwd() when not provided.
 */
export function getGrokDevVersion(cwdHint?: string): string {
  const cwd = cwdHint || process.cwd()

  try {
    const sha = execSync("git rev-parse --short HEAD", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      cwd,
      timeout: 2000,
    }).trim()

    if (sha && sha.length > 0) {
      return `0.0.0-dev-grok-${sha}`
    }
  } catch (err) {
    // Not a git repo, permission issue, timeout, or other failure — fall back with visibility.
    console.warn(
      `[grok] Could not determine git sha for dev version (cwd: ${cwd}). ` +
      `Using placeholder. Run the converter from within (or pointed at) a git checkout for better results.`
    )
  }
  return "0.0.0-dev-grok"
}