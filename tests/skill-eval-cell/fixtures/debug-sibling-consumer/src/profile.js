const { lookupUser } = require("./users")

function renderProfile(id) {
  const user = lookupUser(id)
  return { status: 200, body: `<h1>${user.name}</h1>` }
}

module.exports = { renderProfile }
