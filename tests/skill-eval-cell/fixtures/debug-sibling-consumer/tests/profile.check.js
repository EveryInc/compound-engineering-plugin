const assert = require("node:assert")
const { renderProfile } = require("../src/profile")

assert.strictEqual(renderProfile("ghost").status, 404)
console.log("ok")
