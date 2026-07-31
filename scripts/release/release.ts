#!/usr/bin/env bun
/**
 * Repeatable release pipeline for compound-engineering-fe-plugin.
 *
 * Usage:
 *   bun run scripts/release/release.ts --bump <patch|minor|major> [--notes "..."] [--recent-skills "skill-a,skill-b"] [--migration-note "..."] [--dry-run]
 *
 * What it does (in order):
 *   1. Validates: on main, clean tree, up to date with origin.
 *   2. Reads current version from package.json.
 *   3. Computes next version from --bump (patch|minor|major).
 *   4. Bumps version across all 8 plugin manifests + .release-please-manifest.json.
 *   5. Generates a CHANGELOG.md entry from git log since the last tag.
 *   6. Detects skills added since the previous MINOR release and emits a
 *      "What's new in this release" section with a description + usage hint per skill.
 *      Use --recent-skills to add skills that fall outside the auto-detection window.
 *   7. Commits, tags (vX.Y.Z), pushes both.
 *   8. Creates a GitHub Release via `gh release create`. The release body includes
 *      a paste-ready upgrade prompt whose final step walks the user through every
 *      new skill listed in the "What's new" section after /ce-setup finishes.
 *      --migration-note adds a one-time instruction block to the prompt for THIS
 *      release only (e.g. the api.thehive.ai -> api-cdn.thehive.ai base-URL rewrite).
 *
 * --dry-run prints what would happen without writing or pushing.
 */

import { execSync } from "node:child_process"
import { readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import {
  buildSkillEntries,
  findNewSkillsBetweenRefs,
  findPreviousMinorTag,
  lookbackTagDisplay,
} from "./skill-detection"
import { parseArgs, printUsage, type BumpLevel } from "./cli"
import { buildUpgradePrompt } from "./upgrade-prompt"

// =====================================================
//  Args (parsed via ./cli for testability)
// =====================================================

function run(cmd: string, opts?: { capture?: boolean; cwd?: string }): string {
  if (opts?.capture) {
    return execSync(cmd, { encoding: "utf8", cwd: opts.cwd, stdio: ["pipe", "pipe", "pipe"] }).trim()
  }
  execSync(cmd, { cwd: opts?.cwd, stdio: "inherit" })
  return ""
}

function bumpVersion(version: string, bump: BumpLevel): string {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version)
  if (!match) throw new Error(`Unsupported version format: ${version}`)
  const major = Number(match[1])
  const minor = Number(match[2])
  const patch = Number(match[3])
  switch (bump) {
    case "major": return `${major + 1}.0.0`
    case "minor": return `${major}.${minor + 1}.0`
    case "patch": return `${major}.${minor}.${patch + 1}`
  }
}

// All files that carry the version string, with the JSON path to update.
const VERSION_FILES: Array<{ file: string; jsonPath?: string }> = [
  { file: "package.json" },
  { file: "plugin.json" },
  { file: ".claude-plugin/plugin.json" },
  { file: ".cursor-plugin/plugin.json" },
  { file: ".codex-plugin/plugin.json" },
  { file: ".kimi-plugin/plugin.json" },
  { file: ".grok-plugin/plugin.json" },
  { file: ".devin-plugin/plugin.json" },
]

const MANIFEST_FILE = ".github/.release-please-manifest.json"
const CHANGELOG_FILE = "CHANGELOG.md"
const REPO_URL = "https://github.com/boltcoder/compound-engineering-fe-plugin"

function updateVersionInFile(filePath: string, oldVersion: string, newVersion: string): boolean {
  const content = readFileSync(filePath, "utf8")
  // For .release-please-manifest.json, only bump the "." key
  if (filePath === MANIFEST_FILE) {
    const json = JSON.parse(content)
    if (json["."] === oldVersion) {
      json["."] = newVersion
      writeFileSync(filePath, JSON.stringify(json, null, 2) + "\n")
      return true
    }
    return false
  }
  // For plugin.json files, update the "version" field
  const json = JSON.parse(content)
  if (json.version === oldVersion) {
    json.version = newVersion
    writeFileSync(filePath, JSON.stringify(json, null, 2) + "\n")
    return true
  }
  return false
}

function getLastTag(): string | null {
  try {
    return run("git describe --tags --abbrev=0", { capture: true })
  } catch {
    return null
  }
}

