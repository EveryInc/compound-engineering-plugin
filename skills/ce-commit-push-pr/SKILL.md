---
name: ce-commit-push-pr
description: Commit, push, and open a PR. Use when asked to ship/open a PR, or for PR-description-only flows like writing, rewriting, or describing a PR body.
argument-hint: "[PR ref] [mode:pipeline] [archive:on|off] [branding:on|off] [babysit:off|continuous|checkpoint]"
---

# Git Commit, Push, and PR

**Asking the user:** Where this skill says "ask the user", use the harness's blocking-question tool — `AskUserQuestion` (Claude Code), `request_user_input` (Codex), `ask_question` (Antigravity CLI), `ask_user` (Pi); load its schema first if the harness defers it. If no such tool exists or the call errors, take the conservative branch, state the assumption, and keep going — do not end the run on an unanswered question.

## Mode

- **Description-only** — user wants *just* a description ("write/draft a PR description", "describe this PR", or a pasted PR URL/number alone). Run Step 4 only and print the result; apply only if the user asks. Pass a pasted PR ref to Step 4 so Pre-A resolves the right range.
- **Description update** — refresh/rewrite an existing PR's description with no commit/push intent. With an open PR, run Step 4 (PR mode using the existing PR's URL), then Step 5 to apply via `gh pr edit`. Only an exit-0 `[]` from the existing-PR check means "no open PR" — report and stop.
- **Full workflow** — otherwise. Run Steps 1-5 in order.

**`mode:pipeline` modifier** — passed by orchestrated callers (e.g., `lfg`): suppress every blocking ask and take each one's conservative documented default (an existing PR's description is not rewritten unless the invocation itself is the apply intent, as in description-update mode; keep the current branch). Say what you assumed rather than stopping.

## Context

Gather the repository context by running each command below as its **own** shell tool call — a single argv-style invocation (just the program and its arguments). Do **not** join them with `;`, `&&`, `||`, pipes, `$(...)`, or redirects like `2>/dev/null`: that syntax parses only under POSIX shells and aborts under Windows PowerShell. Read each exit status as data — non-zero is often a normal state (no PR yet, no `origin/HEAD`, detached HEAD), not a failure to suppress.

Run them in order — the existing-PR check needs the branch name from `git branch --show-current`:

| Command | Purpose | Non-zero exit / empty output means |
| --- | --- | --- |
| `git rev-parse --show-toplevel` | Repo root | Not a git repository — report and stop |
| `git status` | Working-tree state | (fails only outside a repo) |
| `git diff HEAD` | Uncommitted changes | Unborn repo with no commits yet |
| `git branch --show-current` | Current branch (`<branch>`) | Empty output = detached HEAD (Step 1 handles it) |
| `git log --oneline -10` | Recent commit / PR-title style | Unborn repo — no history yet |
| `git rev-parse --abbrev-ref origin/HEAD` | Remote default branch | No `origin/HEAD` set — resolve per Step 1 |
| `gh pr list --head <branch> --state open --json number,url,title,body,state,headRefName,headRepositoryOwner` | Open PR for this branch (run only once `<branch>` is non-empty) | Exit 0 with `[]` = no open PR. Non-zero = `gh` missing, unauthenticated, or offline — PR state is **unknown**, not "none"; never treat a non-zero check as "no PR"; re-check before creating (Step 5) |

Substitute `<branch>` with the current branch from `git branch --show-current`, and pass the branch **name only**. Two traps:

- **Empty branch (detached HEAD):** skip the PR check entirely — `gh pr list` with an empty `--head` drops the filter and lists unrelated PRs. Resolve it after Step 1 creates a branch.
- **Fork checkout:** do **not** pass `<owner>:<branch>` — `gh pr list --head` does not accept that syntax and silently returns `[]` for it, which reads as "no PR" and opens a duplicate. The PR lives on the base repo, so make `gh` target the base: rely on its default-repo resolution, or pass `-R <base-owner>/<repo>` explicitly when the default is the fork.

---

## Step 1: Resolve branch and PR state

Default branch: strip the `origin/` prefix from the `origin/HEAD` result. If that command exited non-zero (no `origin/HEAD` set) or returned bare `HEAD`, try `gh repo view --json defaultBranchRef --jq '.defaultBranchRef.name'`; if both fail, fall back to `main`.

Branch routing:

- **Detached HEAD** — automatically create a feature branch from the current `HEAD` before continuing. Derive the branch name from the change content, run `git checkout -b <branch-name>`, re-read `git branch --show-current`, and use that result for the rest of the workflow. Do not ask whether to create the branch — invoking the full commit/push/PR workflow is already confirmation that the work should become branch-backed. If the derived branch name already exists, choose a non-conflicting suffix or ask only if the conflict cannot be resolved safely.
- **On default branch with work to do** (uncommitted, unpushed, or no upstream) — automatically create a feature branch (pushing the default directly is not supported). Derive a name from the change content and continue at Step 3, which handles branch creation safely.
- **On default branch with no work** — report no feature branch work and stop.
- **Feature branch** — continue.

