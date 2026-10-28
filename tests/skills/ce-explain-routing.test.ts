import { readFileSync } from "fs"
import path from "path"
import { describe, expect, test } from "bun:test"

const ROOT = path.join(process.cwd(), "skills/ce-explain")
const read = (file: string) => readFileSync(path.join(ROOT, file), "utf8")
const body = read("SKILL.md")
const intake = read("references/intake.md")
const destinations = read("references/destinations.md")
const checkIn = read("references/check-in.md")
const html = read("references/explainer-html.md")
const markdown = read("references/explainer-markdown.md")

function phase(start: string, end?: string): string {
  const from = body.indexOf(start)
  expect(from).toBeGreaterThanOrEqual(0)
  if (!end) return body.slice(from)
  const to = body.indexOf(end, from)
  expect(to).toBeGreaterThan(from)
  return body.slice(from, to)
}

describe("ce-explain consumer contract", () => {
  test("understanding is distinct from judgment and caller identity does not select delivery", () => {
    expect(body).toContain("documented rationale, inference, and unknowns")
    expect(body).toContain("Do not infer the output from the caller's identity alone")
    expect(body).toContain("leave continuation to its owner")
    expect(body).toContain("Use `ce-pov` to judge")
    expect(body).toContain("return the unresolved question and its consequence")
  })

  test("artifact work is conditional before scratch creation and rendering", () => {
    expect(intake).toMatch(/Select delivery before creating a run directory/)
    expect(intake).toContain("selects the subject, not whether a document must be created")
    expect(phase("### Phase 2", "### Phase 3")).toMatch(/only when an artifact or an evidence dossier needs one/)
    expect(phase("### Phase 3", "### Phase 4")).toMatch(/return that content directly/)
    expect(body).not.toContain("mode:return-to-caller")
  })

  test("destinations are requested, and their adapter must be read before action", () => {
    expect(phase("### Phase 4")).toMatch(/destination was requested, read `references\/destinations.md` before acting/)
    expect(destinations).toMatch(/Do not require a menu/)
    for (const adapter of ["Publish a copy", "Local file"]) {
      expect(destinations).toContain(`## ${adapter}`)
    }
    expect(destinations).toContain("verify the resulting file, URL, or document reference")
    expect(destinations).toContain("Do not substitute another publisher without authorization")
  })

  test("the always-loaded body keeps the public-publishing stop class", () => {
    expect(phase("### Phase 4")).toContain("never headless and never inferred")
    expect(phase("### Phase 4")).toContain("do not publish; preserve the canonical file")
  })

  test("destination adapters execute through their owning capability", () => {
    expect(destinations).toContain("Hand a publisher the complete canonical file")
    expect(destinations).toContain("owns that adaptation; do not pre-process the file")
  })

  test("reader adaptation preserves accurate attribution without fixing voice or depth", () => {
    expect(intake).toContain("Someone preparing to speak from the explanation is still its reader")
    expect(intake).toContain("without changing the evidence or attributing others' work to the user")
    for (const renderer of [html, markdown]) {
      expect(renderer).toContain("consumer contract governs depth, voice, and layout")
      expect(renderer).not.toContain("No second person")
      expect(renderer).not.toContain("Same depth")
      expect(renderer).not.toContain("every explainer leads with something to look at")
    }
  })
})

describe("ce-explain preserved regressions", () => {
  test("input tokens do not consume ordinary prose", () => {
    expect(intake).toContain("If stripping it would garble the sentence, it was never a flag")
    expect(intake).toContain("A token in flag position beats inference. A colon inside prose does not.")
    expect(intake).toContain("a colon must not change the answer")
    expect(intake).toContain("never silently substitute that default for a window the user did name")
  })

  test("missing diff scopes cannot silently become another subject", () => {
    const grounding = phase("### Phase 2", "### Phase 3")
    expect(grounding).toContain("**Empty range**")
    expect(grounding).toContain("do not silently explain something else")
    expect(grounding).toContain("request permits it or the user agrees")
    expect(grounding).toContain("Otherwise return the unresolved scope to the caller")
  })

  test("recap evidence is independent of the main agent's initial narrative", () => {
    const grounding = phase("### Phase 2", "### Phase 3")
    expect(grounding).toContain("Do not pre-scan, count, or characterize the window")
    expect(grounding).toContain("dispatch a generic subagent directly")
    expect(grounding).toContain("harness exposes no subagent primitive")
    expect(grounding).toContain("run the scout inline")
    expect(grounding).toContain("form no view of the window until it is done")
    for (const renderer of [html, markdown]) expect(renderer).toContain("Never silently drop the tail")
  })

  test("teaching exercises never block the run (#1628)", () => {
    expect(checkIn).toContain("Check yourself")
    expect(checkIn).toContain("`Answers`")
    expect(checkIn).toContain("attempt every question before any answer is in view")
    expect(checkIn).toContain("request wins in both directions")
    const compose = phase("### Phase 3", "### Phase 4")
    expect(compose).toContain("never blocks on the check-in")
    expect(compose).toContain("inline summary plus the file path")
    const prefix = body.slice(0, body.indexOf("never blocks on the check-in"))
    expect(Buffer.byteLength(prefix.replace(/\r?\n/g, "\r\n"))).toBeLessThan(8000)
    for (const renderer of [html, markdown]) expect(renderer).toContain("questions first, then their answers")
  })

  test("standalone artifacts retain portability and metadata", () => {
    expect(html).toContain("exact field labels `Date`, `Input shape`, and `Subject`")
    expect(html).toContain("exactly one of `concept`, `diff`, `idea`, or `recap`")
    expect(html).toContain("labelled exactly `Rendered for`")
    expect(markdown).toContain("`rendered_for: <reader>`")
    expect(html).toContain("No companion `.css`, `.js`, or `.svg` files")
    expect(html).toContain("No external requests of any kind")
    expect(html).toContain("No forms, no click handlers, no interactive quizzes")
    expect(html).toContain("Class names and element IDs are ASCII-only")
    expect(html).toContain("Ordinary source hyperlinks are allowed")
    expect(markdown).toContain("No HTML elements")
    expect(markdown).toContain("Label every fenced code block with its language")
    expect(markdown).toContain("a host-specific file-and-line citation is not a language label")
    expect(markdown).toContain("when the request identifies another reader")
    for (const renderer of [html, markdown]) expect(renderer).toContain("a reader who skips them still gets the full explanation in text")
  })
})
