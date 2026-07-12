---
name: ce-commit-push-pr
description: Commit, push, and open a PR. Use when asked to ship/open a PR, or for PR-description-only flows like writing, rewriting, or describing a PR body.
argument-hint: "[PR ref] [mode:pipeline] [archive:on|off] [babysit:off|continuous|checkpoint]"
---

# Git Commit, Push, and PR

**Asking the user:** When this skill says "ask the user", use the platform's blocking question tool: `AskUserQuestion` in Claude Code (call `ToolSearch` with `select:AskUserQuestion` first if its schema isn't loaded), `request_user_input` in Codex, `ask_question` in Antigravity CLI (`agy`), `ask_user` in Pi (requires the `pi-ask-user` extension). Fall back to presenting the question in chat only when no blocking tool exists in the harness or the call errors (e.g., Codex edit modes) — not because a schema load is required. Never silently skip the question.

## Mode

- **Description-only** — user wants *just* a description ("write/draft a PR description", "describe this PR", or pasted a PR URL/number alone). Run Step 4 only; print the result. Apply only if the user asks. If a PR ref was pasted, pass it to Step 4 so Pre-A resolves the right range.
- **Description update** — user wants to refresh/rewrite an existing PR's description with no commit/push intent. Determine PR presence with the same rule used everywhere: only an exit-0 `[]` from the existing-PR check means "no open PR" (report and stop); a non-zero check is **unknown** (resolve `gh auth status` / connectivity first — never treat it as "no PR"). With an open PR, run Step 4 (PR mode using the existing PR's URL), then Step 5 to preview, confirm, and apply via `gh pr edit`.
- **Full workflow** — otherwise. Run Steps 1-5 in order.

**`mode:pipeline` modifier** — set by orchestrated callers (e.g., `lfg`). Run the resolved mode non-interactively: suppress every blocking ask. Step 5's existing-PR rewrite question defaults to **not rewriting**; in description-update mode the preview ask is skipped and the rewrite applies directly (the update invocation itself is the apply intent); any other suppressed ask takes its conservative documented default (keep the current branch; if Pre-A cannot resolve a base, stop and report rather than guess).

## Context

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
| `gh pr list --head <branch> --state open --json number,url,title,body,state,headRefName,headRepositoryOwner` | Open PR for this branch (run only once `<branch>` is non-empty) | Exit 0 with `[]` = no open PR. Non-zero = `gh` missing, unauthenticated, or offline — PR state is **unknown**, not "none"; never treat a non-zero check as "no PR"; re-check before creating (Step 5) |

Substitute `<branch>` with the current branch from `git branch --show-current`, and pass the branch **name only**. Two traps:

- **Empty branch (detached HEAD):** skip the PR check entirely — `gh pr list` with an empty `--head` drops the filter and lists unrelated PRs. Resolve it after Step 1 creates a branch.
- **Fork checkout:** do **not** pass `<owner>:<branch>` — `gh pr list --head` does not accept that syntax and silently returns `[]` for it, which reads as "no PR" and opens a duplicate. The PR lives on the base repo, so make `gh` target the base: rely on its default-repo resolution, or pass `-R <base-owner>/<repo>` explicitly when the default is the fork.

Everything gathered here is a snapshot taken before any action — treat it as a hint, not ground truth. Re-verify the branch, remote, and existing-PR state immediately before each consequential step (push in Step 3, `gh pr create` in Step 5), since they can change between gathering and acting.

---

## Step 1: Resolve branch and PR state

The remote default branch returns something like `origin/main`; strip the `origin/` prefix. If that command exited non-zero (no `origin/HEAD` set) or returned bare `HEAD`, try `gh repo view --json defaultBranchRef --jq '.defaultBranchRef.name'`. If both fail, fall back to `main`. For the existing-PR check: an empty `[]` array means no open PR for this branch; a non-zero exit means `gh` is missing, unauthenticated, or offline — treat PR state as **unknown** (not "no PR") and re-run the check, or `gh auth status`, before creating a new PR in Step 5 rather than assuming none exists.

Branch routing:

- **Detached HEAD** — automatically create a feature branch from the current `HEAD` before continuing. Derive the branch name from the change content, run `git checkout -b <branch-name>`, re-read `git branch --show-current`, and use that result for the rest of the workflow. Do not ask whether to create the branch — invoking the full commit/push/PR workflow is already confirmation that the work should become branch-backed. If the derived branch name already exists, choose a non-conflicting suffix or ask only if the conflict cannot be resolved safely.
- **On default branch with work to do** (uncommitted, unpushed, or no upstream) — automatically create a feature branch (pushing the default directly is not supported). Derive a name from the change content and continue at Step 3, which handles branch creation safely. Do not ask whether to branch — committing on the default is not an option here.
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

