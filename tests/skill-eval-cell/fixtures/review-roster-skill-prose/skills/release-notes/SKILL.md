---
name: release-notes
description: Draft release notes from merged pull requests since the last tag. Use when preparing a release.
---

# Release notes

Find the most recent tag, list the pull requests merged since it, and group them by their conventional-commit type (features, fixes, other). Write one line per pull request in plain language, naming the user-visible change rather than the implementation.

Skip pull requests whose title starts with `chore:` or `ci:` unless they change something a user would notice.

Put the draft in `RELEASE_NOTES.md` at the repository root and show it to the user. Do not create the tag or publish the release.
