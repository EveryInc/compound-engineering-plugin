const crypto = require("crypto")
const { currentStamp } = require("./session-stamp")

function createSession(userId) {
  return {
    id: crypto.randomUUID(),
    userId,
    issuedAt: Date.now(),
    stamp: currentStamp(userId),
  }
}

module.exports = { createSession }
