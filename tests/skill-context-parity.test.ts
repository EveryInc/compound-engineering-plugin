import { execFileSync } from "child_process"
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
    // Without this carve-out, a pre-launch argument rejection reads as a failed
    // pass and burns the workflow's inline fallback instead of being corrected.
    expect(body).toContain("correctable invocation error")
    // Ten of the fifteen skills carry no local backpressure prose, so this
    // exclusion is their only guard against a capacity error being "corrected"
    // and retried once instead of staying queued.
    expect(body).toContain("capacity or active-agent-limit rejection is not malformed")
    expect(body).toContain("HARNESS_ATTRIBUTION:")
    expect(body).toContain("AUTONOMY_DIRECTIVE_CHECK:")
    expect(body).toContain("INDEPENDENCE_ACCOUNTING:")
    expect(body).toContain("CE_CONTEXT_END")
  })

  test("the emitted output keeps the header first and CE_CONTEXT_END last", () => {
    // Source presence is not delivery: field transcripts show the fence being
    // piped through `head`/`tail`, silently dropping directives. Truncation
    // detection in the Setup prose depends on this exact emission order, so
    // pin the emitted shape, not just the source.
    const out = execFileSync(
      process.execPath,
      [path.join(PLUGIN_ROOT, "ce-plan", "scripts", "context.mjs")],
      { encoding: "utf8" },
    )
    const lines = out.trim().split("\n")
    expect(lines[0]).toBe("=== skill context (follow these directives; if CE_CONTEXT_END is missing below, rerun this script once; otherwise do not rerun) ===")
    expect(lines[lines.length - 1]).toBe("CE_CONTEXT_END")
    expect(out).toContain("SUBAGENT_AUTHORIZATION:")
    // Emitted, not merely present: the source pin above would still pass if the
    // carve-out were demoted into a comment and never reached the model.
    expect(out).toContain("correctable invocation error")
    expect(out).toContain("capacity or active-agent-limit rejection is not malformed")
  })

  for (const skill of DISPATCH_SKILLS) {
    test(`${skill} invokes context.mjs through the SKILL_DIR anchor`, async () => {
      const body = await readFile(path.join(PLUGIN_ROOT, skill, "SKILL.md"), "utf8")
      expect(body).toContain('SKILL_DIR="<absolute path of the directory containing the SKILL.md you just read>";')
      expect(body).toContain('"$SKILL_DIR/scripts/context.mjs"')
      // Never hardcode an interpreter: probe execution, not presence.
      expect(body).not.toMatch(/\bnode "\$SKILL_DIR\/scripts\/context\.mjs"/)
      // The anti-rewrite rule and integrity check guard directive delivery.
      expect(body).toContain("Run the fence exactly as written")
      expect(body).toContain("ends with `CE_CONTEXT_END`")
    })
  }
})
