import os from "os"
import path from "path"

export function expandHome(value: string): string {
  if (value === "~") return os.homedir()
  if (value.startsWith(`~${path.sep}`)) {
    return path.join(os.homedir(), value.slice(2))
  }
  return value
}

export function resolveTargetHome(value: unknown, defaultPath: string): string {
  if (!value) return defaultPath
  const raw = String(value).trim()
  if (!raw) return defaultPath
  return path.resolve(expandHome(raw))
}

export function resolveCodexHome(value: unknown): string {
  const defaultPath = process.env.CODEX_HOME?.trim() || path.join(os.homedir(), ".codex")
  return resolveTargetHome(value, path.resolve(expandHome(defaultPath)))
}
