import { defineCommand } from "citty"
import { promises as fs } from "fs"
import os from "os"
import path from "path"

export default defineCommand({
  meta: {
    name: "plugin-path",
    description: "Checkout a plugin branch to a stable local path for use with claude --plugin-dir",
  },
  args: {
    plugin: {
      type: "positional",
      required: true,
      description: "Plugin name (e.g. compound-engineering)",
    },
    branch: {
      type: "string",
      required: true,
      description: "Branch name (local or remote, e.g. feat/new-agents)",
    },
  },
  async run({ args }) {
    const pluginName = String(args.plugin)
    const branch = String(args.branch)

    // Reversible encoding: / -> ~ (safe because ~ is illegal in git branch names per
    // git-check-ref-format), then percent-encode any remaining unsafe characters.
    // This is injective — every distinct branch name maps to a distinct cache key.
    const sanitized = branch
      .replace(/\//g, "~")
      .replace(/[^a-zA-Z0-9._~-]/g, (ch) => `%${ch.charCodeAt(0).toString(16).padStart(2, "0")}`)
    const dirName = `${pluginName}-${sanitized}`
    const cacheRoot = path.join(os.homedir(), ".cache", "compound-engineering", "branches")
    await fs.mkdir(cacheRoot, { recursive: true })
    const targetDir = path.join(cacheRoot, dirName)
    const source = resolveGitHubSource()

    if (await dirExists(targetDir)) {
      console.error(`Updating existing checkout at ${targetDir}`)
      await fetchAndCheckout(targetDir, branch)
    } else {
      console.error(`Cloning ${branch} to ${targetDir}`)
      await cloneBranch(source, targetDir, branch)
    }

    const pluginPath = path.join(targetDir, "plugins", pluginName)
    if (!(await dirExists(pluginPath))) {
      throw new Error(`Plugin directory not found: ${pluginPath}`)
    }

    // Plugin path goes to stdout (for scripting); usage hint goes to stderr
    console.error(`\nReady. Use with:\n  claude --plugin-dir ${pluginPath}\n`)
    console.log(pluginPath)
  },
})

async function dirExists(p: string): Promise<boolean> {
  try {
    const stat = await fs.stat(p)
    return stat.isDirectory()
  } catch {
    return false
  }
}

async function cloneBranch(source: string, destination: string, branch: string): Promise<void> {
  const proc = Bun.spawn(["git", "clone", "--depth", "1", "--branch", branch, source, destination], {
    stdout: "pipe",
    stderr: "pipe",
  })
  const exitCode = await proc.exited
  const stderr = await new Response(proc.stderr).text()
  if (exitCode !== 0) {
    throw new Error(`Failed to clone branch '${branch}' from ${source}. ${stderr.trim()}`)
  }
}

async function fetchAndCheckout(repoDir: string, branch: string): Promise<void> {
  const fetch = Bun.spawn(["git", "fetch", "origin", branch], {
    cwd: repoDir,
    stdout: "pipe",
    stderr: "pipe",
  })
  const fetchExit = await fetch.exited
  const fetchErr = await new Response(fetch.stderr).text()
  if (fetchExit !== 0) {
    throw new Error(`Failed to fetch branch '${branch}'. ${fetchErr.trim()}`)
  }

  const reset = Bun.spawn(["git", "reset", "--hard", `origin/${branch}`], {
    cwd: repoDir,
    stdout: "pipe",
    stderr: "pipe",
  })
  const resetExit = await reset.exited
  const resetErr = await new Response(reset.stderr).text()
  if (resetExit !== 0) {
    throw new Error(`Failed to reset to origin/${branch}. ${resetErr.trim()}`)
  }
}

function resolveGitHubSource(): string {
  const override = process.env.COMPOUND_PLUGIN_GITHUB_SOURCE
  if (override && override.trim()) return override.trim()
  return "https://github.com/EveryInc/compound-engineering-plugin"
}
