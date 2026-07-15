import { readFile } from "fs/promises"
import path from "path"
import { describe, expect, test } from "bun:test"

const PLUGIN_ROOT = path.join(process.cwd(), "skills")

// The model-identity receipt kernel (expected_model_prefix / route_model /
// extract_model_receipt) is byte-duplicated between the two cross-model peer
// scripts (the plugin has no cross-skill import mechanism — see AGENTS.md
// "File References in Skills") and each carries a "keep byte-identical"
// comment. This test makes that comment enforceable.
const SCRIPTS = [
  "ce-code-review/scripts/cross-model-adversarial-review.sh",
  "ce-doc-review/scripts/cross-model-doc-review.sh",
  "ce-pov/scripts/cross-model-pov.sh",
]

const BEGIN_MARKER = "# --- model-identity receipt (R7/R8)"
const END_MARKER = "# --- adapter argv"

/** Lines from the receipt marker through the line immediately before the
 * adapter-argv marker. */
function receiptKernel(content: string, file: string): string {
  const lines = content.split("\n")
  const begin = lines.findIndex((l) => l.startsWith(BEGIN_MARKER))
  const end = lines.findIndex((l) => l.startsWith(END_MARKER))
  if (begin < 0 || end <= begin) {
    throw new Error(`${file}: receipt-kernel markers missing or out of order`)
  }
  return lines.slice(begin, end).join("\n")
}

describe("cross-model receipt-kernel parity", () => {
  test("the model-identity receipt block is byte-identical in all scripts", async () => {
    const kernels = await Promise.all(
      SCRIPTS.map(async (rel) => {
        const p = path.join(PLUGIN_ROOT, rel)
        return receiptKernel(await readFile(p, "utf8"), rel)
      }),
    )
    for (let i = 1; i < kernels.length; i++) {
      expect(kernels[i]).toBe(kernels[0])
    }
  })
})
