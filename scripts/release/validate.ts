#!/usr/bin/env bun
import { execFileSync } from "node:child_process"
import path from "path"
import { validateReleasePleaseConfig } from "../../src/release/config"
import { getCompoundEngineeringCounts, syncReleaseMetadata } from "../../src/release/metadata"
import { readJson } from "../../src/utils/files"

type ReleasePleaseManifest = Record<string, string>

const MANIFEST_RELATIVE_PATH = ".github/.release-please-manifest.json"

// The release-as staleness check must compare a pin against the version already
// released on the base branch (main), NOT the working tree: a release-please PR
// bumps the working-tree manifest to the proposed version, which would make a
// legitimate pin look stale and block the very release it exists to create.
// Returns {} when origin/main is unreachable (e.g. a shallow checkout that did
// not fetch it) so the staleness check no-ops rather than risk a false block.
function readReleasedManifest(): ReleasePleaseManifest {
  try {
    const raw = execFileSync("git", ["show", `origin/main:${MANIFEST_RELATIVE_PATH}`], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    })
    return JSON.parse(raw) as ReleasePleaseManifest
  } catch {
    return {}
  }
}

const releasePleaseConfig = await readJson<Parameters<typeof validateReleasePleaseConfig>[0]>(
  path.join(process.cwd(), ".github", "release-please-config.json"),
)
const manifest = await readJson<ReleasePleaseManifest>(
  path.join(process.cwd(), ...MANIFEST_RELATIVE_PATH.split("/")),
)
const configErrors = validateReleasePleaseConfig(releasePleaseConfig, readReleasedManifest())
const counts = await getCompoundEngineeringCounts(process.cwd())
const result = await syncReleaseMetadata({
  write: false,
  componentVersions: {
    marketplace: manifest[".claude-plugin"],
    "cursor-marketplace": manifest[".cursor-plugin"],
  },
})
const changed = result.updates.filter((update) => update.changed)
const metadataErrors = result.errors

if (configErrors.length === 0 && changed.length === 0 && metadataErrors.length === 0) {
  console.log(
    `Release metadata is in sync. compound-engineering currently has ${counts.agents} agents, ${counts.skills} skills, and ${counts.mcpServers} MCP server${counts.mcpServers === 1 ? "" : "s"}.`,
  )
  process.exit(0)
}

if (configErrors.length > 0) {
  console.error("Release configuration errors detected:")
  for (const error of configErrors) {
    console.error(`- ${error}`)
  }
}

if (metadataErrors.length > 0) {
  console.error("Release metadata structural errors detected:")
  for (const error of metadataErrors) {
    console.error(`- ${error}`)
  }
}

if (changed.length > 0) {
  console.error("Release metadata drift detected:")
  for (const update of changed) {
    console.error(`- ${update.path}`)
  }
  console.error(
    `Current compound-engineering counts: ${counts.agents} agents, ${counts.skills} skills, ${counts.mcpServers} MCP server${counts.mcpServers === 1 ? "" : "s"}.`,
  )
}
process.exit(1)
