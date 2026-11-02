const { loadRates } = require("./rates.js");

function invoiceTotal(amount, currency) {
  return amount * loadRates()[currency];
}

module.exports = { invoiceTotal };
