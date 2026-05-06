import os from "os"
import path from "path"
import { pathExists } from "./files"
import { resolveOpenCodeGlobalRoot } from "./opencode-config"

export type DetectedTool = {
  name: string
  detected: boolean
  reason: string
}

type DetectableTool = {
  name: string
  detectPaths: (home: string, cwd: string) => string[]
}

const detectableTools: DetectableTool[] = [
  {
    name: "opencode",
    detectPaths: (home, cwd) => {
      // Resolve the OpenCode global root through the shared helper so that
      // detection agrees with install/cleanup on `OPENCODE_CONFIG_DIR`. When
      // the env var is unset, the helper falls back to `os.homedir()`, which
      // may differ from the `home` arg threaded through for testability; in
      // that case prefer the explicit `home` param so existing callers that
      // override it keep working.
      const envDir = process.env.OPENCODE_CONFIG_DIR?.trim()
      const globalRoot = envDir
        ? resolveOpenCodeGlobalRoot()
        : path.join(home, ".config", "opencode")
      return [globalRoot, path.join(cwd, ".opencode")]
    },
  },
  {
    name: "codex",
    detectPaths: (home) => [path.join(home, ".codex")],
  },
  {
    name: "pi",
    detectPaths: (home) => [path.join(home, ".pi")],
  },
  {
    name: "droid",
    detectPaths: (home) => [path.join(home, ".factory")],
  },
  {
    name: "copilot",
    detectPaths: (home, cwd) => [
      path.join(home, ".copilot"),
      path.join(cwd, ".github", "skills"),
      path.join(cwd, ".github", "agents"),
      path.join(cwd, ".github", "copilot-instructions.md"),
    ],
  },
  {
    name: "gemini",
    detectPaths: (home, cwd) => [
      path.join(cwd, ".gemini"),
      path.join(home, ".gemini"),
    ],
  },
  {
    name: "kiro",
    detectPaths: (home, cwd) => [
      path.join(home, ".kiro"),
      path.join(cwd, ".kiro"),
    ],
  },
  {
    name: "qwen",
    detectPaths: (home, cwd) => [
      path.join(home, ".qwen"),
      path.join(cwd, ".qwen"),
    ],
  },
]

export async function detectInstalledTools(
  home: string = os.homedir(),
  cwd: string = process.cwd(),
): Promise<DetectedTool[]> {
  const results: DetectedTool[] = []
  for (const target of detectableTools) {
    let detected = false
    let reason = "not found"
    for (const p of target.detectPaths(home, cwd)) {
      if (await pathExists(p)) {
        detected = true
        reason = `found ${p}`
        break
      }
    }
    results.push({ name: target.name, detected, reason })
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
