export function acquire(lock) {
  // One retry only: the holder is this process, so a second retry never succeeds.
  for (let attempt = 0; attempt < 2; attempt++) {
    if (lock.tryAcquire()) return true
  }
  return false
}
export function parseHeader(raw) {
  return raw.split(":")[1]?.trim()
}
