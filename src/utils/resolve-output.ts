import os from "os"
import path from "path"
import type { TargetScope } from "../targets"

export function resolveTargetOutputRoot(options: {
  targetName: string
  outputRoot: string
  codexHome: string
  piHome: string
  hasExplicitOutput: boolean
  scope?: TargetScope
}): string {
  const { targetName, outputRoot, codexHome, piHome, hasExplicitOutput, scope } = options
  if (targetName === "codex") return codexHome
  if (targetName === "pi") return piHome
  if (targetName === "droid") return path.join(os.homedir(), ".factory")
  if (targetName === "cursor") {
    const base = hasExplicitOutput ? outputRoot : process.cwd()
    return path.join(base, ".cursor")
  }
  if (targetName === "gemini") {
    const base = hasExplicitOutput ? outputRoot : process.cwd()
    return path.join(base, ".gemini")
  }
  if (targetName === "copilot") {
    const base = hasExplicitOutput ? outputRoot : process.cwd()
    return path.join(base, ".github")
  }
  if (targetName === "kiro") {
    const base = hasExplicitOutput ? outputRoot : process.cwd()
    return path.join(base, ".kiro")
  }
  if (targetName === "windsurf") {
    if (hasExplicitOutput) return outputRoot
    if (scope === "global") return path.join(os.homedir(), ".codeium", "windsurf")
    return path.join(process.cwd(), ".windsurf")
  }
  return outputRoot
}
