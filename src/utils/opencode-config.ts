import os from "os"
import path from "path"
import { expandHome } from "./resolve-home"

/**
 * Resolve the OpenCode global-config root.
 *
 * Order of precedence:
 *   1. `OPENCODE_CONFIG_DIR` environment variable (NixOS, Docker, non-default
 *      `XDG_CONFIG_HOME` setups).
 *   2. `~/.config/opencode` (XDG default).
 *
 * See: https://opencode.ai/docs/config/
 *
 * Both `install` and `cleanup` must agree on this resolution so that an
 * install at `OPENCODE_CONFIG_DIR=/custom/path` is later cleaned at the same
 * location.
 */
export function resolveOpenCodeGlobalRoot(): string {
  const envDir = process.env.OPENCODE_CONFIG_DIR?.trim()
  if (envDir) {
    return path.resolve(expandHome(envDir))
  }
  return path.join(os.homedir(), ".config", "opencode")
}
