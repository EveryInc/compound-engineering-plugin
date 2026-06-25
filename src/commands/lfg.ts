import { defineCommand } from "citty"

const CODEX_BIN_ENV = "COMPOUND_ENGINEERING_CODEX_BIN"

function buildLfgPrompt(featureDescription: string): string {
  const trimmed = featureDescription.trim()
  return [
    "$compound-engineering:lfg",
    "",
    trimmed,
  ].join("\n").trimEnd()
}

export default defineCommand({
  meta: {
    name: "lfg",
    description: "Run the Compound Engineering LFG pipeline through Codex",
  },
  async run({ rawArgs }) {
    const codexBin = process.env[CODEX_BIN_ENV] || "codex"
    const featureDescription = rawArgs.join(" ")
    const prompt = buildLfgPrompt(featureDescription)

    let proc: Bun.Subprocess<"pipe", "inherit", "inherit">
    try {
      proc = Bun.spawn([codexBin, "exec", "-C", process.cwd(), "-"], {
        stdin: "pipe",
        stdout: "inherit",
        stderr: "inherit",
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to start ${codexBin} for compound-engineering:lfg: ${message}`)
    }

    proc.stdin.write(prompt)
    proc.stdin.end()

    const exitCode = await proc.exited
    if (exitCode !== 0) {
      throw new Error(`${codexBin} exited with code ${exitCode} while running compound-engineering:lfg`)
    }
  },
})
