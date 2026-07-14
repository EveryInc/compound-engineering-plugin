import { describe, expect, test } from "bun:test"
import { readFileSync } from "fs"
import path from "path"
import { extractBashBlocks } from "./fenced-blocks"

const REFERENCES_DIR = path.join(import.meta.dir, "..", "..", "skills", "ce-resolve-pr-feedback", "references")
const MODE_FILES = ["full-mode.md", "targeted-mode.md"] as const

describe("ce-resolve-pr-feedback script directory handling", () => {
  for (const file of MODE_FILES) {
    const markdown = readFileSync(path.join(REFERENCES_DIR, file), "utf8")
    const scriptBlocks = extractBashBlocks(markdown)
      .map((b) => b.body)
      .filter((block) => block.includes("$SKILL_DIR/scripts/"))

    test(`${file}: each bundled-script block resolves the skill dir via a flatten-safe SKILL_DIR anchor`, () => {
      expect(scriptBlocks.length).toBeGreaterThan(0)
      for (const block of scriptBlocks) {
        // Blocks self-resolve the skill dir locally via the portable model-filled SKILL_DIR
        // anchor (shell state does not persist between Bash calls) — not the Claude-only
        // ${CLAUDE_SKILL_DIR} substitution.
        expect(block).toContain('SKILL_DIR="')
        expect(block).not.toContain("CLAUDE_SKILL_DIR")

        // Flatten-safety: the SKILL_DIR assignment must terminate with `;`. Some hosts flatten
        // a fenced block to one line (newline -> space); without the `;` this becomes the
        // env-var-prefix form `SKILL_DIR="..." bash "$SKILL_DIR/..."`, where the shell expands
        // $SKILL_DIR before the assignment applies and the script path collapses to `/scripts/...`.
        const assignment = block.split("\n").find((line) => line.trimStart().startsWith('SKILL_DIR="'))
        expect(assignment).toBeDefined()
        expect(assignment!.trimEnd().endsWith(";")).toBe(true)
      }
    })
  }
})
