const DEFAULT_REGION = "us-east"

function regionFor(user) {
  return user.region || DEFAULT_REGION
}

function isExpired(session, now) {
  return now - session.startedAt > sessionTtl() * 1000
}

function sessionTtl() {
  return 3600
}

module.exports = { regionFor, isExpired, sessionTtl }
