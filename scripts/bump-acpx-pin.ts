// Rewrites every copy of the acpx pin and the adapter specs ce-setup warms.
// Usage: bun scripts/bump-acpx-pin.ts --version <x.y.z> (--from-package <dir> | --adapter-specs "<specs>") [--root <dir>]
// --from-package reads an extracted acpx package as text; it never executes it.
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import path from "node:path"
import { parseArgs } from "node:util"

const SEMVER = /^\d+\.\d+\.\d+$/
const PIN_FILE = "tests/helpers/acpx-pin.ts"
const PIN_LINE = /^export const ACPX_PIN = "(\d+\.\d+\.\d+)"$/
const VERSION_LINE = /^ACPX_VERSION="(\d+\.\d+\.\d+)"$/
const SPECS_LINE = /^ACPX_ADAPTER_SPECS="(\S+(?: \S+)*)"$/
const ADAPTERS = ["codex", "claude"] as const
// The specs come from an untrusted package and land in a double-quoted bash
// assignment that check-health later expands unquoted, so accept only a plain
// `[@scope/]name@range`: no $, backtick, quote, backslash, glob, or space.
const ADAPTER_SPEC = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*@[0-9A-Za-z.^~<>=-]+$/

export type BumpResult = {
  oldVersion: string
  newVersion: string
  oldSpecs: string
  newSpecs: string
  changedFiles: string[]
}

export function adapterSpecsFromPackage(packageDir: string, version: string): string {
  const manifest = JSON.parse(readFileSync(path.join(packageDir, "package.json"), "utf8"))
  if (manifest.version !== version) {
    throw new Error(`${packageDir} is acpx ${manifest.version}, expected ${version}`)
  }
  const dist = path.join(packageDir, "dist")
  const registries = readdirSync(dist).filter((name) => /^agent-registry-.*\.js$/.test(name))
  if (registries.length !== 1) {
    throw new Error(`expected one dist/agent-registry-*.js in ${packageDir}, found ${registries.length}`)
  }
  const source = readFileSync(path.join(dist, registries[0]), "utf8")
  const ranges = source.match(/const ACP_ADAPTER_PACKAGE_RANGES = \{([^}]*)\}/)
  if (!ranges) throw new Error(`ACP_ADAPTER_PACKAGE_RANGES not found in ${registries[0]}`)
  return ADAPTERS.map((adapter) => {
    const range = ranges[1].match(new RegExp(`\\b${adapter}: "([^"]+)"`))
    const name = source.match(
      new RegExp(`packageName: "([^"]+)",\\s*packageRange: ACP_ADAPTER_PACKAGE_RANGES\\.${adapter}\\b`),
    )
    if (!range || !name) throw new Error(`${adapter} adapter package or range not found in ${registries[0]}`)
    return `${name[1]}@${range[1]}`
  }).join(" ")
}

function scriptFiles(dir: string, insideScripts = false): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) return scriptFiles(full, insideScripts || name === "scripts")
    return insideScripts ? [full] : []
  })
}

// Rewrites the one line in `content` that assigns `key`; any other shape of that assignment is an error.
function rewrite(content: string, file: string, key: RegExp, exact: RegExp, replacement: string) {
  const lines = content.split("\n")
  const hits = lines.flatMap((line, i) => (key.test(line) ? [i] : []))
  if (hits.length === 0) return null
  if (hits.length > 1) throw new Error(`${file}: ${hits.length} assignments of the same pin; expected one`)
  const match = lines[hits[0]].match(exact)
  if (!match) throw new Error(`${file}:${hits[0] + 1}: unexpected pin format: ${lines[hits[0]]}`)
  const old = match[1]
  lines[hits[0]] = lines[hits[0]].replace(old, () => replacement)
  return { old, content: lines.join("\n") }
}

