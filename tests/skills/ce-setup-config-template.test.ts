import { createHash } from "crypto"
import { readFile } from "fs/promises"
import path from "path"
import { describe, expect, test } from "bun:test"

const repoRoot = path.join(import.meta.dir, "..", "..")
const references = path.join(repoRoot, "skills", "ce-setup", "references")
const templatePath = path.join(references, "config-template.yaml")
const registryPath = path.join(references, "retired-config-keys.yaml")
const templateLinesPath = path.join(references, "config-template-lines.txt")
const pinPath = path.join(repoRoot, "tests", "fixtures", "ce-config-template-pin.json")

// One definition of a setting slot, shared with the configuration-doc coverage test.
const SLOT = /^# ([A-Za-z][A-Za-z0-9_]*):(?:\s|$)/
const VERSION_LINE = /^# ce-config-template-version: (\d+)\n/m
// Historical prose lines that happen to have the slot shape.
const KNOWN_NON_KEYS = new Set(["pack"])

function slotKeys(lines: string[]): Set<string> {
  const keys = new Set<string>()
  for (const line of lines) {
    const match = line.match(SLOT)
    if (match) keys.add(match[1])
  }
  return keys
}

type RegistryEntry = { kind?: string; target?: string; reason?: string }

function parseRegistry(text: string): Map<string, RegistryEntry> {
  const entries = new Map<string, RegistryEntry>()
  let current: RegistryEntry | undefined
  for (const line of text.split("\n")) {
    const top = line.match(/^([A-Za-z_][A-Za-z0-9_]*):\s*$/)
    if (top) {
      current = {}
      entries.set(top[1], current)
      continue
    }
    const field = line.match(/^  (kind|target|reason):\s*(.*)$/)
    if (field && current) current[field[1] as keyof RegistryEntry] = field[2].replace(/^"(.*)"$/, "$1")
  }
  return entries
}

async function load() {
  const [template, registryText, templateLinesText, pinText] = await Promise.all([
    readFile(templatePath, "utf8"),
    readFile(registryPath, "utf8"),
    readFile(templateLinesPath, "utf8"),
    readFile(pinPath, "utf8"),
  ])
  return {
    template,
    templateKeys: slotKeys(template.split("\n")),
    registry: parseRegistry(registryText),
    templateLines: templateLinesText.split("\n").filter((line) => line !== ""),
    pin: JSON.parse(pinText) as { version: number; sha256: string },
  }
}

describe("ce-setup config template data", () => {
  test("no setting is both current and retired", async () => {
    const { templateKeys, registry } = await load()
    expect(templateKeys.size).toBeGreaterThan(0)
    expect(registry.size).toBeGreaterThan(0)
    expect([...registry.keys()].filter((key) => templateKeys.has(key))).toEqual([])
  })

  test("a setting cannot leave the template without a registry entry", async () => {
    const { templateKeys, registry, templateLines } = await load()
    const historical = slotKeys(templateLines)
    expect(historical.has("work_delegate_sandbox")).toBe(true)
    const unrecorded = [...historical].filter(
      (key) => !templateKeys.has(key) && !registry.has(key) && !KNOWN_NON_KEYS.has(key),
    )
    expect(unrecorded).toEqual([])
  })

  test("every current template line is recorded as known template text", async () => {
    const { template, templateLines } = await load()
    const known = new Set(templateLines)
    const missing = template
      .split("\n")
      .map((line) => line.trimEnd())
      .filter((line) => line !== "" && !known.has(line))
    // Append each new or edited template line to config-template-lines.txt; never remove old ones.
    expect(missing).toEqual([])
  })

  test("the template cannot change without a version bump", async () => {
    const { template, pin } = await load()
    const version = template.match(VERSION_LINE)
    expect(version).not.toBeNull()
    expect(Number(version![1])).toBe(pin.version)
    const body = template.replace(VERSION_LINE, "")
    // On a template edit: bump the version line, then re-pin the version and this hash.
    expect(createHash("sha256").update(body).digest("hex")).toBe(pin.sha256)
  })

  test("every registry entry has a valid kind, target, and reason", async () => {
    const { templateKeys, registry } = await load()
    for (const [key, entry] of registry) {
      expect({ key, kind: entry.kind }).toEqual({ key, kind: expect.stringMatching(/^(remove|migrate)$/) })
      expect({ key, reason: (entry.reason ?? "").length > 0 }).toEqual({ key, reason: true })
      if (entry.kind === "migrate") {
        expect({ key, targetIsCurrent: templateKeys.has(entry.target ?? "") }).toEqual({ key, targetIsCurrent: true })
      }
    }
  })

  test("no prose line in the template has the setting-slot shape", async () => {
    const { templateKeys } = await load()
    for (const key of KNOWN_NON_KEYS) expect(templateKeys.has(key)).toBe(false)
  })
})
