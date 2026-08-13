import { readFile, access } from "fs/promises"
import path from "path"
import { describe, expect, test } from "bun:test"

const PLUGIN_ROOT = path.join(process.cwd(), "skills")

// Both vocabulary references are byte-duplicated into every consuming skill
// (the plugin has no cross-skill import mechanism -- see AGENTS.md "File
// References in Skills"). All copies must stay identical. Adding a consumer is
// one entry here plus the duplicated file in that skill.
//
// `domain-vocabulary.md` decides WHICH file a vocabulary read or write targets;
// `concepts-vocabulary.md` decides HOW an entry is written once the target is
// chosen. They have different consumer sets: only writers need the routing
// contract, while seeding/accretion rules are shared by the two compound skills.
const SHARED_ASSETS: Array<{ asset: string; consumers: string[] }> = [
  {
    asset: "references/domain-vocabulary.md",
    consumers: ["ce-compound-refresh", "ce-compound", "ce-brainstorm", "ce-plan"],
  },
  {
    asset: "references/concepts-vocabulary.md",
    consumers: ["ce-compound-refresh", "ce-compound"],
  },
]

// The canonical copy every other copy is propagated from.
const CANONICAL_SKILL = "ce-compound-refresh"

async function readCanonical(asset: string): Promise<string> {
  return readFile(path.join(PLUGIN_ROOT, CANONICAL_SKILL, asset), "utf8")
}

describe("domain vocabulary shared-asset parity", () => {
  for (const { asset, consumers } of SHARED_ASSETS) {
    test(`${asset} exists in every consumer and is byte-identical`, async () => {
      const contents = await Promise.all(
        consumers.map(async (skill) => {
          const p = path.join(PLUGIN_ROOT, skill, asset)
          await access(p) // fails the test if a consumer is missing the copy
          return readFile(p, "utf8")
        }),
      )
      for (let i = 1; i < contents.length; i++) {
        expect(contents[i]).toBe(contents[0])
      }
    })

    test(`${asset} is propagated from the canonical ${CANONICAL_SKILL} copy`, async () => {
      expect(consumers).toContain(CANONICAL_SKILL)
    })
  }
})

// Byte-parity alone would let every copy drift together. These pins are the
// smallest falsifiable units of the routing contract: the sentinel, the slug
// allowlist, the collision branch, the writers' script-free legacy check, both
// blocked-state messages, and the migration route they point at.
describe("domain-vocabulary contract pins", () => {
  const asset = "references/domain-vocabulary.md"

  test("pins the structural sentinel and the composed context path", async () => {
    const canonical = await readCanonical(asset)
    expect(canonical).toContain("## Contexts")
    expect(canonical).toContain("<docs-root>/contexts/<slug>/CONCEPTS.md")
  })

  test("pins the context slug allowlist", async () => {
    const canonical = await readCanonical(asset)
    expect(canonical).toContain("^[a-z0-9]+(-[a-z0-9]+)*$")
  })

  test("pins the collision branch for an unparseable Contexts section", async () => {
    const canonical = await readCanonical(asset)
    expect(canonical).toContain("collision")
    expect(canonical).toContain("Never reinterpret an unparseable section as an index.")
  })

  test("pins the writers' script-free legacy check", async () => {
    const canonical = await readCanonical(asset)
    expect(canonical).toContain("CONTEXT-MAP.md")
    expect(canonical).toContain("no script")
  })

  test("pins both blocked-state messages and the migration route", async () => {
    const canonical = await readCanonical(asset)
    expect(canonical).toContain("Dual-canonical vocabulary:")
    expect(canonical).toContain("Legacy vocabulary only:")
    expect(canonical).toContain("migrate-domain-docs")
  })

  test("pins governed shared vocabulary as the only root-write exception", async () => {
    const canonical = await readCanonical(asset)
    expect(canonical).toContain("Shared vocabulary")
    expect(canonical).toContain("explicit user approval")
  })

  test("pins atomic capture across multiple glossaries", async () => {
    const canonical = await readCanonical(asset)
    expect(canonical).toContain("all-or-nothing")
  })

  test("declares no configurable vocabulary mode", async () => {
    const canonical = await readCanonical(asset)
    // The protocol switches on document structure, never on config. A mode key
    // reappearing here would silently reintroduce the rejected design.
    expect(canonical).not.toContain("domain_vocabulary_mode")
    expect(canonical).toContain("Nothing configures this")
  })

  test("recognizes a sibling DOMAIN.md as non-blocking and non-lexical", async () => {
    const canonical = await readCanonical(asset)
    // Without this section, a legal sibling domain-truth file is
    // indistinguishable from a second vocabulary authority; with a weaker
    // one, DOMAIN.md quietly becomes a second glossary.
    expect(canonical).toContain("## Sibling domain-truth files")
    expect(canonical).toContain("not a vocabulary authority and never raises a blocked state")
    expect(canonical).toContain("It must not define terms.")
    expect(canonical).toContain("domain-defines-terms")
    expect(canonical).toContain("this protocol neither requires nor creates it")
  })
})

