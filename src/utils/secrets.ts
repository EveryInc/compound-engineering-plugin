export const SENSITIVE_PATTERN = /key|token|secret|password|credential|api_key/i

/** Check if any MCP servers have env vars that might contain secrets */
export function hasPotentialSecrets(
  servers: Record<string, { env?: Record<string, string> }>,
): boolean {
  for (const server of Object.values(servers)) {
    if (server.env) {
      for (const key of Object.keys(server.env)) {
        if (SENSITIVE_PATTERN.test(key)) return true
      }
    }
  }
  return false
}

/** Return names of MCP servers whose env vars may contain secrets */
export function findServersWithPotentialSecrets(
  servers: Record<string, { env?: Record<string, string> }>,
): string[] {
  return Object.entries(servers)
    .filter(([, s]) => s.env && Object.keys(s.env).some((k) => SENSITIVE_PATTERN.test(k)))
    .map(([name]) => name)
}
