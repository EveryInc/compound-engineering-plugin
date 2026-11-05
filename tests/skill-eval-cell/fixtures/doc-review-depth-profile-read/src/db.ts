export const db = {
  async one(_sql: string, _params: unknown[]): Promise<Record<string, string>> {
    throw new Error("not wired in tests")
  },
}
