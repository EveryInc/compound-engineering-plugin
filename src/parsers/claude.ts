import path from "path"
import { parseFrontmatter } from "../utils/frontmatter"
import { readJson, readText, pathExists, walkFiles } from "../utils/files"
import type {
  ClaudeAgent,
  ClaudeCommand,
  ClaudeHooks,
  ClaudeManifest,
  ClaudeMcpServer,
  ClaudePlugin,
  ClaudeSkill,
} from "../types/claude"

const PLUGIN_MANIFEST = path.join(".claude-plugin", "plugin.json")

export async function loadClaudePlugin(inputPath: string): Promise<ClaudePlugin> {
  const root = await resolveClaudeRoot(inputPath)
  const manifestPath = path.join(root, PLUGIN_MANIFEST)
  const manifest = await readJson<ClaudeManifest>(manifestPath)

  const agents = await loadAgents(resolveComponentDirs(root, "agents", manifest.agents))
  const commands = await loadCommands(resolveComponentDirs(root, "commands", manifest.commands))
  const skills = await loadSkills(resolveComponentDirs(root, "skills", manifest.skills))
  const hooks = await loadHooks(root, manifest.hooks)

  const mcpServers = await loadMcpServers(root, manifest)

  return {
    root,
    manifest,
    agents,
    commands,
    skills,
    hooks,
    mcpServers,
  }
}

async function resolveClaudeRoot(inputPath: string): Promise<string> {
  const absolute = path.resolve(inputPath)
  const manifestAtPath = path.join(absolute, PLUGIN_MANIFEST)
  if (await pathExists(manifestAtPath)) {
    return absolute
  }

  if (absolute.endsWith(PLUGIN_MANIFEST)) {
    return path.dirname(path.dirname(absolute))
  }

  if (absolute.endsWith("plugin.json")) {
    return path.dirname(path.dirname(absolute))
  }

  throw new Error(`Could not find ${PLUGIN_MANIFEST} under ${inputPath}`)
}

async function loadAgents(agentsDirs: string[]): Promise<ClaudeAgent[]> {
  const files = await collectMarkdownFiles(agentsDirs)

  const agents: ClaudeAgent[] = []
  for (const file of files) {
    const raw = await readText(file)
    const { data, body } = parseFrontmatter(raw)
    const name = (data.name as string) ?? path.basename(file, ".md")
    agents.push({
      name,
      description: data.description as string | undefined,
      capabilities: data.capabilities as string[] | undefined,
      model: data.model as string | undefined,
      body: body.trim(),
      sourcePath: file,
    })
  }
  return agents
}

async function loadCommands(commandsDirs: string[]): Promise<ClaudeCommand[]> {
  const files = await collectMarkdownFiles(commandsDirs)

  const commands: ClaudeCommand[] = []
  for (const file of files) {
    const raw = await readText(file)
    const { data, body } = parseFrontmatter(raw)
    const name = (data.name as string) ?? path.basename(file, ".md")
    const allowedTools = parseAllowedTools(data["allowed-tools"])
    const disableModelInvocation = data["disable-model-invocation"] === true ? true : undefined
    commands.push({
      name,
      description: data.description as string | undefined,
      argumentHint: data["argument-hint"] as string | undefined,
      model: data.model as string | undefined,
      allowedTools,
      disableModelInvocation,
      body: body.trim(),
      sourcePath: file,
    })
  }
  return commands
}

async function loadSkills(skillsDirs: string[]): Promise<ClaudeSkill[]> {
  const entries = await collectFiles(skillsDirs)
  const skillFiles = entries.filter((file) => path.basename(file) === "SKILL.md")
  const skills: ClaudeSkill[] = []
  for (const file of skillFiles) {
    const raw = await readText(file)
    const { data } = parseFrontmatter(raw)
    const name = (data.name as string) ?? path.basename(path.dirname(file))
    const disableModelInvocation = data["disable-model-invocation"] === true ? true : undefined
    skills.push({
      name,
      description: data.description as string | undefined,
      disableModelInvocation,
      sourceDir: path.dirname(file),
      skillPath: file,
    })
  }
  return skills
}

