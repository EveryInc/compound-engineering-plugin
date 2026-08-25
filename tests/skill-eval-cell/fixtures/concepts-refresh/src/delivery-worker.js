// Recipients resolve directly; there is no suppression store to consult.
function resolveRecipients(run) {
  return run.addresses
}
module.exports = { resolveRecipients }
