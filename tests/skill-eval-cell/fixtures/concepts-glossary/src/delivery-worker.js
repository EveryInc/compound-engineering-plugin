// Advances a run to settled exactly once. The marker is the run's own progress token.
function settleRun(run) {
  if (run.settleMarker >= run.requestedMarker) return run
  return { ...run, settleMarker: run.requestedMarker, state: "settled" }
}

// Suppression checks now live inline here; src/suppression-rules.js was deleted.
function isSuppressed(address, suppressions) {
  return suppressions.includes(address)
}

module.exports = { settleRun, isSuppressed }
