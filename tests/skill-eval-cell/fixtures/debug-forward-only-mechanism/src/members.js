const seenLogins = new Set()

function pickerLogins() {
  return [...seenLogins].sort()
}

module.exports = { seenLogins, pickerLogins }
