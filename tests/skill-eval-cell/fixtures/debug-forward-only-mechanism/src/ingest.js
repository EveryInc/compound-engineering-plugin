const { seenLogins } = require("./members")

function ingestCommit(commit) {
  // Called for each commit pushed after the team connected GitHub.
  seenLogins.add(commit.authorLogin)
}

module.exports = { ingestCommit }
