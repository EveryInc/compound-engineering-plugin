export async function withRetry(operation, attempts = 3) {
  for (let i = 1; ; i++) {
    try {
      return await operation()
    } catch (error) {
      if (i === attempts) throw error
    }
  }
}
