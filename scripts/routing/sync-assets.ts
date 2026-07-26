import { constants } from "fs"
import { randomBytes } from "crypto"
import { lstat, mkdir, open, readFile, readdir, rename, rm } from "fs/promises"
import path from "path"

const repoRoot = path.join(import.meta.dir, "..", "..")
const routingRoot = import.meta.dir
const skillsRoot = path.join(repoRoot, "skills")

const assetMap = new Map([
  ["scripts/ce-routing.py", "config-resolver.py"],
  ["references/ce-routing-schema.json", "settings-schema.json"],
  ["references/ce-routing-protocol.json", "protocol-schema.json"],
  ["references/dispatch-roles.json", "dispatch-roles.json"],
  ["references/execution-routing.md", "execution-routing.md"],
])

type SettingsSchema = {
  settings: Record<string, { consumers: string[]; writers: string[] }>
}

type RoleCatalog = {
  roles: Record<string, { owner: string }>
}

const consumerPattern = /^(?:ce-[a-z0-9]+(?:-[a-z0-9]+)*|lfg)$/
const noFollow = constants.O_NOFOLLOW ?? 0

function contained(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate)
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))
}

function consumerRoot(consumer: string): string {
  if (!consumerPattern.test(consumer)) throw new Error(`invalid routing consumer id: ${consumer}`)
  const root = path.resolve(skillsRoot, consumer)
  if (!contained(skillsRoot, root) || path.dirname(root) !== path.resolve(skillsRoot)) {
    throw new Error(`unsafe routing consumer path: ${consumer}`)
  }
  return root
}

async function directoryState(root: string, target: string, create: boolean): Promise<boolean> {
  const absoluteRoot = path.resolve(root)
  const absoluteTarget = path.resolve(target)
  if (!contained(absoluteRoot, absoluteTarget)) throw new Error(`unsafe generated asset directory: ${target}`)
  const rootDetails = await lstat(absoluteRoot)
  if (rootDetails.isSymbolicLink() || !rootDetails.isDirectory()) {
    throw new Error(`unsafe generated asset root: ${absoluteRoot}`)
  }
  let current = absoluteRoot
  const relative = path.relative(absoluteRoot, absoluteTarget)
  for (const component of relative ? relative.split(path.sep) : []) {
    current = path.join(current, component)
    let details
    try {
      details = await lstat(current)
    } catch (error: any) {
      if (error?.code !== "ENOENT") throw error
      if (!create) return false
      await mkdir(current, { mode: 0o755 })
      details = await lstat(current)
    }
    if (details.isSymbolicLink() || !details.isDirectory()) {
      throw new Error(`unsafe symlinked generated asset ancestor: ${current}`)
    }
  }
  return true
}

async function destinationState(skillRoot: string, destination: string, createParent: boolean): Promise<"missing" | "file"> {
  if (!contained(skillRoot, destination)) throw new Error(`generated asset escapes consumer root: ${destination}`)
  const parentExists = await directoryState(skillRoot, path.dirname(destination), createParent)
  if (!parentExists) return "missing"
  try {
    const details = await lstat(destination)
    if (details.isSymbolicLink() || !details.isFile()) {
      throw new Error(`unsafe generated asset destination: ${destination}`)
    }
    return "file"
  } catch (error: any) {
    if (error?.code === "ENOENT") return "missing"
    throw error
  }
}

async function safeRead(destination: string): Promise<Buffer> {
  const handle = await open(destination, constants.O_RDONLY | noFollow)
  try {
    const details = await handle.stat()
    if (!details.isFile()) throw new Error(`unsafe generated asset destination: ${destination}`)
    return await handle.readFile()
  } finally {
    await handle.close()
  }
}

async function atomicWrite(skillRoot: string, destination: string, expected: Buffer): Promise<void> {
  await destinationState(skillRoot, destination, true)
  const parent = path.dirname(destination)
  const temporary = path.join(parent, `.ce-routing-${process.pid}-${randomBytes(12).toString("hex")}`)
  const handle = await open(
    temporary,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | noFollow,
    0o600,
  )
  let openHandle = true
  try {
    await handle.writeFile(expected)
    await handle.sync()
    await handle.chmod(0o644)
    await handle.close()
    openHandle = false
    await directoryState(skillRoot, parent, false)
    await destinationState(skillRoot, destination, false)
    await rename(temporary, destination)
  } catch (error) {
    if (openHandle) await handle.close().catch(() => {})
    await rm(temporary, { force: true }).catch(() => {})
    throw error
  }
}

async function consumerSkills(): Promise<string[]> {
  const [settings, roles] = await Promise.all([
    readFile(path.join(routingRoot, "settings-schema.json"), "utf8").then((body) => JSON.parse(body) as SettingsSchema),
    readFile(path.join(routingRoot, "dispatch-roles.json"), "utf8").then((body) => JSON.parse(body) as RoleCatalog),
  ])
  const consumers = new Set<string>()
  for (const setting of Object.values(settings.settings)) {
    setting.consumers.forEach((name) => consumers.add(name))
    setting.writers.forEach((name) => consumers.add(name))
  }
  for (const role of Object.values(roles.roles)) consumers.add(role.owner)
  const result = [...consumers].sort()
  result.forEach((consumer) => consumerRoot(consumer))
  return result
}

async function main(): Promise<void> {
  const mode = process.argv[2]
  if (mode !== "--write" && mode !== "--check") {
    throw new Error("usage: bun scripts/routing/sync-assets.ts --write|--check")
  }

  const consumers = await consumerSkills()
  const consumerSet = new Set(consumers)
  const canonical = new Map<string, Buffer>()
  for (const [relative, source] of assetMap) canonical.set(relative, await readFile(path.join(routingRoot, source)))

  const problems: string[] = []
  for (const consumer of consumers) {
    const skillRoot = consumerRoot(consumer)
    await directoryState(skillsRoot, skillRoot, false)
    const skillFile = path.join(skillRoot, "SKILL.md")
    if (await destinationState(skillRoot, skillFile, false) !== "file") {
      throw new Error(`routing consumer is missing SKILL.md: ${consumer}`)
    }
    for (const [relative, expected] of canonical) {
      const destination = path.resolve(skillRoot, relative)
      try {
        if (mode === "--write") {
          await atomicWrite(skillRoot, destination, expected)
          continue
        }
        const state = await destinationState(skillRoot, destination, false)
        if (state === "missing") problems.push(`${consumer}/${relative}: missing generated asset`)
        else if (!(await safeRead(destination)).equals(expected)) problems.push(`${consumer}/${relative}: stale generated asset`)
      } catch (error: any) {
        problems.push(`${consumer}/${relative}: ${error?.message ?? "unsafe generated asset"}`)
      }
    }
  }

  const skillEntries = await readdir(skillsRoot, { withFileTypes: true })
  for (const entry of skillEntries) {
    if (!entry.isDirectory() || consumerSet.has(entry.name)) continue
    const skillRoot = consumerRoot(entry.name)
    for (const relative of assetMap.keys()) {
      const destination = path.resolve(skillRoot, relative)
      try {
        const state = await destinationState(skillRoot, destination, false)
        if (state === "missing") continue
        if (mode === "--write") await rm(destination)
        else problems.push(`${entry.name}/${relative}: orphan generated asset`)
      } catch (error: any) {
        problems.push(`${entry.name}/${relative}: ${error?.message ?? "unsafe generated asset"}`)
      }
    }
  }

  if (problems.length) {
    for (const problem of problems) console.error(problem)
    process.exitCode = 1
  }
}

await main()
