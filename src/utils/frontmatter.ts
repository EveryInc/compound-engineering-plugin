import { load } from "js-yaml"

export type FrontmatterResult = {
  data: Record<string, unknown>
  body: string
}

export function parseFrontmatter(raw: string, sourcePath?: string): FrontmatterResult {
  const lines = raw.split(/\r?\n/)
  if (lines.length === 0 || lines[0].trim() !== "---") {
    return { data: {}, body: raw }
  }

  let endIndex = -1
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i].trim() === "---") {
      endIndex = i
      break
    }
  }

  if (endIndex === -1) {
    return { data: {}, body: raw }
  }

  const yamlText = lines.slice(1, endIndex).join("\n")
  const body = lines.slice(endIndex + 1).join("\n")
  try {
    const parsed = load(yamlText)
    const data = (parsed && typeof parsed === "object") ? (parsed as Record<string, unknown>) : {}
    return { data, body }
  } catch (err) {
    const location = sourcePath ? ` in ${sourcePath}` : ""
    const hint = "Tip: quote frontmatter values containing colons (e.g. description: 'Use for X: Y')"
    throw new Error(`Invalid YAML frontmatter${location}: ${err instanceof Error ? err.message : err}\n${hint}`)
  }
}

export function formatFrontmatter(data: Record<string, unknown>, body: string): string {
  const yaml = Object.entries(data)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => formatYamlLine(key, value))
    .join("\n")

  if (yaml.trim().length === 0) {
    return body
  }

  return [`---`, yaml, `---`, "", body].join("\n")
}

function formatYamlLine(key: string, value: unknown): string {
  if (Array.isArray(value)) {
    const items = value.map((item) => `  - ${formatYamlValue(item)}`)
    return [key + ":", ...items].join("\n")
  }
  return `${key}: ${formatYamlValue(value)}`
}

export function formatYamlValue(value: unknown): string {
  if (value === null || value === undefined) return ""
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  const raw = String(value)
  if (raw.includes("\n")) {
    return `|\n${raw.split("\n").map((line) => `  ${line}`).join("\n")}`
  }
  if (needsYamlQuoting(raw)) {
    return JSON.stringify(raw)
  }
  return raw
}

const YAML_BOOLEAN_TOKENS = new Set([
  "yes", "no", "y", "n", "true", "false", "on", "off", "null", "~",
])

const YAML_INDICATOR_PREFIXES = ["!", "&", "*", ">", "|", "%", "@", "`", "#"]

function needsYamlQuoting(raw: string): boolean {
  if (raw.length === 0) return true
  if (raw.includes(":") || raw.includes("#")) return true
  if (raw.startsWith("[") || raw.startsWith("{") || raw.startsWith('"') || raw.startsWith("'")) return true
  if (YAML_INDICATOR_PREFIXES.some((p) => raw.startsWith(p))) return true
  if (raw.startsWith(" ") || raw.endsWith(" ")) return true
  if (YAML_BOOLEAN_TOKENS.has(raw.toLowerCase())) return true
  // Numeric-looking strings ('1.0', '0x10', '0b11', '0o7') that YAML 1.1
  // would coerce away from string. Quote to preserve the string literal.
  if (/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(raw)) return true
  if (/^0[xXbBoO][0-9a-fA-F]+$/.test(raw)) return true
  return false
}
