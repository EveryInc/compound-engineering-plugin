import path from "path"
import { promises as fs } from "fs"
import { defineCommand } from "citty"
import { pathExists } from "../utils/files"

export default defineCommand({
  meta: {
    name: "list",
    description: "List available Claude plugins under plugins/",
  },
  async run() {
    const root = process.cwd()
    const pluginsDir = path.join(root, "plugins")
    if (!(await pathExists(pluginsDir))) {
      return
    }

    const entries = await fs.readdir(pluginsDir, { withFileTypes: true })
    const plugins: string[] = []

    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const manifestPath = path.join(pluginsDir, entry.name, ".claude-plugin", "plugin.json")
      if (await pathExists(manifestPath)) {
        plugins.push(entry.name)
      }
    }

    if (plugins.length === 0) {
      return
    }

  },
})
