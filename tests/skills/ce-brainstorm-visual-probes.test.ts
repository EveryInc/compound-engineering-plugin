import { existsSync, readFileSync } from "fs"
import path from "path"
import { describe, expect, test } from "bun:test"

const SKILL_PATH = path.join(
  process.cwd(),
  "skills/ce-brainstorm/SKILL.md",
)
const SKILL_BODY = readFileSync(SKILL_PATH, "utf8")

const VISUAL_PROBES_PATH = path.join(
  process.cwd(),
  "skills/ce-brainstorm/references/visual-probes.md",
)

describe("ce-brainstorm visual probes", () => {
  test("SKILL.md routes visual decisions through the visual-probes reference", () => {
    expect(
      existsSync(VISUAL_PROBES_PATH),
      "ce-brainstorm must ship a visual-probes reference for the display-only visual feedback contract.",
    ).toBe(true)

    const phase13Start = SKILL_BODY.indexOf("#### 1.3 Collaborative Dialogue")
    expect(phase13Start).toBeGreaterThan(-1)
    const phase13Region = SKILL_BODY.slice(phase13Start, phase13Start + 2500)

    expect(
      /visual-probes\.md/i.test(phase13Region),
      "Phase 1.3 must point agents at references/visual-probes.md when a decision would benefit from a visual artifact.",
    ).toBe(true)
    expect(
      /text.*visual|visual.*text/i.test(phase13Region),
      "Phase 1.3 must require a real text-vs-visual opt-in choice rather than silently starting a companion.",
    ).toBe(true)
  })

  test("SKILL.md exposes visual tripwires before the visual-probes reference is loaded", () => {
    const scopeStart = SKILL_BODY.indexOf("#### 0.3 Assess Scope")
    const dialogueStart = SKILL_BODY.indexOf("#### 1.3 Collaborative Dialogue")
    expect(scopeStart).toBeGreaterThan(-1)
    expect(dialogueStart).toBeGreaterThan(-1)

    const liveRoutingRegion = SKILL_BODY.slice(scopeStart, dialogueStart + 3000)

    expect(
      /drawing|canvas|visual editor|UI layout|interaction state/i.test(liveRoutingRegion),
      "The main skill body must expose domain tripwires for inherently visual work before relying on the visual-probes reference.",
    ).toBe(true)
    expect(
      /annotation|drawing tool|canvas drawing|freehand|straight|rectangular/i.test(liveRoutingRegion),
      "Generic drawing/canvas/annotation signals must be reachable from the main skill body without hard-coding one feature example.",
    ).toBe(true)
    expect(
      /before asking.*behavior|before asking.*shape|before.*shape.*behavior/i.test(liveRoutingRegion),
      "The visual probe offer must be a named gate before behavior/shape questions, not a subjective afterthought.",
    ).toBe(true)
    expect(
      /takes precedence over.*blocking-?question|blocking-?question.*yields|AskUserQuestion.*yield/i.test(liveRoutingRegion),
      "Shape/behavior visual decisions must explicitly override the default blocking-question path.",
    ).toBe(true)
    expect(
      /Use the platform's blocking question tool[^.]*text-vs-visual opt-in|Use the platform's blocking question tool[^.]*offer/i.test(
        liveRoutingRegion,
      ),
      "The text-vs-visual opt-in itself should use the platform's interactive question tool when available.",
    ).toBe(true)
    expect(
      /ASCII preview.*not.*satisf|preview.*not.*substitute/i.test(liveRoutingRegion),
      "ASCII previews in question choices must not satisfy the visual-probe offer for genuinely visual decisions.",
    ).toBe(true)
  })

  test("visual-probes reference keeps the browser display-only and chat-authoritative", () => {
    expect(existsSync(VISUAL_PROBES_PATH)).toBe(true)
    const body = readFileSync(VISUAL_PROBES_PATH, "utf8")

    expect(
      /display-only|display only/i.test(body),
      "visual probes must be display-only in v1.",
    ).toBe(true)
    expect(
      /feedback.*chat|chat.*feedback/i.test(body),
      "visual probes must keep feedback in chat.",
    ).toBe(true)
    expect(
      /after showing.*blocking question tool|blocking question tool.*after showing|post-artifact.*blocking question tool|artifact feedback.*blocking question tool/i.test(
        body,
      ),
      "After showing a visual artifact, bounded feedback choices should use the platform's interactive question tool when available.",
    ).toBe(true)
    expect(
      /no click|do not.*click|no event|do not.*event/i.test(body),
      "visual probes must explicitly avoid click tracking / event ingestion.",
    ).toBe(true)
    expect(
      /lowest|cheapest|low-fidelity|rough/i.test(body),
      "visual probes must steer agents toward cheap, low-fidelity decision sketches.",
    ).toBe(true)
    expect(
      /not.*prototype|not.*implementation|not.*design deliverable|not.*UI spec/i.test(body),
      "visual probes must distinguish decision sketches from implementation prototypes or final UI specs.",
    ).toBe(true)
  })

  test("visual-probes reference explains cross-platform launch modes", () => {
    expect(existsSync(VISUAL_PROBES_PATH)).toBe(true)
    const body = readFileSync(VISUAL_PROBES_PATH, "utf8")

    expect(
      /Claude Code|Claude desktop/i.test(body),
      "visual probes must name the Claude Code / desktop launch case.",
    ).toBe(true)
    expect(
      /Codex CLI|Codex app/i.test(body),
      "visual probes must name the Codex CLI / app launch case.",
    ).toBe(true)
    expect(
      /--foreground/i.test(body),
      "visual probes must document the --foreground fallback for platforms that reap detached processes.",
    ).toBe(true)
    expect(
      /terminal-only|no browser|text path/i.test(body),
      "visual probes must keep a terminal-only / no-browser text fallback.",
    ).toBe(true)
    expect(
      /0\.0\.0\.0|remote|container/i.test(body),
      "visual probes must cover remote/container localhost reachability.",
    ).toBe(true)
  })

  test("visual-probes helper path is resolved from the loaded skill directory", () => {
    expect(existsSync(VISUAL_PROBES_PATH)).toBe(true)
    const body = readFileSync(VISUAL_PROBES_PATH, "utf8")

    expect(body).not.toContain("<absolute-skill-dir>")
    expect(
      /loaded `ce-brainstorm` skill directory|`ce-brainstorm` `SKILL.md` you loaded|skill directory.*project CWD/i.test(body),
      "visual probes must tell agents to resolve the helper from the loaded skill directory, not from the project CWD.",
    ).toBe(true)
    expect(
      body.includes('node "$SKILL_DIR/scripts/visual-probe-server.js"'),
      "visual probes should invoke the helper via the SKILL_DIR anchor (the repo's Tier-3 executed-command convention), not a vague resolved-path placeholder.",
    ).toBe(true)
    expect(
      /SKILL_DIR="/.test(body),
      "visual probes must set SKILL_DIR to the loaded skill directory before invoking the helper.",
    ).toBe(true)
  })
})
