import path from "path"
import type { TargetScope } from "../targets"
import { resolveOpenCodeGlobalRoot } from "./opencode-config"

export function resolveTargetOutputRoot(options: {
  targetName: string
  outputRoot: string
  codexHome: string
  codebuddyHome: string
  piHome: string
  pluginName?: string
  hasExplicitOutput: boolean
  scope?: TargetScope
}): string {
  const { targetName, outputRoot, codexHome, codebuddyHome, piHome, hasExplicitOutput } = options
  if (targetName === "codex") return codexHome
  if (targetName === "codebuddy") return codebuddyHome
  if (targetName === "pi") return piHome
  if (targetName === "antigravity") {
    const base = hasExplicitOutput ? outputRoot : process.cwd()
    return path.join(base, ".agy")
  }
  if (targetName === "kiro") {
    const base = hasExplicitOutput ? outputRoot : process.cwd()
    return path.join(base, ".kiro")
  }
  if (targetName === "opencode") {
    // Without an explicit --output, default to the OpenCode global-config root
    // (OPENCODE_CONFIG_DIR or ~/.config/opencode). With an explicit --output,
    // honor it as a workspace root and let the writer nest under .opencode/.
    if (!hasExplicitOutput) return resolveOpenCodeGlobalRoot()
    return outputRoot
  }
  return outputRoot
}

/**
 * Returns "global" when the OpenCode writer should use the flat global-config
 * layout (no `.opencode/` nesting). This is the case when the user did not
 * pass `--output` and did not pass an explicit `--scope`. Returns the
 * caller's requested scope otherwise so explicit `--scope workspace` still
 * wins.
 */
export function resolveOpenCodeWriteScope(
  hasExplicitOutput: boolean,
  requestedScope: TargetScope | undefined,
): TargetScope | undefined {
  if (requestedScope !== undefined) return requestedScope
  if (!hasExplicitOutput) return "global"
  return undefined
}
