import { createHash } from "crypto"
import os from "os"
import path from "path"

export const PI_MANAGED_MANIFEST_NAME = "compound-engineering-managed.json"
export const PI_MANAGED_VERIFICATION_DIR_NAME = "pi-managed"

export type PiLayoutMode = "install" | "sync"

export type PiLayout = {
  root: string
  skillsDir: string
  promptsDir: string
  extensionsDir: string
  mcporterConfigPath: string
  managedManifestPath: string
  agentsPath: string
  verificationPath: string
}

export function canonicalizePiPath(targetPath: string): string {
  const resolved = path.resolve(targetPath)
  const normalized = resolved.replace(/[\\/]+$/, "")
  return normalized || resolved
}

export function samePiPath(left: string, right: string): boolean {
  return canonicalizePiPath(left) === canonicalizePiPath(right)
}

function createPiLayout(root: string, agentsPath: string): PiLayout {
  const normalizedRoot = canonicalizePiPath(root)
  const normalizedAgentsPath = canonicalizePiPath(agentsPath)
  return {
    root: normalizedRoot,
    skillsDir: path.join(normalizedRoot, "skills"),
    promptsDir: path.join(normalizedRoot, "prompts"),
    extensionsDir: path.join(normalizedRoot, "extensions"),
    mcporterConfigPath: path.join(normalizedRoot, "compound-engineering", "mcporter.json"),
    managedManifestPath: path.join(normalizedRoot, "compound-engineering", PI_MANAGED_MANIFEST_NAME),
    agentsPath: normalizedAgentsPath,
    verificationPath: resolveVerificationPath(
      normalizedRoot,
      path.join(normalizedRoot, "compound-engineering", PI_MANAGED_MANIFEST_NAME),
    ),
  }
}

function isDirectPiRoot(outputRoot: string): boolean {
  const normalized = canonicalizePiPath(outputRoot)
  const home = process.env.HOME || os.homedir()
  const globalPiRoot = canonicalizePiPath(path.join(home, ".pi", "agent"))

  return normalized === globalPiRoot || path.basename(normalized) === ".pi"
}

function resolveVerificationPath(root: string, managedManifestPath: string): string {
  const stateHome = process.env.COMPOUND_ENGINEERING_HOME || os.homedir()
  const identity = createHash("sha256")
    .update(`${canonicalizePiPath(root)}:${canonicalizePiPath(managedManifestPath)}`)
    .digest("hex")
  return path.join(stateHome, ".compound-engineering", PI_MANAGED_VERIFICATION_DIR_NAME, `${identity}.json`)
}

export function resolvePiLayout(outputRoot: string, mode: PiLayoutMode): PiLayout {
  const normalizedOutputRoot = canonicalizePiPath(outputRoot)

  if (mode === "sync") {
    return createPiLayout(normalizedOutputRoot, path.join(normalizedOutputRoot, "AGENTS.md"))
  }

  if (isDirectPiRoot(normalizedOutputRoot)) {
    return createPiLayout(normalizedOutputRoot, path.join(normalizedOutputRoot, "AGENTS.md"))
  }

  const root = path.join(normalizedOutputRoot, ".pi")
  return createPiLayout(root, path.join(normalizedOutputRoot, "AGENTS.md"))
}

export function isPathWithinRoot(root: string, targetPath: string): boolean {
  const resolvedRoot = canonicalizePiPath(root)
  const resolvedTarget = canonicalizePiPath(targetPath)
  return resolvedTarget === resolvedRoot || resolvedTarget.startsWith(resolvedRoot + path.sep)
}

export function resolvePiProjectPathFromCwd(cwd: string, relativePath: string): string | undefined {
  return getPiLayoutSearchPaths(cwd, relativePath)[0]
}

export function getPiLayoutSearchPaths(cwd: string, relativePath: string): string[] {
  const paths: string[] = []
  let current = path.resolve(cwd)

  while (true) {
    paths.push(path.join(current, relativePath))
    paths.push(path.join(current, ".pi", relativePath))

    const parent = path.dirname(current)
    if (parent === current) break
    current = parent
  }

  return paths
}
