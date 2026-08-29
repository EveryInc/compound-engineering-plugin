// Monotonic per-user stamp written onto every issued session.
// Nothing reads it yet.
const stamps = new Map()

function currentStamp(userId) {
  return stamps.get(userId) ?? 0
}

function bumpStamp(userId) {
  const next = currentStamp(userId) + 1
  stamps.set(userId, next)
  return next
}

module.exports = { currentStamp, bumpStamp }
