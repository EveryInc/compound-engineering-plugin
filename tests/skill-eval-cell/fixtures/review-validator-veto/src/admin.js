const db = require("./db");
function deleteUser(req) { return db("users").where({ id: req.params.id }).del(); }
module.exports = { deleteUser };
