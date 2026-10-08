import { readFile } from "fs/promises"
import path from "path"
import { describe, expect, test } from "bun:test"
import { ACPX_PIN } from "./helpers/acpx-pin"

const PLUGIN_ROOT = path.join(process.cwd(), "skills")

// The acpx transport block is byte-duplicated into each cross-model worker that
// has migrated to acpx (the plugin has no cross-skill import mechanism; see
// AGENTS.md "File References in Skills"). Add a worker here in the change that
// migrates it.
const MIGRATED_WORKERS = [
  "ce-pov/scripts/cross-model-pov.sh",
  "ce-doc-review/scripts/cross-model-doc-review.sh",
  "ce-code-review/scripts/cross-model-adversarial-review.sh",
  "ce-work/scripts/cross-model-work.sh",
]

const BEGIN_MARKER = "# --- acpx transport (keep byte-identical across migrated peer workers)"
const END_MARKER = "# --- end acpx transport"

function transportBlock(content: string, file: string): string {
  const lines = content.split("\n")
  const begin = lines.findIndex((l) => l.startsWith(BEGIN_MARKER))
  const end = lines.findIndex((l) => l.startsWith(END_MARKER))
  if (begin < 0 || end <= begin) throw new Error(`${file}: acpx transport markers missing or out of order`)
  return lines.slice(begin, end + 1).join("\n")
}

describe("acpx transport parity", () => {
  test("the transport block is byte-identical in every migrated worker", async () => {
    const blocks = await Promise.all(
      MIGRATED_WORKERS.map(async (rel) => transportBlock(await readFile(path.join(PLUGIN_ROOT, rel), "utf8"), rel)),
    )
    for (let i = 1; i < blocks.length; i++) expect(blocks[i]).toBe(blocks[0])
  })

  test("every migrated worker pins the acpx version the contract suite tests", async () => {
    for (const rel of MIGRATED_WORKERS) {
      const block = transportBlock(await readFile(path.join(PLUGIN_ROOT, rel), "utf8"), rel)
      expect(block, rel).toContain(`ACPX_VERSION="${ACPX_PIN}"`)
    }
  })
})
