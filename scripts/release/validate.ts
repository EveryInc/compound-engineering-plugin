#!/usr/bin/env bun
import { syncReleaseMetadata } from "../../src/release/metadata"

const result = await syncReleaseMetadata({ write: false })
const changed = result.updates.filter((update) => update.changed)

if (changed.length === 0) {
  console.log("Release metadata is in sync.")
  process.exit(0)
}

console.error("Release metadata drift detected:")
for (const update of changed) {
  console.error(`- ${update.path}`)
}
process.exit(1)
