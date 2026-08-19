export function arg(flag: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(flag)
  if (i === -1) return fallback
  return process.argv[i + 1]
}

export function flag(name: string): boolean {
  return process.argv.includes(name)
}
