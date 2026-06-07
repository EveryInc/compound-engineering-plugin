import { readFile } from "fs/promises"
import path from "path"
import { describe, expect, test } from "bun:test"

async function readRepoFile(relativePath: string): Promise<string> {
  return readFile(path.join(process.cwd(), relativePath), "utf8")
}

describe("ce-commit-push-pr draft mode", () => {
  test("parses draft:true as a literal-prefix token", async () => {
    const content = await readRepoFile("plugins/compound-engineering/skills/ce-commit-push-pr/SKILL.md")

    expect(content).toContain("draft:true")
    expect(content).toContain("autopilot:true")
    expect(content).toContain("plan:<path>")
    expect(content).toContain("ledger:<path>")
    expect(content).toMatch(/literal-prefix|literal prefix/i)
    expect(content).toMatch(/strip|stripped/i)
    expect(content).toMatch(/draft_mode/)
    expect(content).toMatch(/autopilot_context/)
  })

  test("creates new PRs as draft without changing existing readiness", async () => {
    const content = await readRepoFile("plugins/compound-engineering/skills/ce-commit-push-pr/SKILL.md")

    expect(content).toContain("gh pr create --draft")
    expect(content).toMatch(/existing PR.*draft\/ready state|existing PR.*readiness state|leave existing PR/i)
    expect(content).not.toContain("gh pr ready")
  })

  test("autopilot draft mode avoids optional evidence prompts", async () => {
    const content = await readRepoFile("plugins/compound-engineering/skills/ce-commit-push-pr/SKILL.md")
    const lfg = await readRepoFile("plugins/compound-engineering/skills/lfg/SKILL.md")

    expect(content).toMatch(/autopilot draft mode/i)
    expect(content).toMatch(/draft_mode=true.*autopilot_context=true/i)
    expect(content).toMatch(/suppress nonessential|do not ask/i)
    expect(content).toMatch(/record skipped optional evidence|skipped optional evidence/i)
    expect(content).toMatch(/run contract explicitly requires/i)
    expect(lfg).toContain("draft:true autopilot:true plan:<plan-path> ledger:<ledger-path>")
  })

  test("autopilot existing-PR path updates without rewrite confirmation", async () => {
    const content = await readRepoFile("plugins/compound-engineering/skills/ce-commit-push-pr/SKILL.md")

    const branch = content.match(/\*\*Existing PR autopilot draft mode\*\*[\s\S]*?\r?\n\r?\n/)
    expect(branch, "autopilot existing-PR branch should be explicit").not.toBeNull()
    expect(branch![0]).toMatch(/draft_mode=true.*autopilot_context=true/i)
    expect(branch![0]).toMatch(/gh pr edit/)
    expect(branch![0]).toMatch(/Do not ask whether to rewrite/i)
    expect(branch![0]).toMatch(/do not ask for the preview confirmation/i)
    expect(branch![0]).toMatch(/leave existing PR draft\/ready state unchanged/i)

    expect(content).toMatch(/Existing PR interactive mode[\s\S]*ask whether to rewrite the description/i)
  })

  test("existing PR rewrites preserve durable residual sections", async () => {
    const content = await readRepoFile("plugins/compound-engineering/skills/ce-commit-push-pr/SKILL.md")
    const writing = await readRepoFile(
      "plugins/compound-engineering/skills/ce-commit-push-pr/references/pr-description-writing.md",
    )
    const docs = await readRepoFile("docs/skills/ce-commit-push-pr.md")

    for (const section of [
      "## Residual Review Findings",
      "## Known Residuals",
      "## CI Failures Unresolved",
    ]) {
      expect(content).toContain(section)
      expect(writing).toContain(section)
      expect(docs).toContain(section)
    }

    expect(content).toMatch(/existing PR body/i)
    expect(content).toMatch(/preserve or include caller-owned durable sections/i)
    expect(content).toContain("url,title,state,body")
    expect(writing).toMatch(/preserve any existing/i)
    expect(writing).toMatch(/must never erase them/i)
    expect(writing).toMatch(/unless the caller supplies a refreshed replacement/i)
    expect(docs).toMatch(/preserves or includes durable caller-owned sections/i)
  })

  test("new PR autopilot bodies include caller-supplied residual sections", async () => {
    const content = await readRepoFile("plugins/compound-engineering/skills/ce-commit-push-pr/SKILL.md")
    const writing = await readRepoFile(
      "plugins/compound-engineering/skills/ce-commit-push-pr/references/pr-description-writing.md",
    )
    const docs = await readRepoFile("docs/skills/ce-commit-push-pr.md")

    expect(content).toMatch(/Step 1 found no existing PR/i)
    expect(content).toMatch(/ledger.*pr_body_sections\.residual_review_findings/is)
    expect(content).toMatch(/new draft PR body must include that `## Residual Review Findings` section/i)
    expect(content).toMatch(/New PR[\s\S]*verify the composed body includes them before running `gh pr create`/i)
    expect(writing).toMatch(/For a new PR with no existing body, include refreshed durable sections supplied through caller context or the run ledger/i)
    expect(docs).toMatch(/New PRs include durable sections supplied through caller context or the run ledger/i)
  })

  test("ledger path is read before composing autopilot PR bodies", async () => {
    const content = await readRepoFile("plugins/compound-engineering/skills/ce-commit-push-pr/SKILL.md")
    const docs = await readRepoFile("docs/skills/ce-commit-push-pr.md")

    expect(content).toMatch(/When `ledger:<path>` is present/i)
    expect(content).toMatch(/read the file at that path before PR title\/body composition/i)
    expect(content).toMatch(/parse the fenced JSON/i)
    expect(content).toMatch(/extract `pr_body_sections\.residual_review_findings`/i)
    expect(content).toMatch(/pass the extracted section into composition/i)
    expect(docs).toMatch(/reads the ledger file/i)
  })

  test("body-file temp guidance is platform-aware and not POSIX-only", async () => {
    const content = await readRepoFile("plugins/compound-engineering/skills/ce-commit-push-pr/SKILL.md")
    const docs = await readRepoFile("docs/skills/ce-commit-push-pr.md")

    expect(content).not.toContain('${TMPDIR:-/tmp}/ce-pr-body.XXXXXX')
    expect(content).toContain("mktemp -t ce-pr-body.XXXXXX")
    expect(content).toContain("[System.IO.Path]::GetTempFileName()")
    expect(content).toContain("Set-Content -LiteralPath $BodyFile -Encoding UTF8")
    expect(docs).toMatch(/POSIX shells use `mktemp`/)
    expect(docs).toMatch(/PowerShell uses `\[System\.IO\.Path\]::GetTempFileName\(\)`/)
  })

  test("context fallback avoids chained runtime shell recipes", async () => {
    const content = await readRepoFile("plugins/compound-engineering/skills/ce-commit-push-pr/SKILL.md")
    const fallback = content.split("### Context fallback")[1].split("---")[0]

    expect(fallback).toMatch(/Run these probes one at a time/i)
    expect(fallback).not.toContain(";")
    expect(fallback).not.toContain("2>/dev/null")
    expect(fallback).not.toContain("|| echo")
  })

  test("commit instructions avoid chained runtime git recipes", async () => {
    const content = await readRepoFile("plugins/compound-engineering/skills/ce-commit-push-pr/SKILL.md")
    const commitSection = content.split("## Step 3: Commit and push")[1].split("## Step 4: Compose title and body")[0]

    expect(commitSection).not.toMatch(/git add[^\n]*&&[^\n]*git commit/)
    expect(commitSection).toMatch(/run .*one at a time|one command at a time/i)
  })
})
