import { existsSync, readdirSync, readFileSync, statSync } from "fs"
import path from "path"
import { Glob } from "bun"
import { describe, expect, test } from "bun:test"
import { parseFrontmatter } from "../../src/utils/frontmatter"

const SKILLS_ROOT = path.join(process.cwd(), "skills")
const SKILL_DIR = path.join(SKILLS_ROOT, "ce-prototype")
const SKILL_BODY = readFileSync(path.join(SKILL_DIR, "SKILL.md"), "utf8")
const PREVIEW_BODY = readFileSync(path.join(SKILL_DIR, "references/preview.md"), "utf8")
const CRAFT_FLOOR_BODY = readFileSync(path.join(SKILL_DIR, "references/craft-floor.md"), "utf8")

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
    const body = parseFrontmatter(SKILL_BODY).body
    const firstSection = body.indexOf("\n## ")
    expect(
      firstSection,
      "SKILL.md must have at least one `## ` section heading. Without one the spine slice below silently widens to the whole document and this test degrades from a placement guard into a presence check.",
    ).toBeGreaterThan(-1)
    const spine = body.slice(0, firstSection)
    expect(
      /do not fake the dimension being tested/i.test(spine),
      "The organizing rule must sit in the spine, above the first section heading — not buried in a later section. Everything downstream (modality, fidelity, medium) derives from it, so it has to be read before any of them.",
    ).toBe(true)
    expect(
      /(modality|fidelity|medium)[^.]{0,120}\b(follow|follows|derive|derives)\b[^.]{0,60}\b(from|that one rule|that rule)\b/i.test(
        spine,
      ),
      "The derivation must sit in the spine beside the rule it derives from. If modality, fidelity, and medium read as independent axes again, the skill re-collapses into a drive-only prototype tool and a question settled by seeing goes uncovered.",
    ).toBe(true)
  })

  test("web is the default substrate regardless of the product's stack", () => {
    // Bound the assertions to the sentence that states the rule. Matching the
    // keywords anywhere in the body lets a reversed default ("the product
    // stack, not the web") satisfy every check while inverting the invariant.
    const substrateRule = (SKILL_BODY.match(/[^.\n]*\bdefault substrate\b[^.\n]*/i) ?? [""])[0]
    expect(
      substrateRule,
      "SKILL.md must state a default-substrate rule. Without that floor, a run in a native or non-web repo builds in the product's own stack — the expensive path a throwaway prototype exists to avoid.",
    ).not.toBe("")
    expect(
      /\bdefault substrate\b[^.]{0,40}\bweb\b/i.test(substrateRule),
      "The default substrate must be stated positively as the web, in the sentence that names the rule.",
    ).toBe(true)
    expect(
      /\bnot the web\b|\bproduct(?:'s)? stack\b/i.test(substrateRule),
      "The default-substrate rule must not be negated or made product-stack-first — that reverses the floor while still mentioning every keyword this test looks for.",
    ).toBe(false)
    expect(
      /whatever the product is written in|regardless of[^.]{0,60}\b(product|implementation|stack|language|platform)\b/i.test(
        substrateRule,
      ),
      "The web default must be stated as decoupled from the product's implementation language or platform, not as a web-repo-only convenience.",
    ).toBe(true)
  })

  test("the craft-floor trigger is inline and gates on the seeing dimension", () => {
    // The trigger has to be readable from SKILL.md alone. A stub that only
    // names the file lets an agent skip the load and invent a floor, and a
    // trigger that lives inside the reference cannot fire before it is read.
    const loadLine = (SKILL_BODY.match(/^.*references\/craft-floor\.md.*$/m) ?? [""])[0]
    expect(
      loadLine,
      "SKILL.md must name references/craft-floor.md at the point the run decides how finished a seeing question has to get.",
    ).not.toBe("")
    expect(
      /settled by seeing/i.test(SKILL_BODY),
      "SKILL.md must state what makes a question settled by seeing. That classification is the trigger; stating it only in the reference means it never fires.",
    ).toBe(true)
    expect(
      /settled by driving[^.]{0,80}does not load/i.test(SKILL_BODY),
      "SKILL.md must state that a question settled by driving does not load the floor, so the floor cannot raise fidelity on a dimension nobody is judging.",
    ).toBe(true)
  })

  test("the craft floor states contrast thresholds in the correct direction", () => {
    const contrastRule = (CRAFT_FLOOR_BODY.match(/^.*4\.5:1.*$/m) ?? [""])[0]
    expect(
      contrastRule,
      "The craft floor must state a body-text contrast threshold. Without it the floor cannot catch the render that reads as a worse direction only because the text is unreadable.",
    ).not.toBe("")
    expect(
      /body[^.]{0,40}4\.5:1/i.test(contrastRule),
      "Body text must carry the 4.5:1 threshold, stated in the sentence that names it.",
    ).toBe(true)
    expect(
      /large[^.]{0,80}\b3:1/i.test(contrastRule),
      "Large text must carry the 3:1 threshold in that same sentence.",
    ).toBe(true)
    expect(
      /large[^.]{0,40}4\.5:1/i.test(contrastRule),
      "The thresholds must not be inverted onto large text — a reversed rule still mentions every ratio this test looks for.",
    ).toBe(false)
  })

  test("the craft floor scopes itself per dimension and judges specificity", () => {
    expect(
      /Apply only what the question puts in play/i.test(CRAFT_FLOOR_BODY),
      "The floor must scope its items to the dimensions the question reaches. Applying every item to every seeing run inflates a placement question past the dimension under test.",
    ).toBe(true)
    expect(
      /template|templated/i.test(CRAFT_FLOOR_BODY),
      "The floor must reject the templated arrangement. Judging only mechanical cleanliness passes the generic result this floor exists to catch.",
    ).toBe(true)
    expect(
      /organizing principle/i.test(CRAFT_FLOOR_BODY),
      "The floor must state that avenues differ by organizing principle, so a palette or typeface swap is not counted as a second avenue.",
    ).toBe(true)
    expect(
      /SKILL\.md/.test(CRAFT_FLOOR_BODY),
      "The avenue rule must cite the wide-run rule in SKILL.md rather than restating it — two independent copies drift.",
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
