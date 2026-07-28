/**
 * Shared slash-command detection for the plugin converters.
 *
 * kiro rewrote `/etc/hosts` into `the etc skill/hosts` (#1171) because the path
 * allowlist below was byte-copied into every converter and kiro's copy was the
 * one that never got it. Centralising it here stops the next converter from
 * drifting the same way.
 */

/** Single-segment roots that read as `/word` but are filesystem paths, not commands. */
export const SLASH_COMMAND_PATH_ALLOWLIST = [
  "dev",
  "tmp",
  "etc",
  "usr",
  "var",
  "bin",
  "home",
] as const

export function isReservedPathRoot(commandName: string): boolean {
  return (SLASH_COMMAND_PATH_ALLOWLIST as readonly string[]).includes(commandName)
}

/**
 * Detect `/command` references and hand each name to `format` for target-specific
 * rewriting. Reserved path roots and multi-segment paths are left verbatim.
 * copilot, droid and pi share this detector byte for byte; codex and kiro keep
 * their own (a target-map lookup and #1171's callback path-check respectively)
 * and call isReservedPathRoot directly.
 */
export function transformSlashCommands(
  body: string,
  format: (commandName: string) => string,
): string {
  const slashCommandPattern = /(?<![:\w])\/([a-z][a-z0-9_:-]*?)(?=[\s,."')\]}`]|$)/gi
  return body.replace(slashCommandPattern, (match, commandName: string) => {
    if (commandName.includes("/")) return match
    if (isReservedPathRoot(commandName)) return match
    return format(commandName)
  })
}
