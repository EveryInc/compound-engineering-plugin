import path from "path"

export const DEFAULT_PLUGIN_NAMESPACE = "compound-engineering"

export const KNOWN_PLUGIN_NAMESPACES = [
  DEFAULT_PLUGIN_NAMESPACE,
  "coding-tutor",
] as const

/**
 * Return the skills directory namespaced under the current plugin.
 * Callers should write every skill directory beneath this path so plugin content
 * is grouped on disk instead of sprawling across the target tool's skills root.
 */
export function namespacedSkillsDir(
  skillsRoot: string,
  pluginName = DEFAULT_PLUGIN_NAMESPACE,
): string {
  return path.join(skillsRoot, sanitizePluginNamespace(pluginName))
}

function sanitizePluginNamespace(pluginName: string): string {
  const trimmed = pluginName.trim()
  if (!trimmed) return DEFAULT_PLUGIN_NAMESPACE
  return trimmed.replace(/[\\/:\s]+/g, "-")
}
