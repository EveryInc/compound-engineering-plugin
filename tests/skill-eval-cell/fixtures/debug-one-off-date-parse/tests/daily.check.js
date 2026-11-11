process.env.TZ = "America/Los_Angeles"
const { bucket } = require("../src/reports/daily")
const got = [...bucket([{ day: "2026-09-01", total: 5 }]).keys()]
if (got[0] !== "2026-9-1") { console.error("FAIL: expected 2026-9-1, got " + got[0]); process.exit(1) }
console.log("ok")