**Evidence decision** before composition. CE no longer owns a dedicated capture workflow; modern harnesses provide their own browser, screenshot, terminal recording, and artifact capture tools. Treat evidence as user-supplied context or as validation prose, not as a separate skill dispatch.

1. **User supplied evidence** (URL, markdown image/embed, local artifact path they want referenced) — incorporate it into the PR body as `## Demo`, `## Screenshots`, or `## Evidence`, matching the artifact type. Do not invent or upload evidence.
2. **User explicitly asks to include evidence but has not supplied it** — ask for the URL/markdown/path, or tell them to use the current harness's capture flow and return with the artifact. Do not launch another CE skill.
3. **Agent judgment on authored changes** — if you authored the commits and know the change produces no material claim a reviewer would need evidence for (internal plumbing, type-only, backend refactor without user-facing effect, inert documentation, pure refactors), skip evidence handling without asking. Classify by runtime purpose, not extension: markdown or YAML that is runtime agent instructions, configuration, generated product content, or policy code is not auto-skippable just for being markdown or YAML.

Otherwise, if the branch diff changes behavior a reviewer would need evidence for (UI, CLI output, API behavior with runnable code, generated artifacts, workflow output, ranking/scoring logic, deployment or config behavior), include a concise validation note in the PR body describing what was exercised and how it behaved. If no real run was possible because of unavailable credentials, paid services, deploy-only infrastructure, hardware, or missing local setup, say that plainly in the validation section.

Do not block PR creation solely because no visual artifact exists. Test output and manual validation notes are acceptable validation evidence, but do not label test output as "Demo" or "Screenshots."

