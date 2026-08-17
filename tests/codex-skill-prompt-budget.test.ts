import { describe, expect, test } from "bun:test"
import { readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"

/**
 * Codex >= 0.147 (openai/codex#37027) classifies a plugin as an Agent Plugin when the
 * root `plugin.json` carries an `https://agent-plugins.org/schemas/...` `$schema`, and
 * then injects only the first MAX_SKILL_PROMPT_BYTES (8000) of each SKILL.md into the
 * model-visible prompt (#1412). Legacy manifests (`.codex-plugin/plugin.json`) are exempt.
 *
 * Until every skill entrypoint fits, the root manifest must not carry that `$schema`,
 * and no skill may newly cross the bound. Shrink OVER_BUDGET as skills are restructured;
 * when it is empty, the `$schema` may return.
 */
const CODEX_MAX_SKILL_PROMPT_BYTES = 8_000
const AGENT_PLUGINS_SCHEMA_PREFIX = "https://agent-plugins.org/schemas/"

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

  test("root plugin.json omits the Agent Plugins $schema while any skill is over budget", () => {
    const manifest = JSON.parse(
      readFileSync(path.join(repoRoot, "plugin.json"), "utf8"),
    ) as Record<string, unknown>
    const schema = typeof manifest.$schema === "string" ? manifest.$schema : ""
    const anyOverBudget = [...sizes.values()].some(
      (size) => size > CODEX_MAX_SKILL_PROMPT_BYTES,
    )
    if (anyOverBudget) {
      expect(schema.startsWith(AGENT_PLUGINS_SCHEMA_PREFIX)).toBe(false)
    }
  })
})
