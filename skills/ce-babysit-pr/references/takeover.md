# Takeover

Continue someone else's open PR in a replacement PR when the user asks: usually because babysit cannot push to the contributor's branch, or the contributor has stopped responding. The original contributors keep their credit, and the original PR stays open unless the user permits closing it.

**Result:** an open replacement PR under watch whose history carries the original commits with their authors, plus babysit's own changes as separate commits. **Safe failure direction:** when the source cannot be fetched or credit cannot be carried, stop and report rather than open an uncredited replacement.

Take over only on the user's request in an interactive run, and only from an open source PR.

1. **Assess first.** Run the assessment and verdict in `references/intake.md` on the source PR. A Close verdict ends the takeover with that evidence. Update and Rework continue here instead of stopping; with Rework, the replacement carries the described rework.
2. **Branch from the source.** Create the replacement branch from the source head OID fetched from `refs/pull/<N>/head`, never a local ref, so every original commit keeps its author. Make your own changes as separate commits. Keep the source PR's draft state.
3. **Update it** before it is pushed: rebase the replacement branch onto the fresh base and apply the comparison rules in steps 2-4 of the verified update in `references/intake.md`. No one else has this branch yet, so the stack, dependent-PR, and lease rules do not apply. Nothing in a takeover touches the source branch.
4. **Recheck the source** for new commits or feedback since you started. Cherry-pick new commits onto the replacement, and fold feedback that still applies into your own changes. Record the source head SHA you finished from.
5. **Open the replacement** through `ce-commit-push-pr mode:pipeline`, passing the source PR URL and the original commit authors (from the source PR's commits) as credit context for the description. Pipeline mode skips `ce-commit-push-pr`'s own handoff to babysit, so this run stays the only watcher.
6. **Watch the replacement.** Continue this invocation on the new PR the way a stack transition does (`references/setup.md`): stop the old watcher, initialize the new PR's snapshot with `--continue-invocation` and the same recorded invocation id, start time, and budget, and re-state the posture.

Never close the source PR without the user's explicit permission. The report names the source PR, its head SHA at handoff, the replacement PR, and how credit was carried.
