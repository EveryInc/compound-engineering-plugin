export function acquire(lock) {
  for (let attempt = 0; attempt < 2; attempt++) {
    if (lock.tryAcquire()) return true
  }
  return false
}

export const JOB_TIMEOUT_MS = 30_000
