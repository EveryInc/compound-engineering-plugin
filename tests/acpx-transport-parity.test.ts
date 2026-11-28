import { readFile } from "fs/promises"
import path from "path"
import { describe, expect, test } from "bun:test"
import { ACPX_PIN, ACPX_MIN_VERSION } from "./helpers/acpx-pin"

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

  test("every migrated worker uses the acpx bounds the contract suite tests", async () => {
    for (const rel of MIGRATED_WORKERS) {
      const block = transportBlock(await readFile(path.join(PLUGIN_ROOT, rel), "utf8"), rel)
      expect(block, rel).toContain(`ACPX_VERSION="${ACPX_PIN}"`)
      expect(block, rel).toContain(`ACPX_MIN_VERSION="${ACPX_MIN_VERSION}"`)
    }
  })

  // acpx 0.22/0.23 still pin codex-acp 1.x, whose bundled core the Codex
  // service refuses for every gpt-6.1/6.2 model. The raw launch keeps the
  // adapter on the 2.x line that serves them (issue #2098).
  test("the codex route carries the codex-acp 2.x launch for POSIX hosts", async () => {
    for (const rel of MIGRATED_WORKERS) {
      const block = transportBlock(await readFile(path.join(PLUGIN_ROOT, rel), "utf8"), rel)
      expect(block, rel).toContain('--agent "npx -y @agentclientprotocol/codex-acp@2.12.0"')
    }
  })

  // The setup warm step must fetch the adapter the route launches; otherwise
  // the first peer run still downloads it (issue #2098).
  test("setup warms the codex adapter the route launches", async () => {
    const block = transportBlock(
      await readFile(path.join(PLUGIN_ROOT, MIGRATED_WORKERS[0]), "utf8"),
      MIGRATED_WORKERS[0],
    )
    const spec = block.match(/--agent "npx -y (@agentclientprotocol\/codex-acp@[\d.]+)"/)?.[1]
    expect(spec).toBeDefined()
    const health = await readFile(path.join(process.cwd(), "skills", "ce-setup", "scripts", "check-health"), "utf8")
    expect(health).toContain(`CODEX_PEER_ADAPTER_SPEC="${spec}"`)
    expect(health).toContain('warm_specs="$warm_specs $CODEX_PEER_ADAPTER_SPEC"')
    expect(health).toContain("MINGW*|MSYS*|CYGWIN*) ;;")
  })
})
