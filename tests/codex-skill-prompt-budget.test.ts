import { describe, expect, test } from "bun:test"
import { readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"

/**
 * Two shipping hosts route on a root `plugin.json` `$schema` under the Agent Plugins prefix,
 * and both break this plugin when they do:
 *
 * - Codex >= 0.147 (openai/codex#37027, #1412) injects only the first MAX_SKILL_PROMPT_BYTES
 *   (8000) of each Agent Plugin SKILL.md; 26 skills exceed that.
 * - oh-my-pi >= 17.3 (#1411) rejects any SKILL.md whose frontmatter has a key outside the
 *   Agent Skills closed set; the Claude Code keys `argument-hint` / `disable-model-invocation`
 *   are load-bearing, so 30 skills vanish. omp has no per-host override.
 *
 * So the root manifest stays schema-less unconditionally (docs/specs/agent-plugins.md); a
 * strict client that needs conformance gets a separately emitted package. Independently, no
 * new skill may cross Codex's byte bound, and OVER_BUDGET shrinks as skills are restructured.
 *
 * Provenance of the number (verified 2026-08-21): 8000 is Codex's MAX_SKILL_PROMPT_BYTES, NOT
 * an Agent Plugins requirement. The spec has no size limit of any kind, and the Agent Skills
 * spec it defers to constrains only frontmatter -- its body guidance ("< 5000 tokens", "under
 * 500 lines") is explicitly a recommendation. A second, independent host bound exists and is
 * deliberately not gated separately here: Claude Code auto-compaction re-attaches each invoked
 * skill keeping only its first 5,000 tokens, within a 25,000-token combined budget filled from
 * the most recently invoked (https://code.claude.com/docs/en/skills). 5,000 tokens is roughly
 * 20KB, so this 8000-byte ratchet is the tighter bound and subsumes it -- revisit only if that
 * ordering ever inverts. Both truncations keep the START of the file, which is why a body's
 * ordering is load-bearing: what must survive goes above what may be cut.
 */
const CODEX_MAX_SKILL_PROMPT_BYTES = 8_000
const AGENT_PLUGINS_SCHEMA_PREFIX = "https://agent-plugins.org/schemas/"

/**
 * Skills known to exceed the bound. Membership is a set on purpose: an over-budget skill is
 * already truncated on Codex's Agent Plugins path, so its exact size is not pinned and ordinary
 * edits do not churn this list. Remove a name once its SKILL.md fits; never add one for a new
 * skill. Emptying this set is a standing goal (the precondition for a conformant Agent Plugins
 * package), not a nice-to-have — see docs/solutions/skill-design/size-driven-skill-restructure.md
 * for the procedure that took ce-babysit-pr off it.
 */
const OVER_BUDGET = new Set([
  "ce-debug",
  "ce-explain",
])

const repoRoot = path.join(import.meta.dir, "..")
const skillsDir = path.join(repoRoot, "skills")

/** Byte size as a Windows checkout with CRLF line endings would inject it. */
function crlfByteSize(contents: string): number {
  const lf = contents.replace(/\r\n/g, "\n")
  return Buffer.byteLength(lf, "utf8") + (lf.match(/\n/g)?.length ?? 0)
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

  test("root plugin.json never carries an Agent Plugins $schema", () => {
    const manifest = JSON.parse(
      readFileSync(path.join(repoRoot, "plugin.json"), "utf8"),
    ) as Record<string, unknown>
    const schema = typeof manifest.$schema === "string" ? manifest.$schema : ""
    expect(schema.startsWith(AGENT_PLUGINS_SCHEMA_PREFIX)).toBe(false)
  })
})
