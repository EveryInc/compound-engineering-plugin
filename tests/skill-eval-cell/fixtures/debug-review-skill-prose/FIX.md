# Fix status (Phases 0-3 complete, interactive run)

Bug: the project's `release` agent skill tagged releases from a stale local branch, because its instructions never said to fetch first.

Fix applied and verified with a run of the skill. Fix-owned files: `.agents/skills/release/SKILL.md` only. The diff is 3 changed lines of skill instructions: the agent now fetches the remote and tags from `origin/main`.

The pre-fix tree was clean, and the branch holds only this fix. `ce-simplify-code` and `ce-code-review` are both available. The user gave no instruction about review.
