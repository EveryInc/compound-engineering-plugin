# Repository context, branch, and PR state

Gather this before Step 1, and re-verify branch, remote, and PR state immediately before each
consequential step (the push in Step 3, `gh pr create` in Step 5).

Gather the repository context by running each command below as its **own** shell tool call — a single argv-style invocation (just the program and its arguments). Do **not** join them with `;`, `&&`, `||`, pipes, `$(...)`, or redirects like `2>/dev/null`: that syntax parses only under POSIX shells and aborts under Windows PowerShell. Read each command's exit status directly — a non-zero exit is a normal state to interpret (no PR yet, no `origin/HEAD`, detached HEAD), not a failure to suppress.

Run them in order — the existing-PR check needs the branch name from `git branch --show-current`:

| Command | Purpose | Non-zero exit / empty output means |
| --- | --- | --- |
| `git rev-parse --show-toplevel` | Repo root | Not a git repository — report and stop |
| `git status` | Working-tree state | (fails only outside a repo) |
| `git diff HEAD` | Uncommitted changes | Unborn repo with no commits yet |
| `git branch --show-current` | Current branch (`<branch>`) | Empty output = detached HEAD (Step 1 handles it) |
| `git log --oneline -10` | Recent commit / PR-title style | Unborn repo — no history yet |
| `git rev-parse --abbrev-ref origin/HEAD` | Remote default branch | No `origin/HEAD` set — resolve per Step 1 |
| `gh pr list --head <branch> --state open --json number,url,title,body,state,isDraft,headRefName,headRepositoryOwner` | Open PR for this branch (run only once `<branch>` is non-empty) | Exit 0 with `[]` = no open PR. Non-zero = `gh` missing, unauthenticated, or offline — PR state is **unknown**, not "none"; never treat a non-zero check as "no PR"; re-check before creating (Step 5) |

Substitute `<branch>` with the current branch from `git branch --show-current`, and pass the branch **name only**. Two traps:

- **Empty branch (detached HEAD):** skip the PR check entirely — `gh pr list` with an empty `--head` drops the filter and lists unrelated PRs. Resolve it after Step 1 creates a branch.
- **Fork checkout:** do **not** pass `<owner>:<branch>` — `gh pr list --head` does not accept that syntax and silently returns `[]` for it, which reads as "no PR" and opens a duplicate. The PR lives on the base repo, so make `gh` target the base: rely on its default-repo resolution, or pass `-R <base-owner>/<repo>` explicitly when the default is the fork.

Everything gathered here is a snapshot taken before any action — treat it as a hint, not ground truth. Re-verify the branch, remote, and existing-PR state immediately before each consequential step (push in Step 3, `gh pr create` in Step 5), since they can change between gathering and acting.

## Step 1 detail: resolve branch and PR state

The remote default branch returns something like `origin/main`; strip the `origin/` prefix. If that command exited non-zero (no `origin/HEAD` set) or returned bare `HEAD`, try `gh repo view --json defaultBranchRef --jq '.defaultBranchRef.name'`. If both fail, fall back to `main`. For the existing-PR check: an empty `[]` array means no open PR for this branch; a non-zero exit means `gh` is missing, unauthenticated, or offline — treat PR state as **unknown** (not "no PR") and re-run the check, or `gh auth status`, before creating a new PR in Step 5 rather than assuming none exists.

Branch routing:

- **Detached HEAD** — automatically create a feature branch from the current `HEAD` before continuing. Derive the branch name from the change content, run `git checkout -b <branch-name>`, re-read `git branch --show-current`, and use that result for the rest of the workflow. Do not ask whether to create the branch — invoking the full commit/push/PR workflow is already confirmation that the work should become branch-backed. If the derived branch name already exists, choose a non-conflicting suffix or ask only if the conflict cannot be resolved safely.
- **On default branch with work to do** (uncommitted, unpushed, or no upstream) — automatically create a feature branch (pushing the default directly is not supported). Derive a name from the change content and continue at Step 3, which handles branch creation safely. Do not ask whether to branch — committing on the default is not an option here.
- **On default branch with no work** — report no feature branch work and stop.
- **Feature branch** — continue.

If the PR check returned a non-empty array, do **not** blindly take index 0 — in a base repo with multiple forks, another contributor's PR can share the same branch name (`--head` filters by branch only, not `<owner>:<branch>`). Select the entry whose `headRepositoryOwner` and `headRefName` match the current head — the branch/fork this workflow is pushing. Note the URL and body from that entry (all entries are open — the check filtered `--state open`). If exactly one entry matches, use it; if multiple entries share the branch name from different owners and none can be confirmed as the current head's, treat it as ambiguous and stop/surface rather than acting on the wrong PR. Step 5 uses the URL to route between new-PR and existing-PR application. Step 4 uses the existing body as preservation context when rewriting.

## Step 2 detail: conventions

Match repo style for commit messages and PR titles (project instructions in context > recent commits > conventional commits as default). With conventional commits, default to `fix:` over `feat:` when ambiguous — adding code to remedy broken or missing behavior is `fix:`. Reserve `feat:` for capabilities the user could not previously accomplish. The user may override. The description reference's title step uses this same type default.