If the PR check returned a non-empty array, do **not** blindly take index 0 — in a base repo with multiple forks, another contributor's PR can share the same branch name (`--head` filters by branch only, not `<owner>:<branch>`). Select the entry whose `headRepositoryOwner` and `headRefName` match the current head — the branch/fork this workflow is pushing. Note the URL and body from that entry (all entries are open — the check filtered `--state open`). If exactly one entry matches, use it; if multiple entries share the branch name from different owners and none can be confirmed as the current head's, treat it as ambiguous and stop/surface rather than acting on the wrong PR. Step 5 uses the URL to route between new-PR and existing-PR application. Step 4 uses the existing body as preservation context when rewriting.

## Step 2: Determine conventions

Match repo style for commit messages and PR titles (project instructions in context > recent commits > conventional commits as default). With conventional commits, default to `fix:` over `feat:` when ambiguous — adding code to remedy broken or missing behavior is `fix:`. Reserve `feat:` for capabilities the user could not previously accomplish. The user may override.

## Step 3: Commit and push

If on the default branch, branch creation needs to handle stale local `<base>`, unpushed commits on local `<base>`, and uncommitted changes that collide with the fresh remote base. Read `references/branch-creation.md` and follow its decision flow before continuing.

Scan changed files for naturally distinct concerns. If they clearly group into separate logical changes, create separate commits (2-3 max). Group at file level only — no `git add -p`. When ambiguous, one commit is fine.

Stage and commit each group. **Avoid `git add -A` and `git add .`** — they sweep in `.env`, build artifacts, and generated files:

```bash
git add file1 file2 file3 && git commit -m "$(cat <<'EOF'
commit message here
EOF
)"
```

Then push. Immediately before pushing, re-confirm you are on the intended feature branch (`git branch --show-current`) — the branch gathered in Context is a hint, and Step 1 may have created or switched branches since. Push the live `HEAD` so it reflects the current checkout, never a stale branch name:

```bash
git push -u origin HEAD
```

If the working tree is clean and all commits are already pushed, this step is a no-op.

## Step 4: Compose the PR title and body

**You MUST read `references/pr-description-writing.md`** in full — the core principle at the top governs every step. The only input it needs from this skill is the PR ref, if one was identified by mode dispatch (description-only with a pasted URL, description update, or confirmed existing-PR rewrite in full workflow). If Step 1 found an existing PR, pass its URL to Step 4 when rewriting so PR mode fetches the existing body and can preserve `Related:` / `Fixes` references already present there.

**Evidence decision** before composition. If the user supplied evidence (URL, markdown image/embed, local artifact path), incorporate it as `## Demo`, `## Screenshots`, or `## Evidence`, matching the artifact type. Never invent or upload evidence, and never label test output as "Demo" or "Screenshots." If the branch changes behavior a reviewer would need evidence for, add a concise validation note on what was exercised and how it behaved — or say plainly that no real run was possible (credentials, paid services, deploy-only infrastructure, hardware, missing local setup). Do not block PR creation because no visual artifact exists.

**Concept teaching gate** before composition. Read `<repo-root>/.compound-engineering/config.local.yaml` (repo root from Context) with the native file-read tool. Only an **active (non-commented)** key counts — the shipped template documents these keys as `#` comments, and matching those would silently flip the gate. `pr_teaching_section` is off only when the active value is exactly `false`; a missing file, missing key, or any other value means the default **on**. The same read resolves `pr_teaching_archive` — on only when the active value is exactly `true`, otherwise **off**; a per-run `archive:on|off` token overrides it.

- Gate **on** — judge concept novelty and compose the section per **Step B2** of the reference.
- Gate **off** — skip judgment, the section, the Step 5 trailer and offer, and archival entirely.

**PR branding gate** before composition. Branding is **off unless this invocation includes `branding:on` or the user explicitly asks in the current prompt to add Compound Engineering branding**; normalize that natural-language request to `branding:on`. `branding:off` forces the gate off when `branding:on` is absent. If both tokens are present, stop and report the conflict rather than guessing. Pass the resolved gate into Step D of the reference. Existing branding is preserved verbatim unless the user explicitly asks to remove or replace that exact content.

## Step 5: Apply and report

**Description-only mode** — print the title and body. Stop unless the user asks to apply.

