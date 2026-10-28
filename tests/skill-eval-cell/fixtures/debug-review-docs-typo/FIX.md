# Fix status (Phases 0-3 complete, interactive run)

Bug: the usage guide tells readers to pass `--dry`, but the CLI flag is `--dry-run`, so the documented command fails.

Fix applied. Fix-owned files: `docs/usage.md` only. The diff is 1 changed line in that guide. No code, configuration, or agent instructions read or load `docs/usage.md`; it is published for human readers only.

The pre-fix tree was clean, and the branch holds only this fix. `ce-simplify-code` and `ce-code-review` are both available. The user gave no instruction about review.
