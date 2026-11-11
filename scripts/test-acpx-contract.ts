import { spawn, spawnSync } from "node:child_process"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
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

export function selectAcpxVersions(supported: string[], range: string | undefined): string[] {
  if (range === undefined || range === "full") return supported
  if (range === "boundaries") return [...new Set([supported[0]!, supported.at(-1)!])]
  throw new Error(`ACPX_CONTRACT_RANGE must be full or boundaries, not ${JSON.stringify(range)}`)
}

function contractRun(version: string): Promise<{ version: string; code: number; output: string }> {
  // npx installs adapters under the npm cache, so parallel runs sharing one cache race on the same install dir.
  const cache = mkdtempSync(path.join(tmpdir(), "acpx-contract-npm-"))
  const finish = (result: { version: string; code: number; output: string }) => {
    rmSync(cache, { recursive: true, force: true })
    return result
  }
  return new Promise((resolve) => {
    const child = spawn("bun", ["test", path.resolve(import.meta.dir, "../tests/acpx-contract.test.ts")], {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, ACPX_CONTRACT: "1", ACPX_VERSION: version, npm_config_cache: cache },
    })
    let output = ""
    child.stdout.on("data", (chunk) => (output += chunk))
    child.stderr.on("data", (chunk) => (output += chunk))
    child.on("error", (error) => resolve(finish({ version, code: 1, output: `${output}${error.message}\n` })))
    child.on("close", (code) => resolve(finish({ version, code: code ?? 1, output })))
  })
}

// Concurrency is safe only because each contract run uses a private HOME and its own npm cache.
async function runAll(versions: string[], jobs: number): Promise<string[]> {
  const queue = [...versions]
  const failed: string[] = []
  const worker = async () => {
    for (let version = queue.shift(); version !== undefined; version = queue.shift()) {
      const run = await contractRun(version)
      process.stdout.write(`Validating acpx@${run.version}\n${run.output}`)
      if (run.code !== 0) failed.push(run.version)
    }
  }
  await Promise.all(Array.from({ length: Math.min(jobs, versions.length) }, worker))
  return failed.sort(compareVersions)
}

if (import.meta.main) {
  try {
    if (process.platform === "win32") throw new Error("the real acpx contract suite requires a POSIX host")
    if (process.argv.length > 2) throw new Error("the complete acpx contract suite does not accept test filters")
    const exact = process.env.ACPX_VERSION
    if (exact !== undefined && process.env.ACPX_MAX_VERSION !== undefined) {
      throw new Error("set either ACPX_VERSION or ACPX_MAX_VERSION, not both")
    }
    const jobs = Number(process.env.ACPX_CONTRACT_JOBS ?? "4")
    if (!Number.isInteger(jobs) || jobs < 1) throw new Error("ACPX_CONTRACT_JOBS must be a positive integer")
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
      const supported = supportedAcpxVersions(JSON.parse(registry.stdout), ACPX_MIN_VERSION, process.env.ACPX_MAX_VERSION ?? ACPX_PIN)
      versions = selectAcpxVersions(supported, process.env.ACPX_CONTRACT_RANGE)
    }
    const failed = await runAll(versions, jobs)
    if (failed.length > 0) throw new Error(`failed for acpx ${failed.join(", ")}`)
    console.log(`Validated ${versions.length} acpx release(s)`)
  } catch (error) {
    console.error(`acpx contract: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  }
}
