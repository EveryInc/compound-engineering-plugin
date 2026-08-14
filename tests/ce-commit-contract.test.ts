import { readFile } from "fs/promises"
import path from "path"
import { describe, expect, test } from "bun:test"

async function readRepoFile(relativePath: string): Promise<string> {
  return readFile(path.join(process.cwd(), relativePath), "utf8")
}

describe("ce-commit contract", () => {
  test("keeps argv-only context gathering and status-based cleanliness", async () => {
    const content = await readRepoFile("skills/ce-commit/SKILL.md")

    expect(content).toContain("own** shell tool call")
    expect(content).toMatch(/Do \*\*not\*\* join with `;`, `&&`, `\|\|`/)
    expect(content).toContain("`git status`")
    expect(content).toContain("`git diff HEAD`")
    expect(content).toContain("`git branch --show-current`")
    expect(content).toContain("`git log --oneline -10`")
    // Workflow forces gather before branch/commit decisions (order is load-bearing)
    expect(content).toMatch(
      /0\.\s+\*\*Gather\*\* — run every Context command above/,
    )
    // Cleanliness is status-based; diff alone misses untracked files
    expect(content).toMatch(/Do not use `git diff HEAD` alone as cleanliness/)
  })

  test("auto-branches off default and detached HEAD without asking", async () => {
    const content = await readRepoFile("skills/ce-commit/SKILL.md")

    expect(content).toMatch(/detached HEAD/i)
    expect(content).toMatch(/default branch/i)
    expect(content).toContain("git checkout -b")
    expect(content).toMatch(/Do not ask/)
    // Bare default name for comparison — origin/trunk must not skip auto-branch
    expect(content).toMatch(/strip a leading `origin\/`/)
    expect(content).toMatch(/never compare against `origin\/<name>`/)
    // No blocking-question adapter — commit-only has no interactive branch ask
    expect(content).not.toContain("AskUserQuestion")
    expect(content).not.toContain("request_user_input")
  })

  test("forbids blanket staging and requires named files", async () => {
    const content = await readRepoFile("skills/ce-commit/SKILL.md")

    expect(content).toMatch(/never `git add -A` or `git add \.`/)
    expect(content).toContain("named files")
    expect(content).toContain("git add file1 file2 file3")
    expect(content).toContain("<<'EOF'")
  })

  test("defaults fix over feat and leads messages with outcome", async () => {
    const content = await readRepoFile("skills/ce-commit/SKILL.md")

    expect(content).toMatch(/default to `fix:`/)
    expect(content).toMatch(/reserve `feat:`/i)
    expect(content).toMatch(/names the outcome/)
    expect(content).toContain("Fix double-submit on checkout")
    expect(content).toContain("Update checkout.rb")
    expect(content).toContain("append that unit's U-ID in parentheses — `(U3)` means unit 3")
    expect(content).toContain("Do not hunt for a plan")
    expect(content).toContain("Omit when the commit spans units")
  })

  test("scopes to local commits and points ship flow at ce-commit-push-pr", async () => {
    const content = await readRepoFile("skills/ce-commit/SKILL.md")

    expect(content).toMatch(/No push, no PR/)
    expect(content).toContain("ce-commit-push-pr")
  })

  test("does not hardcode instruction filenames on the read path", async () => {
    const content = await readRepoFile("skills/ce-commit/SKILL.md")

    expect(content).not.toMatch(/AGENTS\.md|CLAUDE\.md|GEMINI\.md/)
    expect(content).toMatch(/project commit conventions already in context/)
  })
})
