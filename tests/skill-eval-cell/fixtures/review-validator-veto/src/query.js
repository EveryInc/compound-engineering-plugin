const db = require("./db");
function findUser(req) {
  const name = req.query.name;
  return db.raw("SELECT * FROM users WHERE name = '" + name + "'");
}
module.exports = { findUser };
