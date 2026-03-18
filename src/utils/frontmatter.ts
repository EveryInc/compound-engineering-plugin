import { load } from "js-yaml"

export type FrontmatterResult = {
  data: Record<string, unknown>
  body: string
}

export function parseFrontmatter(raw: string): FrontmatterResult {
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
  const parsed = load(yamlText)
  const data = (parsed && typeof parsed === "object") ? (parsed as Record<string, unknown>) : {}
  return { data, body }
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

function formatYamlValue(value: unknown): string {
  if (value === null || value === undefined) return ""
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  const raw = String(value)
  if (raw.includes("\n")) {
    return `|\n${raw.split("\n").map((line) => `  ${line}`).join("\n")}`
  }
  if (raw.includes(":") || raw.startsWith("[") || raw.startsWith("{") || raw === "*") {
    return JSON.stringify(raw)
  }
  return raw
}
