#!/usr/bin/env bun
import { syncReleaseMetadata } from "../../src/release/metadata"

const write = process.argv.includes("--write")
const versionArgs = process.argv
  .slice(2)
  .filter((arg) => arg.startsWith("--version:"))
  .map((arg) => arg.replace("--version:", ""))

const componentVersions = Object.fromEntries(
  versionArgs.map((entry) => {
    const [component, version] = entry.split("=")
    return [component, version]
  }),
)

const result = await syncReleaseMetadata({
  componentVersions,
  write,
})

for (const update of result.updates) {
  console.log(`${update.changed ? "update" : "keep"} ${update.path}`)
}