**New PR** (full workflow, no existing PR from Step 1) — immediately before creating, **always** re-run `gh pr list --head <branch> --state open --json number,url,headRefName,headRepositoryOwner` (branch name only; target the base repo on a fork, per Context) so a PR that appeared since Step 1, or was missed because the Step 1 check came back **unknown**, is not duplicated. If it now shows a PR whose `headRepositoryOwner`/`headRefName` match the current head, switch to the existing-PR path; disambiguate multi-fork matches by head owner as in Step 1 rather than assuming index 0. If this re-check itself exits non-zero, resolve `gh auth status` / connectivity before creating rather than assuming none exists. Otherwise apply per "Applying via gh" below using `gh pr create`. Report the URL.

**Existing PR** (full workflow, found in Step 1) — the new commits are already on the PR from Step 3. Report the PR URL, then ask whether to rewrite the description.

- **No** — done.
- **Yes** — run Step 4 if not already done, then apply (see below).

**Description update mode, or existing-PR rewrite confirmed** — first compare the proposed title and body with the existing PR. If they are identical, or if the only difference is a branding-only delta the user did not explicitly request, keep the existing title and body and do not call `gh pr edit`; branding alone never creates apply intent. Otherwise show the new title and opening, then apply per "Applying via gh" below using `gh pr edit` and report the URL.

**Explainer archival** — full workflow only, with `pr_teaching_archive` on, a composed `## New concepts` section, and the apply confirmed (new-PR create, or existing-PR rewrite accepted); a declined rewrite skips archival entirely so no unlinked doc commit is left behind. Immediately before the `gh` call, resolving all paths from the repo root gathered in Context (never the CWD):

1. `git check-ignore -q docs/explainers/YYYY-MM-DD-<concept-slug>.md` — works on not-yet-created paths. If the path is ignored, print a one-line warning and skip archival entirely, writing nothing (never `git add -f`).
2. Write one file per taught concept with YAML frontmatter `title`, `date`, `input_shape: concept`, `subject`, and the teaching content.
3. `git add` those files only (never `-A`), commit with `docs(explainer): teach <concept>[, <concept>]`, and push.
4. Splice a head-branch blob URL per doc into the `## New concepts` section before applying. Build it for the repo's actual host — e.g. `gh browse -n -b <head-branch> -- <path>` — do not hardcode `github.com`, or the link 404s on GHE.

If the doc write, commit, or push fails, warn and continue to PR creation without the link — never strand the flow between commit and PR.

**User-runnable invocation rendering.** For the output handoffs below, default to `/ce-explain <name>`. Use `$ce-explain <name>` only when the active host is Codex or explicitly documents dollar-prefixed skill invocation. Render only the invocation as inline code and output one form only.

**Concept trailer** — when a body applied by this run contains a `## New concepts` section, print one line after the PR URL in every mode: `New concepts: <name>[, <name>]`. In interactive full-workflow runs follow it with one line per taught concept telling the user to invoke `ce-explain <name>` using the rendering rule above. No trailer when this run applied no body — including a rewrite that was declined or pipeline-defaulted to no — or no PR exists.

**Babysit handoff — default on.** In interactive full workflow, after reporting a newly-created PR URL (or after new commits land on an existing open PR), **auto-invoke `ce-babysit-pr`** on that PR: announce it in one non-blocking line (e.g. "Babysitting toward merge-ready — watching CI + incoming review; pass `babysit:off` to skip"), then invoke — never block on a yes/no. `babysit:off` skips it this run; `babysit:continuous` / `babysit:checkpoint` force that watch mode; **`auto_babysit: false`** in `<repo-root>/.compound-engineering/config.local.yaml` is a standing opt-out (same active-key gate semantics as `pr_teaching_section`; a `babysit:off` token still wins for this run).

**Do not fire:** `mode:pipeline`, description-only / description-update modes, no PR created or updated this run, non-GitHub, or **a head branch you cannot push to**. **Fork PRs are drivable — not a hard-off:** a fork-to-upstream PR is babysittable whenever you can push to its head branch, which holds for a branch this skill just pushed (you own the fork), because babysit reads state on the **base** repo (from the PR URL) and pushes fixes to the **head** repo (your fork). Hard-off only when the head is genuinely not pushable (e.g. someone else's PR).

---

## Applying via gh

The body **must** be written to a temp file and passed via `--body-file <path>`. Never use `--body-file -`, stdin pipes, heredoc-to-stdin, or `--body "$(cat ...)"` — wrappers and stdin handling can silently produce an empty PR body while `gh` still exits 0 and returns a URL.

```bash
BODY_FILE=$(mktemp "${TMPDIR:-/tmp}/ce-pr-body.XXXXXX") && cat >> "$BODY_FILE" <<'__CE_PR_BODY_END__'
<the composed body markdown goes here, verbatim>
__CE_PR_BODY_END__
```

The quoted sentinel keeps `$VAR`, backticks, and any literal `EOF` inside the body from being expanded.

```bash
gh pr create --title "<TITLE>" --body-file "$BODY_FILE"   # new PR
gh pr edit   --title "<TITLE>" --body-file "$BODY_FILE"   # existing PR
```
