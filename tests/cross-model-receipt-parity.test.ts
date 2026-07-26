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
    expect(kernels[0]).toContain("MODEL_IDENTITY_STATUS")
    expect(kernels[0]).toContain("matched")
    expect(kernels[0]).toContain("mismatched")
    expect(kernels[0]).toContain("unverified")
    expect(kernels[0]).toContain("fable")
    expect(kernels[0]).toContain("claude-*")
  })

  test("candidate qualification and credential-minimized environments stay identical", async () => {
    const bodies = await Promise.all(
      SCRIPTS.map((rel) => readFile(path.join(PLUGIN_ROOT, rel), "utf8")),
    )
    const block = (body: string, start: string, end: string) => {
      const begin = body.indexOf(start)
      const finish = body.indexOf(end, begin)
      expect(begin).toBeGreaterThan(-1)
      expect(finish).toBeGreaterThan(begin)
      return body.slice(begin, finish)
    }
    const selectorKernels = bodies.map((body) =>
      block(body, "safe_selector_token()", "route_receipt_supported()"))
    const environmentKernels = bodies.map((body) =>
      block(body, "build_min_env()", "\n}\n"))

    for (const kernels of [selectorKernels, environmentKernels]) {
      for (let i = 1; i < kernels.length; i++) expect(kernels[i]).toBe(kernels[0])
    }
    expect(selectorKernels[0]).toContain("candidate_model_compatible")
    expect(environmentKernels[0]).toContain("env -i")
    for (const configDir of ["CODEX_HOME", "CLAUDE_CONFIG_DIR", "GROK_CONFIG_HOME", "CURSOR_CONFIG_DIR"]) {
      expect(environmentKernels[0]).toContain(configDir)
    }
    for (const credential of ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "CLAUDE_CODE_OAUTH_TOKEN"]) {
      expect(environmentKernels[0]).not.toContain(credential)
    }
  })

  test("every peer artifact exposes model and effort evidence separately from independence", async () => {
    for (const rel of SCRIPTS) {
      const body = await readFile(path.join(PLUGIN_ROOT, rel), "utf8")
      expect(body).toContain("model_identity_status")
      expect(body).toContain("model_actual")
      expect(body).toContain("effort_requested")
      expect(body).toContain("effort_actual")
      expect(body).toContain("independence_verified")
    }
  })
})
