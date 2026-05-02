import path from "path"
import type { TargetScope } from "../targets"
import { resolveOpenCodeGlobalRoot } from "./opencode-config"

export function resolveTargetOutputRoot(options: {
  targetName: string
  outputRoot: string
  codexHome: string
  piHome: string
  pluginName?: string
  hasExplicitOutput: boolean
  scope?: TargetScope
  hermesHome?: string
}): string {
  const { targetName, outputRoot, codexHome, piHome, hasExplicitOutput, hermesHome } = options
  if (targetName === "codex") return codexHome
  if (targetName === "pi") return piHome
  if (targetName === "hermes") {
    // Hermes accepts both home-rooted (`~/.hermes`) and workspace-rooted
    // (`<cwd>/.hermes`) install locations. When the user provides
    // `--hermes-home`, honor it as authoritative. Otherwise fall back to the
    // workspace `<cwd>/.hermes/` (or `<--output>/.hermes` when `--output`
    // is set without `--hermes-home`).
    if (hermesHome) return hermesHome
    const base = hasExplicitOutput ? outputRoot : process.cwd()
    return path.join(base, ".hermes")
  }
  if (targetName === "gemini") {
    const base = hasExplicitOutput ? outputRoot : process.cwd()
    return path.join(base, ".gemini")
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
