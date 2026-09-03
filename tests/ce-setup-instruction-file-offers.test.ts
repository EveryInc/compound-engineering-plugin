import { describe, expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import path from "node:path"

const readRepoFile = (p: string) => readFile(path.join(process.cwd(), p), "utf8")

// The compounding directive is standing-instruction text users paste into their
// own AGENTS.md/CLAUDE.md. It exists in three always-visible places: the asset
// ce-setup inserts verbatim, the ce-compound guide a user copies from, and this
// repo's own AGENTS.md. A paraphrase in any one of them silently forks the bar,
// so the three are pinned byte-for-byte to each other.

function assetVariants(asset: string): Record<string, string> {
  const out: Record<string, string> = {}
  const re = /^## (.+)\n\n([\s\S]*?)(?=\n## |\s*$)/gm
  for (const m of asset.matchAll(re)) out[m[1].trim()] = m[2].trim()
  return out
}

function guideBlockquotes(guide: string): string[] {
  const section = guide.split("## Make capture automatic")[1]?.split("\n---")[0] ?? ""
  return [...section.matchAll(/^> (.+)$/gm)].map((m) => m[1].trim())
}

describe("ce-setup instruction-file offers", () => {
  test("directive asset matches the ce-compound guide variants verbatim", async () => {
    const variants = assetVariants(await readRepoFile("skills/ce-setup/assets/compounding-directive.md"))
    expect(Object.keys(variants).sort()).toEqual(["Offer first", "Run automatically"])
    const quotes = guideBlockquotes(await readRepoFile("docs/guides/ce-compound.md"))
    expect(quotes).toEqual([variants["Offer first"], variants["Run automatically"]])
  })

  test("this repo's AGENTS.md carries the automatic variant verbatim", async () => {
    const variants = assetVariants(await readRepoFile("skills/ce-setup/assets/compounding-directive.md"))
    expect(await readRepoFile("AGENTS.md")).toContain(variants["Run automatically"])
  })

  test("both variants state the durable-knowledge bar ce-compound enforces", async () => {
    const variants = assetVariants(await readRepoFile("skills/ce-setup/assets/compounding-directive.md"))
    for (const text of Object.values(variants)) {
      for (const phrase of [
        "durable project reasoning",
        "not readily recoverable from the final code, tests, types, comments, or existing documentation",
        "recurrence, material risk, or substantial rediscovery",
        "if the learning document disappeared",
        "Completion, effort, and diff size alone are not enough",
        "tracked, committed knowledge",
      ]) {
        expect(text).toContain(phrase)
      }
    }
  })

  test("Step 9 inserts the asset verbatim, only on approval, and never creates the file", async () => {
    const fixes = await readRepoFile("skills/ce-setup/references/repo-fixes.md")
    const step = fixes.split("### Step 9:")[1] ?? ""
    expect(step).toContain("assets/compounding-directive.md")
    expect(step).toMatch(/verbatim/)
    expect(step).toMatch(/do not paraphrase/i)
    expect(step).toMatch(/only on approval/i)
    expect(step).toMatch(/never creates one/i)
    expect(step).toMatch(/never the `<root>` placeholder/)
    expect(step).toMatch(/git tracks at least one file under the resolved `<root>\/solutions\/`/)
    expect(step).toMatch(/untracked or gitignored directory is not evidence/)
    expect(step).toMatch(/already carries a standing instruction to invoke `ce-compound`/)
    const skill = await readRepoFile("skills/ce-setup/SKILL.md")
    expect(skill).toContain("Steps 4-9")
  })
})
