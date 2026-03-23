import path from "path"
import { copySkillDir, ensureDir, resolveCommandPath, writeText } from "../utils/files"
import { transformContentForDroid } from "../converters/claude-to-droid"
import type { DroidBundle } from "../types/droid"

export async function writeDroidBundle(outputRoot: string, bundle: DroidBundle): Promise<void> {
  const paths = resolveDroidPaths(outputRoot)
  await ensureDir(paths.root)

  if (bundle.commands.length > 0) {
    await ensureDir(paths.commandsDir)
    for (const command of bundle.commands) {
      const dest = await resolveCommandPath(paths.commandsDir, command.name, ".md")
      await writeText(dest, command.content + "\n")
    }
  }

  if (bundle.droids.length > 0) {
    await ensureDir(paths.droidsDir)
    for (const droid of bundle.droids) {
      await writeText(path.join(paths.droidsDir, `${droid.name}.md`), droid.content + "\n")
    }
  }

  if (bundle.skillDirs.length > 0) {
    await ensureDir(paths.skillsDir)
    for (const skill of bundle.skillDirs) {
      await copySkillDir(skill.sourceDir, path.join(paths.skillsDir, skill.name), transformContentForDroid)
    }
  }
}

function resolveDroidPaths(outputRoot: string) {
  const base = path.basename(outputRoot)
  // If pointing directly at ~/.factory or .factory, write into it
  if (base === ".factory") {
    return {
      root: outputRoot,
      commandsDir: path.join(outputRoot, "commands"),
      droidsDir: path.join(outputRoot, "droids"),
      skillsDir: path.join(outputRoot, "skills"),
    }
  }

  // Otherwise nest under .factory
  return {
    root: outputRoot,
    commandsDir: path.join(outputRoot, ".factory", "commands"),
    droidsDir: path.join(outputRoot, ".factory", "droids"),
    skillsDir: path.join(outputRoot, ".factory", "skills"),
  }
}
