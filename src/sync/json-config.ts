import path from "path"
import { pathExists, writeJsonSecureIfChanged, captureTextFileSnapshot, restoreTextFileSnapshot } from "../utils/files"

type JsonObject = Record<string, unknown>

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export async function mergeJsonConfigAtKey(options: {
  configPath: string
  key: string
  incoming: Record<string, unknown>
  replaceKeys?: string[]
  snapshotOnWrite?: boolean
}): Promise<{ didWrite: boolean; isEmpty: boolean }> {
  const { configPath, key, incoming, replaceKeys = [], snapshotOnWrite = true } = options
  const existingText = await pathExists(configPath) ? await readTextFileSafe(configPath) : null
  const existing = readJsonObjectSafe(existingText, configPath)
  const existingEntries = isJsonObject(existing[key]) ? { ...existing[key] } : {}
  for (const replaceKey of replaceKeys) {
    delete existingEntries[replaceKey]
  }
  const mergedEntries = {
    ...existingEntries,
    ...incoming,
  }
  const merged = {
    ...existing,
    [key]: mergedEntries,
  }

  if (Object.keys(mergedEntries).length === 0) {
    delete merged[key]
  }

  const nextText = JSON.stringify(merged, null, 2) + "\n"
  if (existingText === nextText) {
    return {
      didWrite: false,
      isEmpty: Object.keys(merged).length === 0,
    }
  }

  const snapshot = snapshotOnWrite ? await captureTextFileSnapshot(configPath) : null

  try {
    return {
      didWrite: await writeJsonSecureIfChanged(configPath, merged),
      isEmpty: Object.keys(merged).length === 0,
    }
  } catch (error) {
    if (snapshot) {
      await restoreTextFileSnapshot(snapshot)
    }
    throw error
  }
}

function readJsonObjectSafe(existingText: string | null, configPath: string): JsonObject {
  if (existingText === null) {
    return {}
  }

  try {
    const parsed = JSON.parse(existingText) as unknown
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

async function readTextFileSafe(configPath: string): Promise<string | null> {
  try {
    return await Bun.file(configPath).text()
  } catch {
    return null
  }
}
