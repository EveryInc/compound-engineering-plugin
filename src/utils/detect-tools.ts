import os from "os"
import path from "path"
import { pathExists } from "./files"

export type DetectedTool = {
  name: string
  detected: boolean
  reason: string
}

export async function detectInstalledTools(
  home: string = os.homedir(),
  cwd: string = process.cwd(),
): Promise<DetectedTool[]> {
  const checks: Array<{ name: string; paths: string[] }> = [
    { name: "opencode", paths: [path.join(home, ".config", "opencode"), path.join(cwd, ".opencode")] },
    { name: "codex", paths: [path.join(home, ".codex")] },
    { name: "droid", paths: [path.join(home, ".factory")] },
    { name: "cursor", paths: [path.join(cwd, ".cursor"), path.join(home, ".cursor")] },
    { name: "pi", paths: [path.join(home, ".pi")] },
    { name: "gemini", paths: [path.join(cwd, ".gemini"), path.join(home, ".gemini")] },
  ]

  const results: DetectedTool[] = []
  for (const check of checks) {
    let detected = false
    let reason = "not found"
    for (const p of check.paths) {
      if (await pathExists(p)) {
        detected = true
        reason = `found ${p}`
        break
      }
    }
    results.push({ name: check.name, detected, reason })
  }
  return results
}

export async function getDetectedTargetNames(
  home: string = os.homedir(),
  cwd: string = process.cwd(),
): Promise<string[]> {
  const tools = await detectInstalledTools(home, cwd)
  return tools.filter((t) => t.detected).map((t) => t.name)
}