// The four learnings-researcher prompt assets are not byte-identical overall --
// each carries its caller's own invocation contract -- but their "Step 0"
// grounding block is shared wording that must not drift, so parity is scoped to
// that section rather than the whole file.
const LEARNINGS_RESEARCHERS = [
  "ce-code-review/references/personas/learnings-researcher.md",
  "ce-plan/references/agents/learnings-researcher.md",
  "ce-ideate/references/agents/learnings-researcher.md",
  "ce-optimize/references/agents/learnings-researcher.md",
]

const STEP_ZERO_HEADING = "## Step 0: Ground in CONCEPTS.md"

function extractStepZero(source: string): string {
  const start = source.indexOf(STEP_ZERO_HEADING)
  if (start === -1) return ""
  const rest = source.slice(start + STEP_ZERO_HEADING.length)
  const nextHeading = rest.indexOf("\n## ")
  return nextHeading === -1 ? rest : rest.slice(0, nextHeading)
}

describe("learnings-researcher Step 0 grounding parity", () => {
  test("the Step 0 block is identical across all four prompt assets", async () => {
    const blocks = await Promise.all(
      LEARNINGS_RESEARCHERS.map(async (rel) => {
        const source = await readFile(path.join(PLUGIN_ROOT, rel), "utf8")
        const block = extractStepZero(source)
        expect(block).not.toBe("") // a missing Step 0 heading fails here
        return block
      }),
    )
    for (let i = 1; i < blocks.length; i++) {
      expect(blocks[i]).toBe(blocks[0])
    }
  })

  test("the Step 0 block routes to context glossaries", async () => {
    const source = await readFile(path.join(PLUGIN_ROOT, LEARNINGS_RESEARCHERS[0]), "utf8")
    const block = extractStepZero(source)
    expect(block).toContain("parseable `## Contexts` index")
    expect(block).toContain("qualified by its context")
  })
})

describe("reader skills resolve context glossaries", () => {
  const READERS = ["ce-explain/SKILL.md", "ce-ideate/SKILL.md"]

  for (const rel of READERS) {
    test(`${rel} carries the contexts-aware clause exactly once`, async () => {
      const source = await readFile(path.join(PLUGIN_ROOT, rel), "utf8")
      const matches = source.match(/parseable `## Contexts` index/g) ?? []
      expect(matches).toHaveLength(1)
    })
  }
})

describe("concepts-vocabulary context awareness", () => {
  const asset = "references/concepts-vocabulary.md"

  test("defers target selection to the routing contract", async () => {
    const canonical = await readCanonical(asset)
    expect(canonical).toContain("domain-vocabulary.md")
  })

  test("keeps cross-context polysemes as distinct entries", async () => {
    const canonical = await readCanonical(asset)
    expect(canonical).toContain("are not duplicates")
  })
})
