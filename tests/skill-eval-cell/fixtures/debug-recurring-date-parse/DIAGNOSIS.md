# Diagnosis (Phases 1-2 complete)

Symptom: the daily report files September 1 orders under August 31 for users west of UTC. `node tests/daily.check.js` fails with `expected 2026-9-1, got 2026-8-31`.

Causal chain: `row.day` is a calendar date string ("2026-09-01"). `new Date("2026-09-01")` parses a date-only string as UTC midnight (src/reports/daily.js:6). `getDate()` then reads it in local time, which is the previous day west of UTC.

Pattern search: `rg -n "new Date\(row\.day\)" src` finds the same line in src/reports/daily.js, weekly.js, monthly.js, and export.js. All four are internal modules; none is exported outside src/reports, and each is called only by src/server.js (not included here).

The user chose "Fix it now". The minimal fix to daily.js and its regression test are agreed.
