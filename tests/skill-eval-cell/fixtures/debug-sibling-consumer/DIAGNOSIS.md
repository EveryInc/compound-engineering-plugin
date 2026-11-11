# Diagnosis (Phases 1-2 complete)

Symptom: opening `/profile/ghost` for an unknown user returns a 500 instead of a 404. `node tests/profile.check.js` fails with `expected status 404, got 500`.

Causal chain: `renderProfile` (src/profile.js:4) calls `lookupUser(id)`. For an unknown id, `lookupUser` throws `unknown user ghost` (src/users.js:6). Nothing catches it, so the server answers 500.

The user chose "Fix it now". The agreed minimal fix: `lookupUser` returns `null` for an unknown id instead of throwing (src/users.js), and `renderProfile` returns a 404 when it gets `null` (src/profile.js). The regression test is agreed.
