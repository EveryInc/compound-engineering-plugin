import { existsSync, readdirSync, readFileSync, statSync } from "fs"
import path from "path"
import { Glob } from "bun"
import { describe, expect, test } from "bun:test"
import { parseFrontmatter } from "../../src/utils/frontmatter"
import { extractBashBlocks } from "./fenced-blocks"

const SKILLS_ROOT = path.join(process.cwd(), "skills")
const SKILL_DIR = path.join(SKILLS_ROOT, "ce-prototype")
const SKILL_BODY = readFileSync(path.join(SKILL_DIR, "SKILL.md"), "utf8")
const PREVIEW_BODY = readFileSync(path.join(SKILL_DIR, "references/preview.md"), "utf8")
const ANNOTATION_LOOP_BODY = readFileSync(path.join(SKILL_DIR, "references/annotation-loop.md"), "utf8")
const CRAFT_FLOOR_BODY = readFileSync(path.join(SKILL_DIR, "references/craft-floor.md"), "utf8")
// Assert executed shell against the fenced blocks, never the whole file: a probe quoted in
// explanatory prose would otherwise satisfy every guard while no command actually runs.
const PREVIEW_SHELL = extractBashBlocks(PREVIEW_BODY)
  .map((block) => block.body)
  .join("\n")

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
      ...ANNOTATION_LOOP_BODY.matchAll(/`((?:references|scripts)\/[^`]+)`/g),
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
    expect(ANNOTATION_LOOP_BODY).toMatch(/SKILL_DIR="[^"]+";/)
    expect(PREVIEW_BODY).not.toContain("${CLAUDE_SKILL_DIR}")
    expect(ANNOTATION_LOOP_BODY).not.toContain("${CLAUDE_SKILL_DIR}")
    expect(SKILL_BODY).not.toContain("${CLAUDE_SKILL_DIR}")
    expect(ANNOTATION_LOOP_BODY).toMatch(/light-webserver\.js" wait --root/)
    // A yielded or backgrounded wait is still outstanding; the turn must not end on it.
    expect(ANNOTATION_LOOP_BODY).toMatch(/do not end the turn while a wait is parked/)
    expect(ANNOTATION_LOOP_BODY).toMatch(/Chat is valid only after wait has returned or cannot run/)
    expect(ANNOTATION_LOOP_BODY).not.toMatch(/explorer writing in chat/)
    expect(PREVIEW_BODY).toMatch(/start --root "\$PROTO_DIR" --annotate/)
    expect(
      /hand the explorer the helper's returned URL with only the host rewritten/.test(PREVIEW_BODY),
      "A remote handoff rewrites only the host. The explorer URL is origin-only; visiting that origin sets the session cookie.",
    ).toBe(true)
    expect(PREVIEW_BODY).toMatch(/Do not also hand localhost/)
    expect(PREVIEW_BODY).toMatch(/Do not print the token/)
    expect(PREVIEW_BODY).toMatch(/Wait talks the bind address with the file token/)
    expect(ANNOTATION_LOOP_BODY).toMatch(/Annotate pins a note/)
    expect(ANNOTATION_LOOP_BODY).toMatch(/Ctrl\+A freezes hover/)
    expect(ANNOTATION_LOOP_BODY).toMatch(/Esc or Ctrl\+A again turns annotate off/)
    expect(ANNOTATION_LOOP_BODY).toMatch(/End session hands the conversation back/)
    expect(ANNOTATION_LOOP_BODY).toMatch(/Send to agent delivers the current notes as one batch/)
    expect(ANNOTATION_LOOP_BODY).toMatch(/Reason over the whole batch together/)
    // A returned batch is not an automatic edit or a close of the question.
    // Only a clear screen edit iterates in place; everything else is chat, and
    // taking an avenue out of play does not pick the leftover or start the next variant.
    expect(ANNOTATION_LOOP_BODY).toMatch(/Apply only the notes that are a clear screen edit/)
    expect(ANNOTATION_LOOP_BODY).toMatch(/not a new numbered file/)
    expect(ANNOTATION_LOOP_BODY).toMatch(/Everything else in the batch is a conversation in chat/)
    expect(ANNOTATION_LOOP_BODY).toMatch(/answer a question they asked/)
    expect(ANNOTATION_LOOP_BODY).toMatch(/ask when a change would be a guess/)
    expect(ANNOTATION_LOOP_BODY).toMatch(/Taking an avenue out of play does not pick the leftover/)
    expect(ANNOTATION_LOOP_BODY).toMatch(/does not start the next variant/)
    expect(ANNOTATION_LOOP_BODY).toMatch(/[Dd]o not park a wait while a question you asked is unanswered/)
    expect(ANNOTATION_LOOP_BODY).toMatch(/must not be executed as a command/)
    expect(ANNOTATION_LOOP_BODY).not.toMatch(/treated as apply/)
    expect(ANNOTATION_LOOP_BODY).toMatch(/JSON array of annotation records/)
    expect(ANNOTATION_LOOP_BODY).toMatch(/Wait returns session-ended only after every posted pin has been delivered/)
    expect(PREVIEW_BODY).not.toMatch(/no browser-to-agent event path/)
    expect(ANNOTATION_LOOP_BODY).not.toMatch(/no browser-to-agent event path/)
    expect(SKILL_BODY).toContain("`references/annotation-loop.md`")
    expect(PREVIEW_BODY).toContain("`references/annotation-loop.md`")
    // Closed-set seams: Fable 5.1 goes quiet in long tool chains; Opus 5
    // narrates by default. One condition pulls both — required and exclusive —
    // without a model check. Do not import either vendor's progress slogan.
    expect(SKILL_BODY).toMatch(/speak only when they can act on something new/)
    expect(SKILL_BODY).toMatch(/one short line naming what happened/)
    expect(ANNOTATION_LOOP_BODY).toMatch(/Say nothing while a wait is parked/)
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
      /the user settled the questions that needed an artifact/i.test(spine),
      "Done must sit in the spine and name the user as the one who settles. A passive 'the questions are decided' lets a batch look like a chance to finish the run.",
    ).toBe(true)
    expect(
      /their choice is the settlement, not a direction you inferred/i.test(spine),
      "Done must say that an inferred direction is not settlement. Without that, Result/Done compete with 'the user settles' and a rejected avenue gets closed into a winner.",
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
      /references\/scoping\.md/.test(CRAFT_FLOOR_BODY),
      "The avenue rule must cite the wide-run rule where it lives (references/scoping.md) rather than restating it — two independent copies drift.",
    ).toBe(true)
  })

  test("prototypes default to the durable in-repo directory", () => {
    for (const [label, body] of [
      ["SKILL.md", SKILL_BODY],
      ["references/preview.md", PREVIEW_BODY],
    ] as const) {
      expect(
        body.includes(".context/compound-engineering/ce-prototype/"),
        `${label} must name the durable run root. A prototype the next skill is told to read cannot live only where the OS may reap it.`,
      ).toBe(true)
      expect(
        /\/tmp\/compound-engineering-/.test(body),
        `${label} must still name the OS-temp root, which is the fallback when the durable path is declined, unsafe, or outside a repository.`,
      ).toBe(true)
    }
    // The durable path must be the taken branch and temp the fallback, not the reverse.
    const durableBranch = PREVIEW_SHELL.indexOf('ROOT="$REPO_ROOT/.context/compound-engineering"')
    const fallbackBranch = PREVIEW_SHELL.indexOf('ROOT="$TEMP_ROOT"')
    expect(durableBranch, "The executed block must assign the durable root.").toBeGreaterThan(-1)
    expect(fallbackBranch, "The executed block must assign the OS-temp fallback root.").toBeGreaterThan(-1)
    const resolutionOrder = durableBranch < fallbackBranch
    expect(
      resolutionOrder,
      "The executed block must reach for the durable root before the temp fallback. Swapping the branches would still mention both paths while inverting the default.",
    ).toBe(true)
    const storageRule = (SKILL_BODY.match(/^.*Build under.*$/m) ?? [""])[0]
    expect(storageRule, "SKILL.md must state where a run builds.").not.toBe("")
    expect(
      storageRule.indexOf(".context/compound-engineering/") <
        storageRule.indexOf("/tmp/compound-engineering-"),
      "The durable path must be stated as the default and OS temp as the fallback. Reversing them still mentions both paths while inverting the rule.",
    ).toBe(true)
  })

  test("the run root is resolved once and consumed by every server call", () => {
    // The server keys its pidfile and process match off --root, so a start and a
    // stop that resolve the root separately can disagree and orphan a server.
    const resolutions = PREVIEW_SHELL.match(/git rev-parse --show-toplevel/g) ?? []
    expect(
      resolutions.length,
      "references/preview.md must resolve the run root in exactly one block. A second derivation is a second chance to disagree with the first.",
    ).toBe(1)
    const consumers = PREVIEW_SHELL.match(/PROTO_DIR="<absolute question directory/g) ?? []
    expect(
      consumers.length,
      "The start block and the status/stop block must each take the already-resolved question directory rather than deriving it again.",
    ).toBeGreaterThanOrEqual(2)
  })

  test("the durable path is probed with the trailing slash and claimed atomically", () => {
    // Both prose and executed shell anchor the probe to the repo root; accept either spelling
    // of that anchor, but require the trailing slash in both.
    const probe = /git (?:-C [^\n]{0,24})?check-ignore -q \.context\/compound-engineering\//
    expect(
      probe.test(SKILL_BODY) && probe.test(PREVIEW_SHELL),
      "Both files must probe coverage with the trailing slash. Without it an existing directory-only ignore rule is missed and a correctly configured repo falls back for no reason.",
    ).toBe(true)
    expect(
      /never test whether the name is free and then write/i.test(PREVIEW_BODY),
      "The collision rule must be exclusive creation, not check-then-write — two runs starting together both pass the check and then write into one directory.",
    ).toBe(true)
    expect(
      /unsafe root symlink/.test(PREVIEW_SHELL) &&
        /root is not owned by the current user/.test(PREVIEW_SHELL),
      "The run root must carry symlink and ownership checks inside the executed block; gitignoring a path does not make it safe to write into.",
    ).toBe(true)
  })

  test("the scratch ignore entry is one literal across both writers", () => {
    // Two skills can append this line and skill isolation forbids sharing a
    // file, so nothing but this guard stops them drifting into two entries
    // that both satisfy check-ignore and accumulate as separate lines.
    const IGNORE_ENTRY = ".context/compound-engineering/"
    // Corpus grep across ce-setup: the offer is a Phase 2 mechanic, which lives in the
    // reference ce-setup requires before any repo-local write.
    const setupBody = [
      readFileSync(path.join(SKILLS_ROOT, "ce-setup", "SKILL.md"), "utf8"),
      readFileSync(path.join(SKILLS_ROOT, "ce-setup", "references", "repo-fixes.md"), "utf8"),
    ].join("\n")
    expect(
      setupBody.includes("```text\n" + IGNORE_ENTRY + "\n```"),
      "ce-setup must offer the scratch ignore entry as exactly this literal.",
    ).toBe(true)
    expect(
      SKILL_BODY.includes("check-ignore -q " + IGNORE_ENTRY),
      "ce-prototype must probe the identical literal it would ask ce-setup's user to add.",
    ).toBe(true)
    expect(
      PREVIEW_SHELL.includes("check-ignore -q " + IGNORE_ENTRY),
      "The resolution block must probe that same literal in executed shell, so the path it picks matches the path the offer covers.",
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
