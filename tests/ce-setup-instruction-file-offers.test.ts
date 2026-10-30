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

function guideBlockquotes(guide: string, heading = "## Make capture automatic"): string[] {
  const section = guide.split(heading)[1]?.split("\n---")[0] ?? ""
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
    expect(skill).toContain("Steps 4-10")
  })

  // The chat-register directive is the always-on path for ce-noslop's
  // agent-reporting register: the skill is not in context when an agent writes
  // a reply, so the instruction-file line has to carry the boundary, the
  // register, and the exclusions on its own. It lives in two always-visible
  // places, the asset ce-setup inserts and the ce-noslop guide a user copies
  // from, so the two are pinned byte-for-byte to each other; a paraphrase in
  // either forks the bar.
  test("noslop directive asset matches the ce-noslop guide blockquote verbatim", async () => {
    const variants = assetVariants(await readRepoFile("skills/ce-setup/assets/noslop-directive.md"))
    expect(Object.keys(variants)).toEqual(["Standing instruction"])
    const directive = variants["Standing instruction"]
    const quotes = guideBlockquotes(await readRepoFile("docs/guides/ce-noslop.md"), "## Make it automatic")
    expect(quotes).toEqual([directive])
    expect(directive.length).toBeLessThan(900)
    expect(directive).toContain("through the `ce-noslop` skill")
    expect(directive).not.toMatch(/\/ce-noslop/)
  })

  test("Step 9 offers the noslop directive verbatim beside the compounding directive", async () => {
    const fixes = await readRepoFile("skills/ce-setup/references/repo-fixes.md")
    const step = fixes.split("### Step 9:")[1] ?? ""
    expect(step).toContain("assets/noslop-directive.md")
    expect(step).toMatch(/\*\*Chat-register directive\.\*\*/)
    expect(step).toMatch(/Report all three outcomes/)
    const skill = await readRepoFile("skills/ce-setup/SKILL.md")
    expect(skill).toContain("the chat-register directive for `ce-noslop`")
  })

  test("Step 9 skips the noslop offer only when all three parts are already covered", async () => {
    const fixes = await readRepoFile("skills/ce-setup/references/repo-fixes.md")
    const step = fixes.split("### Step 9:")[1] ?? ""
    // covers all three parts -> skip
    expect(step).toMatch(
      /Skip the offer only when the file already carries an instruction that covers all three parts of the bundled one: the report boundary \(.*\), the invocation \(.*\), and the exclusions \(.*\)\./,
    )
    // partial (boundary only, or a generic "write plainly") -> offer
    expect(step).toMatch(/A partial instruction, such as one naming only the boundary or a generic "write plainly"/)
    // unrelated or none -> offer
    expect(step).toMatch(/or an unrelated writing rule still gets the offer/)
    expect(step).toMatch(/Offer it whenever this step runs\./)
  })

  test("Step 10 makes one evidence-backed offer for the review docs", async () => {
    const fixes = await readRepoFile("skills/ce-setup/references/repo-fixes.md")
    expect(fixes.split("### Step 10:")[1] ?? "").toContain("references/project-docs.md")
    const docs = await readRepoFile("skills/ce-setup/references/project-docs.md")
    expect(docs).toContain("never one question per file")
    expect(docs).toContain("Never offer a template in place of evidence")
    expect(docs).toMatch(/Nothing is written until the user approves the drafts/)
    // The include line alone is what lets Claude Code Review read the standards, so REVIEW.md is never skipped.
    expect(docs).toMatch(/Draft `REVIEW\.md` whenever setup drafts or keeps a `CODING_STANDARDS\.md`, even when no section has evidence/)
  })

  test("asking for coding standards routes straight to the whole review-docs set", async () => {
    const skill = await readRepoFile("skills/ce-setup/SKILL.md")
    const route = skill.split("## Review Docs")[1]?.split("\n## ")[0] ?? ""
    expect(route).toContain("references/project-docs.md")
    expect(route).toMatch(/whole set of files even when the request names one/)
    const docs = await readRepoFile("skills/ce-setup/references/project-docs.md")
    expect(docs).toMatch(/that request is the yes: skip the offer/)
  })
})
