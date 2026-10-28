import { spawnSync } from "node:child_process"
import path from "node:path"
import { ACPX_MIN_VERSION, ACPX_PIN } from "../tests/helpers/acpx-pin"

const STABLE_VERSION = /^\d+\.\d+\.\d+$/

export function compareVersions(left: string, right: string): number {
  if (!STABLE_VERSION.test(left) || !STABLE_VERSION.test(right)) {
    throw new Error("acpx versions must be stable x.y.z releases")
  }
  const a = left.split(".").map(Number)
  const b = right.split(".").map(Number)
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i]! - b[i]!
  }
  return 0
}

export function supportedAcpxVersions(versions: unknown, minimum: string, maximum: string): string[] {
  if (compareVersions(minimum, maximum) > 0) throw new Error("acpx minimum exceeds the maximum")
  if (!Array.isArray(versions) || !versions.every((version) => typeof version === "string")) {
    throw new Error("npm returned invalid acpx version metadata")
  }
  const supported = [...new Set(versions.filter((version: string) => STABLE_VERSION.test(version)
    && compareVersions(version, minimum) >= 0 && compareVersions(version, maximum) <= 0))].sort(compareVersions)
  if (!supported.includes(minimum) || !supported.includes(maximum)) {
    throw new Error("npm metadata is missing an acpx compatibility boundary")
  }
  return supported
}

if (import.meta.main) {
  try {
    if (process.platform === "win32") throw new Error("the real acpx contract suite requires a POSIX host")
    if (process.argv.length > 2) throw new Error("the complete acpx contract suite does not accept test filters")
    const exact = process.env.ACPX_VERSION
    if (exact !== undefined && process.env.ACPX_MAX_VERSION !== undefined) {
      throw new Error("set either ACPX_VERSION or ACPX_MAX_VERSION, not both")
    }
    let versions: string[]
    if (exact !== undefined) {
      compareVersions(exact, exact)
      versions = [exact]
    } else {
      const registry = spawnSync("npm", ["view", "acpx", "versions", "--json"], {
        encoding: "utf8",
        env: { ...process.env, npm_config_prefer_offline: "false", npm_config_prefer_online: "true" },
      })
      if (registry.status !== 0) throw new Error(`npm could not list acpx releases (exit ${registry.status})`)
      versions = supportedAcpxVersions(JSON.parse(registry.stdout), ACPX_MIN_VERSION, process.env.ACPX_MAX_VERSION ?? ACPX_PIN)
    }
    for (const version of versions) {
      console.log(`Validating acpx@${version}`)
      const run = spawnSync("bun", ["test", path.resolve(import.meta.dir, "../tests/acpx-contract.test.ts")], {
        stdio: "inherit",
        env: { ...process.env, ACPX_CONTRACT: "1", ACPX_VERSION: version },
      })
      if (run.status !== 0) process.exit(run.status ?? 1)
    }
    console.log(`Validated ${versions.length} acpx release(s)`)
  } catch (error) {
    console.error(`acpx contract: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  }
}
