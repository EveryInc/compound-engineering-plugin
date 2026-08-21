# Workspace Setup

Read this after input triage identifies code work and before any branch move, implementation edit, worker dispatch, or commit. It owns writable-checkout selection, plan clarification, branch placement, pre-work inventory, dirty-file collision handling, and task-list setup. Return the canonical checkout, branch, pre-work paths and commits, exclusions, and task state to the kernel.

## Writable Checkout

Repo-local implementation writes require a writable checkout. Before treating the current working directory as the project, confirm it is a git checkout you can edit. If this session has no writable checkout, but the user named a repository and the harness exposes a remote repo-work surface with a writable checkout, run the implementation work on that surface and treat that checkout as the canonical workspace for verification, commits, and handoff. Otherwise skip repo-local writes and report that no writable checkout is available; do not synthesize file changes from a non-repo scratch directory.

## Prepare the Work

1. **Read Plan and Clarify** _(skip for a bare prompt)_ — read `references/work-intake.md` for how to size the read, what to pull from the plan, and when to stop and ask. Treat the plan as a decision artifact, not an execution script: ask anything unclear before implementing rather than after. **Do not edit the plan body during execution** — progress lives in git commits and the task tracker, and legacy `- [ ]` / `- [x]` marks or a `status:` field are not state.

2. **Setup Environment**

   Two things must hold before the first edit: the work lands on a feature branch, and nothing the user did not offer up gets committed or published by this run. Neither is a question for the user — a branch move is a one-command undo, so do it and say so in one line.

   **Branch.** Determine the default branch from `origin/HEAD`. If that is unavailable, use the host's repository-metadata capability; when the available interface is GitHub CLI, run `gh repo view --json defaultBranchRef`. Otherwise use `main` or `master` when one exists. Read the current branch with `git branch --show-current`.

   If you are on the default branch, detached, or cannot tell, create a feature branch named from the plan or work description. When a remote default exists, run `git fetch origin <default>` first. Base the new branch on the fetched `origin/<default>` when `HEAD` has no commits beyond it; base it on `HEAD` when local commits must remain visible to idempotency and the shipping gate, or when there is no remote. After the branch move, run `git branch --show-current` again and treat that result as authoritative. When branch safety remains uncertain, use a spare branch and never make incremental commits on the real default.

   Otherwise continue on the invoked branch without renaming it or asking. Use a worktree only when the user asked for one this session (`ce-worktree`), and commit on the default branch only when the user explicitly authorized that in this session.

   **Pre-work scope.** Before editing, record `git status --short --untracked-files=all` (the user's in-progress files) and whether `HEAD` carries commits not on the remote default (`git log origin/<default>..HEAD`; "unknown" without a remote). Nothing in that set is yours to commit or publish, and it rides along on the branch move untouched — no stash, no question, no effect on naming. It is enforced without a menu:
   - Incremental commits stage only work-owned files and are path-limited, so untouched WIP never enters a commit; the standalone handoff passes every pre-work file this run did not commit as `exclude:<paths>`, and ships locally via `ce-commit` when pre-existing unpushed commits are on the branch (`references/shipping-workflow.md`).
   - A unit that must edit a file that was already dirty is the one case a commit cannot separate. Ask once, covering every such file, at the first commit that would include one: commit those files with the user's edits included, or leave them uncommitted (an exclusion for the rest of the run, named in the final summary as unshipped). In Return-to-Caller Mode do not ask and do not edit the file — return `status: blocked` naming it, so the user's WIP stays intact and commit-or-stash-and-rerun is a clean recovery.

3. **Create Task List** _(skip if triage already built one or routed as Trivial)_ — use the platform's task-tracking capability when available (`TaskCreate`/`TaskUpdate`/`TaskList` in Claude Code, `update_plan` in Codex, or the equivalent elsewhere), and follow `references/work-intake.md` for how tasks are derived, named, and ordered. If no such capability exists, continue without simulating a task list in chat.