function generateChangelogEntry(newVersion: string, lastTag: string | null): string {
  const range = lastTag ? `${lastTag}..HEAD` : "HEAD"
  const log = run(`git log ${range} --oneline --no-merges`, { capture: true })

  const features: string[] = []
  const fixes: string[] = []
  const others: string[] = []

  for (const line of log.split("\n")) {
    if (!line.trim()) continue
    const hash = line.substring(0, 7)
    const msg = line.substring(8)
    if (/^feat/i.test(msg)) {
      features.push(`* ${msg} (${hash})`)
    } else if (/^fix/i.test(msg)) {
      fixes.push(`* ${msg} (${hash})`)
    } else if (!/^(chore|docs|test|ci|build|style|refactor|perf|revert):/i.test(msg)) {
      others.push(`* ${msg} (${hash})`)
    }
  }

  const compareUrl = lastTag
    ? `${REPO_URL}/compare/${lastTag}...v${newVersion}`
    : `${REPO_URL}/releases/tag/v${newVersion}`

  let entry = `## [${newVersion}](${compareUrl}) (${new Date().toISOString().split("T")[0]})\n\n`

  if (features.length > 0) {
    entry += `### Features\n\n${features.join("\n")}\n\n`
  }
  if (fixes.length > 0) {
    entry += `### Bug Fixes\n\n${fixes.join("\n")}\n\n`
  }
  if (others.length > 0) {
    entry += `### Other Changes\n\n${others.join("\n")}\n\n`
  }

  return entry
}

