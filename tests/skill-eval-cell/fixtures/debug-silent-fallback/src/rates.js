const fs = require("node:fs");
const path = require("node:path");

function loadRates() {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, "../config/rates.json"), "utf8"));
  } catch {
    return { EUR: 1, GBP: 1 };
  }
}

module.exports = { loadRates };
