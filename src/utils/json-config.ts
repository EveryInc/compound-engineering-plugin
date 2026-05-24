import path from "path"
import { pathExists, readJson, writeJsonSecure } from "./files"

type JsonObject = Record<string, unknown>

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export async function mergeJsonConfigAtKey(options: {
  configPath: string
  key: string
  incoming: Record<string, unknown>
}): Promise<void> {
  const { configPath, key, incoming } = options
  const existing = await readJsonObjectSafe(configPath)
  const existingEntries = isJsonObject(existing[key]) ? existing[key] : {}
  const merged = {
    ...existing,
    [key]: {
      ...existingEntries,
      ...incoming,
    },
  }

  await writeJsonSecure(configPath, merged)
}

async function readJsonObjectSafe(configPath: string): Promise<JsonObject> {
  if (!(await pathExists(configPath))) {
    return {}
  }

  try {
    const parsed = await readJson<unknown>(configPath)
    if (isJsonObject(parsed)) {
      return parsed
    }
  } catch {
    // Fall through to warning and replacement.
  }

  console.warn(
    `Warning: existing ${path.basename(configPath)} could not be parsed and will be replaced.`,
  )
  return {}
}