async function loadHooks(root: string, hooksField?: ClaudeManifest["hooks"]): Promise<ClaudeHooks | undefined> {
  const hookConfigs: ClaudeHooks[] = []

  const defaultPath = path.join(root, "hooks", "hooks.json")
  if (await pathExists(defaultPath)) {
    hookConfigs.push(await readJson<ClaudeHooks>(defaultPath))
  }

  if (hooksField) {
    if (typeof hooksField === "string" || Array.isArray(hooksField)) {
      const hookPaths = toPathList(hooksField)
      for (const hookPath of hookPaths) {
        const resolved = resolveWithinRoot(root, hookPath, "hooks path")
        if (await pathExists(resolved)) {
          hookConfigs.push(await readJson<ClaudeHooks>(resolved))
        }
      }
    } else {
      hookConfigs.push(hooksField)
    }
  }

  if (hookConfigs.length === 0) return undefined
  return mergeHooks(hookConfigs)
}

async function loadMcpServers(
  root: string,
  manifest: ClaudeManifest,
): Promise<Record<string, ClaudeMcpServer> | undefined> {
  const field = manifest.mcpServers
  if (field) {
    if (typeof field === "string" || Array.isArray(field)) {
      return mergeMcpConfigs(await loadMcpPaths(root, field))
    }
    return field as Record<string, ClaudeMcpServer>
  }

  const mcpPath = path.join(root, ".mcp.json")
  if (await pathExists(mcpPath)) {
    return readJson<Record<string, ClaudeMcpServer>>(mcpPath)
  }

  return undefined
}

function parseAllowedTools(value: unknown): string[] | undefined {
  if (!value) return undefined
  if (Array.isArray(value)) {
    return value.map((item) => String(item))
  }
  if (typeof value === "string") {
    return value
      .split(/,/)
      .map((item) => item.trim())
      .filter(Boolean)
  }
  return undefined
}

function resolveComponentDirs(
  root: string,
  defaultDir: string,
  custom?: string | string[],
): string[] {
  const dirs = [path.join(root, defaultDir)]
  for (const entry of toPathList(custom)) {
    dirs.push(resolveWithinRoot(root, entry, `${defaultDir} path`))
  }
  return dirs
}

function toPathList(value?: string | string[]): string[] {
  if (!value) return []
  if (Array.isArray(value)) return value
  return [value]
}

async function collectMarkdownFiles(dirs: string[]): Promise<string[]> {
  const entries = await collectFiles(dirs)
  return entries.filter((file) => file.endsWith(".md"))
}

async function collectFiles(dirs: string[]): Promise<string[]> {
  const files: string[] = []
  for (const dir of dirs) {
    if (!(await pathExists(dir))) continue
    const entries = await walkFiles(dir)
    files.push(...entries)
  }
  return files
}

function mergeHooks(hooksList: ClaudeHooks[]): ClaudeHooks {
  const merged: ClaudeHooks = { hooks: {} }
  for (const hooks of hooksList) {
    for (const [event, matchers] of Object.entries(hooks.hooks)) {
      if (!merged.hooks[event]) {
        merged.hooks[event] = []
      }
      merged.hooks[event].push(...matchers)
    }
  }
  return merged
}

async function loadMcpPaths(
  root: string,
  value: string | string[],
): Promise<Record<string, ClaudeMcpServer>[]> {
  const configs: Record<string, ClaudeMcpServer>[] = []
  for (const entry of toPathList(value)) {
    const resolved = resolveWithinRoot(root, entry, "mcpServers path")
    if (await pathExists(resolved)) {
      configs.push(await readJson<Record<string, ClaudeMcpServer>>(resolved))
    }
  }
  return configs
}

function mergeMcpConfigs(configs: Record<string, ClaudeMcpServer>[]): Record<string, ClaudeMcpServer> {
  return configs.reduce((acc, config) => ({ ...acc, ...config }), {})
}

function resolveWithinRoot(root: string, entry: string, label: string): string {
  const resolvedRoot = path.resolve(root)
  const resolvedPath = path.resolve(root, entry)
  if (resolvedPath === resolvedRoot || resolvedPath.startsWith(resolvedRoot + path.sep)) {
    return resolvedPath
  }
  throw new Error(`Invalid ${label}: ${entry}. Paths must stay within the plugin root.`)
}
