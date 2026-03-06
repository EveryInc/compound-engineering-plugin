import { describe, expect, test } from "bun:test"
import { promises as fs } from "fs"
import path from "path"

const repoRoot = path.join(import.meta.dir, "..")
const reviewCommandPath = path.join(
  repoRoot,
  "plugins",
  "compound-engineering",
  "commands",
  "ce",
  "review.md",
)
const setupSkillPath = path.join(
  repoRoot,
  "plugins",
  "compound-engineering",
  "skills",
  "setup",
  "SKILL.md",
)

describe("compound-engineering review workflow content", () => {
  test("ce:review uses a compact review packet and dedupes agents", async () => {
    const reviewCommand = await fs.readFile(reviewCommandPath, "utf8")

    expect(reviewCommand).toContain("#### Build Review Packet (REQUIRED BEFORE SPAWNING AGENTS)")
    expect(reviewCommand).toContain("Deduplicate this list while preserving order. Never run the same agent twice.")
    expect(reviewCommand).toContain("Task {agent-name}(review packet + exact file paths to inspect + review context from settings body)")
    expect(reviewCommand).toContain("Do not spawn `code-simplicity-reviewer` twice for the same PR.")
  })

  test("setup skill avoids duplicating always-on review agents", async () => {
    const setupSkill = await fs.readFile(setupSkillPath, "utf8")

    expect(setupSkill).toContain("Comprehensive: all above + `git-history-analyzer, data-integrity-guardian`")
    expect(setupSkill).toContain("`agent-native-reviewer` and `learnings-researcher` are always added by `/ce:review`, so do not include them in `review_agents`.")
    expect(setupSkill).toContain("Always-on during /ce:review:")
  })
})
