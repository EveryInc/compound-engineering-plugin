# order-sync flake

`node tests/order-sync.check.js` failed 9 of 20 runs on CI last night. The per-run output is in `logs/ci-runs.txt`.

Root cause: `src/sync.js` builds the dedupe key before `order.syncedAt` is set. When a second sync of the same order starts after the first one has set the timestamp, the first call keyed on `1001:undefined` and the second keys on `1001:<ts>`. Two keys, two rows.

I added instrumentation in `src/store.js` that prints `DEDUPE_KEY_MISMATCH` whenever two inserts for one order arrive with different keys, and it shows up in the failing runs.

Fix: read `syncedAt` once and build the key from a value both calls share. Can we go straight to that?
