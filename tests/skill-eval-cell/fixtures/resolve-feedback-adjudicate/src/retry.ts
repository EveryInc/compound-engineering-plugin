// Retries stop at 3 on purpose: the upstream rate limiter bans clients that
// retry more than 3 times inside a minute (see docs/decisions/0007-retry-cap.md).
export const MAX_RETRIES = 3

export function shouldRetry(attempt: number, status: number): boolean {
  if (attempt >= MAX_RETRIES) return false
  return status === 429 || status >= 500
}

export function backoffMs(attempt: number): number {
  return 200 * 2 ** attempt
}
