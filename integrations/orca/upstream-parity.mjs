#!/usr/bin/env node

import { promises as fs } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { formatForkVersion } from "./version.mjs"

const INTEGRATION_DIR = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_REPO_ROOT = path.resolve(INTEGRATION_DIR, "../..")

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, "utf8"))
}

function sameItems(left, right) {
  return left.length === right.length && left.every((item, index) => item === right[index])
}

async function listDirectories(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true })
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
}

async function listMarkdownFiles(directory) {
  try {
    const entries = await fs.readdir(directory, { withFileTypes: true })
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
      .map((entry) => entry.name)
      .sort()
  } catch (error) {
    if (error?.code === "ENOENT") return []
    throw error
  }
}

export async function loadUpstreamBaseline(repoRoot = DEFAULT_REPO_ROOT) {
  const protocol = await readJson(path.join(repoRoot, "integrations", "orca", "protocol.json"))
  const baseline = await readJson(path.join(repoRoot, protocol.upstreamBaseline))
  if (baseline.schema !== "ce-orca.upstream-baseline/v1") {
    throw new Error(`Unsupported upstream baseline schema: ${baseline.schema ?? "missing"}`)
  }
  return baseline
}

export async function checkUpstreamParity(repoRoot = DEFAULT_REPO_ROOT, suppliedBaseline) {
  const baseline = suppliedBaseline ?? await loadUpstreamBaseline(repoRoot)
  const issues = []

  const expectedSkills = [...baseline.skillInventory].sort()
  const actualSkills = await listDirectories(path.join(repoRoot, "skills"))
  if (!sameItems(expectedSkills, actualSkills)) {
    issues.push({
      code: "skill_inventory_drift",
      expected: expectedSkills,
      actual: actualSkills,
    })
  }

  for (const workflow of Object.keys(baseline.promptAssetSources).sort()) {
    const expected = [...(baseline.promptAssets[workflow] ?? [])].sort()
    const actual = await listMarkdownFiles(path.join(repoRoot, baseline.promptAssetSources[workflow]))
    if (!sameItems(expected, actual)) {
      issues.push({
        code: "role_inventory_drift",
        scope: workflow,
        expected,
        actual,
      })
    }
  }

  for (const hook of baseline.hookAnchors) {
    let content = ""
    try {
      content = await fs.readFile(path.join(repoRoot, hook.file), "utf8")
    } catch (error) {
      if (error?.code !== "ENOENT") throw error
    }
    if (!content.includes(hook.contains)) {
      issues.push({
        code: "hook_anchor_missing",
        id: hook.id,
        file: hook.file,
      })
    }
  }

  const manifestVersions = []
  for (const file of ["package.json", ".claude-plugin/plugin.json", ".codex-plugin/plugin.json"]) {
    let version
    try {
      version = (await readJson(path.join(repoRoot, file))).version
    } catch (error) {
      if (error?.code !== "ENOENT") throw error
    }
    manifestVersions.push({ file, version: version ?? null })
  }
  const distinctVersions = [...new Set(manifestVersions.map(({ version }) => version))]
  if (distinctVersions.length !== 1) {
    issues.push({
      code: "manifest_version_mismatch",
      manifests: manifestVersions,
    })
  } else {
    const actual = distinctVersions[0]
    let releaseVersion = null
    try {
      const protocol = await readJson(path.join(repoRoot, "integrations", "orca", "protocol.json"))
      releaseVersion = formatForkVersion(
        baseline.version,
        protocol.integration.revision,
        protocol.integration.versionFormat,
      )
    } catch (error) {
      if (error?.code !== "ENOENT") throw error
    }
    if (actual !== baseline.version && actual !== releaseVersion) {
      issues.push({
        code: "upstream_version_drift",
        expected: [baseline.version, releaseVersion].filter(Boolean),
        actual,
      })
    }
  }

  return issues
}

async function main() {
  const rootIndex = process.argv.indexOf("--root")
  const repoRoot = rootIndex >= 0
    ? path.resolve(process.argv[rootIndex + 1] ?? "")
    : DEFAULT_REPO_ROOT
  const baseline = await loadUpstreamBaseline(repoRoot)
  const issues = await checkUpstreamParity(repoRoot, baseline)
  const result = {
    ok: issues.length === 0,
    upstream: {
      repository: baseline.repository,
      version: baseline.version,
      commit: baseline.commit,
    },
    issues,
  }
  const output = `${JSON.stringify(result, null, 2)}\n`
  if (result.ok) {
    process.stdout.write(output)
  } else {
    process.stderr.write(output)
    process.exitCode = 1
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main()
}
