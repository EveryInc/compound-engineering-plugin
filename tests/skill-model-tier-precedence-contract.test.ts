import { readdir, readFile } from "fs/promises"
import path from "path"
import { describe, expect, test } from "bun:test"

/**
 * Issue #1875: a file that tells the agent which model tier to pass on
 * subagent dispatch must also say what wins when instructions or a configured
 * model already name one. The detector is the emission, not a hand-maintained
 * file list alone — a new "cheapest capable model" / `model: "haiku"` line
 * fails until it carries the same sentence.
 *
 * Not emitters, on purpose: reasoning-elevation (live intent, then a caller
 * carrier, then config; no skill default tier), cross-model peer prose (the
 * script owns the id and already accepts cross_model_model / cross_model_effort),
 * and rationale that only points at another file's tiers.
 */
const repoRoot = process.cwd()
const skillsRoot = path.join(repoRoot, "skills")

const PRECEDENCE_SENTENCE =
  "If the user's or project's active instructions or the live prompt name a model for this subagent, use that model instead of the default tier above. They can name it by the subagent's tier, by its prompt-asset name, or for the subagents being dispatched. Without such an instruction, a model configured for this subagent's role takes precedence over the default tier."

const TIER_OVERRIDE_PATTERNS = [
  /cheapest capable model/,
  /balanced mid-tier model/,
  /platform's mid-tier model/,
  /platform mid-tier model/,
  /mid-tier model class/,
  /model:\s*"haiku"/,
  /model:\s*"sonnet"/,
  /model:\s*"opus"/,
  /established cheaper capable tier/,
  /established high-capability review tier/,
  /inherits? the session model/,
]

const EXPECTED_EMITTERS = [
  "skills/ce-brainstorm/references/model-tiers.md",
  "skills/ce-code-review/references/dispatch-reviewers.md",
  "skills/ce-code-review/references/finish-input.md",
  "skills/ce-code-review/references/scope.md",
  "skills/ce-compound/references/grounding-validation.md",
  "skills/ce-doc-review/references/dispatch.md",
  "skills/ce-explain/references/orchestration.md",
  "skills/ce-ideate/references/grounding.md",
  "skills/ce-plan/references/research.md",
  "skills/ce-plan/references/universal-planning.md",
  "skills/ce-pov/references/grounding.md",
  "skills/ce-simplify-code/SKILL.md",
  "skills/ce-sweep/references/model-tiers.md",
]

function proseOnly(markdown: string): string {
  return markdown.replace(/```[\s\S]*?```/g, "")
}

async function markdownFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true })
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const absolute = path.join(root, entry.name)
      if (entry.isDirectory()) return markdownFiles(absolute)
      return entry.isFile() && entry.name.endsWith(".md") ? [absolute] : []
    }),
  )
  return nested.flat()
}

async function tierOverrideEmitters(): Promise<string[]> {
  const files = await markdownFiles(skillsRoot)
  const matched = await Promise.all(
    files.map(async (file) => {
      const prose = proseOnly(await readFile(file, "utf8"))
      return TIER_OVERRIDE_PATTERNS.some((pattern) => pattern.test(prose))
        ? path.relative(repoRoot, file)
        : null
    }),
  )
  return matched.filter((file): file is string => file !== null).sort()
}

describe("subagent model-tier precedence (#1875)", () => {
  test("every file that sets a subagent model tier states what outranks it", async () => {
    const emitters = await tierOverrideEmitters()
    expect(emitters).toEqual(EXPECTED_EMITTERS)

    const missing: string[] = []
    for (const relative of emitters) {
      const prose = proseOnly(await readFile(path.join(repoRoot, relative), "utf8"))
      if (!prose.includes(PRECEDENCE_SENTENCE)) missing.push(relative)
    }
    expect(missing).toEqual([])
  })

  test("ce-code-review does not call the tier override a correctness guarantee", async () => {
    const files = await markdownFiles(skillsRoot)
    const guaranteeHits: string[] = []
    for (const file of files) {
      const prose = proseOnly(await readFile(file, "utf8"))
      if (prose.includes("correctness guarantee") || prose.includes("deterministic function of the persona")) {
        guaranteeHits.push(path.relative(repoRoot, file))
      }
    }
    expect(guaranteeHits).toEqual([])

    const dispatch = await readFile(
      path.join(repoRoot, "skills/ce-code-review/references/dispatch-reviewers.md"),
      "utf8",
    )
    expect(dispatch).toContain("Model override at dispatch time")
    expect(dispatch).toContain(PRECEDENCE_SENTENCE)
    expect(dispatch).toContain(
      "Following a named model is not a missed override, and neither is a model configured for this subagent's role.",
    )
  })
})
