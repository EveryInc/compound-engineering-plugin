import { readFile, access } from "fs/promises"
import path from "path"
import { describe, expect, test } from "bun:test"

const REPO_ROOT = path.join(import.meta.dir, "..")
const FIXTURE = path.join(REPO_ROOT, "tests", "fixtures", "ce-cursor-role-models-rule.md")
const RULE = path.join(REPO_ROOT, "rules", "ce-cursor-models.mdc")

const START = "<!-- ce-cursor-role-models:start -->"
const END = "<!-- ce-cursor-role-models:end -->"

const CONSUMERS = [
  "skills/ce-code-review/references/dispatch-reviewers.md",
  "skills/ce-code-review/references/finish-input.md",
  "skills/ce-code-review/references/scope.md",
  "skills/ce-doc-review/references/dispatch.md",
  "skills/ce-bakeoff/references/candidates.md",
  "skills/ce-bakeoff/references/judging.md",
]

const REQUIRED_ROLES = [
  "bakeoff bakers",
  "bakeoff judge",
  "code-review session",
  "code-review mid",
  "code-review cheap",
  "code-review finish",
  "doc-review cheap",
  "doc-review high",
  "doc-review mid",
] as const

const INHERIT_ROLES = new Set([
  "code-review session",
  "code-review finish",
  "doc-review high",
])

type RoleLine = { role: string; value: string }

function parseRoleLines(source: string): RoleLine[] {
  const stripped = source.replace(/^---\n[\s\S]*?\n---\n/, "")
  const lines: RoleLine[] = []
  for (const raw of stripped.split("\n")) {
    const line = raw.trim()
    if (!line || line.startsWith("#")) continue
    const match = /^([a-z][a-z0-9- ]+):\s*(.+)$/.exec(line)
    if (!match) continue
    lines.push({ role: match[1], value: match[2].trim() })
  }
  return lines
}

async function canonicalBlock(): Promise<string> {
  const fixture = await readFile(FIXTURE, "utf8")
  const start = fixture.indexOf(START)
  const end = fixture.indexOf(END)
  expect(start).toBeGreaterThanOrEqual(0)
  expect(end).toBeGreaterThan(start)
  return fixture.slice(start, end + END.length)
}

describe("Cursor role-model overlay", () => {
  test("the fixture defines a single delimited block", async () => {
    const block = await canonicalBlock()
    expect(block.startsWith(START)).toBe(true)
    expect(block.endsWith(END)).toBe(true)
    const fixture = await readFile(FIXTURE, "utf8")
    expect(fixture.split(START).length).toBe(2)
    expect(fixture.split(END).length).toBe(2)
  })

  test("every independent reader contains the canonical block verbatim", async () => {
    const block = await canonicalBlock()
    for (const rel of CONSUMERS) {
      const p = path.join(REPO_ROOT, rel)
      await access(p)
      const content = await readFile(p, "utf8")
      expect(content, `${rel} is missing the Cursor role-table block`).toContain(block)
    }
  })

  test("the canonical block pins its load-bearing clauses", async () => {
    const block = await canonicalBlock()
    expect(block).toContain("host-specific role table")
    expect(block).toContain("known model override")
    expect(block).toContain("inherit-parent")
    expect(block).toContain("auto")
    expect(block).toContain("omit the override")
    expect(block).toContain("A model named in this conversation still wins")
    expect(block).toContain("a project or user rule wins over the plugin default")
    expect(block).toContain("Hosts with no such table keep the portable rule below")
    expect(block).not.toContain("cursor-grok")
    expect(block).not.toMatch(/\bgpt-/i)
    expect(block).not.toContain("Task")
  })

  test("shipped Cursor rule maps every required role and ships no OpenAI slugs", async () => {
    const source = await readFile(RULE, "utf8")
    expect(source).toContain("alwaysApply: true")
    const roles = parseRoleLines(source)
    const byRole = new Map(roles.map((row) => [row.role, row.value]))
    expect(roles.map((row) => row.role).sort()).toEqual([...REQUIRED_ROLES].sort())
    for (const role of REQUIRED_ROLES) {
      const value = byRole.get(role)
      expect(value, role).toBeDefined()
      expect(value, role).not.toMatch(/gpt/i)
      expect(value, role).not.toMatch(/openai/i)
    }
    for (const role of INHERIT_ROLES) {
      expect(byRole.get(role)).toMatch(/^(inherit-parent|auto)$/)
    }
    expect(byRole.get("bakeoff bakers")?.includes(",")).toBe(true)
  })

  test("converted skill prose does not embed Cursor Task slugs", async () => {
    for (const rel of CONSUMERS) {
      const content = await readFile(path.join(REPO_ROOT, rel), "utf8")
      expect(content, rel).not.toContain("cursor-grok")
      expect(content, rel).not.toMatch(/\bgpt-5/i)
    }
  })

  test("LFG owns no dispatch-role overlay", async () => {
    const content = await readFile(
      path.join(REPO_ROOT, "skills/lfg/references/stage-routing.md"),
      "utf8",
    )
    expect(content).toContain("owns no dispatch-role overlay")
    expect(content).not.toContain("cursor-grok")
    expect(content).not.toContain(START)
  })

  test("checkout yaml does not grow a Cursor model map", async () => {
    const template = await readFile(
      path.join(REPO_ROOT, "skills/ce-setup/references/config-template.yaml"),
      "utf8",
    )
    const example = await readFile(
      path.join(REPO_ROOT, ".compound-engineering/config.example.yaml"),
      "utf8",
    )
    expect(template).toBe(example)
    expect(template).not.toContain("cursor_bakeoff")
    expect(template).not.toContain("cursor_role_models")
    expect(template).not.toContain("cursor_code_review")
  })

  test("release metadata treats plugin rules as plugin content", async () => {
    const source = await readFile(
      path.join(REPO_ROOT, "src/release/components.ts"),
      "utf8",
    )
    expect(source).toMatch(/"rules\/"/)
  })

  test("each independent reader names its dispatch role", async () => {
    const pins: Array<[string, string[]]> = [
      ["skills/ce-code-review/references/dispatch-reviewers.md", ["code-review session", "code-review mid"]],
      ["skills/ce-code-review/references/finish-input.md", ["code-review finish"]],
      ["skills/ce-code-review/references/scope.md", ["code-review cheap"]],
      ["skills/ce-doc-review/references/dispatch.md", ["doc-review cheap", "doc-review high", "doc-review mid"]],
      ["skills/ce-bakeoff/references/candidates.md", ["bakeoff bakers"]],
      ["skills/ce-bakeoff/references/judging.md", ["bakeoff judge"]],
    ]
    for (const [rel, roles] of pins) {
      const content = await readFile(path.join(REPO_ROOT, rel), "utf8")
      for (const role of roles) {
        expect(content, `${rel} should name ${role}`).toContain(role)
      }
    }
  })
})
