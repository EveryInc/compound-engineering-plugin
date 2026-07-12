import path from "path"

type ReleasePleasePackageConfig = {
  "changelog-path"?: string
  "skip-changelog"?: boolean
  "release-as"?: string
}

type ReleasePleaseConfig = {
  packages: Record<string, ReleasePleasePackageConfig>
}

// Maps a release component path (e.g. ".claude-plugin") to its last-released
// version. Callers pass the manifest as it exists on the base branch (main),
// NOT the working tree -- on a release-please PR the working-tree manifest is
// already bumped to the proposed version, which would make a legitimate pin
// look stale. See validateReleasePleaseConfig and scripts/release/validate.ts.
type ReleasePleaseManifest = Record<string, string>

// Compares release lineage versions. Returns a negative number when `a` is
// lower than `b`, 0 when equal, positive when higher. The CE-Orca fork treats
// `<upstream>-orca.N` as revision N after the stable upstream baseline (revision
// zero), rather than as SemVer prerelease precedence. Other suffixes retain the
// historical behavior and are ignored.
function compareReleaseVersions(a: string, b: string): number {
  const parse = (version: string) => {
    const fork = /^(\d+)\.(\d+)\.(\d+)-orca\.(\d+)$/.exec(version)
    const core = version
      .split("-")[0]
      .split(".")
      .map((part) => Number.parseInt(part, 10) || 0)
    return {
      core,
      forkRevision: fork ? Number.parseInt(fork[4], 10) : 0,
    }
  }
  const left = parse(a)
  const right = parse(b)
  for (let index = 0; index < Math.max(left.core.length, right.core.length); index += 1) {
    const diff = (left.core[index] ?? 0) - (right.core[index] ?? 0)
    if (diff !== 0) return diff
  }
  return left.forkRevision - right.forkRevision
}

export function validateReleasePleaseConfig(
  config: ReleasePleaseConfig,
  manifest: ReleasePleaseManifest = {},
): string[] {
  const errors: string[] = []

  for (const [packagePath, packageConfig] of Object.entries(config.packages)) {
    const releaseAs = packageConfig["release-as"]
    if (releaseAs) {
      // A release-as pin is only legitimate as a one-shot forward override: it
      // must be strictly ahead of the released version so it drives exactly one
      // release. Once that release ships, the released version catches up to the
      // pin, and this check then fails on the next PR -- forcing cleanup. This
      // is what bit the repo in #674: a pin left behind at-or-below the released
      // version silently re-pins (freezes) every subsequent release.
      //
      // `released` is the base-branch (main) version. If it is unknown (e.g. the
      // base manifest could not be read), we cannot prove the pin is stale, so
      // we allow it rather than risk blocking a legitimate release.
      const released = manifest[packagePath]
      if (released !== undefined && compareReleaseVersions(releaseAs, released) <= 0) {
        errors.push(
          `Package "${packagePath}" uses a stale release-as pin "${releaseAs}" that is not ahead of the released version "${released}". Remove release-as after the pinned release ships so future releases can bump normally.`,
        )
      }
    }

    const changelogPath = packageConfig["changelog-path"]
    if (!changelogPath) continue

    const normalized = path.posix.normalize(changelogPath)
    const segments = normalized.split("/")
    if (segments.includes("..")) {
      errors.push(
        `Package "${packagePath}" uses an unsupported changelog-path "${changelogPath}". release-please does not allow upward-relative paths like "../".`,
      )
    }
  }

  return errors
}
