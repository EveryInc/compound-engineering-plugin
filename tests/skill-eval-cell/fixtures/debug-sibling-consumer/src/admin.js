const { lookupUser } = require("./users")

// Only known users may be granted admin access.
function isKnownUser(id) {
  try {
    lookupUser(id)
    return true
  } catch {
    return false
  }
}

function grantAdmin(id) {
  if (!isKnownUser(id)) return { ok: false }
  return { ok: true, admin: id }
}

module.exports = { grantAdmin, isKnownUser }
