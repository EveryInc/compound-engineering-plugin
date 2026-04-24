import path from "path"

type ReleasePleasePackageConfig = {
  "changelog-path"?: string
  "skip-changelog"?: boolean
  "release-as"?: string
}

type ReleasePleaseConfig = {
  packages: Record<string, ReleasePleasePackageConfig>
}

export function validateReleasePleaseConfig(config: ReleasePleaseConfig): string[] {
  const errors: string[] = []

  for (const [packagePath, packageConfig] of Object.entries(config.packages)) {
    const releaseAs = packageConfig["release-as"]
    if (releaseAs) {
      errors.push(
        `Package "${packagePath}" uses temporary release-as pin "${releaseAs}". Remove release-as after the pinned release ships so future releases can bump normally.`,
      )
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
