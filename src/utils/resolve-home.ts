import os from "os"
import path from "path"

export function expandHome(value: string): string {
  if (value === "~") return os.homedir()
  // Accept the portable "~/" shorthand on every OS in addition to the native
  // separator. On Windows `path.sep` is "\\", so a bare `~${path.sep}` check
  // left "~/x" (the spelling users and config files commonly write) unexpanded
  // and the CLI then treated a literal "~" as a real directory.
  if (value.startsWith("~/") || value.startsWith(`~${path.sep}`)) {
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
