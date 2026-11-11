import { mkdirSync, writeFileSync } from "fs"
import path from "path"

/**
 * A Compound Pack rule file the resolver accepts: frontmatter with `title` and
 * an `applies_when` list. The body is inert for every consumer under test.
 */
export function knowledgeFile(title: string, condition = "always"): string {
  return `---\ntitle: ${title}\napplies_when:\n  - ${condition}\n---\n\nRule body for ${title}.\n`
}

export function writeKnowledgeFile(dir: string, name: string, title: string, condition?: string): void {
  mkdirSync(dir, { recursive: true })
  writeFileSync(path.join(dir, name), knowledgeFile(title, condition))
}

/** Git env that ignores the contributor's global/system config (signing hooks, fsmonitor). */
export const isolatedGitEnv = {
  ...process.env,
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_SYSTEM: "/dev/null",
}
