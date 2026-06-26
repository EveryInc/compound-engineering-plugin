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
      // Each block must self-resolve the skill dir locally (shell state does not persist
      // between Bash calls), via the portable model-filled SKILL_DIR anchor — not the
      // Claude-only ${CLAUDE_SKILL_DIR} substitution.
      expect(block).toContain('SKILL_DIR="')
      expect(block).toContain('SCRIPT_DIR="$SKILL_DIR/scripts"')
      expect(block).not.toContain("CLAUDE_SKILL_DIR")
    }
  })
})
