import fs from "node:fs"
import path from "node:path"

const BUNDLED = {
  "no-console": { pattern: /\bconsole\.\w+\(/, message: "Unexpected console call." },
  "no-parse-float": { pattern: /\bparseFloat\(/, message: "Unexpected parseFloat call." },
  "no-sync-fs": { pattern: /\b\w+Sync\(/, message: "Unexpected synchronous call." },
}

const root = process.argv[2] ?? "."
const read = (file) => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"))
const config = read("lint.config.json")
const baseline = read("lint-baseline.json")

const rules = Object.entries(config.rules)
  .filter(([, setting]) => setting.severity !== "off")
  .map(([id, setting]) => ({ id, ...BUNDLED[id], ...setting }))
for (const file of config.customRules) {
  const { default: rule } = await import(path.resolve(root, file))
  rules.push({ severity: "error", ...rule })
}

const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    return entry.isDirectory() ? walk(full) : full.endsWith(".js") ? [full] : []
  })

let errors = 0
for (const full of walk(path.join(root, "src"))) {
  const file = path.relative(root, full)
  const source = fs.readFileSync(full, "utf8")
  for (const rule of rules) {
    if (!rule.paths.some((prefix) => file.startsWith(prefix))) continue
    const count = source.split("\n").filter((line) => rule.pattern.test(line)).length
    const allowed = baseline.find((entry) => entry.rule === rule.id && entry.file === file)?.count ?? 0
    if (count <= allowed) continue
    console.log(`${file}: ${rule.severity}: ${rule.message} (${rule.id})`)
    if (rule.severity === "error") errors += 1
  }
}
process.exit(errors ? 1 : 0)
