import { cpSync, existsSync, mkdtempSync, renameSync, rmSync } from "fs"
import os from "os"
import path from "path"

export interface MaterializedClaudePluginFixture {
  root: string
  cleanup: () => void
}

export function materializeClaudePluginFixture(sourceRoot: string): MaterializedClaudePluginFixture {
  const root = mkdtempSync(path.join(os.tmpdir(), "claude-plugin-fixture-"))
  try {
    cpSync(sourceRoot, root, { recursive: true })

    // Keep real nested manifests out of the committed marketplace tree. Tests
    // reconstruct the Claude-required directory name only in OS temp.
    const stagedManifestDir = path.join(root, "claude-plugin")
    if (!existsSync(stagedManifestDir)) {
      throw new Error(`Fixture is missing staged Claude manifest directory: ${stagedManifestDir}`)
    }

    renameSync(stagedManifestDir, path.join(root, ".claude-plugin"))
  } catch (error) {
    rmSync(root, { recursive: true, force: true })
    throw error
  }

  return {
    root,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  }
}
