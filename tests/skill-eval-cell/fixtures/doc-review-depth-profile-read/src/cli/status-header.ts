export function statusHeader(workspace: string, now: Date): string {
  return `[${workspace}] ${now.toISOString().slice(0, 10)}`
}
