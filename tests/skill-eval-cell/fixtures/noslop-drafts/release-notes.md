# Release 4.2

This isn't just a maintenance release — it's a rethink of how sync works. Three changes. One goal: fewer surprises.

**Incremental sync.** The sync engine now tracks changes per folder — not per account. In our internal benchmarks, a typical workspace syncs up to 40 percent faster, and large monorepos should see bigger gains. Results will vary with network conditions.

**Conflict handling.** Previously, a conflicting edit was silently overwritten — the last writer won. Now the client keeps both copies and flags the file. No data loss. No guesswork. Just a clear choice. We expect this to remove most of the support tickets we get about lost edits, though some edge cases with renamed folders may still slip through.

**Offline mode.** The client can now queue up to 500 changes while offline — and replays them in order when the connection returns. Queued changes older than 7 days are discarded. Simple. Reliable. Done.

The result: sync that just works — quietly, predictably, in the background. We think this is the most significant improvement to the client since 3.0, and it may let us retire the legacy polling service by the end of Q1.

Upgrading is seamless — install 4.2 over your current version. Settings carry over. Nothing to configure.
