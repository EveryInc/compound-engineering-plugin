import { existsSync, readdirSync, readFileSync, statSync } from "fs"
import path from "path"
import { Glob } from "bun"
import { describe, expect, test } from "bun:test"

const SKILLS_ROOT = path.join(process.cwd(), "skills")
const SKILL_DIR = path.join(process.cwd(), "skills/ce-prototype")
const SKILL_BODY = readFileSync(path.join(SKILL_DIR, "SKILL.md"), "utf8")
const PREVIEW_BODY = readFileSync(path.join(SKILL_DIR, "references/preview.md"), "utf8")

function frontmatter(body: string): string {
  const match = body.match(/^---\n([\s\S]*?)\n---/)
  expect(match, "SKILL.md must have YAML frontmatter").not.toBeNull()
  return match![1]
}

describe("ce-prototype protocol", () => {
  test("frontmatter is model-invocable and names adjacent negatives", () => {
    const fm = frontmatter(SKILL_BODY)
    expect(fm).toMatch(/^name:\s*ce-prototype\s*$/m)
    expect(fm).not.toMatch(/disable-model-invocation/)
    const description = fm.match(/^description:\s*(.+)$/m)?.[1] ?? ""
    expect(description.length).toBeGreaterThan(0)
    expect(description.length).toBeLessThanOrEqual(1024)
    expect(description.toLowerCase()).toMatch(/probe/)
    expect(description.toLowerCase()).toMatch(/polish/)
  })

  test("skill tree has no sibling-directory references", () => {
    const files: string[] = []
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) walk(full)
        else if (entry.name.endsWith(".md") || entry.name.endsWith(".js")) files.push(full)
      }
    }
    walk(SKILL_DIR)

    for (const file of files) {
      const body = readFileSync(file, "utf8")
      expect(body, file).not.toMatch(/\.\.\/[A-Za-z]/)
    }
  })

  test("every references/ and scripts/ path exists in-skill", () => {
    const mentioned = [
      ...SKILL_BODY.matchAll(/`((?:references|scripts)\/[^`]+)`/g),
      ...PREVIEW_BODY.matchAll(/`((?:references|scripts)\/[^`]+)`/g),
    ].map((match) => match[1].replace(/#.*/, ""))

    expect(mentioned.length).toBeGreaterThan(0)
    for (const rel of mentioned) {
      const target = path.join(SKILL_DIR, rel)
      expect(existsSync(target), target).toBe(true)
      expect(statSync(target).isFile(), target).toBe(true)
    }
  })

  test("executed preview commands use SKILL_DIR with a trailing semicolon", () => {
    expect(PREVIEW_BODY).toMatch(/SKILL_DIR="[^"]+";/)
    expect(PREVIEW_BODY).not.toContain("${CLAUDE_SKILL_DIR}")
    expect(SKILL_BODY).not.toContain("${CLAUDE_SKILL_DIR}")
  })

  test("one organizing rule governs modality, fidelity, and medium", () => {
    const spine = SKILL_BODY.slice(
      SKILL_BODY.indexOf("\n---", 4) + 4,
      SKILL_BODY.indexOf("\n## "),
    )
    expect(
      /do not fake the dimension being tested/i.test(spine),
      "The organizing rule must sit in the spine, above the first section heading — not buried in a later section. Everything downstream (modality, fidelity, medium) derives from it, so it has to be read before any of them.",
    ).toBe(true)
    expect(
      /(modality|fidelity|medium)[^.]{0,120}\b(follow|follows|derive|derives)\b[^.]{0,60}\b(from|that one rule|that rule)\b/i.test(
        SKILL_BODY,
      ),
      "The organizing rule must be stated as governing modality, fidelity, and medium. If those read as independent axes again, the skill re-collapses into a drive-only prototype tool and a question settled by seeing goes uncovered.",
    ).toBe(true)
  })

  test("web is the default substrate regardless of the product's stack", () => {
    expect(
      /\bdefault\b[^.\n]{0,40}\b(substrate|medium)\b[\s\S]{0,120}?\bweb\b/i.test(SKILL_BODY),
      "The spine must name the web as the default prototype substrate. Without that floor, a run in a native or non-web repo builds in the product's own stack — the expensive path a throwaway prototype exists to avoid.",
    ).toBe(true)
    expect(
      /whatever the product is written in|regardless of[^.]{0,60}\b(product|implementation|stack|language|platform)\b/i.test(
        SKILL_BODY,
      ),
      "The web default must be stated as decoupled from the product's implementation language or platform, not as a web-repo-only convenience.",
    ).toBe(true)
  })

  test("no skill reintroduces a retired ce-prototype routing predicate", () => {
    // Exact retired wordings only. A looser semantic pattern would fire on the
    // organizing rule's contrast pair in ce-prototype's own spine, which
    // describes the dimension under test rather than the route to the skill.
    const retired = [
      "requires use, not inspection",
      "inspection, not use",
      "drive rather than look at",
      "substantial behavior or interaction",
    ]

    const offenders: string[] = []
    for (const rel of new Glob("**/*.md").scanSync({ cwd: SKILLS_ROOT })) {
      const body = readFileSync(path.join(SKILLS_ROOT, rel), "utf8").toLowerCase()
      for (const phrase of retired) {
        if (body.includes(phrase)) offenders.push(`skills/${rel}: "${phrase}"`)
      }
    }

    expect(
      offenders,
      `Retired ce-prototype routing wording found:\n${offenders.join("\n")}\n\nEvery site stating when ce-prototype applies uses one test: the decision is expensive to unravel and a cheap sketch cannot settle it. The drive-versus-look-at and use-versus-inspection predicates were removed, not qualified — they filter out decisions settled by seeing, which the skill now covers. State the test in full once per skill (ce-brainstorm's Interaction Rule 7, ce-plan's handoff menu) and cite that owner everywhere else in the same skill.`,
    ).toEqual([])
  })

  test("repo grounding is scoped, not a tree scan", () => {
    expect(SKILL_BODY).toMatch(/do not scan the tree/i)
  })

  test("apply-time write-back is a late load", () => {
    expect(SKILL_BODY).toContain("`references/write-back.md`")
    expect(SKILL_BODY).toContain("`references/preview.md`")
  })

  test("successive prototypes keep a scratch decision log, not a durable note", () => {
    expect(SKILL_BODY).toContain("decisions.md")
    expect(PREVIEW_BODY).toContain("decisions.md")
    expect(SKILL_BODY).toMatch(/run capsule at `decisions\.md`/)
    expect(SKILL_BODY).toMatch(/Point at the prototype/)
    expect(SKILL_BODY).toMatch(/Do not pause to confirm every write/)
    expect(SKILL_BODY).toMatch(/Read `decisions\.md` before/)
    expect(SKILL_BODY).toMatch(/Do not treat `decisions\.md` as a plan/)
    expect(SKILL_BODY).toMatch(/Recap from `decisions\.md`/)
  })
})
