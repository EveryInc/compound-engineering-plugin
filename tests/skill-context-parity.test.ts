import { readFile } from "fs/promises"
import path from "path"
import { describe, expect, test } from "bun:test"

const PLUGIN_ROOT = path.join(process.cwd(), "skills")

// context.mjs is byte-duplicated into every skill whose flows depend on
// subagent dispatch (the plugin has no cross-skill import mechanism — see
// AGENTS.md "File References in Skills"). All copies must stay identical.
// ce-resolve-pr-feedback is intentionally absent: it pins allowed-tools so it can
// run unattended without permission prompts, and its fixers provide parallelism
// rather than independence — so it applies approved fixes in-context instead.
const DISPATCH_SKILLS = [
  "ce-brainstorm",
  "ce-code-review",
  "ce-compound",
  "ce-compound-refresh",
  "ce-debug",
  "ce-doc-review",
  "ce-explain",
  "ce-ideate",
  "ce-optimize",
  "ce-plan",
  "ce-pov",
  "ce-retune",
  "ce-simplify-code",
  "ce-sweep",
  "ce-work",
]

describe("skill context shared-asset parity", () => {
  test("context.mjs exists in every dispatch skill and is byte-identical", async () => {
    const contents = await Promise.all(
      DISPATCH_SKILLS.map((skill) =>
        readFile(path.join(PLUGIN_ROOT, skill, "scripts", "context.mjs"), "utf8"),
      ),
    )
    for (let i = 1; i < contents.length; i++) {
      expect(contents[i]).toBe(contents[0])
    }
  })

  test("the directives the script exists to emit are present", async () => {
    const body = await readFile(
      path.join(PLUGIN_ROOT, "ce-plan", "scripts", "context.mjs"),
      "utf8",
    )
    // These tokens are the payload. Renaming one silently disarms the fix.
    expect(body).toContain("SUBAGENT_AUTHORIZATION:")
    expect(body).toContain("AUTONOMY_DIRECTIVE_CHECK:")
    expect(body).toContain("INDEPENDENCE_ACCOUNTING:")
  })

  for (const skill of DISPATCH_SKILLS) {
    test(`${skill} invokes context.mjs through the SKILL_DIR anchor`, async () => {
      const body = await readFile(path.join(PLUGIN_ROOT, skill, "SKILL.md"), "utf8")
      expect(body).toContain('SKILL_DIR="<absolute path of the directory containing the SKILL.md you just read>";')
      expect(body).toContain('"$SKILL_DIR/scripts/context.mjs"')
      // Never hardcode an interpreter: probe execution, not presence.
      expect(body).not.toMatch(/\bnode "\$SKILL_DIR\/scripts\/context\.mjs"/)
    })
  }
})
