import { promises as fs } from "fs"
import path from "path"
import { pathExists, readText, writeText } from "./files"

export const CODEX_AGENTS_BLOCK_START = "<!-- BEGIN COMPOUND CODEX TOOL MAP -->"
export const CODEX_AGENTS_BLOCK_END = "<!-- END COMPOUND CODEX TOOL MAP -->"

/**
 * Remove the legacy Compound Codex tool-map block from `$CODEX_HOME/AGENTS.md`.
 *
 * Native Codex plugin install no longer needs this Claude-compat shim; skills
 * name Codex tools inline. Older Bun convert/install runs used to upsert the
 * block — this strips it on any future Codex-targeting convert/install so the
 * bad mapping cannot recur, without creating AGENTS.md when absent.
 */
export async function stripCodexAgentsToolMap(codexHome: string): Promise<void> {
  const filePath = path.join(codexHome, "AGENTS.md")
  if (!(await pathExists(filePath))) {
    return
  }

  const existing = await readText(filePath)
  const updated = removeCodexAgentsToolMapBlock(existing)
  if (updated === existing) {
    return
  }

  if (updated.trim().length === 0) {
    await fs.unlink(filePath)
    return
  }

  await writeText(filePath, updated)
}

/** Pure strip helper — exported for tests. */
export function removeCodexAgentsToolMapBlock(existing: string): string {
  const startIndex = existing.indexOf(CODEX_AGENTS_BLOCK_START)
  const endIndex = existing.indexOf(CODEX_AGENTS_BLOCK_END)

  if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
    return existing
  }

  const before = existing.slice(0, startIndex).trimEnd()
  const after = existing.slice(endIndex + CODEX_AGENTS_BLOCK_END.length).trimStart()
  if (!before && !after) {
    return ""
  }
  if (!before) {
    return after.endsWith("\n") ? after : after + "\n"
  }
  if (!after) {
    return before + "\n"
  }
  return before + "\n\n" + after + (after.endsWith("\n") ? "" : "\n")
}
