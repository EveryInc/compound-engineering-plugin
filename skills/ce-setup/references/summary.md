# Setup summary (Phase 3)

The summary lets a user who skimmed the run see what they gained and what to do next.

- Open with what changed for them, in one plain sentence.
- For each change, say what it does for the user, not only which file moved. Where a change carries content, such as new rules in a standards file, quote a few of them with their source.
- Keep what the user declined apart from what needed no change.
- Name missing optional tools as optional, not as failures, and say to install them only for the workflows the user runs. Do not offer a bulk install: the diagnostic already printed each install command or project URL.
- Name the files left uncommitted. The closing question offers to commit them, so leave committing out of the to-do list.
- List what the user still has to do, most important first. Put first any step without which a new file has no effect, such as a reviewer that does not read it yet.

When setup left changes uncommitted, close with a question after the two closing lines in SKILL.md: commit them and open a pull request, commit only, or leave them for the user to review first. Run `ce-commit-push-pr` or `ce-commit` for the user's choice.