export function bumpAcpxPin(root: string, newVersion: string, newSpecs: string): BumpResult {
  if (!SEMVER.test(newVersion)) throw new Error(`--version must be x.y.z, got ${JSON.stringify(newVersion)}`)
  if (!newSpecs.split(" ").every((spec) => ADAPTER_SPEC.test(spec))) {
    throw new Error(`malformed adapter specs: ${JSON.stringify(newSpecs)}`)
  }

  let scriptPins = 0
  const versions = new Set<string>()
  const specs = new Set<string>()
  const updates = new Map<string, string>()

  for (const file of scriptFiles(path.join(root, "skills"))) {
    const rel = path.relative(root, file)
    let content = readFileSync(file, "utf8")
    const version = rewrite(content, rel, /^\s*(export\s+)?ACPX_VERSION=/, VERSION_LINE, newVersion)
    if (version) {
      scriptPins++
      versions.add(version.old)
      content = version.content
    }
    const spec = rewrite(content, rel, /^\s*(export\s+)?ACPX_ADAPTER_SPECS=/, SPECS_LINE, newSpecs)
    if (spec) {
      specs.add(spec.old)
      content = spec.content
    }
    if (version || spec) updates.set(file, content)
  }

  const pinFile = path.join(root, PIN_FILE)
  const pin = rewrite(readFileSync(pinFile, "utf8"), PIN_FILE, /^\s*(export\s+)?(const|let|var)\s+ACPX_PIN\b/, PIN_LINE, newVersion)
  if (!pin) throw new Error(`${PIN_FILE}: ACPX_PIN not found`)
  versions.add(pin.old)
  updates.set(pinFile, pin.content)

  if (scriptPins === 0) throw new Error("no ACPX_VERSION copy found under skills/**/scripts/")
  if (specs.size === 0) throw new Error("no ACPX_ADAPTER_SPECS copy found under skills/**/scripts/")
  if (versions.size > 1) throw new Error(`pin copies disagree: ${[...versions].join(", ")}`)
  if (specs.size > 1) throw new Error(`adapter spec copies disagree: ${[...specs].join(" | ")}`)

  const changedFiles: string[] = []
  for (const [file, content] of updates) {
    if (content === readFileSync(file, "utf8")) continue
    writeFileSync(file, content)
    changedFiles.push(path.relative(root, file))
  }
  return { oldVersion: [...versions][0], newVersion, oldSpecs: [...specs][0], newSpecs, changedFiles: changedFiles.sort() }
}

function specName(spec: string) {
  return spec.slice(0, spec.lastIndexOf("@"))
}

export function describeBump(result: BumpResult): string {
  const old = new Map(result.oldSpecs.split(" ").map((spec) => [specName(spec), spec]))
  const lines = [`acpx: ${result.oldVersion} -> ${result.newVersion}`, "", "Adapter specs:"]
  for (const spec of result.newSpecs.split(" ")) {
    const previous = old.get(specName(spec))
    lines.push(previous === spec ? `- \`${spec}\` (unchanged)` : `- \`${spec}\` (changed, was \`${previous ?? "absent"}\`)`)
  }
  lines.push("", "Files changed:")
  lines.push(...(result.changedFiles.length ? result.changedFiles.map((file) => `- \`${file}\``) : ["- none"]))
  return lines.join("\n")
}

if (import.meta.main) {
  try {
    const { values } = parseArgs({
      options: {
        version: { type: "string" },
        "adapter-specs": { type: "string" },
        "from-package": { type: "string" },
        root: { type: "string", default: process.cwd() },
      },
    })
    if (!values.version) throw new Error("--version is required")
    if (!values["adapter-specs"] === !values["from-package"]) {
      throw new Error("pass exactly one of --adapter-specs or --from-package")
    }
    const specs = values["adapter-specs"] ?? adapterSpecsFromPackage(values["from-package"]!, values.version)
    console.log(describeBump(bumpAcpxPin(values.root!, values.version, specs)))
  } catch (error) {
    console.error(`bump-acpx-pin: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  }
}