**Concept teaching gate** before composition. Use the repo root gathered in Context (resolving it with `git rev-parse --show-toplevel` if you don't already have it) and read `<repo-root>/.compound-engineering/config.local.yaml` with the native file-read tool. Only an **active (non-commented)** `pr_teaching_section:` key counts — lines starting with `#` are YAML comments, and the shipped template documents keys as commented examples; matching those would silently flip the gate. The gate is off only when the active value is exactly `false`; a missing file, missing key, or any other value means the default: **on**. The same read resolves `pr_teaching_archive:` — on only when the active value is exactly `true`, otherwise **off** — and a per-run `archive:on|off` token overrides the archive key for this invocation.

- Gate **on** — judge concept novelty and compose the section per **Step B2** of the reference. The gate is single: when it is off, skip judgment, the section, the Step 5 trailer and offer, and archival entirely.
- Gate **off** — compose the description without any concept handling.

Then continue with the rest of the reference (Steps A through E, including the Step B2 concept judgment when the gate is on) to compose the title and body — Step E is the pre-apply coverage audit and must run before the body is returned.

## Step 5: Apply and report

**Description-only mode** — print the title and body. Stop unless the user asks to apply.

**New PR** (full workflow, no existing PR from Step 1) — immediately before creating, **always** re-run `gh pr list --head <branch> --state open --json number,url,headRefName,headRepositoryOwner` (branch name only; target the base repo on a fork, per Context) so a PR that appeared since Step 1, or was missed because the Step 1 check came back **unknown**, is not duplicated. If it now shows a PR whose `headRepositoryOwner`/`headRefName` match the current head, switch to the existing-PR path; disambiguate multi-fork matches by head owner as in Step 1 rather than assuming index 0. If this re-check itself exits non-zero, resolve `gh auth status` / connectivity before creating rather than assuming none exists. Otherwise apply per "Applying via gh" below using `gh pr create`. Report the URL.

**Existing PR** (full workflow, found in Step 1) — the new commits are already on the PR from Step 3. Report the PR URL, then ask whether to rewrite the description.

- **No** — done.
- **Yes** — run Step 4 if not already done, then preview and apply (see below).

**Description update mode, or existing-PR rewrite confirmed** — preview before applying. Ask: "New title: `<title>` (`<N>` chars). Summary leads with: `<first two sentences>`. Total body: `<L>` lines. Apply?" If declined, the user may pass focus text back for a regenerate; do not apply. If confirmed, apply per "Applying via gh" below using `gh pr edit` and report the URL.

**Explainer archival** — runs only in full workflow, with `pr_teaching_archive` on, a composed `## New concepts` section, and the apply confirmed (new-PR create, or existing-PR rewrite accepted); a declined rewrite skips archival entirely so no unlinked doc commit is left behind. All paths resolve from the repo root gathered in Context, never the CWD. With two taught concepts, write one file per concept and stage both in the single commit. Execute as explicit transitions immediately before the `gh` call:

1. `git check-ignore -q docs/explainers/YYYY-MM-DD-<concept-slug>.md` (from the repo root) — the check works on not-yet-created paths. If the path is ignored, print a one-line warning and skip archival entirely, writing nothing (never `git add -f`).
2. Write the file (create the directory if needed) with YAML frontmatter `title`, `date`, `input_shape: concept`, `subject`, and the teaching content. If the file already exists from a prior run, overwrite it.
3. `git add` those file(s) only (never `-A`), commit with `docs(explainer): teach <concept>[, <concept>]`, and push. If the commit reports nothing to commit, the doc is already committed from a prior run — keep the link and continue.
4. Splice a head-branch blob URL per doc into the `## New concepts` section before applying. Build the URL for the repo's actual host — e.g. `gh browse -n -b <head-branch> -- <path>` (prints the link on whatever host `gh` targets, GitHub Enterprise included) — do not hardcode `github.com`, or the link 404s on GHE.

If the doc write, commit, or push fails, warn and continue to PR creation without the link — never strand the flow between commit and PR.

**Concept trailer** — when a body applied by this run contains a `## New concepts` section, print one line after the PR URL in every mode: `New concepts: <name>[, <name>]`. In interactive full-workflow runs follow it with one line per taught concept: `Run /ce-explain <name> to go deeper.` No trailer when this run applied no body — including a rewrite that was declined or pipeline-defaulted to no — or no PR exists.

**Babysit handoff — default on.** In interactive full workflow, after reporting a newly-created PR URL (or after new commits land on an existing open PR), **auto-invoke `ce-babysit-pr` on that PR by default**: announce it in one non-blocking line (e.g. "Babysitting toward merge-ready — watching CI + incoming review; pass `babysit:off` to skip"), then invoke — never block on a yes/no. *Off is the explicit choice:* **`babysit:off`** skips it this run (**`babysit:continuous`** / **`babysit:checkpoint`** forces that watch mode); **`auto_babysit: false`** in `<repo-root>/.compound-engineering/config.local.yaml` is a standing opt-out, read with the same gate semantics as `pr_teaching_section` (only an active, non-commented value of exactly `false` disables; a missing file/key or any other value means the default **on**; a `babysit:off` token overrides the config for this run).

**Do not fire (auto-detected, no flag needed):** `mode:pipeline` (the orchestrated caller owns follow-on steps), description-only / description-update modes, no PR created or updated this run, non-GitHub (babysit's own guard stops it), or **a head branch you cannot push to**. **Fork PRs are drivable — not a hard-off.** A fork-to-upstream PR (the common open-source case) is babysittable whenever you can push to its head branch, which holds for a PR whose branch this skill just pushed (you own the fork): babysit reads state on the **base** repo (from the PR URL) and pushes fixes to the **head** repo (your fork). Hard-off only when the head is genuinely not pushable (e.g. someone else's PR). **Soft-degrade:** a checkpoint-only harness runs one tick and prints the resume command instead of a live loop.

---

## Applying via gh

The body **must** be written to a temp file and passed via `--body-file <path>`. Never use `--body-file -`, stdin pipes, heredoc-to-stdin, or `--body "$(cat ...)"` — wrappers and stdin handling can silently produce an empty PR body while `gh` still exits 0 and returns a URL.

```bash
BODY_FILE=$(mktemp "${TMPDIR:-/tmp}/ce-pr-body.XXXXXX") && cat >> "$BODY_FILE" <<'__CE_PR_BODY_END__'
<the composed body markdown goes here, verbatim>
__CE_PR_BODY_END__
```

The quoted sentinel keeps `$VAR`, backticks, and any literal `EOF` inside the body from being expanded.

For `<TITLE>`: substitute verbatim. If it contains `"`, `` ` ``, `$`, or `\`, escape them or switch to single quotes.

```bash
gh pr create --title "<TITLE>" --body-file "$BODY_FILE"   # new PR
gh pr edit   --title "<TITLE>" --body-file "$BODY_FILE"   # existing PR
```
