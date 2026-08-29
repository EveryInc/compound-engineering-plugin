const { currentStamp } = require("./session-stamp")

// Requests carrying a session whose stamp is behind the user's current
// stamp are refused with 401 instead of being served.
function guard(req, res, next) {
  const session = req.session
  if (!session) return next()
  if (session.stamp < currentStamp(session.userId)) {
    res.status(401).json({ error: "session_revoked" })
    return
  }
  next()
}

module.exports = { guard }
