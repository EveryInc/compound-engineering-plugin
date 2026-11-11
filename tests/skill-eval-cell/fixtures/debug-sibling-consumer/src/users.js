const USERS = { ada: { name: "Ada", plan: "pro" } }

function lookupUser(id) {
  const user = USERS[id]
  if (!user) {
    throw new Error(`unknown user ${id}`)
  }
  return user
}

module.exports = { lookupUser }
