import { runCodexDevCommand } from "../src/dev/codex-dev"

try {
  process.exitCode = await runCodexDevCommand(process.argv[2] ?? "")
} catch (error) {
  console.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
}
