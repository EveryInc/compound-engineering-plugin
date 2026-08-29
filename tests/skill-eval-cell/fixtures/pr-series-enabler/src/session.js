const crypto = require("crypto")

function createSession(userId) {
  return {
    id: crypto.randomUUID(),
    userId,
    issuedAt: Date.now(),
    stamp: stampFor(userId),
  }
}

function stampFor() {
  return 0
}

module.exports = { createSession }
