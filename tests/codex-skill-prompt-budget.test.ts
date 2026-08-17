import { describe, expect, test } from "bun:test"
import { readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"
import { parseFrontmatter } from "../src/utils/frontmatter"

/**
 * Codex >= 0.147 (openai/codex#37027) classifies a plugin as an Agent Plugin when the
 * root `plugin.json` carries an `https://agent-plugins.org/schemas/...` `$schema`, and
 * then injects only the first MAX_SKILL_PROMPT_BYTES (8000) of each SKILL.md into the
 * model-visible prompt (#1412). Legacy manifests (`.codex-plugin/plugin.json`) are exempt.
 *
 * oh-my-pi >= 17.3 (#1411) routes on the same `$schema` prefix to a strict provider that
 * rejects any SKILL.md whose frontmatter has a key outside the Agent Skills closed set or a
 * non-string `allowed-tools`; 30 of 33 skills fail that today and silently vanish.
 *
 * So the root manifest must not carry that `$schema` until BOTH hold: every skill entrypoint
 * fits the byte bound, and every skill's frontmatter is Agent Skills-conformant. Shrink
 * OVER_BUDGET as skills are restructured; the `$schema` may return only when both are clear.
 */
const CODEX_MAX_SKILL_PROMPT_BYTES = 8_000
const AGENT_PLUGINS_SCHEMA_PREFIX = "https://agent-plugins.org/schemas/"
/** Agent Skills closed frontmatter field set, as enforced by skills-ref and omp. */
const AGENT_SKILLS_FRONTMATTER_KEYS = new Set([
  "name",
  "description",
  "license",
  "compatibility",
  "metadata",
  "allowed-tools",
])

/**
 * Skills known to exceed the bound. Membership is a set on purpose: an over-budget skill is
 * already truncated on Codex, so its exact size is not pinned and ordinary edits do not churn
 * this list. Remove a name once its SKILL.md fits; never add one for a new skill.
 */
const OVER_BUDGET = new Set([
  "ce-babysit-pr",
  "ce-brainstorm",
  "ce-code-review",
  "ce-commit-push-pr",
  "ce-compound",
  "ce-compound-refresh",
  "ce-debug",
  "ce-doc-review",
  "ce-dogfood",
  "ce-explain",
  "ce-handoff",
  "ce-ideate",
  "ce-optimize",
  "ce-plan",
  "ce-pov",
  "ce-product-pulse",
  "ce-proof",
  "ce-prototype",
  "ce-resolve-pr-feedback",
  "ce-retune",
  "ce-setup",
  "ce-strategy",
  "ce-sweep",
  "ce-test-browser",
  "ce-work",
  "lfg",
])

const repoRoot = path.join(import.meta.dir, "..")
const skillsDir = path.join(repoRoot, "skills")

/** Byte size as a Windows checkout with CRLF line endings would inject it. */
function crlfByteSize(contents: string): number {
  const lf = contents.replace(/\r\n/g, "\n")
  return Buffer.byteLength(lf, "utf8") + (lf.match(/\n/g)?.length ?? 0)
}

/** Why a SKILL.md's frontmatter would be rejected by a strict Agent Skills client, or null. */
function frontmatterNonconformance(contents: string): string | null {
  const { data } = parseFrontmatter(contents)
  const keys = Object.keys(data)
  if (keys.length === 0) return "missing frontmatter"
  const unknown = keys.filter((key) => !AGENT_SKILLS_FRONTMATTER_KEYS.has(key))
  if (unknown.length > 0) return `unknown key(s): ${unknown.join(", ")}`
  if ("allowed-tools" in data && typeof data["allowed-tools"] !== "string") {
    return "allowed-tools is not a string"
  }
  return null
}

function skillSizes(): Map<string, number> {
  const sizes = new Map<string, number>()
  for (const name of readdirSync(skillsDir)) {
    const file = path.join(skillsDir, name, "SKILL.md")
    if (!statSync(path.join(skillsDir, name)).isDirectory()) continue
    try {
      sizes.set(name, crlfByteSize(readFileSync(file, "utf8")))
    } catch {
      // no SKILL.md; other tests own that invariant
    }
  }
  return sizes
}

describe("Codex skill prompt budget (#1412)", () => {
  const sizes = skillSizes()

  test("no skill newly exceeds Codex's 8000-byte prompt bound (CRLF-adjusted)", () => {
    const violations: string[] = []
    for (const [name, size] of sizes) {
      if (size > CODEX_MAX_SKILL_PROMPT_BYTES && !OVER_BUDGET.has(name)) {
        violations.push(`${name}: ${size} bytes > ${CODEX_MAX_SKILL_PROMPT_BYTES}`)
      }
    }
    expect(violations).toEqual([])
  })

  test("OVER_BUDGET only lists skills that still exceed the bound (ratchet down)", () => {
    const stale = [...OVER_BUDGET].filter(
      (name) => (sizes.get(name) ?? 0) <= CODEX_MAX_SKILL_PROMPT_BYTES,
    )
    expect(stale).toEqual([])
  })

  test("root plugin.json omits the Agent Plugins $schema while any skill is over budget or non-conformant", () => {
    const manifest = JSON.parse(
      readFileSync(path.join(repoRoot, "plugin.json"), "utf8"),
    ) as Record<string, unknown>
    const schema = typeof manifest.$schema === "string" ? manifest.$schema : ""
    const blockers: string[] = []
    for (const [name, size] of sizes) {
      if (size > CODEX_MAX_SKILL_PROMPT_BYTES) blockers.push(`${name}: ${size} bytes`)
      const why = frontmatterNonconformance(
        readFileSync(path.join(skillsDir, name, "SKILL.md"), "utf8"),
      )
      if (why) blockers.push(`${name}: ${why}`)
    }
    if (blockers.length > 0) {
      expect(
        schema.startsWith(AGENT_PLUGINS_SCHEMA_PREFIX),
        `$schema present but blocked by:\n${blockers.join("\n")}`,
      ).toBe(false)
    }
  })

  test("frontmatter predicate rejects any non-string allowed-tools spelling", () => {
    const fm = (yaml: string) => `---\nname: x\ndescription: y\n${yaml}\n---\nbody\n`
    expect(frontmatterNonconformance(fm("allowed-tools: [Read, Write]"))).toBe(
      "allowed-tools is not a string",
    )
    expect(frontmatterNonconformance(fm("allowed-tools:\n  - Read"))).toBe(
      "allowed-tools is not a string",
    )
    expect(frontmatterNonconformance(fm("allowed-tools: null"))).toBe(
      "allowed-tools is not a string",
    )
    expect(frontmatterNonconformance(fm("allowed-tools: Read Write"))).toBeNull()
  })

  test("frontmatter predicate matches the strict-client rejection set", () => {
    const rejected = [...sizes.keys()].filter((name) =>
      frontmatterNonconformance(readFileSync(path.join(skillsDir, name, "SKILL.md"), "utf8")),
    )
    expect(rejected).toContain("ce-plan")
    expect(rejected).toContain("ce-setup")
    expect(rejected).toContain("ce-proof")
    expect(rejected).not.toContain("ce-commit")
    expect(rejected).not.toContain("ce-worktree")
  })
})
