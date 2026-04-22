#!/usr/bin/env bun
import { defineCommand, runMain } from "citty"
import path from "path"
import { fileURLToPath } from "url"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const installEntry = path.join(repoRoot, "src", "index.ts")

const main = defineCommand({
  meta: {
    name: "ce-sync",
    description: "Refresh compound-engineering skills across targets using the bundled installer",
  },
  args: {
    to: {
      type: "string",
      default: "all",
      description: "Target format (opencode | codex | droid | cursor | pi | copilot | gemini | kiro | windsurf | openclaw | qwen | all)",
    },
    output: {
      type: "string",
      alias: "o",
      description: "Output directory (project root)",
    },
    branch: {
      type: "string",
      description: "Git branch to clone from (e.g. feat/new-agents)",
    },
  },
  async run({ args }) {
    const childArgs = ["run", installEntry, "install", "compound-engineering", "--to", String(args.to)]

    if (args.output) {
      childArgs.push("--output", String(args.output))
    }
    if (args.branch) {
      childArgs.push("--branch", String(args.branch))
    }

    const proc = Bun.spawn(["bun", ...childArgs], {
      cwd: repoRoot,
      stdout: "pipe",
      stderr: "pipe",
      stdin: "inherit",
    })

    const [exitCode, stdout, stderr] = await Promise.all([
      proc.exited,
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ])

    if (stdout) process.stdout.write(stdout)
    if (stderr) process.stderr.write(stderr)
    if (exitCode !== 0) {
      process.exit(exitCode)
    }
  },
})

runMain(main)
