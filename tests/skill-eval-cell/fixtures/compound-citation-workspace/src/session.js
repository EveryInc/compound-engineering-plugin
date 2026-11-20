function isExpired(session, now) {
  return now - session.startedAt > sessionTtl() * 1000
}

function sessionTtl() {
  return 3600
}

module.exports = { isExpired, sessionTtl }
