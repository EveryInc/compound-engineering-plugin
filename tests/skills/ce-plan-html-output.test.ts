import { readFileSync, statSync } from "fs"
import path from "path"
import { describe, expect, test } from "bun:test"

const root = process.cwd()
const skillPath = path.join(root, "plugins/compound-engineering/skills/ce-plan/SKILL.md")
const sharedPath = path.join(root, "plugins/compound-engineering/skills/_shared/html-output.md")
const templatePath = path.join(root, "plugins/compound-engineering/skills/ce-plan/references/html-plan-template.md")
const fixturePath = path.join(root, "tests/fixtures/ce-plan/sample-plan.html")

const skill = readFileSync(skillPath, "utf8")
const shared = readFileSync(sharedPath, "utf8")
const template = readFileSync(templatePath, "utf8")
const fixture = readFileSync(fixturePath, "utf8")

function extractScriptJson(html: string, id: string): unknown {
  const match = html.match(new RegExp(`<script type="application/json" id="${id}">([\\s\\S]*?)<\\/script>`))
  expect(match, `Missing JSON script with id="${id}"`).not.toBeNull()
  return JSON.parse(match![1].trim())
}

function countMatches(value: string, pattern: RegExp): number {
  return [...value.matchAll(pattern)].length
}

describe("ce-plan HTML output contract", () => {
  test("SKILL.md documents HTML flag parsing without changing markdown default", () => {
    expect(skill).toContain("`--html`")
    expect(skill).toContain("bare `html`")
    expect(skill).toContain("OUTPUT_FORMAT")
    expect(skill).toContain("references/html-plan-template.md")
    expect(skill).toContain("references/plan-template.md")
    expect(skill).toContain("docs/plans/YYYY-MM-DD-NNN-<type>-<descriptive-name>-plan.md")
    expect(skill).toContain("docs/plans/YYYY-MM-DD-NNN-<type>-<descriptive-name>-plan.html")
  })

  test("shared reference defines skeleton, CSS, frontmatter, anchors, SVG, and anti-bloat rules", () => {
    expect(shared).toContain("<!DOCTYPE html>")
    expect(shared).toContain("@media (prefers-color-scheme: dark)")
    expect(shared).toContain("@media (max-width: 768px)")
    expect(shared).toContain('type="application/json"')
    expect(shared).toContain("#u1")
    expect(shared).toContain("Data Flow")
    expect(shared).toContain("Sequence")
    expect(shared).toContain("Dependency")
    expect(shared).toContain("No external resources")
  })

  test("html plan template carries plan-specific semantic structure", () => {
    expect(template).toContain('<header class="doc-header">')
    expect(template).toContain('<nav class="toc"')
    expect(template).toContain('<main>')
    expect(template).toContain('<section id="requirements">')
    expect(template).toContain('<section id="implementation-units">')
    expect(template).toContain('<article id="u1">')
    expect(template).toContain('<section id="test-scenarios">')
    expect(template).toContain('<section id="sources">')
    expect(template).toContain('<th scope="col">R-ID</th>')
    expect(template).toContain('<th scope="col">Category</th>')
    expect(template).toContain("This is the HTML view of a ce-plan. Run ce-plan without --html")
  })

  test("sample fixture is a complete HTML5 document with required landmarks", () => {
    expect(fixture.trimStart().startsWith("<!DOCTYPE html>")).toBe(true)
    expect(fixture).toContain('<html lang="en">')
    expect(fixture).toContain('<meta charset="utf-8">')
    expect(fixture).toContain('<meta name="viewport" content="width=device-width, initial-scale=1">')
    expect(fixture).toContain("<style>")
    expect(fixture).toContain("<header")
    expect(fixture).toContain("<nav")
    expect(fixture).toContain("<main>")
    expect(fixture).toContain("<footer")
    expect(countMatches(fixture, /<section id="/g)).toBeGreaterThanOrEqual(6)
  })

  test("frontmatter JSON round-trips from the sample fixture", () => {
    expect(extractScriptJson(fixture, "plan-frontmatter")).toEqual({
      title: "Sample HTML Plan",
      type: "feat",
      status: "active",
      date: "2026-05-08",
      generated_by: "ce-plan",
    })
  })

  test("sample fixture exposes frontmatter as status, type, and date pills", () => {
    expect(fixture).toContain("pill-status-active")
    expect(fixture).toContain("status: active")
    expect(fixture).toContain("pill-type-feat")
    expect(fixture).toContain("type: feat")
    expect(fixture).toContain("pill-date")
    expect(fixture).toContain("date: 2026-05-08")
  })

  test("implementation units have stable U-ID anchors matching nav links", () => {
    expect(fixture).toContain('<a href="#u1">U1. Shared Reference</a>')
    expect(fixture).toContain('<a href="#u2">U2. ce-plan Template</a>')
    expect(fixture).toContain('<article id="u1">')
    expect(fixture).toContain('<article id="u2">')
  })

  test("tables use real table semantics", () => {
    expect(countMatches(fixture, /<table>/g)).toBeGreaterThanOrEqual(3)
    expect(countMatches(fixture, /<thead>/g)).toBeGreaterThanOrEqual(3)
    expect(countMatches(fixture, /<tbody>/g)).toBeGreaterThanOrEqual(3)
    expect(fixture).toContain('<th scope="col">Requirement</th>')
    expect(fixture).toContain('<th scope="row" data-label="R-ID">R1</th>')
  })

  test("sample fixture uses inline SVG and does not load external resources", () => {
    expect(fixture).toContain("<svg")
    expect(fixture).toContain("<title")
    expect(fixture).not.toMatch(/<link\b[^>]+href=["']https?:/i)
    expect(fixture).not.toMatch(/<script\b[^>]+src=["']https?:/i)
    expect(fixture).not.toMatch(/<img\b[^>]+src=["']https?:/i)
  })

  test("sample fixture stays below the 80KB size budget", () => {
    expect(statSync(fixturePath).size).toBeLessThan(80 * 1024)
  })
})
