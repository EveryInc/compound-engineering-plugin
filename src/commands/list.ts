import path from "path"
import { promises as fs } from "fs"
import { defineCommand } from "citty"
import { pathExists } from "../utils/files"

export default defineCommand({
  meta: {
    name: "list",
    description: "List available Claude plugins in this repository",
  },
  async run() {
    const root = process.cwd()
    const plugins: string[] = []

    const rootManifestPath = path.join(root, ".claude-plugin", "plugin.json")
    if (await pathExists(rootManifestPath)) {
      const manifest = JSON.parse(await fs.readFile(rootManifestPath, "utf8")) as { name?: string }
      plugins.push(manifest.name ?? path.basename(root))
    }

    const pluginsDir = path.join(root, "plugins")
    if (await pathExists(pluginsDir)) {
      const entries = await fs.readdir(pluginsDir, { withFileTypes: true })
      for (const entry of entries) {
        if (!entry.isDirectory()) continue
        const manifestPath = path.join(pluginsDir, entry.name, ".claude-plugin", "plugin.json")
        if (await pathExists(manifestPath)) {
          plugins.push(entry.name)
        }
      }
    }

    if (plugins.length === 0) {
      console.log("No Claude plugins found.")
      return
    }

    const uniquePlugins = [...new Set(plugins)]
    console.log(uniquePlugins.sort().join("\n"))
  },
})
