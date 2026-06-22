import { describe, expect, test } from "bun:test"
import { readFileSync } from "fs"
import path from "path"

const FULL_MODE = readFileSync(
  path.join(import.meta.dir, "..", "..", "skills", "ce-resolve-pr-feedback", "references", "full-mode.md"),
  "utf8",
)

function fencedBashBlocks(markdown: string): string[] {
  const blocks: string[] = []
  const pattern = /```bash\n([\s\S]*?)\n```/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(markdown)) !== null) {
    blocks.push(match[1] ?? "")
  }
  return blocks
}

describe("ce-resolve-pr-feedback script directory handling", () => {
  test("each SCRIPT_DIR command block resolves the skill script directory locally", () => {
    const scriptDirBlocks = fencedBashBlocks(FULL_MODE).filter((block) => block.includes("$SCRIPT_DIR/"))

    expect(scriptDirBlocks.length).toBeGreaterThan(0)
    for (const block of scriptDirBlocks) {
      expect(block).toContain('if [ -n "${CLAUDE_SKILL_DIR}" ]')
      expect(block).toContain('SCRIPT_DIR="${CLAUDE_SKILL_DIR}/scripts"')
    }
  })
})
