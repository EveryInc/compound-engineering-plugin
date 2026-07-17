import { promises as fs } from "node:fs"
import path from "node:path"

export interface CommandResult {
  exitCode: number
  stdout: string
  stderr: string
}

export interface CommandOptions {
  cwd?: string
  env?: NodeJS.ProcessEnv
}

export interface CommandRunner {
  run(command: string, args: string[], options?: CommandOptions): Promise<CommandResult>
}

export class BunCommandRunner implements CommandRunner {
  async run(command: string, args: string[], options: CommandOptions = {}): Promise<CommandResult> {
    const proc = Bun.spawn([command, ...args], {
      cwd: options.cwd,
      env: options.env,
      stdout: "pipe",
      stderr: "pipe",
    })
    const [exitCode, stdout, stderr] = await Promise.all([
      proc.exited,
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ])
    return { exitCode, stdout, stderr }
  }
}

export interface CodexDevContext {
  repoRoot: string
  skillsRoot: string
  codexHome: string
  collectionPath: string
  gitDir: string
  gitCommonDir: string
  linkedWorktree: boolean
  branch: string | null
  head: string
  modifiedCount: number
  untrackedCount: number
  skillNames: string[]
  env: NodeJS.ProcessEnv
}

export type LocalCollectionState =
  | { kind: "absent" }
  | { kind: "valid"; target: string; resolvedTarget: string }
  | { kind: "broken"; target: string }
  | { kind: "unrelated"; target: string; resolvedTarget: string }
  | { kind: "collision"; path: string }

export interface InstalledPlugin {
  pluginId: string
  name: string
  marketplaceName: string
  version: string | null
  installed: boolean
  enabled: boolean
  source?: { source?: string; url?: string; path?: string }
  marketplaceSource?: { sourceType?: string; source?: string }
}

interface Marketplace {
  name: string
  root?: string
  marketplaceSource?: { sourceType?: string; source?: string }
}

export type CodexDevMode = "local" | "remote" | "mixed" | "drifted" | "absent"

export interface CodexDevStatus {
  mode: CodexDevMode
  plugins: InstalledPlugin[]
  collection: LocalCollectionState
  localTarget?: string
  localMatchesCheckout: boolean
}

const OFFICIAL_PLUGIN_ID = "compound-engineering@compound-engineering-plugin"
const OFFICIAL_MARKETPLACE = "compound-engineering-plugin"
const OFFICIAL_REPOSITORY = "https://github.com/EveryInc/compound-engineering-plugin"

function trim(result: CommandResult): string {
  return result.stdout.trim()
}

async function checkedRun(
  runner: CommandRunner,
  command: string,
  args: string[],
  options: CommandOptions,
): Promise<CommandResult> {
  const result = await runner.run(command, args, options)
  if (result.exitCode !== 0) {
    const detail = result.stderr.trim() || result.stdout.trim() || `exit code ${result.exitCode}`
    throw new Error(`${command} ${args.join(" ")} failed: ${detail}`)
  }
  return result
}

function resolveHomePath(value: string, home: string): string {
  if (value === "~") return home
  if (value.startsWith("~/")) return path.join(home, value.slice(2))
  return path.resolve(value)
}

