#!/usr/bin/env node

import { promises as fs } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const INTEGRATION_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(INTEGRATION_DIR, "../..")
const SUPPORTED_VERSION_FORMAT = "{upstream.version}-orca.{integration.revision}"

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, "utf8"))
}

export function formatForkVersion(upstreamVersion, revision, versionFormat = SUPPORTED_VERSION_FORMAT) {
  if (versionFormat !== SUPPORTED_VERSION_FORMAT) {
    throw new Error(`Unsupported integration.versionFormat: ${versionFormat}`)
  }
  if (!Number.isInteger(revision) || revision < 1) {
    throw new Error("integration.revision must be a positive integer")
  }
  return versionFormat
    .replace("{upstream.version}", upstreamVersion)
    .replace("{integration.revision}", String(revision))
}

export async function getVersionInfo(repoRoot = REPO_ROOT) {
  const protocol = await readJson(path.join(repoRoot, "integrations", "orca", "protocol.json"))
  const upstream = await readJson(path.join(repoRoot, protocol.upstreamBaseline))
  const revision = protocol.integration.revision
  const version = formatForkVersion(upstream.version, revision, protocol.integration.versionFormat)

  return {
    name: protocol.integration.name,
    version,
    upstream: {
      repository: upstream.repository,
      version: upstream.version,
      commit: upstream.commit,
    },
    integrationRevision: revision,
    orca: {
      protocol: protocol.orca.protocol,
      requestVersions: protocol.orca.requestVersions,
    },
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.stdout.write(`${JSON.stringify(await getVersionInfo())}\n`)
}
