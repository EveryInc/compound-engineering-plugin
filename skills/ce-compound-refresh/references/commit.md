# Committing the refresh

Skip if no files changed. Check the current branch, whether the tree has unrelated uncommitted changes, and recent commit style. Stage **only** the files this refresh modified. Write a descriptive message summarizing the refresh (e.g., "update 3 stale learnings, consolidate 2 overlapping docs, delete 1 obsolete doc") in the repo's convention.

Non-interactive defaults: on the repo's default branch (main, master, or whatever the remote designates) → create a branch named for what was refreshed (e.g., `docs/refresh-auth-learnings`), commit, attempt a PR (if PR creation fails, report the branch name); on a feature branch → separate commit on that branch; git failures → put the recommended commands in the report and continue.

Interactive: ask (per Blocking questions), with the recommended option first. On the default branch: branch+commit+PR (recommended; specific branch name) / commit directly to the current branch / don't commit. On a clean feature branch: commit to it (recommended) / separate branch / don't commit. On a dirty feature branch: selective-stage and commit only refresh changes / don't commit.
