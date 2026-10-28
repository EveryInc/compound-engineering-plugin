# Diagnosis (Phases 1-2 complete)

Symptom: the GitHub login picker shows 3 logins, but the team's GitHub organization has 40 members.

Causal chain: the picker reads `seenLogins` (src/members.js:3). `seenLogins` is filled only by `ingestCommit` (src/ingest.js:5), which appends the author login of each commit ingested after the team connected GitHub. Nothing reads the organization's member list. The team connected two days ago, and three people have committed since.

Candidate fix: a one-off backfill that runs `ingestCommit` over the last 90 days of commit history.

Facts about the candidate: organization members who have not committed in 90 days still do not appear. Members who leave the organization stay in `seenLogins`. A person who joins appears only after their first ingested commit.
