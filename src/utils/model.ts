/**
 * Shared model normalization utilities for cross-platform conversion.
 *
 * Claude Code uses bare family aliases (`model: sonnet`) that must be
 * resolved differently depending on the target platform.
 */

/**
 * Bare Claude family aliases used in Claude Code (e.g. `model: haiku`).
 * Maps alias -> canonical model name (without provider prefix).
 * Update these when new model generations are released.
 */
export const CLAUDE_FAMILY_ALIASES: Record<string, string> = {
  haiku: "claude-haiku-4-5",
  sonnet: "claude-sonnet-4-6",
  opus: "claude-opus-4-6",
}

/**
 * Resolve a bare Claude family alias to its canonical model name.
 * Returns the input unchanged if not a recognized alias.
 *
 * "sonnet" -> "claude-sonnet-4-6"
 * "claude-sonnet-4-20250514" -> "claude-sonnet-4-20250514" (unchanged)
 */
export function resolveClaudeFamilyAlias(model: string): string {
  return CLAUDE_FAMILY_ALIASES[model] ?? model
}

/**
 * Add a provider prefix based on model naming conventions.
 * Returns the input unchanged if already prefixed (contains "/").
 *
 * "claude-sonnet-4-6" -> "anthropic/claude-sonnet-4-6"
 * "gpt-5.4"           -> "openai/gpt-5.4"
 * "gemini-2.0"        -> "google/gemini-2.0"
 * "minimax-m2.7"      -> "minimax/minimax-m2.7"
 * "anthropic/foo"     -> "anthropic/foo" (unchanged)
 */
export function addProviderPrefix(model: string): string {
  if (model.includes("/")) return model
  if (/^claude-/.test(model)) return `anthropic/${model}`
  if (/^(gpt-|o1-|o3-)/.test(model)) return `openai/${model}`
  if (/^gemini-/.test(model)) return `google/${model}`
  if (/^qwen-/.test(model)) return `qwen/${model}`
  if (/^minimax-/i.test(model)) return `minimax/${model}`
  return `anthropic/${model}`
}

/**
 * Normalize a model for targets that use provider-prefixed IDs
 * (OpenCode, OpenClaw). Resolves bare aliases and adds provider prefix.
 *
 * "sonnet"                  -> "anthropic/claude-sonnet-4-6"
 * "claude-sonnet-4-20250514" -> "anthropic/claude-sonnet-4-20250514"
 * "anthropic/claude-opus"    -> "anthropic/claude-opus" (unchanged)
 */
export function normalizeModelWithProvider(model: string): string {
  if (model.includes("/")) return model
  const resolved = resolveClaudeFamilyAlias(model)
  if (resolved !== model) {
    console.warn(
      `Warning: bare model alias "${model}" mapped to "anthropic/${resolved}". ` +
        `Update CLAUDE_FAMILY_ALIASES if a newer version is available.`,
    )
  }
  return addProviderPrefix(resolved)
}