function prependChangelog(entry: string): void {
  const content = readFileSync(CHANGELOG_FILE, "utf8")
  const newContent = content.replace(/^# Changelog\n/, `# Changelog\n\n${entry}`)
  writeFileSync(CHANGELOG_FILE, newContent)
}

function generateConsumerUpgradeNotes(version: string, newSkills: string[], migrationNote: string): string {
  return buildUpgradePrompt({ version, newSkills, migrationNote })
}

// =====================================================
//  Skill auto-detection for "What's new in this release"
// =====================================================

function listAllTags(): string[] {
  return run("git tag --sort=-version:refname", { capture: true })
    .split("\n")
    .filter(Boolean)
}

/**
 * Generates the "What's new in this release" section by combining:
 *   - Auto-detected skills: skills added since the previous MINOR release tag
 *   - Manual override: skills listed in --recent-skills (added to the auto-detected set)
 *
 * Skills already documented in the most recent release tag's auto-detection are excluded
 * via the lookback to the previous MINOR — so a skill introduced in v3.21.0 stays in
 * "What's new" for all of v3.21.x and v3.22.x, then drops out when v3.23.0 ships.
 *
 * `currentRef` is the tag/ref whose preceding state defines "new since": typically
 * the last release tag captured before the new tag was created. This avoids the
 * self-referential bug where computing "new since lastTag" *after* creating the new
 * tag returns "since the new tag" and finds nothing.
 *
 * Returns an empty section + empty skills list if there are no new skills to call out.
 */
function generateWhatsNewSection(
  currentRef: string | null,
  recentSkillsOverride: string[] = [],
): { section: string; skills: string[] } {
  if (!currentRef) return { section: "", skills: [] }

  const allTags = listAllTags()
  const previousMinorTag = findPreviousMinorTag(currentRef, allTags)
  const lookbackRef = previousMinorTag ?? currentRef
  const detected = findNewSkillsBetweenRefs(lookbackRef)

  // Merge override (preserve order: detected first, then override)
  const seen = new Set(detected)
  const merged = [...detected]
  for (const name of recentSkillsOverride) {
    if (!seen.has(name)) {
      merged.push(name)
      seen.add(name)
    }
  }

  if (merged.length === 0) return { section: "", skills: [] }

  const entries = buildSkillEntries(merged)
  const bullets = entries.map((e) => e.bullet).join("\n")
  const section = `\n## What's new in this release\n\nAuto-detected new skills (since \`${lookbackTagDisplay(lookbackRef)}\`):\n\n${bullets}\n`

  return { section, skills: merged }
}

// =====================================================
//  Main
// =====================================================

const args = (() => {
  try {
    return parseArgs(process.argv.slice(2))
  } catch (err) {
    console.error((err as Error).message)
    printUsage()
    process.exit(1)
  }
})()
const dryRun = args.dryRun

console.log(dryRun ? "=== DRY RUN ===" : "=== RELEASE PIPELINE ===")
console.log(`Bump: ${args.bump}`)
if (args.recentSkills.length > 0) {
  console.log(`Recent skills override: ${args.recentSkills.join(", ")}`)
}
if (args.migrationNote) {
  console.log(`Migration note: ${args.migrationNote.length} chars`)
}

// 1. Validate git state
console.log("\n1. Validating git state...")
const branch = run("git rev-parse --abbrev-ref HEAD", { capture: true })
if (branch !== "main") {
  console.error(`Must be on main, currently on: ${branch}`)
  process.exit(1)
}

const status = run("git status --porcelain", { capture: true })
if (status) {
  console.error(`Working tree is not clean:\n${status}`)
  process.exit(1)
}

run("git fetch origin main")
const localHead = run("git rev-parse HEAD", { capture: true })
const remoteHead = run("git rev-parse origin/main", { capture: true })
if (localHead !== remoteHead) {
  console.error(`Local main is out of sync with origin/main`)
  process.exit(1)
}
console.log("   On main, clean tree, up to date with origin.")

// 2. Read current version
const pkg = JSON.parse(readFileSync("package.json", "utf8"))
const currentVersion = pkg.version
const newVersion = bumpVersion(currentVersion, args.bump)
console.log(`\n2. Version: ${currentVersion} -> ${newVersion} (${args.bump})`)

if (dryRun) {
  console.log("\n   [dry-run] Would bump these files:")
  for (const { file } of VERSION_FILES) console.log(`     - ${file}`)
  console.log(`     - ${MANIFEST_FILE}`)
  console.log(`     - ${CHANGELOG_FILE}`)
  console.log(`\n   [dry-run] Would commit, tag v${newVersion}, push, and create GitHub Release.`)
  process.exit(0)
}

// 3. Bump all manifest files
console.log("\n3. Bumping version in manifest files...")
let updated = 0
for (const { file } of VERSION_FILES) {
  if (updateVersionInFile(file, currentVersion, newVersion)) {
    console.log(`   ✓ ${file}`)
    updated++
  } else {
    console.error(`   ✗ ${file} — version field not found or mismatched`)
    process.exit(1)
  }
}
if (updateVersionInFile(MANIFEST_FILE, currentVersion, newVersion)) {
  console.log(`   ✓ ${MANIFEST_FILE}`)
  updated++
} else {
  console.error(`   ✗ ${MANIFEST_FILE} — "." key not found or mismatched`)
  process.exit(1)
}
console.log(`   ${updated} files updated.`)

// 4. Generate and prepend CHANGELOG entry
console.log("\n4. Generating CHANGELOG entry...")
const lastTag = getLastTag()
const changelogEntry = generateChangelogEntry(newVersion, lastTag)
prependChangelog(changelogEntry)
console.log(`   ✓ ${CHANGELOG_FILE} updated (entry from ${lastTag ?? "beginning"} to HEAD)`)

// 5. Commit
console.log("\n5. Committing...")
run(`git add -A`)
run(`git commit -m "chore(release): bump version to ${newVersion}"`)
console.log("   ✓ Committed.")

// 6. Tag
console.log(`\n6. Tagging v${newVersion}...`)
run(`git tag -a v${newVersion} -m "Release v${newVersion}"`)
console.log(`   ✓ Tagged.`)

// 7. Push
console.log("\n7. Pushing commit + tag...")
run("git push origin main")
run(`git push origin v${newVersion}`)
console.log("   ✓ Pushed.")

// 8. Detect new skills + generate "What's new" section
// Use the `lastTag` captured in step 4 (before this tag was created) so we look back
// from the right anchor — otherwise getLastTag() would now return v${newVersion} itself.
console.log("\n8. Detecting new skills since previous minor release...")
const whatsNew = generateWhatsNewSection(lastTag, args.recentSkills)
if (whatsNew.skills.length > 0) {
  console.log(`   ✓ Found ${whatsNew.skills.length} new skill(s): ${whatsNew.skills.join(", ")}`)
} else {
  console.log("   No new skills since previous minor release.")
}

// 9. Create GitHub Release
console.log(`\n9. Creating GitHub Release v${newVersion}...`)
const consumerUpgrade = generateConsumerUpgradeNotes(newVersion, whatsNew.skills, args.migrationNote)
const releaseNotes = (args.notes ?? changelogEntry) + whatsNew.section + consumerUpgrade
const tmpFile = path.join(require("node:os").tmpdir(), `ce-release-${newVersion}.md`)
writeFileSync(tmpFile, releaseNotes)
const repoSlug = REPO_URL.replace("https://github.com/", "")
run(`gh release create v${newVersion} --repo ${repoSlug} --title "v${newVersion}" --notes-file "${tmpFile}"`)
console.log("   ✓ GitHub Release created.")

console.log(`\n=== DONE: v${newVersion} released ===`)
console.log(`   ${REPO_URL}/releases/tag/v${newVersion}`)
