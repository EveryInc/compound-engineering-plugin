import { readFile } from "fs/promises"
import path from "path"
import { describe, expect, test } from "bun:test"

const PLUGIN_ROOT = path.join(process.cwd(), "skills")

// recover_findings_json (the codex stdout-recovery JSON extractor) is
// byte-duplicated between the two cross-model peer scripts (the plugin has no
// cross-skill import mechanism — see AGENTS.md "File References in Skills") and
// was kept identical by hand. This test makes that enforceable so the copies
// cannot drift (e.g. a fix landing in one script but not the other).
const SCRIPTS = [
  "ce-code-review/scripts/cross-model-adversarial-review.sh",
  "ce-doc-review/scripts/cross-model-doc-review.sh",
]

const DEF_MARKER = "recover_findings_json() {"

/** The recover_findings_json definition — its leading comment block through the
 * function's closing brace — so both the python heredoc and its synced header
 * comment are compared. */
function recoverFn(content: string, file: string): string {
  const lines = content.split("\n")
  const def = lines.findIndex((l) => l.startsWith(DEF_MARKER))
  if (def < 0) throw new Error(`${file}: ${DEF_MARKER} not found`)
  // Back up over the contiguous leading comment block (the synced header).
  let begin = def
  while (begin > 0 && lines[begin - 1].startsWith("#")) begin--
  const end = lines.findIndex((l, i) => i > def && l === "}")
  if (end < 0) throw new Error(`${file}: closing brace for recover_findings_json not found`)
  return lines.slice(begin, end + 1).join("\n")
}

describe("cross-model recover_findings_json parity", () => {
  test("the recover_findings_json extractor is byte-identical in both scripts", async () => {
    const fns = await Promise.all(
      SCRIPTS.map(async (rel) =>
        recoverFn(await readFile(path.join(PLUGIN_ROOT, rel), "utf8"), rel),
      ),
    )
    for (let i = 1; i < fns.length; i++) {
      expect(fns[i]).toBe(fns[0])
    }
  })
})
