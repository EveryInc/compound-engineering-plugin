# History replay evals

Some skill behavior can only be judged against a real repository's past: did a review catch the bugs reviewers actually found, or did a drafted `CODING_STANDARDS.md` recover the rules the team actually wrote? A replay answers that by freezing a repository at a point in time, running the skill on the frozen copy, and grading the result against what happened next.

This is hand-run evidence, like the rest of this directory. It bills the host CLIs, needs `gh` access to the source repository for the export, and is not part of `bun test`.

## The method

1. **Pick a cutoff the answer postdates.** Use the commit just before the thing you will grade against appeared. For example, use the parent of the PR that added `CODING_STANDARDS.md`, or a PR's base for a review of that PR. Deleting a file at HEAD does not hide it: git history, the code host, and code written to follow the file all still carry it.
2. **Export what the skill may read before you run anything.** `replay.ts export` saves PR metadata, review comments, and replies as JSON. The skill then reads that export, never the live code host, which would also serve every later PR and file.
3. **Build fixtures that hold only the past.** `replay.ts build` clones the source through a bundle of the cutoff commit, so later commits are not in the fixture at all, and it removes the remote. Overlays (a standards file, a `REVIEW.md`) are committed on `main` as the base, which is the copy `ce-code-review` reads its policy from. A PR's diff goes on branch `pr-head` as one commit. `--no-peer` sets `cross_model_review_mode: off` so every arm runs the same reviewers. The source checkout is only read.
4. **Run each fixture through the cell driver** with `--fixture <dir>`. It copies the fixture, `.git` included. Use absolute paths. On parallel Codex runs, more than about three at once can fail authentication together, because they race to refresh the same token.
5. **Grade blind.** The grader sees opaque ids, never the arm or host, and the key stays in a separate file until `replay.ts tally`.

## Review replay (ce-code-review)

Ground truth is the first round of findings a PR got before merge, judged real when the author fixed it.

```bash
R=tests/skill-eval-cell/replay/replay.ts
bun $R export --repo owner/name --prs 147,148,149 --out /tmp/replay/gt
# Ask a fresh agent to follow ground-truth-prompt.md over /tmp/replay/gt.
BASE=$(bun $R base --source ~/src/name --head <reviewed_sha> --merge <merge_commit_sha>)
bun $R build --source ~/src/name --base $BASE --head <reviewed_sha> --overlay /tmp/replay/arms/standards --no-peer --out /tmp/replay/fx/148-standards
bun run test:skill-eval-cell -- --skill ce-code-review --fixture /tmp/replay/fx/148-standards --hosts claude,codex \
  --timeout-secs 3000 --out /tmp/replay/runs/148-standards \
  --task "Use the ce-code-review skill with mode:agent base:main to review the current branch (pr-head) against main. Follow the skill end to end, including its reviewer subagents. Return the skill's mode:agent JSON as your final message."
bun $R collect --runs /tmp/replay/runs --out /tmp/replay/collected.json
bun $R blind --collected /tmp/replay/collected.json --truth /tmp/replay/gt/ground-truth.json --out /tmp/replay/blind
# Ask a fresh agent to follow grade-reviews-prompt.md over /tmp/replay/blind.
bun $R tally --grades /tmp/replay/blind/grades.json --key /tmp/replay/blind/key.json --truth /tmp/replay/gt/ground-truth.json
```

Name each run directory `<pr>-<arm>`, which is what `collect` reads. Compare arms that differ in one thing, for example no standards file, the team's file, or the team's file plus a `REVIEW.md`. A PR the bot judged clean is a useful control. Pick PRs from before the standards file existed, since code written under the file already follows it and hides any difference.

## Drafting replay (ce-setup review docs)

Freeze the repository at the parent of the PR that introduced the team's `CODING_STANDARDS.md`, with the PRs before it exported into `.pr-history/`:

```bash
bun $R export --repo owner/name --before <cutoff merged_at> --limit 60 --out /tmp/replay/history
bun $R build --source ~/src/name --base <cutoff parent> --history /tmp/replay/history --out /tmp/replay/fx-setup
bun run test:skill-eval-cell -- --skill ce-setup --fixture /tmp/replay/fx-setup --hosts claude,codex \
  --persona <persona.md> --max-turns 10 --timeout-secs 3600 --out /tmp/replay/runs-setup/t1 \
  --task "Use the ce-setup skill: set up coding standards for this repository. The code host is not reachable from this machine; this repository's merged pull request history is exported under .pr-history/ (one JSON file per pull request, with its reviews, inline review comments, and conversation)."
```

The persona plays the repository owner. Say exactly what it approves, including the `AGENTS.md` edits that come with the drafts. A persona told to decline "everything else" also declined the pointer lines and skewed one run. Copy each host's drafts into `X/`, `Y/`, ... beside the team's files in `real/`, record which is which outside that directory, and have a fresh agent follow `grade-standards-prompt.md`. Run at least three trials per host: one trial ranged from 36% to 57% recall on nearly the same skill text.

Check each transcript for `gh`, `curl`, or `git fetch` before trusting a score. A run that reached the code host could have read the answer.