async function readJson(filePath: string): Promise<Record<string, unknown>> {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8")) as Record<string, unknown>
  } catch (error) {
    throw new Error(`Could not read ${filePath}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

async function assertCompoundEngineeringRepo(repoRoot: string): Promise<void> {
  const packageJson = await readJson(path.join(repoRoot, "package.json"))
  if (packageJson.name !== "compound-engineering") {
    throw new Error(`${repoRoot} is not the compound-engineering repository`)
  }
  const pluginJson = await readJson(path.join(repoRoot, ".codex-plugin", "plugin.json"))
  if (pluginJson.name !== "compound-engineering") {
    throw new Error(`${repoRoot} is not the compound-engineering repository`)
  }

  const skills = pluginJson.skills
  if (typeof skills !== "string" || path.resolve(repoRoot, skills) !== path.join(repoRoot, "skills")) {
    throw new Error("The Codex plugin manifest does not point at this repository's skills directory")
  }

  const unsupported = ["apps", "hooks", "mcpServers"].filter((key) => pluginJson[key] !== undefined)
  if (unsupported.length > 0) {
    throw new Error(
      `Local skill mode cannot represent Codex runtime components: ${unsupported.join(", ")}. Update the developer workflow before using it.`,
    )
  }

  try {
    const defaultHooks = await fs.stat(path.join(repoRoot, "hooks", "hooks.json"))
    if (defaultHooks.isFile()) {
      throw new Error(
        "Local skill mode cannot represent default Codex hooks at hooks/hooks.json. Update the developer workflow before using it.",
      )
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
  }
}

async function listSkills(skillsRoot: string): Promise<string[]> {
  const entries = await fs.readdir(skillsRoot, { withFileTypes: true })
  const names: string[] = []
  for (const entry of entries) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue
    try {
      const stat = await fs.stat(path.join(skillsRoot, entry.name, "SKILL.md"))
      if (stat.isFile()) names.push(entry.name)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
    }
  }
  return names.sort()
}

export async function resolveCodexDevContext(
  cwd: string,
  env: NodeJS.ProcessEnv = process.env,
  runner: CommandRunner = new BunCommandRunner(),
): Promise<CodexDevContext> {
  const home = env.HOME
  if (!home) throw new Error("HOME is not set")

  const options = { cwd, env }
  const repoRootRaw = trim(await checkedRun(runner, "git", ["rev-parse", "--show-toplevel"], options))
  const repoRoot = await fs.realpath(repoRootRaw)
  await assertCompoundEngineeringRepo(repoRoot)

  const gitDir = trim(
    await checkedRun(runner, "git", ["rev-parse", "--path-format=absolute", "--absolute-git-dir"], {
      cwd: repoRoot,
      env,
    }),
  )
  const gitCommonDir = trim(
    await checkedRun(runner, "git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], {
      cwd: repoRoot,
      env,
    }),
  )
  const branchValue = trim(
    await checkedRun(runner, "git", ["branch", "--show-current"], { cwd: repoRoot, env }),
  )
  const head = trim(await checkedRun(runner, "git", ["rev-parse", "HEAD"], { cwd: repoRoot, env }))
  const status = trim(
    await checkedRun(runner, "git", ["status", "--porcelain=v1", "--untracked-files=all"], {
      cwd: repoRoot,
      env,
    }),
  )
  const lines = status ? status.split("\n") : []
  const untrackedCount = lines.filter((line) => line.startsWith("?? ")).length
  const modifiedCount = lines.length - untrackedCount

  const codexHome = resolveHomePath(env.CODEX_HOME || path.join(home, ".codex"), home)
  const skillsRoot = path.join(repoRoot, "skills")
  const skillNames = await listSkills(skillsRoot)
  if (skillNames.length === 0) throw new Error(`No Codex skills were found under ${skillsRoot}`)

  return {
    repoRoot,
    skillsRoot,
    codexHome,
    collectionPath: path.join(codexHome, "skills", "compound-engineering-local"),
    gitDir: path.resolve(gitDir),
    gitCommonDir: path.resolve(gitCommonDir),
    linkedWorktree: path.resolve(gitDir) !== path.resolve(gitCommonDir),
    branch: branchValue || null,
    head,
    modifiedCount,
    untrackedCount,
    skillNames,
    env: { ...env, CODEX_HOME: codexHome },
  }
}

export async function inspectLocalCollection(context: CodexDevContext): Promise<LocalCollectionState> {
  let stat
  try {
    stat = await fs.lstat(context.collectionPath)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { kind: "absent" }
    throw error
  }
  if (!stat.isSymbolicLink()) return { kind: "collision", path: context.collectionPath }

  const target = await fs.readlink(context.collectionPath)
  try {
    const resolvedTarget = await fs.realpath(context.collectionPath)
    try {
      await assertCompoundEngineeringRepo(path.dirname(resolvedTarget))
    } catch {
      return { kind: "unrelated", target, resolvedTarget }
    }
    if (path.basename(resolvedTarget) !== "skills") {
      return { kind: "unrelated", target, resolvedTarget }
    }
    return { kind: "valid", target, resolvedTarget }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { kind: "broken", target }
    throw error
  }
}

export async function activateLocalCollection(context: CodexDevContext): Promise<void> {
  await fs.mkdir(path.dirname(context.collectionPath), { recursive: true })
  const desiredTarget = await fs.realpath(context.skillsRoot)
  const state = await inspectLocalCollection(context)
  if (state.kind === "collision") {
    throw new Error(`${context.collectionPath} exists and is not a symlink; refusing to overwrite it`)
  }
  if (state.kind === "unrelated") {
    throw new Error(`${context.collectionPath} points outside a Compound Engineering checkout; refusing to overwrite it`)
  }
  if (state.kind === "broken") {
    throw new Error(`${context.collectionPath} is a broken symlink; refusing to overwrite it`)
  }
  if (state.kind === "valid" && state.resolvedTarget === desiredTarget) return

  await replaceManagedCollectionLink(context.collectionPath, desiredTarget, state)
}

export type ManagedCollectionLinkExpectation =
  | { kind: "absent" }
  | { kind: "valid"; target: string }

export async function removeManagedCollectionLink(
  collectionPath: string,
  expectedTarget: string,
  options: {
    ignoreChanges?: boolean
    onTakenForTest?: (recoveryPath: string) => Promise<void>
  } = {},
): Promise<boolean> {
  const changed = (detail?: string): false => {
    if (options.ignoreChanges) return false
    throw new Error(
      `${collectionPath} changed since it was inspected; refusing to remove it${detail ? `. ${detail}` : ""}`,
    )
  }

  const parentPath = path.dirname(collectionPath)
  const recoveryDir = await fs.mkdtemp(
    path.join(parentPath, `.${path.basename(collectionPath)}.recovery-`),
  )
  const recoveryPath = path.join(recoveryDir, "entry")

  try {
    await fs.rename(collectionPath, recoveryPath)
  } catch (error) {
    await fs.rmdir(recoveryDir).catch(() => undefined)
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return changed()
    throw error
  }

  try {
    await options.onTakenForTest?.(recoveryPath)
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(
      `Could not validate ${collectionPath} after taking it. ` +
        `The entry is preserved at ${recoveryPath} (${reason})`,
    )
  }

  const stat = await fs.lstat(recoveryPath)
  let actualTarget: string | undefined
  if (stat.isSymbolicLink()) {
    actualTarget = await fs.readlink(recoveryPath)
  }

  if (stat.isSymbolicLink() && actualTarget === expectedTarget) {
    await fs.unlink(recoveryPath)
    await fs.rmdir(recoveryDir)
    return true
  }

  const restorationFailed = (error: unknown): never => {
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(
      `${collectionPath} changed since it was inspected; refusing to remove it. ` +
        `The entry taken for validation is preserved at ${recoveryPath}; ` +
        `the current entry at ${collectionPath} was not overwritten (${reason})`,
    )
  }

  if (stat.isSymbolicLink()) {
    try {
      await fs.symlink(actualTarget!, collectionPath)
    } catch (error) {
      restorationFailed(error)
    }
    await fs.unlink(recoveryPath)
    await fs.rmdir(recoveryDir)
    return changed()
  }

  if (stat.isFile()) {
    try {
      await fs.link(recoveryPath, collectionPath)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") restorationFailed(error)
      try {
        // Preserve accessibility when the filesystem does not support hard links.
        await fs.symlink(recoveryPath, collectionPath, "file")
      } catch (fallbackError) {
        restorationFailed(fallbackError)
      }
      return changed(
        `The unexpected entry is preserved at ${recoveryPath} and remains accessible at ${collectionPath}`,
      )
    }
    await fs.unlink(recoveryPath)
    await fs.rmdir(recoveryDir)
    return changed()
  }

  try {
    await fs.symlink(recoveryPath, collectionPath, stat.isDirectory() ? "dir" : "file")
  } catch (error) {
    restorationFailed(error)
  }
  return changed(
    `The unexpected entry is preserved at ${recoveryPath} and remains accessible at ${collectionPath}`,
  )
}

export async function replaceManagedCollectionLink(
  collectionPath: string,
  target: string,
  expected: ManagedCollectionLinkExpectation,
): Promise<void> {
  if (expected.kind === "absent") {
    await fs.symlink(target, collectionPath, "dir")
    return
  }

  await removeManagedCollectionLink(collectionPath, expected.target)
  try {
    await fs.symlink(target, collectionPath, "dir")
  } catch (error) {
    await fs.symlink(expected.target, collectionPath, "dir").catch(() => undefined)
    throw error
  }
}

async function restoreLocalCollection(
  context: CodexDevContext,
  previous: Extract<LocalCollectionState, { kind: "absent" | "valid" }>,
  activatedTarget: string,
): Promise<void> {
  if (previous.kind === "absent") {
    await removeManagedCollectionLink(context.collectionPath, activatedTarget, { ignoreChanges: true })
    return
  }
  await replaceManagedCollectionLink(context.collectionPath, previous.target, {
    kind: "valid",
    target: activatedTarget,
  })
}

export async function removeLocalCollection(context: CodexDevContext): Promise<boolean> {
  const state = await inspectLocalCollection(context)
  if (state.kind === "absent") return false
  if (state.kind === "collision") {
    throw new Error(`${context.collectionPath} exists and is not a symlink; refusing to remove it`)
  }
  if (state.kind === "unrelated") {
    throw new Error(`${context.collectionPath} points outside a Compound Engineering checkout; refusing to remove it`)
  }
  if (state.kind === "broken") {
    throw new Error(`${context.collectionPath} is a broken symlink; refusing to remove it automatically`)
  }
  await removeManagedCollectionLink(context.collectionPath, state.target)
  return true
}

function parseJson<T>(result: CommandResult, label: string): T {
  try {
    return JSON.parse(result.stdout) as T
  } catch (error) {
    throw new Error(`${label} returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`)
  }
}

async function runCodex(
  context: CodexDevContext,
  runner: CommandRunner,
  args: string[],
): Promise<CommandResult> {
  return checkedRun(runner, "codex", args, { cwd: context.repoRoot, env: context.env })
}

async function listCompoundEngineeringPlugins(
  context: CodexDevContext,
  runner: CommandRunner,
): Promise<InstalledPlugin[]> {
  const result = await runCodex(context, runner, ["plugin", "list", "--available", "--json"])
  const payload = parseJson<{ installed?: InstalledPlugin[] }>(result, "codex plugin list")
  return (payload.installed ?? []).filter(
    (entry) => entry.name === "compound-engineering" || entry.pluginId.startsWith("compound-engineering@"),
  )
}

function normalizedGitUrl(value: string | undefined): string | undefined {
  return value?.replace(/\.git\/?$/, "").replace(/\/$/, "").toLowerCase()
}

function isOfficialRemotePlugin(plugin: InstalledPlugin): boolean {
  return (
    plugin.pluginId === OFFICIAL_PLUGIN_ID &&
    plugin.installed === true &&
    plugin.enabled === true &&
    plugin.marketplaceSource?.sourceType === "git" &&
    normalizedGitUrl(plugin.marketplaceSource.source) === normalizedGitUrl(OFFICIAL_REPOSITORY) &&
    plugin.source?.source === "git" &&
    normalizedGitUrl(plugin.source.url) === normalizedGitUrl(OFFICIAL_REPOSITORY)
  )
}

export async function inspectCodexDevStatus(
  context: CodexDevContext,
  runner: CommandRunner = new BunCommandRunner(),
): Promise<CodexDevStatus> {
  const [collection, plugins] = await Promise.all([
    inspectLocalCollection(context),
    listCompoundEngineeringPlugins(context, runner),
  ])
  const localTarget = collection.kind === "valid" ? collection.resolvedTarget : undefined
  const localMatchesCheckout =
    collection.kind === "valid" && collection.resolvedTarget === (await fs.realpath(context.skillsRoot))

  let mode: CodexDevMode
  if (collection.kind === "collision" || collection.kind === "broken" || collection.kind === "unrelated") {
    mode = "drifted"
  } else if (collection.kind === "valid" && plugins.length > 0) {
    mode = "mixed"
  } else if (collection.kind === "valid") {
    mode = localMatchesCheckout ? "local" : "drifted"
  } else if (plugins.length === 0) {
    mode = "absent"
  } else if (plugins.length === 1 && isOfficialRemotePlugin(plugins[0]!)) {
    mode = "remote"
  } else {
    mode = "drifted"
  }

  return { mode, plugins, collection, localTarget, localMatchesCheckout }
}

async function removePlugins(
  context: CodexDevContext,
  runner: CommandRunner,
  plugins: InstalledPlugin[],
): Promise<void> {
  for (const plugin of plugins) {
    await runCodex(context, runner, ["plugin", "remove", plugin.pluginId, "--json"])
  }
}

export async function switchToLocal(
  context: CodexDevContext,
  runner: CommandRunner = new BunCommandRunner(),
): Promise<CodexDevStatus> {
  const previous = await inspectLocalCollection(context)
  if (previous.kind !== "absent" && previous.kind !== "valid") {
    throw new Error(`Cannot switch to local mode while the local collection is ${previous.kind}`)
  }
  const activatedTarget = await fs.realpath(context.skillsRoot)
  await activateLocalCollection(context)
  try {
    const plugins = await listCompoundEngineeringPlugins(context, runner)
    await removePlugins(context, runner, plugins)
    const status = await inspectCodexDevStatus(context, runner)
    if (status.mode !== "local") {
      throw new Error(`Could not verify local Codex development mode (reported ${status.mode})`)
    }
    return status
  } catch (error) {
    await restoreLocalCollection(context, previous, activatedTarget)
    throw error
  }
}

async function listMarketplaces(context: CodexDevContext, runner: CommandRunner): Promise<Marketplace[]> {
  const result = await runCodex(context, runner, ["plugin", "marketplace", "list", "--json"])
  return parseJson<{ marketplaces?: Marketplace[] }>(result, "codex plugin marketplace list").marketplaces ?? []
}

async function ensureOfficialMarketplace(context: CodexDevContext, runner: CommandRunner): Promise<void> {
  const marketplaces = await listMarketplaces(context, runner)
  const existing = marketplaces.find((marketplace) => marketplace.name === OFFICIAL_MARKETPLACE)
  if (!existing) {
    await runCodex(context, runner, [
      "plugin",
      "marketplace",
      "add",
      "EveryInc/compound-engineering-plugin",
      "--json",
    ])
  } else if (
    existing.marketplaceSource?.sourceType !== "git" ||
    normalizedGitUrl(existing.marketplaceSource.source) !== normalizedGitUrl(OFFICIAL_REPOSITORY)
  ) {
    throw new Error(
      `Marketplace ${OFFICIAL_MARKETPLACE} exists with an unexpected source; refusing to replace it`,
    )
  }
  await runCodex(context, runner, [
    "plugin",
    "marketplace",
    "upgrade",
    OFFICIAL_MARKETPLACE,
    "--json",
  ])
}

export async function switchToRemote(
  context: CodexDevContext,
  runner: CommandRunner = new BunCommandRunner(),
): Promise<CodexDevStatus> {
  const collection = await inspectLocalCollection(context)
  if (collection.kind === "collision" || collection.kind === "unrelated" || collection.kind === "broken") {
    throw new Error(`Cannot switch to remote mode while the local collection is ${collection.kind}`)
  }

  await ensureOfficialMarketplace(context, runner)
  const plugins = await listCompoundEngineeringPlugins(context, runner)
  await removePlugins(
    context,
    runner,
    collection.kind === "valid"
      ? plugins
      : plugins.filter((entry) => entry.pluginId !== OFFICIAL_PLUGIN_ID),
  )
  await runCodex(context, runner, ["plugin", "add", OFFICIAL_PLUGIN_ID, "--json"])

  const installed = await listCompoundEngineeringPlugins(context, runner)
  if (installed.length !== 1 || !isOfficialRemotePlugin(installed[0]!)) {
    throw new Error("Could not verify the official Git-backed Compound Engineering plugin")
  }

  await removeLocalCollection(context)
  const status = await inspectCodexDevStatus(context, runner)
  if (status.mode !== "remote") {
    throw new Error(`Could not verify remote Codex mode (reported ${status.mode})`)
  }
  return status
}

export async function removeCodexDevInstallation(
  context: CodexDevContext,
  runner: CommandRunner = new BunCommandRunner(),
): Promise<CodexDevStatus> {
  const plugins = await listCompoundEngineeringPlugins(context, runner)
  await removePlugins(context, runner, plugins)
  await removeLocalCollection(context)
  const status = await inspectCodexDevStatus(context, runner)
  if (status.mode !== "absent") {
    throw new Error(`Could not verify removal (reported ${status.mode})`)
  }
  return status
}

function statusLines(context: CodexDevContext, status: CodexDevStatus): string[] {
  const branch = context.branch ?? "detached HEAD"
  const worktree = context.linkedWorktree ? "linked worktree" : "primary worktree"
  const dirty =
    context.modifiedCount === 0 && context.untrackedCount === 0
      ? "clean"
      : `${context.modifiedCount} modified, ${context.untrackedCount} untracked`
  const lines = [
    `Mode: ${status.mode}`,
    `Codex home: ${context.codexHome}`,
    `Collection: ${context.collectionPath}`,
    `Source checkout: ${context.repoRoot}`,
    `Worktree: ${worktree}`,
    `Branch: ${branch}`,
    `Commit: ${context.head}`,
    `Working tree: ${dirty}`,
    `Skills: ${context.skillNames.length} (${context.skillNames.join(", ")})`,
  ]
  if (status.localTarget) {
    lines.push(`Linked skills: ${status.localTarget}`)
    lines.push(`Matches this checkout: ${status.localMatchesCheckout ? "yes" : "no"}`)
  }
  for (const plugin of status.plugins) {
    const source = plugin.source?.url ?? plugin.source?.path ?? plugin.marketplaceSource?.source ?? "unknown"
    lines.push(
      `Plugin: ${plugin.pluginId} (${plugin.enabled ? "enabled" : "disabled"}, version ${plugin.version ?? "unknown"}, ${source})`,
    )
  }
  if (status.mode === "mixed") {
    lines.push("Action required: both local skills and a Compound Engineering plugin are enabled.")
  } else if (status.mode === "drifted") {
    lines.push("Action required: the Compound Engineering installation does not match a supported mode.")
  } else if (status.mode === "absent") {
    lines.push("Compound Engineering is not installed for Codex.")
  }
  return lines
}

export type CodexDevCommand = "local" | "refresh" | "status" | "remote" | "remove"

export async function runCodexDevCommand(
  command: string,
  cwd: string = process.cwd(),
  env: NodeJS.ProcessEnv = process.env,
  runner: CommandRunner = new BunCommandRunner(),
  write: (line: string) => void = console.log,
): Promise<number> {
  if (!["local", "refresh", "status", "remote", "remove"].includes(command)) {
    write("Usage: bun run codex:dev -- <local|refresh|status|remote|remove>")
    return 2
  }

  const context = await resolveCodexDevContext(cwd, env, new BunCommandRunner())
  let status: CodexDevStatus
  switch (command as CodexDevCommand) {
    case "local":
    case "refresh":
      status = await switchToLocal(context, runner)
      break
    case "remote":
      status = await switchToRemote(context, runner)
      break
    case "remove":
      status = await removeCodexDevInstallation(context, runner)
      break
    case "status":
      status = await inspectCodexDevStatus(context, runner)
      break
  }

  for (const line of statusLines(context, status)) write(line)
  if (command !== "status") {
    write(
      "Start a new Codex session after switching installation modes. Direct local skill edits are detected automatically; restart Codex if an edit does not appear.",
    )
  }
  return status.mode === "mixed" || status.mode === "drifted" ? 1 : 0
}
