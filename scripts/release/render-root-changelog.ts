#!/usr/bin/env bun
import { updateRootChangelog } from "../../src/release/metadata"
import type { ReleaseComponent } from "../../src/release/types"

type EntryInput = {
  component: ReleaseComponent
  version: string
  date: string
  sections: Record<string, string[]>
}

function parseEntries(argv: string[]): EntryInput[] {
  const jsonIndex = argv.findIndex((arg) => arg === "--entries")
  if (jsonIndex === -1) return []
  const raw = argv[jsonIndex + 1]
  if (!raw) return []
  return JSON.parse(raw) as EntryInput[]
}

const write = process.argv.includes("--write")
const entries = parseEntries(process.argv.slice(2))

if (entries.length === 0) {
  console.error("No changelog entries provided. Pass --entries '<json>'.")
  process.exit(1)
}

const result = await updateRootChangelog({
  entries,
  write,
})

console.log(`${result.changed ? "update" : "keep"} ${result.path}`)
